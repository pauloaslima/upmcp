// Testes do fluxo de direção de arte (partes que não dependem do modelo nem do banco).
// Rodar: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanSpec, pageLimits } from "../lib/art/spec.js";
import { LAYOUTS, cleanPage, cleanPlan, noDisclaimer, repeats } from "../lib/art/plan.js";
import { artText, runChecks } from "../lib/art/checks.js";
import { CRITERIA, cleanCritique, decide } from "../lib/art/critic.js";
import { applyRefinement } from "../lib/art/refiner.js";
import { buildImagePrompt, generationSize } from "../lib/art/visualPrompt.js";
import { ICON_NAMES, iconSrc } from "../lib/art/icons.js";

const page = (o = {}) => ({
  objetivo_visual: "x", layout: "tipografico", fundo: "principal", decoracao: "nenhuma", alinhamento: "esquerda", posicao_texto: "embaixo", degrade: "suave",
  chamada_superior: "", titulo: "Título", destaque_titulo: "", manuscrito: "", texto: "", blocos: [], centro: "", cta: "", rodape: "",
  linha_de_apoio: "", palavra_destaque: "", assinatura: "", itens: "", foto: -1, foto_escala: 1, foto_foco: "rosto", foto_lado: "direita", busca_foto: "",
  imagem_gerada: { assunto: "", acao: "", enquadramento: "", luz: "", ambiente: "", espaco_para_texto: "" }, ...o
});
const rawPlan = (paginas, extra = {}) => ({
  direcao: { conceito: "c", mensagem_principal: "m", primeiro_olhar: "p", papel_da_foto: "f", tratamento_foto: "t", ritmo: "r", justificativa: "j" },
  paleta: { fundo: "#F3EEE8", fundo_alt: "#5B4A66", destaque: "#8C6F9E", texto: "#3A2E44", texto_sobre_foto: "#FFFFFF" },
  tipografia: { titulo: "Playfair", manuscrita: "GreatVibes", caixa_alta: true },
  paginas, textos_nas_fotos: [], fotos_fracas: [], alertas: [], resumo: "r", ...extra
});
const allNines = () => Object.fromEntries(CRITERIA.map((c) => [c, 9]));

// ---------- estrategista de briefing ----------
test("especificação: carrossel respeita 3 a 10 páginas e completa o roteiro", () => {
  assert.deepEqual(pageLimits("Carrossel"), { min: 3, max: 10 });
  const s = cleanSpec({ mensagem_principal: "m", quantidade_paginas: 8, roteiro: [{ pagina: 1, objetivo: "capa", conteudo: "a" }], textos_obrigatorios: ["CRP 14/05727-1", ""] }, "Carrossel");
  assert.equal(s.quantidade_paginas, 3);
  assert.equal(s.roteiro.length, 3);
  assert.deepEqual(s.textos_obrigatorios, ["CRP 14/05727-1"]);
});
test("especificação: estático tem sempre 1 página e sem conteúdo é rejeitada", () => {
  const s = cleanSpec({ mensagem_principal: "m", roteiro: [{ objetivo: "a", conteudo: "b" }, { objetivo: "c", conteudo: "d" }] }, "Estático");
  assert.equal(s.quantidade_paginas, 1);
  assert.throws(() => cleanSpec({ mensagem_principal: "", roteiro: [] }, "Estático"));
});
test("especificação: travessão vira vírgula", () => {
  const s = cleanSpec({ mensagem_principal: "Cuidar — sem pressa", roteiro: [{ objetivo: "a", conteudo: "b" }] }, "Estático");
  assert.ok(!/[—–]/.test(s.mensagem_principal));
});

// ---------- diretor de arte e arquiteto de layout ----------
test("plano: capa vira foto quando há foto do cliente e páginas de foto recebem foto", () => {
  const plan = cleanPlan(rawPlan([page({ layout: "tipografico" }), page({ layout: "foto_lateral" }), page({ layout: "cta", cta: "Agendar" })]), { spec: { quantidade_paginas: 3 }, format: "Carrossel", photoCount: 2 });
  assert.equal(plan.paginas[0].layout, "foto_cheia");
  assert.equal(plan.paginas[0].foto, 0);
  assert.ok(plan.paginas[1].foto >= 0);
});
test("plano: configuração do cliente manda nas fontes e desliga a manuscrita", () => {
  const plan = cleanPlan(rawPlan([page({ manuscrito: "em tudo" })]), { spec: { quantidade_paginas: 1 }, format: "Estático", config: { fonte_titulo: "Cormorant", fonte_manuscrita: "nenhuma" } });
  assert.equal(plan.tipografia.titulo, "Cormorant");
  assert.equal(plan.paginas[0].manuscrito, "");
});
test("plano: limita imagens geradas a 3 e só quando permitido", () => {
  const gen = { assunto: "child reading", acao: "", enquadramento: "", luz: "", ambiente: "", espaco_para_texto: "" };
  const raw = rawPlan(Array.from({ length: 5 }, () => page({ layout: "foto_cheia", imagem_gerada: gen })));
  assert.equal(cleanPlan(raw, { spec: { quantidade_paginas: 5 }, format: "Carrossel", genAllowed: true }).paginas.filter((p) => p.imagem_gerada).length, 3);
  assert.equal(cleanPlan(raw, { spec: { quantidade_paginas: 5 }, format: "Carrossel", genAllowed: false }).paginas.filter((p) => p.imagem_gerada).length, 0);
});
test("plano: nunca 'imagem ilustrativa', etiqueta não repete o título, destaque precisa existir no título", () => {
  assert.equal(noDisclaimer("Combo do dia. *Imagem meramente ilustrativa."), "Combo do dia.");
  assert.ok(repeats("Sextou", "Sextou com burger"));
  const p = cleanPage(page({ titulo: "Baixe o cortisol", destaque_titulo: "estresse", foto_escala: 5 }));
  assert.equal(p.destaque_titulo, "");
  assert.equal(p.foto_escala, 1.8);
  assert.ok(LAYOUTS.includes("comparacao") && LAYOUTS.includes("grade_icones") && LAYOUTS.includes("diagrama"));
});

// ---------- verificações objetivas ----------
test("verificações: texto obrigatório ausente e tamanho errado são erros críticos", () => {
  const plan = cleanPlan(rawPlan([page({ titulo: "Capa" }), page({ layout: "lista", titulo: "Dois" }), page({ layout: "cta", titulo: "Três" })]), { spec: { quantidade_paginas: 3 }, format: "Carrossel" });
  const c = runChecks({ plan, spec: { quantidade_paginas: 3, textos_obrigatorios: ["CRP 14/05727-1"] }, format: "Carrossel", rendered: [{ width: 1080, height: 1350, bytes: 10 }, { width: 1080, height: 1080, bytes: 10 }, { width: 1080, height: 1350, bytes: 10 }], expected: { width: 1080, height: 1350 } });
  assert.ok(c.criticos.some((t) => /CRP/.test(t)));
  assert.ok(c.criticos.some((t) => /Página 2: tamanho/.test(t)));
  // a assinatura conta como texto da arte
  const ok = runChecks({ plan, spec: { textos_obrigatorios: ["crp 14/05727-1"] }, format: "Carrossel", signatureText: ["CRP 14/05727-1"] });
  assert.equal(ok.criticos.length, 0);
});
test("verificações: layout repetido em sequência e pouca variedade viram problema", () => {
  const plan = cleanPlan(rawPlan([page({ layout: "lista" }), page({ layout: "lista" }), page({ layout: "lista" }), page({ layout: "lista" })]), { spec: { quantidade_paginas: 4 }, format: "Carrossel" });
  const c = runChecks({ plan, spec: { quantidade_paginas: 4 }, format: "Carrossel" });
  assert.ok(c.problemas.some((p) => /repetem o layout/.test(p.texto)));
  assert.ok(c.problemas.some((p) => /Pouca variedade/.test(p.texto)));
});
test("verificações: cores fora da identidade configurada", () => {
  const plan = cleanPlan(rawPlan([page()]), { spec: {}, format: "Estático" });
  const c = runChecks({ plan, spec: {}, format: "Estático", clientColors: "#F3EEE8, #5B4A66" });
  assert.ok(c.problemas.some((p) => /fora da identidade/.test(p.texto)));
  assert.ok(artText(plan).includes("Título"));
});

// ---------- crítico visual ----------
test("crítico: nota abaixo de 8 ou erro crítico reprovam; tudo >= 8 aprova", () => {
  const good = cleanCritique({ paginas: [{ pagina: 1, notas: allNines(), erros_criticos: [], correcoes: [] }], conjunto: { nota: 9, problemas: [] }, resumo: "" }, 1);
  assert.equal(decide(good, { criticos: [], problemas: [] }).aprovada, true);
  const low = cleanCritique({ paginas: [{ pagina: 1, notas: { ...allNines(), fotografia: 6 }, erros_criticos: [], correcoes: ["Ampliar a foto"] }], conjunto: { nota: 9, problemas: [] } }, 1);
  const d = decide(low, { criticos: [], problemas: [] });
  assert.equal(d.aprovada, false);
  assert.deepEqual(d.paginas_para_revisar, [1]);
  const crit = cleanCritique({ paginas: [{ pagina: 1, notas: allNines(), erros_criticos: ["Texto cortado"], correcoes: [] }], conjunto: { nota: 9, problemas: [] } }, 1);
  assert.equal(decide(crit, { criticos: [], problemas: [] }).aprovada, false);
  // erro crítico das verificações bloqueia mesmo com notas altas
  assert.equal(decide(good, { criticos: ["Formato errado"], problemas: [] }).aprovada, false);
});
test("crítico: página sem avaliação recebe nota 0 (não passa por omissão)", () => {
  const c = cleanCritique({ paginas: [{ pagina: 1, notas: allNines(), erros_criticos: [], correcoes: [] }], conjunto: { nota: 9, problemas: [] } }, 2);
  assert.equal(c.paginas[1].media, 0);
  assert.equal(decide(c, { criticos: [], problemas: [] }).aprovada, false);
});

// ---------- refinador ----------
test("refinador: altera só as páginas indicadas e mantém a foto em ajustes", () => {
  const plan = cleanPlan(rawPlan([page({ layout: "foto_cheia", foto: 0 }), page({ layout: "lista", titulo: "Lista" }), page({ layout: "cta" })]), { spec: { quantidade_paginas: 3 }, format: "Carrossel", photoCount: 1 });
  const { plan: next, changed, log } = applyRefinement(
    plan,
    { alteracoes: [{ pagina: 1, acao: "ajuste", explicacao: "foto maior", pagina_nova: page({ layout: "foto_cheia", foto: -1, foto_escala: 1.4 }) }, { pagina: 9, acao: "ajuste", explicacao: "x", pagina_nova: page() }] },
    { photoCount: 1 }
  );
  assert.deepEqual(changed, [0]);
  assert.equal(next.paginas[0].foto, 0);
  assert.equal(next.paginas[0].foto_escala, 1.4);
  assert.equal(next.paginas[1].titulo, "Lista");
  assert.equal(log.length, 1);
});
test("refinador: no máximo uma imagem nova por ciclo", () => {
  const gen = { assunto: "calm office", acao: "", enquadramento: "", luz: "", ambiente: "", espaco_para_texto: "" };
  const plan = cleanPlan(rawPlan([page(), page({ layout: "lista" }), page({ layout: "cta" })]), { spec: { quantidade_paginas: 3 }, format: "Carrossel" });
  const { plan: next } = applyRefinement(
    plan,
    { alteracoes: [1, 2].map((n) => ({ pagina: n, acao: "nova_imagem", explicacao: "", pagina_nova: page({ layout: "foto_cheia", imagem_gerada: gen }) })) },
    { genAllowed: true }
  );
  assert.equal(next.paginas.filter((p) => p.imagem_gerada).length, 1);
});

// ---------- especialista em geração visual ----------
test("geração visual: pedido específico, com restrições e área para o texto", () => {
  const p = cleanPage(page({ layout: "foto_lateral", foto_lado: "direita", imagem_gerada: { assunto: "mother and child reading", acao: "smiling", enquadramento: "medium shot", luz: "soft window light", ambiente: "cozy living room", espaco_para_texto: "" } }), { genAllowed: true });
  const prompt = buildImagePrompt(p, { width: 626, height: 1350 }, { paleta: { fundo: "#F3EEE8", destaque: "#8C6F9E" }, estilo_foto: "warm natural light" });
  assert.match(prompt, /mother and child reading/);
  assert.match(prompt, /vertical/);
  assert.match(prompt, /no text/);
  assert.match(prompt, /left side of the frame calm/);
  assert.match(prompt, /#8C6F9E/);
  assert.deepEqual(generationSize({ width: 626, height: 1350 }), { width: 624, height: 1344 });
});

// ---------- ícones ----------
test("ícones: os usados nos layouts existem e viram SVG na cor pedida", () => {
  for (const n of ["x", "check", "star", "brain", "graduation-cap"]) assert.ok(ICON_NAMES.includes(n), n);
  const src = iconSrc("check", "#8C6F9E");
  assert.ok(Buffer.from(src.split(",")[1], "base64").toString().includes('stroke="#8C6F9E"'));
  assert.equal(iconSrc("nao-existe"), null);
});
