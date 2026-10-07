# Microsoft false-positive submission — exordium-launch.exe

Submit at **https://www.microsoft.com/en-us/wdsi/filesubmission** (Microsoft Security Intelligence — "Submit a file for
malware analysis"). Sign in with a Microsoft account, choose **Home customer** (or **Software developer** if you want to
register as the publisher), and set the reason to **"I believe this file is incorrectly detected as malware."** Attach
the file below and paste the text.

## The file

- **Name:** `exordium-launch.exe`
- **Detected as:** `Program:Win32/Contebrew.A!ml` (severity High, category "Settings Modifier")
- **SHA-256 of the quarantined copy:** `d1fd07a9915c6c5f569db1bd0ab6e2b08b3920b6829ba24d695b270e2429d42a`
- **Defender build at detection:** engine 1.1.26080.3, security intelligence 1.459.546.0, platform 4.18.26080.4

Attach the actual binary from `native/loader/build/exordium-launch.exe`. If it is in quarantine, restore it only long
enough to attach it, or rebuild it with `native/loader/build.ps1`. The portal accepts the file directly; you do not need
to zip it.

## Suggested text for the submission

> This executable is `exordium-launch.exe`, the launcher component of Exordium, an open-source launcher for the 2000
> game Diablo II that runs each game profile in an isolated "box" (a private folder and a private registry view). I am
> the developer.
>
> It is being quarantined as `Program:Win32/Contebrew.A!ml`. This is a false positive. The file is compiled by me from
> C++ source with Microsoft Visual C++ (the source is in the project's `native/loader` directory). It is not packed,
> obfuscated, or downloaded from anywhere.
>
> What the program legitimately does, which I believe the ML model is matching:
>
> - It starts the Diablo II game process and waits for it, recording how long the session ran.
> - For the game's 1.14 version, whose executable cannot be modified, it loads a small companion library
>   (`exordium-hook.dll`, also mine, also built from source in the same project) into the game so the game reads the
>   profile's own data files and a private registry view instead of the machine's. This is the same kind of in-process
>   configuration that many Diablo II community mods perform; it changes only that one game process's own view of its
>   files and settings, and writes nothing to global system settings.
>
> The program does not modify system or security settings, does not establish persistence, does not contact the network,
> and does not touch any process other than the game it launches. It is a local game launcher.
>
> Please reclassify this file as clean. I am happy to provide the full source, build instructions, or a signed build on
> request.

## Notes for whoever submits

- Microsoft's analysis typically responds within a day or two; the determination appears on the submission's status
  page.
- If Exordium starts code-signing its binaries (see the vault's `Architecture/Updater`, "Signing the exe"), include the
  publisher identity in future submissions — a consistent signed publisher builds the reputation that prevents `!ml`
  family verdicts from recurring.
- Do **not** ask players to add Defender exclusions or restore from quarantine on your say-so; that is each player's own
  decision.
