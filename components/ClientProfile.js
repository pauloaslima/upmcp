"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { normalizeLink, removeFile, uploadFile } from "../lib/files";
import { MATERIAL_ACCEPT, MATERIAL_CATEGORIES, PROFILE_FIELDS } from "../lib/profileFields";
import { AttachmentList } from "./Board";

const FIELD_KEYS = PROFILE_FIELDS.map((f) => f.key);
const sameFiles = (a, b) => a.map((f) => f.path || f.url).join("|") === b.map((f) => f.path || f.url).join("|");

// arquivos antigos de "identidade visual" passam a fazer parte dos materiais (categoria Identidade de marca)
function allMaterials(client) {
  return [...(client.materials || []), ...(client.identity_files || []).map((f) => ({ ...f, category: "identidade" }))];
}

// Perfil do cliente: base que a equipe e os agentes (conteúdo e design) consultam.
// Abre só para leitura. Para mudar: "Editar" → alterar → "Salvar alterações" (pede confirmação).
// "✨ Preencher com IA" lê os materiais e sugere os campos; a equipe escolhe o que aceitar e confirma.
export function ClientProfile({ client, showToast, onSaved }) {
  const fromClient = () => ({
    ...Object.fromEntries(FIELD_KEYS.map((k) => [k, client[k] || ""])),
    drive_url: client.drive_url || "",
    materials: allMaterials(client)
  });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(fromClient);
  const [uploadCategory, setUploadCategory] = useState("identidade");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ai, setAi] = useState(null); // { loading } | { result, accept: {campo: bool}, edits: {campo: texto} } | { error }
  const [elapsed, setElapsed] = useState(0);
  const uploadedNow = useRef([]);
  const fileRef = useRef(null);

  useEffect(() => {
    if (!editing) setDraft(fromClient());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, editing]);

  useEffect(() => {
    if (!ai?.loading) return;
    const start = Date.now();
    const t = setInterval(() => setElapsed(Math.round((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(t);
  }, [ai?.loading]);

  const saved = fromClient();
  const changed =
    [...FIELD_KEYS, "drive_url"].some((k) => draft[k].trim() !== saved[k]) || !sameFiles(draft.materials, saved.materials);

  function startEdit(prefill) {
    uploadedNow.current = [];
    setDraft({ ...fromClient(), ...(prefill || {}) });
    setEditing(true);
  }

  function cancel() {
    if (changed && !confirm("Descartar as alterações do perfil?")) return;
    uploadedNow.current.forEach(removeFile);
    uploadedNow.current = [];
    setEditing(false);
  }

  async function save() {
    if (!changed) {
      setEditing(false);
      return;
    }
    if (!confirm(`Salvar as alterações no perfil de ${client.name}?\n\nEssas informações são usadas pela equipe e pelos agentes de conteúdo e design.`)) return;
    const patch = {
      ...Object.fromEntries(FIELD_KEYS.map((k) => [k, draft[k].trim()])),
      drive_url: draft.drive_url.trim() ? normalizeLink(draft.drive_url) : "",
      materials: draft.materials,
      identity_files: [] // os arquivos de identidade agora ficam em "materiais"
    };
    setSaving(true);
    const { error } = await supabase.from("clients").update(patch).eq("id", client.id);
    setSaving(false);
    if (error) {
      console.error(error);
      showToast("Não consegui salvar o perfil do cliente.");
      return;
    }
    // arquivos tirados da lista: apaga do armazenamento só depois de salvar
    const kept = new Set(patch.materials.map((f) => f.path));
    saved.materials.filter((f) => f.path && !kept.has(f.path)).forEach(removeFile);
    uploadedNow.current = [];
    onSaved(patch);
    setEditing(false);
    showToast("Perfil do cliente salvo.");
  }

  async function handleFiles(e) {
    const files = [...e.target.files];
    e.target.value = "";
    if (!files.length) return;
    setUploading(true);
    const added = [];
    for (const file of files) {
      try {
        const att = await uploadFile(`clients/${client.id}/materiais`, file);
        added.push({ ...att, category: uploadCategory, size: file.size });
      } catch (err) {
        console.error(err);
        showToast("Não consegui subir " + file.name + ".");
      }
    }
    uploadedNow.current.push(...added);
    setDraft((d) => ({ ...d, materials: [...d.materials, ...added] }));
    setUploading(false);
  }

  async function runAi() {
    setAi({ loading: true });
    setElapsed(0);
    try {
      const { data } = await supabase.auth.getSession();
      const res = await fetch("/api/profile-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + (data.session?.access_token || "") },
        body: JSON.stringify({ client_id: client.id })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAi({ error: json.error || "Não consegui analisar os materiais agora.", ignorados: json.ignorados });
        return;
      }
      const accept = {};
      const edits = {};
      FIELD_KEYS.forEach((k) => {
        const s = (json.campos?.[k] || "").trim();
        edits[k] = s;
        accept[k] = !!s && s !== (client[k] || "").trim();
      });
      setAi({ result: json, accept, edits });
    } catch (err) {
      console.error(err);
      setAi({ error: "Não consegui falar com o servidor. Confira a internet e tente de novo." });
    }
  }

  function applyAi() {
    const chosen = Object.fromEntries(FIELD_KEYS.filter((k) => ai.accept[k]).map((k) => [k, ai.edits[k]]));
    setAi(null);
    startEdit(chosen);
    showToast("Sugestões aplicadas. Revise e clique em “Salvar alterações”.");
  }

  const v = editing ? draft : saved;
  const byCategory = MATERIAL_CATEGORIES.map((c) => ({ ...c, files: v.materials.filter((m) => (m.category || "outros") === c.id) })).filter(
    (c) => c.files.length
  );

  return (
    <section className="checklist-panel profile-panel">
      <div className="checklist-head">
        <h3>Perfil do cliente</h3>
        {!editing ? (
          <div className="profile-actions">
            <button className="btn btn-plain ai-btn" onClick={runAi} disabled={ai?.loading}>
              ✨ Preencher com IA
            </button>
            <button className="btn btn-gold" onClick={() => startEdit()}>
              Editar
            </button>
          </div>
        ) : (
          <div className="profile-actions">
            {changed && <span className="hint warn">alterações não salvas</span>}
            <button className="btn btn-plain" onClick={cancel} disabled={saving}>
              Cancelar
            </button>
            <button className="btn btn-gold" onClick={save} disabled={saving || uploading}>
              {saving ? "Salvando…" : "Salvar alterações"}
            </button>
          </div>
        )}
      </div>

      {ai && <AiPanel ai={ai} setAi={setAi} client={client} elapsed={elapsed} onApply={applyAi} />}

      {/* materiais primeiro: é deles que o resto do perfil sai */}
      <div className="materials">
        <div className="materials-head">
          <label>Materiais do cliente</label>
          <span className="hint">Manual de marca, setup estratégico, posts de exemplo, linhas editoriais… PDF, imagens, Excel (.xlsx), Word (.docx) ou texto.</span>
        </div>
        {byCategory.length === 0 && <div className="profile-read empty">Nenhum material enviado ainda.</div>}
        <div className="materials-grid">
          {byCategory.map((c) => (
            <div key={c.id} className="material-group">
              <div className="checklist-group-title">
                {c.label} <span>{c.files.length} arquivo(s)</span>
              </div>
              <AttachmentList
                attachments={c.files}
                showToast={showToast}
                onRemove={
                  editing
                    ? (idx) => {
                        const target = c.files[idx];
                        setDraft((d) => ({ ...d, materials: d.materials.filter((m) => m !== target) }));
                      }
                    : undefined
                }
              />
            </div>
          ))}
        </div>
        {editing && (
          <div className="materials-upload">
            <select value={uploadCategory} onChange={(e) => setUploadCategory(e.target.value)} aria-label="Categoria dos arquivos">
              {MATERIAL_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            <button className="file-btn" disabled={uploading} onClick={() => fileRef.current?.click()}>
              📎 {uploading ? "Enviando…" : "Enviar arquivos"}
            </button>
            <input type="file" multiple accept={MATERIAL_ACCEPT} ref={fileRef} hidden onChange={handleFiles} />
            <span className="hint">Planilhas .xls antigas: salve como .xlsx antes de enviar.</span>
          </div>
        )}
      </div>

      <div className="profile-grid">
        {PROFILE_FIELDS.map((f) => (
          <div key={f.key} className={"profile-field" + (f.key === "notes" ? " wide" : "")}>
            <label htmlFor={"pf-" + f.key}>{f.label}</label>
            {editing ? (
              <textarea
                id={"pf-" + f.key}
                rows={f.rows}
                value={draft[f.key]}
                onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
              />
            ) : (
              <div className={"profile-read" + (v[f.key] ? "" : " empty")}>{v[f.key] || "Não preenchido."}</div>
            )}
          </div>
        ))}

        <div className="profile-field wide">
          <label htmlFor="pf-drive">Link do Drive</label>
          {editing ? (
            <input
              id="pf-drive"
              type="url"
              value={draft.drive_url}
              onChange={(e) => setDraft((d) => ({ ...d, drive_url: e.target.value }))}
              placeholder="https://drive.google.com/drive/folders/…"
            />
          ) : v.drive_url ? (
            <a className="btn btn-plain profile-drive" href={v.drive_url} target="_blank" rel="noopener noreferrer">
              Abrir pasta do Drive ↗
            </a>
          ) : (
            <div className="profile-read empty">Não preenchido.</div>
          )}
        </div>
      </div>
      <div className="hint">
        Nos temas do Conteúdo da semana, “Usar a identidade do cliente” puxa a identidade visual daqui. Os agentes de conteúdo e de design
        consultam todo este perfil.
      </div>
    </section>
  );
}

// Painel das sugestões da IA: cada campo com o texto atual, a sugestão (editável) e de onde veio
function AiPanel({ ai, setAi, client, elapsed, onApply }) {
  if (ai.loading) {
    return (
      <div className="ai-panel">
        <div className="agent-wait">
          <span className="spinner" aria-hidden="true"></span> Lendo os materiais e preparando as sugestões… {elapsed}s{" "}
          <span className="hint">(costuma levar de 1 a 3 min)</span>
        </div>
      </div>
    );
  }
  if (ai.error) {
    return (
      <div className="ai-panel">
        <div className="login-msg error">{ai.error}</div>
        {ai.ignorados?.length > 0 && <SkippedList list={ai.ignorados} />}
        <button className="btn btn-plain" onClick={() => setAi(null)}>
          Fechar
        </button>
      </div>
    );
  }
  const { result, accept, edits } = ai;
  const chosen = FIELD_KEYS.filter((k) => accept[k]).length;
  return (
    <div className="ai-panel">
      <div className="ai-panel-head">
        <strong>✨ Sugestões da IA</strong>
        <span className="hint">
          {result.lidos.length} material(is) lido(s). Marque o que quer usar; nada é salvo sem a sua confirmação.
        </span>
      </div>
      {result.resumo && <p className="ai-summary">{result.resumo}</p>}
      {result.ignorados?.length > 0 && <SkippedList list={result.ignorados} />}

      <div className="ai-fields">
        {PROFILE_FIELDS.map((f) => {
          const suggestion = edits[f.key];
          const current = (client[f.key] || "").trim();
          const same = suggestion === current;
          return (
            <div key={f.key} className={"ai-field" + (accept[f.key] ? " on" : "") + (f.key === "notes" ? " wide" : "")}>
              <label className="ai-field-head">
                <input
                  type="checkbox"
                  checked={!!accept[f.key]}
                  disabled={!suggestion || same}
                  onChange={(e) => setAi({ ...ai, accept: { ...accept, [f.key]: e.target.checked } })}
                />
                <span>{f.label}</span>
                <small>{!suggestion ? "sem informação nos materiais" : same ? "igual ao atual" : current ? "substitui o atual" : "campo vazio hoje"}</small>
              </label>
              {suggestion && !same && (
                <>
                  <textarea
                    rows={Math.min(8, Math.max(3, suggestion.split("\n").length))}
                    value={suggestion}
                    onChange={(e) => setAi({ ...ai, edits: { ...edits, [f.key]: e.target.value } })}
                  />
                  {result.fontes?.[f.key] && <div className="hint">Fonte: {result.fontes[f.key]}</div>}
                  {current && (
                    <details className="ai-current">
                      <summary>ver o texto atual</summary>
                      <div className="profile-read">{current}</div>
                    </details>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      {result.lacunas?.length > 0 && (
        <div className="ai-gaps">
          <strong>O que os materiais não cobrem:</strong>
          <ul>
            {result.lacunas.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="review-actions">
        <button className="btn btn-plain" onClick={() => setAi(null)}>
          Descartar sugestões
        </button>
        <button className="btn btn-gold" onClick={onApply} disabled={!chosen}>
          Usar {chosen} sugestão(ões) e revisar
        </button>
      </div>
    </div>
  );
}

function SkippedList({ list }) {
  return (
    <div className="hint warn">
      Não lidos: {list.map((s) => `${s.name} (${s.motivo})`).join("; ")}.
    </div>
  );
}
