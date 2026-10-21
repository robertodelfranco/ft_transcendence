FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

# Migra e depois roda o CMD; com sh, o script não depende do bit de execução do checkout
ENTRYPOINT ["sh", "entrypoint.sh"]
# Um worker só (infra.md, decisão 8); --proxy-headers faz o IP e o https do Nginx valerem.
# --ws-max-size: o padrão de 16 MiB seria lido inteiro antes de o MAX_MESSAGE_BYTES (4 KiB) recusar
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*", "--ws-max-size", "65536"]
