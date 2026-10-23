// The page can't message the app on its own (sandboxed, contextIsolation). This exposes
// functions to it, used by the listener from playback-state.js to report song changes
// (for resume) and what's playing (for the mini player). The main process validates
// what it receives before using it.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("yablokoPlayback", {
  changed: (state) => ipcRenderer.send("playback-changed", state),
  nowPlaying: (info) => ipcRenderer.send("now-playing", info),
});
