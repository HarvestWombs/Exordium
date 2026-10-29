// The loader's (exordium-game.exe) shared pieces: the log, the config reader, the box's registry,
// import patching, and the
// commands Exordium runs. Everything here is Windows and the C++ library only: no game code.
#pragma once

#define WIN32_LEAN_AND_MEAN
#include <windows.h>

#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <share.h>
#include <sstream>
#include <string>
#include <vector>

namespace exordium {

struct PluginLoad {
    std::string kind;
    std::string path;
    std::string init;
    std::string release;
};

struct ArchiveLoad {
    std::string kind;
    std::string path;
    int priority = 0;
    bool required = false;
};

struct Log {
    FILE* file = nullptr;

    explicit Log(const char* path) {
        file = _fsopen(path, "ab", _SH_DENYNO); // shared: a relaunched loader appends to the same log
    }

    ~Log() {
        if (file) fclose(file);
    }

    void line(const char* text) {
        SYSTEMTIME now{};
        GetLocalTime(&now);
        if (file) {
            std::fprintf(
                file,
                "[%04u-%02u-%02u %02u:%02u:%02u] %s\r\n",
                now.wYear,
                now.wMonth,
                now.wDay,
                now.wHour,
                now.wMinute,
                now.wSecond,
                text
            );
            std::fflush(file);
        }
    }

    void line(const std::string& text) {
        line(text.c_str());
    }
};

inline std::string read_file(const char* path) {
    std::ifstream input(path, std::ios::binary);
    if (!input) return {};
    std::ostringstream out;
    out << input.rdbuf();
    return out.str();
}

inline std::string trim(std::string value) {
    while (!value.empty() && (value.front() == ' ' || value.front() == '\t' || value.front() == '\r' || value.front() == '\n')) {
        value.erase(value.begin());
    }
    while (!value.empty() && (value.back() == ' ' || value.back() == '\t' || value.back() == '\r' || value.back() == '\n')) {
        value.pop_back();
    }
    return value;
}

inline std::string unquote(std::string value) {
    value = trim(value);
    if (value.size() >= 2 && value.front() == '"' && value.back() == '"') {
        value = value.substr(1, value.size() - 2);
    }
    return value;
}

inline std::vector<std::string> split_csv(std::string value) {
    std::vector<std::string> result;
    std::string current;
    bool quoted = false;
    for (char c : value) {
        if (c == '"') {
            quoted = !quoted;
            current.push_back(c);
        } else if (c == ',' && !quoted) {
            result.push_back(unquote(current));
            current.clear();
        } else {
            current.push_back(c);
        }
    }
    if (!current.empty()) result.push_back(unquote(current));
    return result;
}

inline std::string json_string(const std::string& text, const char* key) {
    const std::string needle = std::string("\"") + key + "\"";
    const size_t found = text.find(needle);
    if (found == std::string::npos) return {};
    const size_t colon = text.find(':', found + needle.size());
    if (colon == std::string::npos) return {};
    const size_t first = text.find('"', colon + 1);
    if (first == std::string::npos) return {};
    std::string out;
    for (size_t i = first + 1; i < text.size(); ++i) {
        const char c = text[i];
        if (c == '\\' && i + 1 < text.size()) {
            out.push_back(text[++i]);
            continue;
        }
        if (c == '"') return out;
        out.push_back(c);
    }
    return {};
}

inline std::vector<std::string> json_string_array(const std::string& text, const char* key) {
    const std::string needle = std::string("\"") + key + "\"";
    const size_t found = text.find(needle);
    if (found == std::string::npos) return {};
    const size_t open = text.find('[', found + needle.size());
    const size_t close = text.find(']', open == std::string::npos ? found : open);
    if (open == std::string::npos || close == std::string::npos) return {};
    return split_csv(text.substr(open + 1, close - open - 1));
}

inline bool json_bool(const std::string& text, const char* key, bool fallback = false) {
    const std::string needle = std::string("\"") + key + "\"";
    const size_t found = text.find(needle);
    if (found == std::string::npos) return fallback;
    const size_t colon = text.find(':', found + needle.size());
    if (colon == std::string::npos) return fallback;
    const size_t value = text.find_first_not_of(" \t\r\n", colon + 1);
    if (value == std::string::npos) return fallback;
    if (text.compare(value, 4, "true") == 0) return true;
    if (text.compare(value, 5, "false") == 0) return false;
    return fallback;
}

inline int json_int(const std::string& text, const char* key, int fallback = 0) {
    const std::string needle = std::string("\"") + key + "\"";
    const size_t found = text.find(needle);
    if (found == std::string::npos) return fallback;
    const size_t colon = text.find(':', found + needle.size());
    if (colon == std::string::npos) return fallback;
    const size_t value = text.find_first_not_of(" \t\r\n", colon + 1);
    if (value == std::string::npos) return fallback;
    return std::strtol(text.c_str() + value, nullptr, 10);
}

inline std::vector<ArchiveLoad> json_archives(const std::string& text) {
    std::vector<ArchiveLoad> archives;
    const std::string needle = "\"archives\"";
    const size_t found = text.find(needle);
    if (found == std::string::npos) return archives;
    const size_t open = text.find('[', found + needle.size());
    const size_t close = text.find(']', open == std::string::npos ? found : open);
    if (open == std::string::npos || close == std::string::npos) return archives;
    size_t at = open;
    while (true) {
        const size_t objectOpen = text.find('{', at);
        if (objectOpen == std::string::npos || objectOpen > close) break;
        const size_t objectClose = text.find('}', objectOpen);
        if (objectClose == std::string::npos || objectClose > close) break;
        const std::string object = text.substr(objectOpen, objectClose - objectOpen + 1);
        archives.push_back({
            json_string(object, "kind"),
            json_string(object, "path"),
            json_int(object, "priority", 0),
            json_bool(object, "required", false),
        });
        at = objectClose + 1;
    }
    return archives;
}

inline std::vector<PluginLoad> json_plugins(const std::string& text) {
    std::vector<PluginLoad> plugins;
    const std::string needle = "\"plugins\"";
    const size_t found = text.find(needle);
    if (found == std::string::npos) return plugins;
    const size_t open = text.find('[', found + needle.size());
    const size_t close = text.find(']', open == std::string::npos ? found : open);
    if (open == std::string::npos || close == std::string::npos) return plugins;
    size_t at = open;
    while (true) {
        const size_t objectOpen = text.find('{', at);
        if (objectOpen == std::string::npos || objectOpen > close) break;
        const size_t objectClose = text.find('}', objectOpen);
        if (objectClose == std::string::npos || objectClose > close) break;
        const std::string object = text.substr(objectOpen, objectClose - objectOpen + 1);
        plugins.push_back({
            json_string(object, "kind"),
            json_string(object, "path"),
            json_string(object, "init"),
            json_string(object, "release"),
        });
        at = objectClose + 1;
    }
    return plugins;
}

// Several copies of one title share a box, so each launch names its own config and log through the
// environment (inherited through --detach); run by hand, the fixed names in the game folder apply.
inline std::string env_path(const char* name, const char* fallback) {
    char value[MAX_PATH]{};
    const DWORD length = GetEnvironmentVariableA(name, value, MAX_PATH);
    return length > 0 && length < MAX_PATH ? std::string(value, length) : std::string(fallback);
}

inline std::string win_error(DWORD error) {
    char* message = nullptr;
    FormatMessageA(
        FORMAT_MESSAGE_ALLOCATE_BUFFER | FORMAT_MESSAGE_FROM_SYSTEM | FORMAT_MESSAGE_IGNORE_INSERTS,
        nullptr,
        error,
        0,
        reinterpret_cast<char*>(&message),
        0,
        nullptr
    );
    std::string result = message ? message : "unknown error";
    if (message) LocalFree(message);
    return trim(result);
}

// Points one import of `module` (by DLL and function name) at `replacement`. Only that module's own
// calls change.
inline bool patch_import(HMODULE module, const char* dll, const char* function, void* replacement) {
    auto* base = reinterpret_cast<unsigned char*>(module);
    const auto* dos = reinterpret_cast<const IMAGE_DOS_HEADER*>(base);
    const auto* nt = reinterpret_cast<const IMAGE_NT_HEADERS32*>(base + dos->e_lfanew);
    const IMAGE_DATA_DIRECTORY& directory = nt->OptionalHeader.DataDirectory[IMAGE_DIRECTORY_ENTRY_IMPORT];
    if (!directory.VirtualAddress) return false;
    for (auto* entry = reinterpret_cast<const IMAGE_IMPORT_DESCRIPTOR*>(base + directory.VirtualAddress); entry->Name; ++entry) {
        if (_stricmp(reinterpret_cast<const char*>(base + entry->Name), dll) != 0 || !entry->OriginalFirstThunk) continue;
        auto* names = reinterpret_cast<const IMAGE_THUNK_DATA32*>(base + entry->OriginalFirstThunk);
        auto* slots = reinterpret_cast<IMAGE_THUNK_DATA32*>(base + entry->FirstThunk);
        for (; names->u1.AddressOfData; ++names, ++slots) {
            if (IMAGE_SNAP_BY_ORDINAL32(names->u1.Ordinal)) continue;
            const auto* byName = reinterpret_cast<const IMAGE_IMPORT_BY_NAME*>(base + names->u1.AddressOfData);
            if (std::strcmp(reinterpret_cast<const char*>(byName->Name), function) != 0) continue;
            DWORD old = 0;
            if (!VirtualProtect(&slots->u1.Function, sizeof(DWORD), PAGE_READWRITE, &old)) return false;
            slots->u1.Function = static_cast<DWORD>(reinterpret_cast<std::uintptr_t>(replacement));
            VirtualProtect(&slots->u1.Function, sizeof(DWORD), old, &old);
            return true;
        }
    }
    return false;
}

// D2Gfx's WINDOW_Create (#10023, D2MOO source/D2Gfx/src/Window.cpp) refuses to start while any
// "Diablo II" window exists: "Only one copy of Diablo II may run at a time." Exordium can run several
// copies of a title, so that one lookup reports none; every other FindWindowA call passes through.
// The same import redirect as the D2Glide font fix: D2Gfx's own code is untouched.
inline HWND WINAPI find_window_allowing_copies(LPCSTR className, LPCSTR windowName) {
    if (className && !IS_INTRESOURCE(className) && !windowName && lstrcmpiA(className, "Diablo II") == 0) return nullptr;
    return FindWindowA(className, windowName);
}

// ---- The box's registry ------------------------------------------------------------------------
//
// The hive is a private app hive (RegLoadAppKey): no other process sees it. Its top level holds
// "HKCU" and "HKLM" subkeys, and HKEY_CURRENT_USER is pointed at "HKCU" for this process, so the
// game's own RegOpenKeyEx calls land in it. Values arrive as exordium-registry.txt, one per line:
// key TAB name TAB type TAB data, with \\ \t \r \n \0 escaped (@exordium/registry, hive-text.ts).

inline std::wstring widen(const std::string& text) {
    if (text.empty()) return {};
    const int size = MultiByteToWideChar(CP_UTF8, 0, text.data(), static_cast<int>(text.size()), nullptr, 0);
    std::wstring out(static_cast<size_t>(size), L'\0');
    MultiByteToWideChar(CP_UTF8, 0, text.data(), static_cast<int>(text.size()), out.data(), size);
    return out;
}

inline std::string narrow(const std::wstring& text) {
    if (text.empty()) return {};
    const int size = WideCharToMultiByte(CP_UTF8, 0, text.data(), static_cast<int>(text.size()), nullptr, 0, nullptr, nullptr);
    std::string out(static_cast<size_t>(size), '\0');
    WideCharToMultiByte(CP_UTF8, 0, text.data(), static_cast<int>(text.size()), out.data(), size, nullptr, nullptr);
    return out;
}

inline std::string hive_unescape(const std::string& field, bool& ok) {
    std::string out;
    for (size_t i = 0; i < field.size(); ++i) {
        if (field[i] != '\\') {
            out.push_back(field[i]);
            continue;
        }
        const char next = i + 1 < field.size() ? field[++i] : '\0';
        switch (next) {
        case '\\': out.push_back('\\'); break;
        case 't': out.push_back('\t'); break;
        case 'r': out.push_back('\r'); break;
        case 'n': out.push_back('\n'); break;
        case '0': out.push_back('\0'); break;
        default: ok = false; return out;
        }
    }
    return out;
}

inline std::string hive_escape(const std::string& field) {
    std::string out;
    for (const char c : field) {
        switch (c) {
        case '\\': out += "\\\\"; break;
        case '\t': out += "\\t"; break;
        case '\r': out += "\\r"; break;
        case '\n': out += "\\n"; break;
        case '\0': out += "\\0"; break;
        default: out.push_back(c);
        }
    }
    return out;
}

// "HKCU\Software\X" -> root "HKCU", path "Software\X". Only HKCU and HKLM are allowed.
inline bool split_root(const std::string& key, std::string& root, std::string& path) {
    const size_t slash = key.find('\\');
    root = key.substr(0, slash);
    path = slash == std::string::npos ? std::string() : key.substr(slash + 1);
    return root == "HKCU" || root == "HKLM";
}

inline bool write_hive_value(HKEY hive, const std::string& key, const std::string& name, const std::string& type, const std::string& data) {
    std::string root, path;
    if (!split_root(key, root, path)) return false;
    HKEY target{};
    const std::wstring full = widen(path.empty() ? root : root + "\\" + path);
    if (RegCreateKeyExW(hive, full.c_str(), 0, nullptr, 0, KEY_ALL_ACCESS, nullptr, &target, nullptr) != ERROR_SUCCESS) return false;
    const std::wstring wideName = widen(name);
    LONG result = ERROR_INVALID_DATA;
    if (type == "sz" || type == "expand_sz" || type == "multi_sz") {
        std::wstring text = widen(data);
        text.push_back(L'\0');
        if (type == "multi_sz" && !data.empty()) text.push_back(L'\0');
        const DWORD kind = type == "sz" ? REG_SZ : type == "expand_sz" ? REG_EXPAND_SZ : REG_MULTI_SZ;
        result = RegSetValueExW(target, wideName.c_str(), 0, kind, reinterpret_cast<const BYTE*>(text.data()), static_cast<DWORD>(text.size() * sizeof(wchar_t)));
    } else if (type == "dword") {
        const DWORD value = static_cast<DWORD>(std::strtoul(data.c_str(), nullptr, 10));
        result = RegSetValueExW(target, wideName.c_str(), 0, REG_DWORD, reinterpret_cast<const BYTE*>(&value), sizeof(value));
    } else if (type == "qword") {
        const unsigned long long value = _strtoui64(data.c_str(), nullptr, 10);
        result = RegSetValueExW(target, wideName.c_str(), 0, REG_QWORD, reinterpret_cast<const BYTE*>(&value), sizeof(value));
    } else if (type == "binary") {
        std::vector<BYTE> bytes;
        for (size_t i = 0; i + 1 < data.size(); i += 2) bytes.push_back(static_cast<BYTE>(std::strtoul(data.substr(i, 2).c_str(), nullptr, 16)));
        result = RegSetValueExW(target, wideName.c_str(), 0, REG_BINARY, bytes.data(), static_cast<DWORD>(bytes.size()));
    }
    RegCloseKey(target);
    return result == ERROR_SUCCESS;
}

// Loads the hive, fills it from the text file, and points HKCU at it. False means the game must not
// start: without the override it would read and write the machine's own registry.
inline bool setup_registry(Log& log, const std::string& hivePath, const std::string& registryFile) {
    if (hivePath.empty()) {
        log.line("No registry hive configured: the game uses the machine's registry.");
        return true;
    }
    HKEY hive{};
    const LONG load = RegLoadAppKeyW(widen(hivePath).c_str(), &hive, KEY_ALL_ACCESS, 0, 0);
    if (load != ERROR_SUCCESS) {
        log.line("RegLoadAppKey(" + hivePath + ") failed: " + win_error(static_cast<DWORD>(load)));
        return false;
    }
    unsigned written = 0;
    unsigned refused = 0;
    if (!registryFile.empty()) {
        std::istringstream lines(read_file(registryFile.c_str()));
        std::string line;
        while (std::getline(lines, line)) {
            if (!line.empty() && line.back() == '\r') line.pop_back();
            if (line.empty()) continue;
            std::vector<std::string> fields;
            size_t from = 0;
            for (size_t tab = line.find('\t'); tab != std::string::npos; tab = line.find('\t', from)) {
                fields.push_back(line.substr(from, tab - from));
                from = tab + 1;
            }
            fields.push_back(line.substr(from));
            bool ok = fields.size() == 4;
            for (std::string& field : fields) field = hive_unescape(field, ok);
            if (ok && write_hive_value(hive, fields[0], fields[1], fields[2], fields[3])) {
                ++written;
            } else {
                ++refused;
                log.line("  registry value refused: " + line);
            }
        }
    }
    HKEY user{};
    if (RegCreateKeyExW(hive, L"HKCU", 0, nullptr, 0, KEY_ALL_ACCESS, nullptr, &user, nullptr) != ERROR_SUCCESS) {
        log.line("Cannot open the hive's HKCU key.");
        RegCloseKey(hive);
        return false;
    }
    const LONG override = RegOverridePredefKey(HKEY_CURRENT_USER, user);
    if (override != ERROR_SUCCESS) {
        log.line("RegOverridePredefKey(HKCU) failed: " + win_error(static_cast<DWORD>(override)));
        RegCloseKey(user);
        RegCloseKey(hive);
        return false;
    }
    // Both keys stay open for the life of the process; the override refers to `user`.
    log.line("Private HKCU installed from " + hivePath + ": " + std::to_string(written) + " values written, " + std::to_string(refused) +
             " refused.");
    return refused == 0;
}

inline void dump_key(HKEY key, const std::string& path, std::string& out) {
    for (DWORD index = 0;; ++index) {
        wchar_t name[16384];
        DWORD nameLength = 16384;
        DWORD type = 0;
        DWORD size = 0;
        if (RegEnumValueW(key, index, name, &nameLength, nullptr, &type, nullptr, &size) != ERROR_SUCCESS) break;
        std::vector<BYTE> data(size + sizeof(wchar_t) * 2, 0);
        nameLength = 16384;
        if (RegEnumValueW(key, index, name, &nameLength, nullptr, &type, data.data(), &size) != ERROR_SUCCESS) continue;
        std::string kind;
        std::string text;
        const auto* wide = reinterpret_cast<const wchar_t*>(data.data());
        if (type == REG_SZ || type == REG_EXPAND_SZ) {
            kind = type == REG_SZ ? "sz" : "expand_sz";
            text = narrow(std::wstring(wide));
        } else if (type == REG_MULTI_SZ) {
            kind = "multi_sz";
            std::wstring all(wide, size / sizeof(wchar_t));
            while (!all.empty() && all.back() == L'\0') all.pop_back();
            text = narrow(all);
        } else if (type == REG_DWORD && size == 4) {
            kind = "dword";
            text = std::to_string(*reinterpret_cast<const DWORD*>(data.data()));
        } else if (type == REG_QWORD && size == 8) {
            kind = "qword";
            text = std::to_string(*reinterpret_cast<const unsigned long long*>(data.data()));
        } else {
            kind = "binary"; // other types keep their bytes, not their type
            static const char digits[] = "0123456789abcdef";
            for (DWORD i = 0; i < size; ++i) {
                text.push_back(digits[data[i] >> 4]);
                text.push_back(digits[data[i] & 15]);
            }
        }
        out += hive_escape(path) + "\t" + hive_escape(narrow(std::wstring(name, nameLength))) + "\t" + kind + "\t" + hive_escape(text) + "\n";
    }
    for (DWORD index = 0;; ++index) {
        wchar_t name[256];
        DWORD nameLength = 256;
        if (RegEnumKeyExW(key, index, name, &nameLength, nullptr, nullptr, nullptr, nullptr) != ERROR_SUCCESS) break;
        HKEY child{};
        if (RegOpenKeyExW(key, name, 0, KEY_READ, &child) != ERROR_SUCCESS) continue;
        dump_key(child, path + "\\" + narrow(std::wstring(name, nameLength)), out);
        RegCloseKey(child);
    }
}

// `Game.exe --dump-hive <hive> <out>`: writes every value in the hive, in the same text form, so
// Exordium can read a run's registry back however the game ended. Run after the game has exited.
inline int dump_hive(const std::string& hivePath, const std::string& outPath) {
    HKEY hive{};
    if (RegLoadAppKeyW(widen(hivePath).c_str(), &hive, KEY_READ, 0, 0) != ERROR_SUCCESS) return 20;
    std::string out;
    for (const char* root : {"HKCU", "HKLM"}) {
        HKEY key{};
        if (RegOpenKeyExW(hive, widen(root).c_str(), 0, KEY_READ, &key) != ERROR_SUCCESS) continue;
        dump_key(key, root, out);
        RegCloseKey(key);
    }
    RegCloseKey(hive);
    std::ofstream file(outPath, std::ios::binary | std::ios::trunc);
    file << out;
    return file ? 0 : 21;
}

// ---- Commands Exordium runs, not the game ------------------------------------------------------

// Writes `text` to this process's standard output (the pipe Exordium reads), GUI subsystem or not.
inline void write_stdout(const std::string& text) {
    HANDLE out = GetStdHandle(STD_OUTPUT_HANDLE);
    DWORD written = 0;
    if (out && out != INVALID_HANDLE_VALUE) WriteFile(out, text.data(), static_cast<DWORD>(text.size()), &written, nullptr);
}

// `Game.exe --detach <game arguments>`: starts the game as its own process, not a child of
// Exordium, prints its PID and returns at once. Its parent has exited by the time anyone looks, so
// Task Manager lists the game on its own, under its own name, not inside Exordium's app group; it
// also escapes Exordium's job, so closing Exordium does not close the game. Exordium follows it
// with --wait. `compatLayer` (the loader's Windows 7 layer) is applied here, so the started process
// never relaunches; null starts it with none.
inline int detach(const std::string& arguments, const char* compatLayer) {
    char path[MAX_PATH]{};
    if (!GetModuleFileNameA(nullptr, path, MAX_PATH)) return 30;
    SetEnvironmentVariableA("__COMPAT_LAYER", compatLayer);
    SetEnvironmentVariableA("EXORDIUM_RELAUNCHED", "1");
    std::string commandLine = std::string("\"") + path + "\"" + (arguments.empty() ? "" : " " + arguments);
    STARTUPINFOA startup{};
    startup.cb = sizeof(startup);
    PROCESS_INFORMATION process{};
    // Breaking away fails when Exordium's job forbids it; the game still starts, only inside the job.
    BOOL started = CreateProcessA(path, commandLine.data(), nullptr, nullptr, FALSE, CREATE_BREAKAWAY_FROM_JOB, nullptr, nullptr, &startup, &process);
    if (!started) started = CreateProcessA(path, commandLine.data(), nullptr, nullptr, FALSE, 0, nullptr, nullptr, &startup, &process);
    if (!started) return 31;
    write_stdout(std::to_string(process.dwProcessId) + "\n");
    CloseHandle(process.hThread);
    CloseHandle(process.hProcess);
    return 0;
}

// `Game.exe --wait <pid>`: returns when that process exits, with its exit code.
inline int wait_for(const char* pidText) {
    const DWORD pid = static_cast<DWORD>(std::strtoul(pidText, nullptr, 10));
    HANDLE process = OpenProcess(SYNCHRONIZE | PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid);
    if (!process) return 0; // already gone
    WaitForSingleObject(process, INFINITE);
    DWORD code = 0;
    GetExitCodeProcess(process, &code);
    CloseHandle(process);
    write_stdout(std::to_string(code) + "\n");
    return 0;
}

} // namespace exordium

using namespace exordium;
