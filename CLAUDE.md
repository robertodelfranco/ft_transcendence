# ft_transcendence — Catacombs 42

Projeto final do Common Core da 42 (equipe de 5). O jogo é o port do bonus do Cub3D "Catacombs 42" (dungeon crawler com raycasting) para o navegador, com servidor autoritativo em FastAPI. O vocabulário oficial está em [CONTEXT.md](CONTEXT.md): use esses termos em código, PR e conversa.

## Integridade (subject, capítulo I)

Na defesa oral, cada pessoa explica o que cada módulo que entregou faz e por que está feito daquele jeito. Para código-fonte (backend, frontend, simulação, testes): explique o conceito ou o bug, proponha o snippet e pergunte "quer que eu aplique, ou prefere digitar?" antes de tocar no arquivo. Vale para correções de uma linha. Scaffolding de infra pedido explicitamente (Dockerfile, compose, nginx.conf, CI, documentos em `docs/`) pode ser escrito direto.

## Documentos-fonte (leia quando o tema aparecer)

- Arquitetura do jogo (Room, Simulation, protocolo WebSocket, tick, prediction, mapa de migração C → Python/TS/WASM): [docs/catacombs42-web-arquitetura.md](docs/catacombs42-web-arquitetura.md)
- Quem é dono de qual slice, contratos entre slices, módulos por pessoa, plano de contingência: [docs/catacombs42-divisao-de-trabalho.md](docs/catacombs42-divisao-de-trabalho.md)
- Texto do subject v19 (critérios de rejeição, módulos e pontos, seções obrigatórias do README): [docs/transcendence.md](docs/transcendence.md)
- Roadmap da slice do Roberto (milestones, contratos detalhados, constantes do Cub3D, trilha de aprendizado): [docs/roadmap-roberto.md](docs/roadmap-roberto.md)
- Código C original, fonte da matemática a portar: repo `robertodelfranco/42-Cub3D`; na máquina do Roberto em `/home/roberto/workspace/Cub3d` (bonus em `src/bonus/`, mapas em `maps/`, PNGs em `assets/`)

## Invariantes que nenhum config confessa

- Estado de partida em andamento vive só em memória (Room). O banco recebe apenas o Match, ao final.
- Um único worker de backend: ConnectionManager e RoomManager são dicionários em processo. Escalar significa Redis pub/sub, e é decisão do Tech Lead.
- Cliente e servidor usam a mesma fórmula de movimento (velocidade × dt, nunca por frame); a fonte é `movement_bonus.c` / `move_utils_bonus.c` do Cub3D. Fórmulas diferentes fazem a prediction divergir.
- O servidor decide acerto, dano, coleta e vitória. O cliente desenha e envia Input/Action.
- Módulo do subject meio-pronto vale zero: um degrau completo vale mais que dois pela metade.
- Console do Chrome sem warnings é critério de rejeição: trate erro de carregamento de imagem, socket e fetch.

## Time e slices

Roberto (Tech Lead): jogo (Simulation + WebSocket + canvas), autenticação, middlewares compartilhados. A (PO): casca do frontend, design system, páginas legais. B (PM): Docker, Nginx com TLS, CI, observabilidade. C: perfil, amigos, chat, notificações. D: lobby e matchmaking, Match, estatísticas, torneio, dona do schema (SQLAlchemy + Alembic). Tabela nova entra por PR na pasta de migrações da D.

## Fluxo de trabalho no repo

- Branch `<nº-issue>-<slug>`; PR com `Closes #<nº>` no corpo (o board do GitHub Projects só move com isso; detalhes no README).
- Stack decidida: FastAPI + PostgreSQL + Nginx + Docker Compose; frontend em framework + framework CSS (escolha da A, pendente). Infra gratuita e local; nada de serviço pago ou nuvem.
- Validar uma mudança é do autor (rodando local) e do CI (build + testes a cada PR, `.github/workflows/build-check.yml`). Depois de propor ou aplicar uma mudança, pare aí; rode `docker compose`/curl só quando alguém pedir.
- `.env` é local e não versionado: leia antes de mexer, e mantenha o arquivo existente.
