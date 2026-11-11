# F3.7 — Feedback visual do Player (#194)

## Estado

Na `main` desde 03/11 (#196). Em 05/11 passou pela validação em partida real:
dano, morte e respawn no PvP, kill feed, redução de movimento e morte no co-op
([Resultado em partida real](#resultado-em-partida-real-05112026)). Absorção por
Armor, acerto dado em outro Player e reconexão não foram vistos em partida; estão
cobertos pelos testes do `mount.test.ts`. As dez entradas e saídas de Room sem
listener acumulado foram medidas na F3.10, com esta entrega já na base
([performance-f3.10.md](performance-f3.10.md)).

## O que já existe

- Enemy e Boss possuem clipes de morte no Renderer.
- A HUD possui mensagens distintas para morte coop e espera de respawn PvP.
- `mount.ts` repassa `player_died` ao kill feed e a HUD mostra até cinco registros.
- A câmera acompanha um companheiro vivo quando o Player local morre no coop.

## Comportamento implementado

- Dano recebido: borda vermelha discreta e breve, sem tremer a câmera nem cobrir
  o centro. Ativar apenas por `player_hit.target` igual ao id local, incluindo
  acerto absorvido por Armor (`amount + absorbed > 0`). Não ativar por causar dano
  em outro Player. Acertos próximos renovam 220 ms de efeito, sem acumular brilho.
  Opacidade máxima: dano 0,30, morte 0,22 e retorno 0,15; centro transparente.
- Morte: borda escura estática, sem tela opaca. Preservar a visão do companheiro
  no coop e a leitura da HUD. Estado vem exclusivamente de `alive` nos Snapshots;
  `player_died` continua abastecendo o feed, sem antecipar a borda de morte.
- Respawn: retirar a borda de morte quando o Snapshot autoritativo trouxer o
  Player local vivo. No PvP, uma borda verde de 350 ms indica o retorno; não usar
  oscilação nem um Event para modificar posição ou HP.
- Preferência de redução de movimento: desativar transientes de dano/respawn;
  manter apenas a borda estática de morte e os avisos existentes da HUD.
- Desconexão, erro, término e desmontagem: cancelar os transientes. No welcome
  de reconexão, reconstruir o estado a partir do Snapshot, sem inventar um acerto
  ou um respawn durante o intervalo sem conexão.
- O Renderer recebe somente dados visuais derivados em ViewState, sem socket.
  Não mudar `HudState`, protocolo, regras, textos ou cores dos Themes.
- Implementar overlay do Renderer sem texto, após cena e mão. Liberar materiais,
  geometria e listener de preferência junto com o ciclo de vida do Renderer.
- Demo: controles traduzidos pt-BR/en/es para dano, morte e respawn sintéticos,
  separados das Actions reais; não alterar a cena de carga da #192.

## Testes automatizados

Testes do estado visual, do overlay e da integração no mount cobrem: acerto
remoto não aciona efeito local; dano absorvido tem feedback; Snapshot de respawn
limpa morte; reconexão não inventa transiente; término e unmount limpam recursos.


## Como validar a demo

1. No terminal, entrar em `/tmp/catacombs42-efeitos-194/frontend` e rodar
   `npm run dev` com as dependências instaladas nesse worktree.
2. Abrir `/game/dev.html` na porta informada pelo Vite. Usar os novos botões
   Receber dano, Morrer e Renascer. Eles simulam somente os efeitos; não são uma
   partida real, e o estado da demonstração aparece em texto DOM traduzido.
3. Dano deve desaparecer sozinho; clicar várias vezes não soma a intensidade.
   Depois de Morrer, Receber dano não aciona efeito; Renascer limpa a borda escura.
4. No Chrome, DevTools → More tools → Rendering → Emulate CSS media feature
   prefers-reduced-motion: reduce. Conferir ausência das bordas transitórias,
   mantendo a borda estática de morte. Repetir a alteração com a página aberta.
5. Conferir console sem warnings/erros, resize e centro da cena desobstruído.
6. Rodar build, lint e testes pelo fluxo do projeto. Os testes novos pertencem
   ao projeto `game`; a base desta branch ainda contém a colisão de nomes da HUD
   no Mac, já corrigida separadamente na #190, que afeta o projeto `shell`.
7. Na partida real, conferir dano local/remoto, absorção por Armor, morte coop
   com câmera no companheiro, respawn PvP, reconexão e dez entradas/saídas sem
   listeners de preferência acumulados. Conferir o feed existente em PvP.

## Arquivos e entrega

Um commit sugerido: `feat(game): adiciona feedback visual de dano e respawn (F3.7)`.
Incluir `frontend/game/dev.ts`, `frontend/game/src/mount.ts`,
`frontend/game/src/mount.test.ts`, `frontend/game/src/render/renderer.ts`,
os quatro arquivos `playerFeedback*` em `frontend/game/src/render/`,
`docs/contracts/mount-game.md` e este documento.
Entrou pelo #196, com `Refs #194`. A #194 fecha no PR que traz o resultado de
05/11, com `Closes #194`.


## Retorno da validação da demo

Rafael confirmou que os efeitos da demonstração estão corretos após conferir o
comportamento do botão Morrer. Esse retorno não é apresentado como evidência de
partida PvP real, redução de movimento ou medição de recursos. Esses aceites
permanecem pendentes. Em retorno posterior ao roteiro de comandos, Rafael
confirmou funcionamento de `npm run build`, `npm run lint` e
`npm test -- --project game`; não foram fornecidos contadores de testes.
A suíte shell completa não está incluída nessa confirmação.

## Resultado em partida real (05/11/2026)

Rodado pelo Claude a pedido do Roberto, na `main` em `22b623d`, numa stack
isolada. O Player local é o cliente real no Chrome 156 headless com GPU, a
1280×720; o outro é um bot que caça e atira pelo protocolo do `/ws/game`. Cada
captura sai quando o Event chega ao socket do próprio navegador, de 90 a 170 ms
depois. A cor é medida em duas faixas laterais (3% da largura, meia altura) e
comparada com uma captura anterior, com o Player parado no mesmo lugar.

| Critério da #194 | Resultado | O que foi medido |
|---|---|---|
| Acerto recebido tem feedback | passou | 10 acertos no PvP: borda vermelha em 8 (o vermelho das faixas sobe de 28 a 38 pontos). Os outros 2 foram o tiro que matou, e mostram a borda de morte. No co-op, 3 acertos de Enemy com a mesma borda |
| Morte e respawn não deixam efeito preso | passou | a morte escurece as faixas de 19% a 21% e mostra "Você morreu. Aguardando respawn."; 0,9 s depois do respawn, borda e aviso tinham sumido nas 4 vezes |
| Retorno no PvP | passou | flash verde logo após o respawn, que some em 0,9 s |
| Coop não apresenta respawn | passou | no Map `enemy`, Theme sewer, o Player morreu para os Enemies: "Você morreu. Aguardando o fim da partida.", nenhum `player_respawned`, e a câmera passou para a visão do companheiro vivo |
| Kill feed no PvP | passou | uma linha "X fez um Frag em Y" a cada morte, até as 5 do limite |
| Redução de movimento | passou | ligada com a página aberta, depois da 2ª morte: 15 acertos sem vermelho (variação de −5 a +5 pontos), 3 respawns sem flash e a borda de morte mantida (−20%) |
| Textos na HUD pelo i18n | passou em pt-BR | os avisos e o feed exibidos são os de `hud.death.*` e `hud.feed.frag` |
| Console sem warnings ou erros | passou | nenhum nas duas sessões, incluindo a saída da partida pelo link do topo |

**Na morte que decide a partida, não há borda de morte.** Depois do `game_over`,
o `mount.ts` para de passar o feedback ao Renderer (`showingFeedback`). Até a
tela de resultado, que espera `BOSS_DYING_S` (1,2 s), a HUD ainda mostra
"Aguardando respawn.". Vale decidir com o Caio se a HUD troca o aviso já no
`game_over`.
