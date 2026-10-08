# Catacombs 42 (ft_transcendence)

Contexto único: um site multiusuário com um dungeon crawler co-op/PvP em tempo real, autenticação, social e histórico de partidas. Este glossário é a linguagem que contratos, código, PRs e a defesa oral usam. Quando duas palavras existem para a mesma coisa, a escolhida está em negrito e as outras em _Evitar_.

## Pessoas e contas

**User**:
Conta cadastrada no site (e-mail + senha ou OAuth). Existe fora de qualquer partida.
_Evitar_: account, conta, jogador (quando o assunto é login/perfil)

**Player**:
A presença de um User dentro de uma Room, identificada pelo id do próprio User: posição, direção, HP, Mana, Armor, chaves, vivo/morto, conectado/desconectado. Um User vira Player ao entrar na Room e deixa de ser ao fim dela; morto, continua sendo Player (no coop, a câmera dele segue um companheiro vivo).
_Evitar_: user (dentro do jogo), boneco, personagem, spectator (não existe: está fora do escopo)

## Partida

**Room**:
A instância de jogo que vive na memória do backend enquanto a partida acontece: Grid, players, enemies, boss, projectiles, doors. Identificada pelo `match_id` do Match que ela vira.
_Evitar_: sala (ok em conversa; no código é room), game, session

**Match**:
O registro persistido de uma partida: quem jogou, quando, resultado, estatísticas por Player. É o que a Room vira quando termina.
_Evitar_: game, partida (em código), history

**MatchResult**:
O resumo que a Room produz ao terminar: resultado, motivo e os números de cada Player. É a única coisa que sai da Room para o banco, e é dele que o Match é gravado.
_Evitar_: result (sozinho), summary, stats (é o agregado por User)

**Achievement**:
Conquista que um User desbloqueia ao fim de um Match (ex.: derrotar o Boss sem morrer). O catálogo vive no código; o desbloqueio fica em `user_achievements`.
_Evitar_: badge, trophy, conquista (no código)

**Lobby**:
O estado de uma Room antes de começar: Players entrando e marcando pronto. Mode, Map e as demais RoomOptions já estão fixados desde a criação.
_Evitar_: waiting room, sala de espera

**RoomOptions**:
As escolhas de customização de uma Room (Map, Theme, HP inicial, Pickups ligados, limites do pvp), fixadas na criação e imutáveis depois. O que não foi escolhido assume o default.
_Evitar_: settings, config, opções (no código)

**Mode**:
A regra de vitória da Room: `coop` (fuga da masmorra, até 5 Players: vitória quando o Boss morre, derrota quando todos morrem, sem respawn) ou `pvp` (1v1 sem inimigos, com respawn: vence quem chegar a `frag_limit` eliminações ou tiver o maior placar em `time_limit_s`). Cada Mode tem seu Ruleset.

**Map**:
Um arquivo de grade escrito pelo time, com os caracteres do `.cub` do Cub3D: paredes, Spawns e as posições de Enemy, Boss, Door e Pickup. Não tem texturas nem cores (isso é do Theme). Imutável.
_Evitar_: level, fase, mapa (no código)

**Theme**:
O visual inteiro de uma partida, escolhido nas RoomOptions (`dungeon`, `sewer`): paredes, chão, teto, sprites de Enemy e Boss, luz. Só existe no cliente; não altera o Grid nem as regras.
_Evitar_: skin, map (Theme não troca o Map)

**Grid**:
A matriz de células de uma Room, copiada do Map e mutável durante a partida (porta abre, Pickup some).
_Evitar_: map (quando é o estado em jogo), matrix, tiles

**Spawn**:
Célula do Grid marcada com N/S/E/W onde um Player nasce, com orientação inicial.

**Kill**:
Um Enemy ou o Boss morto por um Player.
_Evitar_: frag (é Player contra Player)

**Frag**:
Um Player eliminado por outro Player no Mode `pvp`. É o que o placar do pvp conta.
_Evitar_: kill (é contra Enemy ou Boss), eliminação, elimination

## Simulação

**Simulation**:
O módulo que, dado o estado de uma Room, os Inputs pendentes e um dt, produz o próximo estado e os Events. Puro: sem rede, sem banco, sem desenho.
_Evitar_: engine, game loop (é quem chama a Simulation), physics

**Ruleset**:
A parte das regras que muda com o Mode: início, morte, respawn, fim de partida e quais entidades do Map valem. Existem dois: `CoopRuleset` e `PvpRuleset`.
_Evitar_: game mode (é o Mode), rules (é o arquivo de constantes `rules.py`/`rules.ts`)

**Tick**:
Uma execução da Simulation com dt fixo. O contador de ticks é o relógio oficial da Room.
_Evitar_: frame (é coisa de render), step (é o nome da função, não da unidade)

**Snapshot**:
A foto do estado da Room que o servidor envia aos clientes; carrega o tick e, para cada cliente, o último Seq processado.
_Evitar_: state, update, sync

**Input**:
O estado das teclas de movimento de um Player num instante (up/down/left/right/rot_left/rot_right/sprint), numerado por Seq. Contínuo: enviado repetidamente.
_Evitar_: command, keys, controls

**Action**:
Um comando discreto de um Player: `fire` ou `door`. Acontece uma vez por tecla pressionada.
_Evitar_: input (é contínuo), command

**Event**:
Um fato que a Simulation produziu e o servidor anuncia: door_opened, player_hit, enemy_died, game_over. O cliente reage (HUD, som); o módulo de Match persiste o que sobrevive.
_Evitar_: message, notification, log

**Seq**:
Número crescente que o cliente dá a cada Input; volta no Snapshot para o cliente saber até onde o servidor já aplicou. Base da Prediction e da Reconciliation.

**Prediction**:
O cliente aplica o próprio Input localmente antes da confirmação do servidor.

**Reconciliation**:
Ao receber um Snapshot, o cliente reposiciona seu Player na posição oficial e reaplica os Inputs com Seq maior que o confirmado.

**Interpolation**:
O cliente desenha os outros Players e entidades entre os dois últimos Snapshots, ligeiramente no passado, para suavizar.

**Grace period**:
Janela após a queda do socket em que o Player continua existindo na Room, parado, esperando Reconnection.

**Reconnection**:
O mesmo User volta à mesma Room com um socket novo e recebe um Snapshot completo.

## Cliente do jogo

**ViewState**:
Tudo que o render recebe a cada quadro do navegador: o próprio Player já previsto (Prediction), os outros interpolados, entidades, portas e Grid. É a costura entre rede e desenho: o render não sabe que existe rede.
_Evitar_: state, snapshot (Snapshot é o que chega do servidor; ViewState é o que vai para o desenho)

**Renderer**:
O módulo que desenha uma ViewState com Three.js (`init`, `render`, `resize`, `dispose`).
_Evitar_: engine, graphics

**HudState**:
O que o jogo entrega à casca para ela desenhar a HUD: HP, Mana, Armor, chaves, ping, lista de Players, placar e kill feed (os avisos de morte de Player). É a costura entre o jogo e a casca: a casca não lê Snapshot.
_Evitar_: hud data, ViewState (é o que vai para o Renderer)

## Entidades da masmorra

**Enemy**:
Monstro que persegue o Player mais próximo e ataca ao encostar.

**Boss**:
Inimigo único do Map, com HP e projéteis (bullets). Derrotá-lo é a vitória em coop.

**Projectile**:
Fireball (do Player, tem owner) ou bullet (do Boss).

**Door**:
Célula D (fechada) / O (aberta); a primeira abertura de uma porta trancada consome uma chave de quem abriu.

**Pickup**:
Objeto do Grid que some ao ser pisado e dá algo a quem pisou: key, potion, mana ou armor.
_Evitar_: item, power-up (ok ao falar do módulo _Game customization_, que usa esse nome)

**Mana**:
Recurso do Player que a fireball gasta. Regenera com o tempo e com o Pickup de mana.

**Armor**:
Pontos que absorvem dano antes do HP e somem ao zerar. Vêm do Pickup de armor.
_Evitar_: shield, escudo, armadura (no código)

## Backend compartilhado e time

**Slice** (fatia):
O conjunto de Frentes (ou partes delas) de que uma pessoa é dona. No plano, as cinco Slices aparecem como Caminhos 1–5 (§9 de docs/catacombs42-plano-de-tarefas.md).
_Evitar_: módulo (é o termo do subject), feature, área

**Frente**:
Um bloco técnico do projeto com tarefas numeradas: F0 Fundação, F1 Simulation, F2 Netcode, F3 Render 3D, F4 Conteúdo, F5 Partidas e estatísticas, F6 Identidade e usuários, F7 Casca web, F8 Infra e monitoring, F9 Docs e defesa. Uma Slice junta Frentes, e uma Frente pode ser repartida entre Slices (F2.7 é do Caminho 1, o resto de F2 do Caminho 2).
_Evitar_: módulo, slice, área

**Checkpoint**:
Demo de integração na sexta, com critério observável (C1–C5 no plano). Checkpoint não fechado vira o assunto da reunião de segunda.
_Evitar_: milestone, entrega, sprint review

**Module** (módulo):
Item pontuável do subject (Major = 2, Minor = 1).
_Evitar_: usar "módulo" para pacote Python ou para Slice

**Contract** (contrato):
A interface combinada entre duas Slices (endpoints, mensagens, assinaturas), fechada antes do código dos dois lados.

**ConnectionManager**:
O registro único de sockets abertos por User, usado pela partida e pelo canal de presença e Lobby da casca.

**RoomManager**:
O registro de Rooms vivas e das tasks que rodam a Simulation de cada uma.
