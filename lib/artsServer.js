import { planPages } from "./arts";
import { renderArt } from "./artRender";

// Apoio às rotas /api/arts: lê o tema e o cliente, guarda arquivos no Storage e monta as artes.

const BUCKET = "anexos";
const LINK_SECONDS = 60 * 60;

export async function loadEntry(db, entryId) {
  const { data: entry } = await db.from("calendar_entries").select("*").eq("id", entryId).maybeSingle();
  if (!entry) return {};
  const { data: client } = await db.from("clients").select("*").eq("id", entry.client_id).maybeSingle();
  return { entry, client };
}

export async function savePages(db, entryId, pages) {
  const { data } = await db.from("calendar_entries").update({ arts: pages }).eq("id", entryId).select("*").maybeSingle();
  return data;
}

export function newPlan(entry) {
  return planPages(entry);
}

async function download(db, path) {
  const { data, error } = await db.storage.from(BUCKET).download(path);
  if (error || !data) return null;
  return { buffer: Buffer.from(await data.arrayBuffer()), mime: data.type || "image/png" };
}

async function dataUrl(db, path) {
  const f = path ? await download(db, path) : null;
  return f ? `data:${f.mime};base64,${f.buffer.toString("base64")}` : null;
}

// fotos do tema como referência para a IA (até 3)
export async function photoRefs(db, entry) {
  const out = [];
  for (const p of (entry.photos || []).filter((x) => x.type === "upload" && /\.(png|jpe?g|webp)$/i.test(x.path)).slice(0, 3)) {
    const f = await download(db, p.path);
    if (f) out.push({ mime: f.mime, base64: f.buffer.toString("base64") });
  }
  return out;
}

export async function upload(db, path, buffer, contentType) {
  const { error } = await db.storage.from(BUCKET).upload(path, buffer, { contentType, upsert: true });
  if (error) throw error;
  return path;
}

export function removeFiles(db, paths) {
  const list = paths.filter(Boolean);
  if (list.length) db.storage.from(BUCKET).remove(list).catch(() => {});
}

// monta (ou remonta) a arte de uma página e guarda o PNG
export async function renderPage(db, entry, client, pages, index) {
  const page = pages[index];
  const [background, logo, customFont] = await Promise.all([
    dataUrl(db, page.imagem?.path),
    dataUrl(db, (client.brand_logo || [])[0]?.path),
    fontFile(db, client)
  ]);
  const png = await renderArt({ page, background, logo, client, customTitleFont: customFont, index, total: pages.length });
  const path = `arts/${entry.id}/arte-${index + 1}-${Date.now()}.png`;
  await upload(db, path, png, "image/png");
  removeFiles(db, [page.arte?.path]);
  pages[index] = { ...page, arte: { path, at: new Date().toISOString() } };
  return pages;
}

async function fontFile(db, client) {
  const f = (client.font_file || [])[0];
  if (!f?.path || !/\.(ttf|otf|woff)$/i.test(f.path)) return null;
  const file = await download(db, f.path);
  return file ? file.buffer.buffer.slice(file.buffer.byteOffset, file.buffer.byteOffset + file.buffer.byteLength) : null;
}

// páginas com links temporários para a tela (imagem e arte montada)
export async function publicPages(db, pages) {
  const paths = pages.flatMap((p) => [p.imagem?.path, p.arte?.path]).filter(Boolean);
  const urls = {};
  if (paths.length) {
    const { data } = await db.storage.from(BUCKET).createSignedUrls(paths, LINK_SECONDS);
    (data || []).forEach((d) => d.signedUrl && (urls[d.path] = d.signedUrl));
  }
  return pages.map((p) => ({ ...p, imagem_url: urls[p.imagem?.path] || null, arte_url: urls[p.arte?.path] || null }));
}
