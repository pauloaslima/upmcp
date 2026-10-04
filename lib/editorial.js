// Cores das etiquetas de linha editorial no calendário.

// cores suaves e legíveis nos dois temas (claro e escuro); a mesma linha sempre recebe a mesma cor
const PALETTE = ["#2F7472", "#7A5CC8", "#B8741A", "#3B6FB0", "#C1502E", "#2E8B57", "#A23E7C", "#5E6B2E"];

export function lineStyle(name) {
  let h = 0;
  for (const ch of String(name || "").toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const c = PALETTE[h % PALETTE.length];
  return { color: c, borderColor: c, background: `color-mix(in srgb, ${c} 12%, transparent)` };
}
