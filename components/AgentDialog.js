"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { rangeLabel } from "../lib/deadlines";

// Janela do botão "Criar semana" (semana inteira): a equipe dá orientações opcionais e o agente
// de conteúdo cria os temas da semana (com briefing), marcados para revisão.
export default function AgentDialog({ client, weekStart, weekEnd, existingCount, onClose, onCreated, showToast }) {
  const [guidance, setGuidance] = useState("");
  const [count, setCount] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const startedAt = useRef(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setElapsed(Math.round((Date.now() - startedAt.current) / 1000)), 1000);
    return () => clearInterval(t);
  }, [busy]);

  async function run(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    startedAt.current = Date.now();
    setElapsed(0);
    try {
      const { data } = await supabase.auth.getSession();
      const res = await fetch("/api/content-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + (data.session?.access_token || "") },
        body: JSON.stringify({ mode: "week", client_id: client.id, week_start: weekStart, guidance, count: count ? Number(count) : null })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || "Não consegui criar os temas agora.");
        return;
      }
      const all = [...(json.atualizados || []), ...(json.criados || [])];
      onCreated(all);
      setResult({ ...json, todos: all });
      showToast(`Agente: ${(json.atualizados || []).length} tema(s) desenvolvido(s), ${(json.criados || []).length} novo(s).`);
    } catch (err) {
      console.error(err);
      setError("Não consegui falar com o servidor. Confira a internet e tente de novo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="overlay" onClick={(e) => e.target.classList.contains("overlay") && !busy && onClose()}>
      <form className="modal modal-sm" onSubmit={run}>
        <div className="modal-head">
          <div style={{ flex: 1 }}>
            <h3 className="entry-title">✨ Criar semana</h3>
            <div className="entry-date">
              {client.name} · posts de {rangeLabel(weekStart, weekEnd)}
            </div>
          </div>
          <button type="button" className="icon-btn" title="Fechar" onClick={onClose} disabled={busy}>
            ✕
          </button>
        </div>

        <div className="modal-body">
          {result ? (
            <>
              <div className="agent-done">
                <strong>
                  {result.atualizados?.length ? `${result.atualizados.length} tema(s) do calendário desenvolvido(s)` : ""}
                  {result.atualizados?.length && result.criados?.length ? " e " : ""}
                  {result.criados?.length ? `${result.criados.length} tema(s) novo(s)` : ""}
                </strong>
                , marcados como “Conteúdo criado”.
                {result.resumo && <p>{result.resumo}</p>}
              </div>
              <ul className="agent-list">
                {result.todos.map((t) => (
                  <li key={t.id}>
                    <span className="mono">{t.day.slice(8, 10)}/{t.day.slice(5, 7)}</span> {t.format && <strong>{t.format}</strong>} {t.theme}
                  </li>
                ))}
              </ul>
              <div className="hint">Revise cada tema: abra, ajuste o que precisar e salve. Ao salvar, a marca do agente sai.</div>
              <div className="modal-footer">
                <span></span>
                <button type="button" className="btn btn-gold" onClick={onClose}>
                  Revisar os temas
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="agent-intro">
                O agente lê o <strong>perfil do cliente</strong> (posicionamento, identidade visual, observações), as datas comemorativas da
                semana e os temas recentes, e cria os posts com o briefing para o design.
              </p>
              {existingCount > 0 ? (
                <div className="agent-plan">
                  O calendário mensal já tem <strong>{existingCount} tema(s)</strong> nesta semana. O agente vai <strong>desenvolver esses temas</strong>{" "}
                  (briefing e texto da peça) e só cria posts novos se você pedir mais do que {existingCount}. Temas com briefing pronto ou
                  enviado ao design não são alterados.
                </div>
              ) : (
                <div className="hint">O calendário mensal não tem temas nesta semana: o agente cria os posts do zero.</div>
              )}
              {!client.positioning && !client.identity && (
                <div className="hint warn">O perfil deste cliente está vazio. Preencha em “Perfil do cliente” para temas mais certeiros.</div>
              )}

              <div>
                <label htmlFor="ag-guidance">Orientações para o agente (opcional)</label>
                <textarea
                  id="ag-guidance"
                  rows={4}
                  value={guidance}
                  onChange={(e) => setGuidance(e.target.value)}
                  placeholder="Ex.: foco na promoção de Black Friday; um Reels de bastidores; evitar falar de preço."
                  disabled={busy}
                />
              </div>
              <div>
                <label htmlFor="ag-count">Quantos posts</label>
                <select id="ag-count" value={count} onChange={(e) => setCount(e.target.value)} disabled={busy}>
                  <option value="">{existingCount > 0 ? `Automático (só os ${existingCount} do calendário)` : "Automático (frequência habitual do cliente)"}</option>
                  {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>

              {error && <div className="login-msg error">{error}</div>}
              {busy && (
                <div className="agent-wait">
                  <span className="spinner" aria-hidden="true"></span> Criando os temas… {elapsed}s <span className="hint">(costuma levar de 30s a 2 min)</span>
                </div>
              )}

              <div className="modal-footer">
                <button type="button" className="btn btn-plain" onClick={onClose} disabled={busy}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-gold" disabled={busy}>
                  {busy ? "Criando…" : "Criar semana"}
                </button>
              </div>
            </>
          )}
        </div>
      </form>
    </div>
  );
}
