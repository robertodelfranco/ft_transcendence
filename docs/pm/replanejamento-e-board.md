# Replanejamento e board — proposta do PM

> Proposta do Akita (PM / Scrum Master) para a reunião de **04/10/2026**. Substitui as seções 3 e 6 do [plano de tarefas](../catacombs42-plano-de-tarefas.md) se o time aprovar; até lá, é proposta. O escopo de 21 pontos não muda, e a ordem dos checkpoints C1–C5 não muda.

## 1. Onde nós estamos de verdade

O plano original começava em 27/09 e colocava o C1 em 02/10, com login pelo Nginx, parser verde, masmorra em 3D e casca React em 3 idiomas. Hoje, 04/10:

- Os **contratos** estão saindo agora (`ws-messages.md`, `map-format.md`, `rules.md`, `snapshot.example.json`, `rooms.md`, `matches-api.md`, `infra.md`). Era F0.2, tarefa de S1.
- **Nenhuma linha de código de produto existe.** O repo tem o compose embrionário, um `main.py` de duas rotas, um `index.html` de placeholder e dois workflows.
- Os commits são de uma pessoa só.

Ou seja: a S1 não terminou, ela está terminando **agora**. Esconder isso num calendário que diz "S2" não muda o trabalho que falta. O replanejamento parte de uma semana a mais já consumida.

## 2. Calendário proposto

Semana de domingo a sábado, checkpoint na sexta. A defesa vai de **07/11 para 21/11** — duas semanas, alocadas onde o risco está, não distribuídas igualmente.

| Semana | Datas | Tema | Checkpoint |
|---|---|---|---|
| **S1** | 27/09 – 10/10 *(duas semanas)* | Fundação e contratos | **C1 · sex 09/10** — login pelo Nginx com cadeado; teste do carregador de Map verde; masmorra em 3D no `dev.html`; casca React com seletor de 3 idiomas |
| **S2** | 11/10 – 17/10 | Um jogador de ponta a ponta | **C2 · sex 16/10** — um player entra pelo lobby, cria a Room e anda em 3D com movimento decidido pelo servidor, via `wss://` |
| **S3** | 18/10 – 24/10 | Multiplayer, prediction, PvP | **C3 · sex 23/10** — duas máquinas jogam co-op até o boss morrer com prediction ligada; Match gravado; PvP 1v1 jogável |
| **S4** | 25/10 – 31/10 | Módulos novos | **C4 · sex 30/10** — reconexão funciona; Grafana com login mostra os dashboards; opções e temas mudam o jogo; estatísticas, level, ranking e conquistas reais; login pela 42 |
| **S5** | 01/11 – 14/11 *(duas semanas)* | Completar e polir | **C5 · sex 13/11** — todo módulo da seção 7 do plano demonstrável de ponta a ponta, nos 3 idiomas, com console limpo, nas máquinas da demo. **Freeze no sábado, 14/11** |
| **S6** | 15/11 – 21/11 | Bugs, README, ensaio | README fechado em **18/11**; ensaio (F9.2) em 19–20/11; **defesa sáb 21/11** |

Por que as duas semanas extras vão onde vão:

- **A primeira já foi gasta.** Ela não é folga nova, é o reconhecimento de que a S1 levou duas semanas. Fingir o contrário só empurra o atraso para a S2, que é a semana do caminho crítico (Room runtime + WebSocket).
- **A segunda vai para a S5**, porque é lá que o plano §8.1 admite que a conta não fecha: ≈113 dias-pessoa de tarefa contra 85–100 dias reais de capacidade. A S5 é a semana que decide quais módulos entram no README, e um módulo pela metade vale zero. Dar folga à S5 é dar folga à nota.
- **S2, S3 e S4 continuam de uma semana.** São as semanas com checkpoint de integração; esticá-las adia a descoberta dos bugs de integração, que é exatamente o que não se quer adiar.

**A conferir antes de prometer 21/11:** o prazo real do `ft_transcendence` na intra da 42. Se a intra não permitir 21/11, o cenário alternativo é manter 07/11 e acionar a ordem de corte do plano §8.3 — i18n sai primeiro (20 pts), depois Game statistics (19), depois Monitoring (17); os 14 do fundo não são cortáveis. **Essa decisão é da reunião, com o prazo da intra na tela.**

### Regra do freeze

Depois do sábado 14/11, só entra correção de bug, texto e tradução. Módulo que não passou em C5 sai do README.

## 3. Formato das issues no board

Board: GitHub Projects nº 3, owner `robertodelfranco`. O workflow em `.github/workflows/main.yml` move o card sozinho — mas **só com `Closes #<nº>` no corpo do PR**.

### Título

`F5.3 · record_match_result idempotente`

ID do plano, ponto médio, descrição curta no imperativo. O ID no título é o que liga a issue ao plano, ao contrato e à conversa na defesa.

### Corpo

```markdown
## Contexto
Duas linhas: por que essa tarefa existe e o que ela destrava.

## Pronto quando
Copiado do plano §5, sem reescrever. É o critério de aceite do PR.

## Contrato
docs/contracts/rooms.md §2.5

## Dependências
Blocked by #42   (ou "nenhuma")

## Onde olhar
arq. §10.1; doc do SQLAlchemy sobre FOR UPDATE
```

Nada de checklist inventado: o "pronto quando" do plano já é o critério. Se ele não serve, o problema é o plano, e a correção é um PR no plano.

### Labels

| Grupo | Valores |
|---|---|
| Slice | `slice-1` … `slice-5` (quem é dono) |
| Frente | `F0` … `F9` |
| Semana | `S1` … `S6` (quando termina) |
| Tipo | `bloqueante` (está no caminho crítico), `contrato` (muda interface entre Slices) |

Label de prioridade não existe: a semana **é** a prioridade.

### Branch e PR

- Branch: `<nº-issue>-<slug>` — `43-record-match-result`.
- PR: `Closes #43` no corpo, obrigatório. Sem isso o card não se move e a issue não fecha.
- PR que muda contrato muda o arquivo de contrato **no mesmo PR** e cita o número do contrato (arq. §13).
- Revisão por dono de área: **schema de partidas e estatísticas → Akita**; **usuários e tokens → Augusto**; **`rules.*`, `sim.py` e `applyInput.ts` → Roberto**; **`infra.md` e compose → Akita**. Tabela nova no banco não entra sem a revisão do dono do schema.

### Colunas

`Backlog → Ready → In Progress → In Review → Done`, mais `Failed` (o workflow usa esse nome quando um PR é fechado sem merge). Uma issue entra em `Ready` quando as dependências dela estão em `Done` e o contrato que ela cita está na `main`.

## 4. Ritos

| Quando | O quê |
|---|---|
| **Segunda** | Reunião: o que fechou, o que travou, o que muda no plano. Cada blocker sai com dono e data. Checkpoint não fechado na sexta é o primeiro assunto. |
| **Sexta** | Checkpoint: demo de integração com todo mundo na chamada e o critério observável da seção 2 na tela. Não é "mostrar o que fiz", é "rodar junto". |
| **A qualquer momento** | Tarefa passando 50 % da estimativa vira assunto de reunião, não de madrugada (plano §8.1). Avisar cedo não é falha; chegar na sexta sem avisar é. |
| **Todo PR** | CI verde, `Closes #`, revisão do dono da área. |

### O que eu, como PM, mantenho atualizado

1. Este arquivo, quando o calendário mudar.
2. A tabela de dependências do [caminho-5-akita.md](../slices/caminho-5-akita.md) §3 — e cobrar as dos outros.
3. O board: nenhuma issue em `In Progress` sem dono, nenhuma em `Ready` com dependência aberta.
4. A ordem de corte: se C4 (30/10) falhar em algum módulo, a decisão de cortar é tomada ali, com a tabela do plano §8.3, e o módulo sai do README na hora — não na véspera da defesa.

## 5. O que eu levo para a reunião de 04/10

| Item | Estado |
|---|---|
| [rooms.md](../contracts/rooms.md), [matches-api.md](../contracts/matches-api.md), [infra.md](../contracts/infra.md) | rascunho completo, com "Em aberto" preenchido |
| As 8 perguntas do meu briefing | respondidas nos contratos; a 8 (intra da 42) depende de eu cadastrar o app hoje |
| Calendário S1–S6 e defesa em 21/11 | esta proposta, com o cenário alternativo de 07/11 |
| Formato de issue, branch, PR, labels e colunas | seção 3 |
| Contratos que eu assino | [ws-manager.md](../contracts/ws-manager.md), [room-options.md](../contracts/room-options.md), [auth.md](../contracts/auth.md) — leio como consumidor e digo se consigo trabalhar só com eles |

Depois da reunião: cada "Em aberto" sai com decisão ou com dono e data; eu crio as issues de S1 e S2 da Slice 5 (F0.6) e abro as colunas do board.

---

> **Links para contratos que ainda não existem:** `auth.md` e `ws-manager.md` (Augusto), `room-options.md` (Rafael) — rascunhos esperados na reunião de 04/10.
