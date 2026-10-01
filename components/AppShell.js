"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { shortName } from "../lib/people";
import { supabase } from "../lib/supabaseClient";
import Board from "./Board";
import ClientCalendar from "./ClientCalendar";
import UsersAdmin, { ROLE_LABELS } from "./UsersAdmin";
import WeekContent from "./WeekContent";
import ClientChecklist from "./ClientChecklist";
import DeadlinesOverview, { LeadTimeBanner } from "./DeadlinesOverview";
import Notifications from "./Notifications";
import { PasswordForm } from "./Login";
import TasksPage from "./TasksPage";
import RoutinesPage from "./RoutinesPage";
import { ClientTeam } from "./ClientTeam";
import { ClientProfile } from "./ClientProfile";
import AssignmentsPage from "./AssignmentsPage";

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

// O que cada tipo de usuário pode abrir dentro de um cliente
const SECTIONS = {
  staff: [
    { id: "semana", title: "Conteúdo da semana", icon: "✍️", text: "Os temas da semana viram peças na linha de produção com um clique." },
    { id: "calendario", title: "Calendário mensal", icon: "🗓️", text: "Temas do mês, com feriados, datas comemorativas e campanhas." },
    { id: "producao", title: "Linha de produção", icon: "▦", text: "Todas as peças, da estruturação à publicação." },
    { id: "perfil", title: "Perfil do cliente", icon: "🪪", text: "Posicionamento, identidade visual, observações e link do Drive." }
  ],
  cliente: [
    { id: "semana", title: "Conteúdo da semana", icon: "✍️", text: "Os posts planejados para esta semana." },
    { id: "calendario", title: "Calendário mensal", icon: "🗓️", text: "Veja os temas planejados para o mês." },
    { id: "producao", title: "Aprovações", icon: "✅", text: "Aprove, reprove e deixe observações nos conteúdos." }
  ]
};

export default function AppShell({ session, profile }) {
  const isStaff = profile.role === "admin" || profile.role === "funcionario";
  const isAdmin = profile.role === "admin";
  const sections = isStaff ? SECTIONS.staff : SECTIONS.cliente;

  const [clients, setClients] = useState([]);
  const [loaded, setLoaded] = useState(false);
  // view: { page: "inicio" } | { page: "usuarios" } | { page: "cliente", clientId, section: "hub" | "semana" | "calendario" | "producao" }
  const [view, setView] = useState(
    isStaff ? { page: "inicio" } : { page: "cliente", clientId: profile.client_id, section: "hub" }
  );
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [filter, setFilter] = useState("");
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  });
  const [team, setTeam] = useState([]); // administradores e funcionários (responsáveis pelos clientes)
  const [memberOf, setMemberOf] = useState([]); // clientes em que esta pessoa está na equipe
  const [othersOpen, setOthersOpen] = useState(false); // "Outros clientes" começa fechado
  const toggleOthers = () => setOthersOpen((o) => !o);
  const [changingPw, setChangingPw] = useState(false);
  const [toast, setToast] = useState("");
  const toastTimer = useRef(null);

  function showToast(msg) {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2800);
  }

  useEffect(() => {
    if (isStaff) setView(readStored(VIEW_KEY, { page: "inicio" }));
    setSidebarOpen(isNarrow() ? false : readStored(SIDEBAR_KEY, true));
  }, [isStaff]);

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

  useEffect(() => {
    if (!isStaff) return;
    supabase
      .from("profiles")
      .select("id, email, full_name, role")
      .in("role", ["admin", "funcionario"])
      .order("full_name")
      .then(({ data }) => setTeam(data || []));
    loadMembership();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStaff]);

  async function loadMembership() {
    const { data } = await supabase.from("client_members").select("client_id").eq("user_id", session.user.id);
    setMemberOf((data || []).map((m) => m.client_id));
  }

  async function setResponsible(clientId, responsibleId) {
    const { error } = await supabase.from("clients").update({ responsible_id: responsibleId }).eq("id", clientId);
    if (error) {
      console.error(error);
      showToast("Não consegui salvar o responsável.");
      return;
    }
    setClients((prev) => prev.map((c) => (c.id === clientId ? { ...c, responsible_id: responsibleId } : c)));
    const who = team.find((p) => p.id === responsibleId);
    const name = clients.find((c) => c.id === clientId)?.name || "Cliente";
    showToast(who ? `${name} agora é responsabilidade de ${shortName(who)}.` : `${name} ficou sem responsável.`);
  }

  const current = view.page === "cliente" ? clients.find((c) => c.id === view.clientId) || null : null;

  // tela salva que não existe mais (cliente excluído, ou papel mudou) → volta ao início
  useEffect(() => {
    if (!loaded) return;
    if (
      (view.page === "cliente" && !current) ||
      (["usuarios", "atribuicoes"].includes(view.page) && !isAdmin) ||
      (["tarefas", "rotina"].includes(view.page) && !isStaff)
    ) {
      go(isStaff ? { page: "inicio" } : { page: "cliente", clientId: profile.client_id, section: "hub" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, current, view.page, isAdmin]);

  function go(next) {
    setView(next);
    if (isStaff) writeStored(VIEW_KEY, next);
    if (isNarrow()) setSidebarOpen(false);
  }
  const openClient = (clientId, section = "hub") => go({ page: "cliente", clientId, section });

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

  // "Meus clientes": onde a pessoa é responsável ou faz parte da equipe
  const isMine = (c) => c.responsible_id === session.user.id || memberOf.includes(c.id);
  const myClients = visibleClients.filter(isMine);
  const otherClients = visibleClients.filter((c) => !isMine(c));

  // abre "Outros clientes" sozinho quando a pessoa busca ou está dentro de um deles
  const insideOther = !!current && !isMine(current);
  useEffect(() => {
    if (filter.trim() || insideOther) setOthersOpen(true);
  }, [filter, insideOther]);

  async function addClient() {
    const name = prompt("Nome do novo cliente:")?.trim();
    if (!name) return;
    const { data, error } = await supabase.from("clients").insert({ name }).select().single();
    if (error) {
      showToast(error.code === "23505" ? "Já existe um cliente com esse nome." : "Não consegui criar o cliente.");
      return;
    }
    setClients((prev) => [...prev.filter((c) => c.id !== data.id), data].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")));
    openClient(data.id);
  }

  async function renameClient() {
    const name = prompt("Novo nome do cliente:", current.name)?.trim();
    if (!name || name === current.name) return;
    const { error } = await supabase.from("clients").update({ name }).eq("id", current.id);
    if (error) {
      showToast(error.code === "23505" ? "Já existe um cliente com esse nome." : "Não consegui renomear.");
      return;
    }
    await supabase.from("cards").update({ client: name }).eq("client_id", current.id);
    setClients((prev) => prev.map((c) => (c.id === current.id ? { ...c, name } : c)));
    showToast("Cliente renomeado.");
  }

  async function deleteClient() {
    const ok = confirm(
      `Excluir o cliente "${current.name}"?\n\nO calendário dele será apagado, e as peças da linha de produção ficam sem cliente.`
    );
    if (!ok) return;
    const { error } = await supabase.from("clients").delete().eq("id", current.id);
    if (error) {
      showToast("Não consegui excluir o cliente.");
      return;
    }
    setClients((prev) => prev.filter((c) => c.id !== current.id));
    go({ page: "inicio" });
    showToast("Cliente excluído.");
  }

  function shiftMonth(delta) {
    setMonth(({ year, month: m }) => {
      const d = new Date(year, m - 1 + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() + 1 };
    });
  }

  const section = current ? sections.find((s) => s.id === view.section) : null;

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
        {isStaff && <Notifications userId={session.user.id} onOpenClient={(id) => openClient(id)} />}
      </header>

      <div className="shell-body">
        <aside className="sidebar" aria-label="Menu">
          {isStaff ? (
            <>
              <nav className="side-section">
                <button className={"side-item" + (view.page === "inicio" ? " active" : "")} onClick={() => go({ page: "inicio" })}>
                  <span className="side-icon">⌂</span> Início
                </button>
                <button className={"side-item" + (view.page === "tarefas" ? " active" : "")} onClick={() => go({ page: "tarefas" })}>
                  <span className="side-icon">☑</span> Tarefas
                </button>
                <button className={"side-item" + (view.page === "rotina" ? " active" : "")} onClick={() => go({ page: "rotina" })}>
                  <span className="side-icon">⟳</span> Rotina diária
                </button>
                {isAdmin && (
                  <button className={"side-item" + (view.page === "atribuicoes" ? " active" : "")} onClick={() => go({ page: "atribuicoes" })}>
                    <span className="side-icon">⇄</span> Atribuições
                  </button>
                )}
                {isAdmin && (
                  <button className={"side-item" + (view.page === "usuarios" ? " active" : "")} onClick={() => go({ page: "usuarios" })}>
                    <span className="side-icon">👥</span> Usuários e permissões
                  </button>
                )}
              </nav>

              <div className="side-section side-clients">
                <div className="side-heading">
                  <span>Clientes</span>
                  <button className="side-add" onClick={addClient} title="Adicionar cliente">
                    + novo
                  </button>
                </div>
                {clients.length > 8 && (
                  <input type="search" className="side-filter" placeholder="Buscar cliente…" value={filter} onChange={(e) => setFilter(e.target.value)} />
                )}
                <div className="side-list">
                  {loaded && clients.length === 0 && (
                    <div className="side-empty">
                      Nenhum cliente ainda. Clique em <strong>+ novo</strong> para cadastrar.
                    </div>
                  )}
                  {[
                    { key: "mine", title: "Meus clientes", list: myClients },
                    { key: "others", title: myClients.length ? "Outros clientes" : null, list: otherClients }
                  ].map(
                    (group) =>
                      group.list.length > 0 && (
                        <div key={group.key} className="side-group">
                          {group.key === "others" && group.title ? (
                            <button className="side-group-title side-toggle" onClick={toggleOthers} aria-expanded={othersOpen}>
                              <span className={"caret" + (othersOpen ? " open" : "")}>▸</span> {group.title} ({group.list.length})
                            </button>
                          ) : (
                            group.title && <div className="side-group-title">{group.title}</div>
                          )}
                          {(group.key !== "others" || !group.title || othersOpen) && group.list.map((c) => (
                            <div key={c.id}>
                              <button className={"side-item" + (view.clientId === c.id && view.page === "cliente" ? " active" : "")} onClick={() => openClient(c.id)}>
                                <span className="side-initial">{c.name.charAt(0).toUpperCase()}</span>
                                <span className="side-name">{c.name}</span>
                              </button>
                              {view.page === "cliente" && view.clientId === c.id && (
                                <div className="side-sub">
                                  {sections.map((s) => (
                                    <button key={s.id} className={"side-subitem" + (view.section === s.id ? " active" : "")} onClick={() => openClient(c.id, s.id)}>
                                      {s.title}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )
                  )}
                </div>
              </div>
            </>
          ) : (
            <nav className="side-section side-clients">
              {current && (
                <>
                  <button className={"side-item" + (view.section === "hub" ? " active" : "")} onClick={() => openClient(current.id)}>
                    <span className="side-initial">{current.name.charAt(0).toUpperCase()}</span>
                    <span className="side-name">{current.name}</span>
                  </button>
                  <div className="side-sub">
                    {sections.map((s) => (
                      <button key={s.id} className={"side-subitem" + (view.section === s.id ? " active" : "")} onClick={() => openClient(current.id, s.id)}>
                        {s.title}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </nav>
          )}

          <div className="side-footer">
            <div className="side-user" title={session.user.email}>
              <span>{profile.full_name || session.user.email}</span>
              <small>{ROLE_LABELS[profile.role]}</small>
            </div>
            <button className="side-logout" onClick={() => setChangingPw(true)} title="Trocar minha senha">
              Minha senha
            </button>
            <button className="side-logout" onClick={() => supabase.auth.signOut()}>
              Sair
            </button>
          </div>
        </aside>
        <div className="sidebar-scrim" onClick={toggleSidebar}></div>

        <main className="main">
          {view.page === "usuarios" && isAdmin && (
            <>
              <div className="page-head">
                <h2 className="page-title">Usuários e permissões</h2>
              </div>
              <div className="page-scroll">
                <UsersAdmin me={session.user} clients={clients} showToast={showToast} />
              </div>
            </>
          )}

          {view.page === "atribuicoes" && isAdmin && (
            <>
              <div className="page-head">
                <h2 className="page-title">Atribuições</h2>
              </div>
              <div className="page-scroll">
                <AssignmentsPage clients={clients} team={team} onSetResponsible={setResponsible} onOpenClient={(id) => openClient(id)} />
              </div>
            </>
          )}

          {view.page === "tarefas" && isStaff && (
            <>
              <div className="page-head">
                <h2 className="page-title">Tarefas</h2>
              </div>
              <div className="page-scroll">
                <TasksPage me={session.user} isAdmin={isAdmin} clients={clients} team={team} onOpenClient={openClient} showToast={showToast} />
              </div>
            </>
          )}

          {view.page === "rotina" && isStaff && (
            <>
              <div className="page-head">
                <h2 className="page-title">Rotina diária</h2>
              </div>
              <div className="page-scroll">
                <RoutinesPage me={session.user} isAdmin={isAdmin} clients={clients} team={team} showToast={showToast} />
              </div>
            </>
          )}

          {view.page === "inicio" && isStaff && (
            <>
              <div className="page-head">
                <h2 className="page-title">Início</h2>
                <div className="page-actions">
                  <button className="btn btn-gold" onClick={addClient}>
                    + Novo cliente
                  </button>
                </div>
              </div>
              <div className="page-scroll">
                <LeadTimeBanner />
                {clients.filter(isMine).length > 0 && (
                  <>
                    <h3 className="section-title first">Meus clientes</h3>
                    <div className="client-grid">
                      {clients.filter(isMine).map((c) => (
                        <button key={c.id} className="client-tile mine" onClick={() => openClient(c.id)}>
                          <span className="client-tile-initial">{c.name.charAt(0).toUpperCase()}</span>
                          <span className="client-tile-name">{c.name}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
                <div style={{ marginTop: 18 }}>
                  <DeadlinesOverview
                    clients={isAdmin || clients.filter(isMine).length === 0 ? clients : clients.filter(isMine)}
                    team={team}
                    onOpenClient={(id) => openClient(id)}
                    showToast={showToast}
                  />
                </div>
                {clients.filter(isMine).length ? (
                  <button className="section-title section-toggle" onClick={toggleOthers} aria-expanded={othersOpen}>
                    <span className={"caret" + (othersOpen ? " open" : "")}>▸</span> Outros clientes ({clients.filter((c) => !isMine(c)).length})
                  </button>
                ) : (
                  <h3 className="section-title">Todos os clientes</h3>
                )}
                {(othersOpen || !clients.filter(isMine).length) && (
                  <div className="client-grid">
                    {clients
                      .filter((c) => !isMine(c))
                      .map((c) => (
                        <button key={c.id} className="client-tile" onClick={() => openClient(c.id)}>
                          <span className="client-tile-initial">{c.name.charAt(0).toUpperCase()}</span>
                          <span className="client-tile-name">{c.name}</span>
                        </button>
                      ))}
                  </div>
                )}
              </div>
            </>
          )}

          {current && (
            <>
              <div className="page-head">
                {view.section !== "hub" && (
                  <button className="back-btn" onClick={() => openClient(current.id)} aria-label="Voltar para o cliente">
                    ‹
                  </button>
                )}
                <div className="crumbs">
                  <h2 className="page-title">{current.name}</h2>
                  {section && <span className="crumb-sub">{section.title}</span>}
                </div>
                {isStaff && view.section === "hub" && (
                  <div className="page-actions">
                    <button className="btn btn-plain" onClick={renameClient}>
                      Renomear
                    </button>
                    <button className="btn btn-plain danger" onClick={deleteClient}>
                      Excluir
                    </button>
                  </div>
                )}
              </div>

              {view.section === "hub" && (
                <div className="page-scroll">
                  <p className="hub-lead">{isStaff ? "O que você vai fazer com este cliente?" : "Olá! Escolha o que deseja ver."}</p>
                  <div className="hub-grid">
                    {sections.map((s) => (
                      <button key={s.id} className="hub-tile" onClick={() => openClient(current.id, s.id)}>
                        <span className="hub-icon" aria-hidden="true">
                          {s.icon}
                        </span>
                        <span className="hub-title">{s.title}</span>
                        <span className="hub-text">{s.text}</span>
                      </button>
                    ))}
                  </div>
                  {isStaff && (
                    <ClientChecklist
                      key={current.id}
                      client={current}
                      team={team}
                      onSetResponsible={(id) => setResponsible(current.id, id)}
                      showToast={showToast}
                    />
                  )}
                  {isStaff && (
                    <div className="hub-panels">
                      <ClientTeam key={"team-" + current.id} client={current} team={team} isAdmin={isAdmin} showToast={showToast} onMembersChange={loadMembership} />
                    </div>
                  )}
                </div>
              )}

              {view.section === "perfil" && isStaff && (
                <div className="page-scroll">
                  <ClientProfile
                    key={"profile-" + current.id}
                    client={current}
                    showToast={showToast}
                    onSaved={(values) => setClients((prev) => prev.map((c) => (c.id === current.id ? { ...c, ...values } : c)))}
                  />
                </div>
              )}

              {view.section === "semana" && (
                <WeekContent
                  key={current.id}
                  client={current}
                  isStaff={isStaff}
                  showToast={showToast}
                  onOpenProduction={() => openClient(current.id, "producao")}
                />
              )}

              {view.section === "calendario" && (
                <ClientCalendar
                  client={current}
                  readOnly={!isStaff}
                  year={month.year}
                  month={month.month}
                  onPrev={() => shiftMonth(-1)}
                  onNext={() => shiftMonth(1)}
                  onToday={() => {
                    const now = new Date();
                    setMonth({ year: now.getFullYear(), month: now.getMonth() + 1 });
                  }}
                  showToast={showToast}
                />
              )}

              {view.section === "producao" && <Board key={current.id} client={current} isStaff={isStaff} team={team} showToast={showToast} />}
            </>
          )}
        </main>
      </div>

      {changingPw && (
        <div className="overlay" onClick={(e) => e.target.classList.contains("overlay") && setChangingPw(false)}>
          <div className="modal modal-sm" style={{ padding: 24 }}>
            <PasswordForm
              title="Trocar minha senha"
              text={session.user.email}
              onCancel={() => setChangingPw(false)}
              onDone={() => {
                setChangingPw(false);
                showToast("Senha trocada.");
              }}
            />
          </div>
        </div>
      )}

      <div className={"toast" + (toast ? " show" : "")}>{toast}</div>
    </div>
  );
}
