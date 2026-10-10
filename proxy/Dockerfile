FROM nginx:alpine

# openssl: só para o self-signed de fallback do certs.sh
RUN apk add --no-cache openssl

COPY default.conf.template /etc/nginx/templates/default.conf.template
COPY --chmod=755 certs.sh /docker-entrypoint.d/15-certs.sh

EXPOSE 80 443
