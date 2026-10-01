// Geração de imagem para as artes (só no servidor). Dois serviços:
//  - Nano Banana (Google Gemini): GEMINI_API_KEY
//  - GPT Image (OpenAI): OPENAI_API_KEY
// Os nomes dos modelos podem ser trocados no Vercel sem mexer no código.

const MODELS = {
  nano_banana: () => process.env.NANO_BANANA_MODEL || "gemini-3.1-flash-image",
  nano_banana_pro: () => process.env.NANO_BANANA_PRO_MODEL || "gemini-3-pro-image",
  openai: () => process.env.OPENAI_IMAGE_MODEL || "gpt-image-2.5-flare"
};

export class ImageGenError extends Error {}

const NO_TEXT =
  "IMPORTANT: the image must contain absolutely no text, letters, numbers, captions, logos, signs or watermarks. " +
  "Leave clean, uncluttered space where a headline will be placed later. Photorealistic unless the description says otherwise.";

// refs: [{ mime, base64 }] fotos de referência (ex.: produto real do cliente)
export async function generateImage({ provider, prompt, aspect, colors, refs = [] }) {
  const full = [prompt, colors ? `Color palette inspired by the brand colors ${colors}.` : "", NO_TEXT].filter(Boolean).join("\n\n");
  if (provider === "openai") return openai(full, aspect, refs);
  return gemini(provider === "nano_banana_pro" ? MODELS.nano_banana_pro() : MODELS.nano_banana(), full, aspect, refs);
}

async function gemini(model, prompt, aspect, refs) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new ImageGenError("Falta configurar GEMINI_API_KEY no Vercel (Nano Banana).");
  const base = "https://generativelanguage.googleapis.com/v1beta/interactions";
  const headers = { "x-goog-api-key": key, "Content-Type": "application/json" };
  const res = await fetch(base, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      input: [{ type: "text", text: prompt }, ...refs.map((r) => ({ type: "image", mime_type: r.mime, data: r.base64 }))],
      response_format: { type: "image", mime_type: "image/png", aspect_ratio: aspect, image_size: "2K" }
    })
  });
  let json = await readJson(res, "Nano Banana");
  // se ainda estiver processando, consulta de novo por até ~2 min
  for (let i = 0; i < 24 && !findImage(json) && ["in_progress", "queued"].includes(json.status) && json.id; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    json = await readJson(await fetch(`${base}/${json.id}`, { headers }), "Nano Banana");
  }
  const img = findImage(json);
  if (!img) {
    console.error("nano banana sem imagem", JSON.stringify(json).slice(0, 1500));
    throw new ImageGenError(json.status === "failed" ? "O Nano Banana não conseguiu gerar esta imagem. Ajuste a descrição e tente de novo." : "O Nano Banana não devolveu imagem. Tente de novo.");
  }
  return { buffer: Buffer.from(img.data, "base64"), mime: img.mime_type || "image/png" };
}

// procura o primeiro bloco { type: "image", data } em qualquer lugar da resposta
function findImage(node) {
  if (!node || typeof node !== "object") return null;
  if (node.type === "image" && typeof node.data === "string" && node.data.length > 100) return node;
  if (node.output_image?.data) return node.output_image;
  for (const v of Object.values(node)) {
    const hit = findImage(v);
    if (hit) return hit;
  }
  return null;
}

async function openai(prompt, aspect, refs) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new ImageGenError("Falta configurar OPENAI_API_KEY no Vercel (GPT Image).");
  const model = MODELS.openai();
  const size = "1024x1536"; // retrato; o sistema recorta para 4:5 ou 9:16 na montagem
  let res;
  if (refs.length) {
    const form = new FormData();
    form.append("model", model);
    form.append("prompt", prompt);
    form.append("size", size);
    refs.forEach((r, i) => form.append("image[]", new Blob([Buffer.from(r.base64, "base64")], { type: r.mime }), `ref-${i}.${r.mime.split("/")[1] || "png"}`));
    res = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { Authorization: "Bearer " + key }, body: form });
  } else {
    res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt, size, quality: "medium", n: 1 })
    });
  }
  const json = await readJson(res, "GPT Image");
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) {
    console.error("openai sem imagem", JSON.stringify(json).slice(0, 1500));
    throw new ImageGenError("O GPT Image não devolveu imagem. Tente de novo.");
  }
  return { buffer: Buffer.from(b64, "base64"), mime: "image/png" };
}

async function readJson(res, name) {
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json.error?.message || json.message || "";
    console.error(name, res.status, msg);
    if (res.status === 401 || res.status === 403) throw new ImageGenError(`A chave do ${name} é inválida ou não tem permissão.`);
    if (res.status === 429) throw new ImageGenError(`O ${name} está com muitos pedidos ou sem créditos. Tente de novo em 1 minuto.`);
    if (res.status === 400 && /safety|policy|moderation|blocked/i.test(msg)) throw new ImageGenError(`O ${name} recusou esta descrição por segurança. Ajuste o pedido de imagem.`);
    throw new ImageGenError(`O ${name} respondeu com erro (${res.status}). ${msg.slice(0, 160)}`);
  }
  return json;
}
