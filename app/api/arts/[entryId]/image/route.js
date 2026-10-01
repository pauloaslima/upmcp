import { agentDb } from "../../../../../lib/agentApi";
import { failure, RunError, staffUser } from "../../../../../lib/agentRuns";
import { ART_FORMATS } from "../../../../../lib/arts";
import { loadEntry, photoRefs, publicPages, removeFiles, renderPage, savePages, upload } from "../../../../../lib/artsServer";
import { ImageGenError, generateImage } from "../../../../../lib/imageGen";

// Gera a imagem de UMA página com a IA (Nano Banana ou GPT Image) e já monta a arte com o texto.
// POST { index, provider: "nano_banana" | "nano_banana_pro" | "openai", usar_fotos }

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request, { params }) {
  try {
    const db = agentDb();
    await staffUser(db, request);
    const { entryId } = await params;
    const { entry, client } = await loadEntry(db, entryId);
    if (!entry) throw new RunError("Tema não encontrado.", 404);
    if (!ART_FORMATS.includes(entry.format)) throw new RunError("Artes só para Estático, Carrossel e Story.");
    const body = await request.json().catch(() => ({}));
    let pages = [...(entry.arts || [])];
    const i = Number(body.index);
    const page = pages[i];
    if (!page) throw new RunError("Página não encontrada. Planeje as páginas primeiro.");
    const provider = ["nano_banana", "nano_banana_pro", "openai"].includes(body.provider) ? body.provider : client.image_provider || "nano_banana";

    const refs = body.usar_fotos ? await photoRefs(db, entry) : [];
    let image;
    try {
      image = await generateImage({ provider, prompt: page.prompt, aspect: page.aspect, colors: client.brand_colors, refs });
    } catch (err) {
      if (err instanceof ImageGenError) throw new RunError(err.message, 502);
      throw err;
    }
    const ext = image.mime.includes("jpeg") ? "jpg" : image.mime.split("/")[1] || "png";
    const path = await upload(db, `arts/${entry.id}/imagem-${i + 1}-${Date.now()}.${ext}`, image.buffer, image.mime);
    removeFiles(db, [page.imagem?.path]);
    pages[i] = { ...page, imagem: { path, provider, at: new Date().toISOString() } };
    pages = await renderPage(db, entry, client, pages, i);
    await savePages(db, entry.id, pages);
    return Response.json({ pages: await publicPages(db, pages) });
  } catch (err) {
    return failure(err);
  }
}
