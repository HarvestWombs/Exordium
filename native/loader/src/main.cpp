#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <shellapi.h>

#include <cctype>
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

#include "common.hpp"

namespace {

struct Plan {
    std::string hive;
    // The box's registry values, one per line (@exordium/registry hive-text); written into `hive`.
    std::string registryFile;
    std::string commandLine;
    // The title's icon (PNG or .ico), put on the game window once it exists.
    std::string icon;
    bool handoff = false;
    bool graphics = false;
    bool graphicsInit = false;
    // Diagnostic: FOG_AsyncDataInitialize's argument. Game.exe passes TRUE; false tests whether a
    // crash depends on Fog's background loading.
    bool asyncData = true;
    // Open the MPQ stack through D2Win (#10037, #10171, ARCHIVE_LoadMPQFile) as Game.exe and plugins
    // do, rather than straight through Storm. 1.10 cores only; others keep the Storm path.
    bool archivesViaD2Win = true;
    bool graphicsSurface = false;
    bool graphicsWrapper = false;
    bool graphicsWindow = false;
    // Diagnostic only: D2Win's two startup exports inlined, poking 1.10f D2Win globals by address.
    // The normal path calls the real exports, as Game.exe does.
    bool graphicsManual = false;
    // What Game.exe hands FOG_InitErrorMgr: "v<major>.<minor>" of the core, e.g. "v1.10".
    std::string gameVersion = "v1.10";
    // The core as mods name it ("1.13d"), which picks the export ordinals (core_ordinals).
    std::string core;
    // Diagnostic: MPQs to load the way plugins do (D2Win's ARCHIVE_LoadMPQFile, 1.10f only), then
    // files to open through Fog, logging each result.
    std::vector<std::string> probeMpqs;
    std::vector<std::string> probeFiles;
    // Diagnostic: log where the main thread is every N seconds, three times (0 = off).
    int watchdogSeconds = 0;
    // Official Battle.net is reachable only for a mod with a custom realm (lock_battlenet). Missing
    // from the config means locked.
    bool battlenetAllowed = false;
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

Plan read_plan(Log& log) {
    Plan plan;
    const std::string text = read_file(env_path("EXORDIUM_LOADER_CONFIG", "exordium-loader.json").c_str());
    if (text.empty()) {
        log.line("No exordium-loader.json found; using diagnostic defaults.");
        plan.gameDlls = {"D2Launch.dll", "D2Client.dll", "D2Multi.dll"};
        return plan;
    }
    plan.hive = json_string(text, "hive");
    plan.registryFile = json_string(text, "registryFile");
    plan.commandLine = json_string(text, "commandLine");
    plan.icon = json_string(text, "icon");
    plan.handoff = json_bool(text, "handoff", false);
    plan.graphics = json_bool(text, "graphics", false);
    plan.graphicsInit = json_bool(text, "graphicsInit", false);
    plan.asyncData = json_bool(text, "asyncData", true);
    plan.archivesViaD2Win = json_bool(text, "archivesViaD2Win", true);
    plan.graphicsSurface = json_bool(text, "graphicsSurface", false);
    plan.graphicsWrapper = json_bool(text, "graphicsWrapper", false);
    plan.graphicsWindow = json_bool(text, "graphicsWindow", false);
    plan.graphicsManual = json_bool(text, "graphicsManual", false);
    plan.probeMpqs = json_string_array(text, "probeMpqs");
    plan.probeFiles = json_string_array(text, "probeFiles");
    plan.watchdogSeconds = json_int(text, "watchdogSeconds", 0);
    plan.battlenetAllowed = json_bool(text, "battlenetAllowed", false);
    const std::string version = json_string(text, "gameVersion");
    if (!version.empty()) plan.gameVersion = version;
    plan.core = json_string(text, "core");
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

// The number a switch carries, as Game.exe takes them: `-act3` or `-act 3`, `-seed 12345`. 0 when the
// switch is absent or has no number.
uint32_t flag_number(const std::string& commandLine, const char* flag) {
    const size_t flagLen = std::strlen(flag);
    for (size_t at = commandLine.find('-'); at != std::string::npos; at = commandLine.find('-', at + 1)) {
        size_t start = at + 1;
        if (start + flagLen > commandLine.size()) break;
        bool match = true;
        for (size_t i = 0; i < flagLen && match; ++i) {
            const char got = static_cast<char>(std::tolower(static_cast<unsigned char>(commandLine[start + i])));
            match = got == static_cast<char>(std::tolower(static_cast<unsigned char>(flag[i])));
        }
        if (!match) continue;
        size_t value = start + flagLen;
        if (value < commandLine.size() && !std::isdigit(static_cast<unsigned char>(commandLine[value]))) {
            if (commandLine[value] != ' ' && commandLine[value] != '\t') continue; // a longer switch, such as -actx
            while (value < commandLine.size() && (commandLine[value] == ' ' || commandLine[value] == '\t')) ++value;
        }
        uint64_t number = 0;
        bool any = false;
        while (value < commandLine.size() && std::isdigit(static_cast<unsigned char>(commandLine[value]))) {
            number = number * 10 + static_cast<uint64_t>(commandLine[value] - '0');
            if (number > 0xFFFFFFFFull) return 0;
            ++value;
            any = true;
        }
        return any ? static_cast<uint32_t>(number) : 0;
    }
    return 0;
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
    config.bAmazon = 1;
    config.nLaunchType = LAUNCHTYPE_NONE;
    config.pAllowExpansionCallback = allow_expansion;
    // The config is laid out as 1.10f's, but each core reads some fields at its own offset (the
    // struct grew between patches). Found per core by what reads them (2026-10-14):
    // - The Battle.net interface pointer (1.10f's pComInterface), by where each D2Launch copies it
    //   into its global. It must start null; 1.00 and 1.01 read a stray 1 there, and their
    //   "Disconnect from BNET" step on entering the menu jumped through it.
    // - bSkipToBNet (-skiptobnet), by the main menu's test of it: read, then cleared, and in 1.01 and
    //   later the last gateway read from the registry (Storm #423) in between.
    // - dwAct (-actN) and dwSeed (-seed N), by D2Client's two accessors: `mov eax,[ecx+X]; test eax,
    //   eax; je`, the act then checked below 5 (classic, four acts) or 6, the seed handed to D2Game
    //   #10010. 0 is "not set" for both, which is Game.exe's default.
    // Until these were found, -skiptobnet, -act and -seed reached the command line but never the
    // config, so none of them did anything. 0 in the table means the field is where 1.10f has it.
    struct CoreLayout {
        const char* core;
        size_t comInterface;
        size_t skipToBNet;
        size_t act;
        size_t seed;
        uint32_t acts;
    };
    static const CoreLayout kLayouts[] = {
        {"1.00", 0x1FA, 0x332, 0x1DC, 0x1F2, 4},  {"1.01", 0x1FA, 0x332, 0x1DC, 0x1F2, 4},
        {"1.02", 0x212, 0x34A, 0x1F4, 0x20A, 4},  {"1.03", 0x212, 0x34A, 0x1F4, 0x20A, 4},
        {"1.04b", 0x212, 0x34A, 0x1F4, 0x20A, 4}, {"1.04c", 0x212, 0x34A, 0x1F4, 0x20A, 4},
        {"1.05", 0x212, 0x34A, 0x1F4, 0x20A, 4},  {"1.05b", 0x212, 0x34A, 0x1F4, 0x20A, 4},
        {"1.06", 0x216, 0x34E, 0x1F8, 0x20E, 4},  {"1.06b", 0x216, 0x34E, 0x1F8, 0x20E, 4},
        {"1.07", 0x21D, 0x355, 0, 0, 5},          {"1.08", 0x21D, 0x355, 0, 0, 5},
        {"1.09", 0x21D, 0x355, 0, 0, 5},          {"1.09b", 0x21D, 0x355, 0, 0, 5},
        {"1.09d", 0x21D, 0x355, 0, 0, 5},         {"1.13c", 0, 0x359, 0x1FB, 0x216, 5},
        {"1.13d", 0, 0x359, 0x1FB, 0x216, 5},
    };
    auto* bytes = reinterpret_cast<uint8_t*>(&config);
    size_t skipAt = offsetof(D2ConfigStrc, bSkipToBNet);
    size_t actAt = offsetof(D2ConfigStrc, dwAct);
    size_t seedAt = offsetof(D2ConfigStrc, dwSeed);
    uint32_t acts = 5;
    for (const auto& layout : kLayouts) {
        if (plan.core != layout.core) continue;
        if (layout.comInterface) std::memset(bytes + layout.comInterface, 0, sizeof(void*));
        if (layout.skipToBNet) skipAt = layout.skipToBNet;
        if (layout.act) actAt = layout.act;
        if (layout.seed) seedAt = layout.seed;
        acts = layout.acts;
    }
    if (has_flag(plan.commandLine, "skiptobnet")) bytes[skipAt] = 1;
    // An act the core does not have (Act V before Lord of Destruction) is left unset, as Game.exe would
    // refuse it; D2Client asserts on it.
    const uint32_t act = flag_number(plan.commandLine, "act");
    if (act >= 1 && act <= acts) std::memcpy(bytes + actAt, &act, sizeof(act));
    const uint32_t seed = flag_number(plan.commandLine, "seed");
    if (seed) std::memcpy(bytes + seedAt, &seed, sizeof(seed));
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

// The offsets in `module`'s code section where `pattern` matches (-1 matches any byte).
std::vector<size_t> find_code(HMODULE module, const std::vector<int>& pattern) {
    std::vector<size_t> hits;
    const auto* base = reinterpret_cast<const uint8_t*>(module);
    const auto* dos = reinterpret_cast<const IMAGE_DOS_HEADER*>(base);
    const auto* nt = reinterpret_cast<const IMAGE_NT_HEADERS32*>(base + dos->e_lfanew);
    const IMAGE_SECTION_HEADER* section = IMAGE_FIRST_SECTION(nt);
    for (WORD i = 0; i < nt->FileHeader.NumberOfSections; ++i, ++section) {
        if (!(section->Characteristics & IMAGE_SCN_MEM_EXECUTE)) continue;
        const size_t start = section->VirtualAddress;
        const size_t size = section->Misc.VirtualSize;
        for (size_t at = start; at + pattern.size() <= start + size; ++at) {
            size_t k = 0;
            while (k < pattern.size() && (pattern[k] < 0 || base[at + k] == static_cast<uint8_t>(pattern[k]))) ++k;
            if (k == pattern.size()) hits.push_back(at);
        }
    }
    return hits;
}

bool write_code(HMODULE module, size_t offset, const std::vector<uint8_t>& bytes) {
    auto* at = reinterpret_cast<uint8_t*>(module) + offset;
    DWORD old = 0;
    if (!VirtualProtect(at, bytes.size(), PAGE_EXECUTE_READWRITE, &old)) return false;
    std::memcpy(at, bytes.data(), bytes.size());
    VirtualProtect(at, bytes.size(), old, &old);
    FlushInstructionCache(GetCurrentProcess(), at, bytes.size());
    return true;
}

// Closes official Battle.net for a mod without a custom realm (vault: Shared/Diablo-II/Main Menu
// Battle.net Button). Both sites are found by signature in D2Launch's code; each matched exactly once
// in every core from 1.00 to 1.13d (checked 2026-10-11), so no per-core table is kept.
//
// - Grey: the main menu's own "no d2char.mpq" block, `call check; test eax,eax; je skip`, then
//   CONTROL_ToggleFirstFlag(edi = Battle.net, 0), (esi = Other Multiplayer, 0) and, from 1.04, the
//   gateway button. With the je gone the block always runs; with the esi call gone Other Multiplayer
//   (TCP/IP) stays enabled. A control without its first flag draws at 50% and ignores input.
// - Block: the routine every way onto Battle.net calls (the button, Open Battle.net, the retry
//   dialogs), `mov eax,[x]; sub esp,0x400`. The sub becomes `ret`, so it returns before connecting:
//   PlugY's DisableBattleNet without its hook.
//
// Returns false only when the block cannot be applied; the caller refuses to start then.
bool lock_battlenet(Log& log, HMODULE launch) {
    const std::vector<size_t> grey = find_code(launch, {
        0x85, 0xC0, 0x74, -1, 0x33, 0xD2, 0x8B, 0xCF, 0xE8, -1, -1, -1, -1, 0x33, 0xD2, 0x8B, 0xCE, 0xE8, -1, -1, -1, -1,
    });
    if (grey.size() == 1 && write_code(launch, grey[0] + 2, {0x90, 0x90}) &&
        write_code(launch, grey[0] + 17, {0x90, 0x90, 0x90, 0x90, 0x90})) {
        log.line("Battle.net: main-menu button greyed.");
    } else {
        log.line("Battle.net: main-menu grey site not found (" + std::to_string(grey.size()) + " matches); button left as is.");
    }
    const std::vector<size_t> entry = find_code(launch, {0xA1, -1, -1, -1, -1, 0x81, 0xEC, 0x00, 0x04, 0x00, 0x00});
    if (entry.size() != 1 || !write_code(launch, entry[0] + 5, {0xC3, 0x90, 0x90, 0x90, 0x90, 0x90})) {
        log.line("Battle.net: connect routine not found (" + std::to_string(entry.size()) + " matches).");
        return false;
    }
    log.line("Battle.net: connect blocked (no custom realm).");
    return true;
}

// Lets every core's Storm read the MPQs of Blizzard's modern (1.14) installer: Cactus's "MPQ fix",
// done in memory instead of on disk, and on every core rather than only 1.08 to 1.10 (vault:
// Shared/Diablo-II/MPQ). Storm treats a sector it cannot decompress, as in the new archives'
// (attributes), as fatal: `call decompress; test eax,eax; jnz done`, then SErr's fatal report
// 0x85100083. The jnz becomes jmp, so the read ends quietly. 1.00 to 1.07 never read (attributes)
// but have the same site; 1.11 on read the new archives already. Each Storm has the site exactly
// once, in one of three layouts; one already fixed on disk (Cactus's, D2SE's 1.09, the catalog
// cores) has the jmp, and is left as is.
void fix_storm_mpq(Log& log) {
    HMODULE storm = GetModuleHandleA("Storm.dll");
    if (!storm) return;
    const std::vector<std::vector<int>> layouts = {
        // 1.00 to 1.07: push 1; push eax; push eax; mov reg,[esi+0x110]; add reg,8; push -4
        {0x85, 0xC0, -1, -1, 0x6A, 0x01, 0x50, 0x50, 0x8B, -1, 0x10, 0x01, 0x00, 0x00, 0x83, -1, 0x08, 0x6A, 0xFC, -1,
         0x68, 0x83, 0x00, 0x10, 0x85},
        // 1.08 to 1.10: the mov first
        {0x85, 0xC0, -1, -1, 0x8B, -1, 0x10, 0x01, 0x00, 0x00, 0x6A, 0x01, 0x50, 0x50, 0x83, -1, 0x08, 0x6A, 0xFC, -1,
         0x68, 0x83, 0x00, 0x10, 0x85},
        // 1.11 to 1.13d: push -4 before the add
        {0x85, 0xC0, -1, -1, 0x8B, -1, 0x10, 0x01, 0x00, 0x00, 0x6A, 0x01, 0x50, 0x50, 0x6A, 0xFC, 0x83, -1, 0x08, -1,
         0x68, 0x83, 0x00, 0x10, 0x85},
    };
    std::vector<size_t> hits;
    for (const std::vector<int>& layout : layouts) {
        for (size_t hit : find_code(storm, layout)) hits.push_back(hit);
    }
    if (hits.size() != 1) {
        log.line("Storm: modern MPQ fix site not found (" + std::to_string(hits.size()) + " matches); left as is.");
        return;
    }
    const uint8_t branch = reinterpret_cast<const uint8_t*>(storm)[hits[0] + 2];
    if (branch == 0xEB) {
        log.line("Storm: modern MPQ fix already in this Storm.dll.");
    } else if (branch == 0x75 && write_code(storm, hits[0] + 2, {0xEB})) {
        log.line("Storm: modern MPQ fix applied (1.14 installer archives readable).");
    } else {
        log.line("Storm: modern MPQ fix site not as expected; left as is.");
    }
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

// Derived from each original Game.exe's import thunks. These builds predate D2SE's ordinal table;
// 1.00-1.03 share imports, 1.04b-1.05b add a few Fog helpers but keep the same startup calls, and
// 1.06/1.06b move the MPQ/startup helpers again. They still use D2Win #10000/#10001/#10002 and the
// same D2Gfx setting exports visible in Game.exe's own startup.
const CoreOrdinals kCore100To103 = {
    "early Game.exe imports (1.00-1.03)",
    0, 10017, 0, 10074, 10065, 10148, 10060, 0,
    10000, 10001, 10002,
    10000, 10001, 10013, 10017, 10020, 10022,
    10000, 10001,
};

const CoreOrdinals kCore104To105 = {
    "early Game.exe imports (1.04b-1.05b)",
    0, 10017, 0, 10074, 10065, 10148, 10060, 0,
    10000, 10001, 10002,
    10000, 10001, 10013, 10017, 10020, 10022,
    10000, 10001,
};

const CoreOrdinals kCore106 = {
    "early Game.exe imports (1.06-1.06b)",
    0, 10017, 0, 10060, 10065, 10148, 10213, 10074,
    10000, 10001, 10002,
    10000, 10001, 10013, 10017, 10020, 10022,
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

// Not in D2SE's table, which stops at 1.13c. Derived 2026-10-05 from Blizzard's 1.11 and 1.13d DLLs
// by matching each function's code to 1.11b's and 1.13c's (the method reproduced every known 1.12a
// and 1.13c ordinal first), and checked against what each version's own Game.exe imports. Fog's
// ordinals did not change. Vault: Projects/Exordium/Architecture/Launcher.md, "Ordinals per core".
const CoreOrdinals kCore111Original = {
    "1.11 (derived)",
    10021, 10019, 10022, 10101, 10089, 10090, 10082, 10218,
    10052, 10126, 10115,
    10000, 10050, 10062, 10015, 10053, 10025,
    10043, 10041,
};

const CoreOrdinals kCore113d = {
    "1.13d (derived)",
    10021, 10019, 10022, 10101, 10089, 10090, 10082, 10218,
    10071, 10129, 10132,
    10000, 10050, 10068, 10008, 10071, 10065,
    10023, 10024,
};

// By the exact core when the config names it (1.11 and 1.11b share "v1.11" but not ordinals), else
// by gameVersion as before. 1.07 to 1.10f, 1.09 included, share one table (their Game.exe imports
// are identical).
const CoreOrdinals& core_ordinals(const std::string& core, const std::string& gameVersion) {
    if (core == "1.00" || core == "1.01" || core == "1.02" || core == "1.03") return kCore100To103;
    if (core == "1.04b" || core == "1.04c" || core == "1.05" || core == "1.05b") return kCore104To105;
    if (core == "1.06" || core == "1.06b") return kCore106;
    if (core == "1.11") return kCore111Original;
    if (core == "1.13d") return kCore113d;
    if (gameVersion == "v1.11") return kCore111;
    if (gameVersion == "v1.12") return kCore112;
    if (gameVersion == "v1.13") return kCore113;
    return kCore107To110;
}

bool setup_fog(Log& log, const D2ConfigStrc& config, const std::string& gameVersion, const CoreOrdinals& ordinals, bool asyncData, FogBootstrap& fog) {
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

    if (!initErrorMgr || !mpqSetConfig || !asyncDataInitialize || !fog.asyncDataDestroy) {
        log.line("Cannot bootstrap Fog: one or more early Fog exports were not found.");
        return false;
    }

    // Exactly Game.exe's GameInit (1.10f 0x401970, D2MOO source/Game/src/Main.cpp): the log prefix,
    // then the error manager, with no exception callback. This is where Fog starts validating its
    // critical sections; see critical_sections_have_debug_info.
    if (setLogPrefix) setLogPrefix("D2");
    else log.line("Fog has no mapped FOG_SetLogPrefix export for this core; continuing with Game.exe's early ABI.");
    initErrorMgr("Diablo II", nullptr, gameVersion.c_str(), TRUE);
    fog.processInitialized = true;

    void* systemInfo = nullptr;
    if (getSystemInfo) {
        systemInfo = getSystemInfo();
        if (!systemInfo) {
            log.line("Cannot bootstrap Fog: FOG_GetSystemInfo is still null after FOG_InitErrorMgr.");
            return false;
        }
    } else {
        log.line("Fog has no mapped FOG_GetSystemInfo export for this core; continuing with Game.exe's early ABI.");
    }
    const DWORD totalPhysicalMemoryMb = systemInfo
        ? *reinterpret_cast<DWORD*>(static_cast<char*>(systemInfo) + 0x0C) / (1024 * 1024)
        : 0;

    const BOOL mpqConfigOk = mpqSetConfig(config.bDirect, FALSE);
    asyncDataInitialize(asyncData ? TRUE : FALSE);
    fog.asyncInitialized = true;
    if (startupNoop) startupNoop();
    const int initResult = startupInit ? startupInit() : 0;

    char buffer[160]{};
    std::snprintf(
        buffer,
        sizeof(buffer),
        "Fog bootstrap ready: memory=%luMB MPQSetConfig=%u direct=%u async=%u init10218=%d",
        static_cast<unsigned long>(totalPhysicalMemoryMb),
        static_cast<unsigned>(mpqConfigOk != FALSE),
        static_cast<unsigned>(config.bDirect),
        static_cast<unsigned>(asyncData),
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

void patch_glide_font(Log& log) {
    HMODULE glide = GetModuleHandleA("D2Glide.dll");
    if (!glide) glide = load_library(log, "D2Glide.dll");
    if (!glide) return;
    const bool create = patch_import(glide, "GDI32.dll", "CreateDCA", reinterpret_cast<void*>(offscreen_create_dc));
    const bool remove = patch_import(glide, "GDI32.dll", "DeleteDC", reinterpret_cast<void*>(offscreen_delete_dc));
    log.line(std::string("D2Glide font build redirected off-screen: CreateDCA ") + (create ? "yes" : "no") + ", DeleteDC " + (remove ? "yes" : "no"));
}

void allow_multiple_copies(Log& log, HMODULE d2gfx) {
    const bool ok = patch_import(d2gfx, "USER32.dll", "FindWindowA", reinterpret_cast<void*>(find_window_allowing_copies));
    log.line(ok ? "D2Gfx's one-copy check lets other copies run." : "D2Gfx's one-copy check was not found; a second copy may refuse to start.");
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

// Runs after the gfx bootstrap has loaded D2Win: the archive stack opens before D2Win exists.
void probe_mpqs(Log& log, const Plan& plan) {
    HMODULE d2win = GetModuleHandleA("D2Win.dll");
    if (plan.probeMpqs.empty()) return;
    if (!d2win || plan.gameVersion != "v1.10") {
        log.line("Probe: MPQ probes need D2Win loaded and a v1.10 core; skipped.");
        return;
    }
    {
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
}

void probe_files(Log& log, const Plan& plan, HMODULE fog, const std::vector<HANDLE>& archives) {
    if (plan.probeFiles.empty()) return;
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
    allow_multiple_copies(log, gfx.d2gfx);

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

// ---- The MPQ stack through D2Win, as Game.exe opens it ----------------------------------------------
//
// Game.exe's GameStart (1.10f, D2MOO source/Game/src/Main.cpp) opens the archives with D2Win's
// ARCHIVE_LoadArchives (#10037) and ARCHIVE_LoadExpansionArchives (#10171), which keep D2Win's own
// handles; plugins open theirs with ARCHIVE_LoadMPQFile (D2Win+0x12399). Opening the same files
// straight through Storm skipped all of that, and D2Tweaks, which opens its MPQ through D2Win, then
// broke Storm's open-file list on entering a game (Synthesis). Everything D2Win does not open itself
// (a mod's MPQs, the language MPQ) goes through ARCHIVE_LoadMPQFile, the plugins' path.
// d2video.mpq is left alone: D2Win opens it itself (#10172) when a video plays.

using D2WinLoadArchivesPointer = BOOL (__fastcall*)();
using D2WinLoadExpansionArchivesPointer = BOOL (__fastcall*)(void*, void*, HANDLE, D2ConfigStrc*);
using D2WinVoidPointer = void (__fastcall*)();
using D2WinUnloadMpqPointer = void (__fastcall*)(void*);

struct D2WinArchives {
    HMODULE d2win = nullptr;
    // D2ArchiveHandleStrc*, from ARCHIVE_LoadMPQFile; its first field is the Storm handle.
    std::vector<void*> extras;
};

std::string lower_name(const std::string& path) {
    std::string name = path.substr(path.find_last_of("/\\") == std::string::npos ? 0 : path.find_last_of("/\\") + 1);
    for (char& c : name) c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
    return name;
}

// What #10037, #10171 and #10172 open by name.
bool d2win_opens_itself(const std::string& path) {
    static const char* names[] = {
        "d2data.mpq", "d2sfx.mpq", "d2speech.mpq", "d2delta.mpq", "d2kfixup.mpq", "patch_d2.mpq", "d2exp.mpq",
        "d2char.mpq", "d2music.mpq", "d2xmusic.mpq", "d2xtalk.mpq", "d2xvideo.mpq", "d2video.mpq",
    };
    const std::string name = lower_name(path);
    for (const char* known : names) {
        if (name == known) return true;
    }
    return false;
}

void close_archives_d2win(Log& log, D2WinArchives& state) {
    if (!state.d2win) return;
    const auto unload = reinterpret_cast<D2WinUnloadMpqPointer>(reinterpret_cast<uintptr_t>(state.d2win) + 0x12548);
    for (auto it = state.extras.rbegin(); it != state.extras.rend(); ++it) unload(*it);
    const auto unloadExpansion = reinterpret_cast<D2WinVoidPointer>(proc_by_ordinal(state.d2win, 10173));
    const auto freeArchives = reinterpret_cast<D2WinVoidPointer>(proc_by_ordinal(state.d2win, 10036));
    if (unloadExpansion) unloadExpansion();
    if (freeArchives) freeArchives();
    state = {};
    log.line("MPQ archives closed through D2Win.");
}

bool open_archives_d2win(Log& log, const Plan& plan, D2ConfigStrc& config, std::vector<HANDLE>& archives, D2WinArchives& state) {
    HMODULE d2win = GetModuleHandleA("D2Win.dll");
    if (!d2win) d2win = load_library(log, "D2Win.dll");
    if (!d2win) {
        log.line("Cannot open MPQs: D2Win.dll did not load.");
        return false;
    }
    const auto loadArchives = reinterpret_cast<D2WinLoadArchivesPointer>(proc_by_ordinal(d2win, 10037));
    const auto loadExpansion = reinterpret_cast<D2WinLoadExpansionArchivesPointer>(proc_by_ordinal(d2win, 10171));
    const auto loadMpq = reinterpret_cast<D2WinLoadMpqPointer>(reinterpret_cast<uintptr_t>(d2win) + 0x12399);
    if (!loadArchives || !loadExpansion) {
        log.line("Cannot open MPQs: D2Win #10037 / #10171 were not found.");
        return false;
    }
    state.d2win = d2win;

    log.line("Opening MPQ archive stack through D2Win, as Game.exe does:");
    if (!loadArchives()) {
        log.line("  D2Win ARCHIVE_LoadArchives (#10037) failed: d2data, d2sfx, d2speech or d2exp is missing.");
        close_archives_d2win(log, state);
        return false;
    }
    log.line("  ok D2Win #10037: d2data, d2sfx, d2speech, d2exp, patch_d2 (when present)");
    // No disc prompts: a box has every archive it will ever have. The config carries Game.exe's
    // expansion callback.
    if (!loadExpansion(nullptr, nullptr, nullptr, &config)) {
        log.line("  D2Win ARCHIVE_LoadExpansionArchives (#10171) failed: d2char, d2music or an expansion MPQ is missing.");
        close_archives_d2win(log, state);
        return false;
    }
    log.line("  ok D2Win #10171: d2char, d2music, d2Xmusic, d2Xtalk, d2Xvideo");

    for (const ArchiveLoad& archive : plan.archives) {
        if (d2win_opens_itself(archive.path)) continue;
        std::string label = lower_name(archive.path);
        label = label.substr(0, label.find('.'));
        for (char& c : label) c = static_cast<char>(std::toupper(static_cast<unsigned char>(c)));
        void* handle = loadMpq("D2Win.dll", archive.path.c_str(), label.c_str(), 0, nullptr, nullptr, archive.priority);
        char buffer[320]{};
        if (handle) {
            state.extras.push_back(handle);
            archives.push_back(*static_cast<HANDLE*>(handle));
            std::snprintf(buffer, sizeof(buffer), "  ok priority=%d kind=%s path=%s (ARCHIVE_LoadMPQFile)",
                archive.priority, archive.kind.c_str(), archive.path.c_str());
            log.line(buffer);
            continue;
        }
        std::snprintf(buffer, sizeof(buffer), "  missing priority=%d kind=%s path=%s: %s", archive.priority,
            archive.kind.c_str(), archive.path.c_str(), win_error(GetLastError()).c_str());
        log.line(buffer);
        if (archive.required) {
            close_archives_d2win(log, state);
            return false;
        }
    }
    log.line("MPQ stack ready through D2Win.");
    return true;
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

// The title's icon on the game window. The taskbar button and Alt+Tab show the window's own icon,
// which D2Gfx takes from Game.exe: a copy shared by every box of the core (stamp-game.ts), so the
// title's own icon is set here instead. A PNG, as the library's art is, or an .ico; anything else,
// or no icon, leaves the window as it is. The icons live as long as the process.
struct WindowIcons {
    HICON big = nullptr;
    HICON small = nullptr;
    int windows = 0;
};

BOOL CALLBACK set_window_icons(HWND hwnd, LPARAM param) {
    auto* icons = reinterpret_cast<WindowIcons*>(param);
    if (GetWindow(hwnd, GW_OWNER)) return TRUE;
    SendMessageW(hwnd, WM_SETICON, ICON_BIG, reinterpret_cast<LPARAM>(icons->big));
    SendMessageW(hwnd, WM_SETICON, ICON_SMALL, reinterpret_cast<LPARAM>(icons->small));
    ++icons->windows;
    return TRUE;
}

HICON load_icon(const std::wstring& path, int size) {
    const size_t dot = path.find_last_of(L'.');
    if (dot != std::wstring::npos && _wcsicmp(path.c_str() + dot, L".ico") == 0) {
        return static_cast<HICON>(LoadImageW(nullptr, path.c_str(), IMAGE_ICON, size, size, LR_LOADFROMFILE));
    }
    HANDLE file = CreateFileW(path.c_str(), GENERIC_READ, FILE_SHARE_READ, nullptr, OPEN_EXISTING, 0, nullptr);
    if (file == INVALID_HANDLE_VALUE) return nullptr;
    std::vector<BYTE> png(GetFileSize(file, nullptr));
    DWORD read = 0;
    const BOOL ok = ReadFile(file, png.data(), static_cast<DWORD>(png.size()), &read, nullptr);
    CloseHandle(file);
    if (!ok || read != png.size() || png.size() < 8 || std::memcmp(png.data() + 1, "PNG", 3) != 0) return nullptr;
    return CreateIconFromResourceEx(png.data(), read, TRUE, 0x00030000, size, size, LR_DEFAULTCOLOR);
}

void set_title_icon(Log& log, const std::string& icon) {
    if (icon.empty()) return;
    const std::wstring path = widen(icon);
    WindowIcons icons;
    icons.big = load_icon(path, GetSystemMetrics(SM_CXICON));
    icons.small = load_icon(path, GetSystemMetrics(SM_CXSMICON));
    if (!icons.big || !icons.small) {
        log.line("Window icon: could not read " + icon + " (PNG or .ico expected).");
        return;
    }
    EnumThreadWindows(GetCurrentThreadId(), set_window_icons, reinterpret_cast<LPARAM>(&icons));
    log.line("Window icon: the title's, on " + std::to_string(icons.windows) + " window(s).");
}

int run_loader() {
    if (__argc == 4 && std::strcmp(__argv[1], "--dump-hive") == 0) return dump_hive(__argv[2], __argv[3]);
    if (__argc >= 2 && std::strcmp(__argv[1], "--detach") == 0) {
        std::string arguments;
        for (int i = 2; i < __argc; ++i) arguments += (i > 2 ? " " : "") + std::string(__argv[i]);
        return detach(arguments, kCompatLayer);
    }
    if (__argc == 3 && std::strcmp(__argv[1], "--wait") == 0) return wait_for(__argv[2]);
    // D2SE.exe's manifest declares <dpiAware>true</dpiAware>. Without it Windows virtualises the
    // process's view of the screen, and D2Glide — which builds its font by drawing on the display DC
    // and reading it back with GetPixel, pixel by pixel — takes about 90 s per Glide window.
    SetProcessDPIAware();
    const std::string logPath = env_path("EXORDIUM_LOADER_LOG", "exordium-loader.log");
    Log log(logPath.c_str());
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
    if (!setup_registry(log, plan.hive, plan.registryFile)) {
        log.line("Cannot continue: the box's registry is not in place, and the game would use the machine's.");
        return 10;
    }
    fix_storm_mpq(log); // before anything opens an MPQ
    SFileCloseArchivePointer closeArchive = nullptr;
    std::vector<HANDLE> archives;
    FogBootstrap fog;
    GfxBootstrap gfx;

    D2ConfigStrc config = build_config(plan);
    log_config(log, config, plan);
    if (has_flag(plan.commandLine, "skiptobnet")) log.line("Skip to Battle.net: on, at this core's config offset.");
    if (const uint32_t act = flag_number(plan.commandLine, "act")) log.line("Start act: " + std::to_string(act) + ".");
    if (const uint32_t seed = flag_number(plan.commandLine, "seed")) log.line("Map seed: " + std::to_string(seed) + ".");
    const CoreOrdinals& ordinals = core_ordinals(plan.core, plan.gameVersion);
    log.line(std::string("Core ABI table: ") + ordinals.label + " for " + plan.gameVersion + ".");
    if (!setup_fog(log, config, plan.gameVersion, ordinals, plan.asyncData, fog)) {
        log.line("Cannot continue: Fog bootstrap failed.");
        return 7;
    }

    D2WinArchives d2winArchives;
    const bool viaD2Win = plan.archivesViaD2Win && plan.gameVersion == "v1.10";
    if (viaD2Win ? !open_archives_d2win(log, plan, config, archives, d2winArchives)
                 : !open_archives(log, plan, archives, closeArchive)) {
        log.line("Cannot continue: required MPQ archive stack did not open.");
        teardown_fog(log, fog);
        return 6;
    }

    probe_files(log, plan, fog.module, archives);

    if (!setup_gfx(log, config, ordinals, plan.graphics, plan.graphicsManual, plan.graphicsInit, plan.graphicsSurface, plan.graphicsWrapper, plan.graphicsWindow, gfx)) {
        log.line("Cannot continue: gfx bootstrap failed.");
        teardown_gfx(log, gfx);
        close_archives(log, closeArchive, archives);
        close_archives_d2win(log, d2winArchives);
        teardown_fog(log, fog);
        return 8;
    }
    set_title_icon(log, plan.icon);
    probe_mpqs(log, plan);

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
        close_archives_d2win(log, d2winArchives);
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
    if (!plan.battlenetAllowed && !lock_battlenet(log, launch)) {
        log.line("Cannot continue: Battle.net could not be closed for this core.");
        return shutdown(4);
    }

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
