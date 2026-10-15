import test from "node:test";
import assert from "node:assert/strict";
import { isReplaceable } from "../lib/monthRequest.js";

test("gerar de novo troca só temas do agente ainda não trabalhados", () => {
  assert.equal(isReplaceable({ created_by_agent: true }), true);
  assert.equal(isReplaceable({ created_by_agent: true, photos: [], art: [] }), true);
  assert.equal(isReplaceable({ created_by_agent: false }), false); // feito à mão
  assert.equal(isReplaceable({ created_by_agent: true, card_id: "x" }), false); // já na produção
  assert.equal(isReplaceable({ created_by_agent: true, photos: ["a.jpg"] }), false);
  assert.equal(isReplaceable({ created_by_agent: true, art: [{ path: "a.png" }] }), false);
  assert.equal(isReplaceable(null), false);
});
