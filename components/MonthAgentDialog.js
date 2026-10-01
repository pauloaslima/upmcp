"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MONTHS } from "./Calendar";
import SpecialistRun, { agentFetch } from "./SpecialistRun";

const SOURCES = [
  { id: "historico", label: "Meses anteriores", icon: "🗂️" },
  { id: "texto", label: "Por texto", icon: "✍️" },
  { id: "audio", label: "Por áudio", icon: "🎙️" }
];

// Ditado pelo navegador (Chrome e Edge): a fala vira texto na hora, para revisar antes de enviar
function getRecognizer() {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

// "Criar calendário com IA": o especialista do cliente (pesquisa, estrategista e revisor) monta os
// temas do mês seguindo a estratégia escolhida; a equipe revisa a proposta antes de gravar.
export default function MonthAgentDialog({ client, year, month, existingCount, onClose, onCreated, showToast }) {
  const [source, setSource] = useState("historico");
  const [text, setText] = useState("");
  const [audioText, setAudioText] = useState("");
  const [interim, setInterim] = useState("");
  const [listening, setListening] = useState(false);
  const [perWeek, setPerWeek] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [run, setRun] = useState(null);
  const [openRun, setOpenRun] = useState(null);
  const [fresh, setFresh] = useState(false);
  const [runBusy, setRunBusy] = useState(false);
  const recRef = useRef(null);
  const canDictate = !!getRecognizer();
  const ym = `${year}-${String(month).padStart(2, "0")}`;

  useEffect(() => {
    agentFetch(`/api/agent-runs?client_id=${client.id}&mode=month&period_start=${ym}-01`)
      .then((r) => setOpenRun(r.run))
      .catch(() => {});
  }, [client.id, ym]);
  const onBusy = useCallback((b) => setRunBusy(b), []);

  useEffect(() => () => recRef.current?.stop(), []);

  function startDictation() {
    const Rec = getRecognizer();
    if (!Rec) return;
    const rec = new Rec();
    rec.lang = "pt-BR";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let finals = "";
      let partial = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finals += r[0].transcript;
        else partial += r[0].transcript;
      }
      if (finals) setAudioText((t) => (t ? t.trimEnd() + " " : "") + finals.trim());
      setInterim(partial);
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed") setError("O navegador bloqueou o microfone. Libere o acesso ao microfone para este site e tente de novo.");
      else if (e.error !== "no-speech" && e.error !== "aborted") setError("A gravação parou (" + e.error + "). Clique em gravar de novo.");
    };
    rec.onend = () => {
      setListening(false);
      setInterim("");
    };
    recRef.current = rec;
    setError("");
    rec.start();
    setListening(true);
  }

  function stopDictation() {
    recRef.current?.stop();
  }

  const strategy = source === "texto" ? text : source === "audio" ? audioText : "";

  async function start(e) {
    e.preventDefault();
    if (listening) stopDictation();
    if (source !== "historico" && strategy.trim().length < 10) {
      setError(source === "audio" ? "Grave (ou escreva) a explicação da estratégia antes de criar." : "Escreva a estratégia do mês antes de criar.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { run: created } = await agentFetch("/api/agent-runs", {
        method: "POST",
        body: JSON.stringify({
          mode: "month",
          client_id: client.id,
          month: ym,
          source,
          strategy,
          posts_per_week: perWeek ? Number(perWeek) : null,
          nova_pesquisa: fresh
        })
      });
      setRun(created);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const monthName = `${MONTHS[month - 1]} de ${year}`;

  return (
    <div className="overlay" onClick={(e) => e.target.classList.contains("overlay") && !busy && !runBusy && onClose()}>
      <form className={"modal " + (run ? "modal-lg" : "modal-md")} onSubmit={run ? (e) => e.preventDefault() : start}>
        <div className="modal-head">
          <div style={{ flex: 1 }}>
            <h3 className="entry-title">✨ Criar calendário com IA</h3>
            <div className="entry-date">
              {client.name} · {monthName}
            </div>
          </div>
          <button type="button" className="icon-btn" title="Fechar" onClick={onClose} disabled={busy || runBusy}>
            ✕
          </button>
        </div>

        <div className="modal-body">
          {run ? (
            <SpecialistRun initialRun={run} onSaved={onCreated} onClose={onClose} showToast={showToast} onBusy={onBusy} />
          ) : (
            <>
              {openRun && (
                <div className="agent-plan">
                  Há uma execução {openRun.status === "aguardando_aprovacao" ? "com proposta pronta" : "em andamento"} deste mês, de{" "}
                  {new Date(openRun.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}.{" "}
                  <button type="button" className="link-btn inline" onClick={() => setRun(openRun)}>
                    Retomar
                  </button>
                </div>
              )}
              <div>
                <label>Estratégia do mês</label>
                <div className="seg source-seg" role="tablist">
                  {SOURCES.map((s) => (
                    <button
                      type="button"
                      role="tab"
                      aria-selected={source === s.id}
                      key={s.id}
                      className={"seg-btn" + (source === s.id ? " on" : "")}
                      onClick={() => setSource(s.id)}
                      disabled={busy}
                    >
                      {s.icon} {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {source === "historico" && (
                <p className="agent-intro">
                  O agente analisa os <strong>calendários dos últimos 3 meses</strong> deste cliente (frequência, dias, horários, formatos e
                  pilares) e continua a mesma linha com assuntos novos, encaixando as datas comemorativas de {MONTHS[month - 1].toLowerCase()}.
                </p>
              )}

              {source === "texto" && (
                <div>
                  <label htmlFor="mo-text">Descreva a estratégia do mês</label>
                  <textarea
                    id="mo-text"
                    rows={6}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    disabled={busy}
                    placeholder={"Ex.: Mês de lançamento da nova coleção. Semana 1 e 2: aquecimento com bastidores e enquetes; semana 3: lançamento com Reels e carrossel de produtos; semana 4: prova social e depoimentos. Black Friday no dia 27, com contagem regressiva."}
                  />
                </div>
              )}

              {source === "audio" && (
                <div>
                  <label htmlFor="mo-audio">Fale a estratégia do mês</label>
                  {canDictate ? (
                    <div className="dictation">
                      {listening ? (
                        <button type="button" className="btn btn-danger" onClick={stopDictation}>
                          <span className="rec-dot" aria-hidden="true"></span> Parar gravação
                        </button>
                      ) : (
                        <button type="button" className="btn btn-gold" onClick={startDictation} disabled={busy}>
                          🎙️ {audioText ? "Continuar gravando" : "Gravar áudio"}
                        </button>
                      )}
                      <span className="hint">{listening ? "Ouvindo… fale normalmente e clique em parar quando terminar." : "Sua fala vira texto aqui embaixo; revise antes de criar."}</span>
                    </div>
                  ) : (
                    <div className="hint warn">
                      Este navegador não faz ditado. Use o Google Chrome ou o Microsoft Edge para gravar, ou escreva a estratégia abaixo.
                    </div>
                  )}
                  <textarea
                    id="mo-audio"
                    rows={6}
                    value={audioText + (interim ? (audioText ? " " : "") + interim : "")}
                    onChange={(e) => setAudioText(e.target.value)}
                    disabled={busy || listening}
                    placeholder="A transcrição do áudio aparece aqui."
                  />
                </div>
              )}

              <div className="brief-grid">
                <div>
                  <label htmlFor="mo-per-week">Posts por semana</label>
                  <select id="mo-per-week" value={perWeek} onChange={(e) => setPerWeek(e.target.value)} disabled={busy}>
                    <option value="">Automático (frequência habitual do cliente)</option>
                    {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {existingCount > 0 && (
                <div className="hint warn">
                  {monthName} já tem {existingCount} tema(s). Eles continuam como estão; o agente completa o mês em volta deles.
                </div>
              )}
              {!client.positioning && !client.identity && (
                <div className="hint warn">O perfil deste cliente está vazio — preencha em “Perfil do cliente” para um calendário mais certeiro.</div>
              )}

              <label className="spec-check">
                <input type="checkbox" checked={fresh} onChange={(e) => setFresh(e.target.checked)} disabled={busy} />
                Pesquisar de novo na internet (senão, reaproveita a pesquisa dos últimos 7 dias, se houver)
              </label>
              {error && <div className="login-msg error">{error}</div>}
              <div className="hint">O especialista pesquisa, monta e revisa o calendário (2 a 5 min). Você revisa antes de gravar.</div>

              <div className="modal-footer">
                <button type="button" className="btn btn-plain" onClick={onClose} disabled={busy}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-gold" disabled={busy}>
                  {busy ? "Revisando…" : "Chamar o especialista"}
                </button>
              </div>
            </>
          )}
        </div>
      </form>
    </div>
  );
}
