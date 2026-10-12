# Reunião de segunda, 12/10 — material do Akita

> Preparado em 10/10. Três partes: a assinatura de `auth.md` e `ws-manager.md`, as decisões que são minhas, e a pauta. O que o time já decidiu em 06–07/10 não volta à mesa: calendário, `map` fora de `options`, `damage_dealt` num contador só, `room_id` resolvido, OAuth com a 42 e o Google, cookie com `Path=/api/auth`, URL de retorno derivada de `PUBLIC_HOST`.

## 1. Assinatura de `auth.md` e `ws-manager.md`

A pergunta da assinatura é: dá para fazer F5.1 (migração inicial), F5.2 (lobby) e F6.8 (OAuth) só com estes dois arquivos, sem perguntar nada ao Augusto? **Quase.** Os dois estão bons; assino depois que os itens marcados como **bloqueia** tiverem resposta. O resto eu resolvo sozinho com a proposta, se ninguém objetar.

Do meu lado, a leitura achou três erros nos meus contratos, já corrigidos: `RoomManager.join` não recebia `avatar_url`, mas o `RoomInfo` o devolve; o `RoomInfo` admitia `avatar_url` nulo, contra a decisão 18 do `auth.md`; e os exemplos de `matches-api.md` usavam `rdel-fra`, que a decisão 12 normaliza para `rdel_fra`.

### `auth.md`

| # | Ponto | Proposta | Peso |
|---|---|---|---|
| A1 | **Quem escreve os modelos SQLAlchemy de `users`, `refresh_tokens`, `oauth_accounts` e `friendships`, e quando.** A migração `0001_initial` é minha e sai da §2.9, mas o modelo `Match` precisa de `users` no mesmo `Base.metadata` para a FK `created_by`. Se os modelos de usuário só chegarem com F6.x, F5.1 espera. | Augusto entrega `app/auth/models.py` junto com o F0.3; eu escrevo a migração à mão a partir da §2.9 e os dois conferimos com `alembic check` no CI, que reprova se modelo e migração divergirem. | ✅ **resolvido no PR #52** (Base compartilhada, `NAMING_CONVENTION`; `DbSession` e Alembic ficam comigo no F5.1) |
| A2 | Default de `users.preferred_language` (Em aberto 6). O rascunho do `i18n.md` (PR #20) diz `en`. | `DEFAULT 'en'` na migração. | ✅ no PR #52 |
| A3 | `refresh_tokens.user_agent` "até 255 caracteres": `CHECK` no banco ou corte no código? | Corte no código, sem `CHECK`: um User-Agent longo não pode derrubar um login. | ✅ no PR #52 |
| A4 | O callback do OAuth chega com `?code&state`, e a §2.10 proíbe os dois no log. O log de acesso padrão do Nginx e o do `uvicorn` gravam a query. | Resolvido do meu lado: [infra.md](../contracts/infra.md) §2.3, item 6 (`$uri` no `log_format`, `uvicorn --no-access-log`). O middleware de log do Augusto **não** pode gravar a query. | confirmar |
| A5 | Google com `email_verified = false` e ninguém com esse e-mail: a tabela da §2.8 cria o User com um e-mail não verificado, que depois bloqueia o signup do dono real (`email_taken`). | Não criar: `oauth_failed`. Na prática quase não acontece (conta Gmail é sempre verificada), mas fecha a porta. | Augusto |
| A6 | Dois detalhes que eu preciso para F6.8: com que caractere a decisão 12 "completa até 3" (proposta: `_`), e em que `result` de `auth_login_total` cai o `oauth_cancelled` (proposta: nenhum, o User só desistiu). | como está | eu resolvo |

### `ws-manager.md`

| # | Ponto | Proposta | Peso |
|---|---|---|---|
| W1 | **Como `publish_lobby_update` e as outras duas chegam ao `ConnectionManager`, e como o meu teste troca a instância.** O manager vem da dependência `get_connection_manager`, mas as três funções não recebem o manager, e o `dependency_overrides` do FastAPI não alcança uma função chamada direto. | As três recebem o manager como primeiro argumento (`publish_lobby_update(manager, info)`), e a rota o pega por `Depends(get_connection_manager)`. O teste passa o `fake_ws`/manager falso sem patch. | **bloqueia o teste de F5.2** |
| W2 | O exemplo da §3 chama `rooms.join(match_id, user.id, user.username)`. | Acrescentar `avatar_url` ([rooms.md](../contracts/rooms.md) §2.2, corrigido hoje). | trivial |
| W3 | **User que fecha o site estando num Lobby** continua na Room até o TTL, aparecendo como Player e, se for o host, impedindo o `start`. | O lobby (F5.2) registra um callback em `on_presence_change` e, quando o User fica offline (já com os 5 s de atraso), chama `leave` na Room de Lobby dele (`RoomManager.room_of`, D-A). Pergunta ao Augusto: `on_presence_change` aceita **mais de um** callback? (O módulo de usuários também pode registrar.) | decidido: D-B |
| W4 | **TTL do Lobby:** quem varre, e como o banco recebe `aborted`? A varredura mora no `RoomManager` (Augusto), mas gravar `matches.status` e chamar `publish_lobby_removed` é do lobby (meu). | Sem TTL (D-B): não há varredura nem `abort`; a linha "ou TTL do Lobby" da §2.5 sai. | decidido: D-B |

## 2. Decisões do Akita

Tomadas em 10/10 e já escritas nos contratos. Na reunião eu só comunico; reabre quem tiver um argumento novo.

| # | Decisão | Onde está escrita | Quem precisa saber |
|---|---|---|---|
| D-A | **Um User, uma Room** (em `lobby` ou em andamento). Criar ou entrar em outra dá 409 `already_in_other_match`. O `RoomManager` ganha o índice `user_id → match_id` e `room_of(user_id)`; `join` ganha `avatar_url`. | [rooms.md](../contracts/rooms.md) §2.2 e decisão 9; [matches-api.md](../contracts/matches-api.md) §2.2 e §2.6 | Augusto (F2.3), Caio (tradução do `code`) |
| D-B | **Lobby sem TTL.** Quem fica offline (5 s de atraso) sai do Lobby, pelo `on_presence_change`; o último a sair destrói a Room e o Match vira `aborted`. TTL por tempo fica para a S5/S6, se sobrar tempo. | [rooms.md](../contracts/rooms.md) decisão 10 e "Em aberto" 2 | Augusto (callback de presença, linha do TTL no `ws-manager.md` §2.5) |
| D8 | **Normalização de `options`**, a proposta do Rafael: um modelo Pydantic por Mode, `extra="forbid"`, `strict=True`; campo desconhecido ou de `pvp` no `coop` → 422 `invalid_options`; `pickups` parcial com default por chave; limites inclusivos; o `coop` normalizado sem chaves de `pvp`. | [matches-api.md](../contracts/matches-api.md) §2.2 | Rafael (fechar a §5.3 do `room-options.md`), Caio (o formulário do `coop` não manda campo de `pvp`) |
| D6 | **`/media/` servido pelo Nginx** direto do volume (`:ro` no `proxy`). **Prometheus com `7d` ou `500MB`**, o que vier primeiro. | [infra.md](../contracts/infra.md) decisões 13 e 14 | Caio (a URL do avatar não muda) |
| D4 | **Dashboards próprios e pequenos**: Jogo e backend, Host, Postgres, 5–6 painéis cada, versionados. | [infra.md](../contracts/infra.md) decisão 15 | Augusto (nomes das métricas do F8.7) |
| D5 | **Alertas no Prometheus, sem Alertmanager**, vistos em *firing* no Grafana. | [infra.md](../contracts/infra.md) decisão 16 | — |
| — | **E-mail da 42 é confiável para vincular** (`auth.md` §5.12): concordo com a proposta do Augusto. Condição: no cadastro do app, confirmar que a intra não deixa o aluno trocar o e-mail sem verificação; se deixar, volta à mesa. | a escrever pelo Augusto no `auth.md` | Augusto |
| — | **Google no calendário** (`auth.md` §5.13): a 42 primeiro, na S4; o Google em seguida e, se a S4 estourar, na S5. Com dois provedores, o 2FA deixa de ser o Plano B. | [caminho-5-akita.md](../slices/caminho-5-akita.md) §1 e §5 | Augusto |

Também em 10/10, sem precisar de decisão: o `infra.md` passou a ter `Path=/api/auth`, o `.env` sem `FT_REDIRECT_URI` e com `GOOGLE_*`, a restrição do Google (só HTTPS em domínio público ou `localhost`; candidato `nip.io`) e o log de acesso sem query string (A4).

## 3. Pauta (atualizada em 12/10, manhã)

O que entrou no fim de semana: F0.3 (#44), a porta da Simulation (#42), o carregador de Map (#41), o `i18n.md` (#20), o pytest no CI (#38) e este material (#39). Também entraram, já na manhã de 12/10, o **#52** (modelos de usuário, Augusto) e o **#53** (F0.4, Caio). Aberto para revisão: **#55** (protocolo do `/ws/game`, Augusto). Ordem pensada para quem tem bloqueio falar primeiro; cada item sai com decisão ou com dono e data.

1. **Registro do C1** (sex 09/10). Fechado só em parte; o que não fechou vira o primeiro assunto do C2 (sex 16/10).

   | Pessoa | Item do C1 | Fechou? | O que falta |
   |---|---|---|---|
   | Roberto | teste do carregador de Map verde | ✅ #41, rodando no CI pelo #38 | — |
   | Akita | cadeado pelo Nginx | ✅ #35 | — |
   | Augusto | login pelo Nginx (backend) | ❌ | F0.3 entrou (#44); faltam F6.2–F6.4 (login, tokens, `CurrentUser`). Sem issue ainda |
   | Caio | casca React com seletor de 3 idiomas | ❌ | F0.4 no #53; F7.2 (#46) depois dele |
   | Rafael | masmorra em 3D no `dev.html` | ❌ | `frontend/game/dev.ts` está **com marcadores de conflito no `main`** (`<<<<<<< HEAD`); o #53 o tira do lint e do typecheck até o F3.1 |

2. **Rafael sem issue e sem PR.** É a única Slice sem nada no board. Pedido: issues de S1–S2 hoje (F3.1, F4.x), e o conserto do `dev.ts` como primeira tarefa. Os outros: Augusto ainda precisa das issues de F2.1, F2.3 e F6.2–F6.4 (o lobby do C2 depende de F2.3 e F6.4).
3. **PRs do fim de semana.**
   - **#52** (F6.1): ✅ aprovado e mergeado. Bate com a §2.9 do `auth.md` coluna a coluna (o teste confere sem banco), já resolve A1, A2 e A3, e o `Match` herda da mesma `Base`.
   - **#53** (F0.4): ✅ aprovado e mergeado. Também entrega o job `frontend` do CI (lint, `vitest`, build), que era o resto do meu F8.2 (#28), e o Dockerfile multi-stage com fallback do SPA, que é quase todo o meu F8.4 (#31). O #31 fica aberto só para conferir os assets do jogo servidos quando o Rafael os trouxer.
   - **#55** (F2.2): quem aprova é o Roberto (é o `ws-messages.md`). Do meu lado, nada contra: os códigos de fechamento batem, e o limite de 4 KiB por mensagem cabe o `join` com o JWT.
4. **W1 continua aberto** (Augusto): como `publish_lobby_update` e as outras duas chegam ao `ConnectionManager`, e como o teste do lobby troca a instância. Proposta: recebem o manager como primeiro argumento. E: `on_presence_change` aceita mais de um callback (W3)?
5. **Códigos do `/ws/game`** (Augusto e Roberto; `ws-messages.md` §5.4 e §5.6, `caminho-1-roberto.md` item 5).
   - `join` numa Room ainda em `lobby`: fechar com **`4404 room_not_found`**, que já existe e é literalmente verdade (a Room da Simulation só nasce no `start`).
   - `step` falhando 30 Ticks seguidos: **`4503 server_shutdown` e Match `aborted`**, a sugestão do Roberto (decisão do Akita, §5). O Roberto fecha a §5.6 do `ws-messages.md`.
   - Lacuna no `ws-manager.md` §2.9: `4403`, `4404` e `4409` não estão na tabela, então caem em "os demais: reconecta". O cliente do jogo ficaria tentando entrar para sempre numa Room que não existe. Proposta: os três **não reconectam**, como o `4400`.
6. **`min_players` e quantos "prontos" para o `start`** (Rafael). Proposta: mínimo 1 no `coop` e 2 no `pvp`; o `start` exige todos os Players da Room prontos, o host incluído, e só o host inicia.
7. **Quem emite `achievement_unlocked`** (Augusto). Proposta: `record_match_result` devolve a lista e a Room emite o Event.
8. **Decididas hoje por mim, para conhecimento:**
   - `GET /api/maps` na forma do Caio (`{name, max_players}`), no [matches-api.md](../contracts/matches-api.md) §2.2. Fica pronta para o C2.
   - Defaults de `RoomOptions` moram na dataclass da Simulation; a API só acrescenta os limites ([matches-api.md](../contracts/matches-api.md) §2.2). Rafael confirma, e o item 20 do roadmap do Roberto fecha.
   - Login por OAuth guarda o `lang` da tela no cookie `oauth_state`, e a conta nova nasce nesse idioma ([i18n.md](../contracts/i18n.md) §5.2). Entra no F6.8; o Augusto registra no `auth.md`.
   - Rotas de estatística todas autenticadas, como o `i18n.md` decidiu ([matches-api.md](../contracts/matches-api.md) "Em aberto" 3 fechado).
9. **`matches-api.md` §5, itens 1, 2, 4 e 5** (Caio): campos das telas, histórico com `aborted`, catálogo de conquistas pela API, `GET /api/matches/{id}` com dois formatos.
10. **`already_in_other_match` sem `match_id`** (Caio e Augusto): a casca não consegue oferecer "voltar para a partida". O envelope ganha um campo opcional, ou a casca vive sem isso?
11. **Colunas do board.** Proposta: ficar com as reais (`Todo / In Progress / In Review / Done / Failed`); `Todo` cobre `Backlog` e `Ready`.

## 4. Fora da reunião (Akita)

- **Teste no PC da 42 até sex 17/10** ([roteiro](../infra/roteiro-teste-pc-42.md), agora com o nip.io no passo 5). O prazo real é o C3, em 23/10, primeiro checkpoint com duas máquinas.
- **Cadastro dos apps OAuth, de casa**, com callback `https://localhost/api/auth/oauth/{42,google}/callback`. Anotar nos dois formulários: se aceitam IP, porta e `nip.io`; quantas URLs cabem; se o secret expira. Na intra: se aceita PKCE e **se o perfil deixa trocar o e-mail sem verificação**. No Google: se a tela de consentimento em "Testing" serve para a avaliação.

## 5. Decisão do Akita sobre o `ws-messages.md` §5.6

- **Quando o `step` falha 30 Ticks seguidos, o socket fecha com `4503 server_shutdown` e o Match vira `aborted`** (sugestão do Roberto, aceita em 12/10). `aborted` porque não há resultado confiável para gravar: sem `match_players`, a partida não conta na estatística de ninguém, como a Room perdida num desligamento. O código existente foi preferido a um `4500 internal_error` novo: os dois levam o cliente ao mesmo comportamento, e a diferença seria só o texto na tela num caso que só acontece com bug. O traceback vai para o log com `match_id` e Tick de qualquer forma.
