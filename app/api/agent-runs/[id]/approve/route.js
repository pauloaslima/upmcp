import { agentDb } from "../../../../../lib/agentApi";
import { approveRun, staffUser, failure } from "../../../../../lib/agentRuns";

// Grava a proposta (como a equipe deixou na tela) no calendário / conteúdo da semana
// POST { proposta }

export const dynamic = "force-dynamic";

export async function POST(request, { params }) {
  const db = agentDb();
  try {
    await staffUser(db, request);
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    return Response.json(await approveRun(db, id, body.proposta));
  } catch (err) {
    return failure(err);
  }
}
