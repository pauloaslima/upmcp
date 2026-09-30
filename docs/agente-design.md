# Agente de demandas para o designer — como ler os briefings do Up! Fluxo

Cada tema do **Conteúdo da semana** tem um "Briefing para o design". Quando o funcionário
marca **"Briefing pronto para enviar ao design"**, ele fica disponível para o agente.

## Autenticação

Configure no Vercel a variável `AGENT_API_KEY` (uma senha longa). O agente envia:

```
Authorization: Bearer <AGENT_API_KEY>
```

## 1. Buscar os briefings prontos

```
GET https://upmcp.vercel.app/api/agent/briefs?status=pronto
```

Filtros opcionais: `from=AAAA-MM-DD`, `to=AAAA-MM-DD` (data de publicação), `client_id=<id>`,
`status=rascunho|pronto|enviado`.

Resposta (um item por tema):

| Campo | Vai para o card do designer em |
|---|---|
| `title` | título do card (`Cliente — Tema`) |
| `cliente_final` | **Cliente final** |
| `tipo_de_solicitacao` | **Tipo de solicitação** |
| `prioridade` | **Prioridade** (Baixa, Média, Alta) |
| `prazo` / `prazo_texto` | **Prazo** (`AAAA-MM-DDTHH:MM`, horário de Brasília) |
| `labels` | etiquetas (formato: Reels, Carrossel…) |
| `descricao` | **Descrição**, já no formato do designer (onde será usada, não pode faltar, referências, observações, título + texto, ID visual) |
| `anexos` | **Anexos** (fotos do post; `url` vale 7 dias) |
| `id_visual` | **ID VISUAL** (`texto` e `arquivos` do cliente) |

Os campos também vêm separados (`onde_sera_usada`, `nao_pode_faltar`, `referencias`,
`referencias_comentario`, `observacoes_importantes`, `titulo_e_texto`, `data_publicacao`,
`horario_publicacao`) para o agente montar como preferir.

## 2. Marcar como enviado

Depois de criar o card no sistema do designer:

```
POST https://upmcp.vercel.app/api/agent/briefs
Content-Type: application/json

{ "entry_id": "<entry_id recebido no GET>", "designer_card_url": "https://…/card/123" }
```

O tema passa a aparecer como **"enviado ao design"** no Up! Fluxo, com o link do card.
Assim o agente não envia a mesma demanda duas vezes.
