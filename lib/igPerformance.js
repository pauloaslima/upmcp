import { MetaError, metaGet } from "./meta";
import { cached } from "./metaClient";
import { addDays, iso, parse } from "./deadlines";

// Desempenho da conta do Instagram no período (como o painel da Meta):
// visualizações e alcance (de seguidores e de não seguidores), seguidores ganhos e perdidos,
// interações (curtidas, comentários, compartilhamentos, salvos), com a variação em relação
// ao período anterior de mesmo tamanho. Cada número que a Meta não liberar fica vazio (null).

const DAY = 86400;
const MAX_WINDOW_DAYS = 30; // a Meta aceita no máximo 30 dias por consulta de conta

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const startOf = (isoDay) => Math.floor(Date.parse(`${isoDay}T00:00:00-03:00`) / 1000);
const endOf = (isoDay) => Math.floor(Date.parse(`${isoDay}T23:59:59-03:00`) / 1000);
const shiftDay = (isoDay, n) => iso(addDays(parse(isoDay), n));
const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / (DAY * 1000)) + 1;

// divide o período em janelas de até 30 dias
function windows(since, until) {
  const out = [];
  for (let d = since; d <= until; d = shiftDay(d, MAX_WINDOW_DAYS)) {
    const end = shiftDay(d, MAX_WINDOW_DAYS - 1);
    out.push({ since: startOf(d), until: endOf(end < until ? end : until) });
  }
  return out;
}

// métrica não liberada (400/403) vira "sem dado"; token inválido e limite de consultas param tudo
async function optional(load) {
  try {
    return await load();
  } catch (err) {
    if (err instanceof MetaError && (err.status === 400 || err.status === 403)) return null;
    throw err;
  }
}

// soma o total (e as quebras) de métricas "total_value" em todas as janelas do período
async function totals(igId, metrics, range, breakdown) {
  const sum = Object.fromEntries(metrics.map((m) => [m, { value: 0, parts: {}, ok: false }]));
  for (const w of windows(range.since, range.until)) {
    const body = await metaGet(`${igId}/insights`, { metric: metrics, period: "day", metric_type: "total_value", breakdown, since: w.since, until: w.until });
    for (const item of body.data || []) {
      const s = sum[item.name];
      if (!s) continue;
      s.ok = true;
      s.value += num(item.total_value?.value);
      for (const b of item.total_value?.breakdowns || []) {
        for (const r of b.results || []) {
          const key = (r.dimension_values || []).join("|");
          s.parts[key] = (s.parts[key] || 0) + num(r.value);
        }
      }
    }
  }
  return Object.fromEntries(Object.entries(sum).map(([k, v]) => [k, v.ok ? v : null]));
}

// tenta várias métricas juntas; se a Meta recusar o grupo, busca uma a uma
async function totalsEach(igId, metrics, range) {
  const together = await optional(() => totals(igId, metrics, range));
  if (together) return together;
  const out = {};
  for (const m of metrics) out[m] = (await optional(() => totals(igId, [m], range)))?.[m] ?? null;
  return out;
}

// série diária para os minigráficos (a Meta só libera série de alcance e de seguidores)
async function series(igId, metric, range) {
  const points = [];
  for (const w of windows(range.since, range.until)) {
    const body = await metaGet(`${igId}/insights`, { metric, period: "day", since: w.since, until: w.until });
    for (const v of body.data?.[0]?.values || []) points.push(num(v.value));
  }
  return points;
}

function byFollow(t) {
  if (!t) return {};
  const follower = t.parts.FOLLOWER ?? t.parts.FOLLOWERS;
  const nonFollower = t.parts.NON_FOLLOWER ?? t.parts.NON_FOLLOWERS;
  return follower === undefined && nonFollower === undefined ? {} : { seguidores: follower ?? 0, nao_seguidores: nonFollower ?? 0 };
}

async function withBreakdown(igId, metric, range, breakdowns) {
  for (const b of breakdowns) {
    const r = await optional(() => totals(igId, [metric], range, b));
    if (r?.[metric]) return r[metric];
  }
  return (await optional(() => totals(igId, [metric], range)))?.[metric] || null;
}

async function accountNumbers(igId, range) {
  const [views, reach, follows, interactions] = await Promise.all([
    withBreakdown(igId, "views", range, ["follow_type", "follower_type"]),
    withBreakdown(igId, "reach", range, ["follow_type"]),
    optional(() => totals(igId, ["follows_and_unfollows"], range, "follow_type")),
    totalsEach(igId, ["total_interactions", "accounts_engaged", "likes", "comments", "shares", "saves"], range)
  ]);
  const fu = follows?.follows_and_unfollows;
  return {
    visualizacoes: views ? { total: views.value, ...byFollow(views) } : null,
    alcance: reach ? { total: reach.value, ...byFollow(reach) } : null,
    seguidores: fu ? { novos: fu.parts.FOLLOWER ?? 0, deixaram: fu.parts.NON_FOLLOWER ?? 0 } : null,
    interacoes: interactions.total_interactions
      ? {
          total: interactions.total_interactions.value,
          contas: interactions.accounts_engaged?.value ?? null,
          curtidas: interactions.likes?.value ?? null,
          comentarios: interactions.comments?.value ?? null,
          compartilhamentos: interactions.shares?.value ?? null,
          salvos: interactions.saves?.value ?? null
        }
      : null
  };
}

const change = (now, before) => (now === null || now === undefined || !before ? null : ((now - before) / before) * 100);

// soma os números de mais de um perfil do mesmo cliente (normalmente é um só)
function mergeNumbers(list) {
  const out = {};
  for (const n of list) {
    for (const [group, values] of Object.entries(n)) {
      if (!values) continue;
      out[group] = out[group] || {};
      for (const [k, v] of Object.entries(values)) if (v !== null && v !== undefined) out[group][k] = (out[group][k] || 0) + v;
    }
  }
  return out;
}

// accounts: perfis do cliente ({ id, followers_count })  range: { since, until } em AAAA-MM-DD
export async function accountPerformance(accounts, range) {
  return cached(`ig-perf:${accounts.map((a) => a.id).join(",")}:${range.since}:${range.until}`, async () => {
    const days = daysBetween(range.since, range.until);
    const previous = { since: shiftDay(range.since, -days), until: shiftDay(range.since, -1) };
    const per = await Promise.all(
      accounts.map(async (a) => {
        const [now, before, alcanceSerie, seguidoresSerie] = await Promise.all([
          accountNumbers(a.id, range),
          accountNumbers(a.id, previous),
          optional(() => series(a.id, "reach", range)),
          optional(() => series(a.id, "follower_count", range))
        ]);
        return { now, before, alcanceSerie, seguidoresSerie };
      })
    );
    const now = mergeNumbers(per.map((p) => p.now));
    const before = mergeNumbers(per.map((p) => p.before));
    const sumSeries = (key) => {
      const lists = per.map((p) => p[key]).filter((s) => s?.length);
      if (!lists.length) return null;
      return lists[0].map((_, i) => lists.reduce((s, l) => s + num(l[i]), 0));
    };
    return {
      visualizacoes: now.visualizacoes ? { ...now.visualizacoes, variacao: change(now.visualizacoes.total, before.visualizacoes?.total) } : null,
      alcance: now.alcance ? { ...now.alcance, variacao: change(now.alcance.total, before.alcance?.total), serie: sumSeries("alcanceSerie") } : null,
      seguidores: {
        atual: accounts.reduce((s, a) => s + num(a.followers_count), 0),
        novos: now.seguidores?.novos ?? null,
        deixaram: now.seguidores?.deixaram ?? null,
        variacao_deixaram: change(now.seguidores?.deixaram, before.seguidores?.deixaram),
        serie: sumSeries("seguidoresSerie")
      },
      interacoes: now.interacoes ? { ...now.interacoes, variacao: change(now.interacoes.total, before.interacoes?.total) } : null,
      periodo_anterior: previous
    };
  });
}
