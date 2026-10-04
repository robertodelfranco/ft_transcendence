# Contrato: rotas, host, TLS e `.env` (`infra.md`)

**Estado:** rascunho para a reunião de 04/10. **Escreve:** Akita. **Assina:** todos — é o contrato que diz o que acontece com uma requisição antes de ela chegar ao código de qualquer um.

## 1. Para que serve

Define a borda do sistema: quais serviços existem, quais portas saem para o host, por onde cada URL entra, e **o que o Nginx faz com a requisição antes de o backend vê-la**. Auth, WebSocket e monitoring são construídos em cima dessas respostas, então elas são contrato e não detalhe de operação.

## 2. Formas

### 2.1 Serviços e rede

Um `docker compose up` sobe tudo (requisito do subject, cap. III). Todos na rede bridge `transcendence`, conversando por **nome de serviço** — nunca nome de container (§4, decisão 7).

| Serviço | Imagem / build | Porta publicada | Papel |
|---|---|---|---|
| `proxy` | `./proxy` (nginx:alpine) | **80 e 443** | única porta que sai para o host; termina o TLS |
| `frontend` | `./frontend` | — | build estático do React servido por nginx |
| `backend` | `./backend` | — | FastAPI, `uvicorn`, **um worker** |
| `db` | `postgres:16-alpine` | — | volume `db_data` |
| `prometheus` | `prom/prometheus` | — | scrape e regras de alerta; volume de dados |
| `grafana` | `grafana/grafana` | — | datasource e dashboards provisionados por arquivo |
| `node-exporter` | `prom/node-exporter` | — | métricas de host |
| `postgres-exporter` | `prometheuscommunity/postgres-exporter` | — | métricas do Postgres |

Nenhum serviço além do `proxy` publica porta. É isso que torna `/metrics`, o Prometheus e os exporters inalcançáveis de fora, sem nenhuma regra de firewall (§4, decisão 6).

### 2.2 Mapa de URLs

| URL | Vai para | Observação |
|---|---|---|
| `http://<host>/*` | — | 301 para `https://<host>/*` |
| `https://<host>/` | `frontend` | build de produção; SPA, então 404 de rota cai no `index.html` |
| `https://<host>/api/*` | `backend` | **sem reescrita**: o backend vê `/api/...` |
| `https://<host>/media/*` | `frontend` ou volume | avatares enviados (ver "Em aberto" 2) |
| `wss://<host>/ws/app` | `backend` | presença e lobby |
| `wss://<host>/ws/game/{match_id}` | `backend` | partida |
| `https://<host>/grafana/*` | `grafana` | TLS + login do Grafana |
| `/metrics`, `:9090`, exporters | **nada** | não roteado e sem porta publicada |

### 2.3 O que o Nginx faz com a requisição

Escrito para quem programa atrás dele.

1. **O TLS termina no Nginx.** O backend recebe HTTP simples na porta 8000. Mesmo assim o cookie de refresh é `Secure`: quem decide isso é o navegador, que só falou HTTPS. Por isso o backend precisa de `X-Forwarded-Proto` para saber que a origem era segura.
2. **O caminho não é reescrito.** `proxy_pass http://backend:8000;` **sem barra final**. O backend vê `/api/auth/refresh`, e não `/auth/refresh`. Consequência direta: os routers do FastAPI carregam o prefixo `/api`, e o cookie de refresh usa `Path=/api/auth/refresh` (§4, decisão 5).
3. **Cabeçalhos.** `Host`, `X-Real-IP`, `X-Forwarded-For` e `X-Forwarded-Proto` são acrescentados. `Authorization` e `Cookie` passam sem precisar de nada — o Nginx só descarta cabeçalhos com `_` no nome, e nenhum nosso tem.
4. **WebSocket** em `location /ws/`: `proxy_http_version 1.1`, `Upgrade: $http_upgrade`, `Connection: "upgrade"`, `proxy_read_timeout 3600s` e `proxy_send_timeout 3600s`. Sem o timeout longo, o Nginx corta um socket silencioso aos 60 s e a reconexão viraria rotina em vez de exceção.
5. **Tamanho de corpo:** `client_max_body_size` acompanha o limite de avatar do [i18n.md](i18n.md) (API de usuários). Se o Nginx cortar antes do backend, o front recebe 413 do Nginx em HTML, fora do envelope de erro — então o limite do Nginx é um pouco maior que o do backend, e a mensagem de erro vem sempre do backend.
6. **`/metrics` não tem `location`.** Uma requisição a `https://<host>/metrics` cai no `location /`, ou seja, no frontend, e dá 404 de arquivo estático. Não existe caminho público para o `/metrics` do backend.

### 2.4 TLS e a demo em 2–3 máquinas

- Certificado local de CA confiável com [`mkcert`](https://github.com/FiloSottile/mkcert), para o Chrome não mostrar aviso (console limpo é critério de rejeição).
- O certificado é emitido para o **nome e o IP** da máquina que serve a demo, nos dois: `mkcert <host> <ip>`. Sem o IP no SAN, abrir pelo IP de outra máquina dá aviso.
- Os arquivos gerados vão para `proxy/certs/` e **não são versionados** (entram no `.gitignore`); quem clona roda o `mkcert` uma vez. O repo documenta o comando, não guarda a chave.
- Nas outras máquinas da demo: copiar o `rootCA.pem` de `$(mkcert -CAROOT)` da máquina servidora e rodar `mkcert -install` apontando para ele, ou instalar a CA no sistema. Sem isso, as outras máquinas veem aviso.
- Os clientes acessam por `https://<host>` — e `PUBLIC_HOST` no `.env` precisa bater com o nome do certificado, porque é dele que sai a URL de retorno do OAuth.

### 2.5 `.env.example`

Local, fora do git, com todas as chaves e segredos vazios (requisito do subject). **Sem comentário no fim da linha**: `env_file` do compose não interpreta `#` depois do valor e gravaria o comentário dentro da variável — é um defeito que o `.env.example` atual tem (§4, decisão 7).

```dotenv
# ---------- Banco ----------
POSTGRES_USER=
POSTGRES_PASSWORD=
POSTGRES_DB=transcendence
POSTGRES_HOST=db
POSTGRES_PORT=5432

# ---------- Backend ----------
APP_ENV=development
LOG_LEVEL=info
JWT_SECRET=
ACCESS_TOKEN_TTL_S=900
REFRESH_TOKEN_TTL_S=604800
MEDIA_DIR=/media

# ---------- OAuth 42 ----------
FT_CLIENT_ID=
FT_CLIENT_SECRET=
FT_REDIRECT_URI=

# ---------- Borda ----------
PUBLIC_HOST=
PROXY_HTTP_PORT=80
PROXY_HTTPS_PORT=443

# ---------- Monitoring ----------
PROM_RETENTION_TIME=7d
GF_SECURITY_ADMIN_USER=
GF_SECURITY_ADMIN_PASSWORD=
GF_SERVER_SERVE_FROM_SUB_PATH=true
GF_USERS_ALLOW_SIGN_UP=false
GF_AUTH_ANONYMOUS_ENABLED=false
```

A URL do banco é montada pelo `pydantic-settings` a partir das cinco variáveis de Postgres; não há `DATABASE_URL` separada, para não existirem duas fontes da mesma informação.

Pelo mesmo motivo, **`GF_SERVER_ROOT_URL` não aparece no `.env`**: ela é derivada no compose, no bloco `environment:` do serviço `grafana`, como `https://${PUBLIC_HOST}/grafana/`. `PUBLIC_HOST` é a única fonte do nome público, e ele já precisa bater com o certificado (§2.4). Vale a diferença: o compose **interpola** `${...}` em `environment:`, mas `env_file` entrega o valor literal — por isso a derivação mora no compose, não no `.env`.

### 2.6 Monitoring

```
backend:8000/metrics ─────┐
node-exporter:9100 ───────┼─► prometheus ─► grafana ◄── Nginx /grafana/ (TLS + login)
postgres-exporter:9187 ───┘   (alerts.yml)
```

- `monitoring/prometheus/prometheus.yml` e `alerts.yml`, `monitoring/grafana/provisioning/{datasources,dashboards}/` — tudo versionado. **Nada criado à mão na UI entra na demo**: o critério é `docker compose down -v && up` e os dashboards voltarem sozinhos.
- Os nomes e as labels das métricas do backend são contrato do Augusto (`app/core/metrics.py`, F8.7, arq. §12.1). Os dashboards de host e Postgres não dependem dele e sobem antes.
- Grafana: `serve_from_sub_path` ligado, admin do `.env`, anônimo e signup desligados.
- Retenção curta (`PROM_RETENTION_TIME`): é demo local, não observabilidade de produção.

### 2.7 O que o CI roda a cada PR

`.github/workflows/build-check.yml`:

| Passo | Reprova quando |
|---|---|
| `docker compose up -d --build` | build quebra ou container sai |
| `curl` no `/` e no `/api/health` pelo proxy | a stack não responde em 60 s |
| `pg_isready` | o banco não sobe |
| `pytest` (backend) | teste vermelho |
| `vitest` (frontend) | teste vermelho |
| lint do backend e do front, incluindo `i18next/no-literal-string` | string solta no JSX |
| `alembic heads \| wc -l` igual a 1 | duas cabeças de migração ([rooms.md](rooms.md) §4, decisão 4) |

Os passos de `pytest`, `vitest` e lint entram conforme F0.3 e F0.4 existirem; os quatro primeiros já existem.

## 3. Exemplo

O trecho que resolve as decisões 5 e 6, como vai ficar em `proxy/nginx.conf`:

```nginx
server {
    listen 80;
    server_name _;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    http2 on;
    server_name _;

    ssl_certificate     /etc/nginx/certs/cert.pem;
    ssl_certificate_key /etc/nginx/certs/key.pem;

    client_max_body_size 3m;

    location / {
        proxy_pass http://frontend:80;
    }

    location /api/ {
        proxy_pass http://backend:8000;          # sem barra final: o path chega inteiro
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /ws/ {
        proxy_pass http://backend:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade           $http_upgrade;
        proxy_set_header Connection        "upgrade";
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }

    location /grafana/ {
        proxy_pass http://grafana:3000;          # serve_from_sub_path cuida do prefixo
        proxy_set_header Host $host;
    }
}
```

O backend sobe com `uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips='*'`, sem `--workers`.

O caminho de uma requisição de login:

```
navegador  POST https://catacombs.local/api/auth/login
  → proxy   (TLS termina aqui) POST http://backend:8000/api/auth/login
                               X-Forwarded-For: 192.168.0.42
                               X-Forwarded-Proto: https
  → backend rota /api/auth/login, rate limit pela chave 192.168.0.42
  ← Set-Cookie: refresh=...; HttpOnly; Secure; SameSite=Strict; Path=/api/auth/refresh
```

A demo, do zero:

```bash
mkcert -install                              # uma vez, na máquina que serve
mkcert -cert-file proxy/certs/cert.pem \
       -key-file  proxy/certs/key.pem  catacombs.local 192.168.0.42
cp .env.example .env                         # preencher segredos e PUBLIC_HOST
docker compose up -d --build
cp "$(mkcert -CAROOT)/rootCA.pem" .          # levar para as outras máquinas
```

## 4. Decisões

> A numeração começa em **5** de propósito: os itens 5, 6 e 7 são as respostas às perguntas 5, 6 e 7 do meu briefing em [README.md](README.md), e manter o número facilita conferir na reunião. As perguntas 1 a 4 são respondidas em [rooms.md](rooms.md) §4; a 8, na §5 deste arquivo.

5. **O backend enxerga o caminho inteiro** (pergunta 5). `proxy_pass http://backend:8000;` sem barra final mantém `/api/...`. O motivo é que o prefixo aparece em quatro lugares que precisam concordar: a rota do FastAPI, o `Path` do cookie de refresh, a rota que vai no log com `request_id` e a label `route` do Prometheus. Com reescrita, três deles passam a usar um caminho que ninguém digita, e todo bug de cookie vira uma investigação. O repo hoje tem `proxy_pass http://backend:8000/;` com barra — muda no PR de F8.1.
6. **O IP real chega em `X-Forwarded-For`** (pergunta 6), com `X-Real-IP` e `X-Forwarded-Proto` ao lado, e o `uvicorn` roda com `--proxy-headers` para que `request.client.host` já seja o IP do cliente — é a chave do rate limit por IP do Augusto, que sem isso jogaria todos os usuários no mesmo balde. O backend confia nesses cabeçalhos **porque não é alcançável de fora do compose**: a confiança vem da topologia, não do cabeçalho. Se algum dia o backend publicasse porta, essa confiança virava um bypass de rate limit.
7. **Nome de serviço, não nome de container** (pergunta 7). `POSTGRES_HOST=db`. Sai o `container_name` do compose, que é o que hoje faz `db_transcendence` resolver; nome de serviço é o que o Docker resolve sempre, e é o que a arq. §12 já pedia. Três lugares mudam no mesmo PR: o `compose`, o `.env.example` (que também perde o comentário no fim da linha, que `env_file` gravaria dentro do valor) e o `.env` gerado pelo CI em `build-check.yml`.
8. **Um worker de `uvicorn`**, documentado como limitação consciente (ADR 10): `ConnectionManager` e `RoomManager` são dicionários em processo. Escalar exigiria Redis pub/sub e é decisão do Tech Lead.
9. **Certificado fora do git.** Chave privada versionada é chave vazada, mesmo em repo de escola. O comando fica documentado e o `proxy/certs/` entra no `.gitignore`.
10. **Grafana com `serve_from_sub_path`, sem reescrita no Nginx.** A alternativa (Nginx cortando `/grafana/`) existe na doc do Grafana, mas aí os links que ele gera não sabem do prefixo sem o `root_url` certo de qualquer forma — então o prefixo é configurado uma vez, no Grafana, e o Nginx faz a mesma coisa que faz com o backend.

## 5. Em aberto

| # | Questão | Quem decide | Quando |
|---|---|---|---|
| 1 | Hostname da demo. Proposta: `catacombs.local` no `/etc/hosts` das máquinas, com o IP também no SAN do certificado, para funcionar pelos dois. | Akita | reunião 04/10 |
| 2 | Onde o avatar fica guardado (pergunta 2 do Caio, dirigida a mim). Proposta: volume do compose montado no `backend` em `MEDIA_DIR`, servido pelo Nginx em `/media/`; o banco guarda só a URL. Alternativa descartada: bytes em coluna do Postgres. | Akita e Caio | reunião 04/10 |
| 3 | Retenção do Prometheus. Proposta: `7d`. | Akita | S3 |
| 4 | **Cadastro do app OAuth na intra da 42** (pergunta 8): se a liberação é imediata, as regras da URL de retorno (exige HTTPS? aceita nome local? quantas podem ser cadastradas?) e se o secret expira. Isso **não se responde por dedução** — sai do formulário da intra. Eu cadastro o app hoje e preencho esta linha com o que a intra mostrar, mais o valor de `FT_REDIRECT_URI`. Plano B se travar: 2FA TOTP, mesmo 1 ponto (plano §8.2). | Akita | **hoje, 04/10** |
| 5 | `/media/` servido pelo Nginx direto do volume ou pelo backend? Proposta: Nginx direto (não gasta worker do backend com arquivo estático), o que exige o volume montado nos dois. | Akita | S3 |

---

> **Links para contratos que ainda não existem:** `i18n.md` (Caio), que fixa o limite de tamanho do avatar citado na §2.3 — rascunho esperado na reunião de 04/10.
