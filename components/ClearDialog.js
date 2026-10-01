"use client";

import { useState } from "react";

// tema que já virou peça ou já tem briefing pronto/enviado ao design: trabalho em andamento
export const isProtected = (e) => !!e.card_id || (e.brief_status && e.brief_status !== "rascunho");

// Janela de "Limpar mês" / "Limpar semana": escolhe o que apagar e mostra quantos temas saem.
export default function ClearDialog({ title, scope, entries, onClose, onConfirm }) {
  const [which, setWhich] = useState("todos"); // "todos" | "agente"
  const [keepProtected, setKeepProtected] = useState(true);
  const [busy, setBusy] = useState(false);

  const agentCount = entries.filter((e) => e.created_by_agent).length;
  const protectedCount = entries.filter(isProtected).length;
  const toDelete = entries.filter((e) => (which === "agente" ? e.created_by_agent : true) && !(keepProtected && isProtected(e)));

  async function confirm() {
    setBusy(true);
    const ok = await onConfirm(toDelete);
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <div className="overlay" onClick={(e) => e.target.classList.contains("overlay") && !busy && onClose()}>
      <div className="modal modal-sm">
        <div className="modal-head">
          <div style={{ flex: 1 }}>
            <h3 className="entry-title">🗑 {title}</h3>
            <div className="entry-date">{scope}</div>
          </div>
          <button type="button" className="icon-btn" title="Fechar" onClick={onClose} disabled={busy}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          {entries.length === 0 ? (
            <p className="agent-intro">Não há temas para apagar aqui.</p>
          ) : (
            <>
              <p className="agent-intro">
                Há <strong>{entries.length} tema(s)</strong> aqui
                {agentCount > 0 && <> — {agentCount} sugerido(s) pelo agente</>}. Escolha o que apagar para começar um planejamento novo.
              </p>

              <div className="clear-options">
                <label className={"clear-option" + (which === "todos" ? " on" : "")}>
                  <input type="radio" name="clear-which" checked={which === "todos"} onChange={() => setWhich("todos")} />
                  <span>
                    <strong>Todos os temas</strong>
                    <small>Limpa o planejamento inteiro.</small>
                  </span>
                </label>
                <label className={"clear-option" + (which === "agente" ? " on" : "") + (agentCount ? "" : " disabled")}>
                  <input type="radio" name="clear-which" checked={which === "agente"} disabled={!agentCount} onChange={() => setWhich("agente")} />
                  <span>
                    <strong>Só os sugeridos pelo agente</strong>
                    <small>{agentCount ? "Mantém o que a equipe criou ou já revisou." : "Nenhum tema sugerido pelo agente aqui."}</small>
                  </span>
                </label>
              </div>

              {protectedCount > 0 && (
                <label className="sensitive-toggle">
                  <input type="checkbox" checked={keepProtected} onChange={(e) => setKeepProtected(e.target.checked)} />
                  Manter os {protectedCount} tema(s) que já estão na linha de produção ou com briefing pronto/enviado ao design
                </label>
              )}

              <div className={"clear-count" + (toDelete.length ? "" : " zero")}>
                {toDelete.length ? `Serão apagados ${toDelete.length} tema(s). Isso não pode ser desfeito.` : "Nada para apagar com essas opções."}
              </div>
            </>
          )}

          <div className="modal-footer">
            <button type="button" className="btn btn-plain" onClick={onClose} disabled={busy}>
              Cancelar
            </button>
            <button type="button" className="btn btn-danger" onClick={confirm} disabled={busy || !toDelete.length}>
              {busy ? "Apagando…" : `Apagar ${toDelete.length} tema(s)`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
