# Catacombs 42 — plano de tarefas (27/09 → 07/11/2026)

> Guia de execução do projeto. A **parte 1** lista tudo que precisa ser feito, organizado por tarefa e por semana, sem dono. A **parte 2** registra quem faz o quê entre as 5 pessoas. O time usa a parte 1 como checklist até a defesa.
>
> Escopo fechado em 25/09/2026. Como o sistema funciona (interfaces, protocolo, contratos, constantes do Cub3D, schema, decisões técnicas) está em [catacombs42-web-arquitetura.md](catacombs42-web-arquitetura.md), citado aqui como "arq. §N". A proposta ampliada que deu origem a este plano, com outros módulos possíveis, está em [catacombs42-ideias-e-modulos.md](catacombs42-ideias-e-modulos.md). Vocabulário: [CONTEXT.md](../CONTEXT.md).
>
> **Revisão de 28/09/2026:** o *AI opponent* saiu do escopo e o *Monitoring system* (Prometheus + Grafana) entrou no lugar, com os mesmos 2 pontos. O PvP 1v1 continua (ver §1.1). F2.7, F2.13 e F3.6 passaram para o Caminho 1. A alocação dos 5 caminhos foi fechada no mesmo dia (§9).

## Sumário

**Parte 1 — O que fazer**
1. [Escopo: 21 pontos](#1-escopo-21-pontos)
2. [Requisitos obrigatórios (rejeição se faltar)](#2-requisitos-obrigatórios-rejeição-se-faltar)
3. [Calendário e checkpoints](#3-calendário-e-checkpoints)
4. [Caminho crítico](#4-caminho-crítico)
5. [Tarefas por frente](#5-tarefas-por-frente)
6. [Semana a semana](#6-semana-a-semana)
7. [Módulo por módulo: o que o avaliador vai pedir](#7-módulo-por-módulo-o-que-o-avaliador-vai-pedir)
8. [Conta de esforço, riscos e ordem de corte](#8-conta-de-esforço-riscos-e-ordem-de-corte)

**Parte 2 — Quem faz o quê**

9. [Divisão entre as 5 pessoas](#9-divisão-entre-as-5-pessoas)
10. [Docs atualizados depois da reunião](#10-docs-atualizados-depois-da-reunião)

---

# Parte 1 — O que fazer

## 1. Escopo: 21 pontos

O jogo é o Catacombs 42 em 3D de verdade (Three.js), com a matemática e as regras do Cub3D bonus rodando num servidor autoritativo. São os 16 pontos da camada de compromisso do [doc de ideias e módulos](catacombs42-ideias-e-modulos.md) (§6), mais quatro módulos puxados para o início.

| # | Módulo (subject v19) | Tipo | Pts | Frentes |
|---|---|---|---|---|
| 1 | Web-based game (users play against each other) | Major | 2 | F1, F2, F3 |
| 2 | Real-time features (WebSockets) | Major | 2 | F2 |
| 3 | Remote players (latência, reconexão) | Major | 2 | F2 |
| 4 | Multiplayer 3+ | Major | 2 | F1, F2, F4 |
| 5 | Framework frontend + backend (React + FastAPI) | Major | 2 | F7, F6 |
| 6 | ORM (SQLAlchemy + Alembic) | Minor | 1 | F5, F6 |
| 7 | Standard user management | Major | 2 | F6, F7 |
| 8 | OAuth 2.0 (42) | Minor | 1 | F6 |
| 9 | Advanced 3D graphics (Three.js) | Major | 2 | F3 |
| 10 | **Game customization** | Minor | 1 | F1, F3, F4, F5, F7 |
| 11 | **Game statistics & match history** | Minor | 1 | F5, F7 |
| 12 | **Monitoring system (Prometheus + Grafana)** | Major | 2 | F8, F2 |
| 13 | **Multiple languages (3)** | Minor | 1 | F7 |
| | **Total** | | **21** | exigido: 14 |

A margem de 7 pontos é o seguro. Como "módulo pela metade vale zero", a seção 8 define a ordem de corte, caso algum módulo não chegue inteiro em 30/10.

### 1.1 O que os módulos novos exigem de verdade

Lendo o texto do subject (capítulo IV), cada um traz mais do que o nome sugere:

- **Monitoring system**: "Set up Prometheus to collect metrics", "Configure **exporters** and integrations", "Create **custom** Grafana dashboards", "Set up **alerting rules**", "**Secure access** to Grafana". São cinco coisas; na avaliação isso vira: métricas do nosso backend e do jogo, pelo menos dois exporters (host/containers e Postgres), dashboards nossos provisionados por arquivo, um alerta disparado ao vivo e Grafana só por HTTPS com login.
- **PvP 1v1 continua no escopo** mesmo sem o bot. Ele não pontua sozinho, mas sustenta o "users can play **against each other**" do módulo 1 (que está nos 14 não cortáveis) e o "1v1 games" e "opponents" do módulo de estatísticas, além do ranking Elo.
- **Game statistics & match history**: wins/losses, **ranking**, **level**, histórico com data, resultado e oponentes, **achievements e progressão**, **leaderboard**. São seis coisas; todas precisam aparecer na tela.
- **Game customization**: power-ups/ataques/habilidades (pickups de mana e armadura), **mapas ou temas diferentes**, configurações ajustáveis e **defaults**.
- **i18n**: sistema de i18n, **3 traduções completas**, seletor de idioma na UI, **todo texto visível traduzível**. Isso inclui Privacy Policy, Terms of Service, mensagens de erro e a HUD do jogo. Fazer desde o primeiro componente custa pouco; fazer no fim custa uma semana.

### 1.2 Decisões de jogo que continuam valendo (de 18/09)

O porquê de cada uma está na arq. §4. Resumo:

- **Three.js puro** em `frontend/game/`, atrás de `mountGame`; React monta o canvas e desenha HUD e telas. Sem react-three-fiber.
- **Servidor 2,5D em grade**, autoritativo, Room em memória, um worker. Pitch é só câmera; o acerto é decidido no plano.
- **Mouse look desde o dia 1** (Pointer Lock): `mouse_dx` vai no Input, o servidor aplica e limita.
- **Uma arma**: bola de fogo com a mão do Cub, custa mana, com cooldown. Mana regenera e tem pickup. **Armadura** absorve dano antes do HP e quebra.
- **Pickups**: chave, poção, mana, armadura.
- **Co-op até 5 players** (vitória: boss morto; derrota: todos mortos). **PvP 1v1**: primeiro a 5 eliminações ou 3 minutos, respawn em spawn livre, sem inimigos.
- **Sem** times, granadas, hitscan, pulo ou andares.
- **Assets**: PNGs do Cub3D como base (paredes, billboards animados, mão), com meshes onde o avaliador olha (porta, tochas).

### 1.3 Fora do escopo

Ficam documentados para ninguém começar sem combinar: segundo jogo / arena com nome próprio (*Add another game*), modo retrô com raycaster e WASM, spectator mode como módulo, chat, notificações, design system como módulo, AI opponent (saiu em 28/09: o critério "vence às vezes e erra como humano" exige calibração com risco alto para o prazo), torneio, gamificação. Um jogador morto no co-op pode seguir a câmera de um companheiro vivo; isso é detalhe de UX e não é reivindicado como *Spectator mode*.

---

## 2. Requisitos obrigatórios (rejeição se faltar)

Não dão ponto, mas qualquer um ausente reprova o projeto. Cada um tem tarefa na seção 5 (ID entre parênteses).

| Requisito (subject cap. III) | Tarefa |
|---|---|
| Frontend + backend + banco | F0.3, F0.4, F5.1 |
| Commits de todos, mensagens claras, trabalho distribuído | F0.6 (e a parte 2) |
| `docker compose up` em um comando | F8.3 |
| Chrome atual, **console sem warnings nem erros** | F3.2, F7.9, checkpoint de todas as semanas |
| Privacy Policy e Terms of Service com conteúdo real, link no rodapé | F7.3 |
| Vários usuários simultâneos, sem corrida nem corrupção | F2.3, F5.2 (corrida da última vaga) |
| Frontend responsivo e acessível | F7.9 |
| Framework CSS | F0.4 |
| `.env` fora do git + `.env.example` | F8.3 |
| Schema claro com relações | F5.1, F6.1 (e o diagrama no README) |
| Cadastro e login com e-mail + senha, hash com salt | F6.2 |
| Validação de todo input no front **e** no back | F6.2, F7.4, F5.2 |
| HTTPS em todo o backend (e `wss://`) | F8.1 |
| Papéis PO, PM, Tech Lead e devs documentados | F0.1, F8.5 |
| README com as seções do capítulo VI (inclusive contribuições individuais e justificativa dos módulos) | F8.5, F9.1 |

---

## 3. Calendário e checkpoints

Seis semanas, domingo a sábado. Cinco de construção e uma de acabamento. Um **checkpoint** é uma demo de integração na sexta-feira, com todo mundo na chamada e um critério observável. Checkpoint não fechado vira o assunto da reunião de segunda.

| Semana | Datas | Tema | Checkpoint (sexta) |
|---|---|---|---|
| **S1** | 27/09 – 03/10 | Fundação e contratos | **C1 · 02/10**: login pelo Nginx com cadeado; testes do parser verdes; masmorra em 3D no `dev.html`; casca React com seletor de 3 idiomas |
| **S2** | 04/10 – 10/10 | Jogo de ponta a ponta com 1 jogador | **C2 · 09/10**: um player cria Room no lobby e anda em 3D com movimento decidido pelo servidor, via `wss://` |
| **S3** | 11/10 – 17/10 | Multiplayer, prediction, PvP | **C3 · 16/10**: duas máquinas jogam co-op até o boss morrer com prediction ligada; Match gravado; PvP 1v1 jogável |
| **S4** | 18/10 – 24/10 | Módulos novos | **C4 · 23/10**: reconexão funciona; Grafana mostra os dashboards do jogo e do backend; opções mudam o jogo; estatísticas, level e conquistas reais; login pela 42 |
| **S5** | 25/10 – 31/10 | Completar e polir | **C5 · 30/10**: todo módulo da seção 7 demonstrável de ponta a ponta, nos 3 idiomas, com console limpo. **Feature freeze no sábado, 31/10** |
| **S6** | 01/11 – 07/11 | Bugs, README, ensaio | **Defesa · 07/11** |

Regra do freeze: depois de 31/10 só entra correção de bug, texto e tradução. Módulo que não passou em C5 sai do README (seção 8).

---

## 4. Caminho crítico

O que atrasa o projeto inteiro se atrasar. As outras tarefas têm folga porque trabalham contra contratos e dados de exemplo.

```mermaid
flowchart LR
    C[F0.2 Contratos] --> A[F6.2 Auth mínima]
    C --> P[F1.1 Parser + F1.3 Movimento]
    P --> E[F1.5 Entidades + F1.6 CoopRuleset]
    A --> R[F2.3/F2.4 Room runtime + WS]
    E --> R
    R --> N[F2.6 N players]
    N --> PR[F2.7 Prediction]
    N --> PV[F1.8 PvP]
    N --> MR[F5.3 record_match_result]
    MR --> S[F5.5 Estatísticas]
    PR --> RC[F2.10 Reconexão]
    C -. snapshot.example.json .-> R3[F3 Render]
    C -. HudState .-> W[F7 Telas]
```

Três costuras deixam o trabalho andar em paralelo desde a S1:

1. **`snapshot.example.json`** (F0.2): o render 3D (F3) é construído inteiro contra esse arquivo e depois contra a CLI de F1.7, sem esperar servidor.
2. **Contrato de auth + mock** (F0.2): as telas (F7) são feitas contra o contrato; o backend real entra quando F6.2 fica pronto.
3. **`MatchResult`** (F0.2): estatísticas (F5.5–F5.8) são testadas com resultados fabricados antes de existir partida real.

---

## 5. Tarefas por frente

Formato: **ID · tarefa · estimativa · depende de · semana · pronto quando**. Estimativa em **dias-pessoa (d)**, um dia focado de ~5–6 h; é chute calibrado pelo tamanho do Cub3D e dos contratos, para discussão. Cada ID vira uma issue no board (branch `<nº-issue>-<slug>`, PR com `Closes #<nº>`).

As frentes vêm do doc de ideias e módulos: F1 Simulation, F2 Netcode, F3 Render 3D, F4 Conteúdo, F5 Partidas e estatísticas, F6 Identidade e usuários, F7 Casca web, F8 Infra. F0 é a fundação compartilhada da S1 e F9 é documentação e defesa.

### F0 — Fundação (S1, compartilhada)

**Olhar:** este documento; arq. §2 (invariantes), §4 (decisões), §13 (lista de contratos) e §14 (pastas).

| ID | Tarefa | d | Dep. | Sem. | Pronto quando |
|---|---|---|---|---|---|
| F0.1 | Reunião de kickoff: ler este doc, fechar alocação, registrar papéis (PO, PM, TL) | 0,5 | — | S1 | Alocação escrita na seção 9; papéis no README |
| F0.2 | Contratos publicados em `docs/contracts/`: `ws-messages.md` + `snapshot.example.json` (5 players, mana, armadura, 20 inimigos, boss, projéteis, portas), `auth.md`, `rooms.md` (RoomManager + `MatchResult`), `map-format.md`, `mount-game.md` (`MountOptions`/`HudState`) | 2 | — | S1 | Cada frente consumidora abriu issue citando o contrato |
| F0.3 | Backend vira pacote `backend/app/` com `create_app()`, `pydantic-settings`, envelope de erro, `GET /api/health`, `pytest` + `httpx.ASGITransport` | 1,5 | — | S1 | Teste de `/health` verde no CI |
| F0.4 | Frontend: Vite + React + TypeScript + framework CSS; `frontend/game/` isolado (não importa nada de `frontend/src/`); `vitest` | 1 | — | S1 | `npm run build` e `vitest` verdes no CI |
| F0.5 | ADRs curtos em `docs/adr/`: servidor autoritativo e Room em memória; tokens (access em memória, refresh em cookie); Three.js puro atrás de `mountGame` | 0,5 | — | S1 | Três arquivos de 3 frases |
| F0.6 | Os 5 membros como colaboradores no GitHub; issues criadas a partir dos IDs deste doc; board com as colunas | 0,5 | F0.1 | S1 | Toda tarefa da S1 e S2 tem issue com responsável |

### F1 — Simulation (servidor, Python puro)

**Olhar:** arq. §3 (três bugs do C para não portar), §5 (estado da Room e regras de N jogadores), §6 (interface, laço, constantes, opções), §15 (mapa de migração); Cub3D `parser_bonus/*`, `movement_bonus.c`, `move_utils_bonus.c`, `enemy_move_bonus.c`, `enemy_manage_bonus.c`, `move_boss_bonus.c`, `attack_bonus/create_*` e `update_*`, `door_bonus.c`, `handle_utils_bonus.c`; mapas em `maps/valid` e `maps/invalid`.

| ID | Tarefa | d | Dep. | Sem. | Pronto quando |
|---|---|---|---|---|---|
| F1.1 | `parse_cub(text) -> Map` com `MapError(code)`; caracteres novos `M` (mana), `A` (armadura), `T` (tocha); vários spawns | 2 | F0.2 | S1 | Teste parametrizado com os 33 mapas do Cub3D + mapas com `M A T` |
| F1.2 | `state.py` (dataclasses `Room`, `Player`, `Enemy`, `Boss`, `Projectile`, `Door`, `InputState`, `Action`, `Event`) e `rules.py` com todas as constantes e unidades | 1 | F0.2 | S1 | `rules.py` revisado contra a tabela da arq. §6.3 |
| F1.3 | Movimento por `dt` (andar, sprint, girar por tecla e por `mouse_dx` limitado), colisão com parede, porta e outros players | 2 | F1.2 | S1 | 1 s andando = 3,6 células; `\|dir\| = 1`; parede e player bloqueiam |
| F1.4 | Portas, chaves, poções, pickups de mana e armadura | 1,5 | F1.3 | S2 | Porta trancada consome 1 chave de quem apertou; pickup some do Grid |
| F1.5 | Inimigos (alvo = player vivo mais próximo, troca só com 1 célula de vantagem), boss, projéteis contínuos com subpasso, dano, armadura absorvendo antes do HP, mana (custo, regeneração), cooldown | 3 | F1.4 | S2 | Um teste por regra da arq. §5 e §6.3 (perseguição, ataque a ≤ 0,7, morte em 1,5 s, boss com 6 acertos, bullet tira 2, fireball some na parede), mais mana, armadura e troca de alvo |
| F1.6 | `Ruleset` (interface) + `CoopRuleset`; `game_over` emitido uma vez; 5 players; teste de performance | 1 | F1.5 | S2 | 1000 ticks com 5 players + 20 inimigos + boss + 10 projéteis em < 200 ms |
| F1.7 | CLI que roda N ticks e grava `snapshot.json` para o render | 0,5 | F1.6 | S2 | O JSON abre no `dev.html` de F3 sem adaptação |
| F1.8 | `PvpRuleset`: 1v1, fireball fere player, respawn no spawn livre mais longe do inimigo, 5 eliminações ou 3 min, inimigos desligados | 2 | F1.6 | S3 | Partida PvP termina pelas duas condições nos testes |
| F1.9 | `RoomOptions` aplicadas na Simulation com defaults: `map`, `theme`, `start_hp`, `enemy_density`, pickups ligados/desligados, `friendly_fire` (co-op), limite de eliminações e de tempo (PvP) | 1,5 | F1.8 | S3 | Sem opções, o jogo roda com os defaults; cada opção tem teste |

**Subtotal F1: 14,5 d**

### F2 — Netcode e Room runtime (servidor e cliente)

**Olhar:** arq. §6.2 (laço), §7 (protocolo, prediction, reconexão, `/ws/app`), §8 (cliente, `ViewState`, `mountGame`), §9.3 (`ConnectionManager`), §10.2 (`RoomManager`); Gabriel Gambetta, *Fast-Paced Multiplayer*; Valve, *Source Multiplayer Networking*; Glenn Fiedler, *Fix Your Timestep!*; doc oficial de WebSockets do FastAPI.

| ID | Tarefa | d | Dep. | Sem. | Pronto quando |
|---|---|---|---|---|---|
| F2.1 | `ConnectionManager` (`connect`, `disconnect`, `send_to_user`, `broadcast`, `is_online`, `online_users`, callback de presença) com testes por fake de socket, e o endpoint `/ws/app` (arq. §7.4) | 2 | F0.3, F6.4 | S2 | Presença funciona com duas abas do mesmo User |
| F2.2 | `protocol.py` (Pydantic, união discriminada por `type`) e `types.ts` espelhado | 1 | F0.2 | S2 | Mensagem inválida fecha com `4400` |
| F2.3 | `RoomManager` + uma `asyncio.Task` por Room, tick fixo 30 Hz com compensação de deriva, Snapshot a cada 2 ticks; `join` atômico | 2 | F1.6 | S2 | Room criada, iniciada e cancelada sem vazar task |
| F2.4 | `WS /ws/game/{room_id}`: `join` com token em ≤ 5 s, `welcome`, laço de leitura, códigos `44xx` | 1,5 | F2.3, F6.4 | S2 | Testes de `join` sem token, válido e malformado |
| F2.5 | Cliente: socket, `mountGame`, `ViewState` montado do último Snapshot (sem prediction ainda), envio de Input e Action | 1,5 | F2.4 | S2 | C2: 1 player anda com movimento decidido pelo servidor |
| F2.6 | N players; limite de 60 Inputs/s; `dt` do servidor; `Seq` monotônico; fila por conexão com descarte (cliente lento não trava a Room) | 1 | F2.5 | S3 | 5 abas numa Room sem travar |
| F2.7 | Prediction + Reconciliation; `applyInput.ts` com a mesma matemática de `sim.py`; teste que roda a mesma sequência nos dois lados e compara. O `applyInput.ts` e o teste cruzado começam logo depois de F1.3 (S2); a Reconciliation liga no cliente quando F2.6 chega | 2,5 | F1.3, F2.6 | S2–S3 | `console.assert` de reconciliação não dispara em 5 min |
| F2.8 | Interpolation dos outros a `now − 100 ms` | 1 | F2.6 | S3 | Outro player desliza sem saltos |
| F2.9 | Fim de partida: chamar `record_match_result` uma vez, remover a Room após 60 s, `4503` no desligamento | 1 | F5.3 | S3 | Teste: `game_over` → uma chamada, mesmo com ticks depois |
| F2.10 | Grace period de 30 s e Reconnection com Snapshot completo; no PvP, grace expirada conta derrota | 2 | F2.7 | S4 | Fechar a aba e voltar em 20 s mantém HP e chaves |
| F2.12 | `ping/pong` com RTT na HUD; teste de aceite com throttling (100 ms + 2 % de perda, 5 min) anotado no PR | 1 | F2.8 | S5 | Resultado do teste no PR |
| F2.13 | Teste de carga: 4 Rooms × 5 players, p99 do tick < 5 ms | 0,5 | F2.6 | S5 | Números no PR |

**Subtotal F2: 17 d**

### F3 — Render 3D (cliente, Three.js)

**Olhar:** arq. §8 (cliente, `Renderer`, a cena, `HudState`); documentação e exemplos do Three.js (`InstancedMesh`, `Sprite`, `PointLight` com sombra, `Fog`, `EffectComposer` + `UnrealBloomPass`, `GLTFLoader`); MDN Pointer Lock; Cub3D `assets/` (65 PNGs) e a ideia de `less_height` (itens sentam no chão).

| ID | Tarefa | d | Dep. | Sem. | Pronto quando |
|---|---|---|---|---|---|
| F3.1 | `dev.html`: cena a partir do grid (paredes como `InstancedMesh` texturizado com `NearestFilter`, chão e teto com as cores do `.cub`), câmera FPS com yaw/pitch, Pointer Lock, contra `snapshot.example.json` | 2,5 | F0.2 | S1 | C1: masmorra em 3D no navegador |
| F3.2 | `Renderer` (`init`, `render(view, dt)`, `resize`, `dispose`) e `AssetLoader` com estado de erro na tela (nunca warning no console) | 1 | F3.1 | S1–S2 | Asset faltando mostra erro na tela, console limpo |
| F3.3 | Billboards animados: inimigos (10 quadros), boss, itens, fireball, bullet, outros players | 2,5 | F3.2 | S2 | Todas as entidades do Snapshot aparecem |
| F3.4 | Porta como mesh animado; mão com bola de fogo como overlay fixo na câmera | 1,5 | F3.2 | S2 | Porta abre com animação quando o Snapshot muda |
| F3.5 | Técnicas "advanced": tochas como luzes pontuais com sombra, névoa, partículas (rastro e impacto da fireball), bloom leve, instancing | 3 | F3.3 | S3 | Lista das técnicas pronta para a defesa |
| F3.6 | Minimapa (canvas 2D sobreposto) | 1 | F3.2 | S4 | Mostra células, players e cone de visão |
| F3.7 | Efeitos de dano, morte e respawn; eventos de kill feed repassados à HUD | 1 | F3.5 | S4 | Kill feed aparece no PvP |
| F3.8 | **Temas** (Game customization): no mínimo 2 conjuntos de texturas e luz selecionáveis por `options.theme` (ex.: masmorra e esgoto, a partir de `enemy_sewer.cub`) | 1,5 | F3.5, F1.9 | S4 | Trocar o tema no lobby muda o visual da partida |
| F3.9 | Áudio (passos, tiro, acerto, música) com Web Audio, iniciado só após interação do usuário (política de autoplay não pode gerar warning) | 1 | F3.3 | S4 | Som funciona, console limpo |
| F3.10 | Performance e limpeza: 60 fps com 5 players, 20 inimigos e 10 projéteis; `dispose()` libera GPU; resize correto | 1 | F3.5 | S5 | Trocar de Room 10 vezes sem aumentar memória |

**Subtotal F3: 16 d**

### F4 — Conteúdo e gameplay (dados e design)

**Olhar:** arq. §6.1 (formato `.cub` e Rulesets), §6.3 (constantes), §6.4 (opções), §10.3 (schema de estatísticas); mapas do Cub3D; o texto dos módulos *Game customization* e *Game statistics* no subject.

| ID | Tarefa | d | Dep. | Sem. | Pronto quando |
|---|---|---|---|---|---|
| F4.1 | `map-format.md` + mapas co-op (`dungeon_map`, `enemy`, `enemy_sewer`) com 5 spawns e `M A T` | 1 | F0.2 | S1 | Os mapas passam no parser de F1.1 |
| F4.2 | `rules.py` / `rules.ts` v1: números da arq. §6.3 + mana, armadura, respawn, limites do PvP | 0,5 | F1.2 | S1 | Mesmos nomes nos dois arquivos |
| F4.3 | Especificação da HUD co-op e PvP (o que aparece, quando, em que ordem) | 0,5 | — | S2 | F7 consegue desenhar sem perguntar |
| F4.4 | Dois mapas PvP 1v1 pequenos e simétricos | 1 | F1.8 | S3 | Carregam e são jogáveis |
| F4.5 | Catálogo de opções de customização com defaults e limites (tabela que F1.9, F5.2 e F7.7 seguem) | 0,5 | — | S3 | Uma tabela em `docs/contracts/` |
| F4.6 | Lista de conquistas (≥ 5) e fórmula de XP/level e de ranking | 0,5 | — | S3 | F5.5 e F5.7 implementam sem inventar regra |
| F4.7 | Passada de balanceamento: co-op e PvP | 1 | F1.9 | S5 | Números finais no `rules.*` |

**Subtotal F4: 5 d**

### F5 — Partidas e estatísticas (backend)

**Olhar:** arq. §10 (ciclo de vida, `RoomManager`, `MatchResult`, schema), §7.4 (`/ws/app` para o lobby); texto do módulo *Game statistics & match history*; SQLAlchemy 2.0 assíncrono e Alembic.

| ID | Tarefa | d | Dep. | Sem. | Pronto quando |
|---|---|---|---|---|---|
| F5.1 | Alembic configurado (o `entrypoint` roda `alembic upgrade head`); modelos `matches` e `match_players` | 1,5 | F0.3 | S1 | Migração sobe do zero no compose |
| F5.2 | Lobby: `POST /api/matches` (mode, map, max_players, options validadas com defaults) → `room_id`; listar Rooms abertas (de `RoomManager.info`, nunca do banco); entrar, sair, pronto, iniciar; lobby atualizado em tempo real via `ConnectionManager` | 3 | F2.3, F6.4 | S2 | Dois usuários veem o lobby mudar sem recarregar; corrida da última vaga resolvida no `join` |
| F5.3 | `record_match_result(match_id, MatchResult)` idempotente; `startup` marca `running` → `aborted` | 1 | F5.1 | S3 | Chamada dupla grava uma vez |
| F5.4 | `player_stats` agregado: vitórias, derrotas, eliminações, mortes, tempo jogado, por modo | 1 | F5.3 | S4 | Bate com os `match_players` |
| F5.5 | Ranking (Elo no PvP) e level por XP (fórmula de F4.6) | 1 | F5.4 | S4 | Ranking muda após uma partida PvP |
| F5.6 | Histórico paginado: data, modo, mapa, resultado, oponentes/companheiros | 1 | F5.3 | S4 | `GET /api/users/{id}/matches` |
| F5.7 | Conquistas (≥ 5) em `user_achievements`, desbloqueadas no `record_match_result` e anunciadas ao cliente | 1,5 | F5.3, F4.6 | S4 | Desbloquear uma conquista numa partida real |
| F5.8 | Leaderboard | 0,5 | F5.5 | S4 | `GET /api/leaderboard` |

**Subtotal F5: 10,5 d**

### F6 — Identidade e usuários (backend compartilhado)

**Olhar:** arq. §4 (decisões 1–6 e 9), §9 (contrato de auth, regras de validação, middlewares), §10.3 (tabelas de usuários); RFC 9700 (refresh tokens), OWASP (senhas, CSRF), RFC 6749 §4.1.

| ID | Tarefa | d | Dep. | Sem. | Pronto quando |
|---|---|---|---|---|---|
| F6.1 | Migrações `users`, `refresh_tokens`, `oauth_accounts`, `friendships` (com F5.1) | 0,5 | F5.1 | S1 | Sobem junto com as de F5 |
| F6.2 | Signup, login e `me`: Argon2id, JWT de acesso, validação Pydantic, mesma mensagem para e-mail e senha errados | 2 | F6.1 | S1 | C1: signup → login → `me` pelo Nginx com HTTPS |
| F6.3 | Refresh com rotação e detecção de reuso; logout | 1,5 | F6.2 | S2 | Reuso de refresh antigo revoga a família |
| F6.4 | `get_current_user` e `authenticate_ws_token` | 0,5 | F6.2 | S1 | Outras frentes usam `CurrentUser` |
| F6.5 | Middlewares: logging JSON com `request_id`, handlers de erro no envelope, `RateLimit` como dependência | 2 | F0.3 | S2 | 6 logins errados em 1 min dão 429 |
| F6.6 | Perfil: `GET/PATCH /api/users/me`, perfil público, upload de avatar validado (tipo e tamanho) com avatar padrão, idioma preferido | 1,5 | F6.4 | S3 | Avatar inválido é recusado no front e no back |
| F6.7 | Amigos (adicionar, remover, listar) e status online via presença do `ConnectionManager` | 2 | F2.1 | S3 | Amigo aparece online ao abrir o site |
| F6.8 | OAuth 2.0 com a 42 (Authorization Code + `state`), emitindo os mesmos tokens; pedir o app na intra **já na S1** | 2 | F6.3 | S4 | Login pela 42 cria ou vincula conta |

**Subtotal F6: 12 d**

### F7 — Casca web (React, i18n, telas, HUD)

**Olhar:** arq. §8.3 (`mountGame` e `HudState`), §9.1 (contrato de auth), §11 (casca e i18n); texto dos módulos *Standard user management* e *Multiple languages*; `react-i18next`; WCAG básico (contraste, foco, navegação por teclado).

| ID | Tarefa | d | Dep. | Sem. | Pronto quando |
|---|---|---|---|---|---|
| F7.1 | Roteamento, layout, contexto de auth (access em memória, refresh ao carregar), rotas protegidas, cliente HTTP que entende o envelope de erro; abrir `/ws/app` após o login (quando F2.1 existir) | 2 | F0.4 | S1 | Recarregar a página mantém o login |
| F7.2 | i18n desde o primeiro componente: `react-i18next`, pt-BR / en / es, seletor na UI, preferência salva no perfil (com fallback local), códigos de erro do backend traduzidos no front; traduções completas na S5 | 3 | F0.4 | S1 + S5 | Nenhuma string solta no JSX (checagem no CI ou revisão) |
| F7.3 | Privacy Policy e Terms of Service com conteúdo real, nos 3 idiomas, link no rodapé de toda página | 1 | F7.2 | S1–S2 | Acessíveis sem login |
| F7.4 | Telas de login e cadastro com a mesma validação do backend; botão "entrar com a 42" | 1 | F7.1 | S1 | C1 |
| F7.5 | Perfil próprio e de terceiros, edição, upload de avatar, lista de amigos com status online | 2 | F6.6, F6.7 | S3 | Critérios do *Standard user management* visíveis |
| F7.6 | Rota `/play/:roomId` que monta `mountGame`; HUD em React (HP, mana, armadura, chaves, ping, players, placar e kill feed no PvP) via `onHud` | 2 | F2.5, F4.3 | S2–S3 | HUD reage ao Snapshot |
| F7.7 | Lobby: criar Room com opções de customização (e defaults visíveis), listar Rooms, entrar, pronto | 2 | F5.2, F4.5 | S2–S4 | Criar partida sem mexer em nada usa os defaults |
| F7.8 | Tela de resultado; histórico; estatísticas, ranking e level com barra de progresso; conquistas; leaderboard | 2,5 | F5.4–F5.8 | S4 | Os seis itens do módulo de estatísticas aparecem |
| F7.9 | Responsivo, acessibilidade básica, passada de console limpo em todas as telas | 1 | — | S5 | Console vazio navegando o site inteiro |

**Subtotal F7: 16,5 d**

### F8 — Infra e operação

**Olhar:** arq. §12 (Nginx, compose, CI, demo); `docker-compose.yml`, `proxy/nginx.conf` e `.github/workflows/` atuais; capítulo VI do subject (README). Para o monitoring: doc do Prometheus (*Configuration*, *Alerting rules*, *Metric types*), doc do `prometheus_client` para Python, doc do Grafana (*Provisioning*, *Configure security*), READMEs do `node-exporter`, cAdvisor e `postgres-exporter`.

| ID | Tarefa | d | Dep. | Sem. | Pronto quando |
|---|---|---|---|---|---|
| F8.1 | Nginx com TLS (`mkcert`), redirect 80 → 443, `/api/`, `/ws/` com headers de upgrade, um worker de backend | 1,5 | — | S1 | Cadeado sem warning no Chrome |
| F8.2 | `build-check.yml`: build das imagens, `pytest`, `vitest`, lint | 1 | F0.3, F0.4 | S1 | CI verde num PR |
| F8.3 | `.env.example` completo, healthchecks no compose, `entrypoint` com migração, um comando sobe tudo | 1 | F5.1 | S1–S2 | Clone limpo + `.env` + `docker compose up` funciona |
| F8.4 | Build de produção do frontend servindo assets do jogo | 0,5 | F0.4 | S2 | Sem Vite dev server no compose final |
| F8.5 | Esqueleto do README com todas as seções do capítulo VI (inclusive diagrama do schema) | 1 | — | S3 | Cada pessoa sabe onde escrever a própria parte |
| F8.6 | Setup da demo: 2–3 máquinas na mesma rede com a CA do `mkcert` confiável | 0,5 | F8.1 | S5 | Ensaio de C5 feito nessas máquinas |
| F8.7 | Instrumentação: `GET /metrics` com `prometheus_client`, só na rede interna do compose; `http_requests_total{route,status}`, `auth_login_total{result}`, `ws_connections{channel}`, `game_rooms_active`, `game_tick_seconds` (histograma) | 1 | F2.3, F6.5 | S3 | `curl backend:8000/metrics` de dentro da rede mostra as cinco séries; de fora do compose não responde |
| F8.8 | Prometheus no compose com `scrape_configs` do backend e dos exporters (`node-exporter` ou cAdvisor, `postgres-exporter`); retenção definida; sem porta publicada | 1 | F8.7 | S3 | Todos os *targets* `UP` na página de status do Prometheus |
| F8.9 | Grafana com datasource e dashboards provisionados por arquivo versionado: jogo (Rooms ativas, p95/p99 do tick, conexões WS), backend (req/s, 5xx, logins falhos), host/containers e Postgres | 1,5 | F8.8 | S4 | `docker compose down -v && up` e os dashboards voltam sozinhos |
| F8.10 | Regras de alerta (backend fora do ar, p99 do tick acima de 33 ms, taxa de 5xx, pico de logins falhos) com roteiro para disparar um ao vivo | 1 | F8.8 | S5 | Derrubar o backend e ver o alerta ir para *firing* |
| F8.11 | Acesso seguro: Grafana só pelo Nginx em `/grafana/` com TLS, admin vindo do `.env`, anônimo e signup desligados; Prometheus e `/metrics` sem acesso externo | 0,5 | F8.9, F8.1 | S4 | Sem login não entra; porta do Prometheus não responde de fora |

**Subtotal F8: 10,5 d**

### F9 — Documentação e defesa (todos)

| ID | Tarefa | d | Dep. | Sem. | Pronto quando |
|---|---|---|---|---|---|
| F9.1 | Cada pessoa escreve no README: features, módulos com justificativa, contribuições individuais, desafios | 1 × 5 | F8.5 | S5–S6 | README completo em 04/11 |
| F9.2 | Ensaio de defesa: cada pessoa explica a própria parte com o código aberto e faz uma "modificação rápida" (dano da fireball, campo novo no Snapshot, texto novo traduzido, opção nova no lobby) | incluso | — | S6 | Todo mundo passou pelo ensaio |

**Subtotal F9: 5 d**

---

## 6. Semana a semana

O que precisa estar **pronto** até cada checkpoint (IDs da seção 5). Tarefa que atravessa semanas aparece onde termina.

### S1 · 27/09 – 03/10 · Fundação e contratos
- **Todos:** F0.1, F0.2, F0.5, F0.6.
- **Backend:** F0.3, F5.1, F6.1, F6.2, F6.4.
- **Jogo:** F1.1, F1.2, F1.3; F3.1, F3.2; F4.1, F4.2.
- **Web:** F0.4, F7.1, F7.2 (estrutura e seletor), F7.4.
- **Infra:** F8.1, F8.2.
- Pedir o app OAuth na intra da 42 (vai ser usado em F6.8).
- **C1 · sex 02/10:** login pelo Nginx com cadeado; parser e movimento verdes; masmorra 3D no `dev.html`; casca React em 3 idiomas.

### S2 · 04/10 – 10/10 · Um jogador de ponta a ponta
- **Jogo:** F1.4, F1.5, F1.6, F1.7; F2.1–F2.5; início de F2.7 (`applyInput.ts` + teste cruzado); F3.3, F3.4; F4.3.
- **Backend:** F5.2; F6.3, F6.5.
- **Web:** F7.3; início de F7.6 e F7.7.
- **Infra:** F8.3, F8.4.
- **C2 · sex 09/10:** um player entra pelo lobby, cria a Room e anda em 3D com movimento decidido pelo servidor, via `wss://`.

### S3 · 11/10 – 17/10 · Multiplayer, prediction, PvP
- **Jogo:** F1.8, F1.9; F2.6–F2.9; F3.5; F4.4, F4.5, F4.6.
- **Backend:** F5.3; F6.6, F6.7.
- **Web:** F7.5, F7.6.
- **Infra:** F8.5; F8.7, F8.8.
- **C3 · sex 16/10:** duas máquinas jogam co-op até o boss morrer com prediction ligada; o Match aparece no banco; PvP 1v1 jogável entre duas pessoas.

### S4 · 18/10 – 24/10 · Módulos novos
- **Jogo:** F2.10; F3.6, F3.7, F3.8, F3.9.
- **Backend:** F5.4–F5.8; F6.8.
- **Web:** F7.7 (opções), F7.8.
- **Infra:** F8.9, F8.11.
- **C4 · sex 23/10:** fechar a aba e voltar; Grafana com login mostra os dashboards do jogo e do backend; opções e temas mudam o jogo; estatísticas, level, ranking e conquistas reais; login pela 42.

### S5 · 25/10 – 31/10 · Completar e polir
- **Jogo:** F2.12, F2.13; F3.10; F4.7.
- **Web:** F7.2 (traduções completas), F7.9.
- **Infra:** F8.6, F8.10.
- **Todos:** F9.1 começa.
- **C5 · sex 30/10:** a lista da seção 7 inteira demonstrada, nos 3 idiomas, com console limpo, nas máquinas da demo. **Freeze no sábado 31/10.**

### S6 · 01/11 – 07/11 · Acabamento
- Só bug, texto e tradução. README fechado até 04/11. F9.2 (ensaio) em 05–06/11. **Defesa em 07/11.**

---

## 7. Módulo por módulo: o que o avaliador vai pedir

Checklist para C5 e para o ensaio. O módulo só entra no README se **todos** os itens passam.

| Módulo | Demonstração | Tarefas |
|---|---|---|
| Web-based game | Partida co-op e PvP ao vivo; regras e condição de vitória/derrota visíveis na UI | F1.*, F2.5, F3.*, F7.6 |
| Real-time (WebSockets) | Snapshot atualiza todos os clientes; lobby atualiza sem recarregar; desconexão tratada | F2.1–F2.6, F5.2 |
| Remote players | Duas máquinas; throttling de 100 ms sem teleporte; fechar a aba e voltar | F2.7, F2.8, F2.10, F2.12 |
| Multiplayer 3+ | 3+ players (até 5) na mesma Room; troca de alvo justa; todos sincronizados | F1.5, F1.6, F2.6, F2.13 |
| Framework front + back | React com roteamento e estado; FastAPI com dependências e routers | F0.3, F0.4, F7.1 |
| ORM | Modelos SQLAlchemy e migrações Alembic; schema com relações | F5.1, F6.1 |
| Standard user management | Editar perfil, avatar (com padrão), amigos com status online, página de perfil | F6.6, F6.7, F7.5 |
| OAuth 2.0 | Login pela 42 cria ou vincula conta | F6.8, F7.4 |
| Advanced 3D | Ambiente imersivo; técnicas: luz dinâmica com sombra, névoa, partículas, bloom, instancing; 60 fps | F3.1–F3.5, F3.10 |
| Game customization | Pickups de mana/armadura como power-ups; ≥ 2 mapas e ≥ 2 temas; opções ajustáveis; defaults sem escolher nada | F1.9, F3.8, F4.4, F4.5, F7.7 |
| Game statistics | Vitórias/derrotas, ranking, level, histórico (data, resultado, oponentes), conquistas e progressão, leaderboard | F5.3–F5.8, F7.8 |
| Monitoring | Prometheus coletando backend, jogo e exporters; dashboards próprios no Grafana; derrubar o backend e ver o alerta disparar; Grafana só por HTTPS com login | F8.7–F8.11 |
| i18n | 3 idiomas completos, seletor na UI, nenhum texto fixo (inclusive páginas legais, erros e HUD) | F7.2, F7.3 |

---

## 8. Conta de esforço, riscos e ordem de corte

### 8.1 A conta

| Frente | d |
|---|---|
| F0 Fundação | 6 |
| F1 Simulation | 14,5 |
| F2 Netcode | 17 |
| F3 Render 3D | 16 |
| F4 Conteúdo | 5 |
| F5 Partidas e estatísticas | 10,5 |
| F6 Identidade e usuários | 12 |
| F7 Casca web | 16,5 |
| F8 Infra e monitoring | 10,5 |
| F9 Docs e defesa | 5 |
| **Total** | **≈ 113 d** |

Capacidade: 5 pessoas × 5 semanas de construção × 5 dias = **125 d no papel**. Com a realidade de quem estuda (outras entregas, dias perdidos, aprendizado de Three.js, asyncio e React), algo entre **85 e 100 d**. **O escopo de 21 pontos só cabe se o time trabalhar perto do tempo integral**; a folga é pequena. Consequências práticas:

- A estimativa de cada tarefa é o teto, não a meta. Tarefa estourando 50 % vira assunto de reunião, não de madrugada.
- Cortar **dentro** da tarefa antes de cortar módulo: menos inimigos animados, um tema a menos de efeito, 5 conquistas em vez de 10.
- A S6 é para bug, não para terminar feature.

### 8.2 Riscos

| Risco | Sinal precoce | Plano B |
|---|---|---|
| Three.js novo para todo mundo | C1 sem masmorra no `dev.html` | F3 camada mínima: caixas texturizadas + billboards + uma luz; as técnicas "advanced" entram na S3 |
| Prediction diverge (`sim.py` ≠ `applyInput.ts`) | Assert de reconciliação dispara em C3 | Uma pessoa revisa os dois arquivos; teste cruzado Python × TS (F2.7) |
| Auth atrasa e trava o time | C1 sem `me` pelo Nginx | Access de 8 h temporário, refresh na S2 |
| Grafana configurado à mão | Dashboard some depois de `docker compose down -v` | Tudo provisionado por arquivo versionado (F8.9); nada clicado na UI entra na demo |
| Texto não traduzido espalhado | Qualquer string no JSX | Regra de lint (`i18next/no-literal-string`) no CI desde a S1 |
| Warning no console do Chrome | Qualquer um, em qualquer tela | Bug bloqueante desde a S1 |
| 5 players na demo | Laptop engasga com 5 abas | Demo com 3 máquinas; o módulo pede 3+ |
| Intra da 42 demora a liberar o app | Sem `client_id` no fim da S2 | Trocar OAuth por 2FA TOTP (mesmo 1 ponto) |

### 8.3 Ordem de corte (se C4 ou C5 falhar)

Corta-se de baixo para cima, sempre o módulo inteiro, e ele sai do README. Os 14 do fundo não são cortáveis.

| Ordem | Módulo | Pts | Total restante |
|---|---|---|---|
| 1º a sair | i18n (se as traduções não fecharem) | 1 | 20 |
| 2º | Game statistics (se conquistas/ranking não fecharem) | 1 | 19 |
| 3º | Monitoring (se alertas ou acesso seguro não fecharem) | 2 | 17 |
| — | Game customization, Advanced 3D e os 14 da base | — | piso: 17 |

Os três primeiros são os módulos com entrega mais isolada: cortá-los não quebra nada que os outros usam. O time pode reordenar na reunião, desde que a tabela fique escrita aqui. OAuth não está na lista porque tem troca de mesmo valor: se a intra travar, vira 2FA.

---

# Parte 2 — Quem faz o quê

## 9. Divisão entre as 5 pessoas

Alocação fechada em 28/09/2026. Critérios usados:

1. **Carga parecida** (≈ 20–23 d cada, contra ≈ 23 d de média; quem tem papel de PM ou Tech Lead fica com menos tarefa).
2. **Cada caminho é explicável sozinho na defesa**: uma pessoa, um pedaço com interface clara.
3. **Ninguém parado na S1**: quem depende do jogo pronto começa por algo que o jogo precisa.
4. **Três pessoas no jogo**, como o time pediu, separadas pelas costuras Snapshot e `ViewState`.
5. Papéis do subject: **PO**, **PM / Scrum Master**, **Tech Lead**, e todos desenvolvem.

| Caminho | Pessoa (GitHub) | Papel | Frentes | d |
|---|---|---|---|---|
| **1 · Simulation e Prediction** | Roberto (`@robertodelfranco`) | Tech Lead | F1 inteira (incl. PvP), F2.7, F2.13, F3.6, F0.2, F0.5, revisão de `rules.*` | ≈ 21 + revisão |
| **2 · Auth e Netcode** | Augusto (`@augustocesarmd`) | Dev | F6.1–F6.5, F0.3, F2 (menos F2.7 e F2.13), F8.7 | ≈ 23 |
| **3 · Render 3D e conteúdo** | Rafael (`@rflheringer`) | Dev | F3 (menos F3.6), F4 | ≈ 20 |
| **4 · Web, usuários e i18n** | Caio (`@caioosantos`) | PO | F0.4, F7, F6.6–F6.7 | ≈ 21 |
| **5 · Partidas, estatísticas, infra e monitoring** | Akita (`@kanashir0`) | PM / Scrum Master | F0.6, F5, F6.8, F8 (menos F8.7) | ≈ 22,5 + coordenação |

F0.1 e F9 são de todos.

### Caminho 1 — Simulation e Prediction · Roberto (Tech Lead)

- **Faz:** parser, movimento, colisão, inimigos, boss, projéteis, pickups, `CoopRuleset`, `PvpRuleset`, `RoomOptions` na simulação; `applyInput.ts` com o teste cruzado Python × TS, Prediction e Reconciliation no cliente; minimapa; teste de carga do tick. Publica os contratos na S1. Revisa todo PR que mexe em `rules.*` ou `sim.py`.
- **Por quê:** é o port direto do C que você escreveu; na defesa você explica a matemática que já conhece. O `applyInput.ts` é o espelho em TS do movimento de `sim.py`, então quem escreve os dois é quem garante que eles batem. O minimapa é parente do minimapa do Cub3D, e o teste de carga mede a própria Simulation. A Simulation é Python puro, sem rede e sem banco, então não trava ninguém enquanto a infra sobe.
- **Semana a semana:** S1 contratos + parser + movimento · S2 entidades + CoopRuleset + CLI + `applyInput.ts` com teste cruzado · S3 PvP + opções + Reconciliation ligada no cliente · S4 minimapa + par com o Caminho 2 na reconexão (F2.10 depende de F2.7) · S5 teste de carga + folga para revisão e bugs.
- **Aprender antes:** `dataclasses`, funções puras e determinismo, `pytest.mark.parametrize`; TypeScript o suficiente para `applyInput.ts`; Gambetta, *Fast-Paced Multiplayer* partes I–II (prediction e reconciliation); canvas 2D.
- **Explica na defesa:** por que `dt` e não quadro; por que o servidor decide o acerto; por que o cliente prevê, como ele corrige quando o servidor discorda e como o teste cruzado garante que as duas implementações dão o mesmo resultado.
- **Muda em relação ao plano anterior:** a autenticação sai deste caminho (ver Caminho 2); o Tech Lead continua revisando o PR de auth, porque é quem escreveu as decisões da arq. §4. Em 28/09 o bot saiu do escopo e entraram F2.7, F2.13 e F3.6.

### Caminho 2 — Auth e Netcode · Augusto

- **Faz:** pacote do backend, signup/login/refresh/logout, `get_current_user`, middlewares (logging, erros, rate limit); depois `ConnectionManager`, `RoomManager`, WebSocket do jogo, Interpolation, fim de partida, reconexão; `/metrics` com as métricas do backend e do jogo.
- **Por quê:** o netcode só começa quando a Simulation tem entidades (S2). A S1 dessa pessoa vai para a auth, que é pré-requisito de todo mundo. Auth e WebSocket se encontram em `authenticate_ws_token`, então é um caminho contínuo, não dois assuntos. A instrumentação fica aqui porque as métricas moram nos middlewares e no laço do `RoomManager`, que são código deste caminho.
- **Semana a semana:** S1 pacote + auth mínima · S2 refresh + middlewares + WS com 1 player · S3 N players + interpolation + fim de partida + `/metrics` · S4 reconexão · S5 teste com throttling.
- **Aprender antes:** JWT (RFC 7519), Argon2id e rotação de refresh (RFC 9700), cookies `HttpOnly`/`SameSite`; `asyncio` (tasks, cancelamento, `Queue`); Gambetta partes I–IV; tipos de métrica do Prometheus (counter, gauge, histogram).
- **Explica na defesa:** fluxo de tokens e rotação com detecção de reuso; tick fixo e Snapshot; interpolation dos outros players; por que o tick é histograma e o login é counter.
- **Atenção:** é o caminho mais pesado e o que está no caminho crítico. O Tech Lead faz par nas primeiras horas de F2.3. O F2.7 agora é do Tech Lead, e F2.6 e F2.10 encostam nele: os dois combinam na S2 a interface do cliente (onde a Prediction entra no laço de Input e de Snapshot).

### Caminho 3 — Render 3D e conteúdo · Rafael

- **Faz:** a cena Three.js inteira (paredes, câmera, Pointer Lock, billboards, porta, mão, luzes, névoa, partículas, bloom, temas, áudio; o minimapa é do Caminho 1) e o conteúdo do jogo (mapas, números, especificação da HUD, lista de conquistas e opções).
- **Por quê:** o render só consome `ViewState`, então essa pessoa trabalha desde o primeiro dia contra `snapshot.example.json`, sem esperar servidor. O conteúdo fica junto porque mapas, temas e HUD são decisões visuais.
- **Semana a semana:** S1 `dev.html` com a masmorra · S2 entidades e porta · S3 técnicas "advanced" + mapas PvP · S4 temas, efeitos, áudio · S5 performance e balanceamento.
- **Aprender antes:** fundamentos de Three.js (cena, câmera, material, luz, `InstancedMesh`, `Sprite`, `EffectComposer`); Pointer Lock API.
- **Explica na defesa:** cada técnica "advanced" e por que ela está ali; como o render não sabe que existe rede.

### Caminho 4 — Web, usuários e i18n · Caio (PO)

- **Faz:** a casca React, roteamento, contexto de auth, i18n em 3 idiomas, páginas legais, login/cadastro, perfil e amigos (telas **e** backend de perfil, avatar e amigos), `/play` com a HUD, lobby, telas de estatísticas.
- **Por quê:** o módulo *Standard user management* fica inteiro com uma pessoa, de ponta a ponta, o que torna a explicação na defesa simples. Quem tem o papel de PO valida cada módulo contra o texto do subject, e a maior parte dessa validação é visível nas telas.
- **Semana a semana:** S1 casca + i18n + login · S2 páginas legais + `/play` + lobby · S3 perfil e amigos (back e front) + HUD · S4 opções no lobby + telas de estatística · S5 traduções completas + console limpo + responsivo.
- **Aprender antes:** React com TypeScript, `react-router`, `react-i18next`; o contrato de auth (arq. §9.1); FastAPI `Depends` o suficiente para F6.6–F6.7.
- **Explica na defesa:** como o i18n cobre todo texto; como a HUD recebe estado do jogo sem conhecer o jogo; o fluxo de avatar validado nos dois lados.
- **Papel de PO:** mantém o backlog no board, prioriza, e roda o checklist da seção 7 em cada checkpoint.

### Caminho 5 — Partidas, estatísticas, infra e monitoring · Akita (PM)

- **Faz:** Alembic e schema (responsável pelo schema de partidas), lobby no backend, `record_match_result`, estatísticas, ranking, level, conquistas, leaderboard; OAuth 42; Nginx com TLS, CI, compose, README e demo; Prometheus, exporters, dashboards e alertas do Grafana, acesso seguro.
- **Por quê:** a infra da S1 é curta e já tem base no repo, então sobra espaço para uma frente de backend inteira. Partidas e estatísticas se encontram com a infra no banco (migrações no `entrypoint`, schema no README). O OAuth é uma tarefa curta e isolada da S4. O monitoring é compose, Nginx e arquivos de configuração, o mesmo terreno da infra que já é deste caminho.
- **Semana a semana:** S1 TLS + CI + Alembic · S2 lobby + compose final · S3 `record_match_result` + README esqueleto + Prometheus e exporters · S4 estatísticas, conquistas, leaderboard, OAuth, dashboards e Grafana atrás do Nginx · S5 alertas + setup da demo.
- **Aprender antes:** SQLAlchemy 2.0 assíncrono e Alembic; Nginx `proxy_pass` com upgrade de WebSocket; `mkcert`; RFC 6749 §4.1 para o OAuth; Prometheus (`scrape_configs`, PromQL básico, `rate` e `histogram_quantile`, regras de alerta) e provisioning do Grafana.
- **Explica na defesa:** o schema e suas relações; por que estado de partida nunca vai para o banco; idempotência de `record_match_result`; o fluxo do OAuth com `state`; o que cada dashboard mostra, como o alerta dispara e por que o Prometheus não é acessível de fora.
- **Papel de PM:** reunião de segunda, checkpoints de sexta, blockers, prazos da seção 3.

### Alternativas que o time pode preferir

- **F8.7 (métricas) no Caminho 5.** Deixa o Caminho 2 mais leve, com o custo de o Caminho 5 mexer nos middlewares e no laço do `RoomManager`, que não são código seu.
- **Minimapa de volta ao Caminho 3.** Se o Tech Lead precisar de mais folga para revisão, o F3.6 volta para o render sem mexer em interface nenhuma (ele só consome `ViewState`).
- **Contingência:** se uma pessoa sair ou travar, o Caminho 4 (PO) absorve telas e o Caminho 1 (Tech Lead) absorve backend. Nunca o contrário.

---

## 10. Docs atualizados depois da reunião

Feito em 28–29/09, com a alocação fechada:

- [x] **`AGENTS.md`**: recebeu o conteúdo do antigo `CLAUDE.md`, com "Time e slices" na alocação nova (nomes e GitHub), escopo de 21 pontos, este plano como fonte e a regra de i18n entre as invariantes. O `CLAUDE.md` ficou só com `@AGENTS.md`.
- [x] **`CONTEXT.md`**: **Slice** redefinida (o conjunto de frentes de uma pessoa); adicionados **Frente**, **Checkpoint**, **Ruleset**, **Pickup** (substitui Item), **Mana**, **Armor**, **Theme**, **ViewState**, **Renderer** e **Achievement**; **Mode** atualizado.
- [x] **Arquitetura**: bot removido (§5, §6, §8.3, §10, §14, §15); monitoring descrito na §12.1 e no contrato 12.
- [ ] [catacombs42-ideias-e-modulos.md](catacombs42-ideias-e-modulos.md) fica como está: é o registro da proposta ampliada, não o escopo vigente.
- [ ] [roadmap-roberto.md](roadmap-roberto.md) é pessoal e anterior a 28/09; o Roberto decide se atualiza.

Docs do time: `AGENTS.md`, `CONTEXT.md`, [catacombs42-web-arquitetura.md](catacombs42-web-arquitetura.md), este plano e [transcendence.md](transcendence.md), mais [catacombs42-ideias-e-modulos.md](catacombs42-ideias-e-modulos.md) como referência.
