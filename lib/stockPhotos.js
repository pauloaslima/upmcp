// Fotos de banco de imagens, só no servidor. Dois bancos gratuitos, com uso comercial liberado e sem crédito obrigatório:
//   Pixabay: chave em PIXABAY_API_KEY (Vercel)
//   Pexels:  chave em PEXELS_API_KEY (Vercel)
// Com as duas chaves, tenta o Pexels e, sem resultado, o Pixabay. Sem nenhuma chave, a arte sai sem foto de banco.
// A foto é baixada para dentro da arte (não fica apontando para o site do banco).

export const stockEnabled = () => !!(process.env.PEXELS_API_KEY || process.env.PIXABAY_API_KEY);

// query em inglês; orientation: "portrait" (feed e story). Devolve { buffer, id, url } ou null.
export async function findStockPhoto(query, { orientation = "portrait", avoid = new Set() } = {}) {
  if (!query?.trim()) return null;
  if (process.env.PEXELS_API_KEY) {
    const photo = await fromPexels(query.trim(), orientation, avoid);
    if (photo) return photo;
  }
  if (process.env.PIXABAY_API_KEY) return fromPixabay(query.trim(), orientation, avoid);
  return null;
}

async function download(url) {
  const img = await fetch(url, { cache: "no-store" });
  if (!img.ok) return null;
  return Buffer.from(await img.arrayBuffer());
}

async function fromPexels(query, orientation, avoid) {
  try {
    const url = new URL("https://api.pexels.com/v1/search");
    url.searchParams.set("query", query);
    url.searchParams.set("orientation", orientation);
    url.searchParams.set("per_page", "10");
    const res = await fetch(url, { headers: { Authorization: process.env.PEXELS_API_KEY }, cache: "no-store" });
    if (!res.ok) {
      console.error("pexels: busca falhou", res.status);
      return null;
    }
    const photo = ((await res.json()).photos || []).find((p) => !avoid.has("pexels-" + p.id));
    if (!photo) return null;
    const buffer = await download(photo.src?.large2x || photo.src?.original);
    return buffer ? { buffer, id: "pexels-" + photo.id, url: photo.url } : null;
  } catch (err) {
    console.error("pexels: erro", err?.message);
    return null;
  }
}

async function fromPixabay(query, orientation, avoid) {
  try {
    const url = new URL("https://pixabay.com/api/");
    url.searchParams.set("key", process.env.PIXABAY_API_KEY);
    url.searchParams.set("q", query.slice(0, 100));
    url.searchParams.set("image_type", "photo");
    url.searchParams.set("orientation", orientation === "portrait" ? "vertical" : "horizontal");
    url.searchParams.set("safesearch", "true");
    url.searchParams.set("per_page", "20");
    url.searchParams.set("lang", "en");
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      console.error("pixabay: busca falhou", res.status);
      return null;
    }
    const hits = (await res.json()).hits || [];
    // prefere fotos grandes o bastante para 1080 px de largura
    const photo = hits.find((h) => !avoid.has("pixabay-" + h.id) && (h.imageWidth || 0) >= 1080) || hits.find((h) => !avoid.has("pixabay-" + h.id));
    if (!photo) return null;
    const buffer = await download(photo.largeImageURL || photo.webformatURL);
    return buffer ? { buffer, id: "pixabay-" + photo.id, url: photo.pageURL } : null;
  } catch (err) {
    console.error("pixabay: erro", err?.message?.replace(process.env.PIXABAY_API_KEY || "@@", "[chave oculta]"));
    return null;
  }
}
