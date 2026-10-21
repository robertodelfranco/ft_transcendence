# Resultados do teste no PC da 42 (17/10/2026)

> Execução do [roteiro de teste no PC da 42](roteiro-teste-pc-42.md) (versão com o passo 8, da branch `31-roteiro-stack-real`) contra a `main` em `0c05d7b`.
>
> - **Servidor:** c1r5p1.42sp.org.br / 10.11.5.1, login `gyasuhir` (Akita).
> - **Quem fez o quê:** terminal e navegador pelo Akita.
> - **O que falta:** só o que depende de um 2º PC. O passo a passo, para qualquer pessoa do time, está em [teste-2-pcs.md](teste-2-pcs.md).

## Resumo para a reunião

### Decisões fechadas

| Decisão | Valor | Evidência | Confiança |
|---|---|---|---|
| Ambiente da demo | **direto no PC da 42, sem VM** | build do zero em ~1 min (pull + build); 4,8 GB no goinfre, que tem 51 GB livres; o home não é tocado | alta |
| Portas | **`PROXY_HTTP_PORT=8080`, `PROXY_HTTPS_PORT=8443`** | 80 e 443 falham no Docker rootless (`cannot expose privileged port`); 8080 e 8443 sobem | alta |
| `PUBLIC_HOST` | **`<hostname-do-PC>:8443`** (ex.: `c1r5p1.42sp.org.br:8443`) | redirect `http://…:8080/x?q` → `https://<host>:8443/x?q` em qualquer nome de entrada | alta (alcance de outro PC: D1) |
| SAN do certificado | **hostname, IP, `<ip-com-hifens>.nip.io`, `localhost`, `127.0.0.1`** | `curl --cacert` e o Chrome validam os três nomes, com cadeado limpo | alta |
| CA no Chrome | **importar o `rootCA.pem` pela interface, sem sudo** | funcionou no Chrome 155 (gerenciador de certificados novo). Plano B: `TRUST_STORES=nss mkcert -install`, porque o PC tem `certutil` | alta |
| IP real do cliente | **override de usuário com o port driver `slirp4netns`** em quem serve a demo | sem ele, todo cliente aparece como `172.18.0.1` e o rate limit vira global; com ele, o Nginx vê o IP real e um IP travado não trava o outro | alta (com IPs remotos: D4) |
| `X-Forwarded-For` forjado | não fura o rate limit | continua 429 com cabeçalho forjado, porque o Nginx substitui o valor (decisão 6) | alta |
| Exporters (D3) | **`node-exporter` funciona; cAdvisor também, com volumes próprios do rootless** | 1504 séries `node_*`; 7808 `container_*` com os containers por nome só montando o socket do containerd rootless | alta. Recomendação: só `node-exporter`, que é mais simples e não depende de caminho de rootless |
| F8.3 | **clone limpo + `.env` + `docker compose up` funciona** numa máquina que não é a de quem escreveu o compose | 4 serviços `healthy`; dados sobrevivem ao `down`; uma cabeça de Alembic | alta |
| F8.4 / #31 | **assets do jogo servidos pelo build de produção** | `/assets/map/dungeon_wall_1.png` → 200 `image/png`, visto no Chrome | alta. **O #31 pode ser fechado** |
| Onde o Docker guarda imagens e volumes | **goinfre** (`"data-root": "/goinfre/<login>/docker/"`); **o sgoinfre não funciona** | testado: com o `data-root` no sgoinfre, o Docker rootless nem inicia (`could not create or set daemon root permissions: chown /sgoinfre/gyasuhir/docker: invalid argument`), porque o NFS recusa o `chown`. O preço do goinfre é ser local de cada PC, e trocar de PC custa ~1 min de pull + build | alta |
| Postgres | **volume nomeado** (fica no `data-root`, então no goinfre) | consequência da linha anterior | alta |
| `nip.io` para o OAuth do Google | **viável do lado da rede** | `10-11-5-1.nip.io` resolve na rede da 42 | alta para o DNS; se o Google aceita, é o "Em aberto" 4 do `infra.md` (sai do formulário, não da rede) |

### Pendências: impacto e confiança

Tudo isto depende de um 2º PC. O passo a passo é o [teste-2-pcs.md](teste-2-pcs.md), uns 40 min com duas pessoas.

| # | O que falta | Confiança hoje | Impacto se falhar |
|---|---|---|---|
| **D1** | outro PC alcança o servidor (hostname, IP, `nip.io`) | **média**: a stack escuta em todas as interfaces e os nomes resolvem, mas o tráfego para o próprio IP não sai da máquina, então um firewall entre PCs passaria despercebido | **alto**: a demo em duas máquinas (C3, módulo Remote players, avaliação) muda de forma. Não há plano B pronto; seria decisão do time com o Tech Lead |
| D2 | importar a CA num Chrome de outro login; cadeado limpo | alta: o mesmo procedimento funcionou sem sudo, no mesmo Chrome dos PCs; o arquivo vai por Slack se o sgoinfre não deixar | baixo: é procedimento, não arquitetura |
| D3 | casca, `/api/health`, textura e redirect vistos de fora | alta, se a D1 passar: são as mesmas respostas validadas no servidor | ligado à D1 |
| D4 | o rate limit separa o PC2 do PC1 | alta: dois IPs de origem diferentes (10.11.5.1 e 10.0.2.2) já caíram em baldes separados com o `slirp4netns` | médio: se falhar, o rate limit vira global na demo (5 senhas erradas travam todos por 60 s; 5 cadastros/min para a sala inteira) |
| D5 | portas internas (8000, 5432, 9090, 9100, 3000) fechadas para outro PC | muito alta: só o `proxy` publica porta, e do próprio servidor estão todas fechadas | baixo |

### Prazos

- **O C3 (sex 23/10) é o primeiro checkpoint com duas máquinas.** O teste com 2 PCs precisa vir **antes**, para sobrar tempo de reagir se a D1 falhar.
- **O Akita não volta à 42 antes de 24–25/10**, depois do C3. Por isso o [teste-2-pcs.md](teste-2-pcs.md) foi escrito para qualquer pessoa do time servir do próprio login. Se alguém for à 42 durante a semana, vale fazer.
- Se ninguém fizer antes, o risco da D1 cai no próprio C3, e o Akita faz em 24–25/10.

### Achados para outros donos

| Achado | Dono | Impacto |
|---|---|---|
| **`POST /api/auth/refresh` → 404 no console a cada carregamento.** A casca chama a rota ao carregar (`frontend/src/api/client.ts`, `AuthProvider`), e o backend ainda não tem a rota (F6.3; `backend/app/auth/router.py`: "/refresh e /logout entram na F6.3"). Pelo [auth.md](../contracts/auth.md) §2.2 e §4 decisão 4, sem cookie ela responde 200 `{"authenticated": false}`, e o erro some sem mudar a infra | Augusto (F6.3) | **Hoje a `main` reprova o critério de console limpo.** Pré-requisito do C3 |
| **`/media/` não está roteado.** O `avatar_url` padrão (`/media/avatars/default.png`) devolve o `index.html` do SPA (200 `text/html`). Falta a decisão 13 do [infra.md](../contracts/infra.md): volume `media` + `location /media/` no proxy | Akita (F8) | avatar quebrado na primeira tela que mostrar um |
| **Extensões do Chrome sujam a aba Issues.** Um aviso "CSP blocks eval" apareceu, mas o site não manda CSP nem usa `eval`. Some em janela anônima. O perfil do PC tinha 17 extensões (MetaMask, Dark Reader, AdBlock...) | todos | **Demonstrar em janela anônima ou num perfil sem extensões**, na C3 e na avaliação |
| **O `data-root` no goinfre não é padrão da 42.** Quem servir a demo precisa configurá-lo, senão ~5 GB vão para o home (11 GB no total) | quem servir | [teste-2-pcs.md](teste-2-pcs.md) §1.3 |
| **O goinfre e o certificado são por PC.** Trocar de PC significa refazer o pull e o build (~1 min) e um `mkcert` novo; a CA e o `mkcert` ficam no home e acompanham o login | quem servir | planejar a demo num PC já preparado, ou com 2 min de folga |

### Próximos passos

1. Rodar o [teste-2-pcs.md](teste-2-pcs.md) antes de 23/10, ou em 24–25/10 com o Akita.
2. Com a D1 confirmada: atualizar o `infra.md` §5 item 1 (fechar o "Em aberto" com PC direto, 8080/8443 e `PUBLIC_HOST=<host>:8443`), a §2.1 (as portas publicadas) e a seção da demo com o override do `slirp4netns`.
3. Aplicar no roteiro as correções do fim deste arquivo.
4. Fechar o #31.

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

| # | Validação | Data / PCs | Resultado |
|---|---|---|---|
| D1 | o 2º PC alcança o servidor por hostname, IP e `nip.io` | | pendente |
| D2 | CA importada pela interface noutro Chrome; cadeado pelos três nomes; console só com o 404 do `/refresh` | | pendente |
| D3 | casca, `/api/health`, textura e redirect com a porta, vistos do 2º PC | | pendente |
| D4 | login travado no servidor não trava o 2º PC (`401`, não `429`), e o IP do 2º PC aparece no log do proxy | | pendente |
| D5 | portas 8000, 5432, 9090, 9100 e 3000 do servidor fechadas para o 2º PC | | pendente (do próprio servidor: todas fechadas) |

## Correções propostas para o roteiro

O roteiro vive na branch `31-roteiro-stack-real`.

1. **Passo 0:** avisar que o goinfre e o certificado são por PC, e que o `data-root` no goinfre precisa ser configurado ([teste-2-pcs.md](teste-2-pcs.md) §1.3).
2. **Passo 6:** volumes do cAdvisor no rootless (acima).
3. **Passo 7:** o `/sgoinfre/<login>` nasce `drwx------`, então o `rootCA.pem` só chega ao cliente com `chmod 711` + `chmod 755` numa pasta própria, ou por Slack. Incluir também o caminho do Chrome novo: `chrome://settings/certificates` → Certificados locais → Personalizado → Instalados por você → Certificados confiáveis → Importar.
4. **Passo novo, depois do 8:** conferir o IP de origem no `docker compose logs proxy` e, no rootless, aplicar o override do `slirp4netns`.
