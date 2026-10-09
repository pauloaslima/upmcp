import { readFile } from "fs/promises";
import path from "path";
import { ImageResponse } from "next/og";

// Desenha as páginas da arte (PNG) a partir do projeto do designer (lib/designAgent.js).
// Feed 1080×1350 (4:5) e Story 1080×1920 (9:16). Fontes abertas (OFL) em lib/fonts.

export const SIZES = { feed: { width: 1080, height: 1350 }, story: { width: 1080, height: 1920 } };
export const sizeFor = (format) => (format === "Story" ? SIZES.story : SIZES.feed);

// tamanho da área de foto de cada layout (a foto chega já recortada nesse tamanho)
export function photoBox(layout, size) {
  if (layout === "foto_cheia") return size;
  if (layout === "foto_topo") return { width: size.width, height: Math.round(size.height * 0.56) };
  return null;
}

let fontsCache = null;
async function fonts() {
  if (fontsCache) return fontsCache;
  const dir = path.join(process.cwd(), "lib", "fonts");
  const load = (file) => readFile(path.join(dir, file));
  const [m4, m6, m8, p6, p8] = await Promise.all([
    load("montserrat-latin-400-normal.woff"),
    load("montserrat-latin-600-normal.woff"),
    load("montserrat-latin-800-normal.woff"),
    load("playfair-display-latin-600-normal.woff"),
    load("playfair-display-latin-800-normal.woff")
  ]);
  fontsCache = [
    { name: "Montserrat", data: m4, weight: 400, style: "normal" },
    { name: "Montserrat", data: m6, weight: 600, style: "normal" },
    { name: "Montserrat", data: m8, weight: 800, style: "normal" },
    { name: "Playfair", data: p6, weight: 600, style: "normal" },
    { name: "Playfair", data: p8, weight: 800, style: "normal" }
  ];
  return fontsCache;
}

// ---------- cores ----------
function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function luminance(hex) {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}
// cor de texto legível sobre um fundo: a escolhida, ou branco/escuro se o contraste for baixo
function readable(color, background) {
  if (contrast(color, background) >= 3.2) return color;
  return contrast("#FFFFFF", background) >= contrast("#1A1A1A", background) ? "#FFFFFF" : "#1A1A1A";
}
const alpha = (hex, a) => {
  const [r, g, b] = rgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
};

// emojis não existem nas fontes da arte
const clean = (s) => String(s || "").replace(/\p{Extended_Pictographic}|️/gu, "").trim();

function titleSize(text, base) {
  const n = text.length;
  if (n <= 24) return base;
  if (n <= 48) return Math.round(base * 0.82);
  if (n <= 80) return Math.round(base * 0.68);
  return Math.round(base * 0.56);
}
function bodySize(text) {
  const n = text.length;
  if (n <= 90) return 40;
  if (n <= 180) return 34;
  if (n <= 300) return 30;
  return 26;
}

// ---------- peças reutilizadas ----------
function Logo({ logo, onDark, size = 1 }) {
  if (!logo) return null;
  const h = Math.round(84 * size);
  const w = Math.round((logo.width / logo.height) * h);
  const badge = onDark && !logo.light;
  return (
    <div style={{ display: "flex", padding: badge ? 14 : 0, borderRadius: 18, background: badge ? "rgba(255,255,255,0.94)" : "transparent" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={logo.src} width={w} height={h} alt="" style={{ width: w, height: h, objectFit: "contain" }} />
    </div>
  );
}

function Dots({ index, total, color }) {
  if (total <= 1) return null;
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
      {Array.from({ length: total }, (_, i) => (
        <div key={i} style={{ width: i === index ? 34 : 12, height: 12, borderRadius: 6, background: i === index ? color : alpha(color.length === 7 ? color : "#FFFFFF", 0.35) }} />
      ))}
    </div>
  );
}

function Kicker({ text, background, color }) {
  if (!text) return null;
  return (
    <div style={{ display: "flex", alignSelf: "flex-start", padding: "10px 22px", borderRadius: 40, background, color, fontSize: 26, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", marginBottom: 26 }}>
      {text}
    </div>
  );
}

// ---------- layouts ----------
function Page({ page, index, total, palette, typo, photo, logo, size }) {
  const W = size.width;
  const H = size.height;
  const pad = 84;
  // Story: área segura do Instagram (topo e base ficam livres para a interface)
  const story = H > 1500;
  const frame = story ? `200px ${pad}px 280px` : pad;
  const headFont = typo === "elegante" ? "Playfair" : "Montserrat";
  const title = clean(page.titulo);
  const text = clean(page.texto);
  const kicker = clean(page.chamada_superior);
  const cta = clean(page.cta);
  const fundo = palette.fundo;
  const destaque = palette.destaque;
  const onFundo = readable(palette.texto, fundo);
  const accentOnFundo = readable(destaque, fundo);
  const onDestaque = readable(palette.fundo, destaque);
  const fundoDark = luminance(fundo) < 0.35;
  const counter = total > 1 ? `${index + 1}/${total}` : "";

  const base = { width: W, height: H, display: "flex", flexDirection: "column", position: "relative", fontFamily: "Montserrat", overflow: "hidden" };
  const top = (color, onDark) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", width: "100%" }}>
      <Logo logo={logo} onDark={onDark} />
      {counter ? <div style={{ display: "flex", fontSize: 26, fontWeight: 600, color, opacity: 0.85 }}>{counter}</div> : <div style={{ display: "flex" }} />}
    </div>
  );

  if (page.layout === "foto_cheia" && photo) {
    const onPhoto = palette.texto_sobre_foto;
    return (
      <div style={{ ...base, background: "#111" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo} width={W} height={H} alt="" style={{ position: "absolute", top: 0, left: 0, width: W, height: H }} />
        <div style={{ position: "absolute", top: 0, left: 0, width: W, height: H, display: "flex", backgroundImage: "linear-gradient(180deg, rgba(0,0,0,0.30) 0%, rgba(0,0,0,0) 22%, rgba(0,0,0,0) 40%, rgba(0,0,0,0.82) 100%)" }} />
        <div style={{ position: "absolute", top: 0, left: 0, width: W, height: H, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: frame }}>
          {top(onPhoto, true)}
          <div style={{ display: "flex", flexDirection: "column" }}>
            <Kicker text={kicker} background={destaque} color={onDestaque} />
            <div style={{ display: "flex", fontFamily: headFont, fontWeight: 800, fontSize: titleSize(title, 92), lineHeight: 1.08, color: onPhoto }}>{title}</div>
            {text && <div style={{ display: "flex", marginTop: 26, fontSize: bodySize(text), lineHeight: 1.35, color: onPhoto, opacity: 0.94 }}>{text}</div>}
            <div style={{ display: "flex", marginTop: 40 }}>
              <Dots index={index} total={total} color={onPhoto} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (page.layout === "foto_topo" && photo) {
    const box = photoBox("foto_topo", size);
    return (
      <div style={{ ...base, background: fundo }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo} width={box.width} height={box.height} alt="" style={{ width: box.width, height: box.height }} />
        <div style={{ position: "absolute", top: 0, left: 0, width: W, display: "flex", padding: frame, paddingBottom: 0 }}>{top("#FFFFFF", true)}</div>
        <div style={{ display: "flex", flexDirection: "column", flex: 1, padding: `${pad - 20}px ${pad}px ${pad - 10}px`, justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <Kicker text={kicker} background={destaque} color={onDestaque} />
            <div style={{ display: "flex", fontFamily: headFont, fontWeight: 800, fontSize: titleSize(title, 78), lineHeight: 1.08, color: accentOnFundo }}>{title}</div>
            {text && <div style={{ display: "flex", marginTop: 22, fontSize: Math.min(bodySize(text), 36), lineHeight: 1.35, color: onFundo }}>{text}</div>}
          </div>
          <Dots index={index} total={total} color={accentOnFundo} />
        </div>
      </div>
    );
  }

  if (page.layout === "lista") {
    const items = text
      .split(/\n+/)
      .map((l) => l.replace(/^\s*(\d+[.)]|[-*•])\s*/, "").trim())
      .filter(Boolean)
      .slice(0, 6);
    return (
      <div style={{ ...base, background: fundo, padding: frame, justifyContent: "space-between" }}>
        {top(onFundo, fundoDark)}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <Kicker text={kicker} background={destaque} color={onDestaque} />
          <div style={{ display: "flex", fontFamily: headFont, fontWeight: 800, fontSize: titleSize(title, 76), lineHeight: 1.08, color: accentOnFundo, marginBottom: 40 }}>{title}</div>
          {items.map((item, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", marginBottom: 24 }}>
              <div style={{ display: "flex", width: 64, height: 64, borderRadius: 32, background: destaque, color: onDestaque, fontSize: 30, fontWeight: 800, alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{String(i + 1)}</div>
              <div style={{ display: "flex", marginLeft: 26, fontSize: items.length > 4 ? 32 : 36, lineHeight: 1.3, color: onFundo, flex: 1 }}>{item}</div>
            </div>
          ))}
        </div>
        <Dots index={index} total={total} color={accentOnFundo} />
      </div>
    );
  }

  if (page.layout === "citacao") {
    return (
      <div style={{ ...base, background: fundo, padding: frame, justifyContent: "space-between" }}>
        {top(onFundo, fundoDark)}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontFamily: "Playfair", fontWeight: 800, fontSize: 220, lineHeight: 0.8, color: accentOnFundo, height: 150 }}>“</div>
          <div style={{ display: "flex", fontFamily: headFont, fontWeight: 800, fontSize: titleSize(title, 76), lineHeight: 1.15, color: onFundo }}>{title}</div>
          {text && <div style={{ display: "flex", marginTop: 34, fontSize: 32, fontWeight: 600, color: accentOnFundo }}>{text}</div>}
        </div>
        <Dots index={index} total={total} color={accentOnFundo} />
      </div>
    );
  }

  if (page.layout === "cta") {
    const bg = destaque;
    const onBg = readable(palette.texto_sobre_foto, bg);
    const btnText = readable(destaque, fundo);
    return (
      <div style={{ ...base, background: bg, padding: frame, justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", width: "100%", justifyContent: "flex-end" }}>
          {counter ? <div style={{ display: "flex", fontSize: 26, fontWeight: 600, color: onBg, opacity: 0.85 }}>{counter}</div> : <div style={{ display: "flex" }} />}
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
          <div style={{ display: "flex", fontFamily: headFont, fontWeight: 800, fontSize: titleSize(title, 84), lineHeight: 1.1, color: onBg, textAlign: "center", justifyContent: "center" }}>{title}</div>
          {text && <div style={{ display: "flex", marginTop: 28, fontSize: Math.min(bodySize(text), 36), lineHeight: 1.35, color: onBg, opacity: 0.92, textAlign: "center", justifyContent: "center" }}>{text}</div>}
          {cta && <div style={{ display: "flex", marginTop: 52, padding: "24px 56px", borderRadius: 60, background: fundo, color: btnText, fontSize: 34, fontWeight: 800 }}>{cta}</div>}
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 30 }}>
          <Logo logo={logo} onDark={luminance(bg) < 0.35} size={1.25} />
          <Dots index={index} total={total} color={onBg} />
        </div>
      </div>
    );
  }

  // capa sem foto: título bem grande, formas da marca e faixa de cor embaixo (nada de espaço vazio)
  if (index === 0) {
    const bandText = readable(palette.fundo, destaque);
    return (
      <div style={{ ...base, background: fundo }}>
        <div style={{ position: "absolute", right: -220, top: -260, width: 760, height: 760, borderRadius: 380, background: alpha(destaque, 0.16), display: "flex" }} />
        <div style={{ position: "absolute", right: 120, top: 220, width: 220, height: 220, borderRadius: 110, border: `14px solid ${alpha(destaque, 0.35)}`, display: "flex" }} />
        <div style={{ display: "flex", flexDirection: "column", flex: 1, padding: frame, paddingBottom: 40, justifyContent: "space-between" }}>
          {top(onFundo, fundoDark)}
          <div style={{ display: "flex", flexDirection: "column" }}>
            <Kicker text={kicker} background={destaque} color={onDestaque} />
            <div style={{ display: "flex", fontFamily: headFont, fontWeight: 800, fontSize: titleSize(title, 128), lineHeight: 1.02, color: onFundo, letterSpacing: -1 }}>{title}</div>
            {text && <div style={{ display: "flex", marginTop: 34, fontSize: Math.max(bodySize(text), 36), lineHeight: 1.35, color: onFundo, opacity: 0.9 }}>{text}</div>}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: destaque, padding: story ? `40px ${pad}px 260px` : `36px ${pad}px` }}>
          <Dots index={index} total={total} color={bandText} />
          {total > 1 ? (
            <div style={{ display: "flex", fontSize: 32, fontWeight: 800, color: bandText, letterSpacing: 1 }}>ARRASTE ›</div>
          ) : (
            <div style={{ display: "flex" }} />
          )}
        </div>
      </div>
    );
  }

  // "tipografico" (e qualquer layout de foto sem foto disponível)
  return (
    <div style={{ ...base, background: fundo, padding: frame, justifyContent: "space-between" }}>
      <div style={{ position: "absolute", right: -160, top: -160, width: 520, height: 520, borderRadius: 260, background: alpha(destaque, 0.12), display: "flex" }} />
      <div style={{ position: "absolute", left: -120, bottom: -140, width: 380, height: 380, borderRadius: 190, background: alpha(destaque, 0.08), display: "flex" }} />
      {top(onFundo, fundoDark)}
      <div style={{ display: "flex", flexDirection: "column" }}>
        <Kicker text={kicker} background={destaque} color={onDestaque} />
        <div style={{ display: "flex", width: 120, height: 12, borderRadius: 6, background: accentOnFundo, marginBottom: 34 }} />
        <div style={{ display: "flex", fontFamily: headFont, fontWeight: 800, fontSize: titleSize(title, 96), lineHeight: 1.06, color: onFundo }}>{title}</div>
        {text && <div style={{ display: "flex", marginTop: 30, fontSize: bodySize(text), lineHeight: 1.38, color: onFundo, opacity: 0.88 }}>{text}</div>}
      </div>
      <Dots index={index} total={total} color={accentOnFundo} />
    </div>
  );
}

// design: saída do designer; photos: [dataUrl|null] por página (já recortadas); logo: { src, width, height, light } | null
// Devolve um Buffer PNG por página.
export async function renderArt({ design, format, photos, logo }) {
  const size = sizeFor(format);
  const fontList = await fonts();
  const out = [];
  for (let i = 0; i < design.paginas.length; i++) {
    const page = design.paginas[i];
    const element = (
      <Page page={page} index={i} total={design.paginas.length} palette={design.paleta} typo={design.tipografia} photo={photos[i] || null} logo={logo} size={size} />
    );
    const res = new ImageResponse(element, { width: size.width, height: size.height, fonts: fontList });
    out.push(Buffer.from(await res.arrayBuffer()));
  }
  return out;
}
