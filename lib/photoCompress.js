import sharp from "sharp";
import { heicToJpeg } from "./heic.js";

// Foto do banco do cliente: vira JPEG com no máximo 2048 px no lado maior (boa para arte, ~0,5 MB)
// e ganha uma miniatura de 400 px para a tela. Fotos do iPhone (HEIC) são convertidas antes.
// Devolve null se o arquivo não for uma imagem que dê para abrir.
export async function compressPhoto(input) {
  const buffer = await heicToJpeg(input);
  if (!buffer) return null;
  const meta = await sharp(buffer).metadata().catch(() => null);
  if (!meta?.width) return null;
  const { data: jpeg, info } = await sharp(buffer)
    .rotate()
    .resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 84, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });
  const thumb = await sharp(jpeg).resize({ width: 400, height: 400, fit: "inside" }).jpeg({ quality: 74 }).toBuffer();
  return { jpeg, thumb, width: info.width, height: info.height };
}
