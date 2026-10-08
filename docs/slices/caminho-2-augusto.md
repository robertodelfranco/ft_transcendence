# Caminho 2 — Auth e Netcode · Augusto

> Escopo da Slice 2, de ponta a ponta: o que é meu, o que eu faço sozinho, de quem eu dependo e o que eu explico na defesa. A alocação está no [plano §9](../catacombs42-plano-de-tarefas.md#9-divisão-entre-as-5-pessoas); as estimativas e os "pronto quando" são copiados do [plano §5](../catacombs42-plano-de-tarefas.md#5-tarefas-por-frente), sem reinterpretação. Calendário: [replanejamento-e-board.md](../pm/replanejamento-e-board.md) (defesa em 21/11). Vocabulário: [CONTEXT.md](../../CONTEXT.md).
>
> Papel no time: **Dev**. Contratos que eu escrevo: `auth.md`, `ws-manager.md` (nenhum dos dois existe em `docs/contracts/` ainda — são a minha primeira entrega). Contratos que eu assino: [ws-messages.md](../contracts/ws-messages.md), [rooms.md](../contracts/rooms.md), [infra.md](../contracts/infra.md), [mount-game.md](../contracts/mount-game.md), [rules.md](../contracts/rules.md).

## 1. Inventário

**≈ 24 d de tarefa**, mais os dois contratos (sem estimativa própria no plano — fazem parte de F0.2).

### Contratos (prioridade antes de qualquer código)

`auth.md` e `ws-manager.md`. Enquanto não existem, o Akita não sabe que tabelas de usuário desenhar no diagrama, o Caio não sabe o que `CurrentUser` entrega, e ninguém sabe a lista de `code` de erro. São o meu caminho crítico **para os outros**, do jeito que `rooms.md`, `matches-api.md` e `infra.md` são o do Akita.

### F0 e F6 — fundação e auth (7 d)

| ID | Tarefa | d | Depende de | Sem. | Pronto quando |
|---|---|---|---|---|---|
| F0.3 | Backend vira pacote `backend/app/` com `create_app()`, `pydantic-settings`, envelope de erro, `GET /api/health`, `pytest` + `httpx.ASGITransport` | 1,5 | — | S1 | Teste de `/health` verde no CI |
| F6.1 | Migrações `users`, `refresh_tokens`, `oauth_accounts`, `friendships` (com F5.1) | 0,5 | F5.1 | S1 | Sobem junto com as de F5 |
| F6.2 | Signup, login e `me`: Argon2id, JWT de acesso, validação Pydantic, mesma mensagem para e-mail e senha errados | 2 | F6.1 | S1 | C2: signup → login → `me` pelo Nginx com HTTPS |
| F6.4 | `get_current_user` e `authenticate_ws_token` | 0,5 | F6.2 | S1 | Outras frentes usam `CurrentUser` |
| F6.3 | Refresh com rotação e detecção de reuso; logout | 1,5 | F6.2 | S2 | Reuso de refresh antigo revoga a família |
| F6.5 | Middlewares: logging JSON com `request_id`, handlers de erro no envelope, `RateLimit` como dependência | 2 | F0.3 | S2 | 6 logins errados em 1 min dão 429 |

### F2 — netcode, servidor e cliente (15 d)

| ID | Tarefa | d | Depende de | Sem. | Pronto quando |
|---|---|---|---|---|---|
| F2.1 | `ConnectionManager` (`connect`, `disconnect`, `send_to_user`, `broadcast`, `is_online`, `online_users`, callback de presença) com testes por fake de socket, e o endpoint `/ws/app` | 2 | F0.3, F6.4 | S2 | Presença funciona com duas abas do mesmo User |
| F2.2 | `protocol.py` (Pydantic, união discriminada por `type`) e `types.ts` espelhado | 1 | F0.2 | S2 | Mensagem inválida fecha com `4400` |
| F2.3 | `RoomManager` + uma `asyncio.Task` por Room, tick fixo 30 Hz com compensação de deriva, Snapshot a cada 2 ticks; `join` atômico | 2 | F1.6 | S2 | Room criada, iniciada e cancelada sem vazar task |
| F2.4 | `WS /ws/game/{match_id}`: `join` com token em ≤ 5 s, `welcome`, laço de leitura, códigos `44xx` | 1,5 | F2.3, F6.4 | S2 | Testes de `join` sem token, válido e malformado |
| F2.5 | Cliente: socket, `mountGame`, `ViewState` montado do último Snapshot (sem prediction ainda), envio de Input e Action | 1,5 | F2.4 | S2 | C2: 1 player anda com movimento decidido pelo servidor |
| F2.6 | N players; limite de 60 Inputs/s; `dt` do servidor; `Seq` monotônico; fila por conexão com descarte | 1 | F2.5 | S3 | 5 abas numa Room sem travar |
| F2.8 | Interpolation dos outros a `now − 100 ms` | 1 | F2.6 | S3 | Outro player desliza sem saltos |
| F2.9 | Fim de partida: chamar `record_match_result` uma vez, remover a Room após 60 s, `4503` no desligamento | 1 | F5.3 | S3 | Teste: `game_over` → uma chamada, mesmo com ticks depois |
| F2.10 | Grace period de 30 s e Reconnection com Snapshot completo; no PvP, grace expirada conta derrota | 2 | F2.7 | S4 | Fechar a aba e voltar em 20 s mantém HP e chaves |
| F2.12 | `ping/pong` com RTT na HUD; teste de aceite com throttling (100 ms + 2 % de perda, 5 min) anotado no PR | 1 | F2.8 | S5 | Resultado do teste no PR |

Fora da minha Slice dentro de F2: **F2.7** (Prediction/Reconciliation) e **F2.13** (teste de carga) são do Roberto desde 28/09.

### F8 — monitoring (1 d)

| ID | Tarefa | d | Depende de | Sem. | Pronto quando |
|---|---|---|---|---|---|
| F8.7 | `GET /metrics` com `prometheus_client`, só na rede interna; `http_requests_total{route,status}`, `auth_login_total{result}`, `ws_connections{channel}`, `game_rooms_active`, `game_tick_seconds` (histograma) | 1 | F2.3, F6.5 | S3 | `curl backend:8000/metrics` de dentro da rede mostra as cinco séries; de fora, não responde |

### F9 — de todos

F9.1 (minha parte do README) na S5; F9.2 (ensaio) na S6.

## 2. Fronteiras: o que é meu e o que não é

Cada linha existe porque, mal entendida, faz duas pessoas escreverem a mesma coisa ou ninguém escrever nada.

| Coisa | É minha? | De quem é, então |
|---|---|---|
| Prediction, Reconciliation, `applyInput.ts` | **Não** | Roberto (F2.7). Eu entrego o `net/` (socket, Interpolation); a Prediction entra entre o meu socket e o Renderer do Rafael, sem eu tocar nela |
| Teste de carga do tick (F2.13) | **Não** | Roberto |
| `step(room, dt)`, Simulation | **Não** | Roberto. Meu `RoomManager` (F2.3) só **chama** `step()` dentro da task do tick |
| Telas de perfil e amigos | **Não** | Caio (F6.6–F6.7), front e back | 
| Schema da tabela `friendships` | **Sim** | Eu escrevo a migração (F6.1); o Caio implementa as rotas por cima dela |
| `record_match_result` | **Não** | Akita (F5.3). Eu **chamo** a função uma vez no `game_over` (F2.9) |
| Emissão de tokens no login por OAuth (Google e 42) | **Sim**, reusada | O fluxo OAuth (F6.8) é do Akita; ele chama a mesma `issue_tokens` que eu escrevo em F6.2, para o User sair com o mesmo par access/refresh de sempre. O contrato das rotas e do vínculo de contas está no meu `auth.md` §2.8 |
| Interface do `RoomManager` que implemento | Segue **`rooms.md`** (Akita) | A arq. §10.2 ainda descreve uma versão antiga (`room_id` string, sem `set_ready`/`list_open`/`created_by`); `rooms.md` §2.1 já registra essa divergência como "Em aberto" 7, de responsabilidade do Roberto. Enquanto não for corrigida na arquitetura, implemento pelo contrato, não pela arq. §10.2 |
| `RateLimit` usado em `POST /api/matches` | **Sim**, a dependência; o uso é do Akita | [matches-api.md](../contracts/matches-api.md) §4 decisão 6 já propõe 10/min por User com a minha dependência |

## 3. O que eu entrego para os outros

| Entrego | Quem consome | Para quê | Até |
|---|---|---|---|
| **`auth.md`**: tabelas de usuário, `CurrentUser`, envelope de erro, lista de `code`, duração dos tokens | Akita (diagrama e migração inicial), Caio (telas de login/cadastro), todos | base de tudo que autentica | **esta semana (S1)** |
| **`ws-manager.md`**: `ConnectionManager`, mensagens de `/ws/app`, códigos de fechamento | Akita (lobby em tempo real), Caio (presença de amigos) | lobby sem polling e status online | **esta semana (S1)** |
| `CurrentUser` / `get_current_user` | Caio, Akita | toda rota autenticada | fim de S1 (F6.4) |
| `authenticate_ws_token` | eu mesmo (F2.4) | `join` do WebSocket | fim de S1 |
| Envelope de erro + `RateLimit` | todos | toda rota | S1–S2 (F0.3, F6.5) |
| `ConnectionManager` | Akita (F5.2, lobby), Caio (F6.7, presença) | broadcast e presença | S2 (F2.1) |
| `RoomManager` implementado (interface de `rooms.md`) | Akita (F5.2 chama `create`/`join`/`start`) | ciclo de vida do lobby | S2 (F2.3) |
| `protocol.py` / `types.ts` | Roberto (sim.py/applyInput.ts), Rafael (render) | única fonte de verdade das mensagens | S2 (F2.2) |
| `/metrics` com as 5 séries | Akita (F8.8, dashboards) | Prometheus ter o que coletar do backend | S3 (F8.7) |
| `conftest` de testes do backend | Akita (F5.1 e seguintes) | testes de todas as Slices de backend | fim de S1 (F0.3) |

## 4. O que eu faço sozinho

Nada aqui espera ninguém, exceto onde marcado. É por onde eu começo se algo travar.

| Tarefa | Por que é solo |
|---|---|
| **Os dois contratos** | preciso só da arquitetura e do `contracts/README.md`; ninguém os escreve por mim |
| **F0.3** | pacote do backend, sem dependência externa |
| **F6.1, F6.2, F6.4** | dependem de F5.1 (migração do Akita) só para a ordem de apply; o código é meu |
| **F6.3** | depende só de F6.2 |
| **F2.2** `protocol.py` | posso escrever contra o meu próprio `ws-messages.md`/`auth.md`, sem esperar Roberto ou Rafael |
| **F8.7** | depende de F2.3 e F6.5, ambas minhas |
| **F6.5** | depende só de F0.3 |

## 5. De quem eu dependo

| Preciso de | De quem | Para quê | Até |
|---|---|---|---|
| **F5.1**: migração inicial com `users` antes de `matches` | Akita | minha F6.1 não nasce fora da cadeia do Alembic | início de S1 |
| **[infra.md](../contracts/infra.md)**: path que o backend enxerga, cabeçalho do IP real, timeout do WebSocket | Akita | `Path` do cookie de refresh, rate limit por IP, `proxy_read_timeout` para a Reconnection | S1 (perguntas 4 e 5 do meu briefing, resolvidas junto com o Akita) |
| **[i18n.md](../contracts/i18n.md)**: tamanho máximo de avatar, catálogo de `code` de erro | Caio | limite de corpo do `client_max_body_size`, lista fechada de `code` em `auth.md` | antes de fechar `auth.md` |
| **F1.6**: `CoopRuleset`, `game_over` emitido uma vez | Roberto | minha F2.3 (`RoomManager` chama `step()`) e F2.9 (fim de partida) | S2 |
| **F5.3**: `record_match_result` implementado | Akita | minha F2.9 chama essa função | S3 |
| Formato de `friendships` combinado | Caio | ele monta as rotas de amigos sobre a tabela que eu desenho em F6.1 | antes de eu fechar a migração |
| Par em F2.3 | Roberto | ele mexe no mesmo laço de tick pela Simulation; a arq. §9 pede essa dupla nas primeiras horas | S2 |
| Par em F2.5 | Roberto | o `net/` do cliente é onde a Prediction dele entra; combinar a interface evita refazer | S2 |

**Dependência cruzada que eu devo a outros:** o Akita precisa do meu `auth.md` para o diagrama e a migração inicial, e do meu `ws-manager.md` para o lobby em tempo real; o Caio precisa dos dois para telas de login e presença de amigos. **Esses dois arquivos são o meu caminho crítico para o time**, exatamente como os três do Akita são para ele.

## 6. Decisões a travar antes de escrever código

As 9 perguntas do meu briefing ([contracts/README.md](../contracts/README.md)), cada uma com proposta minha (ainda não aprovada em reunião — a reunião de contratos de 04/10 já passou no calendário replanejado, então estas decisões precisam ser fechadas **esta semana**, por mensagem com Akita e Caio onde for o caso, não adiadas para uma próxima reunião):

1. **Login só por e-mail, ou também por `username`?** Proposta: só e-mail no login (mais simples, e o módulo não exige as duas portas); `username` fica único para exibição e perfil público.
2. **`fields` do 422 leva código ou mensagem pronta?** Proposta: só código (`{"password": "too_short"}`) — é a única forma traduzível, e o `i18n.md` do Caio já assume isso.
3. **401 do `/api/auth/refresh` sem sessão gera erro no console?** Combinar com o Caio: a casca trata esse 401 esperado sem deixá-lo subir como `console.error` (por exemplo, captura explícita no cliente HTTP, sem relançar).
4. **Header do IP real atrás do Nginx.** Resolvido junto com o Akita em `infra.md`: `X-Forwarded-For` + `X-Real-IP`, `uvicorn --proxy-headers`.
5. **Path que o backend enxerga.** Resolvido com o Akita em `infra.md`: sem reescrita, o backend vê `/api/...` inteiro; `Path` do cookie de refresh é `/api/auth/refresh`.
6. **Access token dura 15 min; o socket dura mais.** Proposta: autenticar só no `join`; token vencido depois não derruba a conexão (é a pergunta 4 de [ws-messages.md](../contracts/ws-messages.md) §5, que remete para aqui).
7. **Como o cliente sabe quem já estava online ao entrar.** Proposta: `welcome`/`join` de `/ws/app` devolve a lista de amigos já online, e as mensagens de presença seguintes só avisam mudanças.
8. **Conta só com login por OAuth (Google ou 42), sem senha.** Proposta: `password_hash` nulo; tentar logar por senha nessa conta devolve a mesma mensagem genérica de credencial errada (não revela que a conta existe sem senha).
9. **Logout revoga o token atual ou a família?** Proposta: só o atual; a família inteira só é revogada por detecção de reuso (RFC 9700), não por logout comum.

Mais quatro coisas que preciso saber explicar sobre o proxy, mesmo sendo arquivo do Akita (o `infra.md` do Akita já responde as quatro, §2.3):
- onde o TLS termina e por que o cookie de refresh continua `Secure`;
- como o `proxy_pass` reescreve (ou não) o caminho, com e sem a barra final;
- quais cabeçalhos o Nginx acrescenta e quais já passam;
- o que um WebSocket exige do proxy (upgrade, timeout longo).

Itens de outros contratos que caem em mim, com proposta registrada para eu levar à conversa com quem decide:

| Onde | Questão | Proposta |
|---|---|---|
| [ws-messages.md](../contracts/ws-messages.md) §5.1 | Onde mora a fila de Input/Action do §2.9 | A fila fica no `Player` (`state.py`, Roberto); meu laço de leitura do socket só valida a mensagem e a coloca na fila; quem consome é o `step` |
| [ws-messages.md](../contracts/ws-messages.md) §5.3 | O mesmo User abre um segundo socket na Room | A conexão nova vence; a antiga fecha com um código novo (`4408`, "substituída") |
| [ws-messages.md](../contracts/ws-messages.md) §5.5 | `join` numa Room ainda em `lobby` | Fechar com `4409`: a casca só navega para `/play` depois do `match_started` |
| [rooms.md](../contracts/rooms.md) §5.4 | Quem emite `achievement_unlocked` | `record_match_result` devolve a lista de desbloqueios; a Room (meu código em F2.9) emite o Event — função do Akita fica sem dependência de rede |
| [matches-api.md](../contracts/matches-api.md) §4.6 | Rate limit em `POST /api/matches` | 10/min por User, com a minha dependência `RateLimit` |

## 7. Ordem de execução e carga por semana

No calendário replanejado ([replanejamento-e-board.md](../pm/replanejamento-e-board.md)): S1 até 10/10 (duas semanas já contadas), C2 em 16/10, C3 em 23/10, C4 em 30/10, C5 em 13/11, defesa em 21/11.

| Semana | O que eu entrego | d |
|---|---|---|
| **S1** · até 10/10 | **`auth.md`** e **`ws-manager.md`** (hoje/esta semana, antes de qualquer código) · F0.3 · F6.1 · F6.2 · F6.4 | 4,5 |
| **S2** · 11–17/10 | F2.1 (versão mínima: `connect`/`send_to_user`/`broadcast` e `/ws/app` sem o catálogo de presença de amigos, que fica para a S3) · F2.2 · F2.3 (par com Roberto) · F2.4 · F2.5 (par com Roberto) | ≈ 7 |
| **S3** · 18–24/10 | F2.1 completo (presença) · F6.3 (com o Plano B do plano §8.2: access de 8 h até aqui) · F6.5 · F2.6 · F2.8 · F2.9 · F8.7 | ≈ 6 |
| **S4** · 25–31/10 | F2.10 | 2 |
| **S5** · 01–14/11 *(duas semanas)* | F2.12 · F9.1 · folga para bug e revisão | 1 + folga |
| **S6** · 15–21/11 | bug, README fechado, ensaio | — |

**S2 é a semana mais apertada:** ≈ 7 d numa semana de 5, mesmo depois de eu já ter adiado a presença completa do F2.1 para a S3. É o preço de F2.1–F2.5 estarem todos no caminho crítico do C2 (plano §4) e dependerem em sequência um do outro. Decisão tomada aqui, não escondida: se C2 (16/10) não sair inteiro, o que atraso primeiro é a Interpolation (F2.8) e a presença de amigos (resto do F2.1), empurrando ambos para a S3 — nenhum dos dois é citado no critério do C2. Levo isso para a reunião de segunda se o atraso passar de 50 % de alguma tarefa (regra do plano §8.1).

## 8. Divergências encontradas nos documentos

Acho melhor registrar aqui e avisar o dono de cada arquivo do que implementar por um documento e descobrir o conflito depois:

1. **`RoomManager` tem duas interfaces descritas.** A arq. §10.2 ainda usa `room_id` string e não tem `set_ready`/`list_open`/`created_by`; `rooms.md` §2.1–2.2 (Akita) já tem a versão nova e registra a divergência em "Em aberto" 7, atribuída ao Roberto (dono da arquitetura). Eu implemento pela versão de `rooms.md`.
2. **`proxy/nginx.conf` atual** ainda tem `proxy_pass http://backend:8000/;` com barra final, que reescreve o caminho — o oposto do que `infra.md` §4 decisão 5 fixa. Fica para o PR de F8.1 (Akita) trocar.
3. **Falta o ADR de tokens.** F0.5 pede três ADRs curtos (servidor autoritativo, tokens, Three.js puro); existem o `001-servidor-autoritativo.md` e o `003-threejs-mountgame.md`, mas não o `002`, que é a decisão de tokens (arq. §4, decisão 1). Como é sobre a minha área, escrevo esse ADR junto com `auth.md`.
4. **`matches-api.md` §3** ainda mostra `enemy_density` num exemplo de resposta; a revisão de 02/10 do plano retirou essa opção do escopo. Não é meu arquivo — aviso o Akita, não mexo.

## 9. O que eu explico na defesa

Por módulo que passa pela minha Slice (plano §7):

| Módulo | O que eu abro e explico |
|---|---|
| **Real-time (WebSockets)** (Major, parte minha) | o protocolo de `/ws/game` e `/ws/app`; por que o Snapshot pode ser descartado e o Event nunca; como o lobby atualiza sem polling |
| **Remote players** (Major) | Grace period e Reconnection; o teste de aceite com throttling (100 ms + 2 % de perda); por que o servidor nunca usa um `dt` vindo do cliente |
| **Multiplayer 3+** (Major, parte minha) | `ConnectionManager` com várias abas do mesmo User; a fila por conexão com descarte, e por que ela não trava a Room |
| **Standard user management** (Major, parte minha) | o fluxo de tokens (access em memória, refresh rotacionado em cookie `HttpOnly`); detecção de reuso de refresh; Argon2id e por quê |
| **Monitoring** (Major, parte minha) | por que `game_tick_seconds` é histograma e `auth_login_total` é counter; por que `/metrics` não é alcançável de fora do compose |
| **Obrigatórios** | hash de senha com salt; validação de input no front e no back (minha parte: back); vários usuários simultâneos sem corrida (`join` atômico do `RoomManager`, que eu implemento) |

Respostas que eu preciso ter na ponta da língua: **por que o refresh é opaco e não JWT** (revogação exige tabela; JWT sem tabela não revoga); **por que o token do WebSocket vai na primeira mensagem e não na query string**; **por que um worker só** (o `ConnectionManager` e o `RoomManager` são dicionários em processo); **como a fila de Input garante que cliente e servidor aplicam exatamente a mesma sequência**, mesmo sem eu ser o autor da Prediction.

A "modificação rápida" que podem pedir na minha parte (subject, cap. VII): um novo código de fechamento do WebSocket, um campo novo em `ws-manager.md`, uma métrica nova em `/metrics`, uma regra de validação nova em `auth.md`. Ensaiar na S6.

---

> **Links para contratos que ainda não existem:** `auth.md` e `ws-manager.md` (meus) e `i18n.md` (Caio). Os dois meus bloqueiam parcialmente o Akita e o Caio, por isso vêm antes de qualquer código.
