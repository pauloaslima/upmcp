import sharp from "sharp";

// Ajuste leve e seguro das fotos anexadas antes de entrar na arte: luz, contraste, cor e nitidez.
// Não recria nada da foto (o produto continua exatamente o mesmo); só corrige exposição e definição.

export async function enhanceLocal(buffer) {
  const base = sharp(buffer).rotate();
  const { channels } = await base.clone().stats();
  // brilho médio de 0 a 1 (média dos canais de cor)
  const mean = channels.slice(0, 3).reduce((s, c) => s + c.mean, 0) / 3 / 255;
  // foto escura ganha mais luz; foto clara demais, um pouco menos
  const brightness = mean < 0.32 ? 1.22 : mean < 0.42 ? 1.12 : mean > 0.78 ? 0.95 : 1.03;
  return base
    .normalise({ lower: 1, upper: 99 })
    .modulate({ brightness, saturation: 1.08 })
    .sharpen({ sigma: 0.9, m1: 0.6, m2: 2 })
    .jpeg({ quality: 92 })
    .toBuffer();
}
