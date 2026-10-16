// Estilo base de cada cliente (Perfil do cliente > Direção de arte > Estilo base).
// Cada estilo tem regras próprias de composição, tipografia, cor e textura, para as artes de clientes
// diferentes não saírem com a mesma "cara" (o padrão do gerador quando não recebe direção).

export const ART_STYLES = [
  {
    id: "editorial",
    label: "Editorial minimalista",
    desc: "Muito respiro, tipografia de revista, poucas cores, elegante e calmo.",
    prompt:
      "BASE STYLE: editorial minimalist, like a high-end magazine spread. Lots of negative space, a refined serif or thin sans headline in sentence case (not all caps), small supporting text, a restrained palette of 2 or 3 brand colors with one accent, subtle paper or matte texture, thin rules and small editorial details (issue-like numbers, fine lines). Calm, confident, never crowded. No pill buttons, no heavy gradients, no glow."
  },
  {
    id: "luxo",
    label: "Sofisticado / luxo",
    desc: "Clima premium: tons profundos ou neutros, serifas finas, detalhes dourados discretos.",
    prompt:
      "BASE STYLE: sophisticated luxury. Deep or warm neutral tones from the brand palette, elegant high-contrast serif headline with generous letter spacing, delicate thin lines and subtle metallic or satin accents, soft directional light, refined textures (linen, marble, velvet) used sparingly. Quiet and premium; never loud colors, never bold condensed type, never cartoon elements."
  },
  {
    id: "acolhedor",
    label: "Acolhedor e orgânico",
    desc: "Formas suaves, tons terrosos ou pastéis, sensação humana e próxima.",
    prompt:
      "BASE STYLE: warm and organic. Soft rounded organic shapes and blobs, earthy or pastel tones from the brand palette, paper grain or natural textures, friendly rounded or humanist type in sentence case, gentle hand-drawn touches (a small underline, a doodle, a leaf) used with restraint. Feels human, welcoming and calm; no hard dark gradients, no aggressive all-caps blocks."
  },
  {
    id: "vibrante",
    label: "Vibrante / pop",
    desc: "Cores fortes, contraste alto, energia e movimento.",
    prompt:
      "BASE STYLE: vibrant pop. Bold saturated brand colors in large flat color fields, high contrast, playful geometric shapes, stickers or cut-out elements, dynamic diagonal or off-center composition, chunky expressive type mixed with a lighter weight. Energetic and fun, but organized on a clear grid; no dark moody vignettes."
  },
  {
    id: "clean",
    label: "Clean e técnico",
    desc: "Organizado, claro, com grids, ícones e dados. Passa autoridade.",
    prompt:
      "BASE STYLE: clean and technical. Light background, strict grid, precise alignment, modern geometric sans-serif, thin line icons, small labels and numbered steps, data-like details (simple charts, checklists, dividers), one accent color for emphasis. Clear, trustworthy and informative; no decorative textures, no script fonts."
  },
  {
    id: "colagem",
    label: "Revista / colagem",
    desc: "Recortes, sobreposições, fitas e papel: criativo e autoral.",
    prompt:
      "BASE STYLE: magazine collage. Cut-out photo edges, torn paper, tape strips, overlapping layers, mixed typography (a big serif word with small typewriter or sans text), halftone or risograph textures, handwritten notes used sparingly. Creative and authorial while keeping the text perfectly legible; the person in the photo is never cut or altered."
  }
];

export function stylePrompt(id) {
  return ART_STYLES.find((s) => s.id === id)?.prompt || "";
}
