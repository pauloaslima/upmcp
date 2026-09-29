"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { COLUMNS, COL_INDEX } from "../lib/pipeline";
import { addDays, cardDue, checklistFor, iso, parse, shortDate, taskStatus } from "../lib/deadlines";
import { useClientTasks } from "../lib/useClientTasks";

const FILTERS = [
  { id: "pendentes", label: "Pendentes" },
  { id: "atrasadas", label: "Atrasadas" },
  { id: "executadas", label: "Executadas" },
  { id: "todas", label: "Todas" }
];
const KIND_LABEL = { calendario: "Calendário", design: "Design", ajustes: "Ajustes", aprovacao: "Aprovação" };

// Aba "Tarefas": peças e tarefas de checklist atribuídas a cada pessoa, com prazo.
// Funcionário vê só as dele; o administrador pode ver as de todos.
export default function TasksPage({ me, isAdmin, clients, team, onOpenClient, showToast }) {
  const todayIso = iso(new Date());
  const [who, setWho] = useState(me.id); // id de uma pessoa ou "all" (só admin)
  const [filter, setFilter] = useState("pendentes");
  const [cards, setCards] = useState([]);
  const tasks = useClientTasks(null, iso(addDays(parse(todayIso), -60)), showToast);
  const people = Object.fromEntries(team.map((p) => [p.id, p]));
  const clientName = Object.fromEntries(clients.map((c) => [c.id, c.name]));

  useEffect(() => {
    let alive = true;
    async function load() {
      let q = supabase
        .from("cards")
        .select("id, title, client_id, column_id, publish_date, due_date, assignee_id, format")
        .not("assignee_id", "is", null);
      if (who !== "all") q = q.eq("assignee_id", who);
      const { data, error } = await q;
      if (!alive) return;
      if (error) {
        console.error(error);
        showToast("Não consegui carregar as tarefas.");
        return;
      }
      setCards(data || []);
    }
    load();
    const channel = supabase
      .channel("tasks-cards-" + who)
      .on("postgres_changes", { event: "*", schema: "public", table: "cards" }, load)
      .subscribe();
    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [who]);

  const items = useMemo(() => {
    const list = [];
    cards.forEach((c) => {
      const done = c.column_id === "concluidos";
      const due = cardDue(c, todayIso);
      list.push({
        type: "card",
        key: "card-" + c.id,
        card: c,
        title: c.title || "Peça sem título",
        sub: (COLUMNS[COL_INDEX[c.column_id]] || { name: "Em estruturação" }).name,
        clientId: c.client_id,
        assignee: c.assignee_id,
        due: due?.due || null,
        done,
        status: done ? { id: "feito", label: "concluída" } : due ? due.status : { id: "futuro", label: "sem prazo" }
      });
    });
    const groups = checklistFor(todayIso);
    clients.forEach((client) => {
      groups.forEach((g) =>
        g.tasks.forEach((t) => {
          const row = tasks.rowOf(client.id, t);
          const assignee = row?.assignee_id || client.responsible_id;
          if (!assignee || (who !== "all" && assignee !== who)) return;
          const done = !!row?.done;
          list.push({
            type: "task",
            key: `task-${client.id}-${t.kind}-${t.period}`,
            task: t,
            title: t.label,
            sub: g.title,
            clientId: client.id,
            assignee,
            due: t.due,
            done,
            status: taskStatus(t, done, todayIso)
          });
        })
      );
    });
    return list.sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999"));
  }, [cards, clients, tasks, todayIso, who]);

  const counts = {
    pendentes: items.filter((i) => !i.done).length,
    atrasadas: items.filter((i) => i.status.id === "atrasado").length,
    executadas: items.filter((i) => i.done).length,
    todas: items.length
  };
  const visible = items.filter((i) =>
    filter === "pendentes" ? !i.done : filter === "atrasadas" ? i.status.id === "atrasado" : filter === "executadas" ? i.done : true
  );

  async function moveCard(card, column) {
    const { error } = await supabase.from("cards").update({ column_id: column }).eq("id", card.id);
    if (error) {
      console.error(error);
      showToast("Não consegui mover a peça.");
      return;
    }
    setCards((prev) => prev.map((c) => (c.id === card.id ? { ...c, column_id: column } : c)));
    showToast("Peça movida para “" + COLUMNS[COL_INDEX[column]].name + "”.");
  }

  return (
    <div className="tasks">
      <div className="tasks-bar">
        <div className="seg">
          {FILTERS.map((f) => (
            <button key={f.id} className={"seg-btn" + (filter === f.id ? " on" : "") + (f.id === "atrasadas" && counts.atrasadas ? " alert" : "")} onClick={() => setFilter(f.id)}>
              {f.label} <span>{counts[f.id]}</span>
            </button>
          ))}
        </div>
        {isAdmin && (
          <select value={who} onChange={(e) => setWho(e.target.value)} className="tasks-who">
            <option value="all">Todos os funcionários</option>
            {team.map((p) => (
              <option key={p.id} value={p.id}>
                {p.id === me.id ? "Minhas tarefas" : p.full_name || p.email}
              </option>
            ))}
          </select>
        )}
      </div>

      {visible.length === 0 && (
        <div className="empty-state">
          {filter === "atrasadas" ? "Nenhuma tarefa atrasada. 🎉" : filter === "executadas" ? "Nada executado ainda." : "Nenhuma tarefa por aqui."}
        </div>
      )}

      <div className="task-list">
        {visible.map((i) => (
          <div key={i.key} className={"task-item st-" + i.status.id + (i.done ? " done" : "")}>
            <div className="task-item-main">
              {i.type === "task" ? (
                <input
                  type="checkbox"
                  checked={i.done}
                  aria-label={"Marcar " + i.title}
                  onChange={(e) => tasks.toggle(i.clientId, i.task, e.target.checked)}
                />
              ) : (
                <span className="task-kind" title="Peça da linha de produção">
                  ▦
                </span>
              )}
              <div className="task-item-text">
                <button className="task-item-title" onClick={() => onOpenClient(i.clientId, i.type === "card" ? "producao" : "hub")}>
                  {i.title}
                </button>
                <div className="task-item-meta">
                  <strong>{clientName[i.clientId] || "Sem cliente"}</strong> · {i.type === "card" ? "Peça · " + i.sub : KIND_LABEL[i.task.kind] + " · " + i.sub}
                  {who === "all" && people[i.assignee] && <> · {people[i.assignee].full_name || people[i.assignee].email}</>}
                </div>
              </div>
            </div>
            <div className="task-item-side">
              {i.due && <span className="task-item-due">{shortDate(i.due)}</span>}
              <span className={"chip st-" + i.status.id}>{i.status.id === "feito" ? "✓ " + i.status.label : i.status.label}</span>
              {i.type === "card" && (
                <>
                  {!i.done && (
                    <button className="btn btn-plain task-done-btn" onClick={() => moveCard(i.card, "concluidos")}>
                      ✓ Concluir
                    </button>
                  )}
                  <select className="task-move" value={i.card.column_id} onChange={(e) => moveCard(i.card, e.target.value)} title="Mover para outra etapa">
                    {COLUMNS.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
