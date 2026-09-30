import { handleMcpMessage } from "../../../../lib/mcpServer";

// Conector do Up! Fluxo para o app do Claude.
// Endereço: https://upmcp.vercel.app/api/mcp/<AGENT_API_KEY>
// A chave vai no próprio endereço porque o app do Claude só pede a URL do conector.
// Trate esse endereço como uma senha.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(key) {
  const expected = process.env.AGENT_API_KEY;
  return !!expected && key === expected;
}

export async function POST(request, { params }) {
  const { key } = await params;
  if (!authorized(key)) return Response.json({ error: "não autorizado" }, { status: 401 });

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "JSON inválido" } }, { status: 400 });
  }

  // aceita uma mensagem ou uma lista (versões antigas do protocolo)
  if (Array.isArray(body)) {
    const replies = (await Promise.all(body.map(handleMcpMessage))).filter(Boolean);
    return replies.length ? Response.json(replies) : new Response(null, { status: 202 });
  }
  const reply = await handleMcpMessage(body);
  return reply ? Response.json(reply) : new Response(null, { status: 202 });
}

// sem sessões nem notificações do servidor
export async function GET() {
  return new Response("Use POST", { status: 405, headers: { Allow: "POST" } });
}
export async function DELETE() {
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}
