// Fotos HEIC (iPhone): detecção pelo conteúdo do arquivo
import { test } from "node:test";
import assert from "node:assert/strict";
import { heicToJpeg, isHeic } from "../lib/heic.js";

const head = (brand) => Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftyp" + brand, "ascii"), Buffer.alloc(16)]);

test("reconhece HEIC pelo cabeçalho e ignora JPEG/PNG", async () => {
  assert.equal(isHeic(head("heic")), true);
  assert.equal(isHeic(head("mif1")), true);
  assert.equal(isHeic(head("avis")), false);
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1]);
  assert.equal(isHeic(jpeg), false);
  // o que não é HEIC passa igual
  assert.equal(await heicToJpeg(jpeg), jpeg);
});
