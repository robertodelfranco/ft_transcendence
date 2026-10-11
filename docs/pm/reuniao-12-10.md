# Reunião de segunda, 12/10 — material do Akita

> Preparado em 10/10. Três partes: a assinatura de `auth.md` e `ws-manager.md`, as decisões que são minhas, e a pauta. O que o time já decidiu em 06–07/10 não volta à mesa: calendário, `map` fora de `options`, `damage_dealt` num contador só, `room_id` resolvido, OAuth com a 42 e o Google, cookie com `Path=/api/auth`, URL de retorno derivada de `PUBLIC_HOST`.

## 1. Assinatura de `auth.md` e `ws-manager.md`

A pergunta da assinatura é: dá para fazer F5.1 (migração inicial), F5.2 (lobby) e F6.8 (OAuth) só com estes dois arquivos, sem perguntar nada ao Augusto? **Quase.** Os dois estão bons; assino depois que os itens marcados como **bloqueia** tiverem resposta. O resto eu resolvo sozinho com a proposta, se ninguém objetar.

Do meu lado, a leitura achou três erros nos meus contratos, já corrigidos: `RoomManager.join` não recebia `avatar_url`, mas o `RoomInfo` o devolve; o `RoomInfo` admitia `avatar_url` nulo, contra a decisão 18 do `auth.md`; e os exemplos de `matches-api.md` usavam `rdel-fra`, que a decisão 12 normaliza para `rdel_fra`.

### `auth.md`

| # | Ponto | Proposta | Peso |
|---|---|---|---|
| A1 | **Quem escreve os modelos SQLAlchemy de `users`, `refresh_tokens`, `oauth_accounts` e `friendships`, e quando.** A migração `0001_initial` é minha e sai da §2.9, mas o modelo `Match` precisa de `users` no mesmo `Base.metadata` para a FK `created_by`. Se os modelos de usuário só chegarem com F6.x, F5.1 espera. | Augusto entrega `app/auth/models.py` junto com o F0.3; eu escrevo a migração à mão a partir da §2.9 e os dois conferimos com `alembic check` no CI, que reprova se modelo e migração divergirem. | **bloqueia F5.1** |
| A2 | Default de `users.preferred_language` (Em aberto 6). O rascunho do `i18n.md` (PR #20) diz `en`. | `DEFAULT 'en'` na migração. | fecho com o Caio |
| A3 | `refresh_tokens.user_agent` "até 255 caracteres": `CHECK` no banco ou corte no código? | Corte no código, sem `CHECK`: um User-Agent longo não pode derrubar um login. | eu resolvo |
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

## 3. Pauta

Ordem pensada para quem tem bloqueio falar primeiro. Cada item sai com decisão ou com dono e data.

1. **Registro do C1** (sex 09/10). Cada um diz o status do seu item, os bloqueios e as issues de S1–S2. O que não fechou vira o primeiro assunto do C2.

   | Pessoa | Item do C1 | Fechou? | Bloqueio | Issues de S1–S2 criadas? |
   |---|---|---|---|---|
   | Roberto | teste do carregador de Map verde | | | sim (#22–#24) |
   | Augusto | login pelo Nginx (backend) | | | |
   | Rafael | masmorra em 3D no `dev.html` | | | |
   | Caio | casca React com seletor de 3 idiomas | | | |
   | Akita | cadeado pelo Nginx | sim (#35) | — | sim (#27–#34) |

2. **Issues que faltam.** Só as Slices 1 e 5 têm issue no board. A que mais pesa é o **F0.3** (pacote `backend/app/`, `create_app()`, `pydantic-settings`, envelope, `conftest`): sem ele o **F5.1 (#29)** não começa, e a migração inicial é o que destrava as tabelas de todo mundo. Depois, o **F0.4** (Vite + React), que segura o resto do F8.2 (`vitest` e lint) e o F8.4. Pedido: cada um cria as suas até terça, 13/10, no formato do [replanejamento](replanejamento-e-board.md) §3.
3. **Assinatura de `auth.md` e `ws-manager.md`** (§1 acima), com o Augusto. Os dois itens que bloqueiam: **A1** (quem escreve os modelos de usuário, e quando) e **W1** (como as funções de publicação chegam ao manager). Os outros são confirmação rápida.
4. **`join` em `/ws/game` de uma Room ainda em `lobby`** (`rooms.md` §5.1, `ws-messages.md` §5.4; Augusto e Roberto). Proposta nova: fechar com **`4404 room_not_found`**, que já existe e é literalmente verdade, porque a Room da Simulation só nasce no `start`. Sem código novo e sem tradução nova.
5. **`min_players` e quantos "prontos" para o `start`** (Rafael; `rooms.md` §5.3, `room-options.md` §5.2). Proposta: mínimo 1 no `coop` e 2 no `pvp`; o `start` exige **todos os Players da Room prontos**, o host incluído, e só o host inicia.
6. **Quem emite `achievement_unlocked`** (Augusto; `rooms.md` §5.4). Proposta: `record_match_result` devolve a lista de conquistas desbloqueadas e a Room emite o Event; a função fica sem rede e testável com os dois JSON da §3 do `rooms.md`.
7. **Catálogo de Maps e `GET /api/maps`** (Rafael, Roberto e Caio; `room-options.md` §5.1). Proposta: a rota entra no meu `matches-api.md` e devolve `{"coop": [...], "pvp": [...]}`, lido das pastas `backend/maps/{coop,pvp}/` em ordem alfabética; o default é o primeiro da lista. A lista publicada de Maps é do Rafael.
8. **`matches-api.md` §5, itens 1–5** (Caio): campos das telas, histórico com `aborted`, perfil público sem login, catálogo de conquistas pela API, `GET /api/matches/{id}` com dois formatos.
9. **`i18n.md`**: o PR #20 está aprovado desde 08/10 e ainda não entrou. Mergear, e confirmar o que ele já responde para mim: avatar de 2 MiB (o Nginx fica em `3m`), `preferred_language` com default `en` (A2). Junto: o 409 `already_in_other_match` (D-A) precisa do `match_id` para a casca oferecer "voltar para a partida"; o envelope do `auth.md` não tem campo para isso. Proposta: a casca descobre sozinha com `room_of` exposto em `GET /api/users/me/match`, ou o envelope ganha um campo opcional. Decidem Caio e Augusto.
10. **Colunas do board.** O board real tem `Todo / In Progress / In Review / Done / Failed`; o replanejamento §3 propunha `Backlog → Ready → …`. Proposta: **ficar com as reais**. `Todo` cobre `Backlog` e `Ready`, e o que está bloqueado já diz no corpo ("Blocked by #").
11. **Fila de revisão.** #38 (F8.2, meu) espera o Roberto; #26 (R1.1, do Roberto) espera revisão; #37 (R1.3) ainda sem decisão. Combinar quem revisa o quê nesta semana; a regra do repo pede 1 aprovação.

## 4. Fora da reunião (Akita)

- **Teste no PC da 42 até sex 17/10** ([roteiro](../infra/roteiro-teste-pc-42.md), agora com o nip.io no passo 5). O prazo real é o C3, em 23/10, primeiro checkpoint com duas máquinas.
- **Cadastro dos apps OAuth, de casa**, com callback `https://localhost/api/auth/oauth/{42,google}/callback`. Anotar nos dois formulários: se aceitam IP, porta e `nip.io`; quantas URLs cabem; se o secret expira. Na intra: se aceita PKCE e **se o perfil deixa trocar o e-mail sem verificação**. No Google: se a tela de consentimento em "Testing" serve para a avaliação.
