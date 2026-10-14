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
test("fotos: capa com a primeira, fechamento com a última, meio alternado", () => {
  assert.deepEqual(assignPhotos(8, 0), Array(8).fill(-1));
  assert.deepEqual(assignPhotos(1, 3), [0]);
  assert.deepEqual(assignPhotos(8, 4), [0, -1, 1, -1, 2, -1, 1, 3]);
  assert.deepEqual(assignPhotos(3, 1), [0, -1, 0]);
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
  assert.match(prompt, /keep the person's face/);
  assert.match(prompt, /COVER/);
  assert.match(prompt, /#F3EEE8, #5B4A66/);
  assert.match(prompt, /Do not draw any logo/);
  assert.match(prompt, /Avoid: faixas brancas/);
  const middle = buildSlidePrompt({ client: { name: "X" }, post: {}, page: { texto: "a" }, index: 3, total: 8, photoRole: "none", hasCoverRef: true, size: { width: 1080, height: 1350 } });
  assert.match(middle, /Image 1 is slide 1/);
  assert.match(middle, /MIDDLE slide/);
});
