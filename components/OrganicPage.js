"use client";

import { useMemo, useState } from "react";
import { Change, ExportPdfButton, PeriodFilter, PrintHeader, ReportStatus, Sparkline, fmt, useMetaReport } from "./MetaReport";

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

const share = (part, total) => (total ? (part / total) * 100 : null);
const pct1 = (v) => (v === null || v === undefined ? "-" : new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(v) + "%");

export default function OrganicPage({ client }) {
  const { period, setPeriod, loading, error, data } = useMetaReport("/api/meta/organic", client.id);
  const [sort, setSort] = useState("recentes");

  const posts = useMemo(() => {
    const list = [...(data?.posts || [])];
    if (sort === "alcance") list.sort((a, b) => (b.alcance || 0) - (a.alcance || 0));
    if (sort === "interacoes") list.sort((a, b) => (b.interacoes || 0) - (a.interacoes || 0));
    return list;
  }, [data, sort]);

  const profiles = data?.perfis || [];
  const perf = data?.desempenho;
  const periodText = data?.periodo ? `${fmt.date(data.periodo.since)} a ${fmt.date(data.periodo.until)}` : "";
  const found = data && profiles.length > 0;

  return (
    <section className="checklist-panel ads-panel report">
      <PrintHeader client={client} report="Insights orgânicos do Instagram" periodText={periodText} />
      <div className="checklist-head">
        <h3>Insights orgânicos</h3>
        <div className="report-head-right">
          {periodText && <span className="ads-period">{periodText}</span>}
          <ExportPdfButton title={`Insights orgânicos | ${client.name} | ${periodText}`} disabled={!found} />
        </div>
      </div>

      <PeriodFilter period={period} onChange={setPeriod} idPrefix="org" />
      <ReportStatus loading={loading} error={error} empty={data && !profiles.length} loadingText="Buscando os números no Instagram…" />

      {found && (
        <>
          <div className="org-bar">
            <h4 className="report-title">
              Desempenho <span className="ads-dim">{profiles.map((p) => "@" + p.usuario).join(" | ")}</span>
            </h4>
          </div>

          {perf ? (
            <div className="perf-grid">
              <PerfCard
                title="Visualizações"
                value={perf.visualizacoes?.total}
                change={perf.visualizacoes?.variacao}
                rows={
                  perf.visualizacoes?.seguidores !== undefined
                    ? [
                        { label: "De seguidores", value: pct1(share(perf.visualizacoes.seguidores, perf.visualizacoes.total)) },
                        { label: "De não seguidores", value: pct1(share(perf.visualizacoes.nao_seguidores, perf.visualizacoes.total)) }
                      ]
                    : []
                }
              />
              <PerfCard
                title="Seguidores"
                value={perf.seguidores?.atual}
                spark={perf.seguidores?.serie}
                rows={[
                  { label: "Novos no período", value: perf.seguidores?.novos === null ? "-" : "+" + fmt.int(perf.seguidores.novos) },
                  { label: "Deixaram de seguir", value: fmt.int(perf.seguidores?.deixaram), change: perf.seguidores?.variacao_deixaram, invert: true }
                ]}
              />
              <PerfCard
                title="Alcance"
                value={perf.alcance?.total}
                change={perf.alcance?.variacao}
                spark={perf.alcance?.serie}
                rows={
                  perf.alcance?.seguidores !== undefined
                    ? [
                        { label: "De seguidores", value: fmt.int(perf.alcance.seguidores) },
                        { label: "De não seguidores", value: fmt.int(perf.alcance.nao_seguidores) }
                      ]
                    : []
                }
              />
              <PerfCard
                title="Interações"
                value={perf.interacoes?.total}
                change={perf.interacoes?.variacao}
                rows={[
                  { label: "Contas com interação", value: fmt.int(perf.interacoes?.contas) },
                  { label: "Curtidas | Comentários", value: fmt.int(perf.interacoes?.curtidas) + " | " + fmt.int(perf.interacoes?.comentarios) },
                  { label: "Compartilhamentos | Salvos", value: fmt.int(perf.interacoes?.compartilhamentos) + " | " + fmt.int(perf.interacoes?.salvos) }
                ]}
              />
            </div>
          ) : (
            <div className="login-msg">Os números da conta não foram liberados pela Meta para este período. A lista de posts continua abaixo.</div>
          )}

          <div className="org-bar">
            <h4 className="report-title">
              Posts do período <span className="ads-dim">{fmt.int(posts.length)}</span>
            </h4>
            {posts.length > 1 && (
              <label className="org-sort no-print">
                Ordenar
                <select value={sort} onChange={(e) => setSort(e.target.value)}>
                  {SORTS.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          {posts.length === 0 ? (
            <div className="ads-empty">Nenhum post publicado neste período.</div>
          ) : (
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
                    <p className="org-caption">{p.legenda || "Sem legenda"}</p>
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
          )}
          <p className="hint">
            Variações comparam com o período anterior de mesmo tamanho. Stories não entram{data.truncated ? "; mostrando os 100 posts mais recentes" : ""}. Dados do Instagram,
            atualizados a cada 5 minutos.
          </p>
        </>
      )}
    </section>
  );
}

function PerfCard({ title, value, change, rows = [], spark }) {
  return (
    <div className="perf-card">
      <div className="perf-title">{title}</div>
      <div className="perf-main">
        <div>
          <strong className="perf-value">{fmt.int(value)}</strong> <Change value={change} />
        </div>
        <Sparkline points={spark} />
      </div>
      {rows.map((r) => (
        <div key={r.label} className="perf-row">
          <span>{r.label}</span>
          <strong>
            {r.value} <Change value={r.change} invert={r.invert} />
          </strong>
        </div>
      ))}
    </div>
  );
}
