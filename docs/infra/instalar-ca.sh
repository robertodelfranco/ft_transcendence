#!/usr/bin/env bash
# Instala a CA do mkcert do host no Chrome deste PC (roteiro-defesa.md §2), sem sudo.
# Grava no banco NSS do usuário (~/.pki/nssdb), onde o Chrome do Linux procura as CAs
# "instaladas por você": é o mesmo que o Importar do chrome://settings/certificates.
# Sem o certutil no PC, baixa o libnss3-tools com apt-get download e extrai no home.
#
# Uso: bash instalar-ca.sh [rootCA.pem] [host:porta]
#      bash instalar-ca.sh --remover
#  ex: bash /sgoinfre/<login-do-host>/defesa/instalar-ca.sh
#      bash instalar-ca.sh ~/rootCA.pem c1r5p2.42sp.org.br:8443
# Sem argumentos, usa o rootCA.pem e o SITE que o subir-host.sh deixa ao lado deste script;
# sem eles, a CA do mkcert deste login. Com o host:porta (ou o SITE), confere no fim se a CA
# valida o certificado do site. O --remover tira do Chrome todas as CAs que este script instalou.
#
# O log vai para a tela e para ~/instalar-ca.log. Se falhar, mande o log para quem está no host.

LOG="${LOG:-$HOME/instalar-ca.log}"
NSSDB="${NSSDB:-$HOME/.pki/nssdb}"
NSS_TOOLS="${NSS_TOOLS:-$HOME/.local/lib/nss-tools}" # onde o certutil fica quando o PC não tem o pacote
PREFIX="ft_transcendence - "                         # apelido no banco NSS; o --remover procura por ele

log()  { printf '%s %s\n' "$(date '+%F %T')" "$*"; }
fail() { log "ERRO: $*"; exit 1; }

achar_certutil() {
	if command -v certutil >/dev/null; then
		CERTUTIL=$(command -v certutil)
	elif [ -x "$NSS_TOOLS/usr/bin/certutil" ]; then
		CERTUTIL="$NSS_TOOLS/usr/bin/certutil"
	else
		log "== certutil ausente: baixando o libnss3-tools para $NSS_TOOLS (sem sudo)"
		local tmp
		tmp=$(mktemp -d) || fail "mktemp falhou"
		(cd "$tmp" && apt-get download libnss3-tools) || fail "apt-get download libnss3-tools falhou (sem rede?)"
		mkdir -p "$NSS_TOOLS" && dpkg -x "$tmp"/libnss3-tools_*.deb "$NSS_TOOLS" || fail "dpkg -x falhou"
		rm -rf "$tmp"
		CERTUTIL="$NSS_TOOLS/usr/bin/certutil"
	fi
	log "   certutil: $CERTUTIL"
}

remover() {
	log "== removendo do $NSSDB as CAs \"$PREFIX*\""
	[ -f "$NSSDB/cert9.db" ] || { log "   sem banco NSS: nada a remover"; return; }
	achar_certutil
	local nick n=0
	# o -L alinha o apelido à esquerda e as flags de confiança no fim da linha
	while IFS= read -r nick; do
		"$CERTUTIL" -D -d "sql:$NSSDB" -n "$nick" || fail "certutil -D falhou para \"$nick\""
		log "   removida: \"$nick\""
		n=$((n + 1))
	done < <("$CERTUTIL" -L -d "sql:$NSSDB" | grep -F "$PREFIX" | sed -E 's/[[:space:]]+[^[:space:]]+[[:space:]]*$//')
	log "== $n removida(s). Feche todas as janelas do Chrome para ele esquecer a CA."
}

main() {
	local dir
	dir=$(cd "$(dirname "$0")" && pwd)

	log "== PC: $(hostname -f) $(hostname -I | awk '{print $1}')  login: $USER  log: $LOG"

	if [ "$1" = --remover ]; then
		remover
		return
	fi
	local ca="$1" site="$2"

	# ---------- a CA ----------
	if [ -z "$ca" ]; then
		if [ -r "$dir/rootCA.pem" ]; then
			ca="$dir/rootCA.pem"
		elif [ -x "$HOME/bin/mkcert" ]; then
			ca="$("$HOME/bin/mkcert" -CAROOT)/rootCA.pem"
		fi
	fi
	# o subir-host.sh grava o host:porta no SITE, ao lado da CA
	[ -n "$site" ] || [ ! -r "$dir/SITE" ] || site=$(head -1 "$dir/SITE")
	[ -n "$ca" ] || fail "sem rootCA.pem: passe o caminho (uso: bash $0 [rootCA.pem] [host:porta])"
	[ -r "$ca" ] || fail "não consigo ler $ca"
	# a chave da CA assina certificado para qualquer site: ela nunca sai do host
	grep -q 'PRIVATE KEY' "$ca" && fail "$ca tem uma chave privada; use o rootCA.pem, nunca o rootCA-key.pem"
	openssl x509 -in "$ca" -noout 2>/dev/null || fail "$ca não é um certificado PEM"
	openssl x509 -in "$ca" -noout -ext basicConstraints 2>/dev/null | grep -q 'CA:TRUE' \
		|| fail "$ca não é uma CA (é o cert.pem do proxy?); use o rootCA.pem"
	local cn fp
	cn=$(openssl x509 -in "$ca" -noout -subject -nameopt multiline | sed -n 's/^ *commonName *= *//p')
	fp=$(openssl x509 -in "$ca" -noout -fingerprint -sha256 | cut -d= -f2)
	log "== CA: $ca"
	log "   CN: $cn"
	log "   SHA-256: $fp"

	# ---------- o certutil e o banco NSS ----------
	achar_certutil
	if [ ! -f "$NSSDB/cert9.db" ]; then
		log "== $NSSDB sem banco: criando (o Chrome usa o mesmo)"
		mkdir -p "$NSSDB" && chmod 700 "$NSSDB"
		"$CERTUTIL" -N -d "sql:$NSSDB" --empty-password || fail "certutil -N falhou"
	fi
	pgrep -u "$USER" -x chrome >/dev/null \
		&& log "   aviso: o Chrome está aberto; feche TODAS as janelas depois da instalação"

	# ---------- a instalação ----------
	# o CN leva login@PC do host: CAs de hosts diferentes não se sobrescrevem
	local nick="$PREFIX$cn" old
	if old=$("$CERTUTIL" -L -d "sql:$NSSDB" -n "$nick" -a 2>/dev/null) \
		&& [ "$(printf '%s\n' "$old" | openssl x509 -noout -fingerprint -sha256 | cut -d= -f2)" = "$fp" ]; then
		log "== a CA já está instalada como \"$nick\"; nada a fazer"
	else
		if [ -n "$old" ]; then
			log "== \"$nick\" existe com outro certificado (o mkcert do host foi refeito?): trocando"
			"$CERTUTIL" -D -d "sql:$NSSDB" -n "$nick" || fail "certutil -D falhou"
		fi
		log "== instalando como \"$nick\" (C,,: CA confiável para sites)"
		"$CERTUTIL" -A -d "sql:$NSSDB" -t "C,," -n "$nick" -i "$ca" || fail "certutil -A falhou"
	fi
	"$CERTUTIL" -L -d "sql:$NSSDB" | grep -F "$nick" | grep -q 'C,,' || fail "a CA não aparece como confiável no $NSSDB"
	log "   no banco: $("$CERTUTIL" -L -d "sql:$NSSDB" | grep -F "$nick" | tr -s ' ')"

	# ---------- o site ----------
	if [ -n "$site" ]; then
		log "== conferindo https://$site/api/health com esta CA (esperado: {\"status\":\"ok\"})"
		local out rc
		out=$(curl -s -m 5 --cacert "$ca" "https://$site/api/health")
		rc=$?
		case $rc in
			0)     [[ $out == *'"status":"ok"'* ]] || fail "$site respondeu, mas não é o backend: $out"
			       log "   $out" ;;
			60)    fail "a CA não valida o certificado de $site: rootCA.pem de outro host, ou o nome fora do certificado (curl 60)" ;;
			6)     fail "o nome de $site não resolve neste PC (curl 6)" ;;
			7|28)  fail "$site não responde: a stack está de pé no host? (curl $rc)" ;;
			*)     fail "curl falhou com exit $rc" ;;
		esac
	fi

	log "== pronto. Agora:"
	log "   1. feche todas as janelas do Chrome e abra uma janela anônima (Ctrl+Shift+N)"
	log "   2. abra https://${site:-<HOST>:8443}, sempre pelo hostname"
	log "   para desinstalar: bash $0 --remover"
}

main "$@" 2>&1 | tee -a "$LOG"
exit "${PIPESTATUS[0]}"
