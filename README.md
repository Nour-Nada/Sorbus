<!-- Replace with the project logo: Frontend/Sorbus/src/assets/sorbus_logo.png -->
<p align="center">
  <img src="Frontend/Sorbus/src/assets/sorbus_logo.png" alt="Sorbus" width="140" />
</p>

<h1 align="center">Sorbus</h1>

<p align="center">
  <strong>Your files. Your hardware. Your cloud.</strong><br />
  A self-hosted personal cloud storage system you run at home and reach from anywhere.
</p>

<p align="center">
  <!-- License badge -->
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT" /></a>
  <!-- TODO: Buy Me a Coffee — replace <your-bmc-link> with your real link -->
  <a href="https://www.buymeacoffee.com/&lt;your-bmc-link&gt;"><img src="https://img.shields.io/badge/Buy%20Me%20a%20Coffee-support-yellow.svg" alt="Buy Me a Coffee" /></a>
</p>

---

## About Sorbus

Sorbus is a **self-hosted personal cloud storage system** — think of it as your own private Google Drive that runs on hardware you control. You run the storage server and database locally (on a Raspberry Pi or any home server with direct access to your files), and you reach it through a modern web interface hosted online and tunneled back to your home machine.

The philosophy is simple: **you own your data.** Nothing lives on someone else's servers, there's no subscription, and the whole thing runs comfortably on cheap hardware. You decide who gets an account, what they can do, and where the files physically live.

**Author / Credits:** Nour Nada

**Contact:** `<your-email>` <!-- TODO: add your contact email here -->

**Support:** If Sorbus is useful to you, consider supporting development — [Buy Me a Coffee](https://www.buymeacoffee.com/&lt;your-bmc-link&gt;) <!-- TODO: replace with your real link -->

---

## Table of Contents

- [Features](#features)
- [Screenshots](#screenshots)
- [Architecture at a Glance](#architecture-at-a-glance)
- [Deployment / Getting Started](#deployment--getting-started)
- [Developer Guide](#developer-guide)
  - [How It All Fits Together](#how-it-all-fits-together)
  - [Authentication Model](#authentication-model)
  - [Project Structure](#project-structure)
  - [Database Schema](#database-schema)
  - [API Reference](#api-reference)
  - [Environment Variables](#environment-variables)
  - [Local Development Setup](#local-development-setup)
  - [Key Behaviors & Gotchas](#key-behaviors--gotchas)
  - [Access Control](#access-control)
  - [Containerization Details](#containerization-details)
- [Contributing](#contributing)
- [Reporting Issues](#reporting-issues)
- [License](#license)
- [Support the Project](#support-the-project)

---

## Features

- 📁 **Three ways to browse** — a nested **tree** view, a **shelf** (grid of cards), and a **ledger** (sortable table)
- ⬆️ **Uploads with live progress** — drag-and-drop, a bottom-right progress toast, no file-size limit at the gateway
- 📂 **Full file management** — create folders, rename, move (with cascade to children), delete, and batch operations
- ⬇️ **Streamed downloads** — files streamed in chunks; folders zipped on the fly
- 👤 **User accounts & roles** — owner / editor / viewer, with a built-in account and admin panel
- 🔐 **Secure by design** — JWT access tokens, refresh cookies, bcrypt password hashing, signed single-use download links
- 🗄️ **Self-contained storage** — SQLite metadata, files stored directly on your chosen disk path
- 🐳 **Docker-first deployment** — three containers, two compose files, one setup script

---

## Screenshots

<!-- TODO: add screenshots or a demo GIF here -->
> _Screenshots / demo GIF coming soon._

---

## Architecture at a Glance

Sorbus is a **three-tier application** that is deliberately **split across two machines**:

```
                          ┌──────────────────────────────────────┐
   Your browser  ──────►  │  CLOUD SERVER                         │
                          │                                       │
                          │   React (nginx)  ──►  Node.js gateway │
                          │                            │          │
                          └────────────────────────────┼──────────┘
                                                        │
                                          Cloudflare tunnel (HTTPS)
                                                        │
                          ┌─────────────────────────────▼─────────┐
                          │  HOME MACHINE / RASPBERRY PI           │
                          │                                       │
                          │   C++ HTTP server  ──►  SQLite + files │
                          └───────────────────────────────────────┘
```

| Tier | Tech | Where it runs | Responsibility |
|---|---|---|---|
| **Frontend** | React 19 + Vite, served by nginx | Cloud server | The web UI. nginx also proxies `/api/*` to the Node gateway. |
| **API Gateway** | Node.js + Express 5 | Cloud server | Auth (JWT + bcrypt), rate limiting, CORS, and proxying requests to the C++ server. |
| **File Server** | C++ (cpp-httplib) + SQLite | Home machine / Pi | All file operations and user management, with direct filesystem access. |

The Node gateway reaches the C++ server over a **Cloudflare tunnel**, so your home machine never needs an open inbound port.

---

## Deployment / Getting Started

This is the **easy path** for getting Sorbus running. Deployment is intentionally scripted.

### Prerequisites

- **Docker** + Docker Compose on both machines
- A **home machine / Raspberry Pi** to hold your files (runs the C++ server)
- A **cloud server** to host the web UI + gateway (runs Node.js + React)
- A **Cloudflare tunnel** pointing at the C++ server on the home machine ([Cloudflare Tunnel docs](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/))

### Step 1 — Generate your config

Clone the repo on the home machine, then run the interactive setup script:

```bash
cd Docker
bash setup.sh
```

`setup.sh` will:
- **Auto-generate** the secrets you should never set by hand: `API_KEY`, `JWT_SECRET`, `REFRESH_TOKEN_SECRET` (via `openssl rand`)
- **Prompt you** for the values only you can decide:

  | Value | What it is |
  |---|---|
  | `STORAGE_PATH` | Absolute path on the home machine where files are stored |
  | `REGISTER_KEY` | The signup key you share with people you want to allow to register |
  | `CORS_ORIGIN` | The exact URL users type in their browser (e.g. `https://sorbus.yourdomain.com`) |
  | `CPP_SERVER_URL` | The Cloudflare tunnel URL pointing at the C++ server |

It writes two files: **`.env.local`** (home machine) and **`.env.cloud`** (cloud server). Both are git-ignored — never commit them. Copy `.env.cloud` to your cloud server.

> The same `API_KEY` is written to both files; it's how the Node gateway authenticates to the C++ server, so the two must match.

### Step 2 — Start the home machine (C++ server)

```bash
docker compose -f docker-compose.local.yml --env-file .env.local up -d
```

### Step 3 — Start the cloud server (Node.js + React)

```bash
docker compose -f docker-compose.cloud.yml --env-file .env.cloud up -d
```

### Step 4 — First run

1. Open your `CORS_ORIGIN` URL in a browser.
2. Sign up — **the first account automatically becomes the `owner`.** Every account after that starts as a `viewer`.
3. As owner, open the **Account** page and set the **storage path** (this initializes the file index).

You're live.

---

## Developer Guide

> **Goal:** clone the repo and be productive in ~30 minutes. This section is the map.

### How It All Fits Together

A request flows through all three tiers:

```
Browser (React) ──► nginx (/api proxy) ──► Node.js gateway ──► C++ server ──► SQLite / disk
```

- **React** never talks to the C++ server directly. It only knows about `/api/*`, which nginx proxies to Node.
- **Node.js** is the security boundary. It verifies JWTs, hashes passwords, enforces rate limits, and only then proxies the request to the C++ server — adding the shared `key` header.
- **C++** trusts any request carrying the correct `key` header. It does the actual filesystem and database work. It has **no concept of JWTs** — auth is entirely Node's job; the C++ layer is protected by being unreachable except through the tunnel + shared key.

### Authentication Model

| Mechanism | Where | Details |
|---|---|---|
| **Access token (JWT)** | Node ⇄ Browser | 5-minute lifetime, signed with `JWT_SECRET`, payload is just `{ userId }`. Sent as `Authorization: Bearer <token>`. |
| **Refresh token** | Node ⇄ Browser | 7-day `httpOnly` cookie, signed with `REFRESH_TOKEN_SECRET`, payload `{ userId, username, access }`. Used to mint new access tokens. |
| **Password hashing** | Node | `bcrypt`. The C++ server only ever stores/compares the hash — **plaintext passwords never reach C++.** |
| **Signed download links** | Node | 60-second, single-use tokens (`crypto.randomBytes`) kept in an in-memory map, so the browser can download via a native `<a>` tag without a JWT header. |
| **Shared API key** | Node ⇄ C++ | Every request from Node to C++ carries a `key` header matching `FILEAPP_API_KEY`. |

### Project Structure

```
C++_Server/
  server.cpp                  — entire C++ server (single file)
  sorbus.db                   — SQLite database (ships with example test users)
  header_libs/                — vendored header-only / compiled libs
    httplib.h                 — cpp-httplib (HTTP server)
    json.hpp                  — nlohmann/json
    SQLiteCpp/ + src_sqlite/  — SQLiteCpp wrapper (headers + compiled .cpp)
    sqlite3/                  — SQLite3 amalgamation
    miniz/                    — miniz (ZIP for folder downloads)

Node_Backend/
  index.js                    — entire Node.js gateway (single file)
  package.json

Frontend/Sorbus/src/
  main.jsx                    — axios baseURL setup
  App.jsx                     — provider tree, JWT interceptors, routes
  context/                    — Auth, Account, and File React contexts
  pages/                      — Landing, Login, Signup, Home, Account, etc.
  components/                 — SideBar, FileView, ShelfView, LedgerView, etc.

Docker/
  docker-compose.local.yml    — C++ server (home machine)
  docker-compose.cloud.yml    — Node.js + React (cloud server)
  Dockerfile.cpp / .node / .react
  nginx.conf.template         — ${NODE_BACKEND_URL} substituted at startup
  setup.sh                    — generates .env.local + .env.cloud
  .env.local.example / .env.cloud.example
```

### Database Schema

SQLite in **WAL mode**. Three tables:

```sql
users       — id, username, email, password (bcrypt hash), access ('owner'|'editor'|'viewer'), created_at
files       — id, user_id, file_name, file_location, file_size, file_extension, uploaded_at
server_info — singleton row (id=1): server_status, register_key, file_location
```

- **First signup → `owner`.** Everyone after → `viewer`.
- **Folders** are rows with `file_size = -1` and `file_extension = 'folder'`.
- `file_location` is the path relative to the storage root, `/`-separated; an empty string means the root.
- `FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE` — deleting a user removes their file rows.

### API Reference

All C++ routes require a `key` header matching `FILEAPP_API_KEY`. The Node gateway adds this automatically.

<details>
<summary><strong>C++ Server routes</strong></summary>

**User**

| Method | Path | Description |
|---|---|---|
| POST | `/api/user/signup` | First user → owner. Returns `{user_id, username, access}`. |
| GET | `/api/user/login/:username` | Matches username or email. Returns the password hash for Node to compare. |
| GET | `/api/user/name` | All users keyed by username. |
| PATCH | `/api/user/change/access/:uid_main/:uid_change/:access` | Owner-only. `:access` ∈ {editor, viewer}. |
| DELETE | `/api/user/delete/:uid_main/:uid_change` | Owner-only. Cascades to files. |

**Files**

| Method | Path | Description |
|---|---|---|
| GET | `/api/files/name/:user_id` | Returns `{ tree, fileIds, fileInfo, initialized }`. |
| GET | `/api/files/download/:file_id/:user_id` | Streams file in 64KB chunks; folders zipped via miniz. Editor+. |
| GET | `/api/files/storage` | Free bytes on the storage partition. |
| GET | `/api/files/filesizes` | `SUM(file_size)` across all files. |
| POST | `/api/files/upload/:user_id` | Raw body upload. Editor+. |
| POST | `/api/files/create/:user_id` | Create a folder. Editor+. |
| PATCH | `/api/files/name/:file_id/:user_id` | Rename (cascades to children for folders). Editor+. |
| PATCH | `/api/files/move/:file_id/:user_id` | Move (cascades). Editor+. |
| DELETE | `/api/files/delete/:file_id/:user_id` | Delete (cascades DB + filesystem). Editor+. |

**Features**

| Method | Path | Description |
|---|---|---|
| GET | `/api/features/location` | Current storage path. |
| PATCH | `/api/features/location/:user_id` | Owner-only. Sets storage path, re-indexes files. |
| PATCH | `/api/features/reinitialize/:user_id` | Owner-only. Re-scans the storage directory. |

</details>

<details>
<summary><strong>Node.js Gateway routes</strong></summary>

| Route | Middleware | Notes |
|---|---|---|
| `GET /` | limiter | Health check. |
| `POST /api/user/refresh` | limiter | Reads refresh cookie, returns a new access token. |
| `POST /api/user/logout` | limiter | Clears the refresh cookie. |
| `GET /api/user/verify` | limiter, verifyJWT | 200 if token valid. |
| `POST /api/user/signup` | limiter | Validates input, bcrypt-hashes, proxies to C++. |
| `POST /api/user/login/:username` | limiter | Fetches hash, bcrypt-compares, issues tokens. |
| `GET /api/user/name` | limiter, verifyJWT | |
| `PATCH /api/user/change/access/...` | limiter, verifyJWT, verifyUserId | |
| `DELETE /api/user/delete/...` | limiter, verifyJWT, verifyUserId | |
| `GET /api/files/name/:user_id` | limiter, verifyJWT, verifyUserId | |
| `GET /api/files/download/:file_id/:user_id` | limiter, verifyJWT, verifyUserId | JWT-protected direct stream. |
| `GET /api/files/download-token/:file_id/:user_id` | limiter, verifyJWT, verifyUserId | Issues a 60s single-use token. |
| `GET /api/files/download-stream/:file_id/:user_id?token=` | downloadLimiter | No JWT — token is the gate. Enables native `<a>` downloads. |
| `GET /api/files/storage` · `GET /api/files/filesizes` | limiter, verifyJWT | |
| `POST /api/files/upload/:user_id` | limiter, verifyJWT, verifyUserId | No size limit. |
| `POST /api/files/create/...` · `PATCH name/move` · `DELETE delete` | limiter, verifyJWT, verifyUserId | |
| `GET /api/features/location` | limiter, verifyJWT | |
| `PATCH /api/features/location/:user_id` · `reinitialize/:user_id` | verifyJWT, verifyUserId, limiter | |

**Rate limits:** `limiter` = 100 req / 5 min / IP (standard routes); `downloadLimiter` = 60 req / 5 min / IP (download-stream only).

</details>

### Environment Variables

<details>
<summary><strong>C++ Server</strong></summary>

| Variable | Required | Default | Description |
|---|---|---|---|
| `FILEAPP_API_KEY` | No | `dev-key-change-me` | Shared secret checked on every request. |
| `FILEAPP_REGISTER_KEY` | **Yes** | — | Signup key written to the DB on startup. Server exits if not set. |
| `FILEAPP_FILE_LOCATION` | No | `""` | Storage path. Empty = not yet configured. |
| `FILEAPP_DB_PATH` | No | `sorbus.db` | Path to the SQLite file. |
| `FILEAPP_MAX_FILES` | No | `100000` | Max files before uploads return 507. |

</details>

<details>
<summary><strong>Node.js Gateway</strong></summary>

| Variable | Required | Description |
|---|---|---|
| `API_KEY` | Yes | Sent as `key` to the C++ server. Must match `FILEAPP_API_KEY`. |
| `C_Server_Route` | Yes | Base URL of the C++ server (the tunnel URL). |
| `JWT_SECRET` | Yes | Signs 5-minute access tokens. |
| `REFRESH_TOKEN_SECRET` | Yes | Signs 7-day refresh cookies. |
| `CORS_ORIGIN` | Yes | Exact allowed browser origin (no trailing slash). |
| `PORT` | No | Listen port (default `3000`). |

</details>

<details>
<summary><strong>React Frontend</strong></summary>

| Variable | Required | Description |
|---|---|---|
| `VITE_API_URL` | No | axios base URL. Defaults to same-origin (`''`). Leave empty in Docker — nginx proxies `/api/*`. Set only if React and Node are on different domains. |

</details>

### Local Development Setup

Run each tier directly (outside Docker) for fast iteration.

**1. C++ server** — compile with the vendored libraries and run:

```bash
cd C++_Server
g++ -std=c++17 -O2 \
  -I header_libs/sqlite3 -I header_libs \
  server.cpp \
  header_libs/sqlite3/sqlite3.c \
  header_libs/miniz/miniz.c \
  header_libs/src_sqlite/*.cpp \
  -lpthread -o sorbus-server

FILEAPP_REGISTER_KEY=dev-register-key ./sorbus-server
```

> `FILEAPP_REGISTER_KEY` is mandatory — the server exits immediately without it. On Windows, build in Visual Studio (Developer Mode must be on; Smart App Control can block local builds).

**2. Node.js gateway:**

```bash
cd Node_Backend
npm install
# create a .env with API_KEY, C_Server_Route, JWT_SECRET, REFRESH_TOKEN_SECRET, CORS_ORIGIN
npm start          # nodemon index.js
```

**3. React frontend:**

```bash
cd Frontend/Sorbus
npm install
npm run dev        # Vite dev server; proxies /api to VITE_API_URL or http://localhost:3000
```

### Key Behaviors & Gotchas

These will save you debugging time:

- **The C++ terminal looks silent.** At startup, all `std::cout` is redirected to `server_output.txt` (append mode). Check that file for route logs — `std::cerr` (startup warnings only) still hits the terminal.
- **Don't change two error strings.** Node returns `"Invalid JWT token."` (401) and `"Access denied: user ID mismatch."` (403). The frontend matches these *exact* strings to trigger logout / redirect. Changing them silently breaks auth UX.
- **Thread-safe storage path.** `FILE_LOCATION` in C++ is guarded by a `shared_mutex` — always use `get_file_location()` / `set_file_location()`, never read it directly.
- **Per-request DB connections.** Every C++ route opens its own connection via `openDB()` (with a 5s busy timeout). Never share a `SQLite::Database` across threads.
- **`storageReady` flag.** When the C++ server reports `initialized: false` (no storage path set), the UI shows a "configure storage" message instead of the file grid. It briefly flashes the grid on first load — a known cosmetic issue.
- **Provider order matters.** In `App.jsx` it must be `AccountProvider > AuthProvider > FileProvider` because `AuthProvider` reads from `AccountProvider`.
- **Module-level access token.** The axios interceptor reads the token from a module-level variable (`getAccessToken()`), not React state, to avoid stale closures.

### Access Control

| Role | Capabilities |
|---|---|
| `owner` | Everything — set storage path, re-scan, manage users (roles & deletion), plus all editor actions. |
| `editor` | Upload, create folders, download, rename, move, delete. |
| `viewer` | Browse the file tree and metadata only — no downloads or modifications. |

The **first signup becomes owner**; everyone else starts as a viewer. The owner promotes users manually. The owner role **cannot** be assigned through the change-access API.

### Containerization Details

| Image | Base | Notes |
|---|---|---|
| `Dockerfile.cpp` | `gcc:14` → `debian:bookworm-slim` | Multi-stage: stage 1 compiles `server.cpp` + all vendored libs; stage 2 ships only the binary. |
| `Dockerfile.node` | `node:lts-alpine` | `npm ci --omit=dev`, runs `node index.js` directly. |
| `Dockerfile.react` | `node:lts-alpine` → `nginx:alpine` | Multi-stage: `vite build`, then nginx serves `dist/`. |

- **nginx** proxies `/api/*` to the Node container. The `nginx.conf.template` uses `${NODE_BACKEND_URL}`, which nginx substitutes at container startup (the template lives in `/etc/nginx/templates/`).
- `client_max_body_size 0` + `proxy_request_buffering off` allow large, unbuffered file streaming.
- The C++ container mounts your files at `/storage` (bind mount) and persists the DB at `/data` (named volume).

---

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for how to fork, branch, and open a pull request. A quick note on code style for the C++ and Node files: **every function gets a one-line comment** describing what it does, and multi-line comment blocks are avoided.

## Reporting Issues

Found a bug? Open a [GitHub issue](../../issues/new/choose) using the bug report template. Include what you were doing, what you expected, what happened, and any relevant logs (the C++ server logs to `server_output.txt`).

For questions, ideas, or general discussion, open a GitHub issue — all communication goes through GitHub.

## License

Released under the [MIT License](LICENSE). © Nour Nada.

## Support the Project

If Sorbus saves you a subscription or just makes your life easier, consider supporting development:

<!-- TODO: replace <your-bmc-link> with your real Buy Me a Coffee link -->
☕ [Buy Me a Coffee](https://www.buymeacoffee.com/&lt;your-bmc-link&gt;)
