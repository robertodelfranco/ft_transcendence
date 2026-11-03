# F4.4 — Dois Maps PvP (#197)

## Estado

Layouts e nomes traduzidos aplicados com autorização do Rafael. Validação
local, revisão do Roberto e playtest 1v1 ainda pendentes.
Worktree: `/tmp/catacombs42-maps-197`, branch `197-maps-pvp`, base `022cb09`.
A #192 permanece intacta no diretório original. Sem commit, push ou PR pelo agente.

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

## Validação local pendente

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

Nenhum teste, build, Docker ou navegador foi executado nesta etapa.

## Revisão e aceite

Rafael propõe os layouts; Roberto revisa Spawns, ausência de Doors/Pickups e
comportamento de respawn. Akita e Caio conferem a integração do catálogo/lobby.
Aceites ainda não recebidos. Não marcar decisões em aberto dos contratos como
aprovadas com base nesta proposta.


## Entrega

Um commit sugerido: `feat(maps): adiciona dois Maps PvP simétricos (F4.4)`.
Arquivos:

- `backend/maps/pvp/pvp_crossroads.txt`;
- `backend/maps/pvp/pvp_ring.txt`;
- `frontend/src/locales/pt-BR/game.json`;
- `frontend/src/locales/en/game.json`;
- `frontend/src/locales/es/game.json`;
- `docs/maps-pvp-f4.4.md`.

PR separado da #192, usando `Refs #197` enquanto os aceites estiverem pendentes;
substituir por `Closes #197` quando validação e revisão estiverem concluídas.
Os testes existentes e o playtest são do autor. O agente não executou comandos
de validação nesta aplicação e não fez commit, push ou abriu PR.
