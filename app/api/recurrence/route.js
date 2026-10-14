import { agentDb } from "../../../lib/agentApi";
import { todayInBrazil } from "../../../lib/deadlines";
import { cleanRecurrence } from "../../../lib/recurrence";
import { syncTemplate } from "../../../lib/recurrenceSync";

// Demanda recorrente: grava a regra no card e cria (ou tira) as próximas ocorrências.
// Só a equipe logada. POST { card_id, recurrence: {…} | null }
export const dynamic = "force-dynamic";

export async function POST(request) {
  const db = agentDb();
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: auth } = token ? await db.auth.getUser(token) : { data: null };
  if (!auth?.user) return Response.json({ error: "Entre no sistema de novo." }, { status: 401 });
  const { data: me } = await db.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
  if (!["admin", "funcionario"].includes(me?.role)) return Response.json({ error: "Só a equipe pode criar demandas recorrentes." }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const { data: card } = await db.from("cards").select("*").eq("id", body.card_id || "").maybeSingle();
  const { data: client } = card?.client_id ? await db.from("clients").select("id, responsible_id, admin_only").eq("id", card.client_id).maybeSingle() : { data: null };
  if (!card || (client?.admin_only && me.role !== "admin")) return Response.json({ error: "Demanda não encontrada." }, { status: 404 });
  if (card.recurrence_parent) return Response.json({ error: "Esta é uma ocorrência; a repetição se ajusta no card original." }, { status: 400 });

  const recurrence = body.recurrence ? cleanRecurrence(body.recurrence) : null;
  if (body.recurrence && !recurrence) return Response.json({ error: "Escolha quando a demanda se repete." }, { status: 400 });
  const { error } = await db.from("cards").update({ recurrence }).eq("id", card.id);
  if (error) {
    console.error("recorrência:", error);
    return Response.json({ error: /recurrence/i.test(error.message) ? "Falta rodar o SQL 019_demandas_recorrentes.sql no Supabase." : "Não consegui salvar a repetição." }, { status: 500 });
  }
  try {
    const result = await syncTemplate(db, { ...card, recurrence }, { today: todayInBrazil(), responsibleId: client?.responsible_id || null });
    return Response.json({ ok: true, recurrence, ...result });
  } catch (err) {
    console.error("recorrência:", err);
    return Response.json({ error: "A regra foi salva, mas não consegui criar as próximas ocorrências agora." }, { status: 500 });
  }
}
