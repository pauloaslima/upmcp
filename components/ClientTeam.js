"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { normalizeLink, uploadFile, removeFile } from "../lib/files";
import { AttachmentList } from "./Board";

// Equipe do cliente: funcionários ligados a ele (com a função de cada um) e os logins do próprio cliente.
export function ClientTeam({ client, team, isAdmin, showToast, onMembersChange }) {
  const [members, setMembers] = useState([]);
  const [clientUsers, setClientUsers] = useState([]);
  const [routines, setRoutines] = useState([]);
  const [form, setForm] = useState({ user_id: "", role_label: "" });
  const people = Object.fromEntries(team.map((p) => [p.id, p]));

  async function load() {
    const [m, u, r] = await Promise.all([
      supabase.from("client_members").select("*").eq("client_id", client.id),
      supabase.from("profiles").select("id, email, full_name").eq("role", "cliente").eq("client_id", client.id),
      supabase.from("routines").select("user_id, title").eq("client_id", client.id).eq("active", true)
    ]);
    setMembers(m.data || []);
    setClientUsers(u.data || []);
    setRoutines(r.data || []);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.id]);

  async function add(e) {
    e.preventDefault();
    if (!form.user_id) return;
    const { error } = await supabase
      .from("client_members")
      .upsert({ client_id: client.id, user_id: form.user_id, role_label: form.role_label.trim() }, { onConflict: "client_id,user_id" });
    if (error) {
      console.error(error);
      showToast("Não consegui adicionar.");
      return;
    }
    setForm({ user_id: "", role_label: "" });
    await load();
    onMembersChange?.();
  }

  async function remove(m) {
    const { error } = await supabase.from("client_members").delete().eq("client_id", client.id).eq("user_id", m.user_id);
    if (error) return showToast("Não consegui remover.");
    await load();
    onMembersChange?.();
  }

  // o responsável pelo cliente aparece mesmo sem estar na lista
  const staffRows = [...members];
  if (client.responsible_id && !members.some((m) => m.user_id === client.responsible_id)) {
    staffRows.unshift({ user_id: client.responsible_id, role_label: "", implicit: true });
  }

  return (
    <section className="checklist-panel">
      <div className="checklist-head">
        <h3>Equipe e acessos</h3>
      </div>

      <div className="team-cols">
        <div>
          <div className="checklist-group-title">Funcionários</div>
          {staffRows.length === 0 && <div className="hint">Ninguém ligado a este cliente ainda.</div>}
          {staffRows.map((m) => {
            const p = people[m.user_id];
            const fns = [
              m.user_id === client.responsible_id && "Responsável pelo cliente",
              m.role_label,
              ...routines.filter((r) => r.user_id === m.user_id).map((r) => r.title + " (rotina diária)")
            ].filter(Boolean);
            return (
              <div key={m.user_id} className="member-row">
                <div>
                  <strong>{p?.full_name || p?.email || "—"}</strong>
                  <div className="member-fns">{fns.length ? fns.join(" · ") : "sem função definida"}</div>
                </div>
                {isAdmin && !m.implicit && (
                  <button className="attach-remove" title="Tirar deste cliente" onClick={() => remove(m)}>
                    ✕
                  </button>
                )}
              </div>
            );
          })}
          {isAdmin && (
            <form className="member-add" onSubmit={add}>
              <select value={form.user_id} onChange={(e) => setForm({ ...form, user_id: e.target.value })}>
                <option value="">Adicionar funcionário…</option>
                {team
                  .filter((p) => !members.some((m) => m.user_id === p.id))
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name || p.email}
                    </option>
                  ))}
              </select>
              <input type="text" value={form.role_label} onChange={(e) => setForm({ ...form, role_label: e.target.value })} placeholder="Função (ex.: social media, design)" />
              <button className="btn btn-plain" type="submit" disabled={!form.user_id}>
                Adicionar
              </button>
            </form>
          )}
        </div>

        <div>
          <div className="checklist-group-title">Logins do cliente</div>
          {clientUsers.length === 0 && <div className="hint">Nenhum login de cliente. {isAdmin ? "Crie em Usuários e permissões." : ""}</div>}
          {clientUsers.map((u) => (
            <div key={u.id} className="member-row">
              <div>
                <strong>{u.full_name || u.email}</strong>
                <div className="member-fns">Cliente · aprova conteúdos, vê calendário e semana atual</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// Perfil do cliente: posicionamento, identidade visual (texto + arquivos), observações importantes e Drive.
// É a base que a equipe e os agentes (conteúdo e design) consultam antes de criar.
const PROFILE_FIELDS = [
  {
    key: "positioning",
    label: "Posicionamento",
    rows: 4,
    placeholder: "Quem é o cliente, o que vende, para quem, diferenciais, tom de voz, pilares de conteúdo…"
  },
  {
    key: "identity",
    label: "Identidade visual",
    rows: 4,
    placeholder: "Cores (ex.: #1B2A4A, dourado), fontes, estilo das fotos, elementos obrigatórios, o que evitar…"
  },
  {
    key: "notes",
    label: "Observações importantes",
    rows: 4,
    placeholder: "Assuntos proibidos, pedidos recorrentes do cliente, aprovações sensíveis, datas da empresa…"
  }
];

// Abre só para leitura. Para mudar: "Editar" → alterar → "Salvar alterações" (pede confirmação).
// "Cancelar" descarta tudo, inclusive arquivos enviados durante a edição.
export function ClientProfile({ client, showToast, onSaved }) {
  const fromClient = () => ({
    positioning: client.positioning || "",
    identity: client.identity || "",
    notes: client.notes || "",
    drive_url: client.drive_url || "",
    identity_files: client.identity_files || []
  });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(fromClient);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const uploadedNow = useRef([]); // arquivos enviados nesta edição
  const fileRef = useRef(null);

  useEffect(() => {
    if (!editing) setDraft(fromClient());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.id, client.positioning, client.identity, client.notes, client.drive_url, client.identity_files, editing]);

  const saved = fromClient();
  const changed =
    ["positioning", "identity", "notes", "drive_url"].some((k) => draft[k].trim() !== saved[k]) ||
    draft.identity_files.map((f) => f.path || f.url).join("|") !== saved.identity_files.map((f) => f.path || f.url).join("|");

  function startEdit() {
    uploadedNow.current = [];
    setDraft(fromClient());
    setEditing(true);
  }

  function cancel() {
    if (changed && !confirm("Descartar as alterações do perfil?")) return;
    uploadedNow.current.forEach(removeFile);
    uploadedNow.current = [];
    setDraft(fromClient());
    setEditing(false);
  }

  async function save() {
    if (!changed) {
      setEditing(false);
      return;
    }
    if (!confirm(`Salvar as alterações no perfil de ${client.name}?\n\nEssas informações são usadas pela equipe e pelos agentes de conteúdo e design.`)) return;
    const patch = {
      positioning: draft.positioning.trim(),
      identity: draft.identity.trim(),
      notes: draft.notes.trim(),
      drive_url: draft.drive_url.trim() ? normalizeLink(draft.drive_url) : "",
      identity_files: draft.identity_files
    };
    setSaving(true);
    const { error } = await supabase.from("clients").update(patch).eq("id", client.id);
    setSaving(false);
    if (error) {
      console.error(error);
      showToast("Não consegui salvar o perfil do cliente.");
      return;
    }
    // arquivos tirados da lista durante a edição: apaga do armazenamento só depois de salvar
    const kept = new Set(patch.identity_files.map((f) => f.path));
    saved.identity_files.filter((f) => f.path && !kept.has(f.path)).forEach(removeFile);
    uploadedNow.current = [];
    onSaved(patch);
    setEditing(false);
    showToast("Perfil do cliente salvo.");
  }

  async function handleFile(e) {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const att = await uploadFile(`clients/${client.id}`, file);
      uploadedNow.current.push(att);
      setDraft((d) => ({ ...d, identity_files: [...d.identity_files, att] }));
    } catch (err) {
      console.error(err);
      showToast("Não consegui subir o arquivo.");
    } finally {
      setUploading(false);
    }
  }

  const v = editing ? draft : saved;

  return (
    <section className="checklist-panel profile-panel">
      <div className="checklist-head">
        <h3>Perfil do cliente</h3>
        {!editing ? (
          <button className="btn btn-gold" onClick={startEdit}>
            Editar
          </button>
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
            {f.key === "identity" && (
              <>
                <div style={{ marginTop: 8 }}>
                  <AttachmentList
                    attachments={v.identity_files}
                    showToast={showToast}
                    onRemove={editing ? (idx) => setDraft((d) => ({ ...d, identity_files: d.identity_files.filter((_, i) => i !== idx) })) : undefined}
                  />
                </div>
                {editing && (
                  <div className="attach-row" style={{ marginTop: 6 }}>
                    <button className="file-btn" disabled={uploading} onClick={() => fileRef.current?.click()}>
                      📎 {uploading ? "Enviando…" : "Logo, manual de marca, paleta…"}
                    </button>
                    <input type="file" ref={fileRef} hidden onChange={handleFile} />
                  </div>
                )}
              </>
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
        Nos temas do Conteúdo da semana, “Usar a identidade do cliente” puxa a identidade visual daqui. Os agentes de conteúdo e de
        design também consultam este perfil.
      </div>
    </section>
  );
}
