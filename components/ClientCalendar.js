"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { isoDate } from "../lib/holidays";
import Calendar from "./Calendar";

// Liga o calendário de um cliente ao banco: carrega os temas do mês,
// escuta mudanças em tempo real e salva o que a pessoa edita.
export default function ClientCalendar({ client, year, month, onPrev, onNext, onToday, showToast }) {
  const [entries, setEntries] = useState([]);
  const first = isoDate(new Date(year, month - 1, 1));
  const last = isoDate(new Date(year, month, 0));

  useEffect(() => {
    let alive = true;
    setEntries([]);

    supabase
      .from("calendar_entries")
      .select("*")
      .eq("client_id", client.id)
      .gte("day", first)
      .lte("day", last)
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) {
          console.error(error);
          showToast("Não consegui carregar o calendário.");
          return;
        }
        setEntries(data || []);
      });

    const channel = supabase
      .channel("calendar-" + client.id)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "calendar_entries", filter: "client_id=eq." + client.id },
        (payload) => {
          setEntries((prev) => {
            const id = payload.old?.id || payload.new?.id;
            const rest = prev.filter((e) => e.id !== id);
            if (payload.eventType === "DELETE") return rest;
            const row = payload.new;
            return row.day >= first && row.day <= last ? [...rest, row] : rest;
          });
        }
      )
      .subscribe();

    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.id, first, last]);

  async function onCreate(values) {
    const { data, error } = await supabase
      .from("calendar_entries")
      .insert({ ...values, client_id: client.id })
      .select()
      .single();
    if (error) {
      console.error(error);
      showToast("Não consegui salvar o tema.");
      return false;
    }
    setEntries((prev) => [...prev.filter((e) => e.id !== data.id), data]);
    return true;
  }

  async function onUpdate(id, values) {
    const { data, error } = await supabase
      .from("calendar_entries")
      .update(values)
      .eq("id", id)
      .select()
      .single();
    if (error) {
      console.error(error);
      showToast("Não consegui salvar a alteração.");
      return false;
    }
    setEntries((prev) => prev.map((e) => (e.id === id ? data : e)));
    return true;
  }

  async function onDelete(id) {
    const { error } = await supabase.from("calendar_entries").delete().eq("id", id);
    if (error) {
      console.error(error);
      showToast("Não consegui excluir o tema.");
      return false;
    }
    setEntries((prev) => prev.filter((e) => e.id !== id));
    showToast("Tema excluído.");
    return true;
  }

  return (
    <Calendar
      year={year}
      month={month}
      entries={entries}
      onPrev={onPrev}
      onNext={onNext}
      onToday={onToday}
      onCreate={onCreate}
      onUpdate={onUpdate}
      onDelete={onDelete}
    />
  );
}
