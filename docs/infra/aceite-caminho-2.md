# Aceite do Caminho 2 na stack de pé (#207)

> Confere, ponta a ponta, o "Pronto quando" de cada tarefa do Caminho 2 que já está na `main`. O teste unitário de cada uma roda no CI. Aqui, a prova passa pelo Nginx com HTTPS e pelos dois WebSockets, como passa o navegador.
>
> **Executado em 04/11 (Augusto), na `main` em `9561e4b`: 53 verificações (47 critérios distintos; o `/metrics` foi conferido três vezes ao longo do teste), todas passaram.** Na revisão do resultado, em 06/11, a leitura do código achou um critério que o script não conferia: a Room é removida sem fechar os sockets com `1000` (achado 3, corrigido no mesmo PR). Há também uma divergência de texto no `ws-messages.md`, já corrigida (achado 1).

## Como foi feito

- Stack local com `docker compose up -d --build --wait` e `.env` gerado do `.env.example`. Sem OAuth: as contas são por cadastro.
- Um script Python (`httpx` + `websockets`) cria 8 contas e fala com `https://localhost` como o navegador fala: rotas `/api/...`, cookie de refresh, `wss://localhost/ws/app` e `wss://localhost/ws/game/{id}`.
- O `/metrics` é lido de um container na rede do compose (`docker run --network ft_transcendence_transcendence alpine wget …`). O `wget` da imagem do Prometheus não resolve `backend`, embora o próprio Prometheus colete o alvo normalmente (`health: up`).
- Duração: 4 min. A maior parte é espera de propósito: limite de signup (5/min), janela de graça do refresh (10 s), Grace period (30 s) e remoção da Room (60 s).

## Resultado

### F0.3 · pacote do backend

| Critério | Resultado |
|---|---|
| `GET /api/health` pelo Nginx com HTTPS | ✅ 200 `{"status":"ok"}` |
| Erro no envelope `{error: {code, message, request_id}}` | ✅ 404 `not_found` com `request_id` |

### F6.2 · signup, login e `me`

| Critério | Resultado |
|---|---|
| signup → login → `me` pelo Nginx com HTTPS (critério do C2) | ✅ |
| Mesma resposta para e-mail errado e senha errada | ✅ os dois dão 401 `invalid_credentials`, com a mesma mensagem |
| 422 com um código por campo, nunca frase | ✅ `{"username": "too_short", "password": "too_short"}` |

### F6.4 · `get_current_user`

| Critério | Resultado |
|---|---|
| Rota autenticada sem token | ✅ 401 |
| Token inválido | ✅ 401 |

### F6.3 · refresh com rotação, reuso e logout

| Critério | Resultado |
|---|---|
| Refresh troca o cookie | ✅ |
| `Origin` de outro site | ✅ 403 |
| **Reuso de refresh antigo, fora da janela de graça (10 s), revoga a família** | ✅ o antigo dá 401 `invalid_refresh`, e o novo, que era válido, também passa a dar 401 |
| Logout → 204, e o refresh daquela sessão deixa de valer | ✅ |
| Refresh sem cookie → 200 `{"authenticated": false}`, sem 401 no console | ✅ |

### F6.5 · middlewares

| Critério | Resultado |
|---|---|
| **6 logins errados em 1 min → 429** | ✅ `[401, 401, 401, 401, 401, 429]` |
| O 429 vem no envelope | ✅ `rate_limited` |
| Log de requisição em JSON com `request_id` | ✅ 295 linhas, todas com `request_id` |
| O log nunca grava a query string | ✅ nenhuma linha com `?` no `path` |

### F2.1 · `/ws/app` e presença

| Critério | Resultado |
|---|---|
| `join` → `welcome` com `online_friends` | ✅ |
| Amigo abre o site → `presence` online | ✅ |
| **Duas abas do mesmo User: fechar uma não o deixa offline** | ✅ nenhuma `presence` em 7 s |
| Fechar a última aba → offline com o atraso de 5 s | ✅ `presence` `online: false` em 5,0 s |

### F2.2 e F2.4 · protocolo e `/ws/game`

| Critério | Resultado |
|---|---|
| Sem `join` em 5 s | ✅ fecha com `4401` em 5,0 s |
| `join` malformado | ✅ `4400` |
| Token inválido | ✅ `4401` |
| User fora da Room | ✅ `4403` |
| Room inexistente | ✅ `4404` |
| `join` válido | ✅ `welcome` (`map`, `room`, `snapshot`, `user_id`) |
| `mouse_dx` `NaN` | ✅ `4400` |
| Campo a mais na mensagem | ✅ `4400` |

### F2.5 e F2.6 · N Players

Co-op com 5 Players, cada um mandando 30 Inputs/s andando para a frente por 3 s:

| Critério | Resultado |
|---|---|
| 5 Players com `welcome` na mesma Room | ✅ |
| Os 5 recebem Snapshots a ~15 Hz | ✅ 54–55 Snapshots em 3,5 s, cada um |
| **Input move o Player, com o movimento decidido pelo servidor** (critério do C2) | ✅ os 5 andaram: 0,24 a 1,32 unidades. Os menores bateram em parede ou em outro Player perto do Spawn |
| `last_input_seq` monotônico e igual ao último enviado | ✅ 83–84 enviados, 83–84 confirmados |
| Rajada de 400 mensagens num socket (limite 60/s, rajada 120) | ✅ esse socket fecha com `4400` |
| **A rajada de um não trava os outros 4** | ✅ os outros 4 continuam recebendo Snapshots |

### F2.9 e F2.10 · fim de partida e Grace period

PvP 1v1: o P2 fecha o socket e não volta.

| Critério | Resultado |
|---|---|
| **No PvP, Grace expirada conta derrota** | ✅ `game_over` com `result: "win"`, `winner_ids: [P1]` e `reason: "forfeit"`, **30,0 s** depois da queda |
| `game_over` uma vez só, mesmo com Ticks depois | ✅ 19 Snapshots depois e nenhum segundo `game_over` |
| O Match foi gravado uma vez, com o vencedor certo | ✅ `GET /api/matches/{id}/result` 200, `won` = P1 `true`, P2 `false` |
| Room removida da memória 60 s depois | ✅ `GET /api/matches/{id}` → 404 |
| Socket do P1 fechado com `1000` na remoção (`ws-messages.md` §2.7) | ❌ não conferido pelo script; pelo código, o socket ficava aberto (achado 3) |

A reconexão **dentro** dos 30 s, mantendo o lugar, foi provada pelo navegador no [teste da F2.12](teste-throttling-f2-12.md).

### F2.3 · `RoomManager` sem vazar task

| Critério | Resultado |
|---|---|
| `game_rooms_active` sobe com Rooms em partida e volta a 0 quando elas acabam | ✅ 2 durante o teste de 5 Players, 0 no fim |

### F2.12 · ping/pong

| Critério | Resultado |
|---|---|
| `ping` → `pong` com o mesmo `t` | ✅ |

O RTT na HUD sob rede ruim está no [teste da F2.12](teste-throttling-f2-12.md).

### F8.7 · `/metrics`

| Critério | Resultado |
|---|---|
| De dentro da rede, as 5 séries (`http_requests_total`, `auth_login_total`, `ws_connections`, `game_rooms_active`, `game_tick_seconds`) | ✅ |
| De fora, pelo Nginx | ✅ `/api/metrics` dá 404; `/metrics` cai na casca (o HTML do SPA), sem nenhuma série |
| Porta 8000 do backend publicada no host | ✅ fechada |

## Achados

1. **Texto do `ws-messages.md` diferente do código (dono: Roberto).** O contrato dizia que, depois do `game_over`, "os Snapshots continuam até a Room ser removida". O código (`rooms.py`, `end_tick = room.tick + DYING_TICKS`) manda Snapshots só durante a animação do Boss, cerca de 19 depois do `game_over`. A Room fica mais 60 s na memória sem Tick, para quem reconecta ver o estado final. O comportamento é o da decisão da F2.9. **Corrigido:** a frase do §2.6 agora descreve o código, com revisão do Roberto no PR.
2. **O `wget` de dentro do container do Prometheus não resolve `backend`** (`bad address 'backend:8000'`), embora o Prometheus colete o alvo. Isso só afeta quem conferir o `/metrics` por esse caminho, como o roteiro do [teste com 2 PCs](teste-2-pcs.md) sugere para os alvos. Para a defesa, use `docker run --rm --network ft_transcendence_transcendence alpine wget -qO- http://backend:8000/metrics`.

3. **A remoção da Room não fechava os sockets do jogo (bug, F2.9).** O `ws-messages.md` §2.7 promete `1000` quando a Room é removida, 60 s depois do `game_over`. O `_run` do `RoomManager` só apagava a Room do dicionário, e o laço de leitura do `/ws/game` só termina quando o cliente sai. Uma aba parada na tela de fim mantinha o socket aberto sem prazo: o `ws_connections{channel="game"}` não voltava a 0, e o `enqueue` aceitava Input numa Room que não existia mais. O script deste teste não pegou porque conferiu a remoção só pelo `GET /api/matches/{id}`. **Corrigido:** a remoção chama `close_match(match_id, 1000)`, como o `_abort` já fazia com `4503`, e um teste em `tests/game/test_rooms.py` confere o fechamento.

## O que este teste não cobre

- **Interpolation (F2.8):** é visual. Ver as pendências do [teste da F2.12](teste-throttling-f2-12.md).
- **OAuth (F6.8):** é do Akita, e o `.env` local não tem as chaves.
- **Desligamento do backend com Room em partida (`4503` e `aborted`):** coberto pelos testes do CI. Aqui exigiria derrubar o backend no meio do teste.
