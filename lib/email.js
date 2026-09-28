// Envio de e-mail pelo Resend (resend.com). Opcional: sem RESEND_API_KEY e EMAIL_FROM
// configurados no Vercel, os lembretes ficam só no sino do sistema.
export function emailEnabled() {
  return !!(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export async function sendEmail({ to, subject, text }) {
  if (!emailEnabled() || !to) return false;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + process.env.RESEND_API_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [to], subject, text })
  });
  if (!res.ok) console.error("Resend", res.status, await res.text().catch(() => ""));
  return res.ok;
}
