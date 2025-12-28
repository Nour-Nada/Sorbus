#include <iostream>
#include <string>
#include <fstream>
#include <filesystem>

#include "httplib.h"
#include "json.hpp"

#define PORT 8080 //Server Port

// HTTP
httplib::Server svr;

const std::string API_KEY = "test12345"; //The API key
const std::string FILE_LOCATION = "/Test_File_Storage"; //The location of the stored files


int main(void)
{

    /*svr.Get("/api/test", [](const httplib::Request& req, httplib::Response& res) { //Test API endpoint
        std::string key = req.get_header_value("key");

        if (key == API_KEY) { //Checks for matching API keys
            res.set_content("Hello World!", "text/plain");
        }
        else {
            res.set_content("Incorrect API Key", "text/plain");
        }
    });*/


    // Get Routes

    svr.Get("/api/files/name", [](const httplib::Request& req, httplib::Response& res) { //Retreving file names
        std::string key = req.get_header_value("key");

        if (key == API_KEY) { //Checks for matching API keys
            res.set_content("Placeholder for retrieving File Names", "text/plain");
        }
        else {
            res.set_content("Incorrect API Key", "text/plain");
        }
    });

    svr.Get("/api/files/download/:file_id", [](const httplib::Request& req, httplib::Response& res) { //Downloading a file
        std::string key = req.get_header_value("key");
        std::string file_id = req.get_param_value("file_id");

        if (key == API_KEY) { //Checks for matching API keys
            res.set_content("Placeholder for downloading a file", "text/plain");
        }
        else {
            res.set_content("Incorrect API Key", "text/plain");
        }
    });


    // Post Routes

    svr.Post("/api/files/upload/:file_location", [](const httplib::Request& req, httplib::Response& res) { //Deletes a file
        std::string key = req.get_header_value("key");
        std::string file_location = req.get_param_value("file_location");

        if (key == API_KEY) { //Checks for matching API keys
            res.set_content("Placeholder for uploading a file", "text/plain");
        }
        else {
            res.set_content("Incorrect API Key", "text/plain");
        }
    });


    // Patch Routes

    svr.Patch("/api/files/name/:file_id/:new_name", [](const httplib::Request& req, httplib::Response& res) { //Deletes a file
        std::string key = req.get_header_value("key");
        std::string file_id = req.get_param_value("file_id");
        std::string new_name = req.get_param_value("new_name");

        if (key == API_KEY) { //Checks for matching API keys
            res.set_content("Placeholder for renaming a file", "text/plain");
        }
        else {
            res.set_content("Incorrect API Key", "text/plain");
        }
    });

    svr.Patch("/api/files/move/:file_id/:new_file_location", [](const httplib::Request& req, httplib::Response& res) { //Deletes a file
        std::string key = req.get_header_value("key");
        std::string file_id = req.get_param_value("file_id");
        std::string new_file_location = req.get_param_value("new_file_location");

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
        std::string file_id = req.get_param_value("file_id");

        if (key == API_KEY) { //Checks for matching API keys
            res.set_content("Placeholder for deleting a file", "text/plain");
        }
        else {
            res.set_content("Incorrect API Key", "text/plain");
        }
    });

    std::cout << "Server listening on port " << PORT << " ...\n";
    svr.listen("localhost", PORT);

    return 0;
}