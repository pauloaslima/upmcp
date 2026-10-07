import { MetaError, metaGet, metaList } from "./meta";
import { cached, inBatches, matchesClient, nameKeys } from "./metaClient";
import { addDays, iso, parse, todayInBrazil } from "./deadlines";
import { accountPerformance } from "./igPerformance";

// Insights orgânicos do Instagram de UM cliente (somente leitura).
// Encontra o Instagram do cliente pelas páginas que o token enxerga (nome da página, @usuário
// ou nome do perfil com o nome do cliente) e traz os posts publicados no período com os números.
// Permissões do token: pages_show_list, pages_read_engagement, instagram_basic, instagram_manage_insights.

const MAX_POSTS = 100; // posts por consulta (os mais recentes do período)
const MEDIA_PAGE = 50;
const PARALLEL = 5;

// métricas por post (as antigas "impressions" e "plays" foram trocadas por "views" pela Meta)
const METRICS = ["reach", "views", "likes", "comments", "shares", "saved", "total_interactions"];
const METRICS_BASIC = ["reach", "likes", "comments", "shares", "saved"];

const PRESETS = {
  last_7d: (today) => ({ since: iso(addDays(today, -6)), until: iso(today) }),
  this_month: (today) => ({ since: iso(new Date(today.getFullYear(), today.getMonth(), 1)), until: iso(today) }),
  last_30d: (today) => ({ since: iso(addDays(today, -29)), until: iso(today) })
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// período por data de publicação do post (horário de Brasília)
export function organicPeriod({ datePreset, since, until } = {}) {
  const today = parse(todayInBrazil());
  if (since || until) {
    if (!ISO_DATE.test(since || "") || !ISO_DATE.test(until || "")) {
      throw new MetaError("Informe o período com as duas datas no formato AAAA-MM-DD.", { status: 400 });
    }
    if (since > until) throw new MetaError("A data inicial precisa ser antes da data final.", { status: 400 });
    return { since, until };
  }
  const make = PRESETS[datePreset || "last_30d"];
  if (!make) throw new MetaError("Período inválido. Use last_7d, this_month ou last_30d.", { status: 400 });
  return { ...make(today), datePreset: datePreset || "last_30d" };
}

function permissionHint(err) {
  if (err instanceof MetaError && err.status === 403) {
    return new MetaError(
      "O token da Meta não tem permissão para ler o Instagram. Ele precisa de pages_show_list, pages_read_engagement, instagram_basic e instagram_manage_insights.",
      { status: 403 }
    );
  }
  return err;
}

// Instagram ligado a cada página que o token enxerga
async function instagramAccounts() {
  return cached(
    "ig-accounts",
    async () => {
      const { items } = await metaList("me/accounts", {
        fields: "id,name,instagram_business_account{id,username,name,followers_count,media_count,profile_picture_url}"
      });
      return items
        .filter((p) => p.instagram_business_account?.id)
        .map((p) => ({ page: p.name, ...p.instagram_business_account }));
    },
    10 * 60 * 1000
  );
}

// "2026-10-07T01:30:00+0000" → "2026-10-06" (dia da publicação em Brasília)
const BR_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" });
const brDay = (timestamp) => BR_DAY.format(new Date(Date.parse(timestamp)));

// posts do perfil publicados no período (a lista vem do mais novo para o mais antigo)
async function mediaInPeriod(igId, { since, until }) {
  const out = [];
  let after;
  for (let page = 0; page < 20 && out.length < MAX_POSTS; page++) {
    const body = await metaGet(`${igId}/media`, {
      fields: "id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count",
      limit: MEDIA_PAGE,
      after
    });
    let reachedOlder = false;
    for (const m of body.data || []) {
      const day = brDay(m.timestamp);
      if (day > until) continue;
      if (day < since) {
        reachedOlder = true;
        break;
      }
      out.push({ ...m, day });
    }
    after = body.paging?.cursors?.after;
    if (reachedOlder || !after || !body.paging?.next) break;
  }
  return { posts: out.slice(0, MAX_POSTS), truncated: out.length > MAX_POSTS };
}

// números de um post; se a Meta não aceitar alguma métrica para aquele tipo de post, tenta o básico
async function mediaInsights(media) {
  return cached(`ig-media:${media.id}`, async () => {
    for (const metrics of [METRICS, METRICS_BASIC]) {
      try {
        const body = await metaGet(`${media.id}/insights`, { metric: metrics });
        return Object.fromEntries((body.data || []).map((m) => [m.name, m.values?.[0]?.value ?? m.total_value?.value ?? null]));
      } catch (err) {
        if (!(err instanceof MetaError) || err.status !== 400) throw err;
      }
    }
    return {}; // post sem métricas disponíveis (ex.: publicado antes de virar conta profissional)
  });
}

const TYPES = { REELS: "Reels", STORY: "Story", CAROUSEL_ALBUM: "Carrossel", VIDEO: "Vídeo", IMAGE: "Foto" };

function postType(m) {
  if (m.media_product_type === "REELS") return TYPES.REELS;
  return TYPES[m.media_type] || "Post";
}

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

// client: { id, name }  period: { datePreset } ou { since, until }
export async function clientOrganicReport(client, period) {
  const range = organicPeriod(period);
  const keys = nameKeys(client.name);
  if (!keys.length) return { perfis: [], posts: [], totais: null, periodo: range };

  let accounts;
  try {
    accounts = await instagramAccounts();
  } catch (err) {
    throw permissionHint(err);
  }
  const mine = accounts.filter((a) => [a.page, a.username, a.name].some((t) => matchesClient(t, keys)));
  if (!mine.length) return { perfis: [], posts: [], totais: null, periodo: range };

  const cacheKey = `${range.since}:${range.until}`;
  const posts = [];
  let truncated = false;
  for (const account of mine) {
    let list;
    try {
      list = await cached(`ig-posts:${account.id}:${cacheKey}`, () => mediaInPeriod(account.id, range));
    } catch (err) {
      throw permissionHint(err);
    }
    truncated = truncated || list.truncated;
    const withNumbers = await inBatches(list.posts, PARALLEL, async (m) => {
      const ins = await mediaInsights(m).catch((err) => {
        if (err instanceof MetaError && (err.status === 401 || err.status === 429)) throw err;
        return {};
      });
      return {
        id: m.id,
        perfil: account.username,
        tipo: postType(m),
        data: m.timestamp,
        dia: m.day,
        legenda: (m.caption || "").slice(0, 300),
        link: m.permalink,
        imagem: m.media_type === "VIDEO" ? m.thumbnail_url || null : m.media_url || m.thumbnail_url || null,
        alcance: ins.reach ?? null,
        visualizacoes: ins.views ?? null,
        curtidas: ins.likes ?? m.like_count ?? null,
        comentarios: ins.comments ?? m.comments_count ?? null,
        compartilhamentos: ins.shares ?? null,
        salvos: ins.saved ?? null,
        interacoes: ins.total_interactions ?? (ins.likes !== undefined ? num(ins.likes) + num(ins.comments) + num(ins.shares) + num(ins.saved) : null)
      };
    });
    posts.push(...withNumbers);
  }
  posts.sort((a, b) => Date.parse(b.data) - Date.parse(a.data));

  // painel de desempenho da conta; se a Meta não liberar, a lista de posts aparece mesmo assim
  const desempenho = await accountPerformance(mine, range).catch((err) => {
    if (err instanceof MetaError && (err.status === 401 || err.status === 429)) throw err;
    console.error("meta organico: desempenho indisponível", err?.message);
    return null;
  });

  return {
    perfis: mine.map((a) => ({ usuario: a.username, nome: a.name, seguidores: a.followers_count ?? null, foto: a.profile_picture_url || null })),
    posts,
    desempenho,
    totais: posts.length
      ? {
          posts: posts.length,
          alcance: posts.reduce((s, p) => s + num(p.alcance), 0),
          visualizacoes: posts.reduce((s, p) => s + num(p.visualizacoes), 0),
          interacoes: posts.reduce((s, p) => s + num(p.interacoes), 0),
          seguidores: mine.reduce((s, a) => s + num(a.followers_count), 0)
        }
      : null,
    periodo: range,
    truncated
  };
}
