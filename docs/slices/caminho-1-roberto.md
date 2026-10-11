# Caminho 1 — Simulation e Prediction · Roberto

> Escopo da Slice 1, de ponta a ponta: o que é meu, o que eu faço sozinho, de quem eu dependo, o que os outros esperam de mim e o que eu explico na defesa. A alocação está no [plano §9](../catacombs42-plano-de-tarefas.md#9-divisão-entre-as-5-pessoas); as estimativas e os "pronto quando" vêm do [plano §5](../catacombs42-plano-de-tarefas.md#5-tarefas-por-frente), ajustados só onde uma decisão de contrato mudou a regra. Vocabulário: [CONTEXT.md](../../CONTEXT.md).
>
> Papel no time: **Tech Lead**. Contratos que eu escrevo: [ws-messages.md](../contracts/ws-messages.md) com o [snapshot.example.json](../contracts/snapshot.example.json), [map-format.md](../contracts/map-format.md) e os nomes e unidades de [rules.md](../contracts/rules.md). O detalhe de execução (passos, listas de teste, armadilhas do C) está no [roadmap](../roadmap-roberto.md); este arquivo é o resumo para o time.

## 1. Inventário

**17,5 d de tarefa**, mais os contratos da S1 (já escritos) e o papel de Tech Lead. Datas pelo calendário de [replanejamento-e-board.md](../pm/replanejamento-e-board.md).

### F1 — Simulation (13,5 d)

| ID | Tarefa | d | Depende de | Sem. | Pronto quando |
|---|---|---|---|---|---|
| F1.1 | Carregador de Map: lê a grade e devolve Grid, Spawns e posições das entidades | 1 | F0.2 | S1 | um teste percorre `backend/maps/coop/` e `backend/maps/pvp/` e reprova mapa em qualquer das 11 checagens de [map-format.md](../contracts/map-format.md) §2.4 |
| F1.2 | `state.py` (dataclasses da Room) e `rules.py` com todas as constantes e unidades | 1 | F0.2 | S1 | `rules.py` bate com [rules.md](../contracts/rules.md) nome por nome |
| F1.3 | Movimento por `dt`: andar, sprint, giro por tecla e por `mouse_dx`, colisão com parede, Door e corpos | 2 | F1.2 | S1 | 1 s andando = 3,6 células, também na diagonal; o Player desliza na parede; parede e Player bloqueiam |
| F1.4 | Portas, chaves e Pickups de poção, Mana e Armor | 1,5 | F1.3 | S2 | Door trancada consome a chave de quem apertou e não fecha mais; Pickup some do Grid; Pickup que não serve fica no chão |
| F1.5 | Enemies, Boss, projéteis com subpasso, dano, Armor, Mana e cooldown | 3 | F1.4 | S2 | um teste por regra de [rules.md](../contracts/rules.md) e da arq. §5 |
| F1.6 | `Ruleset` e `CoopRuleset`; `game_over` uma vez; 5 Players; teste de performance | 1 | F1.5 | S2 | 1000 Ticks com 5 Players, 20 Enemies, Boss e 10 projéteis em menos de 200 ms |
| F1.7 | CLI que roda N Ticks e grava `snapshot.json` | 0,5 | F1.6 | S2 | o JSON abre no `dev.html` do Rafael sem adaptação |
| F1.8 | `PvpRuleset`: 1v1, fireball fere Player, respawn, `frag_limit` e `time_limit_s` | 2 | F1.6 | S3 | a partida de PvP termina pelas duas condições nos testes |
| F1.9 | `RoomOptions` aplicadas na Simulation, com defaults | 1,5 | F1.8 | S3 | sem opções, o jogo roda com os defaults; cada opção tem teste |

### F2 e F3 — o que é meu no cliente (4 d)

| ID | Tarefa | d | Depende de | Sem. | Pronto quando |
|---|---|---|---|---|---|
| F2.7 | `rules.ts`, `applyInput.ts`, teste cruzado Python × TypeScript, laço de passo fixo, Prediction e Reconciliation | 2,5 | F1.3, F2.6 | S2–S3 | o `console.assert` de reconciliação não dispara em 5 min com 100 ms de latência e 2% de perda |
| F3.6 | Minimapa em canvas 2D sobreposto | 1 | F3.2 | S4 | mostra células, Players e cone de visão, na mesma orientação da cena |
| F2.13 | Teste de carga: 4 Rooms com 5 Players cada | 0,5 | F2.6 | S5 | p99 do Tick abaixo de 5 ms, com os números no PR |

### F0 e F9

F0.2 (contratos) está escrito. De F0.5 (ADRs), o 001 e o 003 existem; o 002, dos tokens, o Augusto escreveu ([002-tokens.md](../adr/002-tokens.md), status "proposto"). F9.1 (minha parte do README) na S5; F9.2 (ensaio) na S6.

## 2. O que eu faço sozinho

A Simulation é Python puro: não importa FastAPI, banco nem rede. Por isso quase tudo de F1 começa hoje.

| Tarefa | Por que é solo |
|---|---|
| Preparação: `backend/app/game/`, `backend/tests/game/` e `pytest` local | só precisa do combinado com o Augusto sobre a pasta (§3) |
| **F1.2** estado e constantes | sai direto de [rules.md](../contracts/rules.md) e da arq. §5 |
| **F1.1** carregador de Map | os testes usam mapas pequenos em `backend/tests/fixtures/maps/`; os mapas do Rafael passam pelo mesmo teste quando chegarem |
| **Esqueleto da porta da Simulation** | as funções que o Augusto chama, com a assinatura final e só movimento por dentro (§4) |
| **F1.3 a F1.6** movimento, entidades, `CoopRuleset` | cada regra do C vira um teste; nada espera rede |
| **F1.7** CLI | grava no formato de [snapshot.example.json](../contracts/snapshot.example.json) |
| **F1.8 e F1.9** PvP e opções | os testes usam mapas de fixture; [room-options.md](../contracts/room-options.md) já existe |
| **F2.7, primeira parte**: `rules.ts`, `applyInput.ts`, teste cruzado, laço de passo fixo | testável com `vitest` e um socket falso; só precisa do projeto TypeScript (§3) |
| **F2.13, parte da Simulation** | medir `step` com 4 Rooms cheias não precisa de WebSocket |
| Revisão do ADR 002, revisão de PRs, pendências de contrato | papel de Tech Lead (§8) |

## 3. De quem eu dependo

| Preciso de | De quem | Para quê | Até |
|---|---|---|---|
| Combinar que `backend/app/game/` e `backend/tests/game/` nascem comigo, antes do F0.3 | Augusto | não criarmos a mesma pasta em dois PRs | 07/10 |
| Passo de `pytest` no CI (F8.2) | Akita | o "teste do carregador de Map verde" do C1 aparecer no PR | 09/10 |
| Mapas de `coop` no formato novo (F4.1) | Rafael | o teste das pastas reais valer, e existir mapa para jogar | 10/10 |
| Projeto TypeScript em `frontend/game/` com `vitest` (F0.4) | Caio | `applyInput.ts` e o teste cruzado. Sem ele até a data, eu monto o mínimo e aviso | 11/10 |
| Interface do laço de passo fixo fechada | Augusto | ele escreve o socket (F2.5) chamando o meu módulo, em vez de enviar Input por quadro | 11/10 |
| **F2.5**: socket do cliente e `net/` | Augusto | ligar o laço de passo fixo num cliente de verdade | 16/10 |
| Regra de Spawn livre e de proteção no respawn | Rafael | `PvpRuleset` (F1.8) | início da S3 |
| **F2.6**: N Players pelo socket | Augusto | o aceite da Reconciliation (F2.7) e o teste de carga (F2.13) | S3 |
| Sessão de jogo para decidir velocidade do Player, do projétil e o Boss | Rafael | fechar os valores marcados como ponto de partida em [rules.md](../contracts/rules.md) | 23/10 |
| **F3.2**: `Renderer` e `ViewState` em código | Rafael | minimapa (F3.6) | S4 |
| Teto de tochas por Map | Rafael | entra como checagem no teste dos mapas | quando ele medir |

## 4. O que os outros esperam de mim

É a régua de prioridade quando faltar tempo.

| Quem | O que espera | Para quê | Até |
|---|---|---|---|
| Augusto | **Esqueleto da porta da Simulation**: criar a Room, enfileirar Input e Action, marcar conectado, `step`, montar o Snapshot | Room runtime e WebSocket (F2.3, F2.4) começam sem esperar as regras | 10/10 |
| Rafael | **Teste dos mapas** rodando | validar os mapas de F4.1 antes do PR | 09/10 |
| Augusto | Módulo do laço de passo fixo | o envio de Input de F2.5 e o C2 | 16/10 |
| Rafael | **CLI** gravando `snapshot.json` (F1.7) | cena com Snapshot real (F3.3) | 17/10 |
| Augusto | `CoopRuleset` completo e o resultado da partida montado pela Simulation | N Players (F2.6) e o fim de partida (F2.9) | 17/10 |
| Akita | Os contadores do `MatchResult` saindo de uma partida real | `record_match_result` (F5.3); até lá ele testa com os JSON de [rooms.md](../contracts/rooms.md) §3 | S3 |
| Rafael | `PvpRuleset` (F1.8) | mapas de PvP jogáveis (F4.4) | S3 |
| Akita e Caio | `RoomOptions` lidas pela Simulation (F1.9) | opções no lobby mudarem o jogo (F5.2, F7.7) | S3 |
| Augusto | Prediction e Reconciliation prontas (F2.7) | reconexão (F2.10) | S3 |
| Todos | Revisão de PR que mexe em `rules.*`, `sim.py`, auth ou migrações, em até 24 h | ninguém parado esperando o Tech Lead | sempre |
| Augusto, Akita, Rafael, Caio | As pendências entre Slices fechadas (§5) | cada um implementar a mesma interface | 11/10 |

## 5. Decisões a travar antes de escrever código

Decidida depois do código, cada uma custa retrabalho em mais de uma Slice.

**Já decididas e escritas nos contratos.** Confiro esta lista antes de abrir qualquer PR:

1. **O Augusto só chama funções da Simulation**; nunca lê nem escreve campo da Room. Eu mudo a Room por dentro sem quebrar o código dele.
2. **A Room da Simulation nasce no `start`**, a partir da lista de Players do Lobby. Estado de Lobby é do `RoomManager`.
3. **Input em fila, um por Tick, nunca repetido**; fila vazia deixa o Player parado ([ws-messages.md](../contracts/ws-messages.md) §2.9).
4. **Movimento**: as teclas viram um vetor de intenção normalizado; o passo é tentado em `x` e depois em `y`. O Player desliza, e a diagonal não é mais rápida.
5. **A direção é guardada como ângulo**; no fio vai `(dx, dy)`.
6. **Door aberta não fecha.**
7. **Depois do `game_over` o mundo congela**; só os tempos de animação andam.
8. **Quem saiu no meio continua contando** para o `MatchResult`.
9. **Os casos do teste cruzado ficam num JSON versionado**, gerado pelo Python, com um teste que acusa arquivo desatualizado.
10. **O laço de passo fixo do cliente é meu**, mesmo morando na pasta `net/`.

**Ainda abertas, com dono e data:**

| # | Questão | Com quem | Até |
|---|---|---|---|
| 1 | Assinaturas exatas da porta da Simulation (proposta no [roadmap §5](../roadmap-roberto.md#5-a-porta-da-simulation)) | Augusto | 09/10 |
| 2 | Interface do laço de passo fixo (proposta no roadmap, R5) | Augusto | 11/10 |
| 3 | Quem escreve `rules.ts`. O plano dá `rules.*` ao Rafael (F4.2) e o espelho do movimento a mim. Proposta: eu escrevo a primeira versão dos dois, com o teste de divergência; ele muda valores por PR | Rafael | 11/10 |
| 4 | Onde mora a definição de `RoomOptions` em Python: uma só, que a API valida e a Simulation lê | Akita e Rafael | 16/10 |
| 5 | Código de fechamento para segundo socket do mesmo User e para `join` numa Room ainda no Lobby | Augusto e Akita | 11/10 |
| 6 | Spawn livre e proteção depois do respawn no PvP | Rafael | início da S3 |
| 7 | O cliente prevê `fire` e `door`, ou só o movimento? Proposta: só o movimento | Augusto | S3 |

## 6. Ordem de execução

É a ordem do plano, no calendário replanejado.

| Semana | O que eu entrego |
|---|---|
| **S1** · até 10/10 | preparação · **F1.2** estado e constantes · **F1.1** carregador de Map · esqueleto da porta · **F1.3** movimento |
| **S2** · 11–17/10 | **F1.4** portas e Pickups · **F1.5** entidades · **F1.6** `CoopRuleset` · **F1.7** CLI · **F2.7** primeira parte (`applyInput.ts`, teste cruzado, laço de passo fixo) · par com o Augusto nas primeiras horas de F2.3 |
| **S3** · 18–24/10 | **F1.8** PvP · **F1.9** opções · **F2.7** segunda parte (Reconciliation ligada no cliente) · sessão de jogo com o Rafael |
| **S4** · 25–31/10 | **F3.6** minimapa · par com o Augusto na reconexão (F2.10) |
| **S5** · 01–14/11 | **F2.13** teste de carga · F9.1 · folga para bug e revisão |
| **S6** · 15–21/11 | bug, README fechado, ensaio |

**A conta não fecha até o C3, e eu sei disso.** Com 4 dias de tarefa e 1 de Tech Lead por semana, tenho 11 dias até 23/10; o plano pede 17,5 nesse período (toda a Simulation, PvP, opções e Prediction). No total cabe: 23 dias disponíveis até o freeze contra 19 pedidos. O que escorrega primeiro, nesta ordem: a segunda parte de F2.7 vai para a S4; F1.9 vai para a S4; o fim de F1.8 vai para o começo da S5. Aviso na reunião de segunda assim que uma dessas se confirmar, porque cada uma atrasa alguém do §4.

**Prioridade quando o tempo apertar:** Simulation de coop completa, depois Prediction, depois PvP, depois opções, depois minimapa e teste de carga.

**Ordem de corte dentro da Slice:** o minimapa volta ao Rafael (o plano §9 já prevê); a correção suave da Reconciliation vira teleporte; o teste de carga vira uma medição manual anotada no PR. O PvP não entra na lista: é ele que sustenta o "jogar um contra o outro" do módulo de jogo. Se apertar no PvP, o corte é por dentro (um mapa só, sem Pickups).

## 7. O que eu explico na defesa

| Módulo | O que eu abro e explico |
|---|---|
| **Web-based game** (Major) | a Simulation: `step`, a ordem fixa dentro de um Tick, por que tudo é velocidade × `dt`; o que veio do C e o que mudou (mundo espelhado, três bugs não portados, projétil e Boss que não faziam o que o código parecia dizer) |
| **Remote players** (Major, parte minha) | Prediction e Reconciliation com `prediction.ts` aberto; a fila de Inputs; o teste cruzado que prova que Python e TypeScript calculam igual |
| **Multiplayer 3+** (Major, parte minha) | o que muda com N Players: alvo do Enemy, rodízio do Boss, colisão entre Players, quem saiu no meio |
| **Game customization** (Minor, parte minha) | como cada opção chega à Simulation e o teste de cada uma |
| **Obrigatórios** | o servidor decide acerto, dano, coleta e vitória; nenhum estado de partida em andamento vai para o banco |

Respostas que eu preciso ter na ponta da língua: **por que `dt` e não quadro**; **por que o servidor decide o acerto** (projétil, não hitscan); **como o cliente corrige quando o servidor discorda**; **como eu garanto que os dois lados calculam igual**; **cadê o parser do Cub3D**.

A "modificação rápida" que podem pedir (subject, cap. VII): mudar o dano da fireball (`rules.py`, `rules.ts`, `rules.md`); acrescentar um campo ao Snapshot (`snapshot.py`, `types.ts`, `ws-messages.md`); mudar o `frag_limit` default; acrescentar uma checagem ao teste dos mapas. Ensaiar as quatro na S6.

## 8. O papel de Tech Lead é escopo, não bônus

Tem tempo próprio (1 dia por semana) e é cobrado na defesa.

- **Contratos do jogo:** sou dono de `ws-messages.md`, `map-format.md` e dos nomes de `rules.md`. Contrato só muda no mesmo PR que muda o código, com aviso a quem assina.
- **Revisão:** todo PR que mexe em `rules.*`, `sim.py` ou `applyInput.ts` passa por mim; reviso também auth e migrações. Meta de 24 h.
- **Os meus PRs:** peço revisão a todos e espero o ok do Augusto (quando muda a porta da Simulation) ou do Rafael (quando muda `rules.*`). Como ninguém conhece o C, a revisão confere a lista de testes do roadmap: cada regra tem teste?
- **Par:** primeiras horas de F2.3 (Room runtime) na S2 e de F2.10 (reconexão) na S4, com o Augusto.
- **Pendências entre Slices:** a tabela do §5 viva, cada linha com dono e data.
- **`CONTEXT.md`:** termo novo, ou termo usado errado em PR, eu corrijo ali e cito na revisão.
- **Regra de estouro:** tarefa passando 50% da estimativa vira assunto da reunião de segunda.

## 9. Issues prontas, até a S2

No formato de [replanejamento-e-board.md](../pm/replanejamento-e-board.md) §3. Uma issue por ID do plano; os passos de meio dia a um dia de cada uma estão no roadmap, e cada passo pode virar um PR pequeno. Labels comuns a todas: `slice-1`.

### F1.2 · Estado, constantes e porta da Simulation

Labels: `F1`, `S1`, `bloqueante`, `contrato`

- **Contexto:** é o lugar único do estado de uma Room e dos números do jogo. Publica também o esqueleto das funções que o Augusto chama, para a Room runtime começar antes das regras.
- **Pronto quando:** `rules.py` bate com `rules.md` nome por nome; as funções da porta existem com a assinatura combinada; o Snapshot gerado tem os mesmos campos de `snapshot.example.json`; a fila de Inputs segue `ws-messages.md` §2.9.
- **Contrato:** `docs/contracts/rules.md`; `docs/contracts/ws-messages.md` §2.4 e §2.9
- **Dependências:** nenhuma
- **Onde olhar:** arq. §5 e §6.1; roadmap R1 (passos R1.0, R1.1, R1.2 e R1.4)

### F1.1 · Carregador de Map e teste dos mapas

Labels: `F1`, `S1`, `bloqueante`

- **Contexto:** transforma um arquivo de grade no `Map` em memória e garante que mapa quebrado reprova o PR. Destrava os mapas do Rafael (F4.1) e é a linha do C1 que é minha.
- **Pronto quando:** um teste percorre `backend/maps/coop/` e `backend/maps/pvp/` e reprova mapa em qualquer das 11 checagens; um Spawn `N` produz direção `(0, -1)`.
- **Contrato:** `docs/contracts/map-format.md`
- **Dependências:** F1.2
- **Onde olhar:** `parser_bonus/parser_map_bonus.c` e `player_bonus/init_player_bonus.c` do Cub3D; roadmap R1 (passo R1.3)

### F1.3 · Movimento por dt, com deslize

Labels: `F1`, `S1`, `bloqueante`

- **Contexto:** a função que aplica um Input a um Player durante um `dt`. É ela que ganha uma gêmea em TypeScript na F2.7, então a forma dela é contrato.
- **Pronto quando:** 1 s andando = 3,6 células, também na diagonal; correndo, 7,2; o Player desliza na parede; parede, Door fechada e corpos bloqueiam; `mouse_dx` acima do limite é cortado; os dois testes do espelho passam.
- **Contrato:** `docs/contracts/ws-messages.md` §2.2 e §2.9; `docs/contracts/rules.md` §2.2
- **Dependências:** F1.2, F1.1
- **Onde olhar:** `player_bonus/movement_bonus.c` e `move_utils_bonus.c`; Glenn Fiedler, *Fix Your Timestep!*; roadmap R2

### F1.4 · Portas, chaves e Pickups

Labels: `F1`, `S2`

- **Contexto:** a primeira regra em que um Player muda o Grid que os outros veem.
- **Pronto quando:** Door trancada consome uma chave de quem apertou e não fecha mais; o Pickup some do Grid e entra no `grid_delta`; poção, Mana e Armor que não servem ficam no chão.
- **Contrato:** `docs/contracts/ws-messages.md` §2.4 e §2.6; `docs/contracts/rules.md` §4
- **Dependências:** F1.3
- **Onde olhar:** `door_bonus/door_bonus.c` e `game_bonus/handle_utils_bonus.c`; roadmap R3 (passos R3.1 e R3.2)

### F1.5 · Enemies, Boss, projéteis, dano, Armor e Mana

Labels: `F1`, `S2`, `bloqueante`

- **Contexto:** o combate para N Players. É a maior tarefa da Slice; sai em cinco PRs, um por passo.
- **Pronto quando:** há um teste por regra: perseguição do Player vivo mais próximo, troca de alvo só com 1 célula de vantagem, golpe a cada 1,4 s só em quem está no alcance, morte em 1,5 s, Boss com 6 acertos, bullet tira 2, fireball some na parede, Armor absorve antes do HP, custo e regeneração de Mana.
- **Contrato:** `docs/contracts/rules.md`; `docs/contracts/ws-messages.md` §2.5 e §2.6
- **Dependências:** F1.4
- **Onde olhar:** `enemy_bonus/enemy_move_bonus.c` e `enemy_manage_bonus.c`, `boss_bonus/*`, `attack_bonus/create_*` e `update_*`; arq. §3 (três bugs para não portar) e §5; roadmap R3 (passos R3.3 a R3.7)

### F1.6 · Ruleset, CoopRuleset e 5 Players

Labels: `F1`, `S2`, `bloqueante`

- **Contexto:** decide quando a partida acaba e o que a Room entrega no fim. É o que o Augusto precisa para N Players (F2.6) e para o fim de partida (F2.9).
- **Pronto quando:** `game_over` sai uma única vez, com `win` quando o Boss entra em `dying`, `loss` quando todos morrem e `loss` por `forfeit` quando todos saem; depois dele só as animações andam; 1000 Ticks com 5 Players, 20 Enemies, Boss e 10 projéteis rodam em menos de 200 ms.
- **Contrato:** `docs/contracts/ws-messages.md` §2.6; `docs/contracts/rooms.md` §2.4
- **Dependências:** F1.5
- **Onde olhar:** arq. §6.1 e §6.2; roadmap R4 (passos R4.1 a R4.3)

### F1.7 · CLI que grava snapshot.json

Labels: `F1`, `S2`

- **Contexto:** dá ao Rafael Snapshots de uma partida de verdade, sem servidor.
- **Pronto quando:** o JSON gravado tem o formato de `snapshot.example.json` e abre no `dev.html` sem adaptação.
- **Contrato:** `docs/contracts/ws-messages.md` §3
- **Dependências:** F1.6
- **Onde olhar:** roadmap R4 (passo R4.4)

### F2.7 · Primeira parte: rules.ts, applyInput.ts, teste cruzado e laço de passo fixo

Labels: `F2`, `S2`, `bloqueante`, `contrato`

- **Contexto:** a gêmea em TypeScript do movimento e o laço que decide quando um Input nasce. Sem os dois iguais ao servidor, a Prediction diverge. A segunda parte (Reconciliation ligada no cliente) fica em outra issue, na S3.
- **Pronto quando:** a mesma sequência de 1000 Inputs dá posições iguais em Python e em TypeScript, dentro da tolerância escolhida, incluindo colisão e deslize; o teste de Python acusa o arquivo de casos desatualizado; o laço gera um Input por 1/30 s acumulado, com `seq` crescente.
- **Contrato:** `docs/contracts/ws-messages.md` §2.2 e §2.9; `docs/contracts/rules.md`
- **Dependências:** F1.3; projeto TypeScript em `frontend/game/` (F0.4)
- **Onde olhar:** Gabriel Gambetta, *Fast-Paced Multiplayer*, partes I e II; arq. §7.2; roadmap R5
