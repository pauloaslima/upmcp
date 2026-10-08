"use client";

import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

// Posts do calendário como tarefa "Publicar post" (aba Tarefas e Rotina diária).
// Quem publica é o responsável pelo cliente; marcar grava quando e quem publicou.
// fromIso/toIso: dias do calendário (AAAA-MM-DD) a carregar.
export function usePostTasks(fromIso, toIso, me, showToast) {
  const [posts, setPosts] = useState([]);

  useEffect(() => {
    let alive = true;
    async function load() {
      const { data, error } = await supabase
        .from("calendar_entries")
        .select("id, day, client_id, theme, format, post_time, published_at, published_by")
        .gte("day", fromIso)
        .lte("day", toIso)
        .order("day");
      if (!alive) return;
      if (error) {
        console.error(error);
        return;
      }
      setPosts(data || []);
    }
    load();
    const channel = supabase
      .channel("post-tasks-" + fromIso + "-" + toIso)
      .on("postgres_changes", { event: "*", schema: "public", table: "calendar_entries" }, load)
      .subscribe();
    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, [fromIso, toIso]);

  async function toggle(post, done) {
    const values = done ? { published_at: new Date().toISOString(), published_by: me.id } : { published_at: null, published_by: null };
    setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, ...values } : p)));
    const { error } = await supabase.from("calendar_entries").update(values).eq("id", post.id);
    if (error) {
      console.error(error);
      setPosts((prev) => prev.map((p) => (p.id === post.id ? post : p)));
      showToast("Não consegui marcar o post como publicado.");
    }
  }

  return { posts, toggle };
}

// "Publicar: Educativo | Técnica | Saque" (ou o formato, se o tema estiver vazio)
export function postTitle(post) {
  return "Publicar: " + (post.theme?.trim() || post.format || "post sem tema");
}
