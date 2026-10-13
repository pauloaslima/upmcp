import Anthropic from "@anthropic-ai/sdk";
import { ContentAgentError, apiErrorMessage } from "../contentAgent";
import { SPEC_SYSTEM, cleanSpec, specSchema } from "./spec.js";
import { PLAN_SYSTEM, cleanPlan, planSchema } from "./plan.js";
import { CRITIC_SYSTEM, cleanCritique, criticSchema } from "./critic.js";
import { REFINER_SYSTEM, refinerSchema } from "./refiner.js";

// Chamadas ao modelo de cada agente da produção de artes. O que cada agente faz e as regras
// permanentes estão nos módulos dele (spec, plan, critic, refiner, visualPrompt, rules).

const MODEL = "claude-opus-5-5";

const img = (b64) => ({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: b64 } });
const txt = (text) => ({ type: "text", text });

export function clientContext(client, config = {}) {
  return {
    nome: client.name,
    posicionamento: client.positioning || "",
    publico_alvo: client.target_audience || "",
    tom_de_voz: client.tone_of_voice || "",
    linhas_editoriais: client.editorial_lines || "",
    identidade_visual: client.identity || "",
    referencias_para_artes: client.art_references || "",
    observacoes_importantes: client.notes || "",
    configuracao_de_direcao_de_arte: {
      cores: config.cores || "",
      fonte_dos_titulos: config.fonte_titulo || "escolha do diretor de arte",
      fonte_manuscrita: config.fonte_manuscrita || "escolha do diretor de arte",
      estilo_das_fotos: config.estilo_foto || "",
      linguagem_grafica: config.linguagem_grafica || "",
      evitar: config.evitar || ""
    }
  };
}

function postContext(post) {
  return {
    dia: post.day,
    formato: post.format,
    tema: post.theme,
    linha_editorial: post.editorial_line || "",
    texto_da_peca: post.brief?.piece_text || "",
    nao_pode_faltar: post.brief?.must_have || "",
    orientacoes_de_arte: post.brief?.important_notes || "",
    referencias: post.brief?.refs_note || "",
    observacoes: post.notes || "",
    peca_na_linha_de_producao: post.peca || "post ainda sem peça"
  };
}

function learningContent(learning) {
  const out = [];
  (learning?.aprovadas || []).forEach((a) => {
    out.push(txt(`Arte APROVADA pela equipe para este cliente (padrão de qualidade a seguir, sem copiar o layout). Tema: ${a.tema}`));
    out.push(img(a.preview));
  });
  (learning?.reprovadas || []).forEach((a) => {
    out.push(txt(`Arte REPROVADA pela equipe para este cliente (erro a evitar). Tema: ${a.tema}. Motivo: ${a.motivo}`));
    out.push(img(a.preview));
  });
  if (learning?.recorrentes?.length) out.push(txt("Correções que se repetiram nas últimas artes deste cliente (evite desde o início):\n- " + learning.recorrentes.join("\n- ")));
  return out;
}

// AGENTE 1: especificação criativa (só texto, rápido)
export async function runSpec({ client, post, config, guidance }) {
  const data = await callModel(
    SPEC_SYSTEM,
    [txt(JSON.stringify({ cliente: clientContext(client, config), post: postContext(post), orientacao_da_equipe: guidance?.trim() || "nenhuma" }, null, 2))],
    specSchema,
    "low"
  );
  try {
    return cleanSpec(data, post.format);
  } catch (err) {
    throw new ContentAgentError("A especificação da arte veio incompleta. Tente de novo.");
  }
}

// AGENTES 2 e 3: direção de arte e plano das páginas (vê as fotos, a logo, as referências e o aprendizado)
export async function runPlan({ client, post, spec, assets, learning, config, mode, guidance, stockAllowed, genAllowed, revisao = null }) {
  const content = [];
  assets.photos.forEach((p, i) => {
    content.push(txt(`Foto disponível ${i} (${p.origem || "anexada"}; material real, use na arte): ${p.name}`));
    content.push(img(p.preview));
  });
  if (assets.logo) {
    content.push(txt("Logo do cliente:"));
    content.push(img(assets.logo.preview));
  }
  assets.references.forEach((p, i) => {
    content.push(txt(`Imagem de referência ${i + 1} (MODELO de qualidade e linguagem; não usar como foto, não copiar): ${p.name}`));
    content.push(img(p.preview));
  });
  assets.examples.forEach((p) => {
    content.push(txt(`Post de exemplo do cliente (linguagem visual da marca): ${p.name}`));
    content.push(img(p.preview));
  });
  content.push(...learningContent(learning));
  content.push(
    txt(
      JSON.stringify(
        {
          cliente: clientContext(client, config),
          post: postContext(post),
          especificacao: spec,
          fotos_disponiveis: assets.photos.map((p, i) => ({ numero: i, nome: p.name, origem: p.origem || "anexada" })),
          tem_logo: !!assets.logo,
          marca_na_arte: brandLine(assets, config),
          pode_usar_foto_de_banco: stockAllowed,
          pode_gerar_imagem: genAllowed,
          modo:
            mode === "material"
              ? "usar só o material que já existe (fotos disponíveis, logo e cores)"
              : mode === "gerar"
                ? "gerar imagens novas para as páginas de foto que não têm foto adequada (preencha imagem_gerada)"
                : "criar livremente; pode usar foto de banco de imagens",
          orientacao_da_equipe: guidance?.trim() || "nenhuma",
          ...(revisao ? { revisao_anterior: revisao } : {})
        },
        null,
        2
      )
    )
  );
  const data = await callModel(PLAN_SYSTEM, content, planSchema, "medium");
  try {
    return cleanPlan(data, {
      spec,
      format: post.format,
      photoCount: assets.photos.length,
      stockAllowed,
      genAllowed,
      config,
      editorialLine: post.editorial_line
    });
  } catch {
    throw new ContentAgentError("O plano da arte veio sem páginas. Tente de novo.");
  }
}

function brandLine(assets, config) {
  const s = assets.signature;
  if (s && config.marca === "nome_topo") return `nome no topo de cada página: ${[s.nome, s.linha].filter(Boolean).join(" | ")} (entra sozinho; não repita nos textos)`;
  if (s && config.marca !== "logo") return `assinatura com foto no rodapé: ${[s.nome, s.usuario, s.linha].filter(Boolean).join(" | ")} (entra sozinha; não repita nos textos)`;
  return assets.logo ? "logo do cliente no canto (entra sozinha)" : "sem logo";
}

// AGENTE 5: crítica das páginas desenhadas. Devolve null se a avaliação falhar.
export async function runCritic({ client, post, spec, plan, pages, sheet, assets, learning, config }) {
  const content = [];
  pages.forEach((b64, i) => {
    content.push(txt(`Página ${i + 1} da arte desenhada:`));
    content.push(img(b64));
  });
  if (sheet && pages.length > 1) {
    content.push(txt("Montagem com todas as páginas lado a lado (avalie o conjunto):"));
    content.push(img(sheet));
  }
  (assets?.references || []).slice(0, 2).forEach((p, i) => {
    content.push(txt(`Imagem de referência ${i + 1} (padrão de qualidade esperado):`));
    content.push(img(p.preview));
  });
  content.push(...learningContent({ ...learning, aprovadas: (learning?.aprovadas || []).slice(0, 2), reprovadas: (learning?.reprovadas || []).slice(0, 2) }));
  content.push(
    txt(
      JSON.stringify({
        cliente: clientContext(client, config),
        especificacao: spec,
        direcao_pretendida: plan.direcao,
        paleta: plan.paleta,
        tipografia: plan.tipografia,
        plano_das_paginas: plan.paginas.map((p, i) => ({
          pagina: i + 1,
          objetivo_visual: p.objetivo_visual,
          layout: p.layout,
          titulo: p.titulo,
          texto: p.texto,
          blocos: p.blocos,
          cta: p.cta,
          rodape: p.rodape
        }))
      })
    )
  );
  try {
    return cleanCritique(await callModel(CRITIC_SYSTEM, content, criticSchema, "medium"), pages.length);
  } catch (err) {
    console.error("arte: crítica falhou", err?.message);
    return null;
  }
}

// AGENTE 6: refinamento. Devolve as alterações (cruas; quem aplica é applyRefinement).
export async function runRefiner({ client, post, spec, plan, critique, decision, checks, pages, assets, stockAllowed, genAllowed, config }) {
  const content = [];
  decision.paginas_para_revisar.forEach((n) => {
    if (!pages[n - 1]) return;
    content.push(txt(`Página ${n} atual (precisa de revisão):`));
    content.push(img(pages[n - 1]));
  });
  assets.photos.forEach((p, i) => {
    content.push(txt(`Foto do acervo ${i} (${p.origem || "anexada"}): ${p.name}`));
    content.push(img(p.thumb || p.preview));
  });
  content.push(
    txt(
      JSON.stringify(
        {
          cliente: clientContext(client, config),
          formato: post.format,
          especificacao: spec,
          plano_atual: plan,
          critica: critique,
          verificacoes_automaticas: checks,
          motivos_da_reprovacao: decision.motivos,
          paginas_para_revisar: decision.paginas_para_revisar,
          pode_usar_foto_de_banco: stockAllowed,
          pode_gerar_imagem: genAllowed
        },
        null,
        2
      )
    )
  );
  return callModel(REFINER_SYSTEM, content, refinerSchema, "medium");
}

// Fotos de banco: para cada página, o diretor de arte vê as opções encontradas e escolhe a melhor (ou nenhuma).
// pages: [{ page: { index, layout, titulo, busca_foto }, candidates: [{ previewB64 }] }]
// Devolve { [índice da página]: número da opção escolhida (ou -1) }.
export async function chooseStockPhotos({ client, post, pages }) {
  if (!pages.length) return {};
  const content = [];
  pages.forEach(({ page, candidates }) => {
    content.push(txt(`Página ${page.index + 1} (${page.layout}). Título: "${page.titulo}". Busca: "${page.busca_foto}". Opções:`));
    candidates.forEach((c, i) => {
      content.push(txt(`Opção ${i}:`));
      content.push(img(c.previewB64));
    });
  });
  content.push(txt(JSON.stringify({ cliente: client.name, identidade_visual: client.identity || "", tema_do_post: post.theme, observacoes_importantes: client.notes || "" })));
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
    const data = await callModel(
      `Você é diretor de arte da Up! Digital e escolhe fotos de banco de imagens para artes de Instagram.
Para cada página, escolha a opção mais bonita e certeira para o título e o tema: foto profissional, nítida, bem iluminada, com cara de marca, que combine com a identidade visual e tenha espaço para o texto.
Descarte fotos genéricas demais, montagens, ilustrações, fotos com texto ou marca d'água, fotos que pareçam ser o produto, o espaço ou a equipe real do cliente, e fotos que conflitem com as observações do cliente.
Não escolha a mesma foto para duas páginas. Se nenhuma opção for boa, responda -1 para aquela página.
Responda com "pagina" igual ao número da página (começando em 1) e "opcao" igual ao número da opção.`,
      content,
      schemaPick,
      "low"
    );
    return Object.fromEntries((data.escolhas || []).map((e) => [e.pagina - 1, Number.isInteger(e.opcao) ? e.opcao : -1]));
  } catch (err) {
    console.error("arte: escolha de fotos falhou", err?.message);
    return Object.fromEntries(pages.map(({ page }) => [page.index, 0]));
  }
}

async function callModel(system, content, outSchema, effort = "medium") {
  if (!process.env.ANTHROPIC_API_KEY) throw new ContentAgentError("Falta configurar ANTHROPIC_API_KEY no Vercel.");
  const anthropic = new Anthropic();
  let response;
  try {
    response = await anthropic.beta.messages.create({
      model: MODEL,
      max_tokens: 32000,
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
