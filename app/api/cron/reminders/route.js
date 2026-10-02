import { createClient } from "@supabase/supabase-js";
import {
  REMINDER_DAYS,
  addDays,
  calendarTask,
  cardDue,
  daysBetween,
  iso,
  mondayOf,
  parse,
  shortDate,
  taskKey,
  todayInBrazil,
  weeklyTasks
} from "../../../../lib/deadlines";
import { sendEmail } from "../../../../lib/email";

// Checagem diária de prazos (agendada no vercel.json, todo dia às 08:00 de Brasília).
// Cria notificações no sistema e manda e-mail (se configurado) para:
//   - o funcionário responsável pelo cliente: lembretes antes do prazo e no dia
//   - o responsável e os administradores: quando a tarefa atrasa

export const dynamic = "force-dynamic";

const LATE_ALERT_DAYS = [-1, -3, -7]; // avisos de atraso: 1, 3 e 7 dias depois do prazo

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== "Bearer " + secret) {
    return Response.json({ error: "não autorizado" }, { status: 401 });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  const db = createClient(url, key, { auth: { persistSession: false } });

  const today = todayInBrazil();
  const now = parse(today);

  const [{ data: clients }, { data: profiles }, { data: done }, { data: cards }] = await Promise.all([
    db.from("clients").select("id, name, responsible_id"),
    db.from("profiles").select("id, email, full_name, role"),
    db.from("client_tasks").select("client_id, kind, period, done, assignee_id").gte("period", iso(addDays(now, -40))),
    db.from("cards").select("id, title, client_id, column_id, publish_date, due_date, assignee_id").not("assignee_id", "is", null).neq("column_id", "concluidos")
  ]);

  const doneSet = new Set((done || []).filter((t) => t.done).map((t) => `${t.client_id}|${t.kind}|${t.period}`));
  const taskAssignee = Object.fromEntries((done || []).filter((t) => t.assignee_id).map((t) => [`${t.client_id}|${t.kind}|${t.period}`, t.assignee_id]));
  const people = Object.fromEntries((profiles || []).map((p) => [p.id, p]));
  const admins = (profiles || []).filter((p) => p.role === "admin");

  // tarefas vigiadas: calendários dos 2 próximos meses + produção das 3 próximas semanas de publicação
  const next1 = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const next2 = new Date(now.getFullYear(), now.getMonth() + 2, 1);
  const monday = mondayOf(now);
  const tasks = [
    calendarTask(next1.getFullYear(), next1.getMonth() + 1),
    calendarTask(next2.getFullYear(), next2.getMonth() + 1),
    ...[7, 14, 21].flatMap((d) => weeklyTasks(addDays(monday, d)))
  ];

  const outgoing = [];
  for (const client of clients || []) {
    for (const task of tasks) {
      if (doneSet.has(`${client.id}|${task.kind}|${task.period}`)) continue;
      // quem faz a tarefa: o escolhido no checklist; senão, o responsável pelo cliente
      const responsible = people[taskAssignee[`${client.id}|${task.kind}|${task.period}`]] || people[client.responsible_id];
      const days = daysBetween(today, task.due);
      const isCalendar = task.kind === "calendario";

      let recipients = [];
      let title = "";
      if (days < 0 && LATE_ALERT_DAYS.includes(days)) {
        recipients = [responsible, ...admins];
        title = `ATRASADO: ${task.label} | ${client.name}`;
      } else if ((isCalendar && REMINDER_DAYS.includes(days)) || (!isCalendar && days === 0)) {
        recipients = responsible ? [responsible] : admins; // sem responsável, avisa o administrador
        title = days === 0 ? `Vence hoje: ${task.label} | ${client.name}` : `Faltam ${days} dia(s): ${task.label} | ${client.name}`;
      }
      if (!recipients.length) continue;

      const body =
        `Prazo: ${shortDate(task.due)}.` +
        (responsible ? ` Responsável: ${responsible.full_name || responsible.email}.` : " Este cliente ainda não tem funcionário responsável.") +
        (isCalendar ? "" : ` Referente aos posts da semana de ${shortDate(task.period)}.`);

      const seen = new Set();
      for (const person of recipients) {
        if (!person || seen.has(person.id)) continue;
        seen.add(person.id);
        outgoing.push({
          user_id: person.id,
          client_id: client.id,
          title,
          body,
          dedupe_key: `${taskKey(task)}|${client.id}|${person.id}|${days}`,
          email: person.email
        });
      }
    }
  }

  // peças com responsável: aviso no dia do prazo e quando atrasa (atraso também vai aos administradores)
  const clientNames = Object.fromEntries((clients || []).map((c) => [c.id, c.name]));
  for (const card of cards || []) {
    const due = cardDue(card, today);
    if (!due) continue;
    const days = daysBetween(today, due.due);
    const person = people[card.assignee_id];
    if (!person) continue;
    let recipients = [];
    let title = "";
    const name = `${card.title || "peça sem título"} | ${clientNames[card.client_id] || "sem cliente"}`;
    if (days === 0) {
      recipients = [person];
      title = `Vence hoje: ${name}`;
    } else if (LATE_ALERT_DAYS.includes(days)) {
      recipients = [person, ...admins];
      title = `ATRASADO: ${name}`;
    }
    const seen = new Set();
    for (const p of recipients) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      outgoing.push({
        user_id: p.id,
        client_id: card.client_id,
        title,
        body: `${due.label}: ${shortDate(due.due)}. Responsável: ${person.full_name || person.email}. Veja na aba Tarefas.`,
        dedupe_key: `card|${card.id}|${due.due}|${p.id}|${days}`,
        email: p.email
      });
    }
  }

  let created = 0;
  let emailed = 0;
  for (const n of outgoing) {
    const { email, ...row } = n;
    // dedupe_key é único: se o aviso já foi dado hoje, não repete
    const { data, error } = await db.from("notifications").upsert(row, { onConflict: "dedupe_key", ignoreDuplicates: true }).select("id");
    if (error) {
      console.error(error);
      continue;
    }
    if (data && data.length) {
      created++;
      if (await sendEmail({ to: email, subject: "[Up! Fluxo] " + row.title, text: row.body + "\n\nAbra o sistema: https://upmcp.vercel.app" })) emailed++;
    }
  }

  return Response.json({ today, checked: (clients || []).length, created, emailed });
}
