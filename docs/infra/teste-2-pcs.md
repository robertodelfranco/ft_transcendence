# Teste com 2 PCs na 42

> Fecha o que o [teste de 17/10](resultados-teste-pc-42-2026-10-17.md) não conseguiu provar com uma máquina só: **outro PC da 42 alcança a stack, vê o cadeado limpo e o rate limit separa os clientes por IP.** Escrito para qualquer pessoa do time seguir sem contexto prévio.
>
> **Data:** domingo, 01/11 (estava marcado para 31/10). O Akita serve, com 1 ou 2 pessoas do time. Como vem depois do C4 (30/10), o teste também cobre o que a S4 entregou: login pela 42, Grafana e co-op entre os PCs ([Parte 3](#parte-3-o-que-a-s4-entregou)). Além disso, cobre o que só se prova no hardware e na rede da 42: co-op com 3 ou mais players, fps, versão do Chrome, um login sem Docker configurado e as perguntas ao staff ([Parte 4](#parte-4-o-que-só-sai-na-42)). **Tudo o que depende de estar na 42 precisa sair hoje.**

## Por que importa

Num PC só, o tráfego para o próprio IP nunca sai da máquina: um firewall entre os PCs da 42 passaria despercebido. Se ele existir, a demo em duas máquinas (módulo Remote players, avaliação) precisa mudar. A chance é baixa, mas o impacto seria alto, e não há plano B pronto.

## Papéis

- **Servidor (PC A):** sobe a stack e gera o certificado. Hoje é o Akita, com o `.env` trazido de casa (§0.1).
- **Cliente (PC B):** roda um script e abre o Chrome. Não instala nada e não precisa de sudo.
- **PC C, se houver uma 3ª pessoa:** fica em **outro cluster**, porque a rede entre clusters pode ter regra diferente e ainda não se sabe em qual será a defesa (N5). Com só 2 pessoas, uma delas repete a Parte 2 num PC de outro cluster.

## Ordem do dia

| # | O que | Onde | Tempo |
|---|---|---|---|
| 1 | §0: `.env` e secret da 42 | PC A | 5 min |
| 2 | Parte 1: servidor | PC A | 25 min |
| 3 | Parte 2: D1–D5 com um PC B do mesmo cluster | PC B | 15 min |
| 4 | Parte 2 de novo, num PC de **outro cluster** | PC C (ou o PC B mudando de lugar) | 10 min |
| 5 | Parte 3: D6 (login pela 42), D7 (Grafana), D8 (co-op e reconexão) | todos | 45 min |
| 6 | Parte 4: N1 + N2 juntos, N3 | todos | 25 min |
| 7 | N5 (staff), em paralelo com 5–6 | quem estiver livre | 10 min |
| 8 | N4, opcional: só se alguém do grupo nunca usou Docker na 42 | login dessa pessoa | 30 min |
| 9 | Parte 5: registrar; limpeza | todos | 15 min |

Total: cerca de 2h30.

---

## Parte 0: antes de começar (PC A)

### 0.1 O `.env` de casa

O Akita traz o `.env` de casa, que já tem o `FT_CLIENT_ID`, o `FT_CLIENT_SECRET`, o `JWT_SECRET` e o admin do Grafana. No PC A, ele só muda a borda (§1.6).

- **Na 42, o `.env` fica no home** (`~/teste-2-pcs/ft_transcendence/.env`, com `chmod 600`). **Nunca no sgoinfre**, nem em pasta aberta a outros, e ele nunca é commitado: está no `.gitignore`.
- **Para passar ao time:** por mensagem direta, nunca em canal. Só quem serve a stack precisa do `.env` inteiro. Os clientes só precisam da senha do Grafana (D7), e só se forem eles a entrar no Grafana.
- Se outra pessoa servir sem o `.env` de casa, o §1.6 tem o caminho a partir do `.env.example`. Nesse caso, o D6 só roda se o Akita passar o `FT_CLIENT_ID` e o `FT_CLIENT_SECRET`.

### 0.2 O secret da 42: trocar hoje

A intra gerou um secret novo em 30/10, e o atual vence em **06/11**, antes da defesa (21/11). **Recomendação: trocar hoje, na 42, antes do D6.** Assim, o D6 valida o secret que vai até a defesa, e o 06/11 não derruba o login pela 42 de ninguém sem aviso.

1. No app da intra (perfil do Akita), pegue o secret novo. Se houver a opção de substituir já, use. O `FT_CLIENT_ID` não muda.
2. Troque o `FT_CLIENT_SECRET` no `.env` do PC A **antes** do `up` do §1.6. Se a stack já estiver de pé, troque e rode `docker compose up -d` de novo.
3. **Se o D6 falhar logo depois da troca** (volta para `/login?error=...`, com `invalid_client` em `docker compose logs backend`), o secret novo ainda não está ativo. Volte para o atual e faça o D6 com ele. A troca fica para 06/11, e o reteste pode ser em casa, pelo `localhost`, porque não depende da 42.
4. Depois da troca, o secret antigo deixa de valer quando a intra o expirar. **Atualize também o `.env` de casa** e avise quem tiver uma cópia.

Anote o resultado na linha D6 da Parte 5: qual secret foi usado e se a troca já valeu.

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
```

**Com o `.env` trazido de casa (§0.1):** copie e troque só a borda. Banco, JWT, OAuth e Grafana ficam como vieram. Antes do `up`, troque o `FT_CLIENT_SECRET` se for fazer o §0.2.

```bash
cp <caminho-do-.env-de-casa> .env && chmod 600 .env
sed -i "s|^PUBLIC_HOST=.*|PUBLIC_HOST=$HOST:8443|; \
  s|^PROXY_HTTP_PORT=.*|PROXY_HTTP_PORT=8080|; s|^PROXY_HTTPS_PORT=.*|PROXY_HTTPS_PORT=8443|" .env
diff <(grep -o '^[A-Z0-9_]*=' .env.example | sort) <(grep -o '^[A-Z0-9_]*=' .env | sort)
grep -E '^(FT_CLIENT_ID|FT_CLIENT_SECRET|GF_SECURITY_ADMIN_USER|GF_SECURITY_ADMIN_PASSWORD)=.' .env | cut -d= -f1
```

- o `diff` não mostra nada: o `.env` tem as mesmas chaves que o `.env.example` da `main`. Se faltar alguma, copie a linha do `.env.example`
- o último `grep` lista as quatro chaves preenchidas, sem mostrar os valores

**Sem o `.env` de casa** (outra pessoa servindo): gere um do zero. As chaves `FT_*` ficam vazias, e o D6 não roda até alguém preenchê-las.

```bash
cp .env.example .env && chmod 600 .env
sed -i "s|^POSTGRES_USER=.*|POSTGRES_USER=transcendence|; \
  s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(python3 -c 'import secrets; print(secrets.token_hex(16))')|; \
  s|^JWT_SECRET=.*|JWT_SECRET=$(python3 -c 'import secrets; print(secrets.token_urlsafe(48))')|; \
  s|^PUBLIC_HOST=.*|PUBLIC_HOST=$HOST:8443|; \
  s|^PROXY_HTTP_PORT=.*|PROXY_HTTP_PORT=8080|; s|^PROXY_HTTPS_PORT=.*|PROXY_HTTPS_PORT=8443|; \
  s|^GF_SECURITY_ADMIN_USER=.*|GF_SECURITY_ADMIN_USER=admin|; \
  s|^GF_SECURITY_ADMIN_PASSWORD=.*|GF_SECURITY_ADMIN_PASSWORD=$(python3 -c 'import secrets; print(secrets.token_hex(12))')|" .env
grep -E '^GF_SECURITY_ADMIN_' .env     # anote a senha: é a do D7 (§3.2)
```

**Nos dois casos**, siga com:

```bash
grep -E '^(PUBLIC_HOST|PROXY_)' .env
cp ../certs/cert.pem ../certs/key.pem proxy/certs/
stat -c '%a %n' monitoring/prometheus/prometheus.yml
docker compose up -d --build --wait --wait-timeout 300
docker compose ps -a
docker compose exec prometheus wget -qO- localhost:9090/api/v1/targets | grep -o '"health":"[a-z]*"'
```

**Esperado:**
- o `grep` mostra `PUBLIC_HOST=<seu-host>:8443`, `PROXY_HTTP_PORT=8080` e `PROXY_HTTPS_PORT=8443`
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

### 1.8 Mandar os arquivos para o cliente

O cliente precisa de dois arquivos: `~/teste-2-pcs/rootCA.pem` e `~/teste-2-pcs/ft_transcendence/docs/infra/cliente-pc2.sh`. Os dois são públicos, ao contrário do `.env`.

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

Faça esta parte uma vez com um PC do mesmo cluster do PC A e outra com um PC de **outro cluster** (o PC C, ou o PC B mudando de lugar). Anote os dois resultados separados.

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

**Console:** qualquer coisa vermelha ou amarela vale anotar e mandar print.

### 2.4 Desfazer no PC B

1. Volte em `chrome://settings/certificates` → **Certificados locais** → **Personalizado** → **Instalados por você** → **Certificados confiáveis**, ache "mkcert development CA" e clique em **Excluir**. No Chrome antigo, é a aba **Autoridades**, item "org-mkcert development CA".
2. Apague a pasta: `rm -rf ~/teste-2-pcs`.

> Deixe o 2.4 para o fim do dia: as Partes 3 e 4 usam a mesma CA no Chrome de cada cliente. Vale para todo PC em que a CA foi importada.

---

## Parte 3: o que a S4 entregou

Use a mesma janela anônima do 2.3 em cada cliente.

### 3.1 D6: login pela 42 de outro PC (F6.8)

**Antes, no PC A:**
1. No app da intra (perfil do Akita), **acrescente** a URL de retorno `https://<HOST>:8443/api/auth/oauth/42/callback`, com o `HOST` do 1.1, sem apagar a de `localhost`. O backend monta essa URL a partir do `PUBLIC_HOST`, então host e porta precisam ser exatamente esses.
2. Confira o `FT_CLIENT_SECRET` do §0.2. Se mexeu no `.env`, rode `docker compose up -d` de novo.

**Anote o que o formulário da intra mostrar.** É a última pergunta em aberto do [infra.md](../contracts/infra.md) §5, item 4:
- se aceita a URL com porta e hostname, e se aceita também `https://<NIP>:8443/...`;
- **quantas URLs de retorno cabem**. O PC da defesa ainda não está definido (N5), e cada PC tem um hostname, então a intra precisa aceitar a URL de cada PC candidato;
- se a URL nova vale na hora ou demora.

**No PC B:** abra `https://<HOST>:8443/login`, clique no botão da 42 e autorize na intra. **Faça uma vez com a conta 42 de quem não é dono do app** (não o Akita) e uma vez com a do Akita, cada uma numa janela anônima nova.

**Esperado:** nos dois casos, a intra devolve para `https://<HOST>:8443/` já logado, e o console fica limpo durante todo o caminho. Uma conta nova aparece com o `login` da 42 como `username`.

### 3.2 D7: Grafana de outro PC (F8.11)

**No PC B:**
1. Abra `https://<HOST>:8443/grafana/`. **Esperado:** a tela de login do Grafana, com cadeado limpo e sem CSS quebrado.
2. No terminal, sem login:
   ```bash
   curl -s --cacert ~/teste-2-pcs/rootCA.pem -o /dev/null -w '%{http_code}\n' "https://<HOST>:8443/grafana/api/dashboards/home"
   ```
   **Esperado:** `401`.
3. Entre com o admin do `.env` do PC A (`GF_SECURITY_ADMIN_USER` e `GF_SECURITY_ADMIN_PASSWORD`). **Esperado:** os dashboards aparecem, com dados.
4. Abra `https://<HOST>:8443/grafana`, **sem a barra no fim**. **Esperado:** cai em `https://<HOST>:8443/grafana/...`, com a porta, e não na 443.
5. Com o DevTools aberto (F12, aba Console) num dashboard. **Esperado:** console sem erros, inclusive de WebSocket (o Grafana Live).
6. Deixe o dashboard "Jogo e backend" aberto durante o D8 e o N1. **Esperado:** o painel do tick e o de Rooms se mexem enquanto a partida roda.

As portas 9090 e 3000 fechadas já estão no D5.

### 3.3 D8: co-op entre os dois PCs, com reconexão

1. No PC A e no PC B, cada pessoa entra com a própria conta (cadastro ou 42).
2. O PC A cria uma Room no lobby. **Esperado:** ela aparece no lobby do PC B sem recarregar a página.
3. O PC B entra na Room, os dois marcam pronto e o PC A inicia. **Esperado:** `/play/<id>` abre nos dois.
4. Cada um anda pela masmorra. **Esperado:** cada um vê o outro se mexer sem teleporte. No DevTools, aba **Network** → **WS**, a conexão é `wss://<HOST>:8443/...`.
5. **Reconexão (F2.10, módulo Remote players).** No meio da partida, o PC B fecha a aba do jogo e, em menos de 30 s, reabre com `Ctrl+Shift+T` (ou abre `https://<HOST>:8443/play/<id>` de novo). **Esperado:** no PC A, a lista de Players da HUD mostra o do PC B apagado e "offline"; o PC B volta para a mesma partida, no mesmo lugar, sem erro no console. Repita deixando passar **mais de 30 s**. **Esperado:** o player do PC B sai da partida, e o PC A continua jogando.
6. Joguem até o fim (boss morto ou todos mortos). **Esperado:** no PC A,
   ```bash
   docker compose exec db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "select m.id, m.status, count(p.user_id) as players, bool_or(p.disconnected_at_end) as alguem_saiu from matches m left join match_players p on p.match_id = m.id group by m.id order by m.id desc limit 3"'
   ```
   mostra a partida como `finished`, com os players que jogaram.

O console precisa ficar limpo nos dois PCs do começo ao fim.

---

## Parte 4: o que só sai na 42

Estes itens não dependem da rede entre PCs, mas sim do hardware, do Chrome e das regras do campus. Só se provam lá.

### 4.1 N1: co-op com 3 ou mais players (módulo Multiplayer 3+)

Depois do D8. É o critério do módulo: 3 ou mais players (até 5) na mesma Room, todos sincronizados.

**Quantos players:** quantos der, até 5 (o mapa co-op tem 5 Spawns). Com 3 pessoas, um player por PC. **Com 2 pessoas**, o 3º player é um PC a mais operado por uma delas, ou, no mínimo, uma 2ª janela anônima do Chrome num dos PCs, com outra conta. Cada player precisa ficar numa **janela** própria, lado a lado, e nunca em abas da mesma janela: o Chrome desacelera a aba escondida e o player trava. Cada player usa uma conta própria. O cadastro aceita 5 por minuto por IP.

1. Um PC cria a Room, os outros entram, todos marcam pronto, e quem criou inicia.
2. Joguem até o fim, de preferência com todos perto dos mesmos inimigos.

**Esperado:**
- cada player vê todos os outros se mexerem, sem teleporte;
- os inimigos atacam players diferentes, e não sempre o mesmo;
- a HUD de cada um mostra todos os players;
- console limpo em todos os PCs;
- no Grafana ("Jogo e backend"), o tick continua estável durante a partida;
- no fim, a consulta do D8 (passo 6) mostra o número certo de players.

**Anote:** quantos players e em quantos PCs, se houve travada ou teleporte, o tick do Grafana no pior momento e o que apareceu no console.

### 4.2 N2: 60 fps no PC da 42 (módulo Advanced 3D)

Faça isto durante o N1, em cada PC cliente. O avaliador usa um PC da 42, e o módulo cobra 60 fps.

1. Abra `chrome://gpu` numa aba separada. Em **Graphics Feature Status**, anote as linhas **WebGL** e **WebGL2** (o esperado é "Hardware accelerated") e, mais abaixo, o `GL_RENDERER` (a GPU). "Software only" ou "SwiftShader" significa que o render roda na CPU.
2. Na aba do jogo: DevTools → ⋮ → **More tools** → **Rendering** → marque **Frame rendering stats**. Feche o DevTools ou deixe-o pequeno, porque ele também custa fps.
3. Anote o fps em três momentos: parado, andando sozinho e na luta mais cheia do N1. Repita com o Chrome em tela cheia (`F11`).

**Decide:** se fica abaixo de 60, os números vão para o Rafael (F3.10), que decide o ajuste (sombra, bloom, resolução).

### 4.3 N3: versão do Chrome

Em cada PC usado: `chrome://settings/help`. Anote a versão e se aparece "O Google Chrome está atualizado". O subject exige compatibilidade com a última versão estável. Em 17/10, era o Chrome 155.

### 4.4 N4 (opcional): login sem Docker configurado, seguindo só o README

Só se alguém do grupo nunca rodou Docker num PC da 42. Simula quem avalia: uma pessoa que chega com o próprio login e segue o README.

1. Essa pessoa segue **só o `README.md`**, sem este roteiro: clone, `.env` a partir do `.env.example` e `docker compose up --build`.
2. Antes e depois: `du -sh ~` e `df -h ~`.

**Esperado, pelo que já se sabe de 17/10:** o `docker` só funciona depois de `dockerd-rootless-setuptool.sh install`; o `up` falha nas portas 80/443 do `.env.example` (`cannot expose privileged port`); e, sem `data-root` no goinfre, as imagens vão para o home.

**Anote:** onde travou, que mensagem apareceu e quanto do home foi consumido.

**Decide:** o que o README (F9.1) e o `.env.example` precisam dizer para um PC da 42, que é a F8.6.

No fim, para devolver o espaço do home dessa pessoa: `docker compose down -v && docker system prune -a -f`.

### 4.5 N5: perguntas ao staff

Em paralelo com o resto, quem estiver livre pergunta:

1. **Quando o goinfre é limpo?** No logout, no reboot, toda semana, nunca?
2. **Onde é a defesa?** Em qual cluster ou sala? O time pode escolher os PCs e prepará-los antes? Pode usar 2 ou 3 PCs vizinhos?
3. **Os PCs mudam até 21/11?** Atualização de imagem do sistema ou do Chrome, reinstalação.

**Anote:** quem respondeu e o que disse.

**Decide (F8.6):**
- em qual PC preparar a demo, e com quanta antecedência. O volume `db_data` fica no goinfre, que é local de cada PC: trocar de PC ou ter o goinfre limpo apaga as contas, as partidas e o leaderboard da demo;
- se os dados da demo precisam ser gerados no próprio dia;
- quais URLs de retorno cadastrar na intra (D6).

### Fora do teste de hoje

Nada disto está na `main` em 01/11. Nenhum item depende da rede da 42 depois que o D8 passar, porque o `/ws/game` é o mesmo caminho: dá para validar em casa, com 2 máquinas.

| Item | Por que não hoje | Dono |
|---|---|---|
| PvP 1v1 entre dois PCs | não existe mapa em `backend/maps/pvp/` | Rafael (mapa), Roberto (`PvpRuleset`) |
| Áudio (F3.9) | não está na `main` | Rafael |
| Alerta do Monitoring (F8.10) | não está feito | Akita |
| Ping/RTT na HUD (F2.12) | PR #184 aberto | Augusto |

Se algum deles entrar na `main` antes de vocês saírem, incluam no D8 ou no N1.

---

## Parte 5: registrar

Preencha a tabela "Pendente 2º PC" em [resultados-teste-pc-42-2026-10-17.md](resultados-teste-pc-42-2026-10-17.md#pendente-2º-pc) com data, PCs (o servidor e o cliente, e se eram do mesmo cluster) e o resultado de cada item. Acrescente as linhas abaixo e cole o `saida.txt` de cada cliente no fim do arquivo. Depois, abra PR seguindo o fluxo do README.

| # | Validação | Resultado |
|---|---|---|
| D1–D5 | repetidos de **outro cluster** (PC e cluster) | |
| D6 | login pela 42 de outro PC: qual secret foi usado e se a troca valeu (§0.2); o que o formulário da intra aceitou (porta, nip.io, quantas URLs); login com a conta de quem não é dono do app | |
| D7 | Grafana de outro PC: login, `401` sem login, redirect com a porta, console | |
| D8 | co-op entre 2 PCs até o fim; reconexão em menos de 30 s e expiração depois de 30 s; Match `finished` | |
| N1 | co-op com N players em M PCs; sincronia, alvo dos inimigos, tick no Grafana, console | |
| N2 | WebGL acelerado? GPU; fps parado, andando e na luta, em janela e em tela cheia | |
| N3 | versão do Chrome em cada PC; está atualizado? | |
| N4 | login sem Docker configurado: onde travou, espaço no home (ou "não feito") | |
| N5 | respostas do staff: goinfre, local da defesa, mudanças nos PCs | |

## Se algo falhar

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| D1 sem resposta em todos os nomes, mas o 1.7 passou no PC A | **firewall entre os PCs** | Teste `nc -zv <HOST> 8443` do PC B; tente um PC B do mesmo cluster e um de outro; anote quais pares falham. **Não tem plano B pronto**: avise o Roberto (Tech Lead) no mesmo dia, porque isso muda a demo da avaliação |
| D1 passa no mesmo cluster e falha em outro | regra de rede entre clusters | Anote os pares. A demo precisa ficar num cluster só, e o N5 diz qual |
| D1 responde pelo IP, mas não pelo hostname | DNS interno | Anote. Dá para usar `PUBLIC_HOST=<IP>:8443` (o IP já está no certificado) |
| `nip.io` não resolve só no PC B | DNS público bloqueado nesse PC | Anote: afeta só o login pelo Google fora do `localhost` |
| D3 com `000` ou erro de certificado | `rootCA.pem` errado (de outro servidor) ou certificado gerado em outro PC | No PC A, confira o SAN (1.5) e mande o `rootCA.pem` do login que rodou o `mkcert` |
| D3 com `502` | a stack caiu | No PC A: `docker compose ps -a` e `docker compose logs backend proxy \| tail -50` |
| D4 com `429` | o 1.4 não foi aplicado, ou o PC A travou o login pelo `localhost` em vez do `$HOST` | No PC A: `ps -eo args \| grep -o -- '--port-driver=[a-z0-9]*'` deve dizer `slirp4netns`; no log do 1.9, o IP do PC B deve aparecer |
| D5 com porta `ABERTA` | algo além do proxy está publicando porta | No PC A: `docker compose ps` e anote qual serviço |
| Chrome mostra aviso de certificado | CA não importada, Chrome não reiniciado, ou o nome não está no SAN | Refazer o 2.3 fechando todas as janelas; conferir o SAN no PC A |
| `up` falha com `GF_SECURITY_ADMIN_...` | `.env` sem o admin do Grafana (decisão 19 do `infra.md`) | Confira o `diff` e o último `grep` do 1.6 |
| D6: a intra recusa a URL de retorno | a URL cadastrada no app não bate com o `PUBLIC_HOST` (host ou porta) | Conferir o 3.1, passo 1, contra o `grep PUBLIC_HOST .env` do PC A |
| D6: volta para `/login?error=...` com `invalid_client` no log | secret novo ainda não ativo, ou secret errado | §0.2, passo 3: voltar para o secret atual |
| D6: volta para `/login?error=...` sem `invalid_client` | o cookie `oauth_state` se perdeu (janela trocada no meio do caminho) | Refazer numa janela anônima só; no PC A, `docker compose logs backend \| tail -50` |
| D7: `502` ou página sem CSS em `/grafana/` | Grafana fora do ar, ou a URL raiz dele não bate com o `PUBLIC_HOST` | No PC A: `docker compose ps grafana` e `docker compose logs grafana \| tail -50` |
| D8: o lobby não atualiza ou o `/play` não conecta | o `/ws/app` ou o `/ws/game` caiu (é a mesma porta da D1, então não é rede) | Print do Console e da aba WS nos dois PCs; no PC A, `docker compose logs backend \| tail -50` |
| D8: o PC B reabre e não volta para a partida | Grace period expirou, ou a reentrada falhou | Anote o tempo entre fechar e reabrir e o erro na tela; no PC A, `docker compose logs backend \| tail -50` |
| N1: um player trava sozinho | a janela dele ficou escondida ou virou aba de outra | Uma janela por player, lado a lado |
| N2: WebGL "Software only" | aceleração por hardware desligada ou GPU bloqueada nesse PC | Anote a GPU e o `chrome://gpu` inteiro (print); confira se Configurações → Sistema → "Usar aceleração gráfica" está ligado |

## Limpeza

**PC A:**
- Derrube a stack: `cd ~/teste-2-pcs/ft_transcendence && docker compose down -v`.
- **Apague a pasta: `rm -rf ~/teste-2-pcs`.** Não é opcional hoje, porque o `.env` tem o secret da 42, o `JWT_SECRET` e a senha do Grafana. Apague também a cópia do `.env` que veio de casa, onde quer que ela tenha ficado no PC (Downloads, pendrive montado). O `~/bin/mkcert` e a CA ficam para a próxima.
- O `override.conf` do 1.4 pode ficar: só melhora o Docker para este projeto. Para desfazer: `rm ~/.config/systemd/user/docker.service.d/override.conf && systemctl --user daemon-reload && systemctl --user restart docker`.
- Se usou o sgoinfre: `rm -rf /sgoinfre/$USER/teste-2-pcs && chmod 700 /sgoinfre/$USER`.

**Cada PC cliente:** o 2.4, no fim do dia.

**Login do N4, se houve:** o `prune` do 4.4.
