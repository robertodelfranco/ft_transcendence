#!/usr/bin/env bash
# Sobe o host da defesa neste PC (roteiro-defesa.md §1), sem sudo: Docker rootless com as
# imagens no goinfre e o IP real do cliente, o .env, o certificado do mkcert, a stack, a
# conferência e a CA pública no sgoinfre para os clientes. Pode rodar de novo: o que já está
# certo fica como está, e o Docker só reinicia quando a config dele muda.
#
# Uso, de dentro do clone:
#   ENV_CASA=~/env-de-casa bash docs/infra/subir-host.sh
#   GERAR_ENV=1 bash docs/infra/subir-host.sh     (sem o .env de casa: sem login pela 42)
# Os parâmetros abaixo podem ser editados aqui ou passados na linha de comando, como o ENV_CASA.
#
# O log vai para a tela e para ~/subir-host.log. Se falhar, corrija e rode de novo; mande o log
# para o time se não souber o que fazer.

# ---------- parâmetros ----------
ENV_CASA="${ENV_CASA:-}"                     # .env trazido de casa; só é copiado se o clone ainda não tem .env
GERAR_ENV="${GERAR_ENV:-0}"                  # 1: gera o .env do .env.example (FT_* vazios: sem login pela 42)
PUBLIC_NAME="${PUBLIC_NAME:-$(hostname -f)}" # o nome que os clientes digitam no Chrome
HOST_IP="${HOST_IP:-$(hostname -I | awk '{print $1}')}"
HTTP_PORT="${HTTP_PORT:-8080}"               # o rootless da 42 não abre porta abaixo de 1024
HTTPS_PORT="${HTTPS_PORT:-8443}"
EXTRA_NAMES="${EXTRA_NAMES:-}"               # nomes a mais no certificado, separados por espaço
SHARE="${SHARE:-/sgoinfre/$USER/defesa}"     # onde os clientes pegam a CA e o instalar-ca.sh
WAIT_TIMEOUT="${WAIT_TIMEOUT:-300}"          # segundos do docker compose up --wait
MKCERT_VERSION="${MKCERT_VERSION:-v1.4.4}"
LOG="${LOG:-$HOME/subir-host.log}"

REPO=$(cd "$(dirname "$0")/../.." && pwd)
ENV_FILE="$REPO/.env"
# PUBLIC_HOST leva a porta quando a HTTPS não é a 443 (README, tabela do .env)
if [ "$HTTPS_PORT" = 443 ]; then PUBLIC_HOST="$PUBLIC_NAME"; else PUBLIC_HOST="$PUBLIC_NAME:$HTTPS_PORT"; fi

log()  { printf '%s %s\n' "$(date '+%F %T')" "$*"; }
warn() { log "   AVISO: $*"; }
fail() { log "ERRO: $*"; exit 1; }

keys()  { grep -o '^[A-Z0-9_]*=' "$1" | tr -d = | sort -u; }
value() { grep -m1 "^$1=" "$ENV_FILE" | cut -d= -f2-; }

# grava $2 em $1 só se o conteúdo mudou, com o anterior em $1.bak; devolve 0 quando gravou
write_if_changed() {
	local f="$1" want="$2"
	[ "$(cat "$f" 2>/dev/null)" = "$want" ] && return 1
	mkdir -p "$(dirname "$f")"
	if [ -f "$f" ]; then
		cp "$f" "$f.bak"
		log "   $f mudou; o anterior ficou em $f.bak"
	fi
	printf '%s\n' "$want" > "$f"
	log "   gravado: $f"
}

docker_rootless() {
	if [ ! -f "$HOME/.config/systemd/user/docker.service" ]; then
		log "== Docker rootless não instalado neste login: instalando"
		dockerd-rootless-setuptool.sh install || fail "o dockerd-rootless-setuptool.sh install falhou"
	fi

	# o port driver que repassa o IP de origem depende do PC (roteiro-defesa.md; teste-2-pcs.md §1.4)
	local driver json ovr changed=0
	if command -v slirp4netns >/dev/null; then
		driver=slirp4netns
		json="{ \"data-root\": \"/goinfre/$USER/docker/\" }"
		ovr=$'[Service]\nEnvironment="DOCKERD_ROOTLESS_ROOTLESSKIT_PORT_DRIVER=slirp4netns"'
	else
		# sem o pacote, o slirp4netns derruba o daemon; o builtin repassa o IP sem o userland-proxy,
		# que pede o br_netfilter (só root carrega; a stack não usa o que ele faz)
		driver=builtin
		json="{ \"data-root\": \"/goinfre/$USER/docker/\", \"userland-proxy\": false }"
		ovr=$'[Service]\nEnvironment="DOCKERD_ROOTLESS_ROOTLESSKIT_PORT_DRIVER=builtin"\nEnvironment="DOCKER_IGNORE_BR_NETFILTER_ERROR=1"'
	fi
	log "== Docker: port driver $driver ($(command -v slirp4netns >/dev/null && echo com || echo sem) slirp4netns neste PC)"
	mkdir -p "/goinfre/$USER/docker" || fail "não consegui criar /goinfre/$USER/docker"
	write_if_changed "$HOME/.config/docker/daemon.json" "$json" && changed=1
	write_if_changed "$HOME/.config/systemd/user/docker.service.d/override.conf" "$ovr" && changed=1

	if [ "$changed" = 1 ] || ! systemctl --user is-active -q docker || ! docker info >/dev/null 2>&1; then
		log "   reiniciando o Docker do usuário (derruba os containers dele, se houver)"
		systemctl --user daemon-reload
		systemctl --user reset-failed docker 2>/dev/null
		systemctl --user restart docker \
			|| fail "o Docker não subiu: $(journalctl --user -u docker --no-pager | grep -o 'failed to start daemon.*' | tail -1)"
		local i
		for i in $(seq 1 15); do docker info >/dev/null 2>&1 && break; sleep 2; done
	else
		log "   já de pé com esta config: sem restart"
	fi

	local root pd
	root=$(docker info -f '{{.DockerRootDir}}' 2>/dev/null) || fail "o docker info não responde"
	case "$root" in
		/goinfre/*) log "   imagens em $root" ;;
		*) fail "o Docker guarda as imagens em $root, não no goinfre (o home não comporta)" ;;
	esac
	pd=$(ps -u "$USER" -o args | grep -o -- '--port-driver=[a-z0-9][a-z0-9]*' | sort -u | cut -d= -f2)
	[ "$pd" = "$driver" ] || warn "port driver em uso: '${pd:-?}', esperado $driver; o IP de origem pode chegar errado"
}

gerar_env() {
	(umask 077 && cp "$REPO/.env.example" "$ENV_FILE") || fail "não consegui criar $ENV_FILE"
	sed -i "s|^POSTGRES_USER=.*|POSTGRES_USER=transcendence|; \
		s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -hex 16)|; \
		s|^JWT_SECRET=.*|JWT_SECRET=$(openssl rand -hex 32)|; \
		s|^GF_SECURITY_ADMIN_USER=.*|GF_SECURITY_ADMIN_USER=admin|; \
		s|^GF_SECURITY_ADMIN_PASSWORD=.*|GF_SECURITY_ADMIN_PASSWORD=$(openssl rand -hex 12)|" "$ENV_FILE"
	log "== .env: gerado do .env.example (a senha do Grafana: grep GF_SECURITY_ADMIN_PASSWORD .env)"
}

preparar_env() {
	if [ -f "$ENV_FILE" ]; then
		log "== .env: mantendo o que já está em $ENV_FILE"
	elif [ -n "$ENV_CASA" ]; then
		[ -r "$ENV_CASA" ] || fail "não consigo ler ENV_CASA=$ENV_CASA"
		(umask 077 && cp "$ENV_CASA" "$ENV_FILE") || fail "não consegui copiar $ENV_CASA"
		log "== .env: copiado de $ENV_CASA"
	elif [ "$GERAR_ENV" = 1 ]; then
		gerar_env
	else
		fail "sem .env: passe ENV_CASA=<caminho do .env de casa>, ou GERAR_ENV=1 para gerar um (sem login pela 42)"
	fi
	chmod 600 "$ENV_FILE"

	# a borda é deste PC; banco, JWT, OAuth e Grafana ficam como vieram
	sed -i "s|^PUBLIC_HOST=.*|PUBLIC_HOST=$PUBLIC_HOST|; \
		s|^PROXY_HTTP_PORT=.*|PROXY_HTTP_PORT=$HTTP_PORT|; \
		s|^PROXY_HTTPS_PORT=.*|PROXY_HTTPS_PORT=$HTTPS_PORT|" "$ENV_FILE"
	log "   PUBLIC_HOST=$(value PUBLIC_HOST) PROXY_HTTP_PORT=$(value PROXY_HTTP_PORT) PROXY_HTTPS_PORT=$(value PROXY_HTTPS_PORT)"

	local missing extra k
	missing=$(comm -23 <(keys "$REPO/.env.example") <(keys "$ENV_FILE") | tr '\n' ' ')
	extra=$(comm -13 <(keys "$REPO/.env.example") <(keys "$ENV_FILE") | tr '\n' ' ')
	[ -z "$missing" ] || fail "faltam no .env as chaves: $missing(copie as linhas do .env.example)"
	[ -z "$extra" ] || warn "chaves que não existem mais no .env.example: $extra"
	for k in POSTGRES_USER POSTGRES_PASSWORD GF_SECURITY_ADMIN_USER GF_SECURITY_ADMIN_PASSWORD; do
		[ -n "$(value $k)" ] || fail "$k vazio no .env"
	done
	[ "$(value JWT_SECRET | wc -c)" -gt 32 ] || fail "JWT_SECRET com menos de 32 caracteres"
	if [ -z "$(value FT_CLIENT_ID)" ] || [ -z "$(value FT_CLIENT_SECRET)" ]; then
		warn "FT_CLIENT_ID ou FT_CLIENT_SECRET vazio: o login pela 42 não vai funcionar"
	fi
}

portas_livres() {
	# a porta ocupada pelo proxy deste mesmo clone é só o script rodando de novo
	[ -n "$(docker compose ps -q --status running proxy 2>/dev/null)" ] && return
	local p
	for p in "$HTTP_PORT" "$HTTPS_PORT"; do
		[ -z "$(ss -ltnH "sport = :$p")" ] \
			|| fail "a porta $p já está em uso: outra stack de pé? (docker ps; docker compose down na pasta dela)"
	done
}

# devolve 0 se o certificado já existe, é da CA deste login, vale por mais 1 dia e cobre todos os nomes
cert_serve() {
	local cert="$1" ca="$2" san n
	shift 2
	[ -f "$cert" ] && [ -f "$REPO/proxy/certs/key.pem" ] && [ -f "$ca" ] || return 1
	openssl verify -CAfile "$ca" "$cert" >/dev/null 2>&1 || return 1
	openssl x509 -in "$cert" -noout -checkend 86400 >/dev/null || return 1
	san=$(openssl x509 -in "$cert" -noout -ext subjectAltName | tr ',' '\n' | sed 's/^ *//; s/^DNS://; s/^IP Address://')
	for n in "$@"; do
		printf '%s\n' "$san" | grep -qxF "$n" || return 1
	done
}

certificado() {
	MKCERT="$HOME/bin/mkcert"
	if [ ! -x "$MKCERT" ]; then
		log "== baixando o mkcert $MKCERT_VERSION para $MKCERT"
		mkdir -p "$HOME/bin"
		curl -fsSL -o "$MKCERT" "https://dl.filippo.io/mkcert/$MKCERT_VERSION?for=linux/amd64" && chmod +x "$MKCERT" \
			|| { rm -f "$MKCERT"; fail "não consegui baixar o mkcert"; }
	fi
	CA="$("$MKCERT" -CAROOT)/rootCA.pem"

	local -a names extra
	read -ra extra <<< "$EXTRA_NAMES"
	names=("$PUBLIC_NAME" "$HOST_IP" localhost 127.0.0.1 "${extra[@]}")
	local cert="$REPO/proxy/certs/cert.pem"
	if cert_serve "$cert" "$CA" "${names[@]}"; then
		log "== certificado: o de proxy/certs já cobre ${names[*]}"
		CERT_NOVO=0
	else
		log "== certificado: gerando para ${names[*]}"
		"$MKCERT" -cert-file "$cert" -key-file "$REPO/proxy/certs/key.pem" "${names[@]}" || fail "o mkcert falhou"
		CERT_NOVO=1
	fi
}

diagnosticar() {
	log "== diagnóstico"
	docker compose ps -a
	docker compose logs --tail 30 backend proxy
	if docker compose logs backend 2>&1 | grep -qE 'password authentication failed|role ".*" does not exist'; then
		log "   O volume do banco foi criado com outro usuário ou senha: o Postgres só lê o .env na primeira subida."
		log "   Se os dados podem ir embora: docker compose down -v, e rode o script de novo."
	fi
}

subir() {
	local proxy_antes
	proxy_antes=$(docker compose ps -q --status running proxy 2>/dev/null)
	log "== docker compose up (até ${WAIT_TIMEOUT}s; o primeiro build leva alguns minutos)"
	if ! docker compose up -d --build --wait --wait-timeout "$WAIT_TIMEOUT"; then
		diagnosticar
		fail "o docker compose up falhou"
	fi
	# o certs.sh do proxy só copia o certificado quando o container parte
	if [ "$CERT_NOVO" = 1 ] && [ -n "$proxy_antes" ]; then
		log "   certificado novo com o proxy já de pé: reiniciando o proxy"
		docker compose restart proxy && docker compose up -d --wait --wait-timeout 60 proxy || fail "o proxy não voltou"
	fi
}

conferir() {
	log "== conferindo"
	local svc state health ports bad=""
	while IFS='|' read -r svc state health ports; do
		[ "$state" = running ] && { [ -z "$health" ] || [ "$health" = healthy ]; } || bad+="$svc($state${health:+ $health}) "
		[ "$svc" = proxy ] || [[ $ports != *0.0.0.0* ]] || fail "$svc publica porta no host ($ports): só o proxy pode"
	done < <(docker compose ps --format '{{.Service}}|{{.State}}|{{.Health}}|{{.Ports}}')
	[ -z "$bad" ] || fail "serviços fora do ar: $bad"
	log "   $(docker compose ps -q | wc -l) serviços de pé; só o proxy publica porta"

	local out rc
	out=$(curl -s -m 5 --cacert "$CA" "https://$PUBLIC_HOST/api/health")
	rc=$?
	[ "$rc" = 0 ] || fail "https://$PUBLIC_HOST/api/health não respondeu (curl $rc; 60 = certificado, 6 = nome, 7 = conexão)"
	[[ $out == *'"status":"ok"'* ]] || fail "https://$PUBLIC_HOST/api/health respondeu sem status ok: $out"
	log "   https://$PUBLIC_HOST/api/health: $out"

	out=$(curl -s -m 5 -o /dev/null -w '%{http_code} %{redirect_url}' "http://$PUBLIC_NAME:$HTTP_PORT/")
	[ "$out" = "301 https://$PUBLIC_HOST/" ] || fail "o HTTP não redireciona para https://$PUBLIC_HOST/ (veio: $out)"
	log "   http://$PUBLIC_NAME:$HTTP_PORT/: $out"

	# logo depois do up, um alvo pode aparecer unknown até o primeiro scrape
	local i targets up total
	for i in $(seq 1 10); do
		targets=$(docker compose exec -T prometheus wget -qO- 'http://localhost:9090/api/v1/targets?state=active' 2>/dev/null)
		up=$(grep -o '"health":"up"' <<< "$targets" | wc -l)
		total=$(grep -o '"health":"[a-z]*"' <<< "$targets" | wc -l)
		[ "$total" -ge 3 ] && [ "$up" = "$total" ] && break
		sleep 3
	done
	[ "$total" -ge 3 ] && [ "$up" = "$total" ] || fail "Prometheus com $up de $total alvos up (esperado 3 de 3)"
	log "   Prometheus: $up de $total alvos up"

	# o health acima saiu deste PC pelo nome público: o Nginx tem que ver o IP do PC, não o da rede do Docker
	local src
	src=$(docker compose logs --no-log-prefix --tail 50 proxy 2>/dev/null | grep ' /api/health ' | tail -1 | awk '{print $1}')
	if [ "$src" = "$HOST_IP" ]; then
		log "   IP de origem no Nginx: $src (o rate limit separa os clientes)"
	else
		warn "IP de origem no Nginx: '${src:-?}', esperado $HOST_IP; com 172.x, o rate limit vira global na demo"
	fi
}

entregar() {
	log "== entregando a CA pública aos clientes em $SHARE"
	mkdir -p "$SHARE" || fail "não consegui criar $SHARE"
	cp "$CA" "$SHARE/rootCA.pem" && cp "$REPO/docs/infra/instalar-ca.sh" "$SHARE/instalar-ca.sh" \
		&& printf '%s\n' "$PUBLIC_HOST" > "$SHARE/SITE" || fail "não consegui copiar para $SHARE"
	# a chave da CA assina certificado para qualquer site: ela nunca sai do home do host
	local f
	for f in "$SHARE"/*.pem; do
		grep -q 'PRIVATE KEY' "$f" && { rm -f "$f"; fail "$f tinha uma chave privada e foi apagado"; }
	done
	chmod 644 "$SHARE/rootCA.pem" "$SHARE/instalar-ca.sh" "$SHARE/SITE" && chmod 755 "$SHARE"
	# 711: os outros atravessam o sgoinfre do host sem listá-lo
	case "$SHARE" in "/sgoinfre/$USER"/*) chmod 711 "/sgoinfre/$USER" ;; esac
	log "   $(cd "$SHARE" && echo *)"
}

main() {
	log "== host: $PUBLIC_NAME $HOST_IP  login: $USER  clone: $REPO ($(git -C "$REPO" log -1 --format='%h %s' 2>/dev/null))"
	log "   log: $LOG"
	[ "$(id -u)" -ne 0 ] || fail "não rode como root: o Docker da 42 é rootless, do seu usuário"
	[ -f "$REPO/docker-compose.yml" ] || fail "$REPO não é o clone do ft_transcendence: rode o script de dentro do clone"
	local c
	for c in docker git curl openssl systemctl ss; do
		command -v "$c" >/dev/null || fail "falta o comando $c neste PC"
	done
	[ -d "/goinfre/$USER" ] && [ -w "/goinfre/$USER" ] || fail "/goinfre/$USER não existe ou não é gravável: as imagens não cabem no home"
	[ -n "$PUBLIC_NAME" ] && [ -n "$HOST_IP" ] || fail "não descobri o nome ou o IP deste PC: defina PUBLIC_NAME e HOST_IP"
	cd "$REPO" || fail "não consegui entrar em $REPO"

	docker_rootless
	preparar_env
	portas_livres
	certificado
	# com umask 077, o Prometheus do rootless não lê a config montada
	chmod -R go+rX "$REPO/monitoring"
	subir
	conferir
	entregar

	log "== pronto"
	log "   site:     https://$PUBLIC_HOST"
	log "   grafana:  https://$PUBLIC_HOST/grafana/ (usuário $(value GF_SECURITY_ADMIN_USER); a senha está no .env)"
	log "   intra:    cadastre a URL de retorno https://$PUBLIC_HOST/api/auth/oauth/42/callback"
	log "   clientes: bash $SHARE/instalar-ca.sh"
	log "   log ao vivo: cd $REPO && docker compose logs -f proxy"
}

main "$@" 2>&1 | tee -a "$LOG"
exit "${PIPESTATUS[0]}"
