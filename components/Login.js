"use client";

import { useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function Login() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState(null); // {type:'ok'|'error', text}
  const [sending, setSending] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email) return;
    setSending(true);
    setStatus(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
        // Volta para o mesmo endereço de onde a pessoa pediu o link
        // (localhost no teste, o domínio do Vercel em produção).
        emailRedirectTo: window.location.origin
      }
    });
    setSending(false);
    if (error) {
      setStatus({
        type: "error",
        text:
          error.message.toLowerCase().includes("signups") ||
          error.message.toLowerCase().includes("not allowed")
            ? "Esse e-mail ainda não foi liberado. Peça para a Joana te convidar no painel."
            : "Não consegui enviar o link agora. Tente de novo em instantes."
      });
    } else {
      setStatus({
        type: "ok",
        text: "Link de acesso enviado! Confira sua caixa de entrada (e o spam) e clique nele para entrar."
      });
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="mark">U!</div>
        <h2>Up! Fluxo</h2>
        <p className="sub">Entre com seu e-mail para acessar o quadro de produção.</p>
        <form onSubmit={handleSubmit}>
          <label htmlFor="email">Seu e-mail</label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="voce@exemplo.com"
          />
          <button className="btn btn-gold" type="submit" disabled={sending}>
            {sending ? "Enviando…" : "Enviar link de acesso"}
          </button>
        </form>
        {status && (
          <div className={"login-msg" + (status.type === "error" ? " error" : "")}>
            {status.text}
          </div>
        )}
      </div>
    </div>
  );
}
