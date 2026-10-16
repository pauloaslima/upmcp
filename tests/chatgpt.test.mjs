// Testes da arte pelo ChatGPT (gerador de imagens da OpenAI): partes que não dependem da OpenAI.
import { test } from "node:test";
import assert from "node:assert/strict";
import { assignPhotos, buildSlidePrompt, splitPages } from "../lib/art/chatgptArt.js";

const piece = "Página 1: SUPERDOTAÇÃO NÃO É TIRAR 10 EM TUDO. Como se manifesta.\nPágina 2: Mito: vai bem em tudo. Verdade: pode ter dificuldade.\nPágina 3: Teste online NÃO fecha diagnóstico.";

test("divide o texto da peça por página", () => {
  const pages = splitPages({ format: "Carrossel", theme: "t", brief: { piece_text: piece } });
  assert.equal(pages.length, 3);
  assert.match(pages[0].texto, /^SUPERDOTAÇÃO/);
  assert.match(pages[2].texto, /Teste online/);
});
test("páginas separadas por barra na mesma linha e pendências fora da arte", () => {
  const one = "Página 1: ALTAS HABILIDADES: 5 mitos. Subtítulo: Salve esse post. / Página 2: Mito 1: Toda criança tira notas altas. Verdade: muitas se entediam. / Página 3: Entender o seu filho. Me chame no [confirmar com o cliente: direct ou WhatsApp].";
  const pages = splitPages({ format: "Carrossel", theme: "t", brief: { piece_text: one } });
  assert.equal(pages.length, 3);
  assert.match(pages[1].texto, /^Mito 1:/);
  assert.equal(pages[2].texto, "Entender o seu filho. Me chame no.");
  assert.equal(pages[2].pendente, true);
  assert.equal(pages[0].pendente, false);
});
test("carrossel sem marcação vira pelo menos 3 páginas", () => {
  const pages = splitPages({ format: "Carrossel", theme: "t", brief: { piece_text: "Frase um. Frase dois. Frase três. Frase quatro." } });
  assert.ok(pages.length >= 3);
});
test("estático vira uma página só; sem texto usa o tema", () => {
  assert.equal(splitPages({ format: "Estático", theme: "t", brief: { piece_text: piece } }).length, 1);
  assert.deepEqual(splitPages({ format: "Carrossel", theme: "Tema — x", brief: {} }), [{ texto: "Tema, x", pendente: false }]);
});
test("fotos: mescla páginas com foto e páginas só com fundo e textura", () => {
  assert.deepEqual(assignPhotos(8, 0), Array(8).fill(-1));
  assert.deepEqual(assignPhotos(1, 3), [0]);
  assert.deepEqual(assignPhotos(3, 1), [0, -1, 0]);
  // 7 páginas e 2 fotos: só capa e fechamento
  assert.deepEqual(assignPhotos(7, 2), [0, -1, -1, -1, -1, -1, 1]);
  // 7 páginas e 4 fotos: uma página do meio com foto
  assert.deepEqual(assignPhotos(7, 4), [0, -1, -1, 1, -1, -1, 3]);
  // 8 páginas: no máximo 2 do meio, nunca vizinhas
  const eight = assignPhotos(8, 5);
  assert.equal(eight.filter((x) => x >= 0).length, 4);
  for (let i = 1; i < 8; i++) assert.ok(!(eight[i] >= 0 && eight[i - 1] >= 0));
});
test("página sem foto pede só fundo, textura e tipografia", () => {
  const prompt = buildSlidePrompt({ client: { name: "X" }, post: {}, page: { texto: "a" }, index: 2, total: 7, photoRole: "none", hasCoverRef: true, size: { width: 1080, height: 1350 } });
  assert.match(prompt, /NO photograph/);
  assert.match(prompt, /without its photo/);
});
test("pedido: texto exato, foto preservada, área livre para a marca e sem logo desenhada", () => {
  const prompt = buildSlidePrompt({
    client: { name: "Jozeane Cassol Psi", identity: "lilás e off white", positioning: "psicóloga" },
    config: { cores: "#F3EEE8, #5B4A66", fonte_titulo: "Playfair", evitar: "faixas brancas" },
    post: { brief: { important_notes: "overlay lilás", must_have: "CRP" } },
    page: { texto: "Teste online NÃO fecha diagnóstico." },
    index: 0, total: 8, photoRole: "photo", hasCoverRef: false, size: { width: 1080, height: 1350 }
  });
  assert.match(prompt, /EXACTLY this Brazilian Portuguese text/);
  assert.match(prompt, /"""Teste online NÃO fecha diagnóstico\."""/);
  assert.match(prompt, /IDENTICAL to the photo/);
  assert.match(prompt, /COVER/);
  assert.match(prompt, /#F3EEE8, #5B4A66/);
  assert.match(prompt, /Do not draw any logo/);
  assert.match(prompt, /NEVER write the professional's or brand's name/);
  assert.match(prompt, /top 200 px/);
  assert.match(prompt, /Avoid: faixas brancas/);
  assert.match(prompt, /ONE single clean rectangle/);
  const middle = buildSlidePrompt({ client: { name: "X" }, post: {}, page: { texto: "a" }, index: 3, total: 8, photoRole: "none", hasCoverRef: true, size: { width: 1080, height: 1350 } });
  assert.match(middle, /Image 1 is slide 1/);
  assert.match(middle, /MIDDLE slide/);
});

test("capa com referências de estilo do cliente e estilo base", () => {
  const size = { width: 1080, height: 1350 };
  const prompt = buildSlidePrompt({ client: { name: "X" }, config: { estilo_base: "editorial" }, post: {}, page: { texto: "a" }, index: 0, total: 5, photoRole: "photo", styleRefs: 2, size });
  assert.match(prompt, /Images 2 to 3 are STYLE REFERENCES/);
  assert.match(prompt, /BASE STYLE: editorial minimalist/);
  assert.match(prompt, /AVOID THE GENERIC TEMPLATE LOOK/);
  const one = buildSlidePrompt({ client: { name: "X" }, post: {}, page: { texto: "a" }, index: 0, total: 1, styleRefs: 1, size });
  assert.match(one, /Image 1 is a STYLE REFERENCE/);
  assert.doesNotMatch(one, /BASE STYLE/);
});
