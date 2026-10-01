import { ImageResponse } from "next/og";
import { SIZES, firstHex } from "./arts";

// Monta a arte final (PNG): imagem de fundo gerada pela IA + texto do redator + logo,
// com as fontes e a cor de destaque do cliente. Só no servidor.

const fontCache = new Map();

// Fonte do Google Fonts (woff/ttf; o motor de desenho não lê woff2). O Google divide a fonte
// por alfabeto: pegamos "latin" (inclui á, ç, ã…) e "latin-ext" como reserva.
async function googleFont(family, weight) {
  const key = family + weight;
  if (fontCache.has(key)) return fontCache.get(key);
  const get = (q) =>
    fetch(`https://fonts.googleapis.com/css2?family=${q}`, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 6.1) AppleWebKit/534.30 (KHTML, like Gecko) Safari/534.30" } // navegador antigo → woff
    }).then((r) => (r.ok ? r.text() : ""));
  // fontes de um peso só (ex.: Bebas Neue) não têm negrito: usa o peso que existir
  const css = (await get(`${encodeURIComponent(family)}:wght@${weight}`)) || (await get(encodeURIComponent(family)));
  const blocks = [...css.matchAll(/\/\*\s*([\w-]+)\s*\*\/\s*@font-face\s*\{([^}]*)\}/g)].map((m) => ({ subset: m[1], url: m[2].match(/url\(([^)]+)\)/)?.[1] }));
  const plain = !blocks.length ? [{ subset: "latin", url: css.match(/url\(([^)]+)\)/)?.[1] }] : [];
  const wanted = [...blocks, ...plain].filter((b) => b.url && ["latin", "latin-ext"].includes(b.subset)).sort((a, b) => (a.subset === "latin" ? -1 : b.subset === "latin" ? 1 : 0));
  const datas = (await Promise.all(wanted.map((b) => fetch(b.url).then((r) => (r.ok ? r.arrayBuffer() : null))))).filter(Boolean);
  if (datas.length) fontCache.set(key, datas);
  return datas.length ? datas : null;
}

async function fonts({ titleFont, bodyFont, customTitle }) {
  const title = customTitle ? [customTitle] : (await googleFont(titleFont || "Montserrat", 700)) || (await googleFont("Montserrat", 700)) || [];
  const body = (await googleFont(bodyFont || "Inter", 400)) || (await googleFont("Inter", 400)) || [];
  return [
    ...title.map((data) => ({ name: "Title", data, weight: 700, style: "normal" })),
    ...body.map((data) => ({ name: "Body", data, weight: 400, style: "normal" }))
  ];
}

// tamanho do título conforme o comprimento do texto
function titleSize(text, layout, width) {
  const n = String(text || "").length;
  const base = layout === "capa" ? 92 : 76;
  const size = n <= 20 ? base : n <= 45 ? base - 14 : n <= 80 ? base - 26 : base - 36;
  return Math.round((size * width) / 1080);
}

// page: { aspect, layout, titulo, apoio }; background/logo: data URL; client: { brand_colors, title_font, body_font }
export async function renderArt({ page, background, logo, client, customTitleFont, index, total }) {
  const { width, height, safeTop, safeBottom } = SIZES[page.aspect] || SIZES["4:5"];
  const pad = 84;
  const accent = firstHex(client.brand_colors) || "#E8B04A";
  const cta = page.layout === "cta";
  const tSize = titleSize(page.titulo, page.layout, width);

  const node = (
    <div style={{ width, height, display: "flex", position: "relative", backgroundColor: "#15151c", fontFamily: "Body" }}>
      {background && <img src={background} width={width} height={height} style={{ position: "absolute", top: 0, left: 0, width, height, objectFit: "cover" }} />}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width,
          height,
          display: "flex",
          backgroundImage: cta
            ? "linear-gradient(to bottom, rgba(0,0,0,0.55), rgba(0,0,0,0.7))"
            : "linear-gradient(to top, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.45) 38%, rgba(0,0,0,0) 65%)"
        }}
      />
      <div
        style={{
          position: "absolute",
          left: pad,
          right: pad,
          top: safeTop,
          bottom: safeBottom,
          display: "flex",
          flexDirection: "column",
          justifyContent: cta ? "center" : "flex-end",
          alignItems: cta ? "center" : "flex-start"
        }}
      >
        <div style={{ display: "flex", width: 96, height: 10, borderRadius: 5, backgroundColor: accent, marginBottom: 30 }} />
        <div style={{ display: "flex", fontFamily: "Title", fontSize: tSize, lineHeight: 1.08, color: "#ffffff", textAlign: cta ? "center" : "left" }}>{page.titulo}</div>
        {page.apoio ? (
          <div style={{ display: "flex", fontSize: Math.round(tSize * 0.46), lineHeight: 1.35, marginTop: 26, color: "rgba(255,255,255,0.9)", textAlign: cta ? "center" : "left", whiteSpace: "pre-wrap" }}>
            {page.apoio}
          </div>
        ) : null}
      </div>
      {logo && (
        <img src={logo} width={240} height={96} style={{ position: "absolute", top: safeTop - 40, right: pad - 10, width: 240, height: 96, objectFit: "contain", objectPosition: "right" }} />
      )}
      {total > 1 && (
        <div style={{ position: "absolute", top: safeTop - 20, left: pad, display: "flex", fontSize: 30, color: "rgba(255,255,255,0.85)", fontFamily: "Body" }}>
          {index + 1}/{total}
        </div>
      )}
    </div>
  );

  const res = new ImageResponse(node, { width, height, fonts: await fonts({ titleFont: client.title_font, bodyFont: client.body_font, customTitle: customTitleFont }), emoji: "twemoji" });
  return Buffer.from(await res.arrayBuffer());
}
