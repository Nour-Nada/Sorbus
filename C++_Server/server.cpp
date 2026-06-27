// ============================================================
//   ___  ___  ____  ____  _   _  ___
//  / __)/ _ \(  _ \(  _ )/ ) ( \/ __)
//  \__ \ (_) ))   / ) _ (\ \/ / \__ \
//  (___/\___/(_)\_)(____/ \__/  (___/
//
// Self-Hosted Personal Cloud Storage — MIT License
// ============================================================
//Default Headers
#include <iostream>
#include <string>
#include <fstream>
#include <filesystem>
#include <stdio.h>
#include <sstream>
#include <chrono>
#include <ctime>
#include <iomanip>
#include <atomic>
#include <shared_mutex>
#include <cstdlib>

//Downloaded header libraries
#include "header_libs/SQLiteCpp/SQLiteCpp.h" //https://github.com/SRombauts/SQLiteCpp/tree/master
#include "header_libs/httplib.h" //https://github.com/yhirose/cpp-httplib?tab=readme-ov-file
#include "header_libs/json.hpp" //https://github.com/nlohmann/json/tree/develop
#include "header_libs/miniz/miniz.h" //https://github.com/richgel999/miniz

//Created headers
// ...

//Namespaces
namespace fs = std::filesystem;


#define PORT 8080 //Server Port

// HTTP
httplib::Server svr;

//Global Variables
const std::string API_KEY = []() {
    const char* value = std::getenv("FILEAPP_API_KEY");
    return (value && *value) ? std::string(value) : "";
}(); //The API key — set via the FILEAPP_API_KEY env var; empty if not set (no default)
const std::string OUTPUT_FILE = "server_output.txt"; //Where the print statements, errors, and more gets outputted to in deployment

std::shared_mutex FILE_LOCATION_MUTEX; //Mutex to protect the file location string from concurrent read/write access across threads
std::string FILE_LOCATION = []() {
    const char* value = std::getenv("FILEAPP_FILE_LOCATION");
    return (value && *value) ? std::string(value) : "";
}(); //The location of the stored files — set via FILEAPP_FILE_LOCATION env var or through the Account page

std::string get_file_location() { // Reads the file location safely across threads
    std::shared_lock lock(FILE_LOCATION_MUTEX);
    return FILE_LOCATION;
}

void set_file_location(const std::string& new_location) { // Updates the file location safely across threads
    std::unique_lock lock(FILE_LOCATION_MUTEX);
    FILE_LOCATION = new_location;
}

const int MAX_FILES = []() { //Maximum number of files allowed in the storage location this is to prevent the server from crashing
    const char* value = std::getenv("FILEAPP_MAX_FILES");
    return (value && *value) ? std::stoi(value) : 1000000;
}(); //The maximum number of files allowed in the storage location

//Database File Path
const std::string DB_FILE_PATH = []() {
    const char* value = std::getenv("FILEAPP_DB_PATH");
    return (value && *value) ? std::string(value) : "sorbus.db";
}();

SQLite::Database openDB() { //Opens the database with a 5s busy timeout to handle concurrent requests
    SQLite::Database db(DB_FILE_PATH, SQLite::OPEN_READWRITE);
    db.setBusyTimeout(5000);
    return db;
}


std::atomic<int> api_traffic_count{ 0 }; //Counts how many API calls are made to valid endpoints while the server is still open
std::atomic<int> current_file_count{ 0 }; //Tracks the current number of non-folder files stored across all users, initialized from the database on startup

void initialize_file_location() { //Loads the file storage location from the database on startup, overriding the env/hardcoded default
    try {
        SQLite::Database db = openDB();
        SQLite::Statement stmt(db, "SELECT file_location FROM server_info WHERE id = 1");
        if (stmt.executeStep() && !stmt.isColumnNull(0)) {
            std::string db_location = stmt.getColumn(0).getText();
            if (!db_location.empty()) {
                set_file_location(db_location);
            }
        }
    } catch (const std::exception& e) {
        std::cerr << "Failed to initialize file location: " << e.what() << std::endl;
    }
}

void initialize_register_key() { //Reads FILEAPP_REGISTER_KEY env var and writes it to the database — exits if not set
    const char* reg_key = std::getenv("FILEAPP_REGISTER_KEY");
    if (!reg_key || !*reg_key) {
        std::cerr << "FATAL: FILEAPP_REGISTER_KEY environment variable is not set. Server will not start." << std::endl;
        std::exit(1);
    }
    try {
        SQLite::Database db = openDB();
        SQLite::Statement stmt(db, "UPDATE server_info SET register_key = ? WHERE id = 1");
        stmt.bind(1, reg_key);
        stmt.exec();
    } catch (const std::exception& e) {
        std::cerr << "Failed to set register key: " << e.what() << std::endl;
        std::exit(1);
    }
}

void initialize_file_count() { //Sets current_file_count to the number of files in the database excluding folders
    try {
        SQLite::Database db = openDB();
        SQLite::Statement stmt(db, "SELECT COUNT(*) FROM files WHERE file_extension != 'folder'");
        if (stmt.executeStep()) {
            current_file_count.store(stmt.getColumn(0).getInt(), std::memory_order_relaxed);
        }
    } catch (const std::exception& e) {
        std::cerr << "Failed to initialize file count: " << e.what() << std::endl;
    }
}

void initialize_schema() { //Creates SQLite tables and seeds server_info on first run
    SQLite::Database db(DB_FILE_PATH, SQLite::OPEN_READWRITE | SQLite::OPEN_CREATE);
    db.exec("PRAGMA journal_mode=WAL");
    db.exec("PRAGMA foreign_keys=ON");
    db.exec(
        "CREATE TABLE IF NOT EXISTS users ("
        "  id INTEGER PRIMARY KEY AUTOINCREMENT,"
        "  username TEXT NOT NULL UNIQUE,"
        "  email TEXT NOT NULL UNIQUE,"
        "  password TEXT NOT NULL,"
        "  access TEXT NOT NULL DEFAULT 'viewer',"
        "  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP"
        ")"
    );
    db.exec(
        "CREATE TABLE IF NOT EXISTS files ("
        "  id INTEGER PRIMARY KEY AUTOINCREMENT,"
        "  user_id INTEGER NOT NULL,"
        "  file_name TEXT NOT NULL,"
        "  file_location TEXT NOT NULL,"
        "  file_size INTEGER NOT NULL,"
        "  file_extension TEXT,"
        "  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,"
        "  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE"
        ")"
    );
    db.exec(
        "CREATE TABLE IF NOT EXISTS server_info ("
        "  id INTEGER PRIMARY KEY CHECK(id = 1),"
        "  server_status INTEGER NOT NULL DEFAULT 0,"
        "  register_key TEXT NOT NULL,"
        "  file_location TEXT NOT NULL DEFAULT ''"
        ")"
    );
    db.exec("INSERT OR IGNORE INTO server_info (id, server_status, register_key, file_location) VALUES (1, 0, 'changeme', '')");
    db.exec("CREATE INDEX IF NOT EXISTS idx_files_location ON files(file_location)");
    db.exec("CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)");
    db.exec("CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)");
}

//Global String Errors
const std::string BAD_DB_CONNECTION = "Cannot Connect to Database;";
const std::string NO_HEADER = "There is no Header Attached with this Request.";
const std::string INCORRECT_API_KEY = "Incorrect API Key.";
const std::string DB_QUERY_ERROR = "An Error Occurred in Querying the Database;";
const std::string BAD_PARAMETER = "An Incorrect Parameter was Passed In;";
const std::string UNABLE_TO_RENAME = "The System was Unable to Rename This File;";
const std::string UNABLE_TO_MOVE = "The System was Unable to Move This File;";
const std::string UNABLE_TO_DELETE = "The System was Unable to Delete This File;";
const std::string UNFOUND_FILE_PATH = "The System was Unable to Find This File Path;";
const std::string UNABLE_TO_CREATE_FOLDER = "The System was Unable to Create a Folder;";
const std::string UNOPEN_FILE = "The File Was Not Opened;";
const std::string UNABLE_TO_UPLOAD_FILE = "The File Was Not Uploaded as it is a Duplicate;";
const std::string DUPLICATE_FILE_NAME = "A File With This Name Already Exists in This Location;";
const std::string DUPLICATE_USER = "A User With This Username or Email Already Exists;";
const std::string TOO_MANY_FILES = "The Maximum Number of Files Has Been Reached;";
const std::string MISSING_BODY_PARAM = "The Information Sent is Missing Something;";
const std::string ACCESS_DENIED = "Access Denied: Insufficient Permissions;";

//Global String Success
const std::string GOOD_DB_CONNECTION = "Connected to SQLite Database; API Path ";
const std::string GOOD_QUERY = "Successfully Queried the Database; API Path ";

//Global helper functions
#define LOG_TIME() std::cout << std::endl << "[" << get_time_stamp() << "] " << std::endl; // Logs the time the API was called
#define LOG_CALL() api_traffic_count.fetch_add(1, std::memory_order_relaxed); // Logs that an API endpoint was hit allowing us to keep track of the traffic

static std::string trim_leading_separators(std::string path) { //Removes the leading slashes for a folder trail as it may cause issues with C++ 17 filesystem features
    while (!path.empty() && (path.front() == '/' || path.front() == '\\')) {
        path.erase(path.begin());
    }
    return path;
}

static bool is_path_within_base(const fs::path& base, const fs::path& target) { // Just checks to path's against each other to ensure that target is within the base path passed in
    //Normalizes the paths
    const auto base_norm = fs::absolute(base).lexically_normal();
    const auto target_norm = fs::absolute(target).lexically_normal();

    //Sets b and t to the first part of the path
    auto b = base_norm.begin();
    auto t = target_norm.begin();
    for (; b != base_norm.end() && t != target_norm.end(); ++b, ++t) { //Traverse the paths until the base ends, or the target ends
        if (*b != *t) {
            return false;
        }
    }
    return b == base_norm.end(); //Even if it passes the for loop if b is not equal to the end of the base path then we know that target is not in it
}

static bool build_safe_path(const std::string& location, const std::string& leaf_name, fs::path& out_path) {  //Creates a safe path when given the file_location and file_name. And accordingly chanes out_path to match this (a safe path is necessary for the C++ 17 filesystem library features)
    const fs::path base(get_file_location());
    fs::path candidate = base / trim_leading_separators(location);
    if (!leaf_name.empty()) {
        candidate /= leaf_name;
    }
    candidate = candidate.lexically_normal(); //Now a safe path to the file is created in candidate

    if (!is_path_within_base(base, candidate)) { //A safety check to make sure that candidate is within base
        return false;
    }

    out_path = fs::absolute(candidate); //Sets out_path to the absolute version of candidate
    return true;
}

std::string get_time_stamp() { //Gets timestamp in format YYYY-MM-DD HH:MM:SS
    // Get current time
    auto now = std::chrono::system_clock::now();
    std::time_t now_time = std::chrono::system_clock::to_time_t(now);

    // Convert to local time
    std::tm local_tm;
    #if defined(_WIN32) || defined(_WIN64)
        localtime_s(&local_tm, &now_time);  // Windows-safe version
    #else
        localtime_r(&now_time, &local_tm);  // POSIX-safe version
    #endif

    // Format timestamp: YYYY-MM-DD HH:MM:SS
    std::ostringstream oss;
    oss << std::put_time(&local_tm, "%Y-%m-%d %H:%M:%S");
    return oss.str();
}

void reinitialize_files(SQLite::Database &db, int user_id) { //Reinitializes the files in the database to match the local files

    db.exec("DELETE FROM files");

    fs::path base(get_file_location());
    current_file_count = 0;

    SQLite::Statement insert(db, "INSERT INTO files (user_id, file_name, file_location, file_size, file_extension) VALUES (?, ?, ?, ?, ?)");

    for (auto const& dir_entry : fs::recursive_directory_iterator{ base, fs::directory_options::skip_permission_denied }) { //The for loop to go through every file in the base file path
        if (current_file_count > MAX_FILES) { //Checks to make sure we have not surpassed the maximum amount of files allowed
            throw std::runtime_error("Hit Maximum File Load Count");
        }

        try {
            std::string file_name;
            std::string file_location;
            long long file_size = 0;
            std::string file_extension;

            if (fs::is_directory(dir_entry)) {
                file_size = -1;
                file_extension = "folder";
            }
            else {
                file_extension = dir_entry.path().extension().string();
                file_size = static_cast<long long>(fs::file_size(dir_entry));
            }
            file_name = dir_entry.path().filename().string();
            file_location = fs::relative(dir_entry.path(), base).parent_path().generic_string();

            insert.bind(1, user_id);
            insert.bind(2, file_name);
            insert.bind(3, file_location);
            insert.bind(4, static_cast<int64_t>(file_size));
            insert.bind(5, file_extension);
            insert.exec();
            insert.reset(); //Reset so the statement can be reused for the next file

            ++current_file_count;
        }
        catch (const std::exception& e) {
            std::cout << "Skipping file (inaccessible): " << dir_entry.path().string() << " - " << e.what() << std::endl;
        }
    }
}



int main(void)
{
    if (API_KEY.empty()) {
        std::cerr << "WARNING: FILEAPP_API_KEY is not set — all requests will be rejected. Set it via your .env file.\n";
    }

    initialize_schema();         //Creates SQLite tables on first run, safe to call every startup
    initialize_register_key();   //Writes FILEAPP_REGISTER_KEY env var into the database if set
    initialize_file_location();  //Loads the file storage location from the database before accepting requests
    initialize_file_count();     //Loads the current file count from the database before the server starts accepting requests

    //Opens up the file to which the output will be redirected
    std::ofstream logFile(OUTPUT_FILE, std::ios::app);
    if (!logFile.is_open()) {
        std::cerr << "Failed to open log file!" << std::endl;
        return 1;
    }
    //Redirects output of cout to the file
    std::streambuf* coutBuf = std::cout.rdbuf();  // save original buffer
    std::cout.rdbuf(logFile.rdbuf()); //changes original buffer

    svr.set_pre_request_handler([&](const httplib::Request& req, httplib::Response& res) { //Does the api key check logic before even allowing any routes to  be hit
            LOG_TIME();

            std::string API_PATH = req.path;

            // Require API key
            if (!req.has_header("key")) {
                res.status = 400;
                res.set_content(NO_HEADER, "text/plain");
                return httplib::Server::HandlerResponse::Handled;
            }
            else if (req.get_header_value("key") != API_KEY) {
                res.status = 401;
                std::cout << INCORRECT_API_KEY << API_PATH << std::endl;
                res.set_content(INCORRECT_API_KEY, "text/plain");
                return httplib::Server::HandlerResponse::Handled;
            }

            /*if (req.matched_route == "/api/...") {
                return httplib::Server::HandlerResponse::Unhandled;
            }
            //I can uncomment this is I want specific logic for a specific path*/

            return httplib::Server::HandlerResponse::Unhandled; //Allows the other routes to be run if the above checks run
        }
    );

    try {



        // User Routes


        svr.Post("/api/user/signup", [&](const httplib::Request& req, httplib::Response& res) { //Signing up a user
            LOG_CALL();
            std::string API_PATH = "GET: /api/user/signup";
            std::string key = req.get_header_value("key");

            nlohmann::json body;
            try {
                body = nlohmann::json::parse(req.body);
            }
            catch (const std::exception& e) {
                res.status = 400;
                std::cout << e.what() << std::endl;
                res.set_content("Invalid JSON body", "text/plain");
                return;
            }

            if (!body.contains("username")) {
                res.status = 400;
                std::cout << MISSING_BODY_PARAM << API_PATH << std::endl;
                res.set_content("Missing Username in Body", "text/plain");
                return;
            }
            if (!body.contains("email")) {
                res.status = 400;
                std::cout << MISSING_BODY_PARAM << API_PATH << std::endl;
                res.set_content("Missing Email in Body", "text/plain");
                return;
            }
            if (!body.contains("password")) {
                res.status = 400;
                std::cout << MISSING_BODY_PARAM << API_PATH << std::endl;
                res.set_content("Missing Password in Body", "text/plain");
                return;
            }
            if (!body.contains("reg_key")) {
                res.status = 400;
                std::cout << MISSING_BODY_PARAM << API_PATH << std::endl;
                res.set_content("Missing registration key in Body", "text/plain");
                return;
            }

            std::string username = body["username"].get<std::string>();
            std::string email = body["email"].get<std::string>();
            std::string password = body["password"].get<std::string>();
            std::string reg_key = body["reg_key"].get<std::string>();

            try {
                SQLite::Database DB_Connection = openDB();
                std::cout << GOOD_DB_CONNECTION << API_PATH << std::endl;
                SQLite::Transaction DB_Open_Connection(DB_Connection);

                SQLite::Statement key_check(DB_Connection, "SELECT register_key FROM server_info WHERE id = 1");
                key_check.executeStep();
                if (std::string(key_check.getColumn(0).getText()) != reg_key) {
                    res.status = 401;
                    std::cout << "The Registration Key is Incorrect;" << API_PATH << std::endl;
                    res.set_content("Registration key is incorrect", "text/plain");
                    return;
                }

                SQLite::Statement dupCheck(DB_Connection, "SELECT 1 FROM users WHERE username = ? OR email = ? LIMIT 1");
                dupCheck.bind(1, username);
                dupCheck.bind(2, email);
                if (dupCheck.executeStep()) { //Checks if a user with the same username or email already exists
                    res.status = 409;
                    std::cout << DUPLICATE_USER << API_PATH << std::endl;
                    res.set_content(DUPLICATE_USER, "text/plain");
                    DB_Open_Connection.commit();
                    return;
                }

                SQLite::Statement emptyCheck(DB_Connection, "SELECT 1 FROM users LIMIT 1");
                std::string access = emptyCheck.executeStep() ? "viewer" : "owner"; //First user becomes owner, all subsequent users are viewers

                SQLite::Statement insertUser(DB_Connection, "INSERT INTO users (username, email, password, access) VALUES (?, ?, ?, ?)");
                insertUser.bind(1, username);
                insertUser.bind(2, email);
                insertUser.bind(3, password);
                insertUser.bind(4, access);
                insertUser.exec();

                SQLite::Statement result(DB_Connection, "SELECT id, username, access FROM users WHERE username = ? OR email = ?");
                result.bind(1, username);
                result.bind(2, email);
                result.executeStep();

                nlohmann::json response;
                response["user_id"] = result.getColumn("id").getInt();
                response["username"] = result.getColumn("username").getText();
                response["access"] = result.getColumn("access").getText();

                DB_Open_Connection.commit();

                res.status = 200;
                res.set_content(response.dump(), "application/json"); //API response
            }
            catch (const std::exception& e) {
                res.status = 500;
                std::cout << e.what() << std::endl;
                res.set_content(DB_QUERY_ERROR, "text/plain"); //Sends back error to Node.js backend
            }

            return;
        });

        svr.Get("/api/user/login/:username", [&](const httplib::Request& req, httplib::Response& res) { //Returns the hashed password for comparison
            LOG_CALL();

            std::string API_PATH = "GET: /api/login";
            std::string username = req.path_params.at("username");

            nlohmann::json response;
            try {
                SQLite::Database DB_Connection = openDB();
                std::cout << GOOD_DB_CONNECTION << API_PATH << std::endl;

                SQLite::Statement result(DB_Connection, "SELECT * FROM users WHERE username = ? OR email = ?");
                result.bind(1, username);
                result.bind(2, username);

                if (!result.executeStep()) {
                    res.status = 401;
                    res.set_content("User Does Not Exist", "text/plain"); //API response
                    return;
                }

                response["user_id"] = result.getColumn("id").getInt();
                response["username"] = result.getColumn("username").getText();
                response["access"] = result.getColumn("access").getText();
                response["password"] = result.getColumn("password").getText();
                res.status = 200;
                res.set_content(response.dump(), "application/json"); //API response
            }
            catch (const std::exception& e) {
                res.status = 500;
                std::cout << e.what() << std::endl;
                res.set_content(DB_QUERY_ERROR, "text/plain"); //Sends back error to Node.js backend
            }

            return;
        });

        svr.Get("/api/user/name", [&](const httplib::Request& req, httplib::Response& res) { //Retrieving user names
            LOG_CALL();
            std::string API_PATH = "GET: /api/user/name"; //Path in variable for error messages

            try {
                SQLite::Database DB_Connection = openDB();
                std::cout << GOOD_DB_CONNECTION << API_PATH << std::endl;

                SQLite::Statement result(DB_Connection, "SELECT id, username, email, access FROM users");
                nlohmann::json tree = nlohmann::json::object(); //Creates JSON object

                while (result.executeStep()) { //Adds each user
                    std::string uname = result.getColumn("username").getText();
                    int id = result.getColumn("id").getInt();
                    std::string email = result.getColumn("email").getText();
                    std::string access = result.getColumn("access").getText();

                    nlohmann::json userObj;
                    userObj["id"] = id;
                    userObj["email"] = email;
                    userObj["access"] = access;
                    tree[uname] = userObj;
                }

                res.status = 200;
                res.set_content(tree.dump(), "application/json"); //API response
            }
            catch (const std::exception& e) {
                res.status = 500;
                std::cout << e.what() << std::endl;
                res.set_content(DB_QUERY_ERROR, "text/plain"); //Sends back error to Node.js backend
            }
            return;
        });

        svr.Patch("/api/user/change/access/:user_id_main/:user_id_change/:access", [](const httplib::Request& req, httplib::Response& res) { //Updating user permissions
            LOG_CALL();
            std::string API_PATH = "PATCH: /api/user/change/access";
            std::string user_id_main = req.path_params.at("user_id_main");
            std::string user_id_change = req.path_params.at("user_id_change");
            std::string access = req.path_params.at("access");

            if (access != "viewer" && access != "editor") { //checks to make sure access is not set as owner as the owner can't be changed
                res.status = 400;
                std::cout << BAD_PARAMETER << API_PATH << std::endl;
                res.set_content(BAD_PARAMETER, "text/plain");
                return;
            }

            int user_id_main_int = 0;
            int user_id_change_int = 0;
            try {
                user_id_main_int = std::stoi(user_id_main);
            }
            catch (const std::invalid_argument& e) {
                res.status = 400;
                std::cout << e.what() << std::endl;
                res.set_content(BAD_PARAMETER, "text/plain");
                return;
            }

            try {
                user_id_change_int = std::stoi(user_id_change);
            }
            catch (const std::invalid_argument& e) {
                res.status = 400;
                std::cout << e.what() << std::endl;
                res.set_content(BAD_PARAMETER, "text/plain");
                return;
            }

            if (user_id_main_int == user_id_change_int) { //checks the owner user is not changing his own status
                res.status = 400;
                std::cout << "Can't Change Your Own Access;" << API_PATH << std::endl;
                res.set_content("Can't Change Your Own Access", "text/plain");
                return;
            }

            try {
                SQLite::Database DB_Connection = openDB();
                std::cout << GOOD_DB_CONNECTION << API_PATH << std::endl;
                SQLite::Transaction DB_Open_Connection(DB_Connection);

                SQLite::Statement user_check(DB_Connection, "SELECT id, access FROM users WHERE id = ?");
                user_check.bind(1, user_id_main_int);
                if (!user_check.executeStep() || std::string(user_check.getColumn("access").getText()) != "owner") { //Checks permissions
                    res.status = 403;
                    std::cout << ACCESS_DENIED << API_PATH << std::endl;
                    res.set_content(ACCESS_DENIED, "text/plain");
                    return;
                }

                SQLite::Statement user_exists(DB_Connection, "SELECT id, access FROM users WHERE id = ?");
                user_exists.bind(1, user_id_change_int); //selects the user whose value we want to change
                if (!user_exists.executeStep()) { //Checks to ensure the user exists
                    throw std::runtime_error(DB_QUERY_ERROR);
                }

                SQLite::Statement update(DB_Connection, "UPDATE users SET access = ? WHERE id = ?");
                update.bind(1, access);
                update.bind(2, user_id_change_int);
                update.exec();

                DB_Open_Connection.commit();

                res.status = 200;
                res.set_content("User Permissions Successfully Changed", "text/plain"); //API response
            }
            catch (const std::exception& e) {
                res.status = 500;
                std::cout << e.what() << std::endl;
                res.set_content(DB_QUERY_ERROR, "text/plain"); //Sends back error to Node.js backend
            }

            return;
        });

        svr.Delete("/api/user/delete/:user_id_main/:user_id_change", [](const httplib::Request& req, httplib::Response& res) { //Deletes a file
            std::string API_PATH = "DELETE: /api/user/delete";
            std::string user_id_main = req.path_params.at("user_id_main");
            std::string user_id_change = req.path_params.at("user_id_change");

            int user_id_main_int = 0;
            int user_id_change_int = 0;
            try {
                user_id_main_int = std::stoi(user_id_main);
            }
            catch (const std::invalid_argument& e) {
                res.status = 400;
                std::cout << e.what() << std::endl;
                res.set_content(BAD_PARAMETER, "text/plain");
                return;
            }

            try {
                user_id_change_int = std::stoi(user_id_change);
            }
            catch (const std::invalid_argument& e) {
                res.status = 400;
                std::cout << e.what() << std::endl;
                res.set_content(BAD_PARAMETER, "text/plain");
                return;
            }

            if (user_id_main_int == user_id_change_int) { //checks the owner user is not changing his own status
                res.status = 400;
                std::cout << "Can't Change Your Own Access;" << API_PATH << std::endl;
                res.set_content("Can't Change Your Own Access", "text/plain");
                return;
            }

            try {
                SQLite::Database DB_Connection = openDB();
                std::cout << GOOD_DB_CONNECTION << API_PATH << std::endl;
                SQLite::Transaction DB_Open_Connection(DB_Connection);

                SQLite::Statement user_check(DB_Connection, "SELECT id, access FROM users WHERE id = ?");
                user_check.bind(1, user_id_main_int);
                if (!user_check.executeStep() || std::string(user_check.getColumn("access").getText()) != "owner") { //Checks permissions
                    res.status = 403;
                    std::cout << ACCESS_DENIED << API_PATH << std::endl;
                    res.set_content(ACCESS_DENIED, "text/plain");
                    return;
                }

                SQLite::Statement user_exists(DB_Connection, "SELECT id, access FROM users WHERE id = ?");
                user_exists.bind(1, user_id_change_int); //selects the user we want to delete
                if (!user_exists.executeStep()) { //Checks to ensure the user exists
                    throw std::runtime_error(DB_QUERY_ERROR);
                }

                SQLite::Statement del(DB_Connection, "DELETE FROM users WHERE id = ?");
                del.bind(1, user_id_change_int);
                del.exec();

                DB_Open_Connection.commit();
            }
            catch (const std::exception& e) {
                res.status = 500;
                std::cout << e.what() << std::endl;
                res.set_content(DB_QUERY_ERROR, "text/plain"); //Sends back error to Node.js backend
                return;
            }

            res.status = 200;
            res.set_content("User Successfully Deleted", "text/plain"); //API response

            return;
        });



        // Basic Functionality Routes


        // Get Routes

        svr.Get("/api/files/name/:user_id", [&](const httplib::Request& req, httplib::Response& res) { //Retrieves direct children of a folder; ?folder= param is the path (empty = root)
            LOG_CALL();
            std::string API_PATH = "GET: /api/files/name";
            std::string user_id = req.path_params.at("user_id");

            try {
                std::stoi(user_id); //Validates user_id is numeric; Node.js already checks JWT ownership
            } catch (const std::invalid_argument& e) {
                res.status = 400;
                res.set_content(BAD_PARAMETER, "text/plain");
                return;
            }

            if (get_file_location().empty()) {
                res.status = 200;
                res.set_content(nlohmann::json{{"items", nlohmann::json::array()}, {"initialized", false}}.dump(), "application/json");
                return;
            }

            std::string folder = req.get_param_value("folder"); //Empty string = root

            try {
                SQLite::Database DB_Connection = openDB();
                std::cout << GOOD_DB_CONNECTION << API_PATH << std::endl;

                SQLite::Statement result(DB_Connection, "SELECT id, file_name, file_size, file_extension FROM files WHERE file_location = ? ORDER BY CASE WHEN file_extension = 'folder' THEN 0 ELSE 1 END, file_name ASC");
                result.bind(1, folder);

                nlohmann::json items = nlohmann::json::array();
                while (result.executeStep()) {
                    std::string name = result.getColumn("file_name").getText();
                    std::string type = result.getColumn("file_extension").getText();
                    int id = result.getColumn("id").getInt();
                    long long size = result.getColumn("file_size").getInt64();
                    bool is_folder = (type == "folder");
                    std::string ext = is_folder ? "" : (type.length() > 0 && type[0] == '.' ? type.substr(1) : type);
                    items.push_back({{"id", id}, {"name", name}, {"isFolder", is_folder}, {"size", size}, {"ext", ext}});
                }

                res.status = 200;
                res.set_content(nlohmann::json{{"items", items}, {"initialized", true}}.dump(), "application/json");
                std::cout << GOOD_QUERY << API_PATH << std::endl;
            }
            catch (const std::exception& e) {
                res.status = 500;
                std::cout << e.what() << std::endl;
                res.set_content(DB_QUERY_ERROR, "text/plain");
            }
            return;
        });

        svr.Get("/api/files/download/:file_id/:user_id", [](const httplib::Request& req, httplib::Response& res) { //Downloading a file or folder
            LOG_CALL();
            std::string API_PATH = "GET: /api/files/download";
            std::string file_id = req.path_params.at("file_id");
            std::string user_id = req.path_params.at("user_id");

            int file_id_int = 0;
            int user_id_int = 0;
            try {
                file_id_int = std::stoi(file_id);
            }
            catch (const std::invalid_argument& e) {
                res.status = 400;
                std::cout << e.what() << std::endl;
                res.set_content(BAD_PARAMETER, "text/plain");
                return;
            }
            try {
                user_id_int = std::stoi(user_id);
            }
            catch (const std::invalid_argument& e) {
                res.status = 400;
                std::cout << e.what() << std::endl;
                res.set_content(BAD_PARAMETER, "text/plain");
                return;
            }

            std::string file_location;
            std::string file_name;
            std::string type;
            try {
                SQLite::Database DB_Connection = openDB();
                std::cout << GOOD_DB_CONNECTION << API_PATH << std::endl;

                SQLite::Statement user_check(DB_Connection, "SELECT id, access FROM users WHERE id = ?");
                user_check.bind(1, user_id_int);
                if (!user_check.executeStep() || std::string(user_check.getColumn("access").getText()) == "viewer") { //Checks permissions
                    res.status = 403;
                    std::cout << ACCESS_DENIED << API_PATH << std::endl;
                    res.set_content(ACCESS_DENIED, "text/plain");
                    return;
                }

                SQLite::Statement fileResult(DB_Connection, "SELECT * FROM files WHERE id = ?"); //Returns the file that the user wants to download
                fileResult.bind(1, file_id_int);
                if (!fileResult.executeStep()) {
                    throw std::runtime_error(DB_QUERY_ERROR);
                }
                //Extracts the necessary information for sending the file for download from the user
                file_location = fileResult.getColumn("file_location").getText();
                file_name = fileResult.getColumn("file_name").getText();
                type = fileResult.getColumn("file_extension").getText();
            }
            catch (const std::exception& e) {
                res.status = 500;
                std::cout << e.what() << std::endl;
                res.set_content(DB_QUERY_ERROR, "text/plain"); //Sends back error to Node.js backend
                return;
            }

            if (file_location == "/") {
                file_location = "";
            }

            fs::path safe_file_path;
            if (!build_safe_path(file_location, file_name, safe_file_path)) {
                res.status = 400;
                res.set_content(BAD_PARAMETER, "text/plain");
                return;
            }
            std::string file_path = safe_file_path.string();
            auto temp_zip_to_cleanup = std::make_shared<fs::path>();

            if (type == "folder") { //If it is a folder it needs to be zipped first
                fs::path folder_path = safe_file_path;

                std::string zip_name = file_name + ".zip";
                fs::path temp_zip_path = fs::temp_directory_path() / zip_name;

                // overwrite so file_path later points to the zip
                file_location = "";          // ignore FILE_LOCATION
                file_name = temp_zip_path.string(); // absolute path

                mz_zip_archive zip{};
                if (!mz_zip_writer_init_file(&zip, temp_zip_path.string().c_str(), 0)) {
                    res.status = 500;
                    res.set_content("Failed to create zip", "text/plain");
                    return;
                }

                try {
                    //This recursivly makes sure everythign ested in fthe folder is also zipped
                    for (fs::recursive_directory_iterator it(folder_path);
                        it != fs::recursive_directory_iterator(); ++it) {

                        if (!fs::is_regular_file(it->path())) continue;

                        fs::path rel = fs::relative(it->path(), folder_path);

                        if (!mz_zip_writer_add_file(
                            &zip,
                            rel.string().c_str(),
                            it->path().string().c_str(),
                            nullptr, 0, MZ_BEST_COMPRESSION)) {

                            mz_zip_writer_end(&zip);
                            res.status = 500;
                            res.set_content("Failed to add file to zip", "text/plain");
                            return;
                        }
                    }
                }
                catch (...) {
                    mz_zip_writer_end(&zip);
                    res.status = 500;
                    res.set_content("Exception during zip creation", "text/plain");
                    return;
                }

                if (!mz_zip_writer_finalize_archive(&zip)) {
                    mz_zip_writer_end(&zip);
                    res.status = 500;
                    res.set_content("Failed to finalize zip", "text/plain");
                    return;
                }

                mz_zip_writer_end(&zip);

                file_path = file_name;
                *temp_zip_to_cleanup = temp_zip_path;
            }



            auto file = std::make_shared<std::ifstream>(file_path, std::ios::binary); //Creates a pointer a dynamic stream

            if (!file->is_open()) {
                res.status = 404;
                std::cout << UNOPEN_FILE << API_PATH << std::endl;
                res.set_content("File not found", "text/plain");
                return;
            }
            //Sets the necessary headers
            res.set_header("Content-Type", "application/octet-stream");
            res.set_header("Content-Disposition",
                "attachment; filename=\"" + fs::path(file_path).filename().string() + "\"");

            //Returns the download in chunks
            res.set_chunked_content_provider(
                "application/octet-stream",
                [file](size_t, httplib::DataSink& sink) mutable { //The C++ server libraires syntax for chunking data to send
                    const size_t CHUNK_SIZE = 64 * 1024; // 64 KB
                    char buffer[CHUNK_SIZE];

                    // Read one chunk per call
                    file->read(buffer, CHUNK_SIZE);
                    std::streamsize n = file->gcount();

                    //Add logic for downloading folders

                    if (n > 0) {
                        sink.write(buffer, n);
                    }
                    else {
                        sink.done();
                    }

                    return true; // always return true
                },
                [file, temp_zip_to_cleanup](bool) {
                    file->close();
                    if (!temp_zip_to_cleanup->empty()) {
                        std::error_code ec;
                        fs::remove(*temp_zip_to_cleanup, ec);
                    }
                }
            );

            res.status = 200;
            return;
        });

        svr.Get("/api/files/storage", [&](const httplib::Request& req, httplib::Response& res) { //Retrieving the storage left on the disk
            LOG_CALL();
            std::string API_PATH = "GET: /api/files/storage"; //Path in variable for error messages

            std::string loc = get_file_location();
            if (loc.empty()) {
                res.status = 200;
                res.set_content(nlohmann::json{{"free", 0}, {"used", 0}}.dump(), "application/json");
                return;
            }

            uintmax_t available = fs::space(loc).available;

            try {
                SQLite::Database DB_Connection = openDB();
                SQLite::Statement result(DB_Connection, "SELECT COALESCE(SUM(file_size), 0) FROM files WHERE file_extension != 'folder'");
                result.executeStep();
                long long used = result.getColumn(0).getInt64();
                res.status = 200;
                res.set_content(nlohmann::json{{"free", (long long)available}, {"used", used}}.dump(), "application/json");
            }
            catch (const std::exception& e) {
                res.status = 500;
                std::cout << e.what() << std::endl;
                res.set_content(DB_QUERY_ERROR, "text/plain");
            }
            return;
        });

        svr.Get("/api/files/filesizes", [&](const httplib::Request& req, httplib::Response& res) { //Retrieving the storage of the files in the location
            LOG_CALL();
            std::string API_PATH = "GET: /api/files/filesizes"; //Path in variable for error messages

            if (get_file_location().empty()) { //Returns 0 when storage path is not yet configured
                res.status = 200;
                res.set_content("0", "text/plain");
                return;
            }

            fs::space_info space = fs::space(get_file_location());
            uintmax_t available = space.available; // bytes available

            try {
                SQLite::Database DB_Connection = openDB();
                std::cout << GOOD_DB_CONNECTION << API_PATH << std::endl;

                SQLite::Statement result(DB_Connection, "SELECT COALESCE(SUM(file_size), 0) FROM files");
                result.executeStep();

                res.status = 200;
                res.set_content(std::to_string(result.getColumn(0).getInt64()), "text/plain"); //API response
            }
            catch (const std::exception& e) {
                res.status = 500;
                std::cout << e.what() << std::endl;
                res.set_content(DB_QUERY_ERROR, "text/plain"); //Sends back error to Node.js backend
            }
            return;
        });


        // Post Routes
        
        svr.Post("/api/files/upload/:user_id", [](const httplib::Request& req, httplib::Response& res, const httplib::ContentReader& content_reader) { //Uploading a file
            LOG_CALL();
            std::string API_PATH = "POST: /api/files/upload";
            std::string user_id = req.path_params.at("user_id");
            std::string file_name;
            std::string file_location;

            if (current_file_count >= MAX_FILES) {
                res.status = 507;
                std::cout << TOO_MANY_FILES << API_PATH << std::endl;
                res.set_content(TOO_MANY_FILES, "text/plain");
                return;
            }

            int user_id_int = 0;
            try {
                user_id_int = std::stoi(user_id);
            }
            catch (const std::invalid_argument& e) {
                res.status = 400;
                std::cout << e.what() << std::endl;
                res.set_content(BAD_PARAMETER, "text/plain");
                return;
            }

            if (req.has_header("file_name") && req.has_header("file_location")) {
                file_name = req.get_header_value("file_name");
                file_location = req.get_header_value("file_location");
                if (file_name.find('\0') != std::string::npos || file_location.find('\0') != std::string::npos) {
                    res.status = 400;
                    res.set_content(BAD_PARAMETER, "text/plain");
                    return;
                }
            }
            else {
                res.status = 400;
                res.set_content(NO_HEADER, "text/plain");
                return;
            }

            SQLite::Database DB_Connection = openDB();
            SQLite::Transaction DB_Open_Connection(DB_Connection);
            std::cout << GOOD_DB_CONNECTION << API_PATH << std::endl;

            try {
                SQLite::Statement user_check(DB_Connection, "SELECT id, access FROM users WHERE id = ?");
                user_check.bind(1, user_id_int);
                if (!user_check.executeStep() || std::string(user_check.getColumn("access").getText()) == "viewer") { //Checks permissions
                    res.status = 403;
                    std::cout << ACCESS_DENIED << API_PATH << std::endl;
                    res.set_content(ACCESS_DENIED, "text/plain");
                    return;
                }
            }
            catch (const std::exception& e) {
                res.status = 500;
                std::cout << e.what() << std::endl;
                res.set_content(DB_QUERY_ERROR, "text/plain"); //Sends back error to Node.js backend
                return;
            }

            if (file_location == "/") {
                file_location = "";
            }
            fs::path check_path;
            fs::path safe_file_path;
            if (!build_safe_path(file_location, "", check_path) || !build_safe_path(file_location, file_name, safe_file_path)) {
                res.status = 400;
                res.set_content(BAD_PARAMETER, "text/plain");
                return;
            }
            std::string file_path = safe_file_path.string();
            if (!fs::exists(check_path)) {
                res.status = 404;
                std::cout << UNFOUND_FILE_PATH << API_PATH << std::endl;
                res.set_content(UNFOUND_FILE_PATH, "text/plain");
                return;
            }
            if (fs::exists(safe_file_path)) { //checks if the file already exists
                res.status = 409;
                std::cout << UNABLE_TO_UPLOAD_FILE << API_PATH << std::endl;
                res.set_content(UNABLE_TO_UPLOAD_FILE, "text/plain");
                return;
            }
            std::ofstream out_file(file_path, std::ios::binary); //creates the output file where things will be written
            if (!out_file.is_open()) {
                res.status = 500;
                out_file.close();
                return;
            }

            // Stream incoming data directly to disk
            bool write_success = true;
            size_t total_bytes = 0;

            if (req.is_multipart_form_data()) { //checks if the data is sent as chunks or as one
                std::cout << "Data is multipart" << std::endl;
                content_reader(
                    [&](const httplib::FormData& part) { // called once per part header — return true to receive the body for this part
                        std::cout << "Receiving part: " << part.name << std::endl;
                        return true;
                    },
                    [&](const char* data, size_t data_length) { // called repeatedly with each chunk of the current part's body
                        if (!write_success) return false;
                        std::cout << "Received chunk of size: " << data_length << " bytes\n";
                        out_file.write(data, static_cast<std::streamsize>(data_length));
                        if (!out_file) {
                            write_success = false;
                            std::cout << "Failed to write data to file\n";
                            return false;
                        }
                        total_bytes += data_length;
                        return true;
                    }
                );
            }
            else {
                // If not multipart, read the entire body at once (not ideal for large files)
                std::cout << "Data is not multipart" << std::endl;
                content_reader([&](const char* data, size_t data_length) {
                    if (!write_success) return false;

                    out_file.write(data, static_cast<std::streamsize>(data_length));
                    if (!out_file) {
                        write_success = false;
                        std::cout << "Failed to write raw body to file\n";
                        return false;
                    }

                    total_bytes += data_length;
                    return true;
                });
            }

            out_file.close(); //Closes the file to prevent memory leaks

            // Check if streaming was successful
            if (!write_success) {
                res.status = 500;
                std::cout << "File write failed after " << total_bytes << " bytes" << std::endl;
                res.set_content("Failed to Write File", "text/plain");
                std::filesystem::remove(file_path); // Clean up partial file if streaming was not successful
                return;
            }

            std::cout << "Successfully wrote " << total_bytes << " bytes to " << file_path << std::endl;

            auto get_file_extension = [](const std::string& file_name) -> std::string { //gets the file extension for adding the file to the database
                size_t dot_pos = file_name.find_last_of('.');
                if (dot_pos == std::string::npos || dot_pos == file_name.length() - 1) {
                    return "";
                }
                return file_name.substr(dot_pos + 1);
            };
            std::string extension = get_file_extension(file_name);

            try {
                SQLite::Statement insert(DB_Connection, "INSERT INTO files (user_id, file_name, file_location, file_size, file_extension) VALUES (?, ?, ?, ?, ?)");
                insert.bind(1, user_id_int);
                insert.bind(2, file_name);
                insert.bind(3, file_location);
                insert.bind(4, static_cast<int64_t>(total_bytes));
                insert.bind(5, extension);
                insert.exec(); //Adds the necessary information into the database so database and local storage stay in sync

                DB_Open_Connection.commit();
            }
            catch (const std::exception& e) {
                res.status = 500;
                std::cout << e.what() << std::endl;
                res.set_content(DB_QUERY_ERROR, "text/plain"); //Sends back error to Node.js backend
                return;
            }

            res.status = 200;
            res.set_content("File Successfully Uploaded", "text/plain"); //API response
            return;
        });

        svr.Post("/api/files/create/:user_id", [](const httplib::Request& req, httplib::Response& res) { //Creating an empty folder
            LOG_CALL();
            std::string API_PATH = "POST: /api/files/create";
            std::string user_id = req.path_params.at("user_id");

            int user_id_int = 0;
            try {
                user_id_int = std::stoi(user_id);
            }
            catch (const std::invalid_argument& e) {
                res.status = 400;
                std::cout << e.what() << std::endl;
                res.set_content(BAD_PARAMETER, "text/plain");
                return;
            }

            SQLite::Database DB_Connection = openDB();
            std::cout << GOOD_DB_CONNECTION << API_PATH << std::endl;

            nlohmann::json body;
            try {
                body = nlohmann::json::parse(req.body);
            }
            catch (const std::exception& e) {
                res.status = 400;
                std::cout << e.what() << std::endl;
                res.set_content("Invalid JSON body", "text/plain");
                return;
            }

            if (!body.contains("new_name")) {
                res.status = 400;
                res.set_content("Missing New Name in Body", "text/plain");
                return;
            }
            if (!body.contains("folder_path")) {
                res.status = 400;
                res.set_content("Missing Folder Path in Body", "text/plain");
                return;
            }

            std::string new_name = body["new_name"].get<std::string>();
            std::string folder_path = body["folder_path"].get<std::string>();

            SQLite::Transaction DB_Open_Connection(DB_Connection);
            try {
                SQLite::Statement user_check(DB_Connection, "SELECT id, access FROM users WHERE id = ?");
                user_check.bind(1, user_id_int);
                if (!user_check.executeStep() || std::string(user_check.getColumn("access").getText()) == "viewer") { //Checks permissions
                    res.status = 403;
                    std::cout << ACCESS_DENIED << API_PATH << std::endl;
                    res.set_content(ACCESS_DENIED, "text/plain");
                    return;
                }

                SQLite::Statement tmpResult(DB_Connection, "SELECT 1 FROM files WHERE user_id = ? AND file_location = ? AND file_name = ? LIMIT 1");
                tmpResult.bind(1, user_id_int);
                tmpResult.bind(2, folder_path);
                tmpResult.bind(3, new_name); //Ensures the folder does not already exist in the database
                fs::path newPath;
                if (!build_safe_path(folder_path, new_name, newPath)) {
                    res.status = 400;
                    res.set_content(BAD_PARAMETER, "text/plain");
                    DB_Open_Connection.commit();
                    return;
                }
                if (tmpResult.executeStep() || fs::exists(newPath)) { //Checks if the new name is a duplicate name (by using the database result and the local folders result)
                    DB_Open_Connection.commit();
                    res.status = 409;
                    std::cout << DUPLICATE_FILE_NAME << API_PATH << std::endl;
                    res.set_content(DUPLICATE_FILE_NAME, "text/plain");
                    return;
                }

                SQLite::Statement insert(DB_Connection, "INSERT INTO files (user_id, file_name, file_location, file_extension, file_size) VALUES (?, ?, ?, ?, ?)");
                insert.bind(1, user_id_int);
                insert.bind(2, new_name);
                insert.bind(3, folder_path);
                insert.bind(4, std::string("folder"));
                insert.bind(5, -1);
                insert.exec(); //Inserts the new folder into the database

                try {
                    fs::create_directory(newPath); //Creates the new folder
                }
                catch (const std::exception& e) {
                    res.status = 500;
                    std::cout << e.what() << std::endl;
                    res.set_content(UNABLE_TO_CREATE_FOLDER, "text/plain"); //Sends back error to Node.js backend
                    return;
                }

                DB_Open_Connection.commit();

                res.status = 200;
                res.set_content("Folder Successfully Created", "text/plain"); //API response
            }
            catch (const std::exception& e) {
                res.status = 500;
                std::cout << e.what() << std::endl;
                res.set_content(DB_QUERY_ERROR, "text/plain"); //Sends back error to Node.js backend
            }
            return;
        });


        // Patch Routes

        svr.Patch("/api/files/name/:file_id/:user_id", [](const httplib::Request& req, httplib::Response& res) { //Renaming a file
            LOG_CALL();
            std::string API_PATH = "PATCH: /api/files/name";
            std::string file_id = req.path_params.at("file_id");
            std::string user_id = req.path_params.at("user_id");
            std::string new_name;

            int file_id_int = 0;
            int user_id_int = 0;
            try {
                file_id_int = std::stoi(file_id);
            }
            catch (const std::invalid_argument& e) {
                res.status = 400;
                std::cout << e.what() << std::endl;
                res.set_content(BAD_PARAMETER, "text/plain");
                return;
            }

            try {
                user_id_int = std::stoi(user_id);
            }
            catch (const std::invalid_argument& e) {
                res.status = 400;
                std::cout << e.what() << std::endl;
                res.set_content(BAD_PARAMETER, "text/plain");
                return;
            }

            try {
                SQLite::Database DB_Connection = openDB();
                std::cout << GOOD_DB_CONNECTION << API_PATH << std::endl;
                SQLite::Transaction DB_Open_Connection(DB_Connection);

                SQLite::Statement user_check(DB_Connection, "SELECT id, access FROM users WHERE id = ?");
                user_check.bind(1, user_id_int);
                if (!user_check.executeStep() || std::string(user_check.getColumn("access").getText()) == "viewer") { //Checks permissions
                    res.status = 403;
                    std::cout << ACCESS_DENIED << API_PATH << std::endl;
                    res.set_content(ACCESS_DENIED, "text/plain");
                    return;
                }

                SQLite::Statement fileResult(DB_Connection, "SELECT * FROM files WHERE id = ?");
                fileResult.bind(1, file_id_int); //selects the file we want to rename
                if (!fileResult.executeStep()) { //Checks to ensure the file exists
                    throw std::runtime_error(DB_QUERY_ERROR);
                }

                std::string file_location = fileResult.getColumn("file_location").getText();
                std::string file_name = fileResult.getColumn("file_name").getText();
                std::string file_type = fileResult.getColumn("file_extension").getText();
                int user_id_int = fileResult.getColumn("user_id").getInt();

                auto new_name_it = req.path_params.find("new_name");
                if (new_name_it != req.path_params.end()) {
                    new_name = new_name_it->second;
                }
                else {
                    nlohmann::json body;
                    try {
                        body = nlohmann::json::parse(req.body);
                    }
                    catch (const std::exception&) {
                        res.status = 400;
                        res.set_content("Invalid JSON body", "text/plain");
                        DB_Open_Connection.commit();
                        return;
                    }
                    if (!body.contains("new_name")) {
                        res.status = 400;
                        res.set_content("Missing New Name in Body", "text/plain");
                        DB_Open_Connection.commit();
                        return;
                    }
                    new_name = body["new_name"].get<std::string>();
                }

                SQLite::Statement tmpResult(DB_Connection, "SELECT 1 FROM files WHERE user_id = ? AND file_location = ? AND file_name = ? AND id <> ? LIMIT 1");
                tmpResult.bind(1, user_id_int);
                tmpResult.bind(2, file_location);
                tmpResult.bind(3, new_name);
                tmpResult.bind(4, file_id_int);
                if (tmpResult.executeStep()) { //Checks if the new name is a duplicate name
                    DB_Open_Connection.commit();
                    res.status = 409;
                    std::cout << DUPLICATE_FILE_NAME << API_PATH << std::endl;
                    res.set_content(DUPLICATE_FILE_NAME, "text/plain");
                    return;
                }

                fs::path fullPath;
                fs::path newPath;
                if (!build_safe_path(file_location, file_name, fullPath) || !build_safe_path(file_location, new_name, newPath)) {
                    res.status = 400;
                    res.set_content(BAD_PARAMETER, "text/plain");
                    DB_Open_Connection.commit();
                    return;
                }

                if (fs::exists(newPath)) { //Checks if a file with the same name already exists in the destination on the filesystem
                    res.status = 409;
                    std::cout << DUPLICATE_FILE_NAME << API_PATH << std::endl;
                    res.set_content(DUPLICATE_FILE_NAME, "text/plain");
                    DB_Open_Connection.commit();
                    return;
                }

                try {
                    SQLite::Statement updateName(DB_Connection, "UPDATE files SET file_name = ? WHERE id = ?");
                    updateName.bind(1, new_name);
                    updateName.bind(2, file_id_int);
                    updateName.exec();
                    if (file_type == "folder") { //Cascade: update file_location for all children when a folder is renamed
                        std::string old_prefix = file_location.empty() ? file_name : file_location + "/" + file_name;
                        std::string new_prefix = file_location.empty() ? new_name : file_location + "/" + new_name;
                        SQLite::Statement cascade(DB_Connection,
                            "UPDATE files SET file_location = ?1 || SUBSTR(file_location, LENGTH(?2) + 1) "
                            "WHERE file_location = ?2 OR file_location LIKE ?2 || '/%'");
                        cascade.bind(1, new_prefix);
                        cascade.bind(2, old_prefix);
                        cascade.exec();
                    }
                }
                catch (const std::exception& e) {
                    res.status = 500;
                    std::cout << e.what() << std::endl;
                    res.set_content(DB_QUERY_ERROR, "text/plain"); //Sends back error to Node.js backend
                    return;
                }

                try {
                    fs::rename(fullPath, newPath);
                } catch (const std::exception& e) {
                    res.status = 500;
                    std::cout << e.what() << std::endl;
                    res.set_content(UNABLE_TO_RENAME, "text/plain"); //Sends back error to Node.js backend
                    return;
                }

                DB_Open_Connection.commit();

                res.status = 200;
                res.set_content("File Successfully Renamed", "text/plain"); //API response
            }
            catch (const std::exception& e) {
                res.status = 500;
                std::cout << e.what() << std::endl;
                res.set_content(DB_QUERY_ERROR, "text/plain"); //Sends back error to Node.js backend
            }

            return;
        });

        svr.Patch("/api/files/move/:file_id/:user_id", [](const httplib::Request& req, httplib::Response& res) { //Moving a file
            LOG_CALL();
            std::string API_PATH = "PATCH: /api/files/move";
            std::string file_id = req.path_params.at("file_id");
            std::string user_id = req.path_params.at("user_id");

            int file_id_int = 0;
            int user_id_int = 0;
            try {
                file_id_int = std::stoi(file_id);
            }
            catch (const std::invalid_argument& e) {
                res.status = 400;
                std::cout << e.what() << std::endl;
                res.set_content(BAD_PARAMETER, "text/plain");
                return;
            }

            try {
                user_id_int = std::stoi(user_id);
            }
            catch (const std::invalid_argument& e) {
                res.status = 400;
                std::cout << e.what() << std::endl;
                res.set_content(BAD_PARAMETER, "text/plain");
                return;
            }

            SQLite::Database DB_Connection = openDB();
            std::cout << GOOD_DB_CONNECTION << API_PATH << std::endl;
            SQLite::Transaction DB_Open_Connection(DB_Connection);
            std::string file_location;
            std::string file_name;
            std::string file_type;

            try {
                SQLite::Statement user_check(DB_Connection, "SELECT id, access FROM users WHERE id = ?");
                user_check.bind(1, user_id_int);
                if (!user_check.executeStep() || std::string(user_check.getColumn("access").getText()) == "viewer") { //Checks permissions
                    res.status = 403;
                    std::cout << ACCESS_DENIED << API_PATH << std::endl;
                    res.set_content(ACCESS_DENIED, "text/plain");
                    return;
                }

                SQLite::Statement fileResult(DB_Connection, "SELECT * FROM files WHERE id = ?");
                fileResult.bind(1, file_id_int);
                if (!fileResult.executeStep()) { //Ensures the file exists
                    throw std::runtime_error(DB_QUERY_ERROR);
                }

                file_location = fileResult.getColumn("file_location").getText();
                file_name = fileResult.getColumn("file_name").getText();
                file_type = fileResult.getColumn("file_extension").getText();
            }
            catch (const std::exception& e) {
                res.status = 500;
                std::cout << e.what() << std::endl;
                res.set_content(DB_QUERY_ERROR, "text/plain"); //Sends back error to Node.js backend
                return;
            }

            // Parse JSON body
            nlohmann::json body;
            try {
                body = nlohmann::json::parse(req.body);
            }
            catch (const std::exception& e) {
                res.status = 400;
                std::cout << e.what() << std::endl;
                res.set_content("Invalid JSON body", "text/plain");
                return;
            }

            if (!body.contains("new_location")) {
                res.status = 400;
                res.set_content("Missing New Location in Body", "text/plain");
                return;
            }

            std::string new_file_location = body["new_location"].get<std::string>();
            fs::path oldPath;
            fs::path newPath;
            if (!build_safe_path(file_location, file_name, oldPath) || !build_safe_path(new_file_location, file_name, newPath)) { //creates a safe new file
                res.status = 400;
                res.set_content(BAD_PARAMETER, "text/plain");
                DB_Open_Connection.commit();
                return;
            }

            if (fs::exists(newPath)) { //Checks if a file with the same name already exists in the destination on the filesystem
                res.status = 409;
                std::cout << DUPLICATE_FILE_NAME << API_PATH << std::endl;
                res.set_content(DUPLICATE_FILE_NAME, "text/plain");
                DB_Open_Connection.commit();
                return;
            }

            try {
                SQLite::Statement updateLoc(DB_Connection, "UPDATE files SET file_location = ? WHERE id = ?");
                updateLoc.bind(1, new_file_location);
                updateLoc.bind(2, file_id_int);
                updateLoc.exec(); //Updates the location of the file in the database
                if (file_type == "folder") { //Cascade: update file_location for all children when a folder is moved
                    std::string old_prefix = file_location.empty() ? file_name : file_location + "/" + file_name;
                    std::string new_prefix = new_file_location.empty() ? file_name : new_file_location + "/" + file_name;
                    SQLite::Statement cascade(DB_Connection,
                        "UPDATE files SET file_location = ?1 || SUBSTR(file_location, LENGTH(?2) + 1) "
                        "WHERE file_location = ?2 OR file_location LIKE ?2 || '/%'");
                    cascade.bind(1, new_prefix);
                    cascade.bind(2, old_prefix);
                    cascade.exec();
                }
            }
            catch (const std::exception& e) {
                res.status = 500;
                std::cout << e.what() << std::endl;
                res.set_content(DB_QUERY_ERROR, "text/plain"); //Sends back error to Node.js backend
                return;
            }

            try {
                fs::rename(oldPath, newPath); //moves the file or folder (fs::rename handles directories recursively)
            }
            catch (const std::exception& e) {
                res.status = 500;
                std::cout << e.what() << std::endl;
                res.set_content(UNABLE_TO_MOVE, "text/plain"); //Sends back error to Node.js backend
                return;
            }

            res.status = 200;
            res.set_content("File Successfully Moved", "text/plain"); //API response

            DB_Open_Connection.commit();

            return;
        });


        // Delete Routes

        svr.Delete("/api/files/delete/:file_id/:user_id", [](const httplib::Request& req, httplib::Response& res) { //Deletes a file
            std::string API_PATH = "DELETE: /api/files/delete";
            std::string file_id = req.path_params.at("file_id");
            std::string user_id = req.path_params.at("user_id");

            int file_id_int = 0;
            int user_id_int = 0;
            try {
                file_id_int = std::stoi(file_id);
            }
            catch (const std::invalid_argument& e) {
                res.status = 400;
                std::cout << e.what() << std::endl;
                res.set_content(BAD_PARAMETER, "text/plain");
                return;
            }

            try {
                user_id_int = std::stoi(user_id);
            }
            catch (const std::invalid_argument& e) {
                res.status = 400;
                std::cout << e.what() << std::endl;
                res.set_content(BAD_PARAMETER, "text/plain");
                return;
            }

            SQLite::Database DB_Connection = openDB();
            std::cout << GOOD_DB_CONNECTION << API_PATH << std::endl;
            SQLite::Transaction DB_Open_Connection(DB_Connection);
            std::string file_location;
            std::string file_name;
            std::string file_type;

            try {
                SQLite::Statement user_check(DB_Connection, "SELECT id, access FROM users WHERE id = ?");
                user_check.bind(1, user_id_int);
                if (!user_check.executeStep() || std::string(user_check.getColumn("access").getText()) == "viewer") { //Checks permissions
                    res.status = 403;
                    std::cout << ACCESS_DENIED << API_PATH << std::endl;
                    res.set_content(ACCESS_DENIED, "text/plain");
                    return;
                }

                SQLite::Statement fileResult(DB_Connection, "SELECT * FROM files WHERE id = ?");
                fileResult.bind(1, file_id_int);
                if (!fileResult.executeStep()) { //Ensures the file exists in the database
                    throw std::runtime_error(DB_QUERY_ERROR);
                }

                file_location = fileResult.getColumn("file_location").getText();
                file_name = fileResult.getColumn("file_name").getText();
                file_type = fileResult.getColumn("file_extension").getText();
            }
            catch (const std::exception& e) {
                res.status = 500;
                std::cout << e.what() << std::endl;
                res.set_content(DB_QUERY_ERROR, "text/plain"); //Sends back error to Node.js backend
                return;
            }

            fs::path deletePath;
            if (!build_safe_path(file_location, file_name, deletePath)) {
                res.status = 400;
                res.set_content(BAD_PARAMETER, "text/plain");
                DB_Open_Connection.commit();
                return;
            }

            try {
                SQLite::Statement del(DB_Connection, "DELETE FROM files WHERE id = ?");
                del.bind(1, file_id_int);
                del.exec();
                if (file_type == "folder") { // also remove all DB records whose path is inside this folder
                    std::string folder_prefix = file_location.empty() ? file_name : file_location + "/" + file_name;
                    SQLite::Statement delChildren(DB_Connection, "DELETE FROM files WHERE file_location = ? OR file_location LIKE ?");
                    delChildren.bind(1, folder_prefix);
                    delChildren.bind(2, folder_prefix + "/%");
                    delChildren.exec();
                }
            }
            catch (const std::exception& e) {
                res.status = 500;
                std::cout << e.what() << std::endl;
                res.set_content(DB_QUERY_ERROR, "text/plain"); //Sends back error to Node.js backend
                DB_Open_Connection.commit();
                return;
            }

            try {
                if (fs::exists(deletePath)) { //The reason that this action has a checked but not preovus actions is because deleting a file with an unkown path could cause uninted things therefore it is just better to check it
                    if (file_type == "folder") {
                        fs::remove_all(deletePath); //Deletes the folder and everything in it
                    }
                    else {
                        fs::remove(deletePath); //Deletes the file
                    }
                }
                else {
                    res.status = 500;
                    std::cout << UNFOUND_FILE_PATH << API_PATH << std::endl;
                    res.set_content(UNFOUND_FILE_PATH, "text/plain");
                    DB_Open_Connection.commit();
                    return;
                }
            }
            catch (const std::exception& e) {
                res.status = 500;
                std::cout << e.what() << std::endl;
                res.set_content(UNABLE_TO_DELETE, "text/plain"); //Sends back error to Node.js backend
                return;
            }

            res.status = 200;
            res.set_content("File Successfully Deleted", "text/plain"); //API response

            DB_Open_Connection.commit();
            return;
        });



        //Extra Features

        svr.Get("/api/features/location", [&](const httplib::Request& req, httplib::Response& res) { //Retrieving user names
            LOG_CALL();
            std::string API_PATH = "GET: /api/features/location"; //Path in variable for error messages

            res.status = 200;
            res.set_content(get_file_location(), "text/plain"); //API response
            return;
         });

        svr.Patch("/api/features/reinitialize/:user_id", [](const httplib::Request& req, httplib::Response& res) { //Reinitializing the files in the current location
            LOG_CALL();
            std::string API_PATH = "PATCH: /api/features/reinitialize";
            std::string user_id = req.path_params.at("user_id");
            
            int user_id_int = 0;
            try {
                user_id_int = std::stoi(user_id);
            }
            catch (const std::invalid_argument& e) {
                res.status = 400;
                std::cout << e.what() << std::endl;
                res.set_content(BAD_PARAMETER, "text/plain");
                return;
            }

            try {
                SQLite::Database DB_Connection = openDB();
                std::cout << GOOD_DB_CONNECTION << API_PATH << std::endl;
                SQLite::Transaction DB_Open_Connection(DB_Connection);

                SQLite::Statement user_check(DB_Connection, "SELECT id, access FROM users WHERE id = ?");
                user_check.bind(1, user_id_int);
                if (!user_check.executeStep() || std::string(user_check.getColumn("access").getText()) != "owner") { //Checks permissions
                    res.status = 403;
                    std::cout << ACCESS_DENIED << API_PATH << std::endl;
                    res.set_content(ACCESS_DENIED, "text/plain");
                    return;
                }

                try {
                    reinitialize_files(DB_Connection, user_id_int); //calls the reinitialize route
                }
                catch (const std::exception& e) {
                    res.status = 500;
                    std::cout << e.what() << std::endl;
                    res.set_content(e.what(), "text/plain");
                }

                DB_Open_Connection.commit();

                res.status = 200;
                res.set_content("Files Successfully Reinitialized", "text/plain"); //API response
            }
            catch (const std::exception& e) {
                res.status = 500;
                std::cout << e.what() << std::endl;
                res.set_content(DB_QUERY_ERROR, "text/plain"); //Sends back error to Node.js backend
            }

            return;
        });

        svr.Patch("/api/features/location/:user_id", [](const httplib::Request& req, httplib::Response& res) { //Changing the file location that is displayed
            LOG_CALL();
            std::string API_PATH = "PATCH: /api/features/location";
            std::string user_id = req.path_params.at("user_id");

            int user_id_int = 0;
            try {
                user_id_int = std::stoi(user_id);
            }
            catch (const std::invalid_argument& e) {
                res.status = 400;
                std::cout << e.what() << std::endl;
                res.set_content(BAD_PARAMETER, "text/plain");
                return;
            }

            nlohmann::json body;
            try {
                body = nlohmann::json::parse(req.body);
            }
            catch (const std::exception& e) {
                res.status = 400;
                std::cout << e.what() << std::endl;
                res.set_content("Invalid JSON body", "text/plain");
                return;
            }

            if (!body.contains("new_location")) {
                res.status = 400;
                res.set_content("Missing New Location in Body", "text/plain");
                return;
            }

            std::string new_file_location = body["new_location"].get<std::string>();

            try {
                SQLite::Database DB_Connection = openDB();
                std::cout << GOOD_DB_CONNECTION << API_PATH << std::endl;
                SQLite::Transaction DB_Open_Connection(DB_Connection);

                SQLite::Statement user_check(DB_Connection, "SELECT id, access FROM users WHERE id = ?");
                user_check.bind(1, user_id_int);
                if (!user_check.executeStep() || std::string(user_check.getColumn("access").getText()) != "owner") { //Checks permissions
                    res.status = 403;
                    std::cout << ACCESS_DENIED << API_PATH << std::endl;
                    res.set_content(ACCESS_DENIED, "text/plain");
                    return;
                }

                fs::path new_path(new_file_location);
                if (!new_path.is_absolute() || new_path.parent_path() == new_path.root_path() || !fs::exists(new_path) || !fs::is_directory(new_path)) {
                    res.status = 400;
                    std::cout << BAD_PARAMETER << API_PATH << std::endl;
                    res.set_content(BAD_PARAMETER, "text/plain");
                    DB_Open_Connection.commit();
                    return;
                }

                std::string old_file_location = get_file_location(); //Saved so it can be restored if re-indexing fails
                int old_file_count = current_file_count.load(); //Saved so it can be restored if re-indexing fails
                set_file_location(new_path.string()); //changes the base file location
                SQLite::Statement updateLoc(DB_Connection, "UPDATE server_info SET file_location = ? WHERE id = 1");
                updateLoc.bind(1, new_path.string());
                updateLoc.exec(); //persists the new location to the database so it survives server restarts

                try {
                    reinitialize_files(DB_Connection, user_id_int); //re-indexes all files from the new path
                }
                catch (const std::exception& e) {
                    set_file_location(old_file_location); //Restore previous state; returning without commit rolls back the DB changes
                    current_file_count = old_file_count;
                    res.status = 500;
                    std::cout << e.what() << std::endl;
                    res.set_content(e.what(), "text/plain");
                    return; //Returns before commit so the failed re-index and location update are discarded
                }

                DB_Open_Connection.commit();

                res.status = 200;
                res.set_content("Folder Location Changed", "text/plain"); //API response
            }
            catch (const std::exception& e) {
                res.status = 500;
                std::cout << e.what() << std::endl;
                res.set_content(DB_QUERY_ERROR, "text/plain"); //Sends back error to Node.js backend
            }

            return;
        });


        //Fallback route
        svr.set_error_handler([](const httplib::Request& req, httplib::Response& res) { //Catches unknown routes; only fires when the route set no body (true 404), not for intentional 4xx/5xx responses
            if (res.body.empty()) {
                res.status = 404;
                res.set_content("Endpoint not Found | or | An Uncaught Error Occurred", "text/plain");
            }
        });



    } catch (const std::exception& e) {
        std::cout << e.what() << std::endl;
        return 1;
    }

    std::string currTime = "[" + get_time_stamp() + "] ";
    std::cout << std::endl << std::endl << currTime << "Server listening on port " << PORT << " ...\n";
    svr.listen("0.0.0.0", PORT);

    //std::cout << std::endl << std::endl << "The amount of API calls made to valid endpoints are: " << api_traffic_count << std::endl;
    return api_traffic_count.load(std::memory_order_relaxed); //Returns how many API calls were made to valid endpoints while the server was open
}
