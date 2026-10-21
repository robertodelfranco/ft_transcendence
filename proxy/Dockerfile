FROM nginx:alpine

# openssl: só para o self-signed de fallback do certs.sh
RUN apk add --no-cache openssl

COPY default.conf.template /etc/nginx/templates/default.conf.template
# placeholder do /media/avatars/default.png; trocar a arte é trocar este arquivo
COPY default-avatar.png /usr/share/nginx/default-avatar.png
COPY --chmod=755 certs.sh /docker-entrypoint.d/15-certs.sh

EXPOSE 80 443
