"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { ART_FORMATS } from "../lib/pipeline";

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

// Todas as páginas, clicáveis (abrem a imagem em tamanho real)
export function ArtStrip({ art }) {
  const pages = (art || []).filter((a) => a?.path);
  if (!pages.length) return null;
  return (
    <div className="art-strip">
      {pages.map((a, i) => (
        <ArtPage key={a.path} att={a} index={i} />
      ))}
    </div>
  );
}

function ArtPage({ att, index }) {
  const url = useSignedUrl(att.path);
  return (
    <a className="art-page" href={url || undefined} target="_blank" rel="noopener noreferrer" title={"Abrir " + (att.name || "a arte")}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url ? <img src={url} alt={att.name || "Arte página " + (index + 1)} /> : <span className="art-thumb-ph" />}
    </a>
  );
}

export const canHaveArt = (entry) => ART_FORMATS.includes(entry?.format) && !!entry?.theme?.trim();

const MODES = [
  {
    id: "ia",
    title: "Criar do zero",
    text: "Usa as fotos anexadas quando houver e, se faltar, uma foto de banco de imagens ligada ao tema."
  },
  {
    id: "material",
    title: "Usar o material do post",
    text: "Só as fotos anexadas ao post, a logo e as cores do cliente. Sem foto, a arte sai só com texto e cores."
  }
];

// entries: posts que podem ganhar arte; week = janela "Criar artes da semana" (senão, a arte de um post)
export function ArtDialog({ client, entries, week = false, onCreated, onClose, showToast }) {
  const single = !week;
  const [mode, setMode] = useState("ia");
  const [guidance, setGuidance] = useState("");
  const [picked, setPicked] = useState(() => new Set(entries.filter((e) => single || !e.art?.length).map((e) => e.id)));
  const [status, setStatus] = useState({}); // entry id -> { state: "fila" | "criando" | "ok" | "erro", msg, alertas }
  const [running, setRunning] = useState(false);
  const done = Object.values(status).filter((s) => s.state === "ok" || s.state === "erro").length;

  async function createOne(entry) {
    setStatus((s) => ({ ...s, [entry.id]: { state: "criando" } }));
    try {
      const { data } = await supabase.auth.getSession();
      const res = await fetch("/api/design-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + (data.session?.access_token || "") },
        body: JSON.stringify({ client_id: client.id, ...(entry.cardOnly ? { card_id: entry.id } : { entry_id: entry.id }), mode, guidance })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus((s) => ({ ...s, [entry.id]: { state: "erro", msg: json.error || "Não consegui criar a arte." } }));
        return false;
      }
      onCreated?.({ ...entry, art: json.art, card_id: json.card_id });
      setStatus((s) => ({ ...s, [entry.id]: { state: "ok", alertas: json.alertas || [] } }));
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

          <div>
            <label>Como criar</label>
            <div className="art-modes">
              {MODES.map((m) => (
                <button key={m.id} type="button" className={"art-mode" + (mode === m.id ? " on" : "")} onClick={() => setMode(m.id)} disabled={running} aria-pressed={mode === m.id}>
                  <strong>{m.title}</strong>
                  <span>{m.text}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="art-guidance">Orientação para o designer (opcional)</label>
            <textarea
              id="art-guidance"
              rows={2}
              value={guidance}
              onChange={(e) => setGuidance(e.target.value)}
              disabled={running}
              placeholder="Ex.: usar fundo escuro, destacar o preço, foto de pessoas jogando na praia"
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
              <span className="spinner small" aria-hidden="true"></span> Criando{single ? "" : ` ${done + 1} de ${Object.keys(status).length}`}… leva cerca de 1 minuto por post.
            </span>
          )}
          <button type="button" className="btn btn-plain" onClick={onClose} disabled={running}>
            {finished ? "Fechar" : "Cancelar"}
          </button>
          {!finished && (
            <button type="button" className="btn btn-gold" onClick={run} disabled={running || picked.size === 0}>
              {single ? "🎨 Criar arte" : `🎨 Criar ${picked.size} ${picked.size === 1 ? "arte" : "artes"}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ArtStatus({ st }) {
  if (!st) return null;
  if (st.state === "fila") return <span className="art-st">na fila</span>;
  if (st.state === "criando")
    return (
      <span className="art-st">
        <span className="spinner small" aria-hidden="true"></span> criando…
      </span>
    );
  if (st.state === "erro") return <span className="art-st erro">{st.msg}</span>;
  return (
    <span className="art-st ok">
      ✓ arte anexada na peça
      {st.alertas?.length > 0 && (
        <ul className="art-alerts">
          {st.alertas.map((a, i) => (
            <li key={i}>{a}</li>
          ))}
        </ul>
      )}
    </span>
  );
}
