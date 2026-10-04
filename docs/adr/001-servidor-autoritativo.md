# 0001 · Servidor autoritativo com Room em memória

**Status:** aceito (02/10/2026)

**Contexto:** até 5 Players jogam em tempo real, e o cliente roda no navegador, onde qualquer um pode alterar o código.
**Decisão:** o servidor roda a Simulation e decide acerto, dano, coleta e vitória. A partida em andamento vive só em memória, na Room, e o banco recebe apenas o Match no fim.
**Motivo:** cliente que decide pode trapacear, e gravar estado 30 vezes por segundo no banco seria lento e inútil. O custo, aceito, é que reiniciar o backend perde as partidas em andamento.
