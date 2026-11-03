# F3.7 — Feedback visual do Player (#194)

## Estado

Implementação aplicada. Rafael confirmou nesta sessão o funcionamento dos
efeitos na demo e, após o roteiro de comandos, confirmou funcionamento de
build, lint e testes do projeto game. Integração em partida real ainda aguarda
confirmação; redução de movimento e descarte não foram confirmados
individualmente no navegador. A #194 está isolada no worktree
`/tmp/catacombs42-efeitos-194`, branch `194-efeitos-player`. A #192 permanece
no diretório original. Base: `022cb09`, sem depender da #190.

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

## Validação pendente

Foram adicionados testes do estado visual, do overlay e da integração no mount:

acerto remoto não aciona efeito local; dano absorvido tem feedback; Snapshot de
respawn limpa morte; reconexão não inventa transiente; término e unmount limpam
recursos. Conferir demo, redução de movimento, visibilidade no coop e kill feed
em PvP. Nenhum teste ou navegador foi executado nesta etapa.


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
Um PR separado para #194. Não fechar a issue antes da validação dos efeitos
no navegador e do kill feed existente em PvP. Sem commit, push ou PR pelo agente.


## Retorno da validação da demo

Rafael confirmou que os efeitos da demonstração estão corretos após conferir o
comportamento do botão Morrer. Esse retorno não é apresentado como evidência de
partida PvP real, redução de movimento ou medição de recursos. Esses aceites
permanecem pendentes. Em retorno posterior ao roteiro de comandos, Rafael
confirmou funcionamento de `npm run build`, `npm run lint` e
`npm test -- --project game`; não foram fornecidos contadores de testes.
A suíte shell completa não está incluída nessa confirmação.
