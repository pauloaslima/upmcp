import sharp from "sharp";

// Tira das fotos anexadas os textos que já vinham escritos nelas (para a arte não ficar com duas informações).
// O designer aponta onde há texto (regiões em frações da foto: x, y, largura, altura de 0 a 1).
// 1) Texto na beirada (faixa em cima, rodapé, lateral): corta essa parte fora, que é o resultado mais limpo.
// 2) Texto no meio: cobre a área com as cores da própria foto ao redor, num esfumado suave.
// Não é uma edição perfeita como a de um editor de imagem; a arte avisa a equipe para conferir.

const EDGE = 0.32; // texto dentro dos 32% de uma borda pode ser cortado fora
const MIN_KEEP = 0.62; // o corte precisa manter pelo menos 62% da largura e da altura

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function toPixels(r, W, H, margin = 0.025) {
  const x = clamp(r.x - margin, 0, 1);
  const y = clamp(r.y - margin, 0, 1);
  const x2 = clamp(r.x + r.largura + margin, 0, 1);
  const y2 = clamp(r.y + r.altura + margin, 0, 1);
  return { left: Math.round(x * W), top: Math.round(y * H), right: Math.round(x2 * W), bottom: Math.round(y2 * H) };
}

// Preenche o buraco (onde estava o texto) com as cores de volta dele: reduz a imagem em níveis,
// ignorando o buraco, e volta ampliando; cada ponto do buraco recebe a média suave da vizinhança.
function fillHole(raw, w, h, hole) {
  const known = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) known[y * w + x] = x >= hole.left && x < hole.right && y >= hole.top && y < hole.bottom ? 0 : 1;

  // níveis: cor média (já normalizada) e peso (quanto do nível é conhecido)
  const levels = [];
  let lw = w;
  let lh = h;
  let rgb = new Float32Array(w * h * 3);
  let wt = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    wt[i] = known[i];
    for (let c = 0; c < 3; c++) rgb[i * 3 + c] = raw[i * 3 + c];
  }
  levels.push({ w: lw, h: lh, rgb, wt });
  while (lw > 1 || lh > 1) {
    const nw = Math.max(1, Math.ceil(lw / 2));
    const nh = Math.max(1, Math.ceil(lh / 2));
    const nrgb = new Float32Array(nw * nh * 3);
    const nwt = new Float32Array(nw * nh);
    for (let y = 0; y < lh; y++)
      for (let x = 0; x < lw; x++) {
        const i = y * lw + x;
        const p = (y >> 1) * nw + (x >> 1);
        const k = wt[i];
        if (!k) continue;
        nwt[p] += k;
        for (let c = 0; c < 3; c++) nrgb[p * 3 + c] += rgb[i * 3 + c] * k;
      }
    for (let p = 0; p < nw * nh; p++) if (nwt[p]) for (let c = 0; c < 3; c++) nrgb[p * 3 + c] /= nwt[p];
    for (let p = 0; p < nw * nh; p++) nwt[p] = Math.min(1, nwt[p]);
    levels.push({ w: nw, h: nh, rgb: nrgb, wt: nwt });
    lw = nw;
    lh = nh;
    rgb = nrgb;
    wt = nwt;
  }

  // volta ampliando: onde o nível fino não sabe a cor, usa o nível de cima (interpolado)
  for (let L = levels.length - 2; L >= 0; L--) {
    const fine = levels[L];
    const coarse = levels[L + 1];
    for (let y = 0; y < fine.h; y++)
      for (let x = 0; x < fine.w; x++) {
        const i = y * fine.w + x;
        if (fine.wt[i] >= 1) continue;
        const fx = clamp((x + 0.5) / 2 - 0.5, 0, coarse.w - 1);
        const fy = clamp((y + 0.5) / 2 - 0.5, 0, coarse.h - 1);
        const x0 = Math.floor(fx);
        const y0 = Math.floor(fy);
        const x1 = Math.min(coarse.w - 1, x0 + 1);
        const y1 = Math.min(coarse.h - 1, y0 + 1);
        const tx = fx - x0;
        const ty = fy - y0;
        for (let c = 0; c < 3; c++) {
          const v =
            coarse.rgb[(y0 * coarse.w + x0) * 3 + c] * (1 - tx) * (1 - ty) +
            coarse.rgb[(y0 * coarse.w + x1) * 3 + c] * tx * (1 - ty) +
            coarse.rgb[(y1 * coarse.w + x0) * 3 + c] * (1 - tx) * ty +
            coarse.rgb[(y1 * coarse.w + x1) * 3 + c] * tx * ty;
          fine.rgb[i * 3 + c] = fine.rgb[i * 3 + c] * fine.wt[i] + v * (1 - fine.wt[i]);
        }
        fine.wt[i] = 1;
      }
  }

  const out = Buffer.alloc(w * h * 3);
  const base = levels[0].rgb;
  for (let i = 0; i < w * h * 3; i++) out[i] = clamp(Math.round(base[i]), 0, 255);
  return out;
}

const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

// regions: [{ x, y, largura, altura }] (frações). Devolve { buffer, cropped, patched }.
export async function removeTextFromPhoto(buffer, regions) {
  const base = sharp(buffer).rotate();
  const { data: oriented, info } = await base.toBuffer({ resolveWithObject: true });
  const W = info.width;
  const H = info.height;
  const boxes = (regions || []).filter((r) => r && r.largura > 0 && r.altura > 0).map((r) => toPixels(r, W, H));
  if (!boxes.length) return { buffer, cropped: false, patched: 0 };

  // 1) corta as faixas das bordas que têm texto
  const keep = { left: 0, top: 0, right: W, bottom: H };
  for (const b of boxes) {
    if (b.bottom <= H * EDGE) keep.top = Math.max(keep.top, b.bottom);
    else if (b.top >= H * (1 - EDGE)) keep.bottom = Math.min(keep.bottom, b.top);
    else if (b.right <= W * EDGE) keep.left = Math.max(keep.left, b.right);
    else if (b.left >= W * (1 - EDGE)) keep.right = Math.min(keep.right, b.left);
  }
  let img = sharp(oriented);
  let offX = 0;
  let offY = 0;
  let w = W;
  let h = H;
  let cropped = false;
  const cw = keep.right - keep.left;
  const ch = keep.bottom - keep.top;
  if ((cw < W || ch < H) && cw >= W * MIN_KEEP && ch >= H * MIN_KEEP) {
    img = sharp(await img.extract({ left: keep.left, top: keep.top, width: cw, height: ch }).toBuffer());
    offX = keep.left;
    offY = keep.top;
    w = cw;
    h = ch;
    cropped = true;
  }

  // 2) o que sobrou de texto dentro da foto: cobre com as cores ao redor (esfumado)
  const inside = boxes
    .map((b) => ({ left: b.left - offX, top: b.top - offY, right: b.right - offX, bottom: b.bottom - offY }))
    .filter((b) => overlaps(b, { left: 0, top: 0, right: w, bottom: h }))
    .map((b) => ({ left: clamp(b.left, 0, w), top: clamp(b.top, 0, h), right: clamp(b.right, 0, w), bottom: clamp(b.bottom, 0, h) }))
    .filter((b) => b.right - b.left > 4 && b.bottom - b.top > 4);

  let current = await img.toBuffer();
  for (const b of inside) {
    const bw = b.right - b.left;
    const bh = b.bottom - b.top;
    // área em volta do texto, de onde vêm as cores do preenchimento
    const pad = Math.round(Math.max(bw, bh) * 0.35) + 16;
    const ring = { left: clamp(b.left - pad, 0, w), top: clamp(b.top - pad, 0, h) };
    ring.width = clamp(b.right + pad, 0, w) - ring.left;
    ring.height = clamp(b.bottom + pad, 0, h) - ring.top;
    const hole = { left: b.left - ring.left, top: b.top - ring.top, right: b.right - ring.left, bottom: b.bottom - ring.top };

    // reconstrói o buraco a partir das cores da borda (as letras somem, o fundo continua)
    const raw = await sharp(current).extract(ring).removeAlpha().raw().toBuffer();
    const filled = fillHole(raw, ring.width, ring.height, hole);
    const fill = await sharp(filled, { raw: { width: ring.width, height: ring.height, channels: 3 } }).png().toBuffer();

    // máscara com borda suave só em volta do buraco (fora dele a foto fica igual)
    const feather = Math.max(4, Math.round(Math.min(bw, bh) * 0.12));
    const mask = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${ring.width}" height="${ring.height}"><defs><filter id="f"><feGaussianBlur stdDeviation="${feather / 2}"/></filter></defs><rect x="${hole.left - feather / 2}" y="${hole.top - feather / 2}" width="${bw + feather}" height="${bh + feather}" rx="${feather}" fill="white" filter="url(#f)"/></svg>`
    );
    const maskPng = await sharp(mask).resize(ring.width, ring.height).extractChannel(0).toBuffer();
    const patch = await sharp(fill).joinChannel(maskPng).png().toBuffer();
    current = await sharp(current).composite([{ input: patch, left: ring.left, top: ring.top }]).toBuffer();
  }

  const out = await sharp(current).jpeg({ quality: 92 }).toBuffer();
  return { buffer: out, cropped, patched: inside.length };
}
