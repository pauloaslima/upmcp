// Pedido do calendário do mês (o que a equipe escreveu ou falou para o agente criar o mês).

// Tema que "gerar de novo" pode trocar: criado pelo agente, ainda fora da produção e sem fotos nem arte.
// Temas feitos à mão ou já trabalhados ficam.
export function isReplaceable(e) {
  return !!e?.created_by_agent && !e.card_id && !(e.photos || []).length && !(e.art || []).length;
}
