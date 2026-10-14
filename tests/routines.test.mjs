// Rotinas: em que dias cada frequência acontece
import { test } from "node:test";
import assert from "node:assert/strict";
import { describeRoutine, routineDue } from "../lib/routines.js";

const days = (r, from, to) => {
  const out = [];
  for (let d = new Date(from + "T12:00:00"); d <= new Date(to + "T12:00:00"); d.setDate(d.getDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    if (routineDue(r, iso)) out.push(iso);
  }
  return out;
};

test("semanal nos dias marcados (rotinas antigas continuam iguais)", () => {
  assert.deepEqual(days({ weekdays: [1, 4] }, "2026-10-12", "2026-10-25"), ["2026-10-12", "2026-10-15", "2026-10-19", "2026-10-22"]);
});
test("quinzenal: semana sim, semana não a partir do início", () => {
  const r = { frequency: "quinzenal", weekdays: [5], start_date: "2026-10-14" };
  assert.deepEqual(days(r, "2026-10-12", "2026-11-15"), ["2026-10-16", "2026-10-30", "2026-11-13"]);
});
test("mensal no dia 10 e no dia 31 em mês curto", () => {
  assert.deepEqual(days({ frequency: "mensal", month_day: 10 }, "2026-10-01", "2026-12-31"), ["2026-10-10", "2026-11-10", "2026-12-10"]);
  assert.deepEqual(days({ frequency: "mensal", month_day: 31 }, "2027-02-01", "2027-04-30"), ["2027-02-28", "2027-03-31", "2027-04-30"]);
});
test("texto da frequência", () => {
  assert.equal(describeRoutine({ weekdays: [1, 2, 3, 4, 5] }), "seg a sex");
  assert.equal(describeRoutine({ frequency: "quinzenal", weekdays: [5] }), "a cada 15 dias: sexta");
  assert.equal(describeRoutine({ frequency: "mensal", month_day: 5 }), "todo mês, dia 5");
});
