"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { isoDate, specialDates } from "../lib/holidays";
import { COLUMNS, COL_INDEX, FORMATS, defaultCard } from "../lib/pipeline";
import { addDays, iso, mondayOf, monthWeeks, parse, productionWeek, rangeLabel, shortDate, taskStatus, weeklyTasks } from "../lib/deadlines";
import { useCalendarEntries } from "../lib/useCalendarEntries";
import { useClientTasks } from "../lib/useClientTasks";
import { briefDescription, briefWithDefaults } from "../lib/brief";
import { EntryChip, EntryEditor, MONTHS, SpecialDates, WEEKDAYS } from "./Calendar";

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
  const { entries, create, update, remove } = useCalendarEntries(client.id, first, last, showToast);
  const tasks = useClientTasks(isStaff ? client.id : false, iso(addDays(parse(first), -1)), showToast);
  const [cards, setCards] = useState({});
  const [editing, setEditing] = useState(null);
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
    const { data: card, error } = await supabase
      .from("cards")
      .insert({
        ...defaultCard("estruturacao"),
        title: entry.theme,
        format: FORMATS.includes(entry.format) ? entry.format : "Outro",
        publish_date: entry.day,
        client: client.name,
        client_id: client.id,
        assignee_id: client.responsible_id || null,
        // fotos e referências do tema viram anexos da peça; a identidade vai para "referência visual"
        attachments: [...(entry.photos || []), ...(entry.refs || [])],
        visual_ref:
          entry.use_client_identity === false
            ? entry.identity_notes || ""
            : client.identity
              ? "Identidade do cliente: " + client.identity
              : ""
      })
      .select("id, column_id, title")
      .single();
    if (error) {
      console.error(error);
      showToast("Não consegui criar a peça.");
      return false;
    }
    if (entry.notes) await supabase.from("card_comments").insert({ card_id: card.id, body: "Do calendário: " + entry.notes });
    if (entry.brief && Object.keys(entry.brief).length) {
      const brief = briefWithDefaults(entry, entry.day);
      await supabase.from("card_comments").insert({ card_id: card.id, body: "Briefing para o design:\n\n" + briefDescription(entry, brief, client.identity) });
      if (brief.piece_text) await supabase.from("cards").update({ copy: brief.piece_text }).eq("id", card.id);
    }
    await update(entry.id, { card_id: card.id });
    setCards((prev) => ({ ...prev, [card.id]: card }));
    return true;
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
                    {list.length === 0 && <div className="week-empty">—</div>}
                    {list.map((entry) => {
                      const card = entry.card_id && cards[entry.card_id];
                      return (
                        <div key={entry.id} className="week-entry">
                          <EntryChip entry={entry} onClick={isStaff ? () => setEditing({ entry }) : null} />
                          {isStaff &&
                            (card ? (
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
                            ))}
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
