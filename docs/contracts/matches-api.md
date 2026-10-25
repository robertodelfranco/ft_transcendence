# Contrato: API REST de lobby e estatísticas (`matches-api.md`)

**Estado:** S4, 25/10: lobby na `main` (F5.2); resultado, histórico, estatísticas e conquistas fechados para a F7.8, com a assinatura do Caio pendente (PR do #155). **Escreve:** Akita. **Assina:** Caio (monta lobby, tela de resultado, histórico, estatísticas, conquistas e leaderboard só com este arquivo).

## 1. Para que serve

Todas as rotas HTTP que a casca web chama para criar e povoar um Lobby, e para ler o que sobrou das partidas: histórico, estatísticas, ranking, level, conquistas e leaderboard. Os objetos que atravessam (`RoomInfo`, `MatchResult`) e as tabelas de onde eles saem estão em [rooms.md](rooms.md).

O que **não** está aqui: a partida em si, que é WebSocket ([ws-messages.md](ws-messages.md)), e as atualizações em tempo real do Lobby, que são push por `/ws/app` ([ws-manager.md](ws-manager.md)).

## 2. Formas

### 2.1 Convenções

- **Prefixo.** Toda rota começa em `/api`, e **o backend enxerga o caminho inteiro** — o Nginx não reescreve ([infra.md](infra.md) §4, decisão 5). `/api/matches` no navegador é `/api/matches` no FastAPI.
- **Autenticação.** Toda rota exige `Authorization: Bearer <access>` e usa `CurrentUser` ([auth.md](auth.md)), sem exceção: perfil, estatística e leaderboard também ([i18n.md](i18n.md) §4, decisão 6).
- **Erro.** Sempre o envelope do [auth.md](auth.md): `{"error": {"code", "message", "request_id", "fields"}}`. A casca traduz pelo `code`; `message` nunca aparece na tela.
- **Tempo.** Todo carimbo é ISO-8601 em UTC com `Z` (`"2026-10-04T18:09:47Z"`).
- **Paginação.** `?page=` (1 em diante) e `?per_page=` (default 20, teto 50). A resposta é `{"items": [...], "page": 1, "per_page": 20, "total": 137}`.
- **Ids.** `match_id` e `user_id` são inteiros, sempre ([rooms.md](rooms.md) §2.1).

### 2.2 Lobby

| Método | Rota | Corpo | Sucesso | Erros (`code`) |
|---|---|---|---|---|
| POST | `/api/matches` | `{mode, map, max_players, options}` | 201 `RoomInfo` | 422 `invalid_options` (com `fields`), 404 `map_not_found`, 409 `already_in_other_match`, 429 `rate_limited` |
| GET | `/api/matches` | — (`?mode=`) | 200 `{items: RoomInfo[]}` | — |
| GET | `/api/matches/{match_id}` | — | 200 `RoomInfo` da Room viva | 404 `match_not_found` (sem Room na memória) |
| GET | `/api/matches/{match_id}/result` | — | 200 `MatchDetail` (§2.4) | 404 `match_not_found`, 409 `match_not_finished` (`lobby` ou `running`), 409 `match_aborted` |
| GET | `/api/maps` | — | 200 `{coop: MapInfo[], pvp: MapInfo[]}` | — |
| POST | `/api/matches/{match_id}/join` | — | 200 `RoomInfo` | 404 `match_not_found`, 409 `room_full` / `already_in` / `already_in_other_match` / `already_started` |
| POST | `/api/matches/{match_id}/leave` | — | 204 | 404 `match_not_found`, 409 `not_in_match` / `already_started` |
| POST | `/api/matches/{match_id}/ready` | `{ready: bool}` | 200 `RoomInfo` | 404 `match_not_found`, 409 `not_in_match` / `already_started` |
| POST | `/api/matches/{match_id}/start` | — | 204 | 403 `not_host`, 409 `not_enough_players` / `already_started`, 404 `match_not_found` |

- `POST /api/matches` faz duas coisas na mesma requisição: grava a linha de `matches` com `status = "lobby"` e chama `RoomManager.create`. Quem cria já entra como primeiro Player e é o host.
- `GET /api/matches` lista **só Rooms em `lobby`**, de `RoomManager.list_open()`. Nunca do banco (§4, decisão 1).
- **`GET /api/matches/{id}` lê só a memória, e `GET /api/matches/{id}/result` só o banco** (§4, decisão 8). A sala de espera usa a primeira; a tela de resultado e o link do histórico usam a segunda. Depois do `game_over`, a Room ainda responde a primeira por 60 s, mas a tela de resultado não depende disso.
- `options` é validado contra [room-options.md](room-options.md), com os defaults aplicados: **um corpo com só `{"mode": "coop", "map": "dungeon_map"}` é válido** e produz uma partida jogável — é o "defaults sem escolher nada" que o módulo *Game customization* cobra (plano §7).
- **Normalização** (decidida em 10/10, [room-options.md](room-options.md) §5.3): um modelo Pydantic por Mode, com `extra="forbid"` e `strict=True`. Campo desconhecido, ou `frag_limit`/`time_limit_s` no `coop`, dá 422 `invalid_options` com `fields: {campo: "invalid_value"}`; `null`, tipo errado e string no lugar de número ou booleano também (sem coerção). `pickups` parcial recebe o default por chave. Os limites são inteiros e inclusivos. O `options` normalizado do `coop` não tem as chaves de `pvp`. Os **defaults** vêm da dataclass `RoomOptions` da Simulation (`app.game`), que é a fonte única; os modelos Pydantic da API leem os defaults dela e só acrescentam os limites, e a rota converte o resultado para a dataclass. Um teste confere que os dois concordam (roadmap do Roberto, item 20; decidido com o Rafael em 12/10).
- **`GET /api/maps`** devolve os Maps de cada Mode para o formulário de criação ([i18n.md](i18n.md) §5.5). `MapInfo` é `{name, max_players}`: `name` é o nome do arquivo sem extensão, e `max_players` é o menor entre os Spawns do Map e o teto do Mode (5 no `coop`, 2 no `pvp`). Ordem alfabética; o primeiro de cada lista é o default de `map`. A lista é lida das pastas `backend/maps/{coop,pvp}/` com `load_map` uma vez no startup (um Map quebrado já reprova o PR pelo teste dos mapas). O `POST /api/matches` confere `map` e `max_players` contra essa mesma lista: Map fora dela → 404 `map_not_found`; `max_players` acima → 422 `invalid_options`.
- `start` não devolve corpo: quem estava no Lobby descobre pelo `match_started` do `/ws/app` e navega para `/play/{match_id}`.

### 2.3 Histórico, estatísticas e leaderboard

| Método | Rota | Query | Sucesso |
|---|---|---|---|
| GET | `/api/users/{user_id}/matches` | `page`, `per_page`, `mode` | 200 paginado de `MatchHistoryItem` |
| GET | `/api/users/{user_id}/stats` | — | 200 `{coop: PlayerStats, pvp: PlayerStats}` |
| GET | `/api/users/{user_id}/achievements` | — | 200 `{unlocked: [...], catalog: [...]}` |
| GET | `/api/leaderboard` | `mode`, `metric`, `limit` | 200 `{items: LeaderboardRow[]}` |

Todas respondem 404 `user_not_found` para um `user_id` que não existe.

O histórico lista só Matches `finished`, do mais recente para o mais antigo. Match `aborted` não tem linhas em `match_players`, então não aparece, e não há filtro para incluí-lo.

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

`metric` aceita `elo` (default no `pvp`), `xp` (default no `coop`), `wins` e `kills`. `limit` tem default 20 e teto 100. Ordem e filtro seguem o [progression.md](progression.md) §7: valor decrescente e `user_id` crescente no empate, `rank` sequencial a partir de 1, e só Users com pelo menos um Match terminado naquele Mode.

| `achievements` | Tipo | Conteúdo |
|---|---|---|
| `unlocked` | lista | `[{code, unlocked_at, match_id}]` do User da rota, do mais recente para o mais antigo. `match_id` é o Match do primeiro desbloqueio, para a tela de resultado filtrar o que saiu nela; fica `null` se esse Match não existir mais |
| `catalog` | lista | `[{code, mode}]`, todos os Achievements que existem, na ordem do [progression.md](progression.md) §3. `mode` é `"coop"`, `"pvp"` ou `null` (vale nos dois). Vem do código do backend; o front só traduz nome e descrição pelo `code` |

XP, level e Elo seguem as fórmulas do [progression.md](progression.md) §5–7, calculadas no `record_match_result`. A API devolve `level` e `xp_to_next_level` prontos (§4, decisão 5).

### 2.4 `MatchDetail` — a tela de resultado

`GET /api/matches/{match_id}/result` devolve o Match do banco assim que `matches.status = "finished"`, mesmo com a Room ainda na memória. É o que a tela de fim de partida mostra para todos, e o que um link de histórico abre.

| Campo | Tipo | Conteúdo |
|---|---|---|
| `match_id`, `created_by` | int | |
| `mode`, `map`, `status` | string | `status` é sempre `"finished"` aqui |
| `options` | objeto | as RoomOptions já normalizadas, como gravadas no `create` |
| `started_at`, `ended_at` | ISO-8601 | |
| `duration_s` | int | `duration_ticks / TICK_RATE`, já convertido |
| `result`, `reason` | string | o desfecho **da Room** (`matches.result`). Quem ganhou é `players[].won` (§4, decisão 4): no `pvp`, a tela do perdedor mostra `won: false` mesmo com `result: "win"` |
| `players` | lista | uma `MatchPlayerRow` por participante, em ordem de `user_id` |

`MatchPlayerRow`: `user_id`, `username`, `avatar_url`, `won`, `survived`, `disconnected_at_end`, `kills`, `frags`, `deaths`, `damage_dealt`, `damage_taken`, `armor_absorbed`, `keys_collected`, `potions_used`, `xp_gained`, `elo_before` e `elo_after` (os dois `null` no `coop`).

**O resultado pode não estar gravado quando a tela abre.** O `game_over` sai para o cliente no Tick em que a partida acaba, e só depois disso o `record_match_result` grava ([rooms.md](rooms.md) §2.5). Por isso:
- 409 `match_not_finished`: a gravação ainda não terminou. A tela tenta de novo uma vez, depois de ~1 s. Se a gravação falhou, o Match fica `running` até o próximo startup do backend, que o aborta; a segunda tentativa também recebe 409 e a tela mostra o erro traduzido.
- 409 `match_aborted`: não há resultado para mostrar. A tela não tenta de novo.

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

`match_not_found`, `user_not_found`, `room_full`, `already_in`, `already_in_other_match`, `not_in_match`, `not_host`, `not_enough_players`, `already_started`, `invalid_options`, `map_not_found`, `rate_limited`, `match_not_finished`, `match_aborted`.

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
          "damage_taken": 6, "xp_gained": 130, "elo_before": 1000, "elo_after": 1016},
   "others": [{"user_id": 9, "username": "rdel_fra", "avatar_url": "/media/avatars/default.png", "won": false}]}
], "page": 1, "per_page": 20, "total": 37}
```

Estatísticas e leaderboard:

```json
{"coop": {"matches_played": 12, "wins": 8, "losses": 4, "draws": 0, "kills": 96,
          "frags": 0, "deaths": 5, "playtime_s": 4820, "xp": 1840, "level": 5,
          "elo": 1000, "win_rate": 0.667, "xp_to_next_level": 660},
 "pvp":  {"matches_played": 5, "wins": 3, "losses": 2, "draws": 0, "kills": 0,
          "frags": 19, "deaths": 14, "playtime_s": 760, "xp": 410, "level": 3,
          "elo": 1032, "win_rate": 0.6, "xp_to_next_level": 490}}
```

Pela fórmula do [progression.md](progression.md) §6: 1840 XP dá `1 + floor(sqrt(18,4)) = 5`, e o level 6 começa em `100 × 5² = 2500`, faltando 660. 410 XP dá level 3, e o 4 começa em 900, faltando 490. O histórico acima segue a §5: vitória PvP com 5 Frags rende `20 + 10 × 5 + 60 = 130` XP.

Resultado de uma partida `coop` (`GET /api/matches/14/result`):

```json
{"match_id": 14, "mode": "coop", "map": "dungeon_map", "status": "finished", "created_by": 7,
 "options": {"theme": "dungeon", "start_hp": 10,
             "pickups": {"potion": true, "mana": true, "armor": true}},
 "started_at": "2026-10-04T18:30:00Z", "ended_at": "2026-10-04T18:35:00Z",
 "duration_s": 300, "result": "win", "reason": "boss_defeated",
 "players": [
   {"user_id": 7, "username": "akita", "avatar_url": "/media/avatars/7.png",
    "won": true, "survived": true, "disconnected_at_end": false,
    "kills": 5, "frags": 0, "deaths": 0, "damage_dealt": 14, "damage_taken": 6,
    "armor_absorbed": 2, "keys_collected": 1, "potions_used": 1,
    "xp_gained": 145, "elo_before": null, "elo_after": null},
   {"user_id": 9, "username": "rdel_fra", "avatar_url": "/media/avatars/default.png",
    "won": true, "survived": true, "disconnected_at_end": false,
    "kills": 2, "frags": 0, "deaths": 1, "damage_dealt": 8, "damage_taken": 12,
    "armor_absorbed": 0, "keys_collected": 0, "potions_used": 2,
    "xp_gained": 130, "elo_before": null, "elo_after": null}
 ]}
```

Antes de a gravação terminar:

```json
{"error": {"code": "match_not_finished", "message": "match 14 is running",
           "request_id": "9a1c22d0", "fields": null}}
```

Conquistas do User 7 depois dessa partida (`GET /api/users/7/achievements`):

```json
{"unlocked": [
   {"code": "coop_first_win",     "unlocked_at": "2026-10-04T18:35:00Z", "match_id": 14},
   {"code": "coop_exterminator",  "unlocked_at": "2026-10-04T18:35:00Z", "match_id": 14},
   {"code": "coop_no_deaths_win", "unlocked_at": "2026-10-04T18:35:00Z", "match_id": 14},
   {"code": "first_five_seconds", "unlocked_at": "2026-10-04T18:35:00Z", "match_id": 14}
 ],
 "catalog": [
   {"code": "coop_first_win", "mode": "coop"},
   {"code": "coop_exterminator", "mode": "coop"},
   {"code": "coop_no_deaths_win", "mode": "coop"},
   {"code": "pvp_first_win", "mode": "pvp"},
   {"code": "pvp_five_frags", "mode": "pvp"},
   {"code": "first_five_seconds", "mode": null},
   {"code": "pvp_time_limit_win", "mode": "pvp"}
 ]}
```

```json
{"items": [
  {"rank": 1, "user_id": 9,  "username": "rdel_fra", "avatar_url": "/media/avatars/default.png", "value": 1086},
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
8. **Resultado em rota própria, `/result`, lido só do banco** (proposta de 25/10; assinatura do Caio no PR do #155). A alternativa era uma rota só, devolvendo `RoomInfo` ou `MatchDetail` conforme o estado. Com duas, cada rota tem um formato só: o FastAPI valida a resposta e o tipo da tela é fixo. A separação entre memória (Room) e banco (Match) fica na URL, como na decisão 1. A rota da sala de espera não muda. E o "ainda não gravado" vira um 409 que a tela trata, em vez de um `RoomInfo` inesperado. O custo é uma rota e dois `code` a mais.

## 5. Em aberto

| # | Questão | Quem decide | Quando |
|---|---|---|---|
| 1 | Campos que a tela de lobby, a de resultado, a de histórico e a de estatísticas realmente precisam (pergunta 5 do briefing do Caio). **Lobby e sala de espera (20/10, Caio):** o `RoomInfo` atual basta. **Resultado, histórico e estatísticas (25/10):** o que o [caminho-4-caio.md](../slices/caminho-4-caio.md) §7 pediu entrou: `MatchDetail` assim que o Match termina, na rota `/result` (§2.4); `xp_gained`, `elo_before` e `elo_after` por Player; `match_id` nas conquistas (§2.3). Os exemplos da §3 seguem as fórmulas do [progression.md](progression.md). | Caio | assinatura no PR do #155 |
| 2 | Proposto em 25/10: o histórico não mostra `aborted`. Partida abortada não tem `match_players`, e nenhuma tela precisa dela; sem `include_aborted` (§2.3). | Caio e Akita | assinatura no PR do #155 |
| 3 | Resolvido em 12/10: tudo autenticado ([i18n.md](i18n.md) §4, decisão 6). | Caio (PO) | feito |
| 4 | Proposto em 25/10: o `catalog` vem da API, em `GET /api/users/{id}/achievements` (§2.3). O catálogo mora no código do backend (F5.7), e o front só traduz o `code`. | Caio e Akita | assinatura no PR do #155 |
| 5 | Proposto em 25/10: duas rotas. `GET /api/matches/{id}` fica só com a Room viva, e `GET /api/matches/{id}/result` devolve o `MatchDetail` do banco (§4, decisão 8). | Caio | assinatura no PR do #155 |

