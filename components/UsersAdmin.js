"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export const ROLE_LABELS = {
  admin: "Administrador",
  funcionario: "Funcionário Up",
  cliente: "Cliente Up"
};

async function callAdminApi(method, body) {
  const { data } = await supabase.auth.getSession();
  const res = await fetch("/api/admin/users", {
    method,
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + (data.session?.access_token || "") },
    body: JSON.stringify(body)
  });
  const json = await res.json().catch(() => ({}));
  return res.ok ? { ok: true, ...json } : { ok: false, error: json.error || "Algo deu errado." };
}

// Tela do administrador: convidar pessoas, definir papel e a qual cliente cada uma pertence.
export default function UsersAdmin({ me, clients, showToast }) {
  const [profiles, setProfiles] = useState([]);
  const [form, setForm] = useState({ email: "", full_name: "", role: "funcionario", client_id: "" });
  const [sending, setSending] = useState(false);

  async function load() {
    const { data, error } = await supabase.from("profiles").select("*").order("created_at");
    if (error) {
      console.error(error);
      showToast("Não consegui carregar os usuários.");
      return;
    }
    setProfiles(data || []);
  }

  useEffect(() => {
    load();
    const channel = supabase
      .channel("profiles-admin")
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, load)
      .subscribe();
    return () => supabase.removeChannel(channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function invite(e) {
    e.preventDefault();
    setSending(true);
    const res = await callAdminApi("POST", form);
    setSending(false);
    if (!res.ok) {
      showToast(res.error);
      return;
    }
    showToast(res.invited ? "Convite enviado para " + form.email + "." : "Acesso atualizado para " + form.email + ".");
    setForm({ email: "", full_name: "", role: form.role, client_id: form.client_id });
    load();
  }

  async function patch(p, values) {
    const next = { ...values };
    if (next.role && next.role !== "cliente") next.client_id = null;
    const { error } = await supabase.from("profiles").update(next).eq("id", p.id);
    if (error) {
      console.error(error);
      showToast("Não consegui salvar.");
      return;
    }
    setProfiles((prev) => prev.map((x) => (x.id === p.id ? { ...x, ...next } : x)));
    showToast("Acesso de " + (p.full_name || p.email) + " atualizado.");
  }

  async function removeUser(p) {
    if (!confirm(`Remover o acesso de ${p.full_name || p.email}? A pessoa não conseguirá mais entrar.`)) return;
    const res = await callAdminApi("DELETE", { user_id: p.id });
    if (!res.ok) {
      showToast(res.error);
      return;
    }
    setProfiles((prev) => prev.filter((x) => x.id !== p.id));
    showToast("Usuário removido.");
  }

  return (
    <div className="users">
      <form className="users-invite" onSubmit={invite}>
        <h3>Convidar pessoa</h3>
        <p className="hint">
          A pessoa recebe um e-mail com o link de acesso. Não existe senha: sempre que quiser entrar, ela pede um novo
          link na tela de login.
        </p>
        <div className="users-form">
          <div>
            <label htmlFor="inv-email">E-mail</label>
            <input id="inv-email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="pessoa@exemplo.com" />
          </div>
          <div>
            <label htmlFor="inv-name">Nome</label>
            <input id="inv-name" type="text" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="Como aparece nas observações" />
          </div>
          <div>
            <label htmlFor="inv-role">Tipo de usuário</label>
            <select id="inv-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {Object.entries(ROLE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          {form.role === "cliente" && (
            <div>
              <label htmlFor="inv-client">Cliente</label>
              <select id="inv-client" required value={form.client_id} onChange={(e) => setForm({ ...form, client_id: e.target.value })}>
                <option value="">Escolha…</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        <button className="btn btn-gold" type="submit" disabled={sending}>
          {sending ? "Enviando…" : "Enviar convite"}
        </button>
      </form>

      <div className="users-list">
        <h3>Quem tem acesso</h3>
        <div className="users-table">
          {profiles.map((p) => {
            const self = p.id === me.id;
            return (
              <div key={p.id} className={"user-row" + (!p.role ? " pending" : "")}>
                <div className="user-who">
                  <strong>{p.full_name || p.email}</strong>
                  {p.full_name && <span>{p.email}</span>}
                  {!p.role && <span className="user-pending">aguardando liberação</span>}
                </div>
                <select value={p.role || ""} disabled={self} onChange={(e) => patch(p, { role: e.target.value || null })} title={self ? "Você não pode mudar o seu próprio papel" : ""}>
                  <option value="">Sem acesso</option>
                  {Object.entries(ROLE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
                {p.role === "cliente" ? (
                  <select value={p.client_id || ""} onChange={(e) => patch(p, { client_id: e.target.value || null })}>
                    <option value="">Escolha o cliente…</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="user-scope">{p.role ? "vê todos os clientes" : "—"}</span>
                )}
                {!self ? (
                  <button className="btn btn-plain danger" onClick={() => removeUser(p)}>
                    Remover
                  </button>
                ) : (
                  <span className="user-scope">você</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
