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
const std::string API_KEY = "test12345"; //The API key
const std::string OUTPUT_FILE = "server_output.txt"; //Where the print statements, errors, and more gets outputted to in deployment
std::string FILE_LOCATION = "C:/Users/nour2/Videos/Test"; //The location of the stored files
int api_traffic_count = 0; //Counts how many API calls are made to valid endpoints while the server is still open

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
const std::string UNABLE_TO_UPLOAD_FILE = "The File Was Not Uploaded;";

//Global String Success
const std::string GOOD_DB_CONNECTION = "Connected to PostgreSQL Server; API Path ";

//Global helper functions
#define LOG_TIME() std::cout << std::endl << "[" << getTimestamp() << "] " << std::endl;
#define LOG_CALL() api_traffic_count++;



int main(void)
{
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

    svr.set_pre_request_handler([&](const httplib::Request& req, httplib::Response& res) {
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

            return httplib::Server::HandlerResponse::Unhandled;
        }
    );

    try {

        // Auth Routes

        //TO-DO: Add login and signup functionality
        svr.Post("/api/login", [&](const httplib::Request& req, httplib::Response& res) { //Logging in a user
            LOG_CALL();
                std::string API_PATH = "GET: /api/login";
                std::string key = req.get_header_value("key");

                pqxx::connection DB_Connection("dbname=pyrus user=postgres password=REDACTED host=localhost");
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
                        pqxx::zview("Query Goes Here;")
                    );

                    //Code goes here

                    res.status = 200;
                    res.set_content("{}", "application/json"); //API response
                }
                catch (const std::exception& e) {
                    res.status = 500;
                    std::cout << e.what() << std::endl;
                    res.set_content(DB_QUERY_ERROR, "text/plain"); //Sends back error to Node.js backend
                }

            return;
        });

        svr.Post("/api/signup", [&](const httplib::Request& req, httplib::Response& res) { //Logging in a user
            LOG_CALL();
            std::string API_PATH = "GET: /api/login";
            std::string key = req.get_header_value("key");

            pqxx::connection DB_Connection("dbname=pyrus user=postgres password=REDACTED host=localhost");
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
                    pqxx::zview("Query Goes Here;")
                );

                //Code goes here

                res.status = 200;
                res.set_content("{}", "application/json"); //API response
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
            std::string key = req.get_header_value("key");
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

            pqxx::connection DB_Connection("dbname=pyrus user=postgres password=REDACTED host=localhost");
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
                    pqxx::zview("SELECT * from files WHERE user_id = $1 ORDER BY file_location ASC;"),
                    user_id_int
                );

                nlohmann::json tree = nlohmann::json::object(); //Creates JSON object

                for (const auto& row : result) {
                    std::string file_location = row["file_location"].c_str();
                    std::string file_name = row["file_name"].c_str();
                    std::string type = row["file_extension"].c_str(); // "file" or "folder"

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
                        (*current)[file_name] = file_location;
                    }
                }

                //std::cout << "JSON Output: " << std::endl << tree.dump(4) << std::endl; //Output to test the JSON
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

        svr.Get("/api/files/download/:file_id", [](const httplib::Request& req, httplib::Response& res) { //Downloading a file or folder
            LOG_CALL();
            std::string API_PATH = "GET: /api/files/download";
            std::string key = req.get_header_value("key");
            std::string file_id = req.path_params.at("file_id");

            int file_id_int = 0;
            try {
                file_id_int = std::stoi(file_id);
            }
            catch (const std::invalid_argument& e) {
                res.status = 400;
                std::cout << e.what() << std::endl;
                res.set_content(BAD_PARAMATER, "text/plain");
                return;
            }

            pqxx::connection DB_Connection("dbname=pyrus user=postgres password=REDACTED host=localhost");
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
                result = DB_Open_Connection.exec_params(
                    "SELECT * FROM files WHERE id = $1;",
                    file_id_int
                );
                if (result.empty()) {
                    throw std::runtime_error(DB_QUERY_ERROR);
                }
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

            std::string file_path = FILE_LOCATION + file_location + "/" + file_name;

            if (type == "folder") {

                fs::path folder_path = file_path;

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
            }



            auto file = std::make_shared<std::ifstream>(file_path, std::ios::binary);

            if (!file->is_open()) {
                res.status = 404;
                std::cout << UNOPEN_FILE << API_PATH << std::endl;
                res.set_content("File not found", "text/plain");
                return;
            }
            res.set_header("Content-Type", "application/octet-stream");
            res.set_header("Content-Disposition",
                "attachment; filename=\"" + fs::path(file_path).filename().string() + "\"");

            res.set_chunked_content_provider(
                "application/octet-stream",
                [file](size_t, httplib::DataSink& sink) mutable {
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
                }
            );

            //delete zip file
            /*if (type == "folder" && fs::exists(file_path)) {
                fs::remove(file_path);
            }*/

            res.status = 200;
            return;
        });


        // Post Routes
        
        svr.Post("/api/files/upload/:user_id", [](const httplib::Request& req, httplib::Response& res, const httplib::ContentReader& content_reader) { //Uploading a file
            LOG_CALL();
            std::string API_PATH = "POST: /api/files/upload";
            std::string key = req.get_header_value("key");
            std::string user_id = req.path_params.at("user_id");
            std::string file_name;
            std::string file_location;

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


            if (file_location == "/") {
                file_location = "";
            }
            std::string file_path_check = FILE_LOCATION + file_location;
            std::string file_path = FILE_LOCATION + file_location + "/" + file_name;
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
            std::ofstream out_file(file_path, std::ios::binary);
            if (!out_file.is_open()) {
                res.status = 500;
                return;
            }

            // Stream incoming data directly to disk
            bool write_success = true;
            size_t total_bytes = 0;

            content_reader([&](const char* data, size_t data_length) {
                if (write_success) {
                    out_file.write(data, data_length);
                    if (out_file.good()) {
                        total_bytes += data_length;
                        return true; // Continue reading
                    }
                    else {
                        write_success = false;
                        std::cout << "Failed to write data to file" << std::endl;
                        return false; // Stop reading
                    }
                }
                return false;
            });

            out_file.close();

            // Check if streaming was successful
            if (!write_success) {
                res.status = 500;
                std::cout << "File write failed after " << total_bytes << " bytes" << std::endl;
                res.set_content("Failed to Write File", "text/plain");
                std::filesystem::remove(file_path); // Clean up partial file
                return;
            }

            std::cout << "Successfully wrote " << total_bytes << " bytes to " << file_path << std::endl;

            auto get_file_extension = [](const std::string& file_name) -> std::string {
                size_t dot_pos = file_name.find_last_of('.');
                if (dot_pos == std::string::npos || dot_pos == file_name.length() - 1) {
                    return "";
                }
                return file_name.substr(dot_pos + 1);
            };
            std::string extension = get_file_extension(file_name);

            pqxx::connection DB_Connection("dbname=pyrus user=postgres password=REDACTED host=localhost");
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
                    "INSERT INTO files (user_id, file_name, file_location, file_size, file_extension) VALUES ($1, $2, $3, $4, '.txt');",
                        user_id_int, file_name, file_location, total_bytes, extension
                );
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
            std::string key = req.get_header_value("key");
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

            pqxx::connection DB_Connection("dbname=pyrus user=postgres password=REDACTED host=localhost");
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
                pqxx::result tmpResult = DB_Open_Connection.exec_params(
                    "SELECT * from files WHERE file_name = $1;",
                    new_name);
                if (!tmpResult.empty()) { //Checks if the new name is a duplicate name
                    DB_Open_Connection.commit();
                    res.status = 409;
                    std::cout << "A File With This Name Already Exists in the Same Folder; API Path " << API_PATH << std::endl;
                    res.set_content("A File With This Name Already Exists in the Same Folder", "text/plain");
                    return;
                }

                fs::path basePath(FILE_LOCATION);

                std::string folder_path_edit = folder_path;
                if (!folder_path.empty() &&
                    (folder_path[0] == '/' || folder_path[0] == '\\')) {
                    folder_path_edit.erase(0, 1);
                }

                fs::path newPath = basePath / folder_path_edit / new_name;

                newPath = fs::absolute(newPath);

                try {
                    fs::create_directory(newPath);
                }
                catch (const std::exception& e) {
                    res.status = 500;
                    std::cout << e.what() << std::endl;
                    res.set_content(UNABLE_TO_CREATE_FOLDER, "text/plain"); //Sends back error to Node.js backend
                    return;
                }


                pqxx::result result = DB_Open_Connection.exec_params(
                    "INSERT INTO files (user_id, file_name, file_location, file_extension, file_size) VALUES ($1, $2, $3, $4, $5);",
                    user_id_int, new_name, folder_path, "folder", -1
                );

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

        svr.Patch("/api/files/name/:file_id", [](const httplib::Request& req, httplib::Response& res) { //Renaming a file
            LOG_CALL();
            std::string API_PATH = "PATCH: /api/files/name";
            std::string key = req.get_header_value("key");
            std::string file_id = req.path_params.at("file_id");
            std::string new_name = req.path_params.at("new_name");

            int file_id_int = 0;
            try {
                file_id_int = std::stoi(file_id);
            }
            catch (const std::invalid_argument& e) {
                res.status = 400;
                std::cout << e.what() << std::endl;
                res.set_content(BAD_PARAMATER, "text/plain");
                return;
            }

            pqxx::connection DB_Connection("dbname=pyrus user=postgres password=REDACTED host=localhost");
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
                    "SELECT * from files WHERE id = $1;",
                    file_id_int);
                if (result.empty()) {
                    throw std::runtime_error(DB_QUERY_ERROR);
                }

                std::string file_location = result[0]["file_location"].c_str();
                std::string file_name = result[0]["file_name"].c_str();
                std::string type = result[0]["file_extension"].c_str();

                //TO-DO: Check to make sure the file does not already exist by checking the database

                pqxx::result tmpResult = DB_Open_Connection.exec_params(
                    "SELECT * from files WHERE file_name = $1;",
                    new_name);
                if (!tmpResult.empty()) { //Checks if the new name is a duplicate name
                    DB_Open_Connection.commit();
                    res.status = 409;
                    std::cout << "A File With This Name Already Exists in the Same Folder; API Path " << API_PATH << std::endl;
                    res.set_content("A File With This Name Already Exists in the Same Folder", "text/plain");
                    return;
                }

                std::string file_location_edit = file_location;
                if (!file_location_edit.empty() && file_location_edit[0] == '/') {
                    file_location_edit.erase(0, 1);
                }

                fs::path basePath(FILE_LOCATION);
                fs::path fullPath = (basePath / file_location_edit / file_name);
                fs::path newPath = (basePath / file_location_edit / new_name);

                try {
                    fs::rename(fullPath, newPath);
                } catch (const std::exception& e) {
                    res.status = 500;
                    std::cout << e.what() << std::endl;
                    res.set_content(UNABLE_TO_RENAME, "text/plain"); //Sends back error to Node.js backend
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

        svr.Patch("/api/files/move/:file_id", [](const httplib::Request& req, httplib::Response& res) { //Moving a file
            LOG_CALL();
            std::string API_PATH = "PATCH: /api/files/move";
            std::string key = req.get_header_value("key");
            std::string file_id = req.path_params.at("file_id");

            int file_id_int = 0;
            try {
                file_id_int = std::stoi(file_id);
            }
            catch (const std::invalid_argument& e) {
                res.status = 400;
                std::cout << e.what() << std::endl;
                res.set_content(BAD_PARAMATER, "text/plain");
                return;
            }

            pqxx::connection DB_Connection("dbname=pyrus user=postgres password=REDACTED host=localhost");
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
                result = DB_Open_Connection.exec_params(
                    "SELECT * FROM files WHERE id = $1;",
                    file_id_int);
                if (result.empty()) {
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

            fs::path basePath(FILE_LOCATION);

            std::string file_location_edit_new = new_file_location;
            if (!file_location_edit_new.empty() && file_location_edit_new[0] == '/') {
                file_location_edit_new.erase(0, 1);
            }

            std::string file_location_edit = file_location;
            if (!file_location_edit.empty() && file_location_edit[0] == '/') {
                file_location_edit.erase(0, 1);
            }

            // Build paths
            fs::path oldPath = basePath / file_location_edit / file_name;
            fs::path newPath = basePath / file_location_edit_new / file_name;

            newPath = fs::absolute(newPath);
            oldPath = fs::absolute(oldPath);

            try {
                fs::rename(oldPath, newPath);
            }
            catch (const std::exception& e) {
                res.status = 500;
                std::cout << e.what() << std::endl;
                res.set_content(UNABLE_TO_MOVE, "text/plain"); //Sends back error to Node.js backend
                return;
            }

            try {
                pqxx::result result = DB_Open_Connection.exec_params(
                    "UPDATE files SET file_location = $1 WHERE id = $2;",
                        new_file_location,
                        file_id_int);
            }
            catch (const std::exception& e) {
                res.status = 500;
                std::cout << e.what() << std::endl;
                res.set_content(DB_QUERY_ERROR, "text/plain"); //Sends back error to Node.js backend
                DB_Open_Connection.commit();
                return;
            }

            res.status = 200;
            res.set_content("File Successfully Moved", "text/plain"); //API response

            DB_Open_Connection.commit();

            return;
        });


        // Delete Routes

        svr.Delete("/api/files/delete/:file_id", [](const httplib::Request& req, httplib::Response& res) { //Deletes a file
            std::string API_PATH = "DELETE: /api/files/delete";
            std::string key = req.get_header_value("key");
            std::string file_id = req.path_params.at("file_id");

            int file_id_int = 0;
            try {
                file_id_int = std::stoi(file_id);
            }
            catch (const std::invalid_argument& e) {
                res.status = 400;
                std::cout << e.what() << std::endl;
                res.set_content(BAD_PARAMATER, "text/plain");
                return;
            }

            pqxx::connection DB_Connection("dbname=pyrus user=postgres password=REDACTED host=localhost");
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
                result = DB_Open_Connection.exec_params(
                    "SELECT * FROM files WHERE id = $1;",
                    file_id_int);
                if (result.empty()) {
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

            fs::path basePath(FILE_LOCATION);

            // Build paths
            std::string file_location_edit = file_location;
            if (!file_location_edit.empty() && file_location_edit[0] == '/') {
                file_location_edit.erase(0, 1);
            }

            fs::path deletePath = basePath / file_location_edit / file_name;

            deletePath = fs::absolute(deletePath);

            try {
                if (fs::exists(deletePath)) { //The reason that this action has a checked but not preovus actions is because deleting a file with an unkown path could cause uninted things therefore it is just better to check it
                    fs::remove(deletePath);
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

            res.status = 200;
            res.set_content("File Successfully Deleted", "text/plain"); //API response

            DB_Open_Connection.commit();
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
    return api_traffic_count; //Returns how many API calls were made to valid endpoints while the server was open
}