# 0002 · Access em memória, refresh rotacionado em cookie

**Status:** proposto (07/10/2026)

**Contexto:** o SPA precisa manter o User logado ao recarregar a página, e o site aceita login por senha, pelo Google e pela 42; o token não pode ficar ao alcance de um script injetado (XSS) nem ser usado por outro site (CSRF).
**Decisão:** o access é um JWT de 15 min guardado só em memória pelo SPA e enviado em `Authorization: Bearer`; o refresh é opaco, dura 7 dias, fica em cookie `HttpOnly; Secure; SameSite=Strict; Path=/api/auth`, guardado no banco só como hash e rotacionado a cada uso, e um token antigo que reaparece depois de 10 s revoga a família inteira. Os três métodos de login terminam na mesma emissão de tokens.
**Motivo:** o JavaScript não lê o cookie, então XSS não rouba a sessão; `SameSite=Strict` e a checagem de `Origin` bloqueiam o CSRF em `/refresh`; e o refresh precisa poder ser revogado, o que JWT sem tabela não permite. O custo, aceito, é uma consulta ao banco a cada renovação. Detalhes em [contracts/auth.md](../contracts/auth.md).
