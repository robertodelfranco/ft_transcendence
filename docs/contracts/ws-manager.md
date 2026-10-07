# Contrato: `ConnectionManager` e `/ws/app` (`ws-manager.md`)

**Estado:** rascunho de 07/10/2026. **Escreve:** Augusto. **Assina:** Akita (lobby em tempo real em F5.2: publica `lobby_update`, `lobby_removed` e `match_started` só com a §2.5) e Caio (presença na lista de amigos e lobby vivo na casca, só com a §2.3 e a §2.4).

## 1. Para que serve

O `ConnectionManager` é o registro único de sockets abertos por User, no processo do backend. Ele serve dois canais: **`/ws/app`**, que a casca abre logo depois do login e mantém aberto enquanto o site estiver aberto (presença e lobby), e **`/ws/game/{match_id}`**, o socket da partida ([ws-messages.md](ws-messages.md)).

Este arquivo define a interface que o resto do backend chama, as mensagens de `/ws/app` nos dois sentidos, os códigos de fechamento e o que o cliente faz quando o socket cai. As mensagens de `/ws/game` não estão aqui: são as de [ws-messages.md](ws-messages.md), e este contrato só diz como o socket delas é registrado (§2.6).

## 2. Formas

### 2.1 Convenções

- **Endereço.** `wss://<host>/ws/app`. O Nginx repassa `/ws/` com upgrade e timeout de 3600 s, sem reescrever o caminho ([infra.md](infra.md) §2.3, item 4).
- **Envelope.** O mesmo de [ws-messages.md](ws-messages.md) §2.1: objeto JSON num frame de texto, com `"v": 1` e `"type"`. Tipo desconhecido, campo faltando ou tipo errado fecha com `4400`.
- **Ids.** `user_id` e `match_id` inteiros.
- **Autenticação.** O token vai na primeira mensagem (`join`), nunca na query string ([auth.md](auth.md) §4, decisão 9). Vale só no `join`: o socket não cai quando o access vence.
- **Um worker.** O registro é um dicionário em memória; só funciona com um processo de backend (arq. §2, invariante 3).

### 2.2 Interface do `ConnectionManager`

```python
# app/ws/manager.py — implementado por Augusto (F2.1)
Channel = Literal["app", "game"]

class ConnectionManager:
    async def connect(self, user_id: int, channel: Channel, ws: WebSocket,
                      match_id: int | None = None) -> Connection: ...
    async def disconnect(self, conn: Connection, code: int = 1000) -> None: ...

    async def send_to_user(self, user_id: int, message: dict | str,
                           channel: Channel | None = None, *, droppable: bool = False) -> bool: ...
    async def broadcast(self, user_ids: Iterable[int], message: dict | str,
                        channel: Channel | None = None, *, droppable: bool = False) -> None: ...
    async def broadcast_all(self, message: dict | str, channel: Channel = "app") -> None: ...

    def is_online(self, user_id: int) -> bool: ...
    def online_users(self) -> set[int]: ...
    def on_presence_change(self, callback: Callable[[int, bool], Awaitable[None]]) -> None: ...

    async def close_all(self, code: int) -> None: ...        # desligamento do backend
```

| Método | Comportamento |
|---|---|
| `connect` | registra o socket **depois** do `join` válido e devolve o `Connection` (que guarda a fila de envio, §2.7). No canal `game`, se o User já tem um socket `game`, o antigo é fechado com `4408` (§2.6) |
| `disconnect` | remove do registro e fecha o socket com `code`, se ainda estiver aberto. Chamar duas vezes não é erro |
| `send_to_user` | põe a mensagem na fila de **todas** as conexões do User naquele canal (`None` = os dois). Devolve `False` se o User não tem nenhuma. **Nunca levanta** por socket fechado ou User offline |
| `broadcast` | `send_to_user` para cada id da lista, com a mensagem serializada **uma vez** |
| `broadcast_all` | para todas as conexões do canal (é como `lobby_update` chega a todo mundo, §2.4) |
| `droppable=True` | a mensagem pode ser descartada se a conexão estiver atrasada (§2.7). Só o Snapshot do jogo usa |
| `is_online` / `online_users` | **online = ao menos um socket `app` aberto** (§2.3). O canal `game` não conta |
| `on_presence_change` | registra um callback chamado com `(user_id, online)` quando a presença muda, já com o atraso da §2.3. É por aqui que o módulo de usuários pode reagir, se precisar |
| `close_all` | fecha tudo com o código dado; o `lifespan` do app chama com `4503` no desligamento |

`message` como `dict` é serializado pelo manager; como `str`, já vem serializado (o laço da Room serializa o Snapshot uma vez por envio, [ws-messages.md](ws-messages.md) §4).

Há **uma instância** do `ConnectionManager` por processo, criada no `create_app()` e acessada pela dependência `get_connection_manager` (para o teste trocar por outra).

### 2.3 Presença

- **Um User está online** quando tem ao menos um socket `/ws/app` aberto, em qualquer aba. Fechar uma de duas abas não muda nada.
- **Online é anunciado na hora**; **offline espera 5 s** (`PRESENCE_OFFLINE_DELAY_S`). Se o User reconecta dentro desse tempo (recarregar a página fecha e reabre o socket), ninguém recebe nada. Sem isso, cada F5 faria o User piscar offline e online na tela dos amigos.
- **Quem recebe:** quem tem o User como amigo, isto é, toda linha de `friendships` com `friend_id` igual a ele ([auth.md](auth.md) §2.9: amizade unilateral). O manager não conhece amizade; o `/ws/app` (F2.1) consulta `friendships` quando a presença muda e chama `broadcast`.
- **Estado inicial:** o `welcome` traz `online_friends`, os amigos do User que já estavam online (pergunta 7 do briefing). Depois disso só chegam mudanças.
- **Amigo adicionado depois:** a rota de adicionar amigo (Caio, F6.7) devolve o novo amigo já com `online` preenchido por `is_online`, e a lista de amigos também. A partir daí, as mudanças dele chegam por `presence`.
- Quando o último `/ws/app` do User fecha e o atraso passa, `users.last_seen_at` é atualizado.

### 2.4 Mensagens de `/ws/app`

**Cliente → servidor**

| `type` | Campos | Regras |
|---|---|---|
| `join` | `token: string` (access JWT) | Primeira mensagem. Sem `join` válido em 5 s, fecha com `4401` |
| `ping` | `t: number` (relógio do cliente, ms) | Opcional; o servidor devolve `pong` com o mesmo `t` |

Qualquer outra mensagem depois do `join` fecha com `4400`: o `/ws/app` é só de ida. Ações da casca (entrar no Lobby, ficar pronto, adicionar amigo) são HTTP.

**Servidor → cliente**

| `type` | Campos | Para quem | Quando |
|---|---|---|---|
| `welcome` | `user_id: int`, `online_friends: int[]` | quem fez o `join` | resposta ao `join` |
| `presence` | `user_id: int`, `online: bool` | quem tem `user_id` como amigo | presença mudou (§2.3) |
| `lobby_update` | `room: RoomInfo` | **todo `/ws/app` conectado** | uma Room em `lobby` foi criada ou mudou (entrou, saiu, pronto, host novo) |
| `lobby_removed` | `match_id: int`, `reason: "started" \| "aborted"` | todo `/ws/app` conectado | a Room saiu do estado `lobby`: começou, ou foi destruída |
| `match_started` | `match_id: int` | só os Players daquela Room | `start` deu certo; a casca navega para `/play/{match_id}` |
| `pong` | `t: number` | quem mandou `ping` | |
| `error` | `code: string`, `message: string` | | logo antes de fechar com `44xx` ou `4503` (§2.8) |

`RoomInfo` é o de [rooms.md](rooms.md) §2.3, inteiro, e não um delta ([matches-api.md](matches-api.md) §4, decisão 3).

**Como a tela de lobby usa isto** (Caio, F7.7): o `/ws/app` já está aberto desde o login. Ao abrir a tela, ela chama `GET /api/matches` e guarda as mensagens de lobby que chegarem enquanto a resposta não vem; quando ela chega, aplica a lista e depois as mensagens guardadas, na ordem. Daí em diante, `lobby_update` substitui a Room pelo `match_id` (ou acrescenta, se é nova) e `lobby_removed` tira da lista. Nada de polling.

### 2.5 O que o lobby chama para publicar

Para o Akita não montar mensagem à mão, F2.1 expõe três funções; o formato do fio fica só neste contrato.

```python
# app/ws/app_events.py — implementado por Augusto (F2.1), chamado pelo lobby (F5.2)
async def publish_lobby_update(info: RoomInfo) -> None: ...                      # broadcast_all
async def publish_lobby_removed(match_id: int, reason: Literal["started", "aborted"]) -> None: ...
async def publish_match_started(match_id: int, user_ids: Iterable[int]) -> None: ...
```

| Momento no lobby (F5.2) | Chamada |
|---|---|
| `POST /api/matches` criou a Room | `publish_lobby_update(info)` |
| `join`, `leave` (com Room ainda viva) ou `ready` | `publish_lobby_update(info)` |
| `leave` do último Player (Room destruída, Match `aborted`) ou TTL do Lobby | `publish_lobby_removed(match_id, "aborted")` |
| `start` | `publish_match_started(match_id, players)` e depois `publish_lobby_removed(match_id, "started")` |

As três são chamadas **depois** do `commit` da rota: quem recebe a mensagem e busca por HTTP já encontra o banco atualizado.

### 2.6 O socket da partida

O `/ws/game/{match_id}` (F2.4) usa o mesmo manager no canal `game`:

- Registra com `connect(user_id, "game", ws, match_id=...)` depois do `join` de [ws-messages.md](ws-messages.md) §2.2.
- **Um socket `game` por User.** Se o mesmo User abre outro (segunda aba, ou reconexão antes de o socket velho cair), **o novo vence** e o antigo fecha com `4408` (`replaced`). É a proposta de [ws-messages.md](ws-messages.md) §5.3, e é o que deixa a Reconnection funcionar quando o servidor ainda não percebeu a queda do socket anterior.
- O Snapshot vai com `droppable=True`; Event, `welcome` e `error` nunca.
- A Room não depende do socket: quando ele cai, o laço da Room continua e o Player entra no Grace period ([ws-messages.md](ws-messages.md) §2.8).

### 2.7 Garantias de envio

- **Um escritor por socket.** Cada `Connection` tem uma fila e **uma** task que escreve nela; ninguém mais chama `ws.send_*`. Duas escritas simultâneas no mesmo socket corrompem o frame.
- **Um leitor por socket.** O laço do endpoint (`/ws/app` ou `/ws/game`) é a única task que lê.
- **Ordem preservada** por conexão: mensagens saem na ordem em que entraram na fila.
- **Descarte só do que pode ser descartado.** Se já existe uma mensagem `droppable` esperando na fila, a nova a substitui no mesmo lugar: o cliente lento recebe o Snapshot mais recente e pula os intermediários. Mensagem não descartável nunca é jogada fora.
- **Cliente travado é desconectado.** Se a fila passa de `SEND_QUEUE_MAX` (256) mensagens não descartáveis, a conexão fecha com `4429` (`slow_consumer`). O cliente reconecta (§2.9), e na partida o Grace period cobre a volta. Assim um cliente que não lê não segura memória nem a Room.
- **Detecção de socket morto** é do `uvicorn`: ping de protocolo a cada 20 s, e o socket fecha se o pong não vier em 20 s (`--ws-ping-interval 20 --ws-ping-timeout 20`). O navegador responde ao ping sozinho, sem código no cliente. O `ping`/`pong` de aplicação existe só para medir RTT ([ws-messages.md](ws-messages.md), F2.12).

### 2.8 Fechamento e erros

Mesma numeração de [ws-messages.md](ws-messages.md) §2.7, com dois códigos novos (`4408` e `4429`), que valem para os dois canais. Antes de fechar com `44xx` ou `4503`, o servidor manda `error` com o `code`.

| Código | `code` | Canal | Quando |
|---|---|---|---|
| `1000` | | os dois | fim normal: a casca fechou (logout, aba fechada) ou a Room foi removida |
| `4400` | `invalid_message` | os dois | mensagem fora do contrato |
| `4401` | `unauthenticated` | os dois | sem `join` em 5 s, ou token inválido |
| `4408` | `replaced` | `game` | o mesmo User abriu outro socket da partida (§2.6) |
| `4429` | `slow_consumer` | os dois | fila de envio cheia (§2.7) |
| `4503` | `server_shutdown` | os dois | backend encerrando |

Os códigos `4403`, `4404` e `4409` são só do `/ws/game` e estão em [ws-messages.md](ws-messages.md).

### 2.9 O que o cliente faz quando o socket cai

Vale para o `/ws/app` (Caio, F7.1) e, fora da partida terminada, para o `/ws/game` (Augusto, F2.5 e F2.10).

| Fechou com | O cliente |
|---|---|
| `1000` | não reconecta |
| `4401` | chama `/api/auth/refresh` uma vez e reconecta com o token novo; se o refresh devolver `authenticated: false` ou `invalid_refresh`, vai para o login |
| `4408` | não reconecta: outra aba assumiu. Mostra o aviso traduzido |
| `4400` | não reconecta (é bug); mostra erro |
| `4429`, `4503`, `1006` (queda sem fechamento) e os demais | reconecta com espera crescente: 1, 2, 4, 8, 16 s, depois a cada 30 s, cada uma com até 20 % de variação aleatória para as abas não voltarem juntas |

Durante a reconexão do `/ws/app`, a casca mantém a tela e marca os status online como desconhecidos; o `welcome` seguinte traz o estado inteiro de novo. A tela de lobby refaz o `GET /api/matches` depois de cada `welcome` novo, porque perdeu as mensagens do intervalo.

### 2.10 Métrica

`ws_connections{channel}` (gauge, [infra.md](infra.md) §2.6): sobe no `connect`, desce no `disconnect`. `channel` ∈ `app`, `game`. Sem `user_id` nem `match_id` em label (arq. §12.1).

### 2.11 Testes

O `conftest` do backend (F0.3) traz uma fixture `fake_ws`, um socket falso que grava o que recebe e permite simular a queda. É com ela que o lobby (Akita) e os amigos (Caio) testam que a mensagem certa chegou a quem devia, sem abrir socket de verdade.

## 3. Exemplo

Abrindo o `/ws/app` depois do login:

```json
{"v": 1, "type": "join", "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…"}
{"v": 1, "type": "welcome", "user_id": 7, "online_friends": [9, 15]}
```

O amigo 21 abriu o site; o 9 fechou e não voltou em 5 s:

```json
{"v": 1, "type": "presence", "user_id": 21, "online": true}
{"v": 1, "type": "presence", "user_id": 9, "online": false}
```

Lobby: a Room 12 ganhou um Player, e a 13 foi abandonada:

```json
{"v": 1, "type": "lobby_update", "room": {
  "match_id": 12, "mode": "coop", "map": "dungeon_map", "max_players": 5, "min_players": 1,
  "status": "lobby", "created_by": 7,
  "options": {"theme": "dungeon", "start_hp": 10, "pickups": {"potion": true, "mana": true, "armor": true}},
  "created_at": "2026-10-07T18:00:03Z",
  "players": [
    {"user_id": 7, "username": "augusto", "avatar_url": "/media/avatars/default.png",
     "ready": true, "connected": true, "joined_at": "2026-10-07T18:00:03Z"},
    {"user_id": 9, "username": "rdel_fra", "avatar_url": "/media/avatars/9.png",
     "ready": false, "connected": true, "joined_at": "2026-10-07T18:01:12Z"}
  ]}}
{"v": 1, "type": "lobby_removed", "match_id": 13, "reason": "aborted"}
```

O host iniciou a Room 12 (os Players dela recebem as duas mensagens; os outros, só a segunda):

```json
{"v": 1, "type": "match_started", "match_id": 12}
{"v": 1, "type": "lobby_removed", "match_id": 12, "reason": "started"}
```

Token vencido no `join`:

```json
{"v": 1, "type": "error", "code": "unauthenticated", "message": "token expired"}
```

Seguido do fechamento com `4401`.

No lobby (F5.2), depois do `commit` de `POST /api/matches/{id}/join`:

```python
info = rooms.join(match_id, user.id, user.username)
await session.commit()
await publish_lobby_update(info)
```

## 4. Decisões

1. **Online é ter um `/ws/app` aberto.** É o socket que a casca mantém aberto enquanto o site está aberto, inclusive durante a partida. Contar o `/ws/game` também não mudaria nada para quem está jogando, e criaria um caso a mais.
2. **Offline espera 5 s, online não.** Recarregar a página derruba e reabre o socket em menos de um segundo; sem o atraso, os amigos veriam o status piscar. Atrasar o online não tem motivo.
3. **O manager não sabe o que é amizade.** Ele guarda sockets e entrega mensagens. Quem decide para quem vai a presença é o `/ws/app`, consultando `friendships`. Assim o manager se testa sem banco, e trocar amizade unilateral por mútua não toca nele.
4. **`lobby_update` vai para todo `/ws/app` conectado**, não só para quem está dentro da Room (que é o que a arq. §7.4 dizia). Sem isso, a tela de partidas abertas não veria uma Room nova sendo criada, e o [matches-api.md](matches-api.md) promete uma tela que nunca faz polling. Com menos de 20 Users na demo, mandar para todos custa nada e dispensa inscrição.
5. **`lobby_removed` é uma mensagem própria**, e não um `lobby_update` com `status` diferente: quando a Room é destruída, não sobra `RoomInfo` para mandar.
6. **`/ws/app` é só de ida depois do `join`.** Toda ação da casca é HTTP, que já tem validação, envelope de erro, rate limit e `request_id`. Repetir isso no socket seria um segundo protocolo para manter.
7. **O lobby publica por três funções, não pelo manager.** O formato do fio fica num arquivo só, e o PR que muda uma mensagem muda este contrato e essas funções, sem tocar no código do Akita.
8. **Publicar depois do `commit`.** Quem recebe a mensagem pode chamar HTTP logo em seguida; se a publicação viesse antes, ele leria o banco antigo.
9. **Um escritor por socket, com fila.** O `ws.send` do Starlette não é seguro para duas tasks ao mesmo tempo, e um cliente lento não pode bloquear quem manda para ele (a task da Room manda para 5 Players a cada Snapshot).
10. **Descartar só o Snapshot**, e substituindo o anterior na fila: Snapshot é estado e o próximo vale mais que o perdido; Event, presença e lobby são fatos e não se repetem ([ws-messages.md](ws-messages.md) §4).
11. **No canal `game`, a conexão nova vence** (`4408`). Na Reconnection, o socket antigo muitas vezes ainda parece aberto para o servidor; recusar o novo travaria o User fora da própria partida até o ping de 20 s perceber.
12. **Heartbeat é do `uvicorn`**, por ping de protocolo. O navegador responde sozinho, e o tráfego a cada 20 s também impede o Nginx de achar o socket ocioso.

## 5. Em aberto

| # | Questão | Quem decide | Quando |
|---|---|---|---|
| 1 | Um User pode estar em dois Lobbies ao mesmo tempo, ou em um Lobby e numa partida? O `RoomManager` impede entrar duas vezes na **mesma** Room ([rooms.md](rooms.md), `AlreadyIn`), mas não em Rooms diferentes. Proposta: uma Room por User; `join` em outra devolve um `code` novo (`already_in_other_match`). Isso também simplifica a §2.6 (um socket `game` por User). | Akita | revisão deste contrato |
| 2 | Falha ao **abrir** um WebSocket (backend fora do ar) aparece no console do Chrome como erro ("WebSocket connection to … failed"), e não há como suprimir pelo código. Em fluxo normal não acontece, mas na reconexão depois de `4503` sim. Proposta: aceitar (só ocorre com o backend caído) e dizer isso na defesa se aparecer; e não reconectar enquanto a aba está escondida (`document.hidden`), para reduzir as tentativas. | Caio e Augusto | S2 |
| 3 | A arq. §7.4 precisa mudar para o público do `lobby_update` (decisão 4), para a mensagem `lobby_removed` (decisão 5) e para o formato `{room: RoomInfo}` (ela mostra campos soltos). | Roberto (dono da arquitetura) | junto com a revisão deste contrato |
| 4 | [ws-messages.md](ws-messages.md) §2.7 ganha `4408` e `4429`, e o item 3 de "Em aberto" dele vira decisão. | Roberto | junto com a revisão deste contrato |
| 5 | `SEND_QUEUE_MAX` = 256 e `PRESENCE_OFFLINE_DELAY_S` = 5 são palpites. Medir no teste de carga (F2.13) e no ensaio. | Augusto | S5 |
| 6 | A HUD mostra o aviso de `4408` ("a partida foi aberta em outra aba") e de `4429`? Os dois precisam de chave de tradução. | Caio | com [i18n.md](i18n.md) |

---

> **Links para arquivos que ainda não existem:** [i18n.md](i18n.md) (Caio).
