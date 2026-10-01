"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { IMAGE_COST } from "../lib/arts";
import { IMAGE_PROVIDERS } from "../lib/segments";
import { agentFetch } from "./SpecialistRun";

// Artes do tema no modo híbrido: a IA gera a imagem de cada página (sem texto) e o sistema
// escreve o texto do redator por cima com as cores, fontes e logo do cliente.
// Mudar o texto só remonta a arte (sem custo de IA); "Nova imagem" chama a IA de novo.
export default function ArtsDialog({ entry, client, onClose, showToast }) {
  const [pages, setPages] = useState(null);
  const [provider, setProvider] = useState(client.image_provider || "nano_banana");
  const [usePhotos, setUsePhotos] = useState((entry.photos || []).length > 0);
  const [working, setWorking] = useState(null); // { index, kind: "imagem" | "texto" } ou { all: true, index }
  const [error, setError] = useState("");
  const api = `/api/arts/${entry.id}`;
  const busy = !!working;

  useEffect(() => {
    agentFetch(api, { method: "POST", body: "{}" })
      .then((r) => setPages(r.pages))
      .catch((err) => setError(err.message));
  }, [api]);

  const setText = (i, patch) => setPages((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch, _dirty: true } : p)));

  async function generate(i) {
    setWorking({ index: i, kind: "imagem" });
    setError("");
    try {
      const page = pages[i];
      if (page._dirty) await agentFetch(api, { method: "PATCH", body: JSON.stringify({ index: i, titulo: page.titulo, apoio: page.apoio, prompt: page.prompt }) });
      const r = await agentFetch(`${api}/image`, { method: "POST", body: JSON.stringify({ index: i, provider, usar_fotos: usePhotos }) });
      setPages((ps) => r.pages.map((p, j) => (j === i ? p : { ...p, titulo: ps[j].titulo, apoio: ps[j].apoio, prompt: ps[j].prompt, _dirty: ps[j]._dirty })));
      return true;
    } catch (err) {
      setError(`${pages[i].pagina}: ${err.message}`);
      return false;
    } finally {
      setWorking(null);
    }
  }

  async function generateAll() {
    const todo = pages.map((p, i) => i).filter((i) => !pages[i].imagem);
    const list = todo.length ? todo : pages.map((_, i) => i);
    const cost = (list.length * (IMAGE_COST[provider] || 0.1)).toFixed(2);
    if (!confirm(`Gerar ${list.length} imagem(ns) com ${label(provider)}? Custo aproximado: US$ ${cost}.`)) return;
    for (const i of list) {
      if (!(await generate(i))) break;
    }
    showToast("Artes geradas. Confira cada página.");
  }

  async function remount(i) {
    setWorking({ index: i, kind: "texto" });
    setError("");
    try {
      const p = pages[i];
      const r = await agentFetch(api, { method: "PATCH", body: JSON.stringify({ index: i, titulo: p.titulo, apoio: p.apoio, prompt: p.prompt, layout: p.layout, montar: true }) });
      setPages((ps) => r.pages.map((x, j) => (j === i ? x : ps[j])));
    } catch (err) {
      setError(err.message);
    } finally {
      setWorking(null);
    }
  }

  async function replan() {
    if (!confirm("Refazer as páginas a partir do texto da peça salvo no tema? As imagens e artes atuais serão descartadas.")) return;
    setWorking({ all: true });
    try {
      const r = await agentFetch(api, { method: "POST", body: JSON.stringify({ force: true }) });
      setPages(r.pages);
    } catch (err) {
      setError(err.message);
    } finally {
      setWorking(null);
    }
  }

  const missing = pages ? pages.filter((p) => !p.imagem).length : 0;

  // fora do formulário do tema (Enter aqui não salva o tema) e sem fechar o tema ao clicar fora
  return createPortal(
    <div
      className="overlay arts-layer"
      onClick={(e) => {
        e.stopPropagation();
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="modal modal-lg">
        <div className="modal-head">
          <div style={{ flex: 1 }}>
            <h3 className="entry-title">🎨 Artes com IA</h3>
            <div className="entry-date">
              {client.name} · {entry.format} · {entry.theme}
            </div>
          </div>
          <button type="button" className="icon-btn" title="Fechar" onClick={onClose} disabled={busy}>
            ✕
          </button>
        </div>

        <div className="modal-body">
          <p className="agent-intro">
            A IA gera só a <strong>imagem</strong> de cada página, sem texto. O sistema escreve o <strong>texto da peça</strong> por cima, com as cores,
            fontes e logo do perfil do cliente. Mudar o texto e clicar em “Atualizar texto” não gasta IA.
          </p>

          <div className="arts-bar">
            <label>
              Gerador
              <select value={provider} onChange={(e) => setProvider(e.target.value)} disabled={busy}>
                {IMAGE_PROVIDERS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label} · ≈ US$ {IMAGE_COST[p.id].toFixed(2)}/imagem
                  </option>
                ))}
              </select>
            </label>
            {(entry.photos || []).length > 0 && (
              <label className="spec-check">
                <input type="checkbox" checked={usePhotos} onChange={(e) => setUsePhotos(e.target.checked)} disabled={busy} />
                Usar as fotos do tema como referência (produto ou ambiente real)
              </label>
            )}
          </div>

          {!(client.brand_colors || "").trim() && !(client.brand_logo || []).length && (
            <div className="hint warn">O perfil do cliente ainda não tem cores nem logo para as artes (Perfil do cliente → Artes). A arte sai com a cor padrão e sem logo.</div>
          )}
          {error && <div className="login-msg error">{error}</div>}
          {!pages && !error && (
            <div className="agent-wait">
              <span className="spinner" aria-hidden="true"></span> Preparando as páginas…
            </div>
          )}

          {pages && (
            <div className="arts-grid">
              {pages.map((p, i) => {
                const src = p.arte_url || p.imagem_url;
                const here = working && working.index === i;
                return (
                  <div key={i} className="art-card">
                    <div className={"art-preview " + (p.aspect === "9:16" ? "tall" : "feed")}>
                      {src ? <img src={src} alt={p.pagina} /> : <span className="hint">Sem imagem ainda</span>}
                      {here && (
                        <div className="art-busy">
                          <span className="spinner" aria-hidden="true"></span> {working.kind === "imagem" ? "Gerando imagem… (até 1 min)" : "Montando…"}
                        </div>
                      )}
                    </div>
                    <div className="art-head">
                      <strong>{p.pagina}</strong>
                      {p.imagem && <span className="hint">{label(p.imagem.provider)}</span>}
                    </div>
                    <label className="spec-field">
                      <span>Título</span>
                      <input type="text" value={p.titulo} onChange={(e) => setText(i, { titulo: e.target.value })} disabled={busy} />
                    </label>
                    <label className="spec-field">
                      <span>Texto de apoio</span>
                      <textarea rows={3} value={p.apoio} onChange={(e) => setText(i, { apoio: e.target.value })} disabled={busy} />
                    </label>
                    <details>
                      <summary className="hint">Pedido de imagem (em inglês)</summary>
                      <textarea rows={4} value={p.prompt} onChange={(e) => setText(i, { prompt: e.target.value })} disabled={busy} />
                    </details>
                    <div className="art-actions">
                      <button type="button" className="btn btn-plain" onClick={() => remount(i)} disabled={busy}>
                        {p.arte ? "Atualizar texto" : "Montar só com texto"}
                      </button>
                      <button type="button" className="btn btn-gold" onClick={() => generate(i)} disabled={busy}>
                        {p.imagem ? "Nova imagem" : "Gerar imagem"}
                      </button>
                      {p.arte_url && (
                        <a className="btn btn-plain" href={p.arte_url} target="_blank" rel="noopener noreferrer" download>
                          Baixar
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="modal-footer">
            <button type="button" className="btn btn-plain" onClick={replan} disabled={busy || !pages}>
              Refazer páginas do texto
            </button>
            <button type="button" className="btn btn-gold" onClick={generateAll} disabled={busy || !pages}>
              {missing ? `Gerar ${missing} imagem(ns)` : "Gerar todas de novo"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

function label(id) {
  return IMAGE_PROVIDERS.find((p) => p.id === id)?.label || id;
}
