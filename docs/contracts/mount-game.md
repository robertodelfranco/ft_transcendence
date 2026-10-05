# Contrato: ViewState, Renderer, Themes e mountGame (`mount-game.md`)

**Estado:** rascunho para revisão; pendências em §5. **Escreve:** Render 3D e conteúdo. **Assinam:** Simulation/Prediction, Netcode e Web/HUD.

## 1. Para que serve

Prediction e Interpolation produzem o estado que o Renderer consome para desenhar a partida. O pacote do jogo expõe `mountGame` e entrega `HudState` à casca web, que possui o canvas e desenha a HUD.

## 2. Formas

Base: [arquitetura](../catacombs42-web-arquitetura.md) §8, [CONTEXT](../../CONTEXT.md), [README](README.md), [ws-messages.md](ws-messages.md) e [map-format.md](map-format.md), consultados na revisão `7fae52b` da `main`. Esta seção mantém as formas dessas fontes; os tipos ainda não definidos por elas são propostas em §5.

### 2.1 Coordenadas e identidade

| Dado | Tipo / unidade | Regra |
|---|---|---|
| Player | `id: number`, inteiro | É o `user_id` do User; não é outro identificador |
| Match | inteiro | `match_id` no protocolo; `matchId` na interface TypeScript da arquitetura |
| Posição | `x, y: number`, células | Grid `x` → Three.js `X`; Grid `y` → Three.js `Z` |
| Altura | unidades do mundo | Eixo `Y`; uma célula vale 1 e a parede tem altura 1 |
| Direção | `dx, dy: number`, sem unidade | `yaw = atan2(-dx, -dy)`, em radianos; norte = `-Z` |
| Centro de célula | células | Célula `(x, y)` tem centro `(x + 0.5, y + 0.5)` |
| Pitch | local ao cliente | Limite ±60°; unidade no tipo candidato em §5.1 |

O Renderer recebe posições prontas para desenhar: não faz Prediction, colisão, dano, coleta nem acesso ao socket. Olhando para norte, leste aparece à direita; a cena não replica o espelhamento do Cub3D.

### 2.2 Dados de ViewState

A arquitetura exige os componentes abaixo, mas ainda não define os nomes das propriedades do objeto. A declaração candidata completa está em §5.1.

| Componente | Campos disponíveis | Unidade / origem |
|---|---|---|
| Player próprio | `id, name, x, y, dx, dy, hp, mana, armor, keys, alive, connected`, mais pitch local | Posição prevista por Prediction |
| Outros Players | Os mesmos campos de Player, sem pitch local | Posições interpoladas |
| Enemies | `id: string`, `x, y: number`, `state` | Posições em células |
| Boss | `x, y: number`, `hp: number` inteiro, `state`; ou `null` | Singleton; `null` no `pvp` |
| Projectiles | `id: string`, `kind: "fireball" ou "bullet"`, `owner: number ou null`, `x, y, dx, dy: number`, `state` | `owner` é `user_id`; bullet do Boss usa `null` |
| Doors | `x, y: number` inteiros, `open, locked: boolean` | Coordenadas da célula, não do centro |
| Grid atual | `string[]`, retangular | Grade inicial com o `grid_delta` do Snapshot aplicado |
| Map inicial | Objeto com `grid: string[]` | `welcome.map`; opções da Room já aplicadas |

Em Player, `id`, `hp`, `mana`, `armor` e `keys` são inteiros; `name` é string; posições/direções são números; `alive` e `connected` são booleanos. A Mana chega arredondada para baixo; a fração fica na Simulation ([rules.md](rules.md)).

**`grid_delta` é acumulado desde a grade inicial.** A integração recompõe o Grid usando a base de `welcome.map.grid` e o delta do Snapshot atual. Aplicar apenas sobre a grade do Snapshot anterior deixaria uma Door aberta quando ela fecha e sai do delta. O Renderer recebe a grade já recomposta.

Pickups e tochas vêm das células `K/P/M/A/T`. Players, Enemies e Boss vêm das entidades: seus marcadores já foram substituídos por `0` no Grid recebido.

### 2.3 Estados de animação

Lista fechada de [ws-messages.md](ws-messages.md) §2.5:

| Entidade | Estados |
|---|---|
| Enemy | `alert`, `attack`, `dying` |
| Boss | `idle`, `alert`, `attack`, `dying` |
| Projectile | `moving`, `hit` |

O cliente conta o tempo da animação e a reinicia ao mudar `state`. Não recebe índice de PNG. Enemy permanece em `dying` por `ENEMY_DYING_S = 1.5 s`; Projectile permanece em `hit` por `PROJECTILE_HIT_S = 0.4 s`. Quando o id sai do Snapshot, o sprite é removido. Boss usa `BOSS_DYING_S = 1.2 s`; a relação entre sua animação e a tela de fim está em §5.5.

### 2.4 Renderer e Assets

Assinatura da arq. §8.1:

```ts
interface Renderer {
  init(map: GameMap, assets: Assets): Promise<void>;
  render(view: ViewState, dt: number): void;
  resize(width: number, height: number): void;
  dispose(): void;
}
```

| Método | Responsabilidade |
|---|---|
| `init` | Preparar cena e recursos do Map/Theme antes do primeiro desenho |
| `render` | Desenhar o ViewState recebido, sem rede ou React |
| `resize` | Ajustar o desenho; resolução interna independente do tamanho CSS |
| `dispose` | Liberar recursos de GPU ao sair ou trocar de Room |

`GameMap`, `Assets`, unidade de `dt` e convenção de `resize` são detalhados como propostas em §5. O `AssetLoader` carrega PNGs, modelos e sons. Falha deve chegar à tela com `HudState.status = "error"`; um aviso no console não é tratamento de erro.

O ThreeRenderer é a entrega inicial; o RetroRenderer é posterior. Os Themes atuais são `dungeon` e `sewer`; nenhum terceiro valor é acrescentado a `RoomOptions` neste rascunho.

### 2.5 Themes

O Theme fornece texturas de parede, cores de chão/teto, sprites de Enemy e Boss e luz. O Map informa a localização; Theme não altera colisão, dano ou posição de entidade.

A arquitetura não fecha o schema do arquivo de Themes. A proposta de arquivo, catálogo de PNGs e duração dos clipes está em §5.3; permanece ali até revisão.

### 2.6 HudState e MountOptions

Assinaturas da arq. §8.3, preservando seus nomes:

```ts
export interface HudState {
  hp: number; maxHp: number; mana: number; maxMana: number; armor: number;
  keys: number; alive: boolean; ping: number | null;
  players: Array<{
    id: number; name: string; hp: number; alive: boolean; connected: boolean;
  }>;
  scoreboard: { frags: Record<string, number>; timeLeftS: number } | null;
  killfeed: Array<{ by: number | null; victim: number; tick: number }>;
  status: "connecting" | "running" | "finished" | "disconnected" | "error";
  error?: string;
}
export interface MountOptions {
  matchId: number;
  getAccessToken: () => Promise<string>;
  onHud: (hud: HudState) => void;
  onEnd: (result: {
    result: "win" | "loss" | "draw"; winnerIds: number[]; reason: string;
  }) => void;
  wsUrl?: string;
}
export declare function mountGame(
  canvas: HTMLCanvasElement, opts: MountOptions
): { unmount(): void };
```

| Campo | Unidade / significado |
|---|---|
| `hp`, `maxHp` | Pontos de vida; teto vem de `options.start_hp` |
| `mana`, `maxMana` | Pontos de Mana; teto depende do Ruleset |
| `armor`, `keys` | Pontos de Armor e quantidade de chaves |
| `alive` | Player local vivo |
| `ping` | RTT; `null` enquanto não medido; explicitar unidade em §5.5 |
| `players` | Estado dos participantes; `id` é o `user_id` |
| `scoreboard` | `null` no `coop`; `timeLeftS` em segundos e contagem de Frags no `pvp` |
| `killfeed` | Eliminações de Player; `by` pode ser `null`, `victim` é `user_id`, `tick` é Tick da Room |
| `status`, `error` | Estado da integração e código traduzido pela casca |
| `getAccessToken` | A casca entrega o token ao jogo quando solicitado |
| `onHud`, `onEnd` | Callbacks de atualização de HUD e término |
| `wsUrl` | Opcional; padrão `wss://<host>/ws/game/<matchId>` |

O placar de rede já é `{players: [{id, frags}], time_left_s}`, enquanto o da arquitetura ainda usa `Record<string, number>`. A divergência precisa de revisão conjunta (§5.5); não se deve passar o objeto da rede diretamente ao `onHud`.

O canvas pertence à casca (posição, tamanho, CSS). O jogo desenha cena, mão e minimapa; textos e ícones da HUD são emitidos por `onHud` e desenhados em React, com i18n.

## 3. Exemplo

Integração com funções fornecidas pela casca:

```ts
const game = mountGame(canvas, {
  matchId: 12,
  getAccessToken,
  onHud: atualizarHud,
  onEnd: mostrarResultado,
});
// Na desmontagem da página:
game.unmount();
```

HudState completo e ilustrativo para montar a tela de `coop`; os números de Mana e Armor não fixam balanceamento:

```json
{
  "hp": 10, "maxHp": 10, "mana": 60, "maxMana": 100, "armor": 0,
  "keys": 1, "alive": true, "ping": null,
  "players": [
    {"id": 7, "name": "jogador_7", "hp": 10, "alive": true, "connected": true}
  ],
  "scoreboard": null, "killfeed": [], "status": "running"
}
```

Para a cena de desenvolvimento, usar [snapshot.example.json](snapshot.example.json): `welcome` e `snapshot` do mesmo Map, com 5 Players, 20 Enemies, Boss, Projectiles e Doors. O `dev.html` prepara esses dados para o Renderer; o Renderer não lê mensagens WebSocket. A forma candidata desse preparo é §5.1.

## 4. Decisões

- **Estado separado do desenho.** Permite desenvolver o Renderer com a fixture, antes do servidor, e trocar o adapter sem mudar a rede.
- **Mesmos ids e estados do protocolo.** Evita conversões de identidade e estados que o servidor nunca envia.
- **Animação local, regra no servidor.** Terminar um clipe não aplica dano nem encerra a partida.
- **Map e Theme separados.** A mesma grade pode mudar de aparência sem mudar a Simulation.
- **HUD na casca.** Texto e tradução ficam na Web; o Renderer permanece independente de React.
- **Assinaturas copiadas da arquitetura.** `matchId` e `players[].id` mantêm os nomes publicados; sua identidade continua sendo `match_id` e `user_id`.

## 5. Em aberto

As propostas abaixo não estão aprovadas. Responsáveis são indicados por área; a revisão deve atribuir uma data às pendências.

### 5.1 ViewState e GameMap — Render, Prediction e Netcode

Proposta compilável dos tipos, usando os campos já publicados no protocolo:

```ts
type GameMap = { grid: string[] };
type PlayerView = {
  id: number; name: string;
  x: number; y: number; dx: number; dy: number;
  hp: number; mana: number; armor: number; keys: number;
  alive: boolean; connected: boolean;
};
type EnemyView = {
  id: string; x: number; y: number; state: "alert" | "attack" | "dying";
};
type BossView = {
  x: number; y: number; hp: number;
  state: "idle" | "alert" | "attack" | "dying";
};
type ProjectileView = {
  id: string; kind: "fireball" | "bullet"; owner: number | null;
  x: number; y: number; dx: number; dy: number; state: "moving" | "hit";
};
type DoorView = { x: number; y: number; open: boolean; locked: boolean };
interface ViewState {
  localPlayer: PlayerView & { pitch: number };
  otherPlayers: PlayerView[];
  enemies: EnemyView[];
  boss: BossView | null;
  projectiles: ProjectileView[];
  doors: DoorView[];
  grid: string[];
  map: GameMap;
}
```

Propor pitch em radianos, positivo olhando para cima; `otherPlayers` exclui o próprio Player. Só chamar `render` depois de existir Player local. Fechar câmera de espectador, ausência do Player após saída e se `view.map` permanece necessário além de `init(map)`.

### 5.2 Ciclo de vida — Render e Netcode

Propor `dt` em segundos; `resize` em pixels CSS; escala interna controlada pelo Renderer; canvas recebido no construtor do adapter. `unmount` encerra laço, listeners, áudio e chama `dispose`, inclusive após inicialização parcial. Fechar tipo `Assets` depois do manifesto: URLs brutas ou recursos já carregados? Proposta: recursos carregados, para o primeiro desenho não depender de fetch.

### 5.3 Themes e clipes — Render e conteúdo

Proposta de arquivo: `frontend/game/public/assets/themes.json`, com entradas `dungeon` e `sewer`. Cada entrada teria `walls`, `floor`, `ceiling`, `sprites` e `light`; cores RGB inteiras 0–255; cada clipe teria `pngs: string[]`, `durationMs: number` por quadro e `loop: boolean`. Os caminhos abaixo são origens no Cub3D, não URLs já publicadas no frontend.

| Recurso | `dungeon` | `sewer` |
|---|---|---|
| Parede, slots legados NO/SO/WE/EA | `assets/map/dungeon_wall_{1,9,2,10}.png` | `assets/map/dungeon_wall_{5,6,7,8}.png` |
| Chão RGB | `[84,84,84]` | `[0,0,168]` |
| Teto RGB | `[22,30,0]` | `[22,30,0]` |
| Prefixo de Enemy | `assets/enemy/skeleton/skeleton_` | `assets/enemy/sea_dragon/sea_dragon_` |
| Prefixo de Boss | `assets/enemy/boss_mage/boss_mage_` | `assets/enemy/boss_skeleton/boss_skeleton_` |
| Prefixo de bullet | `assets/player/fireball_` | `assets/enemy/boss_attack/boss_attack_` |

Chão, teto e paredes vêm de `maps/valid/enemy.cub` e `enemy_sewer.cub`. Os slots do raycaster espelhado precisam de conferência antes de virar faces do Three.js.

Para ambos os Themes, somar o índice e `.png` ao prefixo correspondente:

| Entidade / estado | Índices PNG | Quantidade | Proposta de ms por quadro | Repetição |
|---|---|---:|---:|---|
| Enemy `alert` | 0, 1, 2 | 3 | 300 | Sim |
| Enemy `attack` | 3, 4, 5, 6 | 4 | 350 | Sim enquanto `attack` |
| Enemy `dying` | 7, 8, 9 | 3 | 500 | Não; segura o último até remoção |
| Boss `idle` / `alert` | 0, 1, 2 | 3 | 300 | Sim |
| Boss `attack` | 3, 4, 5, 6 | 4 | 300 | Fechar sincronização com tiro |
| Boss `dying` | 7, 8, 9 | 3 | 400 | Não |
| Projectile `moving` | 0 | 1 | Estático | — |
| Projectile `hit` | 0, 1, 2, 3 | 4 | 100 | Não |

**350 ms no ataque do Enemy é proposta nova**, para um ciclo de quatro PNGs durar os 1,4 s da regra; não é o valor do C (200 ms). Validar visualmente e com Simulation, sem usar o fim do clipe para aplicar dano. Fireball usa `assets/player/fireball_` nos dois Themes.

Outros recursos reaproveitáveis: `assets/map/door_2.png`, `assets/collectables/key.png`, `assets/collectables/pot.png`, `assets/player/player_hand_white.png`. O briefing menciona 65 PNGs; nesta revisão do Cub3D foram encontrados 64 arquivos `.png` em `assets/`, dos quais 62 são candidatos ao render; `win_game.png` e `end_game.png` ficam fora da tela final, que será HUD traduzida. Faltam desenhos próprios de Mana, Armor, tocha e outro Player. Fechar seus arquivos, dimensões e clipes antes de completar o manifesto.

A luz precisa de tipo, cor, intensidade/unidade, alcance e configuração de sombra. Não há valores medidos nem limite de luzes aprovado. Propor começar com luz ambiente e tochas `PointLight`; medir 0, 1, 2 e 4 sombras simultâneas na máquina-alvo antes de fixar o teto de `T` nos Maps.

### 5.4 Câmera e dimensões — Render e conteúdo

Propostas a testar: câmera a 0,5 unidade do chão; Enemy e outro Player com altura 0,8; Boss 0,95; Pickups 0,2, preservando a proporção da imagem. Apoiar a base opaca do sprite no chão, compensando a transparência do PNG. Projétil, tocha, Door e mão ainda precisam de dimensões/deslocamentos.

Fechar FOV e política de resize com documentação oficial e teste visual: o valor horizontal do Cub3D não deve ser copiado diretamente para o FOV vertical da câmera. Confirmar Spawn `N` olhando para cima da grade e parede a leste aparecendo à direita. Esses testes não foram executados nesta preparação.

### 5.5 HUD, eventos e término — Render, Netcode e Web

- **Placar:** proposta de alinhar a HUD à lista do protocolo: `{players: Array<{id: number; frags: number}>; timeLeftS: number}`. Alternativa: manter a forma atual e converter explicitamente lista em `frags`. Alterar arquitetura e consumidores no mesmo PR da decisão.
- **Unidades/atualização:** propor `ping` em ms; fechar frequência do `onHud` e valores antes do `welcome`.
- **Feed:** `player_died` alimenta `{by, victim: player_id, tick}`. A forma atual não representa Kills de Enemy/Boss; decidir se o feed mostra só eliminações de Player ou precisa de uma união de tipos. Duração e limite de linhas também faltam.
- **Término:** preservar `winner_ids` como `winnerIds`; no `pvp`, um `result: "win"` da Room não significa vitória do Player local. Conferir com [rooms.md](rooms.md). Definir quando chamar `onEnd` para não cortar a morte do Boss.
- **Efeitos:** Events não têm posições para todo efeito. Definir como localizar entidades e disparar efeitos repetidos sem exigir campos novos do protocolo silenciosamente.

### 5.6 Erros e aceite — Render, Netcode e Web

Propor capturar falhas de `init` na integração, liberar recursos parciais e emitir `onHud` com código traduzível; o código de asset ainda precisa entrar no catálogo de erros. Confirmar quais assets são obrigatórios e testar URL ausente, imagem corrompida e falha de som. Callback de erro sozinho não comprova console limpo no navegador.

Meta da arquitetura: 60 fps com 5 Players, 20 Enemies e 10 Projectiles, e dez trocas de Room sem crescimento de memória. Medir com Boss, registrar máquina, navegador, resolução interna, sombras e bloom. Não há medição de FPS, memória ou luzes neste documento; nenhum número de luzes é garantia de performance.
