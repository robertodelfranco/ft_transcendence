# F3.8 — Themes dungeon e sewer (#190)

O Theme recebido em `welcome.room.options.theme` seleciona o conjunto carregado
pelo adapter em `frontend/game/src/index.ts`. O catálogo tipado fica em
`frontend/game/src/render/themes.ts`. O Theme não muda Grid nem regras.

## Conteúdo

- Dungeon preserva paredes, cores e sprites anteriores.
- Sewer usa paredes 5/6/7/8, chão RGB [0,0,168], Sea Dragon, Boss Skeleton
  e Boss Attack, conforme `contracts/mount-game.md`, §5.3.
- Fireball do Player, Door, mão e Pickups são compartilhados.
- A paleta inicial de iluminação do esgoto é fria/esverdeada; os limites
  de luzes, sombras e intensidades permanecem os da F3.5. A paleta pode ser refinada depois.
- Os 28 PNGs foram copiados sem transformação de
  `https://github.com/robertodelfranco/42-Cub3D`, commit
  `66b147353fb0278e6bbe09c98a469db9b84f8b26`, diretório `assets/`.
  Exceção posterior: `sea_dragon_8.png` foi editado na #290 (ver "Água no sewer").

## Validação local

Rafael confirmou nesta sessão que build, lint e testes do frontend passaram
após a renomeação dos auxiliares da HUD. Também confirmou o funcionamento da
comparação visual dos Themes e da seleção pelo lobby, conforme o roteiro apresentado.
Nenhum comando de validação foi executado pelo agente.

Não houve confirmação específica dos testes de falha de asset ou de saída durante
carregamento; esses casos não são apresentados aqui como validados.

## Nota para Caio — compatibilidade dos nomes da HUD

Durante a validação, o teste completo apresentou 29 falhas em quatro arquivos da
casca, com erro de componente React indefinido. Foram encontrados os pares
`Players.tsx`/`players.ts` e `Scoreboard.tsx`/`scoreboard.ts`. Imports sem extensão
podem resolver para o módulo errado em sistemas que não distinguem maiúsculas,
como a configuração padrão do macOS.

Foram renomeados apenas os auxiliares e seus testes:

- `players.ts` → `playerUtils.ts`;
- `players.test.ts` → `playerUtils.test.ts`;
- `scoreboard.ts` → `scoreboardUtils.ts`;
- `scoreboard.test.ts` → `scoreboardUtils.test.ts`.

Os imports foram atualizados em `Players.tsx`, `Scoreboard.tsx`, `KillFeed.tsx`
e nos testes renomeados. Os componentes mantêm seus nomes e exports.
A apresentação, as regras, a prioridade das informações e o contrato HudState
não mudaram. Quem estiver trabalhando nesses auxiliares deve usar os novos caminhos.
Os testes passaram após a alteração, conforme validação do Rafael.

Essa correção adicional não entrega nem fecha a #142 (F4.3, especificação da HUD).

## Entrega sugerida

Um PR da branch `190-themes-dungeon-sewer`, com `Closes #190`, em dois commits:

1. `fix(web): evita ambiguidade nos nomes dos arquivos da HUD` — renomeações,
   testes renomeados e imports em `frontend/src/play/` citados acima.
2. `feat(game): adiciona Theme sewer e seleção dos Themes (F3.8)` —
   `frontend/game/dev.ts`, `frontend/game/src/index.ts`, alterações em
   `frontend/game/src/render/`, 28 novos PNGs em `frontend/public/assets/`
   e este documento.

## Água no sewer (#290)

Registrado em 13/11/2026. Só visual: nada aqui muda a Simulation, o Grid ou as regras.

### Por que

As paredes 5–8 têm a água pintada no quarto de baixo, a partir da linha ~47 de 64,
no mesmo azul do `F 0,0,168` do `.cub`. No C o chão era uma cor chapada que se fundia
com essa faixa: a superfície da água parecia estar na linha pintada, um pouco abaixo
da câmera, e dava a impressão de andar meio submerso. No Three.js o chão virou um plano
iluminado em y=0, e a faixa azul passou a parecer parte da parede em pé sobre ele. O
chão parecia deslocado da parede, e o Player coop ficava em pé no seco.

### O que faz

- **Theme:** `water?: { level, roughness }` em `themes.ts`. O sewer usa
  `{ level: 0.20, roughness: 0.4 }`; a linha pintada mede ~0,25, e 0,20 foi ajustado
  no olho. Sem `water` (dungeon), o chão fica em y=0 como antes.
- **Plano da água** (`renderer.ts`): o chão sobe até `level` e usa
  `MeshStandardMaterial` com essa `roughness`, que reflete as tochas, no lugar do
  `MeshLambertMaterial`. O teste de profundidade esconde tudo o que fica abaixo do
  plano, então o que está na água sai cortado pela superfície sem código extra.
- **Altura de cada billboard** (`billboards.ts`): a base de cada um em relação à
  superfície da água.

  | Billboard | Base | Por quê |
  |---|---|---|
  | Player coop | y=0 | o sprite não tem ondulação pintada; a água corta as pernas |
  | Enemy (sea dragon) | água − 0,08 | a ondulação pintada fica 6–14 texels acima da base do quadro parado |
  | Boss (boss skeleton) | água − 0,06; na morte, − 0,09 | a elipse de água termina na base de todos os quadros, e 4 texels a cortam no meio; na morte, a poça do respingo (quadro 9) parecia flutuar |
  | key, potion | água − 0,05 | só a sombra e o vão pintados sob o item (13 texels) ficam submersos |
  | mana, armor | na superfície | placeholders sem sombra; afundar cortaria o desenho |
  | Projéteis | 0,5 | sem mudança |

- **Âncora dos quadros:** por padrão, cada quadro encosta o pixel opaco mais baixo na
  base. No sea dragon, andar e atacar usam a base do quadro mais baixo do sheet
  (`alignToSheetBase`), como no C, para a linha d'água pintada não pular entre os
  quadros. A morte usa a base de cada quadro, porque o desenho afunda dentro do PNG: no
  quadro 8, a ondulação termina na linha 50, contra 62 no quadro parado. O Boss usa
  a base de cada quadro.
- **Teto e Door:** na água, a cabeça do Boss passa de y=1 (base 0,14 + 0,87), e o plano
  do teto a escondia. Com `water`, o teto não escreve depth. A Door que sobe ao abrir
  passa a ser cortada em y=1 por um plano de clipping (`localClippingEnabled` no
  renderer), para não aparecer por cima do teto. No dungeon o teto continua
  escrevendo depth.
- **Sprite editado:** em `sea_dragon_8.png` (65×65, morte do sea dragon), a ondulação
  da frente ficava nas linhas 45–50, debaixo d'água. Os 126 pixels dela foram copiados
  5 linhas acima (40–45), só nas duas cores de água (`84,84,252` e `84,252,252`). O
  corpo não mudou e as linhas originais continuam lá, então a base do quadro é a
  mesma. O original está no commit anterior ao `b4ada6e` e no repo do C.
- **Anéis de ondulação** (`waterRipples.ts`): um anel deitado sobre a água
  (+0,002), com a paleta das paredes, gerado em memória como `DataTexture` de 64×64
  (1 px ≈ 0,016). São 4 quadros de raio 8 a 26 px, com 1,2 s de vida, esmaecendo a
  partir de 0,7 de opacidade. Saem a cada 0,3 s de quem anda e a cada 1,4 s de quem
  está parado, com fase aleatória. Aparecem no pé de Enemies, Boss (anel 1,3×),
  Players coop e do Player local, na posição da câmera, visível ao olhar para baixo.
  São desenhados antes dos sprites (`renderOrder = -1`), então o corpo cobre a metade
  de trás do anel. De longe usam mipmap, para a linha fina não piscar no ângulo
  rasante. O pool é fixo, de 64 anéis, sem alocar durante o render.

### Como as profundidades foram medidas

A vista de frente é exata: a câmera fica a 0,5, acima da água, então tudo o que fica
abaixo da linha d'água num billboard vertical some atrás do plano. Um script em Python
recriou essa vista para cada quadro a partir dos PNGs, com as mesmas contas do
`billboards.ts` (base, `height`, `referenceHeight` do sheet, profundidade abaixo da
água). As linhas da ondulação foram localizadas pelas cores de água de cada sheet.
O script não foi versionado.

### Validação

- Pelo agente: `vitest --project game` (174 testes, incluindo os novos de
  `billboards.test.ts` e `waterRipples.test.ts`), `eslint game/src/render` e `tsc -b`.
  No `tsc`, os únicos erros são em `Legal.tsx`, porque falta `react-markdown` no
  `node_modules` local; não vêm desta mudança.
- Pelo Roberto, no jogo, em coop no sewer: altura da água; sea dragon andando,
  atacando e morrendo; Boss parado, atacando e morrendo; Pickups; Player coop e anéis.
- Pendentes (checklist da #290): Door abrindo no sewer, dungeon sem regressão,
  console do Chrome sem warnings e FPS na cena de carga do sewer
  (`/game/dev.html?stress=1&theme=sewer`), anotado em `performance-f3.10.md`.

### Cache do PNG editado

O `frontend/nginx.conf` serve `/assets/` com `Cache-Control: immutable` de 1 ano, e os
PNGs do jogo não mudam de nome a cada build. Um navegador que já carregou o
`sea_dragon_8.png` antigo continua com ele; para ver o novo, use DevTools → botão
direito no recarregar → "Esvaziar cache e recarregar". A correção definitiva, a
combinar com o Akita, é restringir o `immutable` aos arquivos do build com hash no
nome.
