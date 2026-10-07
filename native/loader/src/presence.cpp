// exordium-presence.exe: Discord Rich Presence for one game run.
//
// Kept separate from exordium-launch.exe so the launcher can remain a plain run wrapper even when it
// has to inject exordium-hook.dll. This helper only speaks Discord's local named-pipe protocol and
// exits when the launcher or game process exits.

#include "common.hpp"
#include "discord.hpp"

namespace {

HANDLE open_process(DWORD pid) {
    return pid ? OpenProcess(SYNCHRONIZE, FALSE, pid) : nullptr;
}

int run_presence() {
    Log log(env_path("EXORDIUM_LOADER_LOG", "exordium-loader.log").c_str());
    if (__argc != 5 || std::strcmp(__argv[1], "--run") != 0) {
        log.line("exordium-presence started without a run.");
        return 2;
    }
    const DWORD launcherPid = static_cast<DWORD>(std::strtoul(__argv[2], nullptr, 10));
    const DWORD gamePid = static_cast<DWORD>(std::strtoul(__argv[3], nullptr, 10));
    const long long startedAt = std::strtoll(__argv[4], nullptr, 10);
    HANDLE launcher = open_process(launcherPid);
    HANDLE game = open_process(gamePid);
    if (!launcher || !game) {
        if (launcher) CloseHandle(launcher);
        if (game) CloseHandle(game);
        log.line("Discord presence helper could not watch the run processes.");
        return 3;
    }

    const std::string config = read_file(env_path("EXORDIUM_LOADER_CONFIG", "exordium-loader.json").c_str());
    discord::Presence presence(json_string(config, "discordClientId"), json_string(config, "discordActivity"), startedAt);
    presence.start(gamePid);
    HANDLE handles[2] = { launcher, game };
    WaitForMultipleObjects(2, handles, FALSE, INFINITE);
    presence.stop();
    log.line("Discord presence: " + presence.outcome() + ".");
    CloseHandle(game);
    CloseHandle(launcher);
    return 0;
}

} // namespace

int WINAPI WinMain(HINSTANCE, HINSTANCE, LPSTR, int) {
    return run_presence();
}
