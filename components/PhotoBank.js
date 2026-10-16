"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useSignedUrl } from "./ArtDesign";

// Banco de fotos do cliente (só a equipe): sobe as fotos uma vez e as artes escolhem dali.
// As fotos são comprimidas no servidor (HEIC vira JPEG, até 2048 px) e ganham miniatura.
export default function PhotoBank({ client, showToast }) {
  const [photos, setPhotos] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState("ativas"); // "ativas" | "fora"
  const [upload, setUpload] = useState(null); // { atual, total, erros }
  const inputRef = useRef(null);

  useEffect(() => {
    let alive = true;
    supabase
      .from("client_photos")
      .select("*")
      .eq("client_id", client.id)
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) {
          console.error(error);
          showToast("Não consegui carregar o banco de fotos.");
        }
        setPhotos(data || []);
        setLoaded(true);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.id]);

  async function send(files) {
    const list = [...files];
    if (!list.length) return;
    const { data: s } = await supabase.auth.getSession();
    const token = s.session?.access_token || "";
    const erros = [];
    let ok = 0;
    for (let k = 0; k < list.length; k++) {
      const f = list[k];
      setUpload({ atual: k + 1, total: list.length, erros: erros.length });
      const safe = f.name.normalize("NFD").replace(/[^\w.-]+/g, "_").slice(-60);
      const tmp = `clients/${client.id}/fotos/tmp/${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}-${safe}`;
      const { error: upErr } = await supabase.storage.from("anexos").upload(tmp, f, { contentType: f.type || "application/octet-stream" });
      if (upErr) {
        erros.push(`${f.name}: não consegui enviar`);
        continue;
      }
      const res = await fetch("/api/photo-bank", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ action: "process", client_id: client.id, path: tmp, name: f.name })
      }).catch(() => null);
      const json = res ? await res.json().catch(() => ({})) : {};
      if (!res?.ok || !json.photo) {
        erros.push(`${f.name}: ${json.error || "não consegui preparar a foto"}`);
        continue;
      }
      ok++;
      setPhotos((prev) => [json.photo, ...prev]);
    }
    setUpload(null);
    if (inputRef.current) inputRef.current.value = "";
    if (erros.length) alert(`${ok} foto(s) enviadas. Não deu certo:\n\n${erros.join("\n")}`);
    else showToast(ok === 1 ? "Foto adicionada ao banco." : `${ok} fotos adicionadas ao banco.`);
  }

  async function patch(photo, values, msg) {
    const { data, error } = await supabase.from("client_photos").update(values).eq("id", photo.id).select().single();
    if (error) {
      console.error(error);
      showToast("Não consegui salvar.");
      return;
    }
    setPhotos((prev) => prev.map((p) => (p.id === photo.id ? data : p)));
    if (msg) showToast(msg);
  }

  async function remove(photo) {
    if (!confirm("Excluir esta foto do banco? Ela some daqui, mas as artes já criadas com ela continuam iguais.")) return;
    const { error } = await supabase.from("client_photos").delete().eq("id", photo.id);
    if (error) {
      console.error(error);
      showToast("Não consegui excluir a foto.");
      return;
    }
    await supabase.storage.from("anexos").remove([photo.path, photo.thumb_path].filter(Boolean));
    setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
    showToast("Foto excluída.");
  }

  const active = photos.filter((p) => p.active !== false);
  const off = photos.filter((p) => p.active === false);
  const shown = view === "fora" ? off : active;

  return (
    <section className="ideas-panel photo-bank">
      <div className="checklist-head">
        <div>
          <h3>Banco de fotos</h3>
          <p className="hint">
            Só a equipe vê. Suba as fotos uma vez: quando o post não tiver foto anexada, a arte escolhe daqui, dando preferência às fotos
            menos usadas e com etiqueta parecida com o tema.
          </p>
        </div>
        <div className="ideas-actions">
          <input ref={inputRef} type="file" multiple accept="image/*,.heic,.heif" hidden onChange={(e) => send(e.target.files)} />
          <button type="button" className="btn btn-gold" onClick={() => inputRef.current?.click()} disabled={!!upload}>
            {upload ? `Enviando ${upload.atual} de ${upload.total}…` : "+ Enviar fotos"}
          </button>
        </div>
      </div>

      {upload && (
        <div className="hint">
          <span className="spinner small" aria-hidden="true"></span> Cada foto é comprimida para ficar leve sem perder qualidade na arte. Não feche esta tela.
        </div>
      )}

      {loaded && photos.length > 0 && (
        <div className="seg photo-bank-seg" role="tablist">
          <button type="button" role="tab" aria-selected={view === "ativas"} className={"seg-btn" + (view === "ativas" ? " on" : "")} onClick={() => setView("ativas")}>
            Em uso ({active.length})
          </button>
          <button type="button" role="tab" aria-selected={view === "fora"} className={"seg-btn" + (view === "fora" ? " on" : "")} onClick={() => setView("fora")}>
            Fora de uso ({off.length})
          </button>
        </div>
      )}

      {loaded && photos.length === 0 ? (
        <div className="empty-state">
          Nenhuma foto ainda. Clique em <strong>+ Enviar fotos</strong> e escolha várias de uma vez (fotos do iPhone também). O ideal é ter de 15 a 20 fotos
          para o feed não repetir.
        </div>
      ) : (
        <>
          {loaded && shown.length === 0 && (
            <div className="hint">{view === "fora" ? "Nenhuma foto fora de uso." : "Todas as fotos estão fora de uso."}</div>
          )}
          <div className="photo-grid">
            {shown.map((p) => (
              <PhotoTile key={p.id} photo={p} onPatch={patch} onRemove={remove} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function PhotoTile({ photo, onPatch, onRemove }) {
  const url = useSignedUrl(photo.thumb_path || photo.path);
  const [tags, setTags] = useState(photo.tags || "");
  useEffect(() => setTags(photo.tags || ""), [photo.tags]);
  const off = photo.active === false;
  const used = photo.use_count || 0;
  return (
    <div className={"photo-tile" + (off ? " off" : "")}>
      <div className="photo-img">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {url ? <img src={url} alt={photo.name || "Foto"} loading="lazy" /> : <span className="art-thumb-ph" />}
        <span className="photo-used">{used ? `usada ${used}x` : "nunca usada"}</span>
      </div>
      <input
        type="text"
        className="photo-tags"
        value={tags}
        placeholder="Etiquetas: retrato, consultório…"
        onChange={(e) => setTags(e.target.value)}
        onBlur={() => tags.trim() !== (photo.tags || "") && onPatch(photo, { tags: tags.trim() }, "Etiquetas salvas.")}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      />
      <div className="photo-actions">
        <button
          type="button"
          className="mini-link"
          onClick={() => onPatch(photo, { active: off }, off ? "A foto voltou para as sugestões." : "A foto não entra mais nas artes.")}
          title={off ? "Voltar a usar nas artes" : "Tirar das sugestões, sem apagar"}
        >
          {off ? "↩ Voltar a usar" : "🚫 Não usar mais"}
        </button>
        <button type="button" className="mini-link danger" onClick={() => onRemove(photo)}>
          🗑 Excluir
        </button>
      </div>
    </div>
  );
}

// Escolha das fotos do banco na janela "Criar arte" (quando o post não tem foto anexada).
// value: Set de ids; começa com as sugeridas.
export function BankPicker({ clientId, onLoaded, value, onChange, disabled }) {
  const [bank, setBank] = useState(null);
  useEffect(() => {
    let alive = true;
    supabase
      .from("client_photos")
      .select("id, path, thumb_path, name, tags, active, use_count, last_used_at, created_at")
      .eq("client_id", clientId)
      .eq("active", true)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (!alive) return;
        setBank(data || []);
        onLoaded?.(data || []);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  if (!bank) return <div className="hint">Carregando o banco de fotos…</div>;
  if (!bank.length)
    return <div className="hint">O banco de fotos deste cliente está vazio: a arte sai só com fundos e texturas. Para usar fotos, anexe no post ou envie no Banco de fotos do cliente.</div>;
  const toggle = (id) => {
    const next = new Set(value);
    next.has(id) ? next.delete(id) : next.add(id);
    onChange(next);
  };
  return (
    <div className="art-strip art-pick bank-pick">
      {bank.map((p) => (
        <BankPickPhoto key={p.id} photo={p} on={value.has(p.id)} onToggle={() => !disabled && toggle(p.id)} />
      ))}
    </div>
  );
}

function BankPickPhoto({ photo, on, onToggle }) {
  const url = useSignedUrl(photo.thumb_path || photo.path);
  return (
    <button type="button" className={"art-page pickable" + (on ? " on" : "")} onClick={onToggle} title={photo.tags || photo.name || "Foto"} aria-pressed={on}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url ? <img src={url} alt={photo.name || "Foto"} /> : <span className="art-thumb-ph" />}
      {on && <span className="art-pick-check">✓</span>}
    </button>
  );
}
