# 0003 · Three.js puro atrás de mountGame

**Status:** aceito (02/10/2026)

**Contexto:** a casca do site é React, e o jogo precisa redesenhar a cena a 60 fps com estado que muda 30 vezes por segundo.
**Decisão:** o jogo vive em `frontend/game/`, em TypeScript com Three.js puro (sem react-three-fiber), não importa nada de `frontend/src/` e só se comunica com a casca por `mountGame(canvas, opts)`, `onHud` e `onEnd`.
**Motivo:** o laço de render não passa pela reconciliação do React, o jogo pode ser testado sozinho (o `dev.html` roda com `snapshot.example.json`, sem servidor nem site), e a fronteira deixa o Rafael e o Caio trabalharem em paralelo. O custo é que a HUD precisa passar por `onHud` em vez de ler o estado do jogo direto.
