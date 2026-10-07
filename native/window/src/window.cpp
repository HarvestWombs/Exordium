// Exordium's desktop window hook.
//
// The desktop app draws its own title bar, so the OS frame has to go, but Windows only snaps,
// Win+arrows and animates windows that keep a resizable frame and are moved by its own move loop.
// This keeps the frame styles and reports the whole window as client area (WM_NCCALCSIZE), so no
// border or caption is drawn, and runs Windows' own move/size loops on request.
//
// It has to be native: the window's messages arrive on laufey's UI thread, and a Deno callback in
// the window procedure hangs the app, since every message waits on the JavaScript thread. Deno
// loads this DLL, calls ExordiumWindowAttach once, and posts kBeginMove / kBeginSize after that.

#include <windows.h>

#include <string>

namespace {

// Posted by the app. wParam of kBeginSize is a WMSZ_* edge (1-8).
constexpr UINT kBeginMove = WM_APP + 0x45;
constexpr UINT kBeginSize = WM_APP + 0x46;

WNDPROC previous = nullptr;
LONG minWidth = 0;
LONG minHeight = 0;

LRESULT CALLBACK hook(HWND hwnd, UINT message, WPARAM wparam, LPARAM lparam) {
    switch (message) {
    case WM_NCCALCSIZE:
        if (wparam) {
            // The whole window is client area. A maximized window is placed past the monitor by
            // its (now invisible) frame, so it is clamped to the work area instead, keeping the
            // taskbar clear and nothing cut off. The monitor is the one the new rect (rgrc[0]) is
            // on, not the window's current one: restoring from minimized, the window is still at
            // -32000,-32000, whose nearest monitor can be another screen entirely, and the page was
            // then laid out there, leaving the window white (2026-10-06, a monitor above the main).
            if (IsZoomed(hwnd)) {
                auto* params = reinterpret_cast<NCCALCSIZE_PARAMS*>(lparam);
                MONITORINFO info{};
                info.cbSize = sizeof(info);
                if (GetMonitorInfoW(MonitorFromRect(&params->rgrc[0], MONITOR_DEFAULTTONEAREST), &info)) {
                    params->rgrc[0] = info.rcWork;
                }
            }
            return 0;
        }
        break;
    case WM_NCACTIVATE:
        // -1: keep the activation change but do not repaint a frame over the page.
        return DefWindowProcW(hwnd, message, wparam, -1);
    case WM_GETMINMAXINFO: {
        const LRESULT result = CallWindowProcW(previous, hwnd, message, wparam, lparam);
        auto* info = reinterpret_cast<MINMAXINFO*>(lparam);
        if (info->ptMinTrackSize.x < minWidth) info->ptMinTrackSize.x = minWidth;
        if (info->ptMinTrackSize.y < minHeight) info->ptMinTrackSize.y = minHeight;
        return result;
    }
    case kBeginMove:
    case kBeginSize: {
        // On this thread, while the button that started the gesture is still down: Windows' own
        // modal loop, which is what Snap, snap layouts and drag-to-restore listen to.
        POINT point{};
        GetCursorPos(&point);
        ReleaseCapture();
        const WPARAM command = message == kBeginMove ? (SC_MOVE | HTCAPTION) : (SC_SIZE | (wparam & 0xF));
        DefWindowProcW(hwnd, WM_SYSCOMMAND, command, MAKELPARAM(point.x, point.y));
        return 0;
    }
    default:
        break;
    }
    return CallWindowProcW(previous, hwnd, message, wparam, lparam);
}

}  // namespace

// Runs a console program (tar.exe, reg.exe) with no console window and waits for it; returns its exit
// code, or -1 when it could not start. Deno cannot ask CreateProcess for CREATE_NO_WINDOW, and from
// the desktop app, which has no console, every console program otherwise flashes a terminal window.
// `commandLine` is a full Windows command line; `directory` may be empty for the current one. Deno
// calls this off its main thread (a nonblocking symbol), so a long extraction does not stall it.
extern "C" __declspec(dllexport) int ExordiumRunHidden(const wchar_t* commandLine, const wchar_t* directory) {
    std::wstring command(commandLine); // CreateProcessW may write to the command line
    STARTUPINFOW startup{};
    startup.cb = sizeof(startup);
    PROCESS_INFORMATION process{};
    const wchar_t* cwd = directory && *directory ? directory : nullptr;
    if (!CreateProcessW(nullptr, command.data(), nullptr, nullptr, FALSE, CREATE_NO_WINDOW, nullptr, cwd, &startup, &process)) {
        return -1;
    }
    WaitForSingleObject(process.hProcess, INFINITE);
    DWORD code = 0;
    GetExitCodeProcess(process.hProcess, &code);
    CloseHandle(process.hThread);
    CloseHandle(process.hProcess);
    return static_cast<int>(code);
}

// Hooks the window and gives it the resizable frame styles with no visible frame. Same process,
// any thread: SetWindowLongPtrW may replace the procedure of a window this process owns. Returns
// 1 on success; calling it again only updates the minimum size.
extern "C" __declspec(dllexport) int ExordiumWindowAttach(HWND hwnd, int width, int height) {
    if (!IsWindow(hwnd)) return 0;
    minWidth = width;
    minHeight = height;
    if (previous == nullptr) {
        const LONG_PTR old = SetWindowLongPtrW(hwnd, GWLP_WNDPROC, reinterpret_cast<LONG_PTR>(&hook));
        if (old == 0) return 0;
        previous = reinterpret_cast<WNDPROC>(old);
    }
    LONG_PTR style = GetWindowLongPtrW(hwnd, GWL_STYLE);
    style |= WS_CAPTION | WS_THICKFRAME | WS_SYSMENU | WS_MINIMIZEBOX | WS_MAXIMIZEBOX;
    SetWindowLongPtrW(hwnd, GWL_STYLE, style);
    SetWindowPos(hwnd, nullptr, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED);
    return 1;
}
