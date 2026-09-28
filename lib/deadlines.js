// Regras de prazo da Up! — um só lugar para as telas e para o lembrete diário.
//
// Calendário mensal: o calendário do mês M fica pronto até o dia 25 do mês anterior.
// Conteúdo: produzido com 2 semanas de antecedência. Para os posts publicados na
// semana que começa na segunda P, a produção acontece na semana de P - 14 dias:
//   quarta  → enviar demandas ao design
//   quinta  → ajustes
//   sexta   → enviar ao cliente para aprovação

export const CALENDAR_DUE_DAY = 25;
export const LEAD_DAYS = 14;
export const REMINDER_DAYS = [5, 3, 2, 1, 0]; // lembretes do calendário: dias antes do prazo

// offset = dias a partir da segunda-feira da semana de produção
export const WEEKLY_STEPS = [
  { kind: "design", label: "Demandas enviadas ao design", offset: 2 },
  { kind: "ajustes", label: "Ajustes do design", offset: 3 },
  { kind: "aprovacao", label: "Enviado ao cliente para aprovação", offset: 4 }
];

export const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];
const WEEKDAY_SHORT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

export function iso(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
export function parse(isoDate) {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(date, n) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() + n);
  return d;
}
export function mondayOf(date) {
  return addDays(date, -((date.getDay() + 6) % 7));
}
export function daysBetween(fromIso, toIso) {
  return Math.round((parse(toIso) - parse(fromIso)) / 86400000);
}
export function shortDate(isoDate) {
  const d = parse(isoDate);
  return `${WEEKDAY_SHORT[d.getDay()]} ${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}
export function rangeLabel(fromIso, toIso) {
  const a = parse(fromIso);
  const b = parse(toIso);
  const f = (d) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
  return `${f(a)} a ${f(b)}`;
}

// "Hoje" no horário de Brasília (o servidor do Vercel roda em UTC)
export function todayInBrazil() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

// Tarefa do calendário do mês (year, month 1-12)
export function calendarTask(year, month) {
  return {
    kind: "calendario",
    period: iso(new Date(year, month - 1, 1)),
    due: iso(new Date(year, month - 2, CALENDAR_DUE_DAY)),
    label: `Calendário de ${MONTH_NAMES[month - 1]} finalizado`
  };
}

// Tarefas de produção dos posts publicados na semana que começa em pubMonday (Date)
export function weeklyTasks(pubMonday) {
  const prodMonday = addDays(pubMonday, -LEAD_DAYS);
  return WEEKLY_STEPS.map((s) => ({
    kind: s.kind,
    period: iso(pubMonday),
    due: iso(addDays(prodMonday, s.offset)),
    label: s.label
  }));
}

// Semana de produção de uma semana de publicação
export function productionWeek(pubMonday) {
  const start = addDays(pubMonday, -LEAD_DAYS);
  return { start: iso(start), end: iso(addDays(start, 6)) };
}

// O checklist que aparece em cada cliente, a partir de hoje:
// calendários dos 2 próximos meses + produção das 3 próximas semanas de publicação.
export function checklistFor(todayIso) {
  const today = parse(todayIso);
  const next1 = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  const next2 = new Date(today.getFullYear(), today.getMonth() + 2, 1);
  const monday = mondayOf(today);
  const groups = [
    {
      id: "calendarios",
      title: "Calendários mensais",
      subtitle: `prontos até o dia ${CALENDAR_DUE_DAY} do mês anterior`,
      tasks: [calendarTask(next1.getFullYear(), next1.getMonth() + 1), calendarTask(next2.getFullYear(), next2.getMonth() + 1)]
    }
  ];
  [7, 14, 21].forEach((d) => {
    const pub = addDays(monday, d);
    const prod = productionWeek(pub);
    groups.push({
      id: "semana-" + iso(pub),
      title: `Posts de ${rangeLabel(iso(pub), iso(addDays(pub, 6)))}`,
      subtitle: `produção em ${rangeLabel(prod.start, prod.end)}`,
      tasks: weeklyTasks(pub)
    });
  });
  return groups;
}

export const taskKey = (t) => `${t.kind}|${t.period}`;

// feito | atrasado | hoje | breve (até 5 dias) | futuro
export function taskStatus(task, done, todayIso) {
  if (done) return { id: "feito", label: "feito", days: null };
  const days = daysBetween(todayIso, task.due);
  if (days < 0) return { id: "atrasado", label: `atrasado ${-days} dia(s)`, days };
  if (days === 0) return { id: "hoje", label: "vence hoje", days };
  if (days <= 5) return { id: "breve", label: `faltam ${days} dia(s)`, days };
  return { id: "futuro", label: `prazo ${shortDate(task.due)}`, days };
}

// Próximo prazo de uma peça, conforme a etapa em que ela está
const STEP_BY_COLUMN = {
  estruturacao: "design",
  checagem: "design",
  design: "ajustes",
  revisao_int: "aprovacao",
  ajustes: "aprovacao"
};
export function cardDeadline(card, todayIso) {
  if (!card.publish_date) return null;
  const kind = STEP_BY_COLUMN[card.column_id];
  if (!kind) return null;
  const task = weeklyTasks(mondayOf(parse(card.publish_date))).find((t) => t.kind === kind);
  const step = WEEKLY_STEPS.find((s) => s.kind === kind);
  return { ...task, short: { design: "Design", ajustes: "Ajustes", aprovacao: "Aprovação" }[kind], step, status: taskStatus(task, false, todayIso) };
}
