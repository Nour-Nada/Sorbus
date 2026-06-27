# Optional: running the C++ server in a container

**Most people should NOT use this.** Run the C++ server **natively** instead (see the main `README.md` → "Running the C++ server"). This folder is here only for the narrow case described below.

## Why containerizing the file server is usually the wrong choice

The whole point of Sorbus is to reach **any folder or drive** on your machine from anywhere. A container has its **own isolated filesystem** — it can only ever see what you explicitly mount into it. That isolation directly fights the goal:

- **You can only browse what's mounted.** The server is jailed to the single folder you bind-mount at `/storage`. It cannot reach the rest of your disk — which defeats the "access my whole computer" idea.
- **Hot-plugged drives won't appear.** Mounts are fixed when the container starts. Plug in a USB drive afterwards and the container can't see it until you add a mount and restart.
- **Slower on Windows/macOS.** File access crosses Docker's file-sharing bridge, which is noticeably slower for large or numerous files, and paths look like `/storage/...` instead of `C:\...`.

Running natively avoids all of this: direct, full-speed access to every drive, with the storage path settable to anywhere (bounded only by `FILEAPP_ROOT_LIMIT`).

## When this *is* a reasonable choice

Use this only if you specifically want **everything sandboxed** — i.e. you just want all of Sorbus's files kept inside one containerized folder, with no access to the rest of the host, and you accept the limitations above. In that case the isolation is a feature, not a bug.

## Running it

This mode is self-contained and uses its own `.env.local` (the unprefixed names below — **not** the `FILEAPP_`-prefixed file that `setup.sh` generates for native runs).

```bash
# from this folder
cp .env.example .env.local      # then fill in the values
docker compose -f docker-compose.local.yml --env-file .env.local up -d --build
```

`API_KEY` must match `API_KEY` in your cloud `.env.cloud`. The Cloudflare tunnel should point at the published port (`CPP_PORT`, default 8080).
