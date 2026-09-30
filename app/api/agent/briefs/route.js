import { createClient } from "@supabase/supabase-js";
import { briefWithDefaults, designerPayload } from "../../../../lib/brief";

// API para o agente que abre as demandas no sistema do designer.
// Autenticação: header "Authorization: Bearer <AGENT_API_KEY>" (variável configurada no Vercel).
//
// GET  /api/agent/briefs?status=pronto&from=AAAA-MM-DD&to=AAAA-MM-DD&client_id=<id>
//      → lista os briefings (padrão: status "pronto"), com todos os campos do card do designer
//        e links temporários (7 dias) para baixar fotos e arquivos de identidade visual.
// POST /api/agent/briefs  { "entry_id": "...", "designer_card_url": "https://..." }
//      → marca o briefing como "enviado ao design" e guarda o link do card criado.

export const dynamic = "force-dynamic";

const LINK_SECONDS = 60 * 60 * 24 * 7;

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
}

function authorized(request) {
  const key = process.env.AGENT_API_KEY;
  return !!key && request.headers.get("authorization") === "Bearer " + key;
}

async function signed(client, files) {
  const out = [];
  for (const f of files || []) {
    if (f.type !== "upload") {
      out.push({ nome: f.name, url: f.url, tipo: "link" });
      continue;
    }
    const { data } = await client.storage.from("anexos").createSignedUrl(f.path, LINK_SECONDS);
    out.push({ nome: f.name, url: data?.signedUrl || null, tipo: "arquivo" });
  }
  return out;
}

export async function GET(request) {
  if (!authorized(request)) return Response.json({ error: "não autorizado" }, { status: 401 });
  const supabase = db();
  const params = new URL(request.url).searchParams;
  const status = params.get("status") || "pronto";

  let q = supabase.from("calendar_entries").select("*").eq("brief_status", status).order("day");
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
    ? await supabase.from("clients").select("id, name, identity, identity_files").in("id", clientIds)
    : { data: [] };
  const byId = Object.fromEntries((clients || []).map((c) => [c.id, c]));

  const briefs = [];
  for (const entry of entries || []) {
    const client = byId[entry.client_id];
    const payload = designerPayload({ entry, brief: briefWithDefaults(entry, entry.day), client });
    payload.anexos = await signed(supabase, entry.photos);
    payload.id_visual.arquivos = entry.use_client_identity === false ? [] : await signed(supabase, client?.identity_files);
    briefs.push(payload);
  }

  return Response.json({ total: briefs.length, briefs });
}

export async function POST(request) {
  if (!authorized(request)) return Response.json({ error: "não autorizado" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  if (!body.entry_id) return Response.json({ error: "informe entry_id" }, { status: 400 });

  const url = String(body.designer_card_url || "").trim();
  if (url && !/^https?:\/\//i.test(url)) return Response.json({ error: "designer_card_url inválido" }, { status: 400 });

  const { data, error } = await db()
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
