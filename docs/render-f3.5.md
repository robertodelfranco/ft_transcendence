# F3.5 — Técnicas advanced do Renderer (issue #145)

## Primeira etapa: tochas, sombras e névoa

Implementação autorizada por Rafael após explicação de cada etapa e snippet. Rafael confirmou tochas/sombras/névoa, partículas e correção da mão visualmente. Bloom foi conferido inicialmente e ajustado após relato de halo excessivo nos Enemies. Build, lint, testes e medições locais estão em [render-f3.5-validacao.md](render-f3.5-validacao.md); o custo em Retina e os limites do descarte continuam explícitos.

`frontend/game/src/render/torches.ts` lê as células `T` do Grid inicial. Cada tocha tem haste e chama em mesh, compartilhando geometria/material por instancing. Não há novos PNGs nem mudanças de colisão: `T` continua chão na Simulation.

Um pool de até quatro `PointLight` acompanha as quatro tochas mais próximas da câmera; até duas projetam sombra. Os meshes de todas as tochas continuam na cena. O pool mantém constante a quantidade de luzes e escolhe posições a cada quadro; a oscilação de intensidade usa `dt` em segundos.
O corte por proximidade é uma aproximação visual: a troca de fonte pode ser perceptível e as luzes sem sombra podem iluminar através das paredes. Conferir corredores, cruzamentos e Doors antes de aprovar esse limite ou a política de seleção. A chama é um mesh de cor própria, sem sombra; o bloom entra pela terceira etapa, sem partículas nas tochas.

`ThreeRenderer` habilita `PCFShadowMap`; paredes e Doors projetam e recebem sombra, chão e teto a recebem. O overlay da mão permanece em sua passagem separada, sem névoa. Os billboards existentes são sprites; esta etapa não implementa sombras de Enemy/Boss/Player.
A névoa `FogExp2` usa a cor do teto. A iluminação global foi reduzida para destacar luzes locais; legibilidade de paredes e entidades precisa de validação visual, inclusive em áreas sem `T`.

## Valores iniciais, sem medição

| Parâmetro | Valor |
|---|---|
| Fontes pontuais ativas | Até 4, mais próximas da câmera |
| Fontes com sombra | Até 2 |
| Alcance | 5 células |
| Cor | `0xffaa55` |
| Intensidade base | 2 cd, oscilação de ±8% |
| Resolução de sombra | 256 × 256 por face da luz pontual |
| Câmera de sombra | near 0,05; far 5 |
| Bias / normalBias | −0,001 / 0,02 |
| Densidade da névoa | 0,08 |
| Luz ambiente / direcional | 0,4 / 0,35 |

Sombras pontuais exigem renderizar seis direções por fonte. Nenhum destes números é garantia de 60 fps nem teto aprovado para Maps. A comparação de 0, 1, 2 e 4 fontes está em [render-f3.5-validacao.md](render-f3.5-validacao.md): duas foram mantidas como orçamento inicial, mas pixel ratio 2 ficou abaixo da meta. `LIGHT_LIMIT` e `SHADOW_LIMIT` centralizam os valores em `torches.ts`.

`dispose()` remove objetos, libera geometrias/materiais e as luzes com seus mapas de sombra. As texturas existentes continuam pertencendo ao AssetLoader.

## Segunda etapa: partículas da fireball

`fireballParticles.ts` recebe apenas `ViewState.projectiles` e `dt`. Um único objeto `THREE.Points` usa buffers prealocados para até 512 partículas e material aditivo, com teste de profundidade e sem escrita de profundidade. Nenhum PNG novo é carregado; os pontos são pequenos quadrados de cor laranja, que perdem intensidade ao envelhecer.

Fireball em `moving` emite aproximadamente 30 partículas/s, com duração de 0,25 s; pontos intermediários entre posições ajudam a formar o rastro. O primeiro `hit` observado gera 18 partículas por 0,4 s. O histórico por id impede repetição enquanto o mesmo Projectile continua em `hit`. Uma fireball que já chega em `hit` também gera um único efeito; desaparecer sem `hit` não gera impacto inventado.
Bullet não recebe partículas nesta entrega. As partículas usam a altura de 0,5, igual à fireball existente, e não aplicam colisão/dano; a poeira visual pode atravessar superfícies, mas continua sujeita ao teste de profundidade da cena.

O envelhecimento usa todo o `dt`, mesmo depois de o Projectile sumir. A emissão limita o tempo recuperado por quadro a 0,1 s para evitar rajada após aba suspensa; saltos maiores que uma célula não são ligados por um rastro interpolado. Ao atingir a capacidade, o pool substitui os slots mais antigos. O histórico descarta ids ausentes e `dispose()` libera geometria/material.
O limite de 512 partículas é uma escolha inicial para medição, não resultado de teste de carga. Os buffers da GPU são fixos; o histórico de fontes acompanha os Projectiles presentes, sem promessa de ausência completa de alocações por quadro.

## Terceira etapa: bloom leve

O Renderer usa a cadeia `RenderPass → UnrealBloomPass → OutputPass`, executada por `EffectComposer`. A cena é renderizada em buffers intermediários; o bloom espalha as regiões de maior luminância, e `OutputPass` aplica tone mapping e conversão de cor para a tela. A configuração atual é força 0,25, raio 0,2, limiar 1,1, com `ACESFilmicToneMapping` e exposição 1.

A chama da tocha tem sua cor linear multiplicada por 3; o material das partículas usa multiplicador RGB 3. Esses valores HDR permitem alimentar o bloom sem aumentar o alcance das luzes ou alterar regras de jogo. O efeito é por luminância da cena inteira, não uma máscara exclusiva de fogo: superfícies ou sobreposições que ultrapassem o limiar também podem contribuir. Conferir se detalhes dos PNGs e corredores continuam legíveis; limiar e força ainda não foram calibrados por medição.

Na primeira conferência do bloom, Rafael relatou brilho excessivo nos Enemies. O limiar foi elevado de 0,6 para 1,1 para excluir cores comuns dos sprites, e os multiplicadores do fogo passaram de 2 para 3 para manter contribuição HDR. Força e raio permaneceram iguais. Esse ajuste ainda aguarda nova conferência visual do autor; não houve teste automatizado ou medição após a alteração.

A mão/fireball do overlay são desenhadas depois do compositor, sem bloom. Seus materiais usam `toneMapped = false` para preservar as cores originais nessa passagem direta. A mudança de tone mapping da cena pode alterar contraste em relação à etapa anterior e requer nova conferência visual.

`resize` sincroniza tamanho e pixel ratio **fixo em 1** do Renderer com o compositor e suas passagens. Rafael autorizou esse orçamento após a queda de performance medida com resolução Retina; ele reduz a resolução interna em telas de alta densidade. `dispose` libera os buffers do compositor e cada passagem explicitamente; `EffectComposer.dispose` sozinho não libera as passagens adicionadas. A cadeia usa os addons já incluídos na dependência Three.js, sem instalar pacote novo.

Base técnica: [EffectComposer](https://threejs.org/docs/pages/EffectComposer.html), [UnrealBloomPass](https://threejs.org/docs/pages/UnrealBloomPass.html) e [OutputPass](https://threejs.org/docs/pages/OutputPass.html), conferidos também nos arquivos locais de Three.js.

## Validação a executar pelo autor

### Correção da ancoragem da mão

Rafael relatou em captura que a mão flutuava acima da borda inferior. O PNG atual mede 88 × 79 e tem 16 linhas inteiramente transparentes na base; o centro fixo em Y = −0,34 não ancorava o último pixel visível.
Após autorização, `HandOverlay` passou a medir essa margem pelo alpha da imagem carregada, uma única vez, e calcular no resize `handY = camera.bottom + handHeight × (0,5 − bottomPadding)`. Assim a base visível encosta na borda, independentemente da margem transparente e da resolução. O deslocamento relativo da fireball permanece +0,16 em Y e −0,015 em X. Não houve edição do PNG.
Rafael aprovou visualmente a correção. A conferência automatizada posterior confirmou a base visível na borda e o deslocamento da fireball em três tamanhos de janela, conforme o relatório de validação.

### Roteiro

Após Rafael pedir a conclusão da validação da #145, o agente executou build, lint, testes e verificações em Chrome isolado. Resultados e restrições estão em [render-f3.5-validacao.md](render-f3.5-validacao.md). O roteiro abaixo também serve para a reprodução pelo autor; não implica que cada cenário de partida real ou F3.10 já foi validado.

1. Em `frontend/`, executar `npm run build` e `npm run lint`.
2. Executar `npm run dev` e abrir `/game/dev.html`. A fixture já contém células `T`.
3. Conferir hastes/chamas no chão, luz quente, névoa à distância e paredes/Doors recebendo sombras. A demo usa câmera e Snapshots de demonstração, sem partida real.
4. Usar **Ver porta fechada** e **Aplicar Snapshot** para conferir atualização da sombra enquanto a Door abre. Conferir galeria, mão e resize em janela estreita.
5. Conferir console sem erros/warnings e inicialização/descarte repetidos. Registrar máquina, navegador, resolução, quantidade de tochas e fontes ativas antes de comparar performance.
6. Só após a primeira conferência visual, combinar a variação de orçamento de sombras para medição; não pressupor que duas fontes é o limite final.

Para a segunda etapa, selecionar **Fireball e bullet** na galeria de `/game/dev.html`:

- Conferir rastro laranja apenas na fireball enquanto se move.
- Conferir uma única explosão por fase `hit`, sem emissão contínua de impactos.
- Conferir que o ciclo seguinte volta a emitir e que a bullet mantém apenas sua animação existente.
- Trocar para outra galeria: partículas anteriores devem desaparecer em até 0,4 s de atualização, sem ficar presas na cena.
- Repetir resize, reinicialização da cena e inspeção do console. Build/lint e aceite com múltiplos Projectiles ainda precisam ser realizados pelo autor.

Para a terceira etapa, conferir tochas e a galeria **Fireball e bullet** novamente:

- Procurar halo suave na chama e nas partículas, sem apagar os detalhes da cena. O bloom não adiciona partículas à bullet.
- Conferir que mão e fireball da mão permanecem nítidas e que os textos DOM não recebem o efeito.
- Redimensionar a janela e conferir proporção, tamanho da mão e ausência de faixas ou buffers com tamanho antigo.
- Reinicializar a cena pelo botão de Door e conferir ausência de erro no console; registrar o custo do pós-processamento na medição de performance.

## Entrega e próximos passos

Um commit/PR da primeira etapa pode conter `torches.ts`, `renderer.ts`, `doors.ts` e este documento, com mensagem sugerida `feat(game): add torch lighting shadows and fog (F3.5)`.
Para um commit separado da segunda etapa, incluir `fireballParticles.ts`, a integração em `renderer.ts` e a atualização deste documento; mensagem sugerida `feat(game): add fireball trail and impact particles (F3.5)`. O Renderer também contém a primeira etapa ainda no working tree; se os commits forem separados, selecionar os hunks correspondentes.
Para um commit separado de bloom, incluir os hunks de `renderer.ts`, `handOverlay.ts`, intensidade de `torches.ts`/`fireballParticles.ts` e este documento; mensagem sugerida `feat(game): add subtle bloom postprocessing (F3.5)`. Os arquivos ainda contêm etapas anteriores sem commit; um único commit da F3.5 também pode reunir todos esses arquivos e `doors.ts`.
O escopo implementado da #145 está pronto para revisão do PR com `Closes #145`: tochas, sombras, névoa, partículas, bloom e instancing. Build/lint, 321 testes, comparação de sombras e smoke test de resize/console foram executados. Rafael autorizou pixel ratio fixo em 1 e a nova medição, com navegador em modo Retina, confirmou aproximadamente 60 fps no cenário registrado; build e lint foram repetidos e passaram após essa alteração. O teste completo de performance/memória permanece na F3.10. Incluir `render-f3.5-validacao.md` no commit/PR com os demais arquivos desta entrega; os limites de ambiente e de descarte registrados continuam válidos.
