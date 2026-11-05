# Teste de aceite da F2.12: rede ruim (100 ms + 2 % de perda, 5 min)

> Fecha o "Pronto quando" da F2.12 (módulo **Remote players**, 2 pts): *resultado do teste com throttling anotado*. O PR #184 foi mergeado com o campo "Resultado" em branco; este documento é o registro.
>
> **Estado:** executado em 04/11 (Augusto), num PC só, com dois navegadores. Passou: RTT de ~110 ms sob degradação, reconexão em 22 s com o estado mantido, console sem nenhum warning. Falta a conferência visual do movimento com duas pessoas jogando (ver "Pendências").

## Método

### Por que `tc netem` e não o DevTools

O throttling da aba Network do Chrome **não se aplica a WebSocket** e não tem perda de pacote: com ele ligado, o RTT da HUD ficaria em poucos ms e o teste não provaria nada. A degradação foi imposta na rede, com `tc netem`.

### Onde o netem foi aplicado

Na interface `eth0` do **container do `proxy`**, a partir de um container auxiliar que compartilha a rede dele. Não precisa de `sudo` no host e só degrada o tráfego da stack:

```bash
docker run --rm --network container:ft_transcendence-proxy-1 --cap-add NET_ADMIN alpine \
  sh -c "apk add -q iproute2-tc && tc qdisc add dev eth0 root netem delay 50ms loss 1%"
# desligar: o mesmo comando com "tc qdisc del dev eth0 root"
```

O netem age na **saída** da `eth0` do proxy, e cada mensagem do jogo passa por ela duas vezes na ida e volta:

```
navegador → proxy → backend   (sai do proxy: +50 ms, 1 % de perda)
backend → proxy → navegador   (sai do proxy: +50 ms, 1 % de perda)
```

Total: **+100 ms de RTT e ≈ 2 % de perda**. O WebSocket roda sobre TCP: a perda aparece como **picos de RTT** (retransmissão), não como mensagem perdida, e é por isso que a HUD mostra o RTT cru, sem média (PR #184).

### Os dois Players

Script Playwright (Chrome 155 headless, WebGL por software) com **um navegador por Player**:

1. cria duas contas pela API, uma Room de co-op no `dungeon_map`, os dois entram, marcam pronto e o A inicia;
2. abre `/play/<id>` nos dois, mede 10 s de linha de base, liga o netem;
3. por 5 min, os dois andam (W com giros, tiro de vez em quando), e a HUD dos dois é lida a cada segundo (Ping, HP, chaves, lista de Players);
4. aos 2 min 30 s, fecha a aba do B, confere a HUD do A, reabre `/play/<id>` no B e compara;
5. desliga o netem; todo `console.warning`, `console.error`, `pageerror` e request falha dos dois é registrado; os dois clientes são gravados em vídeo.

> **Um navegador por Player, não dois contextos no mesmo.** Na primeira tentativa, com os dois Players no mesmo Chrome headless, a aba reaberta do B ficava 60 s sem abrir o `/ws/game`, passava do Grace period e era recusada com `not_a_member`. A causa era do teste: com WebGL por software, os dois clientes dividem um processo de GPU, e o A renderizando sem parar trava a criação do contexto WebGL do B (o `createRenderer` roda antes do socket, `mount.ts`). Sem netem acontecia igual. Com dois navegadores, a mesma reabertura volta em ~3 s. Em PCs separados, como na demo, isso não acontece.

## Resultado (04/11)

| Item | Resultado |
|---|---|
| Ambiente | 1 PC (Pop!_OS), stack local com Docker 29.9, Chrome 155 headless, 2 navegadores; partida 7, co-op, `dungeon_map` |
| RTT sem netem (10 s) | 24–100 ms, um pico de 560 ms. Ruído do próprio PC: dois Chromes renderizando WebGL por software |
| RTT sob netem, 5 min, 245 amostras por Player | **B:** mín 36 · mediana **111** · p90 146 · p99 366 · máx 498 ms · **A:** mín 30 · mediana **114** · p90 154 · p99 289 · máx 315 ms |
| Picos (> 200 ms) | B: 6 de 245 amostras; A: 8 de 245. São as retransmissões da perda, como esperado |
| RTT ausente na HUD | nenhuma amostra (o Ping nunca voltou a `—` fora da reconexão) |
| Reconexão (F2.10) | aba do B fechada aos 150 s e reaberta **22,4 s** depois (dentro dos 30 s). Durante a queda, a HUD do A mostra o B como `disconnected`; depois, de volta e sem o rótulo. HUD do B no ar ~4 s depois do `goto`, com o primeiro RTT de 488 ms (o pico logo depois de reabrir) |
| HP e chaves depois da reconexão | iguais aos de antes (`10/10`, `0`). Ressalva: o B não tinha tomado dano nem pegado chave, então a comparação é fraca (ver "Pendências") |
| Console do Chrome (A e B, 5 min) | **0** warnings, **0** erros, **0** `pageerror`, **0** requests falhas |
| Evidência | `result.json` com as 245 amostras e os vídeos dos dois clientes (B em dois arquivos, antes e depois da reconexão) |

## Pendências

- **Conferência visual da Interpolation e da Reconciliation:** os vídeos desta rodada **não servem** para isso. Conferidos em 04/11 (um quadro a cada 8 s do B): o Player automático passa a maior parte do tempo encostado numa parede, e o A só aparece ao longe, em poucos quadros. Falta uma rodada curta com duas pessoas jogando (2–3 min, netem ligado, uma olhando a outra andar e virar), para ver se o outro Player desliza sem saltos e se o próprio movimento tem correções visíveis.
- **HP e chaves numa reconexão com o estado mudado:** repetir com o B pegando uma chave ou tomando dano antes de fechar a aba. Os testes automatizados da F2.10 já cobrem isso no servidor. Este item é só a prova pelo navegador.
- **Dois PCs com degradação:** este teste rodou num PC só, e o critério do Remote players (plano §7) pede duas máquinas, throttling de 100 ms, nenhum teleporte visível e uma aba fechada e reaberta no meio. O teste de 01/11 na 42 ([resultados](resultados-teste-pc-42-2026-10-17.md#pendente-2º-pc), D8) cobriu os dois PCs e a reconexão, mas sem degradação. Falta uma rodada de 5 min no cluster que junte as duas coisas, com o netem do "Método" ligado no proxy do PC que serve a stack. Esse netem degrada os dois clientes, mais do que o critério pede. A mesma rodada serve para a conferência visual do primeiro item.

## Se algo falhar ao repetir

| Sintoma | Provável causa |
|---|---|
| RTT não sobe | o netem não pegou: `tc qdisc show dev eth0` no container auxiliar deve listar `netem` |
| Aba reaberta não volta e recebe `not_a_member` | passou do Grace period de 30 s; com dois Players no mesmo navegador headless, ver o aviso em "Os dois Players" |
| HUD sem RTT | `welcome` não chegou; ver Network → WS |
| Warning no console | anote a mensagem exata; é critério de rejeição, vira bug |
