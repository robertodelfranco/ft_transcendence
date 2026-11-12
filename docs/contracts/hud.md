# F4.3 — Especificação da HUD coop e PvP

**Data inicial:** 22/10/2026. **Conferência documental:** 03/11/2026.
**Estado:** especificação disponível; decisões anteriores da revisão do Caio registradas na §11. Aceite integral de Caio e Augusto a confirmar pela lista da §12. As cinco decisões da §11 estão fechadas (1 e 4 entraram com a #168, do Augusto); isso não representa aprovação de todos os critérios desta entrega.
**Escreve:** Rafael. **Revisam:** Caio (F7.6 e i18n) e Augusto (`HudState` e integração).
Roberto revisa qualquer dúvida sobre regras; esta especificação não altera a Simulation.

## 1. Fonte e fronteira

O contrato de dados continua sendo [mount-game.md §2.6](mount-game.md#26-hudstate-e-mountoptions), implementado em `frontend/game/src/api.ts`.
Esta especificação define apresentação, prioridade e estados da F7.6, conforme o [plano](../catacombs42-plano-de-tarefas.md).
Os termos seguem [CONTEXT.md](../../CONTEXT.md); término e vencedores seguem [ws-messages.md §2.6](ws-messages.md).

React desenha toda a HUD em DOM, com i18n em pt-BR, en e es. O canvas contém cena, mão e minimapa, sem texto.
A casca recebe `onHud` e `onEnd`; não lê Snapshot, não abre um segundo socket do jogo e não calcula dano, coleta, respawn ou vitória.
A identidade do User local vem do contexto autenticado. O Mode vem do `HudState.mode` (§11.1); a HUD não precisa das RoomOptions. Não inferir Mode de `scoreboard === null`: isso também ocorre antes do primeiro `welcome`.

Na base conferida em 03/11 (`022cb09`), `Play.tsx` monta `Match`, que usa os componentes da HUD; o jogo já calcula RTT em ms e guarda os últimos cinco registros do feed. A apresentação usa o namespace `hud` nos três idiomas. A presença desses arquivos não comprova os aceites funcionais da F7.6; a §12 separa a conferência documental da revisão e do teste em navegador.

## 2. Composição e prioridade

| Região | coop | pvp |
|---|---|---|
| Topo esquerdo | Lista de Players, HP e estado | Dois Players, Frags e relógio |
| Topo direito | Ping e acesso à ajuda de controles | Ping, acesso à ajuda de controles e kill feed |
| Centro | Retícula fixa durante a partida com Player vivo; aviso de conexão, morte ou erro quando necessário | Retícula fixa durante a partida com Player vivo; aviso de conexão, espera de respawn ou erro |
| Rodapé esquerdo | HP, Mana, Armor e chaves do Player local | HP, Mana, Armor e chaves do Player local |
| Rodapé direito | Área reservada para o minimapa F3.6 | Área reservada para o minimapa F3.6 |

Apresentação revista localmente na #260 em 12/11/2026: a HUD usa elementos
soltos sobre a cena, sem caixas, fundos de painel ou molduras. Textos têm sombra
suave para contraste, tamanho base de 12 px e peso moderado. Recursos ocupam
176–192 px de largura, com barras de 4 px: HP vermelho e Mana azul. Armor e
chaves aparecem como ícone e número, com rótulos traduzidos acessíveis.
Players/placar ocupam 192–208 px, sem título visível redundante; os nomes
acessíveis das listas permanecem. O Player local recebe destaque no nome e no
rótulo existente. No coop, HP numérico com coração; sem barra dos companheiros,
pois o HudState não informa máximo por participante. No PvP, Frags alinhados à
direita e relógio discreto na linha seguinte. Ping, ajuda e feed usam texto menor.
O minimapa ocupa 112–128 px, sem moldura ou fundo opaco externo ao desenho do Grid.
Ordem, valores, alertas de HP baixo, estados de morte/desconexão e comportamento
de Reconnection permanecem os definidos neste contrato. Esta revisão substitui
as molduras propostas anteriormente na #256. Validação visual e revisão de Caio pendentes.

Durante a partida normal, o centro contém uma retícula em forma de sigilo arcano:
arcos interrompidos e um losango central, dourados, com traço de 1,2 px e sombra
escura para contraste. O SVG ocupa 32 × 32 px e mantém o centro vazado.
Ela usa a camada `z-20` acima do canvas.
Ela fica fixa no centro da área do canvas,
inclusive quando os painéis da HUD ficam abaixo dele em janela estreita; não
anima, não captura cliques e não recebe foco (`pointer-events: none`,
`aria-hidden`). Aparece somente com `status = running` e Player local vivo;
fica oculta durante conexão, Reconnection, morte e término. Serve de referência
visual e mira, sem garantir prevenção de cinetose. Não indica acerto, alvo,
cooldown ou disponibilidade de tiro. Implementada em `Match.tsx` em 11/11/2026
e revista como sigilo arcano em 12/11/2026;
validação visual em navegador e revisão de Caio pendentes.

O rodapé não cobre a mão/fireball; reservar espaço ao minimapa quando ele estiver integrado.
Ordem de prioridade em conflito de espaço: erro/conexão ou resultado; estado de morte; HP e Mana; placar/relógio; Armor e chaves; Players; ping e feed.
Em janela estreita, reordenar os grupos e permitir nomes truncados com nome completo acessível. Não ocultar informações essenciais nem exigir rolagem para ver recursos e placar.

Contagem do início (#255): enquanto `HudState.countdown` não é `null`, uma camada acinzentada (`bg-black/50`) cobre o canvas, e só ele, também abaixo do `md`. Com `"waiting"`, mostra "Aguardando jogadores…"; com `3`, `2` e `1`, o número branco e grande no centro. Some quando a partida passa a valer, sem aviso de largada. Uma região `role="status"` sempre montada anuncia o mesmo texto ao leitor de tela ("A partida começa em 3"). A HUD continua visível por baixo, e o Player não se move até o fim (a Prediction também espera, [mount-game.md](mount-game.md) §2.6).

## 3. Recursos e Players

| Informação | Fonte | Apresentação e condição |
|---|---|---|
| HP local | `hp`, `maxHp` | Barra e número `atual / máximo`; sempre durante `running`, inclusive morto |
| Mana local | `mana`, `maxMana` | Barra e número `atual / máximo`; sempre durante `running` |
| Armor local | `armor` | Ícone com rótulo traduzido acessível e número; mostrar zero; sem barra percentual, pois não existe `maxArmor` |
| Chaves locais | `keys` | Ícone com rótulo traduzido acessível e quantidade; mostrar zero, inclusive se Pickups estiverem desativados |
| Companheiros coop | `players` | Nome, HP numérico, vivo/morto e conectado/desconectado; Player local primeiro, demais por `id` crescente |
| Ping | `ping` | RTT inteiro em ms; `null` aparece como indisponível (`—` com descrição traduzida), nunca como 0 ms |

Os recursos permanecem os do Player local quando a câmera acompanha um companheiro: não trocar seus valores pelos do observado.
Para HP dos companheiros, usar número absoluto: o contrato não fornece máximo por participante.
Morte e desconexão são estados independentes; um Player pode estar morto e desconectado. Exibir ambos quando aplicável.

Limiar visual de HP baixo, já usado em `src/play/bars.ts`: `hp > 0` e `hp / maxHp <= 0,25`, somente com máximo positivo; usar ícone/rótulo além da cor. É um limiar visual, não uma regra de dano.
Barra usa proporção limitada entre 0 e 1, sem alterar o número recebido. Máximo zero antes do `welcome` não gera divisão nem barra vazia de morte.
Não sinalizar tiro disponível com base só na Mana: o contrato não informa cooldown à HUD.

## 4. Diferenças entre Modes

### coop

- Objetivo traduzido na ajuda: derrotar o Boss; todos mortos significa derrota, sem respawn.
- Mostrar até cinco Players; sem placar de Frags ou relógio de PvP.
- Com `status = running` e `alive = false`, mostrar “Você morreu. Aguardando o fim da partida.”; a câmera pode acompanhar um companheiro vivo, conforme a arquitetura.
- Não apresentar botão de respawn, troca manual de câmera ou nome do Player observado: o contrato atual não informa essa identidade.
- Não mostrar HP do Boss, contagem de Enemies ou progresso de objetivo sem fonte na interface pública.

### pvp

- Objetivo na ajuda: atingir o limite de Frags ou terminar o tempo com mais Frags. O texto não traz números (§11.1): o relógio já mostra o tempo, e a HUD não recebe as RoomOptions nem duplica defaults.
- Mostrar os dois nomes e Frags na ordem entregue por `scoreboard.players`, resolvendo nomes por `players.id`; identificar o Player local também por texto/ícone.
- Mostrar `timeLeftS` como `mm:ss`, arredondando para cima e limitando o valor visual mínimo a zero. Não decrementar com relógio próprio nem declarar resultado quando chegar a zero.
- Com `scoreboard = null` em uma Room PvP já identificada, mostrar placar indisponível; não fabricar empate `0 × 0`.
- Com `status = running` e `alive = false`, mostrar “Aguardando respawn”; remover quando `alive` voltar a `true`. Sem contagem regressiva, pois falta o instante de respawn no `HudState`.
- Manter os recursos locais e placar durante essa espera. Não oferecer respawn manual.

## 5. Kill feed

Apresentação especificada, já usada em `src/play/KillFeed.tsx`: feed visível só no PvP, com até cinco registros de morte de Player, mais recente primeiro. Não representa Kills de Enemy/Boss.
Cada linha resolve `by` e `victim` em `players`; se o nome não estiver disponível, usar fallback traduzido com o id. `by = null` recebe mensagem neutra de morte, sem inventar atacante.

Os registros permanecem até serem substituídos ou a página desmontar; não há expiração por tempo nesta entrega. O `tick` não é horário civil.
Não acrescentar novamente a lista inteira a cada `onHud`: ela já é o feed acumulado. Preservar registros distintos mesmo se os nomes forem iguais.
Cinco linhas e a ordem visual já aparecem na implementação conferida; o aceite dos consumidores continua pendente de registro na §12. Não mudam o tipo público.

## 6. Conexão, término e controles

| Estado | Comportamento da casca |
|---|---|
| `connecting` | Mensagem de conexão; recursos e placar ainda indisponíveis. Zeros iniciais não significam morte |
| `running` | Exibir valores recebidos e aplicar as condições de vivo/morto |
| `disconnected` | Aviso persistente de Reconnection; manter últimos valores identificados como desatualizados. Não simular retomada nem abrir outro socket |
| `error` | Mensagem traduzida por `error`, fallback para código desconhecido, ação para voltar ao lobby e botão “Tentar de novo”, que remonta o jogo só por ação da pessoa (§11.3); sem repetição automática pela página |
| `finished` | Encerrar avisos de morte/reconexão; se `onEnd` ainda não chegou, mostrar partida encerrada sem inventar vencedor |

Em `error`, `replaced` explica que outra aba assumiu a partida. O fechamento `server_shutdown` inicia Reconnection e chega à HUD atual como `disconnected`, sem código de causa; usar aviso genérico de reconexão, sem afirmar o motivo da queda. A política de nova tentativa pertence ao socket, conforme [ws-manager.md §2.9](ws-manager.md). Falha passageira ao obter o token (exceção no `getAccessToken`) também chega como `disconnected` e usa o mesmo aviso (§11.5).
O jogo pode emitir `running` antes de concluir o carregamento dos assets: isso não comprova Renderer pronto. Falha posterior chega como `asset_load_failed`.

A tela de resultado usa `onEnd`, respeitando a espera de `BOSS_DYING_S` já feita pelo jogo. Não adicionar outro atraso na casca.
Nos dois Modes, o desfecho local segue uma regra só (§11.2): `result = draw` é empate; fora disso, vitória se `winnerIds` contém o id local e derrota nos demais casos. O `result` do `onEnd` é o da Room: nunca interpretar `win` da Room como vitória dos dois Players.
Traduzir `reason` (`boss_defeated`, `all_dead`, `forfeit`, `frag_limit`, `time_limit`) com fallback. Oferecer retorno ao lobby; resumo persistido e Achievements pertencem à F7.8/F4.6, sem inventar valores na HUD.

Ajuda traduzida e acessível por botão: movimento W/A/S/D, giro pelas setas esquerda/direita e mouse capturado, Shift para correr, Espaço para `fire`, F para `door`, clique na cena para Pointer Lock e Esc para liberar o mouse. Manter alinhamento com `net/input.ts` e com o Renderer; não criar atalhos de HUD sobre essas teclas.
A partida não pausa ao abrir ajuda nem ao perder Pointer Lock. Controles DOM devem permitir navegação por teclado sem disparar Actions do jogo; o `net/input.ts` ignora as teclas cujo alvo é um controle da página desde a #168 (§11.4).
Sair da rota chama `unmount`; fechar a página não declara vitória/derrota nem significa remoção imediata da Room, por causa do Grace period.
O botão "Sair da partida" (#240) é a saída explícita: fica abaixo do canvas enquanto o status é `running` ou `disconnected` (com Pointer Lock, o Esc solta o mouse para clicar) e pede confirmação antes, porque no `pvp` a saída entrega a vitória por `forfeit`. Confirmado, a casca chama `POST /api/matches/{id}/leave` ([matches-api.md](matches-api.md) §2.2), que tira o Player na hora, sem Grace period, e volta ao Lobby; o `unmount` fecha o socket e libera o resto. 404 também volta ao Lobby (a Room já foi removida); outro erro aparece traduzido e o jogo continua. Enquanto a saída está em curso, a tela de fim não aparece, mesmo com o close `1000` que o servidor manda.

Modo partida (#254): a rota `/play/:matchId` declara `handle: { compact: true }` em `routes.tsx`, e o `Layout` encolhe cabeçalho, miolo e rodapé (`data-layout="compact"`). O rodapé continua visível, com os links legais. O `h1` da página fica só para leitor de tela (`sr-only`), e a largura do canvas reserva `8.5rem` da altura da janela para o que fica fora dele (cabeçalho e rodapé compactos, o `py-2` do miolo e a linha dos botões). Ao lado de "Sair da partida", o botão "Tela cheia" aparece quando o navegador oferece a Fullscreen API (`document.fullscreenEnabled`) e leva para a tela cheia o bloco do canvas com o minimapa, a HUD e o aviso central, sem os botões de baixo. Sair é o Esc do navegador; uma recusa do pedido é ignorada e o jogo segue. Com Pointer Lock ativo, o mesmo Esc também solta o mouse.

## 7. i18n e acessibilidade

Caio define as chaves no namespace `hud`, com erros seguindo [i18n.md](i18n.md). Rótulos, ajuda, estados, objetivos, plurais, fallback de nomes e motivos de fim precisam existir nos três idiomas; nomes dos Players são dados, não chaves.
Usar números e ícones além de cor; barras com nome e valores acessíveis. Avisos de conexão/morte usam região de status; erro usa alerta. Não anunciar toda mudança de Mana/HP ou cada Snapshot em região viva.
Respeitar redução de movimento para efeitos visuais da HUD; dano não exige flash de tela nesta tarefa, e os efeitos F3.7 continuam separados.

## 8. Aceites para revisão da F7.6

| Cenário | Resultado esperado |
|---|---|
| Antes do `welcome` | Conexão, sem aviso de morte nem divisão por zero |
| coop com cinco Players, um morto e outro desconectado | Lista legível; estados independentes; recursos locais corretos |
| HP no limiar, Mana/Armor/chaves zerados | Valores explícitos; HP baixo distinguível sem depender de cor |
| Morte local coop | Aviso sem respawn; câmera não muda o dono dos recursos |
| Morte e respawn PvP | Aviso sem cronômetro inventado; volta à HUD viva quando o servidor informar |
| PvP com placar/relógio e Snapshot atrasado | Valores oficiais; relógio zero não encerra localmente |
| Feed com seis mortes e atualização repetida | Cinco mais recentes, sem duplicação por callback; atacante nulo tratado |
| Queda, Reconnection, aba substituída e falha de asset | Estado traduzido; dados antigos identificados; nenhuma disputa de sockets pela página |
| Fim coop, vitória/derrota local PvP e empate | Resultado coerente com `winnerIds`, sem cortar a animação nem duplicar espera |
| pt-BR, en, es; nomes longos; janela estreita; teclado | Textos traduzidos, recursos/placar acessíveis, sem Actions ao usar controles da página |

Esses cenários são roteiro de validação; esta conferência documental não os declara executados. Existem testes de apresentação em `src/play/*.test.tsx` e `src/pages/Play.test.tsx`, mas sua presença não comprova o resultado da execução nem a integração em partida real. A §10 preserva o registro histórico de testes da base de dados da HUD.

## 9. Revisão necessária

| Quem | O que confirmar |
|---|---|
| Caio | Composição, prioridades, conteúdo dos avisos, i18n e distribuição entre HUD mínima e completa da F7.6 |
| Augusto | Feed de cinco registros, RTT em ms e emissão de `onHud` apenas quando seu conteúdo muda, como implementado hoje |
| Caio e Augusto | Recursos locais durante acompanhamento de companheiro; foco/Pointer Lock e estado de asset ainda carregando |

A apresentação tem implementação na base conferida, mas o aceite funcional depende da revisão e validação da F7.6. Não há mudança de schema, API ou protocolo nesta entrega.

## 10. Registro de validação — issue #142

Validação local em 22/10/2026, na branch `142-f4.3-especificacao-hud`:

- `git diff --check`: passou para os arquivos rastreados modificados; o documento novo foi revisado por leitura.
- Referências locais nos quatro documentos da entrega: 40 verificadas; uma referência antiga quebrada no briefing de `contracts/README.md` para `../../proxy/nginx.conf`, também presente no HEAD anterior. Não foi introduzida pela F4.3. Esta checagem verifica existência dos arquivos, não âncoras de seção.
- Conferência com `api.ts`, `mount.ts`, `net/viewstate.ts`, `net/socket.ts` e `net/input.ts`: recursos locais, zeros iniciais, RTT indisponível, feed de cinco registros, controles e resultado correspondem às fontes atuais. A descrição de `server_shutdown` foi corrigida para refletir a Reconnection sem causa exposta à HUD.
- Comando em `frontend/`: `npm test -- game/src/mount.test.ts game/src/net/viewstate.test.ts game/src/net/socket.test.ts game/src/net/input.test.ts`. Resultado: **4 arquivos, 58 testes aprovados**. Foram usados testes existentes; nenhum código ou teste foi alterado.

Esses testes verificam a base que fornece os dados à HUD, não a apresentação proposta. Não foram executados Docker, navegador ou partida real nesta validação. Os cenários da §8 continuam pendentes da implementação da F7.6 e da revisão dos consumidores.

## 11. Decisões da revisão da F7.6 — 26/10/2026

Revisão do Caio na #143 (23/10), fechada aqui depois do merge. As decisões 2, 3 e 5 ficam do lado da casca. As decisões 1 e 4 mudam código do jogo e entraram com a #168 (Augusto, 26/10).

| # | Tema | Decisão | Estado |
|---|---|---|---|
| 1 | Mode na HUD | `HudState` ganha `mode: "coop" \| "pvp" \| null`, `null` antes do `welcome`; entre o `welcome` e o primeiro Snapshot o `emptyHud` já traz o Mode. Sem `GET /api/matches/{id}` na /play | Decidida; implementada na #168 |
| 2 | Desfecho | O `result` do `onEnd` continua sendo o da Room, sem conversão no jogo. A casca decide o desfecho local pelo `winnerIds` nos dois Modes (§6), como o [ws-messages.md](ws-messages.md) §2.6 já define | Decidida |
| 3 | Erro | Além de voltar ao lobby, a casca oferece “Tentar de novo”, que remonta o jogo (novo `mountGame`, depois do `unmount` do anterior) só por ação da pessoa | Decidida; implementada na #138 |
| 4 | Teclas com foco em controle da página | O `net/input.ts` ignora teclas cujo alvo está dentro de um elemento interativo (`closest("button, a, input, textarea, select, summary")`, mais o `isContentEditable`), e não só em campos de texto | Decidida; implementada na #168 |
| 5 | Falha passageira de token | Continua chegando como `disconnected`, com o aviso genérico de reconexão: o jogo tenta de novo com backoff, e mostrar erro levaria a pessoa a sair de uma partida que ainda se recupera | Decidida |

Motivos da decisão 1: o `welcome` chega também a cada Reconnection, então o Mode fica sempre certo, por uma fonte só. O `GET` acrescentaria carregamento, erro e corrida com o socket, e a rota muda de formato quando a partida acaba ([matches-api.md](matches-api.md), “Em aberto” 5). A ajuda do PvP descreve o objetivo sem números (§4), por isso as RoomOptions não entram no `HudState`.

Motivos da decisão 4: a política de captura de teclas pertence ao jogo, e a correção cabe no `isTyping` com um `closest`, testável no `input.test.ts`. Barrar o evento na casca (`stopPropagation` em volta da HUD) espalharia a regra pelos dois lados e, se alcançasse o `keyup`, deixaria tecla de movimento presa.


## 12. Conferência de completude da #142 — 03/11/2026

### Cobertura da entrega

| Requisito da issue | Onde está definido | Dados necessários disponíveis |
|---|---|---|
| Composição e prioridade | §2, regiões e ordem em conflito de espaço | `mode`, `status`; valores dos grupos abaixo |
| HP, Mana, Armor e chaves | §3, barras, números, zeros e limiar de HP | `hp`, `maxHp`, `mana`, `maxMana`, `armor`, `keys` |
| Lista de Players | §3 e coop na §4, local primeiro e estados independentes | `players`, id local do contexto autenticado |
| Placar e relógio PvP | PvP na §4, ordem recebida e `mm:ss` sem relógio próprio | `scoreboard.players`, `scoreboard.timeLeftS`, `players` |
| Kill feed | §5, cinco registros, mais recente primeiro e fallback de nomes | `killfeed`, `players` |
| Morte e respawn | §4 e §6, avisos distintos por Mode | `mode`, `alive`, `status`, `maxHp` positivo para distinguir dados iniciais |
| Conexão e erros | §6, preservação de valores e nova tentativa manual | `status`, `error`; desmontagem por `unmount` |
| Término | §6 e §11.2, desfecho local e espera feita pelo jogo | `onEnd.result`, `winnerIds`, `reason`, id local |
| i18n e acessibilidade | §7 e cenários da §8 | namespace `hud`, `game` para resultado/motivo e catálogo de erros da casca |
| Vínculo com a integração | §1 e [mount-game.md §2.6](mount-game.md#26-hudstate-e-mountoptions) | [api.ts](../../frontend/game/src/api.ts) |

Nenhum dos itens acima exige campo novo em `HudState`. Antes do primeiro Snapshot,
`maxHp <= 0` não indica morte; a condição de morte exige `status = running`,
`mode` conhecido, máximo positivo e `alive = false`, como em `src/play/notices.ts`.
A conexão perdida tem prioridade sobre morte; o resultado substitui esses avisos.

### Limites explícitos para a F7.6

- Não mostrar cronômetro de respawn, identidade do companheiro observado, HP do
  Boss ou cooldown: esses dados não estão na interface pública.
- HP e Mana permanecem locais mesmo com a câmera acompanhando outro Player.
- RTT é arredondado somente na apresentação. O mount já evita `onHud` repetido
  quando o conteúdo não muda; a casca não precisa calcular um HUD por frame.
- O minimapa é desenhado em canvas separado, opcional por `minimapCanvas` em
  `MountOptions`, na base conferida. A HUD reserva seu espaço e não escreve nele.
- A ajuda existe nos dois Modes e usa os objetivos da §4 sem inventar limites
  numéricos de RoomOptions.
- A §2 descreve prioridade em espaço limitado; conferir legibilidade e ausência
  de sobreposição com mão/minimapa em janela estreita continua sendo aceite
  visual, não uma garantia obtida pela leitura das classes CSS.

### Registro de revisão dos consumidores

| Evidência | Situação nesta conferência |
|---|---|
| Revisão anterior do Caio sobre Mode, desfecho, erro, foco e token | Registrada na §11; preservada sem novo aceite atribuído |
| Implementação do Mode e do foco por Augusto | Registrada na §11, #168; não equivale a aceite integral do documento |
| Aceite de composição, prioridades, i18n e acessibilidade por Caio | A confirmar |
| Aceite de campos disponíveis, feed, callbacks e estados por Augusto | A confirmar |
| Teste visual e de integração dos cenários da §8 | Sem nova evidência registrada nesta revisão documental |

Pedido pronto para a revisão, a ser publicado por Rafael:

> Caio e Augusto: a #142 especifica apresentação da HUD em `docs/contracts/hud.md`,
> vinculada ao `mount-game.md`. A §12 mapeia os critérios da issue para campos já
> existentes. Caio, confirmar composição/prioridades, avisos, i18n e acessibilidade.
> Augusto, confirmar dados, feed, callbacks e estados de conexão/término. Se faltar
> algum dado, registrar o cenário e o campo necessário antes de implementar.
> As decisões anteriores da §11 foram preservadas. Esta revisão não muda código.

### Validação e entrega desta revisão

Conferência por leitura de `api.ts`, `mount.ts`, `Match.tsx`, `Hud.tsx`,
`Resources.tsx`, `Players.tsx`, `Scoreboard.tsx`, `KillFeed.tsx`, `Help.tsx`,
`Ping.tsx`, `notices.ts`, `bars.ts`, `outcome.ts` e dos catálogos `hud`.
Nenhum comando de build, teste, Docker ou navegador foi executado nesta revisão.
A falha de resolução dos nomes da HUD no Mac e sua correção na #190 são um assunto
separado, sem mudança na especificação de apresentação.

Um commit documental: `docs(hud): revisa cobertura e aceites da F4.3 (#142)`.
Arquivo: `docs/contracts/hud.md`. A alteração deve entrar separada da #192.
O fechamento da #142 depende da revisão de Caio e Augusto; esta atualização não
atribui esse aceite nem conclui a validação funcional da F7.6 (#49).
