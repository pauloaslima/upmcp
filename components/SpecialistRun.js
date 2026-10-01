"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";

// Andamento do especialista do cliente: revisão antes de executar → etapas do time
// (pesquisa, estrategista, redator e diretor de arte, designer, revisor) → proposta editável → gravar.
// As etapas rodam uma por chamada no servidor; se a janela fechar, dá para retomar depois.

export async function agentFetch(path, options = {}) {
  const { data } = await supabase.auth.getSession();
  const res = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + (data.session?.access_token || ""), ...(options.headers || {}) }
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Não consegui falar com o servidor.");
  return json;
}

const dm = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

export default function SpecialistRun({ initialRun, onSaved, onClose, showToast, onBusy }) {
  const [run, setRun] = useState(initialRun);
  const [confirmed, setConfirmed] = useState(initialRun.status !== "rodando" || initialRun.steps.some((s) => s.state === "feito" && s.id !== "pesquisa"));
  const [driving, setDriving] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const alive = useRef(true);
  const looping = useRef(false); // um laço de etapas por vez
  const startedAt = useRef(0);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => onBusy?.(driving || saving), [driving, saving, onBusy]);
  useEffect(() => {
    if (!driving) return;
    const t = setInterval(() => setElapsed(Math.round((Date.now() - startedAt.current) / 1000)), 1000);
    return () => clearInterval(t);
  }, [driving]);

  // proposta vira rascunho editável (cada post com "incluir")
  useEffect(() => {
    if (run.status === "aguardando_aprovacao" && run.proposta && !draft) setDraft(toDraft(run));
  }, [run, draft]);

  const blocked = (run.revisao?.bloqueios || []).length > 0;
  const canStart = run.status === "rodando" || run.status === "erro";

  // começa sozinho quando a revisão não tem bloqueio
  useEffect(() => {
    if (!confirmed && !blocked && run.status === "rodando") setConfirmed(true);
  }, [confirmed, blocked, run.status]);
  useEffect(() => {
    if (confirmed && run.status === "rodando" && !driving) drive();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmed]);

  async function drive() {
    if (looping.current) return;
    looping.current = true;
    setDriving(true);
    setError("");
    startedAt.current = Date.now();
    setElapsed(0);
    try {
      let current = run;
      for (let guard = 0; guard < 12 && alive.current; guard++) {
        const { run: next } = await agentFetch(`/api/agent-runs/${current.id}/step`, { method: "POST" });
        current = next;
        if (alive.current) setRun(next);
        if (next.status !== "rodando") break;
        // outra aba está rodando a mesma etapa: espera um pouco e confere de novo
        if (next.steps.some((s) => s.state === "rodando")) await new Promise((r) => setTimeout(r, 4000));
      }
    } catch (err) {
      if (alive.current) setError(err.message);
    } finally {
      looping.current = false;
      if (alive.current) setDriving(false);
    }
  }

  async function cancel() {
    if (!confirm("Cancelar esta execução? Nada foi gravado no calendário ainda.")) return;
    try {
      await agentFetch(`/api/agent-runs/${run.id}`, { method: "DELETE" });
    } catch {
      /* fecha mesmo assim */
    }
    onClose();
  }

  async function save() {
    const proposta = fromDraft(run, draft);
    const count = run.mode === "week" ? proposta.posts.length : proposta.temas.length;
    if (!count) {
      setError("Marque pelo menos um post para gravar.");
      return;
    }
    if (!confirm(`Gravar ${count} ${run.mode === "week" ? "post(s) no Conteúdo da semana" : "tema(s) no calendário"}?`)) return;
    setSaving(true);
    setError("");
    try {
      const res = await agentFetch(`/api/agent-runs/${run.id}/approve`, { method: "POST", body: JSON.stringify({ proposta }) });
      setRun(res.run);
      onSaved([...(res.atualizados || []), ...(res.criados || [])]);
      showToast(
        `Gravado: ${(res.atualizados || []).length} desenvolvido(s), ${(res.criados || []).length} novo(s)` +
          (res.novas_pendencias ? ` · ${res.novas_pendencias} pergunta(s) nova(s) no perfil do cliente` : "") +
          "."
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="spec">
      <Review revisao={run.revisao} />

      {!confirmed && blocked && canStart && (
        <div className="modal-footer">
          <button type="button" className="btn btn-plain" onClick={cancel}>
            Não rodar
          </button>
          <button type="button" className="btn btn-gold" onClick={() => setConfirmed(true)}>
            Seguir assim
          </button>
        </div>
      )}

      {confirmed && <Steps run={run} driving={driving} elapsed={elapsed} />}

      {run.pesquisa?.texto && (
        <details className="spec-box">
          <summary>
            🔎 Pesquisa {run.pesquisa.reaproveitada ? `(reaproveitada de ${new Date(run.pesquisa.data).toLocaleDateString("pt-BR")})` : ""}
          </summary>
          <div className="spec-text">{run.pesquisa.texto}</div>
          {run.pesquisa.fontes?.length > 0 && (
            <ul className="spec-sources">
              {run.pesquisa.fontes.map((f) => (
                <li key={f.url}>
                  <a href={f.url} target="_blank" rel="noopener noreferrer">
                    {f.titulo}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </details>
      )}

      {error && <div className="login-msg error">{error}</div>}

      {run.status === "erro" && !driving && (
        <div className="modal-footer">
          <button type="button" className="btn btn-plain" onClick={cancel}>
            Cancelar execução
          </button>
          <button type="button" className="btn btn-gold" onClick={drive}>
            Tentar esta etapa de novo
          </button>
        </div>
      )}
      {run.status === "rodando" && confirmed && !driving && (
        <div className="modal-footer">
          <button type="button" className="btn btn-plain" onClick={cancel}>
            Cancelar execução
          </button>
          <button type="button" className="btn btn-gold" onClick={drive}>
            Continuar
          </button>
        </div>
      )}

      {run.status === "aguardando_aprovacao" && draft && (
        <Proposal run={run} draft={draft} setDraft={setDraft} disabled={saving} />
      )}
      {run.status === "aguardando_aprovacao" && draft && (
        <div className="modal-footer spec-footer">
          <button type="button" className="btn btn-plain" onClick={cancel} disabled={saving}>
            Descartar
          </button>
          <button type="button" className="btn btn-gold" onClick={save} disabled={saving}>
            {saving ? "Gravando…" : run.mode === "week" ? "Gravar no Conteúdo da semana" : "Gravar no calendário"}
          </button>
        </div>
      )}

      {run.status === "gravado" && (
        <>
          <div className="agent-done">
            <strong>Gravado.</strong> Os temas estão marcados como “sugerido pelo agente” para a equipe revisar.
            {run.gravado?.novas_pendencias > 0 && <p>{run.gravado.novas_pendencias} pergunta(s) nova(s) foram para o perfil do cliente (Especialista → Pendências).</p>}
          </div>
          <div className="modal-footer">
            <span></span>
            <button type="button" className="btn btn-gold" onClick={onClose}>
              Revisar no sistema
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Review({ revisao }) {
  if (!revisao) return null;
  const { bloqueios = [], avisos = [] } = revisao;
  if (!bloqueios.length && !avisos.length) return <div className="hint">✅ Revisão antes de executar: nada a apontar.</div>;
  return (
    <div className="spec-review">
      <strong>Revisão antes de executar</strong>
      <ul>
        {bloqueios.map((b) => (
          <li key={b} className="spec-block">
            ⛔ {b}
          </li>
        ))}
        {avisos.map((a) => (
          <li key={a}>⚠️ {a}</li>
        ))}
      </ul>
    </div>
  );
}

function Steps({ run, driving, elapsed }) {
  return (
    <ol className="spec-steps">
      {run.steps.map((s) => {
        const state = s.state === "pendente" && driving && run.steps.find((x) => x.state === "pendente")?.id === s.id ? "rodando" : s.state;
        return (
          <li key={s.id} className={"spec-step " + state}>
            <span className="spec-dot" aria-hidden="true">
              {state === "feito" ? "✓" : state === "rodando" ? <span className="spinner"></span> : ""}
            </span>
            {s.label}
            {state === "rodando" && <span className="hint"> · {elapsed}s</span>}
          </li>
        );
      })}
    </ol>
  );
}

// ---------- proposta editável ----------

function toDraft(run) {
  const p = run.proposta;
  if (run.mode === "week") return { ...p, posts: p.posts.map((x) => ({ ...x, incluir: true })), perguntasTexto: (p.perguntas_para_o_cliente || []).join("\n") };
  return { ...p, temas: p.temas.map((x) => ({ ...x, incluir: true })), perguntasTexto: (p.perguntas_para_o_cliente || []).join("\n") };
}

function fromDraft(run, d) {
  const perguntas = d.perguntasTexto.split("\n").map((s) => s.trim()).filter(Boolean);
  const strip = ({ incluir, ...rest }) => rest;
  if (run.mode === "week") return { ...d, perguntasTexto: undefined, posts: d.posts.filter((x) => x.incluir).map(strip), perguntas_para_o_cliente: perguntas };
  return { ...d, perguntasTexto: undefined, temas: d.temas.filter((x) => x.incluir).map(strip), perguntas_para_o_cliente: perguntas };
}

function Proposal({ run, draft, setDraft, disabled }) {
  const listKey = run.mode === "week" ? "posts" : "temas";
  const setItem = (i, patch) => setDraft((d) => ({ ...d, [listKey]: d[listKey].map((x, j) => (j === i ? { ...x, ...patch } : x)) }));
  const setBrief = (i, patch) => setDraft((d) => ({ ...d, posts: d.posts.map((x, j) => (j === i ? { ...x, brief: { ...x.brief, ...patch } } : x)) }));

  return (
    <div className="spec-proposal">
      <div className="agent-done">
        <strong>{run.mode === "week" ? `Proposta da semana · revisor: ${draft.veredito === "APROVADO" ? "aprovado" : "com ajustes aplicados"}` : "Proposta do calendário"}</strong>
        {draft.leitura && <p>{draft.leitura}</p>}
        {draft.resumo && <p>{draft.resumo}</p>}
      </div>

      {run.mode === "week"
        ? draft.posts.map((p, i) => (
            <details key={p.ref} className={"spec-post" + (p.incluir ? "" : " off")} open={i === 0}>
              <summary>
                <input type="checkbox" checked={p.incluir} onChange={(e) => setItem(i, { incluir: e.target.checked })} onClick={(e) => e.stopPropagation()} disabled={disabled} title="Incluir ao gravar" />
                <span className="mono">{dm(p.day)}</span> {p.post_time && <span className="hint">{p.post_time}</span>} <strong>{p.format}</strong> {p.theme}
                {!p.id && <span className="chip-new">novo</span>}
              </summary>
              <div className="spec-fields">
                <Field label="Tema" value={p.theme} onChange={(v) => setItem(i, { theme: v })} disabled={disabled} />
                {p.objetivo && <div className="hint">Objetivo: {p.objetivo} · {p.por_que}</div>}
                <Field label="Texto da peça" value={p.piece_text} rows={6} onChange={(v) => setItem(i, { piece_text: v })} disabled={disabled} />
                <Field label="Legenda" value={p.caption} rows={6} onChange={(v) => setItem(i, { caption: v })} disabled={disabled} />
                <div className="hint">
                  Briefing: {p.brief.request_type} · prioridade {p.brief.priority} · {(p.brief.placements || []).join(", ")}
                </div>
                <Field label="Não pode faltar" value={p.brief.must_have} rows={3} onChange={(v) => setBrief(i, { must_have: v })} disabled={disabled} />
                <Field label="Direção de arte" value={p.brief.important_notes} rows={4} onChange={(v) => setBrief(i, { important_notes: v })} disabled={disabled} />
                <Field label="Layout do designer" value={p.layout} rows={4} onChange={(v) => setItem(i, { layout: v })} disabled={disabled} />
                {p.image_prompts?.length > 0 && <div className="hint">🖼️ {p.image_prompts.length} imagem(ns) planejada(s) para a arte.</div>}
                {p.problemas?.length > 0 && <Notes title="Corrigido pelo revisor" items={p.problemas} />}
                {p.alertas?.length > 0 && <Notes title="Alertas do designer" items={p.alertas} />}
                {p.pendencias?.length > 0 && <Notes title="Confirmar com o cliente" items={p.pendencias} />}
              </div>
            </details>
          ))
        : draft.temas.map((t, i) => (
            <div key={t.ref + t.day} className={"spec-row" + (t.incluir ? "" : " off")}>
              <input type="checkbox" checked={t.incluir} onChange={(e) => setItem(i, { incluir: e.target.checked })} disabled={disabled} title="Incluir ao gravar" />
              <span className="mono">{dm(t.day)}</span>
              <strong>{t.format}</strong>
              <input type="text" className="spec-theme" value={t.theme} onChange={(e) => setItem(i, { theme: e.target.value })} disabled={disabled} aria-label="Tema" />
            </div>
          ))}

      {run.mode === "month" && draft.problemas?.length > 0 && <Notes title="Corrigido pelo revisor" items={draft.problemas} />}

      <Field
        label="Perguntas para o cliente (uma por linha) — vão para o perfil do cliente ao gravar"
        value={draft.perguntasTexto}
        rows={Math.min(8, Math.max(3, draft.perguntasTexto.split("\n").length + 1))}
        onChange={(v) => setDraft((d) => ({ ...d, perguntasTexto: v }))}
        disabled={disabled}
      />
    </div>
  );
}

function Field({ label, value, onChange, rows, disabled }) {
  return (
    <label className="spec-field">
      <span>{label}</span>
      {rows ? (
        <textarea rows={rows} value={value || ""} onChange={(e) => onChange(e.target.value)} disabled={disabled} />
      ) : (
        <input type="text" value={value || ""} onChange={(e) => onChange(e.target.value)} disabled={disabled} />
      )}
    </label>
  );
}

function Notes({ title, items }) {
  return (
    <div className="spec-notes">
      <strong>{title}</strong>
      <ul>
        {items.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
    </div>
  );
}
