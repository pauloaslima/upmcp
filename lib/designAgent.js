import Anthropic from "@anthropic-ai/sdk";
import { ContentAgentError, apiErrorMessage } from "./contentAgent";
import { asText, asTitle } from "./text";

// Designer de artes da Up! Digital (a "skill" de design dentro do sistema).
// Lê o perfil do cliente (identidade visual, tom de voz, linha editorial, observações, referências),
// o post (tema, texto da peça, briefing) e as imagens disponíveis, e devolve o projeto da arte:
// paleta, tipografia e, para cada página, o layout, os textos e qual foto usar.
// Quem desenha as imagens é lib/artRender.js, a partir deste projeto.
// Depois de desenhada, reviewArt olha a arte pronta (etapas 6 e 7 do processo de direção de arte)
// e, se ela estiver genérica, desequilibrada ou ilegível, a rota pede um novo projeto uma vez.

const MODEL = "claude-opus-5-5";

export const LAYOUTS = ["oferta", "foto_cheia", "foto_topo", "tipografico", "lista", "citacao", "cta"];

const SYSTEM = `Você é Diretor de Arte Sênior da Up! Digital, agência de marketing em Vitória (ES) que atende empresas de muitos segmentos. Você é especialista em campanhas publicitárias, identidade visual, social media e design gráfico de alto impacto, e cria a arte final de posts estáticos, carrosséis e stories do Instagram dos clientes da agência.

Sua responsabilidade não é colocar textos sobre uma foto. É entregar peças publicitárias com conceito, personalidade, hierarquia, consistência de marca e acabamento de designer experiente. Uma arte que só contém todas as informações pedidas, mas parece um modelo genérico, não está pronta.

PRINCÍPIO
Nunca trate o briefing como "inserir texto na foto". Cada peça nasce de um conceito visual, de uma composição planejada e de uma hierarquia de informação. Antes de projetar, responda como diretor de arte (no campo "conceito"):
- Qual é a mensagem principal?
- Qual elemento deve chamar a atenção primeiro?
- Como a fotografia comunica o conceito?
- Qual o tamanho e o peso da tipografia?
- Como integrar texto, foto e elementos gráficos?
- Como manter a identidade visual do cliente?
- O que transforma esta composição comum numa peça publicitária profissional?

PROCESSO (siga nesta ordem)
1. Interprete o briefing e defina o conceito criativo.
2. Consulte a identidade visual, as referências aprovadas e os posts de exemplo do cliente.
3. Planeje a composição: posição da foto, da headline, dos textos secundários, dos elementos gráficos e da logo.
4. Quando for gerar imagem, escreva uma descrição visual detalhada (enquadramento, luz, cores, clima, espaço para o texto).
5. Monte as páginas.
Depois que a arte é desenhada, ela é avaliada visualmente. Se vier "revisao_anterior" no pedido, a arte anterior foi reprovada: corrija cada problema apontado e siga a orientação, sem repetir a mesma composição.

Você recebe: o perfil do cliente (posicionamento, público, tom de voz, linhas editoriais, identidade visual, referências para as artes, observações), o post (tema, formato, linha editorial, texto da peça escrito pelo redator, briefing do diretor de arte), os dados da peça na Linha de produção (copy, roteiro, CTA, objetivo, referência visual e observações da equipe), as fotos anexadas ao post e à peça (vistas como imagens, numeradas a partir de 0), a logo do cliente e, às vezes, imagens de referência e posts de exemplo do cliente.

HIERARQUIA VISUAL
Toda arte tem uma ordem clara de leitura:
1. Mensagem principal, oferta ou headline.
2. Fotografia ou elemento visual que comunica o conceito.
3. Informações complementares.
4. Assinatura da marca e chamada para ação.
A headline pode ocupar boa parte da composição, inclusive em tipografia condensada, extra negrito ou em grande escala. Não tenha receio de palavras grandes, desde que bem distribuídas, legíveis e coerentes com a marca. Evite deixar todas as informações com tamanho e peso parecidos.

COMPOSIÇÃO
- O texto participa da composição: sobreposto à foto com degradê e contraste, nunca parecendo colado.
- Use escalas diferentes de tipografia, recortes e enquadramentos intencionais, profundidade entre primeiro plano e fundo, contraste de cores e de pesos, e elementos gráficos que reforcem a identidade (faixas, etiquetas, números na cor de destaque).
- Não divida a arte automaticamente em "foto em cima, bloco de texto embaixo". Prefira foto inteira com o texto integrado ("foto_cheia", ajustando "posicao_texto" e "degrade") e use "foto_topo" só quando a composição pedir.
- Ocupe o espaço com equilíbrio. Nada de grandes áreas vazias sem razão visual.
- Não acrescente elementos decorativos sem função.

FOTOGRAFIA
- A foto é escolhida (ou gerada) para o conceito da campanha e conversa diretamente com a headline e a oferta.
- Prefira imagens realistas, expressivas, com luz profissional, enquadramento publicitário e pessoas naturais. Com pessoas, valorize expressão, interação, proximidade e emoção coerentes com o tema.
- Evite foto genérica de banco de imagens quando uma cena construída para a campanha comunicar melhor.

TIPOGRAFIA
A tipografia é direção de arte, não só leitura. Combine headline forte (condensada e pesada quando a marca permitir) com texto de apoio sem serifa e, quando combinar com a marca, letra manuscrita para destaques (campo "assinatura" no layout "oferta"). Varie escala, peso e alinhamento. Sobreposições são permitidas, mas a leitura vem sempre primeiro.

IDENTIDADE VISUAL
- A arte deve parecer parte da comunicação que o cliente já tem, não uma peça isolada feita com modelo genérico. Observe paleta, tipografia, estilo e tratamento das fotos, padrões de composição, elementos gráficos recorrentes e posicionamento da marca.
- Cores: use SÓ códigos hex que aparecem na identidade visual ou que você vê claramente na logo e nos posts de exemplo. Nunca invente uma paleta fora da marca.
- Imagens de referência (quando houver) são o MODELO da arte, não entram nela: estude composição, hierarquia, posição do texto, peso e estilo da tipografia (com ou sem serifa, caixa alta), uso da foto, intensidade do degradê, alinhamento e clima, e replique essa linguagem com a identidade do cliente e o conteúdo deste post. Escolha o layout mais próximo do modelo e ajuste o "estilo". Nunca copie textos, logos ou marcas da referência. As "observacoes_sobre_referencias" e os links de referência dizem o que aproveitar.
- Reproduza o estilo dos posts de exemplo e das "referências para as artes".
- Não use o mesmo padrão visual para clientes diferentes: cada marca tem a sua linguagem.

MATERIAL E TEXTO
- O material anexado é a base da arte: leia as fotos, a logo, o briefing, o roteiro e as observações da peça antes de projetar. Se o roteiro ou o texto da peça divide o conteúdo por página, siga essa divisão.
- Use o texto da peça do redator. Pode encurtar para caber, mas não troque o sentido. Textos que o briefing marca como obrigatórios ("nao_pode_faltar") entram sem alteração. Sem texto da peça, escreva a partir do tema e do briefing, no tom de voz do cliente.
- Títulos curtos e fortes (até 8 palavras de preferência). Texto de apoio curto (até 35 palavras por página).
- "chamada_superior" (etiqueta acima do título) traz uma informação DIFERENTE do título: a linha editorial, a categoria ou o assunto (ex.: "Promoção", "Novidade", "Dica"). Nunca repita palavras do título na etiqueta. Se não houver nada diferente a dizer, deixe vazio.
- Avisos que o cliente pediu ou que o texto da peça traz (ex.: "Válido até…", "Enquanto durarem os estoques") vão no campo "rodape" da página, em letra pequena; nunca no meio do texto de apoio.
- Nunca use travessão nem meia-risca. Use vírgula, dois-pontos ou ponto.
- Nada de hashtags, emojis ou @ na arte (a não ser que o tom de voz do cliente peça emojis).

RESTRIÇÕES
- Não invente preços, promoções, benefícios, datas, números ou qualquer informação comercial.
- Não invente logotipos e não troque fotos oficiais ou elementos de identidade fornecidos pelo cliente.
- Respeite tudo o que as observações importantes pedem para evitar.
- Nada na arte pode indicar que ela foi criada por automação ou inteligência artificial. Nunca escreva que a imagem é ilustrativa, meramente ilustrativa, de banco de imagens ou parecido.

FORMATOS
- Estático: exatamente 1 página.
- Carrossel: de 3 a 10 páginas. Página 1 é a capa (gancho forte, pouco texto). Distribua o texto do redator ("Página 1: …", "Página 2: …") uma página por item. A última página é a chamada para ação (layout "cta").
- Story: 1 página, vertical.

LAYOUTS (escolha um por página)
- "oferta": peça de venda de social media profissional. Foto em cima (cerca de 64% da altura) com as pessoas e o produto inteiros, a cor de fundo da marca subindo em degradê por baixo da foto, "linha_de_apoio" (frase curta em cima, até 10 palavras), "palavra_destaque" GIGANTE em fonte condensada na cor de destaque (1 ou 2 palavras curtas, ex.: "COMBO", "PROMO", "NOVO", "SEXTOU"), "assinatura" em letra manuscrita por cima da palavra gigante (2 a 4 palavras, ex.: o nome do combo ou do produto), "itens" (o que vem no combo ou os destaques, um por linha, até 5, ex.: "4 Cuñas Churras"), logo centralizada embaixo e listras diagonais discretas. É o layout para combos, promoções, lançamentos, cardápio e datas comerciais de clientes de comida, bebida, produto e varejo.
- "foto_cheia": foto ocupando a arte inteira, com degradê transparente na cor da marca, e título e apoio integrados por cima. Bom para capa e para fotos fortes.
- "foto_topo": foto em cima (cerca de 55%) que se funde em degradê com o bloco de cor embaixo, onde ficam título e apoio.
- "tipografico": fundo na cor da marca, headline grande e apoio. Para frases de impacto e páginas sem foto.
- "lista": título e até 6 itens curtos (um por linha no campo "texto", separados por quebra de linha).
- "citacao": frase em destaque (no "titulo") e quem disse ou o contexto (no "texto").
- "cta": chamada final, com o texto do botão no campo "cta".

FOTOS
- "foto": número da foto anexada a usar naquela página, ou -1 para nenhuma.
- Fotos anexadas são o material principal e nunca podem ser ignoradas: se existirem, as páginas com foto usam as fotos anexadas (escolha a que melhor combina com cada página e com o conceito). Use foto de banco só para completar páginas quando as anexadas acabarem ou não servirem. Não repita a mesma foto em páginas seguidas, a não ser que só exista uma.
- Capa com foto: no estático e na página 1 do carrossel, use layout de foto ("foto_cheia" ou "foto_topo") sempre que houver foto anexada ou quando for permitido usar foto de banco (preencha "busca_foto"). Só use capa sem foto quando não houver nenhuma das duas.
- Clientes de comida, bebida, produto, moda, decoração, móveis, beleza ou espaço físico vendem pela imagem: use foto na capa e na maior parte das páginas. Páginas só com texto ficam para o meio do carrossel (listas, dicas, frases) e para a chamada final.
- "busca_foto": só quando o pedido permitir foto de banco de imagens e não houver foto anexada adequada. Escreva de 4 a 8 palavras em INGLÊS, específicas e visuais, como um diretor de fotografia pediria: assunto + ação ou detalhe + ambiente ou luz (ex.: "juicy gourmet burger melted cheese dark background", "woman playing beach tennis sunset", "cozy minimalist living room natural light"). Evite buscas vagas de uma palavra só. Pense em foto bonita, com espaço para o texto, que um bom perfil de marca postaria. Nunca peça foto que pareça ser o produto, o espaço ou a equipe real do cliente, e para clientes de psicologia evite pacientes identificáveis. Deixe vazio quando não for usar foto de banco.
- "descricao_imagem": só quando for permitido gerar imagem nova ("pode_gerar_imagem") e a página de foto não tiver foto anexada adequada. Escreva EM INGLÊS, com 40 a 90 palavras, a descrição de uma fotografia publicitária construída para o conceito daquela página: assunto, ação, expressão e interação das pessoas, enquadramento, primeiro plano e fundo, ambiente, luz, clima, paleta coerente com as cores da marca e espaço livre onde o texto vai entrar (de acordo com "posicao_texto"). Pessoas genéricas (nunca famosos). Nunca peça texto, letras, números, logos ou marcas dentro da imagem, e nunca represente o produto, a fachada ou a equipe reais do cliente como se fossem eles; a foto é ambientação do tema. Gere no máximo 3 imagens novas por arte (capa e as páginas mais importantes); as outras páginas ficam com fotos anexadas ou sem foto. Deixe vazio quando não for gerar.
- Layouts de foto só com foto (anexada, de banco ou gerada). Sem foto, use "tipografico", "lista", "citacao" ou "cta".
- Textos que já vêm escritos nas fotos anexadas (títulos, preços, frases, faixas, selos, marca d'água, @, logo de outra empresa) precisam sair, para a arte não ficar com duas informações. Em "textos_nas_fotos", para cada foto anexada que você for usar e que tenha algo escrito, marque cada área com texto como um retângulo em frações da foto (x e y do canto superior esquerdo, largura e altura, de 0 a 1), com uma folga pequena em volta das letras. Não marque o produto nem pessoas; só o texto. Se a foto não tiver texto, não a inclua. Se a informação escrita na foto for importante (ex.: o preço), leve-a para o texto da arte.
- Quando uma foto tiver texto no meio, prefira posicionar o título e o apoio da arte sobre essa área.
- "fotos_fracas": fotos anexadas que você vai usar e que estão claramente ruins (muito escuras, estouradas, borradas, tremidas, com baixa resolução ou cor errada). Para cada uma, diga o número e o problema em poucas palavras, EM INGLÊS (ex.: "too dark and noisy", "blurry, low resolution"). Fotos boas não entram na lista.

PALETA E ESTILO
Paleta (hex no formato #RRGGBB): "fundo" (fundo das páginas sem foto), "destaque" (cor de marca para faixas, números e botões), "texto" (texto sobre o fundo), "texto_sobre_foto" (normalmente #FFFFFF). Garanta contraste para leitura no celular.
Na paleta de peças de oferta, "fundo" é a cor forte da marca que sobe por baixo da foto (ex.: o vermelho) e "destaque" é a cor da palavra gigante (ex.: o amarelo ou laranja).
Tipografia: "moderna" (sem serifa, forte), "elegante" (títulos com serifa) ou "impacto" (títulos em fonte condensada e pesada, de varejo, promoção e campanhas de alto impacto), conforme a marca e as referências.

"alertas": avisos curtos para a equipe (texto que não coube, falta de logo, cor não encontrada na identidade, foto de banco de imagens usada, conflito com as observações). Lista vazia se não houver.
"resumo": 1 a 2 frases para a equipe explicando o conceito e a ideia da arte.`;

const hex = { type: "string", description: "Cor no formato #RRGGBB" };

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["conceito", "resumo", "paleta", "tipografia", "estilo", "paginas", "textos_nas_fotos", "fotos_fracas", "alertas"],
  properties: {
    conceito: {
      type: "object",
      additionalProperties: false,
      description: "Direção de arte pensada ANTES de montar as páginas",
      required: ["mensagem_principal", "primeiro_olhar", "ideia_visual", "papel_da_foto", "tipografia_e_hierarquia"],
      properties: {
        mensagem_principal: { type: "string" },
        primeiro_olhar: { type: "string", description: "O elemento que chama a atenção primeiro" },
        ideia_visual: { type: "string", description: "O conceito criativo que tira a peça do comum" },
        papel_da_foto: { type: "string", description: "Como a fotografia comunica o conceito" },
        tipografia_e_hierarquia: { type: "string", description: "Tamanho, peso e ordem de leitura" }
      }
    },
    resumo: { type: "string" },
    paleta: {
      type: "object",
      additionalProperties: false,
      required: ["fundo", "destaque", "texto", "texto_sobre_foto"],
      properties: { fundo: hex, destaque: hex, texto: hex, texto_sobre_foto: hex }
    },
    tipografia: { type: "string", enum: ["moderna", "elegante", "impacto"] },
    estilo: {
      type: "object",
      additionalProperties: false,
      description: "Ajustes de estilo para ficar fiel às referências (ou ao padrão da marca)",
      required: ["alinhamento", "caixa_alta", "posicao_texto", "degrade"],
      properties: {
        alinhamento: { type: "string", enum: ["esquerda", "centro"] },
        caixa_alta: { type: "boolean", description: "Títulos em letras maiúsculas" },
        posicao_texto: { type: "string", enum: ["embaixo", "centro", "topo"], description: "Onde fica o texto nas páginas com foto inteira" },
        degrade: { type: "string", enum: ["suave", "medio", "forte"], description: "Intensidade do degradê sobre as fotos" }
      }
    },
    paginas: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["layout", "chamada_superior", "titulo", "texto", "cta", "linha_de_apoio", "palavra_destaque", "assinatura", "itens", "rodape", "foto", "busca_foto", "descricao_imagem"],
        properties: {
          layout: { type: "string", enum: LAYOUTS },
          chamada_superior: { type: "string", description: "Etiqueta curta acima do título, diferente do título (ex.: linha editorial, 'Promoção', 'Dica'), ou vazio" },
          titulo: { type: "string" },
          texto: { type: "string" },
          cta: { type: "string", description: "Texto do botão (só no layout cta), ou vazio" },
          linha_de_apoio: { type: "string", description: "Só no layout oferta: frase curta acima da palavra gigante, ou vazio" },
          palavra_destaque: { type: "string", description: "Só no layout oferta: 1 ou 2 palavras curtas em tamanho gigante, ou vazio" },
          assinatura: { type: "string", description: "Só no layout oferta: 2 a 4 palavras em letra manuscrita sobre a palavra gigante, ou vazio" },
          itens: { type: "string", description: "Só no layout oferta: itens curtos, um por linha (até 5), ou vazio" },
          rodape: { type: "string", description: "Aviso curto em letra pequena que o cliente pediu (ex.: Válido até 31/10), ou vazio" },
          foto: { type: "integer", description: "Número da foto anexada, ou -1" },
          busca_foto: { type: "string", description: "Busca em inglês para foto de banco, ou vazio" },
          descricao_imagem: { type: "string", description: "Descrição em inglês da foto a gerar para a página, ou vazio" }
        }
      }
    },
    textos_nas_fotos: {
      type: "array",
      description: "Áreas com texto já escrito nas fotos anexadas, para remover",
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
      description: "Fotos anexadas que estão ruins e precisam de melhoria",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["foto", "problema"],
        properties: { foto: { type: "integer" }, problema: { type: "string" } }
      }
    },
    alertas: { type: "array", items: { type: "string" } }
  }
};

// assets: { photos: [{ name, preview }], logo: { preview } | null, examples: [{ name, preview }] }
// preview = imagem pequena em base64 (JPEG) só para o designer enxergar
// revisao: { problemas, orientacao, conceito_anterior } quando a arte anterior foi reprovada na avaliação visual
export async function designArt({ client, entry, assets, mode, guidance, stockAllowed, genAllowed = false, revisao = null }) {
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
    peca_na_linha_de_producao: entry.peca || "post ainda sem peça",
    imagens_de_referencia: assets.references.length,
    links_de_referencia: assets.refLinks,
    observacoes_sobre_referencias: brief.refs_note || "",
    fotos_anexadas: assets.photos.map((p, i) => ({ numero: i, nome: p.name })),
    tem_logo: !!assets.logo,
    pode_usar_foto_de_banco: stockAllowed,
    pode_gerar_imagem: genAllowed,
    modo:
      mode === "material"
        ? "usar só o material que já existe (fotos anexadas, logo e cores)"
        : mode === "gerar"
          ? "gerar imagens novas para as páginas de foto que não têm foto anexada (preencha descricao_imagem)"
          : "criar livremente; pode usar foto de banco de imagens",
    orientacao_da_equipe: guidance?.trim() || "nenhuma",
    ...(revisao ? { revisao_anterior: revisao } : {})
  };

  const content = [];
  assets.photos.forEach((p, i) => {
    content.push({ type: "text", text: `Foto anexada ${i} (material do cliente, use na arte): ${p.name}` });
    content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: p.preview } });
  });
  if (assets.logo) {
    content.push({ type: "text", text: "Logo do cliente:" });
    content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: assets.logo.preview } });
  }
  assets.references.forEach((p, i) => {
    content.push({ type: "text", text: `Imagem de referência ${i + 1} (MODELO a replicar no estilo e na composição; não usar como foto): ${p.name}` });
    content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: p.preview } });
  });
  assets.examples.forEach((p) => {
    content.push({ type: "text", text: `Post de exemplo do cliente (referência de estilo): ${p.name}` });
    content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: p.preview } });
  });
  content.push({ type: "text", text: JSON.stringify(pedido, null, 2) });

  const data = await callDesigner(SYSTEM, content, schema);
  console.log("designer", { cliente: client.name, post: entry.id, fotos: assets.photos.length, paginas: data.paginas?.length });
  return cleanDesign(data, entry, assets.photos.length, stockAllowed, genAllowed);
}

const HEX = /^#[0-9a-f]{6}$/i;
// "*Imagem ilustrativa.", "Imagens meramente ilustrativas", "foto ilustrativa"… nunca vão para a arte
const ILLUSTRATIVE = /\*?\s*(imagem|imagens|fotos?)\s+(meramente\s+)?ilustrativ[ao]s?\.?/gi;
const noDisclaimer = (t) => String(t || "").replace(ILLUSTRATIVE, "").replace(/\s{2,}/g, " ").replace(/\s+([.,;:!?])/g, "$1").trim();
const clamp01 = (v) => (Number.isFinite(Number(v)) ? Math.max(0, Math.min(1, Number(v))) : 0);
const PHOTO_LAYOUTS = ["oferta", "foto_cheia", "foto_topo"];

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

function cleanDesign(data, entry, photoCount, stockAllowed, genAllowed = false) {
  const max = entry.format === "Carrossel" ? 10 : 1;
  const paginas = (data.paginas || []).slice(0, max).map((p) => ({
    layout: LAYOUTS.includes(p.layout) ? p.layout : "tipografico",
    chamada_superior: asTitle(p.chamada_superior || "").slice(0, 40),
    titulo: noDisclaimer(asTitle(p.titulo || "")).slice(0, 160),
    texto: noDisclaimer(asText(p.texto || "")).slice(0, 600),
    cta: asTitle(p.cta || "").slice(0, 40),
    linha_de_apoio: noDisclaimer(asTitle(p.linha_de_apoio || "")).slice(0, 90),
    palavra_destaque: asTitle(p.palavra_destaque || "").slice(0, 14),
    assinatura: asTitle(p.assinatura || "").slice(0, 32),
    itens: asText(p.itens || "").slice(0, 200),
    rodape: noDisclaimer(asText(p.rodape || "")).slice(0, 80),
    foto: Number.isInteger(p.foto) && p.foto >= 0 && p.foto < photoCount ? p.foto : -1,
    busca_foto: stockAllowed ? String(p.busca_foto || "").slice(0, 80) : "",
    descricao_imagem: genAllowed ? String(p.descricao_imagem || "").slice(0, 900) : ""
  }));
  if (!paginas.length) throw new ContentAgentError("O projeto da arte veio sem páginas. Tente de novo.");
  for (const p of paginas) {
    if (p.chamada_superior && repeats(p.chamada_superior, p.titulo)) {
      const line = asTitle(entry.editorial_line || "").slice(0, 40);
      p.chamada_superior = line && !repeats(line, p.titulo) ? line : "";
    }
  }
  if (photoCount > 0) {
    let next = 0;
    for (const p of paginas) {
      if (PHOTO_LAYOUTS.includes(p.layout) && p.foto < 0 && !p.busca_foto && !p.descricao_imagem) {
        p.foto = next % photoCount;
        next++;
      }
    }
  }
  const cover = paginas[0];
  if (cover.layout === "tipografico" || cover.layout === "citacao") {
    const anotherQuery = paginas.find((p) => p.busca_foto)?.busca_foto || "";
    if (photoCount > 0) Object.assign(cover, { layout: "foto_cheia", foto: cover.foto >= 0 ? cover.foto : 0 });
    else if (genAllowed && cover.descricao_imagem) cover.layout = "foto_cheia";
    else if (stockAllowed && (cover.busca_foto || anotherQuery)) Object.assign(cover, { layout: "foto_cheia", busca_foto: cover.busca_foto || anotherQuery });
  }
  const paleta = Object.fromEntries(
    Object.entries({ fundo: "#FFFFFF", destaque: "#16213E", texto: "#22201B", texto_sobre_foto: "#FFFFFF" }).map(([k, fallback]) => [
      k,
      HEX.test(data.paleta?.[k] || "") ? data.paleta[k] : fallback
    ])
  );
  const c = data.conceito || {};
  return {
    conceito: {
      mensagem_principal: asText(c.mensagem_principal || ""),
      primeiro_olhar: asText(c.primeiro_olhar || ""),
      ideia_visual: asText(c.ideia_visual || ""),
      papel_da_foto: asText(c.papel_da_foto || ""),
      tipografia_e_hierarquia: asText(c.tipografia_e_hierarquia || "")
    },
    resumo: asText(data.resumo || ""),
    paleta,
    tipografia: ["elegante", "impacto"].includes(data.tipografia) ? data.tipografia : "moderna",
    estilo: {
      alinhamento: data.estilo?.alinhamento === "centro" ? "centro" : "esquerda",
      caixa_alta: !!data.estilo?.caixa_alta,
      posicao_texto: ["embaixo", "centro", "topo"].includes(data.estilo?.posicao_texto) ? data.estilo.posicao_texto : "embaixo",
      degrade: ["suave", "medio", "forte"].includes(data.estilo?.degrade) ? data.estilo.degrade : "medio"
    },
    paginas,
    // só regiões válidas, de fotos que existem
    textos_nas_fotos: (data.textos_nas_fotos || [])
      .filter((t) => Number.isInteger(t.foto) && t.foto >= 0 && t.foto < photoCount)
      .map((t) => ({
        foto: t.foto,
        regioes: (t.regioes || [])
          .map((r) => ({ x: clamp01(r.x), y: clamp01(r.y), largura: clamp01(r.largura), altura: clamp01(r.altura) }))
          .filter((r) => r.largura > 0.01 && r.altura > 0.01 && r.largura * r.altura < 0.6)
      }))
      .filter((t) => t.regioes.length),
    fotos_fracas: (data.fotos_fracas || [])
      .filter((f) => Number.isInteger(f.foto) && f.foto >= 0 && f.foto < photoCount)
      .map((f) => ({ foto: f.foto, problema: String(f.problema || "").slice(0, 120) })),
    alertas: (data.alertas || []).map(asText).filter(Boolean)
  };
}

const REVIEW = `Você é Diretor de Arte Sênior da Up! Digital e avalia uma arte de Instagram que acabou de ser desenhada, antes de ela ir para a equipe.
Uma arte não está aprovada só porque foi gerada. Olhe as páginas como um diretor de arte exigente olharia no celular e confira:
- A headline tem destaque suficiente e a hierarquia de leitura está clara (mensagem, imagem, complemento, marca e chamada)?
- A imagem comunica o conceito e conversa com a headline?
- A composição tem identidade própria ou parece um modelo genérico?
- Texto e fotografia estão integrados, ou o texto parece colado sobre a foto?
- A tipografia tem variação de escala e peso, com aparência profissional?
- O espaço está bem aproveitado, sem áreas vazias sem razão e sem aperto?
- A identidade visual do cliente foi respeitada (cores, estilo, logo, referências)?
- Os textos estão corretos, completos, sem erros e legíveis na tela de um celular? Algum texto obrigatório foi alterado? Há informação inventada (preço, data, promoção)?
- Há algo que denuncie automação ou inteligência artificial, ou aviso de imagem ilustrativa?
Reprove ("aprovada": false) só quando houver problema real que um novo projeto consiga resolver com o mesmo material: peça genérica, desequilibrada, texto ilegível ou cortado, hierarquia fraca, informação errada, identidade desrespeitada. Detalhes pequenos não reprovam.
"nota": de 1 a 10. "problemas": cada problema em uma frase curta, dizendo a página. "orientacao": o que o próximo projeto deve mudar (layout, foto, tamanho e posição do texto, degradê, cores), em até 3 frases. Nunca use travessão nem meia-risca.`;

const reviewSchema = {
  type: "object",
  additionalProperties: false,
  required: ["aprovada", "nota", "problemas", "orientacao"],
  properties: {
    aprovada: { type: "boolean" },
    nota: { type: "integer" },
    problemas: { type: "array", items: { type: "string" } },
    orientacao: { type: "string" }
  }
};

// pages: imagens da arte pronta em base64 (JPEG pequeno). Devolve { aprovada, nota, problemas, orientacao }
// ou null se a avaliação falhar (a arte segue sem ela).
export async function reviewArt({ client, post, design, pages, assets }) {
  const content = [];
  pages.forEach((b64, i) => {
    content.push({ type: "text", text: `Página ${i + 1} da arte pronta:` });
    content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: b64 } });
  });
  (assets?.references || []).slice(0, 2).forEach((p, i) => {
    content.push({ type: "text", text: `Imagem de referência ${i + 1} (modelo de estilo que a arte deveria seguir):` });
    content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: p.preview } });
  });
  (assets?.examples || []).slice(0, 2).forEach((p) => {
    content.push({ type: "text", text: "Post de exemplo do cliente (linguagem visual da marca):" });
    content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: p.preview } });
  });
  content.push({
    type: "text",
    text: JSON.stringify({
      cliente: client.name,
      identidade_visual: client.identity || "",
      observacoes_importantes: client.notes || "",
      formato: post.format,
      tema: post.theme,
      texto_da_peca: post.brief?.piece_text || "",
      nao_pode_faltar: post.brief?.must_have || "",
      conceito_pretendido: design.conceito,
      textos_da_arte: design.paginas.map((p, i) => ({ pagina: i + 1, layout: p.layout, titulo: p.titulo, texto: p.texto, cta: p.cta, rodape: p.rodape }))
    })
  });
  try {
    const r = await callDesigner(REVIEW, content, reviewSchema, "medium");
    return {
      aprovada: !!r.aprovada,
      nota: Number.isInteger(r.nota) ? Math.max(1, Math.min(10, r.nota)) : null,
      problemas: (r.problemas || []).map(asText).filter(Boolean).slice(0, 8),
      orientacao: asText(r.orientacao || "")
    };
  } catch (err) {
    console.error("designer: avaliação da arte falhou", err?.message);
    return null;
  }
}

// Fotos de banco: para cada página, o designer vê as opções encontradas e escolhe a melhor (ou nenhuma).
// pages: [{ page: { index, layout, titulo, texto, busca_foto }, candidates: [{ previewB64 }] }]
// Devolve { [índice da página]: número da opção escolhida (ou -1) }.
export async function chooseStockPhotos({ client, post, pages }) {
  if (!pages.length) return {};
  const content = [];
  pages.forEach(({ page, candidates }) => {
    content.push({ type: "text", text: `Página ${page.index + 1} (${page.layout}). Título: "${page.titulo}". Busca: "${page.busca_foto}". Opções:` });
    candidates.forEach((c, i) => {
      content.push({ type: "text", text: `Opção ${i}:` });
      content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: c.previewB64 } });
    });
  });
  content.push({
    type: "text",
    text: JSON.stringify({ cliente: client.name, identidade_visual: client.identity || "", tema_do_post: post.theme, observacoes_importantes: client.notes || "" })
  });
  const schemaPick = {
    type: "object",
    additionalProperties: false,
    required: ["escolhas"],
    properties: {
      escolhas: {
        type: "array",
        items: { type: "object", additionalProperties: false, required: ["pagina", "opcao"], properties: { pagina: { type: "integer" }, opcao: { type: "integer" } } }
      }
    }
  };
  try {
    const data = await callDesigner(
      `Você é diretor de arte da Up! Digital e escolhe fotos de banco de imagens para artes de Instagram.
Para cada página, escolha a opção mais bonita e certeira para o título e o tema: foto profissional, nítida, bem iluminada, com cara de marca, que combine com a identidade visual e tenha espaço para o texto (o texto fica na parte de baixo da foto).
Descarte fotos genéricas demais, montagens, ilustrações, fotos com texto ou marca d'água, fotos que pareçam ser o produto, o espaço ou a equipe real do cliente, e fotos que conflitem com as observações do cliente.
Não escolha a mesma foto para duas páginas. Se nenhuma opção for boa, responda -1 para aquela página.
Responda com "pagina" igual ao número da página (começando em 1) e "opcao" igual ao número da opção.`,
      content,
      schemaPick,
      "low"
    );
    return Object.fromEntries((data.escolhas || []).map((e) => [e.pagina - 1, Number.isInteger(e.opcao) ? e.opcao : -1]));
  } catch (err) {
    console.error("designer: escolha de fotos falhou", err?.message);
    // sem a escolha, usa a primeira opção de cada página
    return Object.fromEntries(pages.map(({ page }) => [page.index, 0]));
  }
}

async function callDesigner(system, content, outSchema, effort = "medium") {
  const anthropic = new Anthropic();
  let response;
  try {
    response = await anthropic.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: { effort, format: { type: "json_schema", schema: outSchema } },
      system,
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
  try {
    return JSON.parse(response.content.filter((b) => b.type === "text").map((b) => b.text).join(""));
  } catch {
    throw new ContentAgentError("O projeto da arte veio fora do formato. Tente de novo.");
  }
}
