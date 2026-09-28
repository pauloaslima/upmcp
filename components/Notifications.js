"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";

// Sino no topo: lembretes e avisos de atraso gerados pela checagem diária.
export default function Notifications({ userId, onOpenClient }) {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    let alive = true;
    supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(40)
      .then(({ data }) => alive && setItems(data || []));

    const channel = supabase
      .channel("notifications-" + userId)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: "user_id=eq." + userId }, (p) =>
        setItems((prev) => {
          const id = p.old?.id || p.new?.id;
          const rest = prev.filter((n) => n.id !== id);
          return p.eventType === "DELETE" ? rest : [p.new, ...rest].sort((a, b) => b.created_at.localeCompare(a.created_at));
        })
      )
      .subscribe();
    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, [userId]);

  useEffect(() => {
    if (!open) return;
    const close = (e) => boxRef.current && !boxRef.current.contains(e.target) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const unread = items.filter((n) => !n.read_at);

  async function markRead(ids) {
    if (!ids.length) return;
    const now = new Date().toISOString();
    setItems((prev) => prev.map((n) => (ids.includes(n.id) ? { ...n, read_at: now } : n)));
    await supabase.from("notifications").update({ read_at: now }).in("id", ids);
  }

  return (
    <div className="notif" ref={boxRef}>
      <button className="notif-btn" onClick={() => setOpen((o) => !o)} aria-label={`Avisos (${unread.length} não lidos)`}>
        🔔
        {unread.length > 0 && <span className="notif-count">{unread.length > 9 ? "9+" : unread.length}</span>}
      </button>
      {open && (
        <div className="notif-panel">
          <div className="notif-head">
            <strong>Avisos</strong>
            {unread.length > 0 && (
              <button className="notif-readall" onClick={() => markRead(unread.map((n) => n.id))}>
                marcar todos como lidos
              </button>
            )}
          </div>
          <div className="notif-list">
            {items.length === 0 && <div className="notif-empty">Nenhum aviso por enquanto.</div>}
            {items.map((n) => (
              <button
                key={n.id}
                className={"notif-item" + (n.read_at ? "" : " unread") + (n.title.startsWith("ATRASADO") ? " late" : "")}
                onClick={() => {
                  markRead([n.id]);
                  setOpen(false);
                  if (n.client_id) onOpenClient(n.client_id);
                }}
              >
                <span className="notif-title">{n.title}</span>
                <span className="notif-body">{n.body}</span>
                <span className="notif-date">{new Date(n.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
