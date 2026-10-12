from fastapi import APIRouter


# o prefixo fica no router: o Nginx não corta o /api (infra.md §4, decisão 5)
router = APIRouter(prefix="/api", tags=["health"])


@router.get("/health")
async def health() -> dict[str, str]:
	return {"status": "ok"}
