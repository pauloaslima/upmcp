// Demandas recorrentes: regra de repetição de um card e as datas em que ele acontece.
// Regra (cards.recurrence):
//   { tipo: "mensal", dia: 5 }         todo mês no dia 5 (em meses mais curtos, o último dia)
//   { tipo: "semanal", dias: [1, 4] }  toda semana nesses dias (0 = domingo … 6 = sábado)
//   { tipo: "diaria" }                 todo dia útil (segunda a sexta)

export const HORIZON_DAYS = 45; // as ocorrências são criadas com esta antecedência
export const WEEKDAY_NAMES = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};

// regra válida ou null
export function cleanRecurrence(r) {
  if (!r || typeof r !== "object") return null;
  if (r.tipo === "mensal") {
    const dia = Math.round(Number(r.dia));
    return dia >= 1 && dia <= 31 ? { tipo: "mensal", dia } : null;
  }
  if (r.tipo === "semanal") {
    const dias = [...new Set((r.dias || []).map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort();
    return dias.length ? { tipo: "semanal", dias } : null;
  }
  if (r.tipo === "diaria") return { tipo: "diaria" };
  return null;
}

// datas (AAAA-MM-DD) em que a regra acontece, de "from" até "to" (inclusive)
export function occurrenceDates(recurrence, from, to) {
  const r = cleanRecurrence(recurrence);
  if (!r) return [];
  const out = [];
  const end = parse(to);
  for (let d = parse(from); d <= end; d.setDate(d.getDate() + 1)) {
    const wd = d.getDay();
    if (r.tipo === "diaria" && wd >= 1 && wd <= 5) out.push(iso(d));
    else if (r.tipo === "semanal" && r.dias.includes(wd)) out.push(iso(d));
    else if (r.tipo === "mensal") {
      const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      if (d.getDate() === Math.min(r.dia, lastDay)) out.push(iso(d));
    }
  }
  return out;
}

// texto curto da regra: "todo dia 5", "toda segunda e quinta", "todo dia útil"
export function describeRecurrence(recurrence) {
  const r = cleanRecurrence(recurrence);
  if (!r) return "";
  if (r.tipo === "mensal") return `todo mês, dia ${r.dia}`;
  if (r.tipo === "diaria") return "todo dia útil";
  const names = r.dias.map((d) => WEEKDAY_NAMES[d]);
  return "toda " + (names.length > 1 ? names.slice(0, -1).join(", ") + " e " + names[names.length - 1] : names[0]);
}

export function addDaysIso(day, n) {
  const d = parse(day);
  d.setDate(d.getDate() + n);
  return iso(d);
}
