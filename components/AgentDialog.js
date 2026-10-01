"use client";

import { useCallback, useEffect, useState } from "react";
import { rangeLabel } from "../lib/deadlines";
import { segmentOf } from "../lib/segments";
import SpecialistRun, { agentFetch } from "./SpecialistRun";

// "Especialista do cliente" no Conteúdo da semana: a equipe dá orientações opcionais e o time
// de agentes (pesquisa, estrategista, redator, diretor de arte, designer, revisor) prepara os posts
// da semana. A proposta aparece para revisar e só é gravada com o ok da equipe.
export default function AgentDialog({ client, weekStart, weekEnd, existingCount, onClose, onCreated, showToast }) {
  const [guidance, setGuidance] = useState("");
  const [count, setCount] = useState("");
  const [fresh, setFresh] = useState(false);
  const [run, setRun] = useState(null);
  const [openRun, setOpenRun] = useState(null); // execução que ficou em aberto nesta semana
  const [starting, setStarting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const segment = segmentOf(client.segment);

  useEffect(() => {
    agentFetch(`/api/agent-runs?client_id=${client.id}&mode=week&period_start=${weekStart}`)
      .then((r) => setOpenRun(r.run))
      .catch(() => {});
  }, [client.id, weekStart]);

  async function start(e) {
    e.preventDefault();
    setStarting(true);
    setError("");
    try {
      const { run: created } = await agentFetch("/api/agent-runs", {
        method: "POST",
        body: JSON.stringify({ mode: "week", client_id: client.id, week_start: weekStart, guidance, count: count ? Number(count) : null, nova_pesquisa: fresh })
      });
      setRun(created);
    } catch (err) {
      setError(err.message);
    } finally {
      setStarting(false);
    }
  }

  const onBusy = useCallback((b) => setBusy(b), []);
  const close = () => !busy && onClose();

  return (
    <div className="overlay" onClick={(e) => e.target.classList.contains("overlay") && close()}>
      <form className={"modal " + (run ? "modal-lg" : "modal-sm")} onSubmit={run ? (e) => e.preventDefault() : start}>
        <div className="modal-head">
          <div style={{ flex: 1 }}>
            <h3 className="entry-title">✨ Especialista {client.name}</h3>
            <div className="entry-date">
              Posts de {rangeLabel(weekStart, weekEnd)}
              {segment ? ` · ${segment.label}` : ""}
              {client.language && client.language !== "pt-BR" ? ` · posts em ${client.language}` : ""}
            </div>
          </div>
          <button type="button" className="icon-btn" title="Fechar" onClick={close} disabled={busy}>
            ✕
          </button>
        </div>

        <div className="modal-body">
          {run ? (
            <SpecialistRun initialRun={run} onSaved={onCreated} onClose={onClose} showToast={showToast} onBusy={onBusy} />
          ) : (
            <>
              <p className="agent-intro">
                O especialista lê o <strong>perfil do cliente</strong>, o segmento e suas regras, o que já foi confirmado com o cliente, as datas
                da semana e os temas recentes, <strong>pesquisa na internet</strong> e passa o trabalho pelo time: estrategista, redator, diretor
                de arte, designer e revisor. Você revisa a proposta antes de gravar.
              </p>
              {openRun && (
                <div className="agent-plan">
                  Há uma execução {openRun.status === "aguardando_aprovacao" ? "com proposta pronta" : "em andamento"} desta semana, de{" "}
                  {new Date(openRun.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}.{" "}
                  <button type="button" className="link-btn inline" onClick={() => setRun(openRun)}>
                    Retomar
                  </button>
                </div>
              )}
              {existingCount > 0 ? (
                <div className="agent-plan">
                  O calendário já tem <strong>{existingCount} tema(s)</strong> nesta semana. O time vai <strong>desenvolver esses temas</strong> e só
                  cria posts novos se você pedir mais do que {existingCount}. Temas com briefing pronto ou enviado ao design não são alterados.
                </div>
              ) : (
                <div className="hint">O calendário não tem temas nesta semana: o time cria os posts do zero.</div>
              )}

              <div>
                <label htmlFor="ag-guidance">Orientações para o time (opcional)</label>
                <textarea
                  id="ag-guidance"
                  rows={4}
                  value={guidance}
                  onChange={(e) => setGuidance(e.target.value)}
                  placeholder="Ex.: foco na promoção de Black Friday; um Reels de bastidores; evitar falar de preço."
                  disabled={starting}
                />
              </div>
              <div>
                <label htmlFor="ag-count">Quantos posts</label>
                <select id="ag-count" value={count} onChange={(e) => setCount(e.target.value)} disabled={starting}>
                  <option value="">{existingCount > 0 ? `Automático (só os ${existingCount} do calendário)` : "Automático (frequência habitual do cliente)"}</option>
                  {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
              <label className="spec-check">
                <input type="checkbox" checked={fresh} onChange={(e) => setFresh(e.target.checked)} disabled={starting} />
                Pesquisar de novo na internet (senão, reaproveita a pesquisa dos últimos 7 dias, se houver)
              </label>

              {error && <div className="login-msg error">{error}</div>}
              <div className="hint">Leva de 3 a 8 minutos. Custo aproximado: US$ 0,40 a 1,00 por semana.</div>

              <div className="modal-footer">
                <button type="button" className="btn btn-plain" onClick={onClose} disabled={starting}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-gold" disabled={starting}>
                  {starting ? "Revisando…" : "Chamar o especialista"}
                </button>
              </div>
            </>
          )}
        </div>
      </form>
    </div>
  );
}
