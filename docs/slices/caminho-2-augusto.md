# Caminho 2 — Auth e Netcode · Augusto

> Escopo da Slice 2, de ponta a ponta: o que é meu, o que eu faço sozinho, de quem eu dependo e o que eu explico na defesa. A alocação está no [plano §9](../catacombs42-plano-de-tarefas.md#9-divisão-entre-as-5-pessoas); as estimativas e os "pronto quando" são copiados do [plano §5](../catacombs42-plano-de-tarefas.md#5-tarefas-por-frente), sem reinterpretação. Calendário: [replanejamento-e-board.md](../pm/replanejamento-e-board.md) (defesa em 21/11). Vocabulário: [CONTEXT.md](../../CONTEXT.md).
>
> Papel no time: **Dev**. Contratos que eu escrevo: [auth.md](../contracts/auth.md) e [ws-manager.md](../contracts/ws-manager.md), mais o [ADR 0002](../adr/002-tokens.md). Contratos que eu assino: [ws-messages.md](../contracts/ws-messages.md), [rooms.md](../contracts/rooms.md), [infra.md](../contracts/infra.md), [mount-game.md](../contracts/mount-game.md), [rules.md](../contracts/rules.md).
>
> **Atualizado em 16/10**: F2.2, F2.1 (parte 1), F2.3, F2.4, F6.2, F6.4 e F6.5 na `main`; F2.5 em PR rascunho (#109); F2.1 parte 2 implementada na branch `86-f2-1-ws-app`. A revisão anterior, de 12/10, veio da leitura do Akita.

## 1. Inventário

**≈ 24 d de tarefa**, mais os dois contratos (que fazem parte de F0.2 e não têm estimativa própria no plano).

| Estado | Significado |
|---|---|
| ✅ | na `main` |
| 🔄 | PR aberto, ou parte da tarefa entregue |
| ⏳ | não começou |

### Contratos

| Entrega | Estado |
|---|---|
| [auth.md](../contracts/auth.md): rotas, objeto User, envelope de erro, tokens, OAuth (Google e 42), tabelas | ✅ desde 07/10; revisado em 12/10 com a leitura do Akita |
| [ws-manager.md](../contracts/ws-manager.md): `ConnectionManager`, `/ws/app`, publicação do lobby, códigos de fechamento, reconexão | ✅ desde 07/10; revisado em 12/10 (W1, W3, §2.9, D-B) |
| [ADR 0002](../adr/002-tokens.md): tokens | ✅, status "proposto" |

### F0 e F6 — fundação e auth (7 d)

| ID | Tarefa | d | Depende de | Sem. | Pronto quando | Estado |
|---|---|---|---|---|---|---|
| F0.3 | Backend vira pacote `backend/app/` com `create_app()`, `pydantic-settings`, envelope de erro, `GET /api/health`, `pytest` + `httpx.ASGITransport` | 1,5 | — | S1 | Teste de `/health` verde no CI | ✅ #43 (PR #44) |
| F6.1 | Migrações `users`, `refresh_tokens`, `oauth_accounts`, `friendships` (com F5.1) | 0,5 | F5.1 | S1 | Sobem junto com as de F5 | ✅ modelos (#51, PR #52); migração na `0001_initial` do Akita (#29, PR #78) |
| F6.2 | Signup, login e `me`: Argon2id, JWT de acesso, validação Pydantic, mesma mensagem para e-mail e senha errados | 2 | F6.1 | S1 | C2: signup → login → `me` pelo Nginx com HTTPS | ✅ #69 (PR #81) |
| F6.4 | `get_current_user` e `authenticate_ws_token` | 0,5 | F6.2 | S1 | Outras frentes usam `CurrentUser` | ✅ #70 (PR #93) |
| F6.3 | Refresh com rotação e detecção de reuso; logout | 1,5 | F6.2 | S2 | Reuso de refresh antigo revoga a família | 🔄 #87, implementada na branch `87-f6-3-refresh-logout` (com o limite de 30/min no refresh, que a F6.5 não tinha como pôr antes da rota existir) |
| F6.5 | Middlewares: logging JSON com `request_id`, handlers de erro no envelope, `RateLimit` como dependência | 2 | F0.3 | S2 | 6 logins errados em 1 min dão 429 | ✅ #88 (PR #96) |

### F2 — netcode, servidor e cliente (15 d)

| ID | Tarefa | d | Depende de | Sem. | Pronto quando | Estado |
|---|---|---|---|---|---|---|
| F2.1 | `ConnectionManager` (`connect`, `disconnect`, `send_to_user`, `broadcast`, `is_online`, `online_users`, callback de presença) com testes por fake de socket, e o endpoint `/ws/app` | 2 | F0.3, F6.4 | S2 | Presença funciona com duas abas do mesmo User | 🔄 parte 1 (classe) ✅ #65 (PR #66); parte 2 (`/ws/app`, presença, `publish_*`) #86 implementada na branch `86-f2-1-ws-app` |
| F2.2 | `protocol.py` (Pydantic, união discriminada por `type`) e `types.ts` espelhado | 1 | F0.2 | S2 | Mensagem inválida fecha com `4400` | ✅ #54 (PR #55) |
| F2.3 | `RoomManager` + uma `asyncio.Task` por Room, tick fixo 30 Hz com compensação de deriva, Snapshot a cada 2 ticks; `join` atômico | 2 | F1.6 | S2 | Room criada, iniciada e cancelada sem vazar task | ✅ #68 (PR #74) |
| F2.4 | `WS /ws/game/{match_id}`: `join` com token em ≤ 5 s, `welcome`, laço de leitura, códigos `44xx` | 1,5 | F2.3, F6.4 | S2 | Testes de `join` sem token, válido e malformado | ✅ #71 (PR #95) |
| F2.5 | Cliente: socket, `mountGame`, `ViewState` montado do último Snapshot (sem prediction ainda), envio de Input e Action | 1,5 | F2.4 | S2 | C2: 1 player anda com movimento decidido pelo servidor | 🔄 #72, PR rascunho #109: socket, input, `ViewState` e `createMountGame`; falta o `index.ts` (espera o Renderer, PR #105) e a prova no navegador |
| F2.6 | N players; limite de 60 Inputs/s; `dt` do servidor; `Seq` monotônico; fila por conexão com descarte | 1 | F2.5 | S3 | 5 abas numa Room sem travar | 🔄 #89, implementada na branch `89-f2-6-n-players`: limite de 60 mensagens/s com rajada de 120 por socket, testes com 5 sockets e com cliente lento |
| F2.8 | Interpolation dos outros a `now − 100 ms` | 1 | F2.6 | S3 | Outro player desliza sem saltos | ⏳ #90 |
| F2.9 | Fim de partida: chamar `record_match_result` uma vez, remover a Room após 60 s, `4503` no desligamento | 1 | F5.3 | S3 | Teste: `game_over` → uma chamada, mesmo com ticks depois | 🔄 #91, implementada na branch `91-f2-9-fim-de-partida`: grava no `game_over`, tick só pela animação do Boss, Room removida em 60 s, `abort_unfinished` no `_abort` |
| F2.10 | Grace period de 30 s e Reconnection com Snapshot completo; no PvP, grace expirada conta derrota | 2 | F2.7 | S4 | Fechar a aba e voltar em 20 s mantém HP e chaves | ⏳ #107 |
| F2.12 | `ping/pong` com RTT na HUD; teste de aceite com throttling (100 ms + 2 % de perda, 5 min) anotado no PR | 1 | F2.8 | S5 | Resultado do teste no PR | ⏳ #108 |

Fora da minha Slice dentro de F2: **F2.7** (Prediction/Reconciliation) e **F2.13** (teste de carga) são do Roberto desde 28/09.

### F8 — monitoring (1 d)

| ID | Tarefa | d | Depende de | Sem. | Pronto quando | Estado |
|---|---|---|---|---|---|---|
| F8.7 | `GET /metrics` com `prometheus_client`, só na rede interna; `http_requests_total{route,status}`, `auth_login_total{result}`, `ws_connections{channel}`, `game_rooms_active`, `game_tick_seconds` (histograma) | 1 | F2.3, F6.5 | S3 | `curl backend:8000/metrics` de dentro da rede mostra as cinco séries; de fora, não responde | 🔄 #92, implementada na branch `92-f8-7-metrics` |

### F9 — de todos

F9.1 (minha parte do README) na S5; F9.2 (ensaio) na S6.

## 2. Fronteiras: o que é meu e o que não é

Cada linha existe porque, mal entendida, faz duas pessoas escreverem a mesma coisa ou ninguém escrever nada.

| Coisa | É minha? | De quem é, então |
|---|---|---|
| Prediction, Reconciliation, `applyInput.ts` | **Não** | Roberto (F2.7). Eu entrego o `net/` (socket, Interpolation); a Prediction entra entre o meu socket e o Renderer do Rafael, sem eu tocar nela |
| Teste de carga do tick (F2.13) | **Não** | Roberto |
| `step(room, dt)` e o resto da Simulation | **Não** | Roberto. O meu `RoomManager` só **chama** a porta (`from app.game import ...`) e nunca lê nem escreve campo da Room |
| `app/game/protocol.py` | **Sim** | Mora em `app/game/`, mas fora da porta: o `__init__.py` não o importa (backend/README.md) |
| Telas de perfil e amigos | **Não** | Caio (F6.6–F6.7), front e back |
| Modelos e schema de `users`, `refresh_tokens`, `oauth_accounts`, `friendships` | **Sim** | Eu escrevo os modelos (`app/auth/models.py`, na `main`); a migração `0001_initial` é do Akita, a partir deles; o Caio implementa as rotas de amigos por cima de `friendships` |
| `Base` do SQLAlchemy (`app/db/base.py`) | **Sim** | É compartilhada: as tabelas de partidas (F5) do Akita herdam dela |
| Sessão de banco (`DbSession`) e Alembic | **Não** | Akita (F5.1) |
| `record_match_result` | **Não** | Akita (F5.3, `app/matches/results.py`). Eu **chamo** a função uma vez no `game_over` (F2.9), e a Room emite os `achievement_unlocked` que ela devolve; no `_abort`, chamo `abort_unfinished(match_id)` ([rooms.md](../contracts/rooms.md) §2.5) |
| Emissão de tokens no login por OAuth (Google e 42) | **Sim**, reusada | O fluxo OAuth (F6.8) é do Akita; ele chama a mesma `issue_tokens` que eu escrevo em F6.2. O contrato das rotas, do vínculo de contas e do idioma está no meu `auth.md` §2.8 |
| Interface do `RoomManager` que implemento | Segue **`rooms.md`** (Akita) | Com `set_ready`, `list_open`, `room_of` e `avatar_url` no `join` (decisão D-A do Akita, 10/10) |
| Funções de publicação do lobby | **Sim**, a função; quem chama é o Akita | `publish_lobby_update(manager, info)` e as outras duas recebem o manager como primeiro argumento ([ws-manager.md](../contracts/ws-manager.md) §2.5) |
| `RateLimit` usado em `POST /api/matches` | **Sim**, a dependência; o uso é do Akita | 10/min por User ([matches-api.md](../contracts/matches-api.md) §4, decisão 6) |

## 3. O que eu entrego para os outros

| Entrego | Quem consome | Para quê | Estado |
|---|---|---|---|
| `auth.md` e `ws-manager.md` | Akita, Caio, todos | base de tudo que autentica; lobby e presença em tempo real | ✅ |
| Envelope de erro (`ApiError`), `request_id` | todos | toda rota erra no mesmo formato | ✅ F0.3 |
| `conftest` com as fixtures `app` e `client` | Akita (F5.1 e seguintes), Caio (F6.6–F6.7) | testes de rota de todas as Slices de backend | ✅ F0.3 |
| `Base` e modelos de usuário | Akita (F5.1: migração e FK `created_by`) | schema num metadata só | ✅ F6.1 (#52) |
| `protocol.py` / `types.ts` | Roberto (`sim.py`/`applyInput.ts`), Rafael (render), eu (F2.4, F2.5) | única fonte das mensagens do jogo | ✅ F2.2 |
| `CurrentUser` / `get_current_user`, `authenticate_ws_token` | Caio, Akita, eu (F2.4) | toda rota autenticada e o `join` dos sockets | ✅ F6.4 |
| `RateLimit` | Akita (`POST /api/matches`), eu (login) | 429 no envelope | ✅ F6.5 |
| `ConnectionManager` e as três funções de publicação | Akita (F5.2, lobby), Caio (F6.7, presença) | broadcast e presença | 🔄 a classe ✅; `/ws/app`, presença e `publish_*` na branch `86-f2-1-ws-app` |
| `RoomManager` (interface de `rooms.md`) | Akita (F5.2 chama `create`/`join`/`start`) | ciclo de vida do lobby | ✅ F2.3 |
| `/metrics` com as 5 séries | Akita (F8.8, dashboards) | Prometheus ter o que coletar do backend | ⏳ F8.7 |

## 4. O que eu faço sozinho

Nada aqui espera ninguém. É por onde eu sigo quando algo travar.

| Tarefa | Por que é solo |
|---|---|
| **F2.1, parte 1**: a classe `ConnectionManager` | só a §2.2 e a §2.7 do `ws-manager.md`; a autenticação entra no endpoint, que fica para a parte 2 |
| **F2.3** `RoomManager` | a porta da Simulation já está na `main`; o `CoopRuleset` (F1.6) só muda o que o `step` faz por dentro |
| **F6.2, parte sem banco** | hash Argon2id, JWT, refresh opaco e os schemas de validação não precisam da sessão de banco |
| **F6.5** | o log JSON e o `RateLimit` dependem só da F0.3 |

## 5. De quem eu dependo

| Preciso de | De quem | Para quê | Estado |
|---|---|---|---|
| **F5.1**: Alembic, `DbSession` e a migração `0001_initial` | Akita (#29) | a parte com banco da F6.2 e o fecho da F6.1 | ✅ PR #78 |
| **F1.6**: `CoopRuleset`, `game_over` emitido uma vez | Roberto | o fim de partida (F2.9) e um `step` com entidades no C2 | ✅ PRs #101 e #104 |
| **F5.3**: `record_match_result` | Akita | a F2.9 chama essa função | S3 |
| **F2.7**: Prediction e Reconciliation | Roberto | a reconexão (F2.10) | S3 |
| Par em F2.3 e F2.5 | Roberto | o laço do tick e o `net/` do cliente, onde a Prediction dele entra | S2 |

## 6. Decisões já fechadas

### As 9 perguntas do meu briefing

Todas decididas e escritas no [auth.md](../contracts/auth.md) §4 (número da decisão entre parênteses).

1. Login só por e-mail (2).
2. `fields` do 422 leva um código por campo, nunca frase (3).
3. `/refresh` sem sessão responde 200 `{"authenticated": false}`, sem 401 no console (4).
4. O IP real chega em `X-Forwarded-For`, com `uvicorn --proxy-headers` ([infra.md](../contracts/infra.md), decisão 6).
5. O backend enxerga `/api/...` inteiro; o cookie de refresh usa `Path=/api/auth` (6).
6. O WebSocket é autenticado só no `join` (9).
7. O `welcome` do `/ws/app` traz `online_friends` ([ws-manager.md](../contracts/ws-manager.md) §2.3).
8. Conta só de OAuth que tenta login por senha recebe `invalid_credentials` (10).
9. Logout revoga só o token atual (11).

### Combinadas com o Akita em 12/10

| Ponto | Decisão | Onde está |
|---|---|---|
| A1 | Os modelos de usuário saem comigo; a migração, com o Akita, conferida por `alembic check` | entregue (#52) |
| A2 | `preferred_language` com `DEFAULT 'en'` | `auth.md`, "Em aberto" 6 |
| A3 | `user_agent` cortado em 255 no código, sem `CHECK` | `auth.md` §2.9 |
| A4 | O log de requisição nunca grava a query string | `auth.md` §2.10 |
| A5 | OAuth com e-mail não confiável e sem conta existente dá `oauth_failed` | `auth.md` §2.8, decisão 19 |
| A6 | O `username` completa até 3 com `_`; `oauth_cancelled` não conta no `auth_login_total` | `auth.md` §4.12 e §2.10 |
| E-mail da 42 | confiável para vincular, com a condição de conferir a troca de e-mail na intra | `auth.md`, decisão 20 |
| Idioma no OAuth | `?lang` no link de login, guardado no cookie `oauth_state` | `auth.md`, decisão 21 |
| W1 | As funções de publicação recebem o manager como primeiro argumento | `ws-manager.md` §2.5 |
| W2 | `RoomManager.join` recebe o `avatar_url` | `ws-manager.md` §3 |
| W3 | `on_presence_change` aceita vários callbacks | `ws-manager.md` §2.2 |
| D-A | Um User, uma Room; `room_of(user_id)` no `RoomManager` | [rooms.md](../contracts/rooms.md) §2.2 |
| D-B | Lobby sem TTL; quem fica offline sai pelo callback de presença | `rooms.md`, decisão 10; `ws-manager.md` §2.5 |
| §2.9 | `4403`, `4404` e `4409` não reconectam | `ws-manager.md` §2.9 |
| `join` em Room ainda no lobby | fecha com `4404` | proposta do Akita; falta o Roberto registrar no `ws-messages.md` |
| `step` que falha 30 Ticks seguidos | fecha com `4503` e o Match vira `aborted` | decisão do Akita; falta registrar no `ws-messages.md` |
| `achievement_unlocked` | `record_match_result` devolve a lista e a Room emite (fechado em 21/10, na F5.3) | `rooms.md` §2.5 e "Em aberto" 4 |

### Decididas em 16/10, na F2.1 parte 2

| Ponto | Decisão | Onde está |
|---|---|---|
| Código repetido entre `/ws/game` e `/ws/app` | `Refused`, `receive`, `refuse`, `get_authenticate` e `JOIN_TIMEOUT_S` saem de `app/game/router.py` para `app/ws/handshake.py`; os dois endpoints importam de lá | código; os testes do `/ws/game` não mudaram |
| Ordem do `welcome` | registra o socket, lê os amigos online, manda o `welcome`. Uma `presence` ou um `lobby_update` podem chegar antes, e o cliente pode ignorá-los | [ws-manager.md](../contracts/ws-manager.md) §2.4 e decisão 13 |
| Amizade no socket | atrás de um `FriendGraph` no `app.state`, trocado nos testes por um dicionário (fixture `fake_friends`) | `ws-manager.md`, decisão 14 |
| Quem chama os `publish_*` | o lobby do Akita (#32), depois do `commit`; a F2.1 só entrega as funções | `ws-manager.md` §2.5 |

### Ainda abertas

- ~~Onde mora a fila de Input~~: decidido. A porta do Roberto tem `enqueue(room, user_id, message)`, e o laço de leitura do `/ws/game` só valida e chama `enqueue` (F2.4, na `main`).
- **O cliente prevê `fire` e `door`, ou só o movimento?** Proposta: só o movimento. Decido com o Roberto na S3, junto da F2.7.

## 7. Ordem de execução e carga por semana

No calendário replanejado ([replanejamento-e-board.md](../pm/replanejamento-e-board.md)): C2 em 16/10, C3 em 23/10, C4 em 30/10, C5 em 13/11, defesa em 21/11.

| Semana | O que eu entrego | d | Estado |
|---|---|---|---|
| **S1** · até 10/10 | `auth.md` · `ws-manager.md` · F0.3 · F6.1 (modelos) | — | ✅ (F6.2 e F6.4 passaram para a S2) |
| **S2** · 11–17/10 | F2.2 · F2.1 parte 1 (`ConnectionManager`) · F2.3 · F6.2 · F6.4 · F2.4 · F2.5 | ≈ 9,5 | tudo na `main`, menos a F2.5 (PR rascunho #109). Adiantados da S3: F6.5 (na `main`) e F2.1 parte 2 (em branch) |
| **S3** · 18–24/10 | F2.1 parte 2 (`/ws/app` e presença) · F6.3 · F6.5 · F2.6 · F2.8 · F2.9 · F8.7 | ≈ 7 | |
| **S4** · 25–31/10 | F2.10 | 2 | |
| **S5** · 01–14/11 *(duas semanas)* | F2.12 · F9.1 · folga para bug e revisão | 1 + folga | |
| **S6** · 15–21/11 | bug, README fechado, ensaio | — | |

**A S2 é a semana mais apertada:** ≈ 9,5 d numa semana de 5, porque F6.2 e F6.4 vieram da S1. A ordem protege o critério do C2 (login pelo Nginx e 1 Player andando com movimento do servidor):

1. F2.2, F2.1 parte 1 e F2.3, que não esperam ninguém;
2. F6.2 e F6.4, assim que a F5.1 do Akita entrar (a parte sem banco começa antes);
3. F2.4 e F2.5, que fecham o C2.

**O que escorrega primeiro se a S2 estourar:** a F2.1 parte 2 (lobby em tempo real e presença) e a F6.5 (rate limit), as duas para a S3. Nenhuma está no critério do C2, mas o lobby ao vivo do Akita e do Caio depende da F2.1: aviso os dois na reunião de 12/10, e de novo se o atraso passar de 50 % de alguma tarefa (plano §8.1).

## 8. Divergências encontradas nos documentos

| # | Divergência | Estado |
|---|---|---|
| 1 | A arq. §10.2 descrevia o `RoomManager` antigo, com `room_id` | resolvido: a arquitetura aponta para o `rooms.md` |
| 2 | O `nginx.conf` cortava o `/api/` com a barra final do `proxy_pass` | resolvido no PR #35 (Akita, F8.1) |
| 3 | Faltava o ADR de tokens | resolvido: [002-tokens.md](../adr/002-tokens.md) |
| 4 | `matches-api.md` §3 mostrava `enemy_density` | resolvido pelo Akita |
| 5 | A arq. §7.4 não tem `lobby_removed`, nem o `lobby_update` para todo `/ws/app` | aberto: Roberto ([ws-manager.md](../contracts/ws-manager.md), "Em aberto" 3) |
| 6 | `ws-messages.md` §2.7: o `4503` só fala em desligamento do backend, mas também vai fechar a Room cujo `step` falhou | aberto: Roberto |
| 7 | `frontend/game/dev.ts` na `main` tem marcadores de conflito de merge (`<<<<<<< HEAD`) e não compila | resolvido: conferido em 16/10, sem marcadores |

## 9. O que eu explico na defesa

Por módulo que passa pela minha Slice (plano §7):

| Módulo | O que eu abro e explico |
|---|---|
| **Real-time (WebSockets)** (Major, parte minha) | o protocolo de `/ws/game` e `/ws/app`; por que o Snapshot pode ser descartado e o Event nunca; como o lobby atualiza sem polling |
| **Remote players** (Major) | Grace period e Reconnection; o teste de aceite com throttling (100 ms + 2 % de perda); por que o servidor nunca usa um `dt` vindo do cliente |
| **Multiplayer 3+** (Major, parte minha) | `ConnectionManager` com várias abas do mesmo User; a fila por conexão com descarte, e por que ela não trava a Room |
| **Standard user management** (Major, parte minha) | o fluxo de tokens (access em memória, refresh rotacionado em cookie `HttpOnly`); detecção de reuso de refresh; Argon2id e por quê |
| **Framework (FastAPI)** e **ORM** (parte minha) | `create_app()`, routers e `Depends`; o envelope de erro único; os modelos SQLAlchemy de usuário e a `Base` compartilhada |
| **Monitoring** (Major, parte minha) | por que `game_tick_seconds` é histograma e `auth_login_total` é counter; por que `/metrics` não é alcançável de fora do compose |
| **Obrigatórios** | hash de senha com salt; validação de input no back (strict no protocolo do jogo, Pydantic nas rotas); vários usuários simultâneos sem corrida (`join` atômico do `RoomManager`) |

Respostas que eu preciso ter na ponta da língua:

- **Por que o refresh é opaco e não JWT:** revogação exige tabela, e JWT sem tabela não revoga.
- **Por que o token do WebSocket vai na primeira mensagem**, e não na query string: a query vai para log e histórico, e o navegador não deixa pôr cabeçalho no handshake.
- **Por que um worker só:** o `ConnectionManager` e o `RoomManager` são dicionários em processo.
- **Como a fila de Input garante que cliente e servidor aplicam a mesma sequência**, mesmo sem eu ser o autor da Prediction.
- **Por que o Snapshot é serializado uma vez por envio:** só o `last_input_seq` muda por Player, e o laço roda a 30 Hz.
- **Por que a validação do protocolo é estrita:** `NaN` no `mouse_dx`, por exemplo, viraria posição inválida na Simulation.

A "modificação rápida" que podem pedir na minha parte (subject, cap. VII): um código de fechamento novo, um campo novo numa mensagem (`protocol.py` e `types.ts` juntos), uma métrica nova em `/metrics`, uma regra de validação nova no signup. Ensaiar na S6.
