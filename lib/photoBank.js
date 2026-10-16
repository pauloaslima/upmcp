// Banco de fotos do cliente: sugestão de fotos para a arte (sem IA, sem custo).
// Prefere fotos com etiqueta parecida com o tema do post e as menos usadas / usadas há mais tempo,
// para o feed não repetir sempre a mesma foto.

const STOP = new Set(
  "a o e de da do das dos em no na nos nas um uma uns umas para por com sem que se ao aos as os seu sua seus suas voce vc como mais menos muito nao sim eu ele ela isso esse essa este esta".split(" ")
);

export function words(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
}

// quantas fotos a arte usa: carrossel até 3 (capa, meio e fim), o resto 1
export function photosWanted(format) {
  return format === "Carrossel" ? 3 : 1;
}

// bank: [{ id, tags, active, use_count, last_used_at, created_at }]
// devolve os ids sugeridos, na ordem de preferência
export function suggestPhotos(bank, { theme = "", format = "", count, now = Date.now() } = {}) {
  const want = count ?? photosWanted(format);
  const topic = new Set(words(theme));
  const scored = (bank || [])
    .filter((p) => p && p.active !== false)
    .map((p) => {
      const tags = words(p.tags);
      const match = tags.filter((t) => topic.has(t) || [...topic].some((w) => w.startsWith(t) || t.startsWith(w))).length;
      const days = p.last_used_at ? (now - new Date(p.last_used_at).getTime()) / 86400000 : 999;
      const recent = days < 14 ? 3 : days < 30 ? 1.5 : 0; // usada há pouco: fica para depois
      const score = match * 4 - recent - Math.min(5, (p.use_count || 0) * 0.5);
      return { id: p.id, score, created: p.created_at || "" };
    })
    // empate: a mais nova primeiro (fotos recém-enviadas aparecem logo)
    .sort((a, b) => b.score - a.score || (a.created < b.created ? 1 : a.created > b.created ? -1 : 0));
  return scored.slice(0, want).map((s) => s.id);
}
