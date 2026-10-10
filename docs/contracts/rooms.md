# Contrato: Rooms, MatchResult e schema de partidas (`rooms.md`)

**Estado:** rascunho para a reunião de 04/10. **Escreve:** Akita. **Assina:** Augusto (implementa o `RoomManager` em F2.3 e chama `record_match_result` em F2.9) e Roberto (a Simulation precisa conseguir contar cada número do `MatchResult`).

## 1. Para que serve

A plataforma de partidas (lobby, histórico, estatísticas) e a Room em memória se encontram em duas interfaces: o **`RoomManager`**, que o lobby chama para criar, povoar e iniciar uma Room, e o **`MatchResult`**, que a Room entrega uma única vez quando acaba. Este arquivo define as duas, mais o **schema de partidas** no banco e os estados pelos quais um Match passa.

Fora dessas duas interfaces, nada de partida em andamento atravessa: estado de Room vive só em memória (invariante 2 da arq. §2), e o banco recebe apenas o Match, ao final.

## 2. Formas

### 2.1 Identificadores

Um Match é identificado pelo `match_id` (inteiro, a PK de `matches`), em todo lugar: rota HTTP, `/ws/game/{match_id}`, `/play/:matchId` e o `RoomManager`. Um Player é identificado pelo `user_id` (inteiro). Não existe `room_id` ([README](README.md#o-que-já-está-decidido)).

A Room é criada junto com a linha de `matches`, então **o `match_id` existe antes da Room** e é a chave das duas. Um Match sem Room é um Match terminado (ou abortado); uma Room sem Match não existe.

### 2.2 `RoomManager` — o que o lobby chama

```python
# app/game/rooms.py — implementado por Augusto (F2.3), chamado pelo lobby (F5.2)
class RoomManager:
    def create(self, match_id: int, mode: Mode, max_players: int,
               options: RoomOptions, created_by: int) -> None: ...
    def join(self, match_id: int, user_id: int, username: str,
             avatar_url: str) -> RoomInfo: ...
    def leave(self, match_id: int, user_id: int) -> RoomInfo | None: ...   # None = Room destruída
    def set_ready(self, match_id: int, user_id: int, ready: bool) -> RoomInfo: ...
    def start(self, match_id: int) -> None: ...
    def info(self, match_id: int) -> RoomInfo: ...
    def list_open(self) -> list[RoomInfo]: ...                            # status == "lobby"
    def room_of(self, user_id: int) -> int | None: ...                    # match_id da Room do User
```

| Exceção | Quando | `code` na API |
|---|---|---|
| `RoomNotFound` | não existe Room com esse `match_id` | `match_not_found` |
| `RoomFull` | `len(players) == max_players` | `room_full` |
| `AlreadyIn` | o User já está nesta Room | `already_in` |
| `AlreadyInOtherMatch` | `join` de quem já está em **outra** Room, em `lobby` ou em andamento (§4, decisão 9) | `already_in_other_match` |
| `NotInRoom` | `leave`, `set_ready` ou `start` de quem não está na Room | `not_in_match` |
| `AlreadyStarted` | `join`, `leave`, `set_ready` **ou `start`** com `status != "lobby"` | `already_started` |
| `NotEnoughPlayers` | `start` abaixo do mínimo do Mode | `not_enough_players` |

Garantias que o lobby assume:

- **`join` é atômico.** Roda num único event loop, sem `await` entre conferir a vaga e inserir o Player. É aí que a corrida "dois usuários na última vaga" se resolve (arq. §10.1), não na rota HTTP.
- **`create` não inicia nada e não põe ninguém na Room.** A Room nasce vazia, em `status = "lobby"`, sem `asyncio.Task`; a task do tick nasce no `start`. O `POST /api/matches` chama `create` e logo depois `join` do criador, que é quem devolve o `RoomInfo` da resposta ([matches-api.md](matches-api.md) §2.2).
- **`avatar_url` chega pronto.** O lobby passa a URL já serializada ([auth.md](auth.md) §4, decisão 18: sem avatar enviado, a URL do padrão); a Room só a repete no `RoomInfo`.
- **`start` só funciona uma vez.** Segunda chamada levanta `AlreadyStarted`, que é o 409 `already_started` de [matches-api.md](matches-api.md) §2.2. Sem isso, um duplo clique ou um retry de rede criaria duas tasks de tick para a mesma Room — dois ticks por tick, movimento e dano aplicados em dobro.
- **`leave` do último Player destrói a Room** e devolve `None`. Quem chamou grava `matches.status = "aborted"`.
- **`list_open` é a única fonte de Rooms abertas.** A API nunca lista Lobby a partir do banco (arq. §10.1).
- **`options` são imutáveis** depois do `create` ([README](README.md#o-que-já-está-decidido)).
- **Um User, uma Room.** O `RoomManager` guarda o índice `user_id → match_id`, preenchido no `join` e limpo no `leave` e quando a Room termina; `room_of` o expõe. O `POST /api/matches` confere `room_of` **antes** de gravar a linha de `matches`, para não deixar Match órfão.

### 2.3 `RoomInfo` — o que a tela de lobby recebe

É o corpo das respostas de `matches-api.md` e o conteúdo de `lobby_update` em `/ws/app`.

| Campo | Tipo | Conteúdo |
|---|---|---|
| `match_id` | int | PK de `matches` |
| `mode` | `"coop" \| "pvp"` | |
| `map` | string | nome do arquivo de Map, `[a-z0-9_]+` ([map-format.md](map-format.md)) |
| `max_players` | int | 1–5 no `coop`, 2 no `pvp` |
| `min_players` | int | mínimo para o `start` (ver "Em aberto" 3) |
| `status` | `"lobby" \| "running" \| "finished" \| "aborted"` | o mesmo de `matches.status` |
| `created_by` | int | `user_id` do host atual |
| `options` | objeto | `RoomOptions` completas, com os defaults já aplicados ([room-options.md](room-options.md)) |
| `created_at` | string ISO-8601 | |
| `players` | lista | ver abaixo |

| Campo de `players[]` | Tipo | Conteúdo |
|---|---|---|
| `user_id` | int | |
| `username` | string | |
| `avatar_url` | string | sempre uma URL; sem avatar enviado, a do padrão ([auth.md](auth.md) §4, decisão 18) |
| `ready` | bool | **vive na Room, nunca no banco** (§4, decisão 2) |
| `connected` | bool | `false` durante o Grace period |
| `joined_at` | string ISO-8601 | a ordem de entrada é a ordem de sucessão do host |

### 2.4 `MatchResult` — o que a Room entrega ao terminar

```python
# app/matches/service.py
@dataclass(frozen=True)
class MatchResult:
    match_id: int
    mode: Literal["coop", "pvp"]
    result: Literal["win", "loss", "draw"]
    reason: Literal["boss_defeated", "all_dead", "frag_limit",
                    "time_limit", "forfeit"]
    started_at: datetime          # timezone-aware, UTC
    ended_at: datetime
    duration_ticks: int
    players: list[MatchPlayerResult]

@dataclass(frozen=True)
class MatchPlayerResult:
    user_id: int
    won: bool
    survived: bool
    kills: int                    # Enemies + Boss mortos por este Player
    frags: int                    # Players eliminados por este Player (só pvp)
    deaths: int
    damage_dealt: int
    damage_taken: int             # HP perdido; o que a Armor segurou não conta aqui
    armor_absorbed: int
    keys_collected: int
    potions_used: int
    disconnected_at_end: bool
```

Quem produz cada número (é o que o Roberto confere ao assinar):

| Campo | Fonte |
|---|---|
`kills`, `frags`, `deaths`, `damage_dealt`, `damage_taken`, `armor_absorbed`, `keys_collected`, `potions_used` | contadores no `Player` da Room, incrementados pela Simulation nos mesmos pontos em que ela emite `enemy_died`, `boss_died`, `player_died`, `player_hit` e `item_picked` ([ws-messages.md](ws-messages.md) §2.6)
`won`, `survived` | o Ruleset, no `check_end`
`result`, `reason` | o mesmo `game_over` que vai ao cliente
`duration_ticks` | `room.tick`
`disconnected_at_end` | `player.connected` no instante do `game_over`
`started_at`, `ended_at` | `RoomManager`, com `datetime.now(timezone.utc)`

Regras da Simulation que fecham estes números (respostas do Roberto ao assinar, em 06/10):

- **`damage_dealt`** é o HP tirado do Boss no `coop` e de Players no `pvp`. Um Enemy morre com uma fireball e não tem HP ([rules.md](rules.md) §4): conta em `kills`, não em dano. Um contador só basta, porque os dois alvos nunca existem no mesmo Mode.
- **`survived`** é "vivo no Tick do `game_over`", nos dois Modes.
- **Quem saiu no meio continua na lista.** O Player cujo Grace period expirou sai do Snapshot, mas a Simulation guarda os contadores dele, e ele entra em `players` com `disconnected_at_end = true`.
- **`coop` em que todos saem** termina com `result = "loss"` e `reason = "forfeit"`.
- **Desligamento do backend não produz `MatchResult`.** Por isso `server_shutdown` não está no `reason` acima: quem grava esse valor é o `startup`, direto em `matches` (§2.6).

**Não estão aqui** `elo_before`, `elo_after` e `xp_gained`: a Simulation não conhece Elo nem XP. Eles são calculados dentro de `record_match_result` (F5.5) e gravados em `match_players`.

Regra de preenchimento de `won`:

- **`coop`:** todos os Players recebem o mesmo `won` (é vitória de grupo). `survived` distingue quem chegou vivo.
- **`pvp`:** `won = true` só para o vencedor; no empate (`time_limit` com placar igual), `won = false` para os dois e `result = "draw"`.

### 2.5 `record_match_result`

```python
@dataclass(frozen=True)
class AchievementUnlock:
    user_id: int
    code: str

async def record_match_result(match_id: int,
                              result: MatchResult) -> list[AchievementUnlock]: ...
```

Chamada uma única vez pela Room, no `game_over` (F2.9). **Idempotente**: chamar duas vezes grava uma vez.

Tudo numa transação, nesta ordem:

1. `SELECT ... FROM matches WHERE id = :match_id AND status = 'running' FOR UPDATE`. Sem linha, **devolve `[]`** e não faz mais nada — é a chave de idempotência (§4). A segunda chamada não reanuncia conquista nenhuma.
2. `INSERT` em `match_players`, um por Player.
3. `UPDATE`/`INSERT` em `player_stats` por `(user_id, mode)`: contadores, `playtime_s`, `xp`, `level` e, no `pvp`, `elo`.
4. `INSERT` em `user_achievements` com `ON CONFLICT (user_id, code) DO NOTHING`; as desbloqueadas voltam para quem chamou, que emite `achievement_unlocked`.
5. `UPDATE matches SET status = 'finished', result, reason, ended_at, duration_ticks`.

A função devolve **as conquistas desbloqueadas nesta chamada** (lista vazia se nenhuma, ou se a chamada foi a repetida). É `async` e usa a sessão do SQLAlchemy; **não toca em WebSocket**. Quem emite `achievement_unlocked {user_id, code}` é a Room, com o que a função devolveu — é o que mantém a função testável sem rede (ver "Em aberto" 4; se o time preferir a função chamando o `ConnectionManager`, o retorno vira `None` e esta seção muda junto).

### 2.6 Estados de um Match

| De | Para | Gatilho | Quem |
|---|---|---|---|
| — | `lobby` | `POST /api/matches` grava a linha e chama `RoomManager.create` | F5.2 |
| `lobby` | `running` | `POST /api/matches/{id}/start` → `RoomManager.start`; grava `started_at` | F5.2 |
| `lobby` | `aborted` | último Player saiu (inclusive por ficar offline, §4 decisão 10) | F5.2 |
| `running` | `finished` | `game_over` → `record_match_result` | F2.9 → F5.3 |
| `running` | `aborted` | backend reiniciou: o `startup` marca todo `running` como `aborted`, `reason = "server_shutdown"` | F5.3 |

`finished` e `aborted` são finais. A Room é removida 60 s depois do `game_over` (arq. §10.1); de `aborted` por reinício não sobra Room nenhuma.

### 2.7 Tabelas

Tipos de PostgreSQL. Todo carimbo de tempo é `TIMESTAMPTZ` com `datetime.now(timezone.utc)` do lado do Python (arq. §9.1). `mode`, `status`, `result` e `reason` são `TEXT` com `CHECK`, não `ENUM` nativo: alterar um `CHECK` é uma migração trivial, alterar um `ENUM` do Postgres não é.

**`matches`** — dona: F5 (Akita)

| Coluna | Tipo | Nulo | Observação |
|---|---|---|---|
| `id` | `BIGSERIAL` | não | PK; é o `match_id` |
| `mode` | `TEXT` | não | `CHECK IN ('coop','pvp')` |
| `map` | `TEXT` | não | nome do arquivo, sem extensão e sem pasta |
| `max_players` | `SMALLINT` | não | |
| `options` | `JSONB` | não | `RoomOptions` com os defaults aplicados, como foram validadas |
| `status` | `TEXT` | não | `DEFAULT 'lobby'`, `CHECK IN ('lobby','running','finished','aborted')` |
| `created_by` | `BIGINT` | não | FK → `users(id)` `ON DELETE RESTRICT` |
| `created_at` | `TIMESTAMPTZ` | não | `DEFAULT now()` |
| `started_at` | `TIMESTAMPTZ` | sim | |
| `ended_at` | `TIMESTAMPTZ` | sim | |
| `duration_ticks` | `INTEGER` | sim | |
| `result` | `TEXT` | sim | `CHECK IN ('win','loss','draw')`; nulo enquanto não terminou |
| `reason` | `TEXT` | sim | `CHECK` na lista de `MatchResult.reason` mais `'server_shutdown'`, que só o `startup` grava |

Índice: `ix_matches_status_created (status, created_at DESC)` — serve a listagem de Matches terminados; Lobby vem da memória.

**`match_players`** — dona: F5 (Akita)

| Coluna | Tipo | Nulo | Observação |
|---|---|---|---|
| `match_id` | `BIGINT` | não | FK → `matches(id)` `ON DELETE CASCADE`; parte da PK |
| `user_id` | `BIGINT` | não | FK → `users(id)` `ON DELETE RESTRICT`; parte da PK |
| `won`, `survived`, `disconnected_at_end` | `BOOLEAN` | não | |
| `kills`, `frags`, `deaths`, `damage_dealt`, `damage_taken`, `armor_absorbed`, `keys_collected`, `potions_used`, `xp_gained` | `INTEGER` | não | `DEFAULT 0` |
| `elo_before`, `elo_after` | `INTEGER` | sim | só no `pvp` |

PK `(match_id, user_id)` — é ela que torna o `INSERT` de `record_match_result` idempotente.
Índice: `ix_match_players_user (user_id, match_id DESC)` — é o histórico paginado (`match_id` cresce com o tempo, então ordena por data sem tocar em `matches`).

**`player_stats`** — dona: F5 (Akita). Tabela **agregada**, atualizada em `record_match_result`.

| Coluna | Tipo | Nulo | Observação |
|---|---|---|---|
| `user_id` | `BIGINT` | não | FK → `users(id)` `ON DELETE CASCADE`; parte da PK |
| `mode` | `TEXT` | não | `CHECK IN ('coop','pvp')`; parte da PK |
| `matches_played`, `wins`, `losses`, `draws`, `kills`, `frags`, `deaths`, `playtime_s`, `xp` | `INTEGER` | não | `DEFAULT 0` |
| `elo` | `INTEGER` | não | `DEFAULT 1000`; só muda no `pvp` |
| `level` | `INTEGER` | não | `DEFAULT 1`; derivado de `xp` pela fórmula de F4.6 |
| `updated_at` | `TIMESTAMPTZ` | não | `DEFAULT now()` |

PK `(user_id, mode)`. Índices de leaderboard: `ix_player_stats_elo (mode, elo DESC)` e `ix_player_stats_xp (mode, xp DESC)`.

**`user_achievements`** — dona: F5 (Akita). O catálogo de conquistas vive no código (F4.6); a tabela só guarda desbloqueio.

| Coluna | Tipo | Nulo | Observação |
|---|---|---|---|
| `user_id` | `BIGINT` | não | FK → `users(id)` `ON DELETE CASCADE`; parte da PK |
| `code` | `TEXT` | não | código do catálogo; parte da PK |
| `unlocked_at` | `TIMESTAMPTZ` | não | `DEFAULT now()` |
| `match_id` | `BIGINT` | sim | FK → `matches(id)` `ON DELETE SET NULL`; em qual partida saiu |

PK `(user_id, code)` — desbloquear de novo é `DO NOTHING`, sem precisar de checagem antes.

### 2.8 Schema inteiro

As tabelas de usuários são do Augusto ([auth.md](auth.md) §2.9, conferido em 10/10); estão aqui porque é deste diagrama que sai a seção obrigatória "Database Schema" do README (subject, cap. VI).

```mermaid
erDiagram
    users ||--o{ refresh_tokens : "sessões"
    users ||--o{ oauth_accounts : "contas OAuth"
    users ||--o{ friendships : "adicionou (user_id)"
    users ||--o{ friendships : "foi adicionado (friend_id)"
    users ||--o{ matches : "criou"
    users ||--o{ match_players : "jogou"
    users ||--o{ player_stats : "agregado por mode"
    users ||--o{ user_achievements : "desbloqueou"
    matches ||--|{ match_players : "participantes"
    matches ||--o{ user_achievements : "saiu nesta partida"

    users {
        bigint id PK
        text email UK
        text username UK
        text password_hash "nulo se só OAuth"
        text avatar_url
        text preferred_language
        timestamptz created_at
        timestamptz last_seen_at
    }
    refresh_tokens {
        bigint id PK
        bigint user_id FK
        text token_hash UK
        uuid family_id
        timestamptz created_at
        timestamptz expires_at
        timestamptz rotated_at "base da janela de graça"
        bigint replaced_by FK
        timestamptz revoked_at
        text user_agent
    }
    oauth_accounts {
        bigint id PK
        bigint user_id FK
        text provider "google ou 42"
        text provider_user_id
        timestamptz created_at
    }
    friendships {
        bigint user_id FK
        bigint friend_id FK
        timestamptz created_at
    }
    matches {
        bigint id PK
        text mode
        text map
        smallint max_players
        jsonb options
        text status
        bigint created_by FK
        timestamptz created_at
        timestamptz started_at
        timestamptz ended_at
        integer duration_ticks
        text result
        text reason
    }
    match_players {
        bigint match_id PK_FK
        bigint user_id PK_FK
        boolean won
        boolean survived
        integer kills
        integer frags
        integer deaths
        integer damage_dealt
        integer damage_taken
        integer armor_absorbed
        integer keys_collected
        integer potions_used
        boolean disconnected_at_end
        integer elo_before
        integer elo_after
        integer xp_gained
    }
    player_stats {
        bigint user_id PK_FK
        text mode PK
        integer matches_played
        integer wins
        integer losses
        integer draws
        integer kills
        integer frags
        integer deaths
        integer playtime_s
        integer elo
        integer xp
        integer level
        timestamptz updated_at
    }
    user_achievements {
        bigint user_id PK_FK
        text code PK
        timestamptz unlocked_at
        bigint match_id FK
    }
```

### 2.9 Migrações

Uma única pasta `backend/alembic/`, em cadeia **linear**. A primeira revisão (`0001_initial`) cria as tabelas de usuários **e** as de partidas na mesma migração, porque `matches.created_by` referencia `users(id)`. Depois dela, uma revisão por PR; o CI reprova se `alembic heads` devolver mais de uma linha (§4, decisão 4). O `entrypoint` do backend roda `alembic upgrade head` antes do `uvicorn` (F8.3).

## 3. Exemplo

Com estes dois JSON é possível testar estatísticas, ranking, level e conquistas **antes de existir partida real** — é a terceira costura do caminho crítico (plano §4).

`coop`, 3 Players, boss morto, um deles morreu no caminho:

```json
{
  "match_id": 12,
  "mode": "coop",
  "result": "win",
  "reason": "boss_defeated",
  "started_at": "2026-10-04T18:02:11Z",
  "ended_at": "2026-10-04T18:09:47Z",
  "duration_ticks": 13680,
  "players": [
    {"user_id": 7,  "won": true, "survived": true,  "kills": 9, "frags": 0, "deaths": 0,
     "damage_dealt": 118, "damage_taken": 6, "armor_absorbed": 4, "keys_collected": 2,
     "potions_used": 1, "disconnected_at_end": false},
    {"user_id": 9,  "won": true, "survived": true,  "kills": 7, "frags": 0, "deaths": 0,
     "damage_dealt": 94,  "damage_taken": 9, "armor_absorbed": 0, "keys_collected": 1,
     "potions_used": 2, "disconnected_at_end": false},
    {"user_id": 15, "won": true, "survived": false, "kills": 4, "frags": 0, "deaths": 1,
     "damage_dealt": 52,  "damage_taken": 10, "armor_absorbed": 2, "keys_collected": 0,
     "potions_used": 0, "disconnected_at_end": true}
  ]
}
```

`pvp`, vitória por `frag_limit`:

```json
{
  "match_id": 13,
  "mode": "pvp",
  "result": "win",
  "reason": "frag_limit",
  "started_at": "2026-10-04T18:20:00Z",
  "ended_at": "2026-10-04T18:22:35Z",
  "duration_ticks": 4650,
  "players": [
    {"user_id": 7, "won": true,  "survived": true,  "kills": 0, "frags": 5, "deaths": 3,
     "damage_dealt": 10, "damage_taken": 6, "armor_absorbed": 0, "keys_collected": 0,
     "potions_used": 1, "disconnected_at_end": false},
    {"user_id": 9, "won": false, "survived": false, "kills": 0, "frags": 3, "deaths": 5,
     "damage_dealt": 6,  "damage_taken": 10, "armor_absorbed": 0, "keys_collected": 0,
     "potions_used": 0, "disconnected_at_end": false}
  ]
}
```

No empate, `result` é `"draw"`, `reason` é `"time_limit"` e os dois Players têm `won: false`.

## 4. Decisões

1. **`result` é o desfecho da Room; quem ganhou é `match_players.won`** (pergunta 1). No `coop` o grupo ganha ou perde junto, então `result` já diz tudo. No `pvp` ele não consegue dizer: um ganha e o outro perde na mesma linha. Então `result` vale `"win"` (alguém venceu) ou `"draw"`, e **toda estatística e todo ranking leem `match_players.won`**, nunca `matches.result`. O campo continua existindo porque é o que a tela de resultado mostra e o que o Event `game_over` já carrega. Casa com a proposta do Roberto em [ws-messages.md](ws-messages.md) §5, item 2.
2. **O "pronto" de cada Player vive na Room, em memória** (pergunta 2). É estado de partida antes de começar, e o invariante 2 vale para ele: o banco só recebe o Match ao final. Por isso o `RoomManager` ganha `set_ready`, que a arq. §10.2 não tinha, e `RoomInfo.players[].ready` o expõe. Gravar `ready` no banco criaria escrita a cada clique e um estado que o reinício do backend tornaria mentira — as Rooms se perdem no reinício, o `ready` não poderia sobreviver a elas. Combinado com o Roberto em 06/10: esse estado mora na entrada de Lobby do `RoomManager`, e a Room da Simulation só é criada no `start`.
3. **Só o host inicia, e o host é sucedido, não eleito** (pergunta 3). `matches.created_by` é o host. Se ele sai do Lobby, o host passa para o Player com o `joined_at` mais antigo que restou, e `created_by` é atualizado — é uma linha de código e evita o Lobby que ninguém consegue iniciar. Lobby que fica sem ninguém é destruído no próprio `leave`, e o Match vira `aborted` na mesma chamada: sem varredura, sem job. Lobby que nunca inicia não expira por tempo (decisão 10).
4. **Uma migração inicial, cadeia linear, uma cabeça conferida pelo CI** (pergunta 4). Duas pessoas escrevendo migrações na mesma semana produzem duas revisões com o mesmo `down_revision`, e o Alembic passa a ter duas cabeças — `upgrade head` falha e a correção é um `merge` que ninguém quer explicar na defesa. A migração inicial é uma só, escrita por mim a partir de [auth.md](auth.md) e deste arquivo, porque `matches.created_by` precisa de `users`. Depois dela, quem vai gerar revisão avisa no canal e parte da `head` atual; o CI roda `alembic heads` e reprova com mais de uma linha. É mais barato que combinar pastas separadas por Slice (que não resolvem a FK).
5. **A idempotência é a própria linha do Match, travada no `SELECT ... FOR UPDATE`.** `status = 'running'` é a condição; a segunda chamada não encontra linha e sai sem efeito. Não precisa de tabela de controle nem de chave externa: a transição `running → finished` só pode acontecer uma vez. As PKs de `match_players` e `user_achievements` são a segunda rede.
6. **`player_stats` é agregada, não calculada por request.** O leaderboard e o perfil leem muito mais do que o `record_match_result` escreve, e o agregado deixa a leitura em um índice em vez de um `SUM()` sobre `match_players`. O custo é a consistência ficar sob responsabilidade de uma função só — que é idempotente e tem teste com os dois JSON da §3.
7. **Elo só no `pvp`.** `coop` não tem adversário, então não há o que ranquear: a progressão do `coop` é XP e level. `player_stats.elo` existe nas duas linhas por simetria de schema, mas só muda no `pvp`.
8. **Nenhuma coluna de partida em `users`.** Vitórias e level moram em `player_stats`, que é minha; `users` é do Augusto. Assim nenhuma das duas Slices precisa migrar a tabela da outra.
9. **Um User está em no máximo uma Room**, em `lobby` ou em andamento (decidido em 10/10, `ws-manager.md` §5.1). Entrar ou criar outra devolve 409 `already_in_other_match`; o User sai da atual antes. O `ws-manager.md` §2.6 já impõe um socket `game` por User, então duas partidas do mesmo User derrubariam o socket uma da outra (`4408`). A troca automática (entrar em outra tira da anterior) foi descartada: efeito colateral escondido no `join`, e o host que troca de Lobby passaria o host adiante sem querer. Quem está no Grace period continua na Room e, por isso, não entra em outra: é o que protege a Reconnection.
10. **Lobby sem TTL; quem fica offline sai.** O lobby (F5.2) registra um callback em `ConnectionManager.on_presence_change`; quando um User fica offline (já com os 5 s de atraso do [ws-manager.md](ws-manager.md) §2.3, então recarregar a página não conta), o lobby chama `leave` na Room dele, se ela estiver em `lobby`. Se era o último, a Room é destruída e o Match vira `aborted` (decisão 3). Isso cobre o Lobby abandonado de quem fechou o site, que é o caso que importa na demo: o servidor sobe, o time joga e o servidor desce. Sobra o Lobby de quem deixou a aba aberta e foi embora; um TTL para ele (30 min desde `created_at`, por exemplo) fica para a S5/S6, se sobrar tempo. Em partida (`running`), ficar offline não tira ninguém: aí vale o Grace period.

## 5. Em aberto

| # | Questão | Quem decide | Quando |
|---|---|---|---|
| 1 | `join` no `/ws/game` de uma Room que ainda está em `lobby`: fecha com `4409` ou aceita e manda `welcome` só no `start`? É o item 5 de [ws-messages.md](ws-messages.md) §5. Proposta: fechar, porque a casca só navega para `/play` depois do `match_started`. | Augusto e Akita | reunião 04/10 |
| 2 | Resolvido em 10/10: sem TTL; quem fica offline sai do Lobby (§4, decisão 10). TTL fica como melhoria para a S5/S6, se sobrar tempo. | Akita | feito |
| 3 | `min_players` por Mode. Proposta: 1 no `coop` (dá para testar sozinho e o módulo *Multiplayer 3+* se demonstra com 3+ de verdade) e 2 no `pvp`. | Rafael (é pergunta 7 dele em [room-options.md](room-options.md)) | reunião 04/10 |
| 4 | Quem emite `achievement_unlocked`: `record_match_result` devolve a lista e a Room emite, ou a função chama o `ConnectionManager` direto? Proposta: devolve a lista — a função fica sem dependência de rede e testável. | Akita e Augusto | reunião 04/10 |
| 5 | Fórmula de XP e de level, fórmula de Elo e a lista de ≥ 5 conquistas com o código de cada uma. Sem elas, F5.5 e F5.7 inventariam regra. | Rafael (F4.6) | **início da S3** |
| 6 | Resolvido em 06/10: `damage_dealt` é o HP tirado do Boss (`coop`) ou de Players (`pvp`), num contador só (§2.4). | Roberto | feito |
| 7 | Resolvido: a arquitetura e o `CONTEXT.md` usam `match_id` desde o PR #14. | Roberto | feito |
| 8 | O que acontece com `matches` e `match_players` se um User for apagado. Hoje: `RESTRICT`, ou seja, não apaga. Não há tela de exclusão de conta no escopo; se entrar, vira anonimização do `username`, não `DELETE`. | Augusto e Akita | quando a exclusão de conta entrar no escopo |

