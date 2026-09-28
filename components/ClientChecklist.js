"use client";

import { useMemo } from "react";
import { addDays, checklistFor, iso, parse, shortDate, taskKey, taskStatus } from "../lib/deadlines";
import { useClientTasks } from "../lib/useClientTasks";

// Checklist de prazos de um cliente (equipe): calendários mensais e produção semanal.
export default function ClientChecklist({ client, team, onSetResponsible, showToast }) {
  const today = iso(new Date());
  const groups = useMemo(() => checklistFor(today), [today]);
  const { isDone, doneRow, toggle } = useClientTasks(client.id, iso(addDays(parse(today), -60)), showToast);
  const byId = Object.fromEntries(team.map((p) => [p.id, p]));

  return (
    <section className="checklist-panel">
      <div className="checklist-head">
        <h3>Checklist e prazos</h3>
        <label className="responsible">
          <span>Responsável</span>
          <select value={client.responsible_id || ""} onChange={(e) => onSetResponsible(e.target.value || null)}>
            <option value="">Sem responsável</option>
            {team.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name || p.email}
              </option>
            ))}
          </select>
        </label>
      </div>
      {!client.responsible_id && (
        <div className="hint warn">Sem responsável, os lembretes de prazo vão para o administrador.</div>
      )}

      <div className="checklist-groups">
        {groups.map((g) => (
          <div key={g.id} className="checklist-group">
            <div className="checklist-group-title">
              {g.title}
              {g.subtitle && <span>{g.subtitle}</span>}
            </div>
            {g.tasks.map((t) => {
              const done = isDone(client.id, t);
              const st = taskStatus(t, done, today);
              const row = doneRow(client.id, t);
              const by = row && byId[row.done_by];
              return (
                <label key={taskKey(t)} className={"task st-" + st.id}>
                  <input type="checkbox" checked={done} onChange={(e) => toggle(client.id, t, e.target.checked)} />
                  <span className="task-label">{t.label}</span>
                  <span className="task-due">{shortDate(t.due)}</span>
                  <span className="task-status">
                    {done && by ? "feito por " + (by.full_name || by.email).split(" ")[0] : st.label}
                  </span>
                </label>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}
