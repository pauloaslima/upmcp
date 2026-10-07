import { MetaError, getCampaignInsights, listAdAccounts, resolvePeriod } from "./meta";

// Anúncios de UM cliente: procura na Meta só o que é daquele cliente, pelo nome.
// 1) contas de anúncios cujo nome traz o nome do cliente: entram todas as campanhas da conta;
// 2) nas outras contas: entram só as campanhas cujo nome traz o nome do cliente.
// Nome comparado sem acento, maiúscula, espaço ou pontuação ("7Ball Vitória" = "7BALL VITORIA").

const STOPWORDS = new Set(["de", "da", "do", "das", "dos", "e"]);
const MIN_KEY = 5; // chaves curtas demais trariam campanhas de outros clientes
const CACHE_MS = 5 * 60 * 1000; // evita bater no limite de consultas da Meta
const PARALLEL = 4;

const cache = new Map();

export async function cached(key, load, ms = CACHE_MS) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ms) return hit.value;
  const value = await load();
  cache.set(key, { at: Date.now(), value });
  return value;
}

export function normalize(text) {
  return String(text || "")
    .normalize("NFD")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

// "Carla Zaupa Psi" → ["carlazaupapsi", "carlazaupa"]; "7Ball Vitória" → ["7ballvitoria", "7ball"];
// "Sala de Oração" → ["saladeoracao", "salaoracao"] (com e sem "de", "da", "do"…)
export function nameKeys(name) {
  const words = String(name || "")
    .split(/\s+/)
    .map(normalize)
    .filter(Boolean);
  const meaningful = words.filter((w) => !STOPWORDS.has(w));
  const keys = [words.join(""), meaningful.join("")];
  if (meaningful.length > 1) keys.push(meaningful.slice(0, -1).join(""));
  return [...new Set(keys)].filter((k) => k.length >= MIN_KEY);
}

export function matchesClient(text, keys) {
  const n = normalize(text);
  return keys.some((k) => n.includes(k));
}

// tipos de resultado, do mais importante para o menos importante
const RESULTS = [
  { label: "Conversas iniciadas", types: ["onsite_conversion.messaging_conversation_started_7d"] },
  { label: "Leads", types: ["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead"] },
  { label: "Compras", types: ["purchase", "offsite_conversion.fb_pixel_purchase", "omni_purchase"] },
  { label: "Cadastros", types: ["complete_registration", "offsite_conversion.fb_pixel_complete_registration"] },
  { label: "Visualizações da página", types: ["landing_page_view"] },
  { label: "Cliques no link", types: ["link_click"] },
  { label: "Engajamentos", types: ["post_engagement"] },
  { label: "Visualizações do vídeo", types: ["video_view"] }
];

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

function mainResult(row) {
  for (const r of RESULTS) {
    const action = (row.actions || []).find((a) => r.types.includes(a.action_type));
    if (action && num(action.value) > 0) {
      const cost = (row.cost_per_action_type || []).find((a) => a.action_type === action.action_type);
      return { label: r.label, value: num(action.value), cost: cost ? num(cost.value) : null };
    }
  }
  return null;
}

export async function inBatches(list, size, fn) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(...(await Promise.all(list.slice(i, i + size).map(fn))));
  return out;
}

// client: { id, name }  period: { datePreset } ou { since, until }
export async function clientAdsReport(client, period) {
  const keys = nameKeys(client.name);
  const resolved = resolvePeriod(period); // valida antes de consultar a Meta
  if (!keys.length) return { campanhas: [], contas: [], totais: null, periodo: resolved.label };

  const { data: accounts } = await cached("accounts", () => listAdAccounts());
  const periodKey = JSON.stringify(resolved.params);
  const range = period.since ? { since: period.since, until: period.until } : null;

  const results = await inBatches(accounts, PARALLEL, async (account) => {
    const wholeAccount = matchesClient(account.name, keys);
    let rows;
    try {
      ({ data: rows } = await cached(`insights:${account.id}:${periodKey}`, () => getCampaignInsights(account.id, period.datePreset, range)));
    } catch (err) {
      // conta sem permissão ou desativada não impede de ver as outras; token inválido e limite de consultas param tudo
      if (err instanceof MetaError && (err.status === 400 || err.status === 403)) {
        console.error("meta cliente: conta ignorada", account.id, err.message);
        return [];
      }
      throw err;
    }
    const mine = wholeAccount ? rows : rows.filter((r) => matchesClient(r.campaign_name, keys));
    return mine.map((r) => ({ ...r, account_id: account.id, account_name: account.name, currency: account.currency || "BRL", resultado: mainResult(r) }));
  });

  const campanhas = results.flat().sort((a, b) => num(b.spend) - num(a.spend));
  return {
    campanhas,
    contas: [...new Set(campanhas.map((c) => c.account_name))],
    totais: totals(campanhas),
    periodo: { ...resolved.label, inicio: campanhas[0]?.date_start ?? null, fim: campanhas[0]?.date_stop ?? null }
  };
}

function totals(rows) {
  if (!rows.length) return null;
  const currencies = [...new Set(rows.map((r) => r.currency))];
  const spend = rows.reduce((s, r) => s + num(r.spend), 0);
  const impressions = rows.reduce((s, r) => s + num(r.impressions), 0);
  const clicks = rows.reduce((s, r) => s + num(r.clicks), 0);
  const linkClicks = rows.reduce((s, r) => s + num(r.inline_link_clicks), 0);
  const byLabel = new Map();
  for (const r of rows) {
    if (!r.resultado) continue;
    const t = byLabel.get(r.resultado.label) || { label: r.resultado.label, value: 0, spend: 0 };
    t.value += r.resultado.value;
    t.spend += num(r.spend);
    byLabel.set(r.resultado.label, t);
  }
  return {
    moeda: currencies.length === 1 ? currencies[0] : null,
    investimento: currencies.length === 1 ? spend : null,
    impressoes: impressions,
    cliques: clicks,
    cliques_no_link: linkClicks,
    ctr: impressions ? (clicks / impressions) * 100 : null,
    cpc: clicks && currencies.length === 1 ? spend / clicks : null,
    cpm: impressions && currencies.length === 1 ? (spend / impressions) * 1000 : null,
    resultados: [...byLabel.values()].map((t) => ({ label: t.label, value: t.value, cost: t.value ? t.spend / t.value : null })),
    campanhas: rows.length
  };
}
