import { asText } from "../text.js";
import { QUALITY_RULES } from "./rules.js";

// AGENTE 5 | CRÍTICO VISUAL
// Avalia as imagens REALMENTE desenhadas (o modelo recebe os PNGs de cada página e a montagem do conjunto),
// junto com o briefing, a direção de arte, as referências e a identidade do cliente.
// As notas do modelo são uma opinião técnica, não garantia: a decisão também usa as verificações
// objetivas (lib/art/checks.js) e a aprovação final é sempre da equipe.

export const CRITERIA = ["composicao", "hierarquia", "fotografia", "tipografia", "legibilidade", "contraste", "identidade", "originalidade", "briefing"];
export const MIN_SCORE = 8;

export const CRITIC_SYSTEM = `Você é o Crítico Visual da equipe de design da Up! Digital. Você avalia artes de Instagram que acabaram de ser desenhadas, olhando as imagens de verdade, como um diretor de arte exigente olharia no celular antes de mostrar ao cliente.

Você recebe: cada página da arte, uma montagem com todas as páginas lado a lado, o briefing (especificação), a direção de arte pretendida, a identidade do cliente e, às vezes, imagens de referência, artes aprovadas e artes reprovadas pela equipe.

Para CADA página dê notas de 0 a 10 em: composicao, hierarquia, fotografia, tipografia, legibilidade, contraste, identidade (fidelidade à marca), originalidade e briefing (cumprimento). Em páginas sem foto, a nota de fotografia avalia se a ausência de foto foi uma boa escolha. Nota 8 significa "pronto para o cliente". Seja rigoroso e justo: não dê 8 para algo comum.

Procure problemas concretos: foto pequena ou mal posicionada, rosto ou mãos cortados, foto parecendo colada, degradê excessivo, faixas ou caixas desnecessárias, texto ilegível ou pequeno demais, texto cortado ou saindo da página, erro de ortografia, quebra de linha ruim, falta de hierarquia, espaço vazio sem função, aperto, elementos artificiais, repetição visual, inconsistência entre páginas, descumprimento do briefing.

"erros_criticos" (bloqueiam a aprovação): texto incorreto ou com erro, informação obrigatória omitida, rosto alterado ou deformado, logotipo deformado, formato errado, imagem incompatível com o briefing, texto ilegível ou cortado. Lista vazia se não houver.

"correcoes": instruções ESPECÍFICAS e acionáveis para o refinador, dizendo o que mudar e como. Exemplo válido: "Ampliar o retrato (escala 1.4), foco no rosto, foto à direita; passar a lista para a esquerda e reduzir o degradê para suave." Exemplo inválido: "Melhorar o design." Lista vazia se a página estiver pronta.

"conjunto" (carrossel): avalie a sequência inteira: ritmo, variedade sem repetição, unidade de cores, fontes e assinatura, progressão narrativa, capa e fechamento. "problemas" com correções específicas citando as páginas.

${QUALITY_RULES}

Nunca use travessão nem meia-risca nas respostas.`;

const scores = { type: "object", additionalProperties: false, required: CRITERIA, properties: Object.fromEntries(CRITERIA.map((c) => [c, { type: "integer" }])) };

export const criticSchema = {
  type: "object",
  additionalProperties: false,
  required: ["paginas", "conjunto", "resumo"],
  properties: {
    paginas: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["pagina", "notas", "erros_criticos", "correcoes"],
        properties: {
          pagina: { type: "integer" },
          notas: scores,
          erros_criticos: { type: "array", items: { type: "string" } },
          correcoes: { type: "array", items: { type: "string" } }
        }
      }
    },
    conjunto: {
      type: "object",
      additionalProperties: false,
      required: ["nota", "problemas"],
      properties: { nota: { type: "integer" }, problemas: { type: "array", items: { type: "string" } } }
    },
    resumo: { type: "string" }
  }
};

const score = (v) => (Number.isFinite(Number(v)) ? Math.max(0, Math.min(10, Math.round(Number(v)))) : 0);
const texts = (v, max = 8) => (Array.isArray(v) ? v : []).map((s) => asText(String(s || "")).trim()).filter(Boolean).slice(0, max);

export function cleanCritique(data, pageCount) {
  const byPage = new Map((data?.paginas || []).map((p) => [p.pagina, p]));
  const paginas = Array.from({ length: pageCount }, (_, i) => {
    const p = byPage.get(i + 1) || {};
    const notas = Object.fromEntries(CRITERIA.map((c) => [c, score(p.notas?.[c])]));
    return { pagina: i + 1, notas, media: avg(Object.values(notas)), erros_criticos: texts(p.erros_criticos), correcoes: texts(p.correcoes) };
  });
  return {
    paginas,
    conjunto: { nota: score(data?.conjunto?.nota), problemas: texts(data?.conjunto?.problemas) },
    resumo: asText(String(data?.resumo || "")).trim()
  };
}

const avg = (list) => (list.length ? Math.round((list.reduce((s, v) => s + v, 0) / list.length) * 10) / 10 : 0);

// Decisão: aprovada só se não houver erro crítico (do crítico ou das verificações objetivas),
// todas as notas de todas as páginas forem >= 8 e o conjunto não tiver problemas.
// Devolve { aprovada, media, paginas_para_revisar: [números], motivos: [texto] }
export function decide(critique, checks, minScore = MIN_SCORE) {
  const motivos = [];
  const revisar = new Set();
  for (const c of checks?.criticos || []) motivos.push("Erro crítico (verificação automática): " + c);
  for (const pr of checks?.problemas || []) {
    motivos.push("Verificação automática: " + pr.texto);
    if (pr.pagina > 0) revisar.add(pr.pagina);
  }
  for (const p of critique.paginas) {
    const low = CRITERIA.filter((c) => p.notas[c] < minScore);
    if (p.erros_criticos.length) {
      revisar.add(p.pagina);
      motivos.push(`Página ${p.pagina}, erro crítico: ${p.erros_criticos.join(" ")}`);
    }
    if (low.length) {
      revisar.add(p.pagina);
      motivos.push(`Página ${p.pagina}: nota abaixo de ${minScore} em ${low.map((c) => `${c} (${p.notas[c]})`).join(", ")}.`);
    }
  }
  const setProblems = critique.paginas.length > 1 ? critique.conjunto.problemas : [];
  for (const s of setProblems) motivos.push("Conjunto: " + s);
  const media = avg(critique.paginas.map((p) => p.media));
  const aprovada = !checks?.criticos?.length && !(checks?.problemas || []).length && revisar.size === 0 && !setProblems.length;
  return { aprovada, media, paginas_para_revisar: [...revisar].sort((a, b) => a - b), motivos };
}
