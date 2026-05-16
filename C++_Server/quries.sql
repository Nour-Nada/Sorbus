--IMPORTANT SQL QUERIES FOR C++ SERVER APPLICATION--


--Important Notes on the SQL Queries--
--1. These queries are designed to work with a PostgreSQL database.
--2. Replace placeholder values (e.g., '-1', 'new_file_name.txt') with actual values when executing the queries.
--3. More SQL queries may be needed but these are probably some important ones that will need to be used frequently.



--Creating the Database--

CREATE DATABASE sorbus;


--Creating the Tables--

CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    access TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS files (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    file_name TEXT NOT NULL,
    file_location TEXT NOT NULL,
    file_size BIGINT NOT NULL,
    file_extension TEXT,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_files_users
        FOREIGN KEY(user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS server_info (
    id SMALLINT PRIMARY KEY DEFAULT 1,
    server_status INTEGER NOT NULL,
    register_key TEXT NOT NULL,
    storage_space_remaining BIGINT NOT NULL,
    file_location TEXT NOT NULL DEFAULT '',
    CONSTRAINT single_row CHECK (id = 1)
);



--Secleting Data--

--Basic Select Queries--
SELECT * FROM users; --Retrieving all users--
SELECT * FROM files; --Retrieving all files--
SELECT * FROM server_info; --Retrieving server information--

--Table Joins--
SELECT * FROM users INNER JOIN files ON users.id = files.user_id; --Retrieving all users with their files--
SELECT users.id AS user_id, files.file_name, files.file_location, files.file_extension, files.id FROM users INNER JOIN files ON users.id = files.user_id ORDER BY files.file_location ASC; --Retrieving specific file information for all users--

--Conditional Select Queries--
SELECT * FROM files WHERE user_id = -1; --Retrieving all files of particular user--
SELECT * FROM files WHERE file_location = '/example_path'; --Retrieving file by location--



--Updating Data--
UPDATE files SET file_name = 'new_file_name.txt' WHERE id = -1; --Updating file name of particular file--
UPDATE files SET file_location = '/new/location/' WHERE id = -1; --Updating file location of particular file--
UPDATE server_info SET storage_space_remaining = -1 WHERE id = -1; --Updating storage space remaining--
UPDATE server_info SET server_status = -1 WHERE id = -1; --Updating server status--


--Deleting Data--
DELETE FROM files WHERE id = -1; --Deleting particular file--
DELETE FROM users WHERE id = -1; --Deleting particular user and all their files--
DELETE FROM files WHERE file_location = '/example_path'; --Deleting file by location--


--Inserting Data--
INSERT INTO users (email, password) VALUES ('test', 'password123'); --Inserting new user--
INSERT INTO files (user_id, file_name, file_location, file_size, file_extension) VALUES (-1, 'example.txt', '/example_path', 1024, '.txt'); --Inserting new file--
INSERT INTO server_info (server_status, register_key, storage_space_remaining, file_location) VALUES (-1, 'regkey123', 1000, 'C:/Users/nour2/Videos/Test'); --Inserting server information--


--Inserting Data Tests--
INSERT INTO users (email, username, password, access) VALUES ('test', 'testuser', 'password123', 'owner'); --Inserting new user--