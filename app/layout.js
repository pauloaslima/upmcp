import "./globals.css";
import "./shell.css";
import "./prazos.css";
import "./login.css";
import "./tarefas.css";
import "./atribuicoes.css";
import "./briefing.css";
import "./agente.css";
import "./calendario-ia.css";
import "./especialista.css";
import "./alinhamento.css";

export const metadata = {
  title: "Up! Fluxo",
  description: "Quadro de produção de conteúdo da Up! Digital"
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
