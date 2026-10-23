# F4.6 — Achievements, XP, level e ranking

**Issue:** #119. **Data:** 22/10/2026. **Estado:** conteúdo aceito por Rafael; revisão de Akita aprovada na PR #144; aceites de Roberto e Caio pendentes.
**Escreve:** Rafael. **Revisam:** Akita (F5.5/F5.7 e schema), Roberto (Simulation e contadores) e Caio (apresentação e i18n).

## 1. Escopo e fontes

Entrega de conteúdo da F4.6 no [plano](../catacombs42-plano-de-tarefas.md): catálogo com pelo menos cinco Achievements e fórmulas de XP, level e Elo para orientar F5.5 e F5.7.
As interfaces e a transação continuam em [rooms.md](rooms.md), a exposição HTTP em [matches-api.md](matches-api.md) e o vocabulário em [CONTEXT.md](../../CONTEXT.md).

Rafael aceitou o catálogo, os códigos, as políticas de elegibilidade, as fórmulas e os valores de XP/level/Elo desta versão. Também confirmou a regra de boas-vindas por Match com pelo menos 5 segundos, avaliada ao final, sem exigir vitória ou 5 segundos individuais conectado. As propostas de tradução e a integração seguem para revisão dos consumidores; o aceite de conteúdo não substitui o aceite técnico.
O documento não altera código, schema ou protocolo. Não significa que os Achievements já estejam implementados.

XP, level, Elo e desbloqueios são calculados no servidor ao persistir um Match terminado, em `record_match_result`. A Simulation entrega contadores; não conhece XP ou Elo. Nenhuma gravação de progressão acontece durante a Room.

## 2. Elegibilidade e persistência

Proposta para o catálogo inicial:

- Somente Match `finished` com `MatchResult` válido gera progressão. Lobby abandonado e Match `aborted` não geram XP, Elo ou Achievement.
- Um Achievement é desbloqueado uma vez por User, pela chave `(user_id, code)`, mantendo o `match_id` do primeiro desbloqueio. Não é uma recompensa repetida por Match.
- Cada condição abaixo é individual e exige os contadores do mesmo Match; não somar partidas. “Primeira vez” significa primeiro Match terminado elegível que satisfaz a condição e ainda não tem o código desbloqueado. Não exige uma consulta a todo o histórico.
- Proposta de elegibilidade para **XP e Achievements**: `disconnected_at_end = false`. Morto e conectado continua elegível. Uma queda recuperada antes do fim não exclui o Player. Os contadores e a linha de resultado de quem saiu continuam sendo persistidos.
- A restrição de conexão não se aplica ao **Elo**: abandono no PvP deve registrar a derrota, sem permitir preservar rating desconectando.
- `forfeit` é término válido: usa `won`, inclusive para a vitória PvP e seu Achievement. Sem exclusão por duração mínima nesta versão; isso não constitui proteção contra partidas combinadas.
- Repetir a chamada de persistência não duplica XP, Elo, Achievement ou anúncio. Respeitar a transação e a trava do Match em `rooms.md` §2.5; só anunciar desbloqueios efetivamente inseridos após commit bem-sucedido.
- Nenhum Achievement concede XP extra nesta proposta. XP e Elo não mudam HP, Mana, Armor ou qualquer regra da Simulation.

Essas políticas de elegibilidade precisam de aceite do Akita e do Roberto; não modificam quem o Ruleset considera vencedor.

## 3. Catálogo

Nomes são conteúdo traduzível; códigos são estáveis, ASCII e independentes do idioma. Predicados usam `p` para a linha individual de `PlayerOutcome` (a forma implementada de `MatchPlayerResult`, conforme `rooms.md` após a #141), além da elegibilidade da §2.

| Código proposto | Nome pt-BR | Mode | Condição em um único Match | Dados |
|---|---|---|---|---|
| `coop_first_win` | Eu venci! | `coop` | `p.won = true` | Já previstos |
| `coop_exterminator` | Exterminador | `coop` | `p.kills >= 5`, sem exigir vitória | Já previstos |
| `coop_no_deaths_win` | Ensaboado | `coop` | `p.won = true` e `p.deaths = 0` | Já previstos |
| `pvp_first_win` | Veni, vidi, vici | `pvp` | `p.won = true` | Já previstos |
| `pvp_five_frags` | Não grita! | `pvp` | `p.frags >= 5`, sem exigir vitória | Já previstos |
| `first_five_seconds` | Bem-vindo ao Catacombs 42 | Ambos | Participar até o fim de um Match com `duration_ticks >= 5 × TICK_RATE`, sem exigir vitória ou sobrevivência | Já previstos; interpretação de tempo a confirmar |
| `pvp_time_limit_win` | Salvo pelo gongo | `pvp` | `p.won = true` e `reason = time_limit` | Já previstos |

Detalhes para evitar interpretações diferentes:

- **Exterminador:** `kills` conta Enemies **e Boss**, conforme `rooms.md`; o catálogo não distingue caveiras ou variantes visuais de Theme. Cinco Kills de um companheiro não contam para o Player local.
- **Ensaboado:** exige zero mortes, não zero dano. `survived` sozinho não substitui `deaths = 0`, pois significa apenas vivo no Tick final. Não exige que o Player tenha dado o último golpe no Boss.
- **Veni, vidi, vici:** vitória é `p.won`, não `result = win` da Room, que também chega ao perdedor no PvP. Empate não desbloqueia.
- **Não grita!:** 4 Frags não bastam; 5 ou mais bastam, mesmo em derrota por tempo. Com `frag_limit = 3` ou 4 a condição não será alcançável; o catálogo descreve “em um único Match”, sem prometer que todo conjunto de RoomOptions permite o desbloqueio. O intervalo atual é 3–10 e o default é 5 em [room-options.md](room-options.md).
- **Bem-vindo ao Catacombs 42:** substitui a condição de morte. Não exige morrer, matar ou vencer. O pedido é participar por 5 segundos; a definição calculável com o contrato atual usa a duração do Match e conexão ao término, conforme §4. Desbloqueio ao persistir o resultado, não uma notificação instantânea aos 5 segundos.
- **Salvo pelo gongo:** vencer quando o relógio encerra o PvP; não exige Frag nos segundos finais. Empate, derrota, vitória por `frag_limit` e vitória por `forfeit` não desbloqueiam.
- As condições são independentes: um Match pode desbloquear vários códigos. Lixeiro e a condição de morte para Enemy foram substituídos; não fazem parte do catálogo. Não há acompanhamento por tipo de Enemy.

### 3.1 Propostas de tradução

Caio revisa os textos e escolhe as chaves conforme [i18n.md](i18n.md). O catálogo do servidor identifica por `code`; a interface traduz nome e descrição, sem persistir o título traduzido como identidade.

| Código | Nome en proposto | Nome es proposto |
|---|---|---|
| `coop_first_win` | I won! | ¡Gané! |
| `coop_exterminator` | Exterminator | Exterminador |
| `coop_no_deaths_win` | Slippery | Escurridizo |
| `pvp_first_win` | Veni, vidi, vici | Veni, vidi, vici |
| `pvp_five_frags` | Don't scream! | ¡No grites! |
| `first_five_seconds` | Welcome to Catacombs 42 | Bienvenido a Catacombs 42 |
| `pvp_time_limit_win` | Saved by the bell | Salvado por la campana |

As descrições traduzidas devem explicitar Mode, quantidade e “em um único Match”, seguindo a tabela de condições. Ainda não foram adicionadas aos catálogos do frontend.

## 4. Tempo disponível e limite da condição

O resultado já prevê `duration_ticks`, `reason` e `disconnected_at_end`. Com as substituições, os sete predicados da tabela podem usar os dados já previstos, **se a interpretação abaixo de participação for aceita**. Nenhum contador novo é solicitado nesta versão.

A proposta para Bem-vindo ao Catacombs 42 é participar até o fim de um Match que dure pelo menos 5 segundos. `duration_ticks` mede o tempo da Room inteira, não o tempo conectado ou vivo de cada Player. Alguém que só conectar perto do término também pode satisfazer esse predicado; ele não comprova 5 segundos individuais de presença. Caso Rafael queira garantir literalmente 5 segundos conectado, será necessário revisar o contrato de tempo por Player antes de implementar essa condição.

Usar `duration_ticks >= 5 × TICK_RATE`, com a constante oficial do servidor, sem arredondar segundos para cima. Hoje `TICK_RATE = 30`: 149 Ticks não bastam; 150 bastam. Não contar espera no Lobby. Morte antes dos 5 segundos não impede o desbloqueio se o Match durar o mínimo e o Player continuar conectado até o fim; não se exige sobrevivência.
O backend persiste e anuncia o Achievement após o término normal, conforme §2. Match que chega aos 5 segundos mas depois é abortado não desbloqueia. Não usar temporizador de navegador para conceder progressão.

Na `main` após a #141, a Simulation exporta `PlayerOutcome`/`MatchOutcome`; `record_match_result` recebe o `MatchOutcome` junto de `match_id` e `ended_at`, sem criar outra dataclass de resultado. Mode e início vêm da linha de `matches`, conforme `rooms.md` §2.4–§2.5. Não ampliar Snapshot, `HudState` ou Events para avaliar este catálogo.
Proposta: avaliar apenas novos Matches após ativação, sem backfill histórico nesta entrega.

## 5. XP proposto

XP é inteiro, cumulativo e separado por `(user_id, mode)`, conforme `player_stats`. Não existe XP global somando coop e PvP nesta proposta.

| Parcela | coop | pvp |
|---|---|---|
| Participação elegível | 20 XP | 20 XP |
| Desempenho individual | `5 × min(p.kills, 20)` | `10 × min(p.frags, 10)` |
| Resultado | 100 XP se `p.won`, senão 0 | 60 XP se `p.won`; 30 XP no empate; 0 na derrota |

`xp_gained` é a soma das três parcelas para Player elegível, ou 0 se desconectado no fim. Não há penalidade por morte ou perda de XP acumulado. O limite é da parcela de desempenho, não dos contadores persistidos.
Exemplos: coop, vitória com 5 Kills → `20 + 25 + 100 = 145`; coop, derrota com 4 Kills → 40; PvP, vitória com 5 Frags → 130; empate com 2 Frags → 70; derrota sem Frag → 20. Os tetos são 220 no coop e 180 no PvP.

Motivo da proposta: valorizar terminar a partida e vencer, com contribuição individual limitada. Coleta, dano e duração não geram XP extra; isso evita tornar obrigatório sofrer dano ou prolongar a Room para progredir. Não há alegação de balanceamento medido: coeficientes precisam de playtest e revisão de conteúdo.

## 6. Level proposto

Para level inteiro `L >= 1`, o total mínimo de XP é:

```text
threshold(L) = 100 × (L − 1)²
level(xp) = 1 + floor(sqrt(xp / 100))
xp_to_next_level = threshold(level + 1) − xp
```

XP é não negativo; a implementação pode usar raiz inteira para evitar arredondamento de ponto flutuante. `xp_to_next_level` significa **XP que falta**, não o XP total necessário nem a parcela já preenchida da barra.
Level não possui teto nesta proposta e é calculado novamente após somar XP, permitindo subir vários levels no mesmo Match. Os próximos requisitos crescem para manter progressão inicial rápida e posteriores mais longas.

| XP total | Level | XP até o próximo |
|---|---|---|
| 0 | 1 | 100 |
| 99 | 1 | 1 |
| 100 | 2 | 300 |
| 399 | 2 | 1 |
| 400 | 3 | 500 |
| 899 | 3 | 1 |
| 900 | 4 | 700 |

Com XP anterior 90 e ganho 145, o novo XP é 235, level 2, faltando 165. Nenhuma fórmula precisa estar no frontend: a API retorna level e `xp_to_next_level`.

## 7. Elo e ranking propostos

Elo muda apenas no PvP 1v1; valor inicial **1000**, já previsto no schema. Coop usa XP/level e mantém Elo sem alteração. Não haverá divisão por colocação, temporadas ou matchmaking novo nesta tarefa.

Para dois participantes A e B, usar seus ratings **antes** do Match, tomando A como o menor `user_id` para cálculo determinístico:

```text
expected_A = 1 / (1 + 10^((rating_B − rating_A) / 400))
score_A = 1 se A venceu; 0,5 se houve empate; 0 se A perdeu
raw_delta = 32 × (score_A − expected_A)
delta_A = arredondar raw_delta ao inteiro mais próximo, com metades afastadas de zero
new_A = rating_A + delta_A
new_B = rating_B − delta_A
```

K fixo em 32; arredondar uma única vez e aplicar deltas opostos, sem `round` ambíguo entre linguagens. Não aplicar piso em zero ou teto nesta proposta; isso preserva a soma dos ratings. Se houver demanda por piso, revisar a regra explicitamente.
Empate entre ratings diferentes pode transferir pontos ao participante de rating menor. `won` e `result = draw` definem o score, não a diferença de Frags.
Forfeit usa o vencedor decidido pelo servidor. Nunca pular atualização do perdedor por `disconnected_at_end`. As duas atualizações devem usar os ratings anteriores e ocorrer na mesma transação.

| Ratings A / B antes | Resultado de A | Delta A / B | Ratings depois |
|---|---|---|---|
| 1000 / 1000 | Vitória | +16 / −16 | 1016 / 984 |
| 1000 / 1000 | Derrota | −16 / +16 | 984 / 1016 |
| 1000 / 1000 | Empate | 0 / 0 | 1000 / 1000 |
| 1000 / 1200 | Vitória | +24 / −24 | 1024 / 1176 |
| 1200 / 1000 | Vitória | +8 / −8 | 1208 / 992 |
| 1000 / 1200 | Empate | +8 / −8 | 1008 / 1192 |

Ranking usa o endpoint e as métricas de `matches-api.md`: default `elo` no PvP, `xp` no coop; também aceita `wins` e `kills`. Proposta de desempate: valor da métrica decrescente e `user_id` crescente, com posições únicas sequenciais a partir de 1. Filtro proposto: apenas Users com pelo menos um Match terminado naquele Mode, para não ranquear linhas ainda sem participação. Akita deve confirmar ambos na implementação da F5.8.
Valores de XP/level nos JSON ilustrativos atuais de `matches-api.md` não validam estas fórmulas (por exemplo, 1840 XP daria level 5 e faltariam 660, em vez de level 7). Recalcular exemplos e implementação no mesmo trabalho de integração após o aceite; não tratar o exemplo antigo como segunda regra.

## 8. Roteiro de aceite para implementação

| Cenário | Resultado esperado |
|---|---|
| Exterminador com 4 e 5 Kills | Não desbloqueia / desbloqueia; Boss conta como Kill |
| Vitória coop com dano mas nenhuma morte | Eu venci! e Ensaboado; não exige HP cheio |
| Vitória/derrota/empate PvP | Veni, vidi, vici apenas para vencedor; Não grita! depende de Frags, não de vitória |
| Match terminado com 149 / 150 Ticks, a 30 Hz | Bem-vindo ao Catacombs 42 não desbloqueia / desbloqueia para Player elegível |
| Match de pelo menos 5 segundos, com derrota ou Player morto conectado | Bem-vindo ao Catacombs 42 não exige vitória nem sobrevivência |
| Match com conexão individual apenas perto do fim | O predicado por duração da Room pode desbloquear; confirma a limitação de presença individual a revisar |
| Vitória PvP por tempo / empate por tempo / vitória por Frags ou forfeit | Salvo pelo gongo apenas no primeiro caso |
| Uma condição repetida em outro Match | Nenhum novo desbloqueio ou anúncio do mesmo código |
| Match persistido duas vezes ou transação revertida | Sem duplicação; rollback não anuncia Achievement |
| Morto conectado / queda recuperada / desconectado no fim | Elegível / elegível / XP e Achievements bloqueados, conforme proposta |
| PvP por forfeit | Elo muda para ambos; perdedor desconectado não preserva rating |
| Match abortado ou Lobby abandonado | Sem progressão nem desbloqueio |
| Limites de XP e múltiplos levels | Coeficientes e tetos da §5, fronteiras da §6 e XP restante correto |
| Elo e ranking empatados | Ratings calculados a partir dos valores anteriores; soma preservada; ordem de ranking determinística |
| Nomes nos três idiomas | Mesmo código, título e descrição traduzidos; sem texto no canvas |

Estes são aceites propostos, não testes executados da funcionalidade. A implementação e os testes correspondentes pertencem às entregas dos donos do código.

## 9. Evidência e pendências de revisão

Inspeção local em 22/10/2026: contrato de `MatchResult`, resultado exportado por `sim.py`, `TICK_RATE` em `rules.py` e modelo `UserAchievement` sustentam os dados usados no catálogo revisado. Nenhuma migração foi feita. A ausência de duração individual permanece explícita na §4.
As fronteiras e exemplos numéricos de level e Elo foram calculados em script temporário de leitura antes da redação; não validam código de produção nem balanceamento. Não foram executados Docker ou partida real.

| Responsável | Estado da revisão / próximo passo |
|---|---|
| Akita | Aprovado na revisão da PR #144 compartilhada por Rafael: dados e fórmulas, elegibilidade, forfeit, duração da Room para boas-vindas, separação por Mode e desempate/filtro do leaderboard |
| Roberto | Aceite da duração da Room para boas-vindas e da propagação dos dados até a persistência ainda pendente |
| Akita | A transação e o retorno de desbloqueios já estão na F5.3 (#141). Fórmulas e correção dos exemplos de API ficam na F5.5; catálogo e desbloqueios na F5.7 |
| Caio | Revisar traduções e exibição de descrição, desbloqueio e XP restante; deixar claro que o desbloqueio acontece ao fim |

O documento entrega a proposta de conteúdo da #119; os sete Achievements não estão declarados funcionais. Não há novos contadores nesta versão. O aceite de Akita foi registrado com base no comentário da PR #144 compartilhado por Rafael; não há aprovação presumida de Roberto ou Caio. Só marcar o contrato como totalmente aceito e datar esse aceite após as revisões restantes.
