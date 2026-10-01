// Revisão antes de executar o time de agentes (sem IA).
// Devolve { bloqueios, avisos }: bloqueio pede confirmação da equipe ("Seguir assim");
// aviso só informa. Os agentes recebem o resumo para não inventar o que falta.

const LOOKS_EMPTY = /^\s*(teste|test|-|\.|x)?\s*$/i;

function weak(text, min) {
  const t = (text || "").trim();
  return LOOKS_EMPTY.test(t) || t.length < min;
}

// context: clientContext(); planned: temas do período (com brief_status);
// week: weekInfo() quando mode = "week"; month: { inicio, fim, prazo_do_calendario } quando mode = "month"
export function reviewBeforeRun({ context, mode, week, month, planned = [], keys = {} }) {
  const bloqueios = [];
  const avisos = [];
  const today = context.hoje;

  if (!keys.anthropic) bloqueios.push("Falta configurar a chave ANTHROPIC_API_KEY no Vercel: o time de agentes não roda sem ela.");

  // perfil
  if (weak(context.posicionamento, 40))
    avisos.push("Posicionamento muito curto ou vazio: o time não sabe público, diferenciais nem tom de voz. Vai virar pergunta para o cliente.");
  if (weak(context.identidade_visual?.texto, 15))
    avisos.push("Identidade visual sem cores, fontes ou estilo descritos: os briefings vão dizer \"seguir ID visual do cliente\" sem códigos.");
  if (LOOKS_EMPTY.test(context.observacoes_importantes || "") && (context.observacoes_importantes || "").trim())
    avisos.push("Observações importantes estão como \"teste\": o time vai considerar que não há restrições.");
  if (!context.regras_do_segmento?.length) avisos.push("Segmento do cliente não definido no perfil: só as regras gerais serão conferidas.");
  if (!context.site && !context.redes_sociais && !context.concorrentes_e_referencias)
    avisos.push("Sem site, redes ou concorrentes no perfil: a pesquisa na internet fica limitada a tendências do segmento.");

  // prazos
  if (mode === "week" && week) {
    const p = week.prazos || {};
    if (p.aprovacao && p.aprovacao < today)
      bloqueios.push(`O envio ao cliente desta semana era ${br(p.aprovacao)} e já passou. Confirme se ainda vale produzir para ela.`);
    else if (p.design && p.design < today)
      avisos.push(`O prazo do design (${br(p.design)}) já passou: o time vai priorizar ajustar os temas que já existem.`);

    const locked = planned.filter((e) => e.brief_status && e.brief_status !== "rascunho");
    if (locked.length)
      avisos.push(`${locked.length} tema(s) com briefing pronto ou enviado ao design não serão alterados.`);
    if (!planned.length) avisos.push("O calendário não tem temas nesta semana: o time cria os posts do zero.");
  }
  if (mode === "month" && month?.prazo_do_calendario && month.prazo_do_calendario < today)
    avisos.push(`O calendário deste mês deveria estar pronto até ${br(month.prazo_do_calendario)}.`);

  // pendências abertas
  const pend = context.aprendizados?.pendencias || [];
  if (pend.length)
    avisos.push(`${pend.length} pergunta(s) ainda sem resposta do cliente. O time não vai supor as respostas; se você já sabe alguma, marque como respondida no perfil antes de rodar.`);

  return { bloqueios, avisos, pendencias_abertas: pend.map((p) => p.texto) };
}

function br(isoDay) {
  return `${isoDay.slice(8, 10)}/${isoDay.slice(5, 7)}`;
}
