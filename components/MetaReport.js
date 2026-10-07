"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

// Peças comuns das áreas Anúncios e Insights orgânicos: filtro de período, busca no servidor,
// formatação de números e cartões de totais. O token da Meta fica só no servidor.

const SHORTCUTS = [
  { id: "last_7d", label: "Últimos 7 dias" },
  { id: "this_month", label: "Este mês" },
  { id: "last_30d", label: "Últimos 30 dias" }
];

const intFmt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const decFmt = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const oneFmt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const empty = (v) => v === null || v === undefined || v === "";

export const fmt = {
  money(v, currency) {
    if (empty(v)) return "-";
    try {
      return new Intl.NumberFormat("pt-BR", { style: "currency", currency: currency || "BRL" }).format(Number(v));
    } catch {
      return decFmt.format(Number(v));
    }
  },
  int: (v) => (empty(v) ? "-" : intFmt.format(Number(v))),
  pct: (v) => (empty(v) ? "-" : decFmt.format(Number(v)) + "%"),
  dec: (v) => (empty(v) ? "-" : decFmt.format(Number(v))),
  date: (isoDay) => (isoDay ? isoDay.split("-").reverse().join("/") : "")
};

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Busca o relatório no servidor sempre que o período muda.
export function useMetaReport(path, clientId) {
  const [period, setPeriod] = useState({ datePreset: "last_30d" });
  const [state, setState] = useState({ loading: true });

  useEffect(() => {
    let alive = true;
    (async () => {
      setState({ loading: true });
      try {
        const { data } = await supabase.auth.getSession();
        const params = new URLSearchParams({ clientId, ...period });
        const res = await fetch(path + "?" + params, { headers: { Authorization: "Bearer " + (data.session?.access_token || "") } });
        const json = await res.json().catch(() => ({}));
        if (!alive) return;
        setState(res.ok ? { data: json } : { error: json.error || "Não consegui consultar a Meta agora." });
      } catch (err) {
        console.error(err);
        if (alive) setState({ error: "Não consegui falar com o servidor. Confira a internet e tente de novo." });
      }
    })();
    return () => {
      alive = false;
    };
  }, [path, clientId, period]);

  return { period, setPeriod, ...state };
}

// Atalhos (7 dias, este mês, 30 dias) + período com datas
export function PeriodFilter({ period, onChange, idPrefix }) {
  const [since, setSince] = useState(period.since || "");
  const [until, setUntil] = useState(period.until || "");

  function applyRange(e) {
    e.preventDefault();
    if (since && until) onChange({ since, until });
  }

  return (
    <div className="ads-filters">
      <div className="ads-shortcuts" role="group" aria-label="Períodos rápidos">
        {SHORTCUTS.map((s) => (
          <button
            key={s.id}
            type="button"
            className={"format-chip" + (period.datePreset === s.id ? " on ads-on" : "")}
            aria-pressed={period.datePreset === s.id}
            onClick={() => onChange({ datePreset: s.id })}
          >
            {s.label}
          </button>
        ))}
      </div>
      <form className="ads-range" onSubmit={applyRange}>
        <label htmlFor={idPrefix + "-since"}>De</label>
        <input id={idPrefix + "-since"} type="date" value={since} max={until || todayIso()} onChange={(e) => setSince(e.target.value)} />
        <label htmlFor={idPrefix + "-until"}>até</label>
        <input id={idPrefix + "-until"} type="date" value={until} min={since || undefined} max={todayIso()} onChange={(e) => setUntil(e.target.value)} />
        <button type="submit" className={"btn btn-plain" + (period.since ? " ads-on" : "")} disabled={!since || !until}>
          Ver período
        </button>
      </form>
    </div>
  );
}

export function ReportStatus({ loading, error, empty: isEmpty, loadingText }) {
  return (
    <>
      {loading && (
        <div className="ads-loading">
          <span className="spinner" aria-hidden="true"></span> {loadingText}
        </div>
      )}
      {error && <div className="login-msg error">{error}</div>}
      {isEmpty && <div className="ads-empty">Nenhuma informação encontrada para este cliente.</div>}
    </>
  );
}

export function Card({ label, value, small }) {
  return (
    <div className="ads-card">
      <span className="ads-card-label">{label}</span>
      <strong className={"ads-card-value" + (small ? " small" : "")}>{value}</strong>
    </div>
  );
}

// "Exportar PDF": abre a impressão do navegador já formatada como relatório (Salvar como PDF).
// O título da página vira o nome sugerido do arquivo.
export function ExportPdfButton({ title, disabled }) {
  function exportPdf() {
    const previous = document.title;
    document.title = title;
    const restore = () => {
      document.title = previous;
      window.removeEventListener("afterprint", restore);
    };
    window.addEventListener("afterprint", restore);
    window.print();
  }
  return (
    <button type="button" className="btn btn-plain no-print" onClick={exportPdf} disabled={disabled} title="Salvar este relatório em PDF">
      ⬇ Exportar PDF
    </button>
  );
}

// Cabeçalho que só aparece no PDF: logo, cliente, relatório e período
export function PrintHeader({ client, report, periodText }) {
  const today = new Date().toLocaleDateString("pt-BR");
  return (
    <div className="print-header" aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo-up.png" alt="" />
      <div>
        <strong>{client.name}</strong>
        <span>
          {report}
          {periodText ? " | " + periodText : ""} | gerado em {today}
        </span>
      </div>
    </div>
  );
}

// Variação em relação ao período anterior (seta e cor)
export function Change({ value, invert = false }) {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const up = value > 0;
  const good = invert ? !up : up;
  if (Math.abs(value) < 0.05) return <span className="chg">0%</span>;
  return (
    <span className={"chg " + (good ? "good" : "bad")} title="Em relação ao período anterior de mesmo tamanho">
      {up ? "↑" : "↓"} {oneFmt.format(Math.abs(value))}%
    </span>
  );
}

// Minigráfico de linha (série diária)
export function Sparkline({ points }) {
  if (!points || points.length < 2) return null;
  const w = 120;
  const h = 34;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const span = max - min || 1;
  const xy = points.map((p, i) => [(i / (points.length - 1)) * w, h - 3 - ((p - min) / span) * (h - 6)]);
  const line = xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <polygon points={`0,${h} ${line} ${w},${h}`} className="spark-area" />
      <polyline points={line} className="spark-line" />
    </svg>
  );
}
