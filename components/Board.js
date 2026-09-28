"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import {
  COLUMNS,
  COL_INDEX,
  FORMATS,
  KNOWN_CLIENTS,
  defaultCard
} from "../lib/pipeline";

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

export default function Board({ session }) {
  const [cards, setCards] = useState({}); // id -> card
  const [connected, setConnected] = useState(false);
  const [search, setSearch] = useState("");
  const [clientFilter, setClientFilter] = useState("");
  const [openId, setOpenId] = useState(null); // card being edited, or "__new__:<column>"
  const [toast, setToast] = useState("");
  const toastTimer = useRef(null);
  const dragCardId = useRef(null);

  function showToast(msg) {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2600);
  }

  // initial load + realtime subscription
  useEffect(() => {
    let alive = true;

    async function load() {
      const { data, error } = await supabase.from("cards").select("*");
      if (!alive) return;
      if (error) {
        console.error(error);
        showToast("Não consegui carregar o quadro agora.");
        return;
      }
      const map = {};
      (data || []).forEach((row) => {
        map[row.id] = row;
      });
      setCards(map);
      setConnected(true);
    }
    load();

    const channel = supabase
      .channel("cards-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cards" },
        (payload) => {
          setCards((prev) => {
            const next = { ...prev };
            if (payload.eventType === "DELETE") {
              delete next[payload.old.id];
            } else {
              next[payload.new.id] = payload.new;
            }
            return next;
          });
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setConnected(true);
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") setConnected(false);
      });

    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, []);

  const clientOptions = useMemo(() => {
    const set = new Set(KNOWN_CLIENTS);
    Object.values(cards).forEach((c) => c.client && set.add(c.client));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [cards]);

  function matchesFilters(card) {
    if (clientFilter && card.client !== clientFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const hay = [card.title, card.client, card.objective, card.pillar, card.copy]
        .join(" ")
        .toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    return true;
  }

  const columnCards = useMemo(() => {
    const map = {};
    COLUMNS.forEach((c) => (map[c.id] = []));
    Object.values(cards)
      .filter(matchesFilters)
      .sort((a, b) => (a.updated_at || "").localeCompare(b.updated_at || ""))
      .forEach((card) => {
        const col = map[card.column_id] ? card.column_id : "estruturacao";
        map[col].push(card);
      });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards, search, clientFilter]);

  async function saveCard(id, patch) {
    const { data, error } = await supabase
      .from("cards")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) {
      console.error(error);
      showToast("Não consegui salvar. Tente de novo.");
      return;
    }
    setCards((prev) => ({ ...prev, [id]: data }));
  }

  async function createCard(columnId, extra) {
    const payload = { ...defaultCard(columnId), ...(extra || {}) };
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
  }

  async function moveCard(id, newColumn) {
    const card = cards[id];
    if (!card || card.column_id === newColumn) return;
    await saveCard(id, { column_id: newColumn });
    showToast("Movido para “" + (COLUMNS[COL_INDEX[newColumn]] || {}).name + "”.");
  }

  async function handleNewCard(columnId) {
    const card = await createCard(columnId);
    if (card) setOpenId(card.id);
  }

  const openCard = openId ? cards[openId] : null;

  return (
    <div>
      <div className="topbar">
        <div className="brand">
          <span className="mark">U!</span>
          <div>
            <h1>Up! Fluxo</h1>
            <div className="sub">produção de conteúdo &middot; Up! Digital</div>
          </div>
        </div>
        <input
          type="search"
          placeholder="Buscar peça, cliente, ID…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)}>
          <option value="">Todos os clientes</option>
          {clientOptions.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <span className="status-pill">
          <span className={"status-dot" + (connected ? "" : " off")}></span>
          {connected ? "conectado" : "conectando…"}
        </span>
        <button className="btn btn-ghost" onClick={() => supabase.auth.signOut()}>
          Sair
        </button>
        <button className="btn btn-gold" onClick={() => handleNewCard("calendario")}>
          + Nova peça
        </button>
      </div>

      <div className="board-wrap">
        <div className="board">
          {COLUMNS.map((col) => (
            <ColumnView
              key={col.id}
              col={col}
              cards={columnCards[col.id] || []}
              onOpen={(id) => setOpenId(id)}
              onAdd={() => handleNewCard(col.id)}
              onDrop={(id) => moveCard(id, col.id)}
              dragCardId={dragCardId}
            />
          ))}
        </div>
      </div>

      {openCard && (
        <CardModal
          card={openCard}
          onClose={() => setOpenId(null)}
          onSave={(patch) => saveCard(openCard.id, patch)}
          onDelete={() => {
            deleteCard(openCard.id);
            setOpenId(null);
          }}
          showToast={showToast}
        />
      )}

      <div className={"toast" + (toast ? " show" : "")}>{toast}</div>
    </div>
  );
}

function ColumnView({ col, cards, onOpen, onAdd, onDrop, dragCardId }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      className={"column" + (hover ? " drop-hover" : "")}
      onDragOver={(e) => {
        e.preventDefault();
        setHover(true);
      }}
      onDragLeave={() => setHover(false)}
      onDrop={(e) => {
        e.preventDefault();
        setHover(false);
        if (dragCardId.current) onDrop(dragCardId.current);
      }}
    >
      <div className="col-head">
        <span className="col-bar" style={{ background: col.color }}></span>
        <h3>{col.name}</h3>
        <span className="col-count">{cards.length}</span>
      </div>
      <div className="col-cards">
        {cards.length === 0 && <div className="empty-col">Sem peças aqui.</div>}
        {cards.map((card) => (
          <CardTile key={card.id} card={card} onOpen={onOpen} dragCardId={dragCardId} />
        ))}
      </div>
      <button className="col-add" onClick={onAdd}>
        + adicionar peça
      </button>
    </div>
  );
}

function CardTile({ card, onOpen, dragCardId }) {
  const prog = checklistProgress(card);
  const pct = prog.total ? Math.round((100 * prog.done) / prog.total) : 0;
  const shortId = card.id.slice(-5).toUpperCase();
  const barColor = (COLUMNS[COL_INDEX[card.column_id]] || {}).color || "var(--border)";

  return (
    <button
      className="card"
      style={{ borderLeftColor: barColor }}
      draggable
      onDragStart={(e) => {
        dragCardId.current = card.id;
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={() => onOpen(card.id)}
    >
      <div className="card-top">
        <div className="card-title">{card.title || "Sem título"}</div>
        <div className="card-id mono">#{shortId}</div>
      </div>
      {card.client && <div className="card-client">{card.client}</div>}
      <div className="card-tags">
        {card.format && <span className="tag tag-format">{card.format}</span>}
        {card.sensitive && <span className="tag tag-sensitive">sensível</span>}
      </div>
      <div className="card-foot">
        <span className="card-date">{card.publish_date ? fmtDate(card.publish_date) : "—"}</span>
        <span className="card-progress">
          <span className="progress-bar">
            <span className="progress-fill" style={{ width: pct + "%" }}></span>
          </span>
          {prog.done}/{prog.total}
        </span>
      </div>
      {card.attachments && card.attachments.length > 0 && (
        <div className="card-files">📎 {card.attachments.length} arquivo(s)</div>
      )}
    </button>
  );
}

function CardModal({ card, onClose, onSave, onDelete, showToast }) {
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
    const next = local.checklist.map((item, i) =>
      i === idx ? { ...item, done: !item.done } : item
    );
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
    const next = [
      ...(local.attachments || []),
      { type: "link", url, name: url.replace(/^https?:\/\//, "").slice(0, 40) }
    ];
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
      const path = `${card.id}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("anexos").upload(path, file);
      if (upErr) throw upErr;
      const { data: signed } = await supabase.storage
        .from("anexos")
        .createSignedUrl(path, 60 * 60 * 24 * 7); // 7 dias
      const next = [
        ...(local.attachments || []),
        { type: "upload", path, url: signed?.signedUrl || "", name: file.name }
      ];
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
    <div
      className="overlay"
      onClick={(e) => {
        if (e.target.classList.contains("overlay")) onClose();
      }}
    >
      <div className="modal">
        <div className="modal-head">
          <input
            className="title-input"
            {...field("title")}
            onBlur={() => commit("title")}
            placeholder="Nome da peça"
          />
          <button className="icon-btn" title="Excluir peça" onClick={onDelete}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          <div className="col-select-row">
            <div style={{ flex: 1 }}>
              <label>Coluna</label>
              <select
                value={local.column_id}
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
            </div>
            <div style={{ flex: 1 }}>
              <label>Cliente</label>
              <input
                list="clientsList"
                type="text"
                {...field("client")}
                onBlur={() => commit("client")}
                placeholder="Nome do cliente"
              />
              <datalist id="clientsList">
                {KNOWN_CLIENTS.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
          </div>

          <div className="field-row">
            <div>
              <label>Objetivo do post</label>
              <input {...field("objective")} onBlur={() => commit("objective")} placeholder="Ex.: gerar agendamentos" />
            </div>
            <div>
              <label>Pilar / funil</label>
              <input {...field("pillar")} onBlur={() => commit("pillar")} placeholder="Ex.: topo de funil" />
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
                onChange={(e) => setLocal((l) => ({ ...l, publish_date: e.target.value }))}
                onBlur={() => commit("publish_date")}
              />
            </div>
          </div>

          <div>
            <label>Canais</label>
            <input {...field("channels")} onBlur={() => commit("channels")} placeholder="Instagram, TikTok…" />
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
              <input {...field("cta")} onBlur={() => commit("cta")} placeholder="Ex.: chama no direct" />
            </div>
            <div>
              <label>Referência visual</label>
              <input {...field("visual_ref")} onBlur={() => commit("visual_ref")} placeholder="Link ou descrição" />
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
            Peça sensível (institucional, posicionamento, campanha, assunto delicado) — passa pela Joana nas
            duas checagens
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
            <div className="attach-list">
              {(!local.attachments || local.attachments.length === 0) && (
                <div className="hint">Nenhum arquivo anexado ainda.</div>
              )}
              {(local.attachments || []).map((att, idx) => (
                <div className="attach-item" key={idx}>
                  <span>{att.type === "upload" ? "🗂️" : "🔗"}</span>
                  {att.url ? (
                    <a href={att.url} target="_blank" rel="noopener noreferrer">
                      {att.name || att.url}
                    </a>
                  ) : (
                    <span className="name">{att.name}</span>
                  )}
                  <button className="attach-remove" onClick={() => removeAttachment(idx)}>
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <div className="attach-row" style={{ marginTop: 8 }}>
              <button className="file-btn" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
                📎 {uploading ? "Enviando…" : "Subir arquivo"}
              </button>
              <button className="file-btn" onClick={addLink}>
                🔗 Anexar link
              </button>
              <input type="file" ref={fileInputRef} hidden onChange={handleFile} />
            </div>
            <div className="hint">Upload disponível para qualquer pessoa logada (equipe e clientes convidados).</div>
          </div>

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
