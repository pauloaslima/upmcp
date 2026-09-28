"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MONTH_CAMPAIGNS, isoDate, specialDates } from "../lib/holidays";
import { CALENDAR_FORMATS, formatStyle } from "../lib/pipeline";

export const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];
export const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const WEEKDAYS_SHORT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

// Monta as semanas do mês (domingo a sábado); dias de fora do mês viram null
function monthGrid(year, month) {
  const first = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells = [];
  for (let i = 0; i < first.getDay(); i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month - 1, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

// Calendário mensal de temas de um cliente.
// Só apresenta e edita; quem salva no banco é quem usa o componente (onCreate/onUpdate/onDelete).
export function SpecialDates({ list }) {
  return list.map((s) => (
    <div key={s.name} className={"cal-special cal-" + s.kind} title={s.name}>
      {s.name}
    </div>
  ));
}

// Um tema no calendário. Sem onClick, fica só para leitura (visão do cliente).
export function EntryChip({ entry, onClick }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag className={"cal-entry" + (onClick ? "" : " readonly")} onClick={onClick || undefined}>
      {(entry.format || entry.post_time) && (
        <span className="cal-entry-top">
          {entry.format && (
            <span className="cal-format" style={formatStyle(entry.format)}>
              {entry.format}
            </span>
          )}
          {entry.post_time && <span className="cal-time">{entry.post_time}</span>}
        </span>
      )}
      <span className="cal-theme">{entry.theme || <em>sem tema</em>}</span>
      {entry.notes && (
        <span className="cal-note" title={entry.notes}>
          ✎ {entry.notes}
        </span>
      )}
    </Tag>
  );
}

export default function Calendar({ year, month, entries, readOnly, onPrev, onNext, onToday, onCreate, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(null); // { day } para novo, { entry } para existente
  const today = isoDate(new Date());
  const special = specialDates(year);
  const cells = useMemo(() => monthGrid(year, month), [year, month]);

  const byDay = useMemo(() => {
    const map = {};
    entries.forEach((e) => (map[e.day] = map[e.day] || []).push(e));
    Object.values(map).forEach((list) =>
      list.sort(
        (a, b) =>
          (a.post_time || "").localeCompare(b.post_time || "") ||
          (a.created_at || "").localeCompare(b.created_at || "")
      )
    );
    return map;
  }, [entries]);

  const campaigns = MONTH_CAMPAIGNS[month] || [];

  return (
    <div className="cal">
      <div className="cal-head">
        <button className="cal-nav" onClick={onPrev} aria-label="Mês anterior">‹</button>
        <h2 className="cal-title">
          {MONTHS[month - 1]} <span>|</span> {year}
        </h2>
        <button className="cal-nav" onClick={onNext} aria-label="Próximo mês">›</button>
        <button className="cal-today" onClick={onToday}>Mês atual</button>
      </div>

      {campaigns.length > 0 && (
        <div className="cal-campaigns">
          {campaigns.map((c) => (
            <span key={c} className="cal-campaign">{c}</span>
          ))}
        </div>
      )}

      <div className="cal-legend">
        <span><i className="dot dot-feriado"></i>Feriado nacional</span>
        <span><i className="dot dot-facultativo"></i>Ponto facultativo</span>
        <span><i className="dot dot-comemorativa"></i>Data comemorativa</span>
      </div>

      <div className="cal-grid">
        {WEEKDAYS.map((w) => (
          <div key={w} className="cal-weekday">{w}</div>
        ))}
        {cells.map((date, i) => {
          if (!date) return <div key={"x" + i} className="cal-cell cal-out" aria-hidden="true"></div>;
          const key = isoDate(date);
          const specials = special[key] || [];
          const list = byDay[key] || [];
          const isHoliday = specials.some((s) => s.kind === "feriado");
          return (
            <div
              key={key}
              className={
                "cal-cell" + (key === today ? " cal-today-cell" : "") + (isHoliday ? " cal-holiday" : "")
              }
              style={readOnly ? { cursor: "default" } : undefined}
              onClick={(e) => {
                if (!readOnly && e.target === e.currentTarget) setEditing({ day: key });
              }}
            >
              <div className="cal-daybar">
                <span className="cal-daynum">{date.getDate()}</span>
                <span className="cal-dow">{WEEKDAYS_SHORT[date.getDay()]}</span>
                {!readOnly && (
                  <button className="cal-add" title="Adicionar tema" onClick={() => setEditing({ day: key })}>
                    +
                  </button>
                )}
              </div>
              <SpecialDates list={specials} />
              {list.map((entry) => (
                <EntryChip key={entry.id} entry={entry} onClick={readOnly ? null : () => setEditing({ entry })} />
              ))}
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
            const ok = editing.entry
              ? await onUpdate(editing.entry.id, values)
              : await onCreate({ day: editing.day, ...values });
            if (ok) setEditing(null);
          }}
          onDelete={
            editing.entry
              ? async () => {
                  if (await onDelete(editing.entry.id)) setEditing(null);
                }
              : null
          }
        />
      )}
    </div>
  );
}

export function EntryEditor({ day, entry, specials, onClose, onSave, onDelete }) {
  const [values, setValues] = useState({
    format: entry?.format || "",
    theme: entry?.theme || "",
    post_time: entry?.post_time || "",
    notes: entry?.notes || ""
  });
  const [saving, setSaving] = useState(false);
  const themeRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    themeRef.current?.focus();
    const onKey = (e) => e.key === "Escape" && closeRef.current();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const date = new Date(day + "T00:00:00");
  const title =
    WEEKDAYS[date.getDay()] + ", " + date.getDate() + " de " + MONTHS[date.getMonth()].toLowerCase();

  function set(key) {
    return { value: values[key], onChange: (e) => setValues((v) => ({ ...v, [key]: e.target.value })) };
  }

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    await onSave({
      format: values.format,
      theme: values.theme.trim(),
      post_time: values.post_time.trim(),
      notes: values.notes.trim()
    });
    setSaving(false);
  }

  return (
    <div
      className="overlay"
      onClick={(e) => {
        if (e.target.classList.contains("overlay")) onClose();
      }}
    >
      <form className="modal modal-sm" onSubmit={submit}>
        <div className="modal-head">
          <div style={{ flex: 1 }}>
            <h3 className="entry-title">{entry ? "Editar tema" : "Novo tema"}</h3>
            <div className="entry-date">{title}</div>
          </div>
          <button type="button" className="icon-btn" title="Fechar" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          {specials.length > 0 && (
            <div className="entry-specials">
              {specials.map((s) => (
                <span key={s.name} className={"cal-special cal-" + s.kind}>
                  {s.name}
                </span>
              ))}
            </div>
          )}

          <div>
            <label>Formato</label>
            <div className="format-picker">
              {CALENDAR_FORMATS.map((f) => (
                <button
                  type="button"
                  key={f}
                  className={"format-chip" + (values.format === f ? " on" : "")}
                  style={values.format === f ? formatStyle(f) : undefined}
                  onClick={() => setValues((v) => ({ ...v, format: v.format === f ? "" : f }))}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="entry-theme">Tema</label>
            <textarea
              id="entry-theme"
              ref={themeRef}
              {...set("theme")}
              placeholder="Ex.: Educativo — Conexão — Liderança começa dentro de casa"
              rows={3}
            />
          </div>

          <div>
            <label htmlFor="entry-time">Horário</label>
            <input id="entry-time" type="text" {...set("post_time")} placeholder="Ex.: 12h" />
          </div>

          <div>
            <label htmlFor="entry-notes">Observações</label>
            <textarea id="entry-notes" {...set("notes")} placeholder="Recados para a equipe ou para o cliente" rows={3} />
          </div>

          <div className="modal-footer">
            {onDelete ? (
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => {
                  if (confirm("Excluir este tema do calendário?")) onDelete();
                }}
              >
                Excluir tema
              </button>
            ) : (
              <span></span>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className="btn btn-plain" onClick={onClose}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-gold" disabled={saving}>
                {saving ? "Salvando…" : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
