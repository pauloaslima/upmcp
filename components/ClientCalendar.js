"use client";

import { isoDate } from "../lib/holidays";
import { useCalendarEntries } from "../lib/useCalendarEntries";
import Calendar from "./Calendar";

// Calendário mensal de um cliente ligado ao banco. O cliente vê sem poder editar.
export default function ClientCalendar({ client, readOnly, year, month, onPrev, onNext, onToday, showToast }) {
  const first = isoDate(new Date(year, month - 1, 1));
  const last = isoDate(new Date(year, month, 0));
  const { entries, create, update, remove } = useCalendarEntries(client.id, first, last, showToast);

  return (
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
      client={client}
      showToast={showToast}
    />
  );
}
