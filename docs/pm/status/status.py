#!/usr/bin/env python3
"""Status do projeto para a reunião de segunda: lê o plano e o GitHub, grava um snapshot e gera a página.

    python3 docs/pm/status/status.py coletar [AAAA-MM-DD]   # snapshots/AAAA-MM-DD.json (hoje, sem data)
    python3 docs/pm/status/status.py gerar                  # index.html com todos os snapshots

Só biblioteca padrão e o `gh` autenticado. As regras de contagem estão no README.md ao lado.
"""
import json
import re
import subprocess
import sys
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
PLAN = ROOT / "docs" / "catacombs42-plano-de-tarefas.md"
REPO = "robertodelfranco/ft_transcendence"
SNAPSHOTS = HERE / "snapshots"
AJUSTES = HERE / "ajustes.json"

MEMBERS = ["roberto", "augusto", "rafael", "caio", "akita"]
TASK_ID = re.compile(r"\bF(\d)\.(\d+)\b")
TASK_ID_ANY = re.compile(r"\bF\d\.\d+\b")


def load_ajustes() -> dict:
	return json.loads(AJUSTES.read_text(encoding="utf-8"))


# ---------- plano ----------

def parse_days(text: str) -> float:
	text = text.strip()
	if text == "incluso":
		return 0.0
	if m := re.fullmatch(r"([\d,]+)\s*×\s*(\d+)", text): # "1 × 5": um dia por pessoa
		return float(m[1].replace(",", ".")) * int(m[2])
	return float(text.replace(",", "."))


def parse_week(text: str) -> str:
	# a tarefa conta na semana em que termina: "S1–S2" e "S1 + S5" contam na última
	return re.findall(r"S\d", text)[-1]


def owner_of(task_id: str, plan_owners: dict) -> str:
	"""Dono pela alocação do plano §9 (ajustes.json > dono_por_tarefa, depois por frente)."""
	if task_id in plan_owners["por_tarefa"]:
		return plan_owners["por_tarefa"][task_id]
	return plan_owners["por_frente"][task_id.split(".")[0]]


def parse_plan(ajustes: dict) -> list[dict]:
	"""As linhas `| F1.1 | tarefa | d | dep | sem | pronto quando |` da §5."""
	text = PLAN.read_text(encoding="utf-8")
	section = text.split("## 5. Tarefas por frente", 1)[1].split("## 6. Semana a semana", 1)[0]
	tasks = []
	for line in section.splitlines():
		cells = [c.strip() for c in line.replace("\\|", "¦").strip().strip("|").split("|")]
		if len(cells) == 6 and TASK_ID.fullmatch(cells[0]):
			title = re.sub(r"\*\*|`", "", cells[1])
			tasks.append({"id": cells[0], "titulo": short_title(title), "d": parse_days(cells[2]),
				"depende": TASK_ID_ANY.findall(cells[3]), "semana": parse_week(cells[4]),
				"dono": owner_of(cells[0], ajustes["donos"])})
	return tasks


def short_title(title: str) -> str:
	title = re.split(r";| — ", title)[0].strip()
	return title if len(title) <= 64 else title[:61].rsplit(" ", 1)[0] + "…"


def parse_modules() -> list[dict]:
	"""Tabela da §1 (pontos) cruzada com a da §7 (tarefas de cada módulo)."""
	text = PLAN.read_text(encoding="utf-8")
	points = []
	for line in text.split("## 1. Escopo", 1)[1].split("### 1.1", 1)[0].splitlines():
		cells = [c.strip() for c in line.strip().strip("|").split("|")]
		if len(cells) == 5 and cells[0].isdigit():
			points.append((re.sub(r"\*\*", "", cells[1]), cells[2], int(cells[3])))
	rows = []
	for line in text.split("## 7. Módulo por módulo", 1)[1].split("## 8.", 1)[0].splitlines():
		cells = [c.strip() for c in line.strip().strip("|").split("|")]
		if len(cells) == 3 and cells[0] not in ("Módulo", "---") and not set(cells[0]) <= {"-"}:
			rows.append((cells[0], cells[2]))
	modules = []
	for (name, kind, pts), (short, tasks) in zip(points, rows):
		modules.append({"nome": short, "subject": name, "tipo": kind, "pontos": pts, "tarefas": tasks})
	return modules


def expand_tasks(spec: str, all_ids: list[str]) -> list[str]:
	"""'F1.*, F2.1–F2.6, F7.6' → lista de IDs do plano."""
	ids = []
	for part in re.split(r",\s*", spec):
		part = part.strip()
		if m := re.fullmatch(r"F(\d)\.\*", part):
			ids += [t for t in all_ids if t.startswith(f"F{m[1]}.")]
		elif m := re.fullmatch(r"F(\d)\.(\d+)[–-]F\d\.(\d+)", part):
			ids += [t for t in all_ids if t.startswith(f"F{m[1]}.")
				and int(m[2]) <= int(t.split(".")[1]) <= int(m[3])]
		elif part in all_ids:
			ids.append(part)
	return ids


# ---------- GitHub ----------

def gh_json(*args: str) -> list[dict]:
	out = subprocess.run(["gh", *args, "-R", REPO, "--limit", "500", "--json"] + [FIELDS[args[0]]],
		check=True, capture_output=True, text=True).stdout
	return json.loads(out)


FIELDS = {
	"issue": "number,title,state,assignees,closedAt,createdAt",
	"pr": "number,title,state,author,mergedAt,createdAt,headRefName,closingIssuesReferences",
}


def task_of_issue(issue: dict, ajustes: dict) -> str | None:
	if issue["number"] in ajustes["ignorar_issues"] or str(issue["number"]) in ajustes["escopo_adicionado"]:
		return None
	m = TASK_ID.search(issue["title"])
	return m[0] if m else None


# ---------- status ----------

def week_start(day: date) -> date:
	return day - timedelta(days=(day.weekday() + 1) % 7) # semana de domingo a sábado


def collect(today: date) -> dict:
	ajustes = load_ajustes()
	tasks = parse_plan(ajustes)
	ids = [t["id"] for t in tasks]
	issues = [i for i in gh_json("issue", "list", "--state", "all")]
	prs = gh_json("pr", "list", "--state", "all")

	by_task = defaultdict(list)
	for issue in issues:
		if (tid := task_of_issue(issue, ajustes)) in ids:
			by_task[tid].append(issue)

	def prs_of(issue_number: int) -> list[dict]:
		return [p for p in prs if p["headRefName"].startswith(f"{issue_number}-")
			or any(c["number"] == issue_number for c in p["closingIssuesReferences"])]

	for task in tasks:
		manual = ajustes["status_manual"].get(task["id"])
		linked = by_task.get(task["id"], [])
		task["issues"] = [i["number"] for i in linked]
		related = [p for i in linked for p in prs_of(i["number"])]
		task["prs_abertos"] = sorted({p["number"] for p in related if p["state"] == "OPEN"})
		merged = [p for p in related if p["state"] == "MERGED"]
		if manual:
			task["status"], task["concluida_em"] = manual["status"], manual.get("data")
			task["evidencia"] = manual["evidencia"]
		elif linked and all(i["state"] == "CLOSED" for i in linked):
			task["status"] = "concluida"
			task["concluida_em"] = max(i["closedAt"] for i in linked)[:10]
		elif task["prs_abertos"]:
			task["status"] = "em_revisao"
		elif merged:
			task["status"] = "em_andamento" # parte já na main; conta só quando fecha inteira
		else:
			task["status"] = "a_fazer"
		task["sem_issue"] = not linked and not manual
	status_of = {t["id"]: t["status"] for t in tasks}
	owner = {t["id"]: t["dono"] for t in tasks}
	for task in tasks:
		task["espera_por"] = [dep for dep in task["depende"] if dep in status_of
			and status_of[dep] != "concluida" and owner[dep] != task["dono"]]
		task["atrasada"] = task["status"] != "concluida" and WEEK_END[task["semana"]] < today

	extras = []
	for issue in issues:
		number = issue["number"]
		if number in ajustes["ignorar_issues"]:
			continue
		if str(number) in ajustes["escopo_adicionado"] or not TASK_ID.search(issue["title"]):
			info = ajustes["escopo_adicionado"].get(str(number), {})
			extras.append({"issue": number, "titulo": issue["title"], "estado": issue["state"].lower(),
				"dono": info.get("dono") or member_of_login(issue, ajustes),
				"d": info.get("d"), "fechada_em": (issue["closedAt"] or "")[:10] or None})

	return summarize(today, tasks, extras, ajustes)


def member_of_login(issue: dict, ajustes: dict) -> str | None:
	logins = {v: k for k, v in ajustes["github"].items()}
	return next((logins[a["login"]] for a in issue["assignees"] if a["login"] in logins), None)


# fim de cada semana do plano §3 (sábado); o checkpoint é na sexta
WEEK_END = {"S1": date(2026, 10, 10), "S2": date(2026, 10, 17), "S3": date(2026, 10, 24),
	"S4": date(2026, 10, 31), "S5": date(2026, 11, 14), "S6": date(2026, 11, 21)}
PROJECT_START = date(2026, 9, 27)


def split_shared(tasks: list[dict], ajustes: dict) -> list[dict]:
	"""Tarefas de todos viram uma fatia igual por membro (README, regra 4)."""
	rows = []
	for task in tasks:
		if task["dono"] == "todos":
			for member in MEMBERS:
				rows.append({**task, "dono": member, "d": task["d"] / len(MEMBERS)})
		else:
			rows.append(task)
	return rows


def summarize(today: date, tasks: list[dict], extras: list[dict], ajustes: dict) -> dict:
	rows = split_shared(tasks, ajustes)
	done = [r for r in rows if r["status"] == "concluida"]
	total_d = sum(r["d"] for r in rows)

	# entregue por semana (domingo a sábado), em dias do plano
	weeks = []
	start = PROJECT_START
	while start <= today:
		end = start + timedelta(days=6)
		d = sum(r["d"] for r in done if r["concluida_em"] and start <= date.fromisoformat(r["concluida_em"]) <= end)
		planned = sum(r["d"] for r in rows if WEEK_END[r["semana"]] <= end and WEEK_END[r["semana"]] > end - timedelta(days=7))
		weeks.append({"inicio": start.isoformat(), "fim": end.isoformat(), "entregue_d": round(d, 2),
			"planejado_d": round(planned, 2), "parcial": end >= today})
		start += timedelta(days=7)

	full = [w for w in weeks if not w["parcial"]]
	recent = full[-ajustes["semanas_velocidade"]:]
	velocity = sum(w["entregue_d"] for w in recent) / len(recent) if recent else 0
	slowest = min((w["entregue_d"] for w in recent), default=0) # a pior semana da janela

	def projection(remaining: float, vel: float) -> str | None:
		if remaining <= 0:
			return today.isoformat()
		if vel <= 0:
			return None
		return (today + timedelta(days=round(remaining / vel * 7))).isoformat()

	members = []
	for member in MEMBERS:
		mine = [r for r in rows if r["dono"] == member]
		d_total = sum(r["d"] for r in mine)
		d_done = sum(r["d"] for r in mine if r["status"] == "concluida")
		vel = sum(r["d"] for r in mine if r["status"] == "concluida" and r["concluida_em"]
			and date.fromisoformat(recent[0]["inicio"]) <= date.fromisoformat(r["concluida_em"])
			<= date.fromisoformat(recent[-1]["fim"])) / len(recent) if recent else 0
		extra_d = sum(e["d"] or 0 for e in extras if e["dono"] == member and e["estado"] == "open")
		members.append({
			"membro": member, "d_total": round(d_total, 2), "d_concluido": round(d_done, 2),
			"pct": round(100 * d_done / d_total, 1) if d_total else 0,
			"velocidade_d_semana": round(vel, 2),
			"previsao_obrigatorio": projection(d_total - d_done, vel),
			"previsao_com_adicional": projection(d_total - d_done + extra_d, vel),
			"tarefas": {s: sum(1 for t in tasks if t["dono"] == member and t["status"] == s)
				for s in ("concluida", "em_revisao", "em_andamento", "a_fazer")},
			"atrasadas": [t["id"] for t in tasks if t["dono"] == member and t["atrasada"]],
			"esperando_outro": [t["id"] for t in tasks if t["dono"] == member and t["espera_por"]],
			"restantes": [t["id"] for t in tasks if t["dono"] == member and t["status"] != "concluida"],
		})
	# cada um só no que é seu: o projeto termina quando o último terminar
	by_person = [m["previsao_obrigatorio"] for m in members]
	bottleneck = None if None in by_person else max(by_person)
	remaining_tasks = [t for t in tasks if t["status"] != "concluida" and t["dono"] != "todos"]

	ids = [t["id"] for t in tasks]
	status_of = {t["id"]: t["status"] for t in tasks}
	modules = []
	for module in parse_modules():
		needed = expand_tasks(module["tarefas"], ids)
		left = [t for t in needed if status_of[t] != "concluida"]
		d_need = sum(t["d"] for t in tasks if t["id"] in needed)
		d_left = sum(t["d"] for t in tasks if t["id"] in left)
		modules.append({**module, "ids": needed, "faltam": left,
			"pct": round(100 * (1 - d_left / d_need), 1) if d_need else 100, "garantido": not left})

	extra_open_d = sum(e["d"] or 0 for e in extras if e["estado"] == "open")
	remaining = total_d - sum(r["d"] for r in done)
	return {
		"data": today.isoformat(),
		"semana_do_plano": next((s for s, end in WEEK_END.items() if today <= end), "S6"),
		"datas": {k: v for k, v in ajustes["datas"].items()},
		"projeto": {
			"d_total": round(total_d, 2), "d_concluido": round(total_d - remaining, 2),
			"pct": round(100 * (total_d - remaining) / total_d, 1),
			"velocidade_d_semana": round(velocity, 2), "semanas_velocidade": len(recent),
			"previsao_obrigatorio": projection(remaining, velocity),
			"previsao_com_adicional": projection(remaining + extra_open_d, velocity),
			"velocidade_pior_semana": round(slowest, 2),
			"previsao_conservadora": projection(remaining + extra_open_d, slowest),
			"previsao_cada_um_no_seu": bottleneck,
			"gargalo": next((m["membro"] for m in members if m["previsao_obrigatorio"] == bottleneck), None),
			"tarefas_restantes": len(remaining_tasks),
			"tarefas_esperando_outro": sum(1 for t in remaining_tasks if t["espera_por"]),
			"pontos_garantidos": sum(m["pontos"] for m in modules if m["garantido"]),
			"pontos_total": sum(m["pontos"] for m in modules),
		},
		"semanas": weeks,
		"membros": members,
		"modulos": modules,
		"tarefas": tasks,
		"escopo_adicionado": {
			"issues": extras,
			"abertas": sum(1 for e in extras if e["estado"] == "open"),
			"fechadas": sum(1 for e in extras if e["estado"] == "closed"),
			"d_aberto_estimado": round(extra_open_d, 2),
			"sem_estimativa": [e["issue"] for e in extras if e["estado"] == "open" and e["d"] is None],
		},
		# preenchido à mão a cada reunião (README, passo 3)
		"mensagem": "",
		"acoes": {member: [] for member in MEMBERS},
	}


# ---------- página ----------

def generate() -> Path:
	snapshots = [json.loads(p.read_text(encoding="utf-8")) for p in sorted(SNAPSHOTS.glob("*.json"))]
	if not snapshots:
		sys.exit("nenhum snapshot: rode `status.py coletar` antes")
	ajustes = load_ajustes()
	data = {"atual": snapshots[-1], "historico": [
		{"data": s["data"], "pct": s["projeto"]["pct"], "pontos": s["projeto"]["pontos_garantidos"],
			"extras_abertas": s["escopo_adicionado"]["abertas"]} for s in snapshots],
		"nomes": ajustes["nomes"], "papeis": ajustes["papeis"]}
	template = (HERE / "template.html").read_text(encoding="utf-8")
	payload = json.dumps(data, ensure_ascii=False).replace("</", "<\\/")
	out = HERE / "index.html"
	out.write_text(template.replace("/*__DADOS__*/null", payload), encoding="utf-8")
	return out


def main() -> None:
	command = sys.argv[1] if len(sys.argv) > 1 else ""
	if command == "coletar":
		today = date.fromisoformat(sys.argv[2]) if len(sys.argv) > 2 else date.today()
		path = SNAPSHOTS / f"{today.isoformat()}.json"
		old = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
		snapshot = collect(today)
		# coletar de novo no mesmo dia não apaga o que foi escrito à mão
		snapshot["mensagem"] = old.get("mensagem", "")
		snapshot["acoes"] = old.get("acoes", snapshot["acoes"])
		SNAPSHOTS.mkdir(exist_ok=True)
		path.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
		print(path)
	elif command == "gerar":
		print(generate())
	else:
		sys.exit(__doc__)


if __name__ == "__main__":
	main()
