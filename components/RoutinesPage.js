"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { addDays, iso, parse, shortDate } from "../lib/deadlines";

const DAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const FILTERS = [
  { id: "todas", label: "Todas" },
  { id: "pendentes", label: "Pendentes" },
  { id: "executadas", label: "Executadas" }
];

// Rotina diária: cada funcionário marca o que executou no dia.
// Lembretes às 11:30 e 17:00 para quem tiver item sem marcar (agendados no banco).
// Cada pessoa vê só a própria rotina; o administrador vê a de todos e monta as rotinas.
export default function RoutinesPage({ me, isAdmin, clients, team, showToast }) {
  const [day, setDay] = useState(iso(new Date()));
  const [who, setWho] = useState(isAdmin ? "all" : me.id);
  const [filter, setFilter] = useState("todas");
  const [routines, setRoutines] = useState([]);
  const [checks, setChecks] = useState({}); // routine_id -> check
  const [managing, setManaging] = useState(false);
  const people = Object.fromEntries(team.map((p) => [p.id, p]));
  const clientName = Object.fromEntries(clients.map((c) => [c.id, c.name]));

  async function loadRoutines() {
    const { data, error } = await supabase.from("routines").select("*").order("title");
    if (error) {
      console.error(error);
      showToast("Não consegui carregar a rotina.");
      return;
    }
    setRoutines(data || []);
  }

  useEffect(() => {
    loadRoutines();
    const channel = supabase
      .channel("routines")
      .on("postgres_changes", { event: "*", schema: "public", table: "routines" }, loadRoutines)
      .subscribe();
    return () => supabase.removeChannel(channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let alive = true;
    async function load() {
      const { data } = await supabase.from("routine_checks").select("*").eq("day", day);
      if (alive) setChecks(Object.fromEntries((data || []).map((c) => [c.routine_id, c])));
    }
    load();
    const channel = supabase
      .channel("routine-checks-" + day)
      .on("postgres_changes", { event: "*", schema: "public", table: "routine_checks" }, load)
      .subscribe();
    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, [day]);

  const dow = parse(day).getDay();
  const todays = useMemo(
    () =>
      routines
        .filter((r) => r.active && r.weekdays.includes(dow) && (who === "all" || r.user_id === who))
        .sort((a, b) => (clientName[a.client_id] || "").localeCompare(clientName[b.client_id] || "", "pt-BR")),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [routines, dow, who, clients]
  );
  const visible = todays.filter((r) => (filter === "pendentes" ? !checks[r.id] : filter === "executadas" ? !!checks[r.id] : true));
  const doneCount = todays.filter((r) => checks[r.id]).length;

  // agrupa por pessoa (útil para o administrador)
  const byPerson = {};
  visible.forEach((r) => (byPerson[r.user_id] = byPerson[r.user_id] || []).push(r));

  async function toggle(r, done) {
    if (done) {
      const { data, error } = await supabase.from("routine_checks").insert({ routine_id: r.id, day }).select().single();
      if (error) return showToast("Não consegui marcar.");
      setChecks((prev) => ({ ...prev, [r.id]: data }));
    } else {
      const { error } = await supabase.from("routine_checks").delete().eq("routine_id", r.id).eq("day", day);
      if (error) return showToast("Não consegui desmarcar.");
      setChecks((prev) => {
        const next = { ...prev };
        delete next[r.id];
        return next;
      });
    }
  }

  const isToday = day === iso(new Date());

  return (
    <div className="tasks">
      <div className="tasks-bar">
        <div className="day-nav">
          <button className="back-btn" onClick={() => setDay(iso(addDays(parse(day), -1)))} aria-label="Dia anterior">
            ‹
          </button>
          <strong>{isToday ? "Hoje, " : ""}{shortDate(day)}</strong>
          <button className="back-btn" onClick={() => setDay(iso(addDays(parse(day), 1)))} aria-label="Próximo dia">
            ›
          </button>
          {!isToday && (
            <button className="btn btn-plain" onClick={() => setDay(iso(new Date()))}>
              Hoje
            </button>
          )}
        </div>
        <div className="seg">
          {FILTERS.map((f) => (
            <button key={f.id} className={"seg-btn" + (filter === f.id ? " on" : "")} onClick={() => setFilter(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
        {isAdmin && (
          <>
            <select value={who} onChange={(e) => setWho(e.target.value)} className="tasks-who">
              <option value="all">Todos os funcionários</option>
              {team.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name || p.email}
                </option>
              ))}
            </select>
            <button className="btn btn-gold" onClick={() => setManaging((m) => !m)}>
              {managing ? "Fechar" : "Montar rotinas"}
            </button>
          </>
        )}
      </div>

      {todays.length > 0 && (
        <div className="routine-progress">
          <div className="routine-bar">
            <span style={{ width: `${Math.round((100 * doneCount) / todays.length)}%` }}></span>
          </div>
          {doneCount} de {todays.length} executada(s)
          {isToday && doneCount < todays.length && <span className="hint"> · lembretes às 11:30 e 17:00 enquanto houver pendência</span>}
        </div>
      )}

      {isAdmin && managing && <RoutineManager routines={routines} clients={clients} team={team} clientName={clientName} people={people} showToast={showToast} onChange={loadRoutines} />}

      {todays.length === 0 && (
        <div className="empty-state">{routines.length === 0 ? "Nenhuma rotina cadastrada ainda." : "Nenhuma rotina para este dia."}</div>
      )}

      {Object.entries(byPerson).map(([uid, list]) => (
        <div key={uid} className="routine-group">
          {(who === "all" || isAdmin) && <h4>{people[uid]?.full_name || people[uid]?.email || "—"}</h4>}
          <div className="task-list">
            {list.map((r) => {
              const check = checks[r.id];
              return (
                <label key={r.id} className={"task-item routine" + (check ? " done st-feito" : "")}>
                  <div className="task-item-main">
                    <input type="checkbox" checked={!!check} onChange={(e) => toggle(r, e.target.checked)} />
                    <div className="task-item-text">
                      <span className="task-item-title plain">
                        {r.title}
                        {r.client_id && <> — {clientName[r.client_id]}</>}
                      </span>
                      <div className="task-item-meta">
                        {check
                          ? `feito às ${new Date(check.done_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` +
                            (check.done_by && check.done_by !== r.user_id ? " por " + (people[check.done_by]?.full_name || "administrador") : "")
                          : "pendente"}
                      </div>
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// Administrador: cria e remove rotinas
function RoutineManager({ routines, clients, team, clientName, people, showToast, onChange }) {
  const [form, setForm] = useState({ user_id: "", title: "Monitoramento", clientIds: [], weekdays: [1, 2, 3, 4, 5] });
  const [busy, setBusy] = useState(false);

  function toggleIn(list, v) {
    return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
  }

  async function create(e) {
    e.preventDefault();
    if (!form.user_id || !form.title.trim() || form.weekdays.length === 0) {
      showToast("Escolha o funcionário, o nome da tarefa e pelo menos um dia.");
      return;
    }
    setBusy(true);
    const targets = form.clientIds.length ? form.clientIds : [null];
    const rows = targets.map((client_id) => ({ user_id: form.user_id, client_id, title: form.title.trim(), weekdays: [...form.weekdays].sort() }));
    const { error } = await supabase.from("routines").insert(rows);
    setBusy(false);
    if (error) {
      console.error(error);
      showToast("Não consegui criar a rotina.");
      return;
    }
    showToast(rows.length + " rotina(s) criada(s).");
    setForm({ ...form, clientIds: [] });
    onChange();
  }

  async function remove(r) {
    if (!confirm(`Remover "${r.title}${r.client_id ? " — " + clientName[r.client_id] : ""}" da rotina de ${people[r.user_id]?.full_name || "—"}?`)) return;
    const { error } = await supabase.from("routines").delete().eq("id", r.id);
    if (error) return showToast("Não consegui remover.");
    onChange();
  }

  async function setActive(r, active) {
    const { error } = await supabase.from("routines").update({ active }).eq("id", r.id);
    if (error) return showToast("Não consegui salvar.");
    onChange();
  }

  const grouped = {};
  routines.forEach((r) => (grouped[r.user_id] = grouped[r.user_id] || []).push(r));

  return (
    <section className="routine-manager">
      <form onSubmit={create} className="routine-form">
        <h3>Nova rotina</h3>
        <div className="users-form">
          <div>
            <label htmlFor="rt-user">Funcionário</label>
            <select id="rt-user" value={form.user_id} onChange={(e) => setForm({ ...form, user_id: e.target.value })} required>
              <option value="">Escolha…</option>
              {team.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name || p.email}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="rt-title">Tarefa</label>
            <input id="rt-title" type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ex.: Monitoramento, Responder direct" />
          </div>
        </div>
        <label>Clientes (uma rotina para cada cliente marcado; nenhum = tarefa geral)</label>
        <div className="pick-list">
          {clients.map((c) => (
            <label key={c.id} className={"pick" + (form.clientIds.includes(c.id) ? " on" : "")}>
              <input type="checkbox" checked={form.clientIds.includes(c.id)} onChange={() => setForm({ ...form, clientIds: toggleIn(form.clientIds, c.id) })} />
              {c.name}
            </label>
          ))}
        </div>
        <label>Dias</label>
        <div className="pick-list">
          {DAYS.map((d, i) => (
            <label key={d} className={"pick" + (form.weekdays.includes(i) ? " on" : "")}>
              <input type="checkbox" checked={form.weekdays.includes(i)} onChange={() => setForm({ ...form, weekdays: toggleIn(form.weekdays, i) })} />
              {d}
            </label>
          ))}
        </div>
        <button className="btn btn-gold" type="submit" disabled={busy}>
          {busy ? "Criando…" : "Criar rotina"}
        </button>
      </form>

      <div className="routine-all">
        <h3>Rotinas cadastradas</h3>
        {routines.length === 0 && <div className="hint">Nenhuma ainda.</div>}
        {Object.entries(grouped).map(([uid, list]) => (
          <div key={uid} className="routine-group">
            <h4>{people[uid]?.full_name || people[uid]?.email || "—"}</h4>
            {list.map((r) => (
              <div key={r.id} className={"routine-row" + (r.active ? "" : " inactive")}>
                <span>
                  {r.title}
                  {r.client_id && <> — {clientName[r.client_id]}</>}
                  <small> · {r.weekdays.map((d) => DAYS[d]).join(", ")}</small>
                </span>
                <button className="btn btn-plain" onClick={() => setActive(r, !r.active)}>
                  {r.active ? "Pausar" : "Reativar"}
                </button>
                <button className="btn btn-plain danger" onClick={() => remove(r)}>
                  Remover
                </button>
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
