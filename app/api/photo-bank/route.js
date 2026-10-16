import { randomUUID } from "node:crypto";
import { agentDb } from "../../../lib/agentApi";
import { compressPhoto } from "../../../lib/photoCompress";

// Banco de fotos do cliente (só a equipe). A tela sobe o arquivo original para uma pasta temporária
// e chama aqui para comprimir (HEIC vira JPEG, máximo 2048 px, miniatura de 400 px) e gravar no banco.
//   POST { action: "process", client_id, path, name }   devolve { photo }
//   POST { action: "purge", client_id }   apaga os arquivos do banco de fotos (antes de excluir o cliente)

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request) {
  const db = agentDb();
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: auth } = token ? await db.auth.getUser(token) : { data: null };
  if (!auth?.user) return Response.json({ error: "Entre no sistema de novo." }, { status: 401 });
  const { data: me } = await db.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
  if (!["admin", "funcionario"].includes(me?.role)) return Response.json({ error: "Só a equipe pode mexer no banco de fotos." }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const { data: client } = body.client_id ? await db.from("clients").select("id, admin_only").eq("id", body.client_id).maybeSingle() : { data: null };
  if (!client || (client.admin_only && me.role !== "admin")) return Response.json({ error: "Cliente não encontrado." }, { status: 404 });
  const folder = `clients/${client.id}/fotos`;

  if (body.action === "purge") {
    const { data: rows } = await db.from("client_photos").select("path, thumb_path").eq("client_id", client.id);
    const paths = (rows || []).flatMap((r) => [r.path, r.thumb_path]).filter(Boolean);
    for (let i = 0; i < paths.length; i += 100) await db.storage.from("anexos").remove(paths.slice(i, i + 100));
    return Response.json({ ok: true, apagadas: (rows || []).length });
  }

  if (body.action !== "process") return Response.json({ error: "Ação desconhecida." }, { status: 400 });
  const tmp = String(body.path || "");
  // só arquivos que a tela acabou de subir na pasta temporária deste cliente
  if (!tmp.startsWith(`${folder}/tmp/`) || tmp.includes("..")) return Response.json({ error: "Arquivo inválido." }, { status: 400 });

  try {
    const { data: blob, error: dlErr } = await db.storage.from("anexos").download(tmp);
    if (dlErr || !blob) return Response.json({ error: "Não consegui ler o arquivo enviado." }, { status: 400 });
    const out = await compressPhoto(Buffer.from(await blob.arrayBuffer()));
    if (!out) {
      await db.storage.from("anexos").remove([tmp]);
      return Response.json({ error: "Este arquivo não é uma foto que dá para abrir." }, { status: 400 });
    }
    const id = randomUUID();
    const path = `${folder}/${id}.jpg`;
    const thumb_path = `${folder}/mini/${id}.jpg`;
    const up1 = await db.storage.from("anexos").upload(path, out.jpeg, { contentType: "image/jpeg", upsert: true });
    const up2 = await db.storage.from("anexos").upload(thumb_path, out.thumb, { contentType: "image/jpeg", upsert: true });
    await db.storage.from("anexos").remove([tmp]);
    if (up1.error || up2.error) throw up1.error || up2.error;
    const name = String(body.name || "").replace(/\.(hei[cf]|png|jpe?g|webp|gif)$/i, "").slice(0, 120);
    const { data: photo, error } = await db
      .from("client_photos")
      .insert({ id, client_id: client.id, path, thumb_path, name, width: out.width, height: out.height, size: out.jpeg.length, created_by: auth.user.id })
      .select("*")
      .single();
    if (error) {
      await db.storage.from("anexos").remove([path, thumb_path]);
      console.error("banco de fotos:", error);
      return Response.json({ error: /client_photos|relation/i.test(error.message || "") ? "Falta rodar o SQL 023_banco_de_fotos.sql no Supabase." : "Não consegui gravar a foto." }, { status: 500 });
    }
    return Response.json({ ok: true, photo });
  } catch (err) {
    console.error("banco de fotos:", err);
    return Response.json({ error: "Não consegui preparar a foto agora. Tente de novo." }, { status: 502 });
  }
}
