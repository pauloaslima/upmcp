"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import Board from "./Board";
import ClientCalendar from "./ClientCalendar";

const VIEW_KEY = "upfluxo:view";
const SIDEBAR_KEY = "upfluxo:sidebar";

function readStored(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function writeStored(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

function isNarrow() {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 860px)").matches;
}

export default function AppShell({ session }) {
  const [clients, setClients] = useState([]);
  const [loaded, setLoaded] = useState(false);
  // view: { clientId: null } = produção geral; { clientId, tab: "calendario" | "producao" }
  const [view, setView] = useState({ clientId: null, tab: "calendario" });
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [filter, setFilter] = useState("");
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  });
  const [toast, setToast] = useState("");
  const toastTimer = useRef(null);

  function showToast(msg) {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2600);
  }

  // restaura a última tela aberta e o estado do menu
  useEffect(() => {
    setView(readStored(VIEW_KEY, { clientId: null, tab: "calendario" }));
    setSidebarOpen(isNarrow() ? false : readStored(SIDEBAR_KEY, true));
  }, []);

  useEffect(() => {
    let alive = true;
    async function load() {
      const { data, error } = await supabase.from("clients").select("*").order("name");
      if (!alive) return;
      if (error) {
        console.error(error);
        showToast("Não consegui carregar os clientes.");
      }
      setClients(data || []);
      setLoaded(true);
    }
    load();

    const channel = supabase
      .channel("clients-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "clients" }, (payload) => {
        setClients((prev) => {
          const rest = prev.filter((c) => c.id !== (payload.old?.id || payload.new?.id));
          const next = payload.eventType === "DELETE" ? rest : [...rest, payload.new];
          return next.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
        });
      })
      .subscribe();

    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, []);

  const current = clients.find((c) => c.id === view.clientId) || null;

  // cliente salvo que foi excluído → volta para a produção geral
  useEffect(() => {
    if (loaded && view.clientId && !current) go({ clientId: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, current, view.clientId]);

  function go(next) {
    const v = { tab: "calendario", ...next };
    setView(v);
    writeStored(VIEW_KEY, v);
    if (isNarrow()) setSidebarOpen(false);
  }

  function toggleSidebar() {
    setSidebarOpen((open) => {
      if (!isNarrow()) writeStored(SIDEBAR_KEY, !open);
      return !open;
    });
  }

  const visibleClients = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? clients.filter((c) => c.name.toLowerCase().includes(q)) : clients;
  }, [clients, filter]);

  const clientNames = useMemo(() => clients.map((c) => c.name), [clients]);

  async function addClient() {
    const name = prompt("Nome do novo cliente:")?.trim();
    if (!name) return;
    const { data, error } = await supabase.from("clients").insert({ name }).select().single();
    if (error) {
      showToast(error.code === "23505" ? "Já existe um cliente com esse nome." : "Não consegui criar o cliente.");
      return;
    }
    setClients((prev) => [...prev.filter((c) => c.id !== data.id), data].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")));
    go({ clientId: data.id, tab: "calendario" });
  }

  async function renameClient() {
    if (!current) return;
    const name = prompt("Novo nome do cliente:", current.name)?.trim();
    if (!name || name === current.name) return;
    const { error } = await supabase.from("clients").update({ name }).eq("id", current.id);
    if (error) {
      showToast(error.code === "23505" ? "Já existe um cliente com esse nome." : "Não consegui renomear.");
      return;
    }
    // as peças do quadro guardam o nome do cliente; acompanham a mudança
    await supabase.from("cards").update({ client: name }).eq("client", current.name);
    setClients((prev) => prev.map((c) => (c.id === current.id ? { ...c, name } : c)));
    showToast("Cliente renomeado.");
  }

  async function deleteClient() {
    if (!current) return;
    const ok = confirm(
      `Excluir o cliente "${current.name}"?\n\nTodos os temas do calendário dele serão apagados. ` +
        "As peças do quadro de produção continuam lá."
    );
    if (!ok) return;
    const { error } = await supabase.from("clients").delete().eq("id", current.id);
    if (error) {
      showToast("Não consegui excluir o cliente.");
      return;
    }
    setClients((prev) => prev.filter((c) => c.id !== current.id));
    go({ clientId: null });
    showToast("Cliente excluído.");
  }

  function shiftMonth(delta) {
    setMonth(({ year, month: m }) => {
      const d = new Date(year, m - 1 + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() + 1 };
    });
  }
  function thisMonth() {
    const now = new Date();
    setMonth({ year: now.getFullYear(), month: now.getMonth() + 1 });
  }

  return (
    <div className={"shell" + (sidebarOpen ? " sidebar-open" : "")}>
      <header className="topbar">
        <button className="menu-btn" onClick={toggleSidebar} aria-label="Abrir ou fechar o menu" aria-expanded={sidebarOpen}>
          <span></span>
          <span></span>
          <span></span>
        </button>
        <div className="brand">
          <span className="mark">U!</span>
          <div>
            <h1>Up! Fluxo</h1>
            <div className="sub">produção de conteúdo &middot; Up! Digital</div>
          </div>
        </div>
      </header>

      <div className="shell-body">
        <aside className="sidebar" aria-label="Menu">
          <nav className="side-section">
            <button
              className={"side-item" + (!view.clientId ? " active" : "")}
              onClick={() => go({ clientId: null })}
            >
              <span className="side-icon">▦</span> Produção geral
            </button>
          </nav>

          <div className="side-section side-clients">
            <div className="side-heading">
              <span>Clientes</span>
              <button className="side-add" onClick={addClient} title="Adicionar cliente">
                + novo
              </button>
            </div>
            {clients.length > 8 && (
              <input
                type="search"
                className="side-filter"
                placeholder="Buscar cliente…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
            )}
            <div className="side-list">
              {loaded && clients.length === 0 && (
                <div className="side-empty">
                  Nenhum cliente ainda. Clique em <strong>+ novo</strong> para cadastrar.
                </div>
              )}
              {visibleClients.map((c) => (
                <button
                  key={c.id}
                  className={"side-item" + (view.clientId === c.id ? " active" : "")}
                  onClick={() => go({ clientId: c.id, tab: view.tab || "calendario" })}
                >
                  <span className="side-initial">{c.name.charAt(0).toUpperCase()}</span>
                  <span className="side-name">{c.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="side-footer">
            <span className="side-user" title={session.user.email}>
              {session.user.email}
            </span>
            <button className="side-logout" onClick={() => supabase.auth.signOut()}>
              Sair
            </button>
          </div>
        </aside>
        <div className="sidebar-scrim" onClick={toggleSidebar}></div>

        <main className="main">
          {current ? (
            <>
              <div className="page-head">
                <h2 className="page-title">{current.name}</h2>
                <div className="tabs" role="tablist">
                  <button
                    role="tab"
                    aria-selected={view.tab !== "producao"}
                    className={"tab" + (view.tab !== "producao" ? " on" : "")}
                    onClick={() => go({ clientId: current.id, tab: "calendario" })}
                  >
                    Calendário
                  </button>
                  <button
                    role="tab"
                    aria-selected={view.tab === "producao"}
                    className={"tab" + (view.tab === "producao" ? " on" : "")}
                    onClick={() => go({ clientId: current.id, tab: "producao" })}
                  >
                    Produção
                  </button>
                </div>
                <div className="page-actions">
                  <button className="btn btn-plain" onClick={renameClient}>
                    Renomear
                  </button>
                  <button className="btn btn-plain danger" onClick={deleteClient}>
                    Excluir
                  </button>
                </div>
              </div>
              {view.tab === "producao" ? (
                <Board key={current.id} client={current.name} clientNames={clientNames} />
              ) : (
                <ClientCalendar
                  client={current}
                  year={month.year}
                  month={month.month}
                  onPrev={() => shiftMonth(-1)}
                  onNext={() => shiftMonth(1)}
                  onToday={thisMonth}
                  showToast={showToast}
                />
              )}
            </>
          ) : (
            <>
              <div className="page-head">
                <h2 className="page-title">Produção geral</h2>
              </div>
              <Board client={null} clientNames={clientNames} />
            </>
          )}
        </main>
      </div>

      <div className={"toast" + (toast ? " show" : "")}>{toast}</div>
    </div>
  );
}
