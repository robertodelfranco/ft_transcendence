# F4.3 — Especificação da HUD coop e PvP

**Data:** 22/10/2026. **Estado:** proposta de conteúdo pronta para revisão; sem aceite dos consumidores registrado.
**Escreve:** Rafael. **Revisam:** Caio (F7.6 e i18n) e Augusto (`HudState` e integração).
Roberto revisa qualquer dúvida sobre regras; esta especificação não altera a Simulation.

## 1. Fonte e fronteira

O contrato de dados continua sendo [mount-game.md §2.6](mount-game.md#26-hudstate-e-mountoptions), implementado em `frontend/game/src/api.ts`.
Esta especificação define apresentação, prioridade e estados da F7.6, conforme o [plano](../catacombs42-plano-de-tarefas.md).
Os termos seguem [CONTEXT.md](../../CONTEXT.md); término e vencedores seguem [ws-messages.md §2.6](ws-messages.md).

React desenha toda a HUD em DOM, com i18n em pt-BR, en e es. O canvas contém cena, mão e minimapa, sem texto.
A casca recebe `onHud` e `onEnd`; não lê Snapshot, não abre um segundo socket do jogo e não calcula dano, coleta, respawn ou vitória.
Mode, identidade do User local e RoomOptions vêm do contexto autenticado e da Room, conforme [matches-api.md](matches-api.md). Não inferir Mode de `scoreboard === null`: isso também ocorre antes do primeiro `welcome`.

Na cópia inspecionada em 22/10, `Play.tsx` é uma página provisória de conexão, `ping` chega como `null` e o jogo guarda os últimos cinco registros do feed. Estes são fatos da implementação, não aceites da F7.6.

## 2. Composição e prioridade

| Região | coop | pvp |
|---|---|---|
| Topo esquerdo | Lista de Players, HP e estado | Dois Players, Frags e relógio |
| Topo direito | Ping e acesso à ajuda de controles | Ping e kill feed |
| Centro | Aviso de conexão, morte ou erro quando necessário | Aviso de conexão, espera de respawn ou erro |
| Rodapé esquerdo | HP, Mana, Armor e chaves do Player local | HP, Mana, Armor e chaves do Player local |
| Rodapé direito | Área reservada para o minimapa F3.6 | Área reservada para o minimapa F3.6 |

O centro fica livre durante a partida normal, para preservar a visão. O rodapé não cobre a mão/fireball; reservar espaço ao minimapa quando ele estiver integrado.
Ordem de prioridade em conflito de espaço: erro/conexão ou resultado; estado de morte; HP e Mana; placar/relógio; Armor e chaves; Players; ping e feed.
Em janela estreita, reordenar os grupos e permitir nomes truncados com nome completo acessível. Não ocultar informações essenciais nem exigir rolagem para ver recursos e placar.

## 3. Recursos e Players

| Informação | Fonte | Apresentação e condição |
|---|---|---|
| HP local | `hp`, `maxHp` | Barra e número `atual / máximo`; sempre durante `running`, inclusive morto |
| Mana local | `mana`, `maxMana` | Barra e número `atual / máximo`; sempre durante `running` |
| Armor local | `armor` | Ícone com rótulo traduzido e número; mostrar zero; sem barra percentual, pois não existe `maxArmor` |
| Chaves locais | `keys` | Ícone com rótulo e quantidade; mostrar zero, inclusive se Pickups estiverem desativados |
| Companheiros coop | `players` | Nome, HP numérico, vivo/morto e conectado/desconectado; Player local primeiro, demais por `id` crescente |
| Ping | `ping` | RTT inteiro em ms; `null` aparece como indisponível (`—` com descrição traduzida), nunca como 0 ms |

Os recursos permanecem os do Player local quando a câmera acompanha um companheiro: não trocar seus valores pelos do observado.
Para HP dos companheiros, usar número absoluto: o contrato não fornece máximo por participante.
Morte e desconexão são estados independentes; um Player pode estar morto e desconectado. Exibir ambos quando aplicável.

Proposta visual de HP baixo: `hp > 0` e `hp / maxHp <= 0,25`, somente com máximo positivo; usar ícone/rótulo além da cor. É um limiar visual, não uma regra de dano.
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

- Objetivo na ajuda: atingir `frag_limit` ou terminar o tempo com mais Frags; limites vêm das RoomOptions, sem duplicar defaults na tela.
- Mostrar os dois nomes e Frags na ordem entregue por `scoreboard.players`, resolvendo nomes por `players.id`; identificar o Player local também por texto/ícone.
- Mostrar `timeLeftS` como `mm:ss`, arredondando para cima e limitando o valor visual mínimo a zero. Não decrementar com relógio próprio nem declarar resultado quando chegar a zero.
- Com `scoreboard = null` em uma Room PvP já identificada, mostrar placar indisponível; não fabricar empate `0 × 0`.
- Com `status = running` e `alive = false`, mostrar “Aguardando respawn”; remover quando `alive` voltar a `true`. Sem contagem regressiva, pois falta o instante de respawn no `HudState`.
- Manter os recursos locais e placar durante essa espera. Não oferecer respawn manual.

## 5. Kill feed

Proposta compatível com o contrato: feed visível só no PvP, com até cinco registros de morte de Player, mais recente primeiro. Não representa Kills de Enemy/Boss.
Cada linha resolve `by` e `victim` em `players`; se o nome não estiver disponível, usar fallback traduzido com o id. `by = null` recebe mensagem neutra de morte, sem inventar atacante.

Os registros permanecem até serem substituídos ou a página desmontar; não há expiração por tempo nesta entrega. O `tick` não é horário civil.
Não acrescentar novamente a lista inteira a cada `onHud`: ela já é o feed acumulado. Preservar registros distintos mesmo se os nomes forem iguais.
A política de cinco linhas e a ordem visual precisam do aceite de Caio e Augusto; não mudam o tipo público.

## 6. Conexão, término e controles

| Estado | Comportamento da casca |
|---|---|
| `connecting` | Mensagem de conexão; recursos e placar ainda indisponíveis. Zeros iniciais não significam morte |
| `running` | Exibir valores recebidos e aplicar as condições de vivo/morto |
| `disconnected` | Aviso persistente de Reconnection; manter últimos valores identificados como desatualizados. Não simular retomada nem abrir outro socket |
| `error` | Mensagem traduzida por `error`, fallback para código desconhecido e ação para voltar ao lobby; sem repetição automática pela página |
| `finished` | Encerrar avisos de morte/reconexão; se `onEnd` ainda não chegou, mostrar partida encerrada sem inventar vencedor |

Em `error`, `replaced` explica que outra aba assumiu a partida. O fechamento `server_shutdown` inicia Reconnection e chega à HUD atual como `disconnected`, sem código de causa; usar aviso genérico de reconexão, sem afirmar o motivo da queda. A política de nova tentativa pertence ao socket, conforme [ws-manager.md §2.9](ws-manager.md).
O jogo pode emitir `running` antes de concluir o carregamento dos assets: isso não comprova Renderer pronto. Falha posterior chega como `asset_load_failed`.

A tela de resultado usa `onEnd`, respeitando a espera de `BOSS_DYING_S` já feita pelo jogo. Não adicionar outro atraso na casca.
No coop, usar `result`; no PvP, empate vem de `result = draw`, vitória local de `winnerIds` contendo o id local e derrota local dos demais casos com vencedor. Nunca interpretar `win` da Room como vitória dos dois Players.
Traduzir `reason` (`boss_defeated`, `all_dead`, `forfeit`, `frag_limit`, `time_limit`) com fallback. Oferecer retorno ao lobby; resumo persistido e Achievements pertencem à F7.8/F4.6, sem inventar valores na HUD.

Ajuda traduzida e acessível por botão: movimento W/A/S/D, giro pelas setas esquerda/direita e mouse capturado, Shift para correr, Espaço para `fire`, F para `door`, clique na cena para Pointer Lock e Esc para liberar o mouse. Manter alinhamento com `net/input.ts` e com o Renderer; não criar atalhos de HUD sobre essas teclas.
A partida não pausa ao abrir ajuda nem ao perder Pointer Lock. Controles DOM devem permitir navegação por teclado sem disparar Actions do jogo; isso é um aceite de integração, não uma garantia da versão atual.
Sair da rota chama `unmount`; fechar a página não declara vitória/derrota nem significa remoção imediata da Room, por causa do Grace period.

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

Esses cenários são roteiro de validação, ainda não executado. Fixtures de `HudState` e callbacks falsos podem validar a apresentação; partida real confirma a integração.

## 9. Revisão necessária

| Quem | O que confirmar |
|---|---|
| Caio | Composição, prioridades, conteúdo dos avisos, i18n e distribuição entre HUD mínima e completa da F7.6 |
| Augusto | Feed de cinco registros, RTT em ms e emissão de `onHud` apenas quando seu conteúdo muda, como implementado hoje |
| Caio e Augusto | Recursos locais durante acompanhamento de companheiro; foco/Pointer Lock e estado de asset ainda carregando |

O conteúdo está proposto; aceite funcional depende da revisão e da implementação/validação da F7.6. Não há mudança de schema, API ou protocolo nesta entrega.

## 10. Registro de validação — issue #142

Validação local em 22/10/2026, na branch `142-f4.3-especificacao-hud`:

- `git diff --check`: passou para os arquivos rastreados modificados; o documento novo foi revisado por leitura.
- Referências locais nos quatro documentos da entrega: 40 verificadas; uma referência antiga quebrada no briefing de `contracts/README.md` para `../../proxy/nginx.conf`, também presente no HEAD anterior. Não foi introduzida pela F4.3. Esta checagem verifica existência dos arquivos, não âncoras de seção.
- Conferência com `api.ts`, `mount.ts`, `net/viewstate.ts`, `net/socket.ts` e `net/input.ts`: recursos locais, zeros iniciais, RTT indisponível, feed de cinco registros, controles e resultado correspondem às fontes atuais. A descrição de `server_shutdown` foi corrigida para refletir a Reconnection sem causa exposta à HUD.
- Comando em `frontend/`: `npm test -- game/src/mount.test.ts game/src/net/viewstate.test.ts game/src/net/socket.test.ts game/src/net/input.test.ts`. Resultado: **4 arquivos, 58 testes aprovados**. Foram usados testes existentes; nenhum código ou teste foi alterado.

Esses testes verificam a base que fornece os dados à HUD, não a apresentação proposta. Não foram executados Docker, navegador ou partida real nesta validação. Os cenários da §8 continuam pendentes da implementação da F7.6 e da revisão dos consumidores.
