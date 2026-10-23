// Bridge for the mini player page: receives what's playing, sends button clicks and
// drags of the pill
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("miniPlayer", {
  onState: (callback) =>
    ipcRenderer.on("mini-player-state", (event, state) => callback(state)),
  command: (name) => ipcRenderer.send("mini-player-command", name),
  drag: (dx, dy) => ipcRenderer.send("mini-player-drag", dx, dy),
  dragEnd: () => ipcRenderer.send("mini-player-drag-end"),
});
