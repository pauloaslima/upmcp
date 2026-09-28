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

// Senha aleatória fácil de ditar: sem letras parecidas (l, I, O, 0), com letras e números
function generatePassword() {
  const letters = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  const all = letters + digits;
  const pick = (set) => set[crypto.getRandomValues(new Uint32Array(1))[0] % set.length];
  let pw = pick(letters) + pick(digits);
  while (pw.length < 10) pw += pick(all);
  return pw
    .split("")
    .sort(() => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32 - 0.5)
    .join("");
}

const EMPTY_FORM = { email: "", full_name: "", password: "", role: "funcionario", client_id: "" };

// Tela do administrador: criar logins, definir papel e a qual cliente cada pessoa pertence.
export default function UsersAdmin({ me, clients, showToast }) {
  const [profiles, setProfiles] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [sending, setSending] = useState(false);
  const [credentials, setCredentials] = useState(null); // login e senha recém-criados, para repassar

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
    showToast(res.created ? "Usuário criado." : "Esse e-mail já tinha acesso: senha e permissões atualizadas.");
    setCredentials({ name: form.full_name || form.email, email: form.email.trim().toLowerCase(), password: form.password });
    setForm({ ...EMPTY_FORM, role: form.role, client_id: form.client_id });
    load();
  }

  async function newPassword(p) {
    const suggestion = generatePassword();
    const password = prompt(`Nova senha para ${p.full_name || p.email} (mínimo 8 caracteres, letras e números):`, suggestion);
    if (!password) return;
    const res = await callAdminApi("PATCH", { user_id: p.id, password });
    if (!res.ok) {
      showToast(res.error);
      return;
    }
    setCredentials({ name: p.full_name || p.email, email: p.email, password });
    showToast("Senha trocada.");
  }

  function copyCredentials() {
    const text = `Acesso ao Up! Fluxo\nEndereço: ${window.location.origin}\nLogin: ${credentials.email}\nSenha: ${credentials.password}\n\nNo primeiro acesso, troque a senha em "Minha senha", no rodapé do menu.`;
    navigator.clipboard?.writeText(text).then(
      () => showToast("Copiado. Cole no WhatsApp ou e-mail da pessoa."),
      () => showToast("Não consegui copiar; anote os dados na tela.")
    );
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
        <h3>Criar usuário</h3>
        <p className="hint">
          O e-mail é o login. Você define a senha e repassa para a pessoa; ela pode trocar depois em “Minha senha”. Se
          esquecer, ela mesma pede uma nova na tela de entrada.
        </p>
        <div className="users-form">
          <div>
            <label htmlFor="inv-name">Nome</label>
            <input id="inv-name" type="text" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="Como aparece nas observações" />
          </div>
          <div>
            <label htmlFor="inv-email">E-mail (login)</label>
            <input id="inv-email" type="email" required autoComplete="off" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="pessoa@exemplo.com" />
          </div>
          <div>
            <label htmlFor="inv-pw">Senha</label>
            <div className="pw-field">
              <input
                id="inv-pw"
                type="text"
                required
                minLength={8}
                autoComplete="new-password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="mín. 8, letras e números"
              />
              <button type="button" className="pw-toggle" onClick={() => setForm({ ...form, password: generatePassword() })}>
                gerar
              </button>
            </div>
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
          {sending ? "Criando…" : "Criar usuário"}
        </button>

        {credentials && (
          <div className="credentials">
            <div>
              <strong>Acesso de {credentials.name}</strong>
              <div className="mono">Login: {credentials.email}</div>
              <div className="mono">Senha: {credentials.password}</div>
              <div className="hint">Repasse esses dados para a pessoa. Por segurança, a senha não fica visível depois que você sair desta tela.</div>
            </div>
            <div className="credentials-actions">
              <button type="button" className="btn btn-gold" onClick={copyCredentials}>
                Copiar mensagem
              </button>
              <button type="button" className="btn btn-plain" onClick={() => setCredentials(null)}>
                Fechar
              </button>
            </div>
          </div>
        )}
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
                <div className="user-actions">
                  {!self && (
                    <button className="btn btn-plain" onClick={() => newPassword(p)}>
                      Nova senha
                    </button>
                  )}
                  {!self ? (
                    <button className="btn btn-plain danger" onClick={() => removeUser(p)}>
                      Remover
                    </button>
                  ) : (
                    <span className="user-scope">você</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
