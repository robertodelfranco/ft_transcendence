#!/bin/sh
# Teste com 2 PCs, lado do CLIENTE (teste-2-pcs.md, parte 2). Só leitura e curl:
# não instala nada e não precisa de sudo.
#
# Uso: sh cliente-pc2.sh <hostname-do-servidor> <ip-do-servidor> <rootCA.pem do servidor>
#  ex: sh cliente-pc2.sh c1r5p1.42sp.org.br 10.11.5.1 ~/teste-2-pcs/rootCA.pem
#
# Mande a saída inteira para quem está no servidor.

HOST="$1"
IP="$2"
CA="$3"
if [ -z "$HOST" ] || [ -z "$IP" ] || [ -z "$CA" ]; then
	echo "uso: sh $0 <hostname-do-servidor> <ip-do-servidor> <rootCA.pem>"
	exit 1
fi
NIP=$(echo "$IP" | tr . -).nip.io

echo "== cliente: $(hostname -f) $(hostname -I | awk '{print $1}')  $(date '+%F %T')"
echo "== servidor: $HOST $IP $NIP"
[ -r "$CA" ] || { echo "ERRO: não consigo ler o rootCA.pem em $CA"; exit 1; }
echo "== CA: $(openssl x509 -in "$CA" -noout -subject 2>/dev/null)"

echo "== D1: DNS (esperado: os dois nomes resolvem para $IP)"
getent hosts "$HOST" || echo "  $HOST NÃO resolve"
getent hosts "$NIP"  || echo "  $NIP NÃO resolve"

echo "== D1: alcance HTTP na 8080 (esperado: 301 nos três)"
for h in $HOST $IP $NIP; do
	printf '  %-22s ' "$h"; curl -sI -m 5 "http://$h:8080/" | head -1 | grep . || echo "SEM RESPOSTA"
done

echo "== D3: HTTPS validando a CA na 8443 (esperado: 200 em tudo)"
for h in $HOST $IP $NIP; do
	for p in / /api/health /assets/map/dungeon_wall_1.png; do
		printf '  %-22s %-32s ' "$h" "$p"
		curl -s -m 5 --cacert "$CA" -o /dev/null -w '%{http_code} %{content_type}\n' "https://$h:8443$p" \
			|| echo "FALHOU (curl exit $?)"
	done
done

echo "== D3: o redirect leva a porta junto (esperado: Location: https://$HOST:8443/)"
curl -sI -m 5 "http://$HOST:8080/" | grep -i '^location' | tr -d '\r'

echo "== D5: portas internas do servidor (esperado: fechada em todas)"
for p in 8000 5432 9090 9100 9187 3000; do
	printf '  porta %-5s ' "$p"; nc -z -w 3 "$HOST" "$p" 2>/dev/null && echo "ABERTA (problema!)" || echo "fechada"
done

echo "== D4: rate limit por IP (o servidor travou o login ANTES; esperado: 401, não 429)"
curl -s -m 5 --cacert "$CA" -o /dev/null -w '  login com senha errada a partir deste PC: %{http_code}\n' \
	-H 'Content-Type: application/json' -d '{"email":"teste-2-pcs@example.com","password":"errada-errada"}' \
	"https://$HOST:8443/api/auth/login"

echo "== fim"
