const { spawn } = require("child_process");
const { screen } = require("electron");

// Windows only: tells which display, if any, has a full-screen app in front (a game, a
// video or a browser in F11). Windows has no event for this, so a PowerShell helper
// checks the foreground window twice a second and prints a line only when the answer
// changes: the center of that window's monitor in physical pixels, or "none".
//
// Full screen = the foreground window covers its whole monitor and has no title bar.
// A maximized window has a title bar (and stops at the taskbar), and the desktop is
// excluded by its class name.
const SCRIPT = `
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class YablokoFs {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [StructLayout(LayoutKind.Sequential)] public struct MONITORINFO {
    public int cbSize; public RECT rcMonitor; public RECT rcWork; public int dwFlags; }
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] static extern IntPtr MonitorFromWindow(IntPtr h, int f);
  [DllImport("user32.dll")] static extern bool GetMonitorInfo(IntPtr m, ref MONITORINFO i);
  [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr h, int i);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr c);
  public static void Init() { try { SetProcessDpiAwarenessContext(new IntPtr(-4)); } catch {} }
  public static string Check() {
    IntPtr h = GetForegroundWindow();
    if (h == IntPtr.Zero) return "none";
    var cls = new StringBuilder(64);
    GetClassName(h, cls, 64);
    string c = cls.ToString();
    if (c == "Progman" || c == "WorkerW" || c == "Shell_TrayWnd") return "none";
    if ((GetWindowLong(h, -16) & 0x00C00000) == 0x00C00000) return "none"; // WS_CAPTION
    RECT r;
    if (!GetWindowRect(h, out r)) return "none";
    var mi = new MONITORINFO { cbSize = Marshal.SizeOf(typeof(MONITORINFO)) };
    if (!GetMonitorInfo(MonitorFromWindow(h, 2), ref mi)) return "none";
    var m = mi.rcMonitor;
    if (r.L > m.L || r.T > m.T || r.R < m.R || r.B < m.B) return "none";
    return ((m.L + m.R) / 2) + "," + ((m.T + m.B) / 2);
  }
}
'@
[YablokoFs]::Init()
$last = ''
while ($true) {
  $now = [YablokoFs]::Check()
  if ($now -ne $last) { [Console]::Out.WriteLine($now); [Console]::Out.Flush(); $last = $now }
  Start-Sleep -Milliseconds 500
}
`;

function createFullscreenWatch({ onChange }) {
  let child = null;
  let displayId = null; // the display with a full-screen app, or null

  const set = (id) => {
    if (id === displayId) return;
    displayId = id;
    onChange();
  };

  function start() {
    if (child || process.platform !== "win32") return;
    child = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-EncodedCommand",
        Buffer.from(SCRIPT, "utf16le").toString("base64"),
      ],
      { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
    );
    const self = child;
    let buffer = "";
    child.stdout.on("data", (data) => {
      buffer += data.toString();
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop();
      for (const line of lines) {
        const match = /^(-?\d+),(-?\d+)$/.exec(line.trim());
        if (!match) {
          set(null);
          continue;
        }
        const point = screen.screenToDipPoint({
          x: Number(match[1]),
          y: Number(match[2]),
        });
        set(screen.getDisplayNearestPoint(point).id);
      }
    });
    child.stderr.on("data", (data) =>
      console.error("yabloko: fullscreen watch:", data.toString().trim()),
    );
    child.on("error", (err) =>
      console.error("yabloko: fullscreen watch failed", err),
    );
    child.on("exit", () => {
      if (child === self) {
        child = null;
        set(null);
      }
    });
  }

  function stop() {
    if (!child) return;
    const old = child;
    child = null;
    old.kill();
    set(null);
  }

  return {
    // Run it only while its answer is used
    setActive: (active) => (active ? start() : stop()),
    isFullscreen: (display) => displayId !== null && displayId === display.id,
  };
}

module.exports = { createFullscreenWatch };
