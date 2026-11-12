# #260 — HUD sutil

A HUD usa informações soltas sobre a cena, com menos espaço ocupado. Foram
removidos os fundos dos painéis, molduras, caixas de cada Player e badges.
HP continua vermelho e Mana azul; barras de 4 px, ícones menores e texto com
sombra suave. Armor e chaves mostram ícone e quantidade, com rótulos traduzidos
para leitores de tela. O minimapa fica menor, sem moldura nem fundo opaco externo
ao desenho do Grid. Listas, placar, relógio, ping, ajuda e feed seguem a mesma direção.

Valores, ordem das listas, traduções, avisos de HP baixo, morte e Reconnection e
acesso à ajuda foram preservados. A mudança é de apresentação.

## Validação

Validação visual pendente: conferir cena clara/escura, tela estreita, nomes longos,
coop com cinco Players, PvP, HP baixo e ajuda aberta. Os tamanhos menores precisam
ser conferidos em navegador no equipamento usado na defesa.
Nenhum teste, build, Docker ou curl foi executado nesta revisão.

## Commit e PR

Um commit sugerido: `style: simplifica HUD com elementos soltos e compactos`.
Arquivos deste ajuste:

```text
frontend/src/play/Hud.tsx
frontend/src/play/Resources.tsx
frontend/src/play/Players.tsx
frontend/src/play/Scoreboard.tsx
frontend/src/play/Ping.tsx
frontend/src/play/Help.tsx
frontend/src/play/KillFeed.tsx
frontend/src/play/Match.tsx
frontend/game/src/render/minimap.ts
docs/contracts/hud.md
docs/entrega-260-hud-sutil.md
```

Há outras mudanças locais de seleção de Player, projéteis, áudio e texturas.
Revisar o diff antes de adicionar arquivos: alguns desta lista também foram
alterados nos ajustes anteriores. O agente não criou commit, push nem PR.

Título sugerido do PR: `Torna a HUD mais sutil e compacta`.

Corpo sugerido:

```markdown
A HUD passa a usar texto e indicadores compactos sobre a cena, com barras finas,
sem caixas ou molduras. O minimapa fica menor e perde o fundo opaco externo ao Grid.
Rótulos acessíveis e avisos de estado permanecem disponíveis.

Validação visual, build e testes pendentes.

Closes #260
```
