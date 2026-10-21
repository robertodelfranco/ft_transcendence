# F3.3 — Billboards das entidades

Issue: #123. Branch: `123-f3.3-billboards-animados`, criada a partir da branch da F3.4.

## Implementação

`frontend/game/src/render/billboards.ts` desenha o subconjunto de ViewState necessário às entidades. Ele recebe posições prontas e não acessa socket, Simulation ou React.

- Enemies usam os dez PNGs do skeleton: `alert` 0–2, `attack` 3–6 e `dying` 7–9.
- Boss usa os dez PNGs do mage: `idle`/`alert` 0–2, `attack` 3–6 e `dying` 7–9.
- Fireball e bullet usam os PNGs `fireball_0` a `fireball_3`, conforme o Theme dungeon no contrato. `moving` mostra o quadro 0; `hit` percorre os quatro quadros e segura o último até a remoção.
- Pickups vêm das células `K`, `P`, `M` e `A` do Grid recomposto.
- Outros Players usam uma representação provisória estática: o protocolo não define estados ou clipes de animação para eles. Player local e Players mortos não são desenhados; desconectados ficam escurecidos.

Cada entidade tem uma identidade com prefixo por categoria, seu material e seu relógio. Uma mudança de estado reinicia o relógio; o índice do quadro deriva do tempo acumulado em segundos. Os tempos seguem a proposta do contrato `mount-game.md`, §5.3. Terminar uma animação nunca aplica dano nem remove uma entidade por conta própria. A remoção acontece quando o estado recebido deixa de conter a entidade ou o Pickup.

`THREE.Sprite` acompanha a orientação da câmera e usa teste de profundidade contra o mundo. `depthWrite: false` e `alphaTest` evitam que a parte transparente cubra outras entidades. Os sprites preservam a proporção dos arquivos.

`frontend/game/src/render/billboardAssets.ts` declara os recursos do Theme dungeon e prepara os metadados. A transparência é medida uma vez no carregamento para apoiar a base opaca no chão. A referência de altura é compartilhada entre os quadros do mesmo conjunto, evitando redimensionar um Enemy ao trocar o clipe de morte.

Alturas visuais: Enemy e Player 0,8 unidade; Boss 0,95; Pickup 0,2; Projectile 0,18, centrado na altura 0,5. Os valores dos três primeiros grupos seguem a proposta do contrato; os do Projectile são uma escolha visual local.

## Assets

25 PNGs copiados sem alterações de [robertodelfranco/42-Cub3D, commit 66b1473](https://github.com/robertodelfranco/42-Cub3D/tree/66b147353fb0278e6bbe09c98a469db9b84f8b26):

- `assets/enemy/skeleton/skeleton_0.png` a `skeleton_9.png`.
- `assets/enemy/boss_mage/boss_mage_0.png` a `boss_mage_9.png`.
- `assets/collectables/key.png` e `pot.png`.
- `assets/player/fireball_0.png`, `fireball_2.png` e `fireball_3.png`. O quadro 1 já veio na F3.4.

Os caminhos relativos foram preservados dentro de `frontend/public/assets/`. Mana, Armor e outro Player usam SVGs provisórios em `frontend/public/assets/placeholders/`, sem texto: cristal azul, escudo e figura humana verde. A arte definitiva continua pendente; o carregamento não usa esses desenhos como fallback para um arquivo ausente.

## Demo e integração

A resolução do merge com a `main` integra os billboards ao `AssetLoader` e ao `ThreeRenderer`, preservando a F3.4 que já foi integrada:

- O `AssetLoader` junta as URLs de paredes, Door, mão e billboards, sem duplicar a textura de fireball compartilhada. Ele prepara os metadados de transparência antes de entregar `Assets.billboards`.
- Falha na carga ou na preparação dos sprites vira `asset_load_failed`, com descarte das texturas carregadas. A demo apresenta o erro e mantém os controles desabilitados.
- O `ThreeRenderer` adiciona o grupo de billboards à cena, chama `billboards.update(view, dt)` antes do desenho do mundo e libera os materiais em seu `dispose`. O `Assets` continua proprietário das texturas e as libera depois do Renderer. A geometria compartilhada interna de `THREE.Sprite` não é descartada por cada entidade.
- O adapter de `mountGame` usa os mesmos componentes. A demo monta o ViewState com `buildViewState` e `applyGridDelta`; o seletor **Snapshot original** retorna ao Snapshot final da fixture da Simulation.

`frontend/game/fixtures/billboards.ts` contém apenas dados da demonstração:

- `fixtureView` permanece disponível como helper para as fixtures de billboards. Na demo integrada, o preparo do estado usa `buildViewState` e `applyGridDelta`, os mesmos do Netcode.
- `galleryView` fabrica uma sequência visual numa área livre da fixture: Enemy e Boss mudam de estado; Pickups desaparecem; dois Projectiles avançam, mostram `hit` e desaparecem; outro Player desconecta e morre.

Essas sequências não são regras de jogo: a demo adapta a saída da galeria para um ViewState completo, preservando o Player local, a câmera e as Doors. No jogo, esse estado vem do Netcode/Prediction. F3.8 fará a seleção completa entre Themes.

Os resultados de validação abaixo pertencem à implementação original, antes desta resolução do merge. A integração descrita nesta seção ainda precisa da validação local do autor e do CI.

## Validação local

Após a implementação, o autor pediu explicitamente para executar a validação. Resultados em 20/10/2026:

- `npm run build`: passou, incluindo a checagem TypeScript dos arquivos do jogo. O build Vite padrão empacota a casca; a demo foi verificada separadamente no servidor de desenvolvimento.
- `npm run lint`: passou.
- `npm test -- --maxWorkers=1`: 10 arquivos e 91 testes passaram. São os testes existentes, sem cobertura automatizada persistente específica dos novos billboards.
- Chrome headless: todos os assets carregaram; screenshots das cinco categorias da galeria foram inspecionados. Nenhum erro ou warning no console durante o uso normal observado.
- Checks pontuais dos componentes, executados no Chrome: quantidade de entidades da fixture; avanço de quadro; reinício ao mudar estado; retenção do último quadro de morte; remoção e descarte de material; exclusão do Player local e dos mortos; desconectado escurecido; quatro Pickups e sua remoção; posição e quadro de impacto do Projectile; texturas preservadas para descarte pelo proprietário.
- PNG `skeleton_0.png` e SVG `mana.svg` bloqueados separadamente: `asset_load_failed` visível e controles desabilitados.

Esses checks de navegador foram executados de forma pontual, sem adicionar arquivos de teste ao repositório. A inspeção visual adicional de resize, rotação e um ciclo completo de cada galeria pode seguir o roteiro abaixo. Para repetir os comandos:

```sh
cd frontend
npm run build
npm run lint
npm test -- --maxWorkers=1
npm run dev
```

Em `/game/dev.html`, usar o seletor **Galeria de entidades**:

1. Observar Enemy e Boss durante pelo menos um ciclo completo: animação, morte, remoção e reaparecimento da fixture.
2. Verificar os quatro Pickups apoiados no chão e sua remoção ao longo do ciclo.
3. Selecionar **Fireball e bullet**: os dois Projectiles devem avançar, animar o impacto e desaparecer. Não é necessário apertar a tecla de disparo.
4. Selecionar **Outros Players**: conferir presença, escurecimento ao desconectar e remoção ao morrer.
5. Girar a câmera: os billboards devem continuar voltados para ela e ser ocultados pelas paredes.
6. Voltar a **Snapshot original**, depois usar **Ver porta fechada** e **Aplicar Snapshot** para conferir a convivência com F3.4.
7. Bloquear um PNG de Enemy ou um SVG provisório no Network e recarregar: esperar `asset_load_failed`, sem controles habilitados.
8. Conferir console, resize e saída da página.

A suíte teve falhas intermitentes com paralelismo padrão durante a validação da F3.4; com um worker, os 91 testes passaram naquela etapa. Isso não substitui a validação da F3.3.

## Commit e PR sugeridos

Um commit contendo:

- `frontend/game/dev.ts`.
- `frontend/game/fixtures/billboards.ts`.
- `frontend/game/src/render/billboardAssets.ts` e `billboards.ts`.
- Os 25 PNGs listados acima.
- Os três SVGs de `frontend/public/assets/placeholders/`.
- Este documento.

Mensagem: `feat(game): render animated entity billboards (F3.3)`.

PR: `F3.3 — Billboards animados das entidades`. Descrever o render por estado, a galeria e as artes provisórias; registrar a validação realizada pelo autor; incluir `Closes #123`.

A F3.4 já está integrada à `main`. O merge preparado nesta branch preserva essa integração; o diff do PR deve conter os billboards e sua ligação ao Renderer, ao AssetLoader e à galeria.

`docs/maps-coop-f4.1.md` é um arquivo preexistente de outra tarefa e fica fora desta entrega.
