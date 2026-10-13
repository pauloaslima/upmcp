// AGENTE 4 | ESPECIALISTA EM GERAÇÃO VISUAL
// Transforma o plano de uma página num pedido preciso para o gerador de imagens (OpenAI).
// O gerador faz SÓ a fotografia de ambientação: textos, logo, cores e composição da arte são do nosso
// motor (lib/artRender.js), para o texto sair exato e as fotos reais do cliente nunca serem alteradas.

const ORIENTATION = (box) => (box.height > box.width * 1.15 ? "vertical (portrait)" : box.width > box.height * 1.15 ? "horizontal (landscape)" : "square");

// onde o texto da arte vai ficar, para o gerador deixar a área calma
function textAreaHint(page) {
  if (page.layout === "foto_lateral") return page.foto_lado === "esquerda" ? "keep the right side of the frame calm and uncluttered" : "keep the left side of the frame calm and uncluttered";
  if (page.layout === "foto_topo") return "keep the bottom quarter of the frame calm, it will fade into a solid color";
  if (page.layout === "foto_base") return "keep the top quarter of the frame calm, it will fade into a solid color";
  if (page.layout === "oferta") return "keep the bottom fifth of the frame calm, it will fade into a solid color";
  if (page.posicao_texto === "topo") return "keep the upper third calm and uncluttered for text";
  if (page.posicao_texto === "centro") return "keep a soft, simple area in the middle for text";
  return "keep the lower third calm and uncluttered for text";
}

// page: página do plano (com imagem_gerada), box: { width, height } do espaço da foto,
// ctx: { paleta, tratamento_foto, estilo_foto (configuração do cliente), evitar }
export function buildImagePrompt(page, box, ctx = {}) {
  const g = page.imagem_gerada || {};
  const colors = [ctx.paleta?.fundo, ctx.paleta?.fundo_alt, ctx.paleta?.destaque].filter(Boolean).join(", ");
  const parts = [
    `Objective: editorial advertising photograph for a professional Instagram post, ${ORIENTATION(box)} frame.`,
    g.assunto && `Subject: ${g.assunto}.`,
    g.acao && `Action and expression: ${g.acao}.`,
    g.enquadramento && `Framing and composition: ${g.enquadramento}.`,
    g.ambiente && `Setting: ${g.ambiente}.`,
    g.luz && `Lighting: ${g.luz}.`,
    ctx.tratamento_foto && `Photographic treatment: ${ctx.tratamento_foto}.`,
    ctx.estilo_foto && `Brand photo style: ${ctx.estilo_foto}.`,
    colors && `Color harmony: tones that sit well with the brand colors ${colors}, natural skin tones, no color casts.`,
    `Text area: ${g.espaco_para_texto || textAreaHint(page)}.`,
    "Finish: photorealistic, high detail, professional lens and depth of field, natural retouching, believable people with natural hands and fingers.",
    "Restrictions: no text, no letters, no numbers, no logos, no watermarks, no brand names, no signage, no frames or borders, no collage, no white bars.",
    ctx.evitar && `Also avoid: ${ctx.evitar}.`
  ];
  return parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

// tamanho pedido ao gerador: múltiplos de 16 (gpt-image-2 aceita tamanho livre)
export function generationSize(box) {
  const r = (v) => Math.max(256, Math.round(v / 16) * 16);
  return { width: r(box.width), height: r(box.height) };
}
