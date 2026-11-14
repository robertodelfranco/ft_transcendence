# O que o Akita fez no projeto

> Caminho 5 · Partidas, estatísticas, infra e monitoring. Papel no time: **PM / Scrum Master**. Situação em 14/11/2026. As fontes são o [caminho-5-akita.md](../slices/caminho-5-akita.md), os contratos [rooms.md](../contracts/rooms.md), [matches-api.md](../contracts/matches-api.md) e [infra.md](../contracts/infra.md), as atas em `docs/pm/` e o histórico de PRs.

## Resumo

### O que eu entreguei

| Área | Entregas | PRs principais |
|---|---|---|
| **Gestão (PM)** | replanejamento S1–S6 (defesa de 07/11 para 21/11), formato de issue, board, ritos de segunda e sexta, atas, página de status executivo com previsão por ritmo | #15, #39, #73, #151, #169, #186, #233 |
| **Contratos** | `rooms.md` (Room, `MatchResult`, schema), `matches-api.md` (lobby, resultado, estatísticas), `infra.md` (rotas, TLS, `.env`, monitoring) | #15, #56, #165 |
| **Banco (F5.1)** | Alembic, migração inicial `0001_initial` e modelos de partidas | #78 |
| **Lobby (F5.2)** | rotas de criar, listar, entrar, sair, pronto e iniciar; `GET /api/maps`; lobby em tempo real por `/ws/app` | #84, #128 |
| **Resultado (F5.3)** | `record_match_result` idempotente, `abort_unfinished` no startup, `MatchDetail` em `/result` | #141, #200 |
| **Estatísticas (F5.4–F5.8)** | `player_stats`, XP/level, Elo, histórico paginado, conquistas, leaderboard | #222, #223, #230, #231 |
| **OAuth (F6.8)** | login pela 42 (Authorization Code + `state`), log de acesso sem query string | #167, #229 |
| **Infra (F8.1–F8.5)** | Nginx com TLS e redirect, CI, healthchecks e migração no entrypoint, `/media/`, esqueleto do README | #35, #38, #94, #113, #129, #233 |
| **Monitoring (F8.8–F8.11)** | Prometheus e 2 exporters, Grafana provisionado por arquivo, Grafana só pelo Nginx com login, 4 regras de alerta | #152, #181, #182, #199, #234 |
| **Demo na 42 (F8.6)** | roteiro e testes com 1 PC (17/10) e 3 PCs (01/11) no cluster; 302 para o `PUBLIC_HOST` | #114, #130, #185, #239 |
| **Extras e correções** | voltar à partida em andamento (`GET /api/matches/current`), corrida num teste do Augusto, `name` nos formulários, refresh com cookie morto | #188, #287, #298, #300 |
| **README (F9.1)** | minha parte: features, módulos, contribuição, resources | #272 |

Módulos do subject que passam pela minha Slice: **ORM**, **Game statistics & match history**, **Monitoring**, **OAuth 2.0** e a parte de lobby do **Real-time**. Em aberto: F8.6 (#163), que fecha com o ensaio do C5.

### As regras e decisões que eu fui tomando

1. **O banco só recebe o Match no fim.** Lobby, `ready` e Rooms abertas vivem na memória.
2. **Estatística lê `match_players.won`**, nunca `matches.result`.
3. **`record_match_result` é idempotente pela própria linha do Match** (`SELECT ... FOR UPDATE` em `status = 'running'`).
4. **Tudo do fim de partida numa transação só:** jogadores, `player_stats`, XP, Elo e conquistas.
5. **`player_stats` é agregada**, e nenhuma coluna de partida vai para `users`.
6. **Migração em cadeia linear, uma cabeça conferida pelo CI.**
7. **Um User, uma Room**; lobby sem TTL, e quem fica offline sai dele.
8. **A API entrega valores prontos** (`win_rate`, `xp_to_next_level`, `duration_s`): a tela não conhece fórmula.
9. **Resultado em rota própria (`/result`)**, separada da Room viva.
10. **O backend vê o caminho inteiro (`/api/...`)**; o IP real vem do Nginx, que substitui o `X-Forwarded-For`.
11. **`PUBLIC_HOST` é a única fonte do endereço público**; outro nome leva 302 para ele.
12. **Sem certificado, o proxy gera um self-signed** em vez de não subir.
13. **Monitoring enxuto:** 3 dashboards próprios, alertas no Prometheus sem Alertmanager, Grafana sem volume e com admin obrigatório.
14. **OAuth só com a 42**; vincula conta só com e-mail confiável. O Google saiu do escopo.
15. **Gestão por número:** concluído é PR mergeado; tarefa pela metade não conta; módulo pela metade vale zero.

---

## Detalhes

### 1. Gestão do projeto (PM / Scrum Master)

- **Replanejamento (04/10, [replanejamento-e-board.md](replanejamento-e-board.md)).** Em 04/10 não havia código de produto e a S1 ainda não tinha terminado. Propus admitir isso: a S1 virou duas semanas, a S5 também (é onde a conta de dias-pessoa não fechava) e a defesa foi de 07/11 para 21/11. S2–S4 continuaram com uma semana porque têm checkpoint de integração, e esticá-las só adiaria a descoberta de bugs. Freeze em 14/11; depois dele, só bug, texto e tradução, e módulo que não passou no C5 sai do README.
- **Board e issues.** Título com o ID do plano (`F5.3 · ...`), corpo com Contexto, Pronto quando (copiado do plano, sem checklist inventado), Contrato e Dependências. Labels por Slice, frente e semana, sem label de prioridade: a semana é a prioridade. Branch `<nº>-<slug>` e `Closes #<nº>` obrigatório, porque é o que move o card. Colunas reais do board (`Todo / In Progress / In Review / Done / Failed`), aceitas em 12/10.
- **Ritos.** Reunião de segunda (o que fechou, o que travou, o que muda) e checkpoint de sexta ("rodar junto", não "mostrar o que fiz"). Tarefa que passa de 50 % da estimativa vira assunto de reunião. Atas de 12/10 e 19/10 com o que foi decidido, o que ficou para depois e o dono de cada pendência.
- **Status executivo ([status/](status/README.md)).** Desde 26/10, `status.py` coleta as issues e gera uma página para a reunião, porque o time achava que estava bem só por ver o jogo rodando. As regras de contagem são minhas: a base é o plano pesado em dias; concluído é PR mergeado; tarefa em partes só conta inteira; escopo adicionado fica fora da %; módulo garantido só com todas as tarefas fechadas. As previsões são de três tipos: a do time (o que falta ÷ ritmo), a conservadora (pior semana) e "cada um no seu", que mostra a carga mal distribuída. Na de 12/11: 93,3 % do plano e 21/21 pontos garantidos.
- **Cortes de escopo.** Tirei o Google do OAuth (#164, 09/11): a 42 sozinha fecha o módulo. Com a entrega antecipada para 14/11 (decisão do time em 12/11), atualizei as datas do status.

### 2. Contratos

Escrevi três contratos e assinei, como consumidor, `auth.md`, `ws-manager.md` e `room-options.md`. A regra que segui: o contrato é o caminho crítico para o time, mais que o meu código. O Caio montou as telas de estatística contra o `matches-api.md` (com MSW) antes das rotas existirem, e o Augusto e o Roberto implementaram `RoomManager` e `MatchResult` pelo `rooms.md`. Antes de abrir qualquer PR de implementação, eu conferia as oito "decisões a travar" do [caminho-5-akita.md](../slices/caminho-5-akita.md) §4, porque mudar qualquer uma depois do código vira refactor na Slice de outra pessoa.

### 3. Banco e schema (F5.1, módulo ORM)

- **Uma migração inicial e cadeia linear** ([rooms.md](../contracts/rooms.md) decisão 4). Duas pessoas gerando migração na mesma semana criam duas cabeças, e aí o `upgrade head` falha. A `0001_initial` foi escrita por mim a partir do `auth.md` e do `rooms.md`, porque `matches.created_by` precisa de `users`. O CI roda `alembic heads` e reprova com mais de uma linha. O `entrypoint` roda `alembic upgrade head`.
- **Nenhuma coluna de partida em `users`** (decisão 8). `users` é do Augusto; `player_stats` é minha. Assim nenhuma Slice migra a tabela da outra.
- A migração já nasceu com `player_stats`, `user_achievements`, `xp_gained`, `elo_*` e os índices: F5.4–F5.8 não precisaram de migração nova.

### 4. Lobby (F5.2)

- **Rooms abertas vêm da memória** ([matches-api.md](../contracts/matches-api.md) decisão 1; [rooms.md](../contracts/rooms.md) decisão 2). O banco não sabe quem está no lobby agora, e gravar `ready` geraria escrita a cada clique e um estado que o reinício tornaria mentira.
- **`ready` é rota própria, não `PATCH`** (decisão 2): as `options` são imutáveis depois do `create`, e a rota dedicada deixa isso visível no contrato.
- **`lobby_update` manda o `RoomInfo` inteiro** (decisão 3): estado inteiro é idempotente e não exige reconciliação na tela quando uma mensagem se perde.
- **Host sucedido, não eleito** (decisão 3): sai o host, assume quem entrou primeiro. Lobby vazio é destruído no próprio `leave` e o Match vira `aborted`, sem job de varredura.
- **Um User, uma Room** (decisão 9): criar ou entrar em outra dá `409 already_in_other_match`, porque dois sockets `game` do mesmo User derrubariam um ao outro. A troca automática foi descartada por ser efeito colateral escondido.
- **Lobby sem TTL; quem fica offline sai** (decisão 10), pelo `on_presence_change` com 5 s de atraso, para recarregar a página não contar. Em partida `running` não vale: aí é o Grace period.
- **`options` validadas por Mode**: um modelo Pydantic por Mode, `extra="forbid"`, campo errado dá `422 invalid_options`. Os defaults moram na dataclass da Simulation; a API só acrescenta os limites.
- **Rate limit em `POST /api/matches`** (decisão 6): é a única rota que aloca memória por requisição.
- Registrei no `rooms.md`, como dono do contrato, o que veio depois (implementado por outras Slices): Solo como coop com uma vaga e mínimo de jogadores pela capacidade (#241, decisão 12) e o `start` exigindo todos prontos, o host incluído (#279, decisão 13).
- **Voltar à partida (#287):** `GET /api/matches/current` (200 com o `RoomInfo` ou 204) e uma faixa no `Layout`, porque quem saía do `/play` tinha 30 s de Grace period e nenhum caminho de volta. A rota fica antes de `/matches/{match_id}`, senão `current` cairia no `int` do path e daria 422.

### 5. Fim de partida (F5.3)

- **`record_match_result` idempotente** ([rooms.md](../contracts/rooms.md) §2.5, decisão 5). `SELECT ... FOR UPDATE` no Match com `status = 'running'`; sem linha, devolve `[]`. A transição `running → finished` só acontece uma vez, então não precisa de tabela de controle. As PKs de `match_players` e `user_achievements` são a segunda rede.
- **Tudo numa transação, em ordem:** `match_players` → `player_stats` (contadores, XP, level, Elo) → `user_achievements` (`ON CONFLICT DO NOTHING`) → `matches` para `finished`. Se cair no meio, cai tudo, e o Match fica `running` até o próximo startup abortá-lo.
- **A função recebe a fábrica de sessões e não toca em WebSocket.** Devolve as conquistas desbloqueadas e a Room emite `achievement_unlocked`. Assim a função é testável sem rede.
- **`abort_unfinished` no startup** marca `lobby` e `running` órfãos como `aborted`. Só é seguro porque há um worker: o `RoomManager` de um processo novo nasce vazio.
- **`MatchDetail` em `/result`, lido do banco** ([matches-api.md](../contracts/matches-api.md) decisão 8, assinada pelo Caio). Com duas rotas, cada uma tem um formato só, e o "ainda não gravado" vira um `409 match_not_finished` que a tela trata.

### 6. Estatísticas (F5.4–F5.8, módulo Game statistics)

- **`player_stats` agregada por `(user_id, mode)`** (decisão 6): leitura é muito mais frequente que escrita, e o agregado evita um `SUM()` por request. A consistência fica numa função só, idempotente e testada.
- **Estatística lê `match_players.won`** (decisão 1): no PvP, `matches.result` é "alguém venceu", e a mesma partida é vitória para um e derrota para o outro. O histórico devolve o `result` do ponto de vista de quem pediu.
- **Fórmulas puras em `app/matches/progression.py`** (do `progression.md` do Rafael): XP = participação + desempenho com teto + vitória; level = `1 + isqrt(xp // 100)` (inteiro, sem erro de float); Elo com K = 32, arredondamento de metade para longe do zero, **só no PvP** (decisão 7: no coop não há adversário).
- **Regras que eu decidi na implementação:** quem termina desconectado conta em `player_stats`, mas ganha 0 de XP e nenhuma conquista; `win_rate` com 3 casas; User sem linha em `player_stats` recebe zeros (level 1, Elo 1000); `xp_level_start` na resposta para a barra de level começar no nível atual (pedido da revisão da F7.8).
- **Histórico (#223):** ordem `ended_at DESC, match_id DESC`, `page` de 1 a 10 000 (422 fora), página além do total devolve 200 vazio, partidas `aborted` não aparecem.
- **Conquistas (#230):** catálogo numa tabela única `ACHIEVEMENTS` (7 conquistas), servido pela API para o front só traduzir o `code`; desbloqueio dentro da mesma transação do resultado, para a tela de fim nunca ver a lista vazia; `unlocked_at = ended_at`.
- **Leaderboard (#231):** lê de `player_stats` (a conta anonimizada some sozinha); `mode` obrigatório; posição única com desempate valor ↓, `wins` ↓, `user_id` ↑; só entra quem jogou aquele Mode.
- **Anonimização (#221, do Augusto):** na revisão, decidi que ela também apaga `player_stats` e `user_achievements`, porque são dados da pessoa, não da partida.

### 7. OAuth com a 42 (F6.8)

- **Authorization Code com `state`**, num módulo genérico (`app/auth/oauth.py`) com um adaptador por provedor, emitindo os mesmos tokens do login por senha. O callback nunca devolve token na URL: grava o cookie de refresh e redireciona.
- **Sem PKCE na 42:** testei o fluxo à mão em 19/10, e a intra ignora o PKCE.
- **E-mail da 42 é confiável para vincular** (`auth.md` decisão 20), porque é administrado pela escola. Com e-mail não confiável, o callback não cria nem vincula conta.
- **A conta nova nasce no idioma da tela**, guardado no cookie `oauth_state`.
- **Log de acesso sem query string (#229):** o `code` e o `state` do OAuth não podem ficar no log do Nginx nem do backend. Há um passo de CI que confere isso.
- **Google fora do escopo (#164):** o módulo vale 1 ponto com um provedor ou com dois.

### 8. Infra (F8.1–F8.5)

- **Nginx com TLS (mkcert), 80 → 443, `/api/` e `/ws/` com upgrade.** O backend enxerga `/api/...` inteiro ([infra.md](../contracts/infra.md) decisão 5), porque o prefixo aparece na rota, no `Path` do cookie, no log e na label do Prometheus, e os quatro precisam concordar.
- **IP real (decisão 6):** o Nginx **substitui** o `X-Forwarded-For` em vez de acrescentar. Com o acréscimo, o `uvicorn` usaria o primeiro IP da lista, que é o que o cliente mandou, e um script passaria pelo rate limit trocando o cabeçalho. A confiança vem da topologia: o backend não publica porta.
- **Nome de serviço (`db`), não de container** (decisão 7), e **um worker de `uvicorn`** (decisão 8), porque `ConnectionManager` e `RoomManager` são dicionários em processo.
- **Certificado fora do git** (decisão 9); **sem certificado, self-signed gerado dentro do container** (decisão 11). Quem avalia roda `docker compose up` sem `mkcert`, e um Nginx que morre reprova o "sobe com um comando". Gerar dentro do container evita arquivo de root no host, que nos PCs da 42 ninguém apagaria sem sudo.
- **`PUBLIC_HOST` com a porta é a única fonte do endereço** (decisão 12): redirect, URL de retorno da 42 e URL do Grafana. Trocar de máquina é uma linha no `.env`. **Outro nome leva 302 para ele** (#239, decisão 21), porque pelo IP o `/refresh` dá 403 e o console fica vermelho. É 302 e não 301 porque o navegador guarda o 301 em cache.
- **`/media/` servido pelo Nginx do volume** (decisão 13), para os avatares não competirem com o tick no worker único.
- **Healthchecks, migração no entrypoint, frames de WebSocket limitados a 64 KiB** (#94, #113).
- **CI a cada PR** ([infra.md](../contracts/infra.md) §2.7): build da stack, redirect e TLS com `curl --cacert`, `pg_isready`, `pytest` com Postgres, `vitest`, lint (inclusive `no-literal-string`), uma cabeça de Alembic, regras de alerta, log sem query string e o 302.
- **README (F8.5 e F9.1):** em inglês e autossuficiente, porque a `docs/` sai antes da entrega. Escrevi as seções transversais e deixei `TODO F9.1 (@handle)` na parte de cada pessoa.

### 9. Monitoring (F8.8–F8.11, módulo Monitoring)

- **Prometheus com `node-exporter` e `postgres-exporter`, sem porta publicada.** Retenção de `7d` ou `500MB` (decisão 14), para proteger a cota do home nos PCs da 42.
- **3 dashboards próprios e pequenos** (decisão 15): Jogo e backend, Host e Postgres, com 5–6 painéis cada, provisionados por arquivo. Os da comunidade têm dezenas de painéis que ninguém explicaria na defesa, e o `${DS_PROMETHEUS}` deles quebra no provisioning.
- **Grafana sem volume** (decisão 18): a senha do `.env` sempre vale e nada criado à mão sobrevive, que é o critério da F8.9. **Admin obrigatório** (decisão 19): com `${VAR:?}`, o compose para se faltar a senha, em vez de subir com `admin/admin`.
- **Grafana só pelo Nginx com TLS e login** (F8.11, `serve_from_sub_path`, decisão 10), e o proxy espera o Grafana ficar healthy (decisão 20). O `absolute_redirect off` foi necessário para o `/grafana` não perder a porta 8443.
- **Plugins do Grafana sem preinstall (#199):** o Grafana 13 trocava o plugin do Prometheus no meio do `up`, e o datasource sumia por uns 5 s, o que quebrava o CI.
- **4 alertas no Prometheus, sem Alertmanager** (decisão 16): `TargetDown`, `TickP99High`, `High5xxRate` e `LoginFailureSpike`, com `for:` curto para disparar com o avaliador olhando. Testados com `promtool test rules` no CI e vistos em *firing* no Grafana. O subject cobra regras, não notificação; Alertmanager seria mais um serviço e mais um segredo.
- **`postgres-exporter` com o usuário do banco** (decisão 17): um role `pg_monitor` exigiria script de init que não roda em volume já existente, ou misturaria infra com schema. O risco fica contido pela topologia.

### 10. Demo na 42 (F8.6)

- **Testes reais nos PCs da 42:** 1 PC em 17/10 e 3 PCs no cluster 3 em 01/11 ([resultados](../infra/resultados-teste-pc-42-2026-10-17.md)). Ficou decidido: PC direto, sem VM; portas 8080/8443; `PUBLIC_HOST=<hostname>:8443`; certificado com hostname, IP e `localhost`; a CA vale no Chrome de outro login; o rate limit separa os IPs; o OAuth da 42 aceita várias URLs de retorno.
- O que aprendi lá virou regra: a demo fica num cluster só e os clientes abrem pelo hostname (daí o 302 da seção 8). O secret da 42 roda sozinho a cada período, e basta trocar o `FT_CLIENT_SECRET` no `.env`.
- Fecha com o ensaio do C5 (#163).

### 11. Correções fora da Slice

- **#188:** um teste do Augusto falhava 1 vez em 60 sob carga, porque esperava o `close_code` antes de o `_abort` gravar no banco. O teste passou a esperar a task da Room.
- **#298 (aberto):** o `/refresh` com cookie morto ou reusado respondia 401 no console (o caso do avaliador depois de um `down -v`). Agora responde `200 {"authenticated": false}` e apaga o cookie.
- **#300 (aberto):** `name` em 12 campos de formulário, para zerar o aviso da aba Issues do Chrome.
- **28 PRs revisados** de outras Slices, como dono do schema de partidas, do compose e do `infra.md`.
