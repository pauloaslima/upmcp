import Anthropic, { toFile } from "@anthropic-ai/sdk";
import ExcelJS from "exceljs";
import mammoth from "mammoth";
import sharp from "sharp";
import { MATERIAL_CATEGORIES } from "./profileFields";

// Transforma os materiais do cliente (guardados no bucket "anexos") em conteúdo que o Claude lê:
// PDFs sobem pelo envio de arquivos do serviço (até 500 MB, fora do limite de 32 MB do pedido);
// imagens vão reduzidas no próprio pedido; planilhas (.xlsx/.csv), Word (.docx) e texto viram texto.
// Depois da leitura, chame deleteUploaded(uploaded) para apagar os PDFs enviados.

const IMAGE_TYPES = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif" };
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // limite do Claude por imagem
const MAX_TOTAL_BYTES = 20 * 1024 * 1024; // imagens no pedido: vira ~27 MB em base64, abaixo do limite de 32 MB
const MAX_PDF_BYTES = 450 * 1024 * 1024; // limite do envio de arquivos é 500 MB
const MAX_TEXT_CHARS = 60000; // por arquivo convertido em texto

const ext = (name) => (name.split(".").pop() || "").toLowerCase();
const categoryLabel = (id) => MATERIAL_CATEGORIES.find((c) => c.id === id)?.label || "Outros";

async function spreadsheetText(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const parts = [];
  wb.eachSheet((sheet) => {
    parts.push(`## Aba: ${sheet.name}`);
    sheet.eachRow((row) => {
      const cells = row.values.slice(1).map((v) => {
        if (v == null) return "";
        if (typeof v === "object") return v.text ?? v.result ?? (v.richText ? v.richText.map((r) => r.text).join("") : "");
        return String(v);
      });
      if (cells.some((c) => c.trim())) parts.push(cells.join(" | "));
    });
  });
  return parts.join("\n");
}

// materials: [{ path, name, category }] → { blocks, used, skipped, uploaded, sizes }
// sizes: tamanho de cada bloco de PDF/imagem (para deixar de fora o maior se o serviço recusar)
export async function materialsToBlocks(db, materials) {
  const blocks = [];
  const used = [];
  const skipped = [];
  const uploaded = [];
  const sizes = new Map();
  let total = 0;
  let anthropic = null;

  for (const m of materials || []) {
    if (m.type !== "upload" || !m.path) continue;
    const kind = ext(m.name);
    const label = `Arquivo: ${m.name} | categoria: ${categoryLabel(m.category)}`;
    try {
      const { data: blob, error } = await db.storage.from("anexos").download(m.path);
      if (error || !blob) throw error || new Error("download vazio");
      const buffer = Buffer.from(await blob.arrayBuffer());

      if (kind === "pdf") {
        if (buffer.length > MAX_PDF_BYTES) {
          skipped.push({ name: m.name, motivo: "PDF maior que 450 MB" });
          continue;
        }
        anthropic = anthropic || new Anthropic();
        const file = await anthropic.files.upload({ file: await toFile(buffer, m.name, { type: "application/pdf" }) });
        uploaded.push(file.id);
        const block = { type: "document", source: { type: "file", file_id: file.id }, title: m.name };
        sizes.set(block, buffer.length);
        blocks.push({ type: "text", text: label });
        blocks.push(block);
      } else if (IMAGE_TYPES[kind]) {
        let content = buffer;
        let mediaType = IMAGE_TYPES[kind];
        if (kind !== "gif") {
          // fotos grandes: reduz para o tamanho ideal para a leitura (lado maior 1568 px), o que também barateia a análise
          content = await sharp(buffer).rotate().resize({ width: 1568, height: 1568, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
          mediaType = "image/jpeg";
        }
        if (content.length > MAX_IMAGE_BYTES) {
          skipped.push({ name: m.name, motivo: "imagem maior que 5 MB" });
          continue;
        }
        if (total + content.length > MAX_TOTAL_BYTES) {
          skipped.push({ name: m.name, motivo: "limite de tamanho total atingido" });
          continue;
        }
        total += content.length;
        const block = { type: "image", source: { type: "base64", media_type: mediaType, data: content.toString("base64") } };
        sizes.set(block, content.length);
        blocks.push({ type: "text", text: label });
        blocks.push(block);
      } else {
        let text = "";
        if (kind === "xlsx") text = await spreadsheetText(buffer);
        else if (kind === "docx") text = (await mammoth.extractRawText({ buffer })).value;
        else if (["csv", "txt", "md"].includes(kind)) text = buffer.toString("utf8");
        else {
          skipped.push({ name: m.name, motivo: kind === "xls" ? "planilha .xls antiga: salve como .xlsx" : "tipo de arquivo não suportado" });
          continue;
        }
        if (!text.trim()) {
          skipped.push({ name: m.name, motivo: "arquivo sem texto" });
          continue;
        }
        const cut = text.length > MAX_TEXT_CHARS;
        blocks.push({ type: "text", text: `${label}\n\n${text.slice(0, MAX_TEXT_CHARS)}${cut ? "\n[…arquivo cortado por tamanho]" : ""}` });
      }
      used.push(m.name);
    } catch (err) {
      console.error("material", m.name, err);
      skipped.push({ name: m.name, motivo: "não consegui abrir o arquivo" });
    }
  }
  return { blocks, used, skipped, uploaded, sizes };
}

// apaga os PDFs enviados para a leitura (não ficam guardados no serviço)
export async function deleteUploaded(ids) {
  if (!ids?.length) return;
  const anthropic = new Anthropic();
  await Promise.all(ids.map((id) => anthropic.files.delete(id).catch((err) => console.error("apagar arquivo", id, err?.message))));
}
