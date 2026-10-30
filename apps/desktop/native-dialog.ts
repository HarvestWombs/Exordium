import { powerShellLiteral, runPowerShellHidden } from "./windows-hidden-process.ts";

export interface NativeFolderPick {
  available: boolean;
  path: string | null;
}

export interface NativeFilePick {
  available: boolean;
  paths: string[] | null;
}

export function parseNativeDialogJson<T>(output: string): T {
  return JSON.parse(output.replace(/^\uFEFF/, "").trim()) as T;
}

async function runCommand(cmd: string, args: string[]): Promise<{ ranOk: boolean; path: string | null }> {
  try {
    const output = await new Deno.Command(cmd, { args, stdout: "piped", stderr: "null" }).output();
    if (!output.success) return { ranOk: true, path: null };
    return { ranOk: true, path: new TextDecoder().decode(output.stdout).trim() || null };
  } catch {
    return { ranOk: false, path: null };
  }
}

const FOLDER_PICKER_SCRIPT = String.raw`
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public static class ExordiumFolderPicker {
    [ComImport, Guid("42f85136-db7e-439c-85f1-e4075d135fc8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IFileOpenDialog {
        [PreserveSig] int Show(IntPtr parent);
        void SetFileTypes(uint c, IntPtr r);
        void SetFileTypeIndex(uint i);
        void GetFileTypeIndex(out uint i);
        void Advise(IntPtr e, out uint c);
        void Unadvise(uint c);
        void SetOptions(uint o);
        void GetOptions(out uint o);
        void SetDefaultFolder(IShellItem i);
        void SetFolder(IShellItem i);
        void GetFolder(out IShellItem i);
        void GetCurrentSelection(out IShellItem i);
        void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string n);
        void GetFileName(out IntPtr n);
        void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string t);
        void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string t);
        void SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string t);
        void GetResult(out IShellItem i);
        void AddPlace(IShellItem i, int d);
        void SetDefaultExtension([MarshalAs(UnmanagedType.LPWStr)] string e);
        void Close(int hr);
        void SetClientGuid(ref Guid g);
        void ClearClientData();
        void SetFilter(IntPtr f);
        void GetResults(out IntPtr e);
        void GetSelectedItems(out IntPtr i);
    }

    [ComImport, Guid("43826d1e-e718-42ee-bc55-a1e261c37bfe"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IShellItem {
        void BindToHandler(IntPtr c, ref Guid b, ref Guid r, out IntPtr v);
        void GetParent(out IShellItem i);
        void GetDisplayName(uint sigdn, out IntPtr name);
        void GetAttributes(uint mask, out uint attribs);
        void Compare(IShellItem i, uint hint, out int order);
    }

    [ComImport, Guid("dc1c5a9c-e88a-4dde-a5a1-60f82a20aef7")]
    private class FileOpenDialog { }

    [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
    private static extern void SHCreateItemFromParsingName(
        [MarshalAs(UnmanagedType.LPWStr)] string path, IntPtr bc, ref Guid riid,
        [MarshalAs(UnmanagedType.Interface)] out IShellItem item);

    public static string Pick(string startPath, string title) {
        var dialog = (IFileOpenDialog)new FileOpenDialog();
        uint options;
        dialog.GetOptions(out options);
        dialog.SetOptions(options | 0x20 | 0x40 | 0x800);
        if (!string.IsNullOrEmpty(title)) dialog.SetTitle(title);
        if (!string.IsNullOrEmpty(startPath)) {
            try {
                Guid iid = typeof(IShellItem).GUID;
                IShellItem start;
                SHCreateItemFromParsingName(startPath, IntPtr.Zero, ref iid, out start);
                dialog.SetFolder(start);
            } catch { }
        }
        if (dialog.Show(IntPtr.Zero) != 0) return null;
        IShellItem result;
        dialog.GetResult(out result);
        IntPtr buffer;
        result.GetDisplayName(0x80058000, out buffer);
        string picked = Marshal.PtrToStringUni(buffer);
        Marshal.FreeCoTaskMem(buffer);
        return picked;
    }
}
"@
$picked = [ExordiumFolderPicker]::Pick($StartPath, $Title)
if ($picked) { Set-Content -LiteralPath $OutFile -Value $picked -Encoding utf8 }
`;

async function pickFolderWindows(startPath?: string, title = "Choose Folder"): Promise<string | null> {
  return (await runPowerShellHidden(
    `$StartPath = ${powerShellLiteral(startPath ?? "")}\n$Title = ${powerShellLiteral(title)}\n${FOLDER_PICKER_SCRIPT}`,
  ))?.trim() || null;
}

export async function pickFolderNative(startPath?: string, title?: string): Promise<NativeFolderPick> {
  if (Deno.build.os === "windows") return { available: true, path: await pickFolderWindows(startPath, title) };
  if (Deno.build.os === "darwin") {
    const location = startPath ? ` default location (POSIX file "${startPath}")` : "";
    const result = await runCommand("osascript", ["-e", `POSIX path of (choose folder${location})`]);
    return { available: result.ranOk, path: result.path };
  }
  const viaZenity = await runCommand("zenity", [
    "--file-selection",
    "--directory",
    `--title=${title ?? "Choose Folder"}`,
    ...(startPath ? [`--filename=${startPath.endsWith("/") ? startPath : `${startPath}/`}`] : []),
  ]);
  if (viaZenity.ranOk) return { available: true, path: viaZenity.path };
  const viaKdialog = await runCommand("kdialog", ["--getexistingdirectory", startPath ?? "$HOME"]);
  if (viaKdialog.ranOk) return { available: true, path: viaKdialog.path };
  return { available: false, path: null };
}

export async function pickOpenFilesNative(options: {
  title?: string;
  extensions?: readonly { label: string; extensions: readonly string[] }[];
  startPath?: string;
  multiple?: boolean;
} = {}): Promise<NativeFilePick> {
  const title = options.title ?? "Open";
  const filters = options.extensions ?? [];
  if (Deno.build.os === "windows") {
    const filter = filters.length
      ? [
        ...filters.map((group) =>
          `${group.label} (${group.extensions.map((extension) => `*.${extension.replace(/^\./, "")}`).join(";")})|${
            group.extensions.map((extension) => `*.${extension.replace(/^\./, "")}`).join(";")
          }`
        ),
        `All supported (${
          filters.flatMap((group) => group.extensions).map((extension) => `*.${extension.replace(/^\./, "")}`).join(
            ";",
          )
        })|${
          filters.flatMap((group) => group.extensions).map((extension) => `*.${extension.replace(/^\./, "")}`).join(
            ";",
          )
        }`,
      ].join("|")
      : "All files (*.*)|*.*";
    const script = `
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.OpenFileDialog
$dialog.Title = ${powerShellLiteral(title)}
$dialog.Filter = ${powerShellLiteral(filter)}
$dialog.Multiselect = ${options.multiple === false ? "$false" : "$true"}
${options.startPath ? `$dialog.InitialDirectory = ${powerShellLiteral(options.startPath)}` : ""}
if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
  $dialog.FileNames | ConvertTo-Json -Compress | Set-Content -LiteralPath $OutFile -Encoding utf8
}
`;
    const output = await runPowerShellHidden(script);
    if (!output?.trim()) return { available: true, paths: null };
    const parsed = parseNativeDialogJson<string | string[]>(output);
    return { available: true, paths: Array.isArray(parsed) ? parsed : [parsed] };
  }
  if (Deno.build.os === "darwin") return { available: false, paths: null };
  // Linux: zenity, then kdialog, as the folder picker. One path per line.
  const lines = (output: string | null) =>
    output ? output.split("\n").map((line) => line.trim()).filter(Boolean) : null;
  const globs = (group: { extensions: readonly string[] }) =>
    group.extensions.map((extension) => `*.${extension.replace(/^\./, "")}`).join(" ");
  const multiple = options.multiple !== false;
  const viaZenity = await runCommand("zenity", [
    "--file-selection",
    `--title=${title}`,
    ...(multiple ? ["--multiple", "--separator=\n"] : []),
    ...filters.map((group) => `--file-filter=${group.label} | ${globs(group)}`),
    ...(options.startPath ? [`--filename=${options.startPath.replace(/\/*$/, "/")}`] : []),
  ]);
  if (viaZenity.ranOk) return { available: true, paths: lines(viaZenity.path) };
  const viaKdialog = await runCommand("kdialog", [
    "--getopenfilename",
    options.startPath ?? Deno.env.get("HOME") ?? "/",
    filters.map((group) => `${globs(group)}|${group.label}`).join("\n"),
    ...(multiple ? ["--multiple", "--separate-output"] : []),
  ]);
  if (viaKdialog.ranOk) return { available: true, paths: lines(viaKdialog.path) };
  return { available: false, paths: null };
}
