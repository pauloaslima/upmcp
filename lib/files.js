"use client";

import { supabase } from "./supabaseClient";

// Arquivos ficam no bucket privado "anexos". Guardamos só o caminho; o link de abrir
// é gerado na hora do clique (vale 1 hora), então nunca expira dentro do sistema.

export async function uploadFile(folder, file) {
  const safe = file.name.replace(/[^\w.\-]+/g, "_");
  const path = `${folder}/${Date.now()}-${safe}`;
  const { error } = await supabase.storage.from("anexos").upload(path, file);
  if (error) throw error;
  return { type: "upload", path, name: file.name };
}

export async function openAttachment(att, showToast) {
  if (att.type !== "upload") {
    window.open(att.url, "_blank", "noopener");
    return;
  }
  const win = window.open("", "_blank");
  const { data, error } = await supabase.storage.from("anexos").createSignedUrl(att.path, 60 * 60);
  if (error || !data?.signedUrl) {
    win?.close();
    showToast?.("Não consegui abrir o arquivo.");
    return;
  }
  if (win) win.location.href = data.signedUrl;
  else window.location.href = data.signedUrl;
}

export function removeFile(att) {
  if (att?.type === "upload" && att.path) supabase.storage.from("anexos").remove([att.path]).catch(() => {});
}

export function normalizeLink(url) {
  const u = (url || "").trim();
  if (!u) return null;
  return /^https?:\/\//i.test(u) ? u : "https://" + u;
}
