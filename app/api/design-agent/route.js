import sharp from "sharp";
import { agentDb } from "../../../lib/agentApi";
import { ContentAgentError } from "../../../lib/contentAgent";
import { designArt } from "../../../lib/designAgent";
import { photoBox, renderArt, sizeFor } from "../../../lib/artRender";
import { findStockPhoto, stockEnabled } from "../../../lib/stockPhotos";
import { brandFiles, materialsOf } from "../../../lib/profileFields";
import { createCardFromEntry } from "../../../lib/production";
import { ART_FORMATS } from "../../../lib/pipeline";

// Cria a arte de um post (Estático, Carrossel ou Story) e já anexa na peça da Linha de produção.
// Só a equipe logada. POST { client_id, entry_id, mode: "material" | "ia", guidance }
//   material: usa só as fotos anexadas ao post, a logo e as cores do cliente
//   ia: pode usar as fotos anexadas e, quando faltar, foto de banco de imagens ligada ao tema
// As imagens ficam na pasta da peça no bucket "anexos" (quem vê a peça vê a arte).

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const IMAGE = /\.(png|jpe?g|webp|gif)$/i;
const LOGO = /\.(png|jpe?g|webp|svg)$/i;

export async function POST(request) {
  const db = agentDb();
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: auth } = token ? await db.auth.getUser(token) : { data: null };
  if (!auth?.user) return Response.json({ error: "Entre no sistema de novo." }, { status: 401 });
  const { data: me } = await db.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
  if (!["admin", "funcionario"].includes(me?.role)) return Response.json({ error: "Só a equipe pode criar artes." }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const mode = body.mode === "material" ? "material" : "ia";
  const [{ data: client }, { data: entry }] = await Promise.all([
    db.from("clients").select("*").eq("id", body.client_id || "").maybeSingle(),
    db.from("calendar_entries").select("*").eq("id", body.entry_id || "").maybeSingle()
  ]);
  if (!client || !entry || entry.client_id !== client.id) return Response.json({ error: "Post não encontrado." }, { status: 404 });
  if (!ART_FORMATS.includes(entry.format)) {
    return Response.json({ error: "A arte automática é para Estático, Carrossel e Story. Reels e vídeos são editados pela equipe." }, { status: 400 });
  }
  if (!entry.theme?.trim()) return Response.json({ error: "Escreva o tema do post antes de criar a arte." }, { status: 400 });

  try {
    const alerts = [];
    const assets = await loadAssets(db, client, entry);
    if (!assets.logo) alerts.push("Não encontrei a logo do cliente nos materiais de identidade (o nome do arquivo precisa ter \"logo\"). A arte saiu sem logo.");
    const stockAllowed = mode === "ia" && stockEnabled();
    if (mode === "ia" && !stockEnabled() && !assets.photos.length) alerts.push("Sem foto anexada e sem banco de imagens configurado: a arte saiu só com texto e cores.");

    const design = await designArt({ client, entry, assets, mode, guidance: body.guidance, stockAllowed });
    alerts.push(...design.alertas);

    // foto de cada página: anexada ao post ou de banco de imagens, recortada no tamanho do layout
    const size = sizeFor(entry.format);
    const used = new Set();
    const photos = [];
    for (let i = 0; i < design.paginas.length; i++) {
      const page = design.paginas[i];
      const box = photoBox(page.layout, size);
      if (!box) {
        photos.push(null);
        continue;
      }
      let buffer = page.foto >= 0 ? assets.photos[page.foto]?.buffer : null;
      if (!buffer && stockAllowed && page.busca_foto) {
        const stock = await findStockPhoto(page.busca_foto, { orientation: "portrait", avoid: used });
        if (stock) {
          used.add(stock.id);
          buffer = stock.buffer;
          alerts.push(`Página ${i + 1}: foto ilustrativa de banco de imagens. Confira antes de publicar.`);
        }
      }
      photos.push(buffer ? await cropTo(buffer, box) : null);
    }

    const pngs = await renderArt({ design, format: entry.format, photos, logo: assets.logo });

    // a arte vai para a peça: se o post ainda não virou peça, cria agora
    let card = null;
    if (entry.card_id) {
      const { data } = await db.from("cards").select("id, attachments").eq("id", entry.card_id).maybeSingle();
      card = data;
    }
    if (!card) card = await createCardFromEntry(db, client, { ...entry, art: [] });

    const stamp = Date.now();
    const art = [];
    for (let i = 0; i < pngs.length; i++) {
      const path = `${card.id}/arte-${stamp}-${i + 1}.png`;
      const { error } = await db.storage.from("anexos").upload(path, pngs[i], { contentType: "image/png", upsert: false });
      if (error) throw error;
      art.push({ type: "upload", path, name: pngs.length > 1 ? `Arte página ${i + 1}.png` : "Arte.png", art: true, created_at: new Date(stamp).toISOString() });
    }

    // troca a arte anterior pela nova (no post e na peça) e apaga os arquivos antigos
    const oldPaths = (entry.art || []).map((a) => a.path).filter(Boolean);
    const others = (card.attachments || []).filter((a) => !a.art);
    await Promise.all([
      db.from("calendar_entries").update({ art }).eq("id", entry.id),
      db.from("cards").update({ attachments: [...art, ...others] }).eq("id", card.id)
    ]);
    if (oldPaths.length) await db.storage.from("anexos").remove(oldPaths);

    const note = [
      `Arte criada no Conteúdo da semana (${art.length} ${art.length === 1 ? "imagem" : "imagens"}).`,
      design.resumo,
      alerts.length ? "Atenção:\n" + alerts.map((a) => "- " + a).join("\n") : ""
    ]
      .filter(Boolean)
      .join("\n\n");
    const { data: comment } = await db.from("card_comments").insert({ card_id: card.id, body: note, internal: true }).select("id").maybeSingle();
    if (comment) await db.from("card_comments").update({ author_name: "Equipe Up!", author_role: "funcionario" }).eq("id", comment.id);

    return Response.json({ ok: true, art, card_id: card.id, resumo: design.resumo, alertas: alerts });
  } catch (err) {
    if (err instanceof ContentAgentError) return Response.json({ error: err.message }, { status: 502 });
    console.error("arte:", err);
    return Response.json({ error: "Não consegui criar a arte agora. Tente de novo em instantes." }, { status: 502 });
  }
}

async function download(db, file) {
  const { data, error } = await db.storage.from("anexos").download(file.path);
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}

// imagem pequena em JPEG (base64) só para o designer enxergar
async function preview(buffer, max = 640) {
  const out = await sharp(buffer, { density: 200 }).rotate().flatten({ background: "#ffffff" }).resize({ width: max, height: max, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 72 }).toBuffer();
  return out.toString("base64");
}

async function cropTo(buffer, box) {
  const out = await sharp(buffer)
    .rotate()
    .resize({ width: box.width, height: box.height, fit: "cover", position: sharp.strategy.attention })
    .jpeg({ quality: 86 })
    .toBuffer();
  return "data:image/jpeg;base64," + out.toString("base64");
}

async function loadAssets(db, client, entry) {
  const uploads = (list) => (list || []).filter((f) => f?.type === "upload" && f.path);

  // fotos anexadas ao post (até 10)
  const photos = [];
  for (const f of uploads(entry.photos).filter((f) => IMAGE.test(f.name || f.path)).slice(0, 10)) {
    const buffer = await download(db, f);
    if (buffer) photos.push({ name: f.name, buffer, preview: await preview(buffer) });
  }

  // logo: arquivo de identidade com "logo" no nome
  let logo = null;
  const logoFile = uploads(brandFiles(client)).find((f) => LOGO.test(f.name || f.path) && /logo/i.test(f.name || f.path));
  if (logoFile) {
    const buffer = await download(db, logoFile);
    if (buffer) {
      const png = await sharp(buffer, { density: 300 }).rotate().resize({ height: 220, fit: "inside", withoutEnlargement: false }).png().toBuffer();
      const meta = await sharp(png).metadata();
      const { dominant } = await sharp(png).stats();
      const light = (0.2126 * dominant.r + 0.7152 * dominant.g + 0.0722 * dominant.b) / 255 > 0.8 && meta.hasAlpha;
      logo = { src: "data:image/png;base64," + png.toString("base64"), width: meta.width, height: meta.height, light, preview: await preview(png, 400) };
    }
  }

  // posts de exemplo do cliente (até 3), como referência de estilo
  const examples = [];
  for (const f of uploads(materialsOf(client, "exemplos")).filter((f) => IMAGE.test(f.name || f.path)).slice(0, 3)) {
    const buffer = await download(db, f);
    if (buffer) examples.push({ name: f.name, preview: await preview(buffer, 512) });
  }

  return { photos, logo, examples };
}
