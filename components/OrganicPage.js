"use client";

import { useMemo, useState } from "react";
import { Card, PeriodFilter, ReportStatus, fmt, useMetaReport } from "./MetaReport";

// Insights orgânicos do Instagram do cliente (somente leitura). Os dados vêm do servidor
// (/api/meta/organic), que procura só o Instagram daquele cliente.

const SORTS = [
  { id: "recentes", label: "Mais recentes" },
  { id: "alcance", label: "Maior alcance" },
  { id: "interacoes", label: "Mais interações" }
];

const METRICS = [
  { key: "alcance", label: "Alcance", full: "Alcance" },
  { key: "visualizacoes", label: "Visualiz.", full: "Visualizações" },
  { key: "curtidas", label: "Curtidas", full: "Curtidas" },
  { key: "comentarios", label: "Coment.", full: "Comentários" },
  { key: "compartilhamentos", label: "Compart.", full: "Compartilhamentos" },
  { key: "salvos", label: "Salvos", full: "Salvos" }
];

export default function OrganicPage({ client }) {
  const { period, setPeriod, loading, error, data } = useMetaReport("/api/meta/organic", client.id);
  const [sort, setSort] = useState("recentes");
  const totals = data?.totais;

  const posts = useMemo(() => {
    const list = [...(data?.posts || [])];
    if (sort === "alcance") list.sort((a, b) => (b.alcance || 0) - (a.alcance || 0));
    if (sort === "interacoes") list.sort((a, b) => (b.interacoes || 0) - (a.interacoes || 0));
    return list;
  }, [data, sort]);

  const profiles = data?.perfis || [];
  const periodText = data?.periodo ? `${fmt.date(data.periodo.since)} a ${fmt.date(data.periodo.until)}` : "";

  return (
    <section className="checklist-panel ads-panel">
      <div className="checklist-head">
        <h3>Insights orgânicos</h3>
        {periodText && <span className="ads-period">{periodText}</span>}
      </div>

      <PeriodFilter period={period} onChange={setPeriod} idPrefix="org" />
      <ReportStatus loading={loading} error={error} empty={data && !posts.length} loadingText="Buscando os posts no Instagram…" />

      {data && posts.length > 0 && (
        <>
          <div className="ads-cards">
            <Card label="Posts no período" value={fmt.int(totals.posts)} />
            <Card label="Alcance (soma)" value={fmt.int(totals.alcance)} />
            <Card label="Interações" value={fmt.int(totals.interacoes)} />
            <Card label="Seguidores hoje" value={fmt.int(totals.seguidores)} />
          </div>

          <div className="org-bar">
            <span className="ads-dim">{profiles.map((p) => "@" + p.usuario).join(" | ")}</span>
            <label className="org-sort">
              Ordenar
              <select value={sort} onChange={(e) => setSort(e.target.value)}>
                {SORTS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="org-grid">
            {posts.map((p) => (
              <article key={p.id} className="org-post">
                <a className="org-thumb" href={p.link} target="_blank" rel="noopener noreferrer" title="Abrir no Instagram">
                  {p.imagem ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.imagem} alt={p.legenda ? p.legenda.slice(0, 80) : "Post do Instagram"} loading="lazy" referrerPolicy="no-referrer" />
                  ) : (
                    <span className="org-noimg" aria-hidden="true">
                      📷
                    </span>
                  )}
                  <span className="org-type">{p.tipo}</span>
                </a>
                <div className="org-body">
                  <div className="org-date">{new Date(p.data).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</div>
                  {p.legenda && <p className="org-caption">{p.legenda}</p>}
                  <dl className="org-metrics">
                    {METRICS.map((m) => (
                      <div key={m.key} title={m.full}>
                        <dt>{m.label}</dt>
                        <dd>{fmt.int(p[m.key])}</dd>
                      </div>
                    ))}
                  </dl>
                  <div className="org-total">
                    <strong>{fmt.int(p.interacoes)}</strong> interações
                  </div>
                </div>
              </article>
            ))}
          </div>
          <p className="hint">
            {totals.posts} {totals.posts === 1 ? "post publicado" : "posts publicados"} no período{data.truncated ? " (mostrando os 100 mais recentes)" : ""}. Stories não entram. Dados do Instagram,
            atualizados a cada 5 minutos.
          </p>
        </>
      )}
    </section>
  );
}
