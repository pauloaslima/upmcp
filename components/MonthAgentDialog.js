"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { MONTHS } from "./Calendar";
import { PROFILE_FIELDS } from "../lib/profileFields";

const SOURCES = [
  { id: "perfil", label: "Automático", icon: "✨" },
  { id: "historico", label: "Meses anteriores", icon: "🗂️" },
  { id: "texto", label: "Por texto", icon: "✍️" },
  { id: "audio", label: "Por áudio", icon: "🎙️" }
];

// Ditado pelo navegador (Chrome e Edge): a fala vira texto na hora, para revisar antes de enviar
function getRecognizer() {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

// "Criar calendário": o agente monta os temas do mês seguindo a estratégia escolhida.
export default function MonthAgentDialog({ client, year, month, existingCount, initialSource, onClose, onCreated, showToast }) {
  const [source, setSource] = useState(initialSource || "perfil");
  const [extra, setExtra] = useState(""); // orientação opcional no modo automático
  const filled = PROFILE_FIELDS.filter((f) => (client[f.key] || "").trim());
  const missing = PROFILE_FIELDS.filter((f) => !(client[f.key] || "").trim());
  const [text, setText] = useState("");
  const [audioText, setAudioText] = useState("");
  const [interim, setInterim] = useState("");
  const [listening, setListening] = useState(false);
  const [perWeek, setPerWeek] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const recRef = useRef(null);
  const startedAt = useRef(0);
  const canDictate = !!getRecognizer();

  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setElapsed(Math.round((Date.now() - startedAt.current) / 1000)), 1000);
    return () => clearInterval(t);
  }, [busy]);

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

  const strategy = source === "texto" ? text : source === "audio" ? audioText : source === "perfil" ? extra : "";

  async function run(e) {
    e.preventDefault();
    if (listening) stopDictation();
    if ((source === "texto" || source === "audio") && strategy.trim().length < 10) {
      setError(source === "audio" ? "Grave (ou escreva) a explicação da estratégia antes de criar." : "Escreva a estratégia do mês antes de criar.");
      return;
    }
    setBusy(true);
    setError("");
    startedAt.current = Date.now();
    setElapsed(0);
    try {
      const { data } = await supabase.auth.getSession();
      const res = await fetch("/api/content-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + (data.session?.access_token || "") },
        body: JSON.stringify({
          mode: "month",
          client_id: client.id,
          month: `${year}-${String(month).padStart(2, "0")}`,
          source,
          strategy,
          posts_per_week: perWeek ? Number(perWeek) : null
        })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || "Não consegui criar o calendário agora.");
        return;
      }
      onCreated(json.criados || []);
      setResult(json);
      showToast(`${(json.criados || []).length} tema(s) criados no calendário de ${MONTHS[month - 1]}.`);
    } catch (err) {
      console.error(err);
      setError("Não consegui falar com o servidor. Confira a internet e tente de novo.");
    } finally {
      setBusy(false);
    }
  }

  const monthName = `${MONTHS[month - 1]} de ${year}`;

  return (
    <div className="overlay" onClick={(e) => e.target.classList.contains("overlay") && !busy && onClose()}>
      <form className="modal modal-md" onSubmit={run}>
        <div className="modal-head">
          <div style={{ flex: 1 }}>
            <h3 className="entry-title">✨ Criar calendário</h3>
            <div className="entry-date">
              {client.name} · {monthName}
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
                <strong>{result.criados.length} tema(s) criados</strong> em {monthName}, marcados como “sugerido pelo agente”.
                {result.resumo && <p>{result.resumo}</p>}
              </div>
              <ul className="agent-list">
                {[...result.criados]
                  .sort((a, b) => a.day.localeCompare(b.day))
                  .map((t) => (
                    <li key={t.id}>
                      <span className="mono">
                        {t.day.slice(8, 10)}/{t.day.slice(5, 7)}
                      </span>{" "}
                      {t.format && <strong>{t.format}</strong>} {t.theme}
                    </li>
                  ))}
              </ul>
              <div className="hint">Revise no calendário: arraste os temas entre os dias para remanejar e clique para ajustar.</div>
              <div className="modal-footer">
                <span></span>
                <button type="button" className="btn btn-gold" onClick={onClose}>
                  Ver o calendário
                </button>
              </div>
            </>
          ) : (
            <>
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

              {source === "perfil" && (
                <>
                  <p className="agent-intro">
                    O agente <strong>lê o Perfil do cliente</strong> para entender o que ele faz, para quem e como fala;{" "}
                    <strong>analisa os calendários dos últimos 3 meses</strong> (se houver) — frequência, formatos e pilares que ficaram de fora — e
                    monta {MONTHS[month - 1].toLowerCase()} seguindo as linhas editoriais, com as datas comemorativas que fazem sentido.
                  </p>
                  <div className="profile-check">
                    {PROFILE_FIELDS.map((f) => (
                      <span key={f.key} className={"chip " + ((client[f.key] || "").trim() ? "st-feito" : "")}>
                        {(client[f.key] || "").trim() ? "✓ " : "— "}
                        {f.label}
                      </span>
                    ))}
                  </div>
                  {filled.length === 0 ? (
                    <div className="hint warn">O perfil está vazio: o agente vai depender só dos meses anteriores. Preencha o Perfil do cliente (ou use “Preencher automaticamente”) para um calendário mais certeiro.</div>
                  ) : (
                    missing.length > 0 && <div className="hint">Campos vazios ({missing.map((f) => f.label).join(", ")}) o agente deduz pelo restante do perfil.</div>
                  )}
                  <div>
                    <label htmlFor="mo-extra">Orientação extra (opcional)</label>
                    <textarea
                      id="mo-extra"
                      rows={3}
                      value={extra}
                      onChange={(e) => setExtra(e.target.value)}
                      disabled={busy}
                      placeholder="Ex.: dar mais peso a vendas neste mês; evento de aniversário da empresa no dia 20."
                    />
                  </div>
                </>
              )}

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
              {source !== "perfil" && !client.positioning && !client.identity && (
                <div className="hint warn">O perfil deste cliente está vazio — preencha em “Perfil do cliente” para um calendário mais certeiro.</div>
              )}

              {error && <div className="login-msg error">{error}</div>}
              {busy && (
                <div className="agent-wait">
                  <span className="spinner" aria-hidden="true"></span> Montando o calendário… {elapsed}s{" "}
                  <span className="hint">(costuma levar de 1 a 3 min)</span>
                </div>
              )}

              <div className="modal-footer">
                <button type="button" className="btn btn-plain" onClick={onClose} disabled={busy}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-gold" disabled={busy}>
                  {busy ? "Criando…" : "Criar calendário"}
                </button>
              </div>
            </>
          )}
        </div>
      </form>
    </div>
  );
}
