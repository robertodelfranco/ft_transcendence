# ft_transcendence — Catacombs 42

Projeto final do Common Core da 42 (equipe de 5). O jogo é o Catacombs 42, bonus do Cub3D, em 3D de verdade no navegador (Three.js), com a matemática e as regras do Cub3D rodando num servidor autoritativo em FastAPI: co-op até 5 pessoas e PvP 1v1. Escopo fechado em 21 pontos (plano, §1). O vocabulário oficial está em [CONTEXT.md](CONTEXT.md): use esses termos em código, PR e conversa.

## Integridade (subject, capítulo I)

Na defesa oral, cada pessoa explica o que cada módulo que entregou faz e por que está feito daquele jeito. Para código-fonte (backend, frontend, simulação, testes): explique o conceito ou o bug, proponha o snippet e pergunte "quer que eu aplique, ou prefere digitar?" antes de tocar no arquivo. Vale para correções de uma linha. Scaffolding de infra pedido explicitamente (Dockerfile, compose, nginx.conf, CI, configs de Prometheus/Grafana, documentos em `docs/`) pode ser escrito direto.

## Documentos-fonte (leia quando o tema aparecer)

- Plano (escopo de 21 pontos, tarefas F0–F9 com IDs, checkpoints C1–C5, ordem de corte, quem faz o quê): [docs/catacombs42-plano-de-tarefas.md](docs/catacombs42-plano-de-tarefas.md)
- Arquitetura (Room, Simulation, protocolo WebSocket, tick, prediction, contratos entre frentes, schema, monitoring, mapa de migração do C): [docs/catacombs42-web-arquitetura.md](docs/catacombs42-web-arquitetura.md)
- Texto do subject v19 (critérios de rejeição, módulos e pontos, seções obrigatórias do README): [docs/transcendence.md](docs/transcendence.md)
- Proposta ampliada, com os módulos que ficaram de fora e o porquê: [docs/catacombs42-ideias-e-modulos.md](docs/catacombs42-ideias-e-modulos.md)
- Roadmap pessoal do Roberto (trilha de aprendizado, constantes do Cub3D): [docs/roadmap-roberto.md](docs/roadmap-roberto.md). É anterior à revisão de 28/09; quando divergir, o plano manda.
- Código C original, fonte da matemática a portar: repo `robertodelfranco/42-Cub3D`; na máquina do Roberto em `/home/roberto/workspace/Cub3d` (bonus em `src/bonus/`, mapas em `maps/`, PNGs em `assets/`)

## Invariantes que nenhum config confessa

Lista completa na arquitetura, §2. As que mais se quebram sem querer:

- Estado de partida em andamento vive só em memória (Room). O banco recebe apenas o Match, ao final.
- Um único worker de backend: ConnectionManager e RoomManager são dicionários em processo. Escalar significa Redis pub/sub, e é decisão do Tech Lead.
- Cliente e servidor usam a mesma fórmula de movimento (velocidade × dt, nunca por frame); a fonte é `movement_bonus.c` / `move_utils_bonus.c` do Cub3D. `sim.py` e `applyInput.ts` usam as mesmas constantes (`rules.py` e `rules.ts`). Fórmulas diferentes fazem a Prediction divergir.
- O servidor decide acerto, dano, coleta e vitória. O cliente desenha e envia Input/Action.
- Todo texto visível passa pelo i18n (pt-BR, en, es), inclusive páginas legais, erros do backend (traduzidos pelo `code`) e HUD. Nenhuma string literal no JSX; o canvas do jogo não tem texto.
- Módulo do subject meio-pronto vale zero: um degrau completo vale mais que dois pela metade.
- Console do Chrome sem warnings é critério de rejeição: trate erro de carregamento de imagem, som, socket e fetch.

## Time e slices

Alocação fechada em 28/09/2026. Detalhe de cada caminho (tarefas, semana a semana, o que explica na defesa) no plano, §9.

| Caminho | Pessoa | GitHub | Papel | Dono de |
|---|---|---|---|---|
| 1 · Simulation e Prediction | Roberto | `@robertodelfranco` | Tech Lead | Simulation (F1, incl. `PvpRuleset`), `applyInput.ts` + Prediction/Reconciliation (F2.7), teste de carga do tick, minimapa, contratos; revisa `rules.*` e `sim.py` |
| 2 · Auth e Netcode | Augusto | `@augustocesarmd` | Dev | pacote do backend, auth, middlewares, `ConnectionManager`, `RoomManager`, WebSocket do jogo, Interpolation, reconexão, `/metrics` |
| 3 · Render 3D e conteúdo | Rafael | `@rflheringer` | Dev | cena Three.js, efeitos, temas, áudio; mapas, números, especificação da HUD, conquistas e opções |
| 4 · Web, usuários e i18n | Caio | `@caioosantos` | PO | casca React, i18n, páginas legais, login/cadastro, perfil e amigos (front e back), HUD, lobby e telas de estatística |
| 5 · Partidas, estatísticas, infra e monitoring | Akita | `@kanashir0` | PM / Scrum Master | Alembic e schema de partidas, lobby no backend, Match, estatísticas, OAuth 42, Nginx com TLS, compose, CI, README, Prometheus + Grafana |

Tabela nova entra por PR revisado por quem é dono do schema: Akita para partidas e estatísticas, Augusto para usuários e tokens.

## Fluxo de trabalho no repo

- Branch `<nº-issue>-<slug>`; PR com `Closes #<nº>` no corpo (o board do GitHub Projects só move com isso; detalhes no README).
- Stack decidida: FastAPI + PostgreSQL (SQLAlchemy + Alembic) + Nginx + Docker Compose; frontend em React + TypeScript (Vite) + framework CSS (a definir em F0.4); jogo em Three.js puro em `frontend/game/`, atrás de `mountGame`; monitoring com Prometheus + Grafana. Infra gratuita e local; nada de serviço pago ou nuvem.
- Validar uma mudança é do autor (rodando local) e do CI (build + testes a cada PR, `.github/workflows/build-check.yml`). Depois de propor ou aplicar uma mudança, pare aí; rode `docker compose`/curl só quando alguém pedir.
- `.env` é local e não versionado: leia antes de mexer, e mantenha o arquivo existente.
