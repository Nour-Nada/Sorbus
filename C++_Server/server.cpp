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

//Download System Headers
#include <pqxx/pqxx>

//Downloaded one file headers
#include "header_libs/httplib.h"
#include "header_libs/json.hpp"
#include "header_libs/miniz/miniz.h"

//Created headers
#include "server_functions.h"

//Namespaces
namespace fs = std::filesystem;


#define PORT 8080 //Server Port

// HTTP
httplib::Server svr;  //TO-DO: Make it an HTTPS server so that there is encryption

//Global Variables
//TO-DO: Hide variables from file before deployment
const std::string API_KEY = []() {
    const char* value = std::getenv("FILEAPP_API_KEY");
    return (value && *value) ? std::string(value) : "test12345";
}(); //The API key
const std::string OUTPUT_FILE = "server_output.txt"; //Where the print statements, errors, and more gets outputted to in deployment

std::shared_mutex FILE_LOCATION_MUTEX; //Mutex to protect the file location string from concurrent read/write access across threads
std::string FILE_LOCATION = []() {
    const char* value = std::getenv("FILEAPP_FILE_LOCATION");
    return (value && *value) ? std::string(value) : "C:/Users/nour2/Videos/Test";
}(); //The location of the stored files

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
    return (value && *value) ? std::stoi(value) : 100000;
}(); //The maximum number of files allowed in the storage location

//Database Connection Information
const std::string DB_CONNECTION_STRING = []() {
    const char* value = std::getenv("FILEAPP_DB_CONNECTION");
    return (value && *value) ? std::string(value)
        : "dbname=pyrus user=postgres password=REDACTED host=localhost";
}();


std::atomic<int> api_traffic_count{ 0 }; //Counts how many API calls are made to valid endpoints while the server is still open
std::atomic<int> current_file_count{ 0 }; //Tracks the current number of non-folder files stored across all users, initialized from the database on startup

void initialize_file_count() { //Sets current_file_count to the number of files in the database excluding folders
    try {
        pqxx::connection conn(DB_CONNECTION_STRING);
        pqxx::work txn(conn);
        pqxx::result result = txn.exec("SELECT COUNT(*) FROM files WHERE file_extension != 'folder';");
        current_file_count.store(result[0][0].as<int>(), std::memory_order_relaxed);
        txn.commit();
    } catch (const std::exception& e) {
        std::cerr << "Failed to initialize file count: " << e.what() << std::endl;
    }
}

//Global String Errors
const std::string BAD_DB_CONNECTION = "Cannot Connect to Database;";
const std::string NO_HEADER = "There is no Header Attached with this Request.";
const std::string INCORRECT_API_KEY = "Incorrect API Key.";
const std::string DB_QUERY_ERROR = "An Error Occurred in Querying the Database;";
const std::string BAD_PARAMATER = "An Incorrect Parameter was Passed In;";
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
const std::string GOOD_DB_CONNECTION = "Connected to PostgreSQL Server; API Path ";

//Global helper functions
#define LOG_TIME() std::cout << std::endl << "[" << getTimestamp() << "] " << std::endl; // Logs the time the API was called
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



int main(void)
{

    initialize_file_count(); //Loads the current file count from the database before the server starts accepting requests

    //Opens up the file to which the output will be redirected
    std::ofstream logFile(OUTPUT_FILE, std::ios::app);
    /* //Currently commented out so I can see the output in the console however in deployment this will be un commented
    if (!logFile.is_open()) {
        std::cerr << "Failed to open log file!" << std::endl;
        return 1;
    }
    //Redirects output of cout to the file
    std::streambuf* coutBuf = std::cout.rdbuf();  // save original buffer
    std::cout.rdbuf(logFile.rdbuf()); //changes original buffer
    */

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

        // Auth Routes

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

            pqxx::connection DB_Connection(DB_CONNECTION_STRING);
            if (!DB_Connection.is_open()) {
                res.status = 502;
                std::cout << BAD_DB_CONNECTION << API_PATH << std::endl;
                res.set_content(BAD_DB_CONNECTION, "text/plain");
                return;
            }
            else {
                std::cout << GOOD_DB_CONNECTION << API_PATH << std::endl;
            }

            pqxx::work DB_Open_Connection{ DB_Connection };
            try {
                pqxx::result key_check = DB_Open_Connection.exec(
                    "SELECT register_key FROM server_info"
                );

                if (key_check[0][0].as<std::string>() != reg_key) {
                    res.status = 401;
                    std::cout << "The Registration Key is Incorrect;" << API_PATH << std::endl;
                    res.set_content("Registration key is incorrect", "text/plain");
                    return;
                }

                pqxx::result dupResult = DB_Open_Connection.exec_params(
                    "SELECT 1 FROM users WHERE username = $1 OR email = $2 LIMIT 1;",
                    username, email); //Checks if a user with the same username or email already exists
                if (!dupResult.empty()) {
                    res.status = 409;
                    std::cout << DUPLICATE_USER << API_PATH << std::endl;
                    res.set_content(DUPLICATE_USER, "text/plain");
                    DB_Open_Connection.commit();
                    return;
                }

                pqxx::result is_empty = DB_Open_Connection.exec("SELECT 1 FROM users LIMIT 1;"); //Checks if this is the first user

                std::string access = is_empty.empty() ? "owner" : "viewer"; //First user becomes owner, all subsequent users are viewers

                DB_Open_Connection.exec_params(
                    "INSERT INTO users (username, email, password, access) VALUES ($1, $2, $3, $4);",
                    username, email, password, access);

                DB_Open_Connection.commit();
                res.status = 200;
                res.set_content("User Successfully Signed Up", "text/plain"); //API response
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

            pqxx::connection DB_Connection(DB_CONNECTION_STRING);
            if (!DB_Connection.is_open()) {
                res.status = 502;
                std::cout << BAD_DB_CONNECTION << API_PATH << std::endl;
                res.set_content(BAD_DB_CONNECTION, "text/plain");
                return;
            }
            else {
                std::cout << GOOD_DB_CONNECTION << API_PATH << std::endl;
            }

            pqxx::nontransaction DB_Open_Connection{ DB_Connection };
            try {
                pqxx::result result = DB_Open_Connection.exec_params(
                    "SELECT password FROM users WHERE name = $1 OR email = $2", username, username
                );

                if (result.empty()) {
                    res.status = 401;
                    res.set_content("User Does Not Exist", "text/plain"); //API response
                    return;
                }

                std::string password = result[0]["password"].c_str();
                res.status = 200;
                res.set_content(password, "text/plain"); //API response
            }
            catch (const std::exception& e) {
                res.status = 500;
                std::cout << e.what() << std::endl;
                res.set_content(DB_QUERY_ERROR, "text/plain"); //Sends back error to Node.js backend
            }

            return;
        });


        // Get Routes

        svr.Get("/api/files/name/:user_id", [&](const httplib::Request& req, httplib::Response& res) { //Retrieving file names
            LOG_CALL();
            std::string API_PATH = "GET: /api/files/name"; //Path in variable for error messages
            std::string user_id = req.path_params.at("user_id");

            int user_id_int = 0;
            try {
                user_id_int = std::stoi(user_id);
            } catch (const std::invalid_argument& e) {
                std::cout << e.what() << std::endl;
                res.status = 400;
                res.set_content(BAD_PARAMATER, "text/plain");
                return;
            }

            pqxx::connection DB_Connection(DB_CONNECTION_STRING);
            if (!DB_Connection.is_open()) {
                res.status = 502;
                std::cout << BAD_DB_CONNECTION << API_PATH << std::endl;
                res.set_content(BAD_DB_CONNECTION, "text/plain");
                return;
            }
            else {
                std::cout << GOOD_DB_CONNECTION << API_PATH << std::endl;
            }

            pqxx::nontransaction DB_Open_Connection{ DB_Connection };
            try {
                pqxx::result result = DB_Open_Connection.exec(
                    pqxx::zview("SELECT * from files ORDER BY file_location ASC;") //Selects all the files for this user
                );

                nlohmann::json tree = nlohmann::json::object(); //Creates JSON object
                nlohmann::json file_ids = nlohmann::json::object();

                for (const auto& row : result) { //Adds each file or folder by going row by row for each folder that got returned from the above query
                    std::string file_location = row["file_location"].c_str();
                    std::string file_name = row["file_name"].c_str();
                    std::string type = row["file_extension"].c_str(); // "file" or "folder"
                    int id = row["id"].as<int>();

                    nlohmann::json* current = &tree; //Sets current equal to the JSON object

                    std::stringstream ss(file_location);
                    std::string folder;

                    while (std::getline(ss, folder, '/')) { //Creates the JSON structure to be returned
                        if (folder.empty()) continue;

                        // If the folder doesn't exist yet, create it as an object
                        if (!current->contains(folder)) {
                            (*current)[folder] = nlohmann::json::object();
                        }

                        current = &(*current)[folder];
                    }

                    //Just assigns the location directly creating the Key Value pair
                    if (type == "folder") {
                        (*current)[file_name] = nlohmann::json::object();
                    }
                    else {
                        std::string full_path = file_location.empty() ? file_name : file_location + "/" + file_name;
                        (*current)[file_name] = full_path;
                        file_ids[full_path] = id;
                    }
                }

                res.status = 200;
                res.set_content(nlohmann::json{{"tree", tree}, {"fileIds", file_ids}}.dump(), "application/json"); //API response
            }
            catch (const std::exception& e) {
                res.status = 500;
                std::cout << e.what() << std::endl;
                res.set_content(DB_QUERY_ERROR, "text/plain"); //Sends back error to Node.js backend
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
                res.set_content(BAD_PARAMATER, "text/plain");
                return;
            }
            try {
                user_id_int = std::stoi(user_id);
            }
            catch (const std::invalid_argument& e) {
                res.status = 400;
                std::cout << e.what() << std::endl;
                res.set_content(BAD_PARAMATER, "text/plain");
                return;
            }

            pqxx::connection DB_Connection(DB_CONNECTION_STRING);
            if (!DB_Connection.is_open()) {
                res.status = 502;
                std::cout << BAD_DB_CONNECTION << API_PATH << std::endl;
                res.set_content(BAD_DB_CONNECTION, "text/plain");
                return;
            }
            else {
                std::cout << GOOD_DB_CONNECTION << API_PATH << std::endl;
            }

            pqxx::nontransaction DB_Open_Connection{ DB_Connection };
            pqxx::result result;
            std::string file_location;
            std::string file_name;
            std::string type;
            try {
                pqxx::result user_check = DB_Open_Connection.exec_params(
                    "SELECT * FROM users WHERE id = $1",
                    user_id_int
                );

                if (user_check.empty() || user_check[0]["access"].as<std::string>() == "viewer") {
                    res.status = 403;
                    std::cout << ACCESS_DENIED << API_PATH << std::endl;
                    res.set_content(ACCESS_DENIED, "text/plain");
                    return;
                }

                result = DB_Open_Connection.exec_params(
                    "SELECT * FROM files WHERE id = $1;", //Returns the file that the user wants to download
                    file_id_int
                );
                if (result.empty()) {
                    throw std::runtime_error(DB_QUERY_ERROR);
                }
                //Extracts the neccesary informaon for sending the file for download from the user
                file_location = result[0]["file_location"].c_str();
                file_name = result[0]["file_name"].c_str();
                type = result[0]["file_extension"].c_str();
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
                res.set_content(BAD_PARAMATER, "text/plain");
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

            fs::space_info space = fs::space(get_file_location());
            uintmax_t available = space.available; // bytes available

            pqxx::connection DB_Connection(DB_CONNECTION_STRING);
            if (!DB_Connection.is_open()) {
                res.status = 502;
                std::cout << BAD_DB_CONNECTION << API_PATH << std::endl;
                res.set_content(BAD_DB_CONNECTION, "text/plain");
                return;
            }
            else {
                std::cout << GOOD_DB_CONNECTION << API_PATH << std::endl;
            }

            pqxx::work DB_Open_Connection{ DB_Connection };
            try {
                pqxx::result result = DB_Open_Connection.exec_params(
                    "UPDATE server_info SET storage_space_remaining = $1 WHERE id = 1;", available
                );

                nlohmann::json tree = nlohmann::json::object(); //Creates JSON object
                nlohmann::json file_ids = nlohmann::json::object();

                res.status = 200;
                res.set_content(std::to_string(available), "text/plain"); //API response
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
                res.set_content(BAD_PARAMATER, "text/plain");
                return;
            }

            if (req.has_header("file_name") && req.has_header("file_location")) {
                file_name = req.get_header_value("file_name");
                file_location = req.get_header_value("file_location");
            }
            else {
                res.status = 400;
                res.set_content(NO_HEADER, "text/plain");
                return;
            }

            pqxx::connection DB_Connection(DB_CONNECTION_STRING);
            if (!DB_Connection.is_open()) {
                res.status = 502;
                std::cout << BAD_DB_CONNECTION << API_PATH << std::endl;
                res.set_content(BAD_DB_CONNECTION, "text/plain");
                return;
            }
            else {
                std::cout << GOOD_DB_CONNECTION << API_PATH << std::endl;
            }

            pqxx::work DB_Open_Connection{ DB_Connection };

            try {
                pqxx::result user_check = DB_Open_Connection.exec_params(
                    "SELECT * FROM users WHERE id = $1;",
                    user_id_int
                );

                if (user_check.empty() || user_check[0]["access"].as<std::string>() == "viewer") {
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
            std::string file_path_check = get_file_location() + file_location;
            std::string file_path = get_file_location() + file_location + "/" + file_name;
            if (!std::filesystem::exists(file_path_check)) {
                res.status = 409;
                std::cout << BAD_DB_CONNECTION << API_PATH << std::endl;
                res.set_content(BAD_DB_CONNECTION, "text/plain");
                return;
            }
            if (std::filesystem::exists(file_path)) { //checks if the file already exists
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
                pqxx::result result = DB_Open_Connection.exec_params(
                    "INSERT INTO files (user_id, file_name, file_location, file_size, file_extension) VALUES ($1, $2, $3, $4, $5);",
                        user_id_int, file_name, file_location, total_bytes, extension
                ); //Adds the necessary information into the database that way the database and local storage stay updated

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
                res.set_content(BAD_PARAMATER, "text/plain");
                return;
            }

            pqxx::connection DB_Connection(DB_CONNECTION_STRING);
            if (!DB_Connection.is_open()) {
                res.status = 502;
                std::cout << BAD_DB_CONNECTION << API_PATH << std::endl;
                res.set_content(BAD_DB_CONNECTION, "text/plain");
                return;
            }
            else {
                std::cout << GOOD_DB_CONNECTION << API_PATH << std::endl;
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

            pqxx::work DB_Open_Connection{ DB_Connection };
            try {
                pqxx::result user_check = DB_Open_Connection.exec_params(
                    "SELECT * FROM users WHERE id = $1",
                    user_id_int
                );

                if (user_check.empty() || user_check[0]["access"].as<std::string>() == "viewer") {
                    res.status = 403;
                    std::cout << ACCESS_DENIED << API_PATH << std::endl;
                    res.set_content(ACCESS_DENIED, "text/plain");
                    return;
                }

                pqxx::result tmpResult = DB_Open_Connection.exec_params(
                    "SELECT 1 FROM files WHERE user_id = $1 AND file_location = $2 AND file_name = $3 LIMIT 1;",
                    user_id_int, folder_path, new_name); //Ensures the folder does not already exist in the database
                fs::path newPath;
                if (!build_safe_path(folder_path, new_name, newPath)) {
                    res.status = 400;
                    res.set_content(BAD_PARAMATER, "text/plain");
                    DB_Open_Connection.commit();
                    return;
                }
                if (!tmpResult.empty() || fs::exists(newPath)) { //Checks if the new name is a duplicate name (by using the database result and the local folders result)
                    DB_Open_Connection.commit();
                    res.status = 409;
                    std::cout << DUPLICATE_FILE_NAME << API_PATH << std::endl;
                    res.set_content(DUPLICATE_FILE_NAME, "text/plain");
                    return;
                }

                pqxx::result result = DB_Open_Connection.exec_params(
                    "INSERT INTO files (user_id, file_name, file_location, file_extension, file_size) VALUES ($1, $2, $3, $4, $5);",
                    user_id_int, new_name, folder_path, "folder", -1
                ); //Inserts the new folder into the database

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
                res.set_content(BAD_PARAMATER, "text/plain");
                return;
            }

            try {
                user_id_int = std::stoi(user_id);
            }
            catch (const std::invalid_argument& e) {
                res.status = 400;
                std::cout << e.what() << std::endl;
                res.set_content(BAD_PARAMATER, "text/plain");
                return;
            }

            pqxx::connection DB_Connection(DB_CONNECTION_STRING);
            if (!DB_Connection.is_open()) {
                res.status = 502;
                std::cout << BAD_DB_CONNECTION << API_PATH << std::endl;
                res.set_content(BAD_DB_CONNECTION, "text/plain");
                return;
            }
            else {
                std::cout << GOOD_DB_CONNECTION << API_PATH << std::endl;
            }

            pqxx::work DB_Open_Connection{ DB_Connection };
            try {
                pqxx::result user_check = DB_Open_Connection.exec_params(
                    "SELECT * FROM users WHERE id = $1",
                    user_id_int
                );

                if (user_check.empty() || user_check[0]["access"].as<std::string>() == "viewer") {
                    res.status = 403;
                    std::cout << ACCESS_DENIED << API_PATH << std::endl;
                    res.set_content(ACCESS_DENIED, "text/plain");
                    return;
                }


                pqxx::result result = DB_Open_Connection.exec_params(
                    "SELECT * from files WHERE id = $1;",
                    file_id_int); //selects the file we want to rename
                if (result.empty()) { //Checks to ensure the file exists
                    throw std::runtime_error(DB_QUERY_ERROR);
                }

                std::string file_location = result[0]["file_location"].c_str();
                std::string file_name = result[0]["file_name"].c_str();
                int user_id_int = result[0]["user_id"].as<int>();

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

                pqxx::result tmpResult = DB_Open_Connection.exec_params(
                    "SELECT 1 FROM files WHERE user_id = $1 AND file_location = $2 AND file_name = $3 AND id <> $4 LIMIT 1;",
                    user_id_int, file_location, new_name, file_id_int);
                if (!tmpResult.empty()) { //Checks if the new name is a duplicate name
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
                    res.set_content(BAD_PARAMATER, "text/plain");
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
                    DB_Open_Connection.exec_params(
                        "UPDATE files SET file_name = $1 WHERE id = $2;",
                        new_name, file_id_int);
                }
                catch (const std::exception& e) {
                    res.status = 500;
                    std::cout << e.what() << std::endl;
                    res.set_content(DB_QUERY_ERROR, "text/plain"); //Sends back error to Node.js backend
                    DB_Open_Connection.commit();
                    return;
                }

                try {
                    fs::rename(fullPath, newPath);
                } catch (const std::exception& e) {
                    res.status = 500;
                    std::cout << e.what() << std::endl;
                    res.set_content(UNABLE_TO_RENAME, "text/plain"); //Sends back error to Node.js backend
                    DB_Open_Connection.commit();
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
                res.set_content(BAD_PARAMATER, "text/plain");
                return;
            }

            try {
                user_id_int = std::stoi(user_id);
            }
            catch (const std::invalid_argument& e) {
                res.status = 400;
                std::cout << e.what() << std::endl;
                res.set_content(BAD_PARAMATER, "text/plain");
                return;
            }

            pqxx::connection DB_Connection(DB_CONNECTION_STRING);
            if (!DB_Connection.is_open()) {
                res.status = 502;
                std::cout << BAD_DB_CONNECTION << API_PATH << std::endl;
                res.set_content(BAD_DB_CONNECTION, "text/plain");
                return;
            }
            else {
                std::cout << GOOD_DB_CONNECTION << API_PATH << std::endl;
            }

            pqxx::work DB_Open_Connection{ DB_Connection };
            pqxx::result result;
            std::string file_location;
            std::string file_name;

            try {
                pqxx::result user_check = DB_Open_Connection.exec_params(
                    "SELECT * FROM users WHERE id = $1",
                    user_id_int
                );

                if (user_check.empty() || user_check[0]["access"].as<std::string>() == "viewer") {
                    res.status = 403;
                    std::cout << ACCESS_DENIED << API_PATH << std::endl;
                    res.set_content(ACCESS_DENIED, "text/plain");
                    return;
                }

                result = DB_Open_Connection.exec_params(
                    "SELECT * FROM files WHERE id = $1;",
                    file_id_int);
                if (result.empty()) { //Ensures the file exists
                    throw std::runtime_error(DB_QUERY_ERROR);
                }

                file_location = result[0]["file_location"].c_str();
                file_name = result[0]["file_name"].c_str();
            }
            catch (const std::exception& e) {
                res.status = 500;
                std::cout << e.what() << std::endl;
                res.set_content(DB_QUERY_ERROR, "text/plain"); //Sends back error to Node.js backend
                DB_Open_Connection.commit();
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
                res.set_content(BAD_PARAMATER, "text/plain");
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
                pqxx::result result = DB_Open_Connection.exec_params(
                    "UPDATE files SET file_location = $1 WHERE id = $2;",
                        new_file_location,
                        file_id_int); //Updates the location of the file in the database
            }
            catch (const std::exception& e) {
                res.status = 500;
                std::cout << e.what() << std::endl;
                res.set_content(DB_QUERY_ERROR, "text/plain"); //Sends back error to Node.js backend
                DB_Open_Connection.commit();
                return;
            }

            try {
                fs::rename(oldPath, newPath); //moves the file
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
                res.set_content(BAD_PARAMATER, "text/plain");
                return;
            }

            try {
                user_id_int = std::stoi(user_id);
            }
            catch (const std::invalid_argument& e) {
                res.status = 400;
                std::cout << e.what() << std::endl;
                res.set_content(BAD_PARAMATER, "text/plain");
                return;
            }

            pqxx::connection DB_Connection(DB_CONNECTION_STRING);
            if (!DB_Connection.is_open()) {
                res.status = 502;
                std::cout << BAD_DB_CONNECTION << API_PATH << std::endl;
                res.set_content(BAD_DB_CONNECTION, "text/plain");
                return;
            }
            else {
                std::cout << GOOD_DB_CONNECTION << API_PATH << std::endl;
            }

            pqxx::work DB_Open_Connection{ DB_Connection };

            pqxx::result result;
            std::string file_location;
            std::string file_name;
            std::string file_type;

            try {
                pqxx::result user_check = DB_Open_Connection.exec_params(
                    "SELECT * FROM users WHERE id = $1",
                    user_id_int
                );

                if (user_check.empty() || user_check[0]["access"].as<std::string>() == "viewer") {
                    res.status = 403;
                    std::cout << ACCESS_DENIED << API_PATH << std::endl;
                    res.set_content(ACCESS_DENIED, "text/plain");
                    return;
                }

                result = DB_Open_Connection.exec_params(
                    "SELECT * FROM files WHERE id = $1;",
                    file_id_int);
                if (result.empty()) { //Ensues the file exists in the database
                    throw std::runtime_error(DB_QUERY_ERROR);
                }

                file_location = result[0]["file_location"].c_str();
                file_name = result[0]["file_name"].c_str();
                file_type = result[0]["file_extension"].c_str();
            }
            catch (const std::exception& e) {
                res.status = 500;
                std::cout << e.what() << std::endl;
                res.set_content(DB_QUERY_ERROR, "text/plain"); //Sends back error to Node.js backend
                DB_Open_Connection.commit();
                return;
            }

            fs::path deletePath;
            if (!build_safe_path(file_location, file_name, deletePath)) {
                res.status = 400;
                res.set_content(BAD_PARAMATER, "text/plain");
                DB_Open_Connection.commit();
                return;
            }

            try {
                pqxx::result result = DB_Open_Connection.exec_params(
                    "DELETE FROM files WHERE id = $1;",
                    file_id_int
                );
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
                DB_Open_Connection.commit();
                return;
            }

            res.status = 200;
            res.set_content("File Successfully Deleted", "text/plain"); //API response

            DB_Open_Connection.commit();
            return;
        });


        //Extra Features

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
                res.set_content(BAD_PARAMATER, "text/plain");
                return;
            }

            pqxx::connection DB_Connection(DB_CONNECTION_STRING);
            if (!DB_Connection.is_open()) {
                res.status = 502;
                std::cout << BAD_DB_CONNECTION << API_PATH << std::endl;
                res.set_content(BAD_DB_CONNECTION, "text/plain");
                return;
            }
            else {
                std::cout << GOOD_DB_CONNECTION << API_PATH << std::endl;
            }

            pqxx::work DB_Open_Connection{ DB_Connection };
            try {
                pqxx::result result = DB_Open_Connection.exec_params(
                    ";"); //selects the file we want to rename
                if (result.empty()) { //Checks to ensure the file exists
                    throw std::runtime_error(DB_QUERY_ERROR);
                }

                pqxx::result tmpResult = DB_Open_Connection.exec_params(
                    ";");
                if (!tmpResult.empty()) { //Checks if the new name is a duplicate name
                    DB_Open_Connection.commit();
                    res.status = 409;
                    std::cout << DUPLICATE_FILE_NAME << API_PATH << std::endl;
                    res.set_content(DUPLICATE_FILE_NAME, "text/plain");
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
                res.set_content(BAD_PARAMATER, "text/plain");
                return;
            }

            pqxx::connection DB_Connection(DB_CONNECTION_STRING);
            if (!DB_Connection.is_open()) {
                res.status = 502;
                std::cout << BAD_DB_CONNECTION << API_PATH << std::endl;
                res.set_content(BAD_DB_CONNECTION, "text/plain");
                return;
            }
            else {
                std::cout << GOOD_DB_CONNECTION << API_PATH << std::endl;
            }

            pqxx::work DB_Open_Connection{ DB_Connection };
            try {
                pqxx::result result = DB_Open_Connection.exec_params(
                    ";"); //selects the file we want to rename
                if (result.empty()) { //Checks to ensure the file exists
                    throw std::runtime_error(DB_QUERY_ERROR);
                }

                pqxx::result tmpResult = DB_Open_Connection.exec_params(
                    ";");
                if (!tmpResult.empty()) { //Checks if the new name is a duplicate name
                    DB_Open_Connection.commit();
                    res.status = 409;
                    std::cout << DUPLICATE_FILE_NAME << API_PATH << std::endl;
                    res.set_content(DUPLICATE_FILE_NAME, "text/plain");
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


        //Fallback route
        svr.set_error_handler([](const httplib::Request& req, httplib::Response& res) { //Catches unknown routes
            res.status = 404;
            std::string api_error = "Endpoint not Found | or | An Uncaught Error Occurred";
            res.set_content(api_error, "text/plain");
        });



    } catch (const std::exception& e) {
        std::cout << e.what() << std::endl;
        return 1;
    }

    std::string currTime = "[" + getTimestamp() + "] ";
    std::cout << std::endl << std::endl << currTime << "Server listening on port " << PORT << " ...\n";
    svr.listen("localhost", PORT);

    //std::cout << std::endl << std::endl << "The amount of API calls made to valid endpoints are: " << api_traffic_count << std::endl;
    return api_traffic_count.load(std::memory_order_relaxed); //Returns how many API calls were made to valid endpoints while the server was open
}
