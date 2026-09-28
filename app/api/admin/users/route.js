import { createClient } from "@supabase/supabase-js";

// Rotas só do administrador: convidar e remover usuários.
// Rodam no servidor do Vercel com a chave secreta do Supabase (SUPABASE_SECRET_KEY),
// que nunca vai para o navegador.

export const dynamic = "force-dynamic";

const ROLES = ["admin", "funcionario", "cliente"];

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function json(body, status = 200) {
  return Response.json(body, { status });
}

// confere que quem chamou está logado e é administrador
async function requireAdmin(request, admin) {
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return null;
  const { data: profile } = await admin.from("profiles").select("role").eq("id", data.user.id).single();
  return profile?.role === "admin" ? data.user : null;
}

export async function POST(request) {
  const admin = adminClient();
  if (!admin) return json({ error: "Falta configurar SUPABASE_SECRET_KEY no Vercel." }, 500);
  if (!(await requireAdmin(request, admin))) return json({ error: "Só o administrador pode fazer isso." }, 403);

  const body = await request.json().catch(() => ({}));
  const email = String(body.email || "").trim().toLowerCase();
  const fullName = String(body.full_name || "").trim();
  const role = body.role;
  const clientId = role === "cliente" ? body.client_id || null : null;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "E-mail inválido." }, 400);
  if (!ROLES.includes(role)) return json({ error: "Escolha o tipo de usuário." }, 400);
  if (role === "cliente" && !clientId) return json({ error: "Escolha a qual cliente essa pessoa pertence." }, 400);

  const origin = request.headers.get("origin") || new URL(request.url).origin;
  let userId = null;

  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: origin
  });
  if (invited?.user) {
    userId = invited.user.id;
  } else {
    // já existia: só atualiza o papel
    const { data: existing } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
    if (!existing) {
      console.error(inviteError);
      return json({ error: "Não consegui convidar esse e-mail." }, 400);
    }
    userId = existing.id;
  }

  const { error: profileError } = await admin
    .from("profiles")
    .upsert({ id: userId, email, full_name: fullName, role, client_id: clientId });
  if (profileError) {
    console.error(profileError);
    return json({ error: "Convite enviado, mas não consegui salvar o perfil." }, 500);
  }

  return json({ ok: true, invited: !!invited?.user });
}

export async function DELETE(request) {
  const admin = adminClient();
  if (!admin) return json({ error: "Falta configurar SUPABASE_SECRET_KEY no Vercel." }, 500);
  const caller = await requireAdmin(request, admin);
  if (!caller) return json({ error: "Só o administrador pode fazer isso." }, 403);

  const body = await request.json().catch(() => ({}));
  if (!body.user_id) return json({ error: "Usuário não informado." }, 400);
  if (body.user_id === caller.id) return json({ error: "Você não pode remover a si mesmo." }, 400);

  const { error } = await admin.auth.admin.deleteUser(body.user_id);
  if (error) {
    console.error(error);
    return json({ error: "Não consegui remover o usuário." }, 500);
  }
  return json({ ok: true });
}
