// Regra de escrita da Up!: nunca usar travessão (—) nem meia-risca (–).
// Para separar partes de um título use " | "; no meio de frases, a pontuação correta.

const DASH = /\s*[—–]\s*/g;

// Títulos e temas: "Educativo — Conexão — Ideia" → "Educativo | Conexão | Ideia"
export function asTitle(text) {
  if (typeof text !== "string") return text;
  return text.replace(DASH, " | ").trim();
}

// Frases: "Post comemorativo — com sorteio" → "Post comemorativo, com sorteio"
export function asText(text) {
  if (typeof text !== "string") return text;
  return text
    .replace(/(^|\n)\s*[—–]\s*/g, "$1- ") // travessão no começo da linha vira item de lista
    .replace(/\s+[—–]\s+/g, ", ")
    .replace(/[—–]/g, "-");
}
