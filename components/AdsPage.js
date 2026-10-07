"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

// Anúncios do cliente na Meta (somente leitura). Os dados vêm do servidor (/api/meta/client),
// que procura só as campanhas daquele cliente; o token da Meta nunca chega ao navegador.

const SHORTCUTS = [
  { id: "last_7d", label: "Últimos 7 dias" },
  { id: "this_month", label: "Este mês" },
  { id: "last_30d", label: "Últimos 30 dias" }
];

const intFmt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const decFmt = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = (v, currency) => {
  if (v === null || v === undefined || v === "") return "-";
  try {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: currency || "BRL" }).format(Number(v));
  } catch {
    return decFmt.format(Number(v));
  }
};
const int = (v) => (v === null || v === undefined || v === "" ? "-" : intFmt.format(Number(v)));
const pct = (v) => (v === null || v === undefined || v === "" ? "-" : decFmt.format(Number(v)) + "%");
const dec = (v) => (v === null || v === undefined || v === "" ? "-" : decFmt.format(Number(v)));
const brDate = (iso) => (iso ? iso.split("-").reverse().join("/") : "");

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function AdsPage({ client }) {
  const [period, setPeriod] = useState({ datePreset: "last_30d" });
  const [since, setSince] = useState("");
  const [until, setUntil] = useState("");
  const [state, setState] = useState({ loading: true });

  useEffect(() => {
    let alive = true;
    (async () => {
      setState({ loading: true });
      try {
        const { data } = await supabase.auth.getSession();
        const params = new URLSearchParams({ clientId: client.id, ...period });
        const res = await fetch("/api/meta/client?" + params, { headers: { Authorization: "Bearer " + (data.session?.access_token || "") } });
        const json = await res.json().catch(() => ({}));
        if (!alive) return;
        setState(res.ok ? { data: json } : { error: json.error || "Não consegui consultar os anúncios agora." });
      } catch (err) {
        console.error(err);
        if (alive) setState({ error: "Não consegui falar com o servidor. Confira a internet e tente de novo." });
      }
    })();
    return () => {
      alive = false;
    };
  }, [client.id, period]);

  function applyRange(e) {
    e.preventDefault();
    if (!since || !until) return;
    setPeriod({ since, until });
  }

  const data = state.data;
  const totals = data?.totais;
  const rows = data?.campanhas || [];
  const periodText = data?.periodo?.inicio ? `${brDate(data.periodo.inicio)} a ${brDate(data.periodo.fim)}` : "";

  return (
    <section className="checklist-panel ads-panel">
      <div className="checklist-head">
        <h3>Anúncios</h3>
        {periodText && <span className="ads-period">{periodText}</span>}
      </div>

      <div className="ads-filters">
        <div className="ads-shortcuts" role="group" aria-label="Períodos rápidos">
          {SHORTCUTS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={"format-chip" + (period.datePreset === s.id ? " on ads-on" : "")}
              aria-pressed={period.datePreset === s.id}
              onClick={() => setPeriod({ datePreset: s.id })}
            >
              {s.label}
            </button>
          ))}
        </div>
        <form className="ads-range" onSubmit={applyRange}>
          <label htmlFor="ads-since">De</label>
          <input id="ads-since" type="date" value={since} max={until || todayIso()} onChange={(e) => setSince(e.target.value)} />
          <label htmlFor="ads-until">até</label>
          <input id="ads-until" type="date" value={until} min={since || undefined} max={todayIso()} onChange={(e) => setUntil(e.target.value)} />
          <button type="submit" className={"btn btn-plain" + (period.since ? " ads-on" : "")} disabled={!since || !until}>
            Ver período
          </button>
        </form>
      </div>

      {state.loading && (
        <div className="ads-loading">
          <span className="spinner" aria-hidden="true"></span> Buscando as campanhas na Meta…
        </div>
      )}

      {state.error && <div className="login-msg error">{state.error}</div>}

      {data && !rows.length && <div className="ads-empty">Nenhuma informação encontrada para este cliente.</div>}

      {data && rows.length > 0 && (
        <>
          <div className="ads-cards">
            <Card label="Investimento" value={totals.investimento === null ? "-" : money(totals.investimento, totals.moeda)} />
            <Card label="Impressões" value={int(totals.impressoes)} />
            <Card label="Cliques no link" value={int(totals.cliques_no_link)} />
            <Card label="CTR | CPC | CPM" value={`${pct(totals.ctr)} | ${money(totals.cpc, totals.moeda)} | ${money(totals.cpm, totals.moeda)}`} small />
          </div>

          {totals.resultados.length > 0 && (
            <div className="ads-results">
              {totals.resultados.map((r) => (
                <span key={r.label} className="ads-result">
                  <strong>{int(r.value)}</strong> {r.label.toLowerCase()}
                  {r.cost !== null && totals.moeda && <em> | {money(r.cost, totals.moeda)} cada</em>}
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
                    <td>{money(c.spend, c.currency)}</td>
                    <td>
                      {c.resultado ? (
                        <>
                          {int(c.resultado.value)} <span className="ads-dim">{c.resultado.label.toLowerCase()}</span>
                          {c.resultado.cost !== null && <div className="ads-dim">{money(c.resultado.cost, c.currency)} cada</div>}
                        </>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td>{int(c.impressions)}</td>
                    <td>{int(c.reach)}</td>
                    <td>{dec(c.frequency)}</td>
                    <td>{int(c.inline_link_clicks)}</td>
                    <td>{pct(c.ctr)}</td>
                    <td>{money(c.cpc, c.currency)}</td>
                    <td>{money(c.cpm, c.currency)}</td>
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

function Card({ label, value, small }) {
  return (
    <div className="ads-card">
      <span className="ads-card-label">{label}</span>
      <strong className={"ads-card-value" + (small ? " small" : "")}>{value}</strong>
    </div>
  );
}
