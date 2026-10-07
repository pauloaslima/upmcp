"use client";

import { Card, ExportPdfButton, PeriodFilter, PrintHeader, ReportStatus, fmt, useMetaReport } from "./MetaReport";

// Anúncios do cliente na Meta (somente leitura). Os dados vêm do servidor (/api/meta/client),
// que procura só as campanhas daquele cliente; o token da Meta nunca chega ao navegador.

export default function AdsPage({ client }) {
  const { period, setPeriod, loading, error, data } = useMetaReport("/api/meta/client", client.id);
  const totals = data?.totais;
  const rows = data?.campanhas || [];
  const periodText = data?.periodo?.inicio ? `${fmt.date(data.periodo.inicio)} a ${fmt.date(data.periodo.fim)}` : "";

  return (
    <section className="checklist-panel ads-panel report">
      <PrintHeader client={client} report="Anúncios na Meta" periodText={periodText} />
      <div className="checklist-head">
        <h3>Anúncios</h3>
        <div className="report-head-right">
          {periodText && <span className="ads-period">{periodText}</span>}
          <ExportPdfButton title={`Anúncios | ${client.name} | ${periodText}`} disabled={!rows.length} />
        </div>
      </div>

      <PeriodFilter period={period} onChange={setPeriod} idPrefix="ads" />
      <ReportStatus loading={loading} error={error} empty={data && !rows.length} loadingText="Buscando as campanhas na Meta…" />

      {data && rows.length > 0 && (
        <>
          <div className="ads-cards">
            <Card label="Investimento" value={totals.investimento === null ? "-" : fmt.money(totals.investimento, totals.moeda)} />
            <Card label="Impressões" value={fmt.int(totals.impressoes)} />
            <Card label="Cliques no link" value={fmt.int(totals.cliques_no_link)} />
            <Card label="CTR | CPC | CPM" value={`${fmt.pct(totals.ctr)} | ${fmt.money(totals.cpc, totals.moeda)} | ${fmt.money(totals.cpm, totals.moeda)}`} small />
          </div>

          {totals.resultados.length > 0 && (
            <div className="ads-results">
              {totals.resultados.map((r) => (
                <span key={r.label} className="ads-result">
                  <strong>{fmt.int(r.value)}</strong> {r.label.toLowerCase()}
                  {r.cost !== null && totals.moeda && <em> | {fmt.money(r.cost, totals.moeda)} cada</em>}
                </span>
              ))}
            </div>
          )}

          <div className="ads-table-wrap">
            <table className="ads-table">
              <thead>
                <tr>
                  <th>Campanha</th>
                  <th>Investimento</th>
                  <th>Resultado</th>
                  <th>Impressões</th>
                  <th>Alcance</th>
                  <th>Frequência</th>
                  <th>Cliques no link</th>
                  <th>CTR</th>
                  <th>CPC</th>
                  <th>CPM</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.account_id + c.campaign_id}>
                    <td className="ads-name">{c.campaign_name}</td>
                    <td>{fmt.money(c.spend, c.currency)}</td>
                    <td>
                      {c.resultado ? (
                        <>
                          {fmt.int(c.resultado.value)} <span className="ads-dim">{c.resultado.label.toLowerCase()}</span>
                          {c.resultado.cost !== null && <div className="ads-dim">{fmt.money(c.resultado.cost, c.currency)} cada</div>}
                        </>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td>{fmt.int(c.impressions)}</td>
                    <td>{fmt.int(c.reach)}</td>
                    <td>{fmt.dec(c.frequency)}</td>
                    <td>{fmt.int(c.inline_link_clicks)}</td>
                    <td>{fmt.pct(c.ctr)}</td>
                    <td>{fmt.money(c.cpc, c.currency)}</td>
                    <td>{fmt.money(c.cpm, c.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="hint">
            {totals.campanhas} {totals.campanhas === 1 ? "campanha" : "campanhas"} com veiculação no período. Dados da Meta, atualizados a cada 5 minutos.
          </p>
        </>
      )}
    </section>
  );
}
