import { agentAuthorized, agentDb, signedFiles, unauthorized } from "../../../../lib/agentApi";
import { briefWithDefaults, designerPayload } from "../../../../lib/brief";

// API para o agente que abre as demandas no sistema do designer.
//
// GET  /api/agent/briefs?status=pronto&from=AAAA-MM-DD&to=AAAA-MM-DD&client_id=<id>
//      → lista os briefings (padrão: status "pronto"), com todos os campos do card do designer,
//        o perfil do cliente e links temporários (7 dias) para fotos e arquivos de identidade visual.
// POST /api/agent/briefs  { "entry_id": "...", "designer_card_url": "https://..." }
//      → marca o briefing como "enviado ao design" e guarda o link do card criado.

export const dynamic = "force-dynamic";

export async function GET(request) {
  if (!agentAuthorized(request)) return unauthorized();
  const db = agentDb();
  const params = new URL(request.url).searchParams;
  const status = params.get("status") || "pronto";

  let q = db.from("calendar_entries").select("*").eq("brief_status", status).order("day");
  if (params.get("from")) q = q.gte("day", params.get("from"));
  if (params.get("to")) q = q.lte("day", params.get("to"));
  if (params.get("client_id")) q = q.eq("client_id", params.get("client_id"));
  const { data: entries, error } = await q;
  if (error) {
    console.error(error);
    return Response.json({ error: "falha ao ler os briefings" }, { status: 500 });
  }

  const clientIds = [...new Set((entries || []).map((e) => e.client_id))];
  const { data: clients } = clientIds.length
    ? await db.from("clients").select("id, name, identity, identity_files, positioning, notes, drive_url").in("id", clientIds)
    : { data: [] };
  const byId = Object.fromEntries((clients || []).map((c) => [c.id, c]));

  const briefs = [];
  for (const entry of entries || []) {
    const client = byId[entry.client_id];
    const payload = designerPayload({ entry, brief: briefWithDefaults(entry, entry.day), client });
    payload.anexos = await signedFiles(db, entry.photos);
    payload.id_visual.arquivos = entry.use_client_identity === false ? [] : await signedFiles(db, client?.identity_files);
    payload.perfil_cliente = {
      posicionamento: client?.positioning || "",
      observacoes_importantes: client?.notes || "",
      link_drive: client?.drive_url || ""
    };
    briefs.push(payload);
  }

  return Response.json({ total: briefs.length, briefs });
}

export async function POST(request) {
  if (!agentAuthorized(request)) return unauthorized();
  const body = await request.json().catch(() => ({}));
  if (!body.entry_id) return Response.json({ error: "informe entry_id" }, { status: 400 });

  const url = String(body.designer_card_url || "").trim();
  if (url && !/^https?:\/\//i.test(url)) return Response.json({ error: "designer_card_url inválido" }, { status: 400 });

  const { data, error } = await agentDb()
    .from("calendar_entries")
    .update({ brief_status: "enviado", brief_sent_at: new Date().toISOString(), designer_card_url: url })
    .eq("id", body.entry_id)
    .select("id, brief_status, brief_sent_at, designer_card_url")
    .maybeSingle();
  if (error) {
    console.error(error);
    return Response.json({ error: "falha ao atualizar" }, { status: 500 });
  }
  if (!data) return Response.json({ error: "briefing não encontrado" }, { status: 404 });
  return Response.json({ ok: true, ...data });
}
