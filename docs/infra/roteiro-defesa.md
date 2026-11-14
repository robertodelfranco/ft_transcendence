# Roteiro da defesa

Versão curta do [teste-2-pcs.md](teste-2-pcs.md), validado na 42 em 01/11 (PC com `slirp4netns`) e em 14/11 (c1r5p2, sem `slirp4netns`). Detalhes e plano B estão lá.

- **Host:** o PC que roda a stack (Docker rootless, portas 8080/8443).
- **Clientes:** os outros PCs do cluster. Só abrem o Chrome; nada de Docker, nada de sudo.

## 0. Antes de ir (em casa)

- [ ] `.env` de casa com todas as chaves da `main`: `diff <(grep -o '^[A-Z0-9_]*=' .env.example | sort) <(grep -o '^[A-Z0-9_]*=' .env | sort)` sem saída.
- [ ] `FT_CLIENT_SECRET` válido na intra.

## 1. Host

```bash
# quem é o host (repita em todo terminal novo)
HOST=$(hostname -f); IP=$(hostname -I | awk '{print $1}'); echo "$HOST $IP"

# Docker rootless instalado neste login? (o docker info falharia também com o daemon quebrado)
[ -f ~/.config/systemd/user/docker.service ] || dockerd-rootless-setuptool.sh install

# Docker: imagens no goinfre e IP real do cliente. Rode em todo PC novo: o home acompanha o
# login, mas o pacote muda de PC para PC, e o override de um PC derruba o Docker de outro
mkdir -p /goinfre/$USER/docker ~/.config/docker ~/.config/systemd/user/docker.service.d
if command -v slirp4netns >/dev/null; then
    # 01/11: o port driver slirp4netns repassa o IP de origem
    echo "{ \"data-root\": \"/goinfre/$USER/docker/\" }" > ~/.config/docker/daemon.json
    printf '[Service]\nEnvironment="DOCKERD_ROOTLESS_ROOTLESSKIT_PORT_DRIVER=slirp4netns"\n' > ~/.config/systemd/user/docker.service.d/override.conf
else
    # 14/11: sem slirp4netns, o slirp4netns derruba o daemon; o builtin repassa o IP sem o
    # userland-proxy, que por sua vez pede o br_netfilter (só root carrega; a stack não precisa dele)
    echo "{ \"data-root\": \"/goinfre/$USER/docker/\", \"userland-proxy\": false }" > ~/.config/docker/daemon.json
    printf '[Service]\nEnvironment="DOCKERD_ROOTLESS_ROOTLESSKIT_PORT_DRIVER=builtin"\nEnvironment="DOCKER_IGNORE_BR_NETFILTER_ERROR=1"\n' > ~/.config/systemd/user/docker.service.d/override.conf
fi
systemctl --user daemon-reload && systemctl --user reset-failed docker; systemctl --user restart docker
ps -eo args | grep -o -- '--port-driver=[a-z0-9]*' | sort -u   # esperado: slirp4netns ou builtin
docker info -f '{{.DockerRootDir}}'                 # esperado: /goinfre/...

# código e .env
mkdir -p ~/defesa && cd ~/defesa
git clone https://github.com/robertodelfranco/ft_transcendence.git && cd ft_transcendence
cp <.env-de-casa> .env && chmod 600 .env
sed -i "s|^PUBLIC_HOST=.*|PUBLIC_HOST=$HOST:8443|; s|^PROXY_HTTP_PORT=.*|PROXY_HTTP_PORT=8080|; s|^PROXY_HTTPS_PORT=.*|PROXY_HTTPS_PORT=8443|" .env

# certificado (o certificado é por PC; a CA fica no home)
[ -x ~/bin/mkcert ] || { mkdir -p ~/bin && curl -fsSL -o ~/bin/mkcert "https://dl.filippo.io/mkcert/latest?for=linux/amd64" && chmod +x ~/bin/mkcert; }
~/bin/mkcert -cert-file proxy/certs/cert.pem -key-file proxy/certs/key.pem "$HOST" "$IP" localhost 127.0.0.1

# subir
docker compose up -d --build --wait --wait-timeout 300
docker compose ps                                    # 8 serviços Up; só o proxy com porta
curl -s "https://$HOST:8443/api/health" --cacert "$(~/bin/mkcert -CAROOT)/rootCA.pem"   # {"status":"ok"}
docker compose logs proxy | tail -1                  # IP de origem = $IP, nunca 172.x (senão o rate limit vira global)

# entregar a CA pública aos clientes (NUNCA o rootCA-key.pem)
mkdir -p /sgoinfre/$USER/defesa && cp "$(~/bin/mkcert -CAROOT)/rootCA.pem" /sgoinfre/$USER/defesa/
chmod 711 /sgoinfre/$USER && chmod 755 /sgoinfre/$USER/defesa
```

Na intra (app da 42), acrescente a URL de retorno `https://<HOST>:8443/api/auth/oauth/42/callback`.

Se o Docker não subir: `journalctl --user -u docker | grep 'failed to start' | tail -1`. Se o `up` falhar: `docker compose logs backend proxy | tail -50`. Prometheus sem ler a config: `chmod -R go+rX monitoring` e suba de novo.

## 2. Cliente (cada PC)

```bash
cp /sgoinfre/<login-do-host>/defesa/rootCA.pem ~/rootCA.pem
```

1. Chrome → `chrome://settings/certificates` → **Certificados locais** → **Personalizado** → **Instalados por você** → **Certificados confiáveis** → **Importar** → `~/rootCA.pem`.
2. Feche todas as janelas do Chrome e abra uma **janela anônima** (`Ctrl+Shift+N`; sem extensões sujando o console).
3. Abra `https://<HOST>:8443`. Use sempre o **hostname**: pelo IP, o Nginx redireciona para ele.
4. Um player por **janela** (nunca abas da mesma janela), cada um com a própria conta.

## 3. Durante a defesa

| O quê | Onde |
|---|---|
| Site | `https://<HOST>:8443` |
| Grafana | `https://<HOST>:8443/grafana/` (admin do `.env`) |
| Logs | `docker compose logs -f backend` |
| Partidas no banco | `docker compose exec db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "select id, status from matches order by id desc limit 5"'` |
| Alerta `TargetDown` | `docker compose stop backend` → espera ~1 min → `docker compose start backend` (se der 502: `docker compose restart proxy`) |
| Banco do zero (apaga também avatares e métricas) | `docker compose down -v && docker compose up -d --wait` |

## 4. Depois

- **Host:** `docker compose down -v && rm -rf ~/defesa /sgoinfre/$USER/defesa`
- **Clientes:** excluir "mkcert development CA" em `chrome://settings/certificates` e `rm ~/rootCA.pem`
