# Claude Code Guidelines — Sorbus

## Project Overview

Sorbus is a self-hosted personal cloud storage system. Users run the C++ server and database locally (on a Raspberry Pi or home server) and access it through a Node.js + React frontend hosted online via Cloudflare tunnel.

**Three-tier architecture:**
1. **C++ HTTP server** (`C++_Server/server.cpp`) — RESTful file server using cpp-httplib. Handles all file operations and user management. Stores metadata in SQLite. Runs locally on the host machine with direct filesystem access.
2. **Node.js API gateway** (`Node_Backend/index.js`) — Express 5 gateway between the frontend and C++ server. Handles JWT auth, bcrypt, rate limiting, CORS, and request proxying. Hosted online.
3. **React frontend** (`Frontend/Sorbus/`) — Vite + React 18 SPA. File browser with tree/shelf/ledger views, upload progress, and account management. Served via nginx alongside Node.js.

**Deployment split:**
- Local machine (Pi): C++ server + SQLite (`Docker/docker-compose.local.yml`)
- Cloud server: Node.js + React/nginx (`Docker/docker-compose.cloud.yml`)
- Node.js reaches C++ via Cloudflare tunnel (`C_Server_Route` env var)

---

## Code Style

- Every new function must have a one-line comment describing what it does.
- No multi-line comment blocks.

---

## File Structure

```
C++_Server/
  server.cpp                  — entire C++ server (single file)
  sorbus.db                   — SQLite database (example data committed)
  header_libs/
    httplib.h                 — cpp-httplib (header-only HTTP server)
    json.hpp                  — nlohmann/json (header-only JSON)
    SQLiteCpp/                — SQLiteCpp headers
    src_sqlite/               — SQLiteCpp implementation .cpp files (compiled)
    sqlite3/                  — SQLite3 amalgamation header + .c file (compiled)
    miniz/                    — miniz ZIP library header + .c file (compiled)

Node_Backend/
  index.js                    — entire Node.js gateway (single file)
  package.json

Frontend/Sorbus/src/
  main.jsx                    — axios baseURL setup (VITE_API_URL)
  App.jsx                     — provider tree + JWT interceptors + routes
  context/
    AuthContext.jsx           — login state, token refresh, logout, module-level token var
    AccountContext.jsx        — userId, username, access level, server path
    FileContext.jsx           — file tree, upload queue, storageReady flag
  pages/
    LandingPage.jsx
    Login.jsx
    Signup.jsx
    Home.jsx                  — wraps SideBar + FileView + UploadToast
    Account.jsx               — user management + storage stats + owner admin controls
    UnauthorizedPage.jsx
    RedirectPage.jsx
  components/
    SideBar.jsx               — folder tree, upload modal, storage bar, logout
    FileView.jsx              — main file browser, drag/drop, sort, context menu, batch ops
    ShelfView.jsx             — grid card view of files
    LedgerView.jsx            — table row view of files
    FileItemActions.jsx       — per-item download/rename/delete buttons
    FileContextMenu.jsx       — right-click context menu
    FolderTree.jsx            — recursive expandable folder tree (sidebar + move modal)
    UserAvatar.jsx            — initials avatar component
    UploadToast.jsx           — bottom-right upload progress toast, auto-dismisses after 4s

Docker/
  docker-compose.local.yml    — C++ server only (run on Pi)
  docker-compose.cloud.yml    — Node.js + React (run on cloud server)
  Dockerfile.cpp              — multi-stage: gcc:14 compiles, debian:slim runs
  Dockerfile.node             — node:lts-alpine, production deps only
  Dockerfile.react            — multi-stage: vite build, then nginx:alpine serves
  nginx.conf.template         — nginx config; ${NODE_BACKEND_URL} substituted at startup
  .env.local.example          — template for Pi env variables
  .env.cloud.example          — template for cloud server env variables
  setup.sh                    — generates .env.local + .env.cloud interactively
```

---

## Database Schema (SQLite, WAL mode)

```sql
users       — id, username, email, password (bcrypt hash), access ('owner'|'editor'|'viewer'), created_at
files       — id, user_id, file_name, file_location, file_size, file_extension, uploaded_at
server_info — singleton row (id=1): server_status, register_key, file_location
```

- First signup → `access = 'owner'`. All subsequent signups → `'viewer'`.
- Folders: `file_size = -1`, `file_extension = 'folder'`.
- `file_location`: relative path from `FILE_LOCATION` root, `/` separated. Empty string = root.
- `FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE`
- `sqlite_sequence` — internal SQLite table auto-created by AUTOINCREMENT, do not touch.

---

## C++ Server — Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `FILEAPP_API_KEY` | No | `dev-key-change-me` | Shared secret checked on every request. Prints WARNING if using default but still starts. |
| `FILEAPP_REGISTER_KEY` | **Yes** | — | Written to DB on startup. Server calls `std::exit(1)` if not set. |
| `FILEAPP_FILE_LOCATION` | No | `""` | Storage path. Empty = not configured. Set via Account page after first boot. |
| `FILEAPP_DB_PATH` | No | `sorbus.db` | Path to SQLite database file. |
| `FILEAPP_MAX_FILES` | No | `100000` | Max non-folder files before uploads return 507. |

---

## C++ Server — Critical Behaviors

**Startup sequence (in order):**
`initialize_schema()` → `initialize_register_key()` → `initialize_file_location()` → `initialize_file_count()` → redirect stdout to `server_output.txt` → register routes → `svr.listen()`

**Logging:** All `std::cout` is redirected to `server_output.txt` (append mode) at startup. The terminal appears silent — this is normal. `std::cerr` still goes to terminal (startup warnings only). Check `server_output.txt` for all route logs.

**Database — `openDB()`:** Always open the DB via `openDB()`. Sets `busyTimeout(5000)` to prevent "database is locked" under concurrent httplib threads. Never share a single `SQLite::Database` object across threads — each route handler creates its own. Never use `replace_all` to edit lines inside `openDB()` itself (causes infinite recursion crash).

**Thread safety — `FILE_LOCATION`:** Protected by `shared_mutex`. Always access via `get_file_location()` (shared lock) and `set_file_location()` (unique lock). Never read `FILE_LOCATION` directly.

**`set_error_handler` fix:** Only overwrites the response if `res.body.empty()`. Without this check, cpp-httplib's error handler fires on every ≥400 response and overwrites intentional route errors with a generic 404. Already in place — do not remove the `if (res.body.empty())` guard.

**`build_safe_path()`:** Used by all file routes. Prevents directory traversal by normalizing the path and verifying the result is within `FILE_LOCATION`. Returns false if traversal detected — routes return 400.

**`reinitialize_files()`:** DELETEs all rows from `files`, then walks `FILE_LOCATION` with `recursive_directory_iterator`, re-inserting every file and folder. Throws if `current_file_count > MAX_FILES`. Skips inaccessible files.

**Permission check pattern:**
- Owner-only routes: `SELECT id, access FROM users WHERE id = ?` → access must equal `"owner"`
- Editor+ routes: same query → access must not equal `"viewer"`
- `SELECT *` is only used in the login route (needs the password hash). All other queries use explicit columns.

---

## C++ Server — API Routes

All routes require a `key` header matching `FILEAPP_API_KEY`. Checked in `set_pre_request_handler` before any route runs.

### User Routes

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/user/signup` | key only | Body: `{username, email, password, reg_key}`. First user → owner. Returns `{user_id, username, access}`. |
| GET | `/api/user/login/:username` | key only | Matches username OR email. Returns `{user_id, username, access, password}`. Node.js never forwards `password` to browser. |
| GET | `/api/user/name` | key only | Returns all users as `{ username: { id, email, access } }`. |
| PATCH | `/api/user/change/access/:user_id_main/:user_id_change/:access` | key only | Owner-only. `:access` must be `editor` or `viewer`. Cannot change own access. |
| DELETE | `/api/user/delete/:user_id_main/:user_id_change` | key only | Owner-only. Cannot delete self. Cascades to files. |

### File Routes

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/files/name/:user_id` | key only | Returns `{ tree, fileIds, fileInfo, initialized }`. Returns `initialized: false` with empty maps if `FILE_LOCATION` is empty. |
| GET | `/api/files/download/:file_id/:user_id` | key only | Streams file in 64KB chunks. Folders zipped with miniz to temp file, streamed, then deleted. Editor+ only. |
| GET | `/api/files/storage` | key only | Available bytes on storage partition as plain text. Returns `"0"` if `FILE_LOCATION` empty. |
| GET | `/api/files/filesizes` | key only | `SUM(file_size)` of all files in DB as plain text. |
| POST | `/api/files/upload/:user_id` | key only | Raw body upload. Headers: `file_name`, `file_location`. Null byte check on both. Editor+ only. |
| POST | `/api/files/create/:user_id` | key only | Body: `{new_name, folder_path}`. Editor+ only. |
| PATCH | `/api/files/name/:file_id/:user_id` | key only | Body: `{new_name}`. Cascades `file_location` update to all children if folder. Editor+ only. |
| PATCH | `/api/files/move/:file_id/:user_id` | key only | Body: `{new_location}`. Cascades to children. Editor+ only. |
| DELETE | `/api/files/delete/:file_id/:user_id` | key only | Cascades DB and filesystem for folders. Editor+ only. |

### Feature Routes

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/features/location` | key only | Returns current `FILE_LOCATION` string (may be empty). |
| PATCH | `/api/features/location/:user_id` | key only | Owner-only. Validates path (must be absolute, non-root, existing directory). Calls `reinitialize_files`. |
| PATCH | `/api/features/reinitialize/:user_id` | key only | Owner-only. Calls `reinitialize_files`. |

---

## Node.js Gateway — Environment Variables

| Variable | Required | Description |
|---|---|---|
| `API_KEY` | Yes | Sent as `key` header on every request to C++ server. Must match `FILEAPP_API_KEY`. |
| `C_Server_Route` | Yes | Base URL of C++ server (e.g. `https://cpp.yourdomain.com` via Cloudflare tunnel). |
| `JWT_SECRET` | Yes | Signs 5-minute access tokens. Contains only `{ userId }`. |
| `REFRESH_TOKEN_SECRET` | Yes | Signs 7-day refresh cookies. Contains `{ userId, username, access }`. |
| `CORS_ORIGIN` | Yes | Exact browser origin allowed by CORS (e.g. `https://sorbus.yourdomain.com`). No trailing slash. |
| `PORT` | No | Listen port. Default `3000`. |

---

## Node.js Gateway — Critical Behaviors

**Rate limiters:**
- `limiter`: 100 req / 5 min / IP — applied to all standard routes.
- `downloadLimiter`: 60 req / 5 min / IP — applied to `/api/files/download-stream` only (no JWT, token is the only gate).

**`verifyJWT`:** Reads `Authorization: Bearer <token>`, verifies with `JWT_SECRET`, attaches `req.userId`.
- Missing token → 401 `"Access denied. No token provided."`
- Invalid/expired → 401 `"Invalid JWT token."` ⚠️ **Do not change this string — frontend checks it to trigger logout.**

**`verifyUserId(paramName)`:** Checks `parseInt(req.params[paramName]) !== req.userId`.
- Mismatch → 403 `"Access denied: user ID mismatch."` ⚠️ **Do not change this string — frontend checks it to redirect to `/login`.**

**Download token flow:**
- `downloadTokens` is an in-memory `Map` — not persisted, cleared on restart.
- Token entry: `{ fileId, userId, expires: Date.now() + 60_000 }`. Single-use (deleted on consumption).
- Token generated with `crypto.randomBytes(24).toString('hex')`.
- Browser uses the token URL directly — no JWT header needed, enabling native `<a>` downloads.

**Upload:** Node.js spreads all request headers to C++ and additionally sets `key: API_KEY`, `file_name`, `file_location`. Uses `maxBodyLength: Infinity, maxContentLength: Infinity` — no size limit at the Node.js layer.

**Validation regexes (signup only):**
- `USERNAME_REGEX`: `/^[a-zA-Z0-9_]+$/`
- `EMAIL_REGEX`: `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`
- `PASSWORD_REGEX`: 8+ chars, uppercase, lowercase, digit, special char

---

## Node.js Gateway — Route Summary

| Route | Middleware | Notes |
|---|---|---|
| `GET /` | limiter | Health check, returns plain text confirmation. |
| `POST /api/user/refresh` | limiter | Reads `refreshToken` cookie. Returns `{ jwt_token, user_id, username, access }`. |
| `POST /api/user/logout` | limiter | Clears `refreshToken` cookie. |
| `GET /api/user/verify` | limiter, verifyJWT | Returns 200 OK if token valid. |
| `POST /api/user/signup` | limiter | Validates regexes, bcrypt hashes pw, proxies to C++. Issues access token + refresh cookie. |
| `POST /api/user/login/:username` | limiter | Fetches hash from C++, bcrypt compares. Issues access token + refresh cookie. |
| `GET /api/user/name` | limiter, verifyJWT | Proxies to C++. |
| `PATCH /api/user/change/access/:uid_main/:uid_change/:access` | limiter, verifyJWT, verifyUserId('user_id_main') | |
| `DELETE /api/user/delete/:uid_main/:uid_change` | limiter, verifyJWT, verifyUserId('user_id_main') | |
| `GET /api/files/name/:user_id` | limiter, verifyJWT, verifyUserId() | |
| `GET /api/files/download/:file_id/:user_id` | limiter, verifyJWT, verifyUserId() | JWT-protected direct stream. Used by JS axios layer. |
| `GET /api/files/download-token/:file_id/:user_id` | limiter, verifyJWT, verifyUserId() | Issues 60s single-use token. Returns `{ token }`. |
| `GET /api/files/download-stream/:file_id/:user_id?token=` | downloadLimiter | No JWT. Validates + deletes token, streams file. Used for native browser `<a>` downloads. |
| `GET /api/files/storage` | limiter, verifyJWT | |
| `GET /api/files/filesizes` | limiter, verifyJWT | |
| `POST /api/files/upload/:user_id` | limiter, verifyJWT, verifyUserId() | Streams body, no size limit. |
| `POST /api/files/create/:user_id` | limiter, verifyJWT, verifyUserId() | |
| `PATCH /api/files/name/:file_id/:user_id` | limiter, verifyJWT, verifyUserId() | |
| `PATCH /api/files/move/:file_id/:user_id` | limiter, verifyJWT, verifyUserId() | |
| `DELETE /api/files/delete/:file_id/:user_id` | limiter, verifyJWT, verifyUserId() | |
| `GET /api/features/location` | limiter, verifyJWT | |
| `PATCH /api/features/reinitialize/:user_id` | verifyJWT, verifyUserId(), limiter | Note: limiter is last on these two. |
| `PATCH /api/features/location/:user_id` | verifyJWT, verifyUserId(), limiter | Note: limiter is last on these two. |
| Fallback `app.use` | — | 404 `{ error: 'API route not found' }` |

---

## React — Environment Variables

| Variable | Required | Description |
|---|---|---|
| `VITE_API_URL` | No | Base URL for axios requests. Defaults to `''` (same-origin). Leave empty in Docker — nginx proxies `/api/*` to Node.js internally. Set if React and Node.js are on different domains. |

---

## React — Critical Behaviors

**Provider order** (`App.jsx`) — matters because AuthProvider reads from AccountProvider:
```
AccountProvider > AuthProvider > FileProvider > Routes
```

**Module-level token variable** (`AuthContext.jsx`): `_accessToken` is a module-level `let`, not React state. `getAccessToken()` / `setAccessToken()` expose it. Used by the axios interceptor to avoid stale closures. React state `token` is kept in sync but the interceptor reads the module variable directly.

**`isLoggedIn` states:** `null` = loading (ProtectedRoutes renders nothing, prevents flash), `true` = authenticated, `false` = not authenticated.

**Axios interceptors** (`App.jsx`):
- Request: attaches `Authorization: Bearer <token>` from `getAccessToken()`.
- Response 401 (first): pauses all in-flight requests, calls `POST /api/user/refresh`, retries all with new token. Uses `isRefreshing` flag + `failedQueue` to prevent parallel refresh storms.
- Response 401 (second / refresh fails): `clearSession(401)` → navigates to `/unauthorized`.
- Response 403 `"Access denied: user ID mismatch."`: `clearSession(403)` → navigates to `/login`.

**`storageReady` flag** (`FileContext.jsx`): `false` when C++ returns `initialized: false`. `FileView` renders an "Storage path not configured" message instead of file grid. `storageReady` initializes to `true` causing a brief flash before first `refreshFiles()` resolves — known cosmetic issue.

**File data model** (`FileContext.jsx`):
- `tree`: nested object. Folders are `{}`. Files are their full path string. Example: `{ "photos": { "beach.jpg": "photos/beach.jpg" }, "readme.txt": "readme.txt" }`
- `fileIds`: flat map `fullPath → DB id` for both files and folders.
- `fileInfo`: flat map `fullPath → { size: bytes, isFolder: bool, ext: string }`. `ext` has no leading dot. Folder `size` is `-1` from DB; UI computes folder size recursively from `fileInfo`.

**SideBar logout:** Uses `flushSync(() => logout())` before `navigate('/login')` to prevent a race with ProtectedRoutes re-rendering.

**ProtectedRoutes:** Returns `null` while `isLoggedIn === null` (loading). Redirects to `/unauthorized` if `false`.

---

## Containerization

**C++ Dockerfile** (`Dockerfile.cpp`) — multi-stage. Stage 1: `gcc:14` compiles `server.cpp` with all vendored libraries (`g++ -std=c++17 -O2`). Include paths: `-I header_libs/sqlite3` (for `<sqlite3.h>`) and `-I header_libs` (for `<SQLiteCpp/...>`). Stage 2: `debian:bookworm-slim` — copies only the binary. No compiler or source in final image.

**Node.js Dockerfile** (`Dockerfile.node`) — `node:lts-alpine`. `npm ci --omit=dev` skips nodemon. Runs `node index.js` directly (not `npm start`).

**React Dockerfile** (`Dockerfile.react`) — multi-stage. Stage 1: `node:lts-alpine` runs `vite build`. Stage 2: `nginx:alpine` serves `dist/`. `nginx.conf.template` placed in `/etc/nginx/templates/` — nginx substitutes `${NODE_BACKEND_URL}` automatically at container startup.

**nginx** proxies `/api/*` to `http://node-backend:3000` (internal Docker network). `try_files $uri $uri/ /index.html` supports React Router. `client_max_body_size 0` and `proxy_request_buffering off` allow large file streaming.

**Running:**
```bash
# On the Pi — run setup.sh first to generate .env files
cd Docker && bash setup.sh
docker compose -f docker-compose.local.yml --env-file .env.local up -d

# On the cloud server
docker compose -f docker-compose.cloud.yml --env-file .env.cloud up -d
```

---

## Access Control

| Role | Capabilities |
|---|---|
| `owner` | Everything — storage path, rescan, manage users (role/delete), plus all editor actions |
| `editor` | Upload, create folders, download, rename, move, delete |
| `viewer` | Browse file tree and metadata only — no download, upload, or modifications |

First signup → owner. All subsequent signups → viewer. Owner promotes manually. Owner role cannot be assigned via the change-access API route.
