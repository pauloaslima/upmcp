// Arte feita pelo gerador de imagens da OpenAI (o mesmo do ChatGPT), sem passar pelo Claude.
// Aqui ficam as partes puras (testáveis): dividir o texto por página, escolher as fotos de cada página
// e escrever o pedido de design. Quem chama a OpenAI e grava a arte é lib/art/pipeline.js.

const clean = (s) => String(s || "").replace(/\s*[—–]\s*/g, ", ").replace(/\s+\n/g, "\n").trim();

// marcação de página em qualquer lugar do texto: começo, nova linha, " / " ou depois de um ponto
const PAGE_MARK = /(?:^|\n|\s*\/\s*|(?<=[.!?])\s+)\s*(?:p[áa]gina|slide|tela|card)\s*\d+\s*[:.)-]\s*/i;
// pendências como "[confirmar com o cliente: …]" nunca vão para a arte
const PENDING = /\s*\[[^\]]*\]/g;
const tidy = (s) => s.replace(PENDING, "").replace(/\s+([.,;:!?])/g, "$1").replace(/[\s/]+$/, "").trim();

// Texto de cada página: "Página 1: …", "Página 2: …" (ou uma página só no Estático e no Story).
// Devolve [{ texto, pendente }] (pendente = havia algo entre colchetes para confirmar)
export function splitPages(post) {
  const raw = clean(post.brief?.piece_text || "");
  const max = post.format === "Carrossel" ? 10 : 1;
  const page = (s) => ({ texto: tidy(s), pendente: /\[[^\]]*\]/.test(s) });
  if (!raw) return [{ texto: clean(post.theme), pendente: false }];
  const parts = raw.split(new RegExp(PAGE_MARK.source, "gi")).map((s) => s.trim()).filter(Boolean);
  if (max === 1) return [page(parts.join("\n") || raw)];
  let pages = parts.length > 1 ? parts : raw.split(/\n\s*\n|\n/).map((s) => s.trim()).filter(Boolean);
  // carrossel com menos de 3 páginas: divide as frases em páginas (capa, desenvolvimento e fechamento)
  if (pages.length < 3) {
    const sentences = raw.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((s) => s.trim()).filter(Boolean) || [raw];
    const n = Math.min(max, sentences.length, Math.max(3, Math.ceil(sentences.length / 2)));
    const cut = (i) => Math.floor((i * sentences.length) / n);
    pages = Array.from({ length: n }, (_, i) => sentences.slice(cut(i), cut(i + 1)).join(" ")).filter(Boolean);
  }
  return pages.slice(0, max).map(page);
}

// Foto de cada página: o carrossel mescla páginas com foto e páginas só com fundo, textura e tipografia.
// Capa com a primeira foto, fechamento com a última e, havendo fotos sobrando, no máximo 1 página do meio
// com foto (2 a partir de 8 páginas), nunca vizinhas de outra página com foto. -1 = página sem foto.
export function assignPhotos(pageCount, photoCount) {
  const out = Array(pageCount).fill(-1);
  if (!photoCount) return out;
  out[0] = 0;
  if (pageCount > 1) out[pageCount - 1] = photoCount > 1 ? photoCount - 1 : 0;
  const extras = photoCount > 2 ? Array.from({ length: photoCount - 2 }, (_, i) => i + 1) : [];
  const slots = pageCount >= 8 ? [Math.floor(pageCount / 3), Math.floor((2 * pageCount) / 3)] : pageCount >= 5 ? [Math.floor((pageCount - 1) / 2)] : [];
  let k = 0;
  for (const i of slots) {
    if (k >= extras.length || i <= 1 || i >= pageCount - 2 || out[i - 1] >= 0 || out[i + 1] >= 0) continue;
    out[i] = extras[k++]; // cada foto aparece uma vez só
  }
  return out;
}

const role = (i, n) =>
  n === 1
    ? "a single post: strong headline, clear supporting text and the call to action if there is one"
    : i === 0
      ? "the COVER: a scroll-stopping hook, the real photo as protagonist, big headline and a short subtitle"
      : i === n - 1
        ? "the CLOSING slide: human photo, warm call to action, a button-like element with the CTA text"
        : "a MIDDLE slide that explains one idea: choose the layout that best fits the content (comparison cards like myth vs truth, a two-column icon grid, a list with thin line icons, a checklist, a simple two-circle diagram, a big typographic statement, or a high-contrast page with the dark brand color). Use a different layout from the other slides";
const NO_PHOTO =
  "This slide has NO photograph: build it only with the brand background colors, subtle textures (paper, linen, soft grain, delicate organic or botanical line shapes), thin line icons and typography. Do not include any person, face or photo, and do not reuse the photo from the reference image.";

// Pedido de design de uma página (em inglês, com o texto exato em português)
export function buildSlidePrompt({ client, config = {}, post, page, index, total, photoRole = "none", hasCoverRef = false, size }) {
  const brief = post.brief || {};
  const colors = config.cores ? `Brand colors (use these exact colors): ${config.cores}.` : "";
  const fonts = [
    config.fonte_titulo ? `Headline font style: ${{ Montserrat: "modern sans-serif", Playfair: "elegant editorial serif", Cormorant: "refined delicate serif", Anton: "condensed heavy display" }[config.fonte_titulo] || config.fonte_titulo}.` : "",
    config.fonte_manuscrita === "nenhuma" ? "Do not use script lettering." : config.fonte_manuscrita ? `Use ${config.fonte_manuscrita === "GreatVibes" ? "an elegant calligraphic script" : "a casual script"} only to emphasize one or two words.` : ""
  ].join(" ");
  const images = [];
  if (photoRole === "photo") images.push("Image 1 is a REAL photograph of the professional (or the real product). Use it as the main photo of this slide and integrate it into the composition (crop, scale, position, blend its edges into the background). The person must stay IDENTICAL to the photo: same face, facial features, expression, skin, hair, body, hands, clothes and accessories. Do not redraw, retouch, beautify, slim, age, change the pose or generate a new person; treat the person as untouchable pixels and only work around them.");
  if (hasCoverRef) images.push(`Image ${images.length + 1} is slide 1 of this same carousel: use it ONLY as a style reference (colors, typography, textures and visual language), with a different composition${photoRole === "photo" ? "" : " and without its photo"}.`);
  return [
    `Design ${total > 1 ? `slide ${index + 1} of ${total} of a professional Instagram carousel` : "a professional Instagram post"} for "${client.name}". Vertical ${size.width}x${size.height} (${size.height > 1500 ? "9:16 story" : "4:5 feed"}). It must look like a finished piece by a senior art director, not a template.`,
    client.positioning ? `About the brand: ${String(client.positioning).slice(0, 600)}` : "",
    `Brand visual identity: ${String(client.identity || "").slice(0, 900)} ${colors} ${fonts}`.trim(),
    config.estilo_foto ? `Photo style: ${config.estilo_foto}.` : "",
    config.linguagem_grafica ? `Graphic language: ${config.linguagem_grafica}.` : "",
    client.art_references ? `Reference style of this brand: ${String(client.art_references).slice(0, 700)}` : "",
    brief.important_notes ? `Art direction for this post: ${String(brief.important_notes).slice(0, 900)}` : "",
    brief.must_have ? `Briefing requirements: ${String(brief.must_have).slice(0, 600)}` : "",
    `This slide is ${role(index, total)}.`,
    `TEXT: write EXACTLY this Brazilian Portuguese text, with correct spelling and accents, split into a clear hierarchy (big headline, smaller supporting text). Do not add, translate or change any word. Labels such as "Subtítulo:", "Título:" or "Texto:" only indicate the hierarchy and must NOT be written; labels like "Mito 1:" and "Verdade:" are part of the content: """${page.texto}"""`,
    "This image is ONE single slide of the carousel, full bleed. Never create a grid, collage, mosaic, contact sheet or several panels in the same image.",
    ...images,
    photoRole === "none" ? NO_PHOTO : "",
    "Quality rules: one clear focal point, intentional layout and asymmetry when it helps, generous margins, text legible on a phone, no orphan words, photo integrated into the composition (never pasted on top), soft gradients only where text needs contrast, no white bars, no heavy shadows, no clip art, no emojis, no hashtags, no em dashes.",
    "Boxes and highlights: any colored background behind text (highlight, label, tag, card or button) must be ONE single clean rectangle (or pill) wrapping the whole text block, as wide as its longest line, with equal padding on all four sides and the text centered or aligned consistently inside it. Never use a separate background block per line, never a staircase or uneven highlight, never boxes of different sizes side by side for the same element. Boxes of the same type on the slide share the same width, height, corner radius and padding. Keep elements aligned to a clear grid and spacing consistent.",
    "RESERVED BANDS: the top 200 px and the bottom 200 px must contain NO text at all, only background (photo or texture can continue there). The brand signature or logo, the page counter and the carousel dots are placed there later by us.",
    "NEVER write the professional's or brand's name, profession, @handle, CRP, website, signature, header or footer text anywhere on the slide, even if the brand identity or references describe a header or a signature: those are added by us. Do not draw any logo, page number or dots. Text must never overlap other text.",
    config.evitar ? `Avoid: ${config.evitar}.` : ""
  ]
    .filter(Boolean)
    .join("\n");
}
