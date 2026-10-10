# Caminho 5 — Partidas, estatísticas, infra e monitoring · Akita

> Escopo da Slice 5, de ponta a ponta: o que é meu, o que eu faço sozinho, de quem eu dependo e o que eu explico na defesa. A alocação está no [plano §9](../catacombs42-plano-de-tarefas.md#9-divisão-entre-as-5-pessoas); as estimativas e os "pronto quando" são copiados do [plano §5](../catacombs42-plano-de-tarefas.md#5-tarefas-por-frente), sem reinterpretação. Vocabulário: [CONTEXT.md](../../CONTEXT.md).
>
> Papel no time: **PM / Scrum Master**. Contratos que eu escrevo: [rooms.md](../contracts/rooms.md), [matches-api.md](../contracts/matches-api.md), [infra.md](../contracts/infra.md).

## 1. Inventário

**24–24,5 d de tarefa** (≈ 23–23,5 descontando que F8.7 é do Augusto), mais coordenação. F6.8 cresceu de 2 d para 2,5–3 d com o segundo provedor (10/10).

### F0 e F5 — partidas e estatísticas (11 d)

| ID | Tarefa | d | Depende de | Sem. | Pronto quando |
|---|---|---|---|---|---|
| F0.6 | 5 membros como colaboradores; issues criadas a partir dos IDs; board com as colunas | 0,5 | F0.1 | S1 | toda tarefa de S1 e S2 tem issue com responsável |
| F5.1 | Alembic configurado (o `entrypoint` roda `alembic upgrade head`); modelos `matches` e `match_players` | 1,5 | F0.3 | S1 | migração sobe do zero no compose |
| F5.2 | Lobby: `POST /api/matches`, listar Rooms abertas, entrar, sair, pronto, iniciar; lobby em tempo real pelo `ConnectionManager` | 3 | F2.3, F6.4 | S2 | dois usuários veem o lobby mudar sem recarregar; corrida da última vaga resolvida no `join` |
| F5.3 | `record_match_result` idempotente; `startup` marca `running` → `aborted` | 1 | F5.1 | S3 | chamada dupla grava uma vez |
| F5.4 | `player_stats` agregado por modo | 1 | F5.3 | S4 | bate com os `match_players` |
| F5.5 | Ranking (Elo no PvP) e level por XP | 1 | F5.4, F4.6 | S4 | ranking muda depois de uma partida PvP |
| F5.6 | Histórico paginado: data, modo, mapa, resultado, oponentes/companheiros | 1 | F5.3 | S4 | `GET /api/users/{id}/matches` |
| F5.7 | Conquistas (≥ 5) em `user_achievements`, desbloqueadas no `record_match_result` | 1,5 | F5.3, F4.6 | S4 | desbloquear uma conquista numa partida real |
| F5.8 | Leaderboard | 0,5 | F5.5 | S4 | `GET /api/leaderboard` |

### F6.8 — OAuth com a 42 e o Google (2,5–3 d)

| ID | Tarefa | d | Depende de | Sem. | Pronto quando |
|---|---|---|---|---|---|
| F6.8 | OAuth 2.0 com a 42 e o Google (Authorization Code + `state`, PKCE onde o provedor aceitar), um módulo genérico com um adaptador por provedor, emitindo os mesmos tokens ([auth.md](../contracts/auth.md) §2.8); **cadastrar os dois apps antes do código** | 2,5–3 | F6.3 | S4 (Google pode ir para a S5) | login pela 42 e pelo Google cria ou vincula conta |

### F8 — infra e monitoring (9,5 d, sem F8.7)

| ID | Tarefa | d | Depende de | Sem. | Pronto quando |
|---|---|---|---|---|---|
| F8.1 | Nginx com TLS (`mkcert`), redirect 80 → 443, `/api/`, `/ws/` com upgrade, um worker | 1,5 | — | S1 | cadeado sem warning no Chrome |
| F8.2 | `build-check.yml`: build das imagens, `pytest`, `vitest`, lint | 1 | F0.3, F0.4 | S1 | CI verde num PR |
| F8.3 | `.env.example` completo, healthchecks, `entrypoint` com migração, um comando sobe tudo | 1 | F5.1 | S1–S2 | clone limpo + `.env` + `docker compose up` funciona |
| F8.4 | Build de produção do frontend servindo os assets do jogo | 0,5 | F0.4 | S2 | sem Vite dev server no compose final |
| F8.5 | Esqueleto do README com as seções do cap. VI (inclusive o diagrama do schema) | 1 | — | S3 | cada pessoa sabe onde escrever a própria parte |
| F8.6 | Setup da demo: 2–3 máquinas na mesma rede com a CA do `mkcert` confiável | 0,5 | F8.1 | S5 | ensaio de C5 feito nessas máquinas |
| F8.8 | Prometheus no compose com `scrape_configs` do backend e dos exporters; retenção; sem porta publicada | 1 | F8.7 | S3 | todos os targets `UP` na página de status |
| F8.9 | Grafana com datasource e dashboards provisionados por arquivo versionado | 1,5 | F8.8 | S4 | `docker compose down -v && up` e os dashboards voltam sozinhos |
| F8.10 | Regras de alerta, com roteiro para disparar uma ao vivo | 1 | F8.8 | S5 | derrubar o backend e ver o alerta em *firing* |
| F8.11 | Acesso seguro: Grafana só pelo Nginx com TLS e login; Prometheus e `/metrics` sem acesso externo | 0,5 | F8.9, F8.1 | S4 | sem login não entra; porta do Prometheus não responde de fora |

### F9 — de todos

F9.1 (minha parte do README) na S5; F9.2 (ensaio) na S6.

## 2. O que eu faço sozinho

Nada aqui espera ninguém. É por onde eu começo quando algum bloqueio aparecer.

| Tarefa | Por que é solo |
|---|---|
| **F8.1** Nginx + TLS | arquivo de configuração; só preciso dos nomes de serviço, que são meus |
| **F8.3** compose, `.env.example`, healthchecks | a migração no `entrypoint` é a única parte que espera F5.1 |
| **F8.2** CI | os quatro primeiros passos já existem; `pytest`/`vitest`/lint entram conforme F0.3 e F0.4 chegarem |
| **F8.5** README esqueleto | o diagrama do schema sai do meu [rooms.md](../contracts/rooms.md) |
| **F8.8** Prometheus + exporters | `node-exporter` e `postgres-exporter` ficam `UP` **sem** o `/metrics` do backend; só o target do backend fica `DOWN` até F8.7 |
| **F8.9 / F8.11** Grafana provisionado e atrás do Nginx | os dashboards de host e de Postgres não dependem de ninguém |
| **F8.10** alertas | `up == 0` do Postgres e dos exporters já dá para disparar ao vivo antes de o backend ter métrica |
| **F8.6** demo | depende só de F8.1 |
| **F6.8** OAuth 42 e Google | isolado do resto; o cadastro dos dois apps (intra e Google Cloud Console) é o primeiro passo e dá para fazer de casa com `https://localhost` |
| **F0.6** issues e board | depende só de a reunião fechar os "Em aberto" |

## 3. De quem eu dependo

| Preciso de | De quem | Para quê | Até |
|---|---|---|---|
| **F0.3**: pacote `backend/app/` com `create_app()`, `pydantic-settings`, envelope de erro, `pytest` | Augusto | F5.1 não nasce fora do pacote, e meus testes usam o `conftest` dele | ⚠️ início da S2; ainda sem issue em 10/10, **bloqueia F5.1 (#29)** |
| **[auth.md](../contracts/auth.md)**: tabelas de usuários, `CurrentUser`, envelope, lista de `code`, fluxo OAuth | Augusto | diagrama do schema, migração inicial, toda rota de F5.2, F6.8 | ✅ entregue em 07/10 (PR #18); assinar em 12/10 |
| **[ws-manager.md](../contracts/ws-manager.md)**: `ConnectionManager` e `/ws/app` | Augusto | lobby em tempo real (F5.2) e `match_started` | ✅ entregue em 07/10 (PR #18); assinar em 12/10 |
| **F2.3**: `RoomManager` implementado, com `set_ready` | Augusto | F5.2 inteira | S2 |
| **F2.9**: `record_match_result` chamado uma vez no `game_over` | Augusto | F5.3 | S3 |
| **F8.7**: `/metrics` com as cinco séries | Augusto | o target do backend no Prometheus e os dashboards de jogo e backend | S3 |
| **[room-options.md](../contracts/room-options.md)** | Rafael | validação de `options` no `POST /api/matches` | ✅ entregue; falta a normalização (D8, §5.3 dele) |
| **F4.6**: fórmula de XP/level, fórmula de Elo, lista de ≥ 5 conquistas com código | Rafael | F5.5 e F5.7 sem inventar regra | **início da S3**; pendente |
| **[i18n.md](../contracts/i18n.md)**: limite e URL do avatar, idioma padrão, API de usuários | Caio | `client_max_body_size` do Nginx, `/media/` (infra.md §5.2), default de `preferred_language` na migração | ⚠️ era para 04/10; rascunho no PR #20, aberto desde 08/10 e ainda fora do `main` |
| Campos das telas de lobby, resultado, histórico e estatísticas | Caio | fechar [matches-api.md](../contracts/matches-api.md) e criar os índices certos de uma vez | reunião 04/10 |
| Revisão do `MatchResult`: a Simulation conta cada número? | Roberto | F5.3 e F5.4 | reunião 04/10 |
| **F0.4**: Vite + React + framework CSS | Caio | F8.2 (lint e `vitest` no CI) e F8.4 (build de produção) | S2; pendente |

**Dependência cruzada que eu devo a outros:** o Augusto precisa do meu [infra.md](../contracts/infra.md) para saber o path que o backend enxerga e o cabeçalho de IP real (as perguntas 4 e 5 dele); o Caio precisa do meu [matches-api.md](../contracts/matches-api.md) para montar lobby e estatísticas; o Roberto e o Augusto precisam do meu [rooms.md](../contracts/rooms.md) para `MatchResult` e `RoomManager`. **Esses três arquivos são o meu caminho crítico para o time, não o meu código.**

## 4. Decisões a travar antes de escrever código

Cada uma destas, decidida depois do código, custa um refactor que atravessa a Slice de mais alguém. Todas estão escritas nos contratos; esta lista existe para eu conferir antes de abrir qualquer PR de implementação.

1. **`match_id`, nunca `room_id`** — em rota HTTP, no path do WebSocket, na rota do SPA e no `RoomManager`.
2. **O backend enxerga `/api/...` inteiro** — define o `Path` do cookie de refresh, a rota do log e a label `route` do Prometheus.
3. **Cadeia linear no Alembic, com `users` antes de `matches`** — uma migração inicial única e o CI conferindo uma só cabeça.
4. **`ready` e todo estado de Lobby vivem na memória** — o banco só recebe o Match ao final.
5. **Estatística lê `match_players.won`, nunca `matches.result`.**
6. **`options.map` é o nome de um arquivo `[a-z0-9_]+` em `backend/maps/{coop,pvp}/`** — não é caminho nem id de tabela.
7. **Nome de serviço na rede (`db`), não nome de container.**
8. **Nenhuma coluna de partida em `users`** — `player_stats` é minha, `users` é do Augusto.

## 5. Ordem de execução

No calendário replanejado ([replanejamento-e-board.md](../pm/replanejamento-e-board.md)).

| Semana | O que eu entrego |
|---|---|
| **S1** · até 10/10 | ✅ os 3 contratos · ✅ F0.6 issues (#27–#34) e board · ✅ **F8.1** TLS (#35) · **F8.2** CI: passo 1 (`pytest`) no PR #38, `vitest` e lint esperam F0.4 · **F5.1** Alembic quando F0.3 existir · cadastro dos apps OAuth (42 e Google) passou para a S2 |
| **S2** · 11–17/10 | **F5.2** lobby · **F8.3** compose final com migração no `entrypoint` · **F8.4** build de produção |
| **S3** · 18–24/10 | **F5.3** `record_match_result` · **F5.6** histórico (puxado da S4: só depende de F5.3) · **F8.5** README esqueleto · **F8.8** Prometheus e exporters |
| **S4** · 25–31/10 | **F5.4** stats · **F5.5** Elo e level · **F5.7** conquistas · **F5.8** leaderboard · **F6.8** OAuth (42 primeiro, Google em seguida) · **F8.9** dashboards · **F8.11** acesso seguro |
| **S5** · 01–14/11 | Google do F6.8, se a S4 estourar · **F8.10** alertas · **F8.6** demo · **F9.1** minha parte do README · folga para bug e revisão |
| **S6** · 15–21/11 | bug, README fechado, ensaio |

**O gargalo é a S4:** F5.4–F5.8 + F6.8 + F8.9 + F8.11 somavam 9 d numa semana de 5, e o segundo provedor do F6.8 soma mais 0,5–1 d. Mitigação já aplicada acima: F5.6 (1 d) foi puxado para a S3, porque só depende de F5.3 — a S4 da tabela fica em **8,5–9 d**, ainda acima da capacidade. Se ainda estourar, o Google vai para a S5 (a 42 sozinha já fecha o módulo, [auth.md](../contracts/auth.md) §5.13) e o que sai em seguida é F5.8 (leaderboard, 0,5 d, última peça do módulo de estatísticas). Com dois provedores, o 2FA TOTP deixa de ser o Plano B: se um provedor travar no cadastro, o outro sozinho vale o mesmo ponto. Decido isso no checkpoint C3, em 23/10, não na véspera.

## 6. O que eu explico na defesa

Por módulo que passa pela minha Slice (plano §7):

| Módulo | O que eu abro e explico |
|---|---|
| **ORM** (Minor) | os modelos SQLAlchemy, as migrações Alembic e por que a cadeia é linear; o schema com as relações, no diagrama que eu desenhei |
| **Game statistics & match history** (Minor) | os seis itens que o subject cobra (vitórias/derrotas, ranking, level, histórico com data/resultado/oponentes, conquistas e progressão, leaderboard), cada um apontando para a rota e a tabela; por que `player_stats` é agregada; por que estatística lê `match_players.won` |
| **Monitoring** (Major) | as cinco coisas que o subject cobra: Prometheus coletando, dois exporters, dashboards nossos provisionados por arquivo, um alerta indo para *firing* ao vivo, Grafana só por HTTPS com login; por que o tick é histograma e o login é counter; por que o Prometheus não responde de fora |
| **OAuth 2.0** (Minor) | o fluxo Authorization Code com a 42 e o Google, para que servem o `state` e o PKCE, e como a conta é criada ou vinculada (e por que só com e-mail confiável) |
| **Real-time** (Major, parte minha) | o lobby mudando sem recarregar, por `/ws/app`, e por que a lista de Rooms abertas vem da memória |
| **Obrigatórios** | `docker compose up` num comando; HTTPS em todo o backend e `wss://`; `.env` fora do git; schema claro com relações; README com as seções do cap. VI |

Respostas que eu preciso ter na ponta da língua: **por que estado de partida em andamento nunca vai para o banco**; **por que `record_match_result` é idempotente e como** (a transição `running → finished` só acontece uma vez, travada no `SELECT ... FOR UPDATE`); **por que um worker só**; **onde o HTTPS termina e por que o cookie continua `Secure`**.

A "modificação rápida" que podem pedir na minha parte (subject, cap. VII): uma conquista nova no catálogo, uma coluna nova em `match_players` com migração, um painel novo no dashboard, um campo novo no `RoomInfo`. Ensaiar as quatro na S6.

## 7. O papel de PM é escopo, não bônus

Tem tempo próprio e é cobrado na defesa ("como o trabalho foi organizado e dividido" — subject §II.1.2):

- **Reunião de segunda:** o que fechou na semana, o que travou, o que muda no plano.
- **Checkpoint de sexta:** a demo de integração com critério observável (C1–C5). Checkpoint não fechado é o assunto da segunda.
- **Blockers:** manter a tabela da seção 3 viva — cada dependência minha e dos outros com dono e data.
- **Board:** issues no formato de [replanejamento-e-board.md](../pm/replanejamento-e-board.md), uma por ID do plano.
- **Regra de estouro:** tarefa passando 50 % da estimativa vira assunto de reunião, não de madrugada (plano §8.1).

---

> **Links para contratos que ainda não estão no `main`:** `i18n.md` (Caio, PR #20).
