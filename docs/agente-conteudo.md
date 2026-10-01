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

### Especialista do cliente (Conteúdo da semana e Calendário mensal)

Cada cliente tem um **especialista**: o perfil do cliente mais o **segmento** (com as regras do segmento — ex.: psicologia segue o Código de Ética do CFP), o **idioma dos posts**, a região, o site, as redes, os concorrentes e os **aprendizados** (o que já foi confirmado com o cliente e as perguntas em aberto). Tudo fica em **Perfil do cliente → Especialista do cliente**.

Botões:
- **"✨ Chamar o especialista"** em cada semana do Conteúdo da semana;
- **"✨ Criar calendário com IA"** no Calendário mensal (fontes: meses anteriores, texto ou áudio).

Ao chamar, o especialista:
1. faz a **revisão antes de executar** (perfil incompleto, prazos vencidos, temas com briefing pronto/enviado, perguntas em aberto); se houver bloqueio, pede "Seguir assim";
2. passa o trabalho pelo time, uma etapa por vez: **pesquisa na internet** (tendências e notícias, concorrentes e referências, site e redes do cliente — reaproveitada por 7 dias), **estrategista**, **redator** e **diretor de arte** juntos, **designer** (layout e pedidos de imagem) e **revisor** (confere as regras e devolve a versão final). No mês: pesquisa, estrategista e revisor;
3. mostra a **proposta editável** (tema, texto da peça, legenda, briefing, layout, perguntas para o cliente). Nada é gravado sem a equipe clicar em **Gravar**;
4. ao gravar, desenvolve os temas que já existiam (sem trocar dia nem assunto), cria os novos e manda as perguntas novas para as **Pendências** do perfil do cliente.

Se a janela fechar no meio, a execução fica salva: ao abrir de novo, aparece **Retomar**.

Rotas: `/api/agent-runs` (criar e retomar), `/api/agent-runs/<id>/step` (próxima etapa), `/api/agent-runs/<id>/approve` (gravar). Precisa de `ANTHROPIC_API_KEY` no Vercel (chave criada em console.anthropic.com, com créditos) e do SQL `supabase/008_especialistas.sql`.

### Conector para o app do Claude (MCP)

Endereço do conector: `https://upmcp.vercel.app/api/mcp/<AGENT_API_KEY>`

No app do Claude: **Configurações → Conectores → Adicionar conector personalizado** e cole o endereço.
Depois é só pedir: *"crie o conteúdo da semana da 7ball"*. Ferramentas disponíveis:
`listar_clientes`, `consultar_cliente`, `ver_temas_da_semana`, `desenvolver_temas`, `gravar_temas`.

O endereço contém a chave: trate-o como senha. Para trocar, mude `AGENT_API_KEY` no Vercel
(isso também muda a chave do agente de design).
