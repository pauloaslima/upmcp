// Rotinas: em que dias cada uma acontece (a mesma regra da função routine_due do banco, SQL 020).
//   semanal   = nos dias da semana marcados (weekdays: 0 = domingo … 6 = sábado)
//   quinzenal = nos dias marcados, semana sim, semana não, contando da semana de start_date
//   mensal    = todo mês no dia month_day (em meses mais curtos, o último dia)

export const FREQUENCIES = [
  { id: "semanal", label: "Semanal" },
  { id: "quinzenal", label: "Quinzenal" },
  { id: "mensal", label: "Mensal" }
];
export const DAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const DAY_NAMES = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

const parse = (s) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
// início da semana (domingo), em dias desde 1970, sem efeito de fuso
const weekStart = (date) => Math.round((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000 - date.getDay()));

export function routineDue(r, day) {
  const d = parse(day);
  const frequency = r.frequency || "semanal";
  if (frequency === "mensal") {
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    return d.getDate() === Math.min(Number(r.month_day) || 1, last);
  }
  const weekdays = r.weekdays || [];
  if (!weekdays.includes(d.getDay())) return false;
  if (frequency === "quinzenal") {
    const weeks = (weekStart(d) - weekStart(parse(r.start_date || day))) / 7;
    return ((weeks % 2) + 2) % 2 === 0;
  }
  return true;
}

// "seg a sex", "toda segunda e quinta", "quinzenal: sexta", "todo dia 10"
export function describeRoutine(r) {
  const frequency = r.frequency || "semanal";
  if (frequency === "mensal") return `todo mês, dia ${r.month_day || 1}`;
  const days = [...(r.weekdays || [])].sort();
  const list = days.join() === "1,2,3,4,5" ? "seg a sex" : days.length === 7 ? "todos os dias" : days.map((d) => DAY_NAMES[d]).join(", ");
  return frequency === "quinzenal" ? `a cada 15 dias: ${list}` : list;
}
