# F4.7 — Balanceamento coop e PvP (#203)

**Responsável:** Rafael. **Revisão técnica:** Roberto. **Data do levantamento:** 04/11/2026.
**Estado:** levantamento inicial preservado; ajuste de Mana e cadência aplicado em 11/11/2026
por solicitação de Rafael, pendente de reteste e revisão técnica do Roberto.
**Branch:** `203-balanceamento-coop-pvp`, base `1e0b6c5` de `origin/main` disponível
localmente. Atualizada por fast-forward para `d43b730` da `main` em 11/11/2026.
A #192 ficou preservada em sua branch, commit `7c171b4`.

### Ajuste aplicado em 11/11/2026

Após jogar, Rafael relatou que a regeneração de Mana estava alta e solicitou
inicialmente 1 Mana/s e custo de 10 Mana por fireball em ambos os Modes.
Depois Rafael alterou diretamente o backend para 2 Mana/s e intervalo
entre disparos de 0,8 s, confirmando esses valores para sincronização da entrega.
Mode, Map,
participantes e duração dessa partida não foram informados; não atribuir o
relato a um cenário específico nem considerá-lo validação dos dois Modes.

| Constante | coop antes → aplicado | PvP antes → aplicado |
|---|---|---|
| `MANA_REGEN_PER_S` | 10.0 → 2.0 Mana/s | 5.0 → 2.0 Mana/s |
| `FIREBALL_MANA_COST` | 10 → 10 Mana | 20 → 10 Mana |
| `FIREBALL_COOLDOWN_S` | 0.4 → 0.8 s | 0.4 → 0.8 s |

Com os valores aplicados, recuperar o custo de um tiro leva 5 s e recuperar
de zero a 100 Mana leva 50 s, sem atirar/Pickups. O cooldown é de 24 Ticks
a 30 Hz. Na cadência máxima de 1,25 tiro/s, o consumo é 12,5 Mana/s nos
dois Modes, acima da regeneração de 2 Mana/s. Teto e valores dos Pickups
não mudaram. São contas, não reteste.

Backend, TypeScript, fixture e contrato acompanham o ajuste. O teste de teto
de Mana usa agora um déficit menor que a regeneração de um Tick, calculado
a partir da constante. Nenhuma suíte foi executada nesta aplicação.

**Pendente:** repetir coop/PvP, registrar espera por Mana e duração dos
confrontos e obter revisão do Roberto. A F4.7 continua em andamento.

**Histórico:** as seções 1–11 abaixo preservam o levantamento de 04/11,
incluindo números e contas anteriores ao ajuste. Para os valores implementados,
usar a tabela acima e `contracts/rules.md` §2.6/§5.5.

## 1. Objetivo e fronteira

Avaliar o ritmo e o equilíbrio das partidas reais. Não alterar números sem
problema observado e justificativa. Rafael propõe valores; Roberto revisa
coerência com Simulation/Prediction e os arquivos `rules.*`.

Fontes:

- [rules.md](contracts/rules.md): nomes, unidades e decisões oficiais;
- [room-options.md](contracts/room-options.md): parâmetros escolhidos no lobby;
- [rules.py](../backend/app/game/rules.py) e [rules.ts](../frontend/game/src/rules.ts);
- [PvpRuleset](../backend/app/game/rulesets/pvp.py),
  [CoopRuleset](../backend/app/game/rulesets/coop.py) e
  [Simulation](../backend/app/game/sim.py);
- [Maps PvP](maps-pvp-f4.4.md) e [Slice de Rafael](slices/caminho-3-rafael.md).

Números abaixo são o estado atual, não novos valores aprovados. O Theme muda
aparência; não é variante de dificuldade. Problema de conexão, colisão ou HUD
vai para a frente correspondente, sem ser compensado alterando dano/velocidade.

## 2. Conferência da base

Leitura estruturada de `rules.py` por AST e comparação com as declarações de
`rules.ts` e `frontend/game/fixtures/mirror.json`, em 04/11/2026:

- 36 constantes comuns lidas;
- seis chaves por Mode no `RULESET_NUMBERS`;
- nenhuma diferença de nome/valor entre Python, TypeScript e a fixture;
- defaults conferidos em `RoomOptions` e limites em `matches/schemas.py`.

Essa conferência estática não executou a Simulation nem as suítes de testes.
Nenhum código, Map, constante, fixture ou contrato de regra foi alterado nesta etapa.

## 3. Inventário atual das constantes comuns

### Relógio e Player

| Nome | Valor atual | Unidade / comentário da fonte |
|---|---:|---|
| `TICK_RATE` | `30` | Hz |
| `PLAYER_SPEED` | `3.6` | cél/s |
| `PLAYER_SPRINT_MULT` | `2.0` | multiplicador |
| `PLAYER_ROT_SPEED` | `1.8` | rad/s |
| `MOUSE_MAX_ROT_SPEED` | `18.85` | rad/s (6π) |
| `PLAYER_RADIUS` | `0.05` | cél |
| `BODY_BLOCK_DISTANCE` | `0.6` | cél |
| `FIREBALL_COOLDOWN_S` | `0.4` | s |
| `DOOR_REACH` | `1.0` | cél |
| `POTION_HEAL` | `3` | HP |

### Enemy

| Nome | Valor atual | Unidade / comentário da fonte |
|---|---:|---|
| `ENEMY_SPEED` | `1.5` | cél/s |
| `ENEMY_RADIUS` | `0.2` | cél |
| `ENEMY_SEPARATION` | `0.6` | cél |
| `ENEMY_RETARGET_MARGIN` | `1.0` | cél |
| `ENEMY_CHASE_RANGE` | `12` | cél |
| `ENEMY_ATTACK_RANGE` | `0.7` | cél |
| `ENEMY_ATTACK_INTERVAL_S` | `1.4` | s |
| `ENEMY_DAMAGE` | `1` | HP |
| `ENEMY_DYING_S` | `1.5` | s |

### Boss

| Nome | Valor atual | Unidade / comentário da fonte |
|---|---:|---|
| `BOSS_HP` | `60` | HP |
| `BOSS_SPEED` | `2.0` | cél/s |
| `BOSS_RADIUS` | `0.2` | cél |
| `BOSS_SIGHT_RANGE` | `20.0` | cél |
| `BOSS_MIN_RANGE` | `8.0` | cél |
| `BOSS_ATTACK_RANGE` | `18.0` | cél |
| `BOSS_ATTACK_WINDUP_S` | `1.2` | s |
| `BOSS_ATTACK_COOLDOWN_S` | `2.2` | s |
| `BOSS_DYING_S` | `1.2` | s |
| `BULLET_DAMAGE` | `2` | HP |
| `FIREBALL_BOSS_DAMAGE` | `10` | HP |

### Projectile

| Nome | Valor atual | Unidade / comentário da fonte |
|---|---:|---|
| `PROJECTILE_SPEED` | `12.0` | cél/s |
| `PROJECTILE_HIT_RADIUS` | `0.3` | cél |
| `PROJECTILE_RADIUS` | `0.1` | cél |
| `PROJECTILE_MAX_SUBSTEP` | `0.1` | cél |
| `PROJECTILE_HIT_S` | `0.4` | s |
| `FIREBALL_PLAYER_DAMAGE` | `2` | HP |

Os raios, subpassos, Tick e intervalos de animação aparecem no inventário para
completude. Não são as primeiras variáveis de balanceamento: mudá-los pode afetar
colisão, desempenho, Prediction ou a sincronização de clipes. Uma alteração de
regra estrutural ou nova mecânica exige avaliação com Roberto.

## 4. Valores por Ruleset e opções da Room

| Nome | Unidade | coop | pvp |
|---|---|---:|---:|
| `MANA_MAX` | Mana | 100 | 100 |
| `FIREBALL_MANA_COST` | Mana/tiro | 10 | 20 |
| `MANA_REGEN_PER_S` | Mana/s | 10.0 | 5.0 |
| `MANA_PICKUP` | Mana | 30 | 20 |
| `ARMOR_POINTS` | Armor | 3 | 2 |
| `RESPAWN_DELAY_S` | s | sem respawn | 3.0 |

| Opção do lobby | Default | Limite aceito | Observação |
|---|---:|---|---|
| `start_hp` | 10 | 5–20 | HP inicial e teto da poção |
| `frag_limit` | 5 | 3–10 | Só PvP |
| `time_limit_s` | 180 s | 120–600 s | Só PvP |
| Pickups de poção/Mana/Armor | ligados | booleano por tipo | Só têm efeito onde o Map contém o Pickup |
| `theme` | dungeon | dungeon/sewer | Visual; manter igual ao comparar números |

Não duplicar defaults nos dois Rulesets: `RoomOptions` continua sendo a fonte
no backend. Os limites são de `matches/schemas.py`. Esta tabela não muda os
contratos nem marca suas decisões em aberto como resolvidas.

## 5. Inventário do conteúdo usado no teste

| Map | Mode | Spawns | Enemies | Boss | Poções | Mana | Armor |
|---|---|---:|---:|---:|---:|---:|---:|
| `dungeon_map` | coop | 5 | 4 | 1 | 2 | 3 | 3 |
| `enemy` | coop | 5 | 20 | 1 | 4 | 4 | 3 |
| `enemy_sewer` | coop | 5 | 20 | 1 | 4 | 4 | 3 |
| `pvp_crossroads` | pvp | 4 | 0 | 0 | 0 | 0 | 0 |
| `pvp_ring` | pvp | 4 | 0 | 0 | 0 | 0 | 0 |

Os Maps PvP não têm Pickups nesta versão. Portanto o teste real deles avalia Mana
por regeneração e Armor inicial zero; não comprova equilíbrio de Pickups PvP.
Se quiser introduzi-los, propor a distribuição e revisar com Roberto antes de
alterar Maps. Pickups não reaparecem por terem sua opção ligada no lobby.

## 6. Relações para orientar a observação

Estas são contas derivadas dos valores, não resultados de playtest. Ignoram
latência, erros de mira, percurso, paredes e arredondamento em Ticks, salvo onde
explicitado. Não confundir com garantia de tempo real para vencer uma partida.

| Relação | Leitura dos valores atuais | O que observar |
|---|---|---|
| Corrida | 3,6 × 2 = 7,2 cél/s | Controle nas esquinas e facilidade de fugir |
| Projectile vs corrida | 12 > 7,2 cél/s | Tiro alcança alvo que foge em linha reta; mira e desvio ainda importam |
| Cooldown | 0,4 s = 12 Ticks, teto de 2,5 tiros/s | Cadência quando há Mana; cada Action exige um acionamento |
| PvP, 10 HP sem Armor | 5 acertos de 2 HP | Cinco tiros consomem 100 Mana; erros podem impor espera |
| PvP, 5/20 HP sem Armor | 3/10 acertos, respectivamente | Opções extremas mudam muito a duração do confronto |
| PvP, repor custo de um tiro | 20 / 5 = 4 s de regeneração | Tempo sem poder responder após esgotar Mana |
| coop, repor custo de um tiro | 10 / 10 = 1 s de regeneração | Generosidade vs necessidade de Pickups |
| Repor 100 Mana a partir de zero | coop 10 s; PvP 20 s, sem atirar/Pickups | Tempo de recuperação percebido |
| Boss | 60 HP / 10 por fireball = 6 acertos no total | Dificuldade com vários Players; HP não escala por quantidade de Players no código atual |
| Enemy | Uma fireball mata; dano de contato 1 a cada 1,4 s | Pressão de vários Enemies e capacidade de reposicionar |
| Poção | Recupera até 3 HP, limitada por `start_hp` | Se sua posição e quantidade ajudam de fato |
| Armor | Absorve dano antes do HP; Pickup põe no teto do Mode | Utilidade e clareza do feedback no coop |
| Respawn PvP | Delay nominal 3 s, no próximo Tick elegível com Spawn livre | Ritmo, orientação preservada e risco de morrer novamente ao nascer |

Mana regenera durante a partida; 100/custo descreve o orçamento inicial sem
regeneração. O consumo sustentado no PvP é 20/0,4 = 50 Mana/s, maior que 5 Mana/s;
no coop é 25 Mana/s, maior que 10 Mana/s. Isso indica que cadência máxima contínua
esgota o recurso; não comprova que o valor é ruim.

A Simulation escolhe respawn livre mais distante por distância euclidiana, sem
verificar linha de visão. O Ruleset atual não redefine a orientação no respawn.
Se houver problema de Spawn/orientação, registrar e revisar antes de propor
alterar `RESPAWN_DELAY_S` como solução.

## 7. Roteiro inicial: jogar antes de mudar

Usar o jogo completo da branch #203. Aquecer o jogo e conferir conexão estável.
Registrar revisão, participantes, Map, Mode, Theme e opções reais da Room.
Os números abaixo definem um roteiro proposto de observação, não um requisito
novo de quantidade de partidas do subject.

### Primeira rodada — coop

1. Começar com `dungeon_map`, 10 HP, Pickups ligados e Theme dungeon.
2. Jogar uma vez sozinho para aprender os controles e o percurso. Pressionar
   Espaço para cada tentativa de tiro; segurar a tecla não produz rajada automática.
3. Anotar duração aproximada, motivo do fim, mortes, momentos sem Mana,
   se poções/Armor foram úteis e dificuldade de atravessar os Enemies/chegar ao Boss.
4. Jogar com pelo menos mais uma pessoa e comparar pressão dos Enemies e Boss.
   Se houver três ou cinco participantes disponíveis, registrar a diferença;
   não afirmar teste com cinco sem realizá-lo.
5. Repetir em `enemy` e `enemy_sewer`, que têm mais Enemies. Manter os defaults
   para comparar; depois experimentar `start_hp` 5 e 20 se houver dúvida concreta.

### Segunda rodada — PvP

1. Jogar 1v1 no `pvp_crossroads` com 10 HP, 5 Frags e 180 s.
2. Repetir com os mesmos participantes trocando a ordem de entrada da Room,
   para inverter os Spawns iniciais. Registrar familiaridade e diferenças de rede.
3. Fazer a mesma dupla de partidas em `pvp_ring`.
4. Anotar resultado, Frags, duração, fim por tempo/Frags, espera por Mana,
   facilidade de acertar em corrida e mortes logo após respawn.
5. Se houver espera excessiva ou vantagem recorrente de um lado, repetir o
   cenário antes de atribuir a causa à constante. Simetria geométrica não comprova
   equilíbrio de partida entre pessoas com habilidades diferentes.

As opções 5/20 HP e limites mínimo/máximo podem ser verificadas depois da rodada
base. Não misturar mudanças de HP, Map, Mana e velocidade no mesmo comparativo.

## 8. Ficha curta de cada partida

Copiar esta ficha por partida; deixar como não medido quando não houver dado.
Não inventar métricas de acerto que o HUD não disponibiliza.

```text
Partida/rodada:
Data e revisão da branch:
Participantes (e ordem de entrada):
Mode / Map / Theme:
Opções (HP, Pickups e limites):
Duração aproximada / motivo do fim:
Resultado ou Frags:
Mortes e situações difíceis:
Espera por Mana (curta, aceitável ou excessiva; exemplo):
Poção/Armor (usou? ajudou? não existe no Map?):
Respawn PvP (posição, orientação, voltou a morrer de imediato?):
Problema de rede/FPS que possa afetar a percepção:
O que ficou fácil/difícil e exemplo concreto:
```

## 9. Decisões e ajustes propostos

Nenhum valor alterado ou aprovado como final neste levantamento. A coluna
proposta será preenchida depois das partidas, preservando evidência antes/depois.
É permitido manter o valor quando os testes indicarem que ele funciona.

| Tema | Valor atual | Problema observado / partida | Proposta | Motivo | Revisão Roberto | Reteste |
|---|---|---|---|---|---|---|
| Movimento | 3,6 cél/s; corrida ×2 | Não avaliado | A definir | A definir | Pendente | Pendente |
| Tiro PvP | 2 HP; custo 20 Mana; regen 5/s | Não avaliado | A definir | A definir | Pendente | Pendente |
| Tiro coop | custo 10 Mana; regen 10/s | Não avaliado | A definir | A definir | Pendente | Pendente |
| Enemy | 1 HP/1,4 s; velocidade 1,5 | Não avaliado | A definir | A definir | Pendente | Pendente |
| Boss | 60 HP; bullet 2 HP; intervalo 2,2 s | Não avaliado | A definir | A definir | Pendente | Pendente |
| Recursos coop | poção 3 HP; Armor 3; Mana 30 | Não avaliado | A definir | A definir | Pendente | Pendente |
| Respawn PvP | 3 s; Spawn livre mais distante | Não avaliado | A definir | A definir | Pendente | Pendente |
| Limites PvP | 5 Frags / 180 s | Não avaliado | A definir | A definir | Pendente | Pendente |

## 10. Quando houver ajuste de código

Apresentar valor antigo, novo e motivo para Rafael aprovar a aplicação, conforme
AGENTS.md. Depois alterar juntos `rules.py`, `rules.ts` e `contracts/rules.md`.
Se mudar default/limite de RoomOptions, revisar também fonte da opção, schema,
contrato, formulário e traduções pertinentes com os respectivos donos.

O teste `frontend/game/src/rules.test.ts` compara TypeScript com a fixture
`mirror.json`, não diretamente com o Python. Se houver mudança, conferir a geração
correta da fixture existente e atualizá-la no mesmo PR; manter as expectativas
dos testes coerentes com a regra, sem enfraquecê-las para apenas obter verde.
O teste `backend/tests/game/test_rules.py` confere nomes do contrato; essa checagem
sozinha não comprova que os valores numéricos estão iguais.

Checks pertinentes após eventual mudança: regras, mirror, movimento, projéteis,
Boss, Pickups e Rulesets no backend; regras, Prediction e build/lint/testes do
frontend, conforme o alcance da alteração. Executar pelo fluxo do autor/CI,
sem Docker/curl ou suítes pelo agente sem solicitação.

## 11. Aceite e entrega

- [x] Inventário de valores atuais e Maps preparado.
- [x] Coerência estática Python/TypeScript/fixture conferida.
- [ ] Rodadas coop/PvP registradas.
- [ ] Problemas e valores mantidos/ajustados justificados.
- [ ] Revisão técnica do Roberto recebida.
- [ ] Reteste de alterações e checks pertinentes aprovados, se houver mudanças.

Esta é preparação da #203, não balanceamento concluído. Não atribuir resultados
a partidas que ainda não foram jogadas. Enviar o resumo das partidas ao Roberto
é tarefa do Rafael; nenhuma mensagem foi enviada pelo agente.

Primeiro commit documental sugerido, se quiser publicar a preparação:
`docs(game): prepara levantamento e playtest de balanceamento (F4.7)`.
Arquivo desta etapa: `docs/balanceamento-f4.7.md`. Não usar `Closes #203` antes de
concluir os aceites; um PR parcial deve usar `Refs #203`.
