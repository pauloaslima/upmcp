"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";

// Banco de ideias do cliente (só a equipe): categoria, descrição e link, em tabela.
export default function IdeasBank({ client, me, showToast }) {
  const [rows, setRows] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(null); // null | { id?, category, description, link }
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    let alive = true;
    supabase
      .from("client_ideas")
      .select("*")
      .eq("client_id", client.id)
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) {
          console.error(error);
          showToast("Não consegui carregar o banco de ideias.");
        }
        setRows(data || []);
        setLoaded(true);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.id]);

  const categories = useMemo(() => [...new Set(rows.map((r) => r.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR")), [rows]);
  const visible = filter ? rows.filter((r) => r.category === filter) : rows;

  async function save() {
    const values = {
      category: editing.category.trim(),
      description: editing.description.trim(),
      link: normalizeLink(editing.link)
    };
    if (!values.category && !values.description && !values.link) return;
    setSaving(true);
    const { data, error } = editing.id
      ? await supabase.from("client_ideas").update({ ...values, updated_at: new Date().toISOString() }).eq("id", editing.id).select().single()
      : await supabase.from("client_ideas").insert({ ...values, client_id: client.id, created_by: me }).select().single();
    setSaving(false);
    if (error) {
      console.error(error);
      showToast("Não consegui salvar a ideia.");
      return;
    }
    setRows((prev) => (editing.id ? prev.map((r) => (r.id === data.id ? data : r)) : [data, ...prev]));
    setEditing(null);
    showToast(editing.id ? "Ideia atualizada." : "Ideia adicionada.");
  }

  async function remove(row) {
    if (!confirm(`Excluir esta ideia${row.category ? ` (${row.category})` : ""}?`)) return;
    const { error } = await supabase.from("client_ideas").delete().eq("id", row.id);
    if (error) {
      console.error(error);
      showToast("Não consegui excluir a ideia.");
      return;
    }
    setRows((prev) => prev.filter((r) => r.id !== row.id));
    showToast("Ideia excluída.");
  }

  return (
    <section className="ideas-panel">
      <div className="checklist-head">
        <div>
          <h3>Banco de ideias</h3>
          <p className="hint">Só a equipe vê. Guarde referências, temas e links para usar nos conteúdos.</p>
        </div>
        <div className="ideas-actions">
          {categories.length > 1 && (
            <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filtrar por categoria">
              <option value="">Todas as categorias</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          )}
          <button type="button" className="btn btn-gold" onClick={() => setEditing({ category: filter, description: "", link: "" })}>
            + Adicionar novo
          </button>
        </div>
      </div>

      {loaded && rows.length === 0 ? (
        <div className="empty-state">Nenhuma ideia ainda. Clique em <strong>+ Adicionar novo</strong> para começar.</div>
      ) : (
        <div className="ads-table-wrap">
          <table className="ads-table ideas-table">
            <thead>
              <tr>
                <th>Categoria</th>
                <th>Descrição</th>
                <th>Link</th>
                <th aria-label="Ações"></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.id}>
                  <td className="ideas-cat">{r.category ? <span className="ideas-tag">{r.category}</span> : <span className="hint">Sem categoria</span>}</td>
                  <td className="ideas-desc">{r.description}</td>
                  <td className="ideas-link">
                    {r.link ? (
                      <a href={r.link} target="_blank" rel="noopener noreferrer" title={r.link}>
                        {shortLink(r.link)}
                      </a>
                    ) : (
                      <span className="hint">Sem link</span>
                    )}
                  </td>
                  <td className="ideas-row-actions">
                    <button type="button" className="mini-link" onClick={() => setEditing({ id: r.id, category: r.category, description: r.description, link: r.link })}>
                      ✏️ Editar
                    </button>
                    <button type="button" className="mini-link danger" onClick={() => remove(r)}>
                      🗑 Excluir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <div className="overlay" onClick={(e) => e.target.classList.contains("overlay") && !saving && setEditing(null)}>
          <div className="modal modal-md ideas-modal" role="dialog" aria-label={editing.id ? "Editar ideia" : "Nova ideia"}>
            <div className="modal-head">
              <h3 style={{ flex: 1 }}>{editing.id ? "Editar ideia" : "Nova ideia"}</h3>
              <button type="button" className="icon-btn" title="Fechar" onClick={() => setEditing(null)} disabled={saving}>
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div>
                <label htmlFor="idea-cat">Categoria</label>
                <input
                  id="idea-cat"
                  type="text"
                  list="idea-cats"
                  value={editing.category}
                  autoFocus
                  onChange={(e) => setEditing({ ...editing, category: e.target.value })}
                  placeholder="Ex.: Reels, Datas comemorativas, Bastidores"
                />
                <datalist id="idea-cats">
                  {categories.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
              <div>
                <label htmlFor="idea-desc">Descrição</label>
                <textarea id="idea-desc" rows={4} value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} placeholder="Qual é a ideia?" />
              </div>
              <div>
                <label htmlFor="idea-link">Link</label>
                <input id="idea-link" type="url" value={editing.link} onChange={(e) => setEditing({ ...editing, link: e.target.value })} placeholder="https://..." />
              </div>
            </div>
            <div className="modal-foot">
              <button type="button" className="btn btn-plain" onClick={() => setEditing(null)} disabled={saving}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-gold"
                onClick={save}
                disabled={saving || (!editing.category.trim() && !editing.description.trim() && !editing.link.trim())}
              >
                {saving ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

// "instagram.com/x" vira "https://instagram.com/x"
function normalizeLink(v) {
  const s = (v || "").trim();
  if (!s) return "";
  return /^https?:\/\//i.test(s) ? s : "https://" + s;
}

function shortLink(url) {
  const s = url.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "");
  return s.length > 40 ? s.slice(0, 38) + "…" : s;
}
