// Linhas editoriais: as opções vêm do Perfil do cliente ("Linhas editoriais");
// sem nada no perfil, vale uma lista padrão. Cada linha tem uma cor fixa no calendário.

export const DEFAULT_LINES = ["Educativo", "Conexão", "Autoridade", "Venda", "Bastidores", "Prova social", "Entretenimento", "Data comemorativa"];

// "- Educativo (40%): dicas de técnica" → "Educativo"
export function parseEditorialLines(text) {
  const names = [];
  for (const raw of String(text || "").split("\n")) {
    const name = raw
      .replace(/^\s*[-*•\d.)]+\s*/, "") // marcador de lista
      .split(/[(:|]/)[0] // antes de "(40%)", ":" ou "|"
      .trim();
    if (name && name.length <= 40 && !names.some((n) => n.toLowerCase() === name.toLowerCase())) names.push(name);
  }
  return names;
}

export function editorialOptions(client) {
  const fromProfile = parseEditorialLines(client?.editorial_lines);
  return fromProfile.length ? fromProfile : DEFAULT_LINES;
}

// cores suaves e legíveis nos dois temas (claro e escuro); a mesma linha sempre recebe a mesma cor
const PALETTE = ["#2F7472", "#7A5CC8", "#B8741A", "#3B6FB0", "#C1502E", "#2E8B57", "#A23E7C", "#5E6B2E"];

export function lineStyle(name) {
  let h = 0;
  for (const ch of String(name || "").toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const c = PALETTE[h % PALETTE.length];
  return { color: c, borderColor: c, background: `color-mix(in srgb, ${c} 12%, transparent)` };
}
