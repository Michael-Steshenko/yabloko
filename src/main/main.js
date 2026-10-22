const path = require("path");
const {
  app,
  BrowserWindow,
  Menu,
  Tray,
  dialog,
  ipcMain,
  nativeImage,
  shell,
  components,
} = require("electron");
const { createServer } = require("./http-server");
const {
  DEFAULTS,
  loadSettings,
  saveSettings,
  loadLastPlayback,
  saveLastPlayback,
} = require("./settings");
const {
  buildWatchScript,
  buildRestoreScript,
  buildSkipScript,
} = require("../renderer/playback-state");

const PORT = Number(process.env.YABLOKO_PORT) || 8787;
const HOST = process.env.YABLOKO_HOST || "127.0.0.1";
const ALLOWED_NAVIGATION_HOST = /(^|\.)apple\.com$/;
const ICON_PATH = path.join(__dirname, "..", "..", "assets", "icon.png");

let mainWindow = null;
let server = null;
let tray = null;
let settings = null;
let isQuitting = false;

function showWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function setSetting(key, value) {
  settings[key] = value;
  saveSettings(settings);
  updateMenus(); // keep the tray menu and the window menu in sync
}

async function resetSettings() {
  const options = {
    type: "question",
    title: "Reset settings",
    message: "Reset all settings to their defaults?",
    buttons: ["Reset", "Cancel"],
    defaultId: 1,
    cancelId: 1,
    noLink: true, // Windows: plain buttons in one row, not "Reset" as a command link
  };
  // Attach to the window only while it's shown; a dialog parented to a hidden window
  // would be hidden too
  const { response } = mainWindow?.isVisible()
    ? await dialog.showMessageBox(mainWindow, options)
    : await dialog.showMessageBox(options);
  if (response !== 0) return;
  settings = { ...DEFAULTS };
  saveSettings(settings);
  updateMenus();
}

// Shared by the tray menu and the window's menu bar. The menu bar copy matters where
// the tray icon isn't shown (e.g. stock GNOME without the AppIndicator extension).
function settingsMenuItems() {
  return [
    { label: "Show Yabloko", click: showWindow },
    {
      label: "When closing the window",
      submenu: [
        {
          label: "Keep playing in tray",
          type: "radio",
          checked: settings.closeAction === "tray",
          click: () => setSetting("closeAction", "tray"),
        },
        {
          label: "Quit Yabloko",
          type: "radio",
          checked: settings.closeAction === "quit",
          click: () => setSetting("closeAction", "quit"),
        },
      ],
    },
    {
      label: "Start hidden in tray",
      type: "checkbox",
      checked: settings.startHidden,
      click: (item) => setSetting("startHidden", item.checked),
    },
    {
      label: "Resume last playback on start",
      type: "checkbox",
      checked: settings.resumePlayback,
      click: (item) => setSetting("resumePlayback", item.checked),
    },
    {
      label: "Skip song on suggest less",
      type: "checkbox",
      checked: settings.skipOnSuggestLess,
      click: (item) => setSetting("skipOnSuggestLess", item.checked),
    },
    { label: "Reset settings to defaults…", click: resetSettings },
    { type: "separator" },
    { label: "Quit Yabloko", click: () => app.quit() },
  ];
}

function updateMenus() {
  if (tray) tray.setContextMenu(Menu.buildFromTemplate(settingsMenuItems()));
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      { label: "Yabloko", submenu: settingsMenuItems() },
      { role: "editMenu" },
      { role: "viewMenu" },
    ]),
  );
}

// While the resume option is on, remember what's playing and where it came from, so the
// next start can pick it up again. Saved on every song change, reported by the page
// through the preload bridge, so it's current even after a crash or a Task Manager kill.
const isString = (v) => typeof v === "string" && v.length > 0 && v.length < 300;

ipcMain.on("playback-changed", (event, state) => {
  if (!settings || !settings.resumePlayback) return;
  if (!mainWindow || event.sender !== mainWindow.webContents) return;
  // It comes from the web page, so only keep well-formed values
  if (
    !state ||
    !isString(state.containerType) ||
    !isString(state.containerId) ||
    !isString(state.songId)
  ) {
    return;
  }
  saveLastPlayback({
    containerType: state.containerType,
    containerId: state.containerId,
    containerName: isString(state.containerName) ? state.containerName : null,
    songId: state.songId,
    songName: isString(state.songName) ? state.songName : null,
  });
});

// Suggest less is a PUT of rating -1 to /v1/me/ratings/<type>/<id>, whether it comes
// from the page's own menu or from our hotkey action. Watching the network catches both
// however the page sends it, and the skip starts the moment the request goes out.
const RATING_PATH = /\/v1\/me\/ratings\/[a-z-]+\/([^/?]+)/;

function isSuggestLess(details) {
  if (details.method !== "PUT" || !details.uploadData) return false;
  try {
    const body = Buffer.concat(
      details.uploadData.filter((d) => d.bytes).map((d) => d.bytes),
    );
    return JSON.parse(body.toString("utf8")).attributes.value === -1;
  } catch {
    return false;
  }
}

function watchSuggestLess(contents) {
  contents.session.webRequest.onBeforeRequest(
    { urls: ["https://*.apple.com/v1/me/ratings/*"] },
    (details, callback) => {
      callback({}); // never hold up the request itself
      if (!settings.skipOnSuggestLess || !isSuggestLess(details)) return;
      const match = RATING_PATH.exec(new URL(details.url).pathname);
      if (!match) return;
      contents
        .executeJavaScript(buildSkipScript(decodeURIComponent(match[1])))
        .catch((err) =>
          console.error("yabloko: skip on suggest less failed", err),
        );
    },
  );
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // Starting yabloko again brings back the window of the running instance
  app.on("second-instance", showWindow);

  app.whenReady().then(async () => {
    await components.whenReady();

    app.userAgentFallback = app.userAgentFallback
      .replace(/\s*Electron\/\S+/, "")
      .replace(/\s*yabloko\/\S+/, "");

    settings = loadSettings();

    mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      show: !settings.startHidden,
      // Packaged Windows builds take the exe's icon; this covers `npm start` and Linux
      icon: ICON_PATH,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: false,
        // Resuming playback on start has no click to satisfy Chromium's autoplay rule
        autoplayPolicy: "no-user-gesture-required",
        preload: path.join(__dirname, "..", "preload", "playback.js"),
      },
    });

    watchSuggestLess(mainWindow.webContents);

    // Resume once, on whichever page load completes first
    const lastPlayback = loadLastPlayback();
    let resumePending = Boolean(settings.resumePlayback && lastPlayback);

    // Every full page load starts a fresh page, so reinstall the song-change listener
    mainWindow.webContents.on("did-finish-load", () => {
      const contents = mainWindow.webContents;
      contents
        .executeJavaScript(buildWatchScript())
        .catch((err) => console.error("yabloko: playback watch failed", err));
      if (resumePending) {
        resumePending = false;
        // Not awaited: it waits for MusicKit and sign-in
        contents
          .executeJavaScript(buildRestoreScript(lastPlayback))
          .catch((err) =>
            console.error("yabloko: resume playback failed", err),
          );
      }
    });

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      shell.openExternal(url);
      return { action: "deny" };
    });

    mainWindow.webContents.on("will-navigate", (event, url) => {
      if (!ALLOWED_NAVIGATION_HOST.test(new URL(url).hostname)) {
        event.preventDefault();
        shell.openExternal(url);
      }
    });

    mainWindow.on("close", (event) => {
      if (isQuitting) return;
      event.preventDefault();
      if (settings.closeAction === "quit") app.quit();
      else mainWindow.hide();
    });

    // A page beforeunload handler silently cancels closing the window, and with it quitting
    mainWindow.webContents.on("will-prevent-unload", (event) => {
      if (isQuitting) event.preventDefault(); // preventDefault here = unload anyway
    });

    tray = new Tray(
      nativeImage.createFromPath(ICON_PATH).resize({ width: 32, height: 32 }),
    );
    tray.setToolTip("Yabloko");
    // Only ever brings the window up (from hidden or minimized), never hides it. Linux
    // AppIndicator trays never emit click; there the menu's "Show Yabloko" covers it.
    tray.on("click", showWindow);
    updateMenus();

    // Started before the page loads, so it doesn't depend on that load succeeding; until
    // MusicKit is up, actions answer "not ready"
    server = createServer({
      host: HOST,
      port: PORT,
      getWebContents: () => (mainWindow ? mainWindow.webContents : null),
    });
    server.on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        console.error(`yabloko: port ${PORT} is already in use, quitting`);
        app.quit();
        return;
      }
      console.error("yabloko: control server error", err);
    });
    server.listen(PORT, HOST);

    try {
      await mainWindow.loadURL("https://music.apple.com");
    } catch (err) {
      // e.g. a redirect aborting the initial load; the page usually still loads after it
      console.error("yabloko: initial page load failed", err);
    }
  });

  app.on("before-quit", () => {
    isQuitting = true;
    if (server) server.close();
  });
}
