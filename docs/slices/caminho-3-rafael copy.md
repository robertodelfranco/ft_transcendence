# Caminho 3 — Render 3D e conteúdo · Rafael

> Escopo da Slice 3: o que é meu, o que consigo fazer sozinho, de quem dependo, o que entrego aos colegas e o que explico na defesa. Modelo: [Slice do Akita](caminho-5-akita.md). Alocação: [plano §9](../catacombs42-plano-de-tarefas.md#9-divisão-entre-as-5-pessoas). Tarefas, estimativas e critérios de aceite: [plano §5](../catacombs42-plano-de-tarefas.md#5-tarefas-por-frente). Vocabulário: [CONTEXT.md](../../CONTEXT.md).
>
> Papel no time: **Dev**, responsável por **Render 3D e conteúdo**. Escrevo [mount-game.md](../contracts/mount-game.md), [room-options.md](../contracts/room-options.md) e os valores de [rules.md](../contracts/rules.md), junto do Roberto para nomes e unidades. Reviso como consumidor [ws-messages.md](../contracts/ws-messages.md) e [map-format.md](../contracts/map-format.md).

## 1. Inventário

**20 d de tarefa:** F3 sem F3.6 (15 d) + F4 (5 d), além da participação em F0 e F9. Um dia-pessoa representa cerca de 5–6 horas focadas; as estimativas não são dias de calendário.

### F3 — Render 3D (15 d, sem o minimapa)

| ID | Tarefa | d | Depende de | Sem. | Pronto quando |
|---|---|---|---|---|---|
| F3.1 | `dev.html`: cena a partir do Grid, paredes com `InstancedMesh` texturizado e `NearestFilter`, chão e teto do Theme, câmera FPS com yaw/pitch e Pointer Lock, usando `snapshot.example.json` | 2,5 | F0.2 | S1 | masmorra em 3D no navegador |
| F3.2 | `Renderer` (`init`, `render(view, dt)`, `resize`, `dispose`) e `AssetLoader` com estado de erro na tela | 1 | F3.1 | S1–S2 | asset faltando mostra erro na tela, console limpo |
| F3.3 | Billboards animados: Enemies (10 quadros), Boss, Pickups, fireball, bullet e outros Players | 2,5 | F3.2 | S2 | todas as entidades do Snapshot aparecem |
| F3.4 | Door como mesh animado; mão com bola de fogo como overlay fixo na câmera | 1,5 | F3.2 | S2 | Door abre com animação quando o Snapshot muda |
| F3.5 | Técnicas advanced: tochas como luzes pontuais com sombra, névoa, partículas de rastro/impacto, bloom leve e instancing | 3 | F3.3 | S3 | lista das técnicas pronta para a defesa |
| F3.7 | Efeitos de dano, morte e respawn; Events de kill feed repassados à HUD | 1 | F3.5 | S4 | kill feed aparece no PvP |
| F3.8 | Pelo menos dois Themes de texturas e luz, selecionados por `options.theme`: `dungeon` e `sewer` | 1,5 | F3.5, F1.9 | S4 | trocar o Theme no lobby muda o visual da partida |
| F3.9 | Áudio de passos, tiro, acerto e música com Web Audio, iniciado após interação do User | 1 | F3.3 | S4 | som funciona, console limpo |
| F3.10 | Performance e limpeza: 60 fps com 5 Players, 20 Enemies e 10 Projectiles; liberação de GPU e resize correto | 1 | F3.5 | S5 | trocar de Room 10 vezes sem aumentar memória |

**F3.6, o minimapa, é do Roberto.** Entrego o Renderer e combino coordenadas, tamanho do canvas e ciclo de vida para ele integrar essa tarefa.

O inventário de F3.1 no plano §5 cita C2, mas o plano §6 exige a masmorra em 3D já no **C1**. A ordem de execução abaixo segue esse calendário de integração.

### F4 — Conteúdo e gameplay (5 d)

| ID | Tarefa | d | Depende de | Sem. | Pronto quando |
|---|---|---|---|---|---|
| F4.1 | Maps coop (`dungeon_map`, `enemy`, `enemy_sewer`), só a grade de `map-format.md`, com 5 Spawns e `M A T` | 1 | F0.2 | S1 | os Maps passam no teste de F1.1 |
| F4.2 | Valores de `rules.py` / `rules.ts` v1: constantes, Mana, Armor, respawn e limites do PvP | 0,5 | F1.2 | S1 | mesmos nomes nos dois arquivos |
| F4.3 | Especificação da HUD coop e PvP: o que aparece, quando e em que ordem | 0,5 | — | S2 | F7 consegue desenhar sem perguntar |
| F4.4 | Dois Maps PvP 1v1 pequenos e simétricos | 1 | F1.8 | S3 | carregam e são jogáveis |
| F4.5 | Catálogo de opções de customização com defaults e limites, seguido por F1.9, F5.2 e F7.7 | 0,5 | — | S3 | uma tabela em `docs/contracts/` |
| F4.6 | Pelo menos 5 Achievements e fórmulas de XP/level e ranking | 0,5 | — | S3 | F5.5 e F5.7 implementam sem inventar regra |
| F4.7 | Passada de balanceamento coop e PvP | 1 | F1.9 | S5 | números finais no `rules.*` |

Em F4.2 e F4.7, sou responsável pelos valores e pelo balanceamento. O Roberto mantém nomes, unidades e a coerência com Simulation/Prediction; revisa as mudanças de `rules.*`. Limites escolhidos na criação da Room ficam em `room-options.md`.

### F0 e F9 — compartilhados

F0.2: publicar e revisar meus contratos com os consumidores. F0.4 é do Caio; combino com ele a integração de `frontend/game/`. F9.1: minha parte do README, com features, módulos, contribuição e desafios. F9.2: ensaio com código aberto e uma modificação rápida na minha parte.

## 2. O que eu faço sozinho

O Renderer consome ViewState: consigo desenvolver o desenho usando a [fixture](../contracts/snapshot.example.json), sem esperar autenticação, socket ou banco.

| Trabalho | Como avanço sem esperar integração |
|---|---|
| **F3.1 e F3.2** cena e Renderer | uso `dev.html` e preparo ViewState a partir da fixture; combino os tipos no contrato |
| **F3.3 e F3.4** entidades e Door | uso estados e posições de fixture para conferir sprites e transições |
| **F3.5** luz, névoa, partículas e bloom | uso a cena local; meço o custo antes de definir o teto de sombras |
| **F3.8, parte visual** Themes | preparo os dois conjuntos com a mesma grade; seleção real pelo lobby depende de F1.9 e F7.7 |
| **F3.9** áudio | confiro reprodução após interação e liberação dos recursos na cena local |
| **F4.1 e F4.4, autoria** Maps | escrevo as grades pelo contrato; aceite final depende do carregador e do playtest |
| **F4.3, F4.5 e F4.6** especificações | documento HUD, opções e progressão; fecho as propostas com quem implementa |
| Inventário de assets | separo os PNGs reaproveitáveis e preparo Mana, Armor, tocha e outro Player, ainda pendentes no manifesto |

Fixtures ajudam a conferir o desenho; os aceites de partida, multiplayer e balanceamento precisam da integração real.

## 3. De quem eu dependo

Os prazos abaixo são alvos de integração desta Slice, seguindo o plano §6; pendências precisam ser combinadas com os donos.

| Preciso de | De quem | Para quê | Até |
|---|---|---|---|
| `ws-messages.md`, `snapshot.example.json` e revisão de `ViewState` | Roberto, com Augusto na integração | campos, ids, estados e coordenadas que a cena desenha | S1 |
| `map-format.md` e carregador F1.1 | Roberto | autoria e validação dos Maps coop | S1 |
| F0.4: Vite + React + TypeScript, organização de assets e build | Caio | jogo isolado, `dev.html` e integração com a casca | S1–S2 |
| F1.7: JSON exportado pela Simulation | Roberto | conferir a cena com estado produzido pelo servidor | S2 |
| F2.5: cliente, socket, `mountGame` e montagem de ViewState | Augusto | movimento autoritativo visível no Renderer | C2, 16/10 |
| F2.7 e F2.8: Prediction/Reconciliation e Interpolation | Roberto e Augusto | pose local e entidades suaves, entregues prontas para desenhar | S3 |
| F1.8 e F1.9: PvP, respawn e opções | Roberto | playtest dos Maps PvP, efeitos e Themes escolhidos na Room | S3–S4 |
| F7.6: HUD e integração de `onHud` / `onEnd` | Caio | erros traduzidos, placar, feed e tela final | S3–S4 |
| Validação de opções no lobby e campos do MatchResult | Akita, com Roberto para os contadores | opções consistentes e Achievements calculáveis | S3 |
| F8.4: build de produção servindo assets | Akita, com Caio no build | textura, sprite e som acessíveis na versão de produção | S2 |
| Partidas reais e máquinas da demo | time, com Akita na organização | balanceamento e medição de FPS, memória, sombras e áudio | S3–S5 |

### O que os outros esperam de mim

| Entrego | Quem consome | Alvo |
|---|---|---|
| `mount-game.md`: ViewState, Renderer, Themes, HudState e ciclo de vida | Augusto, Roberto e Caio | S1; fechar pendências para C2 |
| `room-options.md`: valores, defaults, limites e aplicação por Mode | Roberto, Akita e Caio | rascunho na S1; catálogo fechado em F4.5/S3 |
| Valores iniciais de `rules.md` e revisão conjunta de `rules.*` | Roberto e Augusto | S1; ajuste por playtest em S3 e S5 |
| Maps coop F4.1 | Roberto | até 10/10 |
| Renderer F3.2 em código | Augusto para integrar; Roberto para o minimapa | S1–S2; disponível antes de F3.6/S4 |
| HUD especificada F4.3 | Caio | S2 |
| Maps PvP F4.4 e regra de Spawn/proteção combinada | Roberto | S3; decisão de respawn no início da semana |
| Achievements com códigos/condições e fórmulas de XP/level e Elo F4.6 | Akita | início da S3 |
| Teto de tochas/sombras medido e política de assets | Roberto, Caio e Akita | antes de fechar Maps e aceites de performance |

Os contratos já possuem rascunhos. A existência do arquivo não significa que todas as propostas foram aprovadas; as pendências continuam nas respectivas seções “Em aberto”.

## 4. Decisões e pendências antes de implementar

### Decisões registradas nas fontes

1. **Three.js puro em `frontend/game/`.** Não importa `frontend/src/`; integração por `mountGame`, `onHud` e `onEnd` ([ADR 003](../adr/003-threejs-mountgame.md)). O cliente do jogo e o socket são do Augusto; o Renderer é meu.
2. **Renderer só desenha ViewState.** Acerto, dano, coleta e vitória são decisões do servidor. Prediction é do Roberto; Interpolation é do Augusto.
3. **Coordenadas:** Grid `x` → Three.js `X`, Grid `y` → `Z`; altura no eixo `Y`; célula vale 1. Norte é `-Z`. Validar visualmente antes de expandir a cena.
4. **Map define a grade; Theme define o visual.** `map` fica fora do objeto `options`, conforme a decisão de 06/10 em `room-options.md`. Não repetir a forma antiga `options.map` que ainda aparece em documentos.
5. **Animação não aplica regras.** Enemy/Boss/Projectile usam os estados publicados em `ws-messages.md`; o cliente controla o clipe e remove a entidade quando ela deixa o Snapshot.
6. **HUD e mensagens têm i18n na casca.** O canvas do jogo não contém texto. Falha de asset deve chegar à tela por um código traduzível.
7. **Números compartilhados mudam juntos.** `rules.md`, `rules.py` e `rules.ts` precisam permanecer coerentes, com revisão do Roberto.
8. **`dispose` faz parte da entrega.** Sair da Room precisa liberar GPU, listeners e áudio; a integração precisa limpar também inicialização parcial.

### Pendências para fechar com os consumidores

| Pendência | Onde registrar / com quem |
|---|---|
| Tipo `Assets`, unidade de `dt`, resize e ausência do Player local após saída | `mount-game.md` §5.1–§5.2; Augusto e Roberto |
| Manifesto, PNGs faltantes, dimensões, FOV vertical e durações de clipe | `mount-game.md` §5.3–§5.4; conteúdo e revisão visual com Roberto |
| Limite de luzes/sombras e quantidade de tochas nos Maps | medir na máquina-alvo; registrar em `mount-game.md` e combinar checagem com Roberto |
| Frequência de `onHud`, ping, duração do feed e resultado do Player local no PvP | `mount-game.md` §5.5; Augusto e Caio |
| Código de erro de asset e comportamento após falha | `mount-game.md` §5.6; Augusto e Caio |
| Ordem do catálogo de Maps, mínimos de Players e normalização das opções | `room-options.md` §5; Roberto, Akita e Caio |
| Spawn livre e eventual proteção após respawn | `rules.md` §5 e `room-options.md` §5.4; Roberto e Akita |
| Fórmulas de XP/level/Elo e Achievements com dados disponíveis no MatchResult | F4.6; Akita e Roberto |

Nenhum valor de FOV, dimensões de sprites, quantidade de sombras ou proteção de respawn proposto vira garantia sem revisão e teste. O RetroRenderer citado no contrato é posterior; não entra nas 20 d desta Slice.

## 5. Ordem de execução

Datas do [plano §6](../catacombs42-plano-de-tarefas.md#6-semana-a-semana), também usadas no [replanejamento do Akita](../pm/replanejamento-e-board.md). O documento do PM ainda se apresenta como proposta; a data de defesa depende da confirmação do prazo na intra. Esta Slice não aprova nem altera o calendário.

| Semana | O que entrego |
|---|---|
| **S1 · até 10/10** | revisar meus contratos; **F3.1** masmorra no `dev.html`; iniciar/entregar **F3.2** para integração; **F4.1** Maps coop; **F4.2** números iniciais. **C1, 09/10:** masmorra em 3D e Maps validados no caminho de integração |
| **S2 · 11–17/10** | fechar **F3.2**; **F3.3** entidades; **F3.4** Door/mão; **F4.3** HUD especificada; integrar o Renderer com Augusto. **C2, 16/10:** Player anda em 3D com estado do servidor |
| **S3 · 18–24/10** | **F3.5** técnicas advanced; **F4.4** Maps PvP; **F4.5** catálogo de opções; **F4.6** progressão entregue no início da semana; playtest com Roberto dos valores provisórios. **C3, 23/10:** coop e PvP desenhados com multiplayer |
| **S4 · 25–31/10** | **F3.7** efeitos/feed; **F3.8** Themes; **F3.9** áudio; apoiar integração do minimapa do Roberto. **C4, 30/10:** opções e Themes mudam o jogo, com HUD e áudio integrados |
| **S5 · 01–14/11** | **F3.10** performance/limpeza; **F4.7** balanceamento; **F9.1** minha parte do README; corrigir falhas de assets e validar nas máquinas da demo. **C5, 13/11**, freeze em 14/11 |
| **S6 · 15–21/11** | bugs, texto e tradução; README fechado em 18/11; **F9.2** ensaio em 19–20/11; defesa prevista em 21/11 |

Há divergência entre o aceite antigo de F9.1 (06/11) e o fechamento do README no calendário §6 (18/11). Sigo o calendário de integração, mantendo minha contribuição iniciada na S5.

**Prioridade para destravar o time:** contratos, Maps coop e Renderer antes do acabamento visual. F3.5 custa 3 d na S3; F4.6 precisa sair no início dessa semana para o Akita. Antecipar seus rascunhos evita concentrar tudo perto de C3. Se a estimativa estourar, levo o bloqueio ao checkpoint e sigo a ordem de corte do plano com o time.

## 6. O que explico na defesa

| Módulo / contribuição | O que abro e explico |
|---|---|
| **Advanced 3D** | construção da cena, câmera FPS, billboards, instancing, luz dinâmica com sombra, névoa, partículas e bloom; motivo e custo de cada técnica; medição de FPS |
| **Web-based game** | como ViewState vira desenho; por que o Renderer não conhece rede; animação de Door e entidades sem decidir regra |
| **Game customization** | dois Themes e Maps, opções/defaults, separação entre aparência e Grid, Pickups de Mana/Armor; integração com Simulation e lobby |
| **Game statistics, parte de conteúdo** | condições/códigos dos Achievements e fórmulas de XP/level/Elo; Akita implementa e persiste os resultados |
| **Integração e obrigatórios** | fronteira entre jogo e React, texto traduzido na HUD, erro de asset tratado, autoplay após interação, resize e liberação de recursos |

Preciso saber responder: por que usar `InstancedMesh`; como o billboard acompanha a câmera; por que o FOV do Cub3D não vai direto para o FOV vertical; como manter o sprite apoiado no chão; como limitar sombras sem perder o visual; por que um clipe não aplica dano; como provar que dez trocas de Room não deixam recursos acumulados.

As medições de F3.10 devem registrar máquina, navegador, resolução interna, Boss, quantidade de entidades, sombras e bloom. Os números são metas do plano até serem medidos.

Modificações rápidas para ensaiar: ajustar um Theme; mudar o tamanho de um sprite; alterar um valor de balanceamento nos três arquivos com revisão do Roberto; escrever um Map pequeno que passe no carregador. A autoria do código inclui entender e explicar cada uma dessas mudanças.
