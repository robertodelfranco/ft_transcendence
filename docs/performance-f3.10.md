# F3.10 — Performance e limpeza (#192)

## Estado

Cena de carga integrada em 04/11/2026 à base `1e0b6c5`, que já contém
Themes (#190), correção dos nomes da HUD, efeitos do Player (#194) e Maps PvP
(#197). A branch `192-performance-limpeza` foi atualizada por fast-forward,
sem criação de commit pelo agente.

Na versão anterior, Rafael reportou 60,2 FPS, confirmou resize e console corretos
e informou que o teste de trocas de Room passou. Não foram fornecidos os valores
dos snapshots de memória. Esses retornos são preservados como relato do autor,
sem apresentá-los como medição independente ou como validação da versão integrada.

Em 04/11/2026, após receber o roteiro final, Rafael confirmou todos os itens
validados na versão integrada: carga nos dois Themes, build, lint, testes
completos e dez trocas de Room. Validação local reportada pelo autor; o agente
não executou build, lint, testes, Docker ou navegador nesta integração.

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
não comprova ausência de vazamentos; correções dependerão de evidências.

## Resultados

### Cena de carga — retorno do Rafael

- FPS reportado: 60,2.
- Resize/maximização: confirmado como correto pelo autor.
- Console: confirmado como correto pelo autor.
- Ambiente completo (Chrome, resolução, energia) e duração exata não registrados.
- Build, lint e testes completos confirmados pelo autor após integração.
- Dois Themes: carga, resize e console confirmados pelo autor após integração.
- FPS por Theme e demais métricas numéricas da repetição não fornecidos;
  60,2 é o valor reportado na primeira medição, não uma nova medição dos dois Themes.

### Memória — relato recebido; valores não registrados

Rafael informou que o teste passou, sem fornecer valores das capturas. A tabela
abaixo registra a ausência de valores fornecidos, sem fabricar evidência.
O autor confirmou novamente a aprovação das dez trocas na base integrada,
que inclui o ciclo de vida do overlay do Player.

Na aba Memory do Chrome DevTools, usar Heap snapshot e o botão de coleta de
lixo antes de cada captura. Comparar sempre após sair da Room, sem recarregar
a página. Evitar guardar objetos do jogo no console, que pode mantê-los vivos.

| Captura | Momento | Tamanho do heap após coleta | Canvas/AudioContext retidos | Observações |
|---|---|---|---|---|
| Base | Após uma entrada/saída de aquecimento | Não informado | Não informado | Aprovação geral reportada pelo autor |
| 1 | Após mais uma entrada/saída | Não informado | Não informado | Aprovação geral reportada pelo autor |
| 5 | Após cinco entradas/saídas | Não informado | Não informado | Aprovação geral reportada pelo autor |
| 10 | Após dez entradas/saídas | Não informado | Não informado | Aprovação geral reportada pelo autor |

Comparar os snapshots com Comparison e investigar objetos que continuam vivos.
Se não for possível iniciar novas Rooms na mesma aba, registrar o impedimento;
recarregar a página não serve como evidência do unmount.
Não fechar #192 apenas com o resultado de FPS.

### Resultado na base integrada — confirmação do autor em 04/11/2026

| Verificação | Resultado |
|---|---|
| Build | Aprovado, conforme retorno do Rafael |
| Lint | Aprovado, conforme retorno do Rafael |
| Testes completos (game e shell) | Aprovado, conforme retorno do Rafael |
| Dungeon: FPS, resize e console | Aprovado, conforme retorno do Rafael |
| Sewer: FPS, resize e console | Aprovado, conforme retorno do Rafael |
| Dez entradas/saídas na versão integrada | Aprovado, conforme retorno do Rafael |

Comandos do frontend incluídos no roteiro confirmado pelo autor:

```bash
cd /Users/rafaelheringer/42sp/m06/ft_transcendence/frontend
npm run build
npm run lint
npm test
```

Para a demo, rodar `npm run dev` e usar a porta indicada pelo Vite. Para as trocas,
usar o projeto completo da mesma branch, sem recarregar a aba entre as Rooms.
Não atribuir o resultado dos checks antigos aos checks após a integração.

## Entrega

Commit sugerido: `feat(game): adiciona cena de carga para validar performance (F3.10)`.
Arquivos: `frontend/game/dev.ts`, `frontend/game/fixtures/stress.ts`
e `docs/performance-f3.10.md`. Sem commit, push ou PR pelo agente.


Um PR separado da branch `192-performance-limpeza`, com os três arquivos acima.
Com os aceites confirmados pelo autor, usar `Closes #192` no corpo do PR. A correção da HUD e os demais merges já
são parte da base; não entram como mudanças novas no PR de performance.
