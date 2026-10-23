# Reunião de segunda, 19/10: fechamento da S2 e C2

> Preparado pelo Akita em 19/10. O C2 (era sex 16/10) foi adiado para hoje e roda junto com o fechamento. Calendário e critérios em [replanejamento-e-board.md](replanejamento-e-board.md) §2; ritos na §4.

## 1. C2 ao vivo

**Critério:** um player entra pelo lobby, cria a Room e anda em 3D com o movimento decidido pelo servidor, via `wss://`.

| Peça | Estado em 19/10 | Dono |
|---|---|---|
| Lobby HTTP (criar, entrar, pronto, iniciar) | na `main` (#84) | Akita |
| Lobby em tempo real (`lobby_update`, `match_started`) | PR do #32 aberto hoje | Akita |
| `/ws/game` com join, welcome e laço de leitura | na `main` (#95) | Augusto |
| Cliente do jogo: socket, input e `mountGame` | **PR #109 em revisão** | Augusto |
| Cena Three.js com `Renderer` e `AssetLoader` | na `main` (#105) | Rafael |
| Login e cadastro na casca | **PR #112 em revisão** | Caio |
| `/play/:matchId` e HUD | F7.6 (#49), S3 | Caio |

Sem o F7.6, o C2 de hoje só passa com o jogo montado pelo `dev.ts` do `frontend/game` ou por uma rota provisória. **Decidir:** isso conta como C2, ou o C2 fecha junto com o F7.6?

## 2. Revisões e merges da S2

- **#109 (F2.5):** revisado pelo Akita. Nada bloqueia; ficam três perguntas: close 1000 sem `game_over` não chama `onEnd`; o `result` do `onEnd` no PvP é o da Room ou o do Player ("Em aberto" do `mount-game.md` §5.5); e a Prediction só aparece com o R7.
- **#112 (F7.4):** revisado pelo Akita. Os botões de OAuth levam a rotas que só existem na F6.8. Esconder até lá?
- **#62 (F1.6) e #63 (F1.7), Roberto:** abertas com label S2, faltando o R4.3 (performance) e o R4.4 (CLI). Fecham agora ou mudam de semana?

## 3. Teste da 42

**O que 1 PC já fechou (17/10):** [resultados](../infra/resultados-teste-pc-42-2026-10-17.md); passou para o [infra.md](../contracts/infra.md) §2.4 e "Em aberto" 1.

| Decisão | Valor |
|---|---|
| Ambiente | PC da 42 direto, sem VM; clone + `.env` + `up` em ~1 min |
| Portas | 8080/8443 (rootless não abre < 1024); `PUBLIC_HOST=<hostname>:8443` |
| Disco | `data-root` no goinfre (o sgoinfre não funciona); goinfre e certificado são por PC |
| Cadeado | `mkcert` sem sudo; CA importada pela interface do Chrome 155; limpo pelo hostname, pelo IP e pelo `nip.io` |
| IP do cliente | override do `slirp4netns` em quem serve, ou o rate limit vira global |
| Exporters | só `node-exporter` |
| F8.3 e F8.4 | stack sobe de um clone limpo; assets do jogo servidos (#31 fechado) |

**O que falta (D1–D5), e só sai com 2 PCs:** outro PC alcançar o servidor (D1, impacto alto, sem plano B), a CA num Chrome de outro login (D2), a casca vista de fora (D3), o rate limit separando os IPs (D4) e as portas internas fechadas (D5). São ~40 min com duas pessoas, pelo [teste-2-pcs.md](../infra/teste-2-pcs.md), que qualquer um consegue servir do próprio login.

**Decidir:**
1. Quem vai à 42 antes do C3 (sex 23/10)? O Akita só volta em 24–25/10.
2. Se a D1 falhar, como fica a demo em duas máquinas?
3. Demonstrar sempre em janela anônima: as extensões do Chrome sujam a aba Issues.

## 4. Console limpo (critério de rejeição)

- **`POST /api/auth/refresh` → 404 a cada carregamento.** A casca chama a rota, e ela entra na F6.3 (#87, Augusto, S3). Só o "sem cookie → 200 `{authenticated: false}`" já limpa. **Data?** Pré-requisito do C3.
- **401 de senha errada aparece no console** ([i18n.md](../contracts/i18n.md) "Em aberto" 1, achado do Caio). Não dá para evitar sem quebrar o envelope de erro. Proposta do Caio: aceitar e explicar na defesa. **Roberto aceita?**

## 5. OAuth: só a 42 por enquanto?

- **42:** app criado e testado hoje à mão (authorize → token → `/v2/me`): **funciona**. A intra **ignora o PKCE**, então a 42 fica só com `state`. **O secret vence em 06/11, antes da defesa:** renovar antes de 21/11. Detalhes no [infra.md](../contracts/infra.md) "Em aberto" 4.
- **Google:** não cadastrado. Restrições conhecidas ([auth.md](../contracts/auth.md) "Em aberto" 1 e 2, [infra.md](../contracts/infra.md) §2.4):
  - a URL de retorno precisa ser HTTPS num domínio público; a exceção é só `localhost`, e IP puro é recusado;
  - de outra máquina, a única saída é o `nip.io`, se o formulário aceitar;
  - em modo "Testing", só entram os e-mails cadastrados como testadores; publicar com escopos básicos ainda precisa ser conferido.
- **Decidido pelo Akita (19/10), dono da F6.8:** a F6.8 implementa só a 42, que sozinha fecha o módulo ([caminho-5-akita.md](../slices/caminho-5-akita.md) §5). O Akita cria o client do Google depois, e o provedor entra ao longo do projeto. O botão do Google na casca (#112) some até lá. **Para o time:** só confirmar que ninguém depende do Google antes disso.

## 6. Abertura da S3

**C3 · sex 23/10:** duas máquinas jogam co-op até o boss morrer com a Prediction ligada; Match gravado; PvP 1v1 jogável.

| Pessoa | Issues da S3 no board |
|---|---|
| Akita | F5.3 `record_match_result` (bloqueia o #91), F5.6 histórico, F8.5 esqueleto do README, F8.8 Prometheus. Abertas hoje |
| Augusto | #87 F6.3, #89 F2.6, #90 F2.8, #91 F2.9, #92 F8.7 |
| Caio | #49 F7.6 |
| Roberto | **nenhuma**: F2.7 (Prediction e Reconciliation) e `PvpRuleset` não estão no board |
| Rafael | **nenhuma aberta**. A F4.6 (XP/level, Elo e conquistas) foi aberta hoje; faltam as tarefas de render e conteúdo da S3 |

**Decidir:** cada um sai da reunião com as próprias issues da S3 criadas e com responsável. A F4.6 precisa de data, porque trava a F5.5 e a F5.7 na S4.

## 7. Gargalo da S4 e prazo da intra

- A S4 da Slice 5 soma 8,5–9 d numa semana de 5 ([caminho-5-akita.md](../slices/caminho-5-akita.md) §5). Tirar o Google (item 5) alivia 0,5–1 d.
- **O prazo do `ft_transcendence` na intra contra a defesa em 21/11:** alguém já conferiu? Se a intra não permitir, vale a ordem de corte do plano §8.3.

## 8. Fora da reunião (Akita, 19/10)

- #28 (F8.2) e #33 (F0.6) fechadas.
- Issues da S3 da Slice 5, a F4.6 e o `/media/` abertas.
- PR do #32: o lobby publica `lobby_update`, `lobby_removed` e `match_started` depois do commit, inclusive na saída por presença.
- PR do `/media/`: volume `media` e avatar padrão servido pelo Nginx (decisão 13 do `infra.md`).
- Docs: roteiro da 42 com as 4 correções, e `infra.md` com o resultado de 1 PC.

## 9. Resultado da reunião

Preenchido em 22/10. A reunião aconteceu em 19/10, mas o C2 não foi demonstrado ao vivo.

**Decidido:**

- **C2:** não foi demonstrado em 19/10. Em 22/10, o time viu o jogo rodando pela branch do #138 (F7.6, Caio, ainda em revisão): o Player anda na masmorra e o coop funciona. O C2 fecha quando o #138 tiver merge na `main`.
- **Teste da 42 (§3):** ninguém foi à 42 antes do C3. O teste com 2 PCs passou para sáb 31/10, com o Akita servindo ([teste-2-pcs.md](../infra/teste-2-pcs.md), PR #140). Se a D1 falhar, não há plano B pronto (roteiro, "Se algo falhar"). A janela anônima entrou no roteiro (passo 2.3).
- **OAuth (§5):** a F6.8 sai só com a 42. Na casca, **some só o botão do Google**; o da 42 fica, porque a F6.8 entra antes da defesa.
- **Prazo da intra (§7):** conferido; a defesa em 21/11 cabe no prazo do `ft_transcendence`. A ordem de corte do plano §8.3 não é acionada.

**Resolvido fora da reunião, depois de 19/10:**

| Ponto | Como fechou |
|---|---|
| #109 (F2.5) e #112 (F7.4) | merge em 19/10, à noite |
| #62 (F1.6) e #63 (F1.7) | fechadas em 20/10 e 21/10, já na S3 |
| 404 do `/refresh` no console (§4) | #131 (F6.3), merge em 21/10 |
| Issues da S3 do Roberto (§6) | #125 (F2.7), #126 (F1.8) e #127 (F1.9), criadas em 20/10 |
| F4.6 do Rafael (§6) | PR #144 aberto em 22/10, aprovado pelo Akita; destrava a F5.5 e a F5.7 |

**Não discutido; vai para a reunião de seg 26/10:**

| Ponto | Quem | Até |
|---|---|---|
| Esconder o botão do Google em `OAuthButtons.tsx` | Caio | antes do teste de 31/10 |
| Aceite do 401 da senha errada no console ([i18n.md](../contracts/i18n.md) "Em aberto" 1) | Roberto | seg 26/10 |
| `result` do `onEnd` no PvP: o da Room ou o do Player local ([mount-game.md](../contracts/mount-game.md) §5.5) | Rafael e Caio | seg 26/10 |
| Close 1000 sem `game_over` não chama `onEnd` (revisão do #109) | Augusto | seg 26/10 |
| Tarefas de render e conteúdo do Rafael na S3/S4: hoje só a #119 está no board | Rafael | seg 26/10 |
