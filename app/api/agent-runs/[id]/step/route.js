import { agentDb } from "../../../../../lib/agentApi";
import { runNextStep, staffUser, failure } from "../../../../../lib/agentRuns";

// Roda a próxima etapa do time (uma por chamada, para caber no limite de tempo do Vercel)

export const dynamic = "force-dynamic";
export const maxDuration = 300; // pesquisa e revisão podem levar alguns minutos

export async function POST(request, { params }) {
  const db = agentDb();
  try {
    await staffUser(db, request);
    const { id } = await params;
    return Response.json({ run: await runNextStep(db, id) });
  } catch (err) {
    return failure(err);
  }
}
