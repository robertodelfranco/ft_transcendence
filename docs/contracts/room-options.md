# Contrato: opções da Room (`room-options.md`)

**Estado:** rascunho para revisão; pendências em §5. **Escreve:** Render 3D e conteúdo. **Assinam:** Simulation, Partidas/lobby e Web.

## 1. Para que serve

A casca web envia as escolhas de criação da Room; a API valida e aplica defaults, e a Simulation e o cliente consomem as opções resultantes. Este contrato define valores, limites e aplicação por Mode, sem duplicar as rotas de [matches-api.md](matches-api.md).

## 2. Formas

### 2.1 Opções

Tabela da [arquitetura](../catacombs42-web-arquitetura.md) §6.4, considerando a retirada de `enemy_density` registrada em [map-format.md](map-format.md). Base consultada: `main`, revisão `7fae52b`.

| Opção | Tipo | Valores / limites | Default | Mode |
|---|---|---|---|---|
| `map` | string | Nome de Map da pasta do Mode, sem extensão; `[a-z0-9_]+` | Primeiro da lista; ordem em aberto | Ambos |
| `theme` | string | `dungeon` ou `sewer` | `dungeon` | Ambos |
| `start_hp` | inteiro | 5–20 HP, inclusive | 10 | Ambos |
| `pickups.potion` | boolean | `true` ou `false` | `true` | Ambos |
| `pickups.mana` | boolean | `true` ou `false` | `true` | Ambos |
| `pickups.armor` | boolean | `true` ou `false` | `true` | Ambos |
| `frag_limit` | inteiro | 3–10 Frags, inclusive | 5 | `pvp` |
| `time_limit_s` | inteiro | 120–600 segundos, inclusive | 180 | `pvp` |

O `map` é escolha de quem cria a Room, mas **fica fora do objeto `options`**: é campo próprio na criação, no `RoomInfo` e em `welcome.room`, ao lado de `mode`. Decidido em 06/10; a arquitetura e [ws-messages.md](ws-messages.md) já seguem.

### 2.2 Aplicação

- Opções são imutáveis depois de criar a Room.
- `start_hp` é HP inicial e teto da poção. Cura por poção vem de `POTION_HEAL`, em [rules.md](rules.md).
- Desligar um Pickup faz suas células virarem `0` no Grid inicial da Room. Chave não é configurável, porque Doors dependem dela.
- Theme altera aparência no cliente; não altera Simulation ou Grid.
- Não existe `enemy_density`; o Map define os Enemies, com teto de 20 no `coop`.
- Não existe opção de fogo amigo: fireball não fere Player no `coop` e fere no `pvp`.
- No `pvp`, Enemies e Boss ficam desligados; vitória usa `frag_limit` ou o placar em `time_limit_s`.
- `mode` e `max_players` são parâmetros de criação publicados pela API. A arquitetura prevê `coop` até 5 Players e `pvp` 1v1. Mínimo para começar e defaults de capacidade estão em §5.2.

O cliente recebe opções completas, com defaults aplicados, em `welcome.room.options` ([ws-messages.md](ws-messages.md)). O limite de vagas precisa respeitar a quantidade de Spawns do Map.

### 2.3 Validação de entrada

[Matches API](matches-api.md) publica `422 invalid_options`, com `fields`, para opções inválidas, e `404 map_not_found` para Map ausente. Não criar envelope de erro próprio neste contrato; o formato de cada erro por campo depende de `auth.md`.

## 3. Exemplo

Criação mínima já aceita pelo contrato da API, para o consumidor copiar:

```http
POST /api/matches
Content-Type: application/json
Authorization: Bearer <access>
```

```json
{"mode": "coop", "map": "dungeon_map"}
```

Nesse pedido, os defaults documentados são `theme = "dungeon"`, `start_hp = 10` e os três Pickups ligados. `frag_limit` e `time_limit_s` não afetam o `coop`; a presença desses campos no objeto normalizado depende de §5.3.

Escolhas explícitas de visual e vida, mantendo o Map no lugar publicado pela API:

```json
{
  "mode": "coop",
  "map": "dungeon_map",
  "options": {
    "theme": "sewer",
    "start_hp": 15,
    "pickups": {"potion": true, "mana": true, "armor": false}
  }
}
```

## 4. Decisões

- **Defaults produzem partida jogável.** A API já permite criar com Mode e Map, sem preencher todas as opções.
- **Configuração congelada após criação.** Simulation e cliente usam as mesmas regras durante toda a partida.
- **Map escolhe posições; Theme escolhe aparência.** Uma troca de textura não muda a colisão.
- **Sem densidade configurável.** Segue o corte de escopo registrado em `map-format.md`; quantidade de Enemies é autoria do Map.
- **Chaves sempre disponíveis.** Desligá-las poderia impedir a passagem por Doors trancadas.

## 5. Em aberto

### 5.1 Onde fica Map — Conteúdo, Simulation e Partidas

Decidido em 06/10: `map` fica fora de `options` em todos os consumidores (§2.1).

Definir também a ordem do catálogo para o default “primeiro da lista” ser determinístico. Proposta: lista explícita por Mode; alternativa: ordem alfabética dos nomes. O endpoint/forma de entrega desse catálogo à Web ainda precisa ser combinado.

### 5.2 Players por Mode — Conteúdo e Partidas

| Mode | Capacidade proposta | Default proposto | Mínimo proposto para começar |
|---|---|---:|---:|
| `coop` | Inteiro de 1 a 5 | 5 | 1 |
| `pvp` | Exatamente 2 | 2 | 2 |

O mínimo repete a proposta de [rooms.md](rooms.md) §5: permite desenvolver e jogar coop sozinho, mantendo a demonstração multiplayer com três ou mais pessoas. PvP precisa de dois oponentes. A quantidade de Players “prontos” exigida pelo início deve ser fechada no contrato de lobby.

### 5.3 Normalização — Conteúdo, Partidas e Web

- Opções exclusivas de `pvp` enviadas no `coop`: rejeitar ou ignorar? Proposta: rejeitar quando explicitamente enviadas e omitir do objeto normalizado de `coop`.
- Campo desconhecido: proposta de rejeitar, para erro de digitação não virar default silencioso.
- `pickups` parcial: proposta de aplicar default por chave; `null` e tipos incorretos são inválidos. Confirmar sem coerção de string para inteiro/boolean.
- Confirmar limites inclusivos e inteiros para HP, Frags e segundos com o validador da API.

### 5.4 Conteúdo e Themes — Conteúdo e Render

Fechar a lista publicada de Maps por Mode, Pickups e Doors permitidos no `pvp` e quantidade de Spawns para respawn. `map-format.md` propõe pelo menos quatro Spawns de PvP; não tratar isso como regra aprovada.

`dungeon` e `sewer` são os Themes atuais. Se o adapter retrô entrar depois, combinar sua seleção sem adicionar um valor de `theme` que API e manifesto desconheçam.
