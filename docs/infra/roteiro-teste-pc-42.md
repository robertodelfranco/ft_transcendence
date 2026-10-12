# Roteiro de teste no PC da 42

> Smoke test da Slice 5 (B0 do plano do Akita). O objetivo é descobrir **o que o PC da 42 deixa a nossa infra fazer** antes de escrever o compose final. Nada aqui depende do código do projeto: só `docker run` de imagens públicas. Tempo estimado: 30–40 min, mais o download das imagens.
>
> Cada passo diz **o que anotar** e **qual decisão a resposta destrava**. A tabela de resultados está no fim. Preencha e traga para a próxima conversa.

## 0. Preparação

Precisa de dois PCs da 42 lado a lado: o **servidor** (roda os containers) e o **cliente** (abre o Chrome). Todos os comandos rodam no servidor, salvo quando o passo indicar o cliente.

```bash
export SG=/sgoinfre/gyasuhir/transcendence-test     # área pesada e compartilhada
export T=~/transcendence-test                       # área leve, no home
mkdir -p "$SG" "$T"
hostname -f; hostname -I; date
```

**Anotar:** hostname completo do servidor, IP e data.

## 1. Que Docker é este?

```bash
id -nG | tr ' ' '\n' | grep -x docker && echo "NO GRUPO docker"
docker info 2>/dev/null | grep -i -E 'rootless|server version|storage driver|docker root dir|cgroup version'
docker compose version
echo "DOCKER_HOST=$DOCKER_HOST"
systemctl --user is-active docker 2>/dev/null
```

| Resultado | Significado |
|---|---|
| Usuário no grupo `docker`, sem `rootless` no `docker info` | O daemon roda como root. Portas baixas funcionam e as imagens ficam em `/var/lib/docker`, **fora da sua cota** |
| `rootless` no `Security Options` e `DOCKER_HOST=unix:///run/user/...` | Docker rootless. Portas < 1024 falham e as imagens ficam no seu home, **dentro da cota** |
| `docker compose version` falha | Sem Compose v2. Teste `docker-compose version` e anote |

**Anotar:** modo (root/rootless), `Docker Root Dir`, `Storage Driver` e a versão do Compose.
**Decide:** todo o resto. Se for rootless, os passos 2, 3 e 6 importam muito mais.

## 2. Portas

```bash
for p in 80 443 8080 8443; do
  if docker run --rm -d --name tp$p -p $p:80 nginx:alpine >/dev/null 2>&1; then
    echo "porta $p OK"; docker rm -f tp$p >/dev/null
  else
    echo "porta $p FALHOU"
  fi
done
```

**Anotar:** quais portas subiram.
**Decide:** `PROXY_HTTP_PORT` e `PROXY_HTTPS_PORT` da demo, e se o `PUBLIC_HOST` leva porta (`<pc>:8443`) ou não.

## 3. Disco: home, goinfre e sgoinfre

```bash
df -hT ~ /goinfre/$USER /sgoinfre/gyasuhir 2>/dev/null
quota -s 2>/dev/null
stat -f -c 'tipo de FS: %T' /sgoinfre/gyasuhir
ls -ld /sgoinfre/gyasuhir /sgoinfre
```

Depois, baixe as imagens que a stack vai usar e meça:

```bash
for img in nginx:alpine postgres:16-alpine python:3.12-slim node:20-alpine \
           prom/prometheus grafana/grafana prom/node-exporter \
           prometheuscommunity/postgres-exporter gcr.io/cadvisor/cadvisor; do
  docker pull -q "$img"
done
docker system df
df -h "$(docker info -f '{{.DockerRootDir}}')"
```

**Anotar:** espaço livre e tipo de FS de cada área; tamanho total das imagens; se a cota estourou durante o pull.
**Atenção ao sgoinfre:**
- Se o tipo for `nfs`, **não** coloque o `data-root` do Docker lá: o driver `overlay2` não funciona em cima de NFS. O sgoinfre serve para arquivos parados (VM, `docker save` de imagens, binários), não para camadas de container.
- Se `ls -ld /sgoinfre/gyasuhir` mostrar leitura para outros (`r` no último trio), **outros alunos leem o que estiver lá**. Nada de segredo nem de chave privada nesse diretório (ver passo 7).

**Decide:** onde ficam as imagens no caso rootless, e se a VM volta à mesa por falta de espaço.

## 4. Volume do Postgres no sgoinfre (só se o passo 3 indicar falta de espaço)

O Postgres faz `chown` no diretório de dados. Em NFS com `root_squash` ou em Docker rootless, isso costuma falhar.

```bash
mkdir -p "$SG/pgdata"
docker run -d --name pgt -e POSTGRES_PASSWORD=t -v "$SG/pgdata:/var/lib/postgresql/data" postgres:16-alpine
sleep 10; docker logs pgt 2>&1 | tail -5
docker exec pgt pg_isready
docker rm -f pgt; rm -rf "$SG/pgdata"
```

**Anotar:** `accepting connections` ou o erro (`Operation not permitted`, `chown`...).
**Decide:** se o volume `db_data` pode morar fora do home. O padrão (volume nomeado do Docker) continua sendo a primeira opção.

## 5. Rede entre dois PCs

No **servidor**, use a primeira porta que passou no passo 2 (aqui, `8080`):

```bash
docker run --rm -d --name tnet -p 8080:80 nginx:alpine
```

No **cliente**:

```bash
curl -sI http://<hostname-do-servidor>:8080 | head -1
curl -sI http://<ip-do-servidor>:8080 | head -1
```

Ainda no **cliente**, o nome do [nip.io](https://nip.io), que é o candidato para o login pelo Google (o Google recusa IP puro na URL de retorno, [infra.md](../contracts/infra.md) §2.4). Troque os pontos do IP do servidor por hífens:

```bash
getent hosts <ip-com-hifens>.nip.io             # ex.: getent hosts 10-11-2-3.nip.io
curl -sI http://<ip-com-hifens>.nip.io:8080 | head -1
```

Depois, no servidor: `docker rm -f tnet`.

**Anotar:** se responde pelo hostname, pelo IP, pelos dois ou por nenhum (firewall entre máquinas?); se o `getent` devolve o IP do servidor (a rede da 42 resolve DNS público?) e se o `curl` pelo nome do nip.io chega.
**Decide:** o que entra no SAN do certificado e o valor de `PUBLIC_HOST`; se o login pelo Google pode ser demonstrado de outra máquina ou só pela que serve, por `https://localhost`.

## 6. Exporters do monitoring

```bash
docker run -d --name tne --pid host -v /proc:/host/proc:ro -v /sys:/host/sys:ro -v /:/rootfs:ro \
  prom/node-exporter --path.procfs=/host/proc --path.sysfs=/host/sys --path.rootfs=/rootfs
sleep 3; docker exec tne wget -qO- localhost:9100/metrics | grep -c '^node_' ; docker logs tne 2>&1 | grep -i -E 'err|warn' | head -5
docker rm -f tne

docker run -d --name tca --privileged -v /:/rootfs:ro -v /var/run:/var/run:ro -v /sys:/sys:ro \
  -v /var/lib/docker/:/var/lib/docker:ro gcr.io/cadvisor/cadvisor
sleep 5; docker logs tca 2>&1 | tail -5
docker exec tca wget -qO- localhost:8080/metrics | grep -c '^container_'
docker rm -f tca
```

**Anotar:** quantas métricas `node_*` e `container_*` vieram, e os erros de log.
**Decide:** D3 (só `node-exporter`, `node-exporter` + cAdvisor, ou só cAdvisor).

## 7. `mkcert` sem sudo e o cadeado de ponta a ponta

Este passo testa o design inteiro da D1: certificado com nome e IP no SAN, Nginx com TLS e a CA importada no Chrome do cliente sem sudo.

```bash
mkdir -p ~/bin && cd ~/bin
curl -fsSL -o mkcert "https://dl.filippo.io/mkcert/latest?for=linux/amd64" && chmod +x mkcert
~/bin/mkcert -CAROOT                     # onde a CA vai morar
ls -ld "$(~/bin/mkcert -CAROOT)"         # deve ser drwx------ (só você lê)
which certutil || echo "sem certutil"    # sem ele, o -install não mexe no Chrome
~/bin/mkcert -install 2>&1 | tail -3     # esperado: falha no store do sistema; anotar o que diz

mkdir -p "$T/certs" && cd "$T"
IP=$(hostname -I | awk '{print $1}')
~/bin/mkcert -cert-file certs/cert.pem -key-file certs/key.pem "$(hostname -f)" "$IP" "${IP//./-}.nip.io"
cat > nginx.conf <<'EOF'
server {
    listen 443 ssl;
    ssl_certificate     /certs/cert.pem;
    ssl_certificate_key /certs/key.pem;
    location / { return 200 "cadeado ok\n"; }
}
EOF
export HTTPS_PORT=8443        # ou 443, se passou no passo 2
docker run -d --name ttls -p $HTTPS_PORT:443 \
  -v "$T/nginx.conf:/etc/nginx/conf.d/default.conf:ro" -v "$T/certs:/certs:ro" nginx:alpine
docker logs ttls 2>&1 | tail -3
cp "$(~/bin/mkcert -CAROOT)/rootCA.pem" "$SG/rootCA.pem"    # só o certificado público vai para o sgoinfre
```

**A CA fica no home, não no sgoinfre.** O `rootCA-key.pem` é a chave que assina certificados em que o seu Chrome confia. No sgoinfre, outros alunos poderiam lê-la. O home da 42 já acompanha você entre os PCs e a CA ocupa dois arquivos pequenos. Para os clientes, só o `rootCA.pem` (público) vai para o sgoinfre.

No **cliente**:

1. `google-chrome --version` (ou `chromium --version`). Anotar qual existe.
2. Chrome → Configurações → Privacidade e segurança → Segurança → **Gerenciar certificados** → **Autoridades** → **Importar** → `/sgoinfre/gyasuhir/transcendence-test/rootCA.pem` → marcar "confiar para identificar sites".
3. Abrir `https://<hostname-do-servidor>:8443`, `https://<ip-do-servidor>:8443` e, se o passo 5b passou, `https://<ip-com-hifens>.nip.io:8443`.
4. Clicar no cadeado e abrir o DevTools (F12 → Console).

**Anotar:** se o cadeado aparece sem aviso pelo hostname, pelo IP e pelo nip.io, se o console está limpo e se a importação pela UI funcionou sem sudo.
**Decide:** D1 (design) e D2 (como a CA e o certificado chegam à demo); vira o roteiro do F8.6.

Por fim, no servidor: `docker rm -f ttls`.

## 8. Limpeza

```bash
docker rm -f tp80 tp443 tp8080 tp8443 tnet pgt tne tca ttls 2>/dev/null
docker image prune -a -f          # só se a cota estiver apertada; o pull volta a custar tempo
rm -rf "$T"                        # mantém ~/bin/mkcert, a CA e $SG/rootCA.pem para a próxima
```

## Resultados

| # | Pergunta | Resultado | Decide |
|---|---|---|---|
| 1 | Docker no grupo ou rootless? `Docker Root Dir`? Compose v2? | | tudo |
| 2 | Quais portas sobem (80, 443, 8080, 8443)? | | portas da demo, `PUBLIC_HOST` |
| 3a | Espaço livre: home / goinfre / sgoinfre; tipo de FS do sgoinfre | | onde ficam as imagens |
| 3b | Tamanho das imagens da stack; a cota aguentou? | | VM ou PC direto |
| 3c | Permissão de `/sgoinfre/gyasuhir` (outros leem?) | | o que pode ir para lá |
| 4 | Postgres com volume no sgoinfre sobe? | | volume `db_data` |
| 5a | Cliente alcança o servidor por hostname? por IP? | | SAN, `PUBLIC_HOST` |
| 5b | `<ip-com-hifens>.nip.io` resolve e responde no cliente? | | OAuth do Google fora do `localhost` |
| 6 | `node-exporter` funciona? cAdvisor funciona? | | D3 |
| 7a | `mkcert` roda sem sudo? tem `certutil`? | | D2 |
| 7b | Cadeado limpo no cliente por hostname, IP e nip.io, console limpo | | D1, F8.6 |
| 7c | Chrome ou Chromium? Importação de CA pela UI funcionou? | | roteiro do F8.6 |
