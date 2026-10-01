import { agentDb } from "../../../../lib/agentApi";
import { cancelRun, loadRun, publicRun, staffUser, failure } from "../../../../lib/agentRuns";

// GET → situação da execução; DELETE → cancela (o que já foi gravado continua gravado)

export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  const db = agentDb();
  try {
    await staffUser(db, request);
    const { id } = await params;
    return Response.json({ run: publicRun(await loadRun(db, id)) });
  } catch (err) {
    return failure(err);
  }
}

export async function DELETE(request, { params }) {
  const db = agentDb();
  try {
    await staffUser(db, request);
    const { id } = await params;
    return Response.json({ run: await cancelRun(db, id) });
  } catch (err) {
    return failure(err);
  }
}
