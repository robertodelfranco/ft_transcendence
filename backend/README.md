# Backend

FastAPI em `main.py` (vira o pacote `app/` na F0.3). A Simulation do jogo mora em `app/game/` e é Python puro: não importa FastAPI, banco nem rede, então os testes dela rodam sem subir nada.

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
| `app/game/` | Simulation: Map, estado da Room, regras, `step`, Snapshot |
| `tests/game/` | testes da Simulation |
| `tests/fixtures/maps/` | mapas pequenos, um por regra do teste dos mapas |
| `maps/coop/`, `maps/pvp/` | os Maps do jogo ([formato](../docs/contracts/map-format.md)) |

A configuração do `pytest` está em `pyproject.toml`. O `.venv/` fica fora do git e fora da imagem Docker.
