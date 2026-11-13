*This project has been created as part of the 42 curriculum by rdel-fra, acesar-m, \<login3\>, \<login4\>, gyasuhir.*

> **TODO F9.1 (@rflheringer):** replace one `<loginN>` above with your 42 intra login.
>
> **TODO F9.1 (@caioosantos):** replace one `<loginN>` above with your 42 intra login.

# Catacombs 42

A real-time 3D dungeon crawler in the browser: up to five friends fight their way to the boss together, or two players duel in a 1v1 arena, all on top of a full web platform with accounts, friends, stats and rankings.

## Table of contents

1. [Description](#description)
2. [Instructions](#instructions)
3. [How to play](#how-to-play)
4. [Team Information](#team-information)
5. [Project Management](#project-management)
6. [Technical Stack](#technical-stack)
7. [Architecture overview](#architecture-overview)
8. [Database Schema](#database-schema)
9. [Features List](#features-list)
10. [Modules](#modules)
11. [Monitoring guide](#monitoring-guide)
12. [Individual Contributions](#individual-contributions)
13. [Known limitations](#known-limitations)
14. [Resources](#resources)
15. [Credits](#credits)

## Description

**Catacombs 42** is our ft_transcendence: the bonus part of the 42 *Cub3D* project, rebuilt as a real 3D multiplayer game that runs in the browser.

The game rules and the movement math come from the original C code. Here they run on an **authoritative server**: the server decides every hit, every point of damage, every pickup and every win. The browser only draws the world and sends what the player pressed. Around the game there is a full website for signing up, finding friends, joining a match and following your progress.

**Goal:** show that a game born as a single-player raycaster in C can become a fair, real-time, multiplayer web game, with the same physics on the client and on the server, behind a production-like stack (HTTPS, a single command to start it, monitoring).

**Key features**

- **Co-op for 2 to 5 players, or Solo:** explore the dungeon, collect keys to open doors and defeat the boss together. A Solo Room is a co-op Room with a single seat, to play alone.
- **PvP 1v1:** first to the frag limit, or most frags when time runs out, wins (5 frags or 3 minutes by default).
- **Real 3D** with Three.js: two visual themes, animated sprites, lighting effects, sound and a minimap.
- **Responsive online play:** client-side prediction, server reconciliation, interpolation of other players, and reconnection within 30 seconds.
- **Customizable matches:** map, theme, starting HP, which pickups exist, PvP frag and time limits.
- **Accounts:** sign up with e-mail and password, or log in with your **42 intra** account (OAuth 2.0). Profile with avatar, friends list and online status.
- **Progression:** stats per mode, match history, XP and levels, Elo ranking in PvP, achievements and a leaderboard.
- **Three languages:** Brazilian Portuguese, English and Spanish, including legal pages and error messages.
- **Monitoring:** Prometheus metrics from the backend, host and database, Grafana dashboards and alerting rules.

## Instructions

### Prerequisites

| Tool | Version we use | Notes |
|---|---|---|
| Docker Engine | 29.x (24+ should work) | everything runs in containers; no local Python or Node needed |
| Docker Compose | v2 plugin (`docker compose`) | tested with v5.4 |
| Google Chrome | latest stable | the supported browser |
| [mkcert](https://github.com/FiloSottile/mkcert) | 1.4.x | optional, for a certificate the browser trusts |
| 42 intra API app | — | optional, only for "Log in with 42" |

### Services

Everything is started by Docker Compose on one bridge network (`transcendence`). Only `proxy` publishes ports to the host; the other services talk to each other by service name.

| Service | Image / build | Role |
|---|---|---|
| `proxy` | `./proxy` (Nginx) | TLS termination; routes `/`, `/api/`, `/ws/`, `/media/` and `/grafana/` |
| `frontend` | `./frontend` (Nginx) | serves the production build of the React app and the game |
| `backend` | `./backend` (Python 3.12) | FastAPI on port 8000: REST API, WebSockets and the game simulation |
| `db` | `postgres:16-alpine` | PostgreSQL; data in the `db_data` volume |
| `prometheus` | `prom/prometheus` | collects metrics; no published port |
| `grafana` | `grafana/grafana` | dashboards, reached only through the proxy, with login |
| `node-exporter` | `prom/node-exporter` | host metrics (CPU, memory, disk) |
| `postgres-exporter` | `prometheuscommunity/postgres-exporter` | database metrics |

### Configuration (`.env`)

Secrets live in a `.env` file at the root of the repository. It is **not** versioned; `.env.example` is the template, with every key the stack reads.

| Variable | Required | What it is |
|---|---|---|
| `POSTGRES_USER`, `POSTGRES_PASSWORD` | **yes** | database credentials; Postgres does not start without a password |
| `GF_SECURITY_ADMIN_USER`, `GF_SECURITY_ADMIN_PASSWORD` | **yes** | Grafana admin login; Compose refuses to start without them |
| `PUBLIC_HOST` | yes, outside `localhost` | the public name of the site, with the port when HTTPS is not 443 (e.g. `localhost:8443`, `c1r2p3.42sp.org.br:8443`). The HTTP→HTTPS redirect, the OAuth callback URL and the Grafana root URL are all derived from it |
| `PROXY_HTTP_PORT`, `PROXY_HTTPS_PORT` | no | host ports of the proxy (default 80 and 443) |
| `JWT_SECRET` | in production | at least 32 bytes. Empty in development means a random secret per backend start, so sessions end when the backend restarts. Generate one with `python3 -c "import secrets; print(secrets.token_urlsafe(48))"` |
| `FT_CLIENT_ID`, `FT_CLIENT_SECRET` | for 42 login | credentials of the 42 intra API app; e-mail login works without them |

The other keys (`POSTGRES_DB`, token lifetimes, Prometheus retention, Grafana hardening flags) already have working defaults in `.env.example`. Never add a comment at the end of a value line: Compose's `env_file` would keep it as part of the value.

### Run it

```bash
# 1. create your .env from the template (first time only), then fill the required keys
cp .env.example .env

# 2. build and start everything
docker compose up --build
```

Services start in healthcheck order: the `backend` waits for `db` to accept connections, applies the database migrations, then starts the API; the `proxy` waits for the backend to answer `/api/health` and for Grafana to be healthy.

Once it is up:

- Website: <https://localhost> (or `https://<PUBLIC_HOST>`)
- API health check: <https://localhost/api/health>
- Grafana: <https://localhost/grafana/>
- `http://` redirects to `https://`, keeping the port.

### HTTPS with a trusted certificate

Without a certificate in `proxy/certs/`, the proxy generates a self-signed one, so everything works, but Chrome shows a warning page. For a clean padlock, use `mkcert` once:

```bash
mkcert -install                      # creates a local CA and trusts it in this machine's browsers
mkcert -cert-file proxy/certs/cert.pem -key-file proxy/certs/key.pem localhost 127.0.0.1
docker compose up -d --build proxy   # the proxy picks the certificate up on start
```

- **WSL2:** Docker runs in Linux but Chrome is the Windows one, which does not see the Linux CA. Import `$(mkcert -CAROOT)/rootCA.pem` with `certmgr.msc` into *Trusted Root Certification Authorities* (current user, no admin needed).
- **Playing from other machines on the network:** generate the certificate for the server's hostname and IP (`mkcert ... <hostname> <ip> localhost`), set `PUBLIC_HOST=<hostname>:<https-port>`, and import `rootCA.pem` in Chrome on each client (Settings → Privacy and security → Security → Manage certificates → Authorities). Never copy `rootCA-key.pem`.
- Certificates are never versioned (`proxy/certs/` is in `.gitignore`).

### Log in with 42 (optional)

1. On the 42 intra, go to *Settings → API → Register a new app*.
2. Set the redirect URI to `https://<PUBLIC_HOST>/api/auth/oauth/42/callback`. The intra accepts several URIs, so you can register `localhost` and the demo machine.
3. Copy the app's UID and secret to `FT_CLIENT_ID` and `FT_CLIENT_SECRET` in `.env`, then restart the backend (`docker compose up -d backend`). The intra rotates the secret periodically; when it does, update `FT_CLIENT_SECRET`.

### Everyday commands

```bash
docker compose up --build -d      # start in the background
docker compose logs -f backend    # follow one service's logs
docker compose ps                 # what is running, and its health
docker compose down               # stop (keeps the database volume)
docker compose down -v            # stop AND delete the database volume
```

### Database migrations

The schema is versioned with Alembic (`backend/alembic/versions/`). The backend `entrypoint` runs `alembic upgrade head` on every start, before `uvicorn`; if a migration fails, the backend does not start and the error shows in `docker compose logs backend`.

```bash
docker compose exec backend alembic upgrade head          # apply migrations without a restart
docker compose down -v && docker compose up --build       # start over from an empty database
```

### Tests

The CI (GitHub Actions) runs on every pull request: it builds and starts the whole stack, checks HTTPS, the redirect, the database, Grafana provisioning and access rules, then runs the backend tests (`pytest`, Alembic) and the frontend lint, tests (`vitest`) and build.

## How to play

> **TODO F9.1 (@rflheringer):** review this section against the final maps, numbers and HUD.

1. **Sign up or log in** (e-mail and password, or *Log in with 42*).
2. In the **Lobby**, create a Room or join an open one. A *Room* is one match being played; while it waits for players it is in the Lobby, and everyone who joins sees it change in real time.
3. The creator picks the **mode** and the **Room options** when creating it; they cannot change afterwards:

   | Option | Values | Default |
   |---|---|---|
   | Map | maps of the chosen mode | first of the list |
   | Theme | `dungeon` or `sewer` | `dungeon` |
   | Starting HP | 5–20 | 10 |
   | Pickups | potion, mana and armor, each on or off | all on |
   | Frag limit (PvP) | 3–10 | 5 |
   | Time limit (PvP) | 120–600 s | 180 s |

4. Every player marks **ready**, and the host starts the match once the Room has its minimum number of players, shown on the waiting screen: 1 in a Solo Room, 2 in any other Room.

**Controls**

| Key | Action |
|---|---|
| `W` `A` `S` `D` | move and strafe |
| mouse (click the game to lock the pointer) or `←` `→` | turn |
| `Shift` | sprint |
| `Space` | cast a fireball (costs mana) |
| `F` | open a door |

**Modes**

- **Co-op (2–5 players, or 1 in Solo):** enemies roam the map. Collect keys to open locked doors and defeat the **boss** to win; the team loses if every player dies. A dead player's camera follows a living teammate.
- **PvP (2 players):** no enemies. Each kill is a *frag*; you respawn at a free spawn point. The first to reach the frag limit wins; when time runs out, the most frags wins, and a tie is a draw.

**Pickups:** keys (open doors), potions (HP), mana (more fireballs) and armor (absorbs damage before HP and breaks).

At the end of a match, the result screen shows the outcome and each player's numbers. XP, level, Elo (PvP) and achievements update on your profile, and the leaderboard updates too.

## Team Information

| Name | GitHub | Role | Responsibilities |
|---|---|---|---|
| Roberto Del Franco | `robertodelfranco` | **Tech Lead**, Developer | Technical direction and the shared contracts between areas; the game simulation ported from the C code (co-op and PvP rules); client-side prediction and reconciliation; tick load test; minimap; reviews every change to the game rules |
| Augusto Cesar | `augustocesarmd` | Developer | Backend package and middlewares; authentication (e-mail/password, tokens); connection and Room managers; game WebSocket, interpolation and reconnection; backend metrics |
| Rafael Heringer | `rflheringer` | Developer | Three.js scene, effects, themes and audio; game content: maps, balance numbers, HUD specification, achievements and Room options |
| Caio Santos | `caioosantos` | **Product Owner**, Developer | Product vision and acceptance of each feature; React shell, i18n, legal pages, login and sign-up, profile and friends (front and back), HUD, Lobby and stats screens |
| Gabriel Kanashiro (Akita) | `kanashir0` | **Project Manager / Scrum Master**, Developer | Planning, weekly meetings, board and status reports; database migrations and match schema; Lobby backend; match recording, stats, rankings and achievements; OAuth with 42; Nginx/TLS, Compose and CI; Prometheus and Grafana |

## Project Management

**How we organized the work**

- **Vertical slices.** The project was split into five "paths", one per person, each owning a slice end to end (see *Team Information*). Each slice had a written scope: inventory of tasks, what the person can do alone, and what they depend on from others, with dates.
- **A task plan with IDs.** Every task had an ID by area (F0 setup, F1 simulation, F2 netcode, F3 rendering, F4 content, F5 matches and stats, F6 users, F7 web, F8 infra, F9 README and rehearsal), an estimate in days, its dependencies and a *done when* criterion that can be observed.
- **Contracts before code.** Every boundary between two slices (WebSocket messages, auth, Rooms, match API, i18n, infra, map format…) was written as a contract by its owner and signed by its consumers before implementation, so each person could build against a fake of the other side. A contract changes in the same pull request as the code.
- **Weekly rhythm.** A meeting every **Monday** (what closed, what is blocked, what changes in the plan) and an integration **checkpoint every Friday** (C1–C5), each with a demo criterion. A feature freeze before the defense: after it, only bug fixes, text and translations.
- **Status report.** Every Monday, the PM generated a status page from the board (progress, velocity, forecast, blockers).
- **Cut order.** The modules most isolated from the rest were ranked to be cut first if a checkpoint failed, because a half-finished module is worth zero.

**Tools**

- **GitHub Issues** (one issue per task ID, with an assignee) and a **GitHub Projects** board. A workflow (`.github/workflows/main.yml`) moves the card on its own, using the `Closes #<issue>` line in the pull request body:
  - pull request opened or updated → the issue goes to *In Review*;
  - pull request closed without merging → *Failed*;
  - pull request merged → GitHub closes the issue and the board marks it done.
- **Pull requests:** branch `<issue>-<slug>`, at least one reviewer from the team, and CI green before merging.
- **GitHub Actions:** the CI described in *Instructions → Tests*.

**Communication**

- **Discord:** meetings and screen sharing.
- **WhatsApp:** day-to-day messages and quick questions.
- **In person at 42:** pair work and the multi-machine tests.
- **GitHub Issues and the board:** decisions about a task and code review.

## Technical Stack

| Layer | Technologies |
|---|---|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS 4, React Router, i18next / react-i18next, react-markdown; Vitest, Testing Library and MSW for tests; ESLint (including a rule that forbids literal strings in JSX) |
| Game client | Three.js (plain, no React wrapper), mounted by React through a single `mountGame` function; Web Audio; Pointer Lock |
| Backend | Python 3.12, FastAPI, Uvicorn, Pydantic / pydantic-settings, SQLAlchemy 2 (async) with asyncpg, Alembic, PyJWT, pwdlib (Argon2), httpx, Pillow, prometheus-client; pytest |
| Database | PostgreSQL 16 |
| Edge | Nginx (TLS termination, HTTP→HTTPS redirect, WebSocket upgrade, static `/media/`) |
| Infrastructure | Docker and Docker Compose, mkcert, GitHub Actions |
| Monitoring | Prometheus, Grafana, node-exporter, postgres-exporter |

**Why these choices**

- **FastAPI:** async from end to end, with native WebSockets, so the REST API, the realtime connections and the game loop live in one process without threads. Pydantic validates every input at the boundary.
- **PostgreSQL:** our data is relational (users, friendships, matches, players in a match) and needs real constraints. We use foreign keys with explicit `ON DELETE` rules, `CHECK` constraints, `JSONB` for the Room options and `SELECT … FOR UPDATE` to record a match result exactly once.
- **SQLAlchemy + Alembic:** typed models in Python and versioned, linear migrations applied automatically at startup.
- **React + TypeScript + Vite:** typed UI with fast builds; Tailwind for a responsive layout without writing a design system.
- **Plain Three.js instead of a React renderer:** the game loop runs at its own pace and must not re-render React 60 times per second. React mounts the canvas and draws the HUD and screens; the game exposes one function (`mountGame`) and nothing else.
- **One backend worker:** the live Rooms and connections are Python dictionaries in memory. One process keeps them consistent with no external broker (see *Known limitations*).
- **Prometheus + Grafana:** the standard open-source pair. The backend exposes metrics on a histogram and counters, exporters cover host and database, and dashboards are provisioned from versioned files.

## Architecture overview

```mermaid
flowchart LR
    Browser["Chrome<br/>React + Three.js"] -- "HTTPS / WSS" --> Proxy["proxy<br/>Nginx + TLS"]
    Proxy -- "/" --> Frontend["frontend<br/>static build"]
    Proxy -- "/api/, /ws/" --> Backend["backend<br/>FastAPI, 1 worker"]
    Proxy -- "/grafana/" --> Grafana["grafana"]
    Proxy -- "/media/" --> Media[("media volume")]
    Backend --> Media
    Backend -- "SQL" --> DB[("db<br/>PostgreSQL")]
    Prometheus["prometheus"] -- "scrape /metrics" --> Backend
    Prometheus --> NodeExp["node-exporter"]
    Prometheus --> PgExp["postgres-exporter"] --> DB
    Grafana --> Prometheus
```

**Request path.** Only the proxy is reachable from outside. It terminates TLS, redirects HTTP to HTTPS and forwards `/api/` and `/ws/` to the backend, which sees the full path. Avatars are served by Nginx straight from a shared volume, so image traffic never competes with the game loop.

**Sessions.**

- Logging in returns a short-lived **access token** (JWT, 15 min) that the browser keeps only in memory and sends as `Authorization: Bearer` on every API call.
- The session itself is an opaque **refresh token** in an `HttpOnly`, `Secure`, `SameSite=Strict` cookie restricted to `/api/auth`, so page scripts never see it. Every refresh rotates it, and only its SHA-256 hash is stored.
- Reusing a refresh token that was already rotated is treated as theft: the whole session family is revoked.

**Two WebSockets.**

- `/ws/app`: one per open tab, for presence (who is online) and the Lobby updates. A user with several tabs is online while any of them is open, and only goes offline 5 s after the last one closes, so reloading a page does not flicker.
- `/ws/game/{match_id}`: one per player during a match.
- Both are authenticated once, on the first `join` message, with the same access token as the REST API. The token never goes in the URL, which would leak it into logs and history. Without a valid `join` within 5 s, the socket closes with a `44xx` code.
- Every message is validated against a strict Pydantic schema (a union discriminated by `type`, mirrored in `types.ts`); an invalid one closes the socket with `4400`. Each socket can send at most 60 messages per second.
- Outgoing messages go through a queue per connection. A Snapshot waiting there is replaced by the newer one, but an Event is never dropped; a client too slow to drain its queue is disconnected (`4429`) instead of slowing down the Room.

**Authoritative server.**

- Each match being played is a **Room** that lives only in the backend's memory: map grid, players, enemies, boss, projectiles and doors.
- The server advances it in fixed **ticks of 30 Hz** and sends a **Snapshot** of the world to every player every second tick (15 Hz).
- Clients send only their **Input** (keys pressed, mouse movement, a sequence number) and **Actions** (fire, open a door). The server decides hits, damage, pickups and victory.
- Inputs and Actions wait in one queue per player, in `seq` order. Each tick applies one Input, or two when three or more are waiting, so a client can catch up after a lag spike but never move faster than 60 steps per second. An empty queue means the player stands still: the server never repeats the last Input, because the client did not predict that step.
- The Simulation (`sim.py`) is a pure function of the Room, the queued messages and a fixed `dt`, with no I/O and no clock. It knows nothing about sockets or the database, so it is tested tick by tick without a server. The rules that differ between co-op and PvP live in a `Ruleset` (`CoopRuleset`, `PvpRuleset`), not in `if mode` branches.
- Nothing about a match in progress is written to the database. When the Room ends, it produces one **MatchResult** that is recorded as a **Match** in a single transaction (see *Database Schema*).

**Same math on both sides.**

- Movement is `speed × dt`, never "per frame", ported from the C code of Cub3D.
- The server (`sim.py`) and the client (`applyInput.ts`) use the same constants, kept in `rules.py` and `rules.ts`.
- A shared fixture of movement cases is run by both the Python and the TypeScript test suites, which must reach the same final positions.

**Prediction, reconciliation and interpolation.**

- *Prediction:* the client applies its own inputs immediately, so movement feels instant. It runs in fixed steps of 1/30 s, the same `dt` as the server, at most 5 steps per frame, and draws the local player between its last two steps so a 60 Hz screen does not show 30 Hz stairs.
- *Reconciliation:* when a Snapshot arrives, the client resets its player to the server's position for the last acknowledged input (`last_input_seq`) and replays the inputs that the server has not seen yet. A small error (under 0.05 cell, usually another player who was not where the client thought) is smoothed over 0.1 s, and a larger one snaps. In development, a `console.assert` reports any divergence.
- *Interpolation:* other players and enemies are drawn slightly in the past, between two Snapshots, so they move smoothly.

**Reconnection.**

- If a player's socket drops, their seat is kept for a **30 s grace period**, counted in ticks; the other players see them as disconnected.
- The client retries on its own (after 1, 2 and 4 s, then every 8 s, with jitter), except for close codes that mean retrying is useless (not a member, Room not found, replaced by another tab, Room full).
- Reconnecting with a new socket resumes the match: each Snapshot carries the full state, so HP, mana, armor and keys come back as they were.
- After the grace period, the player has left. In PvP, that ends the match as a loss for them.

## Database Schema

PostgreSQL, created by one Alembic migration (`0001_initial`) that runs at backend start. The state of matches in progress is never stored; the database receives only finished matches.

```mermaid
erDiagram
    users ||--o{ refresh_tokens : "has sessions"
    users ||--o{ oauth_accounts : "is linked to"
    users ||--o{ friendships : "adds"
    users ||--o{ friendships : "is added by"
    users ||--o{ matches : "created (host)"
    users ||--o{ match_players : "played"
    matches ||--|{ match_players : "has players"
    users ||--o{ player_stats : "has one per mode"
    users ||--o{ user_achievements : "unlocked"
    matches |o--o{ user_achievements : "unlocked in"

    users {
        bigint id PK
        text email UK "lowercase"
        text username UK
        text password_hash "NULL for OAuth-only accounts"
        text avatar_url "NULL means default avatar"
        text preferred_language "pt-BR, en, es"
        timestamptz created_at
        timestamptz last_seen_at
    }
    refresh_tokens {
        bigint id PK
        bigint user_id FK
        text token_hash UK "sha256, never the token"
        uuid family_id "one per login"
        timestamptz expires_at
        timestamptz rotated_at
        bigint replaced_by FK
        timestamptz revoked_at
    }
    oauth_accounts {
        bigint id PK
        bigint user_id FK
        text provider "42"
        text provider_user_id
        timestamptz created_at
    }
    friendships {
        bigint user_id PK, FK
        bigint friend_id PK, FK
        timestamptz created_at
    }
    matches {
        bigint id PK "the match_id"
        text mode "coop, pvp"
        text map
        smallint max_players
        jsonb options "Room options with defaults"
        text status "lobby, running, finished, aborted"
        bigint created_by FK
        timestamptz started_at
        timestamptz ended_at
        int duration_ticks
        text result
        text reason
    }
    match_players {
        bigint match_id PK, FK
        bigint user_id PK, FK
        bool won
        bool survived
        bool disconnected_at_end
        int kills
        int frags
        int deaths
        int damage_dealt
        int xp_gained
        int elo_before "PvP only"
        int elo_after "PvP only"
    }
    player_stats {
        bigint user_id PK, FK
        text mode PK
        int matches_played
        int wins
        int losses
        int draws
        int xp
        int level
        int elo "starts at 1000"
        timestamptz updated_at
    }
    user_achievements {
        bigint user_id PK, FK
        text code PK
        timestamptz unlocked_at
        bigint match_id FK
    }
```

| Table | Purpose | Key rules |
|---|---|---|
| `users` | one row per account | `email` unique and lowercase, `username` unique and format-checked, `preferred_language` checked against the three languages |
| `refresh_tokens` | refresh-token rotation | only the SHA-256 hash is stored; reusing a rotated token revokes its whole `family_id`; `replaced_by` chains each rotation |
| `oauth_accounts` | links a user to a 42 intra account | unique `(provider, provider_user_id)` and one account per provider per user |
| `friendships` | who added whom | composite primary key; `CHECK (user_id <> friend_id)` |
| `matches` | one row per match, from Lobby to the end | `mode`, `status`, `result` and `reason` are `CHECK`-constrained; `options` is `JSONB` |
| `match_players` | each player's numbers in one match (also `damage_taken`, `armor_absorbed`, `keys_collected`, `potions_used`) | `ON DELETE CASCADE` from `matches`; `RESTRICT` from `users` so history is never lost silently |
| `player_stats` | aggregate per user and mode, updated in the same transaction that records the match | read by the profile and the leaderboard without scanning the history |
| `user_achievements` | unlocked achievements | one row per `(user, code)`; the achievement catalog lives in code; `match_id` is `SET NULL` if the match is deleted |

Win/loss statistics are always read from `match_players.won`, never from `matches.result`: in co-op a whole team wins together, and in PvP the result of the Room and the result of each player are different questions.

## Features List

> **TODO F9.1 (all):** write the one-line description of each feature you own, and fix the owners if needed.

| Feature | Description | Member(s) |
|---|---|---|
| Sign up and log in with e-mail and password | Accounts with a unique e-mail and username; passwords hashed with Argon2id; the same error for a wrong e-mail or a wrong password; repeated failed logins are rate-limited (`429`) | Augusto (backend), Caio (screens) |
| Sessions: access token + rotating refresh cookie | 15-minute access token kept in memory; refresh token in an `HttpOnly` cookie, rotated on every use, with reuse detection that revokes the whole session; logout revokes the current session | Augusto |
| Log in with 42 (OAuth 2.0) | Authorization Code flow with the 42 intra, protected by a signed `state` cookie; the first login creates the account, or links it to the existing account with the same e-mail; it ends with the same tokens as the e-mail login | Akita (backend), Caio (button) |
| Profile, avatar upload and settings | **TODO F9.1 (@caioosantos)** | Caio |
| Friends and online status | **TODO F9.1 (@caioosantos)** | Caio, Augusto (presence over `/ws/app`) |
| Real-time Lobby: create, join, ready, start | Create a Room with a map, a capacity and options; list the open Rooms; join, leave, mark ready, pick a character and start. Every change reaches every open tab right after it is saved. A user is in one Room at most, the last free seat goes to one player only, and a user who goes offline leaves the Lobby. A Solo Room starts with one player; every other Room needs two | Akita (backend), Caio (screen), Augusto (connection manager) |
| Authoritative game simulation (co-op) | The Cub3D bonus ported from C to Python as a pure Simulation (`step(room, dt)`, no I/O): movement with wall sliding, doors and keys, pickups, fireballs with cooldown and Mana, enemies that chase by BFS and strike, a boss that keeps its distance and shoots the closest player in sight. Up to 5 players. The match ends once, when the boss dies or every player is dead or gone | Roberto |
| PvP 1v1 rules | A `PvpRuleset` on the same Simulation: fireball damage and frags credited to the shooter, respawn after 3 s at the free spawn farthest from the opponent, and the end by frag limit (default 5), time limit (default 180 s, counting only played time) or forfeit. A mutual frag on the limit, or a tie on time, is a draw | Roberto |
| Game WebSocket, Room manager and reconnection | One `asyncio` task per Room ticking at a fixed 30 Hz with drift compensation; Snapshots at 15 Hz; strict message validation; 30 s grace period and automatic reconnection to the same match; ping/pong with the RTT shown on the HUD | Augusto |
| Client-side prediction and reconciliation | The client moves its own player at once with `applyInput.ts`, the same function as the server's `apply_input`, in fixed steps of 1/30 s. Each Snapshot resets the player to the server's position and replays the inputs it has not seen. An error under 0.05 cell is smoothed over 0.1 s, a larger one snaps | Roberto |
| Interpolation of other entities | Other players, enemies, the boss and projectiles are drawn 100 ms in the past, between the two Snapshots around that instant, so they glide instead of jumping 15 times per second; a jump of more than 2 cells (a respawn) snaps instead of sliding through walls | Augusto |
| 3D rendering, themes and visual effects | **TODO F9.1 (@rflheringer)** | Rafael |
| Audio | **TODO F9.1 (@rflheringer)** | Rafael |
| Maps, balance and Room options | **TODO F9.1 (@rflheringer)** | Rafael |
| HUD | **TODO F9.1 (@caioosantos)** | Caio (implementation), Rafael (specification) |
| Minimap | A 2D canvas over the game drawn from the same `ViewState` as the 3D scene: walls, doors, the players and the local player's view cone, with north up as in the scene | Roberto |
| Match recording, stats, XP/levels and Elo | When a match ends, the server records it exactly once, in one transaction: each player's numbers, the stats per mode, XP and level, and the Elo in PvP (starts at 1000, K = 32). Matches left unfinished by a restart are marked `aborted` at startup | Akita (backend), Caio (screens) |
| Match history, achievements and leaderboard | Paginated history (mode, map, result, duration, teammates or opponent); 7 achievements, unlocked at the end of a match and shown on the profile; a leaderboard per mode by Elo, XP, wins or kills | Akita (backend), Rafael (achievement design), Caio (screens) |
| Three languages (i18n) | **TODO F9.1 (@caioosantos)** | Caio |
| Privacy Policy and Terms of Service | **TODO F9.1 (@caioosantos)** | Caio |
| HTTPS, Docker Compose and CI | One `docker compose up` starts the 8 services; only Nginx publishes ports, with HTTPS and `wss://` everywhere. A GitHub Actions run on every pull request starts the whole stack and probes it over HTTPS, checks the migrations, and runs the backend and frontend tests, the lint and the build | Akita |
| Monitoring: metrics, dashboards and alerts | Prometheus scrapes the backend, the host and the database; 3 Grafana dashboards and 4 alerting rules, all provisioned from versioned files (see *Monitoring guide*) | Akita, Augusto (backend metrics) |

## Modules

> **TODO F9.1 (@kanashir0):** after the last checkpoint (C5, 13/11), remove every module that did not pass its demo and recompute the total.

| # | Module (subject) | Type | Points | Member(s) |
|---|---|---|---|---|
| 1 | Web-based game where users play against each other | Major | 2 | Roberto, Augusto, Rafael |
| 2 | Real-time features using WebSockets | Major | 2 | Augusto, Akita |
| 3 | Remote players | Major | 2 | Augusto, Roberto |
| 4 | Multiplayer game (more than two players) | Major | 2 | Roberto, Augusto, Rafael |
| 5 | Frameworks for frontend and backend (React + FastAPI) | Major | 2 | Caio, Augusto |
| 6 | ORM for the database (SQLAlchemy + Alembic) | Minor | 1 | Akita, Augusto |
| 7 | Standard user management and authentication | Major | 2 | Augusto, Caio |
| 8 | Remote authentication with OAuth 2.0 (42) | Minor | 1 | Akita |
| 9 | Advanced 3D graphics (Three.js) | Major | 2 | Rafael |
| 10 | Game customization options | Minor | 1 | Rafael, Roberto, Akita, Caio |
| 11 | Game statistics and match history | Minor | 1 | Akita, Caio |
| 12 | Monitoring system (Prometheus + Grafana) | Major | 2 | Akita, Augusto |
| 13 | Support for multiple languages (3) | Minor | 1 | Caio |
| | **Total** (9 Major × 2 + 4 Minor × 1; 14 required) | | **21** | |

We did not use a custom "Module of choice".

### 1. Web-based game — Major (2)

**Why:** the game is the center of the project. We ported our own Cub3D bonus, written in C at 42, so the rules, maps and assets already existed and had been played. The work was to move them to an authoritative server and a 3D browser client, not to invent a game.

**How:**

- **Port of the C code.** The math of `movement_bonus.c`, `move_utils_bonus.c`, the enemy, boss, door and fireball files became the Python Simulation (`backend/app/game/`). The drawing stayed out: the client draws, the server decides.
- **Time, not frames.** In the C code the player moved `0.06` per frame, so at 144 Hz it walked 2.4× faster than at 60 Hz. Every speed is now in cells per second and multiplied by `dt`, with constants in `rules.py` and `rules.ts`.
- **Clear rules and a clear end.** Co-op: reach the boss and kill it (6 fireballs per player, since its HP grows with the team). The match is lost when every player is dead or gone. PvP: frag limit, time limit or forfeit. The server emits `game_over` exactly once and freezes the outcome.
- **Tested without a browser.** The tests in `backend/tests/game/` cover the Simulation tick by tick (movement, doors, pickups, fireballs, enemies, boss, damage, PvP, countdown, map validation), plus a performance test: 1000 ticks with 5 players, 20 enemies, the boss and 10 projectiles fit in 2 s (2 ms per tick, 6 % of the 33 ms budget).

### 2. Real-time features — Major (2)

**Why:** a multiplayer game cannot poll. The match itself, the Lobby (who joined, who is ready) and the friends' online status all have to change on screen the moment they change on the server.

**How:**

- Two WebSocket endpoints in FastAPI, behind Nginx with the WebSocket upgrade: `/ws/app` (presence and Lobby, one per tab) and `/ws/game/{match_id}` (the match).
- A `ConnectionManager` keeps every open socket by user. It sends to one user, broadcasts to everyone, and calls the presence callbacks when a user's first tab opens or their last one closes.
- The Lobby backend publishes `lobby_update` and `lobby_removed` after each database commit, so nobody sees a Room that does not exist.
- Every socket writes through its own queue and writer task: one slow client never blocks the game loop or the other players. Snapshots can be skipped, Events cannot.
- Messages are typed on both sides (`protocol.py` with Pydantic, `types.ts` mirrored) and validated strictly; a malformed message closes the socket with `4400`.
- Disconnections are handled on both ends: close codes tell the client whether to reconnect, and the server cleans up on every path (normal close, timeout, crash, shutdown with `4503`).

### 3. Remote players — Major (2)

**Why:** players on two different computers must see the same match and feel no lag on their own movement, even on an imperfect network.

**How:**

- **Authoritative server.** The client sends only Inputs and Actions; the server runs the Simulation at a fixed 30 Hz with its own `dt` (it never trusts a time sent by the client) and sends Snapshots at 15 Hz.
- **Interpolation** of other players and entities 100 ms in the past (see *Features List*), together with Roberto's prediction and reconciliation for the local player.
- **Reconnection.** A dropped socket starts a 30 s grace period counted in ticks. The client reconnects on its own with backoff and receives the full state again; HP, keys and position are kept. In PvP, an expired grace period is a forfeit.
- **Latency on screen.** A `ping`/`pong` exchange measures the round-trip time, shown on the HUD.
- **Tested on a degraded network.** We used `tc netem` on the proxy (≈ 100 ms and 2 % packet loss round trip; Chrome's throttling does not apply to WebSockets) with two players for 5 minutes: the HUD showed ~110 ms of RTT, a player who closed the tab came back to the same match in 22 s, and the Chrome console stayed with no warnings or errors. The method is in `docs/infra/teste-throttling-f2-12.md`.

### 4. Multiplayer (more than two players) — Major (2)

**Why:** a dungeon crawl is better with friends. Co-op for up to 5 players is the main mode, and it forced the biggest change from the C code, where `game->player` was a single global that every enemy, door and projectile read.

**How:**

- **N players in one Room.** Players are a dictionary keyed by user id, each with its own input queue, HP, Mana, armor, keys and stats. The n-th player to join spawns at the n-th spawn point of the map.
- **Shared world, per-player decisions.** Enemies pick the closest living player within range and chase it by a BFS path. The boss shoots the closest player in line of sight. Doors opened and pickups taken change the Room's grid for everyone, and the Snapshot sends the change (`grid_delta`). The difficulty follows the team size: the boss has 60 HP per player, and an enemy blow takes 1 HP solo, 2 with two or three players and 3 with four or five.
- **Leaving and dying.** A dead player stays dead in co-op and the others carry on. A player whose grace period expires leaves, and the match ends in forfeit only when everyone has left. A victory counts for every member of the Room, including those who died.
- **Synchronized start.** The Room waits until every player is connected (or 10 s), then counts 3, 2, 1 with everything frozen, so nobody starts ahead.
- **Load.** A benchmark of 4 full Rooms at once (5 players, 20 enemies, the boss and 10 projectiles each) measured a p99 of 1.4 ms per tick for the Simulation and 2.1 ms with the Room manager, serialization and Snapshot queues included, against a target of 5 ms (`backend/benchmark_tick.py`).

### 5. Frontend and backend frameworks — Major (2)

> **TODO F9.1 (@caioosantos):** why we chose it and how it was implemented.

### 6. ORM — Minor (1)

**Why:** users, friendships, matches and the players of each match are relational data. We wanted typed models in Python, constraints enforced by the database itself, and a schema that is rebuilt the same way on every machine, from an empty volume, with no manual SQL.

**How:**

- **SQLAlchemy 2 (async)** with asyncpg: typed models (`Mapped[...]`), one session per request through a FastAPI dependency, and a separate session factory for code that runs outside a request (the end of a match, the startup).
- **Alembic:** linear, versioned migrations. The backend container runs `alembic upgrade head` before it starts, so `docker compose up` on an empty database creates the whole schema. The CI runs `alembic upgrade head` followed by `alembic check`, which fails if a model changed without a migration.
- **The database settles the races.** A `UNIQUE` constraint, not an earlier `SELECT`, decides who gets a username. Foreign keys have explicit `ON DELETE` rules, and `CHECK` constraints guard the valid values.
- **Locks where they matter.** `SELECT … FOR UPDATE` on the match row and on the `player_stats` rows makes recording a result safe against a second call. `INSERT … ON CONFLICT DO NOTHING … RETURNING` unlocks an achievement once and returns only the new ones.

The user and token models are Augusto's; the match, stats and achievement models and the migration setup are mine.

### 7. Standard user management — Major (2)

**Why:** every other feature (Lobby, matches, stats, friends) needs to know who the user is, and the subject requires secure password storage and validated input.

**How (authentication, Augusto):**

- Sign-up, login, `me`, refresh and logout under `/api/auth/`, with Pydantic validation on every field and errors returned in one envelope (`code` and per-field codes, translated by the frontend).
- Passwords hashed with **Argon2id** (salted, memory-hard), run outside the event loop so a login never freezes the game ticks. Passwords are limited to 8–128 characters: without an upper bound, hashing a huge password would be a cheap denial of service.
- **Tokens:**
  - The access token is a JWT (15 min), kept in memory by the frontend.
  - The refresh token is opaque, because a JWT cannot be revoked without a table anyway. It lives in an `HttpOnly` cookie, is rotated on every refresh, and reusing an old one revokes the whole family (RFC 9700).
  - The same `issue_tokens` function serves the e-mail login and the 42 OAuth login.
- `CurrentUser`, a FastAPI dependency, protects every authenticated route; `authenticate_ws_token` does the same for both WebSockets.
- Rate limits as dependencies: 5 failed logins per minute per IP, plus caps on sign-up and refresh.

Profile, avatar, friends and the screens are Caio's part of this module.

### 8. OAuth 2.0 — Minor (1)

**Why:** every student and every evaluator already has a 42 intra account. Logging in with it skips the sign-up form, and the school's e-mail is already verified.

**How:**

- **Authorization Code flow** (RFC 6749 §4.1) in two routes:
  - `GET /api/auth/oauth/42/login` redirects to the intra with a random `state`;
  - `GET /api/auth/oauth/42/callback` receives the `code`.
- **CSRF protection:** the same `state` travels in a signed cookie (10 min, `HttpOnly`, `Secure`, valid only under `/api/auth/oauth`). The callback compares the two in constant time and refuses a cookie from another provider or another flow.
- **Server to server:** the backend exchanges the `code` for a token with httpx (5 s timeout) and reads `/v2/me`. The client secret never reaches the browser, and the 42 token is thrown away after that read.
- **Which account logs in:**
  1. the one already linked to this 42 id;
  2. otherwise the one with the same e-mail, linked now;
  3. otherwise a new account with no password, named after the 42 login (normalized; a suffix is added if the name is taken).

  A unique `(provider, provider_user_id)` in `oauth_accounts` keeps one link per 42 account.
- **Same session as the e-mail login:** the callback calls the same `issue_tokens`, and the refresh cookie is set on the redirect back to the site.
- **Errors:** refusing on the 42 screen returns `oauth_cancelled`; any other failure returns `oauth_failed`. Both are translated by the frontend. The logs keep only the reason: never the `code` or the `state`, not even in the Nginx access log.
- **No configured redirect URI:** it is derived from `PUBLIC_HOST`, the only source of the public name. The flow is generic, so another provider would be one more entry in a table of adapters.

### 9. Advanced 3D graphics — Major (2)

> **TODO F9.1 (@rflheringer):** why we chose it and how it was implemented.

### 10. Game customization — Minor (1)

> **TODO F9.1 (@rflheringer):** why we chose it and how it was implemented.

### 11. Game statistics and match history — Minor (1)

**Why:** progression gives players a reason to come back, and it gives the profile something to show: how you play, how you improved and where you stand against the others.

**How:**

- **Recorded once, by the server.** When a match ends, the Room calls `record_match_result`. A single transaction writes:
  - the row of each player (`match_players`);
  - the stats per mode (`player_stats`);
  - XP, level and Elo;
  - the new achievements.

  The client never sends a result.
- **XP:** 20 for taking part; plus performance, up to 100 (5 per kill in co-op, 10 per frag in PvP); plus the result (a win is worth 100 in co-op and 60 in PvP; a draw is worth 30). A player disconnected at the end gets no XP and no achievements. **Level** = 1 + ⌊√(XP / 100)⌋, so each level costs more than the previous one.
- **Elo (PvP only):** standard formula, everyone starts at 1000, K = 32. The points one player wins are the points the other loses. The rating before and after each match is stored, so the history can show "+16 Elo".
- **Endpoints:**
  - `GET /api/users/{id}/stats`: per mode, with level and XP progress;
  - `GET /api/users/{id}/matches`: history, newest first, paginated, with the other players fetched in one extra query for the whole page;
  - `GET /api/users/{id}/achievements`: the catalog and what the user unlocked;
  - `GET /api/matches/{id}/result`: the result screen;
  - `GET /api/leaderboard?mode=`: by Elo or XP by default, also by wins or kills.
- **Rules that keep the numbers honest:**
  - Wins come from `match_players.won`, never from `matches.result`.
  - A leaderboard tie is broken by more wins, then by the oldest account, so a rank never repeats.
  - Only players who finished a match in that mode are ranked.

### 12. Monitoring system — Major (2)

**Why:** a real-time game has a budget (one tick every 33 ms), and during playtests we needed to see whether it held, whether the API was failing and whether someone was hammering the login. We wanted to see it without opening the containers.

**How:**

- **Collect:** Prometheus scrapes, every 15 s:
  - the backend's `/metrics` (Augusto: HTTP requests, logins by result, open WebSockets, Rooms in a match, tick duration);
  - node-exporter for the host;
  - postgres-exporter for the database.
- **Show:** Grafana, with the data source and 3 dashboards (game and backend, host, Postgres) provisioned from versioned files. A `down -v` loses nothing that matters.
- **Alert:** 4 Prometheus alerting rules (target down, slow tick, 5xx rate, failed-login spike). Each one has a `promtool` unit test that the CI runs, and the CI also checks that Prometheus loaded all four.
- **Secure:**
  - Prometheus and the exporters have no published port, and the proxy does not route `/metrics`;
  - Grafana is reachable only at `/grafana/` behind Nginx (HTTPS), with a login, no sign-up, no anonymous access and no outbound requests;
  - the admin password comes from `.env`, and Compose refuses to start without it.

The dashboards, the alerts and how to trigger one live are in the *Monitoring guide*.

### 13. Multiple languages — Minor (1)

> **TODO F9.1 (@caioosantos):** why we chose it and how it was implemented.

## Monitoring guide

- **Grafana:** open `https://<PUBLIC_HOST>/grafana/` and log in with `GF_SECURITY_ADMIN_USER` / `GF_SECURITY_ADMIN_PASSWORD` from `.env`.
  - Sign-up and anonymous access are disabled, and the session cookie is `Secure`.
  - Grafana makes no outbound requests (no update checks, analytics or Gravatar).
- **Dashboards**, provisioned from versioned files (`monitoring/grafana/provisioning/`), come back on their own after `docker compose down -v && docker compose up`:
  - **Jogo e backend** (game and backend): backend up, Rooms in a match, open WebSockets, tick duration (p50/p99), requests per second by status, top routes, 5xx rate, logins by result;
  - **Host:** CPU, memory, load, disk usage and I/O (node-exporter);
  - **Postgres:** database up and size, connections, cache hit ratio, transactions and rows per second, locks and deadlocks (postgres-exporter).
- **Prometheus:**
  - It scrapes the backend's `/metrics` and both exporters inside the Compose network.
  - It has no published port, and the proxy does not route `/metrics`, so neither is reachable from outside.
  - Retention is 7 days or 500 MB, whichever comes first.
- **Alerts:** Prometheus alerting rules in `monitoring/prometheus/alerts.yml`, unit-tested with `promtool` (`alerts.test.yml`, run by the CI). The project has no Alertmanager: the subject asks for alerting rules, not notifications. The rules appear in Grafana under **Alerting → Alert rules** as data source-managed rules.

  | Alert | Fires when | For |
  |---|---|---|
  | `TargetDown` (critical) | a scrape target is down (`up == 0`); the `job` label says which: `backend`, `node` or `postgres` | 30 s |
  | `TickP99High` | the p99 of the game tick over 5 min is above the 33 ms budget (30 Hz) | 1 min |
  | `High5xxRate` | more than 5% of HTTP responses over 5 min are 5xx (`/metrics` excluded) | 1 min |
  | `LoginFailureSpike` | more than 10 failed logins in 5 min | 1 min |

  Live demo:
  1. Open Grafana → **Alerting → Alert rules**.
  2. Run `docker compose stop backend`. `TargetDown` with `job="backend"` goes to *pending*, then to *firing* in under a minute: up to 30 s for the next scrape and rule evaluation (both every 15 s), plus the 30 s `for`.
  3. Run `docker compose start backend` and the alert returns to *normal*. If the site answers 502 afterwards (Nginx resolved the old container address), run `docker compose restart proxy`. Never restart the proxy while the backend is stopped: Nginx resolves `backend` at startup and exits if the name does not exist.

  To demo without taking the site down, stop `postgres-exporter` instead.

## Individual Contributions

### Roberto Del Franco — Tech Lead

**What I built**

- **Technical direction:** the architecture document, the task plan with the five slices, the first ADRs and the contracts between slices (rules, WebSocket messages, `mountGame` and `ViewState`), written and signed before the code so each person could build against a fake of the other side. I reviewed every change to the game rules.
- **Simulation (`backend/app/game/`):** the map loader with its validity checks, the Room state, `apply_input` (movement, turning, wall sliding one axis at a time, body collision), the input queue, pickups and doors, fireballs and Mana, projectiles in substeps, enemies with BFS chase, the boss, armor and damage, the countdown before the start, and the end of a match.
- **Rulesets:** `CoopRuleset` and `PvpRuleset` (frags, respawn, frag and time limits, scoreboard), plus the Room options (pickups on or off) applied to the initial grid.
- **Client prediction:** `rules.ts` and `applyInput.ts`, the fixed-step loop that sends one Input per tick, reconciliation with smooth correction, and the client waiting for the countdown before predicting.
- **Mirror tests:** `mirror.py` generates `mirror.json` from the Python code, and Vitest replays the same cases in TypeScript and must reach the same positions.
- **Tooling and load:** a CLI that generates a `welcome` and a Snapshot without a server (so the frontend could start before the backend), the 1000-tick performance test and the 4-Room benchmark.
- **Minimap**, and the match page layout (minimap and HUD anchored to the canvas, full screen button, countdown overlay).

**Challenges**

- **The C world is mirrored.** Cub3D draws the scene mirrored: the camera plane points west when the player faces north, and the C code swaps the arrow keys and the strafe direction to compensate. Copying it would have made the 3D scene move backwards. I wrote down what each key means in the unmirrored scene (`ws-messages.md`), ported the math but not the key bindings, and pinned it with two "mirror" tests (turning right from north increases `dx`, strafing right increases `x`).
- **Same result in Python and TypeScript.** Prediction only works if the client computes exactly what the server computes. The order inside one Input (mouse, turn keys, normalized intention vector, `x`, then `y`, then pickup) is part of the contract, positions are compared with a tolerance (`Math.cos` and `math.cos` can differ by 1 ulp), and a shared fixture fails the build if `rules.ts` drifts from `rules.py`.
- **Not porting the C bugs.** Three things in the C code were bugs, not rules: movement per frame instead of per second, the boss ignoring the result of its own collision check (so it walked through enemies), and a pickup check that received `double` coordinates as `int`, truncating instead of flooring. None of them was ported, and each one has a test in Python.
- **A Room that never repeats an Input.** The first version kept only the last Input and applied it every tick. The server then took steps the client never predicted, and reconciliation pulled the player back. The queue applies each Input once, stands still when it is empty and catches up two at a time.
- **Smooth correction without hiding bugs.** Snapping on every Snapshot made the camera shake near other players, whose positions the client only knows from the past. Small errors are now absorbed over 0.1 s, large ones snap, and the `console.assert` still reports any real divergence.
- **Performance target.** The first target (1000 ticks in 200 ms) was not realistic in Python. Profiling with `cProfile` measured ~820 ms and pointed at the wall check. Instead of optimizing what did not matter at our scale, I revised the target to 2 s (6 % of the tick budget) so the test still catches a real regression, such as the BFS without its cache, and confirmed the real load with the 4-Room benchmark.

### Augusto Cesar — Developer

**What I built**

- **Backend foundation:** the `backend/app/` package with `create_app()`, settings from the environment, the single error envelope, `GET /api/health`, and the `pytest` fixtures every backend slice uses.
- **Middlewares:** JSON logs with a `request_id` per request (never the query string), error handlers, and the `RateLimit` dependency.
- **Authentication:** the user models, sign-up, login, `me`, refresh with rotation and reuse detection, logout, `CurrentUser` and the WebSocket token check. Contracts: `docs/contracts/auth.md` and ADR 0002 (tokens).
- **Realtime:** `ConnectionManager` and `/ws/app` (presence, Lobby publishing); the message protocol (`protocol.py` / `types.ts`). Contract: `docs/contracts/ws-manager.md`.
- **Game server loop:** `RoomManager`, with one `asyncio` task per Room at a fixed 30 Hz; `/ws/game/{match_id}` with `join`, the read loop and the close codes; N players with a per-socket message limit; end of match (records the result once, keeps the Room 60 s); grace period and reconnection; ping/pong.
- **Game client network layer:** the socket with automatic reconnection, input sending, building the `ViewState` from Snapshots, and the interpolation of other entities.
- **Metrics:** `GET /metrics` (HTTP requests, logins by result, open WebSockets per channel, active Rooms and the tick duration histogram), reachable only inside the Compose network.

**Challenges**

- **Keeping the tick steady.** A naïve `sleep(1/30)` drifts, because the work of each tick adds to it. The loop schedules each tick from a fixed start time and measures the work in the `game_tick_seconds` histogram.
- **One slow client must not freeze a Room.** Sending directly from the tick would make the whole match wait for the worst connection. Each socket got its own queue and writer task. A pending Snapshot is replaced by the newer one, and a client that still cannot keep up is disconnected with `4429`.
- **Recording the result exactly once.** After `game_over` the Room keeps ticking for the boss death animation, so a naïve check would record the match many times. The Room calls `record_match_result` on the transition only, and a test sends ticks after the end to prove it.
- **A grace period that survives slow ticks.** It is counted in ticks, not wall-clock time, so it advances with the match.
- **Session vs. socket.** The game socket used to treat any failure while getting a token as "logged out", so a network blip, a 5xx or the refresh rate limit (shared by everyone behind the campus NAT) ended a match whose session was still valid. Now only a confirmed lost session ends it: a transient failure retries with backoff, and a fresh token is requested only after the server rejects the current one (`4401`).
- **Testing a bad network.** Chrome's throttling does not touch WebSockets, so the first measurements proved nothing. We switched to `tc netem` on the proxy container, without `sudo` on the host.

### Rafael Heringer — Developer

> **TODO F9.1 (@rflheringer):** what you built (features, modules, components), and the challenges you faced and how you overcame them.

### Caio Santos — Product Owner

> **TODO F9.1 (@caioosantos):** what you built (features, modules, components), and the challenges you faced and how you overcame them.

### Gabriel Kanashiro (Akita) — Project Manager

**What I built**

- **Project management:** one issue per task ID with an owner, the GitHub Projects board and the workflow that moves its cards; the Monday meetings and the Friday checkpoints; a weekly status page generated from the board (progress, velocity, forecast, blockers); the replanning each time the dates moved.
- **Contracts:** the Rooms contract (life cycle of a Room, from Lobby to the recorded match), the match API (Lobby, results, stats, history, achievements, leaderboard) and the infrastructure contract (services, ports, environment variables, Nginx routes).
- **Database:** the Alembic setup, the migration run at startup and the match schema (`matches`, `match_players`, `player_stats`, `user_achievements`).
- **Lobby backend:** create, list, join, leave, ready, character and start, with the "one Room per user" rule; publishing every change to the open tabs; leaving the Lobby when a user goes offline.
- **End of a match and progression:** `record_match_result` and the abort of unfinished matches at startup; stats per mode, XP and levels, Elo, history, the 7 achievements, the result endpoint and the leaderboard.
- **Log in with 42:** the OAuth 2.0 flow, account linking and the shared token issue.
- **Edge and infrastructure:**
  - Nginx with TLS (certificates from `mkcert`), HTTP→HTTPS, the WebSocket upgrade, static `/media/`, the redirect to `PUBLIC_HOST`, access logs without the query string;
  - Docker Compose with healthchecks, so one command starts everything in order;
  - the CI.
- **Monitoring:** Prometheus and the two exporters, the three Grafana dashboards, the four alerting rules and their tests.

**Challenges**

- **Recording a result exactly once.** The end of a match can be reached twice: a retry, an abort that arrives at the same time, or a backend restart. The match row in `running` is the idempotency key: it is locked with `SELECT … FOR UPDATE` until the commit, and a second call no longer finds it. The `player_stats` rows are created if missing and locked in the same transaction, so two matches ending at once for the same player do not lose an update. Achievements are announced only after the commit. Along the way, a game test failed about once in 60 runs under load: it waited for the socket to close, but the abort writes to the database a couple of event-loop turns later. The fix was in the test (wait for the tick task to finish), not in the production code.
- **Grafana in the CI.** The check that Grafana loaded its data source failed now and then with a 404. The cause: at startup, Grafana 13's plugin installer replaced the bundled Prometheus plugin with a newer download, and for about 5 seconds the data source did not exist. Turning off the plugin preinstall fixed it, and Grafana now makes no outbound requests at all. A second issue: behind the proxy, Grafana's redirects lost the HTTPS port. `absolute_redirect off` in Nginx keeps them relative.
- **Security at the edge.** The OAuth callback carries the `code` and `state` in the query string, and the default Nginx log wrote them to disk. A custom `log_format` logs only the path, and a CI step checks it. Then, in the multi-machine test at 42, opening the site by the server's IP made every session refresh fail with `403`. The refresh accepts only requests whose `Origin` is `PUBLIC_HOST`, a protection against CSRF. Nginx now answers any other host name with a `302` to `PUBLIC_HOST`, so the browser always uses the name the session belongs to.
- **Five slices, one game.** Every feature crossed at least two people. Writing each boundary as a contract, signed before the code, let each person build against a fake of the other side; when someone was late, the others did not stop. When the dates changed, the plan changed with them: tasks were moved, and the cut order made clear what would go first. The weekly status, generated from the board instead of from memory, made a blocker visible on Monday rather than on Friday's checkpoint.

## Known limitations

- **One backend worker.**
  - Rooms and connections live in the memory of a single process, so the backend cannot be scaled horizontally as it is.
  - Scaling would need a shared broker (e.g. Redis pub/sub) and sticky sessions.
  - A restart of the backend aborts the matches in progress; at startup, matches left `running` are marked `aborted`.
- **Chrome only.** The project targets the latest stable Google Chrome.
- **Local network demo.**
  - HTTPS uses a local CA from `mkcert`, which must be trusted on each client machine.
  - Sessions are bound to the `PUBLIC_HOST` name: opening the site by any other name, such as the server's IP, redirects to `PUBLIC_HOST`.
- **42 is the only OAuth provider.**
- **Out of scope:** tournaments, AI opponents, chat and spectator mode.

## Resources

**Documentation**

- [FastAPI](https://fastapi.tiangolo.com/) · [SQLAlchemy 2.0](https://docs.sqlalchemy.org/en/20/) · [Alembic](https://alembic.sqlalchemy.org/) · [Pydantic](https://docs.pydantic.dev/)
- [React](https://react.dev/) · [Vite](https://vite.dev/) · [Tailwind CSS](https://tailwindcss.com/docs) · [i18next](https://www.i18next.com/) · [Three.js](https://threejs.org/docs/)
- [PostgreSQL 16](https://www.postgresql.org/docs/16/) · [Nginx](https://nginx.org/en/docs/) · [Docker Compose](https://docs.docker.com/compose/)
- [Prometheus: configuration and alerting rules](https://prometheus.io/docs/prometheus/latest/configuration/alerting_rules/) · [Grafana provisioning](https://grafana.com/docs/grafana/latest/administration/provisioning/)
- [42 API](https://api.intra.42.fr/apidoc) · [RFC 6749, OAuth 2.0](https://datatracker.ietf.org/doc/html/rfc6749) · [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [PostgreSQL: explicit locking](https://www.postgresql.org/docs/16/explicit-locking.html) · [PostgreSQL: `INSERT … ON CONFLICT`](https://www.postgresql.org/docs/16/sql-insert.html#SQL-ON-CONFLICT) · [Alembic: autogenerate and `alembic check`](https://alembic.sqlalchemy.org/en/latest/autogenerate.html)
- [Prometheus: unit testing for rules](https://prometheus.io/docs/prometheus/latest/configuration/unit_testing_rules/) · [node-exporter](https://github.com/prometheus/node_exporter) · [postgres-exporter](https://github.com/prometheus-community/postgres_exporter) · [Grafana behind a reverse proxy](https://grafana.com/tutorials/run-grafana-behind-a-proxy/)
- [Nginx `log_format`](https://nginx.org/en/docs/http/ngx_http_log_module.html#log_format) · [mkcert](https://github.com/FiloSottile/mkcert) · [GitHub Actions](https://docs.github.com/en/actions)

**Articles and tutorials**

- Gabriel Gambetta, [Fast-Paced Multiplayer](https://www.gabrielgambetta.com/client-server-game-architecture.html): client-side prediction, server reconciliation and entity interpolation.
- Valve, [Source Multiplayer Networking](https://developer.valvesoftware.com/wiki/Source_Multiplayer_Networking).
- Glenn Fiedler, [Fix Your Timestep!](https://gafferongames.com/post/fix_your_timestep/).
- Lode Vandevenne, [Raycasting tutorial](https://lodev.org/cgtutor/raycasting.html), the basis of the original Cub3D.
- [Elo rating system](https://en.wikipedia.org/wiki/Elo_rating_system).
- David Goldberg, [What Every Computer Scientist Should Know About Floating-Point Arithmetic](https://docs.oracle.com/cd/E19957-01/806-3568/ncg_goldberg.html): the tolerance of the Python/TypeScript mirror tests.
- [Python `dataclasses`](https://docs.python.org/3/library/dataclasses.html) · [pytest](https://docs.pytest.org/) · [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html) · [Vitest](https://vitest.dev/) · [MDN Canvas API](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API) · [MLX42](https://github.com/codam-coding-college/MLX42), the graphics library of the original Cub3D.

> **TODO F9.1 (all):** add the references you actually used for your part.

**How we used AI**

We used AI assistants (Claude) as a support tool throughout the project. They were used for:

- **Task management and planning:** breaking the modules into tasks, estimating, ordering dependencies and preparing the weekly status;
- **Documentation:** drafting and reviewing contracts, test scripts and this README;
- **Code review:** looking for bugs, race conditions and missing tests in pull requests;
- **Generating some code:** small, specific pieces.

The team followed one rule: the assistant explains the concept or the bug and proposes a change, and the person decides, then applies it or types it themselves. Each of us can explain every part we delivered, because the defense requires it.

**No AI agent made commits, pushed code or opened pull requests in this repository.** Every commit, push, pull request and review was made manually by a team member.

## Credits

- Game logic, map format and textures come from the *Cub3D* bonus project ([robertodelfranco/42-Cub3D](https://github.com/robertodelfranco/42-Cub3D)), written at 42 by Roberto Del Franco and Rafael Heringer.

  > **TODO F9.1 (@robertodelfranco):** confirm the authors of the original Cub3D (with logins) and credit any third-party textures or sounds.
- Built with the open-source projects listed in *Technical Stack*. Each one keeps its own license.
