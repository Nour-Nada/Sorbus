#include <chrono>
#include <ctime>
#include <sstream>
#include <iomanip>
#include <string>

std::string getTimestamp() { //Gets timestamp in format YYYY-MM-DD HH:MM:SS
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