# Seleção do visual de Player — #256

**Data:** 12/11/2026. **Estado:** implementação local; validação funcional e revisão
de Caio (Lobby/i18n), Akita (API), Augusto (RoomManager/rede) e Roberto (Snapshot/Player)
pendentes. Este registro não atribui aceite a eles.

## 1. Para que serve

Cada Player escolhe seu visual na tela de espera do Lobby. Os outros Players veem
a escolha confirmada pelo servidor no Lobby e a sprite correspondente na partida.
Os atributos e as regras são iguais para todos os visuais.

## 2. Formas

- `POST /api/matches/{match_id}/character`, autenticado, recebe somente
  `{character_id: string}` e devolve o `RoomInfo` completo.
- A rota altera só o Player do User autenticado e publica `lobby_update` no `/ws/app`.
- `RoomInfo.players[]` e os Players de `welcome.snapshot` e de cada Snapshot
  recebem `character_id`.
- IDs disponíveis: `nemesis`, `sucubus` e `oil`. Default: `nemesis`.
- Campo ausente, ID desconhecido, tipo errado ou campo extra: 422 `validation_error`.
  Room ausente: 404 `match_not_found`; User sem participação: 409 `not_in_match`;
  Room fora do Lobby: 409 `already_started`.
- `Seat.character_id` guarda o valor no Lobby. O `start` copia para
  `Player.character_id`, que sobrevive a respawn e Reconnection.

## 3. Exemplo

```http
POST /api/matches/12/character
Authorization: Bearer <access>
Content-Type: application/json

{"character_id": "sucubus"}
```

A resposta e o `lobby_update` contêm `character_id: "sucubus"` no Player que pediu
a troca. Os outros Players conservam as escolhas anteriores.

## 4. Decisões

- A seleção é por Player e por Room, não uma RoomOption nem uma preferência
  persistida do User. Não requer migração nem altera o histórico de Matches.
- Qualquer participante pode escolher qualquer visual, inclusive repetido.
- A troca é permitida até o início; não muda o estado de pronto.
- A interface mantém a seleção confirmada até o servidor aceitar a nova.
  Erros usam o envelope e as traduções existentes.
- O cliente carrega todas as sprites do catálogo antes da partida, com o
  tratamento de falhas do AssetLoader. Cada sprite tem seu próprio cálculo de
  altura visível e ponto de apoio dos pés.
- As prévias no Lobby preservam pixel art e tratam falha de imagem com um ícone
  acessível. Nomes, instruções e estado da seleção passam pelo i18n nos três idiomas.
- Um ID que o cliente não conhece usa Nemesis no render; isso também cobre
  exemplos antigos sem o campo. O servidor novo sempre envia o campo.
- A câmera em primeira pessoa e a mão são as mesmas para todos os visuais.
- `projectileSprite` no catálogo do cliente define a imagem do projétil em voo.
  Sucubus usa `player/projectiles/sucubus_atack.png`; Oil usa
  `player/projectiles/oil_atack.png`; Nemesis conserva `player/fireball_0.png`.
  O render cruza `Projectile.owner` com o Player local
  ou os outros Players do ViewState. Autor ausente usa a fireball comum.
  A animação de impacto, as partículas e as bullets do Boss permanecem iguais.
  Não há novo campo no protocolo nem mudança de dano, velocidade, Mana ou cooldown.

### Adicionar outro visual

1. Adicionar o PNG transparente em `frontend/public/assets/player/<id>.png`.
2. Registrar o ID, a URL da sprite e `projectileSprite` em `frontend/game/src/playerCharacters.ts`.
   Isso acrescenta o card e inclui a sprite no carregamento do jogo.
   Para manter o projétil padrão, usar `/assets/player/fireball_0.png`.
3. Adicionar o mesmo ID ao enum de `backend/app/game/characters.py`.
4. Traduzir `characters.names.<id>` em `frontend/src/locales/{pt-BR,en,es}/lobby.json`.
5. Atualizar os IDs documentados neste contrato e nas referências da API/Snapshot.

O teste `test_character_catalogs_and_sprite_files_agree` detecta divergência entre
os catálogos e verifica a presença dos PNGs.

## 5. Em aberto

- Validação em dois navegadores: escolhas diferentes, início, respawn no PvP e
  Reconnection com o mesmo visual.
- Revisão dos responsáveis pelos contratos listados acima.

### Validação preparada

Testes adicionados para seleção individual, publicação no Lobby, tipos e IDs
inválidos, autenticação, participante externo, bloqueio após start, preservação na
Reconnection e renderização das sprites de cada Player. Fixtures atualizadas para
o novo campo. Os testes existentes do minimapa também foram ajustados às APIs de
canvas e às cores adicionadas anteriormente na #256.

Nenhum teste, build, Docker ou chamada curl foi executado nesta implementação.

### Entrega na branch da #256

Branch: `256-player-hud-boss`. Um commit sugerido para esta seleção:
`feat: permite escolher o visual do Player no Lobby`.
O PR da #256 pode reunir este commit com o anterior; manter `Closes #256` no corpo.

Arquivos deste commit (incluir os PNGs Sucubus e Oil):

```text
backend/app/game/characters.py
backend/app/game/rooms.py
backend/app/game/snapshot.py
backend/app/game/state.py
backend/app/matches/router.py
backend/app/matches/schemas.py
backend/tests/game/test_characters.py
backend/tests/game/test_rooms.py
backend/tests/matches/test_lobby.py
frontend/game/src/playerCharacters.ts
frontend/game/src/types.ts
frontend/game/src/render/billboardAssets.ts
frontend/game/src/render/billboards.ts
frontend/game/src/render/billboards.test.ts
frontend/game/src/render/minimap.test.ts
frontend/game/src/mount.test.ts
frontend/game/src/net/interpolation.test.ts
frontend/game/src/net/predictionLoop.test.ts
frontend/game/src/net/reconciliation.test.ts
frontend/game/src/net/viewstate.test.ts
frontend/game/fixtures/snapshot.example.json
frontend/public/assets/player/sucubus.png
frontend/public/assets/player/oil.png
frontend/public/assets/player/projectiles/sucubus_atack.png
frontend/public/assets/player/projectiles/oil_atack.png
frontend/src/api/types.ts
frontend/src/lobby/CharacterPicker.tsx
frontend/src/pages/WaitingRoom.tsx
frontend/src/pages/WaitingRoom.test.tsx
frontend/src/locales/pt-BR/lobby.json
frontend/src/locales/en/lobby.json
frontend/src/locales/es/lobby.json
frontend/src/mocks/fixtures/rooms.json
frontend/src/mocks/lobbyHandlers.ts
docs/contracts/README.md
docs/contracts/matches-api.md
docs/contracts/rooms.md
docs/contracts/ws-messages.md
docs/contracts/snapshot.example.json
docs/contracts/player-characters.md
```

Em `docs/contracts/mount-game.md`, incluir só os trechos de `character_id` e a
explicação da extensão #256: o arquivo já tinha mudanças locais anteriores.
Usar `git add -p docs/contracts/mount-game.md` para selecionar esses trechos.
Os arquivos de texturas, `assets.ts`, `themes.ts`, `hud.md` e as notas anteriores
foram preservados e não fazem parte desta seleção.
