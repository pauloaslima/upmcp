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
