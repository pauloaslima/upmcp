import { agentDb } from "../../../lib/agentApi";
import { createRun, failure, openRunFor, staffUser } from "../../../lib/agentRuns";

// Especialista do cliente (time de agentes). Só para a equipe logada.
// POST { mode: "week", client_id, week_start, guidance, count, nova_pesquisa }
// POST { mode: "month", client_id, month: "AAAA-MM", source, strategy, posts_per_week, guidance, nova_pesquisa }
//      → cria a execução e devolve a revisão antes de executar; as etapas rodam em /agent-runs/<id>/step
// GET  ?client_id=…&mode=week|month&period_start=AAAA-MM-DD → execução em aberto (para retomar)

export const dynamic = "force-dynamic";

export async function POST(request) {
  const db = agentDb();
  try {
    const user = await staffUser(db, request);
    const body = await request.json().catch(() => ({}));
    return Response.json({ run: await createRun(db, user, body) });
  } catch (err) {
    return failure(err);
  }
}

export async function GET(request) {
  const db = agentDb();
  try {
    await staffUser(db, request);
    const p = new URL(request.url).searchParams;
    const mode = p.get("mode") === "month" ? "month" : "week";
    return Response.json({ run: await openRunFor(db, p.get("client_id"), mode, p.get("period_start")) });
  } catch (err) {
    return failure(err);
  }
}

