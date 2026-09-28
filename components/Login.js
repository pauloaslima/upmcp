"use client";

import { useState } from "react";
import { supabase } from "../lib/supabaseClient";

// Entrada com e-mail e senha. As contas são criadas pelo administrador
// (tela "Usuários e permissões"); não existe cadastro aberto.
export default function Login() {
  const [mode, setMode] = useState("login"); // login | forgot
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [status, setStatus] = useState(null); // {type:'ok'|'error', text}
  const [busy, setBusy] = useState(false);

  async function handleLogin(e) {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) {
      setStatus({
        type: "error",
        text: /invalid/i.test(error.message)
          ? "E-mail ou senha incorretos."
          : "Não consegui entrar agora. Tente de novo em instantes."
      });
    }
  }

  async function handleForgot(e) {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin
    });
    setBusy(false);
    setStatus(
      error
        ? { type: "error", text: "Não consegui enviar agora. Aguarde alguns minutos e tente de novo." }
        : { type: "ok", text: "Se esse e-mail tiver acesso, chega um link para criar uma nova senha. Confira também o spam." }
    );
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="mark">U!</div>
        <h2>Up! Fluxo</h2>
        {mode === "login" ? (
          <>
            <p className="sub">Entre com o login e a senha que você recebeu da Up! Digital.</p>
            <form onSubmit={handleLogin}>
              <label htmlFor="email">E-mail</label>
              <input id="email" type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@exemplo.com" />
              <label htmlFor="password">Senha</label>
              <div className="pw-field">
                <input
                  id="password"
                  type={showPw ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button type="button" className="pw-toggle" onClick={() => setShowPw((s) => !s)}>
                  {showPw ? "ocultar" : "mostrar"}
                </button>
              </div>
              <button className="btn btn-gold" type="submit" disabled={busy}>
                {busy ? "Entrando…" : "Entrar"}
              </button>
            </form>
            <button
              className="link-btn"
              onClick={() => {
                setMode("forgot");
                setStatus(null);
              }}
            >
              Esqueci minha senha
            </button>
          </>
        ) : (
          <>
            <p className="sub">Digite o seu e-mail. Enviaremos um link para você criar uma nova senha.</p>
            <form onSubmit={handleForgot}>
              <label htmlFor="email">E-mail</label>
              <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@exemplo.com" />
              <button className="btn btn-gold" type="submit" disabled={busy}>
                {busy ? "Enviando…" : "Enviar link"}
              </button>
            </form>
            <button
              className="link-btn"
              onClick={() => {
                setMode("login");
                setStatus(null);
              }}
            >
              ← Voltar para o login
            </button>
          </>
        )}
        {status && <div className={"login-msg" + (status.type === "error" ? " error" : "")}>{status.text}</div>}
      </div>
    </div>
  );
}

// Tela para definir a senha (link de "esqueci minha senha") ou trocar a própria senha
export function PasswordForm({ title, text, onDone, onCancel }) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (pw.length < 8 || !/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) {
      setStatus({ type: "error", text: "Use pelo menos 8 caracteres, com letras e números." });
      return;
    }
    if (pw !== pw2) {
      setStatus({ type: "error", text: "As duas senhas não são iguais." });
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) {
      setStatus({
        type: "error",
        text: /different/i.test(error.message) ? "A nova senha precisa ser diferente da atual." : "Não consegui salvar a senha. Tente de novo."
      });
      return;
    }
    onDone();
  }

  return (
    <form onSubmit={submit} className="pw-form">
      <h2>{title}</h2>
      <p className="sub">{text}</p>
      <label htmlFor="pw1">Nova senha</label>
      <input id="pw1" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} required />
      <label htmlFor="pw2">Repita a nova senha</label>
      <input id="pw2" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} required />
      <div className="hint">Mínimo de 8 caracteres, com letras e números.</div>
      <button className="btn btn-gold" type="submit" disabled={busy}>
        {busy ? "Salvando…" : "Salvar senha"}
      </button>
      {onCancel && (
        <button type="button" className="link-btn" onClick={onCancel}>
          Cancelar
        </button>
      )}
      {status && <div className={"login-msg" + (status.type === "error" ? " error" : "")}>{status.text}</div>}
    </form>
  );
}
