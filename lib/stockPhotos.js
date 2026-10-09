// Fotos de banco de imagens, só no servidor. Dois bancos gratuitos, com uso comercial liberado e sem crédito obrigatório:
//   Pixabay: chave em PIXABAY_API_KEY (Vercel)
//   Pexels:  chave em PEXELS_API_KEY (Vercel)
// A busca traz várias opções (com uma miniatura de cada); o designer escolhe a melhor e só ela é baixada.
// A foto entra dentro da arte (não fica apontando para o site do banco).

export const stockEnabled = () => !!(process.env.PEXELS_API_KEY || process.env.PIXABAY_API_KEY);

// query em inglês. Devolve [{ id, preview, full, width, height }] (até ~10 opções, sem as de "avoid")
export async function findStockCandidates(query, { orientation = "portrait", avoid = new Set() } = {}) {
  if (!query?.trim()) return [];
  const q = query.trim();
  const lists = await Promise.all([
    process.env.PEXELS_API_KEY ? fromPexels(q, orientation) : [],
    process.env.PIXABAY_API_KEY ? fromPixabay(q, orientation) : []
  ]);
  // intercala os bancos para o designer ver opções dos dois
  const out = [];
  for (let i = 0; i < 10; i++) for (const list of lists) if (list[i] && !avoid.has(list[i].id)) out.push(list[i]);
  return out.slice(0, 10);
}

export async function downloadStock(candidate) {
  try {
    const res = await fetch(candidate.full, { cache: "no-store" });
    return res.ok ? Buffer.from(await res.arrayBuffer()) : null;
  } catch {
    return null;
  }
}

async function fromPexels(query, orientation) {
  try {
    const url = new URL("https://api.pexels.com/v1/search");
    url.searchParams.set("query", query);
    url.searchParams.set("orientation", orientation);
    url.searchParams.set("per_page", "8");
    const res = await fetch(url, { headers: { Authorization: process.env.PEXELS_API_KEY }, cache: "no-store" });
    if (!res.ok) {
      console.error("pexels: busca falhou", res.status);
      return [];
    }
    return ((await res.json()).photos || []).map((p) => ({
      id: "pexels-" + p.id,
      preview: p.src?.medium || p.src?.small,
      full: p.src?.large2x || p.src?.original,
      width: p.width,
      height: p.height
    }));
  } catch (err) {
    console.error("pexels: erro", err?.message);
    return [];
  }
}

async function fromPixabay(query, orientation) {
  const search = async (editors) => {
    const url = new URL("https://pixabay.com/api/");
    url.searchParams.set("key", process.env.PIXABAY_API_KEY);
    url.searchParams.set("q", query.slice(0, 100));
    url.searchParams.set("image_type", "photo");
    url.searchParams.set("orientation", orientation === "portrait" ? "vertical" : "horizontal");
    url.searchParams.set("safesearch", "true");
    url.searchParams.set("min_width", "1080");
    url.searchParams.set("per_page", "12");
    url.searchParams.set("lang", "en");
    if (editors) url.searchParams.set("editors_choice", "true");
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      console.error("pixabay: busca falhou", res.status);
      return [];
    }
    return (await res.json()).hits || [];
  };
  try {
    // primeiro as fotos escolhidas pelos editores (mais bonitas); completa com as demais
    const best = await search(true);
    const hits = best.length >= 4 ? best : [...best, ...(await search(false))];
    const seen = new Set();
    return hits
      .filter((h) => (seen.has(h.id) ? false : seen.add(h.id)))
      .map((h) => ({ id: "pixabay-" + h.id, preview: h.webformatURL, full: h.largeImageURL || h.webformatURL, width: h.imageWidth, height: h.imageHeight }));
  } catch (err) {
    console.error("pixabay: erro", String(err?.message || "").replace(process.env.PIXABAY_API_KEY || "@@", "[chave oculta]"));
    return [];
  }
}
