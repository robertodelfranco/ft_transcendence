# Contrato: números das regras (`rules.md`)

**Estado:** rascunho para a reunião de 04/10. **Escreve:** Roberto (nomes e unidades), Rafael (valores). **Assina:** Augusto.

## 1. Para que serve

A Simulation (`backend/app/game/rules.py`) e o cliente do jogo (`frontend/game/src/rules.ts`) leem os mesmos números, com os mesmos nomes. Este arquivo é a lista oficial desses nomes, com a unidade e o valor de cada um; quem muda um número muda os três arquivos no mesmo PR.

## 2. Formas

Como ler as tabelas:

- **Unidade.** `cél` é uma célula do Grid. Tudo que anda é por segundo, nunca por quadro nem por Tick.
- **Arq.** `sim` quando o nome já está na arq. §6.3; `novo` quando o nome não existia na arq. Todos os nomes foram aprovados pelo Roberto em 02/10.
- **No C.** De onde o número vem, em `src/bonus/` do Cub3D (commit `66b1473`), conferido linha a linha em 02/10.
- Valor com ¹ ou ² é ponto de partida e se decide jogando (ponto 1 de "Em aberto"). ¹: o valor por quadro do C vezes 60 fps. ²: o C não serve de referência (ver o ponto).

### 2.1 Relógio

| Nome | Unidade | Valor | Arq. | De onde vem |
|---|---|---|---|---|
| `TICK_RATE` | Hz | `30` | novo | arq. §4, decisão 7. O `dt` de todo Tick é `1 / TICK_RATE` |

### 2.2 Player

| Nome | Unidade | Valor | Arq. | No C |
|---|---|---|---|---|
| `PLAYER_SPEED` | cél/s | `3.6` ¹ | sim | `0.06` por quadro (`player_bonus/init_player_bonus.c:78`) |
| `PLAYER_SPRINT_MULT` | multiplicador | `2.0` | novo | `move_speed * 2.0` (`player_bonus/movement_bonus.c:22`) |
| `PLAYER_ROT_SPEED` | rad/s | `1.8` ¹ | sim | `0.03` rad por quadro (`player_bonus/init_player_bonus.c:79`) |
| `MOUSE_MAX_ROT_SPEED` | rad/s | Rafael | sim | Sem equivalente: o C girava `0.012` rad por evento de cursor nas faixas laterais de 30% da janela (`player_bonus/controls_bonus.c:63-71`) |
| `PLAYER_RADIUS` | cél | `0.05` | novo | `R`, testado nos 4 cantos contra `1` e `D` (`include/cub3d_bonus.h:27`, `player_bonus/move_utils_bonus.c:100-111`) |
| `BODY_BLOCK_DISTANCE` | cél | `0.6` | novo | Player não chega a menos disso (`<`) de Enemy, Boss ou outro Player vivo (`player_bonus/move_utils_bonus.c:26` e `:90`) |
| `FIREBALL_COOLDOWN_S` | s | `0.4` | novo | `attack_delay > 0.4` (`player_bonus/controls_bonus.c:90`) |
| `DOOR_REACH` | cél | `1.0` | novo | Célula a `1.0` à frente do Player (`door_bonus/door_bonus.c:67`) |
| `POTION_HEAL` | HP | `3` | novo | `hp += 3`, teto `10` (`game_bonus/handle_utils_bonus.c:50-52`) |

O HP inicial e o teto da poção não são constantes: vêm de `options.start_hp` ([room-options.md](room-options.md)). No C eram `LIFE_MAX = 10`.

### 2.3 Enemy

| Nome | Unidade | Valor | Arq. | No C |
|---|---|---|---|---|
| `ENEMY_SPEED` | cél/s | `1.5` | sim | `0.15` por passo (`enemy_bonus/enemy_images_bonus.c:131`), um passo quando `move_delay > 0.1` s (`enemy_bonus/enemy_manage_bonus.c:63`) |
| `ENEMY_RADIUS` | cél | `0.2` | novo | 4 cantos a `0.2` do centro (`enemy_bonus/enemy_move_bonus.c:40-50`) |
| `ENEMY_SEPARATION` | cél | `0.6` | novo | Enemy não chega a menos disso de outro Enemy (`enemy_bonus/enemy_move_bonus.c:30`) |
| `ENEMY_ATTACK_RANGE` | cél | `0.7` | novo | `distance <= 0.7` vira `ATTACK` (`enemy_bonus/enemy_manage_bonus.c:62-65`) |
| `ENEMY_ATTACK_INTERVAL_S` | s | `1.4` | novo | 7 quadros de `0.2` s (`enemy_bonus/enemy_manage_bonus.c:17-23` e `:38`); no C o primeiro golpe saía em 0,8 s |
| `ENEMY_DAMAGE` | HP | `1` | novo | `hp -= 1` (`enemy_bonus/enemy_manage_bonus.c:21`) |
| `ENEMY_DYING_S` | s | `1.5` | novo | 3 quadros de `0.5` s até `DEAD` (`enemy_bonus/enemy_manage_bonus.c:40-45`) |

### 2.4 Boss

| Nome | Unidade | Valor | Arq. | No C |
|---|---|---|---|---|
| `BOSS_HP` | HP | `60` | novo | `boss_bonus/init_boss_bonus.c:103` |
| `BOSS_SPEED` | cél/s | `2.0` | sim | `0.2` por passo (`:109`), um passo quando `move_delay > 0.1` s (`:36`) |
| `BOSS_RADIUS` | cél | `0.2` | novo | 4 cantos a `0.2` (`boss_bonus/move_boss_bonus.c:41-51`) |
| `BOSS_SIGHT_RANGE` | cél | `20` | novo | `distance <= 20.0` vira `ALERT` (`boss_bonus/init_boss_bonus.c:33`) |
| `BOSS_MIN_RANGE` | cél | `8` ² | novo | Só anda se `distance > 8.0` (`:35`) |
| `BOSS_ATTACK_RANGE` | cél | `18` ² | novo | `distance <= 18.0` vira `ATTACK` (`:31`); o `16.0` da `:38` nunca é alcançado |
| `BOSS_ATTACK_COOLDOWN_S` | s | `2.2` ² | novo | Intervalo entre dois bullets. A arq. soma 1 s de espera a 4 quadros de `0.3` s; o código dá cerca de `1.2` s (ponto 1) |
| `BOSS_DYING_S` | s | `1.2` | novo | 3 quadros de `0.4` s até `DEAD` (`:71-76`) |
| `BULLET_DAMAGE` | HP | `2` | novo | `hp -= 2` (`game_bonus/handle_game_bonus.c:116`) |
| `FIREBALL_BOSS_DAMAGE` | HP | `10` | novo | `boss->hp -= 10`, 6 acertos (`attack_bonus/render_fireball_bonus.c:99`) |

### 2.5 Projectile

| Nome | Unidade | Valor | Arq. | No C |
|---|---|---|---|---|
| `PROJECTILE_SPEED` | cél/s | `12` ² | sim | Salto de `0.5` célula quando `move_delay > 0.2` s (`attack_bonus/update_fireball_bonus.c:84-87`, `update_bullet_bonus.c:101-104`). A arq. dizia `2.5`; ver ponto 1 |
| `PROJECTILE_HIT_RADIUS` | cél | `0.3` | novo | Acerta a menos de `0.3` do alvo (`update_fireball_bonus.c:25` e `:43`, `update_bullet_bonus.c:24`) |
| `PROJECTILE_RADIUS` | cél | `0.1` | novo | 4 cantos a `0.1` contra `1` e `D` (`update_fireball_bonus.c:55-65`, `update_bullet_bonus.c:29-39`) |
| `PROJECTILE_MAX_SUBSTEP` | cél | `0.1` | novo | Não existe no C. arq. §6.1: o projétil avança em subpassos de no máximo `0.1` |
| `PROJECTILE_HIT_S` | s | `0.4` | novo | Tempo em `hit` antes de sair do Snapshot: 4 quadros de `0.1` s (`attack_bonus/render_fireball_bonus.c:32-38`). O bullet que acertava o Player usava 4 de `0.05` s (`update_bullet_bonus.c:64`) |
| `FIREBALL_PLAYER_DAMAGE` | HP | `2` | sim | Não existe no C. Só vale no `pvp` |

### 2.6 Valores por Ruleset (o Rafael preenche)

Nada disto existe no C. Cada linha tem um valor para `coop` e outro para `pvp`; a arq. §6.3 pede co-op generoso e PvP apertado. No código, estes valores ficam no `numbers` de cada Ruleset (arq. §6.1), um dicionário com os nomes abaixo; `rules.ts` espelha o mesmo dicionário por Mode.

| Nome | Unidade | `coop` | `pvp` | O que é |
|---|---|---|---|---|
| `MANA_MAX` | Mana | | | Teto de Mana do Player |
| `FIREBALL_MANA_COST` | Mana | | | Quanto uma fireball gasta |
| `MANA_REGEN_PER_S` | Mana/s | | | Regeneração contínua |
| `MANA_PICKUP` | Mana | | | Quanto o Pickup de mana devolve |
| `ARMOR_POINTS` | Armor | | | Quanto o Pickup de armor dá |
| `RESPAWN_DELAY_S` | s | não se aplica | | Tempo entre morrer e renascer |
| `MOUSE_MAX_ROT_SPEED` | rad/s | | | Limite de giro por mouse; o servidor corta `mouse_dx` em `MOUSE_MAX_ROT_SPEED × dt` por Tick |

### 2.7 O que não entra aqui

- `start_hp`, `frag_limit`, `time_limit_s` e as demais escolhas de quem cria a Room: [room-options.md](room-options.md).
- FOV, altura da câmera, tamanho e deslocamento de sprite, duração de cada quadro de animação: [mount-game.md](mount-game.md). São do cliente e não mudam o resultado da partida.

## 3. Exemplo

O mesmo nome e o mesmo valor nos dois arquivos, com a unidade no comentário:

```python
# backend/app/game/rules.py
TICK_RATE = 30            # Hz
PLAYER_SPEED = 3.6        # cél/s
PLAYER_SPRINT_MULT = 2.0
```

```ts
// frontend/game/src/rules.ts
export const TICK_RATE = 30;            // Hz
export const PLAYER_SPEED = 3.6;        // cél/s
export const PLAYER_SPRINT_MULT = 2.0;
```

Uso, igual nos dois lados: `x += dir_x * PLAYER_SPEED * dt`. Com `dt = 1/30`, um Tick andando move `0.12` célula (`0.24` correndo), e 30 Ticks movem `3.6` células.

## 4. Decisões

- **Tudo é por segundo.** O C movia o Player por quadro, e a velocidade mudava com a taxa do monitor (arq. §3). Aqui todo deslocamento é valor × `dt`.
- **Mesmos nomes nos dois arquivos.** A Prediction só bate com o servidor se `applyInput.ts` e `sim.py` usarem os mesmos números. PR que mexe em `rules.py` sem `rules.ts` e sem este arquivo volta.
- **Enemy e Boss andam de forma contínua.** No C eles davam um passo a cada 0,1 s; aqui a velocidade equivalente é aplicada a cada Tick, e a Interpolation fica suave.
- **Projectile avança em subpassos de no máximo `0.1` célula.** O C testava parede e alvo só no ponto de chegada de cada salto de 0,5 célula.
- **Não existe fogo amigo.** `FIREBALL_PLAYER_DAMAGE` só é lido pelo `PvpRuleset`.
- **O teto da poção é `options.start_hp`**, não o `10` fixo do C.
- **O Enemy golpeia a cada `ENEMY_ATTACK_INTERVAL_S` e só acerta quem ainda está em `ENEMY_ATTACK_RANGE`.** No C o primeiro golpe saía em 0,8 s e os seguintes em 1,4 s (o contador começava em 3 e voltava para 0), e o dano entrava sem conferir a distância de novo. A arq. §6.3 e o roadmap (R3) já falam em "1 HP a cada 1,4 s de contato"; um intervalo só e o alcance conferido no golpe são essa regra.
- **Uma fireball mata um Enemy.** O C não tem HP de Enemy (`update_fireball_bonus.c:43-45`). Se o balanceamento pedir Enemy mais resistente, entra um `ENEMY_HP`.
- **As velocidades da tabela são as nominais.** No C, o passo de Enemy e Boss saía quando o atraso passava de 0,1 s e o excedente era descartado; a 60 fps isso dava um passo a cada 6 ou 7 quadros, até 14% mais lento que o nominal. A diferença era efeito do jeito de contar o tempo, não intenção, e fica para o balanceamento (F4.7).
- **`BODY_BLOCK_DISTANCE` usa `<` para todos.** O C usava `<=` para Enemy e `<` para Boss. Só bloqueia quem está vivo: Enemy em `dying` não bloqueia (o C já fazia assim), e Player morto também não (arq. §5).
- **Mana é fracionária na Room e inteira no fio.** `MANA_REGEN_PER_S` a 30 Hz soma frações por Tick. A Room guarda o valor exato, o Snapshot manda o arredondamento para baixo, e a fireball exige Mana exata `>= FIREBALL_MANA_COST`.
- **Os números do netcode** (Snapshot a cada 2 Ticks, Interpolation, Reconciliation, Grace period) ficam em [ws-messages.md](ws-messages.md) §2.8, porque não são regra de jogo. Daqueles números, só o `TICK_RATE` entra aqui, porque a Prediction usa o mesmo `dt` do servidor.
- **Este contrato fecha nomes e unidades agora.** Os valores finais saem do balanceamento do Rafael (F4.7, S5).

## 5. Em aberto

1. **Velocidade do Player, velocidade do projétil e comportamento do Boss se decidem jogando.** *Roberto e Rafael, no primeiro teste com o Boss em rede (S3, até o C3 de 18/10).* Até lá, valem os pontos de partida da tabela, e cada um muda trocando só números:
   - **Player.** `3.6` e `1.8` são o C rodando a 60 fps, o vsync padrão da MLX42 (`MLX42/src/mlx_init.c:111`) num monitor de 60 Hz. Não é preciso medir o fps do Cub3D: o número sai do teste.
   - **Projectile.** O `move_delay` do projétil no C nunca volta a zero (só é somado e comparado), então depois dos primeiros 0,2 s ele salta 0,5 célula a cada quadro: cerca de 30 cél/s a 60 fps. Os `2.5` da arq. são mais lentos que o Player (3,6; 7,2 correndo), que ultrapassaria a própria fireball. O ponto de partida é `12`, acima do sprint e ainda desviável no `pvp`.
   - **Boss.** Depois de atirar, o C faz `attack_delay = 1` (`init_boss_bonus.c:51`) e testa `attack_delay > 1.0`, que passa no quadro seguinte. Por isso o intervalo real entre bullets é de cerca de 1,2 s, e a até 18 células o Boss não anda: os limites `> 8` e `<= 16` não têm efeito. O port implementa a regra que o C pretendia: anda até `BOSS_MIN_RANGE`, atira a até `BOSS_ATTACK_RANGE`, um bullet a cada `BOSS_ATTACK_COOLDOWN_S`. O comportamento real do C é a mesma regra com `BOSS_MIN_RANGE = 18` e `BOSS_ATTACK_COOLDOWN_S = 1.2`, então testar os dois é trocar dois números. O Boss em `idle` leva dano e acorda ao ser atingido; no C ele era invulnerável até ver alguém (`update_fireball_bonus.c:24`).
2. **Mais tarde, com resposta neste arquivo:** a diagonal continua 1,41 vez mais rápida? (R2) No `pvp`, o que é um Spawn livre e há proteção depois do respawn? (R6)
