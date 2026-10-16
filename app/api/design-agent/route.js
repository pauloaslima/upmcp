import { agentDb } from "../../../lib/agentApi";
import { imageGenEnabled } from "../../../lib/openaiImages";
import { stockEnabled } from "../../../lib/stockPhotos";
import { ArtRunError, continueArtRun, deleteArtPage, editArtPage, runSummary, startArtRun, teamFeedback } from "../../../lib/art/pipeline";

// Produção de artes com direção de arte (Estático, Carrossel e Story). Só a equipe logada.
// O trabalho é feito pelos agentes de lib/art (estrategista de briefing, diretor de arte, arquiteto de layout,
// especialista em geração visual, crítico visual e refinador) e fica gravado na rodada (tabela art_runs).
//   POST { action: "start", client_id, entry_id | card_id, mode: "material" | "ia" | "gerar", guidance, enhance }
//   POST { action: "continue", run_id }   avança a rodada (a tela repete até "final": true)
//   POST { action: "feedback", run_id, aprovado: true|false, motivo }   decisão da equipe (aprendizado)
//   POST { action: "redo_page", run_id, page, instrucao }   refaz só uma página com a alteração pedida
// GET devolve o que está configurado: { geracao, banco }

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BUDGET_MS = 265 * 1000; // deixa folga para responder antes do limite da Vercel

export function GET() {
  return Response.json({ geracao: imageGenEnabled(), banco: stockEnabled() });
}

export async function POST(request) {
  const startedAt = Date.now();
  const db = agentDb();
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: auth } = token ? await db.auth.getUser(token) : { data: null };
  if (!auth?.user) return Response.json({ error: "Entre no sistema de novo." }, { status: 401 });
  const { data: me } = await db.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
  if (!["admin", "funcionario"].includes(me?.role)) return Response.json({ error: "Só a equipe pode criar artes." }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const budget = () => BUDGET_MS - (Date.now() - startedAt);
  // cliente "só administradores" (a própria agência) some para quem não é admin
  if (me.role !== "admin") {
    let clientId = body.client_id;
    if (!clientId && (body.entry_id || body.card_id)) {
      const { data: row } = body.entry_id
        ? await db.from("calendar_entries").select("client_id").eq("id", body.entry_id).maybeSingle()
        : await db.from("cards").select("client_id").eq("id", body.card_id).maybeSingle();
      clientId = row?.client_id;
    }
    if (!clientId && body.run_id) {
      const { data: run } = await db.from("art_runs").select("client_id").eq("id", body.run_id).maybeSingle();
      clientId = run?.client_id;
    }
    const { data: c } = clientId ? await db.from("clients").select("admin_only").eq("id", clientId).maybeSingle() : { data: null };
    if (c?.admin_only) return Response.json({ error: "Cliente não encontrado." }, { status: 404 });
  }
  try {
    if (body.action === "feedback") return Response.json(await teamFeedback(db, body.run_id, { aprovado: !!body.aprovado, motivo: body.motivo }));
    // refazer uma página: { action: "redo_page", run_id, page (0 = primeira), instrucao }
    if (body.action === "delete_page") {
      const out = await deleteArtPage(db, { run_id: body.run_id, entry_id: body.entry_id, card_id: body.card_id, page: body.page });
      return Response.json({ ok: true, art: out.art });
    }
    if (body.action === "redo_page") {
      const out = await editArtPage(db, { run_id: body.run_id, entry_id: body.entry_id, card_id: body.card_id, page: body.page, instrucao: body.instrucao });
      return Response.json({ ok: true, art: out.run ? (await runSummary(db, out.run)).art : out.art });
    }
    const run =
      body.action === "continue"
        ? await continueArtRun(db, body.run_id, budget())
        : await startArtRun(
            db,
            { client_id: body.client_id, entry_id: body.entry_id, card_id: body.card_id, mode: body.mode, guidance: body.guidance, enhance: body.enhance, userId: auth.user.id, bank_photos: Array.isArray(body.bank_photos) ? body.bank_photos : undefined },
            budget()
          );
    const summary = await runSummary(db, run);
    if (run.status === "erro") return Response.json({ error: summary.alertas[summary.alertas.length - 1] || "Não consegui criar a arte agora.", run: summary }, { status: 502 });
    return Response.json({ ok: true, run: summary });
  } catch (err) {
    if (err instanceof ArtRunError) return Response.json({ error: err.message }, { status: 400 });
    console.error("arte:", err);
    return Response.json({ error: "Não consegui criar a arte agora. Tente de novo em instantes." }, { status: 502 });
  }
}
