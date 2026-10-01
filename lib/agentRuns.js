import { clientContext, cleanAgentEntries, cleanList, weekInfo } from "./agentContext";
import { reviewBeforeRun } from "./agentReview";
import { AgentTeamError, artDirector, copywriter, designer, research, reviewer, reviewerMonth, strategist, strategistMonth } from "./agentTeam";
import { MONTH_NAMES, addDays, calendarTask, iso, mondayOf, parse, todayInBrazil } from "./deadlines";
import { MONTH_CAMPAIGNS, specialDates } from "./holidays";
import { normalizeLearnings } from "./segments";

// Execuções do time de agentes (tabela agent_runs). Cada chamada de /step roda UMA etapa
// (cabe no limite de tempo do Vercel) e grava o resultado; a tela chama a próxima.
// Se a aba fechar, o run fica salvo e pode ser retomado.

export const STEPS = {
  week: [
    { id: "pesquisa", label: "Pesquisa na internet" },
    { id: "estrategista", label: "Estrategista monta a pauta" },
    { id: "redacao_e_arte", label: "Redator e Diretor de arte" },
    { id: "designer", label: "Designer faz os layouts" },
    { id: "revisor", label: "Revisor confere tudo" }
  ],
  month: [
    { id: "pesquisa", label: "Pesquisa na internet" },
    { id: "estrategista_mes", label: "Estrategista monta o calendário" },
    { id: "revisor_mes", label: "Revisor confere o calendário" }
  ]
};

const ENTRY_FIELDS = "id, day, format, theme, post_time, notes, brief, brief_status, caption, created_by_agent";
const RESEARCH_DAYS = 7; // pesquisa do cliente é reaproveitada por uma semana
const STALE_MS = 6 * 60 * 1000; // etapa "presa" há mais que isso pode ser rodada de novo

export class RunError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

// resposta de erro padrão das rotas /api/agent-runs
export function failure(err) {
  if (err instanceof RunError) return Response.json({ error: err.message }, { status: err.status });
  console.error(err);
  return Response.json({ error: "Erro inesperado no servidor." }, { status: 500 });
}

// quem pediu precisa ser administrador ou funcionário
export async function staffUser(db, request) {
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: auth } = token ? await db.auth.getUser(token) : { data: null };
  if (!auth?.user) throw new RunError("Entre no sistema de novo.", 401);
  const { data: me } = await db.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
  if (!["admin", "funcionario"].includes(me?.role)) throw new RunError("Só a equipe pode usar o especialista.", 403);
  return auth.user;
}

function profileOnly(context) {
  const { semanas, semana_para_criar_agora, ...perfil } = context;
  return perfil;
}

function apiKeys() {
  return { anthropic: !!process.env.ANTHROPIC_API_KEY };
}

// ---------- criar (revisão antes de executar) ----------

export async function createRun(db, user, body) {
  const { data: client } = body.client_id ? await db.from("clients").select("*").eq("id", body.client_id).maybeSingle() : { data: null };
  if (!client) throw new RunError("Cliente não encontrado.", 404);
  const mode = body.mode === "month" ? "month" : "week";
  const context = await clientContext(db, client, { withFiles: false });
  const entrada = mode === "week" ? await weekInput(db, client, body) : await monthInput(db, client, body);
  const revisao = reviewBeforeRun({ context, mode, week: entrada.semana, month: entrada.mes, planned: entrada.temas_do_calendario || [], keys: apiKeys() });

  const results = { entrada: { ...entrada, cliente: profileOnly(context) }, revisao };
  if (!body.nova_pesquisa) {
    const reused = await recentResearch(db, client.id);
    if (reused) results.pesquisa = { ...reused, reaproveitada: true };
  }

  const { data: run, error } = await db
    .from("agent_runs")
    .insert({
      client_id: client.id,
      mode,
      period_start: mode === "week" ? entrada.semana.inicio : entrada.mes.inicio,
      guidance: String(body.guidance || "").trim().slice(0, 4000),
      options: entrada.opcoes || {},
      status: "rodando",
      step: results.pesquisa ? "pesquisa" : "",
      results,
      created_by: user.id
    })
    .select("*")
    .single();
  if (error) {
    console.error(error);
    throw new RunError("Não consegui iniciar o especialista. O SQL 008 já foi rodado no Supabase?", 500);
  }
  return publicRun(run);
}

async function weekInput(db, client, body) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.week_start || "")) throw new RunError("Informe a semana.");
  const count = Number.isInteger(body.count) && body.count > 0 && body.count <= 14 ? body.count : null;
  const pubMonday = mondayOf(parse(body.week_start));
  const offset = Math.round((pubMonday - mondayOf(parse(todayInBrazil()))) / (7 * 86400000));
  const { data: planned } = await db
    .from("calendar_entries")
    .select(ENTRY_FIELDS)
    .eq("client_id", client.id)
    .gte("day", iso(pubMonday))
    .lte("day", iso(addDays(pubMonday, 6)))
    .order("day");
  const { temas_ja_planejados, ...semana } = weekInfo(pubMonday, offset, []);
  return {
    semana,
    temas_do_calendario: (planned || []).map((p) => ({
      id: p.id,
      day: p.day,
      format: p.format,
      theme: p.theme,
      post_time: p.post_time,
      notes: p.notes,
      brief_status: p.brief_status,
      texto_atual: p.brief?.piece_text || "",
      legenda_atual: p.caption || ""
    })),
    quantidade_de_posts:
      count || ((planned || []).length ? `os ${planned.length} temas do calendário (não crie novos)` : "frequência habitual do cliente (veja os temas recentes); sem histórico, 3 posts"),
    opcoes: { count }
  };
}

async function monthInput(db, client, body) {
  if (!/^\d{4}-\d{2}$/.test(body.month || "")) throw new RunError("Informe o mês.");
  const source = ["historico", "texto", "audio"].includes(body.source) ? body.source : "historico";
  const strategy = String(body.strategy || "").trim().slice(0, 8000);
  if (source !== "historico" && strategy.length < 10) throw new RunError("Descreva a estratégia do mês (texto ou áudio) antes de criar.");
  const postsPerWeek = Number.isInteger(body.posts_per_week) && body.posts_per_week > 0 && body.posts_per_week <= 14 ? body.posts_per_week : null;

  const [y, m] = body.month.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const last = new Date(y, m, 0);
  const inicio = iso(first);
  const fim = iso(last);
  const [{ data: existing }, { data: history }] = await Promise.all([
    db.from("calendar_entries").select("day, format, theme, post_time").eq("client_id", client.id).gte("day", inicio).lte("day", fim).order("day"),
    db.from("calendar_entries").select("day, format, theme, post_time").eq("client_id", client.id).gte("day", iso(new Date(y, m - 4, 1))).lt("day", inicio).order("day")
  ]);
  if (source === "historico" && !(history || []).length)
    throw new RunError("Este cliente ainda não tem temas nos meses anteriores. Use a opção por texto ou por áudio.");

  const special = specialDates(y);
  const days = [];
  for (let d = new Date(first); d <= last; d = addDays(d, 1)) days.push(iso(d));
  return {
    mes: {
      nome: `${MONTH_NAMES[m - 1]} de ${y}`,
      inicio,
      fim,
      datas_especiais: days.flatMap((d) => (special[d] || []).map((s) => ({ dia: d, nome: s.name, tipo: s.kind }))),
      campanhas: MONTH_CAMPAIGNS[m] || [],
      prazo_do_calendario: calendarTask(y, m).due
    },
    estrategia: {
      fonte: source,
      texto: source === "historico" ? "deduza dos meses anteriores" : strategy,
      observacao: source === "audio" ? "texto transcrito de um áudio; pode ter erros de transcrição" : undefined
    },
    posts_por_semana: postsPerWeek,
    meses_anteriores: history || [],
    temas_ja_no_calendario: existing || [],
    opcoes: { source, posts_per_week: postsPerWeek }
  };
}

async function recentResearch(db, clientId) {
  const since = new Date(Date.now() - RESEARCH_DAYS * 86400000).toISOString();
  const { data } = await db
    .from("agent_runs")
    .select("results, created_at")
    .eq("client_id", clientId)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(10);
  const hit = (data || []).find((r) => r.results?.pesquisa?.texto && !r.results.pesquisa.reaproveitada);
  return hit ? { texto: hit.results.pesquisa.texto, fontes: hit.results.pesquisa.fontes || [], data: hit.created_at } : null;
}

// ---------- próxima etapa ----------

export async function runNextStep(db, runId) {
  const run = await loadRun(db, runId);
  if (run.status === "gravado" || run.status === "cancelado") throw new RunError("Esta execução já foi encerrada.");
  if (run.status === "aguardando_aprovacao") return publicRun(run);

  const steps = STEPS[run.mode];
  const idx = steps.findIndex((s) => s.id === run.step);
  const next = steps[idx + 1];
  if (!next) return publicRun(run);

  // trava a etapa (evita rodar a mesma etapa duas vezes com dois cliques ou duas abas)
  const lock = run.results._rodando;
  if (lock && Date.now() - new Date(lock.desde).getTime() < STALE_MS) return publicRun(run);
  const claimed = await db
    .from("agent_runs")
    .update({ status: "rodando", error: "", results: { ...run.results, _rodando: { etapa: next.id, desde: new Date().toISOString() } } })
    .eq("id", run.id)
    .eq("updated_at", run.updated_at)
    .select("*")
    .maybeSingle();
  if (!claimed.data) return publicRun(await loadRun(db, runId));

  try {
    const output = await STEP_RUNNERS[next.id](claimed.data);
    const { _rodando, ...rest } = claimed.data.results;
    const results = { ...rest, [next.id]: output };
    const last = idx + 1 === steps.length - 1;
    if (last) results.proposta = run.mode === "week" ? weekProposal(results) : monthProposal(results);
    const { data } = await db
      .from("agent_runs")
      .update({ step: next.id, status: last ? "aguardando_aprovacao" : "rodando", results })
      .eq("id", run.id)
      .select("*")
      .single();
    return publicRun(data);
  } catch (err) {
    const message = err instanceof AgentTeamError ? err.message : "Não consegui falar com a IA agora.";
    if (!(err instanceof AgentTeamError)) console.error(err);
    const { _rodando, ...rest } = claimed.data.results;
    const { data } = await db.from("agent_runs").update({ status: "erro", error: message, results: rest }).eq("id", run.id).select("*").single();
    return publicRun(data);
  }
}

const STEP_RUNNERS = {
  async pesquisa(run) {
    const e = run.results.entrada;
    const periodo = run.mode === "week" ? { semana: e.semana.inicio + " a " + e.semana.fim, datas_especiais: e.semana.datas_especiais } : { mes: e.mes.nome, datas_especiais: e.mes.datas_especiais };
    return { ...(await research({ cliente: e.cliente, periodo })), data: new Date().toISOString() };
  },

  estrategista(run) {
    const e = run.results.entrada;
    return strategist({
      semana_de_publicacao: e.semana,
      temas_do_calendario: e.temas_do_calendario,
      quantidade_de_posts: e.quantidade_de_posts,
      orientacao_da_equipe: run.guidance || "nenhuma",
      pesquisa: run.results.pesquisa?.texto || "sem pesquisa",
      revisao: run.results.revisao,
      cliente: e.cliente
    });
  },

  async redacao_e_arte(run) {
    const e = run.results.entrada;
    const pauta = validPosts(run.results);
    const common = { pauta, orientacao_da_equipe: run.guidance || "nenhuma", revisao: run.results.revisao, cliente: e.cliente };
    const [redator, diretor] = await Promise.all([
      copywriter({ ...common, temas_do_calendario: e.temas_do_calendario }),
      artDirector(common)
    ]);
    return { redator, diretor };
  },

  designer(run) {
    const e = run.results.entrada;
    const r = run.results.redacao_e_arte;
    return designer({ pauta: validPosts(run.results), textos: r.redator.textos, briefings: r.diretor.briefings, cliente: e.cliente });
  },

  revisor(run) {
    const e = run.results.entrada;
    const r = run.results.redacao_e_arte;
    return reviewer({
      pauta: validPosts(run.results),
      textos: r.redator.textos,
      briefings: r.diretor.briefings,
      layouts: run.results.designer.layouts,
      semana_de_publicacao: e.semana,
      revisao: run.results.revisao,
      cliente: e.cliente
    });
  },

  estrategista_mes(run) {
    const e = run.results.entrada;
    return strategistMonth({
      mes: e.mes,
      estrategia: e.estrategia,
      posts_por_semana: e.posts_por_semana,
      meses_anteriores: e.meses_anteriores,
      temas_ja_no_calendario: e.temas_ja_no_calendario,
      orientacao_da_equipe: run.guidance || "nenhuma",
      pesquisa: run.results.pesquisa?.texto || "sem pesquisa",
      revisao: run.results.revisao,
      cliente: e.cliente
    });
  },

  revisor_mes(run) {
    const e = run.results.entrada;
    return reviewerMonth({
      mes: e.mes,
      temas: run.results.estrategista_mes.temas,
      temas_ja_no_calendario: e.temas_ja_no_calendario,
      revisao: run.results.revisao,
      cliente: e.cliente
    });
  }
};

// Pauta do estrategista limpa: temas existentes só em rascunho; novos só em dias livres da semana
function validPosts(results) {
  const e = results.entrada;
  const editable = new Map(e.temas_do_calendario.filter((t) => !t.brief_status || t.brief_status === "rascunho").map((t) => [t.id, t]));
  const busy = new Set(e.temas_do_calendario.map((t) => t.day));
  const used = new Set();
  return (results.estrategista?.posts || []).filter((p) => {
    if (p.id) {
      const t = editable.get(p.id);
      if (!t || used.has(p.id)) return false;
      used.add(p.id);
      p.ref = p.id;
      p.day = t.day; // o dia de um tema existente não muda
      return true;
    }
    if (!(p.day >= e.semana.inicio && p.day <= e.semana.fim) || busy.has(p.day)) return false;
    busy.add(p.day);
    return true;
  });
}

// ---------- proposta ----------

function byRef(list) {
  return Object.fromEntries((list || []).map((x) => [x.ref, x]));
}

function weekProposal(results) {
  const r = results.redacao_e_arte;
  const textos = byRef(r.redator.textos);
  const briefs = byRef(r.diretor.briefings);
  const layouts = byRef(results.designer.layouts);
  const finais = byRef(results.revisor.posts);
  const posts = validPosts(results).map((p) => {
    const t = textos[p.ref] || {};
    const b = briefs[p.ref] || {};
    const g = layouts[p.ref] || {};
    const v = finais[p.ref] || {};
    const pick = (k) => v[k] ?? b[k];
    return {
      ref: p.ref,
      id: p.id || "",
      day: p.day,
      format: p.format,
      post_time: p.post_time,
      theme: v.theme || p.theme,
      objetivo: p.objetivo,
      por_que: p.por_que,
      piece_text: v.piece_text || t.piece_text || "",
      caption: v.caption || t.caption || "",
      brief: {
        request_type: pick("request_type"),
        priority: pick("priority"),
        placements: pick("placements") || [],
        must_have: pick("must_have") || "",
        important_notes: pick("important_notes") || "",
        refs_note: pick("refs_note") || ""
      },
      layout: v.layout || g.layout || "",
      image_prompts: ["Reels", "Vídeo"].includes(p.format) ? [] : g.image_prompts || [],
      alertas: g.alertas || [],
      problemas: v.problemas || [],
      pendencias: [...new Set([...(t.pendencias || []), ...(v.pendencias || [])])]
    };
  });
  return {
    leitura: results.estrategista.leitura,
    resumo: results.revisor.resumo,
    veredito: results.revisor.veredito,
    posts,
    perguntas_para_o_cliente: results.revisor.perguntas_para_o_cliente || []
  };
}

function monthProposal(results) {
  const e = results.entrada;
  const busy = new Set(e.temas_ja_no_calendario.map((t) => t.day));
  const temas = (results.revisor_mes.temas || []).filter((t) => {
    if (!(t.day >= e.mes.inicio && t.day <= e.mes.fim) || busy.has(t.day)) return false;
    busy.add(t.day);
    return true;
  });
  return {
    leitura: results.estrategista_mes.leitura,
    resumo: results.revisor_mes.resumo,
    temas,
    problemas: results.revisor_mes.problemas || [],
    perguntas_para_o_cliente: results.revisor_mes.perguntas_para_o_cliente || []
  };
}

// ---------- gravar (com o ok da equipe) ----------

export async function approveRun(db, runId, edited) {
  const run = await loadRun(db, runId);
  if (run.status !== "aguardando_aprovacao") throw new RunError("Esta execução não está aguardando aprovação.");
  const proposta = edited && typeof edited === "object" ? edited : run.results.proposta;
  const { data: client } = await db.from("clients").select("id, learnings").eq("id", run.client_id).single();

  const saved = run.mode === "week" ? await saveWeek(db, run, proposta) : await saveMonth(db, run, proposta);
  if (!saved.atualizados.length && !saved.criados.length) throw new RunError("Nada para gravar: nenhum tema ficou na proposta.", 422);

  // perguntas novas viram pendências do especialista do cliente
  const learnings = normalizeLearnings(client.learnings);
  const known = new Set([...learnings.pendencias, ...learnings.confirmado].map((p) => norm(p.texto)));
  const today = todayInBrazil();
  const novas = cleanList(proposta.perguntas_para_o_cliente).filter((q) => !known.has(norm(q)) && known.add(norm(q)));
  if (novas.length) {
    await db
      .from("clients")
      .update({ learnings: { ...learnings, pendencias: [...learnings.pendencias, ...novas.map((texto) => ({ texto, data: today }))] } })
      .eq("id", client.id);
  }

  const { data } = await db
    .from("agent_runs")
    .update({ status: "gravado", results: { ...run.results, proposta, gravado: { ...ids(saved), novas_pendencias: novas.length } } })
    .eq("id", run.id)
    .select("*")
    .single();
  return { run: publicRun(data), ...saved, novas_pendencias: novas.length };
}

function ids(saved) {
  return { atualizados: saved.atualizados.map((e) => e.id), criados: saved.criados.map((e) => e.id) };
}

function norm(s) {
  return String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function toEntry(p) {
  const layout = String(p.layout || "").trim();
  return {
    day: p.day,
    format: p.format,
    theme: p.theme,
    post_time: p.post_time,
    notes: p.por_que ? "Por que: " + p.por_que : "",
    caption: p.caption,
    pendencias: p.pendencias,
    brief: {
      ...(p.brief || {}),
      important_notes: [p.brief?.important_notes, layout && "Layout:\n" + layout].filter(Boolean).join("\n\n"),
      piece_text: p.piece_text,
      image_prompts: p.image_prompts
    }
  };
}

async function saveWeek(db, run, proposta) {
  const posts = Array.isArray(proposta.posts) ? proposta.posts : [];
  const existingIds = posts.filter((p) => p.id).map((p) => p.id);
  const { data: originals } = existingIds.length ? await db.from("calendar_entries").select("*").in("id", existingIds) : { data: [] };
  const byId = Object.fromEntries((originals || []).map((o) => [o.id, o]));
  const sem = run.results.entrada.semana;

  const atualizados = [];
  for (const p of posts.filter((x) => x.id)) {
    const o = byId[p.id];
    // tema apagado, de outro cliente, ou com briefing já pronto/enviado: não mexe
    if (!o || o.client_id !== run.client_id || (o.brief_status && o.brief_status !== "rascunho")) continue;
    const entry = toEntry(p);
    // o que a equipe já preencheu prevalece no formato, horário e observação; o dia não muda
    const merged = { ...entry, day: o.day, format: o.format || entry.format, post_time: o.post_time || entry.post_time, notes: o.notes || entry.notes, brief: { ...(o.brief || {}), ...entry.brief } };
    const { rows } = cleanAgentEntries(run.client_id, [merged]);
    if (!rows.length) continue;
    const { client_id, day, refs, use_client_identity, ...patch } = rows[0];
    const { data } = await db.from("calendar_entries").update(patch).eq("id", o.id).select("*").maybeSingle();
    if (data) atualizados.push(data);
  }

  const { data: taken } = await db.from("calendar_entries").select("day").eq("client_id", run.client_id).gte("day", sem.inicio).lte("day", sem.fim);
  const busy = new Set((taken || []).map((t) => t.day));
  const novos = posts.filter((p) => !p.id && p.day >= sem.inicio && p.day <= sem.fim && !busy.has(p.day)).map(toEntry);
  let criados = [];
  const { rows } = cleanAgentEntries(run.client_id, novos);
  if (rows.length) {
    const { data, error } = await db.from("calendar_entries").insert(rows).select("*");
    if (error) console.error(error);
    criados = data || [];
  }
  return { atualizados, criados };
}

async function saveMonth(db, run, proposta) {
  const mes = run.results.entrada.mes;
  const { data: taken } = await db.from("calendar_entries").select("day").eq("client_id", run.client_id).gte("day", mes.inicio).lte("day", mes.fim);
  const busy = new Set((taken || []).map((t) => t.day));
  const temas = (Array.isArray(proposta.temas) ? proposta.temas : []).filter((t) => t.day >= mes.inicio && t.day <= mes.fim && !busy.has(t.day) && busy.add(t.day));
  const { rows } = cleanAgentEntries(run.client_id, temas);
  if (!rows.length) return { atualizados: [], criados: [] };
  const { data, error } = await db.from("calendar_entries").insert(rows).select("*");
  if (error) {
    console.error(error);
    throw new RunError("Não consegui gravar os temas.", 500);
  }
  return { atualizados: [], criados: data || [] };
}

// ---------- leitura ----------

export async function loadRun(db, runId) {
  const { data } = await db.from("agent_runs").select("*").eq("id", runId).maybeSingle();
  if (!data) throw new RunError("Execução não encontrada.", 404);
  return data;
}

export async function cancelRun(db, runId) {
  const { data } = await db.from("agent_runs").update({ status: "cancelado" }).eq("id", runId).neq("status", "gravado").select("*").maybeSingle();
  return data ? publicRun(data) : publicRun(await loadRun(db, runId));
}

// O que a tela precisa (sem o contexto inteiro do cliente)
export function publicRun(run) {
  const steps = STEPS[run.mode];
  const done = steps.findIndex((s) => s.id === run.step) + 1;
  const r = run.results || {};
  return {
    id: run.id,
    client_id: run.client_id,
    mode: run.mode,
    period_start: run.period_start,
    guidance: run.guidance,
    status: run.status,
    error: run.error,
    created_at: run.created_at,
    steps: steps.map((s, i) => ({ ...s, state: i < done ? "feito" : r._rodando?.etapa === s.id ? "rodando" : "pendente" })),
    revisao: r.revisao,
    pesquisa: r.pesquisa ? { texto: r.pesquisa.texto, fontes: r.pesquisa.fontes, reaproveitada: !!r.pesquisa.reaproveitada, data: r.pesquisa.data } : null,
    proposta: r.proposta || null,
    gravado: r.gravado || null
  };
}

// Última execução em aberto do cliente no período (para retomar)
export async function openRunFor(db, clientId, mode, periodStart) {
  const { data } = await db
    .from("agent_runs")
    .select("*")
    .eq("client_id", clientId)
    .eq("mode", mode)
    .eq("period_start", periodStart)
    .in("status", ["rodando", "erro", "aguardando_aprovacao"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? publicRun(data) : null;
}
