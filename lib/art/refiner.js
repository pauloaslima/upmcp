import { asText } from "../text.js";
import { QUALITY_RULES } from "./rules.js";
import { PHOTO_LAYOUTS, PLAN_SYSTEM, cleanPage, pageSchema } from "./plan.js";

// AGENTE 6 | REFINADOR VISUAL
// Recebe a crítica e corrige só o que precisa: devolve as páginas alteradas (as outras ficam iguais).
// Para cada página decide o tipo de correção:
//   ajuste: mexe em parâmetros (escala e foco da foto, degradê, alinhamento, posição do texto, textos)
//   recompor: troca o layout da página mantendo o conteúdo
//   trocar_foto: usa outra foto do acervo (ou busca no banco, se permitido)
//   nova_imagem: pede uma imagem nova ao gerador (só se permitido; no máximo 1 por ciclo)

export const REFINER_SYSTEM = `Você é o Refinador Visual da equipe de design da Up! Digital. Você recebe uma arte de Instagram que foi reprovada pelo crítico visual e corrige os problemas apontados, preservando tudo o que já está correto.

Como trabalhar
- Leia as notas, os erros críticos, as correções pedidas e as verificações automáticas. Olhe as imagens das páginas que precisam de revisão.
- Para cada página que precisa mudar, escolha a correção MÍNIMA que resolve: "ajuste" (parâmetros: foto_escala, foto_foco, foto_lado, degrade, alinhamento, posicao_texto, fundo, decoracao, textos), "recompor" (outro layout com o mesmo conteúdo, quando a estrutura é o problema ou repete a página vizinha), "trocar_foto" (outra foto do acervo, ou "busca_foto" quando o banco é permitido) ou "nova_imagem" (preencha "imagem_gerada"; só quando permitido e nenhuma foto do acervo serve; no máximo uma por ciclo; nunca para representar a cliente).
- Não altere páginas aprovadas sem motivo. Não troque o sentido dos textos nem os textos obrigatórios. Pode encurtar títulos e apoios para melhorar leitura e quebra de linha.
- Devolva cada página alterada COMPLETA no campo "pagina_nova" (todos os campos, no mesmo formato do plano).
- "explicacao": o que mudou e por quê, em uma frase, para o registro da equipe.

Referência dos layouts e campos (mesma do arquiteto de layout):
${PLAN_SYSTEM.split("LAYOUTS DISPONÍVEIS")[1]?.split("REGRAS PERMANENTES")[0] || ""}

${QUALITY_RULES}`;

export const refinerSchema = {
  type: "object",
  additionalProperties: false,
  required: ["alteracoes", "resumo"],
  properties: {
    alteracoes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["pagina", "acao", "explicacao", "pagina_nova"],
        properties: {
          pagina: { type: "integer" },
          acao: { type: "string", enum: ["ajuste", "recompor", "trocar_foto", "nova_imagem"] },
          explicacao: { type: "string" },
          pagina_nova: pageSchema()
        }
      }
    },
    resumo: { type: "string" }
  }
};

// Aplica as alterações no plano. Devolve { plan, changed: [índices 0-based], log: [texto] }
export function applyRefinement(plan, data, { photoCount = 0, stockAllowed = false, genAllowed = false } = {}) {
  const script = plan.tipografia?.manuscrita && plan.tipografia.manuscrita !== "nenhuma";
  const paginas = plan.paginas.map((p) => ({ ...p }));
  const changed = [];
  const log = [];
  let newImages = 0;
  for (const a of data?.alteracoes || []) {
    const i = a.pagina - 1;
    if (!Number.isInteger(i) || i < 0 || i >= paginas.length || changed.includes(i)) continue;
    const allowGen = genAllowed && a.acao === "nova_imagem" && newImages === 0;
    const page = cleanPage(a.pagina_nova, { photoCount, stockAllowed, genAllowed: allowGen, script });
    if (page.imagem_gerada) {
      newImages++;
      page.foto = -1;
    }
    // sem nova fonte de imagem, a página mantém a foto que já tinha
    if (page.foto < 0 && !page.busca_foto && !page.imagem_gerada && paginas[i].foto >= 0 && (a.acao !== "recompor" || PHOTO_LAYOUTS.includes(page.layout))) page.foto = paginas[i].foto;
    paginas[i] = page;
    changed.push(i);
    log.push(`Página ${a.pagina} (${a.acao}): ${asText(String(a.explicacao || "")).trim()}`);
  }
  return { plan: { ...plan, paginas }, changed: changed.sort((x, y) => x - y), log };
}
