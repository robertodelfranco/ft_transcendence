# Resultados do teste no PC da 42 (17/10 e 01/11/2026)

> Execução do [roteiro de teste no PC da 42](roteiro-teste-pc-42.md) (versão com o passo 8, da branch `31-roteiro-stack-real`) contra a `main` em `0c05d7b`.
>
> - **Servidor:** c1r5p1.42sp.org.br / 10.11.5.1, login `gyasuhir` (Akita).
> - **Quem fez o quê:** terminal e navegador pelo Akita.
> - **2º PC:** feito em 01/11, no cluster 3 ([resultado](#pendente-2º-pc)). Falta só a resposta do staff sobre o goinfre (N5).

## Resumo para a reunião

### Decisões fechadas

| Decisão | Valor | Evidência | Confiança |
|---|---|---|---|
| Ambiente da demo | **direto no PC da 42, sem VM** | build do zero em ~1 min (pull + build); 4,8 GB no goinfre, que tem 51 GB livres; o home não é tocado | alta |
| Portas | **`PROXY_HTTP_PORT=8080`, `PROXY_HTTPS_PORT=8443`** | 80 e 443 falham no Docker rootless (`cannot expose privileged port`); 8080 e 8443 sobem | alta |
| `PUBLIC_HOST` | **`<hostname-do-PC>:8443`** (ex.: `c1r5p1.42sp.org.br:8443`) | redirect `http://…:8080/x?q` → `https://<host>:8443/x?q` em qualquer nome de entrada | alta; outro PC alcança em 01/11 (D1) |
| SAN do certificado | **hostname, IP, `<ip-com-hifens>.nip.io`, `localhost`, `127.0.0.1`** | `curl --cacert` e o Chrome validam os três nomes, com cadeado limpo | alta |
| CA no Chrome | **importar o `rootCA.pem` pela interface, sem sudo** | funcionou no Chrome 155 (gerenciador de certificados novo). Plano B: `TRUST_STORES=nss mkcert -install`, porque o PC tem `certutil`. Em 01/11, funcionou no Chrome 156 de outro login (D2) | alta |
| IP real do cliente | **override de usuário com o port driver `slirp4netns`** em quem serve a demo | sem ele, todo cliente aparece como `172.18.0.1` e o rate limit vira global; com ele, o Nginx vê o IP real e um IP travado não trava o outro | alta; com IP remoto em 01/11 (D4) |
| `X-Forwarded-For` forjado | não fura o rate limit | continua 429 com cabeçalho forjado, porque o Nginx substitui o valor (decisão 6) | alta |
| Exporters (D3) | **`node-exporter` funciona; cAdvisor também, com volumes próprios do rootless** | 1504 séries `node_*`; 7808 `container_*` com os containers por nome só montando o socket do containerd rootless | alta. Recomendação: só `node-exporter`, que é mais simples e não depende de caminho de rootless |
| F8.3 | **clone limpo + `.env` + `docker compose up` funciona** numa máquina que não é a de quem escreveu o compose | 4 serviços `healthy`; dados sobrevivem ao `down`; uma cabeça de Alembic | alta |
| F8.4 / #31 | **assets do jogo servidos pelo build de produção** | `/assets/map/dungeon_wall_1.png` → 200 `image/png`, visto no Chrome | alta. **O #31 pode ser fechado** |
| Onde o Docker guarda imagens e volumes | **goinfre** (`"data-root": "/goinfre/<login>/docker/"`); **o sgoinfre não funciona** | testado: com o `data-root` no sgoinfre, o Docker rootless nem inicia (`could not create or set daemon root permissions: chown /sgoinfre/gyasuhir/docker: invalid argument`), porque o NFS recusa o `chown`. O preço do goinfre é ser local de cada PC, e trocar de PC custa ~1 min de pull + build | alta |
| Postgres | **volume nomeado** (fica no `data-root`, então no goinfre) | consequência da linha anterior | alta |
| `nip.io` para o OAuth do Google | **viável do lado da rede** | `10-11-5-1.nip.io` resolve na rede da 42 | alta para o DNS; se o Google aceita, é o "Em aberto" 4 do `infra.md` (sai do formulário, não da rede) |

### Pendências de 17/10: impacto e confiança

**Todas fechadas em 01/11, com OK** ([resultado](#pendente-2º-pc)). A tabela fica como a avaliação de risco feita em 17/10.

| # | O que falta | Confiança hoje | Impacto se falhar |
|---|---|---|---|
| **D1** | outro PC alcança o servidor (hostname, IP, `nip.io`) | **média**: a stack escuta em todas as interfaces e os nomes resolvem, mas o tráfego para o próprio IP não sai da máquina, então um firewall entre PCs passaria despercebido | **alto**: a demo em duas máquinas (C3, módulo Remote players, avaliação) muda de forma. Não há plano B pronto; seria decisão do time com o Tech Lead |
| D2 | importar a CA num Chrome de outro login; cadeado limpo | alta: o mesmo procedimento funcionou sem sudo, no mesmo Chrome dos PCs; o arquivo vai por Slack se o sgoinfre não deixar | baixo: é procedimento, não arquitetura |
| D3 | casca, `/api/health`, textura e redirect vistos de fora | alta, se a D1 passar: são as mesmas respostas validadas no servidor | ligado à D1 |
| D4 | o rate limit separa o PC2 do PC1 | alta: dois IPs de origem diferentes (10.11.5.1 e 10.0.2.2) já caíram em baldes separados com o `slirp4netns` | médio: se falhar, o rate limit vira global na demo (5 senhas erradas travam todos por 60 s; 5 cadastros/min para a sala inteira) |
| D5 | portas internas (8000, 5432, 9090, 9100, 3000) fechadas para outro PC | muito alta: só o `proxy` publica porta, e do próprio servidor estão todas fechadas | baixo |

### Prazos (de 17/10)

O teste com 2 PCs aconteceu em 01/11, depois do C3.

- **O C3 (sex 23/10) é o primeiro checkpoint com duas máquinas.** O teste com 2 PCs precisa vir **antes**, para sobrar tempo de reagir se a D1 falhar.
- **O Akita não volta à 42 antes de 24–25/10**, depois do C3. Por isso o [teste-2-pcs.md](teste-2-pcs.md) foi escrito para qualquer pessoa do time servir do próprio login. Se alguém for à 42 durante a semana, vale fazer.
- Se ninguém fizer antes, o risco da D1 cai no próprio C3, e o Akita faz em 24–25/10.

### Achados para outros donos

| Achado | Dono | Impacto |
|---|---|---|
| **Resolvido em 21/10 (F6.3, #131).** **`POST /api/auth/refresh` → 404 no console a cada carregamento.** A casca chama a rota ao carregar (`frontend/src/api/client.ts`, `AuthProvider`), e o backend ainda não tem a rota (F6.3; `backend/app/auth/router.py`: "/refresh e /logout entram na F6.3"). Pelo [auth.md](../contracts/auth.md) §2.2 e §4 decisão 4, sem cookie ela responde 200 `{"authenticated": false}`, e o erro some sem mudar a infra | Augusto (F6.3) | **Hoje a `main` reprova o critério de console limpo.** Pré-requisito do C3 |
| **Resolvido (#120).** **`/media/` não está roteado.** O `avatar_url` padrão (`/media/avatars/default.png`) devolve o `index.html` do SPA (200 `text/html`). Falta a decisão 13 do [infra.md](../contracts/infra.md): volume `media` + `location /media/` no proxy | Akita (F8) | avatar quebrado na primeira tela que mostrar um |
| **Extensões do Chrome sujam a aba Issues.** Um aviso "CSP blocks eval" apareceu, mas o site não manda CSP nem usa `eval`. Some em janela anônima. O perfil do PC tinha 17 extensões (MetaMask, Dark Reader, AdBlock...) | todos | **Demonstrar em janela anônima ou num perfil sem extensões**, na C3 e na avaliação |
| **O `data-root` no goinfre não é padrão da 42.** Quem servir a demo precisa configurá-lo, senão ~5 GB vão para o home (11 GB no total) | quem servir | [teste-2-pcs.md](teste-2-pcs.md) §1.3 |
| **O goinfre e o certificado são por PC.** Trocar de PC significa refazer o pull e o build (~1 min) e um `mkcert` novo; a CA e o `mkcert` ficam no home e acompanham o login | quem servir | planejar a demo num PC já preparado, ou com 2 min de folga |

### Próximos passos

1. ✅ Rodar o [teste-2-pcs.md](teste-2-pcs.md): feito em 01/11.
2. ✅ Atualizar o [infra.md](../contracts/infra.md): §2.4 e "Em aberto" 1 e 4, em 02/11.
3. ✅ Aplicar no roteiro as correções do fim deste arquivo.
4. ✅ Fechar o #31.

Depois de 01/11:

5. **Trocar o `FT_CLIENT_SECRET` até 06/11.** O D6 usou o secret atual, que vence nesse dia ([teste-2-pcs.md](teste-2-pcs.md) §0.2).
6. Atualizar o `.env` de casa com as chaves da `main` (achado de 01/11).
7. Decidir o redirect para o `PUBLIC_HOST` ([infra.md](../contracts/infra.md) "Em aberto" 6), antes do ensaio do C5.
8. Registrar aqui a resposta do ticket do goinfre (N5), que entra na F8.6.

---

## Detalhe por passo do roteiro

| # | Pergunta | Resultado |
|---|---|---|
| 1 | Docker no grupo ou rootless? `Docker Root Dir`? Compose v2? | **Rootless**: Docker 29.4.1, overlayfs, cgroup v2, `Docker Root Dir: /goinfre/gyasuhir/docker` (via `~/.config/docker/daemon.json`, configurado à mão), Compose v5.1.3, rootlesskit 2.3.6 |
| 2 | Quais portas sobem? | 80 e 443 **falham** (`ip_unprivileged_port_start=1024`); 8080 e 8443 OK |
| 3a | Espaço livre e FS | home: xfs, 11G, 4,4G livres · goinfre: ext4 **local do PC**, 51G livres · sgoinfre: **nfs4** |
| 3b | Tamanho das imagens | as 9 imagens do roteiro: 3,4 GB em 40 s; depois do build: 4,1 GB de imagens + 760 MB de cache |
| 3c | Permissão de `/sgoinfre/gyasuhir` | `drwx------`: ninguém mais lê, nem o `rootCA.pem` |
| 4 | Postgres no sgoinfre | não testado: desnecessário com o goinfre |
| 5a | Alcance por hostname e IP | do próprio PC: OK pelos 4 nomes. Entre PCs: **pendente (D1)** |
| 5b | `nip.io` | resolve para 10.11.5.1 no servidor. No cliente: pendente (D1) |
| 6 | Exporters | `node-exporter` OK (1504 séries; um `level=ERROR` inofensivo de `/run/udev/data`). cAdvisor OK só com os volumes abaixo |
| 7a | `mkcert` e `certutil` | `~/bin/mkcert` v1.4.4 sem sudo; `/usr/bin/certutil` presente |
| 7b | Cadeado | `curl --cacert` e o Chrome do servidor: limpos pelos três nomes. Do 2º PC: pendente (D2) |
| 7c | Navegador | Google Chrome 155 (gerenciador de certificados novo); Firefox também instalado |
| 8a | Stack real | clone HTTPS sem senha; primeiro `up --build --wait` em **19 s** (com as imagens base já baixadas); `down` + `up` em 9 s; 4 serviços `healthy` |
| 8b | Checagens | `/` 200 · `/api/health` 200 · textura 200 `image/png` · redirect com a porta · HTTP/2 · `/metrics` cai no SPA · só o `proxy` publica porta · signup 201, login 200, `/me` 200 com Bearer e 401 sem · cookie `HttpOnly; Secure; SameSite=strict; Path=/api/auth` · `wss://…/ws/app` → 101 + `welcome` · usuários sobrevivem ao `down`/`up` · `alembic heads` = `0001` |
| 8c | Espaço depois do build | ver 3b |

### Navegador do servidor (Akita, Chrome 155)

| # | Checagem | Resultado |
|---|---|---|
| B1 | CA importada pela interface, sem sudo | OK |
| B2 | Casca por hostname, IP e `nip.io` | "A conexão é segura" nos três, sem tela de aviso. No console, só o 404 do `/refresh` (F6.3) |
| B3 | `/api/health`, textura, redirect 8080 → 8443 | OK |
| B4 | Navegação (`/privacy`, `/terms`, rota inexistente) | OK; só o 404 do `/refresh` a cada carregamento |
| B5 | Aba Issues: "CSP blocks eval" | vem de extensão: some em janela anônima |

## Achado: o rootless da 42 esconde o IP do cliente

- **O problema:** com o padrão do rootlesskit (`--port-driver=builtin`), o Nginx via toda requisição vinda de `172.18.0.1`, o gateway da rede do compose, inclusive as feitas pelo IP 10.11.5.1. A chave do rate limit ([auth.md](../contracts/auth.md) §2.7, `request.client.host`) era a mesma para todos os clientes.
- **A correção:** fica no home de quem serve a demo e não precisa de sudo. Os comandos estão no [teste-2-pcs.md](teste-2-pcs.md) §1.4. Ela grava `~/.config/systemd/user/docker.service.d/override.conf` com `DOCKERD_ROOTLESS_ROOTLESSKIT_PORT_DRIVER=slirp4netns` e reinicia o Docker do usuário (`systemctl --user restart docker`).
- **Depois da correção:**
  - pelo hostname e pelo IP, o Nginx vê **10.11.5.1**; pelo `localhost`, `10.0.2.2`
  - com o login travado (429) pelo IP, outro login pelo `localhost` passa (200) no mesmo instante
  - o `wss://` continua OK
- **O custo:** o `slirp4netns` tem menos vazão que o `builtin`, irrelevante para o volume da demo.

Isso é específico do Docker rootless. Numa máquina com Docker rodando como root (provavelmente a de quem avalia), o IP chega certo sem nada.

## cAdvisor no rootless

No lugar do `-v /var/lib/docker:/var/lib/docker:ro` do roteiro:

```
-v /run/user/$UID/docker.sock:/var/run/docker.sock:ro
-v /run/user/$UID/docker/containerd/containerd.sock:/run/containerd/containerd.sock:ro
-v /goinfre/$USER/docker/:/var/lib/docker:ro
```

Sem o socket do containerd, o factory do Docker falha (`unable to create containerd client`) e as métricas saem só por cgroup, sem `name`. Os caminhos dependem do usuário e do PC, o que pesa a favor de só `node-exporter`.

## Pendente 2º PC

Siga o [teste-2-pcs.md](teste-2-pcs.md). O script do cliente é o [cliente-pc2.sh](cliente-pc2.sh), que recebe o host, o IP e a CA por argumento. O kit em `/sgoinfre/gyasuhir/transcendence-test/` vale só para o c1r5p1 servido pelo Akita.

Executado em **01/11/2026**, seguindo o [teste-2-pcs.md](teste-2-pcs.md), contra a `main` em `5143002`.

- **Servidor (PC A):** c3r2p2.42sp.org.br / 10.13.2.2, login `gyasuhir` (Akita). `PUBLIC_HOST=c3r2p2.42sp.org.br:8443`, `slirp4netns` e `data-root` no goinfre já estavam configurados no login.
- **Clientes, todos no cluster 3:** c3r3p1 / 10.13.3.1 (PC B) e 10.13.2.1 (3º PC, só nas partidas).
- **Outro cluster: não feito, por decisão.** A avaliação será dentro de um cluster só (confirmado pelo time em 01/11). Cada cluster é uma sub-rede própria (`10.13.x.x` no c3), então a regra que importa para a demo é a de dentro da sub-rede, e ela passou.

| # | Validação | Data / PCs | Resultado |
|---|---|---|---|
| D1 | o 2º PC alcança o servidor por hostname, IP e `nip.io` | 01/11 · c3r2p2 → c3r3p1 | **OK.** Os dois nomes resolvem para 10.13.2.2, e o HTTP na 8080 dá `301` nos três. Não há firewall entre PCs do mesmo cluster |
| D2 | CA importada pela interface noutro Chrome; cadeado pelos três nomes; console limpo | 01/11 · c3r3p1, Chrome 156 | **OK pelo hostname.** Cadeado limpo nos três nomes, mas pelo IP e pelo `nip.io` o console mostra `POST /api/auth/refresh` → **403** `forbidden` "origin not allowed" (achado abaixo) |
| D3 | casca, `/api/health`, textura e redirect com a porta, vistos do 2º PC | 01/11 · c3r3p1 | **OK.** `200` nas 9 combinações de nome e caminho; `Location: https://c3r2p2.42sp.org.br:8443/` |
| D4 | login travado no servidor não trava o 2º PC (`401`, não `429`), e o IP do 2º PC aparece no log do proxy | 01/11 · c3r2p2 → c3r3p1 | **OK.** O PC A tomou `429` às 15:28:55, e o PC B tomou `401` às 15:29:00. O log do proxy mostra `10.13.3.1`, sem nenhuma linha `172.18.0.1` |
| D5 | portas 8000, 5432, 9090, 9100, 9187 e 3000 do servidor fechadas para o 2º PC | 01/11 · c3r3p1 | **OK para a stack.** Todas fechadas, menos a **9100**, que é o `prometheus-node-exporter` do sistema do PC (usuário `prometheus`), e não o nosso, que não publica porta (achado abaixo) |
| D6 | login pela 42 de outro PC | 01/11 · c3r3p1 e 3º PC | **OK.** Usou o secret atual. A intra aceitou 3 URLs de retorno, com hostname, porta e `nip.io`, sem limite visível: `https://localhost/…`, `https://c3r2p2.42sp.org.br:8443/…` e `https://10-13-2-2.nip.io:8443/…` (`/api/auth/oauth/42/callback`). A URL nova valeu logo depois do cadastro. 3 contas da 42 diferentes entraram, inclusive de quem não é dono do app (`via_oauth = 3` no banco) |
| D7 | Grafana de outro PC: login, `401` sem login, redirect com a porta, console | 01/11 · c3r3p1 | **OK.** Login de admin de outro PC; `/grafana/api/dashboards/home` sem login → `401`; `/grafana` → `301` para `https://c3r2p2.42sp.org.br:8443/grafana/`; os 4 dashboards provisionados aparecem (Catacombs 42, Host, Jogo e backend, Postgres) |
| D8 | co-op entre 2 PCs até o fim; reconexão em menos de 30 s e expiração depois de 30 s; Match `finished` | 01/11 · c3r2p2 + c3r3p1 | **OK.** Match 4: o PC B fechou às 16:30:08 e voltou às 16:30:22 (14 s) na mesma partida, que terminou `win`/`boss_defeated` com 2 players. Match 7: um player saiu e esperou 40 s, ficou com `disconnected_at_end = true` e sumiu do lobby, e o outro terminou `win`/`boss_defeated`. Console limpo |
| N1 | co-op com N players em M PCs; sincronia, alvo dos inimigos, tick no Grafana, console | 01/11 · 3 players em 3 PCs | **OK.** Match 1: 3 players (10.13.2.2, 10.13.3.1, 10.13.2.1), cada um com a própria conta da 42, `win`/`boss_defeated`. No dia (7 Matches, 5 `finished`), o tick ficou com média de **0,16 ms**, e os 10.714 ticks abaixo de 1 ms, contra um orçamento de 33 ms (30 Hz). Nenhum 5xx nem exceção no backend |
| N2 | WebGL acelerado? GPU; fps parado, andando e na luta, em janela e em tela cheia | 01/11 · todos os PCs, iguais | **OK.** WebGL: Hardware accelerated. GPU: `ANGLE (Intel, Mesa Intel(R) UHD Graphics 770 (ADL-S GT1), OpenGL 4.6 (Core Profile) Mesa 23.2.1-1ubuntu3.1~22.04.4)`. **60 fps cravados** em todas as situações; ao entrar em tela cheia (`F11`), cai para 58 por um instante e volta a 60 |
| N3 | versão do Chrome em cada PC; está atualizado? | 01/11 · todos os PCs, iguais | **Chrome 156.0.8078.79** (Official Build, x86_64). Em 17/10, era o 155. Não foi anotado se aparecia "atualizado" |
| N4 | login sem Docker configurado | — | não feito |
| N5 | respostas do staff: goinfre, local da defesa, mudanças nos PCs | 01/11 | **Local:** a avaliação é dentro de um cluster só. **Goinfre:** ninguém soube dizer quando ele é limpo; o Akita abriu um ticket, e a resposta entra aqui. **Mudanças nos PCs até 21/11:** pendente, no mesmo ticket |

### Achados de 01/11

| Achado | Dono | Impacto |
|---|---|---|
| **Pelo IP ou pelo `nip.io`, `POST /api/auth/refresh` → 403 no console.** O `same_origin` ([deps.py](../../backend/app/auth/deps.py)) aceita só `Origin: https://${PUBLIC_HOST}`, como manda o [auth.md](../contracts/auth.md) §2.2. A casca chama o `/refresh` ao carregar, então quem abre o site por `https://10.13.2.2:8443` vê um 403 vermelho. O cookie de refresh também é por host, então a sessão não se mantém por esse nome | Akita (Nginx) ou Augusto (auth) | **Console sujo se o avaliador digitar o IP.** Proposta: no Nginx, qualquer `Host` diferente do `PUBLIC_HOST` leva `301` para `https://$PUBLIC_HOST`, e a regra de Origin fica como está. Até lá, a demo usa só o hostname |
| **A porta 9100 pode estar aberta no PC da 42.** Alguns PCs (o c3r2p2 sim; o c1r5p1, em 17/10, não) rodam o `prometheus-node-exporter` do sistema. Não é da stack | — | Nenhum para o projeto. Se o avaliador rodar um port scan, a 9100 responde, e a explicação é esta |
| **O `.env` de casa estava atrás da `main`.** Faltavam 19 chaves, entre elas o `JWT_SECRET` e as `GF_*` de sub-path. No PC A, elas foram copiadas do `.env.example`, e o `JWT_SECRET` foi gerado na hora | Akita | Sem o `GF_SERVER_SERVE_FROM_SUB_PATH`, o D7 quebraria. Atualizar o `.env` de casa e rodar o `diff` de chaves do §1.6 antes de cada demo |

## Correções propostas para o roteiro

Aplicadas no [roteiro](roteiro-teste-pc-42.md), que já está na `main`.

1. **Passo 0:** avisar que o goinfre e o certificado são por PC, e que o `data-root` no goinfre precisa ser configurado ([teste-2-pcs.md](teste-2-pcs.md) §1.3).
2. **Passo 6:** volumes do cAdvisor no rootless (acima).
3. **Passo 7:** o `/sgoinfre/<login>` nasce `drwx------`, então o `rootCA.pem` só chega ao cliente com `chmod 711` + `chmod 755` numa pasta própria, ou por Slack. Incluir também o caminho do Chrome novo: `chrome://settings/certificates` → Certificados locais → Personalizado → Instalados por você → Certificados confiáveis → Importar.
4. **Passo novo, depois do 8:** conferir o IP de origem no `docker compose logs proxy` e, no rootless, aplicar o override do `slirp4netns`.

## Saída do cliente-pc2.sh (01/11, c3r3p1 → c3r2p2)

```
== cliente: c3r3p1.42sp.org.br 10.13.3.1  2026-11-01 15:29:00
== servidor: c3r2p2.42sp.org.br 10.13.2.2 10-13-2-2.nip.io
== CA: subject=O = mkcert development CA, OU = gyasuhir@c3r8p2.42sp.org.br, CN = mkcert gyasuhir@c3r8p2.42sp.org.br
== D1: DNS (esperado: os dois nomes resolvem para 10.13.2.2)
10.13.2.2       c3r2p2.42sp.org.br
10.13.2.2       10-13-2-2.nip.io
== D1: alcance HTTP na 8080 (esperado: 301 nos três)
  c3r2p2.42sp.org.br     HTTP/1.1 301 Moved Permanently
  10.13.2.2              HTTP/1.1 301 Moved Permanently
  10-13-2-2.nip.io       HTTP/1.1 301 Moved Permanently
== D3: HTTPS validando a CA na 8443 (esperado: 200 em tudo)
  c3r2p2.42sp.org.br     /                                200 text/html
  c3r2p2.42sp.org.br     /api/health                      200 application/json
  c3r2p2.42sp.org.br     /assets/map/dungeon_wall_1.png   200 image/png
  10.13.2.2              /                                200 text/html
  10.13.2.2              /api/health                      200 application/json
  10.13.2.2              /assets/map/dungeon_wall_1.png   200 image/png
  10-13-2-2.nip.io       /                                200 text/html
  10-13-2-2.nip.io       /api/health                      200 application/json
  10-13-2-2.nip.io       /assets/map/dungeon_wall_1.png   200 image/png
== D3: o redirect leva a porta junto (esperado: Location: https://c3r2p2.42sp.org.br:8443/)
Location: https://c3r2p2.42sp.org.br:8443/
== D5: portas internas do servidor (esperado: fechada em todas)
  porta 8000  fechada
  porta 5432  fechada
  porta 9090  fechada
  porta 9100  ABERTA (problema!)
  porta 9187  fechada
  porta 3000  fechada
== D4: rate limit por IP (o servidor travou o login ANTES; esperado: 401, não 429)
  login com senha errada a partir deste PC: 401
== fim
```
