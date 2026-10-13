import sharp from "sharp";
import { ContentAgentError } from "../contentAgent";
import { photoBox, renderArt, sizeFor } from "../artRender";
import { downloadStock, findStockCandidates, stockEnabled } from "../stockPhotos";
import { brandKit, materialsOf } from "../profileFields";
import { createCardFromEntry } from "../production";
import { ART_FORMATS } from "../pipeline";
import { removeTextFromPhoto } from "../photoClean";
import { enhancePhotoAI, generatePhoto, imageGenEnabled, removeTextAI } from "../openaiImages";
import { enhanceLocal } from "../photoEnhance";
import * as AGENTS from "./agents.js";
import { buildImagePrompt } from "./visualPrompt.js";
import { runChecks } from "./checks.js";
import { decide } from "./critic.js";
import { applyRefinement } from "./refiner.js";
import { PHOTO_LAYOUTS } from "./plan.js";

// Produção de artes com direção de arte, em etapas que ficam gravadas na rodada (tabela art_runs):
//   planejando  → Estrategista de briefing (especificação) + Diretor de arte e Arquiteto de layout (plano)
//   montando    → tratamento das fotos, banco de imagens, imagens geradas (Especialista em geração visual),
//                 desenho das páginas e verificações objetivas
//   avaliando   → Crítico visual olha as imagens desenhadas (cada página e o conjunto) e dá as notas
//   refinando   → Refinador corrige só o que foi apontado, redesenha as páginas alteradas e volta a avaliar
//   aprovada | revisao_humana | erro (fim)
// Cada chamada avança o quanto couber no tempo (as funções da Vercel têm limite); quem chama repete
// "continuar" até o fim. As versões ficam guardadas; a arte atual vai para a peça e o post a cada versão.

const STAGE_ESTIMATE_MS = { planejando: 140000, montando: 130000, avaliando: 90000, refinando: 150000 };
export const FINAL = ["aprovada", "revisao_humana", "erro"];
export const STAGE_LABEL = {
  planejando: "Estrategista e diretor de arte planejando",
  montando: "Montando as páginas",
  avaliando: "Crítico visual avaliando",
  refinando: "Refinador corrigindo",
  aprovada: "Aprovada na avaliação",
  revisao_humana: "Precisa de revisão da equipe",
  erro: "Erro"
};

const IMAGE = /\.(png|jpe?g|webp|gif)$/i;
const LOGO = /\.(png|jpe?g|webp|svg)$/i;
const isLogoName = (f) => /logo|marca|brand/i.test(f.name || f.path || "");

export class ArtRunError extends Error {}

// ---------- começar e continuar ----------

// Abre uma rodada nova para um post (entry_id) ou peça (card_id). Devolve a rodada já avançada.
// deps: os agentes (trocáveis nos testes)
export async function startArtRun(db, { client_id, entry_id, card_id, mode, guidance, enhance, userId }, budgetMs, deps = AGENTS) {
  const startedAt = Date.now();
  const { data: client } = await db.from("clients").select("*").eq("id", client_id || "").maybeSingle();
  if (!client) throw new ArtRunError("Cliente não encontrado.");
  let { entry, card } = await loadPost(db, { entry_id, card_id });
  if ((!entry && !card) || (entry && entry.client_id !== client.id) || (card && card.client_id !== client.id)) throw new ArtRunError("Post não encontrado.");
  const format = entry?.format || card?.format;
  if (!ART_FORMATS.includes(format)) throw new ArtRunError("A arte automática é para Estático, Carrossel e Story. Reels e vídeos são editados pela equipe.");
  const theme = (entry?.theme || card?.title || "").trim();
  if (!theme) throw new ArtRunError("Escreva o tema (ou o nome da peça) antes de criar a arte.");
  // a arte vai para a peça: se o post ainda não virou peça, cria agora
  if (!card) card = await createCardFromEntry(db, client, { ...entry, art: [] });

  const config = client.art_config || {};
  const { data: run, error } = await db
    .from("art_runs")
    .insert({
      client_id: client.id,
      card_id: card.id,
      entry_id: entry?.id || null,
      created_by: userId || null,
      status: "planejando",
      max_ciclos: Math.max(1, Math.min(3, Number(config.ciclos) || 3)),
      mode: ["material", "gerar"].includes(mode) ? mode : "ia",
      format,
      theme,
      guidance: String(guidance || "").slice(0, 2000),
      enhance: !!enhance
    })
    .select("*")
    .maybeSingle();
  if (error || !run) {
    console.error("arte: não consegui abrir a rodada", error);
    throw new ArtRunError(/art_runs|relation/i.test(error?.message || "") ? "Falta rodar o SQL 017_direcao_de_arte.sql no Supabase." : "Não consegui começar a arte agora.");
  }
  return advance(db, run, budgetMs - (Date.now() - startedAt), deps);
}

export async function continueArtRun(db, runId, budgetMs, deps = AGENTS) {
  const { data: run } = await db.from("art_runs").select("*").eq("id", runId || "").maybeSingle();
  if (!run) throw new ArtRunError("Rodada de arte não encontrada.");
  if (FINAL.includes(run.status)) return run;
  return advance(db, run, budgetMs, deps);
}

// Registro da equipe: aprovada ou reprovada (com motivo). Alimenta o aprendizado do cliente.
export async function teamFeedback(db, runId, { aprovado, motivo }) {
  const { data: run } = await db.from("art_runs").select("id, card_id, log").eq("id", runId || "").maybeSingle();
  if (!run) throw new ArtRunError("Rodada de arte não encontrada.");
  const team_status = aprovado ? "aprovada" : "reprovada";
  const team_feedback = String(motivo || "").trim().slice(0, 1000);
  if (!aprovado && !team_feedback) throw new ArtRunError("Diga o motivo da reprovação: ele ensina as próximas artes.");
  await db
    .from("art_runs")
    .update({ team_status, team_feedback, updated_at: new Date().toISOString(), log: [...(run.log || []), entryLog("equipe", aprovado ? "Arte aprovada pela equipe." : "Arte reprovada pela equipe: " + team_feedback)] })
    .eq("id", run.id);
  if (run.card_id) await internalNote(db, run.card_id, aprovado ? "Arte aprovada pela equipe. Ela passa a servir de referência para as próximas artes deste cliente." : `Arte reprovada pela equipe. Motivo: ${team_feedback}\nO motivo fica registrado e as próximas artes deste cliente vão evitar esse erro.`);
  return { ok: true, team_status };
}

// ---------- motor de etapas ----------

async function advance(db, run, budgetMs, deps) {
  const deadline = Date.now() + Math.max(30000, budgetMs);
  let state = run;
  let ctx = null;
  try {
    while (!FINAL.includes(state.status)) {
      const left = deadline - Date.now();
      // sempre faz pelo menos uma etapa por chamada; as seguintes só se couberem
      if (ctx && left < STAGE_ESTIMATE_MS[state.status]) break;
      ctx = ctx || { ...(await loadContext(db, state)), deps };
      state = await runStage(db, state, ctx);
    }
  } catch (err) {
    console.error("arte:", state.status, err);
    // erro inesperado: mostra a etapa e o detalhe técnico (sem dados sensíveis) para a equipe saber o que houve
    const detail = String(err?.message || err?.error || err || "").replace(/(sk|key|token|secret)[-_a-z0-9]*[:=]?s*[A-Za-z0-9._-]{12,}/gi, "[oculto]").slice(0, 220);
    const message =
      err instanceof ContentAgentError || err instanceof ArtRunError
        ? err.message
        : `Falha inesperada na etapa "${STAGE_LABEL[state.status] || state.status}"${detail ? `: ${detail}` : "."}`;
    state = await save(db, state, { status: "erro", alerts: [...(state.alerts || []), message], log: [...(state.log || []), entryLog(state.status, "Erro: " + message)] });
    if (state.card_id) await internalNote(db, state.card_id, `Não consegui terminar a arte: ${message}`);
  }
  return state;
}

async function runStage(db, run, ctx) {
  if (run.status === "planejando") return stagePlan(db, run, ctx);
  if (run.status === "montando") return stageBuild(db, run, ctx);
  if (run.status === "avaliando") return stageCritic(db, run, ctx);
  if (run.status === "refinando") return stageRefine(db, run, ctx);
  throw new ArtRunError("Etapa desconhecida: " + run.status);
}

// Tudo o que as etapas precisam: cliente, post, peça, material, aprendizado e permissões
async function loadContext(db, run) {
  const { data: client } = await db.from("clients").select("*").eq("id", run.client_id).maybeSingle();
  if (!client) throw new ArtRunError("Cliente não encontrado.");
  const { entry, card } = await loadPost(db, { entry_id: run.entry_id, card_id: run.card_id });
  const post = await postInfo(db, entry, card, run.format);
  const config = client.art_config || {};
  const assets = await loadAssets(db, client, entry, card, run.sources || []);
  const genAllowed = run.mode === "gerar" && imageGenEnabled();
  const stockAllowed = (run.mode === "ia" || (run.mode === "gerar" && !genAllowed)) && stockEnabled();
  const brand = brandMode(config, assets);
  const learning = await loadLearning(db, client.id, run.id);
  return { client, entry, card, post, config, assets, genAllowed, stockAllowed, brand, learning, size: sizeFor(run.format) };
}

// ETAPA 1: especificação + direção + plano
async function stagePlan(db, run, ctx) {
  const { client, post, config, assets } = ctx;
  const alerts = [...(run.alerts || [])];
  if (!assets.logo && !assets.signature) alerts.push('O cliente não tem logo: envie no perfil do cliente, seção "Logo e assinatura das artes".');
  if (run.mode === "gerar" && !ctx.genAllowed) alerts.push("O gerador de imagens ainda não está configurado (falta OPENAI_API_KEY na Vercel).");
  if (!assets.photos.length && !ctx.stockAllowed && !ctx.genAllowed) alerts.push("Sem foto disponível: as páginas saem só com texto, cores e elementos gráficos.");

  const spec = await ctx.deps.runSpec({ client, post, config, guidance: run.guidance });
  if (spec.conflitos.length) alerts.push(...spec.conflitos.map((c) => "Conflito no briefing: " + c));
  const plan = await ctx.deps.runPlan({ client, post, spec, assets, learning: ctx.learning, config, mode: run.mode, guidance: run.guidance, stockAllowed: ctx.stockAllowed, genAllowed: ctx.genAllowed });
  alerts.push(...plan.alertas);
  console.log("arte: plano", { cliente: client.name, paginas: plan.paginas.length, layouts: plan.paginas.map((p) => p.layout).join(",") });
  return save(db, run, {
    status: "montando",
    spec,
    plan,
    sources: assets.photos.map((p) => ({ path: p.path, name: p.name, origem: p.origem })),
    alerts: dedupe(alerts),
    log: [
      ...(run.log || []),
      entryLog("estrategista", `Especificação: ${spec.quantidade_paginas} página(s), ${spec.textos_obrigatorios.length} texto(s) obrigatório(s), ${spec.conflitos.length} conflito(s).`),
      entryLog("diretor_de_arte", plan.direcao.conceito || plan.resumo),
      entryLog("arquiteto_de_layout", "Layouts: " + plan.paginas.map((p, i) => `${i + 1} ${p.layout}`).join(", "))
    ]
  });
}

// ETAPA 2: fotos (limpeza, melhoria, banco, geração), desenho, verificações e primeira versão
async function stageBuild(db, run, ctx) {
  const { client, post, assets, size, card } = ctx;
  let plan = run.plan;
  const alerts = [...(run.alerts || [])];
  const pool = assets.photos;
  const changedPool = new Set();

  // textos que já vinham escritos nas fotos: saem antes de entrar na arte
  for (const t of plan.textos_nas_fotos || []) {
    const photo = pool[t.foto];
    if (!photo) continue;
    try {
      if (imageGenEnabled()) {
        try {
          photo.buffer = await removeTextAI(photo.buffer, t.regioes);
          changedPool.add(t.foto);
          alerts.push(`Foto "${photo.name}": textos que já estavam escritos foram removidos e o fundo refeito. Confira se ficou natural.`);
          continue;
        } catch (err) {
          console.error("arte: remoção de texto pela OpenAI falhou", err?.message);
        }
      }
      const cleaned = await removeTextFromPhoto(photo.buffer, t.regioes);
      photo.buffer = cleaned.buffer;
      changedPool.add(t.foto);
      alerts.push(`Foto "${photo.name}": textos que já estavam escritos foram apagados. Confira se ficou natural.`);
    } catch (err) {
      console.error("arte: limpeza da foto falhou", err?.message);
    }
  }

  // "Melhorar as fotos": ajuste leve em todas as usadas; as fracas (até 2) passam pela OpenAI
  if (run.enhance) {
    const used = [...new Set(plan.paginas.map((p) => p.foto).filter((i) => i >= 0 && pool[i]))];
    const weak = new Map((plan.fotos_fracas || []).map((f) => [f.foto, f.problema]));
    const viaAI = imageGenEnabled() ? used.filter((i) => weak.has(i)).slice(0, 2) : [];
    await Promise.all(
      used.map(async (i) => {
        const photo = pool[i];
        if (viaAI.includes(i)) {
          try {
            photo.buffer = await enhancePhotoAI(photo.buffer, weak.get(i));
            changedPool.add(i);
            alerts.push(`Foto "${photo.name}" estava fraca e foi tratada (luz, cor e nitidez). Confira se ficou igual ao original.`);
            return;
          } catch (err) {
            console.error("arte: melhoria pela OpenAI falhou", err?.message);
          }
        }
        try {
          photo.buffer = await enhanceLocal(photo.buffer);
          changedPool.add(i);
        } catch (err) {
          console.error("arte: ajuste leve falhou", err?.message);
        }
      })
    );
  }

  // fotos novas (banco e geradas) entram no acervo da rodada
  plan = await fillPhotos(db, { run, ctx, plan, alerts, pages: plan.paginas.map((_, i) => i) });

  // fotos tratadas viram arquivos da rodada (as originais continuam anexadas)
  for (const i of changedPool) await storeSource(db, run, card, pool, i);

  const result = await renderVersion(db, { run, ctx, plan, only: null, previous: null });
  return save(db, run, {
    status: "avaliando",
    plan,
    sources: pool.map((p) => ({ path: p.path, name: p.name, origem: p.origem })),
    checks: result.checks,
    versions: [...(run.versions || []), result.version],
    alerts: dedupe(alerts),
    log: [...(run.log || []), entryLog("designer", `Versão 1 desenhada (${result.version.paths.length} página(s)).`), checksLog(result.checks)]
  });
}

// ETAPA 3: crítica das imagens desenhadas e decisão
async function stageCritic(db, run, ctx) {
  const { client, post, assets } = ctx;
  const version = run.versions[run.versions.length - 1];
  const pngs = await Promise.all(version.paths.map((p) => download(db, { path: p })));
  if (pngs.some((b) => !b)) throw new ArtRunError("Não consegui abrir as imagens da última versão para avaliar.");
  const pages = await Promise.all(pngs.map((b) => preview(b, 768)));
  const sheet = version.montagem ? await download(db, { path: version.montagem }).then((b) => (b ? preview(b, 1400) : null)) : null;
  const critique = await ctx.deps.runCritic({ client, post, spec: run.spec, plan: run.plan, pages, sheet, assets, learning: ctx.learning, config: ctx.config });
  if (!critique) {
    const failures = (run.log || []).filter((l) => l.etapa === "critico" && /indisponível/.test(l.texto)).length;
    if (failures >= 1) return finish(db, run, ctx, "revisao_humana", ["A avaliação automática ficou indisponível. Revise a arte antes de usar."]);
    return save(db, run, { log: [...(run.log || []), entryLog("critico", "Avaliação indisponível agora; tentando de novo.")] });
  }
  const decision = decide(critique, run.checks);
  const versions = [...run.versions];
  versions[versions.length - 1] = { ...version, media: decision.media, aprovada: decision.aprovada, notas: critique.paginas.map((p) => ({ pagina: p.pagina, media: p.media, notas: p.notas })), motivos: decision.motivos.slice(0, 20) };
  const log = [...(run.log || []), entryLog("critico", `Ciclo ${run.ciclo}: média ${decision.media}. ${decision.aprovada ? "Aprovada." : `${decision.paginas_para_revisar.length} página(s) para revisar.`} ${critique.resumo}`)];
  const patch = { critique: { ...critique, decisao: decision }, versions, log };
  if (decision.aprovada) return finish(db, { ...run, ...patch }, ctx, "aprovada", []);
  if (run.ciclo >= run.max_ciclos) {
    return finish(db, { ...run, ...patch }, ctx, "revisao_humana", [`Depois de ${run.ciclo} ciclo(s) de refinamento a arte ainda tem pontos a melhorar: ${decision.motivos.slice(0, 4).join(" ")}`]);
  }
  return save(db, run, { ...patch, status: "refinando" });
}

// ETAPA 4: refinamento e nova versão
async function stageRefine(db, run, ctx) {
  const { client, post, assets } = ctx;
  const version = run.versions[run.versions.length - 1];
  const decision = run.critique?.decisao || { paginas_para_revisar: [], motivos: [] };
  const pngs = await Promise.all(version.paths.map((p) => download(db, { path: p })));
  const pages = await Promise.all(pngs.map((b) => (b ? preview(b, 640) : null)));
  await Promise.all(assets.photos.map(async (p) => (p.thumb = p.thumb || (await preview(p.buffer, 384)))));
  const raw = await ctx.deps.runRefiner({ client, post, spec: run.spec, plan: run.plan, critique: run.critique, decision, checks: run.checks, pages, assets, stockAllowed: ctx.stockAllowed, genAllowed: ctx.genAllowed, config: ctx.config });
  const alerts = [...(run.alerts || [])];
  let { plan, changed, log } = applyRefinement(run.plan, raw, { photoCount: assets.photos.length, stockAllowed: ctx.stockAllowed, genAllowed: ctx.genAllowed });
  // mudanças de ritmo pedidas pelo conjunto podem não citar páginas: sem alteração, não há o que redesenhar
  if (!changed.length) {
    return finish(db, run, ctx, "revisao_humana", ["O refinador não encontrou uma correção automática para os pontos apontados. Revise a arte."]);
  }
  plan = await fillPhotos(db, { run, ctx, plan, alerts, pages: changed });
  const result = await renderVersion(db, { run, ctx, plan, only: changed, previous: version });
  const ciclo = run.ciclo + 1;
  return save(db, run, {
    status: "avaliando",
    ciclo,
    plan,
    sources: assets.photos.map((p) => ({ path: p.path, name: p.name, origem: p.origem })),
    checks: result.checks,
    versions: [...run.versions, result.version],
    alerts: dedupe(alerts),
    log: [...(run.log || []), entryLog("refinador", `Ciclo ${ciclo}: ${log.join(" ")}`), checksLog(result.checks)]
  });
}

// fim: registra a decisão e deixa a observação interna na peça
async function finish(db, run, ctx, status, extraAlerts) {
  const alerts = dedupe([...(run.alerts || []), ...extraAlerts]);
  const final = await save(db, run, { status, alerts, log: [...(run.log || []), entryLog("validacao", STAGE_LABEL[status])] });
  const last = final.versions[final.versions.length - 1] || {};
  const note = [
    `Arte criada com direção de arte (${last.paths?.length || 0} ${last.paths?.length === 1 ? "imagem" : "imagens"}, ${final.ciclo} ciclo(s) de refinamento).`,
    status === "aprovada" ? `Aprovada na avaliação visual (média ${last.media ?? "-"}). A aprovação final é da equipe: use "Aprovar" ou "Reprovar" na arte.` : "Precisa de revisão da equipe antes de seguir.",
    final.plan?.direcao?.conceito ? "Conceito: " + final.plan.direcao.conceito : final.plan?.resumo || "",
    `Material lido: ${ctx.assets.photos.filter((p) => p.origem === "anexada").length} foto(s) do cliente${ctx.assets.logo ? ", logo" : ""}${ctx.assets.signature ? ", assinatura" : ""}${ctx.assets.references.length ? `, ${ctx.assets.references.length} referência(s)` : ""}${ctx.learning.aprovadas.length + ctx.learning.reprovadas.length ? `, ${ctx.learning.aprovadas.length + ctx.learning.reprovadas.length} arte(s) avaliada(s) pela equipe` : ""}.`,
    alerts.length ? "Atenção:\n" + alerts.map((a) => "- " + a).join("\n") : ""
  ]
    .filter(Boolean)
    .join("\n\n");
  if (final.card_id) await internalNote(db, final.card_id, note);
  return final;
}

// ---------- fotos ----------

// Busca no banco e gera as imagens que as páginas pedirem (só nas páginas indicadas)
async function fillPhotos(db, { run, ctx, plan, alerts, pages }) {
  const { client, post, size, assets, card } = ctx;
  const pool = assets.photos;
  const paginas = plan.paginas.map((p) => ({ ...p }));

  // banco de imagens: opções para cada página e o diretor de arte escolhe
  const stockPages = pages.map((i) => ({ ...paginas[i], index: i })).filter((p) => p.foto < 0 && p.busca_foto && ctx.stockAllowed && needsPhoto(p));
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
    const picks = await ctx.deps.chooseStockPhotos({ client, post, pages: options.filter((o) => o.candidates.length) });
    for (const o of options) {
      const pick = o.candidates[picks[o.page.index] ?? -1] || null;
      if (!pick || used.has(pick.id)) continue;
      const buffer = await downloadStock(pick);
      if (!buffer) continue;
      used.add(pick.id);
      pool.push({ name: `banco de imagens (página ${o.page.index + 1})`, buffer, origem: "banco", preview: await preview(buffer) });
      await storeSource(db, run, card, pool, pool.length - 1);
      paginas[o.page.index].foto = pool.length - 1;
      alerts.push(`Página ${o.page.index + 1}: foto de banco de imagens. Confira antes de publicar.`);
    }
  }

  // imagens geradas (OpenAI), com o pedido montado pelo especialista em geração visual
  if (ctx.genAllowed) {
    const toGenerate = pages.map((i) => ({ ...paginas[i], index: i })).filter((p) => p.foto < 0 && p.imagem_gerada && needsPhoto(p)).slice(0, 3);
    const results = await Promise.all(
      toGenerate.map((p) => {
        const box = photoBox(p, size);
        const prompt = buildImagePrompt(p, box, { paleta: plan.paleta, tratamento_foto: plan.direcao?.tratamento_foto, estilo_foto: ctx.config.estilo_foto, evitar: ctx.config.evitar });
        return generatePhoto(prompt, box, { exact: true })
          .then((buffer) => ({ p, buffer, prompt }))
          .catch((err) => ({ p, error: err?.message || "erro" }));
      })
    );
    for (const r of results) {
      if (r.buffer) {
        pool.push({ name: `imagem gerada (página ${r.p.index + 1})`, buffer: r.buffer, origem: "gerada", preview: await preview(r.buffer) });
        await storeSource(db, run, card, pool, pool.length - 1);
        paginas[r.p.index].foto = pool.length - 1;
        paginas[r.p.index].imagem_gerada = null;
        alerts.push(`Página ${r.p.index + 1}: imagem gerada para a arte. Confira antes de publicar.`);
      } else alerts.push(`Página ${r.p.index + 1}: não consegui gerar a imagem (${r.error}).`);
    }
  }
  return { ...plan, paginas };
}

const needsPhoto = (p) => PHOTO_LAYOUTS.includes(p.layout) || p.layout === "checklist";

// recorte da foto no espaço do layout, com escala e foco escolhidos pelo arquiteto
export async function cropPhoto(buffer, box, page = {}) {
  const escala = Math.max(1, Math.min(1.8, Number(page.foto_escala) || 1));
  const foco = page.foto_foco || "rosto";
  const fixed = { topo: "north", base: "south", esquerda: "west", direita: "east", centro: "centre" };
  if (escala === 1) {
    const out = await sharp(buffer)
      .rotate()
      .resize({ width: box.width, height: box.height, fit: "cover", position: fixed[foco] || sharp.strategy.attention })
      .jpeg({ quality: 88 })
      .toBuffer();
    return "data:image/jpeg;base64," + out.toString("base64");
  }
  // ampliada: cobre um quadro maior e recorta em volta do ponto de interesse
  const W = Math.round(box.width * escala);
  const H = Math.round(box.height * escala);
  const big = await sharp(buffer).rotate().resize({ width: W, height: H, fit: "cover", position: fixed[foco] || sharp.strategy.attention }).toBuffer();
  let fx = 0.5;
  let fy = foco === "topo" ? 0 : foco === "base" ? 1 : 0.4;
  if (foco === "esquerda") fx = 0;
  if (foco === "direita") fx = 1;
  if (foco === "rosto") {
    const { info } = await sharp(big).resize({ width: 64, height: 64, fit: "cover", position: sharp.strategy.attention }).toBuffer({ resolveWithObject: true });
    const scaled = W >= H ? { w: Math.round((64 * W) / H), h: 64 } : { w: 64, h: Math.round((64 * H) / W) };
    if (Number.isFinite(info.attentionX)) fx = info.attentionX / scaled.w;
    // o rosto fica um pouco acima do centro (respiro para o queixo e as mãos)
    if (Number.isFinite(info.attentionY)) fy = Math.max(0, info.attentionY / scaled.h - 0.08);
  }
  const left = Math.round(Math.max(0, Math.min(W - box.width, fx * W - box.width / 2)));
  const top = Math.round(Math.max(0, Math.min(H - box.height, fy * H - box.height / 2)));
  const out = await sharp(big).extract({ left, top, width: box.width, height: box.height }).jpeg({ quality: 88 }).toBuffer();
  return "data:image/jpeg;base64," + out.toString("base64");
}

// ---------- desenho, verificações e versão ----------

async function renderVersion(db, { run, ctx, plan, only, previous }) {
  const { size, assets, card, client } = ctx;
  const photos = [];
  for (let i = 0; i < plan.paginas.length; i++) {
    const page = plan.paginas[i];
    const box = photoBox(page, size);
    const src = box && page.foto >= 0 ? assets.photos[page.foto]?.buffer : null;
    photos.push(src && (!only || only.includes(i)) ? await cropPhoto(src, box, page) : null);
  }
  const fresh = await renderArt({ plan, format: run.format, photos, logo: assets.logo, signature: assets.signature, brand: ctx.brand, only });
  // páginas não redesenhadas reaproveitam a imagem da versão anterior
  const pngs = await Promise.all(fresh.map(async (b, i) => b || (previous?.paths?.[i] ? await download(db, { path: previous.paths[i] }) : null)));
  const rendered = await Promise.all(pngs.map(async (b) => (b ? { ...(await sharp(b).metadata().then((m) => ({ width: m.width, height: m.height }))), bytes: b.length } : null)));
  const checks = runChecks({
    plan,
    spec: run.spec,
    format: run.format,
    rendered,
    expected: size,
    photoCount: assets.photos.filter((p) => p.origem === "anexada").length,
    signatureText: brandText(ctx),
    clientColors: ctx.config.cores || ""
  });

  // arquivos: cliente_projeto_slide_01.png … (+ montagem para revisão)
  const n = (run.versions || []).length + 1;
  const base = `${card.id}/arte-${run.id.slice(0, 8)}/v${n}`;
  const stem = `${slug(client.name)}_${slug(run.theme).slice(0, 40)}`;
  const paths = [];
  for (let i = 0; i < pngs.length; i++) {
    if (!fresh[i] && previous?.paths?.[i]) {
      paths.push(previous.paths[i]);
      continue;
    }
    const path = `${base}/${stem}_slide_${String(i + 1).padStart(2, "0")}.png`;
    const { error } = await db.storage.from("anexos").upload(path, pngs[i], { contentType: "image/png", upsert: true });
    if (error) throw error;
    paths.push(path);
  }
  let montagem = null;
  if (pngs.length > 1) {
    const sheet = await contactSheet(pngs, size);
    montagem = `${base}/${stem}_montagem.png`;
    await db.storage.from("anexos").upload(montagem, sheet, { contentType: "image/png", upsert: true });
  }
  const version = { n, ciclo: run.ciclo + (previous ? 1 : 0), at: new Date().toISOString(), paths, montagem, alteradas: only ? only.map((i) => i + 1) : null };
  await attachArt(db, ctx, run, paths, stem);
  return { version, checks };
}

// montagem com todas as páginas lado a lado (para o crítico avaliar o conjunto e a equipe revisar)
export async function contactSheet(pngs, size) {
  const w = 360;
  const h = Math.round((w * size.height) / size.width);
  const cols = Math.min(4, pngs.length);
  const rows = Math.ceil(pngs.length / cols);
  const gap = 16;
  const thumbs = await Promise.all(pngs.map((b) => sharp(b).resize(w, h).png().toBuffer()));
  return sharp({ create: { width: cols * (w + gap) + gap, height: rows * (h + gap) + gap, channels: 3, background: "#E9E7E4" } })
    .composite(thumbs.map((t, i) => ({ input: t, left: gap + (i % cols) * (w + gap), top: gap + Math.floor(i / cols) * (h + gap) })))
    .png()
    .toBuffer();
}

// a versão atual vira a arte do post e da peça (as versões anteriores ficam na rodada)
async function attachArt(db, ctx, run, paths, stem) {
  const at = new Date().toISOString();
  const art = paths.map((path, i) => ({
    type: "upload",
    path,
    name: paths.length > 1 ? `${stem}_slide_${String(i + 1).padStart(2, "0")}.png` : `${stem}.png`,
    art: true,
    run: run.id,
    created_at: at
  }));
  const { data: fresh } = await db.from("cards").select("attachments").eq("id", ctx.card.id).maybeSingle();
  const current = fresh?.attachments || ctx.card.attachments || [];
  await Promise.all([
    run.entry_id ? db.from("calendar_entries").update({ art }).eq("id", run.entry_id) : null,
    db.from("cards").update({ attachments: [...art, ...current.filter((a) => !a?.art)] }).eq("id", ctx.card.id)
  ]);
}

// ---------- dados ----------

async function loadPost(db, { entry_id, card_id }) {
  let entry = null;
  let card = null;
  if (entry_id) {
    ({ data: entry } = await db.from("calendar_entries").select("*").eq("id", entry_id).maybeSingle());
    if (entry?.card_id) ({ data: card } = await db.from("cards").select("*").eq("id", entry.card_id).maybeSingle());
  }
  if (!card && card_id) ({ data: card } = await db.from("cards").select("*").eq("id", card_id).maybeSingle());
  if (card && !entry) ({ data: entry } = await db.from("calendar_entries").select("*").eq("card_id", card.id).maybeSingle());
  return { entry, card };
}

// Junta o que o post do calendário e a peça da Linha de produção dizem sobre a arte
async function postInfo(db, entry, card, format) {
  const brief = entry?.brief || {};
  let comments = [];
  if (card) {
    const { data } = await db.from("card_comments").select("body, created_at").eq("card_id", card.id).order("created_at", { ascending: false }).limit(8);
    comments = (data || []).map((c) => c.body).filter((b) => b && !/^(Arte criada|Não consegui terminar a arte|Arte (aprovada|reprovada) pela equipe)/.test(b));
  }
  return {
    id: entry?.id || card?.id,
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

// Material da arte. sources: acervo já gravado na rodada (fotos tratadas, de banco e geradas)
async function loadAssets(db, client, entry, card, sources = []) {
  const uploads = (list) => (list || []).filter((f) => f?.type === "upload" && f.path && !f.art);
  const seen = new Set();
  const unique = (list) => list.filter((f) => (seen.has(f.path) ? false : seen.add(f.path)));

  const refFiles = unique([...uploads(entry?.refs), ...uploads(card?.attachments).filter((f) => f.ref)]).filter((f) => IMAGE.test(f.name || f.path));
  const references = [];
  for (const f of refFiles.slice(0, 4)) {
    const buffer = await download(db, f);
    if (buffer) references.push({ name: f.name, preview: await preview(buffer, 768) });
  }
  const refLinks = [...(entry?.refs || []), ...(card?.attachments || [])].filter((r) => r?.type === "link" && r.url).map((r) => r.url);

  // logo e assinatura: somente da seção "Logo e assinatura" do perfil do cliente
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

  // acervo de fotos: o da rodada (se já existe) ou as imagens anexadas ao post e à peça (até 10)
  const photos = [];
  const list = sources.length
    ? sources
    : unique([...uploads(entry?.photos), ...uploads(card?.attachments).filter((f) => !f.ref)])
        .filter((f) => IMAGE.test(f.name || f.path) && !isLogoName(f))
        .slice(0, 10)
        .map((f) => ({ path: f.path, name: f.name, origem: "anexada" }));
  for (const f of list) {
    const buffer = await download(db, f);
    if (!buffer) continue;
    const ok = await sharp(buffer).metadata().catch(() => null);
    if (ok) photos.push({ path: f.path, name: f.name, origem: f.origem || "anexada", buffer, preview: await preview(buffer) });
  }

  const examples = [];
  for (const f of uploads(materialsOf(client, "exemplos")).filter((f) => IMAGE.test(f.name || f.path)).slice(0, 3)) {
    const buffer = await download(db, f);
    if (buffer) examples.push({ name: f.name, preview: await preview(buffer, 512) });
  }
  return { photos, logo, signature, examples, references, refLinks: [...new Set(refLinks)].slice(0, 8) };
}

// Aprendizado do cliente: artes aprovadas e reprovadas pela equipe e correções que se repetem
async function loadLearning(db, clientId, currentRunId) {
  const empty = { aprovadas: [], reprovadas: [], recorrentes: [] };
  const { data, error } = await db
    .from("art_runs")
    .select("id, theme, team_status, team_feedback, versions")
    .eq("client_id", clientId)
    .neq("id", currentRunId)
    .order("created_at", { ascending: false })
    .limit(30);
  if (error || !data) return empty;
  const firstPage = async (r) => {
    const v = (r.versions || [])[r.versions.length - 1];
    const b = v?.paths?.[0] ? await download(db, { path: v.paths[0] }) : null;
    return b ? preview(b, 384) : null;
  };
  const aprovadas = [];
  for (const r of data.filter((r) => r.team_status === "aprovada").slice(0, 3)) {
    const p = await firstPage(r);
    if (p) aprovadas.push({ tema: r.theme, preview: p });
  }
  const reprovadas = [];
  for (const r of data.filter((r) => r.team_status === "reprovada").slice(0, 3)) {
    const p = await firstPage(r);
    if (p) reprovadas.push({ tema: r.theme, motivo: r.team_feedback || "", preview: p });
  }
  const recorrentes = dedupe(
    data
      .slice(0, 8)
      .flatMap((r) => (r.versions || []).flatMap((v) => v.motivos || []))
      .filter((m) => !/Verificação automática/.test(m))
      .map((m) => m.replace(/^Página \d+(, erro crítico)?:\s*/, ""))
  ).slice(0, 6);
  return { aprovadas, reprovadas, recorrentes };
}

// ---------- utilidades ----------

function brandMode(config, assets) {
  const want = config.marca || "auto";
  if (want === "logo" && assets.logo) return "logo";
  if ((want === "assinatura_rodape" || want === "nome_topo") && assets.signature) return want;
  return assets.signature ? "assinatura_rodape" : assets.logo ? "logo" : "nenhuma";
}

function brandText(ctx) {
  const s = ctx.assets.signature;
  if (!s) return [];
  if (ctx.brand === "nome_topo") return [s.nome, s.linha];
  if (ctx.brand === "assinatura_rodape") return [s.nome, s.usuario, s.linha];
  return [];
}

async function storeSource(db, run, card, pool, i) {
  const photo = pool[i];
  const path = `${card.id}/arte-${run.id.slice(0, 8)}/fontes/foto-${i + 1}-${Date.now()}.jpg`;
  const jpg = await sharp(photo.buffer).rotate().jpeg({ quality: 92 }).toBuffer();
  const { error } = await db.storage.from("anexos").upload(path, jpg, { contentType: "image/jpeg", upsert: true });
  if (error) throw error;
  photo.buffer = jpg;
  photo.path = path;
}

async function save(db, run, patch) {
  const next = { ...run, ...patch, updated_at: new Date().toISOString() };
  const { error } = await db.from("art_runs").update({ ...patch, updated_at: next.updated_at }).eq("id", run.id);
  if (error) {
    console.error("arte: não consegui gravar a rodada", error);
    throw new ArtRunError("Não consegui gravar o andamento da arte.");
  }
  return next;
}

async function internalNote(db, cardId, body) {
  const { data: comment } = await db.from("card_comments").insert({ card_id: cardId, body, internal: true }).select("id").maybeSingle();
  if (comment) await db.from("card_comments").update({ author_name: "Equipe Up!", author_role: "funcionario" }).eq("id", comment.id);
}

const entryLog = (etapa, texto) => ({ etapa, texto: String(texto || "").slice(0, 2000), at: new Date().toISOString() });
const checksLog = (c) =>
  entryLog("verificacao", c.ok ? "Verificações automáticas: tudo certo." : `Verificações automáticas: ${c.criticos.length} erro(s) crítico(s), ${c.problemas.length} problema(s).`);
const dedupe = (list) => [...new Set(list.filter(Boolean))];
const slug = (s) =>
  String(s || "arte")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "arte";

async function download(db, file) {
  const { data, error } = await db.storage.from("anexos").download(file.path);
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}

// imagem pequena em JPEG (base64) só para os agentes enxergarem
async function preview(buffer, max = 640) {
  const out = await sharp(buffer, { density: 200 }).rotate().flatten({ background: "#ffffff" }).resize({ width: max, height: max, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 72 }).toBuffer();
  return out.toString("base64");
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

// Resumo da rodada para a tela e para o MCP (com links temporários das imagens)
export async function runSummary(db, run, linkSeconds = 3600) {
  const last = (run.versions || [])[run.versions.length - 1] || null;
  const sign = async (path) => (path ? (await db.storage.from("anexos").createSignedUrl(path, linkSeconds)).data?.signedUrl || null : null);
  return {
    id: run.id,
    status: run.status,
    etapa: STAGE_LABEL[run.status] || run.status,
    final: FINAL.includes(run.status),
    ciclo: run.ciclo,
    max_ciclos: run.max_ciclos,
    card_id: run.card_id,
    entry_id: run.entry_id,
    media: last?.media ?? null,
    notas: last?.notas || null,
    motivos: last?.motivos || [],
    versoes: (run.versions || []).length,
    imagens: last ? await Promise.all(last.paths.map(sign)) : [],
    art: last ? last.paths.map((path) => ({ type: "upload", path, name: path.split("/").pop(), art: true, run: run.id })) : [],
    montagem: last?.montagem ? await sign(last.montagem) : null,
    alertas: run.alerts || [],
    registro: (run.log || []).map((l) => `${l.etapa}: ${l.texto}`),
    equipe: run.team_status ? { status: run.team_status, motivo: run.team_feedback } : null,
    conceito: run.plan?.direcao?.conceito || ""
  };
}
