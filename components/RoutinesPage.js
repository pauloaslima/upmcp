"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { addDays, iso, parse, shortDate } from "../lib/deadlines";
import { postTitle, usePostTasks } from "../lib/usePostTasks";
import { DAYS, FREQUENCIES, describeRoutine, routineDue } from "../lib/routines";

const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const FILTERS = [
  { id: "todas", label: "Todas" },
  { id: "pendentes", label: "Pendentes" },
  { id: "executadas", label: "Executadas" }
];

// Rotinas: cada pessoa marca o que executou no dia. Frequência semanal, quinzenal ou mensal (lib/routines.js).
// Visão do dia (marcar) e visão do mês (calendário para se localizar; clicar no dia abre o dia).
// Os posts do calendário daquele dia entram como "Publicar post" para o responsável pelo cliente.
// Lembretes às 11:30 e 17:00 para quem tiver item sem marcar (agendados no banco).
// Cada pessoa vê só a própria rotina; o administrador vê a de todos e monta as rotinas.
export default function RoutinesPage({ me, isAdmin, clients, team, showToast }) {
  const [day, setDay] = useState(iso(new Date()));
  const [who, setWho] = useState(isAdmin ? "all" : me.id);
  const [filter, setFilter] = useState("todas");
  const [routines, setRoutines] = useState([]);
  const [checks, setChecks] = useState({}); // routine_id -> check
  const [managing, setManaging] = useState(false);
  const [mode, setMode] = useState("dia"); // "dia" | "mes"
  const people = Object.fromEntries(team.map((p) => [p.id, p]));
  const clientName = Object.fromEntries(clients.map((c) => [c.id, c.name]));
  const responsibleOf = Object.fromEntries(clients.map((c) => [c.id, c.responsible_id]));
  const postTasks = usePostTasks(day, day, me, showToast);

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

  const todays = useMemo(
    () =>
      routines
        .filter((r) => r.active && routineDue(r, day) && (who === "all" || r.user_id === who))
        .sort((a, b) => (clientName[a.client_id] || "").localeCompare(clientName[b.client_id] || "", "pt-BR")),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [routines, day, who, clients]
  );
  // posts do dia: do responsável pelo cliente (sem responsável, só o administrador vê, em "Sem responsável")
  const todaysPosts = postTasks.posts
    .map((p) => ({ ...p, user_id: responsibleOf[p.client_id] || "sem-responsavel" }))
    .filter((p) => who === "all" || p.user_id === who)
    .sort((a, b) => (a.post_time || "").localeCompare(b.post_time || "") || (clientName[a.client_id] || "").localeCompare(clientName[b.client_id] || "", "pt-BR"));
  const show = (done) => (filter === "pendentes" ? !done : filter === "executadas" ? done : true);
  const visible = todays.filter((r) => show(!!checks[r.id]));
  const visiblePosts = todaysPosts.filter((p) => show(!!p.published_at));
  const total = todays.length + todaysPosts.length;
  const doneCount = todays.filter((r) => checks[r.id]).length + todaysPosts.filter((p) => p.published_at).length;

  // agrupa por pessoa (útil para o administrador): posts a publicar primeiro, depois a rotina
  const byPerson = {};
  visiblePosts.forEach((p) => (byPerson[p.user_id] = byPerson[p.user_id] || []).push({ kind: "post", post: p }));
  visible.forEach((r) => (byPerson[r.user_id] = byPerson[r.user_id] || []).push({ kind: "rotina", r }));

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
          <button className={"seg-btn" + (mode === "dia" ? " on" : "")} onClick={() => setMode("dia")}>
            Dia
          </button>
          <button className={"seg-btn" + (mode === "mes" ? " on" : "")} onClick={() => setMode("mes")}>
            Mês
          </button>
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
              <option value="all">Toda a equipe</option>
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

      {mode === "dia" && total > 0 && (
        <div className="routine-progress">
          <div className="routine-bar">
            <span style={{ width: `${Math.round((100 * doneCount) / total)}%` }}></span>
          </div>
          {doneCount} de {total} executada(s)
          {isToday && doneCount < total && <span className="hint"> · lembretes às 11:30 e 17:00 enquanto houver pendência</span>}
        </div>
      )}

      {isAdmin && managing && <RoutineManager me={me} routines={routines} clients={clients} team={team} clientName={clientName} people={people} showToast={showToast} onChange={loadRoutines} />}

      {mode === "mes" && (
        <RoutineMonth
          day={day}
          routines={routines.filter((r) => r.active && (who === "all" || r.user_id === who))}
          clientName={clientName}
          onPick={(d) => {
            setDay(d);
            setMode("dia");
          }}
          onMonth={(d) => setDay(d)}
        />
      )}

      {mode === "dia" && total === 0 && (
        <div className="empty-state">{routines.length === 0 && !todaysPosts.length ? "Nenhuma rotina cadastrada ainda." : "Nenhuma rotina para este dia."}</div>
      )}

      {mode === "dia" && Object.entries(byPerson).map(([uid, list]) => (
        <div key={uid} className="routine-group">
          {(who === "all" || isAdmin) && <h4>{uid === "sem-responsavel" ? "Sem responsável pelo cliente" : people[uid]?.full_name || people[uid]?.email || "-"}</h4>}
          <div className="task-list">
            {list.map((item) => {
              if (item.kind === "post") {
                const p = item.post;
                return (
                  <label key={"post-" + p.id} className={"task-item routine post-task" + (p.published_at ? " done st-feito" : "")}>
                    <div className="task-item-main">
                      <input type="checkbox" checked={!!p.published_at} onChange={(e) => postTasks.toggle(p, e.target.checked)} />
                      <div className="task-item-text">
                        <span className="task-item-title plain">
                          {postTitle(p)} | {clientName[p.client_id]}
                        </span>
                        <div className="task-item-meta">
                          {[p.format, p.post_time].filter(Boolean).join(" · ")}
                          {p.format || p.post_time ? " · " : ""}
                          {p.published_at
                            ? `publicado às ${new Date(p.published_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` +
                              (p.published_by && p.published_by !== p.user_id ? " por " + (people[p.published_by]?.full_name || "outra pessoa") : "")
                            : "a publicar"}
                        </div>
                      </div>
                    </div>
                  </label>
                );
              }
              const r = item.r;
              const check = checks[r.id];
              return (
                <label key={r.id} className={"task-item routine" + (check ? " done st-feito" : "")}>
                  <div className="task-item-main">
                    <input type="checkbox" checked={!!check} onChange={(e) => toggle(r, e.target.checked)} />
                    <div className="task-item-text">
                      <span className="task-item-title plain">
                        {r.title}
                        {r.client_id && <> | {clientName[r.client_id]}</>}
                      </span>
                      <div className="task-item-meta">
                        {r.frequency && r.frequency !== "semanal" ? describeRoutine(r) + " · " : ""}
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

// Calendário do mês: as rotinas de cada dia (só para se localizar; marcar é na visão do dia)
function RoutineMonth({ day, routines, clientName, onPick, onMonth }) {
  const d = parse(day);
  const year = d.getFullYear();
  const month = d.getMonth();
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0).getDate();
  const [checks, setChecks] = useState(new Set());
  const from = iso(first);
  const to = iso(new Date(year, month, last));
  useEffect(() => {
    let alive = true;
    supabase
      .from("routine_checks")
      .select("routine_id, day")
      .gte("day", from)
      .lte("day", to)
      .then(({ data }) => alive && setChecks(new Set((data || []).map((c) => c.routine_id + "|" + c.day))));
    return () => {
      alive = false;
    };
  }, [from, to]);
  const cells = [...Array(first.getDay()).fill(null), ...Array.from({ length: last }, (_, i) => iso(new Date(year, month, i + 1)))];
  const today = iso(new Date());
  return (
    <div className="routine-month">
      <div className="day-nav">
        <button className="back-btn" onClick={() => onMonth(iso(new Date(year, month - 1, 1)))} aria-label="Mês anterior">‹</button>
        <strong>
          {MONTHS[month]} de {year}
        </strong>
        <button className="back-btn" onClick={() => onMonth(iso(new Date(year, month + 1, 1)))} aria-label="Próximo mês">›</button>
      </div>
      <div className="rm-grid">
        {DAYS.map((w) => (
          <div key={w} className="rm-weekday">{w}</div>
        ))}
        {cells.map((key, i) => {
          if (!key) return <div key={"x" + i} className="rm-cell out" />;
          const list = routines.filter((r) => routineDue(r, key));
          const done = list.filter((r) => checks.has(r.id + "|" + key)).length;
          return (
            <button key={key} type="button" className={"rm-cell" + (key === today ? " today" : "") + (key === day ? " picked" : "")} onClick={() => onPick(key)}>
              <span className="rm-num">
                {Number(key.slice(8))}
                {list.length > 0 && <span className={"rm-count" + (done === list.length ? " all" : "")}>{done}/{list.length}</span>}
              </span>
              {list.slice(0, 3).map((r) => (
                <span key={r.id} className={"rm-item" + (checks.has(r.id + "|" + key) ? " done" : "")} title={r.title + (r.client_id ? " | " + clientName[r.client_id] : "")}>
                  {r.title}
                  {r.client_id ? " | " + (clientName[r.client_id] || "") : ""}
                </span>
              ))}
              {list.length > 3 && <span className="rm-more">+{list.length - 3}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Administrador: cria, edita, pausa e remove rotinas
const EMPTY = (me) => ({ user_id: me?.id || "", title: "", frequency: "semanal", weekdays: [1, 2, 3, 4, 5], month_day: 5, start_date: iso(new Date()), clientIds: [], client_id: "" });

function RoutineManager({ me, routines, clients, team, clientName, people, showToast, onChange }) {
  const [form, setForm] = useState(EMPTY(me));
  const [editing, setEditing] = useState(null); // rotina sendo editada
  const [busy, setBusy] = useState(false);

  function toggleIn(list, v) {
    return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
  }

  const ruleOk = form.frequency === "mensal" ? form.month_day >= 1 && form.month_day <= 31 : form.weekdays.length > 0;
  const rule = () => ({
    frequency: form.frequency,
    weekdays: form.frequency === "mensal" ? [] : [...form.weekdays].sort(),
    month_day: form.frequency === "mensal" ? Number(form.month_day) : null,
    start_date: form.start_date || iso(new Date())
  });

  async function submit(e) {
    e.preventDefault();
    if (!form.user_id || !form.title.trim() || !ruleOk) {
      showToast("Escolha quem faz, escreva a rotina e defina quando ela acontece.");
      return;
    }
    setBusy(true);
    if (editing) {
      const { error } = await supabase
        .from("routines")
        .update({ user_id: form.user_id, title: form.title.trim(), client_id: form.client_id || null, ...rule() })
        .eq("id", editing.id);
      setBusy(false);
      if (error) {
        console.error(error);
        showToast(/frequency|month_day|start_date/.test(error.message) ? "Falta rodar o SQL 020_rotinas_frequencia.sql no Supabase." : "Não consegui salvar a rotina.");
        return;
      }
      showToast("Rotina atualizada.");
      setEditing(null);
      setForm(EMPTY(me));
      onChange();
      return;
    }
    const targets = form.clientIds.length ? form.clientIds : [null];
    const rows = targets.map((client_id) => ({ user_id: form.user_id, client_id, title: form.title.trim(), ...rule() }));
    const { error } = await supabase.from("routines").insert(rows);
    setBusy(false);
    if (error) {
      console.error(error);
      showToast(/frequency|month_day|start_date/.test(error.message) ? "Falta rodar o SQL 020_rotinas_frequencia.sql no Supabase." : "Não consegui criar a rotina.");
      return;
    }
    showToast(rows.length + " rotina(s) criada(s).");
    setForm({ ...EMPTY(me), user_id: form.user_id });
    onChange();
  }

  function edit(r) {
    setEditing(r);
    setForm({
      user_id: r.user_id,
      title: r.title,
      frequency: r.frequency || "semanal",
      weekdays: r.weekdays?.length ? r.weekdays : [1, 2, 3, 4, 5],
      month_day: r.month_day || 5,
      start_date: r.start_date || iso(new Date()),
      clientIds: [],
      client_id: r.client_id || ""
    });
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function remove(r) {
    if (!confirm(`Remover "${r.title}${r.client_id ? " | " + clientName[r.client_id] : ""}" da rotina de ${people[r.user_id]?.full_name || "-"}?`)) return;
    const { error } = await supabase.from("routines").delete().eq("id", r.id);
    if (error) return showToast("Não consegui remover.");
    if (editing?.id === r.id) {
      setEditing(null);
      setForm(EMPTY(me));
    }
    onChange();
  }

  async function setActive(r, active) {
    const { error } = await supabase.from("routines").update({ active }).eq("id", r.id);
    if (error) return showToast("Não consegui salvar.");
    onChange();
  }

  const grouped = {};
  routines.forEach((r) => (grouped[r.user_id] = grouped[r.user_id] || []).push(r));
  const allClients = clients.length > 0 && form.clientIds.length === clients.length;

  return (
    <section className="routine-manager">
      <form onSubmit={submit} className="routine-form">
        <h3>{editing ? "Editar rotina" : "Nova rotina"}</h3>
        <div className="users-form">
          <div>
            <label htmlFor="rt-title">Rotina</label>
            <input id="rt-title" type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ex.: Emitir nota fiscal, Enviar relatório, Monitoramento" autoFocus={!!editing} />
          </div>
          <div>
            <label htmlFor="rt-user">Quem faz</label>
            <select id="rt-user" value={form.user_id} onChange={(e) => setForm({ ...form, user_id: e.target.value })} required>
              <option value="">Escolha…</option>
              {team.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name || p.email}
                  {p.id === me?.id ? " (eu)" : ""}
                </option>
              ))}
            </select>
          </div>
        </div>

        <label>Frequência</label>
        <div className="pick-list">
          {FREQUENCIES.map((f) => (
            <label key={f.id} className={"pick" + (form.frequency === f.id ? " on" : "")}>
              <input type="radio" name="rt-freq" checked={form.frequency === f.id} onChange={() => setForm({ ...form, frequency: f.id })} />
              {f.label}
            </label>
          ))}
        </div>

        {form.frequency === "mensal" ? (
          <div className="rt-inline">
            <label htmlFor="rt-day">Todo mês no dia</label>
            <input id="rt-day" type="number" min={1} max={31} value={form.month_day} onChange={(e) => setForm({ ...form, month_day: Number(e.target.value) || "" })} />
            <span className="hint">Em meses mais curtos, vale o último dia.</span>
          </div>
        ) : (
          <>
            <label>{form.frequency === "quinzenal" ? "Dia(s) da semana, a cada 15 dias" : "Dias da semana"}</label>
            <div className="pick-list">
              {DAYS.map((d, i) => (
                <label key={d} className={"pick" + (form.weekdays.includes(i) ? " on" : "")}>
                  <input type="checkbox" checked={form.weekdays.includes(i)} onChange={() => setForm({ ...form, weekdays: toggleIn(form.weekdays, i) })} />
                  {d}
                </label>
              ))}
            </div>
            {form.frequency === "quinzenal" && (
              <div className="rt-inline">
                <label htmlFor="rt-start">A partir de</label>
                <input id="rt-start" type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
              </div>
            )}
          </>
        )}

        {editing ? (
          <>
            <label htmlFor="rt-client">Cliente</label>
            <select id="rt-client" value={form.client_id} onChange={(e) => setForm({ ...form, client_id: e.target.value })}>
              <option value="">Nenhum (rotina geral)</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </>
        ) : (
          <>
            <label>Clientes (uma rotina para cada cliente marcado; nenhum = rotina geral)</label>
            <div className="pick-list">
              <label className={"pick pick-all" + (allClients ? " on" : "")}>
                <input type="checkbox" checked={allClients} onChange={() => setForm({ ...form, clientIds: allClients ? [] : clients.map((c) => c.id) })} />
                Todos os clientes
              </label>
              {clients.map((c) => (
                <label key={c.id} className={"pick" + (form.clientIds.includes(c.id) ? " on" : "")}>
                  <input type="checkbox" checked={form.clientIds.includes(c.id)} onChange={() => setForm({ ...form, clientIds: toggleIn(form.clientIds, c.id) })} />
                  {c.name}
                </label>
              ))}
            </div>
          </>
        )}

        <div className="rt-actions">
          <button className="btn btn-gold" type="submit" disabled={busy}>
            {busy ? "Salvando…" : editing ? "Salvar alterações" : form.clientIds.length > 1 ? `Criar ${form.clientIds.length} rotinas` : "Criar rotina"}
          </button>
          {editing && (
            <button
              type="button"
              className="btn btn-plain"
              onClick={() => {
                setEditing(null);
                setForm(EMPTY(me));
              }}
            >
              Cancelar
            </button>
          )}
        </div>
      </form>

      <div className="routine-all">
        <h3>Rotinas cadastradas</h3>
        {routines.length === 0 && <div className="hint">Nenhuma ainda.</div>}
        {Object.entries(grouped).map(([uid, list]) => (
          <div key={uid} className="routine-group">
            <h4>{people[uid]?.full_name || people[uid]?.email || "-"}</h4>
            {list.map((r) => (
              <div key={r.id} className={"routine-row" + (r.active ? "" : " inactive") + (editing?.id === r.id ? " editing" : "")}>
                <span>
                  {r.title}
                  {r.client_id && <> | {clientName[r.client_id]}</>}
                  <small> · {describeRoutine(r)}</small>
                </span>
                <button className="btn btn-plain" onClick={() => edit(r)}>
                  Editar
                </button>
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
