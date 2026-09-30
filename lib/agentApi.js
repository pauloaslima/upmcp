import { createClient } from "@supabase/supabase-js";

// Base das rotas /api/agent/* (agentes de conteúdo e de design).
// Autenticação: header "Authorization: Bearer <AGENT_API_KEY>".

export const LINK_SECONDS = 60 * 60 * 24 * 7; // links de arquivo valem 7 dias

export function agentDb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
}

export function agentAuthorized(request) {
  const key = process.env.AGENT_API_KEY;
  return !!key && request.headers.get("authorization") === "Bearer " + key;
}

export function unauthorized() {
  return Response.json({ error: "não autorizado" }, { status: 401 });
}

export async function signedFiles(db, files) {
  const out = [];
  for (const f of files || []) {
    if (f.type !== "upload") {
      out.push({ nome: f.name, url: f.url, tipo: "link" });
      continue;
    }
    const { data } = await db.storage.from("anexos").createSignedUrl(f.path, LINK_SECONDS);
    out.push({ nome: f.name, url: data?.signedUrl || null, tipo: "arquivo" });
  }
  return out;
}

// "7ball", "7Ball Vitória", "ludmila" → comparação sem acento, maiúscula, espaço ou pontuação
export function normalizeName(s) {
  return (s || "")
    .normalize("NFD") // "ó" vira "o" + acento solto, que o filtro abaixo descarta
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}
