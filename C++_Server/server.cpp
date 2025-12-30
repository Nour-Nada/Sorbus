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
#include "httplib.h"
#include "json.hpp"

//Created headers
#include "server_functions.h"

//Namespaces
namespace fs = std::filesystem;

#define PORT 8080 //Server Port

// HTTP
httplib::Server svr;

//Global Variables
//TO-DO: Hide variables from file before deployment
const std::string API_KEY = "test12345"; //The API key
const std::string OUTPUT_FILE = "server_output.txt"; //Where the print statements, errors, and more gets outputted to in deployment
std::string FILE_LOCATION = "C:/Users/nour2/Videos/Test"; //The location of the stored files
int api_traffic_count = 0; //Counts how many API calls are made to valid endpoints while the server is still open

//Global String Errors
const std::string BAD_DB_CONNECTION = "Cannot Connect to Database; API Path ";
const std::string NO_HEADER = "There is no Header Attached with this Request.";
const std::string INCORRECT_API_KEY = "Incorrect API Key.";
const std::string DB_QUERY_ERROR = "An Error Occurred in Querying the Database; API Path ";
const std::string BAD_PARAMATER = "An Incorrect Parameter was Passed In; API Path ";
const std::string UNABLE_TO_RENAME = "The System was Unable to Rename This File.";

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

    try {

        // Get Routes

        //TO-DO: Add login code
        svr.Get("/api/login", [&](const httplib::Request& req, httplib::Response& res) { //Logging in a user
            LOG_TIME();
            LOG_CALL();
            std::cout << time;
            if (req.has_header("key")) {
                std::string API_PATH = "GET: /api/login";
                std::string key = req.get_header_value("key");

                if (key != API_KEY) { //Checks for matching API keys
                    res.status = 401;
                    std::cout << INCORRECT_API_KEY << API_PATH << std::endl;
                    res.set_content(INCORRECT_API_KEY, "text/plain");
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
            }
            else {
                res.status = 400;
                res.set_content(NO_HEADER, "text/plain");
            }
            return;
        });

        svr.Get("/api/files/name/:user_id", [&](const httplib::Request& req, httplib::Response& res) { //Retrieving file names
            LOG_TIME();
            LOG_CALL();
            if (req.has_header("key")) {
                std::string API_PATH = "GET: /api/files/name"; //Path in variable for error messages
                std::string key = req.get_header_value("key");
                std::string user_id = req.path_params.at("user_id");

                int user_id_int = 0;
                try {
                    user_id_int = std::stoi(user_id);
                } catch (const std::invalid_argument& e) {
                    std::cout << e.what() << std::endl;
                    res.set_content(BAD_PARAMATER, "text/plain");
                    return;
                }

                if (key != API_KEY) { //Checks for matching API keys
                    res.status = 401;
                    std::cout << INCORRECT_API_KEY << API_PATH << std::endl;
                    res.set_content(INCORRECT_API_KEY, "text/plain");
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
            }
            else {
                res.status = 400;
                res.set_content(NO_HEADER, "text/plain");
            }
            return;
        });

        //TO-DO: Implement downloading file logic
        svr.Get("/api/files/download/:user_id/:file_id/", [](const httplib::Request& req, httplib::Response& res) { //Downloading a file
            LOG_TIME();
            LOG_CALL();
            if (req.has_header("key")) {
                std::string API_PATH = "GET: /api/files/download";
                std::string key = req.get_header_value("key");
                std::string file_id = req.path_params.at("file_id");
                std::string user_id = req.path_params.at("user_id");

                if (key != API_KEY) { //Checks for matching API keys
                    res.status = 401;
                    std::cout << INCORRECT_API_KEY << API_PATH << std::endl;
                    res.set_content(INCORRECT_API_KEY, "text/plain");
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
                        pqxx::zview("Query Goes Here;")
                    );

                    res.status = 200;
                    res.set_content("{}", "application/json"); //API response
                }
                catch (const std::exception& e) {
                    res.status = 500;
                    std::cout << e.what() << std::endl;
                    res.set_content(DB_QUERY_ERROR, "text/plain"); //Sends back error to Node.js backend
                }
            }
            else {
                res.status = 400;
                res.set_content(NO_HEADER, "text/plain");
            }
            return;
        });


        // Post Routes

        //TO-DO: Implement uploading file logic
        svr.Post("/api/files/upload/:user_id/:file_location", [](const httplib::Request& req, httplib::Response& res) { //Uploading a file a file
            LOG_TIME();
            LOG_CALL();
            if (req.has_header("key")) {
                std::string API_PATH = "POST: /api/files/upload";
                std::string key = req.get_header_value("key");
                std::string file_location = req.path_params.at("file_location");
                std::string user_id = req.path_params.at("user_id");

                if (key != API_KEY) { //Checks for matching API keys
                    res.status = 401;
                    std::cout << INCORRECT_API_KEY << API_PATH << std::endl;
                    res.set_content(INCORRECT_API_KEY, "text/plain");
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
                        pqxx::zview("Query Goes Here;")
                    );

                    res.status = 200;
                    res.set_content("{}", "application/json"); //API response
                }
                catch (const std::exception& e) {
                    res.status = 500;
                    std::cout << e.what() << std::endl;
                    res.set_content(DB_QUERY_ERROR, "text/plain"); //Sends back error to Node.js backend
                }
            }
            else {
                res.status = 400;
                res.set_content(NO_HEADER, "text/plain");
            }
            return;
        });


        // Patch Routes

        svr.Patch("/api/files/name/:file_id/:new_name", [](const httplib::Request& req, httplib::Response& res) { //Renaming a file
            LOG_TIME();
            LOG_CALL();
            if (req.has_header("key")) {
                std::string API_PATH = "PATCH: /api/files/name";
                std::string key = req.get_header_value("key");
                std::string file_id = req.path_params.at("file_id");
                std::string new_name = req.path_params.at("new_name");

                int tmp = 0; //checks if error is thrown during renaming

                int file_id_int = 0;
                try {
                    file_id_int = std::stoi(file_id);
                }
                catch (const std::invalid_argument& e) {
                    std::cout << e.what() << std::endl;
                    res.set_content(BAD_PARAMATER, "text/plain");
                    return;
                }

                if (key != API_KEY) { //Checks for matching API keys
                    res.status = 401;
                    std::cout << INCORRECT_API_KEY << API_PATH << std::endl;
                    res.set_content(INCORRECT_API_KEY, "text/plain");
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

                    std::string file_location = result[0]["file_location"].c_str();
                    std::string file_name = result[0]["file_name"].c_str();
                    std::string type = result[0]["file_extension"].c_str();

                    //TO-DO: Check to make sure the file does not already exist by checking the database

                    std::string file_location_edit = file_location;
                    if (!file_location_edit.empty() && file_location_edit[0] == '/') {
                        file_location_edit.erase(0, 1);
                    }

                    std::filesystem::path basePath(FILE_LOCATION);
                    std::filesystem::path fullPath = (basePath / file_location_edit / file_name);
                    std::filesystem::path newPath = (basePath / file_location_edit / new_name);

                    try {
                        fs::rename(fullPath, newPath);
                    } catch (const std::exception& e) {
                        tmp = 1;
                        res.status = 500;
                        std::cout << e.what() << std::endl;
                        res.set_content(UNABLE_TO_RENAME, "text/plain"); //Sends back error to Node.js backend
                    }

                    if (tmp != 1) { //checks if error was thrown during renaming
                        DB_Open_Connection.exec_params(
                            "UPDATE files SET file_name = $1 WHERE id = $2;",
                                new_name, file_id_int);
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
            }
            else {
                res.status = 400;
                res.set_content(NO_HEADER, "text/plain");
            }
            return;
        });

        svr.Patch("/api/files/move/:user_id/:file_id/:new_file_location", [](const httplib::Request& req, httplib::Response& res) { //Moving a file
            LOG_TIME();
            LOG_CALL();
            if (req.has_header("key")) {
                std::string API_PATH = "PATCH: /api/files/move";
                std::string key = req.get_header_value("key");
                std::string file_id = req.path_params.at("file_id");
                std::string new_file_location = req.path_params.at("new_file_location");

                if (key != API_KEY) { //Checks for matching API keys
                    res.status = 401;
                    std::cout << INCORRECT_API_KEY << API_PATH << std::endl;
                    res.set_content(INCORRECT_API_KEY, "text/plain");
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
                        pqxx::zview("Query Goes Here;")
                    );

                    res.status = 200;
                    res.set_content("{}", "application/json"); //API response
                }
                catch (const std::exception& e) {
                    res.status = 500;
                    std::cout << e.what() << std::endl;
                    res.set_content(DB_QUERY_ERROR, "text/plain"); //Sends back error to Node.js backend
                }
            }
            else {
                res.status = 400;
                res.set_content(NO_HEADER, "text/plain");
            }
            return;
        });


        // Delete Routes

        svr.Delete("/api/files/delete/:file_id", [](const httplib::Request& req, httplib::Response& res) { //Deletes a file
            LOG_TIME();
            LOG_CALL();
            if (req.has_header("key")) {
                std::string API_PATH = "DELETE: /api/files/delete";
                std::string key = req.get_header_value("key");
                std::string file_id = req.path_params.at("file_id");

                if (key != API_KEY) { //Checks for matching API keys
                    res.status = 401;
                    std::cout << INCORRECT_API_KEY << API_PATH << std::endl;
                    res.set_content(INCORRECT_API_KEY, "text/plain");
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
                        pqxx::zview("Query Goes Here;")
                    );

                    res.status = 200;
                    res.set_content("{}", "application/json"); //API response
                }
                catch (const std::exception& e) {
                    res.status = 500;
                    std::cout << e.what() << std::endl;
                    res.set_content(DB_QUERY_ERROR, "text/plain"); //Sends back error to Node.js backend
                }
            }
            else {
                res.status = 400;
                res.set_content(NO_HEADER, "text/plain");
            }
            return;
        });


        //Fallback route
        svr.set_error_handler([](const httplib::Request& req, httplib::Response& res) { //Catches unknown routes
            res.status = 404;
            std::string time = getTimestamp();
            std::string api_error = "[" + time + "] " + "Endpoint not Found | or | An Uncaught Error Occurred";
            res.set_content(api_error, "text/plain");
        });

    } catch (const std::exception& e) {
        std::cerr << e.what() << std::endl;
        return 1;
    }

    std::string currTime = "[" + getTimestamp() + "] ";
    std::cout << std::endl << std::endl << currTime << "Server listening on port " << PORT << " ...\n";
    svr.listen("localhost", PORT);

    return api_traffic_count; //Returns how many API calls were made to valid endpoints while the server was open
}