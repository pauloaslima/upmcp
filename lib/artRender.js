import { readFile } from "fs/promises";
import path from "path";
import { ImageResponse } from "next/og";
import { iconSrc } from "./art/icons.js";

// Motor de arte: desenha as páginas (PNG) exatamente como o plano do arquiteto de layout manda
// (lib/art/plan.js). Feed 1080×1350 (4:5) e Story 1080×1920 (9:16). Fontes abertas (OFL) em lib/fonts,
// ícones Lucide (ISC) em lib/art/icons.js. O texto é desenhado aqui (sai exato, sem erro de digitação)
// e as fotos reais entram recortadas pelo pipeline (lib/art/pipeline.js), sem alteração.

export const SIZES = { feed: { width: 1080, height: 1350 }, story: { width: 1080, height: 1920 } };
export const sizeFor = (format) => (format === "Story" ? SIZES.story : SIZES.feed);

// tamanho da área de foto de cada página (a foto chega já recortada nesse tamanho)
export function photoBox(pageOrLayout, size) {
  const layout = typeof pageOrLayout === "string" ? pageOrLayout : pageOrLayout?.layout;
  if (layout === "foto_cheia") return size;
  if (layout === "foto_lateral") return { width: Math.round(size.width * 0.58), height: size.height };
  if (layout === "foto_topo") return { width: size.width, height: Math.round(size.height * 0.56) };
  if (layout === "foto_base") return { width: size.width, height: Math.round(size.height * 0.5) };
  if (layout === "oferta") return { width: size.width, height: Math.round(size.height * 0.64) };
  if (layout === "checklist") return { width: Math.round(size.width * 0.5), height: Math.round(size.height * 0.42) };
  return null;
}

let fontsCache = null;
async function fonts() {
  if (fontsCache) return fontsCache;
  const dir = path.join(process.cwd(), "lib", "fonts");
  const list = [
    ["Montserrat", "montserrat-latin-400-normal.woff", 400],
    ["Montserrat", "montserrat-latin-500-normal.woff", 500],
    ["Montserrat", "montserrat-latin-600-normal.woff", 600],
    ["Montserrat", "montserrat-latin-800-normal.woff", 800],
    ["Playfair", "playfair-display-latin-600-normal.woff", 600],
    ["Playfair", "playfair-display-latin-800-normal.woff", 800],
    ["Cormorant", "cormorant-garamond-latin-600-normal.woff", 600],
    ["Cormorant", "cormorant-garamond-latin-700-normal.woff", 700],
    ["Anton", "anton-latin-400-normal.woff", 400],
    ["Pacifico", "pacifico-latin-400-normal.woff", 400],
    ["GreatVibes", "great-vibes-latin-400-normal.woff", 400]
  ];
  const data = await Promise.all(list.map(([, file]) => readFile(path.join(dir, file))));
  fontsCache = list.map(([name, , weight], i) => ({ name, data: data[i], weight, style: "normal" }));
  return fontsCache;
}

// ---------- cores ----------
function rgb(hex) {
  const n = parseInt(String(hex).slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function luminance(hex) {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}
// primeira cor da lista com contraste suficiente; senão branco ou quase preto
function legible(background, candidates, min = 4.5) {
  for (const c of candidates) if (c && contrast(c, background) >= min) return c;
  return contrast("#FFFFFF", background) >= contrast("#1A1A1A", background) ? "#FFFFFF" : "#1A1A1A";
}
function mix(a, b, t) {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  const c = (x, y) => Math.round(x + (y - x) * t).toString(16).padStart(2, "0");
  return "#" + c(r1, r2) + c(g1, g2) + c(b1, b2);
}
const alpha = (hex, a) => {
  const [r, g, b] = rgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
};
const isDark = (hex) => luminance(hex) < 0.3;

// emojis não existem nas fontes da arte
const clean = (s) => String(s || "").replace(/\p{Extended_Pictographic}|️/gu, "").trim();

// cores de uma página conforme o fundo escolhido pelo arquiteto
function themeFor(palette, fundo = "principal") {
  const bg = fundo === "alternativo" ? palette.fundo_alt || palette.fundo : fundo === "destaque" ? palette.destaque : palette.fundo;
  const text = legible(bg, [palette.texto, palette.fundo, palette.texto_sobre_foto, palette.fundo_alt]);
  const accent = legible(bg, [palette.destaque, palette.fundo_alt, palette.texto], 3);
  const soft = isDark(bg) ? mix(bg, "#FFFFFF", 0.1) : mix(bg, accent, 0.09);
  return { bg, text, accent, soft, dark: isDark(bg) };
}

// ---------- tipografia ----------
const TITLE_WEIGHT = { Montserrat: 800, Playfair: 800, Cormorant: 700, Anton: 400 };
const TITLE_SCALE = { Montserrat: 1, Playfair: 1, Cormorant: 1.14, Anton: 1.12 };
const TITLE_LINE = { Montserrat: 1.06, Playfair: 1.06, Cormorant: 0.98, Anton: 1.02 };

function titleSize(text, base, font) {
  const n = text.length;
  const k = n <= 18 ? 1 : n <= 32 ? 0.86 : n <= 52 ? 0.74 : n <= 80 ? 0.62 : 0.52;
  return Math.round(base * k * (TITLE_SCALE[font] || 1));
}
function bodySize(text, max = 38) {
  const n = text.length;
  if (n <= 90) return max;
  if (n <= 180) return Math.round(max * 0.86);
  return Math.round(max * 0.74);
}
const tokens = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

// título com palavra(s) em destaque e linha manuscrita opcional
function Title({ text, highlight = "", script = "", typo, size, color, accent, center = false, upper }) {
  const font = typo.titulo || "Montserrat";
  const words = clean(text).split(/\s+/).filter(Boolean);
  const hl = new Set(clean(highlight).split(/\s+/).map(tokens).filter(Boolean));
  const caps = upper ?? typo.caixa_alta;
  const scriptFont = typo.manuscrita && typo.manuscrita !== "nenhuma" ? typo.manuscrita : null;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: center ? "center" : "flex-start" }}>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: center ? "center" : "flex-start" }}>
        {words.map((w, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              fontFamily: font,
              fontWeight: TITLE_WEIGHT[font] || 800,
              fontSize: size,
              lineHeight: TITLE_LINE[font] || 1.05,
              letterSpacing: font === "Anton" ? 0.5 : font === "Montserrat" ? -1 : 0,
              textTransform: caps ? "uppercase" : "none",
              color: hl.has(tokens(w)) ? accent : color,
              marginRight: i < words.length - 1 ? Math.round(size * 0.24) : 0
            }}
          >
            {w}
          </div>
        ))}
      </div>
      {script && scriptFont && (
        <div
          style={{
            display: "flex",
            fontFamily: scriptFont,
            fontSize: Math.round(size * (scriptFont === "GreatVibes" ? 1.18 : 0.9)),
            lineHeight: 1,
            color: accent,
            marginTop: Math.round(size * -0.12),
            marginLeft: center ? 0 : Math.round(size * 0.08)
          }}
        >
          {clean(script)}
        </div>
      )}
    </div>
  );
}

function Body({ text, color, size, center = false, maxWidth, opacity = 0.9 }) {
  if (!text) return null;
  return (
    <div style={{ display: "flex", fontFamily: "Montserrat", fontWeight: 400, fontSize: size || bodySize(text), lineHeight: 1.38, color, opacity, textAlign: center ? "center" : "left", justifyContent: center ? "center" : "flex-start", ...(maxWidth ? { maxWidth } : {}) }}>
      {clean(text)}
    </div>
  );
}

function Kicker({ text, theme, center = false }) {
  if (!text) return null;
  const bg = theme.accent;
  return (
    <div style={{ display: "flex", alignSelf: center ? "center" : "flex-start", padding: "9px 22px", borderRadius: 40, background: alpha(bg, theme.dark ? 0.32 : 0.16), color: theme.dark ? legible(theme.bg, ["#FFFFFF"]) : theme.accent, fontFamily: "Montserrat", fontSize: 22, fontWeight: 600, letterSpacing: 2, textTransform: "uppercase", marginBottom: 26 }}>
      {clean(text)}
    </div>
  );
}

function IconBadge({ name, color, bg, size = 72, ring = false }) {
  const src = iconSrc(name, color, 1.6);
  if (!src) return <div style={{ display: "flex", width: size, height: size, borderRadius: size / 2, background: bg, flexShrink: 0 }} />;
  const s = Math.round(size * 0.5);
  return (
    <div style={{ display: "flex", width: size, height: size, borderRadius: size / 2, background: bg, border: ring ? `2px solid ${alpha(color, 0.55)}` : "none", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} width={s} height={s} alt="" style={{ width: s, height: s }} />
    </div>
  );
}

// ---------- marca, contador e bolinhas ----------
function Logo({ logo, onDark, size = 1, plain = false }) {
  if (!logo) return null;
  const h = Math.round(84 * size);
  const w = Math.round((logo.width / logo.height) * h);
  const badge = !plain && onDark && !logo.light;
  const round = logo.width / logo.height > 0.8 && logo.width / logo.height < 1.25;
  return (
    <div style={{ display: "flex", padding: badge ? 14 : 0, borderRadius: round ? 999 : 18, background: badge ? "rgba(255,255,255,0.94)" : "transparent" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={logo.src} width={w} height={h} alt="" style={{ width: w, height: h, objectFit: "contain" }} />
    </div>
  );
}

// assinatura com a foto de perfil do cliente: foto redonda + nome + @ + linha extra (ex.: CRP)
function Signature({ sig, color, ring, scale = 1 }) {
  if (!sig) return null;
  const d = Math.round(96 * scale);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: Math.round(20 * scale) }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={sig.src} width={d} height={d} alt="" style={{ width: d, height: d, borderRadius: d / 2, border: `4px solid ${ring}`, objectFit: "cover" }} />
      <div style={{ display: "flex", flexDirection: "column", color, fontFamily: "Montserrat" }}>
        {sig.nome && <div style={{ display: "flex", fontSize: Math.round(30 * scale), fontWeight: 800, lineHeight: 1.15 }}>{sig.nome}</div>}
        {sig.usuario && <div style={{ display: "flex", fontSize: Math.round(25 * scale), fontWeight: 600, lineHeight: 1.25, opacity: 0.9 }}>{sig.usuario}</div>}
        {sig.linha && <div style={{ display: "flex", fontSize: Math.round(22 * scale), lineHeight: 1.25, opacity: 0.85 }}>{sig.linha}</div>}
      </div>
    </div>
  );
}

function Dots({ index, total, color }) {
  if (total <= 1) return null;
  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      {Array.from({ length: total }, (_, i) => (
        <div key={i} style={{ width: i === index ? 30 : 10, height: 10, borderRadius: 5, marginRight: 9, background: i === index ? color : alpha(color, 0.35), display: "flex" }} />
      ))}
    </div>
  );
}

// topo de toda página: marca (logo ou nome) à esquerda, contador à direita
function Header({ ctx, color, onDark }) {
  const { brand, logo, signature, index, total, typo } = ctx;
  const counter = total > 1 ? `${index + 1}/${total}` : "";
  let left = <div style={{ display: "flex" }} />;
  if (brand === "nome_topo" && signature) {
    left = (
      <div style={{ display: "flex", flexDirection: "column", color }}>
        <div style={{ display: "flex", fontFamily: typo.titulo === "Anton" ? "Montserrat" : typo.titulo, fontWeight: typo.titulo === "Montserrat" ? 600 : 600, fontSize: 30, lineHeight: 1.1 }}>{signature.nome}</div>
        {signature.linha && <div style={{ display: "flex", fontFamily: "Montserrat", fontSize: 18, opacity: 0.8, marginTop: 4 }}>{signature.linha}</div>}
      </div>
    );
  } else if (brand === "logo" && logo) left = <Logo logo={logo} onDark={onDark} size={0.85} />;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", width: "100%" }}>
      {left}
      {counter ? <div style={{ display: "flex", fontFamily: "Montserrat", fontSize: 24, fontWeight: 500, color, opacity: 0.85 }}>{counter}</div> : <div style={{ display: "flex" }} />}
    </div>
  );
}

// base de toda página: assinatura com foto (quando é a marca escolhida) e bolinhas do carrossel
function Footer({ ctx, color, ring, center = false }) {
  const { brand, signature, index, total } = ctx;
  if (brand === "assinatura_rodape" && signature) {
    return (
      <div style={{ display: "flex", width: "100%", alignItems: "center", justifyContent: "space-between" }}>
        <Signature sig={signature} color={color} ring={ring} scale={0.85} />
        <Dots index={index} total={total} color={color} />
      </div>
    );
  }
  return (
    <div style={{ display: "flex", width: "100%", justifyContent: center ? "center" : "flex-start" }}>
      <Dots index={index} total={total} color={color} />
    </div>
  );
}

function Decoration({ kind, theme, W, H }) {
  if (kind === "formas_suaves") {
    return (
      <>
        <div style={{ position: "absolute", right: -260, top: -220, width: 720, height: 720, borderRadius: 360, background: alpha(theme.accent, theme.dark ? 0.12 : 0.07), display: "flex" }} />
        <div style={{ position: "absolute", left: -200, bottom: -260, width: 620, height: 620, borderRadius: 310, background: alpha(theme.accent, theme.dark ? 0.1 : 0.06), display: "flex" }} />
      </>
    );
  }
  if (kind === "linha") {
    return <div style={{ position: "absolute", left: 84, right: 84, top: Math.round(H * 0.5), height: 1, background: alpha(theme.accent, 0.25), display: "flex" }} />;
  }
  return null;
}

// ---------- layouts ----------
function Page({ page, ctx, photo, size }) {
  const W = size.width;
  const H = size.height;
  const pad = 84;
  const story = H > 1500;
  const frame = story ? { top: 200, bottom: 260, left: pad, right: pad } : { top: 72, bottom: 64, left: pad, right: pad };
  const { palette, typo } = ctx;
  const theme = themeFor(palette, page.fundo);
  const center = page.alinhamento === "centro";
  const title = clean(page.titulo);
  const text = clean(page.texto);
  const blocks = (page.blocos || []).filter((b) => b.titulo || b.texto);
  const base = { width: W, height: H, display: "flex", flexDirection: "column", position: "relative", fontFamily: "Montserrat", overflow: "hidden" };
  const inner = { position: "absolute", top: frame.top, bottom: frame.bottom, left: frame.left, right: frame.right, display: "flex", flexDirection: "column", justifyContent: "space-between" };
  const k = page.degrade === "nenhum" ? 0.55 : page.degrade === "medio" ? 0.97 : 0.86;
  const titleEl = (base, opts = {}) => (
    <Title text={title} highlight={page.destaque_titulo} script={page.manuscrito} typo={typo} size={titleSize(title, base, typo.titulo)} color={opts.color || theme.text} accent={opts.accent || theme.accent} center={opts.center ?? center} />
  );

  // foto ocupando a página inteira, texto integrado com degradê só na área do texto
  if (page.layout === "foto_cheia" && photo) {
    const ov = theme.bg;
    const onOv = theme.text;
    const at = page.posicao_texto;
    const shade =
      at === "topo"
        ? `linear-gradient(0deg, ${alpha(ov, 0)} 0%, ${alpha(ov, 0)} 48%, ${alpha(ov, k * 0.6)} 66%, ${alpha(ov, k * 0.92)} 84%, ${alpha(ov, k)} 100%)`
        : at === "centro"
          ? `radial-gradient(circle at 50% 52%, ${alpha(ov, k * 0.85)} 0%, ${alpha(ov, k * 0.55)} 42%, ${alpha(ov, 0)} 78%)`
          : `linear-gradient(180deg, ${alpha(ov, 0)} 0%, ${alpha(ov, 0)} 44%, ${alpha(ov, k * 0.62)} 62%, ${alpha(ov, k * 0.93)} 80%, ${alpha(ov, k)} 100%)`;
    const headerOnPhoto = at !== "topo";
    return (
      <div style={{ ...base, background: "#111111" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo} width={W} height={H} alt="" style={{ position: "absolute", top: 0, left: 0, width: W, height: H }} />
        {headerOnPhoto && <div style={{ position: "absolute", top: 0, left: 0, width: W, height: 260, display: "flex", backgroundImage: "linear-gradient(180deg, rgba(0,0,0,0.30) 0%, rgba(0,0,0,0) 100%)" }} />}
        <div style={{ position: "absolute", top: 0, left: 0, width: W, height: H, display: "flex", backgroundImage: shade }} />
        <div style={inner}>
          <Header ctx={ctx} color={headerOnPhoto ? "#FFFFFF" : onOv} onDark={headerOnPhoto || theme.dark} />
          <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: at === "topo" ? "flex-start" : at === "centro" ? "center" : "flex-end", paddingTop: at === "topo" ? 36 : 0, paddingBottom: 28, alignItems: center ? "center" : "flex-start" }}>
            <Kicker text={page.chamada_superior} theme={theme} center={center} />
            {titleEl(104)}
            {text && <div style={{ display: "flex", marginTop: 24 }}><Body text={text} color={onOv} center={center} size={Math.min(bodySize(text), 34)} maxWidth={860} /></div>}
          </div>
          <Footer ctx={ctx} color={at === "topo" ? "#FFFFFF" : onOv} ring={theme.accent} center={center} />
        </div>
      </div>
    );
  }

  // retrato grande de um lado, informações do outro
  if (page.layout === "foto_lateral" && photo) {
    const box = photoBox("foto_lateral", size);
    const right = page.foto_lado !== "esquerda";
    const fade = right
      ? `linear-gradient(90deg, ${theme.bg} 0%, ${alpha(theme.bg, 0.82)} 10%, ${alpha(theme.bg, 0)} 42%)`
      : `linear-gradient(270deg, ${theme.bg} 0%, ${alpha(theme.bg, 0.82)} 10%, ${alpha(theme.bg, 0)} 42%)`;
    const colW = Math.round(W * 0.56) - pad;
    return (
      <div style={{ ...base, background: theme.bg }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo} width={box.width} height={box.height} alt="" style={{ position: "absolute", top: 0, [right ? "right" : "left"]: 0, width: box.width, height: box.height }} />
        <div style={{ position: "absolute", top: 0, [right ? "right" : "left"]: 0, width: box.width, height: box.height, display: "flex", backgroundImage: fade }} />
        <div style={inner}>
          <Header ctx={ctx} color={theme.text} onDark={theme.dark} />
          <div style={{ display: "flex", flexDirection: "column", width: colW, alignSelf: right ? "flex-start" : "flex-end", flex: 1, justifyContent: "center", paddingTop: 20 }}>
            <Kicker text={page.chamada_superior} theme={theme} />
            {titleEl(78, { center: false })}
            {text && <div style={{ display: "flex", marginTop: 18 }}><Body text={text} color={theme.text} size={Math.min(bodySize(text), 28)} /></div>}
            {blocks.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", marginTop: 26 }}>
                {blocks.slice(0, 6).map((b, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", marginBottom: blocks.length > 4 ? 16 : 24 }}>
                    <IconBadge name={b.icone || "star"} color={theme.accent} bg={theme.soft} size={blocks.length > 4 ? 66 : 76} />
                    <div style={{ display: "flex", flexDirection: "column", marginLeft: 20, flex: 1 }}>
                      {b.titulo && <div style={{ display: "flex", fontSize: 27, fontWeight: 800, color: theme.text, lineHeight: 1.2 }}>{clean(b.titulo)}</div>}
                      {b.texto && <div style={{ display: "flex", fontSize: 21, color: theme.text, opacity: 0.82, lineHeight: 1.3, marginTop: 3 }}>{clean(b.texto)}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <Footer ctx={ctx} color={theme.text} ring={theme.accent} />
        </div>
      </div>
    );
  }

  // foto em cima fundindo no fundo, texto embaixo
  if (page.layout === "foto_topo" && photo) {
    const box = photoBox("foto_topo", size);
    return (
      <div style={{ ...base, background: theme.bg }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo} width={box.width} height={box.height} alt="" style={{ position: "absolute", top: 0, left: 0, width: box.width, height: box.height }} />
        <div style={{ position: "absolute", top: 0, left: 0, width: box.width, height: box.height, display: "flex", backgroundImage: `linear-gradient(180deg, rgba(0,0,0,0.26) 0%, rgba(0,0,0,0) 22%, ${alpha(theme.bg, 0)} 58%, ${alpha(theme.bg, 0.75)} 84%, ${theme.bg} 100%)` }} />
        <div style={inner}>
          <Header ctx={ctx} color="#FFFFFF" onDark />
          <div style={{ display: "flex", flexDirection: "column", alignItems: center ? "center" : "flex-start", paddingBottom: 24 }}>
            <Kicker text={page.chamada_superior} theme={theme} center={center} />
            {titleEl(80)}
            {text && <div style={{ display: "flex", marginTop: 20 }}><Body text={text} color={theme.text} center={center} size={Math.min(bodySize(text), 32)} /></div>}
          </div>
          <Footer ctx={ctx} color={theme.text} ring={theme.accent} center={center} />
        </div>
      </div>
    );
  }

  // texto e CTA em cima, foto humana embaixo subindo em transição suave
  if (page.layout === "foto_base" && photo) {
    const box = photoBox("foto_base", size);
    return (
      <div style={{ ...base, background: theme.bg }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo} width={box.width} height={box.height} alt="" style={{ position: "absolute", bottom: 0, left: 0, width: box.width, height: box.height }} />
        <div style={{ position: "absolute", bottom: 0, left: 0, width: box.width, height: box.height, display: "flex", backgroundImage: `linear-gradient(180deg, ${theme.bg} 0%, ${alpha(theme.bg, 0.6)} 12%, ${alpha(theme.bg, 0)} 34%, rgba(0,0,0,0) 80%, rgba(0,0,0,0.22) 100%)` }} />
        <div style={inner}>
          <Header ctx={ctx} color={theme.text} onDark={theme.dark} />
          <div style={{ display: "flex", flexDirection: "column", flex: 1, alignItems: center ? "center" : "flex-start", paddingTop: 34 }}>
            <Kicker text={page.chamada_superior} theme={theme} center={center} />
            {titleEl(78)}
            {text && <div style={{ display: "flex", marginTop: 18 }}><Body text={text} color={theme.text} center={center} size={Math.min(bodySize(text), 30)} maxWidth={880} /></div>}
            {page.cta && (
              <div style={{ display: "flex", alignItems: "center", marginTop: 30, padding: "16px 34px", borderRadius: 50, border: `2px solid ${alpha(theme.accent, 0.8)}`, background: alpha(theme.bg, 0.6), color: theme.text, fontSize: 26, fontWeight: 600 }}>
                {iconSrc("heart", theme.accent) && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={iconSrc("heart", theme.accent, 2)} width={28} height={28} alt="" style={{ width: 28, height: 28, marginRight: 14 }} />
                )}
                {clean(page.cta)}
              </div>
            )}
          </div>
          <Footer ctx={ctx} color="#FFFFFF" ring={theme.accent} center={center} />
        </div>
      </div>
    );
  }

  // dois cartões: o primeiro conceito (neutro) e o segundo em destaque (ex.: mito x verdade)
  if (page.layout === "comparacao" && blocks.length >= 2) {
    const [a, b] = blocks;
    const strong = palette.fundo_alt && contrast(palette.fundo_alt, theme.bg) > 1.6 ? palette.fundo_alt : mix(theme.accent, "#000000", 0.15);
    const onStrong = legible(strong, ["#FFFFFF", palette.fundo]);
    const labelFont = typo.titulo || "Playfair";
    const card = (blk, strongCard, icon) => (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "62px 60px", borderRadius: 40, background: strongCard ? strong : theme.soft, width: "100%" }}>
        <div style={{ display: "flex", fontFamily: labelFont, fontWeight: TITLE_WEIGHT[labelFont] || 800, fontSize: titleSize(clean(blk.titulo), 104, labelFont), letterSpacing: 1, textTransform: "uppercase", color: strongCard ? onStrong : theme.text, lineHeight: 1 }}>{clean(blk.titulo)}</div>
        <div style={{ display: "flex", alignItems: "center", marginTop: 26, width: "100%" }}>
          <IconBadge name={blk.icone || icon} color={strongCard ? onStrong : theme.text} bg="transparent" size={84} ring />
          <div style={{ display: "flex", marginLeft: 30, flex: 1, fontSize: bodySize(clean(blk.texto), 35), lineHeight: 1.35, color: strongCard ? onStrong : theme.text }}>{clean(blk.texto)}</div>
        </div>
      </div>
    );
    return (
      <div style={{ ...base, background: theme.bg }}>
        <Decoration kind={page.decoracao} theme={theme} W={W} H={H} />
        <div style={inner}>
          <Header ctx={ctx} color={theme.text} onDark={theme.dark} />
          <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center", alignItems: "center", paddingTop: 10 }}>
            {(page.chamada_superior || title) && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 30 }}>
                <Kicker text={page.chamada_superior} theme={theme} center />
                {title && titleEl(54, { center: true })}
              </div>
            )}
            {card(a, false, "x")}
            <div style={{ display: "flex", width: "70%", height: 2, background: alpha(theme.accent, 0.4), margin: "40px 0" }} />
            {card(b, true, "check")}
          </div>
          <Footer ctx={ctx} color={theme.text} ring={theme.accent} />
        </div>
      </div>
    );
  }

  // título e grade de ícones em duas colunas
  if (page.layout === "grade_icones" && blocks.length >= 2) {
    const cols = [blocks.filter((_, i) => i % 2 === 0), blocks.filter((_, i) => i % 2 === 1)];
    const rows = Math.ceil(blocks.length / 2);
    const cell = (b, i) => (
      <div key={i} style={{ display: "flex", flexDirection: "column", paddingBottom: 30, marginBottom: 30, borderBottom: i < (rows - 1) * 2 ? `1px solid ${alpha(theme.text, 0.12)}` : "none" }}>
        <IconBadge name={b.icone || "star"} color={theme.accent} bg={theme.soft} size={rows > 2 ? 88 : 100} />
        {b.titulo && <div style={{ display: "flex", marginTop: 18, fontSize: 31, fontWeight: 800, color: theme.text, lineHeight: 1.15 }}>{clean(b.titulo)}</div>}
        {b.texto && <div style={{ display: "flex", marginTop: 8, fontSize: 23, color: theme.text, opacity: 0.8, lineHeight: 1.32 }}>{clean(b.texto)}</div>}
      </div>
    );
    return (
      <div style={{ ...base, background: theme.bg }}>
        <Decoration kind={page.decoracao} theme={theme} W={W} H={H} />
        <div style={inner}>
          <Header ctx={ctx} color={theme.text} onDark={theme.dark} />
          <div style={{ display: "flex", flexDirection: "column", flex: 1, paddingTop: 34 }}>
            <Kicker text={page.chamada_superior} theme={theme} />
            {titleEl(84, { center: false })}
            {text && <div style={{ display: "flex", marginTop: 14 }}><Body text={text} color={theme.text} size={28} /></div>}
            <div style={{ display: "flex", flex: 1, alignItems: "center" }}>
              <div style={{ display: "flex", width: "100%" }}>
                <div style={{ display: "flex", flexDirection: "column", flex: 1, paddingRight: 38 }}>{cols[0].map((b, j) => cell(b, j * 2))}</div>
                <div style={{ display: "flex", width: 1, background: alpha(theme.text, 0.14) }} />
                <div style={{ display: "flex", flexDirection: "column", flex: 1, paddingLeft: 38 }}>{cols[1].map((b, j) => cell(b, j * 2 + 1))}</div>
              </div>
            </div>
          </div>
          <Footer ctx={ctx} color={theme.text} ring={theme.accent} />
        </div>
      </div>
    );
  }

  // título e lista vertical com ícones
  if (page.layout === "lista_icones" && blocks.length >= 2) {
    return (
      <div style={{ ...base, background: theme.bg }}>
        <Decoration kind={page.decoracao} theme={theme} W={W} H={H} />
        <div style={inner}>
          <Header ctx={ctx} color={theme.text} onDark={theme.dark} />
          <div style={{ display: "flex", flexDirection: "column", flex: 1, paddingTop: 34 }}>
            <Kicker text={page.chamada_superior} theme={theme} />
            {titleEl(84, { center: false })}
            {text && <div style={{ display: "flex", marginTop: 14 }}><Body text={text} color={theme.text} size={28} /></div>}
            <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center" }}>
              {blocks.map((b, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", paddingBottom: 24, marginBottom: 24, borderBottom: i < blocks.length - 1 ? `1px solid ${alpha(theme.text, 0.1)}` : "none" }}>
                  <IconBadge name={b.icone || "check"} color={theme.accent} bg={theme.soft} size={blocks.length > 4 ? 80 : 94} />
                  <div style={{ display: "flex", flexDirection: "column", marginLeft: 30, flex: 1 }}>
                    {b.titulo && <div style={{ display: "flex", fontSize: 32, fontWeight: 800, color: theme.text, lineHeight: 1.2 }}>{clean(b.titulo)}</div>}
                    {b.texto && <div style={{ display: "flex", fontSize: 24, color: theme.text, opacity: 0.8, lineHeight: 1.32, marginTop: 4 }}>{clean(b.texto)}</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <Footer ctx={ctx} color={theme.text} ring={theme.accent} />
        </div>
      </div>
    );
  }

  // dois conjuntos que se cruzam
  if (page.layout === "diagrama" && blocks.length >= 2) {
    const [a, b] = blocks;
    const D = 580;
    const boxW = W - pad * 2;
    const offset = Math.round(boxW - D);
    const label = (blk, x, w) => (
      <div style={{ position: "absolute", left: x, top: Math.round(D * 0.3), width: w, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
        <div style={{ display: "flex", fontSize: 31, fontWeight: 800, color: theme.text, textAlign: "center", justifyContent: "center", lineHeight: 1.2 }}>{clean(blk.titulo)}</div>
        {blk.texto && <div style={{ display: "flex", marginTop: 12, fontSize: 22, color: theme.text, opacity: 0.8, textAlign: "center", justifyContent: "center", lineHeight: 1.3 }}>{clean(blk.texto)}</div>}
      </div>
    );
    return (
      <div style={{ ...base, background: theme.bg }}>
        <Decoration kind={page.decoracao} theme={theme} W={W} H={H} />
        <div style={inner}>
          <Header ctx={ctx} color={theme.text} onDark={theme.dark} />
          <div style={{ display: "flex", flexDirection: "column", flex: 1, paddingTop: 34 }}>
            <Kicker text={page.chamada_superior} theme={theme} />
            {titleEl(84, { center: false })}
            {text && <div style={{ display: "flex", marginTop: 16 }}><Body text={text} color={theme.text} size={32} /></div>}
            <div style={{ display: "flex", flex: 1, alignItems: "center" }}>
              <div style={{ display: "flex", position: "relative", width: boxW, height: D }}>
                <div style={{ position: "absolute", left: 0, top: 0, width: D, height: D, borderRadius: D / 2, background: alpha(theme.accent, theme.dark ? 0.22 : 0.13), display: "flex" }} />
                <div style={{ position: "absolute", left: offset, top: 0, width: D, height: D, borderRadius: D / 2, background: alpha(theme.accent, theme.dark ? 0.32 : 0.24), display: "flex" }} />
                {label(a, 24, offset - 48)}
                {label(b, D + 24, offset - 48)}
                {page.centro && (
                  <div style={{ position: "absolute", left: offset, width: D - offset, top: Math.round(D * 0.42), display: "flex", justifyContent: "center", textAlign: "center", fontSize: 27, fontWeight: 800, color: theme.dark ? "#FFFFFF" : mix(theme.accent, "#000000", 0.25), lineHeight: 1.2 }}>
                    {clean(page.centro)}
                  </div>
                )}
              </div>
            </div>
          </div>
          <Footer ctx={ctx} color={theme.text} ring={theme.accent} />
        </div>
      </div>
    );
  }

  // checklist com foto discreta no canto (opcional)
  if (page.layout === "checklist" && blocks.length >= 2) {
    const box = photoBox("checklist", size);
    return (
      <div style={{ ...base, background: theme.bg }}>
        {photo && (
          <div style={{ position: "absolute", right: 0, bottom: 0, width: box.width, height: box.height, display: "flex" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo} width={box.width} height={box.height} alt="" style={{ position: "absolute", left: 0, top: 0, width: box.width, height: box.height }} />
            <div style={{ position: "absolute", left: 0, top: 0, width: box.width, height: box.height, display: "flex", backgroundImage: `linear-gradient(90deg, ${theme.bg} 0%, ${alpha(theme.bg, 0)} 28%)` }} />
            <div style={{ position: "absolute", left: 0, top: 0, width: box.width, height: box.height, display: "flex", backgroundImage: `linear-gradient(180deg, ${theme.bg} 0%, ${alpha(theme.bg, 0)} 24%)` }} />
          </div>
        )}
        <Decoration kind={photo ? "nenhuma" : page.decoracao} theme={theme} W={W} H={H} />
        <div style={inner}>
          <Header ctx={ctx} color={theme.text} onDark={theme.dark} />
          <div style={{ display: "flex", flexDirection: "column", flex: 1, paddingTop: 34 }}>
            <Kicker text={page.chamada_superior} theme={theme} />
            {titleEl(88, { center: false })}
            {text && <div style={{ display: "flex", marginTop: 22 }}><Body text={text} color={theme.text} size={30} maxWidth={photo ? 660 : 900} /></div>}
            <div style={{ display: "flex", flexDirection: "column", marginTop: 40 }}>
              {blocks.map((b, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", marginBottom: 26 }}>
                  <IconBadge name="check" color={theme.dark ? "#FFFFFF" : theme.accent} bg={alpha(theme.accent, theme.dark ? 0.35 : 0.16)} size={62} />
                  <div style={{ display: "flex", marginLeft: 24, fontSize: 31, color: theme.text, maxWidth: photo ? 520 : 820, lineHeight: 1.25 }}>{clean(b.titulo || b.texto)}</div>
                </div>
              ))}
            </div>
          </div>
          <Footer ctx={ctx} color={photo ? "#FFFFFF" : theme.text} ring={theme.accent} />
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
    const onAccent = legible(theme.accent, [theme.bg, "#FFFFFF"]);
    return (
      <div style={{ ...base, background: theme.bg }}>
        <Decoration kind={page.decoracao} theme={theme} W={W} H={H} />
        <div style={inner}>
          <Header ctx={ctx} color={theme.text} onDark={theme.dark} />
          <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center" }}>
            <Kicker text={page.chamada_superior} theme={theme} />
            {titleEl(76, { center: false })}
            <div style={{ display: "flex", flexDirection: "column", marginTop: 40 }}>
              {items.map((item, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", marginBottom: 24 }}>
                  <div style={{ display: "flex", width: 62, height: 62, borderRadius: 31, background: theme.accent, color: onAccent, fontSize: 28, fontWeight: 800, alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{String(i + 1)}</div>
                  <div style={{ display: "flex", marginLeft: 26, fontSize: items.length > 4 ? 30 : 34, lineHeight: 1.3, color: theme.text, flex: 1 }}>{item}</div>
                </div>
              ))}
            </div>
          </div>
          <Footer ctx={ctx} color={theme.text} ring={theme.accent} />
        </div>
      </div>
    );
  }

  if (page.layout === "citacao") {
    return (
      <div style={{ ...base, background: theme.bg }}>
        <Decoration kind={page.decoracao} theme={theme} W={W} H={H} />
        <div style={inner}>
          <Header ctx={ctx} color={theme.text} onDark={theme.dark} />
          <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center", alignItems: center ? "center" : "flex-start" }}>
            <div style={{ display: "flex", fontFamily: "Playfair", fontWeight: 800, fontSize: 220, lineHeight: 0.8, color: theme.accent, height: 150 }}>“</div>
            {titleEl(76)}
            {text && <div style={{ display: "flex", marginTop: 34, fontSize: 30, fontWeight: 600, color: theme.accent }}>{text}</div>}
          </div>
          <Footer ctx={ctx} color={theme.text} ring={theme.accent} center={center} />
        </div>
      </div>
    );
  }

  if (page.layout === "cta") {
    const t2 = themeFor(palette, page.fundo === "principal" ? "alternativo" : page.fundo);
    const btnBg = t2.dark ? palette.fundo : t2.accent;
    const btnText = legible(btnBg, [palette.fundo_alt, palette.texto, "#FFFFFF"]);
    return (
      <div style={{ ...base, backgroundColor: t2.bg, backgroundImage: `radial-gradient(circle at 50% 0%, ${alpha("#FFFFFF", 0.1)} 0%, rgba(255,255,255,0) 55%)` }}>
        <div style={inner}>
          <Header ctx={ctx} color={t2.text} onDark={t2.dark} />
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
            <Title text={title} highlight={page.destaque_titulo} script={page.manuscrito} typo={typo} size={titleSize(title, 88, typo.titulo)} color={t2.text} accent={t2.accent} center />
            {text && <div style={{ display: "flex", marginTop: 26 }}><Body text={text} color={t2.text} center size={Math.min(bodySize(text), 34)} maxWidth={860} /></div>}
            {page.cta && <div style={{ display: "flex", marginTop: 48, padding: "22px 54px", borderRadius: 60, background: btnBg, color: btnText, fontSize: 32, fontWeight: 800 }}>{clean(page.cta)}</div>}
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            {ctx.brand === "logo" && ctx.logo && <div style={{ display: "flex", marginBottom: 24 }}><Logo logo={ctx.logo} onDark={t2.dark} size={1.1} /></div>}
            <Footer ctx={ctx} color={t2.text} ring={t2.accent} center />
          </div>
        </div>
      </div>
    );
  }

  if (page.layout === "oferta" && photo) {
    const box = photoBox("oferta", size);
    const fundo = theme.bg;
    const destaque = palette.destaque;
    const mega = clean(page.palavra_destaque || title).toUpperCase();
    const script = clean(page.assinatura);
    const lead = clean(page.linha_de_apoio);
    const items = clean(page.itens)
      .split(/\n+/)
      .map((l) => l.replace(/^\s*(\d+[.)]|[-*•])\s+/, "").trim())
      .filter(Boolean)
      .slice(0, 5);
    const megaColor = legible(fundo, [destaque], 3);
    const leadColor = legible(fundo, [palette.texto_sobre_foto]);
    const megaSize = Math.round(Math.min(330, (W - pad * 2) / Math.max(3, mega.length * 0.56)));
    const blockTop = Math.round(H * (story ? 0.47 : 0.44));
    const pct = (v) => Math.round((box.height / H) * 100 * v);
    return (
      <div style={{ ...base, backgroundColor: fundo }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo} width={box.width} height={box.height} alt="" style={{ position: "absolute", top: 0, left: 0, width: box.width, height: box.height }} />
        <div style={{ position: "absolute", top: 0, left: 0, width: W, height: H, display: "flex", backgroundImage: `linear-gradient(180deg, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0) 14%, ${alpha(fundo, 0)} ${pct(0.55)}%, ${alpha(fundo, 0.82)} ${pct(0.86)}%, ${fundo} ${pct(1)}%, ${mix(fundo, "#000000", 0.18)} 100%)` }} />
        <div style={{ position: "absolute", right: 0, bottom: 0, width: 520, height: 560, display: "flex", overflow: "hidden" }}>
          {Array.from({ length: 22 }, (_, i) => (
            <div key={i} style={{ position: "absolute", left: -260 + i * 46, top: -120, width: 14, height: 900, background: alpha(destaque, 0.13), transform: "rotate(35deg)", display: "flex" }} />
          ))}
        </div>
        <div style={{ position: "absolute", top: frame.top, left: pad, right: pad, display: "flex" }}>
          <Header ctx={{ ...ctx, brand: ctx.brand === "logo" ? "nenhuma" : ctx.brand }} color="#FFFFFF" onDark />
        </div>
        <div style={{ position: "absolute", left: 0, top: blockTop, width: W, display: "flex", flexDirection: "column", alignItems: "center", padding: `0 ${pad}px` }}>
          {lead && <div style={{ display: "flex", fontSize: lead.length > 48 ? 40 : 46, fontWeight: 800, lineHeight: 1.12, color: leadColor, textAlign: "center", justifyContent: "center", maxWidth: 880 }}>{lead}</div>}
          <div style={{ display: "flex", position: "relative", flexDirection: "column", alignItems: "center", marginTop: lead ? 6 : 0 }}>
            <div style={{ display: "flex", fontFamily: "Anton", fontSize: megaSize, lineHeight: 0.92, letterSpacing: -2, color: megaColor }}>{mega}</div>
            {script && (
              <div style={{ position: "absolute", left: 0, right: 0, top: Math.round(megaSize * 0.3), display: "flex", justifyContent: "center", fontFamily: typo.manuscrita === "GreatVibes" ? "GreatVibes" : "Pacifico", fontSize: Math.round(Math.min(104, megaSize * 0.36)), color: "#FFFFFF", textShadow: `0 4px 0 ${fundo}, 3px 0 0 ${fundo}, -3px 0 0 ${fundo}, 0 -3px 0 ${fundo}, 0 8px 18px rgba(0,0,0,0.35)` }}>{script}</div>
            )}
          </div>
          {items.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", alignSelf: "flex-start", marginTop: 14, marginLeft: Math.max(0, Math.round((W - pad * 2 - mega.length * megaSize * 0.56) / 2)) }}>
              {items.map((it, i) => (
                <div key={i} style={{ display: "flex", fontFamily: "Anton", fontSize: items.length > 3 ? 36 : 42, lineHeight: 1.1, color: "#FFFFFF", letterSpacing: 0.5 }}>{it.toUpperCase()}</div>
              ))}
            </div>
          )}
        </div>
        <div style={{ position: "absolute", left: 0, bottom: story ? 250 : 46, width: W, display: "flex", flexDirection: "column", alignItems: "center" }}>
          {ctx.brand === "assinatura_rodape" && ctx.signature ? (
            <Signature sig={ctx.signature} color="#FFFFFF" ring={destaque} />
          ) : ctx.logo ? (
            <Logo logo={ctx.logo} onDark={isDark(fundo)} size={1.35} plain />
          ) : null}
          <div style={{ display: "flex", marginTop: 16 }}><Dots index={ctx.index} total={ctx.total} color="#FFFFFF" /></div>
        </div>
      </div>
    );
  }

  // "tipografico" (e qualquer layout sem o material de que precisa): tipografia protagonista
  return (
    <div style={{ ...base, background: theme.bg }}>
      <Decoration kind={page.decoracao} theme={theme} W={W} H={H} />
      <div style={inner}>
        <Header ctx={ctx} color={theme.text} onDark={theme.dark} />
        <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center", alignItems: center ? "center" : "flex-start" }}>
          <Kicker text={page.chamada_superior} theme={theme} center={center} />
          {titleEl(118)}
          {(text || blocks.length > 0) && <div style={{ display: "flex", width: 90, height: 3, background: theme.accent, margin: "36px 0 30px", opacity: 0.8 }} />}
          {text && <Body text={text} color={theme.text} center={center} size={Math.min(bodySize(text), 36)} maxWidth={880} />}
          {!text && blocks.length > 0 && <Body text={blocks.map((b) => b.titulo).join(". ")} color={theme.text} center={center} size={32} maxWidth={880} />}
        </div>
        <Footer ctx={ctx} color={theme.text} ring={theme.accent} center={center} />
      </div>
    </div>
  );
}

// rodapé pequeno por cima da página (ex.: "Válido até 31/10")
function WithFootnote({ children, note, size, palette }) {
  if (!note) return children;
  const story = size.height > 1500;
  return (
    <div style={{ width: size.width, height: size.height, display: "flex", position: "relative" }}>
      {children}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: story ? 230 : 18, display: "flex", justifyContent: "center", fontSize: 18, color: legible(palette.fundo, [palette.texto]), opacity: 0.75 }}>{note}</div>
    </div>
  );
}

// Compatibilidade com projetos antigos (estilo único, tipografia como texto): vira o formato novo
function normalizePlan(plan) {
  const typoName = typeof plan.tipografia === "string" ? plan.tipografia : null;
  const tipografia = typoName
    ? { titulo: typoName === "elegante" ? "Playfair" : typoName === "impacto" ? "Anton" : "Montserrat", manuscrita: "Pacifico", caixa_alta: !!plan.estilo?.caixa_alta }
    : plan.tipografia;
  const paleta = { fundo_alt: plan.paleta.fundo_alt || mix(plan.paleta.fundo, "#000000", 0.6), ...plan.paleta };
  const paginas = plan.paginas.map((p) => ({
    fundo: "principal",
    decoracao: "nenhuma",
    alinhamento: plan.estilo?.alinhamento || "esquerda",
    posicao_texto: plan.estilo?.posicao_texto || "embaixo",
    degrade: plan.estilo?.degrade === "forte" ? "medio" : plan.estilo?.degrade || "suave",
    blocos: [],
    destaque_titulo: "",
    manuscrito: "",
    ...p
  }));
  return { ...plan, tipografia, paleta, paginas };
}

// plan: { paleta, tipografia, paginas } (lib/art/plan.js); photos: [dataUrl|null] por página (já recortadas)
// logo: { src, width, height, light } | null; signature: { src, nome, usuario, linha } | null
// brand: "logo" | "assinatura_rodape" | "nome_topo" (como a marca aparece); only: índices a desenhar (opcional)
// Devolve um Buffer PNG por página (undefined nas páginas fora de "only").
export async function renderArt({ plan, design, format, photos, logo = null, signature = null, brand, only = null }) {
  const p = normalizePlan(plan || design);
  const size = sizeFor(format);
  const fontList = await fonts();
  const mark = brand || (signature ? "assinatura_rodape" : logo ? "logo" : "nenhuma");
  const out = [];
  for (let i = 0; i < p.paginas.length; i++) {
    if (only && !only.includes(i)) {
      out.push(undefined);
      continue;
    }
    const page = p.paginas[i];
    const ctx = { palette: p.paleta, typo: p.tipografia, brand: mark, logo, signature, index: i, total: p.paginas.length };
    const element = (
      <WithFootnote note={clean(page.rodape)} size={size} palette={p.paleta}>
        <Page page={page} ctx={ctx} photo={photos[i] || null} size={size} />
      </WithFootnote>
    );
    const res = new ImageResponse(element, { width: size.width, height: size.height, fonts: fontList });
    out.push(Buffer.from(await res.arrayBuffer()));
  }
  return out;
}
