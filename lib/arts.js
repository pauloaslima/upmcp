// Artes no modo híbrido: a IA gera só a imagem (sem texto) e o sistema escreve por cima o texto
// do redator com as cores, fontes e logo do cliente. Este arquivo serve à tela e ao servidor.

export const ART_FORMATS = ["Estático", "Carrossel", "Story"]; // Reels e Vídeo ficam só no roteiro

export const FONT_CHOICES = ["Montserrat", "Inter", "Poppins", "Raleway", "Oswald", "Bebas Neue", "Playfair Display", "DM Serif Display", "Lora"];

// custo aproximado por imagem (US$), para mostrar antes de gerar
export const IMAGE_COST = { nano_banana: 0.1, nano_banana_pro: 0.14, openai: 0.08 };

export const SIZES = {
  "4:5": { width: 1080, height: 1350, safeTop: 90, safeBottom: 110 },
  "9:16": { width: 1080, height: 1920, safeTop: 250, safeBottom: 340 } // área segura do Story
};

const MARKER = /(P[áa]gina|Tela|Slide|Card)\s*(\d+)\s*(\([^)]*\))?\s*[:\-–—]/gi;
const LABELS = /^(t[íi]tulo|texto|apoio|rodap[ée]|destaque|subt[íi]tulo|chamada|cta)\s*:\s*/i;

// Divide o texto da peça em páginas ("Página 1: …", "Tela 2: …"); sem marcadores, é uma página só
export function splitPieceText(text) {
  const t = String(text || "").trim();
  if (!t) return [];
  const marks = [...t.matchAll(MARKER)];
  if (!marks.length) return [t];
  return marks.map((m, i) => t.slice(m.index + m[0].length, i + 1 < marks.length ? marks[i + 1].index : undefined)).map((s) => s.replace(/[\s/]+$/, "").trim());
}

// Primeira linha vira título; o resto, texto de apoio. Rótulos como "Título:" e "Rodapé:" saem.
export function titleAndBody(segment) {
  const parts = String(segment || "")
    .split(/\n| \/ /)
    .map((s) => s.replace(LABELS, "").trim())
    .filter(Boolean);
  return { titulo: parts[0] || "", apoio: parts.slice(1).join("\n") };
}

// Planeja as páginas da arte a partir do tema (sem custo de IA)
export function planPages(entry) {
  const aspect = entry.format === "Story" ? "9:16" : "4:5";
  let segments = splitPieceText(entry.brief?.piece_text);
  if (entry.format === "Estático" && segments.length > 1) segments = [segments.join("\n")];
  if (!segments.length) segments = [entry.theme || ""];
  segments = segments.slice(0, 10);
  const prompts = (entry.brief?.image_prompts || []).filter((p) => p?.prompt);
  const fallback = `Background photo for a social media post about: ${entry.theme}. Professional, clean composition.`;
  return segments.map((seg, i) => {
    const p = prompts[i] || prompts[prompts.length - 1];
    const many = segments.length > 1;
    return {
      pagina: p?.pagina || (many ? (entry.format === "Story" ? `Tela ${i + 1}` : i === 0 ? "Capa" : `Página ${i + 1}`) : "Arte"),
      aspect,
      layout: !many || i === 0 ? "capa" : i === segments.length - 1 && entry.format === "Carrossel" ? "cta" : "pagina",
      ...titleAndBody(seg),
      prompt: p?.prompt || fallback,
      imagem: null, // { path, provider, at }
      arte: null // { path, at }
    };
  });
}

export function firstHex(colors) {
  return (String(colors || "").match(/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/i) || [])[0] || null;
}
