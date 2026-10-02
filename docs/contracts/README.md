# Contratos: índice e preparação para a reunião de 04/10

Um **Contract** é a interface combinada entre duas Slices: rotas, mensagens, campos, assinaturas. Ele é fechado antes do código dos dois lados, para que cada pessoa trabalhe sem esperar a outra. Este arquivo diz quem escreve cada contrato, o que ele precisa conter e o que cada pessoa traz para a reunião de domingo, 04/10.

Os documentos de apoio são a [arquitetura](../catacombs42-web-arquitetura.md) (citada como "arq. §N"), o [plano de tarefas](../catacombs42-plano-de-tarefas.md) e o glossário em [CONTEXT.md](../../CONTEXT.md). Use os termos do glossário no que escrever.

## O que cada um traz no domingo

A meta da reunião é sair com material suficiente para criar as issues de S1 e S2 de cada pessoa. Para isso, cada um traz:

1. **O rascunho dos contratos que escreve**, em `docs/contracts/`, no [modelo](#modelo-de-contrato) abaixo. Preencha até onde conseguir. Boa parte já está rascunhada na arquitetura: o trabalho é copiar, conferir e completar o que falta.
2. **A seção "Em aberto" preenchida.** Ela vale tanto quanto o resto: é a pauta da reunião.
3. **As respostas das perguntas do seu briefing**, cada uma com duas linhas de porquê. "Pesquisei X" não serve; "decidi X porque Y" serve.
4. **A leitura dos contratos que você assina.** Assinar é ler como consumidor e dizer se dá para trabalhar só com aquilo, sem perguntar nada ao autor.

O ideal é abrir um PR em rascunho com os arquivos. Se o git travar, traga no formato que conseguir.

Até a reunião ninguém precisa escrever código. Esta semana é de pesquisa e definição.

### Se for usar IA para rascunhar

Funciona para montar as seções "Formas" e "Exemplo", desde que você siga quatro regras:

1. **Entregue três arquivos a ela**: este, a [arquitetura](../catacombs42-web-arquitetura.md) e o [CONTEXT.md](../../CONTEXT.md). Só com este arquivo ela inventa campos e rotas.
2. **Peça para copiar o que já existe na arquitetura e marcar o que falta.** O que ela completar por conta própria vai para "Em aberto", não para "Formas".
3. **A seção "O que já está decidido" vale mais que qualquer sugestão dela.** Se a resposta trouxer `room_id`, `frame` ou parser de mapa, está errada.
4. **As perguntas do briefing pedem verificação, não opinião.** Teste no navegador, leia a documentação oficial, meça. Resposta sem fonte ou sem teste vai para "Em aberto".

Na defesa, cada pessoa explica cada linha do próprio contrato. Se você não sabe explicar por que um campo existe, o contrato ainda não está pronto.

## Índice dos contratos

| Contrato | Arquivo | Escreve | Assina | Rascunho em |
|---|---|---|---|---|
| Mensagens do jogo: Snapshot, Events, Input, Action | `ws-messages.md` + `snapshot.example.json` | Roberto | Augusto, Rafael | arq. §7.1–§7.3 |
| Arquivo de Map (grade) | `map-format.md` | Roberto | Rafael | arq. §6.1 |
| Números das regras | `rules.md` | Rafael (valores), Roberto (nomes e unidades) | Augusto | arq. §6.3 |
| `ViewState`, `Renderer`, arquivo de Themes, `HudState`, `mountGame` | `mount-game.md` | Rafael | Augusto, Roberto, Caio | arq. §8 |
| `RoomOptions` | `room-options.md` | Rafael | Roberto, Akita, Caio | arq. §6.4 |
| Auth, envelope de erro, schema de usuários | `auth.md` | Augusto | Caio | arq. §9.1, §9.2, §10.3 |
| `ConnectionManager` e `/ws/app` | `ws-manager.md` | Augusto | Akita, Caio | arq. §7.4, §9.3 |
| `RoomManager`, `MatchResult`, schema de partidas | `rooms.md` | Akita | Augusto, Roberto | arq. §10 |
| API REST de lobby | `matches-api.md` | Akita | Caio | arq. §10.1 |
| Rotas, host, TLS, `.env` | `infra.md` | Akita | todos | arq. §12 |
| i18n, catálogo de erros, rotas do SPA, API de usuários | `i18n.md` | Caio | Augusto | arq. §9.2, §11 |

## Modelo de contrato

Todo contrato tem estes cinco títulos, nesta ordem:

1. **Para que serve.** Duas frases: quem produz, quem consome, o que atravessa.
2. **Formas.** Os campos, rotas ou mensagens, com tipo e unidade de cada um. É a parte principal.
3. **Exemplo.** Um JSON ou uma chamada real que o consumidor possa copiar e usar no mesmo dia.
4. **Decisões.** O que foi escolhido e por quê, em uma ou duas linhas cada.
5. **Em aberto.** O que ainda não foi decidido, com as opções que você enxerga.

## O que já está decidido

Estas decisões valem para todos os contratos. Não precisam ser rediscutidas, só aplicadas.

- **Um identificador por coisa.** O Player é identificado pelo `user_id` do User (um inteiro), em todo lugar: Snapshot, Events, `HudState`, `MatchResult`. A partida é identificada pelo `match_id` (um inteiro), inclusive em `/ws/game/{match_id}` e em `/play/:matchId`. Não existem mais `"p_1"` nem `room_id`.
- **Sem `frame` no Snapshot.** O servidor manda só o `state` de cada entidade (por exemplo `alert`, `attack`, `dying`). O cliente anima no próprio relógio e reinicia a animação quando o `state` muda.
- **Eixos.** O `x` do Grid vira `X` no Three.js, o `y` do Grid vira `Z` e a altura é `Y`. Uma célula é uma unidade e a parede tem altura 1. A direção `(dx, dy)` vira `yaw = atan2(-dx, -dy)`. O norte do Grid é `-Z`, para onde a câmera do Three.js já olha por padrão.
- **O Map diz onde as coisas estão; o Theme diz como elas aparecem.** O arquivo de Map é só a grade, sem linhas de textura nem de cor. Paredes, chão, teto, sprites de Enemy e Boss e luz vêm do Theme, no cliente.
- **Não há parser com códigos de erro.** Quem escreve Map é o time, não o usuário. Fica um carregador pequeno e um teste que confere os mapas da pasta; mapa quebrado reprova o PR.
- **`RoomOptions` são imutáveis** depois que a Room é criada.
- **Não existe fogo amigo.** A fireball nunca fere Player no `coop` e sempre fere no `pvp`.
- **Kill e Frag são coisas diferentes.** Kill é um Enemy ou o Boss morto por um Player. Frag é um Player eliminado por outro, e só existe no `pvp`.
- **HTTPS e login são camadas separadas.** O HTTPS termina no Nginx, que fala HTTP simples com o backend por dentro. Saber quem é o User é trabalho do backend, a cada requisição, pelo token.

## Briefing por pessoa

Cada briefing tem três partes: o que o contrato precisa conter, as perguntas que você responde e o que conferir nos contratos que assina.

### Roberto · Caminho 1 · Simulation e Prediction

**Escreve:** `ws-messages.md`, `snapshot.example.json`, `map-format.md` e os nomes e unidades de `rules.md`.

`ws-messages.md` precisa conter:

- Toda mensagem de `/ws/game/{match_id}`, nos dois sentidos, com cada campo, seu tipo e sua unidade.
- A lista completa de campos de Player, Enemy, Boss, Projectile e Door no Snapshot, mais `grid_delta` e `scoreboard`.
- A lista de Events com o conteúdo de cada um.
- A lista fechada de valores de `state` para Enemy, Boss e Projectile. O Rafael anima a partir dela.
- Os códigos de fechamento do socket.

`snapshot.example.json` precisa ter 5 Players, Mana, Armor, 20 Enemies, o Boss, Projectiles e Doors. É contra ele que o Rafael monta a cena.

`map-format.md` precisa conter os caracteres aceitos, o que cada um significa para o servidor e para o cliente, e a lista do que o teste dos mapas confere.

Perguntas para responder:

1. Qual era o fps real do Cub3D? A arq. §6.3 assume 60 e pede para medir antes de fixar `PLAYER_SPEED`.
2. O projétil anda a 2,5 células por segundo e o Player a 3,6 (7,2 correndo). O Player ultrapassa a própria fireball, e no `pvp` um alvo em movimento não é atingido. Qual número muda?
3. Como `enemy_density: double` funciona na grade? De onde vêm os inimigos a mais?
4. `enemy.cub` e `enemy_sewer.cub` têm 26 Enemies cada, e a meta de performance é 20. Qual é o teto por Map?
5. Quais campos do Snapshot mudam por destinatário? Hoje só `last_input_seq`, o que permite montar o resto uma vez por tick.
6. Qual é o formato do `scoreboard` agora que o id do Player é um número?
7. Quando uma entidade morta sai do Snapshot?
8. O Cub3D desenha o mundo espelhado: o lado direito da tela mostra o oeste quando o jogador olha para norte, e o código compensa trocando as teclas. A cena do Three.js não é espelhada. O que `right` e `rot_right` significam no Input? A resposta precisa estar escrita no contrato, porque o servidor e o cliente dependem dela.

**Assina:** `rooms.md` (os campos do `MatchResult` são os que a Simulation consegue contar?) e `mount-game.md` (o `ViewState` permite ligar a Prediction sem mudar o Renderer?).

### Augusto · Caminho 2 · Auth e Netcode

**Escreve:** `auth.md` e `ws-manager.md`.

`auth.md` precisa conter:

- A tabela de rotas da arq. §9.1, com o corpo exato de cada requisição e de cada resposta.
- O formato do objeto `user`: quais campos existem, e quais só o próprio User vê (o e-mail, por exemplo).
- O envelope de erro e a **lista completa de valores de `code`**. O Caio traduz cada um deles; código fora da lista aparece como texto sem tradução.
- As regras de validação de `username`, e-mail e senha em uma tabela. O Caio repete as mesmas no front.
- A duração dos tokens e os atributos do cookie de refresh.
- Como as outras Slices usam `CurrentUser` e `authenticate_ws_token`.
- As tabelas `users`, `refresh_tokens` e `oauth_accounts`, com colunas, tipos e restrições.
- Um JSON de exemplo de cada resposta, para o Caio montar as telas sem o backend.

`ws-manager.md` precisa conter a interface do `ConnectionManager` (arq. §9.3), as mensagens de `/ws/app` (presença, `lobby_update`, `match_started`) e os códigos de fechamento.

Perguntas para responder:

1. O login é só por e-mail, ou também por `username`?
2. No erro 422, o campo `fields` leva um código por campo (`{"password": "too_short"}`) ou uma mensagem pronta? Só o código é traduzível.
3. Ao carregar a página sem sessão, o `/api/auth/refresh` responde 401, e o Chrome registra todo 401 como erro no console. Console limpo é critério de rejeição. Como a casca descobre que não há sessão sem gerar esse erro? Resolver junto com o Caio.
4. O limite de tentativas de login é por IP. Atrás do Nginx, o backend enxerga o IP do proxy, e todos os usuários cairiam no mesmo balde. Qual cabeçalho traz o IP real, e como o backend passa a confiar nele? Resolver junto com o Akita.
5. O Nginx hoje corta o `/api/` antes de repassar. O backend enxerga `/api/auth/refresh` ou `/auth/refresh`? O `Path` do cookie de refresh depende disso. Resolver junto com o Akita.
6. O access token dura 15 minutos e um socket dura mais que isso. A autenticação do socket vale só no `join`?
7. Como o cliente descobre quais amigos já estavam online quando ele entrou? As mensagens de presença só avisam mudanças.
8. Uma conta criada só pelo login da 42 não tem senha. O que o login por senha responde para ela?
9. O `logout` revoga só o token atual ou a família inteira?

**Entender o proxy.** O Nginx é do Akita, mas o auth e os WebSockets rodam atrás dele, então você precisa saber o que ele faz com a requisição antes de ela chegar ao backend. Chegue no domingo sabendo explicar quatro coisas:

- Onde o HTTPS termina. O backend recebe HTTP simples, e mesmo assim o cookie de refresh é `Secure`.
- Como o `proxy_pass` reescreve o caminho, com e sem a barra no final. É a pergunta 5.
- Quais cabeçalhos o Nginx repassa e quais ele precisa acrescentar: `Host`, `Authorization`, o IP real do cliente. É a pergunta 4.
- O que um WebSocket exige do proxy: os cabeçalhos de upgrade e o tempo máximo sem tráfego antes de a conexão ser cortada.

**Assina:** `ws-messages.md` (dá para escrever `protocol.py` só com ele?), `rooms.md` (a interface do `RoomManager` é a que você vai implementar), `infra.md` (o caminho, os cabeçalhos e o tratamento de WebSocket são os que o auth e o netcode esperam?), `mount-game.md` e `rules.md`.

**Onde olhar:** arq. §4 (decisões 1 a 5 e 9), §9, §12 e §17; o tutorial de segurança do [FastAPI](https://fastapi.tiangolo.com/tutorial/security/oauth2-jwt/); a [RFC 9700](https://www.rfc-editor.org/rfc/rfc9700) sobre rotação de refresh; a página de [`Set-Cookie`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie) na MDN; [`proxy_pass`](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_pass) e [WebSocket](https://nginx.org/en/docs/http/websocket.html) no Nginx; o [nginx.conf](../../proxy/nginx.conf) atual do repositório.

### Rafael · Caminho 3 · Render 3D e conteúdo

**Escreve:** `mount-game.md`, `room-options.md` e os valores de `rules.md`.

`mount-game.md` precisa conter:

- O tipo `ViewState`, campo por campo: o próprio Player (com o pitch local), os outros Players, Enemies, Boss, Projectiles, Doors e o Grid. Comece do formato do Snapshot (arq. §7.1).
- A interface `Renderer` (arq. §8.1).
- O **arquivo de Themes**: para cada Theme, as texturas de parede, as cores de chão e teto, o conjunto de sprites de Enemy e de Boss, e a luz. Para cada entidade e cada `state`, quais PNGs, quantos quadros e quanto dura cada quadro.
- O que acontece quando um asset não carrega. A regra é erro na tela, nunca aviso no console.
- `HudState` e `MountOptions` (arq. §8.3), para o Caio assinar.

`room-options.md` precisa conter uma tabela com cada opção, seus valores, o default, os limites e a qual Mode ela se aplica. O rascunho está na arq. §6.4.

`rules.md` precisa dos valores que a arq. §6.3 deixou sem número: `MANA_MAX`, `FIREBALL_MANA_COST`, `MANA_REGEN_PER_S`, `MANA_PICKUP`, `ARMOR_POINTS`, `RESPAWN_DELAY_S` e `MOUSE_MAX_ROT_SPEED`, com uma coluna para `coop` e outra para `pvp`.

Perguntas para responder:

1. Os eixos decididos acima funcionam? Teste visual: um Spawn `N` olha para o lado que a grade mostra como cima, e uma parede a leste aparece à direita.
2. O `fov` da câmera do Three.js é vertical, e os 60° do Cub3D eram horizontais. Qual valor deixa a cena parecida com o Cub?
3. Qual é a altura da câmera e o tamanho de cada sprite em unidades do mundo? Como um item "senta" no chão?
4. Quais valores de `state` você precisa receber do servidor para animar Enemy, Boss e Projectile? Combine a lista com o Roberto.
5. Quantas luzes com sombra a cena aguenta a 60 fps? Isso limita quantas tochas (`T`) um Map pode ter.
6. Dos 65 PNGs do Cub3D, quais servem e quais faltam? Faltam ao menos o Pickup de mana, o de armor, a tocha e o sprite de outro Player.
7. Quantos Players cada Mode aceita, e qual é o mínimo para começar?

**Assina:** `ws-messages.md` (o Snapshot tem tudo que a cena precisa desenhar?) e `map-format.md`.

**Onde olhar:** arq. §8; a [documentação](https://threejs.org/docs/) e os [exemplos](https://threejs.org/examples/) do Three.js (`InstancedMesh`, `Sprite`, `PointLight`, `Fog`, `PerspectiveCamera`); a [Pointer Lock API](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_Lock_API) na MDN; os assets em `assets/` do repositório do Cub3D.

### Caio · Caminho 4 · Web, usuários e i18n

**Escreve:** `i18n.md`.

`i18n.md` precisa conter:

- A convenção de nomes das chaves de tradução e os grupos (por exemplo `common`, `auth`, `lobby`, `hud`, `errors`, `legal`).
- Os códigos de idioma (`pt-BR`, `en`, `es`), que são os mesmos valores gravados em `users.preferred_language`, e o idioma de reserva.
- Como um `code` de erro do backend vira chave de tradução, e o que aparece quando o código é desconhecido.
- A ordem em que o idioma é escolhido: preferência do perfil, escolha salva no navegador, default.
- **O mapa de rotas do SPA**: caminho, tela, se é pública ou protegida, e quais chamadas de API ela faz. É dele que saem as suas issues.
- **A API de usuários**, que é sua nos dois lados: perfil próprio, perfil público, avatar e amigos, com rotas e corpos.
- O framework CSS escolhido e o motivo.

Perguntas para responder:

1. Amizade é mútua, com pedido e aceite, ou basta adicionar? O subject pede "add other users as friends and see their online status". Escolha a forma mais simples que atende e passe o formato da tabela `friendships` para o Augusto, que é dono do schema de usuários.
2. Avatar: quais tipos de arquivo, qual tamanho máximo, onde o arquivo fica guardado e qual é o avatar padrão? Onde ele fica guardado se resolve com o Akita.
3. Como a casca descobre que não há sessão sem gerar erro no console? É a pergunta 3 do Augusto.
4. O `HudState` da arq. §8.3 tem tudo que a HUD precisa mostrar? O que falta?
5. O que a tela de lobby precisa receber para listar as Rooms abertas? Passe a lista de campos para o Akita.
6. Como texto longo (Privacy Policy, Terms of Service) é guardado nos três idiomas?

**Assina:** `auth.md` (dá para fazer as telas de login e cadastro só com ele?), `mount-game.md` (a parte de `HudState` e `MountOptions`), `matches-api.md`, `ws-manager.md` e `room-options.md`.

**Onde olhar:** arq. §8.3, §9 e §11; [react-i18next](https://react.i18next.com/); [React Router](https://reactrouter.com/); os módulos *Standard user management* e *Multiple languages* no [subject](../transcendence.md). Como PO, traga também a lista do que o subject cobra em cada módulo que passa pelas suas telas.

### Akita · Caminho 5 · Partidas, estatísticas, infra e monitoring

**Escreve:** `rooms.md`, `matches-api.md` e `infra.md`.

`rooms.md` precisa conter:

- A interface do `RoomManager` (arq. §10.2): o que o lobby chama.
- `MatchResult` e `MatchPlayerResult`, campo por campo.
- As tabelas `matches`, `match_players`, `player_stats` e `user_achievements`, com colunas, tipos e chaves estrangeiras.
- Um diagrama do schema inteiro, incluindo as tabelas do Augusto.
- Os estados de um Match (`lobby`, `running`, `finished`, `aborted`) e o que causa cada passagem.
- Um `MatchResult` de exemplo para `coop` e outro para `pvp`. Com eles você testa as estatísticas antes de existir partida real.

`matches-api.md` precisa conter as rotas de criar, listar, ver, entrar, sair, marcar pronto e iniciar: método, caminho, corpo, resposta e códigos de erro. Precisa dizer também o que chega por `/ws/app` e o que a tela busca por HTTP, e trazer um JSON de exemplo de cada resposta para o Caio.

`infra.md` precisa conter:

- O mapa de URLs (`/`, `/api/`, `/ws/`, `/grafana/`) e quais portas são publicadas para fora.
- O que o Nginx faz com cada requisição antes de repassá-la: onde o HTTPS termina, como o caminho é reescrito, quais cabeçalhos chegam ao backend e como o WebSocket é tratado. O Augusto constrói o auth e o netcode em cima disso, então escreva essa parte para ele ler.
- O host usado na demo em duas ou três máquinas, e como o certificado do `mkcert` chega às outras máquinas.
- A lista de chaves do `.env.example`.
- O que o CI roda a cada PR.

Perguntas para responder:

1. No `pvp` um Player ganha e o outro perde. O que significa o `result` do Match inteiro? Talvez ele só faça sentido no `coop`, e o `pvp` use apenas o `won` de cada Player.
2. Onde fica o "pronto" de cada Player? O Lobby é um estado da Room, em memória, e o `RoomManager` hoje não tem essa chamada.
3. Quem pode iniciar a partida? O que acontece se quem criou sair do Lobby? E com um Lobby abandonado, sem ninguém?
4. Duas pessoas vão escrever migrações na mesma semana. Como evitar duas cabeças no Alembic? A tabela `users` precisa vir antes, porque `matches.created_by` aponta para ela.
5. O Nginx hoje corta o `/api/` antes de repassar ao backend. Fica assim ou o backend passa a enxergar o caminho inteiro? É a pergunta 5 do Augusto.
6. Qual cabeçalho leva o IP real do cliente ao backend? É a pergunta 4 do Augusto.
7. O `.env.example` usa `db_transcendence`, que é nome de container, e a arq. §12 pede nome de serviço (`db`). Qual vale?
8. O cadastro do app na intra da 42 é imediato? Quais são as regras da URL de retorno, e o SECRET expira?

Como PM, traga também uma proposta de calendário de S2 em diante, considerando o atraso de cerca de duas semanas, e o formato das issues no board.

**Assina:** `ws-manager.md` (dá para atualizar o lobby em tempo real só com ele?), `room-options.md` (é o que o `POST /api/matches` valida) e `auth.md` (as tabelas de usuário, para o diagrama).

**Onde olhar:** arq. §10 e §12; [SQLAlchemy assíncrono](https://docs.sqlalchemy.org/en/20/orm/extensions/asyncio.html); o [tutorial](https://alembic.sqlalchemy.org/en/latest/tutorial.html) e a página de [branches](https://alembic.sqlalchemy.org/en/latest/branches.html) do Alembic; [`proxy_pass`](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_pass) e [WebSocket](https://nginx.org/en/docs/http/websocket.html) no Nginx; [mkcert](https://github.com/FiloSottile/mkcert).

## Depois da reunião

1. Cada ponto de "Em aberto" sai da reunião com uma decisão ou com um responsável e uma data.
2. Os contratos são revisados e entram na `main`. A partir daí, um contrato só muda no mesmo PR que muda o código.
3. Cada pessoa cria as issues de S1 e S2 da própria Slice, citando o contrato de que depende.
4. A seção "Briefing por pessoa" é apagada deste arquivo. O índice, o modelo e as decisões ficam.
