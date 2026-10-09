// Fotos de banco de imagens (Pexels: gratuito, uso comercial liberado, sem crédito obrigatório).
// Só no servidor. Chave na variável PEXELS_API_KEY (Vercel); sem chave, a arte sai sem foto de banco.

export const stockEnabled = () => !!process.env.PEXELS_API_KEY;

// query em inglês; orientation: "portrait" (feed e story). Devolve { buffer, id, url } ou null.
export async function findStockPhoto(query, { orientation = "portrait", avoid = new Set() } = {}) {
  const key = process.env.PEXELS_API_KEY;
  if (!key || !query?.trim()) return null;
  try {
    const url = new URL("https://api.pexels.com/v1/search");
    url.searchParams.set("query", query.trim());
    url.searchParams.set("orientation", orientation);
    url.searchParams.set("per_page", "10");
    const res = await fetch(url, { headers: { Authorization: key }, cache: "no-store" });
    if (!res.ok) {
      console.error("pexels: busca falhou", res.status);
      return null;
    }
    const body = await res.json();
    const photo = (body.photos || []).find((p) => !avoid.has(p.id));
    if (!photo) return null;
    const img = await fetch(photo.src?.large2x || photo.src?.original, { cache: "no-store" });
    if (!img.ok) return null;
    return { buffer: Buffer.from(await img.arrayBuffer()), id: photo.id, url: photo.url };
  } catch (err) {
    console.error("pexels: erro", err?.message);
    return null;
  }
}
