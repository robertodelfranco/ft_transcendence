#!/bin/sh
# Roda antes do Nginx (/docker-entrypoint.d/). Usa o par do mkcert montado em
# /certs-host; sem ele, gera um self-signed para localhost DENTRO do container,
# para o `docker compose up` de um clone limpo subir (infra.md, decisão 11).
set -e

mkdir -p /etc/nginx/certs

if [ -f /certs-host/cert.pem ] && [ -f /certs-host/key.pem ]; then
    cp /certs-host/cert.pem /certs-host/key.pem /etc/nginx/certs/
    echo "certs.sh: usando o certificado de proxy/certs/"
else
    openssl req -x509 -newkey rsa:2048 -nodes -days 365 -subj "/CN=localhost" \
        -addext "subjectAltName=DNS:localhost,IP:127.0.0.1" \
        -keyout /etc/nginx/certs/key.pem -out /etc/nginx/certs/cert.pem 2>/dev/null
    echo "certs.sh: proxy/certs/ vazio; self-signed gerado para localhost (rode o mkcert para ter o cadeado)"
fi
