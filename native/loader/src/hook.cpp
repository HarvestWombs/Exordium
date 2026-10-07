// exordium-hook.dll: what has to happen from inside Blizzard's own Game.exe when the box keeps it.
// 1.14 needs archive and plugin hooks because the old DLLs were folded into Game.exe; 1.00-1.06b
// currently use only the private registry setup while they run through their original executable.
//
// exordium-launch.exe starts Game.exe suspended, loads this DLL into it and runs ExordiumHookStart
// on a thread of its own before the game's first instruction. That call gives the process the box's
// registry, lets several copies run, and re-points two calls in the game's startup so the mod's MPQs
// open right after the game's own archives and close before them.

#include "common.hpp"

namespace {

// Game.exe 1.14d (1.14.3.71), read in Ghidra on 2026-09-28. Each call site is checked for its
// original bytes before it is changed, so another build is refused rather than patched blindly.
//
// ARCHIVE_LoadMPQFile, inlined from D2Win: __fastcall(file, cdPath, onFail, priority) returning the
// archive record, whose first field is the Storm handle. The game passes a null cdPath for the
// install's own archives, and onFail is the disc prompt it retries with.
constexpr std::uintptr_t kLoadMpq = 0x517332;
// Its counterpart: __fastcall(archive).
constexpr std::uintptr_t kUnloadMpq = 0x5173AC;
// D2Win #10171's equivalent: d2char, d2music, then the expansion's archives. __fastcall(onFailClassic,
// onFailExpansion, unused, config), ret 8. Called once, from the game's startup (FUN_00405c30).
constexpr std::uintptr_t kLoadExpansionArchives = 0x4FAEC0;
constexpr std::uintptr_t kLoadExpansionArchivesCall = 0x405C99;
// Closes every archive the game opened; no arguments. Called at the end of the same function.
constexpr std::uintptr_t kUnloadArchives = 0x4FAE00;
constexpr std::uintptr_t kUnloadArchivesCall = 0x405E8C;

using LoadMpqPointer = void* (__fastcall*)(const char* file, const char* cdPath, void* onFail, int priority);
using UnloadMpqPointer = void (__fastcall*)(void* archive);
using LoadExpansionArchivesPointer = BOOL (__fastcall*)(void* onFailClassic, void* onFailExpansion, int unused, void* config);
using UnloadArchivesPointer = void (*)();

struct Hook {
    Log* log = nullptr;
    std::vector<ArchiveLoad> archives;
    std::vector<PluginLoad> plugins;
    // Archive records this DLL opened, in opening order.
    std::vector<void*> opened;
};

Hook g_hook;

// A 5-byte `call rel32` at `site`, and where it goes.
bool call_target(std::uintptr_t site, std::uintptr_t& target) {
    const auto* code = reinterpret_cast<const unsigned char*>(site);
    if (code[0] != 0xE8) return false;
    std::int32_t rel = 0;
    std::memcpy(&rel, code + 1, sizeof(rel));
    target = site + 5 + static_cast<std::uintptr_t>(static_cast<std::intptr_t>(rel));
    return true;
}

// Re-points the call at `site`, which must still go to `expected`.
bool redirect_call(Log& log, std::uintptr_t site, std::uintptr_t expected, void* replacement) {
    std::uintptr_t target = 0;
    if (!call_target(site, target) || target != expected) {
        char buffer[160]{};
        std::snprintf(buffer, sizeof(buffer), "Call at 0x%08X does not go to 0x%08X: not the Game.exe build this hook knows.",
            static_cast<unsigned>(site), static_cast<unsigned>(expected));
        log.line(buffer);
        return false;
    }
    DWORD old = 0;
    auto* rel = reinterpret_cast<std::int32_t*>(site + 1);
    if (!VirtualProtect(rel, sizeof(*rel), PAGE_EXECUTE_READWRITE, &old)) return false;
    *rel = static_cast<std::int32_t>(reinterpret_cast<std::uintptr_t>(replacement) - (site + 5));
    VirtualProtect(rel, sizeof(*rel), old, &old);
    FlushInstructionCache(GetCurrentProcess(), rel, sizeof(*rel));
    return true;
}

// The mod's and the language's archives, above the game's own. The game opens the base and
// expansion archives and patch_d2.mpq itself; the plan lists them only for the record.
bool open_mod_archives(Log& log) {
    const auto load = reinterpret_cast<LoadMpqPointer>(kLoadMpq);
    for (const ArchiveLoad& archive : g_hook.archives) {
        if (archive.kind != "mod" && archive.kind != "language") continue;
        void* opened = load(archive.path.c_str(), nullptr, nullptr, archive.priority);
        char buffer[320]{};
        std::snprintf(buffer, sizeof(buffer), "  %s priority=%d kind=%s path=%s", opened ? "ok" : "missing", archive.priority,
            archive.kind.c_str(), archive.path.c_str());
        log.line(buffer);
        if (opened) {
            g_hook.opened.push_back(opened);
        } else if (archive.required) {
            return false;
        }
    }
    return true;
}

void load_plugins(Log& log) {
    for (const PluginLoad& plugin : g_hook.plugins) {
        std::string path = plugin.path;
        for (char& c : path) {
            if (c == '/') c = '\\';
        }
        HMODULE module = LoadLibraryA(path.c_str());
        log.line((module ? "Loaded plugin " : "Plugin did not load: ") + plugin.path + (module ? "" : " (" + win_error(GetLastError()) + ")"));
        if (!module || plugin.init.empty()) continue;
        // PlugY's _Init@4 takes one pointer, null on its own launcher's path; other kinds are not
        // called until their signature is checked, as in the loader.
        if (plugin.kind == "plugy") {
            if (FARPROC init = GetProcAddress(module, plugin.init.c_str())) {
                const int result = reinterpret_cast<int (__stdcall*)(const char*)>(init)(nullptr) & 0xFF;
                log.line("  init " + plugin.init + " returned " + std::to_string(result));
            }
        } else {
            log.line("  init " + plugin.init + " not invoked: signature not verified for " + plugin.kind);
        }
    }
}

BOOL __fastcall load_expansion_then_mod_archives(void* onFailClassic, void* onFailExpansion, int unused, void* config) {
    const auto original = reinterpret_cast<LoadExpansionArchivesPointer>(kLoadExpansionArchives);
    const BOOL loaded = original(onFailClassic, onFailExpansion, unused, config);
    Log& log = *g_hook.log;
    if (!loaded) {
        log.line("The game's own archives did not open; the mod's are not tried.");
        return loaded;
    }
    log.line("The game's archives are open; opening the mod's:");
    if (!open_mod_archives(log)) {
        log.line("A required archive is missing; the game is told its archives failed.");
        return FALSE;
    }
    load_plugins(log);
    return loaded;
}

void unload_mod_then_game_archives() {
    const auto unload = reinterpret_cast<UnloadMpqPointer>(kUnloadMpq);
    for (auto it = g_hook.opened.rbegin(); it != g_hook.opened.rend(); ++it) unload(*it);
    if (g_hook.log) g_hook.log->line("Closed " + std::to_string(g_hook.opened.size()) + " mod archives.");
    g_hook.opened.clear();
    reinterpret_cast<UnloadArchivesPointer>(kUnloadArchives)();
}

} // namespace

// Run by exordium-launch.exe on a thread of its own while the game's main thread is still suspended.
// Nonzero means the game must not be resumed. Exported undecorated: a 32-bit __stdcall name is
// otherwise _ExordiumHookStart@4, which GetProcAddress("ExordiumHookStart") does not find.
#pragma comment(linker, "/EXPORT:ExordiumHookStart=_ExordiumHookStart@4")
extern "C" DWORD WINAPI ExordiumHookStart(void*) {
    static Log log(env_path("EXORDIUM_LOADER_LOG", "exordium-loader.log").c_str());
    g_hook.log = &log;
    log.line("exordium-hook starting inside Game.exe.");
    const std::string text = read_file(env_path("EXORDIUM_LOADER_CONFIG", "exordium-loader.json").c_str());
    if (text.empty()) {
        log.line("No loader config; the game is not started.");
        return 1;
    }
    if (!setup_registry(log, json_string(text, "hive"), json_string(text, "registryFile"))) {
        log.line("Cannot continue: the box's registry is not in place, and the game would use the machine's.");
        return 2;
    }
    if (json_bool(text, "registryOnlyHook", false)) {
        const bool copies = patch_import(GetModuleHandleA(nullptr), "USER32.dll", "FindWindowA",
            reinterpret_cast<void*>(find_window_allowing_copies));
        log.line(copies ? "Game.exe's one-copy check lets other copies run." : "Game.exe's FindWindowA import was not found.");
        log.line("exordium-hook registry-only mode ready; the game starts.");
        return 0;
    }
    g_hook.archives = json_archives(text);
    g_hook.plugins = json_plugins(text);

    const bool archivesIn = redirect_call(log, kLoadExpansionArchivesCall, kLoadExpansionArchives,
        reinterpret_cast<void*>(load_expansion_then_mod_archives));
    const bool archivesOut = archivesIn && redirect_call(log, kUnloadArchivesCall, kUnloadArchives,
        reinterpret_cast<void*>(unload_mod_then_game_archives));
    if (!archivesIn || !archivesOut) {
        log.line("Cannot continue: the mod's archives could not be hooked in.");
        return 3;
    }
    const bool copies = patch_import(GetModuleHandleA(nullptr), "USER32.dll", "FindWindowA",
        reinterpret_cast<void*>(find_window_allowing_copies));
    log.line(copies ? "Game.exe's one-copy check lets other copies run." : "Game.exe's FindWindowA import was not found.");
    log.line("exordium-hook ready; the game starts.");
    return 0;
}

BOOL WINAPI DllMain(HINSTANCE, DWORD, LPVOID) {
    return TRUE;
}
