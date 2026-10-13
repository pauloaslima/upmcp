import { PHOTO_LAYOUTS } from "./plan.js";

// Verificações objetivas da arte (feitas por código, não pela opinião do modelo).
// Erros críticos impedem a aprovação; problemas comuns pedem revisão.
// rendered: [{ width, height, bytes }] das páginas desenhadas; expected: { width, height }

const norm = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9%$@/]+/g, " ")
    .trim();

// todo o texto que aparece na arte
export function artText(plan, extra = []) {
  const parts = [...extra];
  for (const pg of plan.paginas) {
    parts.push(pg.chamada_superior, pg.titulo, pg.manuscrito, pg.texto, pg.centro, pg.cta, pg.rodape, pg.linha_de_apoio, pg.palavra_destaque, pg.assinatura, pg.itens);
    for (const b of pg.blocos || []) parts.push(b.titulo, b.texto);
  }
  return parts.filter(Boolean).join(" \n ");
}

const COLOR = /#[0-9a-f]{6}/gi;
const NEUTRAL = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return Math.max(r, g, b) - Math.min(r, g, b) < 24; // brancos, pretos e cinzas
};

export function runChecks({ plan, spec, format, rendered = [], expected, photoCount = 0, signatureText = [], clientColors = "" }) {
  const criticos = [];
  const problemas = [];
  const n = plan.paginas.length;

  // formato e quantidade de páginas
  if ((format === "Estático" || format === "Story") && n !== 1) criticos.push(`Formato errado: ${format} precisa de 1 página e saíram ${n}.`);
  if (format === "Carrossel" && (n < 3 || n > 10)) criticos.push(`Carrossel precisa de 3 a 10 páginas e saíram ${n}.`);
  if (spec?.quantidade_paginas && format === "Carrossel" && n !== spec.quantidade_paginas)
    problemas.push({ pagina: 0, texto: `O roteiro pede ${spec.quantidade_paginas} páginas e a arte tem ${n}.` });

  // arquivos: tamanho e integridade
  if (rendered.length && rendered.length !== n) criticos.push(`Foram desenhadas ${rendered.length} imagens para ${n} páginas.`);
  rendered.forEach((r, i) => {
    if (!r || !r.bytes) criticos.push(`Página ${i + 1}: arquivo vazio ou corrompido.`);
    else if (expected && (r.width !== expected.width || r.height !== expected.height))
      criticos.push(`Página ${i + 1}: tamanho ${r.width}×${r.height}, o certo é ${expected.width}×${expected.height}.`);
  });

  // textos obrigatórios: precisam aparecer exatamente (sem diferenciar maiúsculas e acentos)
  const all = norm(artText(plan, signatureText));
  for (const must of spec?.textos_obrigatorios || []) {
    if (norm(must) && !all.includes(norm(must))) criticos.push(`Texto obrigatório ausente ou alterado: "${must}".`);
  }

  plan.paginas.forEach((pg, i) => {
    const page = i + 1;
    const texts = [pg.titulo, pg.texto, pg.manuscrito, pg.chamada_superior, pg.rodape, ...(pg.blocos || []).flatMap((b) => [b.titulo, b.texto])].join(" ");
    if (/[—–]/.test(texts)) criticos.push(`Página ${page}: tem travessão ou meia-risca.`);
    if (/ilustrativ/i.test(texts)) criticos.push(`Página ${page}: menciona imagem ilustrativa.`);
    if (!pg.titulo && !["oferta", "comparacao"].includes(pg.layout)) problemas.push({ pagina: page, texto: "Página sem título." });
    if (pg.titulo.length > 70) problemas.push({ pagina: page, texto: `Título longo demais (${pg.titulo.length} caracteres) para leitura no celular.` });
    if (pg.texto.split(/\s+/).filter(Boolean).length > 45) problemas.push({ pagina: page, texto: "Texto de apoio longo demais para uma página." });
    const needsBlocks = { comparacao: 2, grade_icones: 4, lista_icones: 3, diagrama: 2, checklist: 3 }[pg.layout];
    if (needsBlocks && (pg.blocos || []).length < needsBlocks) problemas.push({ pagina: page, texto: `O layout ${pg.layout} precisa de pelo menos ${needsBlocks} itens e tem ${(pg.blocos || []).length}.` });
    if (PHOTO_LAYOUTS.includes(pg.layout) && pg.foto < 0) problemas.push({ pagina: page, texto: "Layout de foto sem foto: a página saiu tipográfica." });
  });

  // ritmo do carrossel: layouts repetidos em sequência e pouca variedade
  if (n >= 3) {
    for (let i = 1; i < n; i++) {
      if (plan.paginas[i].layout === plan.paginas[i - 1].layout) problemas.push({ pagina: i + 1, texto: `Páginas ${i} e ${i + 1} repetem o layout ${plan.paginas[i].layout}.` });
    }
    const distinct = new Set(plan.paginas.map((pg) => pg.layout)).size;
    const minimum = Math.min(4, n - 1);
    if (distinct < minimum) problemas.push({ pagina: 0, texto: `Pouca variedade: ${distinct} layouts diferentes em ${n} páginas.` });
  }

  // fotos reais disponíveis e não usadas
  if (photoCount > 0 && !plan.paginas.some((pg) => pg.foto >= 0)) problemas.push({ pagina: 0, texto: "Há fotos do cliente disponíveis e nenhuma foi usada." });

  // cores fora da configuração do cliente (quando ele tem cores definidas)
  const allowed = (String(clientColors).match(COLOR) || []).map((c) => c.toUpperCase());
  if (allowed.length) {
    const off = Object.entries(plan.paleta).filter(([, c]) => !allowed.includes(c.toUpperCase()) && !NEUTRAL(c));
    if (off.length) problemas.push({ pagina: 0, texto: `Cores fora da identidade configurada: ${off.map(([k, c]) => `${k} ${c}`).join(", ")}.` });
  }

  return { criticos, problemas, ok: !criticos.length && !problemas.length };
}
