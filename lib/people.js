// Nome curto de uma pessoa para mostrar na tela: primeiro nome; sem nome cadastrado,
// a parte do e-mail antes do @ (ex.: "paulo.aslima@gmail.com" → "Paulo.aslima").
export function shortName(person) {
  if (!person) return "";
  const full = (person.full_name || "").trim();
  if (full) return full.split(/\s+/)[0];
  const local = (person.email || "").split("@")[0];
  return local ? local.charAt(0).toUpperCase() + local.slice(1) : "";
}
