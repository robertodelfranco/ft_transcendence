# F3.9 — Áudio · issue #153

## Primeira etapa: módulo e demonstração local

`frontend/game/src/audio/gameAudio.ts` expõe `createGameAudio()`. Passos,
tiro e acerto são sintetizados com osciladores e envelopes de volume;
a música é um motivo original simples em Lá menor. Não há arquivos externos
para baixar nem dependências novas. Os timbres são iniciais, sujeitos ao aceite
auditivo do Rafael.

`unlock()` cria e retoma o AudioContext a partir de uma interação explícita.
Os métodos de reprodução ficam silenciosos enquanto o contexto não estiver
rodando. Ganho geral: 0,3; teto de 32 vozes simultâneas. Cada voz encerra e
desconecta seus nós ao terminar. `stopMusic()` cancela o intervalo e as notas
musicais; `dispose()` também encerra efeitos, desconecta o ganho geral e fecha
o contexto. A música usa intervalo de 800 ms, adequado à demonstração inicial,
sem promessa de precisão musical durante suspensão da aba.

Em `/game/dev.html`, os controles permitem ouvir passo, tiro, acerto e alternar
música. Falha na ativação mostra mensagem traduzida pelo código
`audio_unavailable`. Os listeners e recursos são removidos no descarte da demo.

## Integração com a partida

`mountGame` cria o áudio por uma fábrica injetável. Clique no canvas ou tecla
válida de jogo ativa o contexto; digitação em campos não ativa. Música inicia
somente no estado `running`. Falha de ativação permite nova tentativa na próxima
interação, sem encerrar a Room nem transformar erro opcional em erro da partida.

Passos acumulam deslocamento do Player previsto enquanto há Input de movimento
(um som a cada 0,7 célula); imóvel, morto ou bloqueado por parede não acumula
passos. Saltos de pelo menos 0,5 célula por quadro e quadros acima de 0,2 s são
ignorados. Pequenas correções da Reconciliation ainda podem influenciar a cadência.

Tiro acompanha o envio da Action `fire` para Player vivo durante a partida:
é retorno sonoro da tentativa, não confirmação de disparo aceito. O protocolo
não possui Event de disparo aceito; Mana/cooldown continuam decididos no servidor.
`player_hit` toca somente quando o Player local é alvo ou autor confirmado.

`game_over`, desconexão, erro e aba oculta interrompem música/efeitos via
`stopAll()`. Ao voltar à aba ou receber welcome de Reconnection, música pode
retomar se o contexto estiver ativo. Unmount remove listeners e fecha o áudio.
O Renderer permanece responsável apenas pelo desenho.

A #153 ainda exige validação auditiva em partida real, incluindo navegação entre
Rooms e console limpo. O aceite auditivo da demo foi informado pelo Rafael.

## Validação pelo autor

Após a integração, build e lint passaram. O build emite aviso de chunk acima de
500 kB. Os 18 testes de `mount.test.ts` passaram com
`npm test -- --project=game game/src/mount.test.ts --pool=threads --maxWorkers=1`.
Incluem ativação por interação, filtro de acertos, encerramento e falha/retry de
áudio. A suíte completa não terminou: execuções sem resultado foram interrompidas,
inclusive com um worker e com pool threads. Não há aceite da suíte completa.
Não houve conferência auditiva da integração pelo agente.

1. Em `frontend/`, executar `npm run build` e `npm run lint`.
2. Abrir a demo e confirmar silêncio antes da primeira interação.
3. Ouvir cada efeito e alternar a música repetidamente, sem sobreposição de loops.
4. Conferir console, alternância de aba e descarte/reabertura da página.
5. Ajustar volume e timbres após avaliação auditiva.

## Entrega sugerida

Arquivos no mesmo commit/PR: `gameAudio.ts`, `dev.ts`, `mount.ts`,
`mount.test.ts` e este documento.
Mensagem: `feat(game): integrate synthesized audio with match lifecycle (#153)`.
Corpo do PR final: `Closes #153`, após os aceites manuais.
