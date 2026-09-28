"use client";

import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

// Tarefas marcadas como feitas no checklist de prazos.
// clientId = um cliente, null para todos (painel do Início) ou false para não carregar (visão do cliente).
export function useClientTasks(clientId, fromIso, showToast) {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    if (clientId === false) return;
    let alive = true;
    let q = supabase.from("client_tasks").select("*").gte("period", fromIso);
    if (clientId) q = q.eq("client_id", clientId);
    q.then(({ data, error }) => {
      if (!alive) return;
      if (error) console.error(error);
      setRows(data || []);
    });

    const channel = supabase
      .channel("tasks-" + (clientId || "all"))
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "client_tasks", ...(clientId ? { filter: "client_id=eq." + clientId } : {}) },
        (p) =>
          setRows((prev) => {
            const id = p.old?.id || p.new?.id;
            const rest = prev.filter((r) => r.id !== id);
            return p.eventType === "DELETE" ? rest : [...rest, p.new];
          })
      )
      .subscribe();
    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, [clientId, fromIso]);

  const isDone = (cid, task) => rows.some((r) => r.client_id === cid && r.kind === task.kind && r.period === task.period && r.done);
  const doneRow = (cid, task) => rows.find((r) => r.client_id === cid && r.kind === task.kind && r.period === task.period && r.done);

  async function toggle(cid, task, done) {
    const { data, error } = await supabase
      .from("client_tasks")
      .upsert({ client_id: cid, kind: task.kind, period: task.period, done }, { onConflict: "client_id,kind,period" })
      .select()
      .single();
    if (error) {
      console.error(error);
      showToast("Não consegui salvar o checklist.");
      return;
    }
    setRows((prev) => [...prev.filter((r) => r.id !== data.id), data]);
  }

  return { isDone, doneRow, toggle };
}
