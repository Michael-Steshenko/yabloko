const { app } = require('electron');

const ACTIONS_MODULE = require.resolve('../renderer/musickit-actions');

// Unpackaged, re-read the action script on every request so edits to it apply
// without restarting the app (and interrupting playback).
function loadActionScript() {
  if (!app.isPackaged) delete require.cache[ACTIONS_MODULE];
  return require(ACTIONS_MODULE).buildActionScript;
}

async function runAction(webContents, action) {
  if (!webContents) {
    return { ok: false, code: 'no-window' };
  }
  try {
    const buildActionScript = loadActionScript();
    return await webContents.executeJavaScript(buildActionScript(action));
  } catch (err) {
    return { ok: false, code: 'exception', message: String((err && err.message) || err) };
  }
}

module.exports = { runAction };
