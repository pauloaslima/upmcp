"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MONTH_CAMPAIGNS, isoDate, specialDates } from "../lib/holidays";
import { CALENDAR_FORMATS, formatStyle } from "../lib/pipeline";
import { normalizeLink, removeFile, uploadFile } from "../lib/files";
import { AttachmentList } from "./Board";
import { brandFiles } from "../lib/profileFields";
import { asText, asTitle } from "../lib/text";
import { lineStyle } from "../lib/editorial";
import { supabase } from "../lib/supabaseClient";
import { BRIEF_STATUS, PLACEMENTS, PRIORITIES, REQUEST_TYPES, briefWithDefaults, designerPayload, missingForReady } from "../lib/brief";

export const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];
export const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const WEEKDAYS_SHORT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

// Monta as semanas do mês (domingo a sábado); dias de fora do mês viram null
function monthGrid(year, month) {
  const first = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells = [];
  for (let i = 0; i < first.getDay(); i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month - 1, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

// Calendário mensal de temas de um cliente.
// Só apresenta e edita; quem salva no banco é quem usa o componente (onCreate/onUpdate/onDelete).
export function SpecialDates({ list }) {
  return list.map((s) => (
    <div key={s.name} className={"cal-special cal-" + s.kind} title={s.name}>
      {s.name}
    </div>
  ));
}

// Um tema no calendário. Sem onClick, fica só para leitura (visão do cliente).
// forClient: esconde tudo o que é de uso interno (etiquetas, status do briefing, observações da equipe).
export function EntryChip({ entry, onClick, dragProps, forClient = false }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag className={"cal-entry" + (onClick ? "" : " readonly") + (dragProps ? " draggable" : "")} onClick={onClick || undefined} {...(dragProps || {})}>
      {(entry.format || entry.post_time || entry.editorial_line) && (
        <span className="cal-entry-top">
          {entry.format && (
            <span className="cal-format" style={formatStyle(entry.format)}>
              {entry.format}
            </span>
          )}
          {entry.editorial_line && (
            <span className="cal-line" style={lineStyle(entry.editorial_line)} title="Linha editorial">
              {entry.editorial_line}
            </span>
          )}
          {entry.post_time && <span className="cal-time">{entry.post_time}</span>}
        </span>
      )}
      <span className="cal-theme">{entry.theme || <em>sem tema</em>}</span>
      {!forClient && entry.notes && (
        <span className="cal-note" title={entry.notes}>
          ✎ {entry.notes}
        </span>
      )}
      {!forClient && entry.created_by_agent && <span className="cal-agent">conteúdo criado</span>}
      {!forClient && entry.published_at && <span className="cal-published">✓ publicado</span>}
      {!forClient && entry.brief_status && entry.brief_status !== "rascunho" && (
        <span className={"cal-brief brief-" + entry.brief_status}>{BRIEF_STATUS[entry.brief_status]?.short}</span>
      )}
      {!forClient && ((entry.photos || []).length > 0 || (entry.refs || []).length > 0) && (
        <span className="cal-extras">
          {(entry.photos || []).length > 0 && <span title="Fotos">📷 {entry.photos.length}</span>}
          {(entry.refs || []).length > 0 && <span title="Referências">🔗 {entry.refs.length}</span>}
        </span>
      )}
    </Tag>
  );
}

// onMove(entry, novoDia): arrastar um tema para outro dia. onAi: abre o "Criar calendário".
// onClear: abre o "Limpar mês".
export default function Calendar({ year, month, entries, readOnly, client, showToast, onPrev, onNext, onToday, onCreate, onUpdate, onDelete, onMove, onAi, onClear }) {
  const [editing, setEditing] = useState(null); // { day } para novo, { entry } para existente
  const [dragging, setDragging] = useState(null); // tema sendo arrastado
  const [dropDay, setDropDay] = useState(null);
  const canDrag = !readOnly && !!onMove;
  const today = isoDate(new Date());
  const special = specialDates(year);
  const cells = useMemo(() => monthGrid(year, month), [year, month]);

  const byDay = useMemo(() => {
    const map = {};
    entries.forEach((e) => (map[e.day] = map[e.day] || []).push(e));
    Object.values(map).forEach((list) =>
      list.sort(
        (a, b) =>
          (a.post_time || "").localeCompare(b.post_time || "") ||
          (a.created_at || "").localeCompare(b.created_at || "")
      )
    );
    return map;
  }, [entries]);

  const campaigns = MONTH_CAMPAIGNS[month] || [];

  return (
    <div className="cal">
      {!readOnly && (onAi || onMove || onClear) && (
        <div className="cal-toolbar">
          {onAi && (
            <button className="btn btn-gold" onClick={() => onAi()}>
              ✨ Criar calendário
            </button>
          )}
          {onClear && (
            <button className="btn btn-plain danger" onClick={onClear} disabled={!entries.length} title={entries.length ? "" : "Não há temas neste mês"}>
              🗑 Limpar mês
            </button>
          )}
          {onMove && <span className="hint">Arraste os temas entre os dias para remanejar o mês.</span>}
        </div>
      )}
      {!readOnly && onAi && entries.length === 0 && (
        <div className="cal-empty">
          <div>
            <strong>Este mês ainda não tem temas.</strong>
            <span>O agente lê o Perfil do cliente, analisa os meses anteriores e monta o calendário de {MONTHS[month - 1].toLowerCase()}.</span>
          </div>
          <button className="btn btn-gold" onClick={() => onAi("perfil")}>
            ✨ Criar automaticamente
          </button>
        </div>
      )}
      <div className="cal-head">
        <button className="cal-nav" onClick={onPrev} aria-label="Mês anterior">‹</button>
        <h2 className="cal-title">
          {MONTHS[month - 1]} <span>|</span> {year}
        </h2>
        <button className="cal-nav" onClick={onNext} aria-label="Próximo mês">›</button>
        <button className="cal-today" onClick={onToday}>Mês atual</button>
      </div>

      {campaigns.length > 0 && (
        <div className="cal-campaigns">
          {campaigns.map((c) => (
            <span key={c} className="cal-campaign">{c}</span>
          ))}
        </div>
      )}

      <div className="cal-legend">
        <span><i className="dot dot-feriado"></i>Feriado nacional</span>
        <span><i className="dot dot-facultativo"></i>Ponto facultativo</span>
        <span><i className="dot dot-comemorativa"></i>Data comemorativa</span>
      </div>

      <div className="cal-grid">
        {WEEKDAYS.map((w) => (
          <div key={w} className="cal-weekday">{w}</div>
        ))}
        {cells.map((date, i) => {
          if (!date) return <div key={"x" + i} className="cal-cell cal-out" aria-hidden="true"></div>;
          const key = isoDate(date);
          const specials = special[key] || [];
          const list = byDay[key] || [];
          const isHoliday = specials.some((s) => s.kind === "feriado");
          return (
            <div
              key={key}
              className={
                "cal-cell" + (key === today ? " cal-today-cell" : "") + (isHoliday ? " cal-holiday" : "") + (dropDay === key ? " drop-target" : "")
              }
              style={readOnly ? { cursor: "default" } : undefined}
              onDragOver={
                canDrag && dragging
                  ? (e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      if (dropDay !== key) setDropDay(key);
                    }
                  : undefined
              }
              onDragLeave={canDrag ? (e) => !e.currentTarget.contains(e.relatedTarget) && setDropDay(null) : undefined}
              onDrop={
                canDrag
                  ? (e) => {
                      e.preventDefault();
                      const moved = dragging;
                      setDragging(null);
                      setDropDay(null);
                      if (moved && moved.day !== key) onMove(moved, key);
                    }
                  : undefined
              }
              onClick={(e) => {
                if (!readOnly && e.target === e.currentTarget) setEditing({ day: key });
              }}
            >
              <div className="cal-daybar">
                <span className="cal-daynum">{date.getDate()}</span>
                <span className="cal-dow">{WEEKDAYS_SHORT[date.getDay()]}</span>
                {!readOnly && (
                  <button className="cal-add" title="Adicionar tema" onClick={() => setEditing({ day: key })}>
                    +
                  </button>
                )}
              </div>
              <SpecialDates list={specials} />
              {list.map((entry) => (
                <EntryChip
                  key={entry.id}
                  entry={entry}
                  forClient={readOnly}
                  onClick={readOnly ? null : () => setEditing({ entry })}
                  dragProps={
                    canDrag
                      ? {
                          draggable: true,
                          title: "Arraste para outro dia",
                          onDragStart: (e) => {
                            e.dataTransfer.effectAllowed = "move";
                            e.dataTransfer.setData("text/plain", entry.id);
                            setDragging(entry);
                          },
                          onDragEnd: () => {
                            setDragging(null);
                            setDropDay(null);
                          }
                        }
                      : null
                  }
                />
              ))}
            </div>
          );
        })}
      </div>

      {editing && (
        <EntryEditor client={client} showToast={showToast}
          key={editing.entry ? editing.entry.id : editing.day}
          day={editing.entry ? editing.entry.day : editing.day}
          entry={editing.entry}
          specials={special[editing.entry ? editing.entry.day : editing.day] || []}
          onClose={() => setEditing(null)}
          onSave={async (values) => {
            const ok = editing.entry
              ? await onUpdate(editing.entry.id, values)
              : await onCreate({ day: editing.day, ...values });
            if (ok) setEditing(null);
          }}
          onDelete={
            editing.entry
              ? async () => {
                  if (await onDelete(editing.entry.id)) setEditing(null);
                }
              : null
          }
        />
      )}
    </div>
  );
}

export function EntryEditor({ day, entry, specials, client, showToast, onClose, onSave, onDelete }) {
  const [values, setValues] = useState({
    format: entry?.format || "",
    editorial_line: entry?.editorial_line || "",
    theme: entry?.theme || "",
    post_time: entry?.post_time || "",
    notes: entry?.notes || "",
    photos: entry?.photos || [],
    refs: entry?.refs || [],
    use_client_identity: entry ? entry.use_client_identity !== false : true,
    identity_notes: entry?.identity_notes || ""
  });
  const [brief, setBrief] = useState(() => briefWithDefaults(entry, day));
  const [briefStatus, setBriefStatus] = useState(entry?.brief_status || "rascunho");
  const setB = (key) => ({ value: brief[key], onChange: (e) => setBrief((b) => ({ ...b, [key]: e.target.value })) });
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [newRef, setNewRef] = useState("");
  const uploadedNow = useRef([]); // fotos enviadas nesta edição (apagadas se cancelar)
  const photoRef = useRef(null);
  const themeRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = () => {
    uploadedNow.current.forEach(removeFile);
    onClose();
  };
  const cancel = () => closeRef.current();

  async function addPhotos(e) {
    const list = [...e.target.files];
    e.target.value = "";
    if (!list.length || !client) return;
    setUploading(true);
    try {
      const added = [];
      for (const f of list) added.push(await uploadFile(`calendar/${client.id}/${day}`, f));
      uploadedNow.current.push(...added);
      setValues((v) => ({ ...v, photos: [...v.photos, ...added] }));
    } catch (err) {
      console.error(err);
      showToast?.("Não consegui subir a foto.");
    } finally {
      setUploading(false);
    }
  }

  function addRef() {
    const url = normalizeLink(newRef);
    if (!url) return;
    setValues((v) => ({ ...v, refs: [...v.refs, { type: "link", url, name: url.replace(/^https?:\/\//, "").slice(0, 50) }] }));
    setNewRef("");
  }

  useEffect(() => {
    themeRef.current?.focus();
    const onKey = (e) => e.key === "Escape" && closeRef.current();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const date = new Date(day + "T00:00:00");
  const title =
    WEEKDAYS[date.getDay()] + ", " + date.getDate() + " de " + MONTHS[date.getMonth()].toLowerCase();

  function set(key) {
    return { value: values[key], onChange: (e) => setValues((v) => ({ ...v, [key]: e.target.value })) };
  }

  const draftEntry = { ...entry, ...values, day };
  const missing = missingForReady(draftEntry, brief);

  function copyBrief() {
    const p = designerPayload({ entry: draftEntry, brief, client });
    const text =
      `${p.title}\n` +
      `Cliente final: ${p.cliente_final}\nTipo de solicitação: ${p.tipo_de_solicitacao || "-"}\n` +
      `Prioridade: ${p.prioridade}\nPrazo: ${p.prazo_texto || "-"}\nLabels: ${p.labels.join(", ") || "-"}\n\n` +
      p.descricao;
    navigator.clipboard?.writeText(text).then(
      () => showToast?.("Briefing copiado. Cole no card do designer."),
      () => showToast?.("Não consegui copiar.")
    );
  }

  // "✨ Gerar" do Novo tema: gera o post a partir do que já foi escrito e preenche os campos (nada é salvo antes de revisar)
  async function generateDraft() {
    setGenerating(true);
    try {
      const { data } = await supabase.auth.getSession();
      const res = await fetch("/api/content-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + (data.session?.access_token || "") },
        body: JSON.stringify({
          mode: "draft",
          client_id: client.id,
          day,
          draft: { theme: values.theme, format: values.format, editorial_line: values.editorial_line, post_time: values.post_time, notes: values.notes }
        })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.rascunho) {
        showToast?.(json.error || "Não consegui gerar o conteúdo agora.");
        return;
      }
      const r = json.rascunho;
      const format = values.format || r.format;
      setValues((v) => ({
        ...v,
        theme: r.theme || v.theme,
        format,
        editorial_line: v.editorial_line.trim() || r.editorial_line,
        post_time: v.post_time.trim() || r.post_time,
        notes: v.notes.trim() || r.notes
      }));
      setBrief(briefWithDefaults({ format, brief: r.brief }, day));
      showToast?.("Conteúdo gerado. Revise e clique em Salvar.");
    } catch (err) {
      console.error(err);
      showToast?.("Não consegui falar com o servidor. Confira a internet e tente de novo.");
    } finally {
      setGenerating(false);
    }
  }

  async function submit(e) {
    e.preventDefault();
    if (briefStatus === "pronto" && missing.length) {
      showToast?.("Para marcar como pronto, falta: " + missing.join(", ") + ".");
      return;
    }
    setSaving(true);
    const kept = new Set(values.photos.map((p) => p.path));
    // fotos tiradas da lista: apaga o arquivo
    (entry?.photos || []).filter((p) => !kept.has(p.path)).forEach(removeFile);
    uploadedNow.current = [];
    await onSave({
      format: values.format,
      editorial_line: asTitle(values.editorial_line.trim()).slice(0, 60),
      theme: asTitle(values.theme.trim()),
      post_time: values.post_time.trim(),
      notes: asText(values.notes.trim()),
      photos: values.photos,
      refs: values.refs,
      use_client_identity: values.use_client_identity,
      identity_notes: values.use_client_identity ? "" : values.identity_notes.trim(),
      // salvar pela equipe = tema revisado (tira a marca "conteúdo criado")
      ...(client ? { brief, brief_status: briefStatus, created_by_agent: false } : {})
    });
    setSaving(false);
  }

  return (
    <div
      className="overlay"
      onClick={(e) => {
        if (e.target.classList.contains("overlay")) cancel();
      }}
    >
      <form className={"modal " + (client ? "modal-md" : "modal-sm")} onSubmit={submit}>
        <div className="modal-head">
          <div style={{ flex: 1 }}>
            <h3 className="entry-title">{entry ? "Editar tema" : "Novo tema"}</h3>
            <div className="entry-date">{title}</div>
          </div>
          <button type="button" className="icon-btn" title="Fechar" onClick={cancel}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          {specials.length > 0 && (
            <div className="entry-specials">
              {specials.map((s) => (
                <span key={s.name} className={"cal-special cal-" + s.kind}>
                  {s.name}
                </span>
              ))}
            </div>
          )}

          <div>
            <label>Formato</label>
            <div className="format-picker">
              {CALENDAR_FORMATS.map((f) => (
                <button
                  type="button"
                  key={f}
                  className={"format-chip" + (values.format === f ? " on" : "")}
                  style={values.format === f ? formatStyle(f) : undefined}
                  onClick={() => {
                    const next = values.format === f ? "" : f;
                    setValues((v) => ({ ...v, format: next }));
                    // sugere tipo de solicitação e onde será usada, sem apagar o que já foi escolhido
                    const d = briefWithDefaults({ format: next, day }, day);
                    setBrief((b) => ({
                      ...b,
                      request_type: b.request_type || d.request_type,
                      placements: b.placements.length ? b.placements : d.placements
                    }));
                  }}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="entry-theme-head">
              <label htmlFor="entry-theme">Tema</label>
              {client && !entry && (
                <button
                  type="button"
                  className="mini-link"
                  disabled={generating}
                  title="Gerar o post a partir do que você escreveu, com as observações do cliente"
                  onClick={generateDraft}
                >
                  {generating ? (
                    <>
                      <span className="spinner small" aria-hidden="true"></span> gerando…
                    </>
                  ) : (
                    "✨ Gerar"
                  )}
                </button>
              )}
            </div>
            <textarea
              id="entry-theme"
              ref={themeRef}
              {...set("theme")}
              placeholder={
                client && !entry
                  ? "Escreva a ideia do post e clique em ✨ Gerar, ou preencha tudo à mão"
                  : "Ex.: Educativo | Conexão | Liderança começa dentro de casa"
              }
              rows={3}
            />
          </div>

          <div className="field-row">
            <div>
              <label htmlFor="entry-line">Linha editorial</label>
              <input id="entry-line" type="text" maxLength={60} {...set("editorial_line")} placeholder="Ex.: Educativo" />
            </div>
            <div>
              <label htmlFor="entry-time">Horário</label>
              <input id="entry-time" type="text" {...set("post_time")} placeholder="Ex.: 12h" />
            </div>
          </div>

          <div>
            <label htmlFor="entry-notes">Observações</label>
            <textarea id="entry-notes" {...set("notes")} placeholder="Recados para a equipe ou para o cliente" rows={3} />
          </div>

          {client && (
            <>
              <div>
                <label>Fotos para o post</label>
                <AttachmentList
                  attachments={values.photos}
                  showToast={showToast}
                  onRemove={(idx) => setValues((v) => ({ ...v, photos: v.photos.filter((_, i) => i !== idx) }))}
                />
                <div className="attach-row" style={{ marginTop: 6 }}>
                  <button type="button" className="file-btn" disabled={uploading} onClick={() => photoRef.current?.click()}>
                    📷 {uploading ? "Enviando…" : "Enviar fotos"}
                  </button>
                  <input type="file" accept="image/*,video/*" multiple hidden ref={photoRef} onChange={addPhotos} />
                </div>
              </div>

              <div>
                <label>Referências</label>
                <AttachmentList
                  attachments={values.refs}
                  showToast={showToast}
                  onRemove={(idx) => setValues((v) => ({ ...v, refs: v.refs.filter((_, i) => i !== idx) }))}
                />
                <div className="ref-add">
                  <input
                    type="url"
                    value={newRef}
                    onChange={(e) => setNewRef(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addRef();
                      }
                    }}
                    placeholder="Cole o link (Instagram, Pinterest, Drive…)"
                  />
                  <button type="button" className="btn btn-plain" onClick={addRef} disabled={!newRef.trim()}>
                    Adicionar
                  </button>
                </div>
                <textarea
                  rows={2}
                  style={{ marginTop: 6 }}
                  {...setB("refs_note")}
                  placeholder="O que aproveitar da referência (ex.: fazer as frases no estilo da ref)"
                />
              </div>

              <div>
                <label>Identidade visual</label>
                <label className="sensitive-toggle identity-toggle">
                  <input
                    type="checkbox"
                    checked={values.use_client_identity}
                    onChange={(e) => setValues((v) => ({ ...v, use_client_identity: e.target.checked }))}
                  />
                  Usar a identidade do cliente
                </label>
                {values.use_client_identity ? (
                  <div className="identity-preview">
                    {client.identity ? client.identity : <em>O cliente ainda não tem identidade visual cadastrada (Perfil do cliente → Identidade visual).</em>}
                    {brandFiles(client).length > 0 && <span> · {brandFiles(client).length} arquivo(s) de marca</span>}
                  </div>
                ) : (
                  <textarea
                    rows={3}
                    {...set("identity_notes")}
                    placeholder="Identidade específica deste post: cores, fontes, estilo…"
                  />
                )}
              </div>

              <section className="brief">
                <div className="brief-head">
                  <h4>Briefing para o design</h4>
                  <span className={"chip brief-" + briefStatus}>{BRIEF_STATUS[briefStatus].label}</span>
                </div>
                <div className="brief-grid">
                  <div>
                    <label htmlFor="b-type">Tipo de solicitação</label>
                    <select id="b-type" {...setB("request_type")}>
                      <option value="">Escolha…</option>
                      {REQUEST_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="b-prio">Prioridade</label>
                    <select id="b-prio" {...setB("priority")}>
                      {PRIORITIES.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="b-due">Prazo do design</label>
                    <input id="b-due" type="datetime-local" {...setB("due_at")} />
                  </div>
                </div>

                <div>
                  <label>Onde a arte será usada</label>
                  <div className="pick-list">
                    {PLACEMENTS.map((p) => (
                      <label key={p} className={"pick" + (brief.placements.includes(p) ? " on" : "")}>
                        <input
                          type="checkbox"
                          checked={brief.placements.includes(p)}
                          onChange={() =>
                            setBrief((b) => ({
                              ...b,
                              placements: b.placements.includes(p) ? b.placements.filter((x) => x !== p) : [...b.placements, p]
                            }))
                          }
                        />
                        {p}
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <label htmlFor="b-must">▲ Não pode faltar nesta peça</label>
                  <textarea id="b-must" rows={3} {...setB("must_have")} placeholder={"Um item por linha. Ex.:\nRodapé padrão\nMúsica elegante\nLegendas"} />
                </div>

                <div>
                  <label htmlFor="b-notes">⚠ Observações importantes</label>
                  <textarea
                    id="b-notes"
                    rows={3}
                    {...setB("important_notes")}
                    placeholder="Criativo, takes a usar, frases sobrepostas, música, o que evitar…"
                  />
                </div>

                <div>
                  <label htmlFor="b-text">🎯 Título + texto da peça</label>
                  <textarea
                    id="b-text"
                    rows={5}
                    {...setB("piece_text")}
                    placeholder={"Texto que vai na arte. Carrossel: separe por página.\nPágina 1: …\nPágina 2: …"}
                  />
                </div>

                {briefStatus === "enviado" ? (
                  <div className="brief-sent">
                    Enviado ao design{entry?.brief_sent_at ? " em " + new Date(entry.brief_sent_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : ""}
                    {entry?.designer_card_url && (
                      <>
                        {" · "}
                        <a href={entry.designer_card_url} target="_blank" rel="noopener noreferrer">
                          abrir card do designer
                        </a>
                      </>
                    )}
                    <button type="button" className="link-btn inline" onClick={() => setBriefStatus("pronto")}>
                      reabrir
                    </button>
                  </div>
                ) : (
                  <label className="sensitive-toggle brief-ready">
                    <input
                      type="checkbox"
                      checked={briefStatus === "pronto"}
                      onChange={(e) => setBriefStatus(e.target.checked ? "pronto" : "rascunho")}
                    />
                    <span>
                      Briefing pronto para enviar ao design
                      {missing.length > 0 && <small> · falta: {missing.join(", ")}</small>}
                    </span>
                  </label>
                )}

                <button type="button" className="btn btn-plain" onClick={copyBrief}>
                  Copiar briefing
                </button>
              </section>
            </>
          )}

          <div className="modal-footer">
            {onDelete ? (
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => {
                  if (confirm("Excluir este tema do calendário?")) onDelete();
                }}
              >
                Excluir tema
              </button>
            ) : (
              <span></span>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className="btn btn-plain" onClick={cancel}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-gold" disabled={saving}>
                {saving ? "Salvando…" : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
