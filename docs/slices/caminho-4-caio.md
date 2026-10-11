# Caminho 4 — Web, usuários e i18n · Caio

> Escopo da Slice 4, de ponta a ponta: o que é meu, o que eu faço sozinho, de quem eu dependo e o que eu explico na defesa. A alocação está no [plano §9](../catacombs42-plano-de-tarefas.md#9-divisão-entre-as-5-pessoas); as estimativas e os "pronto quando" são copiados do [plano §5](../catacombs42-plano-de-tarefas.md#5-tarefas-por-frente), sem reinterpretação. Calendário: [replanejamento-e-board.md](../pm/replanejamento-e-board.md) (C1 em 09/10, freeze em 14/11, defesa em 21/11). Vocabulário: [CONTEXT.md](../../CONTEXT.md).
>
> Papel no time: **PO**. Contrato que eu escrevo: [i18n.md](../contracts/i18n.md). Contratos que eu assino: [auth.md](../contracts/auth.md), [ws-manager.md](../contracts/ws-manager.md), [mount-game.md](../contracts/mount-game.md) (`HudState` e `MountOptions`), [matches-api.md](../contracts/matches-api.md) e [room-options.md](../contracts/room-options.md).
>
> Base desta versão (07/10): a `main` mais os rascunhos ainda não mergeados de `feat/Auth` (`auth.md`, `ws-manager.md`) e de `contracts-decisions` (decisões de 06–07/10). Onde eles mudarem antes do merge, este arquivo muda junto.

## 1. Inventário

**≈ 21 d de tarefa**, mais o contrato `i18n.md` (parte de F0.2) e o papel de PO.

### Contrato (prioridade antes de qualquer código)

[i18n.md](../contracts/i18n.md). Enquanto não existe, o Augusto não fecha a lista de `code` de erro nem o default de `preferred_language` no `auth.md`, e o Akita não fixa o `client_max_body_size` nem o volume de avatares no `infra.md`. É o meu caminho crítico **para os outros**.

### F0.4 — fundação do frontend (1 d)

| ID | Tarefa | d | Depende de | Sem. | Pronto quando |
|---|---|---|---|---|---|
| F0.4 | Frontend: Vite + React + TypeScript + framework CSS; `frontend/game/` isolado (não importa nada de `frontend/src/`); `vitest` | 1 | — | S1 | `npm run build` e `vitest` verdes no CI |

### F7 — casca web (16,5 d)

| ID | Tarefa | d | Depende de | Sem. | Pronto quando |
|---|---|---|---|---|---|
| F7.1 | Roteamento, layout, contexto de auth (access em memória, refresh ao carregar), rotas protegidas, cliente HTTP que entende o envelope de erro; abrir `/ws/app` após o login (quando F2.1 existir) | 2 | F0.4 | S1 | Recarregar a página mantém o login |
| F7.2 | i18n desde o primeiro componente: `react-i18next`, pt-BR / en / es, seletor na UI, preferência salva no perfil (com fallback local), códigos de erro do backend traduzidos no front; traduções completas na S5 | 3 | F0.4 | S1 + S5 | Nenhuma string solta no JSX (checagem no CI ou revisão) |
| F7.3 | Privacy Policy e Terms of Service com conteúdo real, nos 3 idiomas, link no rodapé de toda página | 1 | F7.2 | S1–S2 | Acessíveis sem login |
| F7.4 | Telas de login e cadastro com a mesma validação do backend; botão "entrar com a 42" | 1 | F7.1 | S1 | C2 |
| F7.5 | Perfil próprio e de terceiros, edição, upload de avatar, lista de amigos com status online | 2 | F6.6, F6.7 | S3 | Critérios do *Standard user management* visíveis |
| F7.6 | Rota `/play/:matchId` que monta `mountGame`; HUD em React (HP, mana, armadura, chaves, ping, players, placar e kill feed no PvP) via `onHud` | 2 | F2.5, F4.3 | S2–S3 | HUD reage ao Snapshot |
| F7.7 | Lobby: criar Room com opções de customização (e defaults visíveis), listar Rooms, entrar, pronto | 2 | F5.2, F4.5 | S2–S4 | Criar partida sem mexer em nada usa os defaults |
| F7.8 | Tela de resultado; histórico; estatísticas, ranking e level com barra de progresso; conquistas; leaderboard | 2,5 | F5.4–F5.8 | S4 | Os seis itens do módulo de estatísticas aparecem |
| F7.9 | Responsivo, acessibilidade básica, passada de console limpo em todas as telas | 1 | — | S5 | Console vazio navegando o site inteiro |

### F6.6–F6.7 — backend de perfil e amigos (3,5 d)

| ID | Tarefa | d | Depende de | Sem. | Pronto quando |
|---|---|---|---|---|---|
| F6.6 | Perfil: `GET/PATCH /api/users/me`, perfil público, upload de avatar validado (tipo e tamanho) com avatar padrão, idioma preferido | 1,5 | F6.4 | S3 | Avatar inválido é recusado no front e no back |
| F6.7 | Amigos (adicionar, remover, listar) e status online via presença do `ConnectionManager` | 2 | F2.1 | S3 | Amigo aparece online ao abrir o site |

As rotas exatas de F6.6 e F6.7 estão no [i18n.md](../contracts/i18n.md) §2.7. Ler o próprio perfil ficou em `GET /api/auth/me` (do Augusto), então F6.6 não cria `GET /api/users/me`.

### F9 — de todos

F9.1 (minha parte do README) na S5; F9.2 (ensaio) na S6.

## 2. Fronteiras: o que é meu e o que não é

| Coisa | É minha? | De quem é, então |
|---|---|---|
| `frontend/package.json`, Vite, Tailwind, ESLint, `vitest` | **Sim** (F0.4) | O Rafael usa o mesmo pacote para `frontend/game/` (§6, decisão 1) |
| Tudo em `frontend/src/` | **Sim** | — |
| Tudo em `frontend/game/` (`mountGame`, `net/`, `render/`, `sim/`) | **Não** | Rafael (render), Augusto (`net/`), Roberto (`applyInput.ts`, Prediction, minimapa). Eu só **chamo** `mountGame` e desenho o que chega em `onHud` |
| Texto da HUD | **Sim** | O jogo entrega números e `code` em `HudState`; o texto e o layout são React, meus |
| O que a HUD mostra e em que ordem | **Não** | Rafael (F4.3, especificação da HUD). Eu desenho a partir dela |
| Rotas de auth, cookie, tokens, envelope de erro | **Não** | Augusto ([auth.md](../contracts/auth.md)). Eu consumo e traduzo |
| Rotas de perfil, avatar, amigos, busca de Users | **Sim** (F6.6–F6.7) | — |
| Tabelas `users` e `friendships` | **Não** | Augusto escreve o schema; a migração inicial é do Akita. Eu só leio e escrevo linhas por cima dela |
| Presença (quem está online) | **Não** | Augusto (F2.1, `ConnectionManager` e `/ws/app`). Eu consulto `is_online` em F6.7 e escuto `presence` na casca |
| Rotas de lobby, histórico, estatísticas, leaderboard | **Não** | Akita ([matches-api.md](../contracts/matches-api.md)). Eu faço as telas |
| Volume `/media` e `location /media/` no Nginx | **Não** | Akita ([infra.md](../contracts/infra.md)). Eu gravo o arquivo e a URL |
| Catálogo de RoomOptions e de Maps | **Não** | Rafael (F4.5, [room-options.md](../contracts/room-options.md)) e Akita (validação no `POST /api/matches`) |
| Lista de conquistas e fórmulas de XP e Elo | **Não** | Rafael (F4.6), implementadas pelo Akita. Eu traduzo o `code` e desenho a barra de progresso |
| Botões de OAuth | **Sim**, o botão | O fluxo é do Akita (F6.8); o botão é só um link para `/api/auth/oauth/{provider}/login` |
| Backlog no board e checklist do subject | **Sim** (PO) | O PM (Akita) cuida do calendário, dos ritos e da criação das issues de cada Slice |

## 3. O que eu entrego para os outros

| Entrego | Quem consome | Para quê | Até |
|---|---|---|---|
| **[i18n.md](../contracts/i18n.md)**: idiomas, catálogo de `code`, limite e guarda do avatar, mapa de rotas, API de usuários | Augusto (fechar `auth.md`), Akita (`infra.md`: `client_max_body_size`, `/media`), Rafael (códigos de erro do jogo) | lista fechada de erros, limite de corpo, avatar padrão | **esta semana (S1), antes do C1** |
| **F0.4**: estrutura do `frontend/` com `package.json`, `vitest` e lint | Rafael (move o `dev.html` para dentro), Akita (F8.2: lint e `vitest` no CI; F8.4: build de produção) | um build só, um CI só | S1 |
| Assinatura dos 5 contratos (§7) | Augusto, Akita, Rafael | cada um sabe o que falta no próprio contrato | S1 |
| Lista de campos das telas (§7, `matches-api.md`) | Akita | fechar `matches-api.md` e os índices do banco | S1 |
| Rotas de amigos com `online` preenchido (F6.7) | Augusto (só confere que eu uso `is_online` e não leio o dicionário do manager) | presença coerente entre a lista e o `/ws/app` | S3 |
| Checklist do subject por módulo (§11) | todos, em cada checkpoint | o módulo só entra no README se passar | a partir do C2 |

## 4. O que eu faço sozinho

Nada aqui espera ninguém. É por onde eu começo quando algo travar.

| Tarefa | Por que é solo |
|---|---|
| **`i18n.md`** | só preciso da arquitetura e dos contratos que já existem |
| **F0.4** | estrutura e configuração; o único acordo é a pasta do Rafael (§6, decisão 1) |
| **F7.2** estrutura, seletor e teste das chaves | depende só de F0.4 |
| **F7.3** páginas legais | texto e uma página por idioma; depende só de F7.2 |
| **F7.1** casca, rotas, contexto de auth, cliente HTTP | feito contra o MSW, com os JSONs de exemplo do [auth.md](../contracts/auth.md) §3; o backend real entra quando F6.2 chegar |
| **F7.4** login e cadastro | as regras de validação estão no [auth.md](../contracts/auth.md) §2.4; o resto é mock |
| **F7.6** HUD | feita contra um `mountGame` falso que emite `HudState` fabricados (coop, pvp, morto, desconectado, erro), sem esperar o jogo |
| **F7.8** telas de estatística | feitas contra os JSONs de exemplo do [matches-api.md](../contracts/matches-api.md) §3 |
| **F7.9** responsivo e acessibilidade | contínuo, tela a tela |
| **F6.6** perfil e avatar | depende só de `CurrentUser` (F6.4, fim da S1) e do volume `/media` (posso testar com uma pasta local) |

## 5. De quem eu dependo

| Preciso de | De quem | Para quê | Até |
|---|---|---|---|
| **[auth.md](../contracts/auth.md)** e **[ws-manager.md](../contracts/ws-manager.md)** mergeados | Augusto | telas de login e cadastro, cliente HTTP, `/ws/app` | S1 |
| **F0.3**: pacote `backend/app/`, envelope de erro, `conftest` com `fake_ws` | Augusto | F6.6 e F6.7 nascem dentro do pacote e testam com a mesma fixture | início da S2 |
| **F6.2 + F6.4**: signup, login, `me`, `CurrentUser` | Augusto | F7.4 integrada (C2) e toda rota de F6.6–F6.7 | fim da S1 |
| **F6.3**: refresh com rotação | Augusto | o "pronto quando" do F7.1 (recarregar mantém o login). **O slice dele moveu F6.3 para a S3**, com access de 8 h até lá: F7.1 só fecha na S3 (§8) | S3 |
| **F6.1**: migração de `friendships` | Augusto (schema) e Akita (migração inicial) | F6.7 | S2 |
| **F2.1**: `/ws/app` com `lobby_update` (S2) e presença de amigos (S3) | Augusto | lobby vivo (F7.7) e status online (F6.7, F7.5) | S2 / S3 |
| **F8.1**: Nginx com TLS | Akita | o cookie de refresh é `Secure`: sem HTTPS, o login não sobrevive a recarregar | S1 |
| **F8.2 / F8.4**: CI com lint e `vitest`; build de produção | Akita | a regra `no-literal-string` só vale se rodar no CI | S1 / S2 |
| Volume `/media` e `location /media/` no Nginx | Akita | avatar servido (F6.6) | S3 |
| **F5.2**: lobby no backend; `GET /api/maps` ou equivalente | Akita | F7.7 (C2: "um player cria Room no lobby") | S2 |
| **F5.3–F5.8**: resultado, histórico, stats, Elo, conquistas, leaderboard | Akita | F7.8 integrada | S4 |
| **F2.5**: `mountGame` real; **F4.3**: especificação da HUD | Augusto (F2.5) e Rafael (F4.3) | F7.6 integrada | S2 |
| **F4.5**: catálogo de RoomOptions; **F4.6**: `code` das conquistas | Rafael | F7.7 (opções no lobby), F7.8 (nomes das conquistas) | S3 |
| Estrutura do `frontend/` combinada | Rafael | a branch `front` dele cria `package.json` na raiz (§9, item 1) | **antes de F0.4** |

**Dependência cruzada que eu devo a outros:** o Augusto precisa do meu `i18n.md` para fechar o `auth.md`; o Akita precisa dele para o `infra.md` e da minha lista de campos para o `matches-api.md`; o Rafael e o Akita precisam do F0.4 para o `dev.html` e para o CI. **O `i18n.md` e o F0.4 são o meu caminho crítico para o time.**

## 6. Decisões a travar antes de escrever código

### Respostas do briefing

As 6 perguntas do meu briefing ([contracts/README.md](../contracts/README.md)), cada uma com proposta e porquê. Ainda não foram aprovadas em reunião; fecham esta semana, por mensagem com quem está citado.

1. **Amizade mútua ou unilateral?** Unilateral: adicionar é uma linha, remover é apagá-la, sem pedido nem aceite. É o mínimo que atende "add other users as friends and see their online status", e não exige tela de pendências nem notificação. O formato da tabela já está no [auth.md](../contracts/auth.md) §2.9 do Augusto e eu confirmo como está, inclusive o índice em `friend_id`, que é a consulta de presença.
2. **Avatar: tipos, tamanho, onde fica, padrão?** PNG, JPEG e WebP, até 2 MiB, conferidos pelo conteúdo com o Pillow e regravados como PNG de 256 × 256 sem metadados; volume `/media` servido pelo Nginx em `/media/avatars/`; padrão `/media/avatars/default.png`, copiado para o volume no `startup`. Regravar é o que impede servir um arquivo malicioso com nome de imagem. Detalhes em [i18n.md](../contracts/i18n.md) §2.7; o volume confirma o "Em aberto" 2 do Akita no [infra.md](../contracts/infra.md).
3. **Como a casca descobre que não há sessão sem erro no console?** Já resolvido no [auth.md](../contracts/auth.md) §2.2 e §2.6: `/refresh` sem cookie responde 200 `{"authenticated": false}`, e a casca renova o access a 80 % do `expires_in`, então o fluxo normal nunca recebe 401. **Falta verificar** que o Chrome de fato mostra o 401 no console, que é a premissa do desenho ([i18n.md](../contracts/i18n.md) "Em aberto" 1, com o teste descrito).
4. **O `HudState` tem tudo que a HUD precisa?** Quase. Os buracos estão na §7, linha do `mount-game.md`: Mode explícito, contagem do respawn, quem o Player morto está seguindo, unidade e frequência do `ping` e do `onHud`, nome de Player que já saiu no kill feed.
5. **O que a tela de lobby precisa receber?** O `RoomInfo` do [rooms.md](../contracts/rooms.md) §2.3 basta para listar e para a sala de espera. Falta o catálogo de Maps e três ajustes nas telas de resultado e conquistas (§7, linha do `matches-api.md`).
6. **Como guardar texto longo nos três idiomas?** Um Markdown por idioma e por página (`locales/legal/<idioma>/{privacy,terms}.md`), escolhido pelo idioma atual, renderizado com `react-markdown`. Páginas com títulos e listas ficam revisáveis como texto corrido, e a escolha do arquivo continua sendo do i18n ([i18n.md](../contracts/i18n.md) §2.4).

### Decisões de implementação

1. **Um pacote só em `frontend/`.** `frontend/package.json` com React, Three.js, Vite, Tailwind e `vitest`; `frontend/src/` (casca) e `frontend/game/` (jogo) como pastas irmãs. O isolamento do ADR 0003 é garantido por `no-restricted-imports` no ESLint. Um build, um `vitest`, um Dockerfile. A branch `front` do Rafael move o `package.json` da raiz para cá; `node_modules/` entra no `.gitignore`.
2. **Tailwind CSS** ([i18n.md](../contracts/i18n.md) §2.8): sem JavaScript na página, responsivo e foco visível direto nas classes.
3. **Telas protegidas por padrão.** Só `/`, `/login`, `/signup`, `/privacy`, `/terms` e a 404 abrem sem sessão ([i18n.md](../contracts/i18n.md) §4, decisão 6). Responde o "Em aberto" 3 do `matches-api.md`.
4. **Mocks com MSW, a partir dos exemplos dos contratos.** Cada JSON de "Exemplo" de `auth.md`, `matches-api.md` e `ws-manager.md` vira uma fixture; os mesmos handlers servem o `vitest` e o modo de desenvolvimento (`VITE_MOCK_API=1`), e nunca o build de produção. É o que me deixa fazer tudo da §4 antes do backend.
5. **Estado do servidor sem biblioteca extra.** `fetch` no cliente HTTP único, com hooks próprios (`useApi`). Fica explicável na defesa linha por linha; se a casca crescer além do previsto, a troca por TanStack Query é local.
6. **`onEnd.result` do ponto de vista do Player local.** O `game_over` traz o desfecho da Room, e o jogo confere se o próprio id está em `winner_ids` ([ws-messages.md](../contracts/ws-messages.md) §2.6). É a mesma regra do histórico (`result` de quem pede), então a tela de fim e o histórico nunca discordam. Proposta para o Rafael e o Augusto em [mount-game.md](../contracts/mount-game.md) §5.5.
7. **Aviso de conquista na tela de resultado, não na HUD.** A tela de resultado já busca o Match por HTTP depois do `onEnd`; mostrar ali as conquistas com `match_id` desta partida dispensa um campo novo no `HudState` e funciona igual para quem reconecta.
8. **Trocar senha e excluir conta fora do escopo** ([i18n.md](../contracts/i18n.md) §4, decisão 12).

### Itens de outros contratos que caem em mim

| Onde | Questão | Proposta |
|---|---|---|
| [auth.md](../contracts/auth.md) §5.4 | Foto do provedor OAuth vira avatar? | Não na primeira versão |
| [auth.md](../contracts/auth.md) §5.5 | URL do avatar padrão e onde ficam os avatares | `/media/avatars/default.png`; volume `/media` |
| [auth.md](../contracts/auth.md) §5.6 | Default de `preferred_language` | `en`, o idioma de reserva; a casca manda o idioma atual no signup |
| [auth.md](../contracts/auth.md) §5.10 | Amizade unilateral | Confirmada |
| [matches-api.md](../contracts/matches-api.md) §5.2 | Histórico mostra `aborted`? | Não. Sem `match_players`, não teria o que mostrar; dispensa `?include_aborted` |
| [matches-api.md](../contracts/matches-api.md) §5.3 | Perfil público sem login | Não: tudo com `CurrentUser` |
| [matches-api.md](../contracts/matches-api.md) §5.4 | Catálogo de conquistas vem da API? | Sim; o front só traduz `game:achievements.<code>` |
| [matches-api.md](../contracts/matches-api.md) §5.5 | `GET /api/matches/{id}` com dois formatos | Uma rota, ramificando por `status`, com o ajuste da §7 abaixo |
| [room-options.md](../contracts/room-options.md) §5.3 | Normalização: campo do `pvp` no `coop`, campo desconhecido, `pickups` parcial | A casca sempre manda só as opções do Mode escolhido, já completas; qualquer das propostas do Rafael serve. Concordo em rejeitar campo desconhecido |
| [mount-game.md](../contracts/mount-game.md) §5.5 | `result` do `onEnd` | Do Player local (decisão 6 acima) |

## 7. Assinaturas: dá para trabalhar só com o contrato?

Leitura como consumidor, contrato por contrato. Cada linha "falta" vira comentário no PR do dono.

| Contrato | Dá? | O que falta ou muda |
|---|---|---|
| [auth.md](../contracts/auth.md) (Augusto) | **Sim**, para login, cadastro, cliente HTTP e sessão | 1. Respostas aos meus "Em aberto" 4, 5, 6 e 10 (§6). 2. O cookie de refresh tem `Path=/api/auth` aqui e `Path=/api/auth/refresh` no [infra.md](../contracts/infra.md) §2.3; o `/logout` também precisa receber o cookie, então `/api/auth` é o certo, e o `infra.md` deve acompanhar. 3. O botão "Entrar com Google" entra na tela de login (F7.4), não só o da 42: o plano §5 ainda fala só da 42 (o "Em aberto" 3 dele já rastreia) |
| [ws-manager.md](../contracts/ws-manager.md) (Augusto) | **Sim**, para presença e lobby vivo | Entra no meu escopo e não estava no plano: a reconexão do `/ws/app` com espera crescente e as cinco reações por código de fechamento (§2.9 dele, em F7.1); o buffer de mensagens de lobby enquanto o `GET /api/matches` não volta, e o novo `GET` depois de cada `welcome` (§2.4, em F7.7); o aviso traduzido do `4408` em `/play` (F7.6) |
| [mount-game.md](../contracts/mount-game.md) (Rafael), parte `HudState` e `MountOptions` | **Quase** | 1. `mode: "coop" \| "pvp"` explícito, em vez de inferir de `scoreboard === null`. 2. `respawnInS: number \| null` para "renascendo em 3 s" no `pvp`. 3. `spectating: number \| null`, o `user_id` que a câmera segue quando o Player local morreu no `coop` (a `camera` do `ViewState` já sabe). 4. `ping` em ms (proposta dele em §5.5, confirmo). 5. **Frequência do `onHud`:** chamar só quando algum valor mudar, no máximo uma vez por Snapshot (15 Hz); a 60 Hz o React redesenharia a HUD a cada quadro. 6. Antes do `welcome`: um `onHud` com `status: "connecting"` e os números em zero, para eu mostrar "conectando". 7. Kill feed: o nome de quem morreu vem de `players[]`; se o Player saiu e sumiu da lista, o feed fica sem nome. Proposta: `players[]` mantém quem saiu, com `connected: false`. 8. Fechar a lista de `code` possíveis em `HudState.error` ([i18n.md](../contracts/i18n.md) "Em aberto" 4). 9. `onEnd.result` do Player local (§6, decisão 6) |
| [matches-api.md](../contracts/matches-api.md) (Akita) | **Quase** | **Campos das telas** (é o "Em aberto" 1 dele): lobby e sala de espera, o `RoomInfo` atual basta (`players.length` / `max_players`, `options.theme`, `ready`, `connected`, `created_by` para o botão de iniciar, `min_players` para habilitá-lo). Falta: 1. **Catálogo de Maps** por Mode com `max_players` de cada um ([i18n.md](../contracts/i18n.md) "Em aberto" 5). 2. **`GET /api/matches/{id}` devolve `MatchDetail` assim que `matches.status = "finished"`**, mesmo com a Room ainda na memória: a Room fica viva 60 s depois do `game_over`, e a tela de resultado abre ~1,2 s depois dele. Pela regra atual ("Room viva → `RoomInfo`"), ela receberia o formato errado. 3. Em `MatchDetail.players[]`: `xp_gained`, `elo_before`, `elo_after` (mostrar "+120 XP, +16 Elo"). 4. Em `achievements.unlocked[]`: `{code, unlocked_at, match_id}`, para a tela de resultado filtrar o que foi desbloqueado nesta partida. 5. Com o meu "Em aberto" 3 respondido, as três rotas de leitura deixam de ser públicas (§2.1 dele) |
| [room-options.md](../contracts/room-options.md) (Rafael) | **Quase** | 1. A forma de entrega do catálogo de Maps à Web (§5.1 dele): proponho `GET /api/maps`, junto com o Akita. 2. Normalização (§5.3): resposta na §6 acima. 3. Os limites (`start_hp` 5–20, `frag_limit` 3–10, `time_limit_s` 120–600) entram no formulário do lobby como `min`/`max` do campo; se mudarem, mudam no mesmo PR deste contrato |

## 8. Ordem de execução e carga por semana

No calendário replanejado ([replanejamento-e-board.md](../pm/replanejamento-e-board.md)). Os "pronto quando" são os do plano; o que mudou de semana tem o motivo ao lado.

| Semana | O que eu entrego | d |
|---|---|---|
| **S1** · até 10/10 | **`i18n.md`** (07/10) · assinatura dos 5 contratos (§7) · estrutura do `frontend/` combinada com o Rafael · **F0.4** · **F7.2** estrutura, seletor e teste de chaves → **C1 (09/10): casca React com seletor de 3 idiomas** | ≈ 2,5 |
| **S2** · 11–17/10 | **F7.1** contra o backend real (sem refresh ainda) e `/ws/app` · **F7.4** integrada · **F7.7** parte 1: listar, criar com defaults, entrar, pronto, iniciar · **F7.6** parte 1: `/play/:matchId` montando o `mountGame` real → **C2 (16/10)** | ≈ 4,5 |
| **S3** · 18–24/10 | **F6.6** · **F6.7** · **F7.6** parte 2: HUD completa · **F7.1** fecha quando o F6.3 do Augusto chegar (recarregar mantém o login) | ≈ 5 |
| **S4** · 25–31/10 | **F7.5** (puxado da S3) · **F7.7** parte 2: RoomOptions no lobby · **F7.8** | ≈ 5,5 |
| **S5** · 01–14/11 *(duas semanas)* | **F7.3** (empurrado da S1–S2) · **F7.2** traduções completas · **F7.9** · checklist de PO em todos os módulos (§11) · **F9.1** | ≈ 4,5 + folga |
| **S6** · 15–21/11 | bug, tradução, README fechado, ensaio | — |

**Por que F7.5 e F7.3 mudaram de semana.** Na distribuição do plano, a S3 somava F6.6 + F6.7 + F7.5 + F7.6 = 7,5 d numa semana de 5. F7.5 depende de F6.6 e F6.7, que são meus e fecham na S3, então ela vai para a S4. F7.3 é solo, curta e não está em nenhum checkpoint antes do C5, então ocupa a S5, que tem duas semanas. Se sobrar tempo na S2, F7.3 volta para lá: é a primeira tarefa que eu puxo.

**Os dois riscos que eu vejo:**

- **C2 depende de três pessoas ao mesmo tempo:** o lobby do Akita (F5.2), o `/ws/app` e o `mountGame` do Augusto (F2.1, F2.5). Se algum não chegar, a tela do lobby funciona com MSW e o checkpoint mostra a integração que existir. Não escrevo backend dos outros para fechar a demo.
- **S4 é o gargalo do Akita** (F5.4–F5.8 numa semana, [caminho-5-akita.md](caminho-5-akita.md) §5), e o meu F7.8 consome tudo isso. As telas ficam prontas contra os exemplos do `matches-api.md` antes; a integração pode escorregar para a S5 sem bloquear o C4 de mais ninguém.

**Experiência e estimativas.** As estimativas do plano assumem fluência em React. Com experiência básica, a trilha da §12 é feita **antes** de cada tarefa, e a regra do plano §8.1 vale: tarefa passando 50 % da estimativa vira assunto da reunião de segunda. Se for preciso cortar, corto dentro da tarefa antes de cortar módulo: leaderboard como tabela simples, barra de level sem animação, histórico sem filtro por Mode.

## 9. Divergências encontradas nos documentos

Registro aqui e aviso o dono de cada arquivo, em vez de implementar por um documento e descobrir o conflito depois.

1. **A branch `front` (Rafael) cria `package.json` na raiz e versiona `node_modules/`** (≈ 2 600 arquivos). O F0.4 põe o pacote em `frontend/` (§6, decisão 1). Combinar antes de qualquer um dos dois abrir PR.
2. **`Path` do cookie de refresh:** `/api/auth` no [auth.md](../contracts/auth.md) §2.6, `/api/auth/refresh` no [infra.md](../contracts/infra.md) §2.3 e no slice do Akita (§4, decisão 2). O logout precisa do cookie, então vale `/api/auth`. Augusto e Akita.
3. **F6.3 (refresh) foi para a S3** no slice do Augusto, e o "pronto quando" do meu F7.1 depende dele. Não é bloqueio, é data: F7.1 fecha na S3.
4. **[matches-api.md](../contracts/matches-api.md) §2.1** declara três rotas públicas; a minha resposta ao "Em aberto" 3 dele as torna autenticadas. Akita atualiza.
5. **[matches-api.md](../contracts/matches-api.md) §2.4**: `GET /api/matches/{id}` devolve `RoomInfo` enquanto a Room estiver viva, e ela fica viva 60 s depois do fim. A tela de resultado precisa de `MatchDetail` logo após o `onEnd` (§7).
6. **O plano §5 (F7.4) e §7 falam de "entrar com a 42"**; o [auth.md](../contracts/auth.md) acrescentou o Google. A tela terá os dois botões; o plano é atualizado pelo Roberto (o "Em aberto" 3 do `auth.md` já lista isso).
7. **A regra "agente de IA não commita"** está no `AGENTS.md` só na branch `contracts-decisions`. Vale para mim desde já (§13).

## 10. O que eu explico na defesa

Por módulo que passa pela minha Slice (plano §7):

| Módulo | O que eu abro e explico |
|---|---|
| **Multiple languages** (Minor, inteiro) | `locales/` com os três idiomas; a ordem de escolha do idioma; o seletor gravando no perfil; como um `code` do backend vira texto; o lint `no-literal-string` e o teste que compara as chaves; as páginas legais por idioma; a HUD traduzida sem texto no canvas |
| **Standard user management** (Major, inteiro com o auth do Augusto) | editar perfil; upload de avatar validado no front e regravado no back, com o padrão; amigos unilaterais e o status online vindo do `/ws/app`; a página de perfil |
| **Framework front + back** (Major, parte minha) | o React: rotas protegidas, contexto de auth com o access em memória, cliente HTTP único que renova o token |
| **Real-time** (Major, parte minha) | o lobby mudando sem recarregar e o status online, os dois pelo `/ws/app`; a reconexão com espera crescente |
| **Web-based game** (Major, parte minha) | `/play/:matchId`: a casca dona do canvas, o jogo dono do conteúdo, a HUD recebendo `HudState` por `onHud` sem conhecer o jogo |
| **Game customization** (Minor, parte minha) | o formulário do lobby com os defaults visíveis; criar sem mexer em nada |
| **Game statistics** (Minor, parte minha) | as seis exigências do subject, cada uma apontando para a tela e para a rota que a alimenta |
| **Obrigatórios** | Privacy Policy e Terms of Service com conteúdo real; validação nos dois lados; responsivo e acessível; console limpo em todas as telas; framework CSS |

Respostas que eu preciso ter na ponta da língua: **por que o access fica em memória e o refresh em cookie `HttpOnly`** (XSS não lê o refresh); **como a casca sabe que não há sessão sem erro no console**; **por que a HUD é React e o canvas não tem texto** (i18n e o laço de render fora da reconciliação do React); **por que o avatar é regravado e não servido como chegou**; **por que a amizade é unilateral**.

A "modificação rápida" que podem pedir na minha parte (subject, cap. VII; plano F9.2): um texto novo traduzido nos três idiomas; um campo novo no perfil (coluna, `PATCH`, formulário, validação nos dois lados); uma opção nova no formulário do lobby; um `code` de erro novo com tradução. Ensaiar as quatro na S6.

## 11. Papel de PO: checklist do subject por módulo

Rodado em cada checkpoint a partir do C2, com o critério observável na tela. **O módulo só entra no README se todos os itens passam** (plano §7). Esta lista copia o texto do subject ([transcendence.md](../transcendence.md), cap. III e IV) para as telas da casca; os módulos sem tela (ORM, Monitoring, Advanced 3D) são conferidos pelos donos.

| Módulo | O subject exige | Onde se vê |
|---|---|---|
| **Multiple languages** | sistema de i18n; 3 traduções completas; seletor de idioma na UI; todo texto visível traduzível | qualquer tela, trocando o idioma no cabeçalho; páginas legais; erros de formulário; HUD |
| **Standard user management** | atualizar o perfil; enviar avatar, com padrão se não houver; adicionar amigos e ver o status online deles; página de perfil com as informações | `/settings`, `/friends`, `/users/:userId` |
| **Game statistics** | estatísticas (vitórias, derrotas, ranking, level); histórico com partidas 1v1, datas, resultados, oponentes; conquistas e progressão; leaderboard | `/users/:userId` (stats, level com barra, conquistas, histórico), `/matches/:matchId`, `/leaderboard` |
| **Game customization** (parte da tela) | configurações ajustáveis; defaults quando nada é escolhido; mapas ou temas diferentes | formulário de criação em `/lobby` |
| **Real-time** (parte da tela) | atualização em tempo real entre clientes; conexão e desconexão tratadas | duas abas em `/lobby`; status online em `/friends` ao abrir e fechar o site |
| **Web-based game** (parte da tela) | regras e condição de vitória/derrota visíveis na UI | HUD e tela de resultado |
| **Obrigatórios do cap. III** | Privacy Policy e Terms of Service com conteúdo real, link no rodapé; frontend claro, responsivo e acessível; framework CSS; validação de formulários no front e no back; console do Chrome sem warnings nem erros; vários usuários simultâneos com atualização em tempo real | toda tela, no Chrome atual, com o DevTools aberto e a janela estreita |

Como PO também mantenho o backlog da minha Slice no board, no formato de [replanejamento-e-board.md](../pm/replanejamento-e-board.md) §3: uma issue por ID, com o "pronto quando" copiado do plano.

## 12. Trilha de aprendizado, por tarefa

Feita **antes** da tarefa, não durante. Fontes oficiais primeiro.

| Antes de | Estudar | Onde |
|---|---|---|
| F0.4 | React com TypeScript (componentes, props, `useState`, `useEffect`); Vite; Tailwind (utilitários, responsivo, `focus-visible`) | [react.dev/learn](https://react.dev/learn), [vite.dev/guide](https://vite.dev/guide/), [tailwindcss.com/docs](https://tailwindcss.com/docs) |
| F7.2 | `i18next` (namespaces, interpolação, plural) e `react-i18next` (`useTranslation`, `Trans`) | [react.i18next.com](https://react.i18next.com/), [i18next.com](https://www.i18next.com/) |
| F7.1 | React Router (rotas, `loader`, rota protegida); Context; `fetch` e `async/await`; o fluxo de tokens do [auth.md](../contracts/auth.md) §2.6 | [reactrouter.com](https://reactrouter.com/), MDN *Using Fetch* |
| F7.1 (testes) | `vitest`, Testing Library, MSW | [vitest.dev](https://vitest.dev/), [mswjs.io](https://mswjs.io/) |
| F7.6 e F7.7 | WebSocket API do navegador; o ciclo de vida de um componente que monta e desmonta um recurso externo (`useEffect` com limpeza) | MDN *WebSocket*, [ws-manager.md](../contracts/ws-manager.md) §2.9 |
| F6.6 e F6.7 | FastAPI: `APIRouter`, `Depends`, `UploadFile`; Pydantic v2; SQLAlchemy 2.0 assíncrono (`select`, `session.execute`); Pillow (`Image.open`, `ImageOps.fit`); `pytest` com `httpx.ASGITransport` | [fastapi.tiangolo.com/tutorial](https://fastapi.tiangolo.com/tutorial/), [docs.sqlalchemy.org asyncio](https://docs.sqlalchemy.org/en/20/orm/extensions/asyncio.html), [pillow.readthedocs.io](https://pillow.readthedocs.io/) |
| F7.9 | WCAG básico: contraste, foco visível, rótulos de formulário, navegação por teclado, `aria-*` em modal e menu | [WAI-ARIA Authoring Practices](https://www.w3.org/WAI/ARIA/apg/), Lighthouse no Chrome |

## 13. Fluxo de trabalho

- **Branch** `<nº-issue>-<slug>`; **PR** com `Closes #<nº>` no corpo; PR que muda contrato muda o arquivo de contrato no mesmo PR ([replanejamento-e-board.md](../pm/replanejamento-e-board.md) §3).
- **Revisão:** PR que mexe em `users` ou `friendships` passa pelo Augusto; PR que mexe no compose ou no Nginx (volume `/media`), pelo Akita.
- **Todo commit é meu.** Agente de IA não faz commit, push nem abre PR, e nenhuma mensagem leva atribuição a ferramenta. Para código-fonte, a regra do `AGENTS.md` vale: o agente explica o conceito, propõe o trecho e pergunta se aplica ou se eu digito. Na defesa, eu explico cada linha.
- **Validar é meu:** rodar local antes do PR (`npm run build`, `vitest`, lint, e o console do Chrome aberto na tela que mudou); o CI confere de novo.

---

> **Links para arquivos que ainda não estão na `main`:** [auth.md](../contracts/auth.md) e [ws-manager.md](../contracts/ws-manager.md) (branch `feat/Auth`), [caminho-2-augusto.md](caminho-2-augusto.md) (idem).
