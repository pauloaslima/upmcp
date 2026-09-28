"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { isoDate, specialDates } from "../lib/holidays";
import { COLUMNS, COL_INDEX, FORMATS, defaultCard } from "../lib/pipeline";
import { useCalendarEntries } from "../lib/useCalendarEntries";
import { EntryChip, EntryEditor, SpecialDates, WEEKDAYS } from "./Calendar";

function mondayOf(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}
function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}
const short = (d) => String(d.getDate()).padStart(2, "0") + "/" + String(d.getMonth() + 1).padStart(2, "0");

// Conteúdo da semana: os temas da semana (vindos do calendário mensal) viram peças
// na linha de produção do cliente com um clique.
export default function WeekContent({ client, showToast, onOpenProduction }) {
  const [monday, setMonday] = useState(() => mondayOf(new Date()));
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(monday, i)), [monday]);
  const first = isoDate(days[0]);
  const last = isoDate(days[6]);
  const { entries, create, update, remove } = useCalendarEntries(client.id, first, last, showToast);
  const [cards, setCards] = useState({}); // peças ligadas aos temas
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const today = isoDate(new Date());

  const linkedIds = entries.map((e) => e.card_id).filter(Boolean).sort().join(",");
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
        const map = {};
        (data || []).forEach((c) => (map[c.id] = c));
        setCards(map);
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

  const pending = entries.filter((e) => e.theme && !(e.card_id && cards[e.card_id]));

  async function toProduction(entry) {
    const { data: card, error } = await supabase
      .from("cards")
      .insert({
        ...defaultCard("estruturacao"),
        title: entry.theme,
        format: FORMATS.includes(entry.format) ? entry.format : "Outro",
        publish_date: entry.day,
        client: client.name,
        client_id: client.id
      })
      .select("id, column_id, title")
      .single();
    if (error) {
      console.error(error);
      showToast("Não consegui criar a peça.");
      return false;
    }
    if (entry.notes) {
      await supabase.from("card_comments").insert({ card_id: card.id, body: "Do calendário: " + entry.notes });
    }
    await update(entry.id, { card_id: card.id });
    setCards((prev) => ({ ...prev, [card.id]: card }));
    return true;
  }

  async function allToProduction() {
    setBusy(true);
    let n = 0;
    for (const entry of pending) if (await toProduction(entry)) n++;
    setBusy(false);
    showToast(n + (n === 1 ? " peça criada" : " peças criadas") + " em “Em estruturação”.");
  }

  const special = { ...specialDates(days[0].getFullYear()), ...specialDates(days[6].getFullYear()) };

  return (
    <div className="cal week">
      <div className="cal-head">
        <button className="cal-nav" onClick={() => setMonday((m) => addDays(m, -7))} aria-label="Semana anterior">
          ‹
        </button>
        <h2 className="cal-title">
          Semana {short(days[0])} <span>a</span> {short(days[6])}
        </h2>
        <button className="cal-nav" onClick={() => setMonday((m) => addDays(m, 7))} aria-label="Próxima semana">
          ›
        </button>
        <button className="cal-today" onClick={() => setMonday(mondayOf(new Date()))}>
          Semana atual
        </button>
      </div>

      <div className="week-bar">
        <span>
          {entries.length === 0
            ? "Nenhum tema nesta semana. Adicione pelo + de cada dia ou pelo calendário mensal."
            : `${entries.length} tema(s) · ${pending.length} ainda sem peça na produção`}
        </span>
        <div className="week-bar-actions">
          <button className="btn btn-plain" onClick={onOpenProduction}>
            Ver linha de produção
          </button>
          <button className="btn btn-gold" disabled={busy || pending.length === 0} onClick={allToProduction}>
            {busy ? "Criando…" : "Enviar todos para a produção"}
          </button>
        </div>
      </div>

      <div className="week-days">
        {days.map((d) => {
          const key = isoDate(d);
          const list = byDay[key] || [];
          return (
            <div key={key} className={"week-day" + (key === today ? " is-today" : "")}>
              <div className="week-day-head">
                <span className="cal-daynum">{d.getDate()}</span>
                <strong>{WEEKDAYS[d.getDay()]}</strong>
                <button className="cal-add visible" title="Adicionar tema" onClick={() => setEditing({ day: key })}>
                  +
                </button>
              </div>
              <SpecialDates list={special[key] || []} />
              {list.map((entry) => {
                const card = entry.card_id && cards[entry.card_id];
                return (
                  <div key={entry.id} className="week-entry">
                    <EntryChip entry={entry} onClick={() => setEditing({ entry })} />
                    {card ? (
                      <span className="week-status" style={{ borderColor: (COLUMNS[COL_INDEX[card.column_id]] || {}).color }}>
                        Na produção · {(COLUMNS[COL_INDEX[card.column_id]] || { name: "Em estruturação" }).name}
                      </span>
                    ) : (
                      <button className="btn btn-plain week-send" disabled={!entry.theme} onClick={() => toProduction(entry).then((ok) => ok && showToast("Peça criada em “Em estruturação”."))}>
                        Criar peça →
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {editing && (
        <EntryEditor
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
