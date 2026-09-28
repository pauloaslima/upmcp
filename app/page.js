"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import Login from "../components/Login";
import AppShell from "../components/AppShell";

function Centered({ children }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      {children}
    </div>
  );
}

export default function Home() {
  const [session, setSession] = useState(undefined); // undefined = ainda carregando
  const [profile, setProfile] = useState(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const userId = session?.user?.id;
  useEffect(() => {
    if (!userId) {
      setProfile(undefined);
      return;
    }
    let alive = true;
    supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data }) => alive && setProfile(data || null));

    // se o administrador mudar o papel desta pessoa, a tela acompanha
    const channel = supabase
      .channel("my-profile")
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles", filter: "id=eq." + userId }, (p) =>
        setProfile(p.eventType === "DELETE" ? null : p.new)
      )
      .subscribe();
    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, [userId]);

  if (session === undefined || (session && profile === undefined)) {
    return (
      <Centered>
        <span style={{ color: "var(--text-dim)", fontSize: 13 }}>Carregando…</span>
      </Centered>
    );
  }

  if (!session) return <Login />;

  const role = profile?.role;
  if (!role || (role === "cliente" && !profile.client_id)) {
    return (
      <Centered>
        <div className="login-card">
          <div className="mark">U!</div>
          <h2>Acesso aguardando liberação</h2>
          <p className="sub">
            Você entrou como <strong>{session.user.email}</strong>, mas o administrador ainda não definiu o seu
            acesso. Assim que ele liberar, esta tela atualiza sozinha.
          </p>
          <button className="btn btn-gold" onClick={() => supabase.auth.signOut()}>
            Sair
          </button>
        </div>
      </Centered>
    );
  }

  return <AppShell session={session} profile={profile} />;
}
