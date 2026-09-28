"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import Login from "../components/Login";
import Board from "../components/Board";

export default function Home() {
  const [session, setSession] = useState(undefined); // undefined = ainda carregando

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (session === undefined) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-dim)", fontSize: 13 }}>
        Carregando…
      </div>
    );
  }

  if (!session) return <Login />;

  return <Board session={session} />;
}
