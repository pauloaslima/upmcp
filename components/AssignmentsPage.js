"use client";

import { useEffect, useState } from "react";
import { shortName } from "../lib/people";
import { supabase } from "../lib/supabaseClient";
import { initials } from "./Board";

// Atribuições (administrador): uma coluna por funcionário com os clientes pelos quais ele responde.
// Mover um cliente de coluna (arrastando, ou clicando no cliente e depois no funcionário)
// troca o "Responsável pelo cliente" na hora.
export default function AssignmentsPage({ clients, team, onSetResponsible, onOpenClient }) {
  const [selected, setSelected] = useState(null); // cliente escolhido para mover com cliques
  const [dragging, setDragging] = useState(null);
  const [hover, setHover] = useState(null);
  const [members, setMembers] = useState([]); // demais funcionários ligados a cada cliente
  const people = Object.fromEntries(team.map((p) => [p.id, p]));

  useEffect(() => {
    supabase
      .from("client_members")
      .select("client_id, user_id, role_label")
      .then(({ data }) => setMembers(data || []));
  }, []);

  const columns = [
    ...team.map((p) => ({ id: p.id, title: p.full_name || p.email, person: p })),
    { id: null, title: "Sem responsável" }
  ];
  const clientsOf = (colId) => clients.filter((c) => (c.responsible_id || null) === colId);

  async function moveTo(clientId, colId) {
    const client = clients.find((c) => c.id === clientId);
    setSelected(null);
    setDragging(null);
    setHover(null);
    if (!client || (client.responsible_id || null) === colId) return;
    await onSetResponsible(clientId, colId);
  }

  return (
    <div className="assign">
      <p className="hint assign-help">
        Arraste o cliente para a coluna do funcionário, ou clique no cliente e depois em <strong>“Mover para cá”</strong>. O responsável
        dentro do cliente muda na hora e passa a receber os lembretes de prazo.
      </p>
      {selected && (
        <div className="assign-selected">
          Movendo <strong>{clients.find((c) => c.id === selected)?.name}</strong> — escolha o funcionário.
          <button className="btn btn-plain" onClick={() => setSelected(null)}>
            Cancelar
          </button>
        </div>
      )}

      <div className="assign-board">
        {columns.map((col) => {
          const list = clientsOf(col.id);
          const key = col.id || "none";
          const canDrop = (selected || dragging) && list.every((c) => c.id !== (selected || dragging));
          return (
            <div
              key={key}
              className={"assign-col" + (hover === key ? " drop-hover" : "") + (col.id ? "" : " unassigned") + (canDrop && selected ? " target" : "")}
              onDragOver={(e) => {
                e.preventDefault();
                setHover(key);
              }}
              onDragLeave={() => setHover(null)}
              onDrop={(e) => {
                e.preventDefault();
                if (dragging) moveTo(dragging, col.id);
              }}
            >
              <div className="assign-head">
                {col.person ? <span className="avatar">{initials(col.person)}</span> : <span className="avatar empty">?</span>}
                <strong>{col.title}</strong>
                <span className="col-count">{list.length}</span>
              </div>
              {selected && canDrop && (
                <button className="btn btn-gold assign-here" onClick={() => moveTo(selected, col.id)}>
                  Mover para cá
                </button>
              )}
              <div className="assign-list">
                {list.length === 0 && <div className="empty-col">{col.id ? "Nenhum cliente." : "Todos os clientes têm responsável."}</div>}
                {list.map((c) => {
                  const others = members.filter((m) => m.client_id === c.id && m.user_id !== c.responsible_id);
                  return (
                    <div
                      key={c.id}
                      className={"assign-card" + (selected === c.id ? " selected" : "")}
                      draggable
                      onDragStart={(e) => {
                        setDragging(c.id);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onDragEnd={() => {
                        setDragging(null);
                        setHover(null);
                      }}
                      onClick={() => setSelected(selected === c.id ? null : c.id)}
                    >
                      <div className="assign-card-top">
                        <span className="side-initial">{c.name.charAt(0).toUpperCase()}</span>
                        <span className="assign-name">{c.name}</span>
                        <button
                          className="assign-open"
                          title="Abrir cliente"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenClient(c.id);
                          }}
                        >
                          ↗
                        </button>
                      </div>
                      {others.length > 0 && (
                        <div className="assign-others">
                          também na equipe:{" "}
                          {others.map((m) => (shortName(people[m.user_id]) || "—") + (m.role_label ? ` (${m.role_label})` : "")).join(", ")}
                        </div>
                      )}
                      <select
                        className="assign-select"
                        value={c.responsible_id || ""}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => moveTo(c.id, e.target.value || null)}
                        aria-label={"Responsável por " + c.name}
                      >
                        <option value="">Sem responsável</option>
                        {team.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.full_name || p.email}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
