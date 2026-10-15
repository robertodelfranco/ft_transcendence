#!/bin/sh
# Migra o banco antes de a API subir (rooms.md §2.9). set -e: migração quebrada não sobe o uvicorn
set -e

alembic upgrade head

# exec: o uvicorn vira o PID 1 e recebe o SIGTERM do `compose down` (o lifespan fecha os sockets)
exec "$@"
