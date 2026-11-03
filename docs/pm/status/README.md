# Status do projeto (reunião de segunda)

Página executiva para a reunião semanal: onde estamos contra o plano, por membro e no total, se terminamos a tempo, e o que cada um precisa destravar na semana. Não é pauta técnica nem lugar de decisão; isso fica em `docs/pm/reuniao-*.md`.

Abra `index.html` no navegador (é um arquivo só, sem servidor e sem internet).

## Arquivos

| Arquivo | O que é | Quem mexe |
|---|---|---|
| `status.py` | lê o plano e o GitHub, grava o snapshot e gera a página | só quando a regra mudar |
| `ajustes.json` | o que o plano e o GitHub não dizem sozinhos (donos, tarefas entregues sem issue, escopo adicionado, datas) | o PM, a cada reunião |
| `snapshots/AAAA-MM-DD.json` | o retrato de cada reunião; a página mostra o mais recente | gerado + mensagem e ações à mão |
| `template.html` | o layout da página (tema da casca) | só para mudar o visual |
| `index.html` | a página pronta; **gerada, não edite** | `status.py gerar` |

## Como recriar para a próxima reunião

Precisa do `gh` autenticado e de Python 3.10+. Nada além da biblioteca padrão.

1. **Coletar.** Na raiz do repo, com a `main` atualizada:
   ```bash
   git fetch origin && python3 docs/pm/status/status.py coletar        # ou: coletar 2026-11-02
   ```
   Grava `snapshots/<data>.json`. Rodar de novo no mesmo dia mantém a mensagem e as ações já escritas.
2. **Conferir o que a coleta não sabe** e corrigir no `ajustes.json`, depois coletar de novo:
   - tarefa do plano entregue **sem issue**, ou com a issue esquecida aberta → `status_manual`, com a data e o PR como evidência;
   - issue nova **fora das tarefas do plano** (bug, parte 2, "se der tempo") → `escopo_adicionado`, com o dono e a estimativa `d` (ou `null`, que aparece como "sem estimativa");
   - issue de teste ou que não é trabalho → `ignorar_issues`;
   - data do plano que mudou (freeze, defesa) → `datas`.

   Para achar os casos, procure no snapshot as tarefas com `"sem_issue": true` e confira no código ou nos PRs mergeados. Uma issue cujo título não tem um ID `Fx.y` entra sozinha como escopo adicionado.
3. **Escrever à mão no snapshot** (é análise, o script não faz):
   - `mensagem`: duas ou três frases para o time, sem jargão. Responda "estamos bem de prazo?" e diga onde está o risco;
   - `acoes`: por membro, uma lista de `{"titulo", "detalhe"}`. **Só o que trava outra pessoa ou o prazo**: PR parado esperando revisão, tarefa que destrava a de outro, tarefa atrasada no caminho crítico, critério de rejeição em aberto, tarefa sem issue que já deveria ter começado. Lista vazia mostra "Nada que trave alguém esta semana". Use os campos `atrasadas`, `esperando_outro` e `espera_por` do snapshot e a lista de PRs abertos (`gh pr list`).
4. **Gerar** e abrir:
   ```bash
   python3 docs/pm/status/status.py gerar
   ```
5. O snapshot, o `ajustes.json` e o `index.html` entram no mesmo commit (o agente de IA não commita: AGENTS.md).

**Numa sessão nova com o Claude:** "Leia `docs/pm/status/README.md` e prepare o status da reunião de hoje." O passo 2 e o passo 3 são os que pedem leitura do código, das issues e dos PRs.

## Regras de contagem (decididas pelo Akita em 26/10)

1. **A base é o plano.** As tarefas da §5 do plano, cada uma pesada pela estimativa em dias. O total não muda quando surge trabalho novo.
2. **Concluída = PR mergeado na `main`.** A coleta usa a issue fechada (o PR com `Closes #` fecha a issue no merge) ou o `status_manual`.
3. **Tarefa em partes só conta quando fecha inteira.** Parte já mergeada aparece como "em andamento"; PR aberto, como "em revisão". Nenhuma das duas entra na %.
4. **Tarefas de todos** (F0.1, F0.2, F9.1, F9.2) dividem a estimativa em 5 partes iguais.
5. **Dono = alocação do plano §9.** Se outra pessoa fez a tarefa, ela continua contando para o dono do plano.
6. **Escopo adicionado fica fora da %.** Entra só na previsão "obrigatório + adicional", para saber se cabe tudo ou só o obrigatório.
7. **Módulo garantido** = todas as tarefas dele (plano §7) concluídas. Meio-pronto vale zero, como na avaliação.

## Como as previsões são feitas

- **Ritmo** = dias do plano concluídos por semana (domingo a sábado), na média das últimas `semanas_velocidade` semanas completas (hoje 2: as semanas antes de 11/10 foram de contratos e quase não fecharam tarefa).
- **Previsão do time** = o que falta ÷ ritmo do time. Supõe que o trabalho pode ir para quem estiver livre.
- **Previsão conservadora** = o mesmo, com a pior semana da janela.
- **Cada um no seu** = o que falta de cada membro ÷ o ritmo dele; o projeto termina quando o último terminar. A diferença entre esta e a do time mostra o quanto a carga está mal distribuída.
- **Dependência entre pessoas** = tarefas restantes que dependem (coluna "Dep." do plano) de uma tarefa ainda aberta de **outro** membro.
- **Semáforo** (regra fixa): até o freeze = verde; depois do freeze e até o limite = amarelo; depois do limite, ou sem ritmo para projetar = vermelho.

Limites conhecidos: a estimativa do plano é um chute calibrado, não o tempo real gasto; o ritmo individual em duas semanas oscila muito (uma tarefa de 3 d pesa); e a regra 3 subestima quem tem tarefas grandes em partes. Leia as previsões como tendência, não como data marcada.

## Datas de referência

| | Data | De onde vem |
|---|---|---|
| Freeze | 14/11 | plano §3 |
| Defesa no plano | 21/11 | plano §3 |
| Limite | 27/11 (sex) | projeto totalmente pronto e defesa; entrega em 28–29/11 |
