"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../lib/supabaseClient";
import { ART_FORMATS } from "../lib/pipeline";
import { suggestPhotos } from "../lib/photoBank";
import { BankPicker } from "./PhotoBank";

// Artes criadas pelo sistema: miniatura (calendário, Conteúdo da semana, Linha de produção)
// e a janela "Criar arte" (um post ou a semana inteira). Os botões são só da equipe.

// links temporários das imagens (o bucket é privado): guardados por 50 minutos
const urlCache = new Map();
const URL_TTL = 50 * 60 * 1000;

export function useSignedUrl(path) {
  const cached = path && urlCache.get(path);
  const [url, setUrl] = useState(cached && Date.now() - cached.at < URL_TTL ? cached.url : null);
  useEffect(() => {
    if (!path) return;
    const hit = urlCache.get(path);
    if (hit && Date.now() - hit.at < URL_TTL) {
      setUrl(hit.url);
      return;
    }
    let alive = true;
    supabase.storage
      .from("anexos")
      .createSignedUrl(path, 60 * 60)
      .then(({ data }) => {
        if (!data?.signedUrl) return;
        urlCache.set(path, { url: data.signedUrl, at: Date.now() });
        if (alive) setUrl(data.signedUrl);
      });
    return () => {
      alive = false;
    };
  }, [path]);
  return url;
}

// Miniatura da arte (primeira página). size: "xs" (calendário), "sm" (cartão da peça), "md" (editor)
export function ArtThumb({ art, size = "xs", title = "Arte criada" }) {
  const first = Array.isArray(art) ? art.find((a) => a?.path) : null;
  const url = useSignedUrl(first?.path);
  if (!first) return null;
  const pages = art.filter((a) => a?.path).length;
  return (
    <span className={"art-thumb " + size} title={pages > 1 ? `${title} (${pages} páginas)` : title}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url ? <img src={url} alt="" loading="lazy" /> : <span className="art-thumb-ph" />}
      {pages > 1 && <span className="art-thumb-count">{pages}</span>}
    </span>
  );
}

// Todas as páginas, clicáveis (abrem a imagem em tamanho real).
// feedback: mostra "Aprovar" e "Reprovar" (só a equipe), que ensinam as próximas artes do cliente
// onChange(novaArte): quando uma página é refeita (para a tela de quem chamou atualizar)
// target: { entry_id } ou { card_id } do post ou peça (para editar páginas; só a equipe)
export function ArtStrip({ art, feedback = false, onChange, target = null, theme = "" }) {
  const [editFor, setEditFor] = useState(null); // página aberta para editar

  // exclui uma página (com confirmação): sai do post e da peça e o arquivo é apagado
  async function removePage(i) {
    const list = (override || art || []).filter((a) => a?.path);
    if (!confirm(list.length > 1 ? `Excluir a página ${i + 1} da arte? Ela sai do post e da peça.` : "Excluir a arte? Ela sai do post e da peça.")) return;
    const { ok, json } = await callArt({ action: "delete_page", run_id: list[i].run, ...(target || {}), page: i });
    if (!ok) return alert(json.error || "Não consegui excluir a página.");
    setOverride(json.art);
    onChange?.(json.art);
  }
  const [override, setOverride] = useState(null); // arte atualizada depois de refazer uma página
  useEffect(() => setOverride(null), [art]);
  const pages = (override || art || []).filter((a) => a?.path);
  const [open, setOpen] = useState(null); // página aberta no visualizador
  if (!pages.length) return null;
  return (
    <>
      <div className="art-strip">
        {pages.map((a, i) => (
          <ArtPage key={a.path} att={a} index={i} onOpen={() => setOpen(i)} onEdit={target ? () => setEditFor(i) : null} onDelete={target ? () => removePage(i) : null} />
        ))}
      </div>
      {editFor !== null && (
        <ArtEditDialog
          entry={{ theme }}
          art={pages}
          target={target}
          preselect={[editFor]}
          onCreated={(upd) => {
            setOverride(upd.art);
            onChange?.(upd.art);
          }}
          onClose={() => setEditFor(null)}
          showToast={() => {}}
        />
      )}
      {feedback && pages[0].run && <ArtFeedback runId={pages[0].run} />}
      {open !== null && (
        <ArtViewer
          pages={pages}
          start={open}
          canRedo={feedback && (!!pages[0].run || !!target)}
          target={target}
          onRedone={(next) => {
            setOverride(next);
            onChange?.(next);
          }}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}

// Visualizador das páginas da arte na própria tela: setas na tela ou ← → do teclado, Esc fecha
function ArtViewer({ pages, start, onClose, canRedo = false, onRedone, target = null }) {
  const [i, setI] = useState(start);
  const [redo, setRedo] = useState(null); // null | { text, busy, error }
  const total = pages.length;
  const go = (d) => {
    setRedo(null);
    setI((x) => (x + d + total) % total);
  };

  // refaz só esta página com a alteração escrita
  async function sendRedo() {
    const text = redo?.text?.trim();
    if (!text) return;
    setRedo({ text, busy: true });
    const { ok, json } = await callArt({ action: "redo_page", run_id: pages[0].run, ...(target || {}), page: i, instrucao: text });
    if (!ok || !json.art?.length) {
      setRedo({ text, error: json.error || "Não consegui refazer a página agora." });
      return;
    }
    setRedo(null);
    onRedone?.(json.art);
  }

  useEffect(() => {
    const onKey = (e) => {
      // escrevendo a alteração: as setas e o Esc são do campo de texto
      if (["INPUT", "TEXTAREA"].includes(e.target?.tagName) && e.key !== "Escape") return;
      if (e.key === "Escape" && redo) {
        setRedo(null);
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "Escape") onClose();
      else return;
      // a tecla é do visualizador: não fecha o card nem rola a página
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total, onClose, redo]);
  const url = useSignedUrl(pages[i].path);
  // já busca as páginas vizinhas para a troca ser instantânea
  useSignedUrl(pages[(i + 1) % total].path);
  useSignedUrl(pages[(i - 1 + total) % total].path);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="art-viewer"
      role="dialog"
      aria-label="Páginas da arte"
      onClick={(e) => {
        e.stopPropagation();
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="art-viewer-top">
        <span>{total > 1 ? `${i + 1} de ${total}` : "Arte"}</span>
        <div className="art-viewer-actions">
          {canRedo && !redo && (
            <button type="button" className="btn btn-plain btn-sm" onClick={() => setRedo({ text: "" })}>
              ✏️ Refazer esta página
            </button>
          )}
          {url && (
            <a className="btn btn-plain btn-sm" href={url} download={pages[i].name || `arte-${i + 1}.png`} target="_blank" rel="noopener noreferrer">
              ⬇ Baixar
            </a>
          )}
          <button type="button" className="btn btn-plain btn-sm" onClick={onClose} title="Fechar (Esc)">
            ✕
          </button>
        </div>
      </div>
      {total > 1 && (
        <button type="button" className="art-viewer-nav prev" onClick={() => go(-1)} aria-label="Página anterior (seta para a esquerda)">
          ‹
        </button>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url ? <img className="art-viewer-img" src={url} alt={pages[i].name || `Página ${i + 1}`} /> : <span className="spinner" aria-hidden="true"></span>}
      {total > 1 && (
        <button type="button" className="art-viewer-nav next" onClick={() => go(1)} aria-label="Próxima página (seta para a direita)">
          ›
        </button>
      )}
      {redo && (
        <div className="art-redo" onClick={(e) => e.stopPropagation()}>
          <label htmlFor="art-redo-text">O que mudar na página {i + 1}?</label>
          <textarea
            id="art-redo-text"
            rows={3}
            autoFocus
            value={redo.text}
            disabled={redo.busy}
            onChange={(e) => setRedo({ text: e.target.value })}
            placeholder="Ex.: aumentar a foto, trocar o fundo para lilás, deixar o título em uma linha, corrigir o acento de 'você'"
          />
          {redo.error && <div className="hint warn">{redo.error}</div>}
          <div className="art-redo-actions">
            {redo.busy ? (
              <span className="hint">
                <span className="spinner small" aria-hidden="true"></span> Refazendo a página {i + 1} (cerca de 1 minuto). As outras páginas não mudam.
              </span>
            ) : (
              <>
                <button type="button" className="btn btn-plain btn-sm" onClick={() => setRedo(null)}>
                  Cancelar
                </button>
                <button type="button" className="btn btn-gold btn-sm" onClick={sendRedo} disabled={!redo.text?.trim()}>
                  Refazer página {i + 1}
                </button>
              </>
            )}
          </div>
        </div>
      )}
      {total > 1 && !redo && (
        <div className="art-viewer-dots">
          {pages.map((pg, k) => (
            <button key={pg.path} type="button" className={k === i ? "on" : ""} onClick={() => setI(k)} aria-label={`Página ${k + 1}`} />
          ))}
        </div>
      )}
    </div>,
    document.body
  );
}

async function callArt(body) {
  const { data } = await supabase.auth.getSession();
  const res = await fetch("/api/design-agent", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + (data.session?.access_token || "") },
    body: JSON.stringify(body)
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, json };
}

// Decisão da equipe sobre a arte: aprovada vira referência; reprovada (com motivo) vira erro a evitar
function ArtFeedback({ runId }) {
  const [state, setState] = useState(null); // null | "motivo" | "enviando" | { done: texto } | { erro: texto }
  const [motivo, setMotivo] = useState("");
  async function send(aprovado) {
    setState("enviando");
    const { ok, json } = await callArt({ action: "feedback", run_id: runId, aprovado, motivo });
    setState(ok ? { done: aprovado ? "Aprovada. Vira referência para as próximas artes deste cliente." : "Reprovada. O motivo fica registrado para as próximas artes evitarem esse erro." } : { erro: json.error || "Não consegui registrar." });
  }
  if (state?.done) return <p className="hint art-feedback-done">✓ {state.done}</p>;
  return (
    <div className="art-feedback">
      {state === "motivo" ? (
        <>
          <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Por que reprovou? (ex.: foto pequena na página 4, título longo na capa)" autoFocus />
          <button type="button" className="btn btn-plain btn-sm" onClick={() => setState(null)}>
            Cancelar
          </button>
          <button type="button" className="btn btn-gold btn-sm" onClick={() => send(false)} disabled={!motivo.trim()}>
            Reprovar
          </button>
        </>
      ) : (
        <>
          <span className="hint">A arte ficou boa?</span>
          <button type="button" className="btn btn-plain btn-sm" onClick={() => send(true)} disabled={state === "enviando"}>
            👍 Aprovar
          </button>
          <button type="button" className="btn btn-plain btn-sm" onClick={() => setState("motivo")} disabled={state === "enviando"}>
            👎 Reprovar
          </button>
        </>
      )}
      {state?.erro && <span className="hint warn">{state.erro}</span>}
    </div>
  );
}

function ArtPage({ att, index, onOpen, onEdit, onDelete }) {
  const url = useSignedUrl(att.path);
  return (
    <span className="art-page-wrap">
      <button type="button" className="art-page" onClick={onOpen} title={"Ver " + (att.name || "a arte")}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {url ? <img src={url} alt={att.name || "Arte página " + (index + 1)} /> : <span className="art-thumb-ph" />}
      </button>
      {(onEdit || onDelete) && (
        <span className="art-page-tools">
          {onEdit && (
            <button type="button" className="art-page-edit" onClick={onEdit} title={`Editar a página ${index + 1}`} aria-label={`Editar a página ${index + 1}`}>
              ✏️
            </button>
          )}
          {onDelete && (
            <button type="button" className="art-page-edit danger" onClick={onDelete} title={`Excluir a página ${index + 1}`} aria-label={`Excluir a página ${index + 1}`}>
              🗑
            </button>
          )}
        </span>
      )}
    </span>
  );
}

export const canHaveArt = (entry) => ART_FORMATS.includes(entry?.format) && !!entry?.theme?.trim();

// entries: posts que podem ganhar arte; week = janela "Criar artes da semana" (senão, a arte de um post)
export function ArtDialog({ client, entries, week = false, onCreated, onClose, showToast }) {
  const single = !week;
  const existing = single ? (entries[0].art || []).filter((a) => a?.path) : [];
  const editable = existing.length > 0; // já existe arte: abre para editar páginas
  const [editMode, setEditMode] = useState(editable);
  const mode = "chatgpt";
  const [caps, setCaps] = useState(null); // o que está configurado no servidor: { geracao, banco }
  useEffect(() => {
    let alive = true;
    fetch("/api/design-agent")
      .then((r) => r.json())
      .then((c) => alive && setCaps(c))
      .catch(() => alive && setCaps({}));
    return () => {
      alive = false;
    };
  }, []);
  const [guidance, setGuidance] = useState("");
  // post sem foto anexada: as fotos vêm do banco do cliente (sugeridas, e a equipe pode trocar)
  const hasOwnPhotos = single && (entries[0].photos || []).some((f) => f?.type === "upload" && f.path);
  const useBank = single && !hasOwnPhotos;
  const [bankPick, setBankPick] = useState(new Set());
  const [picked, setPicked] = useState(() => new Set(entries.filter((e) => single || !e.art?.length).map((e) => e.id)));
  const [status, setStatus] = useState({}); // entry id -> { state: "fila" | "criando" | "ok" | "erro", msg, alertas }
  const [running, setRunning] = useState(false);
  const done = Object.values(status).filter((s) => s.state === "ok" || s.state === "erro").length;

  // a arte passa por etapas (planejamento, montagem, avaliação e refinamento): a janela vai pedindo
  // "continuar" até a rodada terminar, mostrando a etapa e o ciclo
  async function createOne(entry) {
    setStatus((s) => ({ ...s, [entry.id]: { state: "criando", etapa: "Começando" } }));
    try {
      let { ok, json } = await callArt({
        action: "start",
        client_id: client.id,
        ...(entry.cardOnly ? { card_id: entry.id } : { entry_id: entry.id }),
        mode,
        guidance,
        ...(useBank ? { bank_photos: [...bankPick] } : {})
      });
      let guard = 0;
      while (ok && json.run && !json.run.final && guard++ < 12) {
        const r = json.run;
        setStatus((s) => ({ ...s, [entry.id]: { state: "criando", etapa: r.etapa, ciclo: r.ciclo, max: r.max_ciclos, media: r.media } }));
        if (r.imagens?.length) onCreated?.({ ...entry, art: r.art, card_id: r.card_id });
        ({ ok, json } = await callArt({ action: "continue", run_id: r.id }));
      }
      if (!ok || !json.run) {
        setStatus((s) => ({ ...s, [entry.id]: { state: "erro", msg: json.error || "Não consegui criar a arte." } }));
        return false;
      }
      const r = json.run;
      onCreated?.({ ...entry, art: r.art, card_id: r.card_id });
      setStatus((s) => ({ ...s, [entry.id]: { state: "ok", run: r } }));
      return true;
    } catch (err) {
      console.error(err);
      setStatus((s) => ({ ...s, [entry.id]: { state: "erro", msg: "Não consegui falar com o servidor." } }));
      return false;
    }
  }

  async function run() {
    const list = entries.filter((e) => picked.has(e.id));
    if (!list.length) return;
    setRunning(true);
    setStatus(Object.fromEntries(list.map((e) => [e.id, { state: "fila" }])));
    let ok = 0;
    for (const entry of list) if (await createOne(entry)) ok++;
    setRunning(false);
    showToast(ok === list.length ? (ok === 1 ? "Arte criada e anexada na peça." : `${ok} artes criadas e anexadas nas peças.`) : `${ok} de ${list.length} artes criadas. Veja os avisos.`);
  }

  const finished = !running && done > 0;
  const toggle = (id) =>
    setPicked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  if (editMode)
    return (
      <ArtEditDialog
        entry={entries[0]}
        art={existing}
        target={entries[0].cardOnly ? { card_id: entries[0].id } : { entry_id: entries[0].id }}
        onCreated={onCreated}
        onClose={onClose}
        onRecreate={() => setEditMode(false)}
        showToast={showToast}
      />
    );

  return (
    <div
      className="overlay art-overlay"
      onClick={(e) => {
        e.stopPropagation();
        if (e.target.classList.contains("art-overlay") && !running) onClose();
      }}
    >
      <div className="modal modal-md art-dialog" role="dialog" aria-label={single ? "Criar arte" : "Criar artes da semana"}>
        <div className="modal-head">
          <div style={{ flex: 1 }}>
            <h3>{single ? "Criar arte" : "Criar artes da semana"}</h3>
            <div className="entry-date">{single ? entries[0].theme : "Estáticos e carrosséis. Reels e vídeos continuam com a edição da equipe."}</div>
          </div>
          <button type="button" className="icon-btn" title="Fechar" onClick={onClose} disabled={running}>
            ✕
          </button>
        </div>

        <div className="modal-body">
          {single && entries[0].art?.length > 0 && (
            <div>
              <label>Arte atual</label>
              <ArtStrip art={entries[0].art} />
              <p className="hint">Criar de novo substitui a arte atual (no post e na peça).</p>
            </div>
          )}

          <div className="art-engine">
            <strong>Criada pelo ChatGPT</strong> (gerador de imagens da OpenAI), com as fotos do post, o texto da peça, o briefing e a identidade do cliente.
            A logo ou a assinatura do perfil entram por cima, sempre iguais.
            {caps && !caps.geracao && <span className="hint warn"> Aguardando a configuração da OPENAI_API_KEY na Vercel.</span>}
          </div>

          {useBank && (
            <div>
              <label>Fotos do banco do cliente</label>
              <BankPicker
                clientId={client.id}
                value={bankPick}
                onChange={setBankPick}
                disabled={running}
                onLoaded={(bank) => setBankPick(new Set(suggestPhotos(bank, { theme: entries[0].theme, format: entries[0].format })))}
              />
              <p className="hint">
                Este post não tem foto anexada: já deixei marcadas as sugeridas (etiqueta parecida com o tema e menos usadas). Clique para trocar; sem nenhuma
                marcada, a arte sai só com fundos e texturas.
              </p>
            </div>
          )}
          {!single && <p className="hint">Posts sem foto anexada usam as fotos sugeridas do banco de fotos do cliente, sem repetir a mesma foto.</p>}

          <div>
            <label htmlFor="art-guidance">Orientação para o designer (opcional)</label>
            <textarea
              id="art-guidance"
              rows={2}
              value={guidance}
              onChange={(e) => setGuidance(e.target.value)}
              disabled={running}
              placeholder="Ex.: capa com fundo lilás, destacar a palavra ansiedade, página final com a foto sorrindo"
            />
          </div>

          {!single && (
            <div>
              <label>Posts da semana</label>
              <div className="art-list">
                {entries.map((e) => {
                  const st = status[e.id];
                  return (
                    <div key={e.id} className="art-row">
                      <label className="art-row-main">
                        <input type="checkbox" checked={picked.has(e.id)} onChange={() => toggle(e.id)} disabled={running || !!st} />
                        <span>
                          <strong>{e.day.split("-").reverse().slice(0, 2).join("/")}</strong> · {e.format} · {e.theme}
                          {e.art?.length > 0 && !st && <em> (já tem arte: criar de novo substitui)</em>}
                        </span>
                      </label>
                      <ArtStatus st={st} />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {single && status[entries[0].id] && <ArtStatus st={status[entries[0].id]} />}
        </div>

        <div className="modal-foot">
          {running && (
            <span className="hint">
              <span className="spinner small" aria-hidden="true"></span> Criando{single ? "" : ` ${done + 1} de ${Object.keys(status).length}`}… o ChatGPT desenha a capa e depois as outras páginas (de 1 a 5 minutos). Não feche esta janela.
            </span>
          )}
          <button type="button" className="btn btn-plain" onClick={onClose} disabled={running}>
            {finished ? "Fechar" : "Cancelar"}
          </button>
          {!finished && (
            <button type="button" className="btn btn-gold" onClick={run} disabled={running || picked.size === 0 || (caps && !caps.geracao)}>
              {single ? "🎨 Criar arte" : `🎨 Criar ${picked.size} ${picked.size === 1 ? "arte" : "artes"}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Editar arte: escolhe as páginas, escreve a alteração; cada página escolhida é refeita e substitui a antiga
function ArtEditDialog({ entry, art, target = null, preselect = [], onCreated, onClose, onRecreate, showToast }) {
  const [pages, setPages] = useState(art);
  const [picked, setPicked] = useState(new Set(preselect));
  const [text, setText] = useState("");
  const [progress, setProgress] = useState(null); // { atual, total, pagina }
  const [error, setError] = useState("");
  const running = !!progress;
  const toggle = (i) =>
    setPicked((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  const all = picked.size === pages.length;

  async function run() {
    const list = [...picked].sort((a, b) => a - b);
    if (!list.length || !text.trim()) return;
    setError("");
    let current = pages;
    let ok = 0;
    for (let k = 0; k < list.length; k++) {
      setProgress({ atual: k + 1, total: list.length, pagina: list[k] + 1 });
      const { ok: good, json } = await callArt({ action: "redo_page", run_id: current[0].run, ...(target || {}), page: list[k], instrucao: text.trim() });
      if (!good || !json.art?.length) {
        setError(`Página ${list[k] + 1}: ${json.error || "não consegui refazer agora."}`);
        break;
      }
      current = json.art;
      setPages(current);
      onCreated?.({ ...entry, art: current });
      ok++;
    }
    setProgress(null);
    if (ok) {
      setPicked(new Set());
      showToast(ok === 1 ? "Página refeita e substituída." : `${ok} páginas refeitas e substituídas.`);
    }
  }

  return (
    <div
      className="overlay art-overlay"
      onClick={(e) => {
        e.stopPropagation();
        if (e.target.classList.contains("art-overlay") && !running) onClose();
      }}
    >
      <div className="modal modal-md art-dialog" role="dialog" aria-label="Editar arte">
        <div className="modal-head">
          <div style={{ flex: 1 }}>
            <h3>Editar arte</h3>
            <div className="entry-date">{entry.theme}</div>
          </div>
          <button type="button" className="icon-btn" title="Fechar" onClick={onClose} disabled={running}>
            ✕
          </button>
        </div>

        <div className="modal-body">
          <div>
            <div className="art-pick-head">
              <label>Escolha as páginas que vão mudar</label>
              <button type="button" className="mini-link" onClick={() => setPicked(all ? new Set() : new Set(pages.map((_, i) => i)))} disabled={running}>
                {all ? "Desmarcar todas" : "Selecionar todas"}
              </button>
            </div>
            <div className="art-strip art-pick">
              {pages.map((a, i) => (
                <ArtPickPage key={a.path} att={a} index={i} on={picked.has(i)} busy={progress?.pagina === i + 1} onToggle={() => !running && toggle(i)} />
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="art-edit-text">O que mudar {picked.size > 1 ? `nas ${picked.size} páginas` : picked.size === 1 ? `na página ${[...picked][0] + 1}` : "nas páginas escolhidas"}</label>
            <textarea
              id="art-edit-text"
              rows={3}
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={running}
              placeholder="Ex.: aumentar a foto, trocar o fundo para dourado, deixar o título em uma linha, corrigir o acento de 'você'"
            />
            <p className="hint">Só as páginas marcadas são refeitas; cada uma entra no lugar da antiga, que é apagada. As outras não mudam.</p>
          </div>
          {error && <div className="hint warn">{error}</div>}
        </div>

        <div className="modal-foot">
          {running ? (
            <span className="hint">
              <span className="spinner small" aria-hidden="true"></span> Refazendo a página {progress.pagina} ({progress.atual} de {progress.total}), cerca de 1 minuto cada. Não feche esta janela.
            </span>
          ) : onRecreate ? (
            <button type="button" className="mini-link art-recreate" onClick={onRecreate}>
              ou criar a arte toda de novo
            </button>
          ) : (
            <span className="art-recreate" />
          )}
          <button type="button" className="btn btn-plain" onClick={onClose} disabled={running}>
            Fechar
          </button>
          <button type="button" className="btn btn-gold" onClick={run} disabled={running || !picked.size || !text.trim()}>
            ✏️ Editar {picked.size || ""} {picked.size === 1 ? "página" : "páginas"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ArtPickPage({ att, index, on, busy, onToggle }) {
  const url = useSignedUrl(att.path);
  return (
    <button type="button" className={"art-page pickable" + (on ? " on" : "")} onClick={onToggle} title={`Página ${index + 1}`} aria-pressed={on}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url ? <img src={url} alt={"Página " + (index + 1)} /> : <span className="art-thumb-ph" />}
      <span className="art-pick-num">{index + 1}</span>
      <span className={"art-pick-box" + (on ? " on" : "")} aria-hidden="true">{on ? "✓" : ""}</span>
      {busy && <span className="art-pick-busy"><span className="spinner small" aria-hidden="true"></span></span>}
    </button>
  );
}

function ArtStatus({ st }) {
  if (!st) return null;
  if (st.state === "fila") return <span className="art-st">na fila</span>;
  if (st.state === "criando")
    return (
      <span className="art-st">
        <span className="spinner small" aria-hidden="true"></span> {st.etapa || "criando"}
        {st.max ? ` · ciclo ${st.ciclo} de ${st.max}` : ""}
        {st.media != null ? ` · nota ${st.media}` : ""}…
      </span>
    );
  if (st.state === "erro") return <span className="art-st erro">{st.msg}</span>;
  const r = st.run;
  const approved = r.status === "aprovada" || r.status === "pronta";
  return (
    <span className={"art-st " + (approved ? "ok" : "warn")}>
      {r.status === "pronta" ? "✓ Arte pronta. Confira os textos antes de enviar" : approved ? "✓ Aprovada na avaliação" : "⚠ Precisa de revisão da equipe"}
      {r.media != null ? ` (nota média ${r.media}, ${r.ciclo} ciclo(s) de refinamento)` : ""}. Arte anexada na peça.
      {r.montagem && (
        <a className="art-sheet" href={r.montagem} target="_blank" rel="noopener noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={r.montagem} alt="Todas as páginas" />
        </a>
      )}
      {!approved && r.motivos?.length > 0 && (
        <ul className="art-alerts">
          {r.motivos.slice(0, 5).map((a, i) => (
            <li key={"m" + i}>{a}</li>
          ))}
        </ul>
      )}
      {r.alertas?.length > 0 && (
        <ul className="art-alerts">
          {r.alertas.map((a, i) => (
            <li key={i}>{a}</li>
          ))}
        </ul>
      )}
      <ArtFeedback runId={r.id} />
    </span>
  );
}
