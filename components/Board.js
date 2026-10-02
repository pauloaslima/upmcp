"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { CLIENT_COLUMNS, COLUMNS, COL_INDEX, FORMATS, defaultCard } from "../lib/pipeline";
import { cardDue, iso, mondayOf, parse, shortDate, weeklyTasks } from "../lib/deadlines";
import { openAttachment, removeFile, uploadFile } from "../lib/files";

export function initials(person) {
  const name = (person?.full_name || person?.email || "?").trim();
  const parts = name.split(/\s+/);
  return ((parts[0]?.[0] || "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d)) return iso;
  const days = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  return d.getDate() + "/" + (d.getMonth() + 1) + " " + days[d.getDay()];
}

function checklistProgress(card) {
  const list = card.checklist || [];
  const done = list.filter((i) => i.done).length;
  return { done, total: list.length };
}

// Linha de produção de um cliente.
// Equipe (admin/funcionário): todas as colunas, arrastar, criar e editar.
// Cliente: só "Em aprovação", "Aprovados" e "Reprovados"; aprova, reprova e comenta.
export default function Board({ client, isStaff, team = [], showToast }) {
  const people = useMemo(() => Object.fromEntries(team.map((p) => [p.id, p])), [team]);
  const [cards, setCards] = useState({}); // id -> card
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState(null);
  const dragCardId = useRef(null);

  const columns = isStaff ? COLUMNS : CLIENT_COLUMNS;

  useEffect(() => {
    let alive = true;

    async function load() {
      const { data, error } = await supabase.from("cards").select("*").eq("client_id", client.id);
      if (!alive) return;
      if (error) {
        console.error(error);
        showToast("Não consegui carregar a linha de produção.");
        return;
      }
      const map = {};
      (data || []).forEach((row) => (map[row.id] = row));
      setCards(map);
    }
    load();

    const channel = supabase
      .channel("cards-" + client.id)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cards", filter: "client_id=eq." + client.id },
        (payload) => {
          setCards((prev) => {
            const next = { ...prev };
            if (payload.eventType === "DELETE") delete next[payload.old.id];
            else next[payload.new.id] = payload.new;
            return next;
          });
        }
      )
      .subscribe();

    // o cliente deixa de receber avisos de peças que saem da aprovação; recarrega ao voltar para a aba
    window.addEventListener("focus", load);

    return () => {
      alive = false;
      window.removeEventListener("focus", load);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.id]);

  const columnCards = useMemo(() => {
    const map = {};
    columns.forEach((c) => (map[c.id] = []));
    const q = search.toLowerCase();
    Object.values(cards)
      .filter((card) => !q || [card.title, card.objective, card.pillar, card.copy].join(" ").toLowerCase().includes(q))
      .sort((a, b) => (a.publish_date || "9999").localeCompare(b.publish_date || "9999"))
      .forEach((card) => {
        const col = map[card.column_id] ? card.column_id : isStaff ? "estruturacao" : null;
        if (col) map[col].push(card);
      });
    return map;
  }, [cards, search, columns, isStaff]);

  async function saveCard(id, patch) {
    const { data, error } = await supabase.from("cards").update(patch).eq("id", id).select().single();
    if (error) {
      console.error(error);
      showToast("Não consegui salvar. Tente de novo.");
      return;
    }
    setCards((prev) => ({ ...prev, [id]: data }));
  }

  async function createCard(columnId) {
    const payload = { ...defaultCard(columnId), client: client.name, client_id: client.id };
    const { data, error } = await supabase.from("cards").insert(payload).select().single();
    if (error) {
      console.error(error);
      showToast("Não consegui criar a peça.");
      return null;
    }
    setCards((prev) => ({ ...prev, [data.id]: data }));
    return data;
  }

  async function deleteCard(id) {
    if (!confirm("Excluir esta peça?")) return;
    const { error } = await supabase.from("cards").delete().eq("id", id);
    if (error) {
      console.error(error);
      showToast("Não consegui excluir.");
      return;
    }
    setCards((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setOpenId(null);
  }

  async function moveCard(id, newColumn) {
    const card = cards[id];
    if (!card || card.column_id === newColumn) return;
    await saveCard(id, { column_id: newColumn });
    showToast("Movido para “" + (COLUMNS[COL_INDEX[newColumn]] || {}).name + "”.");
  }

  async function review(cardId, decision, comment) {
    const { error } = await supabase.rpc("client_review", {
      p_card: cardId,
      p_decision: decision,
      p_comment: comment || ""
    });
    if (error) {
      console.error(error);
      showToast(error.message.includes("motivo") ? "Escreva o motivo da reprovação." : "Não consegui registrar.");
      return false;
    }
    setCards((prev) => ({ ...prev, [cardId]: { ...prev[cardId], column_id: decision } }));
    showToast(decision === "aprovados" ? "Conteúdo aprovado. Obrigado!" : "Reprovação enviada para a equipe.");
    return true;
  }

  const openCard = openId ? cards[openId] : null;

  return (
    <div className="board-page">
      <div className="toolbar">
        <input type="search" placeholder="Buscar peça…" value={search} onChange={(e) => setSearch(e.target.value)} />
        {isStaff ? (
          <button
            className="btn btn-gold"
            onClick={async () => {
              const card = await createCard("estruturacao");
              if (card) setOpenId(card.id);
            }}
          >
            + Nova peça
          </button>
        ) : (
          <button className="btn btn-gold" onClick={() => setOpenId("__nova__")}>
            + Nova solicitação
          </button>
        )}
      </div>

      <div className="board-wrap">
        <div className={"board" + (isStaff ? "" : " board-client")}>
          {columns.map((col) => (
            <ColumnView
              key={col.id}
              col={col}
              cards={columnCards[col.id] || []}
              isStaff={isStaff}
              people={people}
              onOpen={(id) => setOpenId(id)}
              onAdd={
                isStaff
                  ? async () => {
                      const card = await createCard(col.id);
                      if (card) setOpenId(card.id);
                    }
                  : col.id === "backlog"
                    ? () => setOpenId("__nova__")
                    : null
              }
              onDrop={(id) => moveCard(id, col.id)}
              dragCardId={dragCardId}
            />
          ))}
        </div>
      </div>

      {!isStaff && (openId === "__nova__" || (openCard && openCard.column_id === "backlog")) && (
        <RequestModal
          card={openId === "__nova__" ? null : openCard}
          onClose={() => setOpenId(null)}
          onSaved={(row) => setCards((prev) => ({ ...prev, [row.id]: row }))}
          onDeleted={(id) =>
            setCards((prev) => {
              const next = { ...prev };
              delete next[id];
              return next;
            })
          }
          showToast={showToast}
        />
      )}

      {openCard &&
        (isStaff || openCard.column_id !== "backlog") &&
        (isStaff ? (
          <CardModal
            card={openCard}
            onClose={() => setOpenId(null)}
            onSave={(patch) => saveCard(openCard.id, patch)}
            onDelete={() => deleteCard(openCard.id)}
            showToast={showToast}
            team={team}
          />
        ) : (
          <ReviewModal
            card={openCard}
            onClose={() => setOpenId(null)}
            onReview={(decision, comment) => review(openCard.id, decision, comment)}
            showToast={showToast}
          />
        ))}
    </div>
  );
}

function ColumnView({ col, cards, isStaff, people, onOpen, onAdd, onDrop, dragCardId }) {
  const [hover, setHover] = useState(false);
  const dropProps = isStaff
    ? {
        onDragOver: (e) => {
          e.preventDefault();
          setHover(true);
        },
        onDragLeave: () => setHover(false),
        onDrop: (e) => {
          e.preventDefault();
          setHover(false);
          if (dragCardId.current) onDrop(dragCardId.current);
        }
      }
    : {};
  return (
    <div className={"column" + (hover ? " drop-hover" : "")} {...dropProps}>
      <div className="col-head">
        <span className="col-bar" style={{ background: col.color }}></span>
        <h3>{col.name}</h3>
        <span className="col-count">{cards.length}</span>
      </div>
      <div className="col-cards">
        {cards.length === 0 && <div className="empty-col">Nada aqui.</div>}
        {cards.map((card) => (
          <CardTile key={card.id} card={card} isStaff={isStaff} assignee={people[card.assignee_id]} onOpen={onOpen} dragCardId={dragCardId} />
        ))}
      </div>
      {onAdd && (
        <button className="col-add" onClick={onAdd}>
          {!isStaff ? "+ nova solicitação" : col.id === "backlog" ? "+ adicionar demanda" : "+ adicionar peça"}
        </button>
      )}
    </div>
  );
}

const REQUEST_FORMATS = ["Reels", "Carrossel", "Estático", "Story", "Vídeo", "Outro"];

// Cliente pede uma demanda nova (coluna Backlog) ou ajusta a que ainda está no backlog.
function RequestModal({ card, onClose, onSaved, onDeleted, showToast }) {
  const [values, setValues] = useState({
    title: card?.title || "",
    details: card?.copy || "",
    format: card && card.format !== "Outro" ? card.format : "",
    date: card?.publish_date || ""
  });
  const [attachments, setAttachments] = useState(card?.attachments || []);
  const [pendingFiles, setPendingFiles] = useState([]); // escolhidos antes de a solicitação existir
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const set = (k) => ({ value: values[k], onChange: (e) => setValues((v) => ({ ...v, [k]: e.target.value })) });

  async function reload(id) {
    const { data } = await supabase.from("cards").select("*").eq("id", id).maybeSingle();
    if (data) onSaved(data);
    return data;
  }

  async function save(e) {
    e.preventDefault();
    if (!values.title.trim()) {
      showToast("Escreva o que você precisa.");
      return;
    }
    setBusy(true);
    try {
      let id = card?.id;
      if (!id) {
        const { data, error } = await supabase.rpc("client_create_request", {
          p_title: values.title,
          p_details: values.details,
          p_format: values.format,
          p_desired_date: values.date || null
        });
        if (error) throw error;
        id = data;
      }
      // arquivos escolhidos agora vão para a pasta da solicitação
      const uploaded = [];
      for (const f of pendingFiles) uploaded.push(await uploadFile(id, f));
      const { error: upErr } = await supabase.rpc("client_update_request", {
        p_card: id,
        p_title: values.title,
        p_details: values.details,
        p_format: values.format,
        p_desired_date: values.date || null,
        p_attachments: [...attachments, ...uploaded]
      });
      if (upErr) throw upErr;
      await reload(id);
      showToast(card ? "Solicitação atualizada." : "Solicitação enviada para a equipe da Up!.");
      onClose();
    } catch (err) {
      console.error(err);
      showToast(card ? "Não consegui salvar. Se a equipe já começou, a solicitação não pode mais ser alterada." : "Não consegui enviar a solicitação.");
    } finally {
      setBusy(false);
    }
  }

  async function removeRequest() {
    if (!confirm("Apagar esta solicitação?")) return;
    const { error } = await supabase.rpc("client_delete_request", { p_card: card.id });
    if (error) {
      showToast("Não consegui apagar. Se a equipe já começou, fale com ela pelas observações.");
      return;
    }
    attachments.forEach(removeFile);
    onDeleted(card.id);
    showToast("Solicitação apagada.");
    onClose();
  }

  return (
    <div className="overlay" onClick={(e) => e.target.classList.contains("overlay") && !busy && onClose()}>
      <form className="modal modal-sm" onSubmit={save}>
        <div className="modal-head">
          <div style={{ flex: 1 }}>
            <h3 className="entry-title">{card ? "Sua solicitação" : "Nova solicitação"}</h3>
            <div className="entry-date">A equipe da Up! recebe o pedido na coluna Backlog.</div>
          </div>
          <button type="button" className="icon-btn" title="Fechar" onClick={onClose} disabled={busy}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          <div>
            <label htmlFor="rq-title">O que você precisa?</label>
            <input id="rq-title" type="text" required maxLength={200} {...set("title")} placeholder="Ex.: Post sobre a promoção de inverno" />
          </div>
          <div>
            <label htmlFor="rq-details">Detalhes</label>
            <textarea
              id="rq-details"
              rows={5}
              {...set("details")}
              placeholder="Explique a ideia, o texto que precisa aparecer, o objetivo, o público… Quanto mais detalhes, melhor."
            />
          </div>
          <div className="field-row">
            <div>
              <label htmlFor="rq-format">Formato</label>
              <select id="rq-format" {...set("format")}>
                <option value="">A equipe sugere</option>
                {REQUEST_FORMATS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="rq-date">Para quando? (opcional)</label>
              <input id="rq-date" type="date" {...set("date")} />
            </div>
          </div>
          <div>
            <label>Arquivos e referências (opcional)</label>
            <AttachmentList
              attachments={[...attachments, ...pendingFiles.map((f) => ({ type: "pending", name: f.name }))]}
              showToast={showToast}
              onRemove={(idx) => {
                if (idx < attachments.length) setAttachments((a) => a.filter((_, i) => i !== idx));
                else setPendingFiles((p) => p.filter((_, i) => i !== idx - attachments.length));
              }}
            />
            <div className="attach-row" style={{ marginTop: 6 }}>
              <button type="button" className="file-btn" onClick={() => fileRef.current?.click()} disabled={busy}>
                📎 Anexar arquivos
              </button>
              <input
                type="file"
                multiple
                hidden
                ref={fileRef}
                onChange={(e) => {
                  const list = [...e.target.files];
                  e.target.value = "";
                  setPendingFiles((p) => [...p, ...list]);
                }}
              />
            </div>
          </div>

          {card && <CardComments cardId={card.id} showToast={showToast} />}

          <div className="modal-footer">
            {card ? (
              <button type="button" className="btn btn-danger" onClick={removeRequest} disabled={busy}>
                Apagar solicitação
              </button>
            ) : (
              <span></span>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className="btn btn-plain" onClick={onClose} disabled={busy}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-gold" disabled={busy}>
                {busy ? "Enviando…" : card ? "Salvar" : "Enviar solicitação"}
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}

function CardTile({ card, isStaff, assignee, onOpen, dragCardId }) {
  const prog = checklistProgress(card);
  const pct = prog.total ? Math.round((100 * prog.done) / prog.total) : 0;
  const barColor = (COLUMNS[COL_INDEX[card.column_id]] || {}).color || "var(--border)";
  const deadline = isStaff ? cardDue(card, iso(new Date())) : null;

  return (
    <button
      className="card"
      style={{ borderLeftColor: barColor, cursor: isStaff ? "grab" : "pointer" }}
      draggable={isStaff}
      onDragStart={(e) => {
        dragCardId.current = card.id;
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={() => onOpen(card.id)}
    >
      <div className="card-top">
        <div className="card-title">{card.title || "Sem título"}</div>
        {isStaff && <div className="card-id mono">#{card.id.slice(-5).toUpperCase()}</div>}
      </div>
      <div className="card-tags">
        {card.format && <span className="tag tag-format">{card.format}</span>}
        {isStaff && card.sensitive && <span className="tag tag-sensitive">sensível</span>}
        {isStaff && card.requested_by && <span className="tag tag-request">pedido do cliente</span>}
        {deadline && (
          <span className={"chip st-" + deadline.status.id} title={deadline.label}>
            prazo {shortDate(deadline.due)}
          </span>
        )}
      </div>
      <div className="card-foot">
        <span className="card-date">
          {isStaff && (
            <span className={"avatar" + (assignee ? "" : " empty")} title={assignee ? "Responsável: " + (assignee.full_name || assignee.email) : "Sem responsável"}>
              {assignee ? initials(assignee) : "?"}
            </span>
          )}
          {card.publish_date ? fmtDate(card.publish_date) : "—"}
        </span>
        {isStaff && (
          <span className="card-progress">
            <span className="progress-bar">
              <span className="progress-fill" style={{ width: pct + "%" }}></span>
            </span>
            {prog.done}/{prog.total}
          </span>
        )}
      </div>
      {card.attachments && card.attachments.length > 0 && (
        <div className="card-files">📎 {card.attachments.length} arquivo(s)</div>
      )}
    </button>
  );
}

export function AttachmentList({ attachments, onRemove, showToast }) {
  if (!attachments || attachments.length === 0) return <div className="hint">Nenhum arquivo anexado ainda.</div>;
  return (
    <div className="attach-list">
      {attachments.map((att, idx) => (
        <div className="attach-item" key={idx}>
          <span>{att.type === "link" ? "🔗" : "🗂️"}</span>
          {att.type === "pending" ? (
            <span className="name">
              {att.name} <small className="hint">(vai junto ao enviar)</small>
            </span>
          ) : (
            <a
              href={att.type === "upload" ? "#" : att.url}
              onClick={(e) => {
                e.preventDefault();
                openAttachment(att, showToast);
              }}
            >
              {att.name || att.url}
            </a>
          )}
          {onRemove && (
            <button type="button" className="attach-remove" title="Remover" onClick={() => onRemove(idx)}>
              ✕
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

// Observações da peça: equipe e cliente conversam aqui
function CardComments({ cardId, showToast }) {
  const [comments, setComments] = useState([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [me, setMe] = useState(null);

  useEffect(() => {
    let alive = true;
    supabase.auth.getUser().then(({ data }) => alive && setMe(data.user?.id || null));
    supabase
      .from("card_comments")
      .select("*")
      .eq("card_id", cardId)
      .order("created_at")
      .then(({ data }) => alive && setComments(data || []));

    const channel = supabase
      .channel("comments-" + cardId)
      .on("postgres_changes", { event: "*", schema: "public", table: "card_comments", filter: "card_id=eq." + cardId }, (p) =>
        setComments((prev) => {
          const id = p.old?.id || p.new?.id;
          const rest = prev.filter((c) => c.id !== id);
          return p.eventType === "DELETE" ? rest : [...rest, p.new].sort((a, b) => a.created_at.localeCompare(b.created_at));
        })
      )
      .subscribe();
    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, [cardId]);

  async function send() {
    const body = text.trim();
    if (!body) return;
    setSending(true);
    const { data, error } = await supabase.from("card_comments").insert({ card_id: cardId, body }).select().single();
    setSending(false);
    if (error) {
      console.error(error);
      showToast("Não consegui salvar a observação.");
      return;
    }
    setComments((prev) => [...prev.filter((c) => c.id !== data.id), data]);
    setText("");
  }

  async function remove(id) {
    if (!confirm("Apagar esta observação?")) return;
    const { error } = await supabase.from("card_comments").delete().eq("id", id);
    if (error) {
      showToast("Não consegui apagar.");
      return;
    }
    setComments((prev) => prev.filter((c) => c.id !== id));
  }

  return (
    <div>
      <div className="section-label" style={{ marginBottom: 8 }}>
        Observações
      </div>
      <div className="comments">
        {comments.length === 0 && <div className="hint">Nenhuma observação ainda.</div>}
        {comments.map((c) => (
          <div key={c.id} className={"comment" + (c.author_role === "cliente" ? " from-client" : "")}>
            <div className="comment-head">
              <strong>{c.author_name || "—"}</strong>
              <span className="comment-role">{c.author_role === "cliente" ? "cliente" : "equipe Up!"}</span>
              <span className="comment-date">{new Date(c.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</span>
              {c.author_id === me && (
                <button className="attach-remove" title="Apagar" onClick={() => remove(c.id)}>
                  ✕
                </button>
              )}
            </div>
            <div className="comment-body">{c.body}</div>
          </div>
        ))}
      </div>
      <div className="comment-new">
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Escreva uma observação…" rows={2} />
        <button className="btn btn-plain" disabled={sending || !text.trim()} onClick={send}>
          {sending ? "Enviando…" : "Adicionar observação"}
        </button>
      </div>
    </div>
  );
}

// Visão do cliente: conteúdo, arte, observações e decisão
function ReviewModal({ card, onClose, onReview, showToast }) {
  const [reason, setReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [busy, setBusy] = useState(false);

  async function decide(decision) {
    setBusy(true);
    const ok = await onReview(decision, decision === "reprovados" ? reason : "");
    setBusy(false);
    if (ok) onClose();
  }

  const status = (CLIENT_COLUMNS.find((c) => c.id === card.column_id) || {}).name;

  return (
    <div className="overlay" onClick={(e) => e.target.classList.contains("overlay") && onClose()}>
      <div className="modal">
        <div className="modal-head">
          <div style={{ flex: 1 }}>
            <h3 className="entry-title">{card.title || "Sem título"}</h3>
            <div className="entry-date">
              {[card.format, card.publish_date && fmtDate(card.publish_date), status].filter(Boolean).join(" · ")}
            </div>
          </div>
          <button className="icon-btn" title="Fechar" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          {card.copy && (
            <div>
              <label>Legenda</label>
              <div className="read-block">{card.copy}</div>
            </div>
          )}
          {card.script && (
            <div>
              <label>Roteiro</label>
              <div className="read-block">{card.script}</div>
            </div>
          )}
          {card.cta && (
            <div>
              <label>Chamada (CTA)</label>
              <div className="read-block">{card.cta}</div>
            </div>
          )}
          <div>
            <label>Arte e arquivos</label>
            <AttachmentList attachments={card.attachments} showToast={showToast} />
          </div>

          <CardComments cardId={card.id} showToast={showToast} />

          {rejecting ? (
            <div className="review-box">
              <label htmlFor="reject-reason">O que precisa mudar?</label>
              <textarea
                id="reject-reason"
                autoFocus
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Explique o ajuste para a equipe"
              />
              <div className="review-actions">
                <button className="btn btn-plain" onClick={() => setRejecting(false)}>
                  Voltar
                </button>
                <button className="btn btn-danger" disabled={busy || !reason.trim()} onClick={() => decide("reprovados")}>
                  Enviar reprovação
                </button>
              </div>
            </div>
          ) : (
            <div className="review-actions">
              <button className="btn btn-danger" disabled={busy} onClick={() => setRejecting(true)}>
                Reprovar
              </button>
              <button className="btn btn-approve" disabled={busy || card.column_id === "aprovados"} onClick={() => decide("aprovados")}>
                {card.column_id === "aprovados" ? "Aprovado ✓" : "Aprovar"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CardModal({ card, onClose, onSave, onDelete, showToast, team }) {
  const [local, setLocal] = useState(card);
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => setLocal(card), [card]);

  function field(key) {
    return {
      value: local[key] ?? "",
      onChange: (e) => setLocal((l) => ({ ...l, [key]: e.target.value }))
    };
  }
  function commit(key) {
    if (local[key] !== card[key]) onSave({ [key]: local[key] });
  }

  function toggleCheck(idx) {
    const next = local.checklist.map((item, i) => (i === idx ? { ...item, done: !item.done } : item));
    setLocal((l) => ({ ...l, checklist: next }));
    onSave({ checklist: next });
  }

  async function addLink() {
    const url = prompt("Cole o link do arquivo (Drive, mLabs, etc.):");
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) {
      showToast("Link inválido — use um endereço http(s) completo.");
      return;
    }
    const next = [...(local.attachments || []), { type: "link", url, name: url.replace(/^https?:\/\//, "").slice(0, 40) }];
    setLocal((l) => ({ ...l, attachments: next }));
    onSave({ attachments: next });
  }

  async function handleFile(e) {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    showToast("Enviando " + file.name + "…");
    try {
      const next = [...(local.attachments || []), await uploadFile(card.id, file)];
      setLocal((l) => ({ ...l, attachments: next }));
      onSave({ attachments: next });
      showToast("Arquivo anexado.");
    } catch (err) {
      console.error(err);
      showToast("Não consegui subir o arquivo.");
    } finally {
      setUploading(false);
    }
  }

  function removeAttachment(idx) {
    const att = local.attachments[idx];
    const next = local.attachments.filter((_, i) => i !== idx);
    setLocal((l) => ({ ...l, attachments: next }));
    onSave({ attachments: next });
    if (att?.type === "upload" && att.path) {
      supabase.storage.from("anexos").remove([att.path]).catch(() => {});
    }
  }

  const prog = checklistProgress(local);

  return (
    <div className="overlay" onClick={(e) => e.target.classList.contains("overlay") && onClose()}>
      <div className="modal">
        <div className="modal-head">
          <input className="title-input" {...field("title")} onBlur={() => commit("title")} placeholder="Nome da peça" />
          <button className="icon-btn" title="Excluir peça" onClick={onDelete}>
            🗑
          </button>
          <button className="icon-btn" title="Fechar" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          {local.requested_by && (
            <div className="agent-plan">
              <strong>Pedido do cliente.</strong> O que ele escreveu está em “Copy / legenda” e os arquivos que mandou, em “Arquivos anexados”.
              {local.column_id === "backlog" && " Para começar, mude a etapa para “Em estruturação”."}
            </div>
          )}
          <div>
            <label>Etapa</label>
            <select
              value={COL_INDEX[local.column_id] !== undefined ? local.column_id : "estruturacao"}
              onChange={(e) => {
                setLocal((l) => ({ ...l, column_id: e.target.value }));
                onSave({ column_id: e.target.value });
              }}
            >
              {COLUMNS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {local.column_id === "aprovacao" && (
              <div className="hint">O cliente já está vendo esta peça e pode aprovar ou reprovar.</div>
            )}
          </div>

          <div className="field-row">
            <div>
              <label>Responsável</label>
              <select
                value={local.assignee_id || ""}
                onChange={(e) => {
                  const v = e.target.value || null;
                  setLocal((l) => ({ ...l, assignee_id: v }));
                  onSave({ assignee_id: v });
                }}
              >
                <option value="">Ninguém ainda</option>
                {team.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name || p.email}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>Prazo</label>
              <input
                type="date"
                value={local.due_date || ""}
                onChange={(e) => setLocal((l) => ({ ...l, due_date: e.target.value || null }))}
                onBlur={() => commit("due_date")}
              />
              {!local.due_date && cardDue(local, iso(new Date())) && (
                <div className="hint">
                  Automático: {cardDue(local, iso(new Date())).label.toLowerCase()} até {shortDate(cardDue(local, iso(new Date())).due)}
                </div>
              )}
            </div>
          </div>

          <div className="field-row">
            <div>
              <label>Objetivo do post</label>
              <input type="text" {...field("objective")} onBlur={() => commit("objective")} placeholder="Ex.: gerar agendamentos" />
            </div>
            <div>
              <label>Pilar / funil</label>
              <input type="text" {...field("pillar")} onBlur={() => commit("pillar")} placeholder="Ex.: topo de funil" />
            </div>
          </div>

          <div className="field-row">
            <div>
              <label>Formato</label>
              <select
                value={local.format}
                onChange={(e) => {
                  setLocal((l) => ({ ...l, format: e.target.value }));
                  onSave({ format: e.target.value });
                }}
              >
                {FORMATS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>Data de publicação</label>
              <input
                type="date"
                value={local.publish_date || ""}
                onChange={(e) => setLocal((l) => ({ ...l, publish_date: e.target.value || null }))}
                onBlur={() => commit("publish_date")}
              />
            </div>
          </div>
          {local.publish_date && (
            <div className="card-deadlines">
              <span>Prazos desta peça (2 semanas antes da publicação):</span>
              {weeklyTasks(mondayOf(parse(local.publish_date))).map((t) => (
                <span key={t.kind} className="chip st-futuro">
                  {t.label} · {shortDate(t.due)}
                </span>
              ))}
            </div>
          )}

          <div>
            <label>Canais</label>
            <input type="text" {...field("channels")} onBlur={() => commit("channels")} placeholder="Instagram, TikTok…" />
          </div>

          <div>
            <label>Copy / legenda</label>
            <textarea {...field("copy")} onBlur={() => commit("copy")} placeholder="Texto do post" />
          </div>

          <div>
            <label>Roteiro (Reels / carrossel)</label>
            <textarea {...field("script")} onBlur={() => commit("script")} placeholder="Roteiro cena a cena" />
          </div>

          <div className="field-row">
            <div>
              <label>CTA</label>
              <input type="text" {...field("cta")} onBlur={() => commit("cta")} placeholder="Ex.: chama no direct" />
            </div>
            <div>
              <label>Referência visual</label>
              <input type="text" {...field("visual_ref")} onBlur={() => commit("visual_ref")} placeholder="Link ou descrição" />
            </div>
          </div>

          <div>
            <label>Material do cliente / link da pasta (Drive)</label>
            <input type="url" {...field("material_link")} onBlur={() => commit("material_link")} placeholder="https://drive.google.com/…" />
          </div>

          <label className="sensitive-toggle">
            <input
              type="checkbox"
              checked={!!local.sensitive}
              onChange={(e) => {
                setLocal((l) => ({ ...l, sensitive: e.target.checked }));
                onSave({ sensitive: e.target.checked });
              }}
            />
            Peça sensível (institucional, posicionamento, campanha, assunto delicado) — passa pela Joana nas duas checagens
          </label>

          <div>
            <div className="section-label" style={{ marginBottom: 8 }}>
              Etapas do post <span className="checklist-progress">{prog.done}/{prog.total}</span>
            </div>
            <div className="checklist">
              {(local.checklist || []).map((item, idx) => (
                <label key={idx} className={"check-item" + (item.done ? " done" : "")}>
                  <input type="checkbox" checked={!!item.done} onChange={() => toggleCheck(idx)} />
                  <span>{item.text}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <div className="section-label" style={{ marginBottom: 8 }}>
              Arquivos anexados
            </div>
            <AttachmentList attachments={local.attachments} onRemove={removeAttachment} showToast={showToast} />
            <div className="attach-row" style={{ marginTop: 8 }}>
              <button className="file-btn" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
                📎 {uploading ? "Enviando…" : "Subir arquivo"}
              </button>
              <button className="file-btn" onClick={addLink}>
                🔗 Anexar link
              </button>
              <input type="file" ref={fileInputRef} hidden onChange={handleFile} />
            </div>
          </div>

          <CardComments cardId={card.id} showToast={showToast} />

          <div className="modal-footer">
            <span className="footer-note">
              #{card.id.slice(-8)}
              {card.updated_at ? " · atualizado " + new Date(card.updated_at).toLocaleString("pt-BR") : ""}
            </span>
            <button className="btn btn-gold" onClick={onClose}>
              Concluído
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
