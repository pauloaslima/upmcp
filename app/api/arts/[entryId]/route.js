import { agentDb } from "../../../../lib/agentApi";
import { failure, RunError, staffUser } from "../../../../lib/agentRuns";
import { ART_FORMATS } from "../../../../lib/arts";
import { loadEntry, newPlan, publicPages, removeFiles, renderPage, savePages } from "../../../../lib/artsServer";

// Artes do tema (modo híbrido). Só para a equipe logada.
// GET                       → páginas da arte (com links temporários)
// POST { force }            → planeja as páginas a partir do texto da peça e dos pedidos de imagem do designer
// PATCH { index, titulo, apoio, prompt, layout, montar } → ajusta uma página e remonta a arte (sem custo de IA)

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function context(request, params) {
  const db = agentDb();
  await staffUser(db, request);
  const { entryId } = await params;
  const { entry, client } = await loadEntry(db, entryId);
  if (!entry) throw new RunError("Tema não encontrado.", 404);
  if (!ART_FORMATS.includes(entry.format)) throw new RunError("Artes só para Estático, Carrossel e Story. Reels e vídeo ficam no roteiro.");
  return { db, entry, client };
}

export async function GET(request, { params }) {
  try {
    const { db, entry } = await context(request, params);
    return Response.json({ pages: await publicPages(db, entry.arts || []) });
  } catch (err) {
    return failure(err);
  }
}

export async function POST(request, { params }) {
  try {
    const { db, entry } = await context(request, params);
    const body = await request.json().catch(() => ({}));
    const old = entry.arts || [];
    if (old.length && !body.force) return Response.json({ pages: await publicPages(db, old) });
    const pages = newPlan(entry);
    await savePages(db, entry.id, pages);
    removeFiles(db, old.flatMap((p) => [p.imagem?.path, p.arte?.path]));
    return Response.json({ pages: await publicPages(db, pages) });
  } catch (err) {
    return failure(err);
  }
}

export async function PATCH(request, { params }) {
  try {
    const { db, entry, client } = await context(request, params);
    const body = await request.json().catch(() => ({}));
    let pages = [...(entry.arts || [])];
    const i = Number(body.index);
    if (!pages[i]) throw new RunError("Página não encontrada.");
    const patch = {};
    for (const k of ["titulo", "apoio", "prompt"]) if (typeof body[k] === "string") patch[k] = body[k].slice(0, k === "prompt" ? 3000 : 600);
    if (["capa", "pagina", "cta"].includes(body.layout)) patch.layout = body.layout;
    pages[i] = { ...pages[i], ...patch };
    // remonta se já tinha arte, se tem imagem, ou se pediram "montar só com texto"
    if (body.montar || pages[i].arte || pages[i].imagem) pages = await renderPage(db, entry, client, pages, i);
    await savePages(db, entry.id, pages);
    return Response.json({ pages: await publicPages(db, pages) });
  } catch (err) {
    return failure(err);
  }
}
