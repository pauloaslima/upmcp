"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

// Equipe do cliente: funcionários ligados a ele (com a função de cada um) e os logins do próprio cliente.
export function ClientTeam({ client, team, isAdmin, showToast, onMembersChange }) {
  const [members, setMembers] = useState([]);
  const [clientUsers, setClientUsers] = useState([]);
  const [routines, setRoutines] = useState([]);
  const [form, setForm] = useState({ user_id: "", role_label: "" });
  const people = Object.fromEntries(team.map((p) => [p.id, p]));

  async function load() {
    const [m, u, r] = await Promise.all([
      supabase.from("client_members").select("*").eq("client_id", client.id),
      supabase.from("profiles").select("id, email, full_name").eq("role", "cliente").eq("client_id", client.id),
      supabase.from("routines").select("user_id, title").eq("client_id", client.id).eq("active", true)
    ]);
    setMembers(m.data || []);
    setClientUsers(u.data || []);
    setRoutines(r.data || []);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.id]);

  async function add(e) {
    e.preventDefault();
    if (!form.user_id) return;
    const { error } = await supabase
      .from("client_members")
      .upsert({ client_id: client.id, user_id: form.user_id, role_label: form.role_label.trim() }, { onConflict: "client_id,user_id" });
    if (error) {
      console.error(error);
      showToast("Não consegui adicionar.");
      return;
    }
    setForm({ user_id: "", role_label: "" });
    await load();
    onMembersChange?.();
  }

  async function remove(m) {
    const { error } = await supabase.from("client_members").delete().eq("client_id", client.id).eq("user_id", m.user_id);
    if (error) return showToast("Não consegui remover.");
    await load();
    onMembersChange?.();
  }

  // o responsável pelo cliente aparece mesmo sem estar na lista
  const staffRows = [...members];
  if (client.responsible_id && !members.some((m) => m.user_id === client.responsible_id)) {
    staffRows.unshift({ user_id: client.responsible_id, role_label: "", implicit: true });
  }

  return (
    <section className="checklist-panel">
      <div className="checklist-head">
        <h3>Equipe e acessos</h3>
      </div>

      <div className="team-cols">
        <div>
          <div className="checklist-group-title">Funcionários</div>
          {staffRows.length === 0 && <div className="hint">Ninguém ligado a este cliente ainda.</div>}
          {staffRows.map((m) => {
            const p = people[m.user_id];
            const fns = [
              m.user_id === client.responsible_id && "Responsável pelo cliente",
              m.role_label,
              ...routines.filter((r) => r.user_id === m.user_id).map((r) => r.title + " (rotina diária)")
            ].filter(Boolean);
            return (
              <div key={m.user_id} className="member-row">
                <div>
                  <strong>{p?.full_name || p?.email || "—"}</strong>
                  <div className="member-fns">{fns.length ? fns.join(" · ") : "sem função definida"}</div>
                </div>
                {isAdmin && !m.implicit && (
                  <button className="attach-remove" title="Tirar deste cliente" onClick={() => remove(m)}>
                    ✕
                  </button>
                )}
              </div>
            );
          })}
          {isAdmin && (
            <form className="member-add" onSubmit={add}>
              <select value={form.user_id} onChange={(e) => setForm({ ...form, user_id: e.target.value })}>
                <option value="">Adicionar funcionário…</option>
                {team
                  .filter((p) => !members.some((m) => m.user_id === p.id))
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name || p.email}
                    </option>
                  ))}
              </select>
              <input type="text" value={form.role_label} onChange={(e) => setForm({ ...form, role_label: e.target.value })} placeholder="Função (ex.: social media, design)" />
              <button className="btn btn-plain" type="submit" disabled={!form.user_id}>
                Adicionar
              </button>
            </form>
          )}
        </div>

        <div>
          <div className="checklist-group-title">Logins do cliente</div>
          {clientUsers.length === 0 && <div className="hint">Nenhum login de cliente. {isAdmin ? "Crie em Usuários e permissões." : ""}</div>}
          {clientUsers.map((u) => (
            <div key={u.id} className="member-row">
              <div>
                <strong>{u.full_name || u.email}</strong>
                <div className="member-fns">Cliente · aprova conteúdos, vê calendário e semana atual</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

