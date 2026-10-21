const fs = require("fs");
const path = require("path");
const { app } = require("electron");

// closeAction: what the window's X does: "tray" (hide, keep playing) or "quit"
// resumePlayback: on start, play the station/playlist/album that was playing last
const DEFAULTS = {
  closeAction: "tray",
  startHidden: false,
  resumePlayback: false,
};

const file = (name) => path.join(app.getPath("userData"), name);

function readJson(name) {
  try {
    return JSON.parse(fs.readFileSync(file(name), "utf8"));
  } catch {
    return null; // missing or unreadable
  }
}

function writeJson(name, data) {
  try {
    fs.writeFileSync(file(name), JSON.stringify(data, null, 2) + "\n");
  } catch (err) {
    console.error(`yabloko: could not save ${name}`, err);
  }
}

const loadSettings = () => ({ ...DEFAULTS, ...readJson("settings.json") });
const saveSettings = (settings) => writeJson("settings.json", settings);

// Kept apart from settings.json so resetting the settings doesn't forget it
const loadLastPlayback = () => readJson("last-playback.json");
const saveLastPlayback = (state) => writeJson("last-playback.json", state);

module.exports = {
  DEFAULTS,
  loadSettings,
  saveSettings,
  loadLastPlayback,
  saveLastPlayback,
};
