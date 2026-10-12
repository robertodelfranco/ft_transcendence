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

## Pastas

| Pasta | Conteúdo |
|---|---|
| `app/main.py` | `create_app()`: routers, middleware e handlers de erro |
| `app/db/base.py` | `Base` do SQLAlchemy, compartilhada por todas as tabelas, e os tipos de coluna reaproveitáveis (`BigIntPK`, `CreatedAt`, `UserFK`) |
| `app/auth/models.py` | tabelas de usuários ([auth.md §2.9](../docs/contracts/auth.md)) |
| `app/core/` | configuração (`config.py`), `request_id` e envelope de erro (`errors.py`, [auth.md §2.5](../docs/contracts/auth.md)) |
| `app/game/` | Simulation: Map, estado da Room, regras, `step`, Snapshot |
| `tests/conftest.py` | fixtures `app` e `client` (httpx + `ASGITransport`), usadas pelos testes de rota de todas as Slices |
| `tests/auth/` | testes de auth; `test_models.py` confere as tabelas contra o contrato, sem banco |
| `tests/game/` | testes da Simulation |
| `tests/fixtures/maps/` | mapas pequenos, um por regra do teste dos mapas |
| `maps/coop/`, `maps/pvp/` | os Maps do jogo ([formato](../docs/contracts/map-format.md)) |

## A porta da Simulation

`app/game/__init__.py` é a porta: o resto do backend importa a Simulation só por ele (`from app.game import step`) e nunca lê nem escreve campo da Room. A lista das funções está no [roadmap, seção 5](../docs/roadmap-roberto.md#5-a-porta-da-simulation).

O `__init__.py` não importa `rooms.py`, `protocol.py` nem `router.py`, que moram na mesma pasta e são do Netcode. É o que mantém a Simulation sem FastAPI e evita importação circular. Mudança na porta passa pela revisão do Roberto.

A configuração do `pytest` está em `pyproject.toml`. O `.venv/` fica fora do git e fora da imagem Docker.
