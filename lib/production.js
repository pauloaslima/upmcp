import { FORMATS, defaultCard } from "./pipeline";
import { briefDescription, briefWithDefaults } from "./brief";

// Transforma um post do calendário em peça na Linha de produção ("Criar peça →").
// Usado pela tela (com o login da pessoa) e pelo servidor (ao criar a arte de um post sem peça).
// db: cliente do Supabase; client: { id, name, responsible_id, identity }; entry: o post do calendário.
// Devolve a peça criada ({ id, column_id, title, attachments }) ou lança o erro.
export async function createCardFromEntry(db, client, entry) {
  const { data: card, error } = await db
    .from("cards")
    .insert({
      ...defaultCard("estruturacao"),
      title: entry.theme,
      format: FORMATS.includes(entry.format) ? entry.format : "Outro",
      publish_date: entry.day,
      client: client.name,
      client_id: client.id,
      assignee_id: client.responsible_id || null,
      // fotos, referências e artes do tema viram anexos da peça; a identidade vai para "referência visual"
      attachments: [...(entry.art || []), ...(entry.photos || []), ...(entry.refs || [])],
      visual_ref:
        entry.use_client_identity === false ? entry.identity_notes || "" : client.identity ? "Identidade do cliente: " + client.identity : ""
    })
    .select("id, column_id, title, attachments")
    .single();
  if (error) throw error;

  if (entry.notes) await db.from("card_comments").insert({ card_id: card.id, body: "Do calendário: " + entry.notes, internal: true });
  if (entry.brief && Object.keys(entry.brief).length) {
    const brief = briefWithDefaults(entry, entry.day);
    await db.from("card_comments").insert({ card_id: card.id, body: "Briefing para o design:\n\n" + briefDescription(entry, brief, client.identity), internal: true });
    if (brief.piece_text) await db.from("cards").update({ copy: brief.piece_text }).eq("id", card.id);
  }
  await db.from("calendar_entries").update({ card_id: card.id }).eq("id", entry.id);
  return card;
}
