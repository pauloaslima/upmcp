import Anthropic from "@anthropic-ai/sdk";
import { ContentAgentError, apiErrorMessage } from "./contentAgent";
import { asText, asTitle } from "./text";

// Designer de artes da Up! Digital (a "skill" de design dentro do sistema).
// Lê o perfil do cliente (identidade visual, tom de voz, linha editorial, observações, referências),
// o post (tema, texto da peça, briefing) e as imagens disponíveis, e devolve o projeto da arte:
// paleta, tipografia e, para cada página, o layout, os textos e qual foto usar.
// Quem desenha as imagens é lib/artRender.js, a partir deste projeto.

const MODEL = "claude-opus-5-5";

export const LAYOUTS = ["foto_cheia", "foto_topo", "tipografico", "lista", "citacao", "cta"];

const SYSTEM = `Você é designer sênior de social media da Up! Digital, agência de marketing em Vitória (ES).
Você cria a arte final de posts estáticos e carrosséis do Instagram para os clientes da agência.

Você recebe: o perfil do cliente (posicionamento, público, tom de voz, linhas editoriais, identidade visual, referências para as artes, observações), o post (tema, formato, linha editorial, texto da peça escrito pelo redator, briefing do diretor de arte), as fotos anexadas ao post (vistas como imagens, numeradas a partir de 0), a logo do cliente e, às vezes, posts de exemplo do cliente.

Como projetar:
- Siga a identidade visual do cliente. Cores: use SÓ códigos hex que aparecem na identidade visual ou que você vê claramente na logo e nos posts de exemplo. Nunca invente uma paleta fora da marca.
- Reproduza o estilo dos posts de exemplo e das "referências para as artes": composição, peso das fontes, uso de foto, rodapé.
- Texto: use o texto da peça do redator. Pode encurtar para caber, mas não troque o sentido nem invente dados (preço, data, promoção, número). Sem texto da peça, escreva a partir do tema e do briefing, no tom de voz do cliente.
- Títulos curtos e fortes (até 8 palavras de preferência). Texto de apoio curto (até 35 palavras por página). Hierarquia clara: título, apoio, chamada.
- "chamada_superior" (etiqueta acima do título) traz uma informação DIFERENTE do título: a linha editorial, a categoria ou o assunto (ex.: "Promoção", "Novidade", "Dica"). Nunca repita palavras do título na etiqueta. Se não houver nada diferente a dizer, deixe vazio.
- Nunca use travessão (—) nem meia-risca (–). Use vírgula, dois-pontos ou ponto.
- Nada de hashtags, emojis ou @ na arte (a não ser que o tom de voz do cliente peça emojis).
- Respeite tudo o que as observações importantes pedem para evitar.
- Nada na arte pode indicar que ela foi criada por automação ou inteligência artificial.

Formatos:
- Estático: exatamente 1 página.
- Carrossel: de 3 a 10 páginas. Página 1 é a capa (gancho forte, pouco texto). Distribua o texto do redator ("Página 1: …", "Página 2: …") uma página por item. A última página é a chamada para ação (layout "cta").
- Story: 1 página, vertical.

Layouts disponíveis (escolha um por página):
- "foto_cheia": foto ocupando a arte inteira, escurecida embaixo, com título e apoio por cima. Bom para capa e para fotos fortes.
- "foto_topo": foto em cima (cerca de 55%), bloco de cor embaixo com título e apoio.
- "tipografico": fundo na cor da marca, título grande e apoio. Para frases de impacto e páginas sem foto.
- "lista": título e até 6 itens curtos (um por linha no campo "texto", separados por quebra de linha).
- "citacao": frase em destaque (no "titulo") e quem disse ou o contexto (no "texto").
- "cta": chamada final, com o texto do botão no campo "cta".

Fotos:
- "foto": número da foto anexada a usar naquela página, ou -1 para nenhuma.
- Use as fotos anexadas quando existirem e combinarem com a página. Não repita a mesma foto em páginas seguidas, a não ser que só exista uma.
- Capa com foto: no estático e na página 1 do carrossel, use layout de foto ("foto_cheia" ou "foto_topo") sempre que houver foto anexada ou quando for permitido usar foto de banco (preencha "busca_foto"). Só use capa sem foto quando não houver nenhuma das duas.
- Clientes de comida, bebida, produto, moda, decoração, móveis, beleza ou espaço físico vendem pela imagem: use foto na capa e na maior parte das páginas. Páginas só com texto ficam para o meio do carrossel (listas, dicas, frases) e para a chamada final.
- "busca_foto": só quando o pedido permitir foto de banco de imagens e não houver foto anexada adequada. Escreva 2 a 5 palavras em INGLÊS descrevendo uma foto real e genérica ligada ao tema (ex.: "beach tennis player serve", "gourmet burger close up"). Nunca peça foto que pareça ser o produto, o espaço ou a equipe real do cliente, e para clientes de psicologia evite pacientes identificáveis. Deixe vazio quando não for usar foto de banco.
- Layouts de foto só com foto (anexada ou de banco). Sem foto, use "tipografico", "lista", "citacao" ou "cta".

Paleta (hex no formato #RRGGBB): "fundo" (fundo das páginas sem foto), "destaque" (cor de marca para faixas, números e botões), "texto" (texto sobre o fundo), "texto_sobre_foto" (normalmente #FFFFFF). Garanta contraste para leitura.
Tipografia: "moderna" (sem serifa, forte) ou "elegante" (títulos com serifa), conforme a marca.

"alertas": avisos curtos para a equipe (texto que não coube, falta de logo, cor não encontrada na identidade, foto ilustrativa usada, conflito com as observações). Lista vazia se não houver.
"resumo": 1 a 2 frases para a equipe explicando a ideia da arte.`;

const hex = { type: "string", description: "Cor no formato #RRGGBB" };

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["resumo", "paleta", "tipografia", "paginas", "alertas"],
  properties: {
    resumo: { type: "string" },
    paleta: {
      type: "object",
      additionalProperties: false,
      required: ["fundo", "destaque", "texto", "texto_sobre_foto"],
      properties: { fundo: hex, destaque: hex, texto: hex, texto_sobre_foto: hex }
    },
    tipografia: { type: "string", enum: ["moderna", "elegante"] },
    paginas: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["layout", "chamada_superior", "titulo", "texto", "cta", "foto", "busca_foto"],
        properties: {
          layout: { type: "string", enum: LAYOUTS },
          chamada_superior: { type: "string", description: "Etiqueta curta acima do título, diferente do título (ex.: linha editorial, 'Promoção', 'Dica'), ou vazio" },
          titulo: { type: "string" },
          texto: { type: "string" },
          cta: { type: "string", description: "Texto do botão (só no layout cta), ou vazio" },
          foto: { type: "integer", description: "Número da foto anexada, ou -1" },
          busca_foto: { type: "string", description: "Busca em inglês para foto de banco, ou vazio" }
        }
      }
    },
    alertas: { type: "array", items: { type: "string" } }
  }
};

// assets: { photos: [{ name, preview }], logo: { preview } | null, examples: [{ name, preview }] }
// preview = imagem pequena em base64 (JPEG) só para o designer enxergar
export async function designArt({ client, entry, assets, mode, guidance, stockAllowed }) {
  if (!process.env.ANTHROPIC_API_KEY) throw new ContentAgentError("Falta configurar ANTHROPIC_API_KEY no Vercel.");
  const brief = entry.brief || {};
  const pedido = {
    cliente: {
      nome: client.name,
      posicionamento: client.positioning || "",
      publico_alvo: client.target_audience || "",
      tom_de_voz: client.tone_of_voice || "",
      linhas_editoriais: client.editorial_lines || "",
      identidade_visual: client.identity || "",
      referencias_para_artes: client.art_references || "",
      observacoes_importantes: client.notes || ""
    },
    post: {
      dia: entry.day,
      formato: entry.format,
      tema: entry.theme,
      linha_editorial: entry.editorial_line || "",
      texto_da_peca: brief.piece_text || "",
      nao_pode_faltar: brief.must_have || "",
      orientacoes_do_diretor_de_arte: brief.important_notes || "",
      referencias: brief.refs_note || "",
      observacoes: entry.notes || ""
    },
    fotos_anexadas: assets.photos.map((p, i) => ({ numero: i, nome: p.name })),
    tem_logo: !!assets.logo,
    pode_usar_foto_de_banco: stockAllowed,
    modo: mode === "material" ? "usar só o material que já existe (fotos anexadas, logo e cores)" : "criar livremente; pode usar foto de banco de imagens",
    orientacao_da_equipe: guidance?.trim() || "nenhuma"
  };

  const content = [];
  assets.photos.forEach((p, i) => {
    content.push({ type: "text", text: `Foto anexada ${i}: ${p.name}` });
    content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: p.preview } });
  });
  if (assets.logo) {
    content.push({ type: "text", text: "Logo do cliente:" });
    content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: assets.logo.preview } });
  }
  assets.examples.forEach((p) => {
    content.push({ type: "text", text: `Post de exemplo do cliente (referência de estilo): ${p.name}` });
    content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: p.preview } });
  });
  content.push({ type: "text", text: JSON.stringify(pedido, null, 2) });

  const anthropic = new Anthropic();
  let response;
  try {
    response = await anthropic.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: { effort: "medium", format: { type: "json_schema", schema } },
      system: SYSTEM,
      messages: [{ role: "user", content }]
    });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) throw new ContentAgentError("A chave ANTHROPIC_API_KEY é inválida.");
    if (err instanceof Anthropic.RateLimitError) throw new ContentAgentError("Muitos pedidos ao mesmo tempo. Tente de novo em 1 minuto.");
    if (err instanceof Anthropic.APIError) throw new ContentAgentError(apiErrorMessage(err));
    throw err;
  }
  if (response.stop_reason === "refusal") throw new ContentAgentError("Não foi possível criar esta arte. Ajuste a orientação e tente de novo.");
  if (response.stop_reason === "max_tokens") throw new ContentAgentError("O projeto da arte ficou longo demais. Tente de novo.");

  let data;
  try {
    data = JSON.parse(response.content.filter((b) => b.type === "text").map((b) => b.text).join(""));
  } catch {
    throw new ContentAgentError("O projeto da arte veio fora do formato. Tente de novo.");
  }
  console.log("designer", { cliente: client.name, post: entry.id, paginas: data.paginas?.length, uso: response.usage });
  return cleanDesign(data, entry, assets.photos.length, stockAllowed);
}

const HEX = /^#[0-9a-f]{6}$/i;
const PHOTO_LAYOUTS = ["foto_cheia", "foto_topo"];

// a etiqueta repete o título? ("Sextou" x "Sextou com burger de respeito")
const words = (t) =>
  String(t || "")
    .normalize("NFD")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
function repeats(kicker, title) {
  const t = new Set(words(title));
  return words(kicker).some((w) => t.has(w));
}

function cleanDesign(data, entry, photoCount, stockAllowed) {
  const max = entry.format === "Carrossel" ? 10 : 1;
  const paginas = (data.paginas || []).slice(0, max).map((p) => ({
    layout: LAYOUTS.includes(p.layout) ? p.layout : "tipografico",
    chamada_superior: asTitle(p.chamada_superior || "").slice(0, 40),
    titulo: asTitle(p.titulo || "").slice(0, 160),
    texto: asText(p.texto || "").slice(0, 600),
    cta: asTitle(p.cta || "").slice(0, 40),
    foto: Number.isInteger(p.foto) && p.foto >= 0 && p.foto < photoCount ? p.foto : -1,
    busca_foto: stockAllowed ? String(p.busca_foto || "").slice(0, 80) : ""
  }));
  if (!paginas.length) throw new ContentAgentError("O projeto da arte veio sem páginas. Tente de novo.");
  for (const p of paginas) {
    if (p.chamada_superior && repeats(p.chamada_superior, p.titulo)) {
      const line = asTitle(entry.editorial_line || "").slice(0, 40);
      p.chamada_superior = line && !repeats(line, p.titulo) ? line : "";
    }
  }
  const cover = paginas[0];
  if (cover.layout === "tipografico" || cover.layout === "citacao") {
    const anotherQuery = paginas.find((p) => p.busca_foto)?.busca_foto || "";
    if (photoCount > 0) Object.assign(cover, { layout: "foto_cheia", foto: cover.foto >= 0 ? cover.foto : 0 });
    else if (stockAllowed && (cover.busca_foto || anotherQuery)) Object.assign(cover, { layout: "foto_cheia", busca_foto: cover.busca_foto || anotherQuery });
  }
  const paleta = Object.fromEntries(
    Object.entries({ fundo: "#FFFFFF", destaque: "#16213E", texto: "#22201B", texto_sobre_foto: "#FFFFFF" }).map(([k, fallback]) => [
      k,
      HEX.test(data.paleta?.[k] || "") ? data.paleta[k] : fallback
    ])
  );
  return {
    resumo: asText(data.resumo || ""),
    paleta,
    tipografia: data.tipografia === "elegante" ? "elegante" : "moderna",
    paginas,
    alertas: (data.alertas || []).map(asText).filter(Boolean)
  };
}
