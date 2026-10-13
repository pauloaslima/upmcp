import { asText, asTitle } from "../text.js";
import { QUALITY_RULES } from "./rules.js";
import { ICON_NAMES } from "./icons.js";

// AGENTE 2 | DIRETOR DE ARTE SÊNIOR  e  AGENTE 3 | ARQUITETO DE LAYOUT
// Rodam na mesma chamada ao modelo (para caber no tempo de uma criação), com papéis e saídas separados:
//   "direcao" é do diretor de arte (conceito, papel da foto, ritmo, paleta, tipografia, justificativa);
//   "paginas" é do arquiteto de layout (composição de cada página, foto, escala, foco, textos, elementos).
// O motor de arte (lib/artRender.js) desenha exatamente o que o plano diz.

export const LAYOUTS = [
  "foto_cheia",
  "foto_lateral",
  "foto_topo",
  "foto_base",
  "comparacao",
  "grade_icones",
  "lista_icones",
  "diagrama",
  "checklist",
  "tipografico",
  "lista",
  "citacao",
  "cta",
  "oferta"
];
// layouts que só existem com foto (sem foto, o motor usa o tipográfico)
export const PHOTO_LAYOUTS = ["foto_cheia", "foto_lateral", "foto_topo", "foto_base", "oferta"];
// layouts que aceitam foto como complemento
export const OPTIONAL_PHOTO_LAYOUTS = ["checklist"];
export const TITLE_FONTS = ["Montserrat", "Playfair", "Cormorant", "Anton"];
export const SCRIPT_FONTS = ["nenhuma", "GreatVibes", "Pacifico"];
const FOCUS = ["rosto", "centro", "topo", "base", "esquerda", "direita"];
const BACKGROUNDS = ["principal", "alternativo", "destaque"];
const DECOR = ["nenhuma", "formas_suaves", "linha"];
const GRADIENTS = ["nenhum", "suave", "medio"];

export const PLAN_SYSTEM = `Você trabalha na equipe de design da Up! Digital, agência de marketing em Vitória (ES), e faz dois papéis em sequência.

PAPEL 1 | DIRETOR DE ARTE SÊNIOR (campo "direcao", "paleta" e "tipografia")
Você tem experiência em design editorial, publicidade, composição fotográfica e branding. Decide COMO o conteúdo será apresentado. Não distribui textos sobre fundos coloridos: cria um conceito, define o papel da fotografia, o ritmo do carrossel e a linguagem gráfica, sempre dentro da identidade do cliente. Tem autonomia para ampliar, reduzir, recortar e reposicionar fotos, explorar assimetria, alternar fundos, criar páginas tipográficas, variar escala e eliminar decoração desnecessária. Toda decisão tem intenção e justificativa ("justificativa").
- Paleta (hex #RRGGBB) vinda da identidade: "fundo" (fundo principal, normalmente o tom claro ou neutro da marca), "fundo_alt" (fundo alternativo para páginas de contraste, normalmente o tom profundo da marca), "destaque" (cor de acento para palavras, ícones, botões), "texto" (texto sobre o fundo principal), "texto_sobre_foto" (normalmente #FFFFFF ou o tom claro). Use só cores da identidade visual, da configuração do cliente, da logo ou dos posts de exemplo. Nunca invente paleta.
- Tipografia: "titulo" entre ${TITLE_FONTS.join(", ")} (Montserrat = sem serifa moderna; Playfair = serifa editorial elegante; Cormorant = serifa refinada e delicada; Anton = condensada de impacto, varejo e promoção). "manuscrita" entre ${SCRIPT_FONTS.join(", ")} (GreatVibes = caligrafia elegante; Pacifico = descontraída), só se combinar com a marca. "caixa_alta" para títulos em maiúsculas.
- Se a configuração de direção de arte do cliente define fontes, cores ou o que evitar, ela manda.

PAPEL 2 | ARQUITETO DE LAYOUT (campo "paginas")
Transforma a direção em um plano específico de cada página, seguindo o roteiro da especificação (mesma quantidade de páginas e mesma ordem).
Para cada página defina: objetivo visual, layout, fundo, foto (qual, escala, foco, lado), textos, elementos gráficos e o lugar do texto. Com fotos de pessoas, analise rosto, olhar, mãos, postura, fundo e espaço negativo: escolha o foco e o lado para o rosto não ser cortado e o olhar conduzir ao texto.
Em carrossel, construa ritmo editorial: alterne composições (foto protagonista, comparação, ícones em colunas, foto ampliada com informações ao lado, diagrama, página tipográfica, página de alto contraste com fundo "alternativo", fechamento com foto humana e CTA). É um exemplo, não um modelo fixo: o conteúdo de cada página decide o layout. Duas páginas seguidas não repetem layout.

LAYOUTS DISPONÍVEIS (o motor desenha exatamente estes)
- "foto_cheia": foto ocupa a página inteira; título e apoio integrados por cima, na "posicao_texto", com degradê discreto só na área do texto. Ideal para capa com retrato forte.
- "foto_lateral": foto ocupa cerca de 58% da largura no "foto_lado", fundindo-se suavemente ao fundo; do outro lado, título, apoio e até 6 "blocos" com ícone (ex.: características). Ótimo para retrato ampliado com informações.
- "foto_topo": foto em cima (56% da altura) fundindo no fundo; título e apoio embaixo.
- "foto_base": título, apoio e botão de CTA em cima; foto na metade de baixo, subindo em transição suave. Ótimo para fechamento humano com CTA.
- "comparacao": dois cartões empilhados (ex.: MITO x VERDADE, antes x depois, errado x certo). "blocos"[0] = primeiro conceito (titulo curto em destaque + texto), "blocos"[1] = segundo conceito (fica em cartão de destaque). Ícones padrão: x e check.
- "grade_icones": título e de 4 a 6 "blocos" em duas colunas, cada um com ícone, título curto e texto curto. Para tipos, categorias, benefícios.
- "lista_icones": título e de 3 a 6 "blocos" em lista vertical com ícone, título e texto. Para características, passos, sinais.
- "diagrama": título, apoio e dois círculos que se cruzam: "blocos"[0] e "blocos"[1] são os dois conjuntos (titulo + texto curtíssimo) e "centro" é o que eles têm em comum.
- "checklist": título, apoio e de 3 a 6 itens com marca de verificação ("blocos", só o titulo de cada um); pode ter foto discreta no canto (campo "foto").
- "tipografico": tipografia protagonista, título grande com palavra em destaque e linha manuscrita opcional; fundo "principal", "alternativo" (alto contraste) ou "destaque".
- "lista": título e itens numerados (um por linha no "texto").
- "citacao": frase em destaque no "titulo" e autoria ou contexto no "texto".
- "cta": chamada final com botão ("cta").
- "oferta": peça de venda (comida, varejo, promoção): foto em cima, "linha_de_apoio", "palavra_destaque" gigante, "assinatura" manuscrita e "itens" (um por linha).

CAMPOS DE CADA PÁGINA
- "objetivo_visual": o que esta página precisa fazer o leitor sentir ou entender, e como a composição faz isso.
- "fundo": "principal", "alternativo" ou "destaque" (páginas sem foto inteira).
- "decoracao": "nenhuma", "formas_suaves" (formas orgânicas bem sutis na cor da marca) ou "linha" (fio fino de acabamento). Use só com função.
- "alinhamento": "esquerda" ou "centro". "posicao_texto": "topo", "centro" ou "embaixo" (páginas com foto inteira). "degrade": "nenhum", "suave" ou "medio" (nunca forte).
- "chamada_superior": etiqueta curta acima do título, diferente do título (ex.: "Educativo", "Importante", "Como identificar"), ou vazio.
- "titulo": curto e forte. "destaque_titulo": uma ou duas palavras do título que ganham a cor de destaque (copie exatamente como estão no título), ou vazio. "manuscrito": continuação curta do título em letra manuscrita (ex.: título "Superdotação não é tirar 10", manuscrito "em tudo"), só se a tipografia manuscrita estiver ativa; senão vazio.
- "texto": apoio curto (até 35 palavras). "blocos": lista de {icone, titulo, texto} conforme o layout (vazia nos outros). Ícones disponíveis: ${ICON_NAMES.join(", ")}. "centro": só no diagrama. "cta": texto do botão (foto_base e cta). "rodape": aviso pequeno pedido pelo cliente (ex.: "Válido até 31/10"), ou vazio.
- Oferta: "linha_de_apoio", "palavra_destaque", "assinatura", "itens" (vazios nos outros layouts).
- Foto: "foto" = número da foto disponível (ou -1). "foto_escala" de 1 a 1.8 (1 = enquadramento original; maior = aproxima). "foto_foco": rosto, centro, topo, base, esquerda ou direita (o que fica no centro do recorte). "foto_lado": direita ou esquerda (foto_lateral).
- "busca_foto": só se for permitido banco de imagens e não houver foto adequada: 4 a 8 palavras em inglês, específicas (assunto + ação + ambiente + luz). Senão vazio.
- "imagem_gerada": só se for permitido gerar imagem e não houver foto adequada; descreva a fotografia em inglês por partes (assunto, acao, enquadramento, luz, ambiente, espaco_para_texto). Nunca descreva a cliente, o produto, a fachada ou a equipe reais como se fossem eles. Senão, todos os campos vazios. No máximo 3 páginas com imagem gerada.

FOTOS
- As fotos disponíveis são o material principal: use as fotos reais da profissional ou do produto sempre que existirem. Nunca invente fotos da cliente.
- Capa (página 1): use foto quando houver foto disponível, banco permitido ou geração permitida.
- "textos_nas_fotos": para cada foto que você vai usar e que já tenha algo escrito (preço, frase, @, marca d'água), marque as áreas com texto em frações da foto (x, y, largura, altura de 0 a 1). Foto sem texto não entra.
- "fotos_fracas": fotos usadas que estão claramente ruins (escura, estourada, borrada, baixa resolução), com o problema EM INGLÊS em poucas palavras.

${QUALITY_RULES}

Se vier "revisao_anterior", a versão anterior foi reprovada: corrija cada problema apontado.
"alertas": avisos curtos para a equipe (texto que não coube, falta de foto, cor não encontrada, conflito). "resumo": 1 a 2 frases explicando o conceito para a equipe.`;

const hex = { type: "string", description: "Cor #RRGGBB" };
const str = { type: "string" };

export const planSchema = {
  type: "object",
  additionalProperties: false,
  required: ["direcao", "paleta", "tipografia", "paginas", "textos_nas_fotos", "fotos_fracas", "alertas", "resumo"],
  properties: {
    direcao: {
      type: "object",
      additionalProperties: false,
      required: ["conceito", "mensagem_principal", "primeiro_olhar", "papel_da_foto", "tratamento_foto", "ritmo", "justificativa"],
      properties: {
        conceito: str,
        mensagem_principal: str,
        primeiro_olhar: str,
        papel_da_foto: str,
        tratamento_foto: str,
        ritmo: { type: "string", description: "Como as páginas se alternam e por quê" },
        justificativa: str
      }
    },
    paleta: {
      type: "object",
      additionalProperties: false,
      required: ["fundo", "fundo_alt", "destaque", "texto", "texto_sobre_foto"],
      properties: { fundo: hex, fundo_alt: hex, destaque: hex, texto: hex, texto_sobre_foto: hex }
    },
    tipografia: {
      type: "object",
      additionalProperties: false,
      required: ["titulo", "manuscrita", "caixa_alta"],
      properties: { titulo: { type: "string", enum: TITLE_FONTS }, manuscrita: { type: "string", enum: SCRIPT_FONTS }, caixa_alta: { type: "boolean" } }
    },
    paginas: { type: "array", items: pageSchema() },
    textos_nas_fotos: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["foto", "regioes"],
        properties: {
          foto: { type: "integer" },
          regioes: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["x", "y", "largura", "altura"],
              properties: { x: { type: "number" }, y: { type: "number" }, largura: { type: "number" }, altura: { type: "number" } }
            }
          }
        }
      }
    },
    fotos_fracas: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["foto", "problema"], properties: { foto: { type: "integer" }, problema: str } }
    },
    alertas: { type: "array", items: str },
    resumo: str
  }
};

export function pageSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "objetivo_visual", "layout", "fundo", "decoracao", "alinhamento", "posicao_texto", "degrade",
      "chamada_superior", "titulo", "destaque_titulo", "manuscrito", "texto", "blocos", "centro", "cta", "rodape",
      "linha_de_apoio", "palavra_destaque", "assinatura", "itens",
      "foto", "foto_escala", "foto_foco", "foto_lado", "busca_foto", "imagem_gerada"
    ],
    properties: {
      objetivo_visual: str,
      layout: { type: "string", enum: LAYOUTS },
      // listas de opções ficam na descrição (validadas por código em cleanPage) para o formato não ficar pesado
      fundo: { type: "string", description: BACKGROUNDS.join(" | ") },
      decoracao: { type: "string", description: DECOR.join(" | ") },
      alinhamento: { type: "string", description: "esquerda | centro" },
      posicao_texto: { type: "string", description: "topo | centro | embaixo" },
      degrade: { type: "string", description: GRADIENTS.join(" | ") },
      chamada_superior: str,
      titulo: str,
      destaque_titulo: str,
      manuscrito: str,
      texto: str,
      blocos: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["icone", "titulo", "texto"],
          properties: { icone: { type: "string", description: "Nome de um ícone da lista, ou vazio" }, titulo: str, texto: str }
        }
      },
      centro: str,
      cta: str,
      rodape: str,
      linha_de_apoio: str,
      palavra_destaque: str,
      assinatura: str,
      itens: str,
      foto: { type: "integer" },
      foto_escala: { type: "number" },
      foto_foco: { type: "string", description: FOCUS.join(" | ") },
      foto_lado: { type: "string", description: "direita | esquerda" },
      busca_foto: str,
      imagem_gerada: {
        type: "object",
        additionalProperties: false,
        required: ["assunto", "acao", "enquadramento", "luz", "ambiente", "espaco_para_texto"],
        properties: { assunto: str, acao: str, enquadramento: str, luz: str, ambiente: str, espaco_para_texto: str }
      }
    }
  };
}

// ---------- limpeza e validação ----------
const HEX = /^#[0-9a-f]{6}$/i;
// "*Imagem ilustrativa.", "Imagens meramente ilustrativas", "foto ilustrativa"… nunca vão para a arte
const ILLUSTRATIVE = /\*?\s*(imagem|imagens|fotos?)\s+(meramente\s+)?ilustrativ[ao]s?\.?/gi;
export const noDisclaimer = (t) => String(t || "").replace(ILLUSTRATIVE, "").replace(/\s{2,}/g, " ").replace(/\s+([.,;:!?])/g, "$1").trim();
const clamp01 = (v) => (Number.isFinite(Number(v)) ? Math.max(0, Math.min(1, Number(v))) : 0);
const pick = (v, options, fallback) => (options.includes(v) ? v : fallback);
const t = (v, max) => noDisclaimer(asTitle(String(v || ""))).slice(0, max);
const p = (v, max) => noDisclaimer(asText(String(v || ""))).slice(0, max);

// a etiqueta repete o título? ("Sextou" x "Sextou com burger de respeito")
const words = (s) =>
  String(s || "")
    .normalize("NFD")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
export function repeats(kicker, title) {
  const set = new Set(words(title));
  return words(kicker).some((w) => set.has(w));
}

// uma página do plano, normalizada. photoCount = fotos disponíveis no acervo da rodada
export function cleanPage(page, { photoCount = 0, stockAllowed = false, genAllowed = false, script = true } = {}) {
  const g = page?.imagem_gerada || {};
  const gen = genAllowed && String(g.assunto || "").trim();
  const out = {
    objetivo_visual: p(page?.objetivo_visual, 400),
    layout: pick(page?.layout, LAYOUTS, "tipografico"),
    fundo: pick(page?.fundo, BACKGROUNDS, "principal"),
    decoracao: pick(page?.decoracao, DECOR, "nenhuma"),
    alinhamento: pick(page?.alinhamento, ["esquerda", "centro"], "esquerda"),
    posicao_texto: pick(page?.posicao_texto, ["topo", "centro", "embaixo"], "embaixo"),
    degrade: pick(page?.degrade, GRADIENTS, "suave"),
    chamada_superior: t(page?.chamada_superior, 40),
    titulo: t(page?.titulo, 160),
    destaque_titulo: t(page?.destaque_titulo, 40),
    manuscrito: script ? t(page?.manuscrito, 40) : "",
    texto: p(page?.texto, 600),
    blocos: (Array.isArray(page?.blocos) ? page.blocos : [])
      .map((b) => ({ icone: ICON_NAMES.includes(b?.icone) ? b.icone : "", titulo: t(b?.titulo, 60), texto: p(b?.texto, 160) }))
      .filter((b) => b.titulo || b.texto)
      .slice(0, 6),
    centro: t(page?.centro, 40),
    cta: t(page?.cta, 40),
    rodape: p(page?.rodape, 80),
    linha_de_apoio: t(page?.linha_de_apoio, 90),
    palavra_destaque: t(page?.palavra_destaque, 14),
    assinatura: t(page?.assinatura, 32),
    itens: p(page?.itens, 200),
    foto: Number.isInteger(page?.foto) && page.foto >= 0 && page.foto < photoCount ? page.foto : -1,
    foto_escala: Math.max(1, Math.min(1.8, Number(page?.foto_escala) || 1)),
    foto_foco: pick(page?.foto_foco, FOCUS, "rosto"),
    foto_lado: pick(page?.foto_lado, ["direita", "esquerda"], "direita"),
    busca_foto: stockAllowed ? String(page?.busca_foto || "").slice(0, 80) : "",
    imagem_gerada: gen
      ? Object.fromEntries(["assunto", "acao", "enquadramento", "luz", "ambiente", "espaco_para_texto"].map((k) => [k, String(g[k] || "").slice(0, 300)]))
      : null
  };
  // destaque só vale se a palavra estiver mesmo no título
  if (out.destaque_titulo && !out.titulo.toLowerCase().includes(out.destaque_titulo.toLowerCase())) out.destaque_titulo = "";
  return out;
}

// Plano completo, já com as regras do sistema aplicadas.
// config: configuração de direção de arte do cliente (clients.art_config)
export function cleanPlan(data, { spec, format, photoCount = 0, stockAllowed = false, genAllowed = false, config = {}, editorialLine = "" }) {
  const max = format === "Carrossel" ? 10 : 1;
  const wanted = spec?.quantidade_paginas || (format === "Carrossel" ? 0 : 1);
  const tipografia = {
    titulo: config.fonte_titulo && TITLE_FONTS.includes(config.fonte_titulo) ? config.fonte_titulo : pick(data?.tipografia?.titulo, TITLE_FONTS, "Montserrat"),
    manuscrita:
      config.fonte_manuscrita && SCRIPT_FONTS.includes(config.fonte_manuscrita) ? config.fonte_manuscrita : pick(data?.tipografia?.manuscrita, SCRIPT_FONTS, "nenhuma"),
    caixa_alta: !!data?.tipografia?.caixa_alta
  };
  const script = tipografia.manuscrita !== "nenhuma";
  let paginas = (data?.paginas || []).slice(0, max).map((pg) => cleanPage(pg, { photoCount, stockAllowed, genAllowed, script }));
  if (!paginas.length) throw new Error("O plano da arte veio sem páginas.");
  if (wanted && paginas.length > wanted) paginas = paginas.slice(0, wanted);

  // etiqueta igual ao título vira a linha editorial (ou some)
  for (const pg of paginas) {
    if (pg.chamada_superior && repeats(pg.chamada_superior, pg.titulo)) {
      const line = asTitle(editorialLine || "").slice(0, 40);
      pg.chamada_superior = line && !repeats(line, pg.titulo) ? line : "";
    }
  }
  // página de foto sem fonte de imagem recebe uma foto disponível (em rodízio)
  if (photoCount > 0) {
    let next = 0;
    for (const pg of paginas) {
      if (PHOTO_LAYOUTS.includes(pg.layout) && pg.foto < 0 && !pg.busca_foto && !pg.imagem_gerada) {
        pg.foto = next % photoCount;
        next++;
      }
    }
  }
  // capa com foto sempre que houver como
  const cover = paginas[0];
  if (!PHOTO_LAYOUTS.includes(cover.layout)) {
    const query = paginas.find((pg) => pg.busca_foto)?.busca_foto || "";
    if (photoCount > 0) Object.assign(cover, { layout: "foto_cheia", foto: cover.foto >= 0 ? cover.foto : 0 });
    else if (cover.imagem_gerada) cover.layout = "foto_cheia";
    else if (stockAllowed && (cover.busca_foto || query)) Object.assign(cover, { layout: "foto_cheia", busca_foto: cover.busca_foto || query });
  }
  // no máximo 3 imagens geradas por arte
  let generated = 0;
  for (const pg of paginas) {
    if (pg.imagem_gerada && (pg.foto >= 0 || ++generated > 3)) pg.imagem_gerada = null;
  }

  const fallback = { fundo: "#FFFFFF", fundo_alt: "#1F1B2E", destaque: "#7A5C99", texto: "#1F1B2E", texto_sobre_foto: "#FFFFFF" };
  const paleta = Object.fromEntries(Object.entries(fallback).map(([k, f]) => [k, HEX.test(data?.paleta?.[k] || "") ? data.paleta[k].toUpperCase() : f]));
  const d = data?.direcao || {};
  return {
    direcao: Object.fromEntries(
      ["conceito", "mensagem_principal", "primeiro_olhar", "papel_da_foto", "tratamento_foto", "ritmo", "justificativa"].map((k) => [k, p(d[k], 600)])
    ),
    paleta,
    tipografia,
    paginas,
    textos_nas_fotos: (data?.textos_nas_fotos || [])
      .filter((x) => Number.isInteger(x.foto) && x.foto >= 0 && x.foto < photoCount)
      .map((x) => ({
        foto: x.foto,
        regioes: (x.regioes || [])
          .map((r) => ({ x: clamp01(r.x), y: clamp01(r.y), largura: clamp01(r.largura), altura: clamp01(r.altura) }))
          .filter((r) => r.largura > 0.01 && r.altura > 0.01 && r.largura * r.altura < 0.6)
      }))
      .filter((x) => x.regioes.length),
    fotos_fracas: (data?.fotos_fracas || [])
      .filter((f) => Number.isInteger(f.foto) && f.foto >= 0 && f.foto < photoCount)
      .map((f) => ({ foto: f.foto, problema: String(f.problema || "").slice(0, 120) })),
    alertas: (data?.alertas || []).map((a) => p(a, 300)).filter(Boolean),
    resumo: p(data?.resumo, 500)
  };
}
