# Backend

FastAPI no pacote `app/`: `app/main.py` tem o `create_app()`, e o uvicorn sobe `app.main:app`. A Simulation do jogo mora em `app/game/` e é Python puro: não importa FastAPI, banco nem rede, então os testes dela rodam sem subir nada.

## Rodar os testes na sua máquina

A imagem do backend usa Python 3.12; use a mesma versão no ambiente virtual.

```bash
cd backend
mise exec python@3.12 -- python -m venv .venv   # ou: python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
pytest
```

Depois da primeira vez, basta `source .venv/bin/activate` e `pytest`.

| Comando | O que roda |
|---|---|
| `pytest` | todos os testes de `backend/tests/` |
| `pytest tests/game` | só os da Simulation |
| `pytest tests/game/test_world.py -k spawn` | os testes de um arquivo cujo nome contém `spawn` |
| `pytest -x` | para no primeiro que falhar |

### Testes que usam o banco

Os testes com a fixture `db_session` precisam de um Postgres. Sem ele, eles são pulados (o `-ra` mostra o motivo) e o resto roda normal. No CI o Postgres vem como service, e a falta dele reprova em vez de pular.

Para rodá-los na sua máquina, suba um Postgres descartável e aponte as `POSTGRES_*` para ele:

```bash
docker run --rm -d --name pg-test -p 5432:5432 -e POSTGRES_PASSWORD=test -e POSTGRES_DB=transcendence postgres:16-alpine
export POSTGRES_PASSWORD=test   # user postgres, host localhost, porta 5432 e banco transcendence já são o default
pytest
docker stop pg-test             # --rm apaga o container e os dados
```

A primeira vez que um teste de banco roda, o `conftest` aplica as migrações (`alembic upgrade head`). Cada teste roda numa transação que sofre rollback no fim, então nada sobra de um teste para outro.

## Migrações (Alembic)

Uma pasta só, `alembic/`, numa cadeia linear ([rooms.md §2.9](../docs/contracts/rooms.md)). A URL do banco vem das mesmas `POSTGRES_*` do app; o `alembic.ini` não guarda URL.

| Comando | O que faz |
|---|---|
| `alembic upgrade head` | aplica as migrações que faltam |
| `alembic check` | reprova se os modelos e as migrações divergem (o CI roda) |
| `alembic downgrade -1` | desfaz a última |
| `alembic revision --autogenerate --rev-id 0002 -m <slug>` | gera a próxima revisão a partir da diferença entre os modelos e o banco |

Para criar uma revisão:
1. Avise no canal, para duas pessoas não partirem da mesma `head`. Duas cabeças quebram o `upgrade head` (rooms.md §4, decisão 4).
2. Use o próximo número em `--rev-id`.
3. Revise o arquivo gerado antes de commitar.

Tabela num módulo novo de modelos precisa ser importada em `alembic/env.py`, senão o `check` não a enxerga.

## Pastas

| Pasta | Conteúdo |
|---|---|
| `app/main.py` | `create_app()`: routers, middleware e handlers de erro |
| `app/db/base.py` | `Base` do SQLAlchemy, compartilhada por todas as tabelas, e os tipos de coluna reaproveitáveis (`BigIntPK`, `CreatedAt`, `UserFK`) |
| `app/db/session.py` | engine, `SessionLocal` e `DbSession` (uma sessão por requisição; o commit é de quem escreve) |
| `app/auth/models.py` | tabelas de usuários ([auth.md §2.9](../docs/contracts/auth.md)) |
| `app/matches/models.py` | tabelas de partidas ([rooms.md §2.7](../docs/contracts/rooms.md)) |
| `alembic/` | `env.py` e as migrações em `versions/` |
| `app/core/` | configuração (`config.py`), `request_id` e envelope de erro (`errors.py`, [auth.md §2.5](../docs/contracts/auth.md)) |
| `app/game/` | Simulation: Map, estado da Room, regras, `step`, Snapshot |
| `tests/conftest.py` | fixtures `app` e `client` (httpx + `ASGITransport`), usadas pelos testes de rota de todas as Slices, e `db_session` (sessão com rollback, também entregue às rotas) |
| `tests/matches/` | testes de partidas; `test_models.py` confere as tabelas contra o contrato |
| `tests/auth/` | testes de auth; `test_models.py` confere as tabelas contra o contrato, sem banco |
| `tests/game/` | testes da Simulation |
| `tests/fixtures/maps/` | mapas pequenos, um por regra do teste dos mapas |
| `maps/coop/`, `maps/pvp/` | os Maps do jogo ([formato](../docs/contracts/map-format.md)) |

## A porta da Simulation

`app/game/__init__.py` é a porta: o resto do backend importa a Simulation só por ele (`from app.game import step`) e nunca lê nem escreve campo da Room. A lista das funções está no [roadmap, seção 5](../docs/roadmap-roberto.md#5-a-porta-da-simulation).

O `__init__.py` não importa `rooms.py`, `protocol.py` nem `router.py`, que moram na mesma pasta e são do Netcode. É o que mantém a Simulation sem FastAPI e evita importação circular. Mudança na porta passa pela revisão do Roberto.

A configuração do `pytest` está em `pyproject.toml`. O `.venv/` fica fora do git e fora da imagem Docker.
