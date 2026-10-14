import convert from "heic-convert";
import sharp from "sharp";

// Fotos HEIC/HEIF (padrão do iPhone): o processador de imagens do sistema não abre esse formato,
// então elas viram JPEG antes de entrar nas artes. Detecta pelo conteúdo do arquivo, não pelo nome.
const HEIC_BRANDS = ["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"];

export function isHeic(buffer) {
  if (!buffer || buffer.length < 12) return false;
  if (buffer.toString("ascii", 4, 8) !== "ftyp") return false;
  return HEIC_BRANDS.includes(buffer.toString("ascii", 8, 12));
}

// Devolve o mesmo buffer se não for HEIC; se for, a versão em JPEG (ou null se não der para ler)
export async function heicToJpeg(buffer) {
  if (!isHeic(buffer)) return buffer;
  // AVIF e alguns HEIF o processador normal já abre
  if (await sharp(buffer).resize(8).toBuffer().then(() => true).catch(() => false)) return buffer;
  try {
    const out = await convert({ buffer, format: "JPEG", quality: 0.92 });
    return Buffer.from(out);
  } catch (err) {
    console.error("foto HEIC não pôde ser convertida", err?.message);
    return null;
  }
}
