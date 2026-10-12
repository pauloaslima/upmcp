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
  if (layout === "oferta") return { width: size.width, height: Math.round(size.height * 0.64) };
  return null;
}

let fontsCache = null;
async function fonts() {
  if (fontsCache) return fontsCache;
  const dir = path.join(process.cwd(), "lib", "fonts");
  const load = (file) => readFile(path.join(dir, file));
  const [m4, m6, m8, p6, p8, an, pa] = await Promise.all([
    load("montserrat-latin-400-normal.woff"),
    load("montserrat-latin-600-normal.woff"),
    load("montserrat-latin-800-normal.woff"),
    load("playfair-display-latin-600-normal.woff"),
    load("playfair-display-latin-800-normal.woff"),
    load("anton-latin-400-normal.woff"),
    load("pacifico-latin-400-normal.woff")
  ]);
  fontsCache = [
    { name: "Montserrat", data: m4, weight: 400, style: "normal" },
    { name: "Montserrat", data: m6, weight: 600, style: "normal" },
    { name: "Montserrat", data: m8, weight: 800, style: "normal" },
    { name: "Playfair", data: p6, weight: 600, style: "normal" },
    { name: "Playfair", data: p8, weight: 800, style: "normal" },
    { name: "Anton", data: an, weight: 400, style: "normal" },
    { name: "Pacifico", data: pa, weight: 400, style: "normal" }
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
function Logo({ logo, onDark, size = 1, plain = false }) {
  if (!logo) return null;
  const h = Math.round(84 * size);
  const w = Math.round((logo.width / logo.height) * h);
  const badge = !plain && onDark && !logo.light;
  // logo redonda ou quadrada ganha selo redondo; a comprida, selo arredondado
  const round = logo.width / logo.height > 0.8 && logo.width / logo.height < 1.25;
  return (
    <div style={{ display: "flex", padding: badge ? 14 : 0, borderRadius: round ? 999 : 18, background: badge ? "rgba(255,255,255,0.94)" : "transparent" }}>
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

function Kicker({ text, background, color, center = false }) {
  if (!text) return null;
  return (
    <div style={{ display: "flex", alignSelf: center ? "center" : "flex-start", padding: "10px 22px", borderRadius: 40, background, color, fontSize: 26, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", marginBottom: 26 }}>
      {text}
    </div>
  );
}

// ---------- layouts ----------
function Page({ page, index, total, palette, typo, photo, logo, size, style = {} }) {
  const W = size.width;
  const H = size.height;
  const pad = 84;
  // Story: área segura do Instagram (topo e base ficam livres para a interface)
  const story = H > 1500;
  const frame = story ? `200px ${pad}px 280px` : pad;
  const headFont = typo === "elegante" ? "Playfair" : typo === "impacto" ? "Anton" : "Montserrat";
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
  const center = style.alinhamento === "centro";
  const titleCase = style.caixa_alta ? "uppercase" : "none";
  const centered = center ? { textAlign: "center", justifyContent: "center" } : {};
  const column = center ? { alignItems: "center" } : {};
  const strength = style.degrade === "forte" ? 1.15 : style.degrade === "suave" ? 0.7 : 1;
  const a = (v) => Math.min(1, v * strength);
  const deep = mix(fundo, fundoDark ? "#000000" : destaque, fundoDark ? 0.35 : 0.1);
  const surface = {
    backgroundColor: fundo,
    backgroundImage: `radial-gradient(circle at 88% 8%, ${alpha(destaque, 0.3)} 0%, ${alpha(destaque, 0)} 48%), linear-gradient(165deg, ${fundo} 0%, ${fundo} 45%, ${deep} 100%)`
  };

  const base = { width: W, height: H, display: "flex", flexDirection: "column", position: "relative", fontFamily: "Montserrat", overflow: "hidden" };
  const top = (color, onDark) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", width: "100%" }}>
      <Logo logo={logo} onDark={onDark} />
      {counter ? <div style={{ display: "flex", fontSize: 26, fontWeight: 600, color, opacity: 0.85 }}>{counter}</div> : <div style={{ display: "flex" }} />}
    </div>
  );

  if (page.layout === "foto_cheia" && photo) {
    const onPhoto = readable(palette.texto_sobre_foto, fundo);
    const textAt = style.posicao_texto || "embaixo";
    const photoShade =
      textAt === "topo"
        ? `linear-gradient(0deg, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0) 22%, ${alpha(fundo, 0)} 42%, ${alpha(fundo, a(0.55))} 62%, ${alpha(fundo, a(0.9))} 84%, ${alpha(fundo, a(0.97))} 100%)`
        : textAt === "centro"
          ? `radial-gradient(circle at 50% 50%, ${alpha(fundo, a(0.78))} 0%, ${alpha(fundo, a(0.55))} 45%, ${alpha(fundo, a(0.25))} 100%)`
          : `linear-gradient(180deg, rgba(0,0,0,0.32) 0%, rgba(0,0,0,0) 20%, ${alpha(fundo, 0)} 40%, ${alpha(fundo, a(0.55))} 62%, ${alpha(fundo, a(0.9))} 82%, ${alpha(fundo, a(0.97))} 100%)`;
    return (
      <div style={{ ...base, background: "#111" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo} width={W} height={H} alt="" style={{ position: "absolute", top: 0, left: 0, width: W, height: H }} />
        <div style={{ position: "absolute", top: 0, left: 0, width: W, height: H, display: "flex", backgroundImage: photoShade }} />
        <div style={{ position: "absolute", top: 0, left: 0, width: W, height: H, display: "flex", backgroundImage: `linear-gradient(135deg, ${alpha(destaque, a(0.42))} 0%, ${alpha(destaque, 0)} 42%)` }} />
        <div style={{ position: "absolute", top: 0, left: 0, width: W, height: H, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: frame }}>
          {top(onPhoto, true)}
          <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: textAt === "topo" ? "flex-start" : textAt === "centro" ? "center" : "flex-end", paddingTop: textAt === "topo" ? 40 : 0, ...column }}>
            <Kicker text={kicker} background={destaque} color={onDestaque} center={center} />
            <div style={{ display: "flex", fontFamily: headFont, fontWeight: 800, textTransform: titleCase, fontSize: titleSize(title, 92), lineHeight: 1.08, color: onPhoto, ...centered }}>{title}</div>
            {text && <div style={{ display: "flex", marginTop: 26, fontSize: bodySize(text), lineHeight: 1.35, color: onPhoto, opacity: 0.94, ...centered }}>{text}</div>}
          </div>
          <div style={{ display: "flex", marginTop: 40, justifyContent: center ? "center" : "flex-start" }}>
            <Dots index={index} total={total} color={onPhoto} />
          </div>
        </div>
      </div>
    );
  }

  if (page.layout === "oferta" && photo) {
    const box = photoBox("oferta", size);
    const mega = clean(page.palavra_destaque || title).toUpperCase();
    const script = clean(page.assinatura);
    const lead = clean(page.linha_de_apoio);
    const items = clean(page.itens)
      .split(/\n+/)
      .map((l) => l.replace(/^\s*(\d+[.)]|[-*•])\s+/, "").trim())
      .filter(Boolean)
      .slice(0, 5);
    const megaColor = readable(destaque, fundo);
    const leadColor = readable(palette.texto_sobre_foto, fundo);
    // a palavra gigante ocupa a largura toda
    const megaSize = Math.round(Math.min(330, (W - pad * 2) / Math.max(3, mega.length * 0.56)));
    const blockTop = Math.round(H * (story ? 0.47 : 0.44));
    return (
      <div style={{ ...base, backgroundColor: fundo }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo} width={box.width} height={box.height} alt="" style={{ position: "absolute", top: 0, left: 0, width: box.width, height: box.height }} />
        <div style={{ position: "absolute", top: 0, left: 0, width: W, height: H, display: "flex", backgroundImage: `linear-gradient(180deg, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0) 14%, ${alpha(fundo, 0)} ${Math.round(box.height / H * 100 * 0.55)}%, ${alpha(fundo, a(0.82))} ${Math.round(box.height / H * 100 * 0.86)}%, ${fundo} ${Math.round(box.height / H * 100)}%, ${mix(fundo, "#000000", 0.18)} 100%)` }} />
        {/* listras diagonais decorativas no canto */}
        <div style={{ position: "absolute", right: 0, bottom: 0, width: 520, height: 560, display: "flex", overflow: "hidden" }}>
          {Array.from({ length: 22 }, (_, i) => (
            <div key={i} style={{ position: "absolute", left: -260 + i * 46, top: -120, width: 14, height: 900, background: alpha(destaque, 0.13), transform: "rotate(35deg)", display: "flex" }} />
          ))}
        </div>
        {counter ? <div style={{ position: "absolute", top: story ? 200 : pad, right: pad, display: "flex", fontSize: 26, fontWeight: 600, color: "#FFFFFF", opacity: 0.85 }}>{counter}</div> : null}
        <div style={{ position: "absolute", left: 0, top: blockTop, width: W, display: "flex", flexDirection: "column", alignItems: "center", padding: `0 ${pad}px` }}>
          {lead && (
            <div style={{ display: "flex", fontSize: lead.length > 48 ? 40 : 46, fontWeight: 800, lineHeight: 1.12, color: leadColor, textAlign: "center", justifyContent: "center", maxWidth: 880, textShadow: "0 3px 14px rgba(0,0,0,0.35)" }}>{lead}</div>
          )}
          <div style={{ display: "flex", position: "relative", flexDirection: "column", alignItems: "center", marginTop: lead ? 6 : 0 }}>
            <div style={{ display: "flex", fontFamily: "Anton", fontSize: megaSize, lineHeight: 0.92, letterSpacing: -2, color: megaColor }}>{mega}</div>
            {script && (
              <div style={{ position: "absolute", left: 0, right: 0, top: Math.round(megaSize * 0.3), display: "flex", justifyContent: "center", fontFamily: "Pacifico", fontSize: Math.round(Math.min(104, megaSize * 0.36)), color: "#FFFFFF", textShadow: `0 4px 0 ${fundo}, 3px 0 0 ${fundo}, -3px 0 0 ${fundo}, 0 -3px 0 ${fundo}, 0 8px 18px rgba(0,0,0,0.35)` }}>{script}</div>
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
        <div style={{ position: "absolute", left: 0, bottom: story ? 250 : 46, width: W, display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
          <Logo logo={logo} onDark={luminance(fundo) < 0.35} size={1.35} plain />
          <Dots index={index} total={total} color="#FFFFFF" />
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
        <div style={{ position: "absolute", top: 0, left: 0, width: box.width, height: box.height, display: "flex", backgroundImage: `linear-gradient(180deg, rgba(0,0,0,0.30) 0%, rgba(0,0,0,0) 26%, ${alpha(fundo, 0)} 55%, ${alpha(fundo, 0.7)} 82%, ${fundo} 100%)` }} />
        <div style={{ position: "absolute", top: 0, left: 0, width: box.width, height: box.height, display: "flex", backgroundImage: `linear-gradient(120deg, ${alpha(destaque, 0.32)} 0%, ${alpha(destaque, 0)} 38%)` }} />
        <div style={{ position: "absolute", top: 0, left: 0, width: W, display: "flex", padding: frame, paddingBottom: 0 }}>{top("#FFFFFF", true)}</div>
        <div style={{ display: "flex", flexDirection: "column", flex: 1, padding: `${pad - 20}px ${pad}px ${pad - 10}px`, justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <Kicker text={kicker} background={destaque} color={onDestaque} center={center} />
            <div style={{ display: "flex", fontFamily: headFont, fontWeight: 800, textTransform: titleCase, fontSize: titleSize(title, 78), lineHeight: 1.08, color: accentOnFundo, ...centered }}>{title}</div>
            {text && <div style={{ display: "flex", marginTop: 22, fontSize: Math.min(bodySize(text), 36), lineHeight: 1.35, color: onFundo, ...centered }}>{text}</div>}
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
      <div style={{ ...base, ...surface, padding: frame, justifyContent: "space-between" }}>
        {top(onFundo, fundoDark)}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <Kicker text={kicker} background={destaque} color={onDestaque} center={center} />
          <div style={{ display: "flex", fontFamily: headFont, fontWeight: 800, textTransform: titleCase, fontSize: titleSize(title, 76), lineHeight: 1.08, color: accentOnFundo, marginBottom: 40 }}>{title}</div>
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
      <div style={{ ...base, ...surface, padding: frame, justifyContent: "space-between" }}>
        {top(onFundo, fundoDark)}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontFamily: "Playfair", fontWeight: 800, fontSize: 220, lineHeight: 0.8, color: accentOnFundo, height: 150 }}>“</div>
          <div style={{ display: "flex", fontFamily: headFont, fontWeight: 800, textTransform: titleCase, fontSize: titleSize(title, 76), lineHeight: 1.15, color: onFundo }}>{title}</div>
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
      <div style={{ ...base, backgroundColor: bg, backgroundImage: `radial-gradient(circle at 50% 0%, ${alpha("#FFFFFF", 0.18)} 0%, rgba(255,255,255,0) 55%), linear-gradient(160deg, ${bg} 0%, ${mix(bg, "#000000", 0.28)} 100%)`, padding: frame, justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", width: "100%", justifyContent: "flex-end" }}>
          {counter ? <div style={{ display: "flex", fontSize: 26, fontWeight: 600, color: onBg, opacity: 0.85 }}>{counter}</div> : <div style={{ display: "flex" }} />}
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
          <div style={{ display: "flex", fontFamily: headFont, fontWeight: 800, textTransform: titleCase, fontSize: titleSize(title, 84), lineHeight: 1.1, color: onBg, textAlign: "center", justifyContent: "center" }}>{title}</div>
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
      <div style={{ ...base, ...surface }}>
        <div style={{ position: "absolute", right: -220, top: -260, width: 760, height: 760, borderRadius: 380, background: alpha(destaque, 0.16), display: "flex" }} />
        <div style={{ position: "absolute", right: 120, top: 220, width: 220, height: 220, borderRadius: 110, border: `14px solid ${alpha(destaque, 0.35)}`, display: "flex" }} />
        <div style={{ display: "flex", flexDirection: "column", flex: 1, padding: frame, paddingBottom: 40, justifyContent: "space-between" }}>
          {top(onFundo, fundoDark)}
          <div style={{ display: "flex", flexDirection: "column" }}>
            <Kicker text={kicker} background={destaque} color={onDestaque} center={center} />
            <div style={{ display: "flex", fontFamily: headFont, fontWeight: 800, textTransform: titleCase, fontSize: titleSize(title, style.caixa_alta ? 112 : 128), lineHeight: 1.02, color: onFundo, letterSpacing: -1, ...centered }}>{title}</div>
            {text && <div style={{ display: "flex", marginTop: 34, fontSize: Math.max(bodySize(text), 36), lineHeight: 1.35, color: onFundo, opacity: 0.9, ...centered }}>{text}</div>}
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
    <div style={{ ...base, ...surface, padding: frame, justifyContent: "space-between" }}>
      <div style={{ position: "absolute", right: -160, top: -160, width: 520, height: 520, borderRadius: 260, background: alpha(destaque, 0.12), display: "flex" }} />
      <div style={{ position: "absolute", left: -120, bottom: -140, width: 380, height: 380, borderRadius: 190, background: alpha(destaque, 0.08), display: "flex" }} />
      {top(onFundo, fundoDark)}
      <div style={{ display: "flex", flexDirection: "column" }}>
        <Kicker text={kicker} background={destaque} color={onDestaque} center={center} />
        <div style={{ display: "flex", width: 120, height: 12, borderRadius: 6, background: accentOnFundo, marginBottom: 34 }} />
        <div style={{ display: "flex", fontFamily: headFont, fontWeight: 800, textTransform: titleCase, fontSize: titleSize(title, 96), lineHeight: 1.06, color: onFundo, ...centered }}>{title}</div>
        {text && <div style={{ display: "flex", marginTop: 30, fontSize: bodySize(text), lineHeight: 1.38, color: onFundo, opacity: 0.88, ...centered }}>{text}</div>}
      </div>
      <Dots index={index} total={total} color={accentOnFundo} />
    </div>
  );
}

// rodapé pequeno por cima da página (ex.: "*Imagem ilustrativa.")
function WithFootnote({ children, note, size, palette }) {
  if (!note) return children;
  const story = size.height > 1500;
  return (
    <div style={{ width: size.width, height: size.height, display: "flex", position: "relative" }}>
      {children}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: story ? 230 : 16, display: "flex", justifyContent: "center", fontSize: 18, color: readable(palette.texto_sobre_foto, palette.fundo), opacity: 0.75 }}>{note}</div>
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
      <WithFootnote note={clean(page.rodape)} size={size} palette={design.paleta}>
        <Page page={page} index={i} total={design.paginas.length} palette={design.paleta} typo={design.tipografia} photo={photos[i] || null} logo={logo} size={size} style={design.estilo || {}} />
      </WithFootnote>
    );
    const res = new ImageResponse(element, { width: size.width, height: size.height, fonts: fontList });
    out.push(Buffer.from(await res.arrayBuffer()));
  }
  return out;
}
