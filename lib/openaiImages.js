import sharp from "sharp";

// Imagens com o gerador da OpenAI (o mesmo do ChatGPT), só no servidor.
// Chave em OPENAI_API_KEY (Vercel). Opcionais: OPENAI_IMAGE_MODEL (padrão gpt-image-2)
// e OPENAI_IMAGE_QUALITY (low | medium | high; padrão medium).
// Usos: 1) gerar a foto de uma página que não tem foto; 2) tirar textos que já vinham escritos nas fotos.
// Texto, logo e cores da arte continuam com o nosso designer (lib/artRender.js), nunca com a imagem gerada.

const API = "https://api.openai.com/v1/images";

export const imageGenEnabled = () => !!process.env.OPENAI_API_KEY;
const model = () => process.env.OPENAI_IMAGE_MODEL || "gpt-image-2";
const quality = () => (["low", "medium", "high"].includes(process.env.OPENAI_IMAGE_QUALITY) ? process.env.OPENAI_IMAGE_QUALITY : "medium");
const customSizes = () => /^gpt-image-2|sunburst|flare/.test(model());

export class ImageGenError extends Error {}

function hideKey(text) {
  const key = process.env.OPENAI_API_KEY;
  return String(text || "").split(key || "@@sem-chave@@").join("[chave oculta]");
}

async function call(path, init) {
  let res;
  try {
    res = await fetch(`${API}/${path}`, { ...init, headers: { Authorization: "Bearer " + process.env.OPENAI_API_KEY, ...(init.headers || {}) }, cache: "no-store" });
  } catch (err) {
    throw new ImageGenError("Não consegui falar com a OpenAI: " + hideKey(err?.message));
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = hideKey(body?.error?.message || `HTTP ${res.status}`);
    if (res.status === 401) throw new ImageGenError("A chave OPENAI_API_KEY é inválida.");
    if (res.status === 429) throw new ImageGenError("Limite ou créditos da OpenAI esgotados: " + msg);
    if (/verif/i.test(msg)) throw new ImageGenError("A OpenAI pede a verificação da organização para usar o gerador de imagens.");
    throw new ImageGenError("A OpenAI recusou o pedido: " + msg);
  }
  const b64 = body?.data?.[0]?.b64_json;
  if (!b64) throw new ImageGenError("A OpenAI não devolveu a imagem.");
  return Buffer.from(b64, "base64");
}

// Foto nova para uma página. box: { width, height } do espaço da foto na arte.
// exact: o pedido já vem completo do especialista em geração visual (lib/art/visualPrompt.js)
export async function generatePhoto(prompt, box, { exact = false } = {}) {
  const portrait = box.height >= box.width;
  // gpt-image-2 aceita tamanho livre (múltiplo de 16); os outros, os tamanhos fixos
  const size = customSizes()
    ? `${Math.round(box.width / 16) * 16}x${Math.round(box.height / 16) * 16}`
    : portrait
      ? "1024x1536"
      : "1536x1024";
  const fullPrompt = exact
    ? prompt
    : [
    prompt,
    "Professional advertising photograph for an Instagram post, photorealistic, natural light, high detail.",
    "No text, no letters, no numbers, no logos, no watermarks, no brand names anywhere in the image.",
    "Leave calm, uncluttered space in the lower third for text to be added later."
  ].join(" ");
  return call("generations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: model(), prompt: fullPrompt, size, quality: quality(), n: 1, output_format: "jpeg" })
  });
}

// Arte inteira feita pelo gerador (o mesmo do ChatGPT): textos, composição e foto.
// images: fotos de referência (Buffers) na ordem descrita no pedido; target: { width, height } final.
// Com imagens usa "edits" (as fotos entram como material); sem imagens, "generations".
export async function generateArtImage(prompt, images = [], target = { width: 1080, height: 1350 }) {
  const sizes = customSizes() ? [`${Math.ceil(target.width / 16) * 16}x${Math.ceil(target.height / 16) * 16}`, "1024x1536"] : ["1024x1536"];
  let lastErr = null;
  for (const size of sizes) {
    try {
      if (!images.length) {
        return await call("generations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: model(), prompt, size, quality: quality(), n: 1, output_format: "png" })
        });
      }
      const form = new FormData();
      form.append("model", model());
      for (let i = 0; i < images.length; i++) {
        const png = await sharp(images[i]).rotate().resize({ width: 1536, height: 1536, fit: "inside", withoutEnlargement: true }).png().toBuffer();
        form.append("image[]", new Blob([png], { type: "image/png" }), `referencia-${i + 1}.png`);
      }
      form.append("prompt", prompt);
      form.append("quality", quality());
      form.append("size", size);
      form.append("output_format", "png");
      if (!/^gpt-image-2|sunburst|flare|mini/.test(model())) form.append("input_fidelity", "high");
      return await call("edits", { method: "POST", body: form });
    } catch (err) {
      lastErr = err;
      // tamanho livre recusado: tenta o tamanho padrão vertical
      if (!/size/i.test(String(err?.message))) throw err;
    }
  }
  throw lastErr;
}

// Melhora uma foto fraca (escura, borrada, baixa resolução) mantendo tudo igual: mesmas pessoas,
// mesmo produto, mesmo enquadramento. Só para fotos que o designer apontou como fracas.
export async function enhancePhotoAI(buffer, problema = "") {
  const img = await sharp(buffer).rotate().resize({ width: 1536, height: 1536, fit: "inside", withoutEnlargement: true }).png().toBuffer();
  const form = new FormData();
  form.append("model", model());
  form.append("image", new Blob([img], { type: "image/png" }), "foto.png");
  form.append(
    "prompt",
    [
      "Enhance this exact photograph like a professional photo retoucher: correct exposure and white balance, recover shadows and highlights, improve sharpness and fine detail, reduce noise, make colors natural and appetizing.",
      problema ? `Main problem to fix: ${problema}.` : "",
      "Keep everything else identical: the same people, faces, products, food, objects, packaging, composition, framing, perspective and background. Do not add, remove or move anything. Do not add any text."
    ]
      .filter(Boolean)
      .join(" ")
  );
  form.append("quality", quality());
  form.append("size", "auto");
  form.append("output_format", "png");
  if (!/^gpt-image-2|sunburst|flare|mini/.test(model())) form.append("input_fidelity", "high");
  const out = await call("edits", { method: "POST", body: form });
  const { info } = await sharp(buffer).rotate().toBuffer({ resolveWithObject: true });
  // devolve no tamanho da foto original (ou maior, se a original era pequena)
  const scale = Math.max(1, 1080 / Math.max(info.width, info.height));
  return sharp(out)
    .resize(Math.round(info.width * scale), Math.round(info.height * scale), { fit: "fill" })
    .jpeg({ quality: 92 })
    .toBuffer();
}

// Tira os textos de uma foto: refaz só as áreas marcadas (regiões em frações de 0 a 1).
export async function removeTextAI(buffer, regions) {
  // a OpenAI recebe a foto com no máximo 1536 px no lado maior
  const img = await sharp(buffer).rotate().resize({ width: 1536, height: 1536, fit: "inside", withoutEnlargement: true }).png().toBuffer();
  const { width: W, height: H } = await sharp(img).metadata();
  // máscara: transparente onde a OpenAI pode refazer, opaca no resto
  const holes = (regions || [])
    .map((r) => {
      const m = 0.02;
      const x = Math.max(0, r.x - m) * W;
      const y = Math.max(0, r.y - m) * H;
      const w = Math.min(1, r.x + r.largura + m) * W - x;
      const h = Math.min(1, r.y + r.altura + m) * H - y;
      return `<rect x="${Math.round(x)}" y="${Math.round(y)}" width="${Math.round(w)}" height="${Math.round(h)}" rx="8" fill="black"/>`;
    })
    .join("");
  const maskSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><mask id="m"><rect width="${W}" height="${H}" fill="white"/>${holes}</mask></defs><rect width="${W}" height="${H}" fill="white" mask="url(#m)"/></svg>`;
  const mask = await sharp(Buffer.from(maskSvg)).resize(W, H).ensureAlpha().png().toBuffer();

  const form = new FormData();
  form.append("model", model());
  form.append("image", new Blob([img], { type: "image/png" }), "foto.png");
  form.append("mask", new Blob([mask], { type: "image/png" }), "mascara.png");
  form.append(
    "prompt",
    "Remove every text, letter, number, price tag, sticker, banner, logo and watermark inside the masked areas. Rebuild what was behind them so it looks natural, matching the surrounding texture, lighting, colors and perspective. Do not change anything outside the masked areas. Do not add any new text."
  );
  form.append("quality", quality());
  form.append("size", "auto");
  form.append("output_format", "png");
  if (!/^gpt-image-2|sunburst|flare|mini/.test(model())) form.append("input_fidelity", "high");
  const out = await call("edits", { method: "POST", body: form });
  // volta para o tamanho da foto original
  const { info } = await sharp(buffer).rotate().toBuffer({ resolveWithObject: true });
  return sharp(out).resize(info.width, info.height, { fit: "fill" }).jpeg({ quality: 92 }).toBuffer();
}
