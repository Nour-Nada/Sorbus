#include <iostream>
#include <string>
#include <fstream>
#include <filesystem>
#include <stdio.h>
#include <sstream>

#include <pqxx/pqxx>

#include "httplib.h"
#include "json.hpp"

#define PORT 8080 //Server Port

// HTTP
httplib::Server svr;

const std::string API_KEY = "test12345"; //The API key
const std::string OUTPUT_FILE = "server_output.txt"; //Where the print statements, errors, and more gets outputted to in deployment
std::string FILE_LOCATION = "/Test_File_Storage"; //The location of the stored files


int main(void)
{
    //Opens up the file to which the output will be redirected
    std::ofstream logFile(OUTPUT_FILE, std::ios::app);
    /*
    if (!logFile.is_open()) {
        std::cerr << "Failed to open log file!" << std::endl;
        return 1;
    }
    //Redirects output of cout to the file
    std::streambuf* coutBuf = std::cout.rdbuf();  // save original buffer
    std::cout.rdbuf(logFile.rdbuf()); //changes orginal buffer
    */

    try {

        // Get Routes

        //TO-DO: Add login code
        svr.Get("/api/login", [&](const httplib::Request& req, httplib::Response& res) { //Logging in a user
            std::string key = req.get_header_value("key");

            if (key == API_KEY) { //Checks for matching API keys
                res.set_content("", "text/plain");
            }
            else {
                res.set_content("Incorrect API Key", "text/plain");
            }
        });

        svr.Get("/api/files/name/:user_id", [&](const httplib::Request& req, httplib::Response& res) { //Retrieving file names
            if (req.has_header("key")) {
                std::string key = req.get_header_value("key");
                std::string user_id = req.path_params.at("user_id");
                int user_id_int = std::stoi(user_id);

                if (key == API_KEY) { //Checks for matching API keys

                    pqxx::connection C("dbname=pyrus user=postgres password=REDACTED host=localhost");
                    if (!C.is_open()) {
                        std::cerr << "Cannot connect to database" << std::endl;
                        return;
                    }
                    else {
                        std::cout << "Connected to PostgreSQL Server in the Route: /api/files/name" << std::endl;
                    }

                    pqxx::nontransaction N{ C };
                    try {
                        pqxx::result R = N.exec(
                            pqxx::zview("SELECT * from files WHERE user_id = $1 ORDER BY file_location ASC;"),
                            user_id_int
                        );

                        nlohmann::json tree = nlohmann::json::object(); //Creates JSON object

                        for (const auto& row : R) {
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
                            if (type != "file") {
                                (*current)[file_name] = file_location;
                            }
                        }

                        //std::cout << "JSON Output: " << std::endl << tree.dump(4) << std::endl; //Output to test the JSON
                        res.status = 200;
                        res.set_content(tree.dump(), "application/json");
                    }
                    catch (const std::exception& e) {
                        res.status = 401;
                        std::cerr << e.what() << std::endl;
                        res.set_content("An Error Occurred in Accessing the Database", "text/plain"); //Sends back error to Node.js backend
                    }
                }
                else {
                    res.status = 401;
                    res.set_content("Incorrect API Key", "text/plain");
                }
            }
            else {
                res.status = 401;
                res.set_content("There is no Header with this Request", "text/plain");
            }
            return;
        });

        svr.Get("/api/files/download/:user_id/:file_id/", [](const httplib::Request& req, httplib::Response& res) { //Downloading a file
            std::string key = req.get_header_value("key");
            std::string file_id = req.path_params.at("file_id");
            std::string user_id = req.path_params.at("user_id");

            if (key == API_KEY) { //Checks for matching API keys
                res.set_content("Placeholder for downloading a file", "text/plain");
            }
            else {
                res.set_content("Incorrect API Key", "text/plain");
            }
        });


        // Post Routes

        svr.Post("/api/files/upload/:user_id/:file_location", [](const httplib::Request& req, httplib::Response& res) { //Uploading a file a file
            std::string key = req.get_header_value("key");
            std::string file_location = req.path_params.at("file_location");
            std::string user_id = req.path_params.at("user_id");

            if (key == API_KEY) { //Checks for matching API keys
                res.set_content("Placeholder for uploading a file", "text/plain");
            }
            else {
                res.set_content("Incorrect API Key", "text/plain");
            }
        });


        // Patch Routes

        svr.Patch("/api/files/name/:file_id/:new_name", [](const httplib::Request& req, httplib::Response& res) { //Renaming a file
            std::string key = req.get_header_value("key");
            std::string file_id = req.path_params.at("file_id");
            std::string new_name = req.path_params.at("new_name");

            if (key == API_KEY) { //Checks for matching API keys
                res.set_content("Placeholder for renaming a file", "text/plain");
            }
            else {
                res.set_content("Incorrect API Key", "text/plain");
            }
        });

        svr.Patch("/api/files/move/:user_id/:file_id/:new_file_location", [](const httplib::Request& req, httplib::Response& res) { //Moving a file
            std::string key = req.get_header_value("key");
            std::string file_id = req.path_params.at("file_id");
            std::string new_file_location = req.path_params.at("new_file_location");

            if (key == API_KEY) { //Checks for matching API keys
                res.set_content("Placeholder for moving a file", "text/plain");
            }
            else {
                res.set_content("Incorrect API Key", "text/plain");
            }
        });


        // Delete Routes

        svr.Delete("/api/files/delete/:file_id", [](const httplib::Request& req, httplib::Response& res) { //Deletes a file
            std::string key = req.get_header_value("key");
            std::string file_id = req.path_params.at("file_id");

            if (key == API_KEY) { //Checks for matching API keys
                res.set_content("Placeholder for deleting a file", "text/plain");
            }
            else {
                res.set_content("Incorrect API Key", "text/plain");
            }
        });


        //Fallback route
        svr.set_error_handler([](const httplib::Request& req, httplib::Response& res) { //Catches unknown routes
            res.status = 404;
            res.set_content("Endpoint not found", "text/plain");
        });

    } catch (const std::exception& e) {
        std::cerr << e.what() << std::endl;
        return 1;
    }

    std::cout << std::endl << std::endl << "Server listening on port " << PORT << " ...\n";
    svr.listen("localhost", PORT);

    return 0;
}