// Arte feita pelo gerador de imagens da OpenAI (o mesmo do ChatGPT), sem passar pelo Claude.
// Aqui ficam as partes puras (testáveis): dividir o texto por página, escolher as fotos de cada página
// e escrever o pedido de design. Quem chama a OpenAI e grava a arte é lib/art/pipeline.js.

const clean = (s) => String(s || "").replace(/\s*[—–]\s*/g, ", ").replace(/\s+\n/g, "\n").trim();

// Texto de cada página: "Página 1: …", "Página 2: …" (ou uma página só no Estático e no Story)
export function splitPages(post) {
  const text = clean(post.brief?.piece_text || "");
  const max = post.format === "Carrossel" ? 10 : 1;
  if (!text) return [{ texto: clean(post.theme) }];
  const parts = text.split(/(?:^|\n)\s*(?:p[áa]gina|slide|tela)\s*\d+\s*[:.)-]\s*/i).map((s) => s.trim()).filter(Boolean);
  if (max === 1) return [{ texto: parts.join("\n") || text }];
  if (parts.length > 1) return parts.slice(0, max).map((texto) => ({ texto }));
  // carrossel sem marcação de página: um parágrafo por página
  const paragraphs = text.split(/\n\s*\n|\n/).map((s) => s.trim()).filter(Boolean);
  return paragraphs.slice(0, max).map((texto) => ({ texto }));
}

// Foto de cada página: capa com a primeira, fechamento com a última e, havendo mais fotos,
// algumas páginas do meio (alternadas) com as outras. -1 = página sem foto do cliente.
export function assignPhotos(pageCount, photoCount) {
  const out = Array(pageCount).fill(-1);
  if (!photoCount) return out;
  out[0] = 0;
  if (pageCount > 1) out[pageCount - 1] = photoCount > 1 ? photoCount - 1 : 0;
  const middle = photoCount > 2 ? Array.from({ length: photoCount - 2 }, (_, i) => i + 1) : [];
  let k = 0;
  for (let i = 2; i < pageCount - 1 && middle.length; i += 2) out[i] = middle[k++ % middle.length];
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

// Pedido de design de uma página (em inglês, com o texto exato em português)
export function buildSlidePrompt({ client, config = {}, post, page, index, total, photoRole = "none", hasCoverRef = false, size }) {
  const brief = post.brief || {};
  const colors = config.cores ? `Brand colors (use these exact colors): ${config.cores}.` : "";
  const fonts = [
    config.fonte_titulo ? `Headline font style: ${{ Montserrat: "modern sans-serif", Playfair: "elegant editorial serif", Cormorant: "refined delicate serif", Anton: "condensed heavy display" }[config.fonte_titulo] || config.fonte_titulo}.` : "",
    config.fonte_manuscrita === "nenhuma" ? "Do not use script lettering." : config.fonte_manuscrita ? `Use ${config.fonte_manuscrita === "GreatVibes" ? "an elegant calligraphic script" : "a casual script"} only to emphasize one or two words.` : ""
  ].join(" ");
  const images = [];
  if (photoRole === "photo") images.push("Image 1 is a REAL photograph of the professional (or the real product). Use it as the main photo of this slide: keep the person's face, body, hair and features exactly as they are, do not redraw, beautify or alter the person. You may crop, enlarge and position it and blend it smoothly into the background.");
  if (hasCoverRef) images.push(`Image ${images.length + 1} is slide 1 of this same carousel: match its colors, typography and visual language exactly, but use a different composition.`);
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
    `TEXT: write EXACTLY this Brazilian Portuguese text, with correct spelling and accents, split into a clear hierarchy (big headline, smaller supporting text). Do not add, translate or change any word: """${page.texto}"""`,
    ...images,
    photoRole === "none" && !hasCoverRef ? "No photo of the professional on this slide. Never invent or depict the real professional; if an image helps, use only abstract shapes, thin line icons or a generic atmosphere without people." : "",
    "Quality rules: one clear focal point, intentional layout and asymmetry when it helps, generous margins, text legible on a phone, no orphan words, photo integrated into the composition (never pasted on top), soft gradients only where text needs contrast, no white bars, no heavy shadows, no clip art, no emojis, no hashtags, no em dashes.",
    "Leave the top 130 px and the bottom 150 px free of text and important elements: the brand name or logo, the page counter and the carousel dots are added later. Do not draw any logo, signature, @handle, page number or dots yourself.",
    config.evitar ? `Avoid: ${config.evitar}.` : ""
  ]
    .filter(Boolean)
    .join("\n");
}
