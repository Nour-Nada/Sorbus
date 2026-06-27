# ── Stage 1: compile ─────────────────────────────────────────────────────────
FROM gcc:14 AS builder
WORKDIR /build

COPY C++_Server/ .

# Compile the C libraries (SQLite3 amalgamation + miniz) with gcc — they rely on
# implicit void* conversions that g++ rejects when it treats .c files as C++.
RUN gcc -O2 -I header_libs/sqlite3 -c header_libs/sqlite3/sqlite3.c -o sqlite3.o \
 && gcc -O2 -c header_libs/miniz/miniz.c -o miniz.o

# Compile the server + SQLiteCpp (C++) and link against the C objects above
RUN g++ -std=c++17 -O2 \
    -I header_libs/sqlite3 \
    -I header_libs \
    server.cpp \
    header_libs/src_sqlite/Backup.cpp \
    header_libs/src_sqlite/Column.cpp \
    header_libs/src_sqlite/Database.cpp \
    header_libs/src_sqlite/Exception.cpp \
    header_libs/src_sqlite/Savepoint.cpp \
    header_libs/src_sqlite/Statement.cpp \
    header_libs/src_sqlite/Transaction.cpp \
    sqlite3.o miniz.o \
    -lpthread -ldl -lm \
    -o sorbus-server

# ── Stage 2: minimal runtime ─────────────────────────────────────────────────
# Must match the builder's Debian release (gcc:14 = trixie) so glibc/libstdc++ versions line up
FROM debian:trixie-slim
WORKDIR /app

COPY --from=builder /build/sorbus-server .

# /storage — bind-mounted from the host (user files)
# /data    — named Docker volume (persists sorbus.db across rebuilds)
RUN mkdir -p /storage /data

EXPOSE 8080
CMD ["./sorbus-server"]
