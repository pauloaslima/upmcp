// Segmentos dos clientes e as regras que o time de agentes segue em cada um.
// O revisor confere essas regras uma a uma. As "gerais" valem para todos.

export const GENERAL_RULES = [
  "Nada de preço, promoção, prazo, número, resultado ou depoimento que não esteja no perfil ou nos aprendizados confirmados: use [confirmar com o cliente].",
  "Imagem de pessoas só com autorização; de crianças, sempre confirmar com o cliente.",
  "Sorteio ou distribuição de prêmio precisa de autorização do governo; concurso cultural tem regras próprias: sempre [confirmar com o cliente] antes de propor.",
  "Não usar render 3D ou banco de imagens apresentando como cliente ou produto real.",
  "Música só da biblioteca do Instagram ou licenciada."
];

export const SEGMENTS = [
  {
    id: "psicologia",
    label: "Psicologia",
    rules: [
      "Código de Ética do Psicólogo (CFP): não usar preço como propaganda; nada de primeira sessão grátis ou desconto em post.",
      "Não prometer resultado (\"cure sua ansiedade\", \"em 5 sessões\"), nem diagnóstico ou autodiagnóstico.",
      "Nada sensacionalista ou de autopromoção em detrimento de outros profissionais.",
      "Sigilo: nenhum caso, relato ou depoimento de paciente, nem anônimo.",
      "Peças institucionais com nome e CRP; CRP [confirmar com o cliente] se não estiver no perfil.",
      "Suicídio e automutilação: linguagem cuidadosa, sem detalhar métodos, e indicar o CVV (188).",
      "Tom acolhedor e informativo; conteúdo educativo é o centro."
    ]
  },
  {
    id: "alimentacao",
    label: "Alimentação",
    rules: [
      "Cardápio, preços, combos, horário e área de entrega só se confirmados.",
      "Bebida alcoólica: sem apelo a menores e com \"Beba com moderação\" (CONAR).",
      "Foto de produto real; nada de prato que não está no cardápio.",
      "Datas fortes: Dia do Hambúrguer (28/05), feriados e fins de semana."
    ]
  },
  {
    id: "moveis",
    label: "Móveis, planejados e decoração",
    rules: [
      "Projetos de clientes só com autorização; crédito ao arquiteto ou designer de interiores quando houver.",
      "Prazos de entrega, condições de pagamento, garantia e materiais só se confirmados.",
      "Medidas e acabamentos: não inventar; usar o que o cliente informou."
    ]
  },
  {
    id: "evento_arquitetura",
    label: "Evento de arquitetura e design",
    rules: [
      "Crédito obrigatório ao profissional de cada ambiente.",
      "Datas, horários, local e ingressos só confirmados.",
      "Patrocinadores e parceiros: nomear como o contrato pede, [confirmar com o cliente]."
    ]
  },
  {
    id: "religioso",
    label: "Religioso",
    rules: [
      "Citação bíblica com referência exata (livro, capítulo, versículo) e versão; não parafrasear como se fosse citação.",
      "Respeitar a linha doutrinária do cliente; em dúvida, perguntar.",
      "Datas litúrgicas e eventos só confirmados."
    ]
  },
  {
    id: "servicos",
    label: "Serviços (limpeza, organização, estética…)",
    rules: [
      "Antes e depois só reais e autorizados.",
      "Preços, pacotes e área de atendimento só se confirmados.",
      "Profissões regulamentadas (estética, saúde): nada de promessa de resultado."
    ]
  },
  {
    id: "financeiro",
    label: "Financeiro (banco, crédito, investimentos)",
    rules: [
      "Taxas, juros, limites, prazos, tarifas e condições só se confirmados; nunca arredondar nem usar \"a partir de\" por conta própria.",
      "Oferta de crédito: informar que está sujeita a análise; se citar taxa, citar também o CET (custo efetivo total), [confirmar com o cliente].",
      "Investimento: nada de promessa ou garantia de rentabilidade; rentabilidade passada não garante futura; sem recomendação personalizada.",
      "Segurança: nunca pedir dados, senha ou código por mensagem; reforçar canais oficiais e alertas contra golpe.",
      "Tom sóbrio e confiável; nada de urgência artificial (\"só hoje!\")."
    ]
  },
  {
    id: "construcao",
    label: "Construção e acabamentos (alumínio, vidro, esquadrias)",
    rules: [
      "Especificações técnicas (espessura, vidro temperado/laminado, linha de alumínio, normas, garantia) só se confirmadas.",
      "Não afirmar que um produto \"não quebra\", \"à prova de\" ou \"100% vedado\" sem confirmação.",
      "Obras e fachadas de clientes só com autorização; crédito ao arquiteto quando houver.",
      "Prazos de instalação, orçamento e área de atendimento só se confirmados."
    ]
  },
  {
    id: "isolamento_eua",
    label: "Isolamento térmico nos EUA (spray foam)",
    rules: [
      "Posts em inglês americano para o mercado dos EUA; unidades americanas (ft², °F) e datas no formato dos EUA.",
      "Regra da FTC para isolamento residencial (R-value Rule): todo R-value tem que ser o do produto e espessura reais; promessa de economia de energia sempre qualificada (\"Savings vary…\"); nunca inventar porcentagem de economia.",
      "Nada de \"eco-friendly\", \"green\" ou \"non-toxic\" sem comprovação (Green Guides da FTC).",
      "Licenças, certificações, garantia e seguro só se confirmados.",
      "Datas fortes americanas (estações, contas de energia, Thanksgiving, July 4th), não as brasileiras."
    ]
  },
  {
    id: "consultoria",
    label: "Consultoria, palestras e marca pessoal",
    rules: [
      "Credenciais (formação, certificações, empresas atendidas, número de pessoas treinadas) só se confirmadas.",
      "Cases e depoimentos de empresas só reais e autorizados; não citar empresa cliente sem autorização.",
      "Não prometer resultado garantido (\"dobre a produtividade do seu time\").",
      "Conteúdo de autoridade: opinião própria, frameworks e bastidores; tom conforme o posicionamento."
    ]
  }
];

export const LANGUAGES = [
  { id: "pt-BR", label: "Português do Brasil" },
  { id: "en-US", label: "Inglês americano" },
  { id: "es", label: "Espanhol" }
];

export const IMAGE_PROVIDERS = [
  { id: "nano_banana", label: "Nano Banana (Google)" },
  { id: "openai", label: "GPT Image (OpenAI)" }
];

export function segmentOf(id) {
  return SEGMENTS.find((s) => s.id === id) || null;
}

// Regras do segmento + gerais, como os agentes recebem
export function rulesFor(segmentId) {
  const s = segmentOf(segmentId);
  return {
    segmento: s ? s.label : "não definido (deduza pelo posicionamento; se não der, aponte como pendência)",
    regras_do_segmento: s ? s.rules : [],
    regras_gerais: GENERAL_RULES
  };
}

export function emptyLearnings() {
  return { confirmado: [], pendencias: [] };
}

export function normalizeLearnings(l) {
  return {
    confirmado: Array.isArray(l?.confirmado) ? l.confirmado : [],
    pendencias: Array.isArray(l?.pendencias) ? l.pendencias : []
  };
}
