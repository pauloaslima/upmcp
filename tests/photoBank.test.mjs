import test from "node:test";
import assert from "node:assert/strict";
import { photosWanted, suggestPhotos, words } from "../lib/photoBank.js";

const now = new Date("2026-10-16T12:00:00Z").getTime();
const ago = (d) => new Date(now - d * 86400000).toISOString();

test("palavras sem acento e sem as curtas", () => {
  assert.deepEqual(words("Ansiedade na Adolescência e você"), ["ansiedade", "adolescencia"]);
});

test("carrossel pede 3 fotos, o resto 1", () => {
  assert.equal(photosWanted("Carrossel"), 3);
  assert.equal(photosWanted("Estático"), 1);
  assert.equal(photosWanted("Story"), 1);
});

test("prefere a etiqueta parecida com o tema", () => {
  const bank = [
    { id: "a", tags: "consultório", use_count: 0 },
    { id: "b", tags: "palestra evento", use_count: 0 },
    { id: "c", tags: "", use_count: 0 }
  ];
  assert.deepEqual(suggestPhotos(bank, { theme: "Palestra sobre ansiedade", format: "Estático", now }), ["b"]);
});

test("foto usada há pouco fica para depois; fora de uso nunca entra", () => {
  const bank = [
    { id: "usada", tags: "", use_count: 1, last_used_at: ago(2) },
    { id: "parada", tags: "", use_count: 0, active: false },
    { id: "livre", tags: "", use_count: 1, last_used_at: ago(60) }
  ];
  assert.deepEqual(suggestPhotos(bank, { format: "Carrossel", now }), ["livre", "usada"]);
});

test("banco vazio não sugere nada", () => {
  assert.deepEqual(suggestPhotos([], { format: "Carrossel" }), []);
});
