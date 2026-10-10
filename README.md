# ft_transcendence

Stack em containers, orquestrada por Docker Compose:

| Serviço    | Imagem / build   | Papel                                                |
| ---------- | ---------------- | ---------------------------------------------------- |
| `proxy`    | `./proxy`        | Nginx na borda, único container com porta exposta     |
| `frontend` | `./frontend`     | Nginx servindo os arquivos estáticos                  |
| `backend`  | `./backend`      | FastAPI + uvicorn na porta 8000 (rede interna)        |
| `db`       | `postgres:16-alpine` | Postgres, dados persistidos no volume `db_data`   |

Todos os containers ficam na rede bridge `transcendence`. Só o `proxy` publica
porta pro host. O resto se fala pelo nome do serviço (`backend`, `db`, ...).

## Como subir

Pré-requisitos: Docker e Docker Compose v2.

```bash
# 1. criar o seu .env a partir do template (só na primeira vez)
cp .env.example .env
# preencha POSTGRES_USER / POSTGRES_PASSWORD / POSTGRES_DB

# 2. subir tudo
docker compose up --build
```

O `.env` **não** é versionado (está no `.gitignore`). Ele é lido pelo
`docker-compose.yml` e injetado em `db` e `backend` via `env_file`.

Depois que subir:

- Frontend: <https://localhost>
- Backend via proxy: <https://localhost/api/health>
- `http://` redireciona para `https://`

As portas do host vêm de `PROXY_HTTP_PORT` e `PROXY_HTTPS_PORT` no `.env` (default
80 e 443). Se a HTTPS não for a 443, o `PUBLIC_HOST` leva a porta
(`PUBLIC_HOST=localhost:8443`), porque é dele que sai o redirect.

### HTTPS local (cadeado sem aviso)

Sem certificado em `proxy/certs/`, o proxy gera um self-signed e tudo sobe, mas o
Chrome mostra a tela de aviso. Para o cadeado limpo, use o
[mkcert](https://github.com/FiloSottile/mkcert) uma vez:

```bash
mkcert -install                       # cria a CA local e instala nos navegadores desta máquina
mkcert -cert-file proxy/certs/cert.pem -key-file proxy/certs/key.pem localhost 127.0.0.1
docker compose up -d --build proxy    # o proxy pega o certificado ao subir
```

- **WSL2:** o Chrome é o do Windows e não enxerga a CA do Linux. Importe
  `$(mkcert -CAROOT)/rootCA.pem` no `certmgr.msc` do Windows, em *Autoridades de
  Certificação Raiz Confiáveis* (repositório do usuário, sem admin).
- **Outra máquina na rede:** gere o certificado para o nome e o IP dela e importe o
  `rootCA.pem` no Chrome dos clientes (Configurações → Segurança → Gerenciar
  certificados → Autoridades). Nunca copie o `rootCA-key.pem`.
- Os certificados não são versionados (`proxy/certs/` está no `.gitignore`).

### Comandos do dia a dia

```bash
docker compose up --build -d      # subir em background
docker compose logs -f backend    # acompanhar logs de um serviço
docker compose ps                 # ver o que está de pé
docker compose down               # derrubar (mantém o volume do banco)
docker compose down -v            # derrubar E apagar o volume do banco
```

### Sobre o banco

Os scripts em `db/init/` rodam **apenas na primeira vez** que o Postgres sobe,
ou seja, quando o volume `db_data` está vazio. Se você alterar o schema e quiser
reaplicar, precisa recriar o volume:

```bash
docker compose down -v && docker compose up --build
```

`db/init/001_schema.sql` é o que fica versionado, então todo mundo do time sobe
o mesmo schema, mas ele NÃO É O SCHEMA REAL, apenas exemplo por enquanto.

## Automação do GitHub Projects

O workflow em [.github/workflows/main.yml](.github/workflows/main.yml) move
automaticamente a issue no GitHub Project (board nº 3, owner
`robertodelfranco`) conforme o ciclo de vida do PR, assim ninguém precisa
arrastar card na mão.

### Como funciona

O gatilho é `pull_request` com os tipos `opened`, `reopened`, `synchronize` e
`closed`. Como o `on.types` é compartilhado por todos os jobs, cada job usa um
`if` pra filtrar a ação que interessa.

Em ambos os casos o job extrai o número da issue do **corpo do PR**, com um
regex que aceita as keywords de fechamento do GitHub (`close/closes/closed`,
`fix/fixes/fixed`, `resolve/resolves/resolved`) seguidas de `#<número>`. Com o
número em mãos, chama `gh project item-edit` apontando pra URL da issue e seta
o campo `Status`.

Se o corpo do PR não tiver nenhuma referência de issue, o `if [ -n "$issue_num" ]`
faz o job não fazer nada, sem erro, só não move card nenhum, ou seja, se leu até
aqui, não esse de por o **close/fix/resolve #[Número do issue] no corpo da PR**.

### O que você precisa fazer pra automação funcionar

1. **Referenciar a issue no corpo do PR.** O
   [template de PR](.github/PULL_REQUEST_TEMPLATE.md) já vem com `Closes #` —
   é só completar o número. Sem isso, o card não se move.
2. Nada mais: merge do PR fecha a issue (comportamento nativo do GitHub por
   causa da keyword), e o board acompanha.
