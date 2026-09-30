import { agentAuthorized, agentDb, normalizeName, signedFiles, unauthorized } from "../../../../lib/agentApi";
import { addDays, iso, mondayOf, parse, productionWeek, todayInBrazil, weeklyTasks } from "../../../../lib/deadlines";
import { MONTH_CAMPAIGNS, specialDates } from "../../../../lib/holidays";

// Consulta de clientes para os agentes.
//
// GET /api/agent/clients              → lista { id, nome } de todos os clientes
// GET /api/agent/clients?q=7ball      → procura pelo nome (sem acento/maiúscula); 1 resultado = perfil completo
// GET /api/agent/clients?id=<id>      → perfil completo
//
// Perfil completo: posicionamento, identidade visual (texto + arquivos), observações importantes,
// link do Drive, responsável e equipe, próximas semanas (prazos, datas comemorativas, temas já
// planejados) e temas recentes para não repetir assunto.

export const dynamic = "force-dynamic";

export async function GET(request) {
  if (!agentAuthorized(request)) return unauthorized();
  const db = agentDb();
  const params = new URL(request.url).searchParams;
  const id = params.get("id");
  const q = normalizeName(params.get("q"));

  const { data: clients, error } = await db.from("clients").select("*").order("name");
  if (error) {
    console.error(error);
    return Response.json({ error: "falha ao ler clientes" }, { status: 500 });
  }

  if (!id && !q) return Response.json({ clientes: clients.map((c) => ({ id: c.id, nome: c.name })) });

  const matches = id ? clients.filter((c) => c.id === id) : clients.filter((c) => normalizeName(c.name).includes(q) || q.includes(normalizeName(c.name)));
  if (matches.length === 0) {
    return Response.json({ error: "cliente não encontrado", clientes: clients.map((c) => ({ id: c.id, nome: c.name })) }, { status: 404 });
  }
  if (matches.length > 1) {
    return Response.json({ aviso: "mais de um cliente encontrado; repita com ?id=", clientes: matches.map((c) => ({ id: c.id, nome: c.name })) });
  }

  return Response.json(await fullProfile(db, matches[0]));
}

async function fullProfile(db, client) {
  const today = todayInBrazil();
  const now = parse(today);
  const monday = mondayOf(now);
  const until = iso(addDays(monday, 7 * 5 + 6));

  const [{ data: profiles }, { data: members }, { data: entries }] = await Promise.all([
    db.from("profiles").select("id, full_name, email, role"),
    db.from("client_members").select("user_id, role_label").eq("client_id", client.id),
    db.from("calendar_entries").select("day, format, theme, post_time, brief_status, created_by_agent").eq("client_id", client.id).gte("day", iso(addDays(now, -60))).lte("day", until).order("day")
  ]);
  const people = Object.fromEntries((profiles || []).map((p) => [p.id, p]));
  const nameOf = (p) => (p ? p.full_name || p.email : null);

  const special = { ...specialDates(now.getFullYear()), ...specialDates(now.getFullYear() + 1) };

  // semanas de publicação: a atual e as 5 seguintes, com prazos e o que já existe
  const semanas = [];
  for (let w = 0; w <= 5; w++) {
    const pub = addDays(monday, 7 * w);
    const days = Array.from({ length: 7 }, (_, d) => iso(addDays(pub, d)));
    const prod = productionWeek(pub);
    const steps = weeklyTasks(pub);
    semanas.push({
      inicio: days[0],
      fim: days[6],
      situacao: w === 0 ? "semana atual" : w === 1 ? "próxima semana" : w === 2 ? "em produção agora" : "planejamento",
      producao: { inicio: prod.start, fim: prod.end },
      prazos: Object.fromEntries(steps.map((s) => [s.kind, s.due])),
      datas_especiais: days.flatMap((d) => (special[d] || []).map((s) => ({ dia: d, nome: s.name, tipo: s.kind }))),
      campanhas_do_mes: [...new Set(days.map((d) => Number(d.slice(5, 7))))].flatMap((m) => MONTH_CAMPAIGNS[m] || []),
      temas_ja_planejados: (entries || []).filter((e) => e.day >= days[0] && e.day <= days[6])
    });
  }

  return {
    id: client.id,
    nome: client.name,
    posicionamento: client.positioning || "",
    identidade_visual: {
      texto: client.identity || "",
      arquivos: await signedFiles(db, client.identity_files)
    },
    observacoes_importantes: client.notes || "",
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
