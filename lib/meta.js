// Integração com a Meta Marketing API (Graph API). SOMENTE LEITURA e SOMENTE NO SERVIDOR.
//
// Variáveis de ambiente (Vercel):
//   META_ACCESS_TOKEN  token de acesso. Nunca vai para o navegador nem aparece em mensagens de erro.
//   META_API_VERSION   versão da Graph API, ex.: "v24.0" (aceita também "24.0").
//
// O token vai no header "Authorization: Bearer", não na URL, para não ficar em logs.
// A paginação usa o cursor "after" (os links "next" da Meta trazem o token na URL e não são seguidos).

const GRAPH = "https://graph.facebook.com";
const MAX_PAGES = 20; // trava de segurança: no máximo 20 páginas por consulta
const PAGE_SIZE = 100;

export const DATE_PRESETS = [
  "today",
  "yesterday",
  "this_month",
  "last_month",
  "this_quarter",
  "maximum",
  "data_maximum",
  "last_3d",
  "last_7d",
  "last_14d",
  "last_28d",
  "last_30d",
  "last_90d",
  "last_week_mon_sun",
  "last_week_sun_sat",
  "last_quarter",
  "last_year",
  "this_week_mon_today",
  "this_week_sun_today",
  "this_year"
];

const AD_ACCOUNT_FIELDS = ["id", "name", "account_status", "currency"];
const CAMPAIGN_FIELDS = ["id", "name", "status", "effective_status", "daily_budget", "lifetime_budget"];
const INSIGHT_FIELDS = [
  "campaign_id",
  "campaign_name",
  "spend",
  "impressions",
  "reach",
  "frequency",
  "clicks",
  "inline_link_clicks",
  "ctr",
  "cpc",
  "cpm",
  "actions",
  "cost_per_action_type"
];

// Erro com mensagem segura para mostrar ao usuário (sem token) e status HTTP para a rota.
export class MetaError extends Error {
  constructor(message, { status = 502, code = null, subcode = null, type = null, traceId = null } = {}) {
    super(message);
    this.name = "MetaError";
    this.status = status;
    this.code = code;
    this.subcode = subcode;
    this.type = type;
    this.traceId = traceId;
  }

  toJSON() {
    return { error: this.message, meta: { code: this.code, subcode: this.subcode, type: this.type, fbtrace_id: this.traceId } };
  }
}

function config() {
  const token = process.env.META_ACCESS_TOKEN;
  const raw = String(process.env.META_API_VERSION || "").trim();
  if (!token) throw new MetaError("Falta configurar META_ACCESS_TOKEN no Vercel.", { status: 500 });
  if (!raw) throw new MetaError("Falta configurar META_API_VERSION no Vercel (ex.: v24.0).", { status: 500 });
  const version = raw.startsWith("v") ? raw : "v" + raw;
  if (!/^v\d+\.\d+$/.test(version)) throw new MetaError("META_API_VERSION inválida. Use o formato v24.0.", { status: 500 });
  return { token, version };
}

// Tira o token (e qualquer access_token=...) de um texto antes de devolver ou registrar.
export function redact(text) {
  let out = String(text ?? "");
  const token = process.env.META_ACCESS_TOKEN;
  if (token) out = out.split(token).join("[token oculto]");
  return out.replace(/(access_token=)(?!\[token oculto\])[^&\s"']+/gi, "$1[token oculto]").replace(/(Bearer\s+)[A-Za-z0-9._-]{20,}/g, "$1[token oculto]");
}

// "act_123", "123" → "act_123"
export function normalizeAdAccountId(value) {
  const id = String(value || "").trim();
  if (/^act_\d+$/.test(id)) return id;
  if (/^\d+$/.test(id)) return "act_" + id;
  return null;
}

// Traduz os erros mais comuns da Meta para uma mensagem clara (nunca repassa o token).
function metaError(body, httpStatus) {
  const e = body?.error || {};
  const code = e.code ?? null;
  const subcode = e.error_subcode ?? null;
  const opts = { code, subcode, type: e.type || null, traceId: e.fbtrace_id || null };
  const detail = redact(e.error_user_msg || e.message || "").slice(0, 300);

  if (code === 190) {
    return new MetaError("O token da Meta é inválido ou expirou. Gere um novo e atualize META_ACCESS_TOKEN no Vercel.", { ...opts, status: 401 });
  }
  if ([4, 17, 32, 613, 80000, 80003, 80004, 80014].includes(code) || subcode === 2446079) {
    return new MetaError("Limite de consultas da Meta atingido. Aguarde alguns minutos e tente de novo.", { ...opts, status: 429 });
  }
  if (code === 10 || (code >= 200 && code <= 299)) {
    return new MetaError("O token não tem permissão para esta consulta. Confira as permissões ads_read e o acesso à conta de anúncios.", { ...opts, status: 403 });
  }
  if (code === 100) {
    return new MetaError("A Meta não aceitou a consulta" + (detail ? ": " + detail : ". Confira o ID da conta de anúncios."), { ...opts, status: 400 });
  }
  if (code === 1 || code === 2) {
    return new MetaError("A Meta está instável no momento. Tente de novo em instantes.", { ...opts, status: 503 });
  }
  return new MetaError("A Meta respondeu com erro" + (detail ? ": " + detail : ` (HTTP ${httpStatus}).`), { ...opts, status: 502 });
}

async function metaGet(path, params = {}) {
  const { token, version } = config();
  const url = new URL(`${GRAPH}/${version}/${path.replace(/^\//, "")}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, Array.isArray(v) ? v.join(",") : String(v));
  }

  let res;
  try {
    res = await fetch(url, { headers: { Authorization: "Bearer " + token }, cache: "no-store" });
  } catch (err) {
    console.error("meta: falha de conexão", redact(err?.message));
    throw new MetaError("Não consegui falar com a Meta. Tente de novo em instantes.", { status: 503 });
  }

  const body = await res.json().catch(() => null);
  if (!res.ok || body?.error) {
    const error = metaError(body, res.status);
    console.error("meta: erro", { path, status: res.status, code: error.code, subcode: error.subcode, fbtrace_id: error.traceId, message: redact(body?.error?.message) });
    throw error;
  }
  if (!body) throw new MetaError("A Meta devolveu uma resposta vazia.", { status: 502 });
  return body;
}

// Busca todas as páginas de uma lista (cursor "after"), até MAX_PAGES.
async function metaList(path, params) {
  const items = [];
  let after;
  for (let page = 0; page < MAX_PAGES; page++) {
    const body = await metaGet(path, { limit: PAGE_SIZE, ...params, after });
    items.push(...(body.data || []));
    after = body.paging?.cursors?.after;
    if (!after || !body.paging?.next) return { items, truncated: false };
  }
  return { items, truncated: true };
}

const pick = (obj, fields) => Object.fromEntries(fields.map((f) => [f, obj?.[f] ?? null]));

// 1) Contas de anúncios que o token enxerga
export async function listAdAccounts() {
  const { items, truncated } = await metaList("me/adaccounts", { fields: AD_ACCOUNT_FIELDS });
  return { data: items.map((a) => pick(a, AD_ACCOUNT_FIELDS)), truncated };
}

// 2) Campanhas de uma conta de anúncios
export async function listCampaigns(adAccountId) {
  const id = normalizeAdAccountId(adAccountId);
  if (!id) throw new MetaError("Informe um adAccountId válido (ex.: act_1234567890).", { status: 400 });
  const { items, truncated } = await metaList(`${id}/campaigns`, { fields: CAMPAIGN_FIELDS });
  return { data: items.map((c) => pick(c, CAMPAIGN_FIELDS)), truncated };
}

// 3) Métricas por campanha de uma conta de anúncios.
// Período: datePreset (padrão last_30d) ou, no lugar dele, { since, until } em AAAA-MM-DD.
export async function getCampaignInsights(adAccountId, datePreset = "last_30d", range = null) {
  const id = normalizeAdAccountId(adAccountId);
  if (!id) throw new MetaError("Informe um adAccountId válido (ex.: act_1234567890).", { status: 400 });
  const period = resolvePeriod({ datePreset, ...(range || {}) });
  const { items, truncated } = await metaList(`${id}/insights`, { level: "campaign", fields: INSIGHT_FIELDS, ...period.params });
  return {
    data: items.map((i) => ({ ...pick(i, INSIGHT_FIELDS), date_start: i.date_start ?? null, date_stop: i.date_stop ?? null })),
    ...period.label,
    truncated
  };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Valida o período e devolve os parâmetros da Meta: date_preset ou time_range.
export function resolvePeriod({ datePreset, since, until } = {}) {
  if (since || until) {
    if (!ISO_DATE.test(since || "") || !ISO_DATE.test(until || "")) {
      throw new MetaError("Informe o período com as duas datas no formato AAAA-MM-DD.", { status: 400 });
    }
    if (since > until) throw new MetaError("A data inicial precisa ser antes da data final.", { status: 400 });
    const months = (Date.parse(until) - Date.parse(since)) / (30 * 86400000);
    if (months > 37) throw new MetaError("A Meta só guarda os últimos 37 meses. Escolha um período menor.", { status: 400 });
    return { params: { time_range: JSON.stringify({ since, until }) }, label: { since, until } };
  }
  const preset = datePreset || "last_30d";
  if (!DATE_PRESETS.includes(preset)) {
    throw new MetaError("datePreset inválido. Use um destes: " + DATE_PRESETS.join(", ") + ".", { status: 400 });
  }
  return { params: { date_preset: preset }, label: { datePreset: preset } };
}
