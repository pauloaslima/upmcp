# Agente de conteúdo — como consultar o cliente e criar o conteúdo da semana

Exemplo de pedido: **"crie o conteúdo da semana da 7ball"**. O agente:

1. procura o cliente pelo nome;
2. lê o perfil (posicionamento, identidade visual, observações importantes, Drive),
   as datas comemorativas e os temas já usados;
3. cria os temas e grava no Conteúdo da semana, marcados como **"sugerido pelo agente"**
   para a equipe revisar.

Autenticação em todas as chamadas (a mesma do agente de design):

```
Authorization: Bearer <AGENT_API_KEY>
```

## 1. Encontrar o cliente e ler o perfil

```
GET https://upmcp.vercel.app/api/agent/clients?q=7ball
```

O nome pode vir sem acento, com maiúscula ou pedaço do nome. Se achar mais de um cliente,
a resposta traz a lista para escolher; repita com `?id=<id>`. Sem parâmetros, lista todos.

Campos principais da resposta:

| Campo | O que é |
|---|---|
| `posicionamento` | quem é o cliente, público, diferenciais, tom de voz |
| `identidade_visual.texto` / `.arquivos` | cores, fontes, estilo + logo e manual (links valem 7 dias) |
| `observacoes_importantes` | o que evitar, pedidos recorrentes, cuidados |
| `link_drive` | pasta do cliente no Drive |
| `semana_para_criar_agora` | a semana de publicação que está em produção agora (2 semanas à frente) |
| `semanas[]` | semana atual e as 5 seguintes: prazos, `datas_especiais`, `campanhas_do_mes`, `temas_ja_planejados` |
| `temas_recentes` | temas dos últimos 60 dias, para não repetir assunto |
| `regras_de_prazo` | as regras de antecedência da Up! |

## 2. Gravar os temas criados

```
POST https://upmcp.vercel.app/api/agent/entries
Content-Type: application/json

{
  "client_id": "<id do passo 1>",
  "entries": [
    {
      "day": "2026-10-19",
      "format": "Reels",
      "theme": "Educativo — Treino funcional em dupla",
      "post_time": "19h",
      "notes": "Por que: data de …",
      "refs": ["https://www.instagram.com/reel/…"],
      "brief": {
        "request_type": "Reels / edição de vídeo",
        "priority": "media",
        "placements": ["Reels", "Feed"],
        "must_have": "Logo no rodapé\nLegendas",
        "important_notes": "Takes da academia cheia, música animada",
        "piece_text": "Treinar junto rende mais"
      }
    }
  ]
}
```

- `format`: `Reels`, `Carrossel`, `Estático`, `Story` ou `Vídeo`.
- `brief` é opcional; os campos seguem o **Briefing para o design** (ver `docs/agente-design.md`).
- Até 40 temas por chamada. Os temas entram com o briefing em **rascunho**; a equipe revisa,
  marca "pronto para o design" e aí o agente de design pode enviar.

---

## Já pronto no sistema

### Botão "✨ Criar temas com IA" (Conteúdo da semana)

Em cada semana, a equipe clica, escreve orientações opcionais e escolhe quantos posts.
O servidor (`/api/content-agent`) chama o Claude (modelo `claude-opus-5-5`) com o perfil do cliente,
as datas da semana e os temas recentes, e grava os temas com briefing. Precisa da variável
`ANTHROPIC_API_KEY` no Vercel (chave criada em console.anthropic.com, com créditos).

### Conector para o app do Claude (MCP)

Endereço do conector: `https://upmcp.vercel.app/api/mcp/<AGENT_API_KEY>`

No app do Claude: **Configurações → Conectores → Adicionar conector personalizado** e cole o endereço.
Depois é só pedir: *"crie o conteúdo da semana da 7ball"*. Ferramentas disponíveis:
`listar_clientes`, `consultar_cliente`, `ver_temas_da_semana`, `gravar_temas`.

O endereço contém a chave: trate-o como senha. Para trocar, mude `AGENT_API_KEY` no Vercel
(isso também muda a chave do agente de design).
