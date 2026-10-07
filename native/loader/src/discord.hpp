// Discord Rich Presence for a run: "Playing Diablo II", with the title and how long it has run.
//
// Discord's local RPC: a named pipe, \\.\pipe\discord-ipc-0 (to -9), carrying frames of
// [int32 opcode][int32 length][UTF-8 JSON]. Opcode 0 is the handshake ({"v":1,"client_id":…},
// answered by a READY dispatch), 1 a command such as SET_ACTIVITY. An activity belongs to the pid
// that set it, and Discord drops it when that connection closes, so it ends with the launcher.
//
// Everything runs on its own thread and nothing waits on Discord: the game starts whether Discord is
// running, slow, or absent. Without Discord it tries again after 2 s, 5 s, then every 15 s (Discord
// refuses a moment after another client disconnects); when Discord restarts, it connects again and
// sets the activity again.

#pragma once

#include "common.hpp"

#include <algorithm>
#include <atomic>

namespace discord {

class Presence {
public:
    // `activity` is a JSON object from Exordium (details, state, …); the start time is added here.
    Presence(std::string clientId, std::string activity, long long startedAtMs)
        : clientId_(std::move(clientId)), activity_(std::move(activity)), startSeconds_(startedAtMs / 1000) {}

    Presence(const Presence&) = delete;
    Presence& operator=(const Presence&) = delete;

    ~Presence() { stop(); }

    void start(DWORD activityPid = GetCurrentProcessId()) {
        if (clientId_.empty() || activity_.empty() || thread_) return;
        activityPid_ = activityPid ? activityPid : GetCurrentProcessId();
        stopEvent_ = CreateEventW(nullptr, TRUE, FALSE, nullptr);
        if (!stopEvent_) return;
        thread_ = CreateThread(nullptr, 0, &Presence::thread_main, this, 0, nullptr);
        started_ = thread_ != nullptr;
    }

    // For the run's log: whether Discord ever showed the activity.
    std::string outcome() const {
        if (!started_) return "off";
        return shown_ > 0 ? "shown " + std::to_string(shown_.load()) + " time(s)" : "Discord not reached";
    }

    // Clears the activity and disconnects; waits briefly, so a stuck pipe never holds the launcher.
    void stop() {
        if (!thread_) return;
        SetEvent(stopEvent_);
        WaitForSingleObject(thread_, 3000);
        CloseHandle(thread_);
        CloseHandle(stopEvent_);
        thread_ = nullptr;
        stopEvent_ = nullptr;
    }

private:
    static DWORD WINAPI thread_main(void* self) {
        static_cast<Presence*>(self)->run();
        return 0;
    }

    void run() {
        static constexpr DWORD kRetryMs[] = {2000, 5000, 15000};
        int failures = 0;
        while (true) {
            if (connect() && handshake() && set_activity()) {
                ++shown_;
                failures = 0;
                // Connected: watch for Discord going away until the run ends.
                while (WaitForSingleObject(stopEvent_, 5000) == WAIT_TIMEOUT) {
                    DWORD available = 0;
                    if (!PeekNamedPipe(pipe_, nullptr, 0, nullptr, &available, nullptr)) break;
                    if (available > 0) {
                        std::string ignored;
                        if (!read_frame(ignored, 0)) break;
                    }
                }
                if (WaitForSingleObject(stopEvent_, 0) == WAIT_OBJECT_0) {
                    clear();
                    disconnect();
                    return;
                }
            }
            disconnect();
            const DWORD wait = kRetryMs[(std::min)(failures++, 2)];
            if (WaitForSingleObject(stopEvent_, wait) != WAIT_TIMEOUT) return;
        }
    }

    bool connect() {
        for (int i = 0; i < 10; ++i) {
            const std::wstring name = L"\\\\.\\pipe\\discord-ipc-" + std::to_wstring(i);
            pipe_ = CreateFileW(name.c_str(), GENERIC_READ | GENERIC_WRITE, 0, nullptr, OPEN_EXISTING, 0, nullptr);
            if (pipe_ != INVALID_HANDLE_VALUE) return true;
        }
        pipe_ = INVALID_HANDLE_VALUE;
        return false;
    }

    void disconnect() {
        if (pipe_ != INVALID_HANDLE_VALUE) CloseHandle(pipe_);
        pipe_ = INVALID_HANDLE_VALUE;
    }

    bool write_frame(int opcode, const std::string& json) {
        std::string frame(8, '\0');
        const std::int32_t header[2] = {opcode, static_cast<std::int32_t>(json.size())};
        std::memcpy(frame.data(), header, sizeof(header));
        frame += json;
        DWORD written = 0;
        return WriteFile(pipe_, frame.data(), static_cast<DWORD>(frame.size()), &written, nullptr) &&
               written == frame.size();
    }

    // Reads `count` bytes, polling so a silent Discord costs at most `timeoutMs` rather than forever.
    bool read_exact(char* out, DWORD count, DWORD timeoutMs) {
        const ULONGLONG deadline = GetTickCount64() + timeoutMs;
        DWORD got = 0;
        while (got < count) {
            DWORD available = 0;
            if (!PeekNamedPipe(pipe_, nullptr, 0, nullptr, &available, nullptr)) return false;
            if (available == 0) {
                if (GetTickCount64() >= deadline) return false;
                Sleep(25);
                continue;
            }
            DWORD read = 0;
            if (!ReadFile(pipe_, out + got, (std::min)(available, count - got), &read, nullptr) || read == 0) return false;
            got += read;
        }
        return true;
    }

    bool read_frame(std::string& json, DWORD timeoutMs = 5000) {
        std::int32_t header[2]{};
        if (!read_exact(reinterpret_cast<char*>(header), sizeof(header), timeoutMs)) return false;
        if (header[1] < 0 || header[1] > (1 << 20)) return false;
        json.assign(static_cast<size_t>(header[1]), '\0');
        return header[1] == 0 || read_exact(json.data(), static_cast<DWORD>(header[1]), 5000);
    }

    bool handshake() {
        std::string reply;
        return write_frame(0, "{\"v\":1,\"client_id\":\"" + clientId_ + "\"}") && read_frame(reply) &&
               reply.find("\"READY\"") != std::string::npos;
    }

    std::string command(const std::string& activity) {
        return "{\"cmd\":\"SET_ACTIVITY\",\"nonce\":\"" + std::to_string(++nonce_) + "\",\"args\":{\"pid\":" +
               std::to_string(activityPid_) + (activity.empty() ? "" : ",\"activity\":" + activity) + "}}";
    }

    bool set_activity() {
        // The activity with the run's start, so Discord counts the elapsed time.
        std::string activity = activity_;
        const size_t close = activity.find_last_of('}');
        if (close == std::string::npos) return false;
        const bool empty = activity.find_first_not_of(" \t\r\n", activity.find('{') + 1) == close;
        activity.insert(close, std::string(empty ? "" : ",") + "\"timestamps\":{\"start\":" + std::to_string(startSeconds_) + "}");
        std::string reply;
        return write_frame(1, command(activity)) && read_frame(reply) && reply.find("\"ERROR\"") == std::string::npos;
    }

    void clear() {
        std::string reply;
        if (write_frame(1, command(""))) read_frame(reply, 1000);
    }

    std::string clientId_;
    std::string activity_;
    long long startSeconds_;
    DWORD activityPid_ = GetCurrentProcessId();
    int nonce_ = 0;
    std::atomic<int> shown_{0};
    bool started_ = false;
    HANDLE pipe_ = INVALID_HANDLE_VALUE;
    HANDLE thread_ = nullptr;
    HANDLE stopEvent_ = nullptr;
};

} // namespace discord
