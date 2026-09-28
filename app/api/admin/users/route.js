import { createClient } from "@supabase/supabase-js";

// Rotas só do administrador: criar usuários com login e senha, trocar senha e remover.
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
  const password = String(body.password || "");
  const fullName = String(body.full_name || "").trim();
  const role = body.role;
  const clientId = role === "cliente" ? body.client_id || null : null;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "E-mail inválido." }, 400);
  const passwordError = checkPassword(password);
  if (passwordError) return json({ error: passwordError }, 400);
  if (!ROLES.includes(role)) return json({ error: "Escolha o tipo de usuário." }, 400);
  if (role === "cliente" && !clientId) return json({ error: "Escolha a qual cliente essa pessoa pertence." }, 400);

  let userId = null;
  let created = false;

  const { data: createdUser, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName }
  });
  if (createdUser?.user) {
    userId = createdUser.user.id;
    created = true;
  } else {
    // o e-mail já tinha acesso: atualiza a senha e o papel
    const { data: existing } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
    if (!existing) {
      console.error(createError);
      return json({ error: "Não consegui criar esse usuário." }, 400);
    }
    userId = existing.id;
    const { error: pwError } = await admin.auth.admin.updateUserById(userId, { password });
    if (pwError) {
      console.error(pwError);
      return json({ error: "Não consegui definir a senha." }, 500);
    }
  }

  const { error: profileError } = await admin
    .from("profiles")
    .upsert({ id: userId, email, full_name: fullName, role, client_id: clientId });
  if (profileError) {
    console.error(profileError);
    return json({ error: "Usuário criado, mas não consegui salvar as permissões." }, 500);
  }

  return json({ ok: true, created });
}

function checkPassword(password) {
  if (password.length < 8) return "A senha precisa ter pelo menos 8 caracteres.";
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) return "Use letras e números na senha.";
  return null;
}

// administrador define uma nova senha para alguém
export async function PATCH(request) {
  const admin = adminClient();
  if (!admin) return json({ error: "Falta configurar SUPABASE_SECRET_KEY no Vercel." }, 500);
  if (!(await requireAdmin(request, admin))) return json({ error: "Só o administrador pode fazer isso." }, 403);

  const body = await request.json().catch(() => ({}));
  const password = String(body.password || "");
  if (!body.user_id) return json({ error: "Usuário não informado." }, 400);
  const passwordError = checkPassword(password);
  if (passwordError) return json({ error: passwordError }, 400);

  const { error } = await admin.auth.admin.updateUserById(body.user_id, { password });
  if (error) {
    console.error(error);
    return json({ error: "Não consegui trocar a senha." }, 500);
  }
  return json({ ok: true });
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
