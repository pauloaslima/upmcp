import { agentDb } from "../../../lib/agentApi";
import { clientContext, cleanAgentEntries, weekInfo } from "../../../lib/agentContext";
import { ContentAgentError, generateWeek } from "../../../lib/contentAgent";
import { addDays, iso, mondayOf, parse, todayInBrazil } from "../../../lib/deadlines";

// Botão "Criar temas com IA" (Conteúdo da semana). Só para a equipe logada.
// POST { client_id, week_start: "AAAA-MM-DD" (segunda), guidance, count }

export const dynamic = "force-dynamic";
export const maxDuration = 300; // a IA pode levar até alguns minutos

export async function POST(request) {
  const db = agentDb();

  // quem pediu precisa ser administrador ou funcionário
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: auth } = token ? await db.auth.getUser(token) : { data: null };
  if (!auth?.user) return Response.json({ error: "Entre no sistema de novo." }, { status: 401 });
  const { data: me } = await db.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
  if (!["admin", "funcionario"].includes(me?.role)) return Response.json({ error: "Só a equipe pode usar o agente." }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  if (!body.client_id || !/^\d{4}-\d{2}-\d{2}$/.test(body.week_start || "")) {
    return Response.json({ error: "Informe o cliente e a semana." }, { status: 400 });
  }
  const count = Number.isInteger(body.count) && body.count > 0 && body.count <= 14 ? body.count : null;

  const { data: client } = await db.from("clients").select("*").eq("id", body.client_id).maybeSingle();
  if (!client) return Response.json({ error: "Cliente não encontrado." }, { status: 404 });

  const context = await clientContext(db, client, { withFiles: false });
  const pubMonday = mondayOf(parse(body.week_start));
  const offset = Math.round((pubMonday - mondayOf(parse(todayInBrazil()))) / (7 * 86400000));
  const { data: existing } = await db
    .from("calendar_entries")
    .select("day, format, theme, post_time, brief_status, created_by_agent")
    .eq("client_id", client.id)
    .gte("day", body.week_start)
    .lte("day", iso(addDays(pubMonday, 6)));
  const week = weekInfo(pubMonday, offset, existing || []);

  let result;
  try {
    result = await generateWeek({ context, week, guidance: body.guidance, count });
  } catch (err) {
    if (err instanceof ContentAgentError) return Response.json({ error: err.message }, { status: 502 });
    console.error(err);
    return Response.json({ error: "Não consegui falar com a IA agora." }, { status: 502 });
  }

  const { rows } = cleanAgentEntries(client.id, result.temas);
  if (!rows.length) return Response.json({ error: "A IA não sugeriu nenhum tema para essa semana. Tente com outra orientação." }, { status: 422 });

  const { data: created, error } = await db.from("calendar_entries").insert(rows).select("*");
  if (error) {
    console.error(error);
    return Response.json({ error: "Criei os temas, mas não consegui gravar." }, { status: 500 });
  }
  return Response.json({ ok: true, resumo: result.resumo, criados: created });
}
