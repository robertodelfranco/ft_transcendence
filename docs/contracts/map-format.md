# Contrato: arquivo de Map (`map-format.md`)

**Estado:** rascunho para a reunião de 04/10. **Escreve:** Roberto. **Assina:** Rafael (escreve os Maps em F4.1 e F4.4 e monta a cena a partir do Grid).

## 1. Para que serve

O time escreve os Maps; o carregador da Simulation (F1.1) os lê no servidor, e o Grid inicial da Room chega ao cliente em `welcome.map.grid` ([ws-messages.md](ws-messages.md)). Este arquivo diz o que pode haver num Map, o que cada caractere significa para o servidor e para o cliente, e o que o teste dos mapas reprova.

## 2. Formas

### 2.1 O arquivo

- **Onde:** `backend/maps/coop/` e `backend/maps/pvp/`. A pasta define o Mode (arq. §14).
- **Nome:** `<nome>.txt`, com `<nome>` em `[a-z0-9_]+`. O `<nome>` é o valor de `options.map`.
- **Conteúdo:** só a grade, uma linha do arquivo por linha do Grid. Sem cabeçalho: texturas, cores, sprites e luz são do Theme ([mount-game.md](mount-game.md)).
- **Texto:** ASCII, quebra de linha LF. As linhas podem ter tamanhos diferentes. Não pode haver tab nem linha vazia no meio da grade.
- **Coordenadas:** `x` é a coluna e `y` é a linha, a partir de `0` no canto superior esquerdo. O centro da célula `(x, y)` é `(x + 0.5, y + 0.5)`, como no C (`init_player_bonus.c:81-82`). Norte é a linha de cima.

### 2.2 Caracteres

| Caractere | O que é | No servidor | No `welcome.map.grid` (cliente) |
|---|---|---|---|
| `1` | Parede | Bloqueia Player, Enemy, Boss e Projectile | `1`: caixa com a textura de parede do Theme |
| `0` | Chão | Livre | `0`: chão e teto do Theme |
| espaço | Fora do Map | Sólido, como parede; nunca alcançável | Espaço: nada desenhado |
| `N` `S` `E` `W` | Spawn, com orientação `(0,-1)`, `(0,1)`, `(1,0)`, `(-1,0)` | Onde um Player nasce | `0` |
| `D` | Door. Toda Door nasce fechada e trancada (`create_door`, `door_bonus.c:90`) | Fechada bloqueia como parede; aberta (`O`) é livre e não fecha mais | `D`, e `O` depois de aberta (`grid_delta`) |
| `K` | Pickup de chave | +1 chave a quem pisa | `K` até ser coletado; depois `0` |
| `P` | Pickup de poção | +`POTION_HEAL` HP, até `start_hp` | `P`, depois `0` |
| `M` | Pickup de Mana | +`MANA_PICKUP` | `M`, depois `0` |
| `A` | Pickup de Armor | +`ARMOR_POINTS` | `A`, depois `0` |
| `I` | Enemy (só `coop`, no máximo 20) | Posição inicial de um Enemy | `0`: o Enemy vem no Snapshot |
| `B` | Boss (só `coop`) | Posição inicial do Boss | `0`: o Boss vem no Snapshot |
| `T` | Tocha | Livre, como `0` | `T`: luz do Theme nessa célula |

`O` não aparece no arquivo: só existe durante a partida. Poção, Mana e Armor só são coletados por quem ainda pode usar; com HP, Mana ou Armor no teto, o Pickup fica no chão ([rules.md](rules.md) §4). Pickup de poção, Mana ou Armor desligado em `options.pickups` vira `0` quando a Room é criada; chave não se desliga, porque as Doors dependem dela.

### 2.3 O que o carregador entrega

O consumidor de fora da Simulation é o `welcome.map.grid`. Para referência, o `Map` em memória tem:

| Campo | Conteúdo |
|---|---|
| `name`, `mode` | O nome do arquivo e a pasta |
| `grid` | Lista de strings, **retangular**: as linhas curtas são completadas com espaço até a mais larga. Spawn, `I` e `B` já viram `0` |
| `spawns` | `(x, y, dx, dy)` no centro da célula, em ordem de leitura (linha a linha, da esquerda para a direita) |
| `enemies`, `boss` | Centro de cada `I`; centro do `B`, ou nada |
| `doors` | Célula de cada `D` |

O `Map` é imutável e compartilhado entre Rooms; cada Room copia o `grid` e o modifica. O enésimo Player a entrar na Room nasce no enésimo Spawn; o respawn do `pvp` segue o `PvpRuleset`.

### 2.4 O que o teste dos mapas reprova

Um teste percorre `backend/maps/coop/` e `backend/maps/pvp/`; mapa reprovado reprova o PR.

Da arq. §6.1:

1. Caractere fora da tabela de §2.2.
2. Borda aberta: célula que não é `1` nem espaço com algum dos 4 vizinhos fora do Map ou igual a espaço. É a mesma regra do C (`check_valid_zero`, `parser_map_bonus.c:65-80`).
3. Spawns de menos: no `coop`, menos de 5; no `pvp`, menos de 2.
4. No `coop`, número de `B` diferente de 1.

Além da arq. (propostos neste rascunho, cada um com o motivo em Decisões):

5. Tab, outro caractere de controle ou linha vazia no meio da grade. O C também reprovava (`EXIT_CHAR_CONTROL`, `maps/invalid/map_split.cub`).
6. `O` no arquivo.
7. `I` ou `B` num Map de `pvp`.
8. Door que não está entre duas paredes opostas: ou `1` a oeste e a leste, ou `1` ao norte e ao sul, e não os dois pares.
9. Menos `K` que `D`.
10. Mais de 20 `I`.
11. Quina diagonal: um bloco de 2 × 2 células com sólidos (`1`, espaço ou `D`) numa diagonal e células livres na outra.

Como os mapas do Cub3D se saem nesse teste, sem o cabeçalho:

| Map | Spawns | `I` | `D` / `K` | Reprova em |
|---|---|---|---|---|
| `dungeon_map` | 1 | 4 | 3 / 4 | 3 (precisa de mais 4 Spawns) |
| `enemy` | 1 | 26 | 3 / 3 | 3; 8 (a Door em `(20, 20)` fica numa parede diagonal); 10; 11 em 8 lugares |
| `enemy_sewer` | 1 | 26 | 0 / 0 | 3; 10; 11 em 8 lugares |
| `map` | 1 | 36 | 10 / 10 | 3; 10 |
| `subject` | 1 | 6 | 5 / 5 | 3 |
| `mandatory` | 1 | 0 | 0 / 0 | 3 e 4 (é o mapa da parte obrigatória, sem Boss) |

Para os três mapas de `coop` de F4.1 passarem, o Rafael acrescenta 4 Spawns em cada um, tira 6 Enemies do `enemy` e do `enemy_sewer`, engrossa as paredes diagonais desses dois e põe a Door de `(20, 20)` do `enemy` numa parede reta.

## 3. Exemplo

Um Map de `coop` mínimo que passa no teste, com todos os caracteres:

```text
1111111111111
1N0S0E0W0N0T1
1K000000000M1
111111D111111
1000I000I00A1
10000000000P1
1T000B000I001
1111111111111
```

O carregador entrega 5 Spawns, de `(1.5, 1.5)` olhando para `(0, -1)` até `(9.5, 1.5)` olhando para `(0, -1)`; 3 Enemies em `(4.5, 4.5)`, `(8.5, 4.5)` e `(9.5, 6.5)`; o Boss em `(5.5, 6.5)`; uma Door em `(6, 3)`, entre paredes a oeste e a leste. A chave fica antes da Door. O `grid` entregue troca `N S E W I B` por `0`:

```text
1111111111111
10000000000T1
1K000000000M1
111111D111111
10000000000A1
10000000000P1
1T00000000001
1111111111111
```

O Map de 47 × 40 do [snapshot.example.json](snapshot.example.json), derivado do `map.cub` com 5 Spawns, 20 Enemies e `M`, `A`, `T`, também passa em todas as checagens acima.

## 4. Decisões

- **O Map é só a grade, sem parser com códigos de erro, com vários `N/S/E/W`.** Já decidido para todos os contratos ([README](README.md#o-que-já-está-decidido)) e na arq. §4, decisão 8.
- **Extensão `.txt`.** Sem o cabeçalho, o arquivo não é mais um `.cub`: o parser do Cub3D o recusaria.
- **Espaço é sólido para o servidor.** O C só bloqueava `1` e `D` e confiava no mapa fechado. A 30 Hz o passo correndo é de 0,24 célula, e numa diagonal ele anda mais de 0,1 em cada eixo, mais que a caixa do Player (`2 × 0.05`). Assim a caixa passa pelo vértice entre duas paredes em diagonal sem tocar nenhuma. No `enemy.cub`, 13 células livres encostam em espaço na diagonal.
- **O Grid entregue é retangular.** As linhas dos mapas têm tamanhos diferentes (no `enemy.cub`, de 11 a 55), e completar com espaço tira a checagem de limite de linha de todo acesso ao Grid, no Python e no TypeScript.
- **Spawn, `I` e `B` viram `0` no Grid.** Players, Enemies e Boss chegam no Snapshot; o cliente nunca precisa interpretar esses caracteres.
- **Door entre duas paredes opostas** (checagem 8). É o que diz ao Rafael para que lado a porta desliza. Todas as Doors dos mapas do Cub3D seguem a regra, menos uma no `enemy.cub`.
- **Pelo menos tantas chaves quanto Doors** (checagem 9). Toda Door nasce trancada, então isso garante que existe chave para todas. Não garante a ordem: uma chave atrás da própria Door continua possível, e é revisão de quem escreve o Map.
- **`I` e `B` reprovam um Map de `pvp`** (checagem 7). O `PvpRuleset` ignoraria os dois, e quem escreve o Map acharia que há Enemies onde não há.
- **No máximo 20 Enemies por Map, e não existe `enemy_density`** (checagem 10; perguntas 3 e 4). Vinte é a carga da meta de performance (arq. §6.2 e §8.2), e o número de Enemies passa a ser escolha de quem escreve o Map. O `double` saiu das opções: era o segundo corte previsto no roadmap para o atraso. Decidido pelo Roberto em 02/10; o número pode baixar depois de jogar.
- **Quina diagonal reprova o Map** (checagem 11). Pelo mesmo motivo do espaço sólido, o Player correndo passaria pelo vértice de uma célula livre para a outra; no `enemy.cub`, isso atravessa a Door trancada de `(20, 20)`. Corrigir no Map custa ao Rafael engrossar algumas paredes; corrigir na Simulation exigiria dividir o passo do Player em subpassos, em `sim.py` e em `applyInput.ts`. Decidido pelo Roberto em 02/10.

## 5. Em aberto

1. **O que um Map de `pvp` pode ter?** *Rafael, em F4.4.* Doors e chaves fazem sentido num 1v1? Quais Pickups? Quantos Spawns? O respawn "no Spawn livre mais longe do adversário" só funciona com mais de 2; sugestão: pelo menos 4.
