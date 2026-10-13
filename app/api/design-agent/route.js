import sharp from "sharp";
import { agentDb } from "../../../lib/agentApi";
import { ContentAgentError } from "../../../lib/contentAgent";
import { chooseStockPhotos, designArt, reviewArt } from "../../../lib/designAgent";
import { photoBox, renderArt, sizeFor } from "../../../lib/artRender";
import { downloadStock, findStockCandidates, stockEnabled } from "../../../lib/stockPhotos";
import { brandKit, materialsOf } from "../../../lib/profileFields";
import { createCardFromEntry } from "../../../lib/production";
import { ART_FORMATS } from "../../../lib/pipeline";
import { removeTextFromPhoto } from "../../../lib/photoClean";
import { enhancePhotoAI, generatePhoto, imageGenEnabled, removeTextAI } from "../../../lib/openaiImages";
import { enhanceLocal } from "../../../lib/photoEnhance";

// Cria a arte de um post (Estático, Carrossel ou Story) e já anexa na peça da Linha de produção.
// Só a equipe logada. POST { client_id, entry_id | card_id, mode: "material" | "ia", guidance }
//   entry_id: post do calendário (e a peça ligada a ele, se houver)
//   card_id: peça da Linha de produção (e o post do calendário ligado a ela, se houver)
// O designer lê tudo o que está no post e na peça: fotos e logo anexadas, texto da peça, copy,
// roteiro, CTA, objetivo, referência visual, briefing e observações; e o perfil do cliente.
//   material: usa só o que já está anexado (fotos, logo) e as cores do cliente
//   ia: usa o que está anexado e, quando faltar foto, escolhe uma de banco de imagens ligada ao tema
//   gerar: usa o que está anexado e, quando faltar foto, gera uma imagem nova (OpenAI; precisa de OPENAI_API_KEY)
//   enhance: true melhora as fotos anexadas usadas na arte (ajuste leve em todas; as fracas passam pela OpenAI)
// GET devolve o que está configurado: { geracao, banco }
// As imagens ficam na pasta da peça no bucket "anexos" (quem vê a peça vê a arte).
// Depois de desenhada, a arte é avaliada pelo diretor de arte; se estiver genérica, desequilibrada ou
// ilegível, é refeita uma vez com as mesmas imagens (sem gerar nem buscar fotos de novo), se der tempo.

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const REVIEW_UNTIL_MS = 170 * 1000; // só avalia se ainda sobra tempo para responder
const REDO_UNTIL_MS = 190 * 1000; // e só refaz se ainda couber um novo projeto

const IMAGE = /\.(png|jpe?g|webp|gif)$/i;
const LOGO = /\.(png|jpe?g|webp|svg)$/i;
const isLogoName = (f) => /logo|marca|brand/i.test(f.name || f.path || "");

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
  const mode = ["material", "gerar"].includes(body.mode) ? body.mode : "ia";
  const { data: client } = await db.from("clients").select("*").eq("id", body.client_id || "").maybeSingle();
  if (!client) return Response.json({ error: "Cliente não encontrado." }, { status: 404 });

  // o post e a peça, um puxando o outro
  let entry = null;
  let card = null;
  if (body.entry_id) {
    ({ data: entry } = await db.from("calendar_entries").select("*").eq("id", body.entry_id).maybeSingle());
    if (entry?.card_id) ({ data: card } = await db.from("cards").select("*").eq("id", entry.card_id).maybeSingle());
  } else if (body.card_id) {
    ({ data: card } = await db.from("cards").select("*").eq("id", body.card_id).maybeSingle());
    if (card) ({ data: entry } = await db.from("calendar_entries").select("*").eq("card_id", card.id).maybeSingle());
  }
  if ((!entry && !card) || (entry && entry.client_id !== client.id) || (card && card.client_id !== client.id)) {
    return Response.json({ error: "Post não encontrado." }, { status: 404 });
  }
  const format = entry?.format || card?.format;
  if (!ART_FORMATS.includes(format)) {
    return Response.json({ error: "A arte automática é para Estático, Carrossel e Story. Reels e vídeos são editados pela equipe." }, { status: 400 });
  }
  const post = await postInfo(db, entry, card, format);
  if (!post.theme) return Response.json({ error: "Escreva o tema (ou o nome da peça) antes de criar a arte." }, { status: 400 });

  try {
    const alerts = [];
    const assets = await loadAssets(db, client, entry, card);
    if (!assets.logo && !assets.signature) alerts.push("O cliente não tem logo: envie no perfil do cliente, seção \"Logo e assinatura das artes\". A arte saiu sem logo.");
    const genAllowed = mode === "gerar" && imageGenEnabled();
    // sem gerador configurado, "gerar" cai para o banco de imagens
    const stockAllowed = (mode === "ia" || (mode === "gerar" && !genAllowed)) && stockEnabled();
    if (mode === "gerar" && !genAllowed) alerts.push("O gerador de imagens ainda não está configurado (falta OPENAI_API_KEY na Vercel).");
    if (mode === "ia" && !stockEnabled() && !assets.photos.length) alerts.push("Sem foto anexada e sem banco de imagens configurado: a arte saiu só com texto e cores.");
    if (mode === "material" && !assets.photos.length) alerts.push("O post e a peça não têm fotos anexadas: a arte saiu só com texto e cores.");

    let design = await designArt({ client, entry: post, assets, mode, guidance: body.guidance, stockAllowed, genAllowed });
    alerts.push(...design.alertas);

    // tira das fotos anexadas o que já vinha escrito nelas
    for (const t of design.textos_nas_fotos) {
      const photo = assets.photos[t.foto];
      if (!photo) continue;
      if (imageGenEnabled()) {
        try {
          photo.buffer = await removeTextAI(photo.buffer, t.regioes);
          alerts.push(`Foto "${photo.name}": textos que já estavam escritos foram removidos e o fundo refeito. Confira se ficou natural.`);
          continue;
        } catch (err) {
          console.error("arte: remoção de texto pela OpenAI falhou", err?.message);
        }
      }
      try {
        const cleaned = await removeTextFromPhoto(photo.buffer, t.regioes);
        photo.buffer = cleaned.buffer;
        alerts.push(
          `Foto "${photo.name}": ${[cleaned.cropped ? "cortei a faixa com texto" : "", cleaned.patched ? `apaguei ${cleaned.patched} texto(s) que já estavam escritos` : ""].filter(Boolean).join(" e ")}. Confira se ficou natural.`
        );
      } catch (err) {
        console.error("arte: limpeza da foto falhou", err?.message);
      }
    }

    // fotos de banco: busca opções para cada página e o designer escolhe a melhor de cada uma
    const size = sizeFor(format);
    const stockPages = design.paginas
      .map((p, i) => ({ ...p, index: i }))
      .filter((p) => photoBox(p.layout, size) && !(p.foto >= 0 && assets.photos[p.foto]) && stockAllowed && p.busca_foto);
    const stockFor = {};
    if (stockPages.length) {
      const used = new Set();
      const options = [];
      for (const p of stockPages) {
        const candidates = (await findStockCandidates(p.busca_foto, { avoid: used })).slice(0, 6);
        const withPreview = [];
        for (const c of candidates) {
          const buf = await fetch(c.preview, { cache: "no-store" }).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null);
          if (buf) withPreview.push({ ...c, previewB64: await preview(Buffer.from(buf), 384) });
        }
        options.push({ page: p, candidates: withPreview });
      }
      const picks = await chooseStockPhotos({ client, post, pages: options.filter((o) => o.candidates.length) });
      for (const o of options) {
        const pick = o.candidates[picks[o.page.index] ?? -1] || null;
        if (!pick || used.has(pick.id)) continue;
        const buffer = await downloadStock(pick);
        if (!buffer) continue;
        used.add(pick.id);
        stockFor[o.page.index] = buffer;
        alerts.push(`Página ${o.page.index + 1}: foto de banco de imagens. Confira antes de publicar.`);
      }
    }

    // melhoria das fotos anexadas que entram na arte (opção "Melhorar as fotos")
    if (body.enhance) {
      const used = [...new Set(design.paginas.map((p) => p.foto).filter((i) => i >= 0 && assets.photos[i]))];
      const weak = new Map(design.fotos_fracas.map((f) => [f.foto, f.problema]));
      // as fracas (no máximo 2 por arte) passam pela OpenAI, mantendo tudo igual; as outras, ajuste leve
      const viaAI = imageGenEnabled() ? used.filter((i) => weak.has(i)).slice(0, 2) : [];
      await Promise.all(
        used.map(async (i) => {
          const photo = assets.photos[i];
          if (viaAI.includes(i)) {
            try {
              photo.buffer = await enhancePhotoAI(photo.buffer, weak.get(i));
              alerts.push(`Foto "${photo.name}" estava fraca e foi tratada (luz, cor e nitidez). Confira se o produto ficou igual ao original.`);
              return;
            } catch (err) {
              console.error("arte: melhoria pela OpenAI falhou", err?.message);
            }
          }
          try {
            photo.buffer = await enhanceLocal(photo.buffer);
          } catch (err) {
            console.error("arte: ajuste leve falhou", err?.message);
          }
        })
      );
      if (used.length) alerts.push(`Fotos ajustadas: ${used.length} (luz, contraste e nitidez). As originais continuam anexadas.`);
    }

    // imagens novas (OpenAI) para as páginas de foto sem foto anexada
    const generatedFor = {};
    if (genAllowed) {
      const toGenerate = design.paginas
        .map((p, i) => ({ ...p, index: i }))
        .filter((p) => photoBox(p.layout, size) && !(p.foto >= 0 && assets.photos[p.foto]) && p.descricao_imagem)
        .slice(0, 3);
      const results = await Promise.all(
        toGenerate.map((p) =>
          generatePhoto(p.descricao_imagem, photoBox(p.layout, size))
            .then((buffer) => ({ p, buffer }))
            .catch((err) => ({ p, error: err?.message || "erro" }))
        )
      );
      for (const r of results) {
        if (r.buffer) {
          generatedFor[r.p.index] = r.buffer;
          alerts.push(`Página ${r.p.index + 1}: imagem gerada para a arte. Confira antes de publicar.`);
        } else alerts.push(`Página ${r.p.index + 1}: não consegui gerar a imagem (${r.error}).`);
      }
    }

    // foto de cada página, recortada no tamanho do layout
    const photos = [];
    for (let i = 0; i < design.paginas.length; i++) {
      const page = design.paginas[i];
      const box = photoBox(page.layout, size);
      const buffer = !box ? null : page.foto >= 0 ? assets.photos[page.foto]?.buffer : generatedFor[i] || stockFor[i];
      photos.push(buffer ? await cropTo(buffer, box) : null);
    }

    let pngs = await renderArt({ design, format, photos, logo: assets.logo, signature: assets.signature });

    // etapas 6 e 7 da direção de arte: avaliar a arte pronta e, se estiver fraca, refazer uma vez
    let review = null;
    if (Date.now() - startedAt < REVIEW_UNTIL_MS) {
      review = await reviewArt({ client, post, design, pages: await Promise.all(pngs.map((b) => preview(b, 768))), assets });
    }
    if (review && !review.aprovada) {
      const problems = review.problemas.join(" ");
      if (Date.now() - startedAt < REDO_UNTIL_MS) {
        try {
          // as imagens de banco e geradas da primeira versão entram como material, para não gastar de novo
          const extra = await Promise.all(
            Object.entries({ ...stockFor, ...generatedFor }).map(async ([i, buffer]) => ({ name: `imagem usada na página ${Number(i) + 1} da primeira versão`, buffer, preview: await preview(buffer) }))
          );
          const pool = [...assets.photos, ...extra];
          const redo = await designArt({
            client,
            entry: post,
            assets: { ...assets, photos: pool },
            mode: "material",
            guidance: body.guidance,
            stockAllowed: false,
            genAllowed: false,
            revisao: { problemas: review.problemas, orientacao: review.orientacao, conceito_anterior: design.conceito }
          });
          const redoPhotos = [];
          for (const page of redo.paginas) {
            const box = photoBox(page.layout, size);
            const buffer = box && page.foto >= 0 ? pool[page.foto]?.buffer : null;
            redoPhotos.push(buffer ? await cropTo(buffer, box) : null);
          }
          pngs = await renderArt({ design: redo, format, photos: redoPhotos, logo: assets.logo, signature: assets.signature });
          design = redo;
          alerts.push(`A primeira versão foi reprovada na avaliação de direção de arte (${problems}) e a arte foi refeita.`, ...redo.alertas);
        } catch (err) {
          console.error("arte: refazer após avaliação falhou", err?.message);
          alerts.push(`A avaliação de direção de arte apontou: ${problems} Não consegui refazer agora; confira a arte ou crie de novo.`);
        }
      } else {
        alerts.push(`A avaliação de direção de arte apontou: ${problems} Confira a arte ou crie de novo.`);
      }
    }

    // a arte vai para a peça: se o post ainda não virou peça, cria agora
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
    const { data: fresh } = await db.from("cards").select("attachments").eq("id", card.id).maybeSingle();
    const current = fresh?.attachments || card.attachments || [];
    const oldPaths = [...new Set([...(entry?.art || []), ...current.filter((a) => a?.art)].map((a) => a.path).filter(Boolean))];
    await Promise.all([
      entry ? db.from("calendar_entries").update({ art }).eq("id", entry.id) : null,
      db.from("cards").update({ attachments: [...art, ...current.filter((a) => !a?.art)] }).eq("id", card.id)
    ]);
    if (oldPaths.length) await db.storage.from("anexos").remove(oldPaths);

    const note = [
      `Arte criada (${art.length} ${art.length === 1 ? "imagem" : "imagens"}). Material lido: ${assets.photos.length} foto(s) anexada(s)${assets.logo ? ", logo" : ""}${assets.signature ? ", assinatura" : ""}${assets.references.length ? `, ${assets.references.length} imagem(ns) de referência` : ""}${assets.examples.length ? `, ${assets.examples.length} post(s) de exemplo` : ""}.`,
      design.resumo,
      review ? `Avaliação de direção de arte: nota ${review.nota ?? "-"}${review.aprovada ? ", aprovada" : ""}.` : "",
      alerts.length ? "Atenção:\n" + alerts.map((a) => "- " + a).join("\n") : ""
    ]
      .filter(Boolean)
      .join("\n\n");
    const { data: comment } = await db.from("card_comments").insert({ card_id: card.id, body: note, internal: true }).select("id").maybeSingle();
    if (comment) await db.from("card_comments").update({ author_name: "Equipe Up!", author_role: "funcionario" }).eq("id", comment.id);

    return Response.json({ ok: true, art, card_id: card.id, entry_id: entry?.id || null, resumo: design.resumo, alertas: alerts, avaliacao: review });
  } catch (err) {
    if (err instanceof ContentAgentError) return Response.json({ error: err.message }, { status: 502 });
    console.error("arte:", err);
    return Response.json({ error: "Não consegui criar a arte agora. Tente de novo em instantes." }, { status: 502 });
  }
}

// Junta o que o post do calendário e a peça da Linha de produção dizem sobre a arte
async function postInfo(db, entry, card, format) {
  const brief = entry?.brief || {};
  let comments = [];
  if (card) {
    const { data } = await db.from("card_comments").select("body, created_at").eq("card_id", card.id).order("created_at", { ascending: false }).limit(8);
    comments = (data || []).map((c) => c.body).filter((b) => b && !/^Arte criada/.test(b));
  }
  return {
    id: entry?.id || card.id,
    day: entry?.day || card?.publish_date || "",
    format,
    theme: (entry?.theme || card?.title || "").trim(),
    editorial_line: entry?.editorial_line || "",
    notes: entry?.notes || "",
    brief: {
      piece_text: brief.piece_text || card?.copy || "",
      must_have: brief.must_have || "",
      important_notes: brief.important_notes || "",
      refs_note: brief.refs_note || ""
    },
    peca: card
      ? {
          copy_legenda: card.copy || "",
          roteiro: card.script || "",
          cta: card.cta || "",
          objetivo: card.objective || "",
          pilar: card.pillar || "",
          referencia_visual: card.visual_ref || "",
          observacoes_da_peca: comments.slice(0, 6).reverse()
        }
      : null
  };
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
    .jpeg({ quality: 88 })
    .toBuffer();
  return "data:image/jpeg;base64," + out.toString("base64");
}

async function logoFrom(buffer) {
  const png = await sharp(buffer, { density: 300 }).rotate().resize({ height: 220, fit: "inside" }).png().toBuffer();
  const meta = await sharp(png).metadata();
  const { dominant } = await sharp(png).stats();
  const light = (0.2126 * dominant.r + 0.7152 * dominant.g + 0.0722 * dominant.b) / 255 > 0.8 && meta.hasAlpha;
  return { src: "data:image/png;base64," + png.toString("base64"), width: meta.width, height: meta.height, light, preview: await preview(png, 400) };
}

// foto de perfil recortada em quadrado (o rosto no centro) para a assinatura
async function avatarFrom(buffer) {
  const out = await sharp(buffer).rotate().resize({ width: 240, height: 240, fit: "cover", position: sharp.strategy.attention }).jpeg({ quality: 88 }).toBuffer();
  return "data:image/jpeg;base64," + out.toString("base64");
}

async function loadAssets(db, client, entry, card) {
  const uploads = (list) => (list || []).filter((f) => f?.type === "upload" && f.path && !f.art);
  const seen = new Set();
  const unique = (list) => list.filter((f) => (seen.has(f.path) ? false : seen.add(f.path)));

  // imagens de referência (modelo a seguir): as do post e as que foram para a peça
  const refFiles = unique([...uploads(entry?.refs), ...uploads(card?.attachments).filter((f) => f.ref)]).filter((f) => IMAGE.test(f.name || f.path));
  const references = [];
  for (const f of refFiles.slice(0, 4)) {
    const buffer = await download(db, f);
    if (buffer) references.push({ name: f.name, preview: await preview(buffer, 768) });
  }
  const refLinks = [...(entry?.refs || []), ...(card?.attachments || [])].filter((r) => r?.type === "link" && r.url).map((r) => r.url);

  // tudo o que está anexado no post e na peça para entrar na arte (menos artes antigas e referências)
  const attached = unique([...uploads(entry?.photos), ...uploads(card?.attachments).filter((f) => !f.ref)]);

  // logo e assinatura: somente da seção "Logo e assinatura" do perfil do cliente
  // (nunca um anexo da peça, para não confundir prints, tabelas ou fotos com a logo)
  let logo = null;
  let signature = null;
  const kit = brandKit(client).filter((f) => LOGO.test(f.name || f.path));
  for (const f of kit.filter((f) => f.kind !== "perfil")) {
    const buffer = await download(db, f);
    if (buffer) logo = await logoFrom(buffer).catch(() => null);
    if (logo) break;
  }
  for (const f of kit.filter((f) => f.kind === "perfil")) {
    const buffer = await download(db, f);
    const avatar = buffer && (await avatarFrom(buffer).catch(() => null));
    if (avatar) {
      const usuario = String(f.usuario || "").trim().replace(/^@/, "");
      signature = { src: avatar, nome: String(f.nome || client.name || "").trim(), usuario: usuario ? "@" + usuario : "", linha: String(f.linha || "").trim() };
      break;
    }
  }

  // fotos: as imagens anexadas que não são a logo (até 10)
  const photos = [];
  for (const f of attached.filter((f) => IMAGE.test(f.name || f.path) && !isLogoName(f)).slice(0, 10)) {
    const buffer = await download(db, f);
    if (!buffer) continue;
    const ok = await sharp(buffer).metadata().catch(() => null);
    if (ok) photos.push({ name: f.name, buffer, preview: await preview(buffer) });
  }

  // posts de exemplo do cliente (até 3), como referência de estilo
  const examples = [];
  for (const f of uploads(materialsOf(client, "exemplos")).filter((f) => IMAGE.test(f.name || f.path)).slice(0, 3)) {
    const buffer = await download(db, f);
    if (buffer) examples.push({ name: f.name, preview: await preview(buffer, 512) });
  }

  return { photos, logo, signature, examples, references, refLinks: [...new Set(refLinks)].slice(0, 8) };
}
