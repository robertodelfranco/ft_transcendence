# F4.4 — Dois Maps PvP (#197)

## Estado

Os dois Maps estão na `main` desde 03/11 (#198). Em 05/11 passaram pela
validação em partida real, com uma ressalva: na Encruzilhada, os Spawns em
diagonal têm linha de tiro livre entre si
([Resultado da validação](#resultado-da-validação-05112026)).

## Regras existentes conferidas

- `world.py` exige pelo menos dois Spawns no PvP, não quatro. O formato e os
  checks existentes continuam iguais. Map não pode conter Enemy nem Boss.
- O catálogo em `matches/service.py` carrega os `.txt` por Mode em ordem
  alfabética no startup. Adicionar Maps não exige alterar endpoint ou formulário.
- `PvpRuleset` escolhe o Spawn livre mais distante dos adversários vivos por
  distância euclidiana. Um Spawn ocupado é descartado; sem Spawn livre, aguarda.
- O enésimo participante nasce no enésimo Spawn, em ordem de leitura.
- `room-options.md` ainda deixa em aberto conteúdo e quantidade de Spawns PvP.
  Os quatro Spawns abaixo são escolha desta proposta, não mínimo novo do parser.

## Escolhas propostas para revisão do Roberto

Dois Maps pequenos, simétricos nos obstáculos e nas condições dos Players.
Quatro Spawns por Map, com os dois primeiros refletidos esquerda/direita na mesma
linha; os dois restantes oferecem alternativas para respawn. As orientações
iniciais E/W também são refletidas. Paredes interrompem o tiro direto entre os
Spawns iniciais. Não há promessa de proteção contra spawn camping: distância
não verifica linha de visão; esse ponto precisa de playtest.

Sem Door, chave, Enemy, Boss ou Pickup nesta primeira versão. Não introduzir regras
novas ou mudar valores de `rules.*`. Pickups podem ser acrescentados de forma
simétrica após a revisão; as opções existentes continuam válidas, mas não criam
Pickups onde o arquivo não os contém. Ambos os Maps podem usar qualquer Theme.

### pvp_crossroads — Encruzilhada (17 × 13)

Dois obstáculos centrais ligados às bordas e duas coberturas laterais deixam
passagens transversais. Proposta de Spawns em células (x,y): (2,2) E, (14,2) W,
(2,10) E e (14,10) W. Os centros recebidos pelo jogo somam 0,5 a cada coordenada.

```text
11111111111111111
10000001110000001
10E00001110000W01
10000001110000001
10T00001110000T01
10000000000000001
10011100000111001
10000000000000001
10T00001110000T01
10000001110000001
10E00001110000W01
10000001110000001
11111111111111111
```

### pvp_ring — Anel (21 × 15)

Uma ilha central e coberturas laterais formam caminhos ao redor do centro, com
mais espaço para desvio. Proposta de Spawns: (2,2) E, (18,2) W, (2,12) E e
(18,12) W. As quatro tochas são simétricas em relação ao eixo vertical que troca
os Players iniciais; não são Pickups e não mudam a colisão.

```text
111111111111111111111
100000000010000000001
10E00000T010T00000W01
100000000010000000001
100111100000001111001
100000000111000000001
100000000111000000001
1000T00001110000T0001
100000000111000000001
100000000111000000001
100111100000001111001
100000000010000000001
10E000000010000000W01
100000000010000000001
111111111111111111111
```

### Nomes para a Web

| Chave | pt-BR | en | es |
|---|---|---|---|
| `pvp_crossroads` | Encruzilhada | Crossroads | Encrucijada |
| `pvp_ring` | Anel | Ring | Anillo |

Nomes adicionados em `game.maps` dos três catálogos, sem string literal no JSX.
O código do catálogo e os defaults de opções permanecem iguais.

## Roteiro de validação

1. Rodar o teste existente `backend/tests/game/test_world.py`, que percorre os
   Maps reais, e os testes pertinentes de catálogo e PvP.
2. Conferir conectividade de todas as células livres, simetria esquerda/direita
   com E/W refletidos, número de Spawns e ausência de diagonal proibida. Os checks
   atuais do carregador não comprovam conectividade nem equilíbrio.
3. Recriar backend para que o catálogo do startup inclua os Maps. Pelo lobby,
   selecionar PvP e conferir os dois nomes traduzidos e a capacidade de dois Players.
4. Fazer playtest 1v1 em cada Map, trocando a ordem de entrada dos Players.
   Observar caminhos, orientação, cobertura e respawn próximo a parede/adversário.
5. Conferir respawn nos quatro pontos ao longo das partidas, console limpo e ambos
   os Themes após o merge da #190. Registrar desequilíbrios antes de fechar a issue.

## Resultado da validação (05/11/2026)

Rodado pelo Claude a pedido do Roberto, na `main` em `22b623d`, numa stack
isolada (Compose com projeto e banco próprios). Um Player joga no Chrome 156
headless com GPU. Os outros são bots que falam o protocolo do `/ws/game` e caçam
o adversário pelo caminho mais curto. O item 1 do roteiro já tinha passado no
#198 (42 testes, segundo o PR).

### Os arquivos

| Map | Borda fechada | Células livres ligadas | Espelhado (E↔W) | Spawn preso |
|---|---|---|---|---|
| Encruzilhada | sim | 135 de 135 | sim, e também cima/baixo | nenhum: os 4 têm 4 vizinhos livres e a célula da frente livre |
| Anel | sim | 210 de 210 | sim | nenhum: os 4 têm 4 vizinhos livres e a célula da frente livre |

Distância entre os Spawns, de centro a centro:

| Par | Encruzilhada | Anel |
|---|---|---|
| 1–2, os iniciais | 12,0 cél; 18 passos; parede no meio | 16,0 cél; 20 passos; parede no meio |
| 1–3 e 2–4, mesmo lado | 8,0 cél; 8 passos; linha de tiro livre | 10,0 cél; 10 passos; linha de tiro livre |
| 1–4 e 2–3, diagonais | 14,4 cél; 20 passos; **linha de tiro livre** | 18,9 cél; 26 passos; parede no meio |

### As partidas

- **Pelo lobby:** a partida PvP foi criada no formulário (Mode PvP, Map
  Encruzilhada, opções no default), entre o Player do navegador e um bot.
  Terminou por `frag_limit`, com a tela "Derrota" para quem perdeu. Console sem
  warnings nem erros.
- **Entre bots:** oito partidas (`start_hp` 5, `frag_limit` 6), os dois Maps nas
  duas ordens de entrada. Primeiro com bots iguais, depois com um deles atirando
  mais devagar. Todas terminaram por `frag_limit`.
- **Spawn inicial:** quem entra primeiro nasce no Spawn 1, e o segundo no 2, nas
  duas ordens.
- **Respawn:** nas partidas com bots diferentes, 28 respawns com o adversário
  vivo, todos no Spawn livre mais distante dele, como manda `rules.md`. Ninguém
  ficou preso depois de renascer. O Anel usou os 4 Spawns; a Encruzilhada, só o 1 e o 4.
- **Nomes:** Encruzilhada, Crossroads e Encrucijada; Anel, Ring e Anillo, nos
  três catálogos.

### Ressalva: as diagonais da Encruzilhada

Os Spawns 1↔4 e 2↔3 se enxergam a 14,4 células. O respawn manda para o Spawn
mais distante do adversário, que quase sempre é a diagonal de onde ele está.
Depois de uma morte dupla (os dois morrem no mesmo Tick), os dois renascem em 1
e 4, já na linha de tiro um do outro. No Anel, as diagonais têm parede no meio.
Decidir no playtest da F4.7: fechar a diagonal com parede, ou manter e registrar
o motivo.

### Fora desta validação

- Os Maps PvP só rodaram com o Theme dungeon. O sewer foi conferido num Map
  co-op; o Theme muda só o cliente, sem tocar no Grid.
- O equilíbrio de cobertura e de ritmo com pessoas jogando fica para a F4.7.
- Em 3 das 8 partidas, os dois chegaram ao `frag_limit` no mesmo Tick (6 a 6), e
  o anfitrião levou a vitória: `PvpRuleset.check_end` devolve o primeiro Player
  que atingiu o limite. É da F1.8; o Roberto corrige.

## Revisão e aceite

Rafael propõe os layouts; Roberto revisa Spawns, ausência de Doors/Pickups e
comportamento de respawn. Akita e Caio conferem a integração do catálogo/lobby.
O roteiro rodou em 05/11, a pedido do Roberto: a integração com o catálogo e o
lobby funcionou, e o respawn segue a regra nos dois Maps. Fica aberta a ressalva
das diagonais. Não marcar decisões em aberto dos contratos como aprovadas com
base nesta proposta.


## Entrega

Um commit sugerido: `feat(maps): adiciona dois Maps PvP simétricos (F4.4)`.
Arquivos:

- `backend/maps/pvp/pvp_crossroads.txt`;
- `backend/maps/pvp/pvp_ring.txt`;
- `frontend/src/locales/pt-BR/game.json`;
- `frontend/src/locales/en/game.json`;
- `frontend/src/locales/es/game.json`;
- `docs/maps-pvp-f4.4.md`.

Os Maps entraram pelo #198, com `Refs #197`. A #197 fecha no PR que traz o
resultado de 05/11, com `Closes #197`.
