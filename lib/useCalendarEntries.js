"use client";

import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import { removeFile } from "./files";

// Temas do calendário de um cliente entre duas datas (YYYY-MM-DD), em tempo real.
// Usado pelo calendário mensal e pelo conteúdo da semana.
export function useCalendarEntries(clientId, first, last, showToast) {
  const [entries, setEntries] = useState([]);

  useEffect(() => {
    let alive = true;
    setEntries([]);

    supabase
      .from("calendar_entries")
      .select("*")
      .eq("client_id", clientId)
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
      .channel(`calendar-${clientId}-${first}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "calendar_entries", filter: "client_id=eq." + clientId },
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
  }, [clientId, first, last]);

  async function create(values) {
    const { data, error } = await supabase
      .from("calendar_entries")
      .insert({ ...values, client_id: clientId })
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

  async function update(id, values) {
    const { data, error } = await supabase.from("calendar_entries").update(values).eq("id", id).select().single();
    if (error) {
      console.error(error);
      showToast("Não consegui salvar a alteração.");
      return false;
    }
    setEntries((prev) => prev.map((e) => (e.id === id ? data : e)));
    return true;
  }

  async function remove(id) {
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

  // apaga vários temas de uma vez (botões "Limpar mês" / "Limpar semana")
  async function removeMany(list) {
    if (!list.length) return true;
    const ids = list.map((e) => e.id);
    const { error } = await supabase.from("calendar_entries").delete().in("id", ids);
    if (error) {
      console.error(error);
      showToast("Não consegui limpar os temas.");
      return false;
    }
    // fotos dos temas que ainda não viraram peça (as de peças continuam sendo usadas pela peça)
    list.filter((e) => !e.card_id).forEach((e) => (e.photos || []).forEach(removeFile));
    const gone = new Set(ids);
    setEntries((prev) => prev.filter((e) => !gone.has(e.id)));
    showToast(`${ids.length} tema(s) apagado(s).`);
    return true;
  }

  // temas criados fora desta tela (ex.: pelo agente) entram na hora, sem esperar o tempo real
  function addLocal(rows) {
    setEntries((prev) => {
      const ids = new Set(rows.map((r) => r.id));
      return [...prev.filter((e) => !ids.has(e.id)), ...rows.filter((r) => r.day >= first && r.day <= last)];
    });
  }

  return { entries, create, update, remove, removeMany, addLocal };
}
