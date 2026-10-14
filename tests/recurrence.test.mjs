// Demandas recorrentes: datas de cada regra
import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanRecurrence, describeRecurrence, occurrenceDates } from "../lib/recurrence.js";

test("todo mês no dia 5", () => {
  assert.deepEqual(occurrenceDates({ tipo: "mensal", dia: 5 }, "2026-10-14", "2027-01-10"), ["2026-11-05", "2026-12-05", "2027-01-05"]);
});
test("dia 31 em mês curto cai no último dia", () => {
  assert.deepEqual(occurrenceDates({ tipo: "mensal", dia: 31 }, "2027-02-01", "2027-04-30"), ["2027-02-28", "2027-03-31", "2027-04-30"]);
});
test("toda segunda e quinta", () => {
  assert.deepEqual(occurrenceDates({ tipo: "semanal", dias: [4, 1] }, "2026-10-12", "2026-10-25"), ["2026-10-12", "2026-10-15", "2026-10-19", "2026-10-22"]);
});
test("todo dia útil pula o fim de semana", () => {
  assert.deepEqual(occurrenceDates({ tipo: "diaria" }, "2026-10-16", "2026-10-20"), ["2026-10-16", "2026-10-19", "2026-10-20"]);
});
test("regra inválida não gera nada e o texto descreve a regra", () => {
  assert.equal(cleanRecurrence({ tipo: "mensal", dia: 40 }), null);
  assert.equal(cleanRecurrence({ tipo: "semanal", dias: [] }), null);
  assert.deepEqual(occurrenceDates(null, "2026-10-01", "2026-10-31"), []);
  assert.equal(describeRecurrence({ tipo: "mensal", dia: 5 }), "todo mês, dia 5");
  assert.equal(describeRecurrence({ tipo: "semanal", dias: [1, 4] }), "toda segunda e quinta");
});
