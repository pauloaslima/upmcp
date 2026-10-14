"use client";

import { useState } from "react";
import { isoDate } from "../lib/holidays";
import { defaultDueAt } from "../lib/brief";
import { useCalendarEntries } from "../lib/useCalendarEntries";
import Calendar, { MONTHS } from "./Calendar";
import MonthAgentDialog from "./MonthAgentDialog";
import ClearDialog from "./ClearDialog";

// Calendário mensal de um cliente ligado ao banco. O cliente vê sem poder editar.
// A equipe também cria o calendário automático, limpa o mês e arrasta temas entre os dias.
export default function ClientCalendar({ client, readOnly, year, month, onPrev, onNext, onToday, showToast }) {
  const first = isoDate(new Date(year, month - 1, 1));
  const last = isoDate(new Date(year, month, 0));
  const { entries, create, update, remove, removeMany, addLocal } = useCalendarEntries(client.id, first, last, showToast);
  const [aiOpen, setAiOpen] = useState(null); // null = fechado; senão, o modo inicial ("perfil", "historico"…)
  const [clearOpen, setClearOpen] = useState(false);

  // arrastar um tema para outro dia; o prazo automático do design acompanha a data
  async function move(entry, day) {
    const patch = { day };
    const due = entry.brief?.due_at;
    if (due && due === defaultDueAt(entry.day)) patch.brief = { ...entry.brief, due_at: defaultDueAt(day) };
    if (await update(entry.id, patch)) {
      const [, m, d] = day.split("-");
      showToast(`Tema movido para ${d}/${m}.`);
    }
  }

  return (
    <>
      <Calendar
        year={year}
        month={month}
        entries={entries}
        readOnly={readOnly}
        onPrev={onPrev}
        onNext={onNext}
        onToday={onToday}
        onCreate={create}
        onUpdate={update}
        onDelete={remove}
        onMove={readOnly ? null : move}
        onAi={readOnly ? null : (source) => setAiOpen(source || "perfil")}
        onClear={readOnly ? null : () => setClearOpen(true)}
        client={client}
        showToast={showToast}
      />
      {aiOpen && (
        <MonthAgentDialog
          client={client}
          year={year}
          month={month}
          existingCount={entries.length}
          initialSource={aiOpen}
          onClose={() => setAiOpen(null)}
          onCreated={addLocal}
          showToast={showToast}
        />
      )}
      {clearOpen && (
        <ClearDialog
          title="Limpar mês"
          scope={`${client.name} · ${MONTHS[month - 1]} de ${year}`}
          entries={entries}
          onClose={() => setClearOpen(false)}
          onConfirm={removeMany}
        />
      )}
    </>
  );
}
