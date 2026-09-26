#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <shellapi.h>

#include <cstdio>
#include <share.h>
#include <cstdint>
#include <cstddef>
#include <cstring>
#include <cstdlib>
#include <fstream>
#include <sstream>
#include <string>
#include <vector>

namespace {

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

struct Plan {
    std::string hive;
    // The box's registry values, one per line (@exordium/registry hive-text); written into `hive`.
    std::string registryFile;
    std::string commandLine;
    bool handoff = false;
    bool graphics = false;
    bool graphicsInit = false;
    bool graphicsSurface = false;
    bool graphicsWrapper = false;
    bool graphicsWindow = false;
    // Diagnostic only: D2Win's two startup exports inlined, poking 1.10f D2Win globals by address.
    // The normal path calls the real exports, as Game.exe does.
    bool graphicsManual = false;
    // What Game.exe hands FOG_InitErrorMgr: "v<major>.<minor>" of the core, e.g. "v1.10".
    std::string gameVersion = "v1.10";
    // Diagnostic: MPQs to load the way plugins do (D2Win's ARCHIVE_LoadMPQFile, 1.10f only), then
    // files to open through Fog, logging each result.
    std::vector<std::string> probeMpqs;
    std::vector<std::string> probeFiles;
    // Diagnostic: log where the main thread is every N seconds, three times (0 = off).
    int watchdogSeconds = 0;
    std::vector<ArchiveLoad> archives;
    std::vector<std::string> gameDlls;
    std::vector<PluginLoad> plugins;
};

enum D2Module : uint32_t {
    MODULE_NONE = 0,
    MODULE_CLIENT = 1,
    MODULE_SERVER = 2,
    MODULE_MULTIPLAYER = 3,
    MODULE_LAUNCHER = 4,
    MODULE_EXPAND = 5,
};

enum D2LaunchType : uint8_t {
    LAUNCHTYPE_NONE = 0,
    LAUNCHTYPE_LOCAL = 2,
    LAUNCHTYPE_REALM = 3,
    LAUNCHTYPE_TCPIP = 4,
    LAUNCHTYPE_OPENBNET = 5,
};

#pragma pack(push, 1)
struct D2CharacterPreviewInfoStrc {
    uint16_t nVersion;
    uint8_t pComponents[11];
    uint8_t nClass;
    uint8_t pComponentColors[11];
    uint8_t nLevel;
    uint16_t nClientFlags;
    uint16_t nGuildFlags;
    uint8_t nGuildEmblemBgColor;
    uint8_t nGuildEmblemFgColor;
    uint8_t nGuildEmblemType;
    uint32_t szGuildTag;
    uint8_t pad0x25;
};

struct D2ConfigStrc {
    BOOL bIsExpansion;
    uint8_t bWindow;
    uint8_t b3DFX;
    uint8_t bOpenGL;
    uint8_t bRave;
    uint8_t bD3D;
    uint8_t bPerspective;
    uint8_t bQuality;
    uint32_t dwGamma;
    uint8_t bVSync;
    uint32_t dwFramerate;
    uint32_t dwGameType;
    uint16_t wJoinID;
    char szGameName[24];
    char szServerIP[24];
    char szBattleNetIP[24];
    char szMCPIP[24];
    uint8_t _0076[4];
    uint8_t bNoPK;
    uint8_t bOpenC;
    uint8_t bAmazon;
    uint8_t bPaladin;
    uint8_t bSorceress;
    uint8_t bNecromancer;
    uint8_t bBarbarian;
    uint8_t bDruid;
    uint8_t bAssassin;
    uint8_t bInvincible;
    uint8_t _0082[48];
    char szName[24];
    char szRealm[24];
    D2CharacterPreviewInfoStrc tCharPreviewInfo;
    char szUnk[194];
    uint8_t _01D0[0x18];
    union {
        uint32_t dwCTemp;
        struct {
            uint8_t nUnk;
            uint8_t nCharacterClassId;
            uint16_t nCharacterSaveFlags;
        } unpackedCTemp;
    };
    uint8_t bNoMonsters;
    uint32_t dwMonsterClass;
    uint8_t bMonsterInfo;
    uint32_t dwMonsterDebug;
    uint8_t bRare;
    uint8_t bUnique;
    uint8_t _01DA[2];
    uint32_t dwAct;
    uint8_t bNoPreload;
    uint8_t bDirect;
    uint8_t bLowEnd;
    uint8_t bNoCompress;
    uint16_t wArena;
    uint32_t nArenaFlags;
    uint8_t nArenaTemplate;
    uint8_t _01E9[2];
    uint8_t nArenaDifficulty;
    BOOL(__stdcall *pAllowExpansionCallback)(void);
    uint8_t bTxt;
    uint8_t bLog;
    uint8_t bMsgLog;
    uint8_t bSafeMode;
    uint8_t bNoSave;
    uint32_t dwSeed;
    uint8_t bCheats;
    uint8_t bTeen;
    uint8_t bNoSound;
    uint8_t bQuests;
    uint8_t _01F9;
    uint8_t bBuild;
    void* pComInterface;
    uint32_t nTokenId;
    char szCharacterRealm[24];
    char szGamePassword[24];
    char szGameStatstring[256];
    uint8_t bSkipToBNet;
    D2LaunchType nLaunchType;
    uint8_t bShownLogo;
    uint8_t bUnk035A;
    char szCurrentChannelName[32];
    char szDefaultChannelName[32];
    uint8_t nComponents[16];
    uint8_t nComponentsColors[16];
    uint8_t nCharacterLevel;
    uint8_t bLadder;
    uint32_t nAccountPasswordHash;
    uint32_t nAccountPasswordLength;
    uint16_t nSaveFlags;
};
#pragma pack(pop)

static_assert(sizeof(D2CharacterPreviewInfoStrc) == 0x26, "D2 character preview ABI mismatch");
static_assert(offsetof(D2ConfigStrc, szCharacterRealm) == 0x227, "D2 config ABI mismatch");
static_assert(offsetof(D2ConfigStrc, bSkipToBNet) == 0x357, "D2 config ABI mismatch");
static_assert(offsetof(D2ConfigStrc, nComponents) == 0x39B, "D2 config ABI mismatch");
static_assert(sizeof(D2ConfigStrc) == 0x3C7, "D2 config ABI mismatch");

using QueryInterface = void* (__fastcall*)();
using ModuleInitPointer = D2Module (__fastcall*)(D2ConfigStrc*);
using SFileOpenArchivePointer = BOOL (__stdcall*)(char*, int, int, HANDLE*);

} // namespace

// Storm #266, imported statically through storm.def. Storm must be a load-time import of the exe:
// loaded any other way, its DllMain seeds the MPQ crypt table wrongly and every archive reads as
// garbage (see storm.def).
extern "C" BOOL __stdcall SFileOpenArchive(char* name, int priority, int flags, HANDLE* archive);

namespace {
using SFileCloseArchivePointer = BOOL (__stdcall*)(HANDLE);
// Fog.#10019 FOG_InitErrorMgr(szProgramName, pExceptionCallback, szVersion, bLogToFile) — D2MOO
// Fog.h. Game.exe 1.10f (GameInit, 0x401970) passes "Diablo II", NULL, "v1.10", TRUE.
using FogExceptionCallback = int (*)();
using FogInitErrorMgrPointer = void (__fastcall*)(const char*, FogExceptionCallback, const char*, BOOL);
using FogSetLogPrefixPointer = int (__fastcall*)(const char*);
using FogGetSystemInfoPointer = void* (__cdecl*)();
using FogMPQSetConfigPointer = BOOL (__fastcall*)(int, int);
using FogAsyncDataInitializePointer = void (__fastcall*)(BOOL);
using FogAsyncDataDestroyPointer = void (__fastcall*)();
using FogNoArgsVoidPointer = void (__fastcall*)();
using FogNoArgsIntPointer = int (__fastcall*)();
using D2WinCreateWindowPointer = BOOL (__stdcall*)(HINSTANCE, int, BOOL, BOOL);
using D2WinInitializeSpriteCachePointer = BOOL (__stdcall*)(BOOL, int);
using D2WinCloseSpriteCachePointer = int (__stdcall*)();
using D2GfxInitializePointer = int (__stdcall*)(HINSTANCE, WNDPROC, int, int);
using D2GfxReleasePointer = int (__stdcall*)();
using WindowCreatePointer = int (__stdcall*)(int, int);
using WindowDestroyPointer = int (__stdcall*)();
using D2CmpSetCompressedDataModePointer = void (__stdcall*)(BOOL);
using D2CmpInitSpriteCachePointer = void (__stdcall*)(void*, int, int, unsigned int);
using WindowGetWindowPointer = HWND (__stdcall*)();
using D2GfxSetPerspectivePointer = void (__stdcall*)(int);
using D2GfxToggleLowQualityPointer = int (__stdcall*)();
using D2GfxSetGammaPointer = int (__stdcall*)(uint32_t);
using D2GfxEnableVSyncPointer = void (__stdcall*)();

struct FogBootstrap {
    HMODULE module = nullptr;
    FogAsyncDataDestroyPointer asyncDataDestroy = nullptr;
    bool processInitialized = false;
    bool asyncInitialized = false;
};

struct GfxBootstrap {
    HMODULE d2win = nullptr;
    HMODULE d2gfx = nullptr;
    D2WinCloseSpriteCachePointer closeSpriteCache = nullptr;
    D2GfxReleasePointer release = nullptr;
    bool spriteCacheStarted = false;
    bool gfxStarted = false;
};

struct D2GfxSettingsProbe {
    BOOL bPerspectiveEnabled;
    BOOL bPerspectiveCapable;
    BOOL bLowQuality;
    int32_t nGamma;
    BOOL bVSync;
    BOOL bBlendedShadows;
};

using HelperFillYBufferTablePointer = void (__fastcall*)(uint8_t*, int32_t, int32_t, int32_t);
using HelperDrawVisTilePointer = void (__fastcall*)(uint8_t*, int32_t, int32_t);
using HelperUnknownPointer = void (__fastcall*)(uint8_t*, int32_t, int32_t, uint8_t);
using HelperFloorTileDrawPointer = void (__fastcall*)(void*, int32_t, int32_t, void*);
using HelperTileDrawLitPointer = void (__fastcall*)(uint8_t*, int32_t, int32_t, int32_t*);
using HelperDrawBlendedVisTilePointer = void (__fastcall*)(int32_t, int32_t, int32_t, uint8_t);
using HelperDrawRoofTilePointer = void (__fastcall*)(int32_t, int32_t, int32_t, int32_t*, uint8_t);

struct D2GfxHelperProbe {
    HelperFillYBufferTablePointer pfFillYBufferTable;
    HelperDrawVisTilePointer pfDrawVisTile;
    HelperUnknownPointer pfUnknown;
    HelperFloorTileDrawPointer pfFloorTileDraw;
    HelperTileDrawLitPointer pfTileDrawLit;
    HelperDrawBlendedVisTilePointer pfDrawBlendedVisTile;
    HelperDrawRoofTilePointer pfDrawRoofTile;
};

using GfxDetectPointer = BOOL (__fastcall*)(HINSTANCE);
using GfxInitPointer = BOOL (__fastcall*)(void*, const void*);
using GfxClosePointer = BOOL (__fastcall*)();
using GfxCreateSurfacePointer = BOOL (__fastcall*)(HWND, int);
using GfxCloseSurfacePointer = BOOL (__fastcall*)();
using GfxSetOptionPointer = BOOL (__fastcall*)(int, int);

struct D2GraphicsInterfaceProbe {
    GfxDetectPointer pfDetect;
    GfxInitPointer pfInit;
    GfxClosePointer pfClose;
    GfxCreateSurfacePointer pfCreateSurface;
    GfxCloseSurfacePointer pfCloseSurface;
    void* pfPauseSurface;
    void* pfStartDraw;
    void* pfEndDraw;
    void* pfBlit;
    void* pfChangeRes;
    void* pfGetBackBuffer;
    void* pfActivateWindow;
    GfxSetOptionPointer pfSetOption;
};

using GetGraphicsInterfacePointer = D2GraphicsInterfaceProbe* (__fastcall*)();

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

std::string read_file(const char* path) {
    std::ifstream input(path, std::ios::binary);
    if (!input) return {};
    std::ostringstream out;
    out << input.rdbuf();
    return out.str();
}

std::string trim(std::string value) {
    while (!value.empty() && (value.front() == ' ' || value.front() == '\t' || value.front() == '\r' || value.front() == '\n')) {
        value.erase(value.begin());
    }
    while (!value.empty() && (value.back() == ' ' || value.back() == '\t' || value.back() == '\r' || value.back() == '\n')) {
        value.pop_back();
    }
    return value;
}

std::string unquote(std::string value) {
    value = trim(value);
    if (value.size() >= 2 && value.front() == '"' && value.back() == '"') {
        value = value.substr(1, value.size() - 2);
    }
    return value;
}

std::vector<std::string> split_csv(std::string value) {
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

std::string json_string(const std::string& text, const char* key) {
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

std::vector<std::string> json_string_array(const std::string& text, const char* key) {
    const std::string needle = std::string("\"") + key + "\"";
    const size_t found = text.find(needle);
    if (found == std::string::npos) return {};
    const size_t open = text.find('[', found + needle.size());
    const size_t close = text.find(']', open == std::string::npos ? found : open);
    if (open == std::string::npos || close == std::string::npos) return {};
    return split_csv(text.substr(open + 1, close - open - 1));
}

bool json_bool(const std::string& text, const char* key, bool fallback = false) {
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

int json_int(const std::string& text, const char* key, int fallback = 0) {
    const std::string needle = std::string("\"") + key + "\"";
    const size_t found = text.find(needle);
    if (found == std::string::npos) return fallback;
    const size_t colon = text.find(':', found + needle.size());
    if (colon == std::string::npos) return fallback;
    const size_t value = text.find_first_not_of(" \t\r\n", colon + 1);
    if (value == std::string::npos) return fallback;
    return std::strtol(text.c_str() + value, nullptr, 10);
}

std::vector<ArchiveLoad> json_archives(const std::string& text) {
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

std::vector<PluginLoad> json_plugins(const std::string& text) {
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

Plan read_plan(Log& log) {
    Plan plan;
    const std::string text = read_file("exordium-loader.json");
    if (text.empty()) {
        log.line("No exordium-loader.json found; using diagnostic defaults.");
        plan.gameDlls = {"D2Launch.dll", "D2Client.dll", "D2Multi.dll"};
        return plan;
    }
    plan.hive = json_string(text, "hive");
    plan.registryFile = json_string(text, "registryFile");
    plan.commandLine = json_string(text, "commandLine");
    plan.handoff = json_bool(text, "handoff", false);
    plan.graphics = json_bool(text, "graphics", false);
    plan.graphicsInit = json_bool(text, "graphicsInit", false);
    plan.graphicsSurface = json_bool(text, "graphicsSurface", false);
    plan.graphicsWrapper = json_bool(text, "graphicsWrapper", false);
    plan.graphicsWindow = json_bool(text, "graphicsWindow", false);
    plan.graphicsManual = json_bool(text, "graphicsManual", false);
    plan.probeMpqs = json_string_array(text, "probeMpqs");
    plan.probeFiles = json_string_array(text, "probeFiles");
    plan.watchdogSeconds = json_int(text, "watchdogSeconds", 0);
    const std::string version = json_string(text, "gameVersion");
    if (!version.empty()) plan.gameVersion = version;
    plan.archives = json_archives(text);
    plan.gameDlls = json_string_array(text, "gameDlls");
    plan.plugins = json_plugins(text);
    if (plan.gameDlls.empty()) plan.gameDlls = {"D2Launch.dll", "D2Client.dll", "D2Multi.dll"};
    return plan;
}

bool has_flag(const std::string& commandLine, const char* flag) {
    const size_t flagLen = std::strlen(flag);
    for (size_t at = commandLine.find('-'); at != std::string::npos; at = commandLine.find('-', at + 1)) {
        size_t start = at + 1;
        while (start < commandLine.size() && (commandLine[start] == ' ' || commandLine[start] == '\t')) ++start;
        size_t end = start;
        while (end < commandLine.size() && commandLine[end] != ' ' && commandLine[end] != '\t' && commandLine[end] != '-') ++end;
        if (end - start == flagLen) {
            bool match = true;
            for (size_t i = 0; i < flagLen; ++i) {
                char got = commandLine[start + i];
                if (got >= 'A' && got <= 'Z') got = static_cast<char>(got + ('a' - 'A'));
                char want = flag[i];
                if (want >= 'A' && want <= 'Z') want = static_cast<char>(want + ('a' - 'A'));
                if (got != want) {
                    match = false;
                    break;
                }
            }
            if (match) return true;
        }
    }
    return false;
}

BOOL __stdcall allow_expansion() {
    return TRUE;
}

D2ConfigStrc build_config(const Plan& plan) {
    D2ConfigStrc config{};
    config.bIsExpansion = TRUE;
    config.bWindow = has_flag(plan.commandLine, "w") ? 1 : 0;
    config.b3DFX = has_flag(plan.commandLine, "3dfx") ? 1 : 0;
    config.bOpenGL = has_flag(plan.commandLine, "opengl") ? 1 : 0;
    config.bD3D = has_flag(plan.commandLine, "d3d") ? 1 : 0;
    config.bRave = has_flag(plan.commandLine, "rave") ? 1 : 0;
    config.bPerspective = has_flag(plan.commandLine, "per") ? 1 : 0;
    config.bQuality = has_flag(plan.commandLine, "lq") ? 1 : 0;
    config.bDirect = has_flag(plan.commandLine, "direct") ? 1 : 0;
    config.bTxt = has_flag(plan.commandLine, "txt") ? 1 : 0;
    config.bNoSound = has_flag(plan.commandLine, "ns") || has_flag(plan.commandLine, "nosound") ? 1 : 0;
    config.dwAct = 1;
    config.bAmazon = 1;
    config.nLaunchType = LAUNCHTYPE_NONE;
    config.pAllowExpansionCallback = allow_expansion;
    return config;
}

void log_config(Log& log, const D2ConfigStrc& config, const Plan& plan) {
    char buffer[256]{};
    std::snprintf(
        buffer,
        sizeof(buffer),
        "Config ready: size=0x%X expansion=%u window=%u direct=%u txt=%u nosound=%u handoff=%s",
        static_cast<unsigned>(sizeof(config)),
        static_cast<unsigned>(config.bIsExpansion != FALSE),
        static_cast<unsigned>(config.bWindow),
        static_cast<unsigned>(config.bDirect),
        static_cast<unsigned>(config.bTxt),
        static_cast<unsigned>(config.bNoSound),
        plan.handoff ? "enabled" : "disabled"
    );
    log.line(buffer);
    if (!plan.commandLine.empty()) log.line("Command line flags: " + plan.commandLine);
}

std::string win_error(DWORD error) {
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

HMODULE load_library(Log& log, const std::string& path) {
    log.line("Loading " + path);
    std::string native = path; // plans spell box paths with '/'; LoadLibrary documents '\' only
    for (char& c : native) {
        if (c == '/') c = '\\';
    }
    HMODULE module = LoadLibraryA(native.c_str());
    if (!module) {
        log.line("  failed: " + win_error(GetLastError()));
    } else {
        char buffer[64]{};
        std::snprintf(buffer, sizeof(buffer), "  loaded at 0x%p", module);
        log.line(buffer);
    }
    return module;
}

FARPROC proc_by_ordinal(HMODULE module, WORD ordinal) {
    if (!ordinal) return nullptr;
    return GetProcAddress(module, reinterpret_cast<LPCSTR>(static_cast<uintptr_t>(ordinal)));
}

struct CoreOrdinals {
    const char* label;
    WORD fogSetLogPrefix;
    WORD fogInitErrorMgr;
    WORD fogGetSystemInfo;
    WORD fogMPQSetConfig;
    WORD fogAsyncDataInitialize;
    WORD fogAsyncDataDestroy;
    WORD fogStartupNoop;
    WORD fogStartupInit;
    WORD d2winCreateWindow;
    WORD d2winInitializeSpriteCache;
    WORD d2winCloseSpriteCache;
    WORD d2gfxInitialize;
    WORD d2gfxRelease;
    WORD d2gfxSetPerspective;
    WORD d2gfxToggleLowQuality;
    WORD d2gfxSetGamma;
    WORD d2gfxEnableVSync;
    WORD d2soundOpen;
    WORD d2soundClose;
};

// Export ordinals are part of the core ABI, not global Diablo II truth. D2SE's own resolver table
// (D2SE.exe FUN_00401a40) has ten 4-byte version slots per function. The supported D2SE setup order
// is 1.07, 1.08, 1.09b, 1.09d, 1.10f, 1.11b, 1.12a, 1.13c; the last two slots are empty.
const CoreOrdinals kCore107To110 = {
    "D2SE slots 0-4 (1.07-1.10f)",
    10021, 10019, 10022, 10101, 10089, 10090, 10082, 10218,
    10000, 10001, 10002,
    10000, 10001, 10011, 10015, 10018, 10020,
    10000, 10001,
};

const CoreOrdinals kCore111 = {
    "D2SE slot 5 (1.11b)",
    10021, 10019, 10022, 10101, 10089, 10090, 10082, 10218,
    10089, 10100, 10182,
    10000, 10034, 10061, 10055, 10003, 10026,
    10050, 10044,
};

const CoreOrdinals kCore112 = {
    "D2SE slot 6 (1.12a)",
    10021, 10019, 10022, 10101, 10089, 10090, 10082, 10218,
    10188, 10109, 10121,
    10000, 10010, 10069, 10036, 10022, 10008,
    10032, 10002,
};

const CoreOrdinals kCore113 = {
    "D2SE slot 7 (1.13c)",
    10021, 10019, 10022, 10101, 10089, 10090, 10082, 10218,
    10142, 10052, 10032,
    10000, 10084, 10081, 10053, 10034, 10007,
    10002, 10031,
};

const CoreOrdinals& core_ordinals(const std::string& gameVersion) {
    if (gameVersion == "v1.11") return kCore111;
    if (gameVersion == "v1.12") return kCore112;
    if (gameVersion == "v1.13") return kCore113;
    return kCore107To110;
}

bool setup_fog(Log& log, const D2ConfigStrc& config, const std::string& gameVersion, const CoreOrdinals& ordinals, FogBootstrap& fog) {
    fog.module = GetModuleHandleA("Fog.dll");
    if (!fog.module) fog.module = load_library(log, "Fog.dll");
    if (!fog.module) {
        log.line("Cannot bootstrap Fog: Fog.dll did not load.");
        return false;
    }

    const auto setLogPrefix = reinterpret_cast<FogSetLogPrefixPointer>(proc_by_ordinal(fog.module, ordinals.fogSetLogPrefix));
    const auto initErrorMgr = reinterpret_cast<FogInitErrorMgrPointer>(proc_by_ordinal(fog.module, ordinals.fogInitErrorMgr));
    const auto getSystemInfo = reinterpret_cast<FogGetSystemInfoPointer>(proc_by_ordinal(fog.module, ordinals.fogGetSystemInfo));
    const auto mpqSetConfig = reinterpret_cast<FogMPQSetConfigPointer>(proc_by_ordinal(fog.module, ordinals.fogMPQSetConfig));
    const auto asyncDataInitialize = reinterpret_cast<FogAsyncDataInitializePointer>(proc_by_ordinal(fog.module, ordinals.fogAsyncDataInitialize));
    fog.asyncDataDestroy = reinterpret_cast<FogAsyncDataDestroyPointer>(proc_by_ordinal(fog.module, ordinals.fogAsyncDataDestroy));
    const auto startupNoop = reinterpret_cast<FogNoArgsVoidPointer>(proc_by_ordinal(fog.module, ordinals.fogStartupNoop));
    const auto startupInit = reinterpret_cast<FogNoArgsIntPointer>(proc_by_ordinal(fog.module, ordinals.fogStartupInit));

    if (!setLogPrefix || !initErrorMgr || !getSystemInfo || !mpqSetConfig || !asyncDataInitialize || !fog.asyncDataDestroy ||
        !startupNoop || !startupInit) {
        log.line("Cannot bootstrap Fog: one or more early Fog exports were not found.");
        return false;
    }

    // Exactly Game.exe's GameInit (1.10f 0x401970, D2MOO source/Game/src/Main.cpp): the log prefix,
    // then the error manager, with no exception callback. This is where Fog starts validating its
    // critical sections; see critical_sections_have_debug_info.
    setLogPrefix("D2");
    initErrorMgr("Diablo II", nullptr, gameVersion.c_str(), TRUE);
    fog.processInitialized = true;

    void* systemInfo = getSystemInfo();
    if (!systemInfo) {
        log.line("Cannot bootstrap Fog: FOG_GetSystemInfo is still null after FOG_InitErrorMgr.");
        return false;
    }
    const DWORD totalPhysicalMemoryMb = *reinterpret_cast<DWORD*>(static_cast<char*>(systemInfo) + 0x0C) / (1024 * 1024);

    const BOOL mpqConfigOk = mpqSetConfig(config.bDirect, FALSE);
    asyncDataInitialize(TRUE);
    fog.asyncInitialized = true;
    startupNoop();
    const int initResult = startupInit();

    char buffer[160]{};
    std::snprintf(
        buffer,
        sizeof(buffer),
        "Fog bootstrap ready: memory=%luMB MPQSetConfig=%u direct=%u async=1 init10218=%d",
        static_cast<unsigned long>(totalPhysicalMemoryMb),
        static_cast<unsigned>(mpqConfigOk != FALSE),
        static_cast<unsigned>(config.bDirect),
        initResult
    );
    log.line(buffer);
    return true;
}

void teardown_fog(Log& log, FogBootstrap& fog) {
    if (!fog.asyncInitialized || !fog.asyncDataDestroy) return;
    fog.asyncDataDestroy();
    fog.asyncInitialized = false;
    log.line("Fog async data destroyed.");
}

// ---- D2Glide's font build ----------------------------------------------------------------------
//
// D2Glide (1.10f +0x2D90) builds its font by drawing each character on CreateDCA("DISPLAY") and
// reading it back with GetPixel, pixel by pixel. On Windows 10 each read of the display goes through
// the compositor, and the build takes ~90 s per Glide window (measured: the main thread sampled in
// GetPixel under D2Glide+0x2EA7, three times over 30 s). D2SE does not stall; why is not known.
// For D2Glide only, a display DC becomes an off-screen bitmap in the screen's format: the same
// glyphs, read from memory.

std::vector<std::pair<HDC, HBITMAP>> g_offscreen;

HDC WINAPI offscreen_create_dc(LPCSTR driver, LPCSTR device, LPCSTR output, const DEVMODEA* mode) {
    if (!driver || _stricmp(driver, "DISPLAY") != 0 || device) return CreateDCA(driver, device, output, mode);
    HDC screen = GetDC(nullptr);
    HDC dc = CreateCompatibleDC(screen);
    HBITMAP bitmap = dc ? CreateCompatibleBitmap(screen, 1024, 1024) : nullptr;
    ReleaseDC(nullptr, screen);
    if (!dc || !bitmap) {
        if (dc) DeleteDC(dc);
        return CreateDCA(driver, device, output, mode);
    }
    SelectObject(dc, bitmap);
    g_offscreen.emplace_back(dc, bitmap);
    return dc;
}

BOOL WINAPI offscreen_delete_dc(HDC dc) {
    const BOOL result = DeleteDC(dc);
    for (auto it = g_offscreen.begin(); it != g_offscreen.end(); ++it) {
        if (it->first == dc) {
            DeleteObject(it->second);
            g_offscreen.erase(it);
            break;
        }
    }
    return result;
}

// Points one import of `module` (by DLL and function name) at `replacement`. Only that module's own
// calls change.
bool patch_import(HMODULE module, const char* dll, const char* function, void* replacement) {
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

void patch_glide_font(Log& log) {
    HMODULE glide = GetModuleHandleA("D2Glide.dll");
    if (!glide) glide = load_library(log, "D2Glide.dll");
    if (!glide) return;
    const bool create = patch_import(glide, "GDI32.dll", "CreateDCA", reinterpret_cast<void*>(offscreen_create_dc));
    const bool remove = patch_import(glide, "GDI32.dll", "DeleteDC", reinterpret_cast<void*>(offscreen_delete_dc));
    log.line(std::string("D2Glide font build redirected off-screen: CreateDCA ") + (create ? "yes" : "no") + ", DeleteDC " + (remove ? "yes" : "no"));
}

int render_mode(const D2ConfigStrc& config) {
    if (config.b3DFX) return 4;
    if (config.bWindow) return 1;
    if (config.bOpenGL) return 5;
    if (config.bRave) return 7;
    if (config.bD3D) return 6;
    return 3;
}

const char* render_driver_name(int mode) {
    switch (mode) {
    case 1:
        return "D2Gdi.dll";
    case 3:
        return "D2DDraw.dll";
    case 4:
        return "D2Glide.dll";
    case 5:
        return "D2OpenGL.dll";
    case 6:
        return "D2Direct3D.dll";
    case 7:
        return "D2Rave.dll";
    default:
        return "";
    }
}

LRESULT CALLBACK probe_wnd_proc(HWND hwnd, UINT message, WPARAM wparam, LPARAM lparam) {
    return DefWindowProcA(hwnd, message, wparam, lparam);
}

void __fastcall helper_fill_y_buffer_table(uint8_t*, int32_t, int32_t, int32_t) {}
void __fastcall helper_draw_vis_tile(uint8_t*, int32_t, int32_t) {}
void __fastcall helper_unknown(uint8_t*, int32_t, int32_t, uint8_t) {}
void __fastcall helper_floor_tile_draw(void*, int32_t, int32_t, void*) {}
void __fastcall helper_tile_draw_lit(uint8_t*, int32_t, int32_t, int32_t*) {}
void __fastcall helper_draw_blended_vis_tile(int32_t, int32_t, int32_t, uint8_t) {}
void __fastcall helper_draw_roof_tile(int32_t, int32_t, int32_t, int32_t*, uint8_t) {}

D2GfxHelperProbe gfxHelperProbe{
    helper_fill_y_buffer_table,
    helper_draw_vis_tile,
    helper_unknown,
    helper_floor_tile_draw,
    helper_tile_draw_lit,
    helper_draw_blended_vis_tile,
    helper_draw_roof_tile,
};

bool probe_renderer_surface(Log& log, D2GraphicsInterfaceProbe* iface) {
    if (!iface->pfCreateSurface || !iface->pfCloseSurface) {
        log.line("Render driver surface probe skipped: createSurface or closeSurface pointer is missing.");
        return true;
    }

    HINSTANCE instance = GetModuleHandleA(nullptr);
    const char* className = "ExordiumD2SurfaceProbe";
    WNDCLASSA wndClass{};
    wndClass.lpfnWndProc = probe_wnd_proc;
    wndClass.hInstance = instance;
    wndClass.lpszClassName = className;
    RegisterClassA(&wndClass);

    HWND hwnd = CreateWindowExA(
        0,
        className,
        "Exordium D2 Surface Probe",
        WS_OVERLAPPEDWINDOW,
        CW_USEDEFAULT,
        CW_USEDEFAULT,
        640,
        480,
        nullptr,
        nullptr,
        instance,
        nullptr
    );
    if (!hwnd) {
        log.line("Render driver surface probe failed: CreateWindowExA failed: " + win_error(GetLastError()));
        UnregisterClassA(className, instance);
        return false;
    }

    log.line("Render driver surface probe starting.");
    const BOOL surfaceOk = iface->pfCreateSurface(hwnd, 0);
    char buffer[96]{};
    std::snprintf(buffer, sizeof(buffer), "Render driver surface probe: createSurface=%u", static_cast<unsigned>(surfaceOk != FALSE));
    log.line(buffer);
    if (surfaceOk) {
        const BOOL closeSurfaceOk = iface->pfCloseSurface();
        std::snprintf(buffer, sizeof(buffer), "Render driver surface probe closed: closeSurface=%u", static_cast<unsigned>(closeSurfaceOk != FALSE));
        log.line(buffer);
    }

    DestroyWindow(hwnd);
    UnregisterClassA(className, instance);
    log.line("Render driver surface probe window destroyed.");
    return true;
}

bool probe_gfx_wrapper(Log& log, HMODULE d2gfx, int mode, BOOL windowed) {
    const auto initialize = reinterpret_cast<D2GfxInitializePointer>(proc_by_ordinal(d2gfx, 10000));
    const auto release = reinterpret_cast<D2GfxReleasePointer>(proc_by_ordinal(d2gfx, 10001));
    if (!initialize || !release) {
        log.line("D2Gfx wrapper probe skipped: initialize or release export is missing.");
        return true;
    }

    log.line("D2Gfx wrapper probe starting.");
    const int initOk = initialize(GetModuleHandleA(nullptr), probe_wnd_proc, mode, windowed != FALSE);
    char buffer[128]{};
    std::snprintf(buffer, sizeof(buffer), "D2Gfx wrapper probe: initialize=%d", initOk);
    log.line(buffer);
    if (initOk) {
        const int releaseOk = release();
        std::snprintf(buffer, sizeof(buffer), "D2Gfx wrapper probe released: release=%d", releaseOk);
        log.line(buffer);
    }
    return true;
}

bool probe_gfx_window(Log& log, HMODULE d2gfx, int mode, BOOL windowed) {
    const auto initialize = reinterpret_cast<D2GfxInitializePointer>(proc_by_ordinal(d2gfx, 10000));
    const auto release = reinterpret_cast<D2GfxReleasePointer>(proc_by_ordinal(d2gfx, 10001));
    const auto windowCreate = reinterpret_cast<WindowCreatePointer>(proc_by_ordinal(d2gfx, 10023));
    const auto windowDestroy = reinterpret_cast<WindowDestroyPointer>(proc_by_ordinal(d2gfx, 10024));
    if (!initialize || !release || !windowCreate || !windowDestroy) {
        log.line("D2Gfx window probe skipped: required D2Gfx exports are missing.");
        return true;
    }

    log.line("D2Gfx window probe starting.");
    const int initOk = initialize(GetModuleHandleA(nullptr), probe_wnd_proc, mode, windowed != FALSE);
    char buffer[128]{};
    std::snprintf(buffer, sizeof(buffer), "D2Gfx window probe: initialize=%d", initOk);
    log.line(buffer);
    if (!initOk) return true;

    const int createOk = windowCreate(windowed != FALSE, 0);
    std::snprintf(buffer, sizeof(buffer), "D2Gfx window probe: windowCreate=%d", createOk);
    log.line(buffer);
    if (createOk) {
        const int destroyOk = windowDestroy();
        std::snprintf(buffer, sizeof(buffer), "D2Gfx window probe destroyed: windowDestroy=%d", destroyOk);
        log.line(buffer);
    }

    const int releaseOk = release();
    std::snprintf(buffer, sizeof(buffer), "D2Gfx window probe released: release=%d", releaseOk);
    log.line(buffer);
    return true;
}

bool initialize_d2win_gfx(Log& log, HMODULE d2win, HMODULE d2gfx, const BOOL compress, const int mode, const BOOL windowed) {
    HMODULE d2cmp = GetModuleHandleA("D2CMP.dll");
    if (!d2cmp) d2cmp = load_library(log, "D2CMP.dll");
    const auto setCompressedDataMode = d2cmp
        ? reinterpret_cast<D2CmpSetCompressedDataModePointer>(proc_by_ordinal(d2cmp, 10054))
        : nullptr;
    const auto initialize = reinterpret_cast<D2GfxInitializePointer>(proc_by_ordinal(d2gfx, 10000));
    if (!setCompressedDataMode || !initialize) {
        log.line("Manual D2Win gfx init failed: D2CMP or D2Gfx export is missing.");
        return false;
    }

    // D2Win.#10000 is D2CMP_SetCompressedDataMode followed by D2GFX_Initialize with this WndProc.
    const auto d2winWndProc = reinterpret_cast<WNDPROC>(reinterpret_cast<uintptr_t>(d2win) + 0xD9B0);
    setCompressedDataMode(compress);
    const int initOk = initialize(GetModuleHandleA(nullptr), d2winWndProc, mode, windowed != FALSE);
    char buffer[192]{};
    std::snprintf(
        buffer,
        sizeof(buffer),
        "Manual D2Win gfx init: compress=%u mode=%d windowed=%u initialize=%d",
        static_cast<unsigned>(compress != FALSE),
        mode,
        static_cast<unsigned>(windowed != FALSE),
        initOk
    );
    log.line(buffer);
    return initOk != 0;
}

void write_dword(HMODULE module, uintptr_t rva, DWORD value) {
    *reinterpret_cast<DWORD*>(reinterpret_cast<uintptr_t>(module) + rva) = value;
}

bool initialize_d2win_sprite_cache(Log& log, HMODULE d2win, HMODULE d2gfx, const BOOL windowed) {
    HMODULE d2cmp = GetModuleHandleA("D2CMP.dll");
    if (!d2cmp) d2cmp = load_library(log, "D2CMP.dll");
    const auto initSpriteCache = d2cmp
        ? reinterpret_cast<D2CmpInitSpriteCachePointer>(proc_by_ordinal(d2cmp, 10052))
        : nullptr;
    const auto windowCreate = reinterpret_cast<WindowCreatePointer>(proc_by_ordinal(d2gfx, 10023));
    const auto windowGetWindow = reinterpret_cast<WindowGetWindowPointer>(proc_by_ordinal(d2gfx, 10027));
    if (!initSpriteCache || !windowCreate || !windowGetWindow) {
        log.line("Manual D2Win sprite init failed: D2CMP or D2Gfx export is missing.");
        return false;
    }

    write_dword(d2win, 0x5E26C, 1);
    log.line("Manual D2Win sprite init: calling WINDOW_Create.");
    const int windowOk = windowCreate(windowed != FALSE, 0);
    char buffer[160]{};
    std::snprintf(buffer, sizeof(buffer), "Manual D2Win sprite init: WINDOW_Create=%d", windowOk);
    log.line(buffer);
    if (!windowOk) return false;

    log.line("Manual D2Win sprite init: calling D2CMP_InitSpriteCache.");
    initSpriteCache(nullptr, 0x800000, 0x7D000, 0);
    log.line("Manual D2Win sprite init: D2CMP_InitSpriteCache returned.");

    const HWND hwnd = windowGetWindow();
    const uintptr_t zeroes[] = {
        0x5E240, 0x5E24C, 0x5E250, 0x5E254, 0x5E25C, 0x5E260,
        0x5E258, 0x5E268, 0x5E264, 0x5E278, 0x5E230, 0x5E27C,
    };
    for (uintptr_t rva : zeroes) write_dword(d2win, rva, 0);
    write_dword(d2win, 0x5E248, 0);
    write_dword(d2win, 0x5E23C, reinterpret_cast<DWORD>(hwnd));
    write_dword(d2win, 0x5E244, windowed != FALSE);
    std::snprintf(buffer, sizeof(buffer), "Manual D2Win sprite init ready: hwnd=0x%p windowed=%u", hwnd, static_cast<unsigned>(windowed != FALSE));
    log.line(buffer);
    return true;
}

bool probe_render_driver(Log& log, int mode, BOOL windowed, bool probeInit, bool probeSurface) {
    const char* driverName = render_driver_name(mode);
    if (!driverName[0]) {
        log.line("Render driver probe skipped: no driver for selected mode.");
        return false;
    }

    HMODULE driver = GetModuleHandleA(driverName);
    if (!driver) driver = load_library(log, driverName);
    if (!driver) {
        log.line(std::string("Render driver probe failed: ") + driverName + " did not load.");
        return false;
    }

    const auto getInterface = reinterpret_cast<GetGraphicsInterfacePointer>(proc_by_ordinal(driver, 10000));
    if (!getInterface) {
        log.line(std::string("Render driver probe failed: ") + driverName + " ordinal 10000 not found.");
        return false;
    }

    D2GraphicsInterfaceProbe* iface = getInterface();
    if (!iface) {
        log.line(std::string("Render driver probe failed: ") + driverName + " returned a null interface.");
        return false;
    }

    char buffer[256]{};
    std::snprintf(
        buffer,
        sizeof(buffer),
        "Render driver probe ready: driver=%s interface=0x%p detect=0x%p init=0x%p surface=0x%p setOption=0x%p",
        driverName,
        iface,
        iface->pfDetect,
        iface->pfInit,
        iface->pfCreateSurface,
        iface->pfSetOption
    );
    log.line(buffer);

    if (!iface->pfDetect || !iface->pfSetOption) {
        log.line("Render driver detect skipped: detect or setOption pointer is missing.");
        return true;
    }

    const BOOL setOptionOk = iface->pfSetOption(8, windowed == TRUE);
    const BOOL detectOk = iface->pfDetect(GetModuleHandleA(nullptr));
    std::snprintf(
        buffer,
        sizeof(buffer),
        "Render driver detect: setOption=%u windowed=%u detect=%u",
        static_cast<unsigned>(setOptionOk != FALSE),
        static_cast<unsigned>(windowed != FALSE),
        static_cast<unsigned>(detectOk != FALSE)
    );
    log.line(buffer);

    if (!probeInit && !probeSurface) return true;
    if (!iface->pfInit || !iface->pfClose) {
        log.line("Render driver init skipped: init or close pointer is missing.");
        return true;
    }

    D2GfxSettingsProbe settings{0, 1, 0, 155, 1, 1};
    log.line("Render driver init probe starting.");
    const BOOL initOk = iface->pfInit(&settings, &gfxHelperProbe);
    std::snprintf(
        buffer,
        sizeof(buffer),
        "Render driver init probe: init=%u perspectiveCapable=%u gamma=%d vsync=%u",
        static_cast<unsigned>(initOk != FALSE),
        static_cast<unsigned>(settings.bPerspectiveCapable != FALSE),
        settings.nGamma,
        static_cast<unsigned>(settings.bVSync != FALSE)
    );
    log.line(buffer);
    if (initOk) {
        if (probeSurface) probe_renderer_surface(log, iface);
        const BOOL closeOk = iface->pfClose();
        std::snprintf(buffer, sizeof(buffer), "Render driver init probe closed: close=%u", static_cast<unsigned>(closeOk != FALSE));
        log.line(buffer);
    }
    return true;
}

// Fog.#10102 / #10103 (D2MOO Fog.h) and D2Win's ARCHIVE_LoadMPQFile (1.10f D2Win+0x12399, D2MOO
// D2Hell/src/Archive.cpp; __fastcall, the first argument unused), which D2GL and D2Mod call.
using FogFOpenFilePointer = BOOL (__fastcall*)(const char*, HANDLE*);
using FogFCloseFilePointer = void (__fastcall*)(HANDLE);
using D2WinLoadMpqPointer = void* (__fastcall*)(const char*, const char*, const char*, int, HANDLE, void*, int);

void probe_files(Log& log, const Plan& plan, HMODULE fog, const std::vector<HANDLE>& archives) {
    if (plan.probeMpqs.empty() && plan.probeFiles.empty()) return;
    HMODULE d2win = GetModuleHandleA("D2Win.dll");
    if (d2win && plan.gameVersion == "v1.10") {
        const auto load = reinterpret_cast<D2WinLoadMpqPointer>(reinterpret_cast<uintptr_t>(d2win) + 0x12399);
        for (const std::string& mpq : plan.probeMpqs) {
            char cwd[MAX_PATH]{};
            GetCurrentDirectoryA(MAX_PATH, cwd);
            const std::string path = std::string(cwd) + "\\" + mpq;
            void* handle = load("probe.dll", path.c_str(), nullptr, 0, nullptr, nullptr, 0);
            char buffer[MAX_PATH + 64]{};
            std::snprintf(buffer, sizeof(buffer), "Probe: ARCHIVE_LoadMPQFile(%s) = 0x%p", path.c_str(), handle);
            log.line(buffer);
        }
    }
    const auto open = reinterpret_cast<FogFOpenFilePointer>(proc_by_ordinal(fog, 10102));
    const auto close = reinterpret_cast<FogFCloseFilePointer>(proc_by_ordinal(fog, 10103));
    for (std::string file : plan.probeFiles) {
        for (char& c : file) {
            if (c == '/') c = '\\'; // the JSON reader keeps escapes, so paths are written with '/'
        }
        HANDLE handle = nullptr;
        const BOOL ok = open && open(file.c_str(), &handle);
        log.line(std::string("Probe: FOG_FOpenFile(") + file + ") = " + (ok ? "ok" : "failed, error " + std::to_string(GetLastError())));
        if (ok && close) close(handle);
        // Storm #268 SFileOpenFileEx(archive, name, scope, &file) against each archive opened here.
        HMODULE storm = GetModuleHandleA("Storm.dll");
        const auto openEx = storm ? reinterpret_cast<BOOL (__stdcall*)(HANDLE, const char*, DWORD, HANDLE*)>(proc_by_ordinal(storm, 268)) : nullptr;
        const auto closeFile = storm ? reinterpret_cast<BOOL (__stdcall*)(HANDLE)>(proc_by_ordinal(storm, 253)) : nullptr;
        for (size_t i = 0; openEx && i < archives.size(); ++i) {
            HANDLE inner = nullptr;
            if (openEx(archives[i], file.c_str(), 0, &inner)) {
                log.line("  found in archive #" + std::to_string(i));
                if (closeFile) closeFile(inner);
            }
        }
    }
    char modules[64]{};
    std::snprintf(modules, sizeof(modules), "Probe: Storm.dll at 0x%p", static_cast<void*>(GetModuleHandleA("Storm.dll")));
    log.line(modules);
}

bool setup_gfx(
    Log& log,
    const D2ConfigStrc& config,
    const CoreOrdinals& ordinals,
    bool startGraphics,
    bool manual,
    bool probeInit,
    bool probeSurface,
    bool probeWrapper,
    bool probeWindow,
    GfxBootstrap& gfx
) {
    gfx.d2win = GetModuleHandleA("D2Win.dll");
    if (!gfx.d2win) gfx.d2win = load_library(log, "D2Win.dll");
    gfx.d2gfx = GetModuleHandleA("D2Gfx.dll");
    if (!gfx.d2gfx) gfx.d2gfx = load_library(log, "D2Gfx.dll");
    if (!gfx.d2win || !gfx.d2gfx) {
        log.line("Cannot bootstrap gfx: D2Win.dll or D2Gfx.dll did not load.");
        return false;
    }

    const auto createWindow = reinterpret_cast<D2WinCreateWindowPointer>(proc_by_ordinal(gfx.d2win, ordinals.d2winCreateWindow));
    const auto initializeSpriteCache = reinterpret_cast<D2WinInitializeSpriteCachePointer>(proc_by_ordinal(gfx.d2win, ordinals.d2winInitializeSpriteCache));
    gfx.closeSpriteCache = reinterpret_cast<D2WinCloseSpriteCachePointer>(proc_by_ordinal(gfx.d2win, ordinals.d2winCloseSpriteCache));
    gfx.release = reinterpret_cast<D2GfxReleasePointer>(proc_by_ordinal(gfx.d2gfx, ordinals.d2gfxRelease));
    const auto setPerspective = reinterpret_cast<D2GfxSetPerspectivePointer>(proc_by_ordinal(gfx.d2gfx, ordinals.d2gfxSetPerspective));
    const auto toggleLowQuality = reinterpret_cast<D2GfxToggleLowQualityPointer>(proc_by_ordinal(gfx.d2gfx, ordinals.d2gfxToggleLowQuality));
    const auto setGamma = reinterpret_cast<D2GfxSetGammaPointer>(proc_by_ordinal(gfx.d2gfx, ordinals.d2gfxSetGamma));
    const auto enableVSync = reinterpret_cast<D2GfxEnableVSyncPointer>(proc_by_ordinal(gfx.d2gfx, ordinals.d2gfxEnableVSync));

    if (!createWindow || !initializeSpriteCache || !gfx.closeSpriteCache || !gfx.release) {
        log.line(std::string("Cannot bootstrap gfx: D2Win/D2Gfx startup ordinals are not mapped for ") + ordinals.label + ".");
        return false;
    }

    const int mode = render_mode(config);
    const BOOL windowed = config.bWindow != 0;
    const BOOL compress = config.bNoCompress == 0;
    if (!startGraphics) {
        probe_render_driver(log, mode, windowed, probeInit, probeSurface);
        if (probeWrapper) probe_gfx_wrapper(log, gfx.d2gfx, mode, windowed);
        if (probeWindow) probe_gfx_window(log, gfx.d2gfx, mode, windowed);
        char buffer[176]{};
        std::snprintf(
            buffer,
            sizeof(buffer),
            "Gfx exports ready: mode=%d windowed=%u compress=%u startup=disabled",
            mode,
            static_cast<unsigned>(windowed != FALSE),
            static_cast<unsigned>(compress != FALSE)
        );
        log.line(buffer);
        return true;
    }

    if (mode == 4) patch_glide_font(log); // before the window: D2Glide builds its font as it opens
    // Game.exe's GameStart (1.10f 0x401570): D2Win #10000 then #10001 at 640x480. The inlined
    // versions below poke 1.10f D2Win globals by address and stay as a diagnostic only.
    const bool windowReady = manual ? initialize_d2win_gfx(log, gfx.d2win, gfx.d2gfx, compress, mode, windowed)
                                    : createWindow(GetModuleHandleA(nullptr), mode, windowed, compress) != FALSE;
    if (!windowReady) {
        log.line(manual ? "D2Win-compatible gfx init failed." : "D2Win_CreateWindow (D2Win.10000) failed.");
        return false;
    }
    gfx.gfxStarted = true;

    const bool spritesReady = manual ? initialize_d2win_sprite_cache(log, gfx.d2win, gfx.d2gfx, windowed)
                                     : initializeSpriteCache(windowed, 0) != FALSE;
    if (!spritesReady) {
        log.line(manual ? "D2Win-compatible sprite init failed." : "D2Win_InitializeSpriteCache (D2Win.10001) failed.");
        return false;
    }
    gfx.spriteCacheStarted = true;

    if (config.bPerspective && mode >= 4 && setPerspective) setPerspective(TRUE);
    if (config.bQuality && toggleLowQuality) toggleLowQuality();
    if (config.dwGamma && setGamma) setGamma(config.dwGamma);
    if (config.bVSync && enableVSync) enableVSync();

    char buffer[160]{};
    std::snprintf(
        buffer,
        sizeof(buffer),
        "Gfx bootstrap ready: mode=%d windowed=%u compress=%u resolution=640x480",
        mode,
        static_cast<unsigned>(windowed != FALSE),
        static_cast<unsigned>(compress != FALSE)
    );
    log.line(buffer);
    return true;
}

void teardown_gfx(Log& log, GfxBootstrap& gfx) {
    if (gfx.spriteCacheStarted && gfx.closeSpriteCache) {
        gfx.closeSpriteCache();
        gfx.spriteCacheStarted = false;
        log.line("D2Win sprite cache closed.");
    }
    if (gfx.gfxStarted && gfx.release) {
        gfx.release();
        gfx.gfxStarted = false;
        log.line("D2Gfx released.");
    }
}

void close_archives(Log& log, SFileCloseArchivePointer closeArchive, std::vector<HANDLE>& archives) {
    if (!closeArchive) return;
    for (auto it = archives.rbegin(); it != archives.rend(); ++it) {
        if (*it) closeArchive(*it);
    }
    if (!archives.empty()) log.line("MPQ archives closed.");
    archives.clear();
}

bool open_archives(Log& log, const Plan& plan, std::vector<HANDLE>& archives, SFileCloseArchivePointer& closeArchive) {
    if (plan.archives.empty()) {
        log.line("No MPQ archives listed in exordium-loader.json.");
        return true;
    }

    HMODULE storm = GetModuleHandleA("Storm.dll");
    if (!storm) storm = load_library(log, "Storm.dll");
    if (!storm) {
        log.line("Cannot open MPQs: Storm.dll did not load.");
        return false;
    }

    // The static import (storm.def), not GetProcAddress: it is what makes Storm load with the process.
    const SFileOpenArchivePointer openArchive = SFileOpenArchive;
    closeArchive = reinterpret_cast<SFileCloseArchivePointer>(proc_by_ordinal(storm, 252));
    if (!openArchive || !closeArchive) {
        log.line("Cannot open MPQs: Storm archive exports were not found.");
        return false;
    }

    log.line("Opening MPQ archive stack:");
    for (const ArchiveLoad& archive : plan.archives) {
        HANDLE handle = nullptr;
        std::string path = archive.path;
        const BOOL ok = openArchive(path.data(), archive.priority, 2, &handle);
        if (ok && handle) {
            archives.push_back(handle);
            char buffer[256]{};
            std::snprintf(
                buffer,
                sizeof(buffer),
                "  ok priority=%d kind=%s path=%s handle=0x%p",
                archive.priority,
                archive.kind.c_str(),
                archive.path.c_str(),
                handle
            );
            log.line(buffer);
            continue;
        }

        const DWORD error = GetLastError();
        std::string message = "  missing priority=" + std::to_string(archive.priority) + " kind=" + archive.kind
            + " path=" + archive.path + ": " + win_error(error);
        log.line(message);
        if (archive.required) {
            close_archives(log, closeArchive, archives);
            return false;
        }
    }

    char buffer[96]{};
    std::snprintf(buffer, sizeof(buffer), "MPQ stack ready: %u archives open.", static_cast<unsigned>(archives.size()));
    log.line(buffer);
    return true;
}

FARPROC plugin_export(HMODULE module, const std::string& name) {
    if (name.empty()) return nullptr;
    if (name.find_first_not_of("0123456789") == std::string::npos) {
        return proc_by_ordinal(module, static_cast<WORD>(std::strtoul(name.c_str(), nullptr, 10)));
    }
    return GetProcAddress(module, name.c_str());
}

// How each plugin kind's init is called, as checked against the binaries; a kind not listed stays
// uncalled, since a wrong guess unbalances the stack.
// - D2Mod (#10000 / #10001): both end in a plain `ret` and read no arguments. Init LoadLibrary's the
//   game DLLs it patches itself, then reads D2Mod.ini.
// - PlugY (_Init@4 / _Release@0): init takes one pointer, used only to say who called it — non-null
//   logs "called from D2mod.dll", null "called from D2gfx.dll", PlugY's own launcher path. Null it is.
//   Release takes nothing. Both return a bool in AL.
enum class PluginCall { Unverified, NoArguments, NullPointer };

PluginCall plugin_call(const PluginLoad& plugin) {
    if (plugin.kind == "d2mod") return PluginCall::NoArguments;
    if (plugin.kind == "plugy") return PluginCall::NullPointer;
    return PluginCall::Unverified;
}

using PluginNoArgsPointer = int (__stdcall*)();
using PluginPointerArgPointer = int (__stdcall*)(const char*);

struct LoadedPlugin {
    PluginLoad plugin;
    HMODULE module = nullptr;
    bool initialized = false;
};

bool call_plugin_init(Log& log, LoadedPlugin& loaded) {
    const PluginLoad& plugin = loaded.plugin;
    if (plugin.init.empty()) return true;
    FARPROC proc = plugin_export(loaded.module, plugin.init);
    if (!proc) {
        log.line("  init export not found: " + plugin.init);
        return false;
    }
    const PluginCall call = plugin_call(plugin);
    if (call == PluginCall::Unverified) {
        log.line("  init export found: " + plugin.init + " (not invoked: signature not verified for " + plugin.kind + ")");
        return true;
    }
    // PlugY returns a bool in AL; only the low byte of EAX is meaningful for it.
    const int result = call == PluginCall::NoArguments ? reinterpret_cast<PluginNoArgsPointer>(proc)()
                                                       : reinterpret_cast<PluginPointerArgPointer>(proc)(nullptr) & 0xFF;
    loaded.initialized = true;
    log.line("  init " + plugin.init + " returned " + std::to_string(result));
    return true;
}

void call_plugin_release(Log& log, LoadedPlugin& loaded) {
    if (!loaded.initialized) return;
    FARPROC proc = plugin_export(loaded.module, loaded.plugin.release);
    if (!proc) return;
    const int result = reinterpret_cast<PluginNoArgsPointer>(proc)() & (loaded.plugin.kind == "plugy" ? 0xFF : ~0);
    loaded.initialized = false;
    log.line("Released " + loaded.plugin.path + " (" + loaded.plugin.release + " returned " + std::to_string(result) + ")");
}

// D2Sound #10000 / #10001 (1.10f), D2MOO D2Sound.h. 1.13 added a background-sound argument.
using D2SoundOpenPointer = void (__fastcall*)(BOOL);
using D2SoundClosePointer = void (__fastcall*)();

struct SoundBootstrap {
    D2SoundClosePointer close = nullptr;
    bool started = false;
};

void setup_sound(Log& log, const D2ConfigStrc& config, const CoreOrdinals& ordinals, SoundBootstrap& sound) {
    if (config.bNoSound) {
        log.line("Sound off (-ns).");
        return;
    }
    HMODULE d2sound = GetModuleHandleA("D2Sound.dll");
    if (!d2sound) d2sound = load_library(log, "D2Sound.dll");
    const auto open = d2sound ? reinterpret_cast<D2SoundOpenPointer>(proc_by_ordinal(d2sound, ordinals.d2soundOpen)) : nullptr;
    sound.close = d2sound ? reinterpret_cast<D2SoundClosePointer>(proc_by_ordinal(d2sound, ordinals.d2soundClose)) : nullptr;
    if (!open || !sound.close) {
        log.line("D2Sound exports not found; continuing without sound.");
        return;
    }
    open(config.bIsExpansion);
    sound.started = true;
    log.line("Sound system open.");
}

void teardown_sound(Log& log, SoundBootstrap& sound) {
    if (!sound.started) return;
    sound.close();
    sound.started = false;
    log.line("Sound system closed.");
}

const char* module_dll(D2Module module) {
    // Game.exe 1.10f's table (D2MOO Main.cpp lpszD2Module); 1.00 had D2MultiLAN.dll before the last.
    static const char* const names[] = {"none.dll", "D2Client.dll", "D2Server.dll", "D2Multi.dll", "D2Launch.dll", "D2EClient.dll"};
    return module < sizeof(names) / sizeof(names[0]) ? names[module] : nullptr;
}

// Game.exe's GameStart loop: load the selected module, call the first pointer of its interface with
// the config, and go to whichever module it returns, until one returns MODULE_NONE.
void run_modules(Log& log, D2ConfigStrc& config, SoundBootstrap& sound, GfxBootstrap& gfx) {
    D2Module state = MODULE_LAUNCHER;
    while (state != MODULE_NONE) {
        const char* dll = module_dll(state);
        if (!dll) {
            log.line("Module loop: unknown module " + std::to_string(static_cast<unsigned>(state)) + "; stopping.");
            return;
        }
        if (state == MODULE_SERVER) {
            // A dedicated server has no window or sound; Game.exe drops both before loading it.
            teardown_sound(log, sound);
            teardown_gfx(log, gfx);
        }
        HMODULE module = GetModuleHandleA(dll);
        if (!module) module = load_library(log, dll);
        const FARPROC query = module ? GetProcAddress(module, "QueryInterface") : nullptr;
        void* iface = query ? reinterpret_cast<QueryInterface>(query)() : nullptr;
        const ModuleInitPointer init = iface ? *reinterpret_cast<ModuleInitPointer*>(iface) : nullptr;
        if (!init) {
            log.line(std::string("Module loop: ") + dll + " has no usable QueryInterface; stopping.");
            return;
        }
        log.line(std::string("Entering ") + dll);
        const D2Module next = init(&config);
        log.line(std::string(dll) + " returned module " + std::to_string(static_cast<unsigned>(next)));
        state = next;
    }
}

// ---- The box's registry ------------------------------------------------------------------------
//
// The hive is a private app hive (RegLoadAppKey): no other process sees it. Its top level holds
// "HKCU" and "HKLM" subkeys, and HKEY_CURRENT_USER is pointed at "HKCU" for this process, so the
// game's own RegOpenKeyEx calls land in it. Values arrive as exordium-registry.txt, one per line:
// key TAB name TAB type TAB data, with \\ \t \r \n \0 escaped (@exordium/registry, hive-text.ts).

std::wstring widen(const std::string& text) {
    if (text.empty()) return {};
    const int size = MultiByteToWideChar(CP_UTF8, 0, text.data(), static_cast<int>(text.size()), nullptr, 0);
    std::wstring out(static_cast<size_t>(size), L'\0');
    MultiByteToWideChar(CP_UTF8, 0, text.data(), static_cast<int>(text.size()), out.data(), size);
    return out;
}

std::string narrow(const std::wstring& text) {
    if (text.empty()) return {};
    const int size = WideCharToMultiByte(CP_UTF8, 0, text.data(), static_cast<int>(text.size()), nullptr, 0, nullptr, nullptr);
    std::string out(static_cast<size_t>(size), '\0');
    WideCharToMultiByte(CP_UTF8, 0, text.data(), static_cast<int>(text.size()), out.data(), size, nullptr, nullptr);
    return out;
}

std::string hive_unescape(const std::string& field, bool& ok) {
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

std::string hive_escape(const std::string& field) {
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
bool split_root(const std::string& key, std::string& root, std::string& path) {
    const size_t slash = key.find('\\');
    root = key.substr(0, slash);
    path = slash == std::string::npos ? std::string() : key.substr(slash + 1);
    return root == "HKCU" || root == "HKLM";
}

bool write_hive_value(HKEY hive, const std::string& key, const std::string& name, const std::string& type, const std::string& data) {
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
bool setup_registry(Log& log, const Plan& plan) {
    if (plan.hive.empty()) {
        log.line("No registry hive configured: the game uses the machine's registry.");
        return true;
    }
    HKEY hive{};
    const LONG load = RegLoadAppKeyW(widen(plan.hive).c_str(), &hive, KEY_ALL_ACCESS, 0, 0);
    if (load != ERROR_SUCCESS) {
        log.line("RegLoadAppKey(" + plan.hive + ") failed: " + win_error(static_cast<DWORD>(load)));
        return false;
    }
    unsigned written = 0;
    unsigned refused = 0;
    if (!plan.registryFile.empty()) {
        std::istringstream lines(read_file(plan.registryFile.c_str()));
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
    log.line("Private HKCU installed from " + plan.hive + ": " + std::to_string(written) + " values written, " + std::to_string(refused) +
             " refused.");
    return refused == 0;
}

void dump_key(HKEY key, const std::string& path, std::string& out) {
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
int dump_hive(const std::string& hivePath, const std::string& outPath) {
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

// Diagnostic: the first exceptions the process raises, before any handler of the game's (Fog installs
// an unhandled-exception filter) gets to them. A crash inside that filter shows as a stack overflow,
// hiding the fault that started it.
Log* g_exceptionLog = nullptr;
DWORD g_mainThread = 0;
LONG g_exceptionCount = 0;

// The return addresses on a stack, newest first: dwords just after a call instruction into a loaded
// module. Enough to see which functions a recursion cycles through.
// The main thread's stack top, for the watchdog, which walks that stack from another thread.
std::uintptr_t g_mainStackTop = 0;

std::string describe_address(std::uintptr_t value) {
    HMODULE module = nullptr;
    if (!GetModuleHandleExA(
            GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS | GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT,
            reinterpret_cast<LPCSTR>(value),
            &module
        )) {
        return {};
    }
    char name[MAX_PATH] = "?";
    GetModuleFileNameA(module, name, MAX_PATH);
    const char* base = std::strrchr(name, '\\');
    char buffer[MAX_PATH + 32]{};
    std::snprintf(buffer, sizeof(buffer), "%s+0x%X", base ? base + 1 : name, static_cast<unsigned>(value - reinterpret_cast<std::uintptr_t>(module)));
    return buffer;
}

struct WatchdogArgs {
    Log* log;
    DWORD mainThread;
    int seconds;
};

// Diagnostic (`watchdogSeconds` in exordium-loader.json): every N seconds, three times, where the main
// thread is — its instruction pointer and the return addresses on its stack. The stack is copied
// while the thread is suspended and only read after it resumes, so a thread stopped inside the CRT
// or the loader lock cannot deadlock the watchdog's own logging.
DWORD WINAPI watchdog(void* raw) {
    const WatchdogArgs args = *static_cast<WatchdogArgs*>(raw);
    delete static_cast<WatchdogArgs*>(raw);
    HANDLE thread = OpenThread(THREAD_SUSPEND_RESUME | THREAD_GET_CONTEXT, FALSE, args.mainThread);
    if (!thread) return 1;
    for (int round = 1; round <= 3; ++round) {
        Sleep(static_cast<DWORD>(args.seconds) * 1000);
        CONTEXT context{};
        context.ContextFlags = CONTEXT_CONTROL;
        std::vector<std::uintptr_t> words;
        if (SuspendThread(thread) == static_cast<DWORD>(-1)) break;
        const BOOL got = GetThreadContext(thread, &context);
        if (got && g_mainStackTop > context.Esp && g_mainStackTop - context.Esp <= 0x100000) {
            words.resize((g_mainStackTop - context.Esp) / sizeof(std::uintptr_t));
            std::memcpy(words.data(), reinterpret_cast<const void*>(context.Esp), words.size() * sizeof(std::uintptr_t));
        }
        ResumeThread(thread);
        if (!got) break;
        args.log->line("Watchdog " + std::to_string(round) + ": main thread at " + describe_address(context.Eip));
        int found = 0;
        std::uintptr_t previous = 0;
        for (size_t i = 0; i < words.size() && found < 40; ++i) {
            const std::uintptr_t value = words[i];
            if (value < 0x10000 || value == previous) continue;
            const std::string where = describe_address(value);
            if (where.empty()) continue;
            const auto* code = reinterpret_cast<const unsigned char*>(value);
            if (IsBadReadPtr(code - 6, 6)) continue;
            const bool afterCall = code[-5] == 0xE8 || (code[-6] == 0xFF && code[-5] == 0x15) || (code[-2] == 0xFF && (code[-1] & 0x38) == 0x10) ||
                                   (code[-3] == 0xFF && (code[-2] & 0x38) == 0x10);
            if (!afterCall) continue;
            previous = value;
            args.log->line("  [esp+0x" + [&] {
                char hex[16]{};
                std::snprintf(hex, sizeof(hex), "%X", static_cast<unsigned>(i * sizeof(std::uintptr_t)));
                return std::string(hex);
            }() + "] " + where);
            ++found;
        }
    }
    CloseHandle(thread);
    return 0;
}

void log_return_addresses(DWORD esp, std::uintptr_t stackTop = 0) {
    const auto* tib = reinterpret_cast<const NT_TIB*>(NtCurrentTeb());
    const auto top = stackTop ? stackTop : reinterpret_cast<std::uintptr_t>(tib->StackBase);
    int found = 0;
    std::uintptr_t previous = 0;
    unsigned repeats = 0;
    for (std::uintptr_t at = esp; at + 4 <= top && found < 64; at += 4) {
        const std::uintptr_t value = *reinterpret_cast<const std::uintptr_t*>(at);
        HMODULE module = nullptr;
        if (value < 0x10000 || !GetModuleHandleExA(
                GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS | GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT,
                reinterpret_cast<LPCSTR>(value),
                &module
            )) {
            continue;
        }
        if (value - reinterpret_cast<std::uintptr_t>(module) < 0x1000) continue; // headers, not code
        const auto* code = reinterpret_cast<const unsigned char*>(value);
        const bool afterCall = code[-5] == 0xE8 || (code[-6] == 0xFF && code[-5] == 0x15) || (code[-2] == 0xFF && (code[-1] & 0x38) == 0x10) ||
                               (code[-3] == 0xFF && (code[-2] & 0x38) == 0x10);
        if (!afterCall) continue;
        if (value == previous) {
            ++repeats;
            continue;
        }
        if (repeats) {
            char note[64]{};
            std::snprintf(note, sizeof(note), "  ... repeated %u more times", repeats);
            g_exceptionLog->line(note);
            repeats = 0;
        }
        previous = value;
        char name[MAX_PATH] = "?";
        GetModuleFileNameA(module, name, MAX_PATH);
        const char* base = std::strrchr(name, '\\');
        char buffer[160]{};
        std::snprintf(
            buffer,
            sizeof(buffer),
            "  [esp+0x%X] %s+0x%X",
            static_cast<unsigned>(at - esp),
            base ? base + 1 : name,
            static_cast<unsigned>(value - reinterpret_cast<std::uintptr_t>(module))
        );
        g_exceptionLog->line(buffer);
        ++found;
    }
}

// Readable text in the oldest 64 KB of the stack: the first error message of a recursion is there.
void log_stack_strings() {
    const auto* tib = reinterpret_cast<const NT_TIB*>(NtCurrentTeb());
    const auto top = reinterpret_cast<const char*>(tib->StackBase);
    const char* from = top - 0x10000;
    int logged = 0;
    for (const char* at = from; at < top && logged < 40;) {
        const char* end = at;
        while (end < top && end - at < 200 && (*end == '\t' || (*end >= 0x20 && *end < 0x7F))) ++end;
        if (end - at >= 10) {
            char buffer[260]{};
            std::snprintf(buffer, sizeof(buffer), "  text @top-0x%X: %.*s", static_cast<unsigned>(top - at), static_cast<int>(end - at), at);
            g_exceptionLog->line(buffer);
            ++logged;
        }
        at = end + 1;
    }
}

LONG CALLBACK log_first_exceptions(EXCEPTION_POINTERS* info) {
    if (!g_exceptionLog || InterlockedIncrement(&g_exceptionCount) > 6) return EXCEPTION_CONTINUE_SEARCH;
    const auto* record = info->ExceptionRecord;
    const void* address = record->ExceptionAddress;
    HMODULE module = nullptr;
    char name[MAX_PATH] = "?";
    if (GetModuleHandleExA(
            GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS | GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT,
            static_cast<LPCSTR>(address),
            &module
        )) {
        GetModuleFileNameA(module, name, MAX_PATH);
    }
    const char* base = std::strrchr(name, '\\');
    char buffer[400]{};
    std::snprintf(
        buffer,
        sizeof(buffer),
        "Exception 0x%08lX at %s+0x%X (esp=0x%08lX) info=[0x%p, 0x%p]",
        static_cast<unsigned long>(record->ExceptionCode),
        base ? base + 1 : name,
        static_cast<unsigned>(reinterpret_cast<std::uintptr_t>(address) - reinterpret_cast<std::uintptr_t>(module)),
        static_cast<unsigned long>(info->ContextRecord->Esp),
        record->NumberParameters > 0 ? reinterpret_cast<void*>(record->ExceptionInformation[0]) : nullptr,
        record->NumberParameters > 1 ? reinterpret_cast<void*>(record->ExceptionInformation[1]) : nullptr
    );
    g_exceptionLog->line(buffer);
    if (record->ExceptionCode == EXCEPTION_STACK_OVERFLOW) {
        char thread[96]{};
        std::snprintf(thread, sizeof(thread), "  thread %lu (main %lu)", GetCurrentThreadId(), g_mainThread);
        g_exceptionLog->line(thread);
        log_return_addresses(info->ContextRecord->Esp);
        log_stack_strings();
    }
    return EXCEPTION_CONTINUE_SEARCH;
}

// Fog validates every critical section it enters whenever GetVersionEx reports NT (1.10f: the gate
// at Fog+0xA860, the check at Fog+0xDC60), and wants DebugInfo to be a user-mode pointer. Windows 8
// and later leave DebugInfo at -1, so the first Fog lock asserts, and the assert's own logging
// takes the same lock: a stack overflow inside FOG_InitErrorMgr. Windows 7 behaviour allocates it;
// that is the WIN7RTM compatibility layer D2SE.exe runs under.
bool critical_sections_have_debug_info() {
    CRITICAL_SECTION section;
    InitializeCriticalSection(&section);
    const auto debugInfo = reinterpret_cast<std::uintptr_t>(section.DebugInfo);
    DeleteCriticalSection(&section);
    return debugInfo != 0 && debugInfo <= 0x7FFFFFFF;
}

constexpr const char* kCompatLayer = "WIN7RTM";

// This process's arguments: its command line after the program name.
std::string own_arguments() {
    const char* line = GetCommandLineA();
    if (*line == '"') {
        ++line;
        while (*line && *line != '"') ++line;
        if (*line == '"') ++line;
    } else {
        while (*line && *line != ' ' && *line != '	') ++line;
    }
    return trim(line);
}

// Starts this loader again the way the game must be started, and returns its exit code; -1 when
// this process is already such a relaunch, or the start failed. The game's flags become real
// process arguments, because plugins read GetCommandLineA() (D2GL takes its renderer from "-3dfx"
// there and refuses "-w"), and the Windows 7 layer is applied when Fog needs it.
int relaunch(Log& log, const std::string& arguments, bool compatLayer) {
    char marker[8]{};
    if (GetEnvironmentVariableA("EXORDIUM_RELAUNCHED", marker, sizeof(marker)) > 0) return -1;
    char path[MAX_PATH]{};
    if (!GetModuleFileNameA(nullptr, path, MAX_PATH)) return -1;
    SetEnvironmentVariableA("EXORDIUM_RELAUNCHED", "1");
    if (compatLayer) SetEnvironmentVariableA("__COMPAT_LAYER", kCompatLayer);
    std::string commandLine = std::string("\"") + path + "\"" + (arguments.empty() ? "" : " " + arguments);
    STARTUPINFOA startup{};
    startup.cb = sizeof(startup);
    PROCESS_INFORMATION process{};
    const BOOL started = CreateProcessA(path, commandLine.data(), nullptr, nullptr, FALSE, 0, nullptr, nullptr, &startup, &process);
    SetEnvironmentVariableA("EXORDIUM_RELAUNCHED", nullptr);
    if (compatLayer) SetEnvironmentVariableA("__COMPAT_LAYER", nullptr);
    if (!started) return -1;
    log.line("Relaunched as: " + commandLine + (compatLayer ? std::string(" (__COMPAT_LAYER=") + kCompatLayer + ")" : "") +
             "; this process only waits for it.");
    CloseHandle(process.hThread);
    WaitForSingleObject(process.hProcess, INFINITE);
    DWORD code = 0;
    GetExitCodeProcess(process.hProcess, &code);
    CloseHandle(process.hProcess);
    return static_cast<int>(code);
}

// ---- Commands Exordium runs, not the game ------------------------------------------------------

// Writes `text` to this process's standard output (the pipe Exordium reads), GUI subsystem or not.
void write_stdout(const std::string& text) {
    HANDLE out = GetStdHandle(STD_OUTPUT_HANDLE);
    DWORD written = 0;
    if (out && out != INVALID_HANDLE_VALUE) WriteFile(out, text.data(), static_cast<DWORD>(text.size()), &written, nullptr);
}

// `Game.exe --detach <game arguments>`: starts the game as its own process, not a child of
// Exordium, prints its PID and returns at once. Its parent has exited by the time anyone looks, so
// Task Manager lists the game on its own, under its own name, not inside Exordium's app group; it
// also escapes Exordium's job, so closing Exordium does not close the game. Exordium follows it
// with --wait. The Windows 7 layer is applied here, so the started process never relaunches.
int detach(const std::string& arguments) {
    char path[MAX_PATH]{};
    if (!GetModuleFileNameA(nullptr, path, MAX_PATH)) return 30;
    SetEnvironmentVariableA("__COMPAT_LAYER", kCompatLayer);
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
int wait_for(const char* pidText) {
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

// One node of a VS_VERSIONINFO tree: WORD length, WORD value length, WORD type, UTF-16 key,
// padding to 4, value, padding to 4, children.
struct VersionNode {
    std::wstring key;
    std::vector<unsigned char> value;
    WORD valueLength = 0; // in WORDs for text, bytes for binary
    WORD type = 0;        // 1 text, 0 binary
    std::vector<VersionNode> children;
};

void pad4(std::vector<unsigned char>& out) {
    while (out.size() % 4) out.push_back(0);
}

void write_node(std::vector<unsigned char>& out, const VersionNode& node) {
    const size_t start = out.size();
    out.resize(start + 6);
    for (wchar_t c : node.key) {
        out.push_back(static_cast<unsigned char>(c & 0xFF));
        out.push_back(static_cast<unsigned char>(c >> 8));
    }
    out.push_back(0);
    out.push_back(0);
    pad4(out);
    out.insert(out.end(), node.value.begin(), node.value.end());
    for (const VersionNode& child : node.children) {
        pad4(out);
        write_node(out, child);
    }
    const WORD length = static_cast<WORD>(out.size() - start);
    std::memcpy(&out[start], &length, 2);
    std::memcpy(&out[start + 2], &node.valueLength, 2);
    std::memcpy(&out[start + 4], &node.type, 2);
}

VersionNode version_string(const std::wstring& key, const std::wstring& text) {
    VersionNode node{key, {}, static_cast<WORD>(text.size() + 1), 1, {}};
    for (wchar_t c : text) {
        node.value.push_back(static_cast<unsigned char>(c & 0xFF));
        node.value.push_back(static_cast<unsigned char>(c >> 8));
    }
    node.value.push_back(0);
    node.value.push_back(0);
    return node;
}

std::vector<unsigned char> version_resource(const WORD (&version)[4], const std::wstring& name) {
    VS_FIXEDFILEINFO fixed{};
    fixed.dwSignature = VS_FFI_SIGNATURE;
    fixed.dwStrucVersion = VS_FFI_STRUCVERSION;
    fixed.dwFileVersionMS = fixed.dwProductVersionMS = static_cast<DWORD>(version[0]) << 16 | version[1];
    fixed.dwFileVersionLS = fixed.dwProductVersionLS = static_cast<DWORD>(version[2]) << 16 | version[3];
    fixed.dwFileFlagsMask = VS_FFI_FILEFLAGSMASK;
    fixed.dwFileOS = VOS__WINDOWS32;
    fixed.dwFileType = VFT_APP;
    VersionNode root{L"VS_VERSION_INFO", {}, sizeof(fixed), 0, {}};
    const auto* bytes = reinterpret_cast<const unsigned char*>(&fixed);
    root.value.assign(bytes, bytes + sizeof(fixed));
    const std::wstring dotted = std::to_wstring(version[0]) + L"." + std::to_wstring(version[1]) + L"." +
                                std::to_wstring(version[2]) + L"." + std::to_wstring(version[3]);
    VersionNode table{L"040904b0", {}, 0, 1, {}};
    table.children = {
        version_string(L"CompanyName", L"Exordium"),
        version_string(L"FileDescription", name),
        version_string(L"FileVersion", dotted),
        version_string(L"InternalName", L"Game"),
        version_string(L"OriginalFilename", L"Game.exe"),
        version_string(L"ProductName", name),
        version_string(L"ProductVersion", dotted),
    };
    VersionNode strings{L"StringFileInfo", {}, 0, 1, {table}};
    VersionNode translation{L"Translation", {0x09, 0x04, 0xB0, 0x04}, 4, 0, {}};
    VersionNode vars{L"VarFileInfo", {}, 0, 1, {translation}};
    root.children = {strings, vars};
    std::vector<unsigned char> out;
    write_node(out, root);
    return out;
}

// `Game.exe --stamp <exe> <a.b.c.d> <name> [icon.png]`: writes into a copy of the loader (not
// running) the version resource plugins read — the core's Game.exe version, e.g. 1.0.10.39 for
// 1.10f, since D2GL identifies the game by GetFileVersionInfo("game.exe") — with the mod's name as
// its description, which Task Manager shows as the process's name; and, given a PNG, the icon the
// taskbar shows (Windows reads PNG icon images directly, 256×256 best).
int stamp(const std::wstring& target, const std::wstring& versionText, const std::wstring& name, const std::wstring& iconPath) {
    WORD version[4]{};
    if (swscanf_s(versionText.c_str(), L"%hu.%hu.%hu.%hu", &version[0], &version[1], &version[2], &version[3]) != 4) return 40;
    const std::vector<unsigned char> versionInfo = version_resource(version, name);
    HANDLE update = BeginUpdateResourceW(target.c_str(), FALSE);
    if (!update) return 41;
    const WORD english = MAKELANGID(LANG_ENGLISH, SUBLANG_ENGLISH_US);
    bool ok = UpdateResourceW(update, MAKEINTRESOURCEW(16), MAKEINTRESOURCEW(1), english,
                              const_cast<unsigned char*>(versionInfo.data()), static_cast<DWORD>(versionInfo.size())) != FALSE;
    if (ok && !iconPath.empty()) {
        const std::string png = read_file(narrow(iconPath).c_str());
        unsigned width = 0, height = 0;
        if (png.size() > 24 && png.compare(1, 3, "PNG") == 0) {
            const auto* p = reinterpret_cast<const unsigned char*>(png.data());
            width = static_cast<unsigned>(p[16] << 24 | p[17] << 16 | p[18] << 8 | p[19]);
            height = static_cast<unsigned>(p[20] << 24 | p[21] << 16 | p[22] << 8 | p[23]);
        }
        ok = width && height && width <= 256 && height <= 256;
        if (ok) {
            ok = UpdateResourceW(update, MAKEINTRESOURCEW(3), MAKEINTRESOURCEW(1), english, const_cast<char*>(png.data()),
                                 static_cast<DWORD>(png.size())) != FALSE;
            // GRPICONDIR: reserved, type 1 (icon), count 1; one entry (width/height 0 means 256).
            unsigned char group[20]{};
            group[2] = 1;
            group[4] = 1;
            group[6] = static_cast<unsigned char>(width == 256 ? 0 : width);
            group[7] = static_cast<unsigned char>(height == 256 ? 0 : height);
            group[10] = 1;  // planes
            group[12] = 32; // bits per pixel
            const DWORD size = static_cast<DWORD>(png.size());
            std::memcpy(&group[14], &size, 4);
            group[18] = 1; // icon resource id
            ok = ok && UpdateResourceW(update, MAKEINTRESOURCEW(14), MAKEINTRESOURCEW(1), english, group, sizeof(group)) != FALSE;
        }
    }
    if (!EndUpdateResourceW(update, ok ? FALSE : TRUE)) return 42;
    return ok ? 0 : 43;
}

int run_loader() {
    if (__argc == 4 && std::strcmp(__argv[1], "--dump-hive") == 0) return dump_hive(__argv[2], __argv[3]);
    if (__argc >= 2 && std::strcmp(__argv[1], "--detach") == 0) {
        std::string arguments;
        for (int i = 2; i < __argc; ++i) arguments += (i > 2 ? " " : "") + std::string(__argv[i]);
        return detach(arguments);
    }
    if (__argc == 3 && std::strcmp(__argv[1], "--wait") == 0) return wait_for(__argv[2]);
    if ((__argc == 5 || __argc == 6) && std::strcmp(__argv[1], "--stamp") == 0) {
        // Wide arguments: a mod's name need not fit the ANSI code page.
        int count = 0;
        LPWSTR* wide = CommandLineToArgvW(GetCommandLineW(), &count);
        if (!wide || count < 5) return 44;
        const int result = stamp(wide[2], wide[3], wide[4], count >= 6 ? wide[5] : L"");
        LocalFree(wide);
        return result;
    }
    // D2SE.exe's manifest declares <dpiAware>true</dpiAware>. Without it Windows virtualises the
    // process's view of the screen, and D2Glide — which builds its font by drawing on the display DC
    // and reading it back with GetPixel, pixel by pixel — takes about 90 s per Glide window.
    SetProcessDPIAware();
    Log log("exordium-loader.log");
    g_exceptionLog = &log;
    g_mainThread = GetCurrentThreadId();
    g_mainStackTop = reinterpret_cast<std::uintptr_t>(reinterpret_cast<const NT_TIB*>(NtCurrentTeb())->StackBase);
    ULONG guarantee = 0x10000; // room for the handler to log on a stack overflow
    SetThreadStackGuarantee(&guarantee);
    AddVectoredExceptionHandler(1, log_first_exceptions);
    log.line("exordium-game starting.");
    char cwd[MAX_PATH]{};
    GetCurrentDirectoryA(MAX_PATH, cwd);
    log.line(std::string("cwd: ") + cwd);

    Plan plan = read_plan(log);
    const bool needLayer = !critical_sections_have_debug_info();
    const bool needArguments = !plan.commandLine.empty() && own_arguments().find(trim(plan.commandLine)) == std::string::npos;
    if (needLayer || needArguments) {
        if (needLayer) log.line("Critical sections have no debug info (Windows 8+ default); Fog would assert on its first lock.");
        if (needArguments) log.line("Started without the game's command line (" + plan.commandLine + ") as arguments.");
        const int relaunched = relaunch(log, plan.commandLine, needLayer);
        if (relaunched != -1) return relaunched;
        if (needLayer) {
            log.line(std::string("Cannot continue: still no critical-section debug info under __COMPAT_LAYER=") + kCompatLayer + ".");
            return 9;
        }
        log.line("Continuing without them; plugins that read the command line may misbehave.");
    }
    if (plan.watchdogSeconds > 0) {
        if (HANDLE thread = CreateThread(nullptr, 0, watchdog, new WatchdogArgs{&log, g_mainThread, plan.watchdogSeconds}, 0, nullptr)) {
            CloseHandle(thread);
        }
    }
    if (!setup_registry(log, plan)) {
        log.line("Cannot continue: the box's registry is not in place, and the game would use the machine's.");
        return 10;
    }
    SFileCloseArchivePointer closeArchive = nullptr;
    std::vector<HANDLE> archives;
    FogBootstrap fog;
    GfxBootstrap gfx;

    D2ConfigStrc config = build_config(plan);
    log_config(log, config, plan);
    const CoreOrdinals& ordinals = core_ordinals(plan.gameVersion);
    log.line(std::string("Core ABI table: ") + ordinals.label + " for " + plan.gameVersion + ".");
    if (!setup_fog(log, config, plan.gameVersion, ordinals, fog)) {
        log.line("Cannot continue: Fog bootstrap failed.");
        return 7;
    }

    if (!open_archives(log, plan, archives, closeArchive)) {
        log.line("Cannot continue: required MPQ archive stack did not open.");
        teardown_fog(log, fog);
        return 6;
    }

    probe_files(log, plan, fog.module, archives);

    if (!setup_gfx(log, config, ordinals, plan.graphics, plan.graphicsManual, plan.graphicsInit, plan.graphicsSurface, plan.graphicsWrapper, plan.graphicsWindow, gfx)) {
        log.line("Cannot continue: gfx bootstrap failed.");
        teardown_gfx(log, gfx);
        close_archives(log, closeArchive, archives);
        teardown_fog(log, fog);
        return 8;
    }

    SoundBootstrap sound;
    if (plan.graphics) setup_sound(log, config, ordinals, sound);

    std::vector<HMODULE> loaded;
    for (const std::string& dll : plan.gameDlls) {
        if (HMODULE module = load_library(log, dll)) loaded.push_back(module);
    }

    std::vector<LoadedPlugin> plugins;
    for (const PluginLoad& plugin : plan.plugins) {
        if (HMODULE module = load_library(log, plugin.path)) {
            loaded.push_back(module);
            plugins.push_back({plugin, module, false});
            call_plugin_init(log, plugins.back());
        }
    }

    // Game.exe's teardown order, after the module loop: sound, gfx, archives, async data. Plugins
    // go first, in reverse, as D2SE unloads them after its game loop.
    auto shutdown = [&](int code) {
        for (auto it = plugins.rbegin(); it != plugins.rend(); ++it) call_plugin_release(log, *it);
        teardown_sound(log, sound);
        teardown_gfx(log, gfx);
        close_archives(log, closeArchive, archives);
        teardown_fog(log, fog);
        log.line("exordium-game exiting with " + std::to_string(code) + ".");
        return code;
    };

    HMODULE launch = GetModuleHandleA("D2Launch.dll");
    if (!launch) launch = load_library(log, "D2Launch.dll");
    const FARPROC query = launch ? GetProcAddress(launch, "QueryInterface") : nullptr;
    if (!query) {
        log.line("Cannot continue: D2Launch.dll or its QueryInterface export is missing.");
        return shutdown(3);
    }
    log.line("D2Launch.dll!QueryInterface resolved.");

    if (!plan.handoff) {
        log.line("Module handoff is disabled in exordium-loader.json.");
        return shutdown(0);
    }

    run_modules(log, config, sound, gfx);
    return shutdown(0);
}

} // namespace

int WINAPI WinMain(HINSTANCE, HINSTANCE, LPSTR, int) {
    return run_loader();
}

int main() {
    return run_loader();
}
