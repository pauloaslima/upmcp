import "./globals.css";
import "./shell.css";
import "./prazos.css";
import "./login.css";
import "./tarefas.css";
import "./atribuicoes.css";

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
