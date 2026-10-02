"use client";

import { addDays, calendarTask, iso, mondayOf, parse, productionWeek, rangeLabel, shortDate, taskStatus, weeklyTasks } from "../lib/deadlines";
import { shortName } from "../lib/people";
import { useClientTasks } from "../lib/useClientTasks";

// Aviso fixo de antecedência: o que está sendo produzido nesta semana
export function LeadTimeBanner() {
  const today = parse(iso(new Date()));
  const pub = addDays(mondayOf(today), 14);
  const tasks = weeklyTasks(pub);
  return (
    <div className="lead-banner">
      <strong>Produção desta semana: posts de {rangeLabel(iso(pub), iso(addDays(pub, 6)))}</strong>
      <span>
        Conteúdo sempre com 2 semanas de antecedência · design até {shortDate(tasks[0].due)} · ajustes {shortDate(tasks[1].due)} · aprovação do cliente{" "}
        {shortDate(tasks[2].due)}
      </span>
    </div>
  );
}

// Painel do Início: situação de prazos de todos os clientes
export default function DeadlinesOverview({ clients, team, onOpenClient, showToast }) {
  const todayIso = iso(new Date());
  const today = parse(todayIso);
  const next = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  const calTask = calendarTask(next.getFullYear(), next.getMonth() + 1);
  const pub = addDays(mondayOf(today), 14);
  const weekTasks = weeklyTasks(pub);
  const prod = productionWeek(pub);
  const { isDone } = useClientTasks(null, iso(addDays(today, -60)), showToast);
  const byId = Object.fromEntries(team.map((p) => [p.id, p]));
  const cols = [calTask, ...weekTasks];

  const lateCount = clients.reduce(
    (n, c) => n + cols.filter((t) => taskStatus(t, isDone(c.id, t), todayIso).id === "atrasado").length,
    0
  );

  return (
    <section className="overview">
      <div className="overview-head">
        <h3>Prazos</h3>
        {lateCount > 0 ? <span className="pill pill-late">{lateCount} atrasado(s)</span> : <span className="pill pill-ok">tudo em dia</span>}
      </div>
      <div className="overview-scroll">
        <table className="overview-table">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Responsável</th>
              <th>
                {calTask.label.replace(" finalizado", "")}
                <small>até {shortDate(calTask.due)}</small>
              </th>
              {weekTasks.map((t) => (
                <th key={t.kind}>
                  {{ design: "Design", ajustes: "Ajustes", aprovacao: "Aprovação" }[t.kind]}
                  <small>até {shortDate(t.due)}</small>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => (
              <tr key={c.id} onClick={() => onOpenClient(c.id)}>
                <td className="ov-client">{c.name}</td>
                <td className="ov-resp">{byId[c.responsible_id] ? shortName(byId[c.responsible_id]) : <em>-</em>}</td>
                {cols.map((t) => {
                  const st = taskStatus(t, isDone(c.id, t), todayIso);
                  return (
                    <td key={t.kind}>
                      <span className={"chip st-" + st.id}>{st.id === "feito" ? "✓ feito" : st.label}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="hint">
        Colunas de produção = posts de {rangeLabel(iso(pub), iso(addDays(pub, 6)))}, produzidos em {rangeLabel(prod.start, prod.end)}. Marque as
        tarefas no checklist de cada cliente.
      </div>
    </section>
  );
}
