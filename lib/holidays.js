// Feriados nacionais e datas comemorativas do Brasil, calculados para
// qualquer ano (inclusive as datas móveis: Carnaval, Páscoa, Dia das Mães…).
//
// kind: "feriado"     → feriado nacional
//       "facultativo" → ponto facultativo nacional
//       "comemorativa"→ data boa para conteúdo

const FIXED = [
  // [mês, dia, nome, kind]
  [1, 1, "Confraternização Universal", "feriado"],
  [1, 30, "Dia da Saudade", "comemorativa"],
  [2, 14, "Dia da Amizade (Valentine's)", "comemorativa"],
  [3, 8, "Dia Internacional da Mulher", "comemorativa"],
  [3, 15, "Dia do Consumidor", "comemorativa"],
  [3, 20, "Dia Internacional da Felicidade", "comemorativa"],
  [4, 1, "Dia da Mentira", "comemorativa"],
  [4, 7, "Dia Mundial da Saúde", "comemorativa"],
  [4, 19, "Dia dos Povos Indígenas", "comemorativa"],
  [4, 21, "Tiradentes", "feriado"],
  [4, 22, "Dia da Terra", "comemorativa"],
  [5, 1, "Dia do Trabalhador", "feriado"],
  [5, 15, "Dia Internacional da Família", "comemorativa"],
  [5, 28, "Dia do Hambúrguer", "comemorativa"],
  [6, 5, "Dia Mundial do Meio Ambiente", "comemorativa"],
  [6, 12, "Dia dos Namorados", "comemorativa"],
  [6, 24, "São João", "comemorativa"],
  [7, 20, "Dia do Amigo", "comemorativa"],
  [7, 26, "Dia dos Avós", "comemorativa"],
  [8, 11, "Dia do Estudante", "comemorativa"],
  [8, 27, "Dia do Psicólogo", "comemorativa"],
  [9, 7, "Independência do Brasil", "feriado"],
  [9, 10, "Dia Mundial de Prevenção do Suicídio", "comemorativa"],
  [9, 15, "Dia do Cliente", "comemorativa"],
  [9, 21, "Dia da Árvore", "comemorativa"],
  [10, 10, "Dia Mundial da Saúde Mental", "comemorativa"],
  [10, 12, "Nossa Senhora Aparecida", "feriado"],
  [10, 12, "Dia das Crianças", "comemorativa"],
  [10, 15, "Dia do Professor", "comemorativa"],
  [10, 31, "Halloween", "comemorativa"],
  [11, 2, "Finados", "feriado"],
  [11, 15, "Proclamação da República", "feriado"],
  [11, 20, "Dia da Consciência Negra", "feriado"],
  [12, 15, "Dia do Arquiteto", "comemorativa"],
  [12, 24, "Véspera de Natal", "comemorativa"],
  [12, 25, "Natal", "feriado"],
  [12, 31, "Véspera de Ano Novo", "comemorativa"]
];

// Campanhas que duram o mês inteiro (aparecem no topo do calendário)
export const MONTH_CAMPAIGNS = {
  1: ["Janeiro Branco — saúde mental"],
  4: ["Abril Azul — conscientização sobre o autismo"],
  5: ["Maio Amarelo — segurança no trânsito"],
  6: ["Junho Vermelho — doação de sangue"],
  8: ["Agosto Lilás — combate à violência contra a mulher"],
  9: ["Setembro Amarelo — prevenção do suicídio"],
  10: ["Outubro Rosa — prevenção do câncer de mama"],
  11: ["Novembro Azul — saúde do homem"],
  12: ["Dezembro Vermelho — prevenção ao HIV"]
};

// Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher, calendário gregoriano)
function easter(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

// n-ésimo dia da semana do mês (weekday: 0=domingo … 6=sábado)
function nthWeekday(year, month, weekday, n) {
  const first = new Date(year, month - 1, 1);
  const offset = (weekday - first.getDay() + 7) % 7;
  return new Date(year, month - 1, 1 + offset + 7 * (n - 1));
}

export function isoDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const cache = {};

// Retorna { "2026-09-07": [{ name, kind }, …], … } para o ano inteiro
export function specialDates(year) {
  if (cache[year]) return cache[year];
  const map = {};
  const add = (date, name, kind) => {
    const key = isoDate(date);
    (map[key] = map[key] || []).push({ name, kind });
  };

  FIXED.forEach(([m, d, name, kind]) => add(new Date(year, m - 1, d), name, kind));

  const e = easter(year);
  add(addDays(e, -48), "Carnaval", "facultativo");
  add(addDays(e, -47), "Carnaval", "facultativo");
  add(addDays(e, -46), "Quarta-feira de Cinzas", "facultativo");
  add(addDays(e, -2), "Sexta-feira Santa", "feriado");
  add(e, "Páscoa", "comemorativa");
  add(addDays(e, 60), "Corpus Christi", "facultativo");

  add(nthWeekday(year, 5, 0, 2), "Dia das Mães", "comemorativa");
  add(nthWeekday(year, 8, 0, 2), "Dia dos Pais", "comemorativa");
  // Black Friday: sexta-feira seguinte à 4ª quinta-feira de novembro
  add(addDays(nthWeekday(year, 11, 4, 4), 1), "Black Friday", "comemorativa");

  // feriado primeiro, depois facultativo, depois comemorativa
  const order = { feriado: 0, facultativo: 1, comemorativa: 2 };
  Object.values(map).forEach((list) => list.sort((a, b) => order[a.kind] - order[b.kind]));

  cache[year] = map;
  return map;
}
