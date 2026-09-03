from fastapi import FastAPI
from fastapi.responses import HTMLResponse

app = FastAPI()

@app.get("/")
def read_root():
    return {"status": "ok", "service": "backend"}

@app.get("/health")
def health_check():
    return HTMLResponse(content="<h1>Backend is heathy</h1>", status_code=200)