import { agentDb } from "../../../lib/agentApi";
import { clientContext, cleanAgentEntries, weekInfo } from "../../../lib/agentContext";
import { ContentAgentError, generateMonth, generateWeek } from "../../../lib/contentAgent";
import { MONTH_NAMES, addDays, calendarTask, iso, mondayOf, parse, todayInBrazil } from "../../../lib/deadlines";
import { MONTH_CAMPAIGNS, specialDates } from "../../../lib/holidays";
import { PROFILE_FIELDS } from "../../../lib/profileFields";
import { briefDescription, briefWithDefaults } from "../../../lib/brief";

// Agente de conteúdo dentro do sistema. Só para a equipe logada.
//
// Semana:  POST { mode: "week", client_id, week_start: "AAAA-MM-DD", guidance, count }
//          → desenvolve os temas do calendário daquela semana (briefing) e cria novos só se faltar
// Um post: POST { mode: "entry", client_id, entry_id, guidance }
//          → gera o conteúdo de um tema só (ex.: demanda que veio do Backlog)
// Mês:     POST { mode: "month", client_id, month: "AAAA-MM", source: "historico"|"texto"|"audio",
//                 strategy, posts_per_week }
//          → cria o calendário de temas do mês em volta do que já existe

export const dynamic = "force-dynamic";
export const maxDuration = 300; // a geração pode levar alguns minutos

const ENTRY_FIELDS = "id, day, format, theme, post_time, notes, brief, brief_status, created_by_agent";

export async function POST(request) {
  const db = agentDb();

  // quem pediu precisa ser administrador ou funcionário
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: auth } = token ? await db.auth.getUser(token) : { data: null };
  if (!auth?.user) return Response.json({ error: "Entre no sistema de novo." }, { status: 401 });
  const { data: me } = await db.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
  if (!["admin", "funcionario"].includes(me?.role)) return Response.json({ error: "Só a equipe pode usar o agente." }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const { data: client } = body.client_id ? await db.from("clients").select("*").eq("id", body.client_id).maybeSingle() : { data: null };
  if (!client) return Response.json({ error: "Cliente não encontrado." }, { status: 404 });

  try {
    if (body.mode === "month") return await runMonth(db, client, body);
    if (body.mode === "entry") return await runEntry(db, client, body);
    return await runWeek(db, client, body);
  } catch (err) {
    if (err instanceof ContentAgentError) return Response.json({ error: err.message }, { status: 502 });
    console.error(err);
    return Response.json({ error: "Não consegui gerar agora. Tente de novo em instantes." }, { status: 502 });
  }
}

async function runWeek(db, client, body) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.week_start || "")) return Response.json({ error: "Informe a semana." }, { status: 400 });
  const count = Number.isInteger(body.count) && body.count > 0 && body.count <= 14 ? body.count : null;

  const context = await clientContext(db, client, { withFiles: false });
  const pubMonday = mondayOf(parse(body.week_start));
  const offset = Math.round((pubMonday - mondayOf(parse(todayInBrazil()))) / (7 * 86400000));
  const { data: planned } = await db
    .from("calendar_entries")
    .select(ENTRY_FIELDS)
    .eq("client_id", client.id)
    .gte("day", iso(pubMonday))
    .lte("day", iso(addDays(pubMonday, 6)))
    .order("day");
  const week = weekInfo(pubMonday, offset, []);

  // o agente vê todos os temas da semana, mas só desenvolve os que ainda estão em rascunho
  const result = await generateWeek({ context, week, planned: planned || [], guidance: body.guidance, count });

  // 1) temas do calendário desenvolvidos: atualiza (o dia não muda)
  const updated = await applyDeveloped(db, client, planned || [], result.desenvolvidos);

  // 2) posts novos (só quando faltavam)
  let created = [];
  const { rows } = cleanAgentEntries(client.id, result.novos);
  if (rows.length) {
    const { data, error } = await db.from("calendar_entries").insert(rows).select("*");
    if (error) console.error(error);
    created = data || [];
  }

  if (!updated.length && !created.length) {
    return Response.json({ error: "Nenhum tema foi gerado para essa semana. Tente com outra orientação." }, { status: 422 });
  }
  return Response.json({ ok: true, resumo: result.resumo, atualizados: updated, criados: created });
}

// Grava o que o agente desenvolveu nos temas do calendário. O que a equipe já preencheu prevalece,
// e temas com briefing pronto ou enviado ao design não são alterados.
async function applyDeveloped(db, client, planned, desenvolvidos) {
  const updated = [];
  for (const d of desenvolvidos) {
    const original = planned.find((p) => p.id === d.id);
    if (!original || (original.brief_status && original.brief_status !== "rascunho")) continue;
    const merged = {
      ...d,
      day: original.day,
      format: original.format || d.format,
      post_time: original.post_time || d.post_time,
      notes: original.notes || d.notes
    };
    const { rows } = cleanAgentEntries(client.id, [merged]);
    if (!rows.length) continue;
    const { client_id, day, refs, use_client_identity, ...patch } = rows[0];
    const { data } = await db.from("calendar_entries").update(patch).eq("id", d.id).select("*").maybeSingle();
    if (data) updated.push(data);
  }
  return updated;
}

// Um post só: gera o conteúdo (briefing, texto da peça…) de um tema específico do calendário.
// Útil para demandas que chegam do Backlog depois que o mês já foi planejado.
async function runEntry(db, client, body) {
  const { data: entry } = body.entry_id
    ? await db.from("calendar_entries").select(ENTRY_FIELDS + ", client_id, card_id").eq("id", body.entry_id).maybeSingle()
    : { data: null };
  if (!entry || entry.client_id !== client.id) return Response.json({ error: "Tema não encontrado." }, { status: 404 });
  if (entry.brief_status && entry.brief_status !== "rascunho") {
    return Response.json({ error: "O briefing deste post já está pronto ou enviado ao design. Reabra o briefing para gerar de novo." }, { status: 409 });
  }

  const context = await clientContext(db, client, { withFiles: false });
  const pubMonday = mondayOf(parse(entry.day));
  const offset = Math.round((pubMonday - mondayOf(parse(todayInBrazil()))) / (7 * 86400000));
  const { data: others } = await db
    .from("calendar_entries")
    .select("theme")
    .eq("client_id", client.id)
    .gte("day", iso(pubMonday))
    .lte("day", iso(addDays(pubMonday, 6)))
    .neq("id", entry.id);
  const guidance = [
    body.guidance,
    (others || []).length ? "Outros posts desta semana (não repita o assunto): " + others.map((o) => o.theme).join("; ") : ""
  ]
    .filter(Boolean)
    .join("\n");

  const { card_id, client_id, ...asPlanned } = entry;
  const result = await generateWeek({ context, week: weekInfo(pubMonday, offset, []), planned: [asPlanned], guidance, count: 1 });
  const [data] = await applyDeveloped(db, client, [entry], result.desenvolvidos);
  if (!data) return Response.json({ error: "Nenhum conteúdo foi gerado para este post. Tente de novo." }, { status: 422 });

  // tema ligado a uma peça (ex.: demanda recepcionada do Backlog): o briefing vai também para a peça
  if (entry.card_id) {
    const text = "Conteúdo gerado para o post:\n\n" + briefDescription(data, briefWithDefaults(data, data.day), client.identity);
    const { data: comment } = await db.from("card_comments").insert({ card_id: entry.card_id, body: text }).select("id").maybeSingle();
    if (comment) await db.from("card_comments").update({ author_name: "Up! Fluxo", author_role: "funcionario" }).eq("id", comment.id);
  }
  return Response.json({ ok: true, resumo: result.resumo, atualizados: [data], criados: [] });
}

async function runMonth(db, client, body) {
  if (!/^\d{4}-\d{2}$/.test(body.month || "")) return Response.json({ error: "Informe o mês." }, { status: 400 });
  const source = ["perfil", "historico", "texto", "audio"].includes(body.source) ? body.source : "perfil";
  const strategy = String(body.strategy || "").trim().slice(0, 8000);
  if ((source === "texto" || source === "audio") && strategy.length < 10) {
    return Response.json({ error: "Descreva a estratégia do mês (texto ou áudio) antes de criar." }, { status: 400 });
  }
  const postsPerWeek = Number.isInteger(body.posts_per_week) && body.posts_per_week > 0 && body.posts_per_week <= 14 ? body.posts_per_week : null;

  const [y, m] = body.month.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const last = new Date(y, m, 0);
  const inicio = iso(first);
  const fim = iso(last);

  const [{ data: existing }, { data: history }] = await Promise.all([
    db.from("calendar_entries").select("day, format, theme, post_time").eq("client_id", client.id).gte("day", inicio).lte("day", fim).order("day"),
    db
      .from("calendar_entries")
      .select("day, format, theme, post_time")
      .eq("client_id", client.id)
      .gte("day", iso(new Date(y, m - 4, 1)))
      .lt("day", inicio)
      .order("day")
  ]);
  if (source === "historico" && !(history || []).length) {
    return Response.json({ error: "Este cliente ainda não tem temas nos meses anteriores. Use a opção Automático (perfil), por texto ou por áudio." }, { status: 400 });
  }
  if (source === "perfil" && !(history || []).length && !PROFILE_FIELDS.some((f) => (client[f.key] || "").trim())) {
    return Response.json(
      { error: "O Perfil do cliente está vazio e não há meses anteriores. Preencha o perfil (ou use “Preencher automaticamente” com os materiais) antes de criar." },
      { status: 400 }
    );
  }

  const special = specialDates(y);
  const days = [];
  for (let d = new Date(first); d <= last; d = addDays(d, 1)) days.push(iso(d));
  const month = {
    nome: `${MONTH_NAMES[m - 1]} de ${y}`,
    inicio,
    fim,
    datas_especiais: days.flatMap((d) => (special[d] || []).map((s) => ({ dia: d, nome: s.name, tipo: s.kind }))),
    campanhas: MONTH_CAMPAIGNS[m] || [],
    prazo_do_calendario: calendarTask(y, m).due
  };

  const context = await clientContext(db, client, { withFiles: false });
  const result = await generateMonth({ context, month, source, strategy, history: history || [], existing: existing || [], postsPerWeek });

  const { rows } = cleanAgentEntries(client.id, result.temas);
  if (!rows.length) return Response.json({ error: "Nenhum tema foi gerado para esse mês. Tente com outra estratégia." }, { status: 422 });
  const { data: created, error } = await db.from("calendar_entries").insert(rows).select("*");
  if (error) {
    console.error(error);
    return Response.json({ error: "Criei os temas, mas não consegui gravar." }, { status: 500 });
  }
  return Response.json({ ok: true, resumo: result.resumo, criados: created });
}
