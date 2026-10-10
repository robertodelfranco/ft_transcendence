from fastapi import FastAPI
from fastapi.responses import HTMLResponse

app = FastAPI()

@app.get("/")
def read_root():
    return {"status": "ok", "service": "backend"}

@app.get("/api/health")   # era "/health": o Nginx não corta mais o /api (infra.md, decisão 5)
def health_check():
    return HTMLResponse(content="<h1>Backend is heathy</h1>", status_code=200)