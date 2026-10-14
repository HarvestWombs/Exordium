# 7-Zip

The 7-Zip Exordium unpacks every mod archive with (`apps/desktop/install.ts`), shipped in the app as `native/7zip/` so
every machine unpacks the same way.

- Version: 26.04 (x64), 2026-10-05
- Source: `7z2604-x64.exe` from the 7-Zip download page (https://www.7-zip.org/download.html), which links
  https://github.com/ip7z/7zip/releases/download/26.04/7z2604-x64.exe. SHA-256 of the installer:
  `d54bf805f9f3704d1e8db2fa3498ae7ef2df0312b40b558e7c71c734430a665d`.
- Files: `7z.exe` and `7z.dll` taken from the installer unchanged, and `License.txt`, which must ship with them (GNU
  LGPL; 7z.dll's RAR code carries the unRAR licence restriction).

To update: download the newest x64 installer from 7-zip.org, unpack it with 7-Zip (`7z x 7z<version>-x64.exe`), copy
these three files over, and update this note.
