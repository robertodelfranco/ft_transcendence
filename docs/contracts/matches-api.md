# Contrato: API REST de lobby e estatísticas (`matches-api.md`)

**Estado:** rascunho para a reunião de 04/10. **Escreve:** Akita. **Assina:** Caio (monta lobby, tela de resultado, histórico, estatísticas, conquistas e leaderboard só com este arquivo).

## 1. Para que serve

Todas as rotas HTTP que a casca web chama para criar e povoar um Lobby, e para ler o que sobrou das partidas: histórico, estatísticas, ranking, level, conquistas e leaderboard. Os objetos que atravessam (`RoomInfo`, `MatchResult`) e as tabelas de onde eles saem estão em [rooms.md](rooms.md).

O que **não** está aqui: a partida em si, que é WebSocket ([ws-messages.md](ws-messages.md)), e as atualizações em tempo real do Lobby, que são push por `/ws/app` ([ws-manager.md](ws-manager.md)).

## 2. Formas

### 2.1 Convenções

- **Prefixo.** Toda rota começa em `/api`, e **o backend enxerga o caminho inteiro** — o Nginx não reescreve ([infra.md](infra.md) §4, decisão 5). `/api/matches` no navegador é `/api/matches` no FastAPI.
- **Autenticação.** Toda rota exige `Authorization: Bearer <access>` e usa `CurrentUser` ([auth.md](auth.md)), com três exceções públicas: `GET /api/leaderboard`, `GET /api/users/{id}/stats` e `GET /api/users/{id}/matches` (perfil público é visível sem login, como em qualquer site de jogo; ver "Em aberto" 3).
- **Erro.** Sempre o envelope do [auth.md](auth.md): `{"error": {"code", "message", "request_id", "fields"}}`. A casca traduz pelo `code`; `message` nunca aparece na tela.
- **Tempo.** Todo carimbo é ISO-8601 em UTC com `Z` (`"2026-10-04T18:09:47Z"`).
- **Paginação.** `?page=` (1 em diante) e `?per_page=` (default 20, teto 50). A resposta é `{"items": [...], "page": 1, "per_page": 20, "total": 137}`.
- **Ids.** `match_id` e `user_id` são inteiros, sempre ([rooms.md](rooms.md) §2.1).

### 2.2 Lobby

| Método | Rota | Corpo | Sucesso | Erros (`code`) |
|---|---|---|---|---|
| POST | `/api/matches` | `{mode, map, max_players, options}` | 201 `RoomInfo` | 422 `invalid_options` (com `fields`), 404 `map_not_found`, 429 `rate_limited` |
| GET | `/api/matches` | — (`?mode=`) | 200 `{items: RoomInfo[]}` | — |
| GET | `/api/matches/{match_id}` | — | 200 `RoomInfo` (Room viva) ou `MatchDetail` (terminada) | 404 `match_not_found` |
| POST | `/api/matches/{match_id}/join` | — | 200 `RoomInfo` | 404 `match_not_found`, 409 `room_full` / `already_in` / `already_started` |
| POST | `/api/matches/{match_id}/leave` | — | 204 | 404 `match_not_found`, 409 `not_in_match` / `already_started` |
| POST | `/api/matches/{match_id}/ready` | `{ready: bool}` | 200 `RoomInfo` | 404 `match_not_found`, 409 `not_in_match` / `already_started` |
| POST | `/api/matches/{match_id}/start` | — | 204 | 403 `not_host`, 409 `not_enough_players` / `already_started`, 404 `match_not_found` |

- `POST /api/matches` faz duas coisas na mesma requisição: grava a linha de `matches` com `status = "lobby"` e chama `RoomManager.create`. Quem cria já entra como primeiro Player e é o host.
- `GET /api/matches` lista **só Rooms em `lobby`**, de `RoomManager.list_open()`. Nunca do banco (§4, decisão 1).
- `options` é validado contra [room-options.md](room-options.md), com os defaults aplicados: **um corpo com só `{"mode": "coop", "map": "dungeon_map"}` é válido** e produz uma partida jogável — é o "defaults sem escolher nada" que o módulo *Game customization* cobra (plano §7).
- `start` não devolve corpo: quem estava no Lobby descobre pelo `match_started` do `/ws/app` e navega para `/play/{match_id}`.

### 2.3 Histórico, estatísticas e leaderboard

| Método | Rota | Query | Sucesso |
|---|---|---|---|
| GET | `/api/users/{user_id}/matches` | `page`, `per_page`, `mode` | 200 paginado de `MatchHistoryItem` |
| GET | `/api/users/{user_id}/stats` | — | 200 `{coop: PlayerStats, pvp: PlayerStats}` |
| GET | `/api/users/{user_id}/achievements` | — | 200 `{unlocked: [...], catalog: [...]}` |
| GET | `/api/leaderboard` | `mode`, `metric`, `limit` | 200 `{items: LeaderboardRow[]}` |

Todas respondem 404 `user_not_found` para um `user_id` que não existe.

| `MatchHistoryItem` | Tipo | Conteúdo |
|---|---|---|
| `match_id` | int | |
| `mode`, `map` | string | |
| `ended_at` | ISO-8601 | a data que a tela mostra |
| `duration_s` | int | `duration_ticks / TICK_RATE`, já convertido |
| `result` | `"win" \| "loss" \| "draw"` | **do ponto de vista do `user_id` da rota**: vem de `match_players.won`, não de `matches.result` |
| `reason` | string | `code` traduzível |
| `me` | objeto | a linha de `match_players` deste User: kills, frags, deaths, dano, xp ganho, elo antes/depois |
| `others` | lista | `[{user_id, username, avatar_url, won}]` — companheiros no `coop`, oponente no `pvp` |

| `PlayerStats` | Tipo |
|---|---|
| `matches_played`, `wins`, `losses`, `draws`, `kills`, `frags`, `deaths`, `playtime_s`, `xp`, `level`, `elo` | int |
| `win_rate` | número 0–1, calculado na resposta (a tela não divide) |
| `xp_to_next_level` | int, para a barra de progresso |

| `LeaderboardRow` | Tipo |
|---|---|
| `rank` | int, 1 em diante |
| `user_id`, `username`, `avatar_url` | |
| `value` | int — o valor da `metric` pedida |

`metric` aceita `elo` (default no `pvp`), `xp` (default no `coop`), `wins` e `kills`. `limit` tem default 20 e teto 100.

### 2.4 `MatchDetail` — a tela de resultado

`GET /api/matches/{match_id}` de uma partida terminada devolve o Match do banco: os campos de `matches` (sem `options` cru, já normalizado) mais `players: [MatchPlayerRow]` com uma linha por participante, cada uma com `user_id`, `username`, `avatar_url` e todos os contadores de `match_players`. É o que a tela de fim de partida mostra para todos, e o que um link de histórico abre.

### 2.5 O que é HTTP e o que é push

| Momento | Por onde |
|---|---|
| Abrir a lista de partidas abertas | `GET /api/matches` |
| Alguém entrou, saiu, ficou pronto, ou o host mudou | `lobby_update` no `/ws/app`, com o `RoomInfo` inteiro |
| A partida começou | `match_started` no `/ws/app` → a casca navega para `/play/{match_id}` |
| Abrir perfil, histórico, leaderboard | HTTP |

**A tela de lobby nunca faz polling.** Ela busca uma vez por HTTP e depois só escuta. O `lobby_update` carrega o `RoomInfo` completo, não um delta: a tela substitui o estado inteiro e não precisa reconciliar nada (§4, decisão 3).

### 2.6 Lista fechada de `code`

O Caio traduz cada um; código fora desta lista aparece sem tradução, então a lista é fechada aqui e cresce só por PR que muda este arquivo.

`match_not_found`, `user_not_found`, `room_full`, `already_in`, `not_in_match`, `not_host`, `not_enough_players`, `already_started`, `invalid_options`, `map_not_found`, `rate_limited`.

Os `code` de `reason` que aparecem no histórico e na tela de resultado também são traduzíveis: `boss_defeated`, `all_dead`, `frag_limit`, `time_limit`, `forfeit`, `server_shutdown`.

## 3. Exemplo

Criar uma partida só com os defaults:

```http
POST /api/matches
Authorization: Bearer <access>

{"mode": "coop", "map": "dungeon_map"}
```

```json
{
  "match_id": 12, "mode": "coop", "map": "dungeon_map",
  "max_players": 5, "min_players": 1, "status": "lobby", "created_by": 7,
  "options": {"theme": "dungeon", "start_hp": 10,
              "pickups": {"potion": true, "mana": true, "armor": true}},
  "created_at": "2026-10-04T18:00:03Z",
  "players": [
    {"user_id": 7, "username": "akita", "avatar_url": "/media/avatars/7.png",
     "ready": false, "connected": true, "joined_at": "2026-10-04T18:00:03Z"}
  ]
}
```

Erro ao entrar numa Room cheia:

```json
{"error": {"code": "room_full", "message": "match 12 has 5/5 players",
           "request_id": "3f2b9c1e", "fields": null}}
```

Uma página de histórico:

```json
{"items": [
  {"match_id": 13, "mode": "pvp", "map": "arena_small",
   "ended_at": "2026-10-04T18:22:35Z", "duration_s": 155,
   "result": "win", "reason": "frag_limit",
   "me": {"kills": 0, "frags": 5, "deaths": 3, "damage_dealt": 10,
          "damage_taken": 6, "xp_gained": 120, "elo_before": 1000, "elo_after": 1016},
   "others": [{"user_id": 9, "username": "rdel-fra", "avatar_url": null, "won": false}]}
], "page": 1, "per_page": 20, "total": 37}
```

Estatísticas e leaderboard:

```json
{"coop": {"matches_played": 12, "wins": 8, "losses": 4, "draws": 0, "kills": 96,
          "frags": 0, "deaths": 5, "playtime_s": 4820, "xp": 1840, "level": 7,
          "elo": 1000, "win_rate": 0.667, "xp_to_next_level": 160},
 "pvp":  {"matches_played": 5, "wins": 3, "losses": 2, "draws": 0, "kills": 0,
          "frags": 19, "deaths": 14, "playtime_s": 760, "xp": 410, "level": 3,
          "elo": 1032, "win_rate": 0.6, "xp_to_next_level": 90}}
```

```json
{"items": [
  {"rank": 1, "user_id": 9,  "username": "rdel-fra", "avatar_url": null, "value": 1086},
  {"rank": 2, "user_id": 7,  "username": "akita",    "avatar_url": "/media/avatars/7.png", "value": 1032}
]}
```

## 4. Decisões

1. **Rooms abertas vêm da memória, nunca do banco.** O banco não sabe quem está no Lobby agora: `ready`, `connected` e a lista de Players vivem na Room ([rooms.md](rooms.md) §4, decisão 2). Consultar o banco devolveria uma lista desatualizada e obrigaria a escrever a cada entrada e saída.
2. **`ready` é rota própria, não `PATCH` do Match.** Um `PATCH /api/matches/{id}` abriria a porta para alterar `options`, que são imutáveis depois do `create`. Rota dedicada deixa a imutabilidade visível no contrato em vez de depender de validação.
3. **`lobby_update` manda o `RoomInfo` inteiro.** Delta economizaria bytes de um payload de ~400 bytes a cada clique de "pronto" e, em troca, exigiria que a tela reconciliasse estado — justamente o que dá bug quando uma mensagem é perdida. Estado inteiro é idempotente.
4. **`result` do histórico é do ponto de vista de quem pediu.** Vem de `match_players.won`: no `pvp` a mesma partida é `win` numa tela e `loss` na outra ([rooms.md](rooms.md) §4, decisão 1). A alternativa (devolver `matches.result` e a tela decidir) espalharia essa regra por três telas.
5. **`duration_s`, `win_rate` e `xp_to_next_level` vão calculados na resposta.** A tela não deve conhecer `TICK_RATE` nem a fórmula de level; é o mesmo princípio do canvas não ter texto.
6. **Rate limit em `POST /api/matches`** (proposta: 10/min por User, dependência `RateLimit` do Augusto): criar Lobby é a única rota que aloca memória no servidor por requisição.
7. **Perfil, histórico e leaderboard são `GET` por `user_id`, não por `me`.** A mesma rota serve o próprio perfil e o de terceiros, que é o que o módulo *Standard user management* pede. `/api/users/me/...` não existe aqui — a casca já sabe o próprio `user_id` pelo `/api/auth/me`.

## 5. Em aberto

| # | Questão | Quem decide | Quando |
|---|---|---|---|
| 1 | Campos que a tela de lobby, a de resultado, a de histórico e a de estatísticas realmente precisam. É a pergunta 5 do briefing do Caio, dirigida a mim: o que falta eu acrescento aqui e indexo no banco. | Caio | reunião 04/10 |
| 2 | O histórico mostra partidas `aborted`? Proposta: não por default, com `?include_aborted=true` se a tela quiser. Partida abortada não tem `match_players`, então não apareceria de qualquer forma — confirmar que ninguém precisa dela. | Caio e Akita | reunião 04/10 |
| 3 | Perfil público sem login: o subject pede perfil e status online dos amigos, não exige perfil anônimo. Se o time preferir tudo autenticado, essas três rotas ganham `CurrentUser` e some uma exceção do contrato. | Caio (PO) | reunião 04/10 |
| 4 | Conquistas: o `catalog` vem desta API ou é constante no front? Proposta: vem da API, porque o catálogo mora no código do backend (F4.6) e o front só traduz o `code`. | Caio e Akita | reunião 04/10 |
| 5 | `GET /api/matches/{id}` devolve dois formatos diferentes (`RoomInfo` ou `MatchDetail`) dependendo de a Room estar viva. Alternativa: duas rotas. Proposta: manter uma, com `status` dizendo qual formato é — a tela já ramifica por `status`. | Caio | reunião 04/10 |

---

> **Links para contratos que ainda não existem:** `auth.md` e `ws-manager.md` (Augusto), `room-options.md` (Rafael), `i18n.md` (Caio) — rascunhos esperados na reunião de 04/10. `ws-messages.md` está na branch `updated-documents`.
