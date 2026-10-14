import { HORIZON_DAYS, addDaysIso, cleanRecurrence, occurrenceDates } from "./recurrence";

// Cria as ocorrências de um card recorrente para os próximos dias (e tira as que saíram da regra).
// Roda quando a regra muda (rota /api/recurrence) e todo dia na checagem de prazos (cron).
// card: o modelo; responsibleId: quem recebe a ocorrência quando o modelo não tem responsável.
export async function syncTemplate(db, card, { today, responsibleId = null } = {}) {
  const rule = cleanRecurrence(card.recurrence);
  const { data: existing, error } = await db
    .from("cards")
    .select("id, occurrence_date, column_id")
    .eq("recurrence_parent", card.id)
    .gte("occurrence_date", today);
  if (error) throw error;

  const want = rule ? occurrenceDates(rule, today, addDaysIso(today, HORIZON_DAYS)) : [];
  // futuras que não estão mais na regra (e ainda não foram feitas) saem
  const stale = (existing || []).filter((o) => !want.includes(o.occurrence_date) && o.column_id !== "concluidos").map((o) => o.id);
  if (stale.length) await db.from("cards").delete().in("id", stale);

  const have = new Set((existing || []).map((o) => o.occurrence_date));
  const checklist = Array.isArray(card.checklist) ? card.checklist.map((i) => (i && typeof i === "object" ? { ...i, done: false } : i)) : [];
  const rows = want
    .filter((d) => !have.has(d))
    .map((d) => ({
      title: card.title,
      client: card.client || "",
      client_id: card.client_id,
      column_id: "estruturacao",
      format: card.format || "",
      copy: card.copy || "",
      script: card.script || "",
      checklist,
      assignee_id: card.assignee_id || responsibleId,
      due_date: d,
      occurrence_date: d,
      recurrence_parent: card.id
    }));
  if (rows.length) {
    const { error: insErr } = await db.from("cards").upsert(rows, { onConflict: "recurrence_parent,occurrence_date", ignoreDuplicates: true });
    if (insErr) throw insErr;
  }
  return { created: rows.length, removed: stale.length };
}

// Todos os modelos recorrentes (checagem diária)
export async function syncAllTemplates(db, today) {
  const { data: templates, error } = await db.from("cards").select("*").not("recurrence", "is", null);
  if (error) return { error: error.message };
  const { data: clients } = await db.from("clients").select("id, responsible_id");
  const responsible = Object.fromEntries((clients || []).map((c) => [c.id, c.responsible_id]));
  let created = 0;
  for (const card of templates || []) {
    try {
      created += (await syncTemplate(db, card, { today, responsibleId: responsible[card.client_id] || null })).created;
    } catch (err) {
      console.error("recorrência:", card.id, err?.message);
    }
  }
  return { templates: (templates || []).length, created };
}
