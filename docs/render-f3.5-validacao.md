# F3.5 — Validação local da #145 (22/10/2026)

## Ambiente e método

MacBook Air 2019 (`MacBookAir8,2`), Intel Core i5 1,6 GHz, 2 cores, 8 GB RAM, macOS 14.8.9. Chrome headless 155.0.8059.85 com perfil temporário, GPU Intel UHD Graphics 617 via ANGLE/Metal; WebGL e composição acelerados habilitados. O perfil pessoal não foi usado.

Vite local existente, fixture `frontend/game/fixtures/snapshot.example.json`, Renderer/AssetLoader reais. Cena: 5 Players, 20 Enemies, Boss, 4 Projectiles, 8 tochas, pool de 4 luzes. Bloom e partículas habilitados. Os Projectiles da fixture permanecem em posições fixas na comparação; o teste não é uma partida multiplayer.

Medição via Chrome DevTools Protocol, com scripts temporários fora do repositório, sem alterar código. Alteração de `castShadow` somente nos objetos da instância isolada. `requestAnimationFrame` mede intervalos entre quadros; duração de `render()` mede tempo de CPU, não tempo de GPU. As chamadas de desenho foram acumuladas para todas as passagens, incluindo sombras, bloom e overlay.

Aquecimento de aproximadamente 3 s e amostra de aproximadamente 8 s por configuração. Uma primeira amostra sem sombras incluiu compilação inicial de shaders e foi descartada; sua repetição usou aquecimento separado da amostragem. Uma amostra por configuração, sem estatística entre várias execuções; o teto de atualização do navegador pode esconder margem de custo acima de 60 fps.

## Comparação de sombras

Viewport lógico 1280 × 720, pixel ratio interno 1:

| Fontes com sombra | FPS médio | Intervalo p95 (ms) | CPU de render p50 / p95 (ms) | Chamadas de desenho, mediana |
|---|---|---|---|---|
| 0 | 59,50 | 16,70 | 1,20 / 1,80 | 54 |
| 1 | 60,00 | 16,70 | 2,40 / 7,30 | 96 |
| 2 | 60,00 | 16,70 | 2,10 / 5,50 | 138 |
| 4 | 59,25 | 16,70 | 2,40 / 7,00 | 222 |

Manter **2 sombras como orçamento inicial** é coerente com esta amostra: 4 aumentam as chamadas em aproximadamente 61% sobre 2, sem melhoria mensurável de fluidez. Isso não determina o teto definitivo de tochas nos Maps nem comprova 60 fps em outras resoluções.

Com **2 sombras e pixel ratio 2**, o mesmo viewport usa resolução interna 2560 × 1440: **25,95 fps**, intervalo p95 **50 ms**, CPU de render p50/p95 **1,90/3,40 ms**. O resultado sugere custo associado à resolução/GPU; não houve medição direta de tempo de GPU para atribuir o custo a uma passagem específica.

**Pendência:** a configuração atual permite pixel ratio até 2. A meta de 60 fps não está comprovada nesse modo Retina. Foi proposta a Rafael a limitação inicial a pixel ratio 1, que reduz a resolução interna em telas Retina, para revisão antes de qualquer alteração. Não foi aplicada nesta rodada.

## Verificações executadas

- `npm run build`: passou, incluindo TypeScript.
- `npm run lint`: passou.
- `npm test`: **25 arquivos, 321 testes aprovados**. São os testes existentes; não foi adicionado arquivo de teste.
- `git diff --check`: passou para arquivos rastreados antes da atualização desta documentação.
- Dez verificações adicionais no navegador, sem teste novo no repo: bullet sem partículas; rastro de fireball; 18 pontos por impacto; `hit` repetido sem duplicação; expiração sem Projectile; limpeza do histórico; desaparecimento sem impacto inventado; limite de 512; expiração do pool cheio; `dispose` idempotente e atualização posterior inativa.
- Resize em 640 × 480, 1280 × 720 e 1920 × 1080, com pixel ratio 1: canvas e compositor acompanharam as dimensões. Base visível da mão em Y = −0,5, igual à borda inferior; fireball manteve deslocamento relativo +0,16.
- Página real `/game/dev.html`, incluindo galeria **Fireball e bullet**: canvas 1280 × 720, botões habilitados, nenhum alerta visível; sem exceções, erros/warnings de console ou falhas de rede registrados durante esse smoke test.

O documento JSON usado como página auxiliar na preparação do benchmark gerou um 404 de `/favicon.ico`; a página real da demo já possui favicon e não apresentou esse erro. Isso não originou alteração de código.

## Descarte e limites do aceite

`dispose()` repetido não lançou exceção. Os contadores de `renderer.info.memory` caíram de 9 geometrias para 1; permaneceram 17 texturas no contador após descarte do Renderer e dos assets. Esses números não comprovam ausência de vazamento nem retorno completo a zero. A ordem de descarte dos assets, caches e comportamento do contexto WebGL precisam de auditoria na F3.10; não foi realizado o teste completo de dez trocas de Room.

A instância isolada do Chrome foi encerrada ao final. Nenhum servidor do usuário foi encerrado, nenhum Docker foi iniciado e não houve commit, push ou PR pelo agente.

Rafael já confirmou a conferência visual de tochas/sombras/névoa, partículas e correção da mão. A aceitação visual em janela normal não substitui as medições; o ajuste do halo dos Enemies ainda merece conferência explícita na configuração final.

O fechamento técnico da #145 ainda depende da decisão de resolução interna e da aceitação dos limites registrados. A validação completa de performance/memória com 10 Projectiles, partidas reais e dez trocas de Room continua pertencendo à F3.10.
