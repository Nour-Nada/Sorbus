# ── Stage 1: compile ─────────────────────────────────────────────────────────
FROM gcc:14 AS builder
WORKDIR /build

COPY C++_Server/ .

# Compile server + all vendored libraries (SQLiteCpp, SQLite3 amalgamation, miniz)
RUN g++ -std=c++17 -O2 \
    -I header_libs/sqlite3 \
    -I header_libs \
    server.cpp \
    header_libs/sqlite3/sqlite3.c \
    header_libs/miniz/miniz.c \
    header_libs/src_sqlite/Backup.cpp \
    header_libs/src_sqlite/Column.cpp \
    header_libs/src_sqlite/Database.cpp \
    header_libs/src_sqlite/Exception.cpp \
    header_libs/src_sqlite/Savepoint.cpp \
    header_libs/src_sqlite/Statement.cpp \
    header_libs/src_sqlite/Transaction.cpp \
    -lpthread \
    -o sorbus-server

# ── Stage 2: minimal runtime ─────────────────────────────────────────────────
FROM debian:bookworm-slim
WORKDIR /app

COPY --from=builder /build/sorbus-server .

# /storage — bind-mounted from the host (user files)
# /data    — named Docker volume (persists sorbus.db across rebuilds)
RUN mkdir -p /storage /data

EXPOSE 8080
CMD ["./sorbus-server"]
