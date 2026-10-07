// exordium-launch.exe: the detached runner for boxes that keep Blizzard's own Game.exe, and the
// process that keeps their run record.
//
// It starts the game and waits for it, so it lives exactly as long as a run, whoever asked for the
// run and whether or not Exordium stays open. That makes it the owner of the session file Exordium
// watches ("Playing") and of the play-time ledger. Vault: Projects/Exordium/Decisions/Sessions
// Are Kept by the Launcher.md.
//
// - 1.00-1.06b cores: the game is the core's original Game.exe. It starts suspended, gets
//   exordium-hook.dll in registry-only mode, and then runs with the box's private registry.
// - 1.14 cores: the game is Blizzard's Game.exe, which is the whole game. It starts suspended, gets
//   exordium-hook.dll on a remote thread, and runs only once ExordiumHookStart has set up the box's
//   registry and the mod's archives.
// - 1.07-1.13d cores do not use this launcher in the box: Exordium starts the loader Game.exe
//   directly with --detach and tracks it from the desktop server.
//
// It imports nothing of the game (no Storm), so it runs in any box, and it answers the commands
// Exordium sends: --detach, --wait and --dump-hive.

#include "common.hpp"

namespace {

constexpr const char* kHookStart = "ExordiumHookStart";
constexpr const char* kCompatLayer = "WIN7RTM";

std::wstring full_path(const std::wstring& name) {
    wchar_t buffer[MAX_PATH]{};
    const DWORD length = GetFullPathNameW(name.c_str(), MAX_PATH, buffer, nullptr);
    return length > 0 && length < MAX_PATH ? std::wstring(buffer, length) : name;
}

std::wstring quote_arg(const std::wstring& text) {
    std::wstring out = L"\"";
    for (const wchar_t c : text) {
        if (c == L'"') out += L"\\\"";
        else out.push_back(c);
    }
    out += L"\"";
    return out;
}

// ---- The session record ------------------------------------------------------------------------

std::string json_quote(const std::string& text) {
    std::string out = "\"";
    for (const char c : text) {
        switch (c) {
        case '"': out += "\\\""; break;
        case '\\': out += "\\\\"; break;
        case '\n': out += "\\n"; break;
        case '\r': out += "\\r"; break;
        case '\t': out += "\\t"; break;
        default:
            if (static_cast<unsigned char>(c) < 0x20) {
                char escaped[8]{};
                std::snprintf(escaped, sizeof(escaped), "\\u%04x", static_cast<unsigned>(c));
                out += escaped;
            } else {
                out.push_back(c);
            }
        }
    }
    return out + "\"";
}

// Milliseconds since 1970 from a FILETIME.
long long unix_ms(const FILETIME& time) {
    ULARGE_INTEGER value{};
    value.LowPart = time.dwLowDateTime;
    value.HighPart = time.dwHighDateTime;
    return static_cast<long long>((value.QuadPart - 116444736000000000ULL) / 10000ULL);
}

long long now_ms() {
    FILETIME now{};
    GetSystemTimeAsFileTime(&now);
    return unix_ms(now);
}

// When a process started: with its pid, what tells it apart from a later process given the same pid.
long long created_ms(HANDLE process) {
    FILETIME created{}, exited{}, kernel{}, user{};
    return GetProcessTimes(process, &created, &exited, &kernel, &user) ? unix_ms(created) : 0;
}

std::string iso_time(long long ms) {
    ULARGE_INTEGER value{};
    value.QuadPart = static_cast<ULONGLONG>(ms) * 10000ULL + 116444736000000000ULL;
    FILETIME file{};
    file.dwLowDateTime = value.LowPart;
    file.dwHighDateTime = value.HighPart;
    SYSTEMTIME time{};
    FileTimeToSystemTime(&file, &time);
    char buffer[32]{};
    std::snprintf(buffer, sizeof(buffer), "%04u-%02u-%02uT%02u:%02u:%02u.%03uZ", time.wYear, time.wMonth, time.wDay,
        time.wHour, time.wMinute, time.wSecond, time.wMilliseconds);
    return buffer;
}

// One run, as Exordium reads it from sessions\<box>.<copy>.json. Written whole each time, through a
// temporary file, so a reader never sees half of it.
struct Session {
    std::string file;
    std::string ledger;
    std::string key;
    std::string title;
    std::string boxId;
    int copy = 1;
    long long launcherCreated = 0;
    long long startedAt = 0;
    std::string state = "starting";
    DWORD gamePid = 0;
    long long gameCreated = 0;
    long long endedAt = 0;
    bool exited = false;
    DWORD exitCode = 0;
    std::string reason;
    std::string registryDump;

    void write() const {
        if (file.empty()) return;
        std::string json = "{\n";
        json += "  \"version\": 1,\n";
        json += "  \"key\": " + json_quote(key) + ",\n";
        json += "  \"title\": " + json_quote(title) + ",\n";
        json += "  \"boxId\": " + json_quote(boxId) + ",\n";
        json += "  \"copy\": " + std::to_string(copy) + ",\n";
        json += "  \"state\": " + json_quote(state) + ",\n";
        json += "  \"launcherPid\": " + std::to_string(GetCurrentProcessId()) + ",\n";
        json += "  \"launcherCreated\": " + std::to_string(launcherCreated) + ",\n";
        json += "  \"gamePid\": " + std::to_string(gamePid) + ",\n";
        json += "  \"gameCreated\": " + std::to_string(gameCreated) + ",\n";
        json += "  \"startedAt\": " + json_quote(iso_time(startedAt)) + ",\n";
        json += "  \"endedAt\": " + (endedAt ? json_quote(iso_time(endedAt)) : std::string("null")) + ",\n";
        json += "  \"exitCode\": " + (exited ? std::to_string(exitCode) : std::string("null")) + ",\n";
        json += "  \"reason\": " + (reason.empty() ? std::string("null") : json_quote(reason)) + ",\n";
        json += "  \"registryDump\": " + (registryDump.empty() ? std::string("null") : json_quote(registryDump)) + "\n";
        json += "}\n";
        const std::string temporary = file + ".tmp";
        {
            std::ofstream out(temporary, std::ios::binary | std::ios::trunc);
            out << json;
            if (!out) return;
        }
        MoveFileExA(temporary.c_str(), file.c_str(), MOVEFILE_REPLACE_EXISTING);
    }

    // One line per run that reached the game. Appended in a single write, so lines from copies ending
    // together never interleave; the file is never rewritten.
    void append_ledger() const {
        if (ledger.empty()) return;
        const std::string line = "{\"key\":" + json_quote(key) + ",\"title\":" + json_quote(title) +
                                 ",\"startedAt\":" + json_quote(iso_time(startedAt)) + ",\"endedAt\":" +
                                 json_quote(iso_time(endedAt)) + ",\"seconds\":" + std::to_string((endedAt - startedAt) / 1000) +
                                 ",\"state\":" + json_quote(state) + ",\"exitCode\":" + std::to_string(exitCode) + "}\n";
        HANDLE handle = CreateFileA(ledger.c_str(), FILE_APPEND_DATA, FILE_SHARE_READ | FILE_SHARE_WRITE, nullptr, OPEN_ALWAYS,
            FILE_ATTRIBUTE_NORMAL, nullptr);
        if (handle == INVALID_HANDLE_VALUE) return;
        DWORD written = 0;
        WriteFile(handle, line.data(), static_cast<DWORD>(line.size()), &written, nullptr);
        CloseHandle(handle);
    }

    void fail(Log& log, const std::string& why) {
        log.line(why);
        state = "failed";
        reason = why;
        endedAt = now_ms();
        write();
    }
};

// ---- 1.14: the hook -----------------------------------------------------------------------------

#ifndef EXORDIUM_LAUNCH_NO_INJECT

// Runs `start(argument)` on a new thread in `process` and returns the thread's exit code, or
// `failed` when the thread could not run.
DWORD run_remote(HANDLE process, LPTHREAD_START_ROUTINE start, void* argument, DWORD failed) {
    HANDLE thread = CreateRemoteThread(process, nullptr, 0, start, argument, 0, nullptr);
    if (!thread) return failed;
    WaitForSingleObject(thread, INFINITE);
    DWORD code = failed;
    GetExitCodeThread(thread, &code);
    CloseHandle(thread);
    return code;
}

// Loads the hook into the suspended game and runs its start. Both processes are 32-bit, so
// kernel32's LoadLibraryW sits at the same address in each, and the thread's exit code is the
// module's address in the game.
bool inject(Log& log, HANDLE process, const std::wstring& hookPath) {
    const SIZE_T bytes = (hookPath.size() + 1) * sizeof(wchar_t);
    void* remotePath = VirtualAllocEx(process, nullptr, bytes, MEM_COMMIT | MEM_RESERVE, PAGE_READWRITE);
    if (!remotePath || !WriteProcessMemory(process, remotePath, hookPath.c_str(), bytes, nullptr)) {
        log.line("Cannot write the hook's path into Game.exe: " + win_error(GetLastError()));
        return false;
    }
    const auto loadLibrary = reinterpret_cast<LPTHREAD_START_ROUTINE>(
        GetProcAddress(GetModuleHandleW(L"kernel32.dll"), "LoadLibraryW"));
    const DWORD remoteModule = run_remote(process, loadLibrary, remotePath, 0);
    VirtualFreeEx(process, remotePath, 0, MEM_RELEASE);
    if (!remoteModule) {
        log.line("Game.exe did not load " + narrow(hookPath) + ".");
        return false;
    }

    // Where the start export sits within the hook, read from a copy mapped here without running it.
    HMODULE local = LoadLibraryExW(hookPath.c_str(), nullptr, DONT_RESOLVE_DLL_REFERENCES);
    FARPROC localStart = local ? GetProcAddress(local, kHookStart) : nullptr;
    if (!localStart) {
        log.line(std::string("The hook has no ") + kHookStart + " export.");
        if (local) FreeLibrary(local);
        return false;
    }
    const std::uintptr_t offset = reinterpret_cast<std::uintptr_t>(localStart) - reinterpret_cast<std::uintptr_t>(local);
    FreeLibrary(local);
    const auto remoteStart = reinterpret_cast<LPTHREAD_START_ROUTINE>(static_cast<std::uintptr_t>(remoteModule) + offset);
    const DWORD result = run_remote(process, remoteStart, nullptr, 0xFFFFFFFF);
    if (result != 0) {
        log.line("The hook refused to start the game (" + std::to_string(result) + "); see its lines above.");
        return false;
    }
    return true;
}

#endif

void start_presence(Log& log, const std::string& config, DWORD gamePid, long long startedAt) {
    if (json_string(config, "discordClientId").empty() || json_string(config, "discordActivity").empty()) return;
    const std::wstring presencePath = full_path(L"exordium-presence.exe");
    std::wstring commandLine = quote_arg(presencePath) + L" --run " + std::to_wstring(GetCurrentProcessId()) + L" " +
                               std::to_wstring(gamePid) + L" " + std::to_wstring(startedAt);
    STARTUPINFOW startup{};
    startup.cb = sizeof(startup);
    PROCESS_INFORMATION process{};
    if (!CreateProcessW(presencePath.c_str(), commandLine.data(), nullptr, nullptr, TRUE, 0, nullptr, nullptr, &startup, &process)) {
        log.line("Discord presence helper did not start: " + win_error(GetLastError()));
        return;
    }
    log.line("Discord presence helper started (pid " + std::to_string(process.dwProcessId) + ").");
    CloseHandle(process.hThread);
    CloseHandle(process.hProcess);
}

// ---- The run ------------------------------------------------------------------------------------

int run_game() {
    Log log(env_path("EXORDIUM_LOADER_LOG", "exordium-loader.log").c_str());
    log.line("exordium-launch starting.");
    const std::string config = read_file(env_path("EXORDIUM_LOADER_CONFIG", "exordium-loader.json").c_str());
    if (config.empty()) {
        log.line("No loader config found.");
        return 2;
    }

    Session session;
    session.file = json_string(config, "session");
    session.ledger = json_string(config, "ledger");
    session.key = json_string(config, "key");
    session.title = json_string(config, "title");
    session.boxId = json_string(config, "boxId");
    session.copy = json_int(config, "copy", 1);
    session.launcherCreated = created_ms(GetCurrentProcess());
    session.startedAt = now_ms();
    session.write();

    const bool singleExe = json_bool(config, "singleExe", false);
    std::string game = json_string(config, "game");
    std::string hook = json_string(config, "hook");
    if (game.empty()) game = "Game.exe";
    if (hook.empty()) hook = "exordium-hook.dll";
    const std::wstring gamePath = full_path(widen(game));
    const std::string arguments = json_string(config, "commandLine");
    const bool registryOnlyHook = json_bool(config, "registryOnlyHook", false);
    const bool injectHook = singleExe || registryOnlyHook;

    if (singleExe) {
        // 1.14 runs on current Windows as it is; the loader's Windows 7 layer must not reach it.
        SetEnvironmentVariableA("__COMPAT_LAYER", nullptr);
        SetEnvironmentVariableA("EXORDIUM_RELAUNCHED", nullptr);
    } else {
        // The loader needs Windows 7 behaviour (Fog's critical sections); given it here, with its
        // arguments, it has no reason to relaunch itself, so the pid below is the game's.
        SetEnvironmentVariableA("__COMPAT_LAYER", kCompatLayer);
        SetEnvironmentVariableA("EXORDIUM_RELAUNCHED", "1");
    }
    std::wstring commandLine = L"\"" + gamePath + L"\"" + (arguments.empty() ? L"" : L" " + widen(arguments));
    STARTUPINFOW startup{};
    startup.cb = sizeof(startup);
    PROCESS_INFORMATION process{};
    if (!CreateProcessW(gamePath.c_str(), commandLine.data(), nullptr, nullptr, FALSE, injectHook ? CREATE_SUSPENDED : 0,
            nullptr, nullptr, &startup, &process)) {
        session.fail(log, "Cannot start " + narrow(gamePath) + ": " + win_error(GetLastError()));
        return 3;
    }
    log.line("Started " + narrow(commandLine) + (injectHook ? " suspended" : "") + " (pid " + std::to_string(process.dwProcessId) + ").");
    if (injectHook) {
#ifndef EXORDIUM_LAUNCH_NO_INJECT
        if (!inject(log, process.hProcess, full_path(widen(hook)))) {
            TerminateProcess(process.hProcess, 4);
            CloseHandle(process.hThread);
            CloseHandle(process.hProcess);
            session.fail(log, "The game was stopped before it ran: the hook did not start.");
            return 4;
        }
#else
        log.line("Built without injection support; resuming the suspended process for scan triage.");
#endif
        ResumeThread(process.hThread);
    }
    CloseHandle(process.hThread);
    session.state = "running";
    session.gamePid = process.dwProcessId;
    session.gameCreated = created_ms(process.hProcess);
    session.write();

    start_presence(log, config, process.dwProcessId, session.startedAt);

    WaitForSingleObject(process.hProcess, INFINITE);
    GetExitCodeProcess(process.hProcess, &session.exitCode);
    CloseHandle(process.hProcess);
    session.exited = true;
    session.endedAt = now_ms();
    // An NTSTATUS error (0xC0000005 and the like) is the process dying, not the game quitting.
    session.state = (session.exitCode & 0xC0000000) == 0xC0000000 ? "crashed" : "ended";
    log.line("Game.exe exited with " + std::to_string(session.exitCode) + " (" + session.state + ").");

    // What the run changed in the box's registry, read back now, whether or not Exordium is open to
    // hear about it; Exordium folds it into the title's settings when it next looks.
    const std::string hive = json_string(config, "hive");
    if (!hive.empty()) {
        const std::string dump = hive + ".out.txt";
        if (dump_hive(hive, dump) == 0) session.registryDump = dump;
        else log.line("The registry could not be read back from " + hive + ".");
    }
    session.write();
    session.append_ledger();
    return static_cast<int>(session.exitCode);
}

int run() {
    if (__argc == 4 && std::strcmp(__argv[1], "--dump-hive") == 0) return dump_hive(__argv[2], __argv[3]);
    if (__argc >= 2 && std::strcmp(__argv[1], "--detach") == 0) {
        std::string arguments;
        for (int i = 2; i < __argc; ++i) arguments += (i > 2 ? " " : "") + std::string(__argv[i]);
        return detach(arguments, nullptr);
    }
    if (__argc == 3 && std::strcmp(__argv[1], "--wait") == 0) return wait_for(__argv[2]);
    return run_game();
}

} // namespace

int WINAPI WinMain(HINSTANCE, HINSTANCE, LPSTR, int) {
    return run();
}
