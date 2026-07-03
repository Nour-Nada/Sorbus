-- SQL reference for the Sorbus SQLite database (sorbus.db)
-- SQLite in WAL mode; schema is created automatically by the C++ server on startup.
-- These queries are provided as a reference for manual inspection and development.


-- ============================================================
-- Schema
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT    NOT NULL UNIQUE,
    email    TEXT    NOT NULL UNIQUE,
    password TEXT    NOT NULL,          -- bcrypt hash, never plaintext
    access   TEXT    NOT NULL,          -- 'owner' | 'editor' | 'viewer'
    created_at TEXT  DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS files (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id        INTEGER NOT NULL,
    file_name      TEXT    NOT NULL,
    file_location  TEXT    NOT NULL,    -- relative path from FILE_LOCATION root, '/' separated; '' = root
    file_size      INTEGER NOT NULL,    -- bytes; -1 for folders
    file_extension TEXT,                -- 'folder' for folders
    uploaded_at    TEXT    DEFAULT (datetime('now')),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS server_info (
    id            INTEGER PRIMARY KEY DEFAULT 1,
    server_status INTEGER NOT NULL,
    register_key  TEXT    NOT NULL,
    file_location TEXT    NOT NULL DEFAULT ''  -- current storage root path
);


-- ============================================================
-- Inspect data
-- ============================================================

SELECT * FROM users;
SELECT * FROM files;
SELECT * FROM server_info;

-- Files with their owner's username
SELECT u.username, f.file_name, f.file_location, f.file_extension, f.file_size, f.id
FROM users u
INNER JOIN files f ON u.id = f.user_id
ORDER BY f.file_location ASC;

-- Files in a specific folder (empty string = root)
SELECT * FROM files WHERE file_location = '';

-- All files owned by a specific user
SELECT * FROM files WHERE user_id = 1;


-- ============================================================
-- Modify data
-- ============================================================

-- Rename a file
UPDATE files SET file_name = 'new_name.txt' WHERE id = 1;

-- Move a file
UPDATE files SET file_location = 'some/subfolder' WHERE id = 1;

-- Change a user's access level
UPDATE users SET access = 'editor' WHERE id = 2;

-- Set the storage root path
UPDATE server_info SET file_location = 'C:/path/to/your/files' WHERE id = 1;

-- Delete a file record (does not remove the file from disk)
DELETE FROM files WHERE id = 1;

-- Delete a user and all their file records (cascade)
DELETE FROM users WHERE id = 2;


-- ============================================================
-- Bootstrap / reset
-- ============================================================

-- Seed the server_info singleton (run once if the row is missing)
INSERT OR IGNORE INTO server_info (id, server_status, register_key, file_location)
VALUES (1, 0, 'your-register-key', '');

-- Clear all file records and re-index from the C++ server
-- (use the /api/features/reinitialize endpoint instead of doing this manually)
DELETE FROM files;
