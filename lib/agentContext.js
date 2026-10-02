import { signedFiles } from "./agentApi";
import { addDays, iso, mondayOf, parse, productionWeek, todayInBrazil, weeklyTasks } from "./deadlines";
import { MONTH_CAMPAIGNS, specialDates } from "./holidays";
import { CALENDAR_FORMATS } from "./pipeline";
import { PLACEMENTS, PRIORITIES, REQUEST_TYPES } from "./brief";
import { MATERIAL_CATEGORIES, brandFiles, materialsOf } from "./profileFields";

// Tudo o que um agente precisa saber de um cliente para criar conteúdo:
// perfil, equipe, próximas semanas (prazos, datas comemorativas, temas já planejados)
// e temas recentes. Usado pela API dos agentes, pelo botão "Gerar conteúdo" e pelo MCP.
export async function clientContext(db, client, { withFiles = true } = {}) {
  const today = todayInBrazil();
  const now = parse(today);
  const monday = mondayOf(now);
  const until = iso(addDays(monday, 7 * 8 + 6));

  const [{ data: profiles }, { data: members }, { data: entries }] = await Promise.all([
    db.from("profiles").select("id, full_name, email, role"),
    db.from("client_members").select("user_id, role_label").eq("client_id", client.id),
    db
      .from("calendar_entries")
      .select("day, format, theme, post_time, brief_status, created_by_agent")
      .eq("client_id", client.id)
      .gte("day", iso(addDays(now, -60)))
      .lte("day", until)
      .order("day")
  ]);
  const people = Object.fromEntries((profiles || []).map((p) => [p.id, p]));
  const nameOf = (p) => (p ? p.full_name || p.email : null);

  const semanas = [];
  for (let w = 0; w <= 5; w++) semanas.push(weekInfo(addDays(monday, 7 * w), w, entries || []));

  return {
    id: client.id,
    nome: client.name,
    posicionamento: client.positioning || "",
    publico_alvo: client.target_audience || "",
    tom_de_voz: client.tone_of_voice || "",
    linhas_editoriais: client.editorial_lines || "",
    identidade_visual: {
      texto: client.identity || "",
      arquivos: withFiles ? await signedFiles(db, brandFiles(client)) : brandFiles(client).map((f) => f.name)
    },
    referencias_para_artes: client.art_references || "",
    observacoes_importantes: client.notes || "",
    materiais: withFiles
      ? Object.fromEntries(
          await Promise.all(MATERIAL_CATEGORIES.map(async (c) => [c.label, await signedFiles(db, materialsOf(client, c.id))]))
        )
      : (client.materials || []).map((m) => m.name),
    link_drive: client.drive_url || "",
    responsavel: nameOf(people[client.responsible_id]),
    equipe: (members || []).map((m) => ({ nome: nameOf(people[m.user_id]), funcao: m.role_label })),
    regras_de_prazo:
      "Conteúdo produzido com 2 semanas de antecedência: na semana de produção, demandas ao design até quarta, ajustes na quinta e envio ao cliente para aprovação na sexta. Calendário do mês seguinte pronto até o dia 25.",
    hoje: today,
    semana_para_criar_agora: semanas[2], // a que está em produção nesta semana
    semanas,
    temas_recentes: (entries || []).filter((e) => e.day < iso(monday)).map((e) => ({ dia: e.day, formato: e.format, tema: e.theme }))
  };
}

// Uma semana de publicação (segunda a domingo): prazos, datas especiais e o que já existe
export function weekInfo(pubMonday, offset, entries) {
  const days = Array.from({ length: 7 }, (_, d) => iso(addDays(pubMonday, d)));
  const special = { ...specialDates(pubMonday.getFullYear()), ...specialDates(pubMonday.getFullYear() + 1) };
  const prod = productionWeek(pubMonday);
  return {
    inicio: days[0],
    fim: days[6],
    situacao: offset === 0 ? "semana atual" : offset === 1 ? "próxima semana" : offset === 2 ? "em produção agora" : offset > 2 ? "planejamento" : "passada",
    producao: { inicio: prod.start, fim: prod.end },
    prazos: Object.fromEntries(weeklyTasks(pubMonday).map((s) => [s.kind, s.due])),
    datas_especiais: days.flatMap((d) => (special[d] || []).map((s) => ({ dia: d, nome: s.name, tipo: s.kind }))),
    campanhas_do_mes: [...new Set(days.map((d) => Number(d.slice(5, 7))))].flatMap((m) => MONTH_CAMPAIGNS[m] || []),
    temas_ja_planejados: entries.filter((e) => e.day >= days[0] && e.day <= days[6])
  };
}

// Valida e limpa os temas que um agente quer gravar. Devolve { rows, errors }.
export function cleanAgentEntries(clientId, list) {
  const rows = [];
  const errors = [];
  (list || []).forEach((e, i) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e?.day || "")) return errors.push(`tema ${i + 1}: day deve ser AAAA-MM-DD`);
    if (!String(e.theme || "").trim()) return errors.push(`tema ${i + 1}: theme vazio`);
    rows.push({
      client_id: clientId,
      day: e.day,
      format: CALENDAR_FORMATS.includes(e.format) ? e.format : "",
      theme: String(e.theme).trim().slice(0, 1000),
      post_time: String(e.post_time || "").slice(0, 20),
      notes: String(e.notes || "").slice(0, 2000),
      refs: (Array.isArray(e.refs) ? e.refs : [])
        .filter((u) => typeof u === "string" && /^https?:\/\//i.test(u))
        .map((url) => ({ type: "link", url, name: url.replace(/^https?:\/\//, "").slice(0, 50) })),
      brief: cleanBrief(e.brief),
      brief_status: "rascunho",
      use_client_identity: true,
      created_by_agent: true
    });
  });
  return { rows, errors };
}

function cleanBrief(b) {
  if (!b || typeof b !== "object") return {};
  const out = {};
  if (REQUEST_TYPES.includes(b.request_type)) out.request_type = b.request_type;
  if (PRIORITIES.some((p) => p.id === b.priority)) out.priority = b.priority;
  if (Array.isArray(b.placements)) out.placements = b.placements.filter((p) => PLACEMENTS.includes(p));
  if (typeof b.due_at === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(b.due_at)) out.due_at = b.due_at;
  ["must_have", "refs_note", "important_notes", "piece_text"].forEach((k) => {
    if (typeof b[k] === "string") out[k] = b[k].slice(0, 5000);
  });
  return out;
}

// Procura cliente pelo nome ("7ball", "ludmila"…) ou id
export function findClients(clients, { id, q }, normalize) {
  if (id) return clients.filter((c) => c.id === id);
  const n = normalize(q);
  if (!n) return [];
  return clients.filter((c) => normalize(c.name).includes(n) || n.includes(normalize(c.name)));
}
