/**
 * Drives the desktop window on Windows through user32, the way Excelsior does: title, size,
 * frameless, and the moves the app's own title bar asks for.
 *
 * `new Deno.BrowserWindow()` never returns on Windows (it blocks the event loop while adopting
 * the runtime's window), so the app never has a window object. laufey still creates a real
 * HWND of class `LaufeyWebView2` before this module runs, and user32 can drive it once found.
 * Left alone that window is 800x600, framed, and titled "E" (laufey v0.6.1, stock canary).
 *
 * Best-effort, every call returns whether it worked: without --allow-ffi, under a plain
 * `deno run` (no window), or off Windows, nothing happens and the page keeps the browser's chrome.
 *
 * **Native frame (native/window).** Windows snaps, Win+arrows and animates only a window that keeps
 * a resizable frame and is moved by Windows' own loop. `exordium-window.dll` hooks the window
 * procedure on laufey's UI thread: the frame styles stay but no frame is drawn, and a posted
 * request starts Windows' move or size loop there, while the page's mouse button is still down.
 * A Deno callback cannot be the window procedure (every message would wait on the JavaScript
 * thread, and the app hangs). Without the DLL the window falls back to stripping the frame and
 * the polling loops below, which move and resize but never snap.
 */

import { nativeLibrary } from "./native.ts";

const TITLE = "Exordium";
const WIDTH = 1280;
const HEIGHT = 800;
const MIN_WIDTH = 1024;
const MIN_HEIGHT = 640;

const SYMBOLS = {
  FindWindowExW: { parameters: ["pointer", "pointer", "buffer", "pointer"], result: "pointer" },
  GetWindowThreadProcessId: { parameters: ["pointer", "buffer"], result: "u32" },
  DefWindowProcW: { parameters: ["pointer", "u32", "usize", "buffer"], result: "isize" },
  GetWindowLongPtrW: { parameters: ["pointer", "i32"], result: "isize" },
  SetWindowLongPtrW: { parameters: ["pointer", "i32", "isize"], result: "isize" },
  GetWindowRect: { parameters: ["pointer", "buffer"], result: "bool" },
  SetWindowPos: { parameters: ["pointer", "pointer", "i32", "i32", "i32", "i32", "u32"], result: "bool" },
  ShowWindow: { parameters: ["pointer", "i32"], result: "bool" },
  IsZoomed: { parameters: ["pointer"], result: "bool" },
  MonitorFromWindow: { parameters: ["pointer", "u32"], result: "pointer" },
  GetMonitorInfoW: { parameters: ["pointer", "buffer"], result: "bool" },
  GetCursorPos: { parameters: ["buffer"], result: "bool" },
  GetAsyncKeyState: { parameters: ["i32"], result: "i16" },
  PostMessageW: { parameters: ["pointer", "u32", "usize", "isize"], result: "bool" },
  SendMessageW: { parameters: ["pointer", "u32", "usize", "isize"], result: "isize" },
  CreateIconFromResourceEx: {
    parameters: ["buffer", "u32", "bool", "u32", "i32", "i32", "u32"],
    result: "pointer",
  },
} as const;

/** Messages the DLL's window procedure handles (native/window/src/window.cpp). */
const BEGIN_MOVE = 0x8000 + 0x45;
const BEGIN_SIZE = 0x8000 + 0x46;
const WM_SYSCOMMAND = 0x0112;
const SC_MINIMIZE = 0xf020;
const SC_MAXIMIZE = 0xf030;
const SC_RESTORE = 0xf120;
/** WMSZ_* for each edge the page's bands report. */
const EDGES: Record<string, number> = { w: 1, e: 2, n: 3, nw: 4, ne: 5, s: 6, sw: 7, se: 8 };

const WM_SETTEXT = 0x000c;
const WM_SETICON = 0x0080;
const ICON_SMALL = 0;
const ICON_BIG = 1;
const GWL_STYLE = -16;
const WS_CAPTION = 0x00c00000;
const WS_THICKFRAME = 0x00040000;
const SW_HIDE = 0;
const SW_MINIMIZE = 6;
const SW_RESTORE = 9;
const VK_LBUTTON = 0x01;
const MONITOR_DEFAULTTONEAREST = 2;
// SWP_NOZORDER | SWP_NOACTIVATE
const SWP_MOVE_ONLY = 0x0004 | 0x0010;
// SWP_NOSIZE | SWP_NOMOVE | SWP_NOZORDER | SWP_FRAMECHANGED
const SWP_FRAME_ONLY = 0x0001 | 0x0002 | 0x0004 | 0x0020;

type User32 = Deno.DynamicLibrary<typeof SYMBOLS>;
type Hwnd = NonNullable<Deno.PointerValue>;
interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

let user32: User32 | null = null;
let dlopenFailed = false;
/** Set once the DLL has hooked the window; every move and size then goes through Windows. */
let native = false;
/** Where the window was before maximize, so restore can put it back. Also the "is maximized" flag. */
let restoreRect: Rect | null = null;

function lib(): User32 | null {
  if (user32 || dlopenFailed || Deno.build.os !== "windows") return user32;
  try {
    user32 = Deno.dlopen("user32.dll", SYMBOLS);
  } catch {
    dlopenFailed = true;
  }
  return user32;
}

function utf16z(value: string): Uint8Array {
  const buffer = new Uint8Array((value.length + 1) * 2);
  const view = new DataView(buffer.buffer);
  for (let i = 0; i < value.length; i++) view.setUint16(i * 2, value.charCodeAt(i), true);
  return buffer;
}

/** Our own window: the `LaufeyWebView2` window owned by this process. Not cached, in case it is recreated. */
function findOwnWindow(user: User32): Deno.PointerValue {
  const className = utf16z("LaufeyWebView2");
  const pid = new Uint32Array(1);
  let current: Deno.PointerValue = null;
  for (let guard = 0; guard < 64; guard++) {
    current = user.symbols.FindWindowExW(null, current, className, null);
    if (current === null) return null;
    user.symbols.GetWindowThreadProcessId(current, new Uint8Array(pid.buffer));
    if (pid[0] === Deno.pid) return current;
  }
  return null;
}

function withWindow(action: (user: User32, hwnd: Hwnd) => void): boolean {
  const user = lib();
  if (!user) return false;
  const hwnd = findOwnWindow(user);
  if (hwnd === null) return false;
  try {
    action(user, hwnd);
    return true;
  } catch {
    return false;
  }
}

function windowRect(user: User32, hwnd: Hwnd): Rect | null {
  const rect = new Int32Array(4);
  if (!user.symbols.GetWindowRect(hwnd, new Uint8Array(rect.buffer))) return null;
  const [left = 0, top = 0, right = 0, bottom = 0] = rect;
  return { left, top, right, bottom };
}

/** The monitor minus the taskbar. */
function workArea(user: User32, hwnd: Hwnd): Rect | null {
  const monitor = user.symbols.MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
  // MONITORINFO: cbSize, rcMonitor[4], rcWork[4], dwFlags.
  const info = new Int32Array(10);
  info[0] = 40;
  if (monitor === null || !user.symbols.GetMonitorInfoW(monitor, new Uint8Array(info.buffer))) return null;
  const [left = 0, top = 0, right = 0, bottom = 0] = info.slice(5, 9);
  return { left, top, right, bottom };
}

function place(user: User32, hwnd: Hwnd, rect: Rect): void {
  user.symbols.SetWindowPos(
    hwnd,
    null,
    rect.left,
    rect.top,
    rect.right - rect.left,
    rect.bottom - rect.top,
    SWP_MOVE_ONLY,
  );
}

function nudgeSize(user: User32, hwnd: Hwnd): void {
  const rect = windowRect(user, hwnd);
  if (!rect) return;
  const width = rect.right - rect.left;
  const height = rect.bottom - rect.top;
  user.symbols.SetWindowPos(hwnd, null, rect.left, rect.top, width + 1, height, SWP_MOVE_ONLY);
  user.symbols.SetWindowPos(hwnd, null, rect.left, rect.top, width, height, SWP_MOVE_ONLY);
}

function cursor(user: User32): { x: number; y: number } | null {
  const point = new Int32Array(2);
  if (!user.symbols.GetCursorPos(new Uint8Array(point.buffer))) return null;
  const [x = 0, y = 0] = point;
  return { x, y };
}

function maximized(user: User32, hwnd: Hwnd): boolean {
  return restoreRect !== null || user.symbols.IsZoomed(hwnd);
}

/** Whether the window is maximized now, however it got there (the button, Snap, Win+Up). */
export function windowState(): { maximized: boolean } {
  const user = lib();
  const hwnd = user && findOwnWindow(user);
  return { maximized: user && hwnd ? maximized(user, hwnd) : false };
}

/**
 * Sizes the window at startup: WIDTH x HEIGHT, centred, never past the work area. Retried: the
 * window exists before this module runs but isn't always findable the moment the server binds.
 */
export async function setUpWindow(): Promise<boolean> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const done = withWindow((user, hwnd) => {
      const rect = windowRect(user, hwnd);
      const area = workArea(user, hwnd);
      if (!rect || !area) return;
      if (rect.right - rect.left >= WIDTH && rect.bottom - rect.top >= HEIGHT) return;
      const width = Math.min(WIDTH, area.right - area.left);
      const height = Math.min(HEIGHT, area.bottom - area.top);
      const left = area.left + Math.floor((area.right - area.left - width) / 2);
      const top = area.top + Math.floor((area.bottom - area.top - height) / 2);
      place(user, hwnd, { left, top, right: left + width, bottom: top + height });
    });
    if (done) return true;
    if (!lib()) return false;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return false;
}

/**
 * Titles the window and strips its frame, leaving the page's top bar as the only title bar.
 * Called once the page has mounted: laufey rewrites the title to "E" when the page's <title>
 * arrives, and a title set after that holds. True means the app is in its own window.
 */
/**
 * The title bar, taskbar and Alt+Tab icon. The launcher's own resources carry it too (embed-icon.ts),
 * but a window gets its class icon, laufey's, unless it is set here. Each slot gets its own size:
 * Windows does not resample between them, so a 256px image in the 16px slot smears.
 */
async function setIcon(user: User32, hwnd: Hwnd): Promise<void> {
  const { parseIco } = await import("./embed-icon.ts");
  const ico = await Deno.readFile(new URL("./assets/exordium.ico", import.meta.url)).catch(() => null);
  if (!ico) return;
  const entries = parseIco(ico).map((entry) => ({ ...entry, size: entry.header[0] || 256 }));
  for (const [slot, wanted] of [[ICON_SMALL, 16], [ICON_BIG, 32]] as const) {
    const entry = entries.filter((e) => e.size >= wanted).sort((a, b) => a.size - b.size)[0] ?? entries.at(-1);
    if (!entry) continue;
    const icon = user.symbols.CreateIconFromResourceEx(
      entry.image,
      entry.image.length,
      true,
      0x00030000,
      wanted,
      wanted,
      0,
    );
    if (icon) user.symbols.SendMessageW(hwnd, WM_SETICON, BigInt(slot), BigInt(Deno.UnsafePointer.value(icon)));
  }
}

export async function prepareWindow(): Promise<boolean> {
  const user = lib();
  const hwnd = user && findOwnWindow(user);
  if (!user || !hwnd) return false;
  // Straight to the default window procedure: SetWindowTextW from inside this process goes
  // through laufey's own procedure, which reports success and still leaves "E". The title
  // still matters without a caption: the taskbar and Alt+Tab show it.
  user.symbols.DefWindowProcW(hwnd, WM_SETTEXT, 0n, utf16z(TITLE));
  await setIcon(user, hwnd).catch(() => {});
  if (!native) {
    const dll = await nativeLibrary();
    native = dll !== null && dll.symbols.ExordiumWindowAttach(hwnd, MIN_WIDTH, MIN_HEIGHT) === 1;
  }
  if (native) {
    nudgeSize(user, hwnd);
    return true;
  }
  return withWindow((user, hwnd) => {
    // Both flags go: WS_CAPTION alone leaves WS_THICKFRAME's sizing border, which DWM paints and
    // claims a large top resize band over the page.
    const style = user.symbols.GetWindowLongPtrW(hwnd, GWL_STYLE);
    user.symbols.SetWindowLongPtrW(hwnd, GWL_STYLE, BigInt(style) & ~BigInt(WS_CAPTION | WS_THICKFRAME));
    user.symbols.SetWindowPos(hwnd, null, 0, 0, 0, 0, SWP_FRAME_ONLY);
    nudgeSize(user, hwnd);
  });
}

/** A system command through the window's own procedure, so Windows animates it as usual. */
function post(user: User32, hwnd: Hwnd, message: number, wparam: number): boolean {
  return user.symbols.PostMessageW(hwnd, message, BigInt(wparam), 0n);
}

export function minimizeWindow(): boolean {
  if (native) return withWindow((user, hwnd) => post(user, hwnd, WM_SYSCOMMAND, SC_MINIMIZE));
  return withWindow((user, hwnd) => user.symbols.ShowWindow(hwnd, SW_MINIMIZE));
}

/**
 * Maximize by hand to the work area. SW_MAXIMIZE on a window with no frame covers the taskbar,
 * and the usual fix (WM_GETMINMAXINFO) needs a window procedure hook this side can't install.
 */
export function toggleMaximizeWindow(): { ok: boolean; maximized: boolean } {
  if (native) {
    let zoomed = false;
    const ok = withWindow((user, hwnd) => {
      zoomed = user.symbols.IsZoomed(hwnd);
      post(user, hwnd, WM_SYSCOMMAND, zoomed ? SC_RESTORE : SC_MAXIMIZE);
    });
    // Posted, so not yet applied: report where it is going.
    return { ok, maximized: ok ? !zoomed : zoomed };
  }
  const ok = withWindow((user, hwnd) => {
    if (restoreRect) {
      place(user, hwnd, restoreRect);
      restoreRect = null;
      return;
    }
    if (user.symbols.IsZoomed(hwnd)) {
      user.symbols.ShowWindow(hwnd, SW_RESTORE);
      return;
    }
    const area = workArea(user, hwnd);
    const rect = windowRect(user, hwnd);
    if (!area || !rect) return;
    restoreRect = rect;
    place(user, hwnd, area);
  });
  const user = lib();
  const hwnd = user && findOwnWindow(user);
  return { ok, maximized: user && hwnd ? maximized(user, hwnd) : restoreRect !== null };
}

export function closeWindow(): boolean {
  return withWindow((user, hwnd) => {
    user.symbols.ShowWindow(hwnd, SW_HIDE);
    queueMicrotask(() => Deno.exit(0));
  });
}

/**
 * Resizes the window with the mouse by polling the cursor until the button comes up. Cursor position
 * and button state are global, so polling works regardless of the webview's mouse capture. Bounded
 * at ~30 s.
 */
function dragLoop(transform: (start: Rect, dx: number, dy: number) => Rect): boolean {
  const user = lib();
  if (!user) return false;
  const hwnd = findOwnWindow(user);
  if (hwnd === null) return false;
  const start = windowRect(user, hwnd);
  const from = cursor(user);
  if (!start || !from) return false;
  void (async () => {
    try {
      for (let tick = 0; tick < 3750 && (user.symbols.GetAsyncKeyState(VK_LBUTTON) & 0x8000) !== 0; tick++) {
        const now = cursor(user);
        if (!now) break;
        place(user, hwnd, transform(start, now.x - from.x, now.y - from.y));
        await new Promise((resolve) => setTimeout(resolve, 8));
      }
    } catch {
      // Window closed mid-drag.
    }
  })();
  return true;
}

export function startWindowDrag(): { ok: boolean; maximized: boolean } {
  const user = lib();
  const hwnd = user && findOwnWindow(user);
  if (!user || !hwnd) return { ok: false, maximized: false };
  // Windows' own move loop: Snap, snap layouts, and dragging a maximized window back out.
  if (native) return { ok: post(user, hwnd, BEGIN_MOVE, 0), maximized: maximized(user, hwnd) };

  if (restoreRect) {
    // Dragging a maximized window un-maximizes it, keeping the grab point under the cursor.
    const now = user && cursor(user);
    const current = user && hwnd ? windowRect(user, hwnd) : null;
    if (user && hwnd && now && current) {
      const width = restoreRect.right - restoreRect.left;
      const height = restoreRect.bottom - restoreRect.top;
      const fraction = (now.x - current.left) / Math.max(1, current.right - current.left);
      const left = Math.round(now.x - width * fraction);
      const top = current.top;
      place(user, hwnd, { left, top, right: left + width, bottom: top + height });
    }
    restoreRect = null;
  }

  const ok = dragLoop((start, dx, dy) => ({
    left: start.left + dx,
    top: start.top + dy,
    right: start.right + dx,
    bottom: start.bottom + dy,
  }));
  return { ok, maximized: maximized(user, hwnd) };
}

export function startWindowResize(edge: string): boolean {
  if (!/^[ns]?[ew]?$/.test(edge) || edge === "") return false;
  if (native) return withWindow((user, hwnd) => post(user, hwnd, BEGIN_SIZE, EDGES[edge]!));
  restoreRect = null;
  const north = edge.includes("n");
  const south = edge.includes("s");
  const west = edge.includes("w");
  const east = edge.includes("e");
  return dragLoop((start, dx, dy) => {
    const next = { ...start };
    if (north) next.top = start.top + dy;
    if (south) next.bottom = start.bottom + dy;
    if (west) next.left = start.left + dx;
    if (east) next.right = start.right + dx;
    // Hold the floor by pushing back the edge being dragged, so the opposite edge stays put.
    if (next.right - next.left < MIN_WIDTH) {
      if (west) next.left = next.right - MIN_WIDTH;
      else next.right = next.left + MIN_WIDTH;
    }
    if (next.bottom - next.top < MIN_HEIGHT) {
      if (north) next.top = next.bottom - MIN_HEIGHT;
      else next.bottom = next.top + MIN_HEIGHT;
    }
    return next;
  });
}
