# F3.4 — Door animada e mão com fireball

Issue: #122. Branch: `122-f3.4-porta-mao-fireball`.

## Como funciona

`frontend/game/src/render/doors.ts` recebe o Grid inicial, a lista inicial de Doors e a textura já carregada. Cada Door fica no centro da célula; paredes ao norte e ao sul orientam a folha ao longo de Z, paredes a oeste e a leste ao longo de X. A altura do mundo é Y.

`update(view.doors, dt)` move a folha para cima quando `open` chega como verdadeiro. A distância percorrida é velocidade × `dt` em segundos, limitada à distância restante para evitar ultrapassar o destino. A velocidade visual é 1,5 unidade/s e o deslocamento é 1,05 unidade. Uma Door aberta na construção já começa recolhida. A cor distingue a Door trancada. O componente não muda colisão, Grid, chaves ou regras da Simulation.

`frontend/game/src/render/handOverlay.ts` desenha mão e fireball numa segunda cena com câmera ortográfica. A proporção das imagens é preservada, e `resize` reposiciona o conjunto. Após desenhar o mundo, a passagem limpa apenas a profundidade e preserva a cor, mantendo a mão visível sobre as paredes e fixa em relação à câmera FPS. `autoClear` é restaurado ao terminar.

Os componentes liberam suas geometrias e materiais em `dispose`. As texturas pertencem ao chamador: a demo as libera, inclusive quando uma carga termina depois de encerrar a página ou quando outra imagem falha.

## Integração disponível

A demo `frontend/game/dev.ts` carrega os recursos e usa as fixtures locais. Os controles, descrições e erros têm traduções pt-BR, en e es, seguindo o catálogo local já usado pela demo.

A F3.2 ainda não está implementada nesta branch. Quando seu Renderer/AssetLoader estiver disponível, deve assumir o carregamento das texturas e chamar:

1. Construção de `Doors` com o Grid inicial, as Doors iniciais e a textura; adicionar `doors.object` à cena.
2. `doors.update(view.doors, dt)` antes do desenho do mundo.
3. `handOverlay.render(renderer)` após o desenho do mundo, quando a mão deve ser exibida.
4. `handOverlay.resize(width, height)` ao iniciar e redimensionar.
5. `doors.dispose()` e `handOverlay.dispose()` ao encerrar; liberar as texturas no proprietário dos assets.

O recebimento de ViewState e a apresentação de erro por HudState pertencem a essa integração. A demo não abre socket nem executa Action.

## Validação local pelo autor

Sem executar Docker, abrir `/game/dev.html` no servidor Vite do frontend.

- Clicar em **Ver porta fechada**: a câmera mostra a Door `(16, 10)`, que abre na segunda fixture.
- Clicar em **Aplicar Snapshot**: observar a abertura; clicar novamente não deve reiniciar a animação. **Ver porta fechada** reinicia a demonstração.
- Capturar o mouse e girar: mão e fireball ficam fixas na tela. Olhar para uma parede próxima não deve ocultá-las.
- Redimensionar para formatos largo e estreito: imagens preservam a proporção e continuam visíveis.
- Para verificar a outra orientação e a inicialização aberta na integração, fornecer um Grid com paredes norte/sul e uma lista inicial com `open: true`: a folha deve começar recolhida, sem animar do estado fechado.
- Bloquear um dos três PNGs no painel Network e recarregar: deve aparecer o erro traduzido, e os controles da demo devem continuar desabilitados.
- Conferir o console durante o uso normal e o encerramento da página.

## Resultados da validação — 20/10/2026

Validação executada pelo agente após solicitação explícita do autor:

- `npm run build`: passou (TypeScript e build Vite). O build padrão empacota a casca; a demo foi verificada separadamente no servidor Vite.
- `npm run lint`: passou.
- `npm test -- --maxWorkers=1`: 10 arquivos e 91 testes passaram.
- Duas execuções com paralelismo padrão tiveram uma falha cada: primeiro a asserção do conteúdo da tela após redirecionamento em `guards.test.tsx`; depois timeout de 5 segundos no teste de troca de idioma de `routes.test.tsx`. O arquivo de guards passou isoladamente, e toda a suíte passou com um worker. Os arquivos desses testes não foram alterados. Isso sugere instabilidade de sincronização/tempo sob carga; não comprova a causa.
- Chrome headless: Door fechada, parcialmente aberta e totalmente aberta observadas por screenshots; overlay visível em 1280 × 800 e 390 × 844.
- Checks dos componentes no Chrome: mesma distância para um passo de 0,2 s e dois passos de 0,1 s; ambas as orientações corretas; inicialização aberta sem folha visível; abertura completa; objetos removidos no dispose e texturas preservadas para liberação pelo proprietário.
- Bloqueio de `player_hand_white.png`: erro `asset_load_failed` visível e controles desabilitados, como esperado.

Foi encontrado um 404 de `/favicon.ico` na demo. Após autorização do autor, `frontend/game/dev.html` recebeu um favicon usando o PNG existente da fireball. A nova verificação no Chrome, com cache desabilitado, confirmou carregamento e abertura sem erros ou warnings no console.

## Origem dos assets

PNGs copiados sem alteração de [robertodelfranco/42-Cub3D, commit 66b1473](https://github.com/robertodelfranco/42-Cub3D/tree/66b147353fb0278e6bbe09c98a469db9b84f8b26), conforme os recursos indicados no contrato `mount-game.md`:

- `assets/map/door_2.png` → `frontend/public/assets/map/door_2.png`.
- `assets/player/player_hand_white.png` → `frontend/public/assets/player/player_hand_white.png`.
- `assets/player/fireball_1.png` → `frontend/public/assets/player/fireball_1.png`.

## Entrega sugerida

Um commit com `frontend/game/dev.html`, `frontend/game/dev.ts`, `frontend/game/src/render/doors.ts`, `frontend/game/src/render/handOverlay.ts`, os três PNGs acima e este documento.

Mensagem: `feat(game): add animated doors and hand overlay (F3.4)`.

PR: `F3.4 — Door animada e mão com fireball na demo`. Corpo: descrever a animação pelo estado recebido, o overlay e a integração pendente com F3.2; registrar a validação local e incluir `Closes #122`.
