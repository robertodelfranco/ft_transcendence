# Contrato: mensagens do jogo (`ws-messages.md`)

**Estado:** rascunho para a reunião de 04/10. **Escreve:** Roberto. **Assina:** Augusto (`protocol.py`, `types.ts`, `net/`) e Rafael (cena a partir do Snapshot). Exemplo completo em [snapshot.example.json](snapshot.example.json).

## 1. Para que serve

Toda mensagem do socket `/ws/game/{match_id}`, nos dois sentidos. O cliente do jogo manda Input e Action; o servidor manda o estado da Room (Snapshot) e os fatos que a Simulation produziu (Events). O Augusto escreve `protocol.py` e `types.ts` só com este arquivo, e o Rafael desenha a cena só com o Snapshot.

## 2. Formas

### 2.1 Convenções

- **Envelope.** Toda mensagem é um objeto JSON num frame de texto, com `"v": 1` e `"type"`. Tipo desconhecido, campo faltando ou tipo de campo errado fecha o socket com `4400`.
- **Coordenadas.** `x` é a coluna do Grid e `y` é a linha, em células, a partir do canto superior esquerdo. O centro da célula `(i, j)` é `(i + 0.5, j + 0.5)`. Norte é `y` diminuindo. No Three.js, `x` vira `X`, `y` vira `Z` e o norte é `-Z`.
- **Direção.** `(dx, dy)` é um vetor unitário. Spawn `N` = `(0, -1)`, `S` = `(0, 1)`, `E` = `(1, 0)`, `W` = `(-1, 0)`. Para a câmera: `yaw = atan2(-dx, -dy)`.
- **Ids.** Player e Match usam o id inteiro do banco: `user_id` e `match_id`. Enemy e Projectile têm id em texto, único na Room e nunca reaproveitado (`"e_3"`, `"f_41"`, `"b_7"`); o cliente não interpreta o formato.
- **Números.** Posição e direção são `number` com casas decimais; `hp`, `mana`, `armor`, `keys`, `tick` e `seq` são inteiros. Unidades e constantes em [rules.md](rules.md).

### 2.2 Cliente → servidor

| `type` | Campos | Regras |
|---|---|---|
| `join` | `match_id: int`, `token: string` (access JWT) | Primeira mensagem. Sem `join` válido em 5 s, fecha com `4401`. `match_id` igual ao do caminho, senão `4400` |
| `input` | `seq: int`, `keys: {up, down, left, right, rot_left, rot_right, sprint}` (7 booleanos, todos obrigatórios), `mouse_dx: number` (rad) | Um por passo de `1 / TICK_RATE` s do cliente. `seq` começa em 1 e só cresce; recomeça a cada conexão nova. Como o servidor aplica: §2.9 |
| `action` | `seq: int` (mesmo contador do `input`), `kind: "fire" \| "door"` | Uma por tecla pressionada; entra na mesma fila do `input` (§2.9). Action que não pode acontecer (sem Mana, cooldown, Player morto, nenhuma Door à frente) é ignorada sem resposta |
| `ping` | `t: number` (relógio do cliente, ms) | O servidor devolve o mesmo `t` no `pong` |

**O que cada tecla significa** (pergunta 8). Com frente `f = (dx, dy)` e direita `r = (-dy, dx)`:

| Campo | Efeito | Olhando para norte |
|---|---|---|
| `up` / `down` | anda em `+f` / `-f` | norte / sul |
| `right` / `left` | anda em `+r` / `-r` | leste / oeste |
| `rot_right` / `rot_left` | gira `(dx, dy)` por `+a` / `-a`: `(dx·cos a − dy·sin a, dx·sin a + dy·cos a)` | gira para leste / oeste |
| `sprint` | multiplica o passo por `PLAYER_SPRINT_MULT` | |
| `mouse_dx` | giro acumulado desde o último `input`; positivo = mesmo sentido de `rot_right`. O servidor corta em `MOUSE_MAX_ROT_SPEED × dt` por Tick | |

A ligação de tecla a campo é do cliente: `W/S` → `up/down`, `A/D` → `left/right`, `←/→` → `rot_left/rot_right`, `Shift` → `sprint`, `Espaço` → `fire`, `F` → `door`. Ela **não** copia o C, que trocava as setas e o strafe para compensar o mundo espelhado (ver Decisões).

### 2.3 Servidor → cliente

| `type` | Campos | Quando |
|---|---|---|
| `welcome` | `user_id: int`, `room: {match_id, mode: "coop" \| "pvp", options}`, `map: {grid: string[]}`, `snapshot` | Resposta ao `join`, inclusive na Reconnection |
| `snapshot` | ver §2.4 | A cada 2 Ticks (15 Hz) |
| `event` | `name: string`, `tick: int`, `data: object` | Quando acontece (§2.6) |
| `pong` | `t: number` | Resposta ao `ping` |
| `error` | `code: string`, `message: string` | Logo antes de fechar com `44xx` (§2.7) |

No `welcome`:

- `options` são as RoomOptions completas, com os defaults aplicados ([room-options.md](room-options.md)).
- `map.grid` é o **Grid inicial da Room**: o Map com as RoomOptions já aplicadas (Pickup desligado vira `0`). As linhas têm todas o mesmo tamanho, e as células de Spawn, Enemy e Boss já vêm como `0`. Caracteres e significado em [map-format.md](map-format.md).
- `snapshot` é um Snapshot completo (os campos de §2.4, sem `v` e `type`). O Grid atual é `map.grid` com o `grid_delta` dele aplicado.

### 2.4 Snapshot, campo por campo

| Campo | Tipo | Conteúdo |
|---|---|---|
| `tick` | int | Tick da Room em que a foto foi tirada |
| `last_input_seq` | int | Último `seq` de `input` **deste destinatário** que o servidor aplicou; `0` antes do primeiro. É o único campo que muda por destinatário |
| `players` | lista | Todos os Players da Room, inclusive o destinatário e os mortos |
| `enemies` | lista | Enemies vivos e os que estão em `dying`; `[]` no `pvp` |
| `boss` | objeto ou `null` | `null` no `pvp` |
| `projectiles` | lista | Projectiles em `moving` ou `hit` |
| `doors` | lista | Todas as Doors do Map, sempre |
| `grid_delta` | lista | Toda célula cujo valor hoje difere do `welcome.map.grid` (acumulado desde o início, não só a última mudança) |
| `scoreboard` | objeto ou `null` | `null` no `coop` |

| Entidade | Campos |
|---|---|
| Player | `id: int` (user_id), `name: string` (username), `x`, `y`, `dx`, `dy`, `hp: int`, `mana: int`, `armor: int`, `keys: int`, `alive: bool`, `connected: bool` |
| Enemy | `id: string`, `x`, `y`, `state` |
| Boss | `x`, `y`, `hp: int`, `state` |
| Projectile | `id: string`, `kind: "fireball" \| "bullet"`, `owner: int \| null` (user_id; `null` no bullet), `x`, `y`, `dx`, `dy`, `state` |
| Door | `x: int`, `y: int` (célula), `open: bool`, `locked: bool` |
| `grid_delta[]` | `x: int`, `y: int`, `c: string` (um caractere: `0` para Pickup coletado, `O` para Door aberta). Uma Door fechada de novo volta a ser igual ao Grid inicial e sai da lista |
| `scoreboard` | `players: [{id: int, frags: int}]` em ordem decrescente de `frags`, e `time_left_s: int` |

`doors` e `grid_delta` sempre concordam. A Prediction usa o Grid para colisão; o Renderer usa `doors` para animar a porta e mostrar se está trancada.

Uma entidade sai da lista no primeiro Snapshot depois de o tempo dela acabar: Enemy em `dying` por `ENEMY_DYING_S`, Projectile em `hit` por `PROJECTILE_HIT_S`. Enquanto está em `dying` ou `hit`, ela não colide nem causa dano. Quando um id some da lista, o cliente remove o sprite.

### 2.5 Valores de `state`

Lista fechada. O cliente anima no próprio relógio e reinicia a animação quando o `state` muda.

| Entidade | `state` | Significado | No C |
|---|---|---|---|
| Enemy | `alert` | Persegue o Player vivo mais próximo | `ALERT` |
| | `attack` | Golpe em andamento; o dano sai ao fim de `ENEMY_ATTACK_INTERVAL_S` | `ATTACK` |
| | `dying` | Morrendo, por `ENEMY_DYING_S`; depois sai do Snapshot | `HITED` → `DYING` → `DEAD` |
| Boss | `idle` | Nenhum Player chegou a `BOSS_SIGHT_RANGE` desde o início | `IDLE` |
| | `alert` | Viu um Player e se move | `ALERT` |
| | `attack` | Animação de tiro; o bullet sai ao fim dela | `ATTACK` |
| | `dying` | Morrendo, por `BOSS_DYING_S`. É o fim do `coop` | `DYING` |
| Projectile | `moving` | Em voo | `MOVING` |
| | `hit` | Impacto, parado no ponto do acerto por `PROJECTILE_HIT_S`; depois sai | `HITED` |

Os estados `HITED` (Enemy), `DAMAGE` e `DEAD` do C duravam um quadro ou marcavam remoção, e não vão para o fio.

### 2.6 Events

`by`, `killer_id`, `owner`, `winner_ids` e `player_id` são sempre `user_id`. Quando o autor é um Enemy ou o Boss, `by` é `null`.

| `name` | `data` | Quando |
|---|---|---|
| `player_joined` | `{player_id, name}` | Primeiro `join` de um Player na Room |
| `player_disconnected` | `{player_id}` | O socket caiu; começa o Grace period |
| `player_reconnected` | `{player_id}` | O mesmo User voltou dentro do Grace period |
| `player_left` | `{player_id}` | Saiu de vez: Grace period expirou no `coop` |
| `door_opened` / `door_closed` | `{x, y, by}` | Door mudou; `by` é quem apertou |
| `item_picked` | `{kind: "key" \| "potion" \| "mana" \| "armor", by, x, y}` | Pickup coletado |
| `player_hit` | `{target, by, source: "enemy" \| "bullet" \| "fireball", amount, absorbed}` | `amount` é o HP perdido e `absorbed` o que a Armor segurou; o dano total é a soma |
| `enemy_died` | `{enemy_id, killer_id}` | Enemy entrou em `dying` |
| `boss_died` | `{killer_id}` | Boss entrou em `dying` |
| `player_died` | `{player_id, by}` | HP chegou a 0. É o kill feed; no `pvp` com `by` preenchido, é um Frag |
| `player_respawned` | `{player_id, x, y}` | Só no `pvp` |
| `game_over` | `{result: "win" \| "loss" \| "draw", winner_ids: int[], reason}` | Uma única vez por Room |
| `achievement_unlocked` | `{user_id, code}` | Depois do `game_over` |

`reason` vem do `MatchResult` (arq. §10.2): `boss_defeated`, `all_dead`, `frag_limit`, `time_limit`, `forfeit`, `server_shutdown`.

### 2.7 Fechamento e erros

Antes de fechar com um código `44xx` ou `4503`, o servidor manda `error` com o `code` correspondente. O `code` é o que a casca traduz (`HudState.error`); `message` é só para log e nunca aparece na tela.

| Código | `code` | Quando |
|---|---|---|
| `1000` | | Fim normal: a Room foi removida, 60 s depois do `game_over` |
| `4400` | `invalid_message` | Mensagem que não segue este contrato |
| `4401` | `unauthenticated` | Sem `join` em 5 s, ou token inválido |
| `4403` | `not_a_member` | O User não está nesta Room |
| `4404` | `room_not_found` | Não existe Room com esse `match_id` |
| `4409` | `room_full` | Room sem vaga |
| `4503` | `server_shutdown` | Backend encerrando; a Room se perdeu |

### 2.8 Ritmo

| O quê | Valor | Fonte |
|---|---|---|
| Tick | 30 Hz (`TICK_RATE`), `dt` sempre o do servidor | arq. §4, decisão 7; §7.2 |
| Snapshot | a cada 2 Ticks (15 Hz) | arq. §6.2 |
| `join` | até 5 s depois de abrir o socket | arq. §4, decisão 5 |
| Input | o cliente manda 1 por passo de 1/30 s; o servidor aplica 1 por Tick, ou 2 para alcançar (no máximo 60 por segundo) | §2.9; arq. §7.2 |
| Grace period | 30 s | arq. §7.3 |
| Remoção da Room | 60 s depois do `game_over` | arq. §10.1 |
| Interpolation | os outros desenhados a `now − 100 ms`; sem Snapshot por mais de 2 intervalos, congela | arq. §7.2 |
| Reconciliation | erro menor que 0,05 célula corrigido em 100 ms; maior, teleporta | arq. §7.2 |

### 2.9 Como o servidor aplica Input e Action

A regra que mantém a Prediction certa: **cada `input` é aplicado uma única vez, com `dt = 1 / TICK_RATE`, na ordem do `seq`.** O Tick em que ele é aplicado não importa para a posição do próprio Player; o que importa é cliente e servidor aplicarem a mesma sequência de Inputs com o mesmo `dt`.

- Cada Player tem uma fila na Room. `input` e `action` entram nela na ordem de chegada, que é a ordem do `seq` (o WebSocket roda sobre TCP).
- A cada Tick, o servidor consome a fila em ordem até aplicar um `input`. Se ficaram 3 ou mais `input`s esperando, aplica dois nesse Tick, para alcançar o cliente depois de um atraso da rede. Nunca mais que dois por Tick: é o limite de 60 por segundo.
- **Fila vazia: o Player fica parado nesse Tick.** O servidor não repete o último Input, porque esse passo a mais o cliente não previu.
- O `mouse_dx` de cada `input` é aplicado junto com ele, cortado em `MOUSE_MAX_ROT_SPEED × dt`.
- Uma `action` é executada com a posição e a direção que o Player tem naquele ponto da fila. Assim a fireball sai para onde o Player olhava quando apertou, mesmo com o servidor alguns Inputs atrás.
- Player morto: os Inputs são consumidos e ignorados, para o `seq` continuar andando.
- `last_input_seq` é o `seq` do último `input` aplicado.
- A fila guarda no máximo 1 s (30 `input`s); o que passar disso é descartado. A fila zera na Reconnection, junto com o `seq`.

## 3. Exemplo

[snapshot.example.json](snapshot.example.json) tem duas mensagens reais sobre o mesmo Map de 47 × 40 (derivado do `map.cub` do Cub3D, com 5 Spawns, 20 Enemies, `M`, `A` e `T`):

- `welcome` no Tick 0: os 5 Players nos Spawns, os 20 Enemies em `alert`, o Boss em `idle`, as 10 Doors trancadas.
- `snapshot` no Tick 3600: Player com Armor, Player morto, Player desconectado; Enemies em `alert`, `attack` e `dying`; Boss em `attack`; fireballs em `moving` e `hit` e um bullet; Doors abertas e trancadas; `grid_delta` com Doors e Pickups.

Todas as posições caem em célula livre da grade, com a folga de colisão de cada entidade. Os valores de Mana e Armor são ilustrativos até [rules.md](rules.md) ter os números. A CLI da F1.7 grava no mesmo formato (`welcome` mais `snapshot`), para o `dev.html` abrir os dois sem adaptação.

As mensagens do cliente:

```json
{"v": 1, "type": "join", "match_id": 12, "token": "<access jwt>"}
{"v": 1, "type": "input", "seq": 3572, "keys": {"up": true, "down": false, "left": false, "right": false, "rot_left": false, "rot_right": false, "sprint": true}, "mouse_dx": -0.0125}
{"v": 1, "type": "action", "seq": 3573, "kind": "fire"}
{"v": 1, "type": "ping", "t": 1759420800123}
```

Events e erro:

```json
{"v": 1, "type": "event", "name": "player_hit", "tick": 3598, "data": {"target": 12, "by": null, "source": "enemy", "amount": 1, "absorbed": 0}}
{"v": 1, "type": "event", "name": "enemy_died", "tick": 3590, "data": {"enemy_id": "e_14", "killer_id": 12}}
{"v": 1, "type": "event", "name": "game_over", "tick": 9012, "data": {"result": "win", "winner_ids": [7, 9, 12, 15, 21], "reason": "boss_defeated"}}
{"v": 1, "type": "error", "code": "not_a_member", "message": "user 33 is not in match 12"}
```

No `pvp`, o `scoreboard` fica assim:

```json
{"players": [{"id": 7, "frags": 3}, {"id": 9, "frags": 1}], "time_left_s": 94}
```

## 4. Decisões

- **Um id por coisa, sem `frame`, eixos do Three.js.** Já decididos para todos os contratos ([README](README.md#o-que-já-está-decidido)).
- **`right` e `rot_right` seguem a cena, que não é espelhada** (pergunta 8). O Cub3D desenhava o mundo espelhado: em `set_north` o plano da câmera aponta para oeste, então `controls_bonus.c:44-47` liga a seta esquerda a `rot_right`, e `right_move` (`move_utils_bonus.c:41-42`) anda para oeste olhando para norte. Aqui, olhando para norte, `right` anda para leste e `rot_right` gira para leste. A matemática de `rot_right` do C continua valendo (`movement_bonus.c:85-105`); as fórmulas de `right_move` e `left_move` trocam de lugar.
- **Só `last_input_seq` muda por destinatário** (pergunta 5). Conferido campo a campo: HP, Mana, Armor e chaves de todos os Players vão para todos, porque a HUD do `coop` mostra o grupo. O resto do Snapshot é montado uma vez por envio.
- **`scoreboard` é uma lista de `{id, frags}`** (pergunta 6). Num objeto, o id viraria chave de texto (`"7"`), o único lugar do contrato onde ele não seria número; a lista também já vem na ordem do placar.
- **Entidade morta sai depois do tempo da animação** (pergunta 7). O Rafael precisa ver `dying` por 1,5 s para animar a morte, e o Snapshot a 15 Hz garante pelo menos 22 fotos nesse intervalo. Os tempos são os do C (`rules.md`).
- **A lista de `state` sai do enum do C** (pergunta 12), sem os estados que duravam um quadro. Os 10 quadros dos sprites de Enemy do Cub3D já se dividem assim: 0–2 andando, 3–6 atacando, 7–9 morrendo.
- **`grid_delta` é acumulado desde o Grid inicial, e o `welcome` manda o Grid inicial.** Assim o Snapshot é igual para todos os destinatários, aplicar duas vezes dá o mesmo resultado, e um Snapshot descartado não faz o cliente perder uma Door ou um Pickup. A Reconnection não precisa de caso especial. O custo é pequeno: no exemplo, 12 células mudadas ocupam cerca de 0,3 KB de um Snapshot de 2,9 KB.
- **Snapshot pode ser descartado; Event nunca.** A F2.6 descarta Snapshot para cliente lento não travar a Room. Snapshot é estado, e o próximo substitui o perdido; Event é um fato que não se repete (kill feed, `game_over`), então a fila de Events não descarta.
- **Input aplicado em fila, um por Tick, e nunca repetido** (§2.9). A arq. §5 guardava só o último Input do Player. Com isso, um Tick que recebe 0 ou 2 Inputs (o jitter normal da rede) aplica um passo que o cliente não previu, ou pula um que ele previu, e o erro de 0,12 célula passa do limite de 0,05 da Reconciliation: o Player teleporta. Com a fila, cliente e servidor aplicam exatamente os mesmos passos. Decidido pelo Roberto em 02/10.
- **Action usa o mesmo contador de `seq` do `input`** e entra na mesma fila. É o que deixa o servidor executar o `fire` no ponto certo da sequência de movimento.
- **Action impossível é ignorada sem `error`.** Tentar atirar sem Mana é jogo normal, não erro de protocolo.
- **Os números do netcode ficam aqui (§2.8), não em `rules.md`**, porque não são regra de jogo e só o `TICK_RATE` entra na Prediction.

## 5. Em aberto

1. **Onde a fila de §2.9 mora e quem a enche.** *Roberto e Augusto.* Proposta: a fila fica no `Player` (`state.py`, Roberto); o laço de leitura do socket (Augusto) só valida a mensagem e a coloca na fila; quem consome é o `step`.
2. **O que significa o `result` do `game_over` no `pvp`?** *Com o Akita, junto da pergunta 1 dele em `rooms.md`.* Proposta: no `coop`, `win` ou `loss` do grupo; no `pvp`, `win` com o vencedor em `winner_ids`, ou `draw` com `winner_ids = []`. Cada cliente compara o próprio id com `winner_ids`, e o evento continua igual para todos.
3. **O mesmo User abre um segundo socket na Room.** *Augusto.* Proposta: a conexão nova vence e a antiga fecha com um código novo (por exemplo `4408`, "substituída").
4. **Token vencido durante a partida.** É a pergunta 6 do Augusto e entra em `auth.md`. Se a autenticação valer só no `join`, nada muda aqui.
5. **`join` numa Room que ainda está no Lobby.** *Augusto e Akita.* Fechar com `4409`, ou aceitar e mandar `welcome` só no início?
6. **Depois, com resposta neste arquivo:** o Player desliza na parede? A diagonal continua 1,41 vez mais rápida? Qual é a ordem das teclas dentro do Tick? (R2) Uma Door pode fechar com alguém na célula? (R3) O cliente prevê `fire` e `door`, ou só o movimento? (R7)
