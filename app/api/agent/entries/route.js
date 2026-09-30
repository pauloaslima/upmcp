import { agentAuthorized, agentDb, unauthorized } from "../../../../lib/agentApi";
import { CALENDAR_FORMATS } from "../../../../lib/pipeline";
import { PLACEMENTS, PRIORITIES, REQUEST_TYPES } from "../../../../lib/brief";

// O agente de conteúdo grava os temas que criou no Conteúdo da semana do cliente.
// Os temas entram como "sugerido pelo agente" e com briefing em rascunho, para a equipe revisar.
//
// POST /api/agent/entries
// {
//   "client_id": "<id>",
//   "entries": [
//     { "day": "2026-10-19", "format": "Reels", "theme": "…", "post_time": "19h", "notes": "…",
//       "brief": { "request_type": "Reels / edição de vídeo", "priority": "media", "placements": ["Reels","Feed"],
//                  "must_have": "…", "important_notes": "…", "piece_text": "…", "refs_note": "…" },
//       "refs": ["https://…"] }
//   ]
// }

export const dynamic = "force-dynamic";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function cleanBrief(b) {
  if (!b || typeof b !== "object") return {};
  const out = {};
  if (REQUEST_TYPES.includes(b.request_type)) out.request_type = b.request_type;
  if (PRIORITIES.some((p) => p.id === b.priority)) out.priority = b.priority;
  if (Array.isArray(b.placements)) out.placements = b.placements.filter((p) => PLACEMENTS.includes(p));
  if (typeof b.due_at === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(b.due_at)) out.due_at = b.due_at;
  ["must_have", "refs_note", "important_notes", "piece_text"].forEach((k) => {
    if (typeof b[k] === "string") out[k] = b[k].slice(0, 5000);
  });
  return out;
}

export async function POST(request) {
  if (!agentAuthorized(request)) return unauthorized();
  const body = await request.json().catch(() => ({}));
  const list = Array.isArray(body.entries) ? body.entries : [];
  if (!body.client_id) return Response.json({ error: "informe client_id" }, { status: 400 });
  if (list.length === 0 || list.length > 40) return Response.json({ error: "envie de 1 a 40 temas em entries" }, { status: 400 });

  const db = agentDb();
  const { data: client } = await db.from("clients").select("id, name").eq("id", body.client_id).maybeSingle();
  if (!client) return Response.json({ error: "cliente não encontrado" }, { status: 404 });

  const rows = [];
  const errors = [];
  list.forEach((e, i) => {
    if (!DAY.test(e.day || "")) return errors.push(`tema ${i + 1}: day deve ser AAAA-MM-DD`);
    if (!String(e.theme || "").trim()) return errors.push(`tema ${i + 1}: theme vazio`);
    rows.push({
      client_id: client.id,
      day: e.day,
      format: CALENDAR_FORMATS.includes(e.format) ? e.format : "",
      theme: String(e.theme).trim().slice(0, 1000),
      post_time: String(e.post_time || "").slice(0, 20),
      notes: String(e.notes || "").slice(0, 2000),
      refs: (Array.isArray(e.refs) ? e.refs : [])
        .filter((u) => /^https?:\/\//i.test(u))
        .map((url) => ({ type: "link", url, name: url.replace(/^https?:\/\//, "").slice(0, 50) })),
      brief: cleanBrief(e.brief),
      brief_status: "rascunho",
      use_client_identity: true,
      created_by_agent: true
    });
  });
  if (errors.length) return Response.json({ error: "temas inválidos", detalhes: errors }, { status: 400 });

  const { data, error } = await db.from("calendar_entries").insert(rows).select("id, day, format, theme");
  if (error) {
    console.error(error);
    return Response.json({ error: "falha ao gravar os temas" }, { status: 500 });
  }
  return Response.json({ ok: true, cliente: client.name, criados: data });
}
