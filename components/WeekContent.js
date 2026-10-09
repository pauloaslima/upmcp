"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { isoDate, specialDates } from "../lib/holidays";
import { COLUMNS, COL_INDEX } from "../lib/pipeline";
import { addDays, iso, mondayOf, monthWeeks, parse, productionWeek, rangeLabel, shortDate, taskStatus, weeklyTasks } from "../lib/deadlines";
import { useCalendarEntries } from "../lib/useCalendarEntries";
import { useClientTasks } from "../lib/useClientTasks";
import { createCardFromEntry } from "../lib/production";
import { EntryChip, EntryEditor, MONTHS, SpecialDates, WEEKDAYS } from "./Calendar";
import AgentDialog from "./AgentDialog";
import ClearDialog from "./ClearDialog";
import { ArtDialog, canHaveArt } from "./ArtDesign";

const STEP_SHORT = { design: "Design", ajustes: "Ajustes", aprovacao: "Aprovação" };

// Conteúdo da semana.
// Equipe: todas as semanas (segunda a domingo) do mês vigente, do dia 1 ao último dia, com os
// prazos de produção de cada uma (2 semanas antes: design até quarta, ajustes quinta, aprovação
// sexta) e o botão que transforma os temas em peças. Setas levam ao mês anterior/seguinte.
// Cliente: só a semana atual, para consulta.
export default function WeekContent({ client, isStaff, showToast, onOpenProduction }) {
  const todayIso = iso(new Date());
  const thisMonday = mondayOf(parse(todayIso));
  const [ym, setYm] = useState(() => {
    const t = parse(todayIso);
    return { year: t.getFullYear(), month: t.getMonth() + 1 };
  });
  const weeks = useMemo(() => {
    const mondays = isStaff ? monthWeeks(ym.year, ym.month) : [thisMonday];
    return mondays.map((m) => Array.from({ length: 7 }, (_, d) => addDays(m, d)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ym, isStaff]);
  const shiftMonth = (delta) =>
    setYm(({ year, month }) => {
      const d = new Date(year, month - 1 + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() + 1 };
    });
  const inMonth = (d) => !isStaff || (d.getFullYear() === ym.year && d.getMonth() + 1 === ym.month);
  const first = iso(weeks[0][0]);
  const last = iso(weeks[weeks.length - 1][6]);
  const { entries, create, update, remove, removeMany, addLocal } = useCalendarEntries(client.id, first, last, showToast);
  const tasks = useClientTasks(isStaff ? client.id : false, iso(addDays(parse(first), -1)), showToast);
  const [cards, setCards] = useState({});
  const [editing, setEditing] = useState(null);
  const [agentWeek, setAgentWeek] = useState(null); // semana aberta no "Criar semana"
  const [artFor, setArtFor] = useState(null); // posts na janela "Criar arte" (um post ou a semana)
  const [generating, setGenerating] = useState(() => new Set()); // posts gerando conteúdo agora

  // 🗑 de cada post: exclui o tema do calendário (a peça ligada a ele, se houver, continua na produção)
  async function deleteOne(entry) {
    const msg = entry.card_id
      ? `Excluir “${entry.theme}” do calendário?\n\nA peça ligada a este post continua na linha de produção.`
      : `Excluir “${entry.theme}” do calendário?`;
    if (!confirm(msg)) return;
    await removeMany([entry]);
  }

  // "✨ Gerar" de um post só (ex.: demanda que veio do Backlog depois do calendário pronto)
  async function generateOne(entry) {
    const filled = entry.brief && (entry.brief.piece_text || entry.brief.important_notes || entry.brief.must_have);
    if (filled && !confirm("Este post já tem conteúdo no briefing. Gerar de novo e substituir?")) return;
    setGenerating((s) => new Set(s).add(entry.id));
    try {
      const { data } = await supabase.auth.getSession();
      const res = await fetch("/api/content-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + (data.session?.access_token || "") },
        body: JSON.stringify({ mode: "entry", client_id: client.id, entry_id: entry.id })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(json.error || "Não consegui gerar o conteúdo agora.");
        return;
      }
      addLocal(json.atualizados || []);
      showToast(entry.card_id ? "Conteúdo gerado. Também foi para as observações da peça." : "Conteúdo gerado. Abra o post para revisar o briefing.");
    } catch (err) {
      console.error(err);
      showToast("Não consegui falar com o servidor. Confira a internet e tente de novo.");
    } finally {
      setGenerating((s) => {
        const next = new Set(s);
        next.delete(entry.id);
        return next;
      });
    }
  }
  const [clearWeek, setClearWeek] = useState(null); // semana aberta no "Limpar semana"
  const [busy, setBusy] = useState(false);

  // situação das peças já criadas a partir dos temas (só a equipe enxerga)
  const linkedIds = isStaff ? entries.map((e) => e.card_id).filter(Boolean).sort().join(",") : "";
  useEffect(() => {
    if (!linkedIds) {
      setCards({});
      return;
    }
    let alive = true;
    supabase
      .from("cards")
      .select("id, column_id, title")
      .in("id", linkedIds.split(","))
      .then(({ data }) => {
        if (!alive) return;
        setCards(Object.fromEntries((data || []).map((c) => [c.id, c])));
      });
    return () => {
      alive = false;
    };
  }, [linkedIds]);

  const byDay = useMemo(() => {
    const map = {};
    entries.forEach((e) => (map[e.day] = map[e.day] || []).push(e));
    Object.values(map).forEach((l) => l.sort((a, b) => (a.post_time || "").localeCompare(b.post_time || "")));
    return map;
  }, [entries]);

  const special = useMemo(() => {
    const years = new Set([weeks[0][0].getFullYear(), weeks[weeks.length - 1][6].getFullYear()]);
    return Object.assign({}, ...[...years].map((y) => specialDates(y)));
  }, [weeks]);

  async function toProduction(entry) {
    try {
      const card = await createCardFromEntry(supabase, client, entry);
      addLocal([{ ...entry, card_id: card.id }]);
      setCards((prev) => ({ ...prev, [card.id]: card }));
      return true;
    } catch (error) {
      console.error(error);
      showToast("Não consegui criar a peça.");
      return false;
    }
  }

  async function sendWeek(days) {
    const keys = new Set(days.map(iso));
    const pending = entries.filter((e) => keys.has(e.day) && e.theme && !(e.card_id && cards[e.card_id]));
    if (!pending.length) return;
    setBusy(true);
    let n = 0;
    for (const entry of pending) if (await toProduction(entry)) n++;
    setBusy(false);
    showToast(n + (n === 1 ? " peça criada" : " peças criadas") + " em “Em estruturação”.");
  }

  return (
    <div className="cal week">
      <div className="cal-head">
        {isStaff && (
          <button className="cal-nav" onClick={() => shiftMonth(-1)} aria-label="Mês anterior">
            ‹
          </button>
        )}
        <h2 className="cal-title">
          {isStaff ? (
            <>
              {MONTHS[ym.month - 1]} <span>|</span> {ym.year}
            </>
          ) : (
            `Semana ${rangeLabel(first, last)}`
          )}
        </h2>
        {isStaff && (
          <>
            <button className="cal-nav" onClick={() => shiftMonth(1)} aria-label="Próximo mês">
              ›
            </button>
            <button
              className="cal-today"
              onClick={() => {
                const t = parse(todayIso);
                setYm({ year: t.getFullYear(), month: t.getMonth() + 1 });
              }}
            >
              Mês atual
            </button>
          </>
        )}
      </div>

      {isStaff && (
        <div className="week-bar">
          <span>
            Conteúdo sempre com <strong>2 semanas de antecedência</strong>: design até quarta, ajustes na quinta e envio ao cliente na sexta da
            semana de produção.
          </span>
          <div className="week-bar-actions">
            <button className="btn btn-plain" onClick={onOpenProduction}>
              Ver linha de produção
            </button>
          </div>
        </div>
      )}

      {weeks.map((days) => {
        const pubMonday = days[0];
        const pubIso = iso(pubMonday);
        const offset = Math.round((pubMonday - thisMonday) / (7 * 86400000));
        const prod = productionWeek(pubMonday);
        const steps = weeklyTasks(pubMonday);
        const tag =
          offset === 0 ? "semana atual" : offset === 1 ? "próxima semana" : offset === 2 ? "em produção agora" : offset > 2 ? "planejamento" : "passada";
        const weekEntries = days.flatMap((d) => byDay[iso(d)] || []);
        const pending = weekEntries.filter((e) => e.theme && !(e.card_id && cards[e.card_id])).length;
        const artEntries = weekEntries.filter(canHaveArt);

        return (
          <section key={pubIso} className={"week-block" + (offset === 2 ? " producing" : "")}>
            <div className="week-block-head">
              <div>
                <h3>
                  Semana {rangeLabel(pubIso, iso(days[6]))} <span className="week-tag">{tag}</span>
                </h3>
                {isStaff && <div className="week-prod">produção em {rangeLabel(prod.start, prod.end)}</div>}
              </div>
              {isStaff && (
                <div className="week-deadlines">
                  {steps.map((t) => {
                    const st = taskStatus(t, tasks.isDone(client.id, t), todayIso);
                    return (
                      <span key={t.kind} className={"chip st-" + st.id} title={t.label}>
                        {STEP_SHORT[t.kind]} {shortDate(t.due)} · {st.id === "feito" ? "✓" : st.label}
                      </span>
                    );
                  })}
                  <button className="btn btn-plain week-ai" onClick={() => setAgentWeek({ start: pubIso, end: iso(days[6]), count: weekEntries.length })}>
                    ✨ Criar semana
                  </button>
                  <button
                    className="btn btn-plain week-art"
                    disabled={!artEntries.length}
                    title={artEntries.length ? "Criar as artes dos estáticos e carrosséis desta semana" : "Nenhum estático ou carrossel com tema nesta semana"}
                    onClick={() => setArtFor({ entries: artEntries, week: true })}
                  >
                    🎨 Criar artes da semana
                  </button>
                  <button
                    className="btn btn-plain danger week-clear"
                    disabled={!weekEntries.length}
                    title={weekEntries.length ? "" : "Não há temas nesta semana"}
                    onClick={() => setClearWeek({ start: pubIso, end: iso(days[6]) })}
                  >
                    🗑 Limpar semana
                  </button>
                  <button className="btn btn-gold week-send-all" disabled={busy || pending === 0} onClick={() => sendWeek(days)}>
                    {pending ? `Criar ${pending} peça(s)` : "Tudo na produção"}
                  </button>
                </div>
              )}
            </div>

            <div className="week-days">
              {days.map((d) => {
                const key = iso(d);
                const list = byDay[key] || [];
                return (
                  <div key={key} className={"week-day" + (key === todayIso ? " is-today" : "") + (inMonth(d) ? "" : " out-month")}>
                    <div className="week-day-head">
                      <span className="cal-daynum">{d.getDate()}</span>
                      <strong>{WEEKDAYS[d.getDay()]}</strong>
                      {isStaff && (
                        <button className="cal-add visible" title="Adicionar tema" onClick={() => setEditing({ day: key })}>
                          +
                        </button>
                      )}
                    </div>
                    <SpecialDates list={special[isoDate(d)] || []} />
                    {list.length === 0 && <div className="week-empty">-</div>}
                    {list.map((entry) => {
                      const card = entry.card_id && cards[entry.card_id];
                      return (
                        <div key={entry.id} className="week-entry">
                          <EntryChip entry={entry} forClient={!isStaff} onClick={isStaff ? () => setEditing({ entry }) : null} />
                          {isStaff && (
                            <div className="week-entry-actions">
                              {card ? (
                                <span className="week-status" style={{ borderColor: (COLUMNS[COL_INDEX[card.column_id]] || {}).color }}>
                                  {(COLUMNS[COL_INDEX[card.column_id]] || { name: "Em estruturação" }).name}
                                </span>
                              ) : (
                                <button
                                  className="btn btn-plain week-send"
                                  disabled={!entry.theme}
                                  onClick={() => toProduction(entry).then((ok) => ok && showToast("Peça criada em “Em estruturação”."))}
                                >
                                  Criar peça →
                                </button>
                              )}
                              <span className="week-mini">
                                {canHaveArt(entry) && (
                                  <button
                                    type="button"
                                    className="mini-link"
                                    title={entry.art?.length ? "Criar a arte de novo" : "Criar a arte deste post"}
                                    onClick={() => setArtFor({ entries: [entry], week: false })}
                                  >
                                    🎨 Arte
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className="mini-link"
                                  disabled={!entry.theme || generating.has(entry.id) || (entry.brief_status && entry.brief_status !== "rascunho")}
                                  title={
                                    entry.brief_status && entry.brief_status !== "rascunho"
                                      ? "O briefing já está pronto ou enviado ao design"
                                      : "Gerar o conteúdo só deste post"
                                  }
                                  onClick={() => generateOne(entry)}
                                >
                                  {generating.has(entry.id) ? (
                                    <>
                                      <span className="spinner small" aria-hidden="true"></span> gerando…
                                    </>
                                  ) : (
                                    "✨ Gerar"
                                  )}
                                </button>
                                <button
                                  type="button"
                                  className="mini-link danger"
                                  title="Excluir este conteúdo"
                                  aria-label={"Excluir " + entry.theme}
                                  disabled={generating.has(entry.id)}
                                  onClick={() => deleteOne(entry)}
                                >
                                  🗑
                                </button>
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      {clearWeek && (
        <ClearDialog
          title="Limpar semana"
          scope={`${client.name} · posts de ${rangeLabel(clearWeek.start, clearWeek.end)}`}
          entries={entries.filter((e) => e.day >= clearWeek.start && e.day <= clearWeek.end)}
          onClose={() => setClearWeek(null)}
          onConfirm={removeMany}
        />
      )}

      {artFor && (
        <ArtDialog
          client={client}
          entries={artFor.entries}
          week={artFor.week}
          onCreated={(updated) => addLocal([updated])}
          onClose={() => setArtFor(null)}
          showToast={showToast}
        />
      )}

      {agentWeek && (
        <AgentDialog
          client={client}
          weekStart={agentWeek.start}
          weekEnd={agentWeek.end}
          existingCount={agentWeek.count}
          onClose={() => setAgentWeek(null)}
          onCreated={addLocal}
          showToast={showToast}
        />
      )}

      {editing && (
        <EntryEditor client={client} showToast={showToast}
          key={editing.entry ? editing.entry.id : editing.day}
          day={editing.entry ? editing.entry.day : editing.day}
          entry={editing.entry}
          specials={special[editing.entry ? editing.entry.day : editing.day] || []}
          onClose={() => setEditing(null)}
          onSave={async (values) => {
            const ok = editing.entry ? await update(editing.entry.id, values) : await create({ day: editing.day, ...values });
            if (ok) setEditing(null);
          }}
          onDelete={
            editing.entry
              ? async () => {
                  if (await remove(editing.entry.id)) setEditing(null);
                }
              : null
          }
        />
      )}
    </div>
  );
}
