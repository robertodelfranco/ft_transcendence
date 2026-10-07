# Catacombs 42 — arquitetura

> Como o sistema funciona: componentes, estado, protocolo, contratos, banco e as decisões técnicas por trás de cada um. Atualizado em 25/09/2026 para o escopo fechado (jogo 3D em Three.js, 21 pontos) e em 28/09/2026 para a troca do *AI opponent* pelo *Monitoring system* (sem bot; Prometheus + Grafana na §12). Em 02/10/2026 entraram as decisões da preparação dos contratos: Player identificado pelo `user_id` e partida pelo `match_id`, Snapshot sem `frame`, Theme dono de todo o visual, arquivo de Map só com a grade (sem parser com códigos de erro) e fim do `friendly_fire`; depois, fim do `enemy_density` (Map com até 20 Enemies) e Inputs aplicados em fila, um por Tick ([contracts/ws-messages.md](contracts/ws-messages.md) §2.9). Em 06/10/2026: `map` fora de `RoomOptions`, placar da HUD em lista, `ViewState` com `camera`, estado de Lobby no `RoomManager` e calendário replanejado ([pm/replanejamento-e-board.md](pm/replanejamento-e-board.md)). Em 07/10: Door aberta não fecha, o Player desliza na parede e a diagonal é normalizada ([contracts/ws-messages.md](contracts/ws-messages.md) §4).
>
> O que fazer e quando está em [catacombs42-plano-de-tarefas.md](catacombs42-plano-de-tarefas.md). O vocabulário está em [CONTEXT.md](../CONTEXT.md). A proposta ampliada com todas as opções de módulos está em [catacombs42-ideias-e-modulos.md](catacombs42-ideias-e-modulos.md). Os códigos F1–F8 são as frentes do plano.

## Sumário

1. [A ideia em um minuto](#1-a-ideia-em-um-minuto)
2. [Visão geral e invariantes](#2-visão-geral-e-invariantes)
3. [O Cub3D de origem](#3-o-cub3d-de-origem)
4. [Decisões técnicas](#4-decisões-técnicas)
5. [Estado da Room](#5-estado-da-room)
6. [Simulation (F1)](#6-simulation-f1)
7. [Protocolo WebSocket (F2)](#7-protocolo-websocket-f2)
8. [Cliente do jogo (F2 + F3)](#8-cliente-do-jogo-f2--f3)
9. [Backend compartilhado: auth, middlewares e conexões (F6, F2)](#9-backend-compartilhado-auth-middlewares-e-conexões-f6-f2)
10. [Partidas, estatísticas e banco (F5)](#10-partidas-estatísticas-e-banco-f5)
11. [Casca web e i18n (F7)](#11-casca-web-e-i18n-f7)
12. [Infra (F8)](#12-infra-f8)
13. [Contratos entre frentes](#13-contratos-entre-frentes)
14. [Estrutura de pastas](#14-estrutura-de-pastas)
15. [Mapa de migração do C](#15-mapa-de-migração-do-c)
16. [Riscos técnicos e critérios de aceite](#16-riscos-técnicos-e-critérios-de-aceite)
17. [Fontes](#17-fontes)

---

## 1. A ideia em um minuto

O Catacombs 42 é o bonus do Cub3D: um dungeon crawler single-player em C, com raycasting estilo Wolfenstein, inimigos, boss que atira, portas com chave, poções, bola de fogo e minimapa, rodando numa janela MLX42. O projeto o transforma no jogo do Transcendence: **3D de verdade no navegador (Three.js), de 1 a 5 pessoas**, em co-op na masmorra ou em PvP 1v1 entre duas pessoas.

A analogia que resume a arquitetura é **um teatro**:

- O **servidor** é o diretor. Só ele sabe a verdade: onde cada Player está, onde estão os inimigos, quem levou dano, se a porta abriu. Ele decide tudo.
- O **navegador** é o cenário e o microfone. Recebe do diretor "onde está cada coisa" e monta a cena em 3D. Manda para o diretor quais teclas o jogador aperta e quanto o mouse girou.
- O **Nginx** é a bilheteria: recebe o público por HTTPS/WSS e encaminha para a sala certa.
- O **PostgreSQL** é o arquivo do teatro: contas, amizades, partidas encerradas, estatísticas.

O que atravessa a rede são **números** (posições, estados), nunca pixels. Por isso o servidor continua 2,5D em grade, exatamente como o Cub3D: o Three.js só desenha. A câmera olha para cima e para baixo, mas isso não afeta acerto nem colisão.

---

## 2. Visão geral e invariantes

```
                    HTTPS / WSS (TLS termina no Nginx)
 Navegador  ───────────────────────────────────────►  Nginx
 ┌──────────────────────────────────────────┐            ├── /          → frontend (build estático)
 │ frontend/src  (React + CSS + i18n)       │            ├── /api/      → backend (REST)
 │   telas, lobby, HUD, perfil, estatística │            ├── /ws/app    → backend (presença, lobby)
 │   └── monta ──► frontend/game (TS puro)  │            └── /ws/game/  → backend (partida)
 │         net: socket, prediction, interp. │                     │
 │         render: Three.js (ViewState)     │                     ▼
 └──────────────────────────────────────────┘   ┌─────────────────────────────────────────┐
                                                │ backend (FastAPI, um worker)             │
                                                │  auth, users, matches (lobby, stats)     │
                                                │  ws: ConnectionManager                   │
                                                │  game: RoomManager → Room → Simulation   │
                                                └───────────────────┬─────────────────────┘
                                                                    ▼
                                                ┌─────────────────────────────────────────┐
                                                │ PostgreSQL (SQLAlchemy + Alembic)        │
                                                └─────────────────────────────────────────┘
```

Tudo sobe com `docker compose up` em quatro serviços que já existem no repo (`db`, `backend`, `frontend`, `proxy`), mais os de monitoring da §12 (`prometheus`, `grafana` e os exporters).

**Invariantes** (valem para toda frente; um PR que quebra um deles precisa de ADR):

1. **O servidor decide** acerto, dano, coleta, porta e vitória. O cliente desenha e envia Input e Action.
2. **Estado de partida em andamento vive só em memória**, na Room. O banco recebe apenas o Match, ao final.
3. **Um único worker de backend.** `ConnectionManager` e `RoomManager` são dicionários em processo. Escalar exigiria Redis pub/sub, e é decisão do Tech Lead.
4. **Mesma fórmula de movimento no cliente e no servidor**, sempre velocidade × dt, nunca por quadro. `sim.py` e `applyInput.ts` usam as mesmas constantes (`rules.py` e `rules.ts`).
5. **A Simulation é pura**: `app/game/sim.py` não importa FastAPI, SQLAlchemy nem nada de rede.
6. **O jogo é isolado da casca**: `frontend/game/` não importa nada de `frontend/src/`. A casca só chama `mountGame`.
7. **Console do Chrome limpo**: toda falha de imagem, som, socket e fetch vira estado na tela, nunca warning.
8. **Todo texto visível passa pelo i18n**, inclusive erros do backend (traduzidos no front a partir do `code`).

---

## 3. O Cub3D de origem

Repositório `robertodelfranco/42-Cub3D` (bonus em `src/bonus/`, mapas em `maps/`, PNGs em `assets/`).

| Item | No C |
|---|---|
| Lib gráfica | MLX42 (GLFW + OpenGL), libft própria |
| Tamanho do bonus | ~4.100 linhas em ~50 arquivos |
| Tela | `1620 × 880`, FOV 60° (`1.0472`) |
| Mapa `.cub` | `NO/SO/WE/EA` texturas, `F/C` cores, grid com `1` parede, `0` chão, `N/S/E/W` spawn único, `D` porta (vira `O` aberta), `K` chave, `P` poção, `I` inimigo, `B` boss |
| Jogador | `t_player` único: posição, direção, plano de câmera, HP 10, chaves, sprint, flags de tecla |
| Inimigos | Lista `t_enemy_list`, estados `ALERT / ATTACK / DYING / DEAD / HITED`, perseguem **o** jogador, atacam a < 0,7 |
| Boss | `t_boss` único: persegue, atira bullets, HP 60 |
| Projéteis | fireballs (jogador) e bullets (boss), avançam 0,5 célula a cada 0,2 s |
| Portas | `F` abre/fecha a porta 1 célula à frente; a primeira abertura consome chave |
| Controles | `W/A/S/D`, `←/→`, `Shift` sprint, `Space` fireball (cooldown 0,4 s), `F` porta, mouse nas bordas gira |
| Assets | 65 PNGs: paredes, porta, chave, poção, mão, 4 tipos de inimigo com 10 quadros, fireball com 4 quadros, telas de fim |
| Testes prontos | `maps/invalid/` com 27 mapas nomeados pelo erro; `maps/valid/` com 6 |

**Três fatos que definem o port:**

1. **A matemática está separada do desenho.** `movement_bonus.c`, `move_utils_bonus.c`, `enemy_move_bonus.c`, `move_boss_bonus.c`, `door_bonus.c` e `update_*` (menos a última chamada de render) não têm chamada `mlx_`. É isso que vira Python.
2. **O jogo inteiro assume um jogador.** `game->player` é singleton; inimigos, boss, portas e projéteis consultam `game->player->pos_x`. Passar para N jogadores é a maior mudança conceitual (seção 5).
3. **O movimento do jogador é por quadro** (`0.06` por chamada, sem `delta_time`), enquanto inimigos e projéteis são por tempo. A 144 Hz o jogador anda 2,4× mais rápido que a 60 Hz. No servidor tudo é por dt (seção 6.3).

**Três bugs do C que não devem ser portados:**

1. `move_boss_bonus.c`: `can_boss_move_to` chama `can_boss_move_utils` e ignora o retorno, e o boss atravessa inimigos. Em Python, use o retorno.
2. `handle_utils_bonus.c`: `check_key_and_potion(t_game*, int x, int y)` recebe `int` mas é chamada com `double` (trunca em vez de `floor`). Em Python, use `math.floor` explícito.
3. Movimento por quadro (fato 3 acima).

Há ainda uma decisão que não é bug: `lightning_bonus.c` usa `rand()`. O relâmpago é efeito visual e fica no cliente, com RNG local.

---

## 4. Decisões técnicas

Cada uma vira um ADR curto em `docs/adr/` (título + 1–3 frases de contexto, decisão e motivo). São a resposta pronta para "por que vocês fizeram assim?" na defesa.

| # | Decisão | Por quê | Alternativa (e quando trocar) |
|---|---|---|---|
| 1 | **Access JWT (15 min) no corpo da resposta, guardado em memória pelo SPA e enviado em `Authorization: Bearer`. Refresh opaco (7 dias) em cookie `HttpOnly; Secure; SameSite=Strict; Path=/api/auth/refresh`, rotacionado a cada uso** | XSS não alcança o refresh; CSRF só alcança `/refresh`, mitigado por `SameSite=Strict` + checagem de `Origin`, e o atacante não lê o novo access | Ambos em cookie + token CSRF double-submit, só se houvesse SSR |
| 2 | **Argon2id via `pwdlib[argon2]`** | Recomendação atual da doc do FastAPI (o `passlib` está abandonado) e da OWASP | `bcrypt` direto (limite de 72 bytes) |
| 3 | **`PyJWT`, HS256, segredo de 32+ bytes do `.env`**; claims `sub`, `exp`, `iat`, `jti`, `typ: "access"` | Recomendação atual da doc do FastAPI; `python-jose` sem manutenção | RS256 só se outro serviço precisasse validar tokens |
| 4 | **Refresh opaco (`secrets.token_urlsafe(48)`), guardado como `sha256` em `refresh_tokens` com `family_id`, `expires_at`, `revoked_at`, `replaced_by`** | Rotação com detecção de reuso (RFC 9700): token já usado reaparece, a família inteira é revogada | JWT como refresh, que sem tabela não revoga |
| 5 | **No WebSocket, o token vai na primeira mensagem (`join`)**, não na query string; sem `join` em 5 s, fecha com `4401` | Query string vai para log e histórico; o navegador não deixa setar header no handshake | Cookie de access com `Path=/ws/` |
| 6 | **OAuth 2.0 com a 42** (Authorization Code + `state`), emitindo os mesmos tokens do login | 1 ponto, fluxo curto, público real | 2FA TOTP (`pyotp`) se a intra travar: mesmo ponto |
| 7 | **Simulation a 30 Hz (dt = 1/30 fixo); Snapshot a cada 2 ticks (15 Hz)** | Divide limpo; 15 Hz basta com interpolação a 100 ms | 60/20 se o input "grudar" |
| 8 | **Vários `N/S/E/W` no arquivo de Map**; a Room exige `len(spawns) >= max_players` | Compatível com os mapas existentes, sem caractere novo de spawn | Caractere `X` de spawn livre |
| 9 | **Rate limit próprio**: dependência `RateLimit(times, seconds, key)`, token bucket em memória | Um worker, sem Redis; ~40 linhas explicáveis na defesa | `fastapi-limiter` se um dia houver Redis |
| 10 | **Um worker** (`uvicorn` sem `--workers`), documentado no README como limitação consciente | Room e conexões em memória; o subject não exige escala | Redis pub/sub + sticky sessions |
| 11 | **JSON com `v: 1` em toda mensagem** | Depurável no DevTools; ~3 KB por Snapshot × 15 Hz é pouco | Binário se a banda incomodar; o `v` permite trocar |
| 12 | **Three.js puro dentro de `frontend/game/`**, sem react-three-fiber | O laço de render e o estado a 30 Hz não passam pela reconciliação do React; o jogo fica testável sem a casca | react-three-fiber, se o time inteiro já dominasse React |
| 13 | **Mouse look com Pointer Lock**: yaw vai ao servidor como `mouse_dx`; pitch fica só no cliente | Yaw muda para onde a fireball vai, então é autoritativo; pitch é câmera | Só setas (não serve para o "cara de FPS") |
| 14 | **Projétil, nunca hitscan** | Projétil tolera latência sem lag compensation no servidor; é o que o Cub já tem | Hitscan exigiria rebobinar o mundo por RTT |
| 15 | **Canal `/ws/app` separado de `/ws/game`**: aberto pela casca após o login, carrega presença (status online) e atualizações de lobby | Status online e lobby em tempo real precisam de socket fora da partida | Polling HTTP, que custa requests e não é "real-time" |

---

## 5. Estado da Room

Tudo que no C estava espalhado em `t_game` vira o estado de **uma Room**, com a diferença estrutural de que `player` vira `players`.

```
Room
├── match_id (é o id da Room), mode ("coop" | "pvp"), status ("running" | "finished")
├── options: RoomOptions             ← customização, com defaults (seção 6.4)
├── ruleset: CoopRuleset | PvpRuleset
├── tick: int                         ← relógio oficial, vai em todo Snapshot
├── rng: random.Random(seed)          ← nunca o random global
├── grid: list[list[str]]             ← MUTÁVEL: portas D/O, pickups somem
├── players: { user_id → Player }
│     Player: user_id, name, x, y, dir_x, dir_y,
│             hp, mana, armor, keys, alive, connected,
│             input {up, down, left, right, rot_left, rot_right, sprint},
│             input_queue, last_input_seq, attack_cooldown,
│             kills, deaths, frags, damage_dealt, damage_taken, …
├── enemies: [ {id, x, y, state, target_player_id} ]
├── boss: {x, y, hp, state, target_player_id} | None
├── projectiles: [ {id, kind: "fireball" | "bullet", owner_id, x, y, dx, dy, state} ]
├── doors: [ {x, y, locked, open} ]
└── result: None | {result, winner_ids, reason}
```

A Room da Simulation nasce no `start`. Antes disso, o Lobby (quem entrou, quem está pronto, quem é o host) é estado do `RoomManager` ([contracts/rooms.md](contracts/rooms.md)).

O Player é identificado pelo `user_id` do User, e é esse número que `target_player_id` e `owner_id` guardam. A Room é identificada pelo `match_id`. O servidor não guarda quadro de animação: ele manda o `state` e o cliente anima (§7.1).

**O que muda por haver N jogadores** (em relação ao C):

- Colisão também **player × player** (distância < 0,6), além de parede, porta, inimigo e boss.
- Inimigo persegue o **player vivo mais próximo** e só troca de alvo se o novo estiver 1 célula mais perto (evita ping-pong e protege quem chegou primeiro). O boss escolhe alvo por rodízio a cada tiro.
- Dano vai para o **alvo**, não para `game->player`.
- Todo projétil tem **`owner_id`**: é a base de kill feed, placar, estatísticas e conquistas.
- Porta trancada consome a chave de **quem apertou**.
- Player com HP ≤ 0 fica `alive = False`: não colide e é ignorado por inimigos. No co-op, a câmera dele segue um companheiro vivo (UX local, sem módulo de spectator). No PvP, renasce.

---

## 6. Simulation (F1)

### 6.1 Interface

- **Carregador de Map** (`load_map(text) -> Map`; o nome é sugestão): lê a grade e devolve o Grid inicial, os Spawns com orientação e as posições de Enemy, Boss, Door e Pickup. Caracteres: os do Cub3D (`1 0 N S E W D K P I B`) mais `M` (mana), `A` (armadura) e `T` (tocha: célula livre no servidor, luz no cliente). O arquivo não tem linhas de textura nem de cor, porque o visual é do Theme (§8.2). Não existe parser com códigos de erro: quem escreve Map é o time, não o usuário. No lugar dele, um teste percorre `maps/coop/` e `maps/pvp/` e reprova o PR se algum mapa tiver caractere desconhecido, borda aberta, Spawns de menos para o Mode, ou não tiver exatamente 1 `B` no coop.
- `step(room, dt) -> list[Event]`, **determinística** e sem I/O. Ordem fixa por tick:
  1. aplicar Inputs (yaw por `mouse_dx` limitado, rotação por tecla, movimento, coleta);
  2. Actions pendentes (`fire` se houver mana e cooldown vencido; `door`);
  3. inimigos; 4. boss; 5. projéteis com subpasso ≤ 0,1 célula;
  6. dano (armadura absorve antes do HP);
  7. regeneração de mana;
  8. Ruleset: respawn, fim de partida.
- `to_snapshot(room, for_player_id) -> dict`.
- `Ruleset`: `on_start`, `on_player_death`, `check_end`, `entity_set` (quais caracteres do mapa valem), `numbers`. Dois adapters:
  - **`CoopRuleset`**: vitória quando o boss morre; derrota quando todos morrem; sem respawn; fireball não fere Player; `game_over` emitido **uma vez**.
  - **`PvpRuleset`**: 1v1, inimigos e boss desligados, fireball fere player, respawn no spawn livre mais longe do adversário, vitória em `frag_limit` eliminações ou maior placar em `time_limit_s`.
- Garantias que as outras frentes usam: `hp` inteiro; posição nunca fora do grid (checar limites: mapas irregulares têm linhas de tamanhos diferentes); constantes só em `rules.py`.

### 6.2 O laço, de `handle_movement` para `step`

O C chamava tudo a cada quadro, desenho incluso. O servidor chama `step(room, 1/30)` a cada tick, numa `asyncio.Task` por Room, com compensação de deriva (`next_tick += 1/30; sleep(max(0, next_tick - now))`, relógio `time.monotonic()`), e envia Snapshot a cada 2 ticks. Sai do laço tudo que desenha: `perform_raycasting`, `render_*`, `update_minimap`, `update_lightning`, `call_clean_and_draw_functions`.

Custo: poucas dezenas de entidades e aritmética simples. Meta: 1000 ticks com 5 players + 20 inimigos + boss + 10 projéteis em < 200 ms; p99 do tick < 5 ms com 4 Rooms cheias. O GIL só atrapalha código que satura CPU, e esse não satura.

### 6.3 Constantes (`rules.py` e `rules.ts`, mesmos nomes)

A coluna "por segundo" assume que o MLX42 rodava a ~60 fps com vsync. Meça no C antes de fixar.

| Grandeza | No C | Como o C aplicava | No servidor |
|---|---|---|---|
| Andar | `0.06` | por quadro | `PLAYER_SPEED = 3.6` cél/s |
| Sprint | × 2 | por quadro | `7.2` cél/s |
| Girar (tecla) | `0.03` rad | por quadro | `PLAYER_ROT_SPEED = 1.8` rad/s |
| Girar (mouse) | 0,4 × rotação nas bordas da janela | por evento | `mouse_dx` em rad, limitado a `MOUSE_MAX_ROT_SPEED` × dt por tick |
| Raio de colisão do player | `R = 0.05`, 4 cantos | — | igual |
| Player × enemy/boss/player | bloqueia a `< 0.6` | — | igual |
| Enemy: velocidade | `0.15` por passo a 10 Hz | discreto | `ENEMY_SPEED = 1.5` cél/s contínuo |
| Enemy: alcance / dano | `≤ 0.7`; 1 HP a cada 7 quadros × 0,2 s | — | `1` HP a cada `1.4` s de contato |
| Enemy: morte | `DYING` 3 quadros × 0,5 s → `DEAD` | — | igual |
| Boss: HP | `60`; fireball tira `10` | — | igual (6 acertos) |
| Boss: velocidade | `0.2` por passo, só se `8 < dist ≤ 20` | discreto | `BOSS_SPEED = 2.0` cél/s |
| Boss: ataque | `dist ≤ 16` (≤ 18 com cooldown vencido), cooldown ≈ 2,2 s | — | igual |
| Bullet: dano | `2` HP | — | igual |
| Projétil: velocidade | `0.5` cél a cada `0.2` s | salto | `PROJECTILE_SPEED = 2.5` cél/s, subpasso ≤ 0,1 |
| Projétil: raio de acerto | `< 0.3` | — | igual (no PvP, também em player) |
| Fireball: cooldown | `0.4` s | — | igual |
| Fireball: dano em player (PvP) | — | — | `FIREBALL_PLAYER_DAMAGE = 2` |
| Poção | `+3` HP, teto `10` | — | igual; teto = `start_hp` |
| HP inicial | `LIFE_MAX = 10` | — | `options.start_hp` (default 10) |
| Mana | — | — | `MANA_MAX`, `FIREBALL_MANA_COST`, `MANA_REGEN_PER_S`, `MANA_PICKUP` (por Ruleset; co-op generoso, PvP apertado) |
| Armadura | — | — | `ARMOR_POINTS`: absorve dano antes do HP e some ao zerar |
| Respawn (PvP) | — | — | `RESPAWN_DELAY_S` |
| Porta | célula a `1.0` à frente; 1ª abertura de trancada consome chave | — | igual; chave de quem apertou |

Números finais são calibrados por F4 (tarefa F4.7 do plano).

### 6.4 `RoomOptions` (Game customization)

Validadas no `POST /api/matches` com defaults e imutáveis depois de criada a Room; a Simulation lê de `room.options`. O `map` é parâmetro de criação, ao lado de `mode` e `max_players`, e fica fora de `options`.

| Opção | Valores | Default |
|---|---|---|
| `theme` | `dungeon`, `sewer` (todo o visual no cliente: paredes, chão, teto, sprites, luz) | `dungeon` |
| `start_hp` | 5–20 | 10 |
| `pickups` | `{potion, mana, armor}` ligados/desligados | todos ligados |
| `frag_limit` | 3–10 (PvP) | 5 |
| `time_limit_s` | 120–600 (PvP) | 180 |

A tabela oficial com limites é [contracts/room-options.md](contracts/room-options.md).

---

## 7. Protocolo WebSocket (F2)

Toda mensagem: `{"v": 1, "type": "<tipo>", ...}`. Contrato completo com exemplos em `docs/contracts/ws-messages.md` + `snapshot.example.json`.

### 7.1 `/ws/game/{match_id}`

**Cliente → servidor**

```json
{"v":1,"type":"join","match_id":12,"token":"<access jwt>"}
{"v":1,"type":"input","seq":42,"keys":{"up":true,"down":false,"left":false,"right":false,"rot_left":false,"rot_right":false,"sprint":false},"mouse_dx":0.031}
{"v":1,"type":"action","seq":43,"kind":"fire"}
{"v":1,"type":"action","seq":44,"kind":"door"}
{"v":1,"type":"ping","t":1726400000123}
```

**Servidor → cliente**

```json
{"v":1,"type":"welcome","user_id":7,"room":{"match_id":12,"mode":"coop","map":"dungeon_map","options":{"start_hp":10,"theme":"dungeon"}},"map":{"grid":["111","1N1","111"]},"snapshot":{}}
{"v":1,"type":"snapshot","tick":1200,"last_input_seq":42,
 "players":[{"id":7,"name":"rdel-fra","x":3.5,"y":2.5,"dx":0,"dy":-1,"hp":8,"mana":60,"armor":0,"keys":1,"alive":true,"connected":true}],
 "enemies":[{"id":"e_3","x":6.2,"y":7.1,"state":"alert"}],
 "boss":{"x":12.5,"y":14.5,"hp":40,"state":"attack"},
 "projectiles":[{"id":"f_9","kind":"fireball","owner":7,"x":4.1,"y":1.9,"dx":0,"dy":-1,"state":"moving"}],
 "doors":[{"x":5,"y":8,"open":false,"locked":true}],
 "grid_delta":[{"x":5,"y":3,"c":"0"}],
 "scoreboard":null}
{"v":1,"type":"event","name":"player_died","tick":1201,"data":{"player_id":9,"by":7}}
{"v":1,"type":"event","name":"game_over","tick":1900,"data":{"result":"win","winner_ids":[7,9],"reason":"boss_defeated"}}
{"v":1,"type":"pong","t":1726400000123}
{"v":1,"type":"error","code":"room_full","message":"…"}
```

- **Ids**: todo id de Player (`players[].id`, `owner`, `by`, `winner_ids`) é o `user_id` do User. Enemy e Projectile têm id próprio, local à Room (`e_3`, `f_9`). A partida é identificada pelo `match_id`.
- **Sem `frame`**: o servidor manda só o `state` de cada entidade. O cliente anima no próprio relógio e reinicia a animação quando o `state` muda.
- `mouse_dx`: giro acumulado em radianos desde o último `input` (a sensibilidade é aplicada no cliente); o servidor limita por tick.
- `grid_delta`: só as células que mudaram (porta, pickup). O grid completo vem no `welcome`.
- `scoreboard`: `null` no co-op; no PvP, `{"players":[{"id":7,"frags":3},{"id":9,"frags":1}],"time_left_s":94}`, em ordem de placar.
- **Events**: `player_joined`, `player_left`, `player_disconnected`, `player_reconnected`, `door_opened`, `item_picked {kind, by}`, `player_hit {target, by, amount, absorbed}`, `enemy_died {enemy_id, killer_id}`, `boss_died {killer_id}`, `player_died {player_id, by}` (vira o kill feed), `player_respawned`, `achievement_unlocked {user_id, code}` (após o fim), `game_over {result, winner_ids, reason}`.
- **Códigos de fechamento**: `4400` mensagem inválida, `4401` não autenticado, `4403` não é membro da Room, `4404` Room inexistente, `4409` Room cheia, `4503` servidor encerrando.

### 7.2 Por que `seq` existe: Prediction, Reconciliation e Interpolation

O cliente aplica o próprio Input na hora (**Prediction**), com a mesma função do servidor (`applyInput.ts` ≡ `sim.py`), e guarda os Inputs ainda não confirmados. Quando chega um Snapshot com `last_input_seq = 41`, ele põe o Player na posição oficial, descarta até 41 e reaplica 42, 43… (**Reconciliation**). Erro pequeno (< 0,05 célula) é corrigido suavemente em 100 ms; erro grande, teleporta. Os **outros** Players e entidades são desenhados a `now − 100 ms`, interpolando entre Snapshots (**Interpolation**); sem Snapshot novo por mais de 2 intervalos, congela (não extrapola).

Do lado do servidor: o `dt` aplicado é sempre o do servidor (nunca um dt vindo do cliente: é anti speed-hack); cada Input é aplicado uma única vez, em fila, um por Tick e no máximo dois para alcançar o cliente (60/s), e fila vazia deixa o Player parado ([contracts/ws-messages.md](contracts/ws-messages.md) §2.9); `seq` só cresce e é guardado por conexão (reinicia ao reconectar).

### 7.3 Desconexão e reconexão (módulo *Remote players*)

- Socket caiu: `connected = False`, Input zerado, o Player continua na Room e pode levar dano. `Event player_disconnected`.
- Mesmo User faz `join` na mesma Room em até **30 s**: recebe `welcome` com Snapshot completo; os outros recebem `player_reconnected`.
- Grace expirou: no co-op, o Player sai; no PvP, conta derrota.
- A Room **nunca** depende do socket de ninguém: o laço é uma task do servidor, não um callback de rede.
- Backend reiniciado no meio: Rooms se perdem; clientes recebem `4503` e a tela "partida encerrada pelo servidor"; o `startup` marca todo Match `running` como `aborted`.

### 7.4 `/ws/app`

Aberto pela casca logo após o login (mesmo `join` com token). Carrega:

- presença: `{"type":"presence","user_id":7,"online":true}` para os amigos;
- lobby: `{"type":"lobby_update","match_id":12,"players":[…],"status":"lobby"}` para quem está no lobby daquela Room;
- `{"type":"match_started","match_id":12}`: a casca navega para `/play/12`.

---

## 8. Cliente do jogo (F2 + F3)

```
input.ts (teclado + Pointer Lock)
   │ InputState, mouse_dx, Action
   ▼
net/ (F2): socket ─► prediction ─► interpolation ─► ViewState
   ▲                                                   │
   └──────────── Snapshot / Events ◄─── servidor       ▼
                                          render/ (F3): Renderer (Three.js)
                                                   │
                                          onHud(HudState) ─► HUD em React (F7)
```

### 8.1 `ViewState` e `Renderer`

**`ViewState`** é tudo que o render recebe a cada quadro do navegador: o Player próprio já previsto (com o pitch local), os outros interpolados, entidades, portas, o Grid atual e a `camera` (a pose de onde desenhar: a do próprio Player ou, quando ele morre no co-op, a de um companheiro vivo). O `Map` vai uma vez só, no `init`. O render **não sabe que existe rede**; por isso ele é desenvolvido desde o primeiro dia contra `snapshot.example.json` e a CLI da Simulation.

```ts
interface Renderer {
  init(map: GameMap, assets: Assets): Promise<void>;
  render(view: ViewState, dt: number): void;
  resize(width: number, height: number): void;
  dispose(): void;   // libera geometrias, texturas e render targets
}
```

### 8.2 A cena em Three.js

- **Mundo a partir do grid**: cada célula `1` é uma caixa texturizada, desenhada com `InstancedMesh` (uma chamada de desenho por textura); chão e teto como planos com as cores do Theme. Texturas do Cub3D com `NearestFilter` (mantém o pixel art).
- **Eixos**: `x` do Grid vira `X`, `y` do Grid vira `Z` e a altura é `Y`; 1 célula = 1 unidade e a parede tem altura 1. A câmera do Three.js olha para `-Z`, que é o norte do Grid (`dy = -1`), então `yaw = atan2(-dx, -dy)` e o mapa não sai espelhado.
- **Câmera**: posição = Player, altura fixa; yaw vem do estado; pitch só local, limitado a ±60°.
- **Entidades**: inimigos, boss, itens, projéteis e outros Players como **billboards** (`Sprite`) animados com os quadros existentes, "sentando" no chão como o `less_height` do C fazia. Porta como mesh que desliza.
- **Mão com bola de fogo**: overlay fixo na câmera.
- **Theme**: um arquivo em `frontend/game/` define, para cada Theme, as texturas de parede, as cores de chão e teto, os sprites de Enemy e de Boss (com número de quadros e duração de cada um) e a luz. No C o conjunto de sprites dependia de o nome do mapa conter `sewer`; aqui depende só do Theme.
- **Técnicas "advanced"** (o que o módulo *Advanced 3D graphics* cobra): tochas (`T`) como `PointLight` com sombra, névoa (`Fog`), partículas no rastro e no impacto da fireball, pós-processamento com `EffectComposer` + bloom leve, instancing das paredes, Themes por `options.theme`.
- **Minimapa**: canvas 2D sobreposto, a partir do grid e das posições.
- **Áudio**: Web Audio, iniciado só após a primeira interação (evita o warning de autoplay).
- **Assets**: `AssetLoader` carrega PNGs, modelos e sons; falha vira `HudState.status = "error"` na tela.
- **Meta de performance**: 60 fps num laptop de sala com 5 players, 20 inimigos e 10 projéteis; trocar de Room 10 vezes sem crescer memória.

### 8.3 `mountGame` e `HudState` (contrato com F7)

```ts
export interface HudState {
  hp: number; maxHp: number; mana: number; maxMana: number; armor: number;
  keys: number; alive: boolean; ping: number | null;
  players: Array<{ id: number; name: string; hp: number; alive: boolean; connected: boolean }>;
  scoreboard: { players: Array<{ id: number; frags: number }>; timeLeftS: number } | null;
  killfeed: Array<{ by: number | null; victim: number; tick: number }>;
  status: "connecting" | "running" | "finished" | "disconnected" | "error";
  error?: string;          // código, traduzido pela casca
}
export interface MountOptions {
  matchId: number;
  getAccessToken: () => Promise<string>;   // a casca guarda o token; o jogo pede quando precisa
  onHud: (hud: HudState) => void;
  onEnd: (result: { result: "win" | "loss" | "draw"; winnerIds: number[]; reason: string }) => void;
  wsUrl?: string;                           // default: wss://<host>/ws/game/<matchId>
}
export function mountGame(canvas: HTMLCanvasElement, opts: MountOptions): { unmount(): void };
```

O canvas é da casca (tamanho, posição, CSS); o conteúdo é do jogo. Tudo que é texto ou ícone vai por `onHud` e é desenhado em React (e portanto traduzido). O canvas só tem a cena, a mão e o minimapa: **nenhum texto dentro do canvas**.

---

## 9. Backend compartilhado: auth, middlewares e conexões (F6, F2)

### 9.1 Contrato de auth

| Método | Rota | Corpo | Resposta | Erros |
|---|---|---|---|---|
| POST | `/api/auth/signup` | `{email, username, password}` | 201 `{user}` | 409 `email_taken` / `username_taken`; 422 |
| POST | `/api/auth/login` | `{email, password}` | 200 `{access_token, token_type: "bearer", expires_in: 900, user}` + cookie de refresh | 401 `invalid_credentials`; 429 `rate_limited` |
| POST | `/api/auth/refresh` | (cookie) | 200 igual ao login + cookie rotacionado | 401 `invalid_refresh` (inclui reuso) |
| POST | `/api/auth/logout` | (cookie) | 204 + cookie limpo | — |
| GET | `/api/auth/me` | Bearer | 200 `{user}` | 401 `unauthorized` |
| GET | `/api/auth/oauth/42/login` | — | 302 para a intra | — |
| GET | `/api/auth/oauth/42/callback` | `?code&state` | 302 para o front | 302 `/login?error=oauth_failed` |

Regras: `username` 3–20 `[a-z0-9_]`; senha ≥ 8 com letra e número; mesma mensagem para e-mail inexistente e senha errada, com comparação de hash mesmo sem usuário (tempo constante); `datetime.now(timezone.utc)` e colunas `TIMESTAMPTZ`; `Secure` no cookie exige HTTPS.

Uso pelas outras frentes:

```python
from app.auth.deps import CurrentUser   # Annotated[User, Depends(get_current_user)]

@router.get("/api/users/me/friends")
async def list_friends(user: CurrentUser, session: DbSession): ...
```

`authenticate_ws_token(token) -> User` é a versão para o `join` dos WebSockets.

### 9.2 Middlewares

- **Envelope de erro** em toda rota: `{"error": {"code": "invalid_credentials", "message": "...", "request_id": "3f2b…", "fields": {"password": "..."}}}`. O front traduz pelo `code`; `message` é só para log e depuração. 401 = sem token ou expirado; 403 = autenticado mas proibido; 422 com `fields`; 500 sem stack no corpo.
- **Logging** JSON em stdout com `request_id` (`uuid4` num `ContextVar`, ecoado em `X-Request-ID`). É middleware, porque vale para toda request.
- **Rate limit** como dependência: `RateLimit(times, seconds, key="ip" | "user")`, 429 com `Retry-After`. É dependência, porque cada rota escolhe o seu (login e signup: 5/min por IP).

### 9.3 `ConnectionManager`

```python
class ConnectionManager:
    async def connect(self, user_id: int, channel: Literal["game", "app"], ws: WebSocket) -> None
    async def disconnect(self, user_id: int, channel: str, ws: WebSocket) -> None
    async def send_to_user(self, user_id: int, payload: dict, channel: str | None = None) -> bool  # False se offline
    async def broadcast(self, user_ids: Iterable[int], payload: dict, channel: str | None = None) -> None
    def is_online(self, user_id: int) -> bool
    def online_users(self) -> set[int]
    def on_presence_change(self, callback: Callable[[int, bool], Awaitable[None]]) -> None
```

Garantias: `send_to_user` nunca levanta por socket fechado; um User pode ter várias abas; **uma** task lê cada socket e o manager escreve (nunca duas escritas simultâneas no mesmo socket); fila de envio por conexão com descarte do Snapshot mais antigo (cliente lento não trava a Room); heartbeat `ping/pong` com timeout.

---

## 10. Partidas, estatísticas e banco (F5)

### 10.1 Ciclo de vida de uma partida

```
POST /api/matches ─► Match(status="lobby") + RoomManager.create ─► match_id
      │                     (lobby atualizado por /ws/app)
POST /api/matches/{id}/start ─► RoomManager.start ─► /ws/app: match_started
      │
cliente abre /ws/game/{match_id} ─► join ─► Room roda
      │
Event game_over ─► record_match_result(match_id, MatchResult)  (idempotente)
      │               └► estatísticas, Elo, XP, conquistas
Room removida 60 s depois
```

A plataforma de partidas **nunca lê estado de Room em andamento do banco**; para listar Rooms abertas ou ao vivo, chama `RoomManager.info`. A corrida "dois usuários na última vaga" se resolve em `RoomManager.join`, que é atômico por rodar num único event loop (sem `await` entre checar e inserir).

### 10.2 Contrato `RoomManager` ↔ partidas

Rascunho de origem. O contrato atual, com `set_ready`, `RoomInfo` e as tabelas, é [contracts/rooms.md](contracts/rooms.md).

```python
# app/game/rooms.py — o que a plataforma de partidas chama
class RoomManager:
    def create(self, match_id: int, mode: Literal["coop", "pvp"], max_players: int,
               options: RoomOptions) -> None: ...                     # a Room é guardada pelo match_id
    def join(self, match_id: int, user_id: int) -> Player: ...        # RoomFull / RoomNotFound / AlreadyIn
    def leave(self, match_id: int, user_id: int) -> None: ...         # só no lobby
    def start(self, match_id: int) -> None: ...                        # NotEnoughPlayers
    def info(self, match_id: int) -> RoomInfo: ...

# app/matches/service.py — o que a Room chama ao terminar
async def record_match_result(match_id: int, result: MatchResult) -> None: ...   # idempotente

@dataclass(frozen=True)
class MatchResult:
    match_id: int
    mode: Literal["coop", "pvp"]
    result: Literal["win", "loss", "draw"]
    reason: str                  # "boss_defeated" | "all_dead" | "frag_limit" | "time_limit" | "forfeit"
    started_at: datetime
    ended_at: datetime
    duration_ticks: int
    players: list[MatchPlayerResult]

@dataclass(frozen=True)
class MatchPlayerResult:
    user_id: int
    won: bool
    survived: bool
    kills: int                   # inimigos + boss
    frags: int                   # PvP
    deaths: int
    damage_dealt: int
    damage_taken: int
    armor_absorbed: int
    keys_collected: int
    potions_used: int
    disconnected_at_end: bool
```

### 10.3 Schema

Migrações por Alembic; o `entrypoint` do backend roda `alembic upgrade head` antes do `uvicorn`. Tabela nova entra por PR revisado por quem é dono do schema (F5 para partidas, F6 para usuários).

| Tabela | Campos principais | Dona |
|---|---|---|
| `users` | `id`, `email` (único, minúsculo), `username` (único), `password_hash` (nulo se só OAuth), `avatar_url`, `preferred_language`, `created_at`, `last_seen_at` | F6 |
| `refresh_tokens` | `id`, `user_id`, `token_hash` (único), `family_id`, `expires_at`, `revoked_at`, `replaced_by`, `user_agent`, `created_at` | F6 |
| `oauth_accounts` | `id`, `user_id`, `provider` (`"42"`), `provider_user_id` (único por provider) | F6 |
| `friendships` | `user_id`, `friend_id`, `created_at` (par único) | F6 |
| `matches` | `id`, `mode`, `map`, `options` (JSONB), `status` (`lobby`/`running`/`finished`/`aborted`), `created_by`, `started_at`, `ended_at`, `result`, `reason` | F5 |
| `match_players` | `match_id`, `user_id`, `won`, `survived`, `kills`, `frags`, `deaths`, `damage_dealt`, `damage_taken`, `armor_absorbed`, `keys_collected`, `potions_used`, `disconnected_at_end`, `elo_before`, `elo_after`, `xp_gained` | F5 |
| `player_stats` | por `user_id` e `mode`: `wins`, `losses`, `kills`, `deaths`, `playtime_s`, `elo`, `xp`, `level` (tabela agregada atualizada em `record_match_result`) | F5 |
| `user_achievements` | `user_id`, `code`, `unlocked_at`, `match_id` (o catálogo de conquistas vive no código) | F5 |

Regras de negócio (fórmula de XP e level, Elo do PvP, lista de conquistas) são definidas por F4 (tarefa F4.6) antes de F5 implementar.

---

## 11. Casca web e i18n (F7)

- **React + TypeScript + framework CSS**, roteamento com rotas protegidas. O access token fica em memória num contexto de auth; ao carregar a página, a casca chama `/api/auth/refresh` para recuperar a sessão.
- **Cliente HTTP único** que entende o envelope de erro e renova o access em 401 uma vez antes de desistir.
- **`/ws/app`** aberto após o login (presença e lobby).
- **i18n**: `react-i18next`, arquivos `locales/{pt-BR,en,es}.json`, seletor de idioma no cabeçalho, preferência salva em `users.preferred_language` (com fallback em `localStorage` antes do login). Regras:
  - nenhuma string literal no JSX (regra de lint `i18next/no-literal-string` no CI);
  - erros do backend traduzidos pelo `code` do envelope;
  - Privacy Policy e Terms of Service nos 3 idiomas;
  - a HUD do jogo é React, então é traduzida como qualquer tela; o canvas não tem texto.
- **Privacy Policy e Terms of Service** acessíveis sem login, com link no rodapé de toda página.
- **Validação** espelhando a do backend (mesmos limites de `username`, senha e avatar), sem substituir a do backend.
- **Responsivo e acessível**: contraste, foco visível, navegação por teclado nas telas (o jogo em si exige teclado e mouse).

---

## 12. Infra (F8)

- **Nginx**: `listen 443 ssl`, redirect 80 → 443, certificado local de CA confiável (`mkcert`) para não haver warning. Rotas:
  - `/` → `frontend` (build de produção);
  - `/api/` → `backend`;
  - `/ws/` → `backend` com `proxy_http_version 1.1`, `Upgrade`/`Connection "upgrade"` e `proxy_read_timeout 3600s`.
  - Atenção: `proxy_pass http://backend:8000/;` com barra final reescreve o path. Fixar com F6 e F2 qual path o backend enxerga (e o `Path` do cookie de refresh precisa bater).
- **Compose**: um comando; healthchecks; nomes de **serviço** (`db`, `backend`) na rede, nunca nome de container; um worker de backend.
- **`.env`** local e fora do git; **`.env.example`** com todas as chaves e segredos vazios (`JWT_SECRET`, `POSTGRES_*`, `FT_CLIENT_ID`, `FT_CLIENT_SECRET`, …).
- **CI** (`.github/workflows/build-check.yml`): build das imagens, `pytest`, `vitest` e lint a cada PR.
- **Demo**: 2–3 máquinas na mesma rede com a CA do `mkcert` instalada.

### 12.1 Monitoring (Prometheus + Grafana)

O que o módulo cobra: coleta pelo Prometheus, exporters, dashboards próprios no Grafana, regras de alerta e acesso seguro ao Grafana. Tarefas F8.7–F8.11 do plano.

```
backend:8000/metrics ─────┐
node-exporter / cAdvisor ─┼─► prometheus (scrape, regras de alerta) ─► grafana ◄── Nginx /grafana/ (TLS + login)
postgres-exporter ────────┘
```

- **Instrumentação** (`app/core/metrics.py`, `prometheus_client`): `http_requests_total{route,status}` e `auth_login_total{result}` (counters, no middleware e no login), `ws_connections{channel}` e `game_rooms_active` (gauges, no `ConnectionManager` e no `RoomManager`), `game_tick_seconds` (histograma, no laço da Room). Tick é histograma porque o que interessa é a cauda (p95/p99 contra o orçamento de 33 ms); login é counter porque o que interessa é a taxa (`rate`).
- **`/metrics` só na rede interna**: o Nginx não roteia esse path. Prometheus também não publica porta.
- **Labels com cardinalidade baixa**: `route` é o template da rota (`/api/users/{id}`), nunca o path com o id; nada de `user_id` ou `match_id` em label.
- **Grafana**: datasource e dashboards provisionados por arquivo em `monitoring/grafana/provisioning/` (versionados; nada criado à mão na UI entra na demo). Servido em `/grafana/` pelo Nginx (`GF_SERVER_ROOT_URL` + `serve_from_sub_path`), admin vindo do `.env`, anônimo e signup desligados.
- **Alertas** (`monitoring/prometheus/alerts.yml`): backend fora do ar (`up == 0`), p99 do tick acima de 33 ms, taxa de 5xx, pico de logins falhos. Na defesa, derrubar o backend e mostrar o alerta indo para *firing*.
- **Recursos**: a retenção do Prometheus é curta (dias, não meses); é demo local.

---

## 13. Contratos entre frentes

Fechados na S1. Um contrato muda no **mesmo PR** que muda o código, e o PR cita o número. Quem escreve e quem assina cada um está em [contracts/README.md](contracts/README.md).

| # | Contrato | Entre | Onde vive | Nesta página |
|---|---|---|---|---|
| 1 | Snapshot, Events, mensagens WS | F1 ↔ F2 ↔ F3 | `docs/contracts/ws-messages.md`, `snapshot.example.json`, `protocol.py`, `types.ts` | §7 |
| 2 | `Renderer` e `ViewState` | F2 → F3 | `docs/contracts/mount-game.md`, `frontend/game/src/render/renderer.ts` | §8.1 |
| 3 | `Ruleset` | F1, F4 | `app/game/rulesets/` | §6.1 |
| 4 | `rules.py` ↔ `rules.ts` e `sim.py` ↔ `applyInput.ts` | F1 ↔ F2 | `docs/contracts/rules.md`, `app/game/rules.py`, `frontend/game/src/rules.ts` | §6.3 |
| 5 | `RoomManager` e `MatchResult` | F2 ↔ F5 | `docs/contracts/rooms.md` | §10.2 |
| 6 | `mountGame`, `MountOptions`, `HudState` | F2/F3 ↔ F7 | `docs/contracts/mount-game.md`, `frontend/game/src/index.ts` | §8.3 |
| 7 | Auth, `CurrentUser`, envelope, rate limit | F6 ↔ todos | `docs/contracts/auth.md` | §9.1, §9.2 |
| 8 | Arquivo de Map (grade) e arquivo de Themes | F4 ↔ F1, F3 | `docs/contracts/map-format.md`, `docs/contracts/mount-game.md` | §6.1, §8.2 |
| 9 | Rotas, rede, um worker, CI | F8 ↔ todos | `docs/contracts/infra.md`, README | §12 |
| 10 | `ConnectionManager` e `/ws/app` | F2 ↔ F5, F6 | `docs/contracts/ws-manager.md` | §7.4, §9.3 |
| 11 | `RoomOptions` com defaults e limites | F4 ↔ F1, F5, F7 | `docs/contracts/room-options.md` | §6.4 |
| 12 | Nomes e labels das métricas | F2, F6 → F8 | `app/core/metrics.py` | §12.1 |
| 13 | API REST de lobby (criar, listar, entrar, pronto, iniciar) | F5 ↔ F7 | `docs/contracts/matches-api.md` | §10.1 |
| 14 | Convenções de i18n, catálogo de `code` de erro e mapa de rotas do SPA | F7 ↔ F6 | `docs/contracts/i18n.md` | §9.2, §11 |

---

## 14. Estrutura de pastas

```
backend/
  app/
    main.py                 # create_app(): routers, handlers, lifespan (startup: aborta Matches "running")
    core/  config.py  security.py  logging.py  errors.py  ratelimit.py  metrics.py
    db/    session.py  models/
    auth/  router.py  schemas.py  service.py  deps.py  oauth42.py
    users/                  # perfil, avatar, amigos
    ws/    manager.py  app_router.py      # ConnectionManager e /ws/app
    game/  world.py  state.py  rules.py  sim.py  snapshot.py  rooms.py  protocol.py  router.py
           rulesets/  coop.py  pvp.py
    matches/                # lobby, record_match_result, estatísticas, Elo, conquistas, leaderboard
  alembic/
  maps/  coop/  pvp/        # grades de Map; a pasta define o Mode
  tests/
    conftest.py             # app de teste, sessão em transação com rollback
    fixtures/maps/          # grades pequenas para os testes da Simulation
    auth/  users/  ws/  game/  matches/
  Dockerfile  requirements.txt  entrypoint.sh

frontend/
  game/                     # TS puro + Three.js, sem React
    src/
      index.ts              # mountGame
      rules.ts  types.ts  input.ts
      net/     socket.ts  prediction.ts  interpolation.ts  viewstate.ts
      sim/     applyInput.ts
      render/  renderer.ts  scene.ts  entities.ts  effects.ts  minimap.ts  audio.ts  assets.ts
    dev.html  dev.ts        # roda com snapshot.json, sem servidor
    public/assets/          # PNGs do Cub3D, modelos, sons
  src/                      # React: rotas, telas, HUD, i18n; importa ../game
    locales/  pt-BR.json  en.json  es.json

monitoring/
  prometheus/  prometheus.yml  alerts.yml
  grafana/provisioning/  datasources/  dashboards/   # JSON dos dashboards versionado
```

Regra de fronteira: `frontend/game/` não importa nada de `frontend/src/`; `app/game/sim.py` não importa FastAPI, SQLAlchemy nem `ws`. São essas as duas costuras que permitem testar o jogo sem rede e sem site. Teste de deleção: se apagar `sim.py` e a complexidade reaparecer espalhada em `rooms.py` e no cliente, o módulo estava raso.

---

## 15. Mapa de migração do C

**PY** = vira Python no servidor · **TS** = vira TypeScript no cliente · **Three** = substituído pelo render em Three.js · **copiar** = usado sem alteração · **✗** = não migra

| Arquivo(s) do Cub3D | Destino | Observação |
|---|---|---|
| `parser_bonus/*.c` | **PY** (só o carregamento) | Vira o carregador de Map: lê a grade, com vários spawns e `M A T`. A validação com códigos de erro não migra |
| `player_bonus/movement_bonus.c`, `move_utils_bonus.c` | **PY** + **TS** (`applyInput.ts`) | Por dt; colisão com outros players; as duas versões são idênticas |
| `player_bonus/init_player_bonus.c` | **PY** | Orientação inicial por spawn |
| `player_bonus/controls_bonus.c` | **TS** | Teclas → `input`/`action`; mouse nas bordas vira Pointer Lock + `mouse_dx` |
| `enemy_bonus/enemy_move_bonus.c`, `enemy_manage_bonus.c` (estado) | **PY** | Alvo = player vivo mais próximo |
| `enemy_bonus/enemy_position_bonus.c`, `enemy_sort_bonus.c`, `enemy_images_bonus.c` | **Three** | Billboards; o Three.js ordena e projeta |
| `boss_bonus/init_boss`, `move_boss` | **PY** | Usar o retorno de `can_boss_move_utils` |
| `boss_bonus/render_boss`, `attack_bonus/render_*` | **Three** | Billboards animados |
| `attack_bonus/create_*`, `update_*` | **PY** | `owner_id`; movimento contínuo com subpasso; separar o render que o C chama dentro de `update_fireballs` |
| `door_bonus/door_bonus.c` | **PY** + **Three** | Estado no servidor; mesh animado no cliente |
| `game_bonus/handle_utils_bonus.c` (coleta) | **PY** | `math.floor` explícito |
| `raycasting_bonus/*` | **Three** | O raycaster sai; ficam as ideias de FOV e de `less_height` |
| `game_bonus/update_game_bonus.c` | **TS** (React) | Telas de vitória/derrota viram componentes |
| `minimap_bonus/*` | **TS** | Canvas 2D sobreposto |
| `player_bonus/life_bonus*.c` | **TS** (React) | HUD via `onHud` |
| `initializers_bonus/lightning_bonus.c` | **TS** | Efeito de luz local, RNG do cliente |
| `initializers_bonus.c`, `clean_bonus.c`, `free_bonus.c`, `error_bonus.c`, `MLX42/`, `lib/` | **✗** | Janela, hooks e memória viram navegador e Python |
| `assets/**/*.png`, `maps/valid/*.cub` | **copiar** | PNGs no frontend; mapas no backend, sem o cabeçalho de texturas e cores. Os de `maps/invalid/` não migram |

---

## 16. Riscos técnicos e critérios de aceite

- **Módulo pela metade vale zero.** Cada módulo tem demonstração definida no plano (§7); nada entra no README sem passar nela.
- **Prediction divergente** é o bug mais provável: fórmulas ou dt diferentes em `sim.py` e `applyInput.ts`. Mitigação: teste que roda a mesma sequência de Inputs em Python e em TS e compara; `console.assert` de reconciliação em modo dev. Posições nunca se comparam com `==` (`Math.cos` e `math.cos` podem diferir em 1 ulp).
- **WebSocket é TCP**: um pacote perdido segura os seguintes. Aceitável neste ritmo, desde que exista interpolação. Sem WebRTC.
- **asyncio**: `CancelledError` precisa ser re-levantado; `time.monotonic()` para o tick; serializar o Snapshot uma vez por tick.
- **Three.js e memória**: sem `dispose()` de geometrias, materiais e texturas, trocar de Room vaza memória de GPU.
- **Console do Chrome**: autoplay de áudio, imagem faltando, socket fechado e 401 esperado não podem gerar warning.
- **Teste de aceite de *Remote players***: dois notebooks, um com throttling (Chrome DevTools, 100 ms + 2 % de perda), 5 minutos sem teleporte visível, e um deles fechando a aba e voltando no meio da partida.

---

## 17. Fontes

- Subject v19: [transcendence.md](transcendence.md)
- Gabriel Gambetta, *Fast-Paced Multiplayer* (prediction, reconciliation, interpolation), com demo: https://www.gabrielgambetta.com/client-server-game-architecture.html
- Valve, *Source Multiplayer Networking* (tick, snapshots, interpolação, por que hitscan exige lag compensation): https://developer.valvesoftware.com/wiki/Source_Multiplayer_Networking
- Glenn Fiedler, *Fix Your Timestep!*: https://gafferongames.com/post/fix_your_timestep/
- FastAPI, *WebSockets* (inclui o aviso de que o gerenciador em memória só funciona num processo): https://fastapi.tiangolo.com/advanced/websockets/
- FastAPI, *OAuth2 with Password (and hashing), Bearer with JWT tokens*: https://fastapi.tiangolo.com/tutorial/security/oauth2-jwt/
- RFC 9700, *OAuth 2.0 Security Best Current Practice* (rotação de refresh): https://www.rfc-editor.org/rfc/rfc9700
- RFC 6749 §4.1, *Authorization Code Grant*: https://www.rfc-editor.org/rfc/rfc6749#section-4.1
- RFC 6455, *The WebSocket Protocol* (códigos de fechamento 4000–4999): https://www.rfc-editor.org/rfc/rfc6455
- OWASP, *Password Storage* e *CSRF Prevention* Cheat Sheets: https://cheatsheetseries.owasp.org/
- Prometheus, *Metric types*, *Instrumentation* (cardinalidade de labels) e *Alerting rules*: https://prometheus.io/docs/
- `prometheus_client` para Python: https://prometheus.github.io/client_python/
- Grafana, *Provision Grafana* e *Run Grafana behind a reverse proxy*: https://grafana.com/docs/grafana/latest/
- Three.js, documentação e exemplos: https://threejs.org/docs/ e https://threejs.org/examples/
- MDN, *Pointer Lock API*: https://developer.mozilla.org/en-US/docs/Web/API/Pointer_Lock_API
- react-i18next: https://react.i18next.com/
- Lode Vandevenne, *Raycasting* (a matemática do Cub3D original): https://lodev.org/cgtutor/raycasting.html
- Precedente na 42, cub3D no Transcendence com servidor autoritativo: https://github.com/samatsum/ft_Transcendence
