const path = require("path");
const { BrowserWindow, ipcMain, screen } = require("electron");

// A small always-on-top pill, shown while the main window is in the tray. It starts
// above the taskbar next to the clock and can be dragged elsewhere; where it was dropped
// is saved (getPosition/savePosition). The window is larger than the pill by MARGIN on
// each side, so the pill's shadow has room.
const WIDTH = 380;
const HEIGHT = 48;
const MARGIN = 8;
const COMMANDS = new Set([
  "previous",
  "play-pause",
  "next",
  "favorite",
  "suggest-less",
  "show",
  "close",
]);

function createMiniPlayer({ onCommand, getPosition, savePosition }) {
  const win = new BrowserWindow({
    width: WIDTH + 2 * MARGIN,
    height: HEIGHT + 2 * MARGIN,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    // Dragging is done by the page (see mini-player-drag), so clicks still work
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    // Clicks work without taking focus away from whatever you're doing
    focusable: false,
    hasShadow: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "..", "preload", "mini-player.js"),
    },
  });
  win.loadFile(
    path.join(__dirname, "..", "renderer", "mini-player", "index.html"),
  );

  let state = null;
  win.webContents.on("did-finish-load", () =>
    win.webContents.send("mini-player-state", state),
  );

  ipcMain.on("mini-player-command", (event, name) => {
    if (event.sender !== win.webContents || !COMMANDS.has(name)) return;
    onCommand(name);
  });

  // While dragging, the page sends how far the pointer has moved since it was pressed
  let drag = null; // { start, current } positions
  ipcMain.on("mini-player-drag", (event, dx, dy) => {
    if (event.sender !== win.webContents) return;
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
    if (!drag) {
      const [x, y] = win.getPosition();
      drag = { start: { x, y } };
    }
    drag.current = {
      x: Math.round(drag.start.x + dx),
      y: Math.round(drag.start.y + dy),
    };
    place();
  });
  ipcMain.on("mini-player-drag-end", (event) => {
    if (event.sender !== win.webContents || !drag) return;
    if (drag.current) savePosition(drag.current);
    drag = null;
  });

  const size = { width: WIDTH + 2 * MARGIN, height: HEIGHT + 2 * MARGIN };
  // A saved position only counts while the pill's center is on a screen (it may have
  // been on a monitor that's since been unplugged)
  const onScreen = ({ x, y }) => {
    const center = { x: x + size.width / 2, y: y + size.height / 2 };
    return screen.getAllDisplays().some(({ workArea: a }) => {
      return (
        center.x >= a.x &&
        center.x < a.x + a.width &&
        center.y >= a.y &&
        center.y < a.y + a.height
      );
    });
  };
  // Where it's being dragged, else where it was dropped, else bottom right of the
  // screen with the taskbar, just above it
  const target = () => {
    if (drag && drag.current) return { ...drag.current, ...size };
    const saved = getPosition();
    if (saved && onScreen(saved)) return { x: saved.x, y: saved.y, ...size };
    const { workArea } = screen.getPrimaryDisplay();
    return {
      x: workArea.x + workArea.width - size.width,
      y: workArea.y + workArea.height - size.height,
      ...size,
    };
  };
  const place = () => win.setBounds(target());

  // On its first show, Windows moves the window to the top of the screen a few ms
  // later. Only we move it, so any move away from its spot is that one: put it back.
  win.on("move", () => {
    if (!win.isVisible()) return;
    const { x, y } = win.getBounds();
    const want = target();
    if (x !== want.x || y !== want.y) place();
  });

  return {
    update(next) {
      state = next;
      win.webContents.send("mini-player-state", state);
    },
    setVisible(visible) {
      if (visible) {
        // Also when already shown: the saved position may have been reset
        place();
        if (!win.isVisible()) win.showInactive();
      } else if (win.isVisible()) {
        win.hide();
      }
    },
  };
}

module.exports = { createMiniPlayer };
