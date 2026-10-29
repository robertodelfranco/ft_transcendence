# Teste com 2 PCs na 42

> Fecha o que o [teste de 17/10](resultados-teste-pc-42-2026-10-17.md) não conseguiu provar com uma máquina só: **outro PC da 42 alcança a stack, vê o cadeado limpo e o rate limit separa os clientes por IP.** Escrito para qualquer pessoa do time seguir sem contexto prévio. Precisa de **2 pessoas, 2 PCs da 42 e uns 40 min** (25 no servidor, 15 no cliente).
>
> **Data:** sábado, 31/10, com o Akita no servidor. Ninguém do time vai à 42 antes do C3 (sex 23/10), então o C3 mostra as duas máquinas fora da rede da 42, e a validação dentro dela fica para este dia. Como o teste vem depois do C4 (30/10), ele também cobre o que a S4 entregar: login pela 42, Grafana e co-op entre os dois PCs ([Parte 3](#parte-3-o-que-a-s4-entregou)). Com isso, a sessão passa de 40 min para cerca de 1h30.

## Por que importa

Num PC só, o tráfego para o próprio IP nunca sai da máquina: um firewall entre os PCs da 42 passaria despercebido. Se ele existir, a demo em duas máquinas (C3, módulo Remote players, avaliação) precisa mudar. A chance é baixa, mas o impacto seria alto, e é por isso que este teste vem antes do C3.

## Papéis

- **Servidor (PC A):** sobe a stack e gera o certificado. Pode ser qualquer pessoa do time, no próprio login.
- **Cliente (PC B):** roda um script e abre o Chrome. Não instala nada e não precisa de sudo.

Os PCs podem ser vizinhos. Se der, repita a parte 2 com um PC B **em outro cluster**: a rede entre clusters pode ter regra diferente.

---

## Parte 1: servidor (PC A)

Todos os comandos vão no terminal do PC A. Não precisa de sudo em nenhum passo.

### 1.1 Anotar quem é o servidor

```bash
HOST=$(hostname -f); IP=$(hostname -I | awk '{print $1}'); NIP=${IP//./-}.nip.io
echo "HOST=$HOST IP=$IP NIP=$NIP"
```

Anote os três valores: o cliente vai precisar deles. Exemplo: `HOST=c1r5p1.42sp.org.br IP=10.11.5.1 NIP=10-11-5-1.nip.io`.

> As variáveis valem só neste terminal. Se abrir outro, rode o bloco de novo.

### 1.2 Docker rootless funcionando

```bash
docker info 2>/dev/null | grep -E 'rootless|Docker Root Dir'
```

- **Esperado:** uma linha `rootless` e o `Docker Root Dir`.
- **Se não mostrar nada** (o Docker nunca foi configurado neste login): rode `dockerd-rootless-setuptool.sh install`, feche e abra o terminal, e rode o `docker info` de novo. Se ainda falhar, pare e chame o Akita.

### 1.3 Imagens no goinfre, não no home

As imagens e o build ocupam uns 5 GB, e o home da 42 tem só 11 GB. **Isso não vem configurado por padrão.**

```bash
docker info -f '{{.DockerRootDir}}'
cat ~/.config/docker/daemon.json 2>/dev/null
```

- **Se o caminho já começa com `/goinfre/`:** pule para o 1.4.
- **Se não** (por exemplo `~/.local/share/docker`), e o `cat` não mostrou nada:
  ```bash
  mkdir -p /goinfre/$USER/docker ~/.config/docker
  echo "{ \"data-root\": \"/goinfre/$USER/docker/\" }" > ~/.config/docker/daemon.json
  ```
- **Se o `cat` mostrou um arquivo com outras chaves:** acrescente `"data-root": "/goinfre/<seu-login>/docker/"` à mão, sem apagar o resto.

O restart vem no 1.4.

> O goinfre é **local de cada PC**. Trocar de PC significa refazer o pull e o build (≈ 1 min). As imagens antigas ficam no goinfre do PC anterior.
>
> **Não use o sgoinfre como `data-root`**, mesmo ele acompanhando o login. Testado em 17/10: o Docker rootless nem inicia (`chown /sgoinfre/<login>/docker: invalid argument`), porque o sgoinfre é NFS e recusa o `chown`. Se isso acontecer, volte o `daemon.json` para o goinfre e rode `systemctl --user reset-failed docker && systemctl --user restart docker`.

### 1.4 Fazer o Docker enxergar o IP real do cliente

Sem isto, o Nginx vê todo cliente com o mesmo IP interno (`172.18.0.1`), e o rate limit vira global: 5 senhas erradas em **qualquer** PC travam o login de **todos** por 60 s. Detalhes no [resultado de 17/10](resultados-teste-pc-42-2026-10-17.md#achado-o-rootless-da-42-esconde-o-ip-do-cliente).

```bash
mkdir -p ~/.config/systemd/user/docker.service.d
cat > ~/.config/systemd/user/docker.service.d/override.conf <<'EOF'
# ft_transcendence: o driver builtin do rootlesskit não repassa o IP de origem
[Service]
Environment="DOCKERD_ROOTLESS_ROOTLESSKIT_PORT_DRIVER=slirp4netns"
EOF
systemctl --user daemon-reload && systemctl --user restart docker && sleep 3
ps -eo args | grep -o -- '--port-driver=[a-z0-9]*' | sort -u
docker info -f '{{.DockerRootDir}}'
```

**Esperado:** `--port-driver=slirp4netns` e um caminho em `/goinfre/`. Os dois arquivos ficam no home e acompanham o seu login em qualquer PC.

### 1.5 Certificado para este PC

O `mkcert` cria uma CA (autoridade certificadora) no seu home e, com ela, um certificado com os nomes deste PC. O cliente vai importar só a parte pública da CA, o `rootCA.pem`.

```bash
[ -x ~/bin/mkcert ] || { mkdir -p ~/bin && curl -fsSL -o ~/bin/mkcert "https://dl.filippo.io/mkcert/latest?for=linux/amd64" && chmod +x ~/bin/mkcert; }
mkdir -p ~/teste-2-pcs/certs && cd ~/teste-2-pcs
~/bin/mkcert -cert-file certs/cert.pem -key-file certs/key.pem "$HOST" "$IP" "$NIP" localhost 127.0.0.1
cp "$(~/bin/mkcert -CAROOT)/rootCA.pem" ~/teste-2-pcs/rootCA.pem
openssl x509 -in certs/cert.pem -noout -ext subjectAltName
```

**Esperado:** o SAN lista o `$HOST`, o `$NIP`, `localhost`, o `$IP` e `127.0.0.1`.

> **Nunca** copie, mande ou coloque no sgoinfre o `rootCA-key.pem`. É a chave que assina certificados em que o seu Chrome confia. Ele fica em `$(~/bin/mkcert -CAROOT)`, no home, e não sai de lá.

### 1.6 Subir a stack

```bash
cd ~/teste-2-pcs && git clone https://github.com/robertodelfranco/ft_transcendence.git && cd ft_transcendence
cp .env.example .env
sed -i "s|^POSTGRES_USER=.*|POSTGRES_USER=transcendence|; \
  s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(python3 -c 'import secrets; print(secrets.token_hex(16))')|; \
  s|^JWT_SECRET=.*|JWT_SECRET=$(python3 -c 'import secrets; print(secrets.token_urlsafe(48))')|; \
  s|^PUBLIC_HOST=.*|PUBLIC_HOST=$HOST:8443|; \
  s|^PROXY_HTTP_PORT=.*|PROXY_HTTP_PORT=8080|; s|^PROXY_HTTPS_PORT=.*|PROXY_HTTPS_PORT=8443|; \
  s|^GF_SECURITY_ADMIN_USER=.*|GF_SECURITY_ADMIN_USER=admin|; \
  s|^GF_SECURITY_ADMIN_PASSWORD=.*|GF_SECURITY_ADMIN_PASSWORD=$(python3 -c 'import secrets; print(secrets.token_hex(12))')|" .env
grep -E '^(PUBLIC_HOST|PROXY_|GF_SECURITY_ADMIN_)' .env
cp ../certs/cert.pem ../certs/key.pem proxy/certs/
stat -c '%a %n' monitoring/prometheus/prometheus.yml
docker compose up -d --build --wait --wait-timeout 300
docker compose ps -a
docker compose exec prometheus wget -qO- localhost:9090/api/v1/targets | grep -o '"health":"[a-z]*"'
```

**Esperado:**
- o `grep` mostra `PUBLIC_HOST=<seu-host>:8443`, `PROXY_HTTP_PORT=8080`, `PROXY_HTTPS_PORT=8443` e o admin do Grafana: **anote a senha**, é a do D7 (§3.2)
- o `up` termina sem erro em 1–2 min
- o `stat` mostra `644` (com `600`, o Prometheus do rootless não lê o arquivo: rode `chmod -R go+rX monitoring` e suba de novo)
- `db`, `backend`, `frontend`, `proxy`, `prometheus`, `grafana`, `node-exporter` e `postgres-exporter` aparecem `Up`, e **só o `proxy`** tem `0.0.0.0:...` na coluna de portas
- o último comando mostra `"health":"up"` três vezes (backend, node e postgres). Logo depois do `up`, um deles pode aparecer `unknown`: espere 15 s e repita

As portas são 8080/8443 porque o Docker rootless da 42 não abre portas abaixo de 1024 (80 e 443 falham). Se o `up` falhar, rode `docker compose logs backend proxy | tail -50` e mande a saída para o Akita.

### 1.7 Testar o servidor por ele mesmo

Isto separa problema da stack de problema de rede. Se passar aqui e falhar no PC B, o culpado é a rede.

```bash
sh ~/teste-2-pcs/ft_transcendence/docs/infra/cliente-pc2.sh "$HOST" "$IP" ~/teste-2-pcs/rootCA.pem
```

**Esperado:** `301` nos três nomes, `200` em todas as linhas do D3, `Location: https://<host>:8443/` e `fechada` em todas as portas do D5. O D4 aqui pode dar `401` ou `429`: ele só vale a partir do PC B.

> Se o script não existir no clone (a branch dele ainda não entrou na `main`), copie o arquivo `docs/infra/cliente-pc2.sh` de quem preparou este teste.

### 1.8 Mandar os arquivos para o cliente

O cliente precisa de dois arquivos: `~/teste-2-pcs/rootCA.pem` e `~/teste-2-pcs/ft_transcendence/docs/infra/cliente-pc2.sh`. Os dois são públicos.

- **Jeito simples:** mande por Slack ou e-mail.
- **Pelo sgoinfre:** o `/sgoinfre/<seu-login>` nasce `drwx------`, e ninguém mais lê. Para liberar só uma pasta:
  ```bash
  mkdir -p /sgoinfre/$USER/teste-2-pcs
  cp ~/teste-2-pcs/rootCA.pem ~/teste-2-pcs/ft_transcendence/docs/infra/cliente-pc2.sh /sgoinfre/$USER/teste-2-pcs/
  chmod 711 /sgoinfre/$USER && chmod 755 /sgoinfre/$USER/teste-2-pcs
  ```
  O `711` deixa os outros atravessarem a sua pasta sem listá-la; as outras pastas suas continuam fechadas, se já eram `700`.

Passe também para o cliente o `HOST` e o `IP` do 1.1.

### 1.9 Deixar o log aberto

Num terminal separado, no PC A:

```bash
cd ~/teste-2-pcs/ft_transcendence && docker compose logs -f proxy | awk '{print $3, $8, $9, $11}'
```

Cada linha mostra o IP de quem fez a requisição, o método, o caminho e o status. Quando o PC B começar, **o IP dele precisa aparecer aqui**, e não `172.18.0.1`.

---

## Parte 2: cliente (PC B)

### 2.1 Pegar os arquivos

```bash
mkdir -p ~/teste-2-pcs
# se veio por Slack/e-mail: salve o rootCA.pem e o cliente-pc2.sh em ~/teste-2-pcs/
# se veio pelo sgoinfre (troque <login-do-servidor>):
cp /sgoinfre/<login-do-servidor>/teste-2-pcs/rootCA.pem /sgoinfre/<login-do-servidor>/teste-2-pcs/cliente-pc2.sh ~/teste-2-pcs/
```

### 2.2 Rodar o script

1. **O servidor trava o login dele primeiro.** Logo antes de o cliente rodar, o PC A executa:
   ```bash
   for i in 1 2 3 4 5 6; do curl -s --cacert ~/teste-2-pcs/rootCA.pem -o /dev/null -w '%{http_code} ' -H 'Content-Type: application/json' -d '{"email":"teste-2-pcs@example.com","password":"errada-errada"}' "https://$HOST:8443/api/auth/login"; done; echo
   ```
   **Esperado:** `401 401 401 401 401 429`. A trava dura 60 s.
2. **Em seguida (menos de 1 minuto depois), o cliente roda**, trocando `<HOST>` e `<IP>` pelos valores do servidor:
   ```bash
   sh ~/teste-2-pcs/cliente-pc2.sh <HOST> <IP> ~/teste-2-pcs/rootCA.pem 2>&1 | tee ~/teste-2-pcs/saida.txt
   ```
3. Mande o `~/teste-2-pcs/saida.txt` para quem está no servidor.

**Esperado na saída:**

| Bloco | Esperado | O que prova |
|---|---|---|
| D1 DNS | os dois nomes resolvem para o IP do servidor | a rede da 42 resolve o hostname e o nip.io |
| D1 HTTP | `301` nos três | **o firewall deixa um PC falar com o outro** |
| D3 | `200` em todas as linhas | TLS validado pela CA e a stack respondendo |
| D3 redirect | `Location: https://<HOST>:8443/` | o redirect mantém a porta |
| D5 | `fechada` em 8000, 5432, 9090, 9100, 9187 e 3000 | só o proxy está exposto |
| D4 | **`401`** (não `429`) | a trava do PC A não pegou o PC B: rate limit por IP real |

### 2.3 Chrome

1. Abra `chrome://settings/certificates`.
   - No Chrome novo (é o dos PCs da 42 em 10/2026): **Certificados locais** → **Personalizado** → **Instalados por você** → **Certificados confiáveis** → **Importar** e escolha `~/teste-2-pcs/rootCA.pem`.
   - No Chrome antigo (janela com abas): aba **Autoridades** → **Importar**, escolha o arquivo e marque **"Confiar neste certificado para identificar sites"**.
2. Feche **todas** as janelas do Chrome e abra de novo.
3. Abra uma **janela anônima** (`Ctrl+Shift+N`). As extensões ficam desligadas nela; o perfil dos PCs costuma ter várias, e elas sujam a aba Issues com avisos de CSP que não são do site. A CA importada vale também na anônima.
4. Aperte **F12**, deixe nas abas **Console** e **Issues**, e abra um endereço de cada vez:

| # | Endereço | Esperado |
|---|---|---|
| a | `https://<HOST>:8443/` | abre a casca **sem** tela de aviso; o ícone à esquerda da URL diz "A conexão é segura" |
| b | `https://<IP>:8443/` | igual ao (a) |
| c | `https://<IP-com-hifens>.nip.io:8443/` | igual ao (a) |
| d | `https://<HOST>:8443/api/health` | `{"status":"ok"}` |
| e | `https://<HOST>:8443/assets/map/dungeon_wall_1.png` | a textura de uma parede |
| f | `http://<HOST>:8080/` (http, sem s) | vai sozinho para `https://<HOST>:8443/` |

**Console:** a F6.3 (`/api/auth/refresh`, do Augusto) entrou na `main` em 21/10 (#131), então o `POST /api/auth/refresh 404` não deve mais aparecer. Qualquer coisa vermelha ou amarela vale anotar e mandar print.

### 2.4 Desfazer no PC B

1. Volte em `chrome://settings/certificates` → **Certificados locais** → **Personalizado** → **Instalados por você** → **Certificados confiáveis**, ache "mkcert development CA" e clique em **Excluir**. No Chrome antigo, é a aba **Autoridades**, item "org-mkcert development CA".
2. Apague a pasta: `rm -rf ~/teste-2-pcs`.

> Se for fazer a Parte 3, deixe o 2.4 para o fim: ela usa a mesma CA no Chrome do PC B.

---

## Parte 3: o que a S4 entregou

Cada item só entra se a tarefa estiver na `main` em 30/10. O que não estiver fica como "não testado" na tabela e não bloqueia o resto. Use a mesma janela anônima do 2.3 no PC B.

### 3.1 D6: login pela 42 de outro PC (F6.8)

**Antes, no PC A:**
1. No app da intra (perfil do Akita), acrescente a URL de retorno `https://<HOST>:8443/api/auth/oauth/42/callback`, com o `HOST` do 1.1. O backend monta essa URL a partir do `PUBLIC_HOST`, então host e porta precisam ser exatamente esses.
2. Preencha `FT_CLIENT_ID` e `FT_CLIENT_SECRET` no `.env` do 1.6, com o secret novo que a intra gerou sozinha em 30/10 (o anterior vence em 06/11), e rode `docker compose up -d` de novo.

**No PC B:** abra `https://<HOST>:8443/login`, clique no botão da 42 e autorize na intra.

**Esperado:** a intra devolve para `https://<HOST>:8443/` já logado, e o console fica limpo durante todo o caminho.

### 3.2 D7: Grafana de outro PC (F8.11)

**No PC B:**
1. Abra `https://<HOST>:8443/grafana/`. **Esperado:** a tela de login do Grafana, com cadeado limpo e sem CSS quebrado.
2. No terminal, sem login:
   ```bash
   curl -s --cacert ~/teste-2-pcs/rootCA.pem -o /dev/null -w '%{http_code}\n' "https://<HOST>:8443/grafana/api/dashboards/home"
   ```
   **Esperado:** `401`.
3. Entre com o admin do `.env` do PC A. **Esperado:** os dashboards aparecem, com dados.
4. Abra `https://<HOST>:8443/grafana`, **sem a barra no fim**. **Esperado:** cai em `https://<HOST>:8443/grafana/...`, com a porta, e não na 443.
5. Com o DevTools aberto (F12, aba Console) num dashboard. **Esperado:** console sem erros, inclusive de WebSocket (o Grafana Live).
6. Deixe o dashboard "Jogo e backend" aberto durante o D8. **Esperado:** o painel do tick e o de Rooms se mexem enquanto a partida roda.

As portas 9090 e 3000 fechadas já estão no D5.

### 3.3 D8: co-op entre os dois PCs (critério do C3)

1. No PC A e no PC B, cada pessoa entra com a própria conta (cadastro ou 42).
2. O PC A cria uma Room no lobby. **Esperado:** ela aparece no lobby do PC B sem recarregar a página.
3. O PC B entra na Room, os dois marcam pronto e o PC A inicia. **Esperado:** `/play` abre nos dois.
4. Cada um anda pela masmorra. **Esperado:** cada um vê o outro se mexer sem teleporte. No DevTools, aba **Network** → **WS**, a conexão é `wss://<HOST>:8443/...`.
5. Joguem até o fim (boss morto ou todos mortos). **Esperado:** no PC A,
   ```bash
   docker compose exec db psql -U transcendence -d transcendence -c "select status, created_at from matches order by created_at desc limit 3"
   ```
   mostra a partida como `finished`.

O console precisa ficar limpo nos dois PCs do começo ao fim.

---

## Parte 4: registrar

Preencha a tabela "Pendente 2º PC" em [resultados-teste-pc-42-2026-10-17.md](resultados-teste-pc-42-2026-10-17.md#pendente-2º-pc) com data, PCs (o servidor e o cliente, e se eram do mesmo cluster) e o resultado de cada item. Acrescente as linhas D6, D7 e D8 da Parte 3. Cole o `saida.txt` no fim do arquivo. Depois, abra PR seguindo o fluxo do README.

## Se algo falhar

| Sintoma no PC B | Causa provável | O que fazer |
|---|---|---|
| D1 sem resposta em todos os nomes, mas o 1.7 passou no PC A | **firewall entre os PCs** | Teste `nc -zv <HOST> 8443` do PC B; tente um PC B do mesmo cluster e um de outro; anote quais pares falham. **Não tem plano B pronto**: avise o Akita e o Roberto (Tech Lead) no mesmo dia, porque isso muda a demo do C3 |
| D1 responde pelo IP, mas não pelo hostname | DNS interno | Anote. Dá para usar `PUBLIC_HOST=<IP>:8443` (o IP já está no certificado) |
| `nip.io` não resolve só no PC B | DNS público bloqueado nesse PC | Anote: afeta só o login pelo Google fora do `localhost` |
| D3 com `000` ou erro de certificado | `rootCA.pem` errado (de outro servidor) ou certificado gerado em outro PC | No PC A, confira o SAN (1.5) e mande o `rootCA.pem` do login que rodou o `mkcert` |
| D3 com `502` | a stack caiu | No PC A: `docker compose ps -a` e `docker compose logs backend proxy \| tail -50` |
| D4 com `429` | o 1.4 não foi aplicado, ou o PC A travou o login pelo `localhost` em vez do `$HOST` | No PC A: `ps -eo args \| grep -o -- '--port-driver=[a-z0-9]*'` deve dizer `slirp4netns`; no log do 1.9, o IP do PC B deve aparecer |
| D5 com porta `ABERTA` | algo além do proxy está publicando porta | No PC A: `docker compose ps` e anote qual serviço |
| Chrome mostra aviso de certificado | CA não importada, Chrome não reiniciado, ou o nome não está no SAN | Refazer o 2.3 fechando todas as janelas; conferir o SAN no PC A |
| D6: a intra recusa a URL de retorno | a URL cadastrada no app não bate com o `PUBLIC_HOST` (host ou porta) | Conferir o 3.1, passo 1, contra o `grep PUBLIC_HOST .env` do PC A |
| D6: volta da intra para `/login?error=...` | secret errado ou vencido, ou o cookie `oauth_state` se perdeu | No PC A: `docker compose logs backend \| tail -50` |
| D7: `502` ou página sem CSS em `/grafana/` | Grafana fora do ar, ou a URL raiz dele não bate com o `PUBLIC_HOST` | No PC A: `docker compose ps grafana` e `docker compose logs grafana \| tail -50` |
| D8: o lobby não atualiza ou o `/play` não conecta | o `/ws/app` ou o `/ws/game` caiu (é a mesma porta da D1, então não é rede) | Print do Console e da aba WS nos dois PCs; no PC A, `docker compose logs backend \| tail -50` |

## Limpeza

**PC A:**
- Derrube a stack: `cd ~/teste-2-pcs/ft_transcendence && docker compose down -v`.
- Apague a pasta, se quiser: `rm -rf ~/teste-2-pcs`. O `~/bin/mkcert` e a CA ficam para a próxima.
- O `override.conf` do 1.4 pode ficar: só melhora o Docker para este projeto. Para desfazer: `rm ~/.config/systemd/user/docker.service.d/override.conf && systemctl --user daemon-reload && systemctl --user restart docker`.
- Se usou o sgoinfre: `rm -rf /sgoinfre/$USER/teste-2-pcs && chmod 700 /sgoinfre/$USER`.

**PC B:** já ficou limpo no 2.4.
