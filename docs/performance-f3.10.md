# F3.10 — Performance e limpeza (#192)

## Estado

Medido em 04/11/2026: a cena de carga roda a 60 FPS nos dois Themes, com resize
e console corretos. As dez trocas de Room acharam um vazamento: cada saída deixava
um `WebGLRenderer` inteiro preso na memória. A causa e a correção estão em
[Resultados](#resultados).

A cena de carga foi integrada à base `1e0b6c5`, que já contém Themes (#190),
efeitos do Player (#194) e Maps PvP (#197).

## Cena de carga

Com o Vite rodando em `frontend`, abrir:

- Dungeon: `/game/dev.html?stress=1&theme=dungeon`.
- Esgoto: `/game/dev.html?stress=1&theme=sewer`.

O seletor de Theme preserva `stress=1`. Os controles de dano, morte e respawn
continuam disponíveis para medir também o overlay integrado da #194. A galeria
e os botões que substituem a fixture ficam ocultos durante a carga para manter
as quantidades e o Grid do cenário.
A fixture `frontend/game/fixtures/stress.ts` fornece 5 Players no total
(1 local representado pela câmera e 4 billboards), 20 Enemies e 10 Projectiles
(5 fireballs e 5 bullets), em uma área aberta com quatro tochas.
Animações de ataque/morte, deslocamentos e impactos são sintéticos, exclusivos
da demo; não executam Simulation ou rede. As entidades têm identidades estáveis.
O cenário inclui as técnicas atuais: sombras, névoa, partículas, bloom e instancing.

O painel DOM mostra FPS médio em janelas de aproximadamente um segundo,
calculado por quadros/tempo real. Atualiza só uma vez por janela. Ao ocultar ou
retornar à aba, a amostra recomeça; travamentos com a aba visível entram na medida,
inclusive intervalos maiores que 250 ms. O limite de 100 ms na animação sintética
não limita o tempo usado para calcular FPS. Não mede tempo de GPU nem substitui
uma partida completa. Não há texto no canvas. O listener de visibilidade sai no
dispose da demo.

## Roteiro de performance

1. Rodar build, lint e testes do frontend.
2. Abrir a cena no Chrome na máquina-alvo, com aba visível e sem limitação
   artificial de CPU/rede. Aguardar pelo menos 10 segundos de aquecimento.
3. Medir por 60 segundos, anotando FPS observado e quedas recorrentes.
   Para comparar resultados, manter câmera, tamanho da janela e resolução iguais.
4. Registrar máquina, SO, Chrome, resolução CSS, escala de tela, alimentação
   e revisão do código. A meta é 60 FPS, não apenas um pico isolado.
5. Redimensionar a janela, maximizar/restaurar e conferir proporção da câmera,
   desenho completo e console limpo.
6. Se houver queda, usar o painel Performance do Chrome para localizar o custo
   antes de alterar qualidade ou efeitos.
7. A #190 já está integrada. Repetir os passos com os dois links acima, incluindo
   os controles de efeitos. Conferir que trocar o Theme mantém a cena de carga.

## Roteiro de liberação de recursos

A demo de carga não monta uma Room real. Recarregar a página ou recriar só o
Renderer não comprova o ciclo completo de socket, áudio, timers e listeners.

1. Com o projeto completo rodando, aquecer uma entrada/saída de Room.
2. No Chrome, registrar um heap snapshot após sair e coletar lixo pelo DevTools.
3. Entrar e sair de Room dez vezes, ativando áudio por interação em cada entrada.
   Manter a mesma aba; conferir listeners, canvas destacados e AudioContexts.
4. Comparar snapshots após os ciclos 1, 5 e 10, com coleta de lixo nas mesmas
   condições. Investigar referências retidas e crescimento contínuo; uma leitura
   isolada de memória do processo não comprova vazamento.
5. Conferir GPU/recursos WebGL e console. Heap JavaScript sozinho não comprova
   liberação de GPU. Não usar apenas `renderer.info` de uma instância nova como
   evidência de liberação das instâncias anteriores.
6. Testar saída durante carregamento e reconexão, além do fim normal da Room.

## Inspeção inicial

O Renderer já possui uma lista de recursos descartáveis. AssetLoader é dono das
texturas; o adapter descarta Renderer antes dos assets e trata unmount durante a
carga. O mount cancela RAF, timers, socket, entrada e ResizeObserver. A inspeção
não pegou o vazamento dos billboards: ele só apareceu no heap snapshot.

## Resultados

Medições de 04/11/2026, na máquina do Roberto. Não é um PC da 42: lá, o teste
de 01/11 (N2) mediu 60 FPS numa partida real, no mesmo Chrome, mas a cena de
carga ainda não rodou num PC da 42.

| Item | Valor |
| --- | --- |
| GPU | AMD Radeon integrada (radeonsi renoir), via ANGLE OpenGL 4.6 |
| SO | Debian 13, Linux 6.12 |
| Navegador | Chrome 156.0.8078.79 (mesma versão dos PCs da 42), headless com GPU |
| Janela | 1280×720 CSS, escala 1 |

### Build, lint e testes

`npm run build`, `npm run lint` e `npm test` passam (472 testes, mais o novo
`billboards.test.ts`). Os testes pedem Node 22 ou mais novo, porque o jsdom usa
uma função do `undici` que o Node 20 não tem; o `.nvmrc` pede 24.

### FPS na cena de carga

60 amostras de 1 s em cada Theme, depois de 10 s de aquecimento:

| Theme | FPS médio | Mínimo | Amostras abaixo de 58 |
| --- | --- | --- | --- |
| dungeon | 60,0 | 60 | 0 |
| sewer | 60,0 | 60 | 0 |

No resize para 800×600, 1920×1080 e de volta a 1280×720, o buffer do canvas
acompanha o tamanho CSS e a proporção da câmera se mantém. Console sem warnings
nem erros.

### Memória: dez entradas e saídas de Room

Cada ciclo cria uma Room co-op com 1 Player, entra na `/play`, espera 6 s, sai
pelo link do topo (navegação do SPA, sem recarregar a aba) e espera o Grace
period de 30 s liberar o Player. Antes de cada captura, três coletas de lixo e
um heap snapshot pelo DevTools Protocol. Um ciclo de aquecimento vem antes da
base.

**Antes da correção** (`7c171b4`): cada saída deixa preso um `WebGLRenderer`
inteiro, com o contexto WebGL, o canvas e a tela da partida.

| Ciclo | Heap (MB) | `WebGL2RenderingContext` | `HTMLCanvasElement` | Nós de DOM |
| --- | --- | --- | --- | --- |
| base | 6,22 | 2 | 4 | 355 |
| 1 | 6,67 | 3 | 6 | 465 |
| 2 | 7,05 | 4 | 8 | 575 |
| 3 | 7,23 | 5 | 10 | 685 |
| 5 | 7,52 | 7 | 14 | 905 |
| 10 | 8,34 | 12 | 24 | 1455 |

**Causa:** todo `THREE.Sprite` usa a mesma geometria, guardada no escopo do
módulo do Three.js (`let _geometry` em `three/src/objects/Sprite.js`). Cada
`WebGLRenderer` que a desenha guarda os buffers dela num `WeakMap` interno, com a
geometria como chave. Como ela nunca recebia `dispose()`, a chave nunca morria e
o renderer antigo ficava preso. O caminho de retenção no snapshot:
módulo → `_geometry.index` → `WeakMap` → `WebGLBuffer` → `WebGL2RenderingContext`
→ `<canvas>`.

**Correção:** `Billboards` guarda a geometria do primeiro Sprite que cria e chama
`dispose()` nela no próprio `dispose()`. O evento faz cada renderer soltar os
buffers dela; a geometria continua usável, e o próximo renderer a reenvia para a
GPU no primeiro draw. O `billboards.test.ts` confere que o evento dispara.

**Depois da correção:** contextos, canvas, nós de DOM e listeners ficam iguais
nos dez ciclos.

| Ciclo | Heap (MB) | `WebGL2RenderingContext` | `HTMLCanvasElement` | Nós de DOM | Listeners |
| --- | --- | --- | --- | --- | --- |
| base | 5,93 | 1 | 2 | 245 | 173 |
| 1 | 6,28 | 1 | 2 | 245 | 173 |
| 2 | 6,55 | 1 | 2 | 245 | 173 |
| 3 | 6,65 | 1 | 2 | 245 | 173 |
| 5 | 6,77 | 1 | 2 | 245 | 173 |
| 10 | 7,19 | 1 | 2 | 245 | 173 |

O heap JS ainda sobe cerca de 0,13 MB por ciclo, contra 0,21 MB antes. Nenhum
recurso nativo acompanha essa subida, e a origem não foi investigada: pode ser
código compilado pelo V8 ou estado que o lobby acumula.

**Não coberto:** o `AudioContext` não chegou a ser criado no Chrome headless
(0 em todos os ciclos), então a liberação do áudio não foi medida. A saída
durante o carregamento, a reconexão e o fim normal da Room (item 6 do roteiro)
também ficaram de fora.

### Como reproduzir

```bash
cd frontend
npm run build
npm run lint
npm test
```

Para a cena de carga, rodar `npm run dev` e abrir os links da seção
[Cena de carga](#cena-de-carga). Para as trocas, usar o projeto completo da mesma
branch, sem recarregar a aba entre as Rooms.
