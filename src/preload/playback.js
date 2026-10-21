// The page can't message the app on its own (sandboxed, contextIsolation). This exposes a
// single function to it, used by the listener from playback-state.js to report song
// changes. The main process validates what it receives before saving anything.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("yablokoPlayback", {
  changed: (state) => ipcRenderer.send("playback-changed", state),
});
