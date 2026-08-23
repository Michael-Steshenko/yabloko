const { buildActionScript } = require('../renderer/musickit-actions');

async function runAction(webContents, action) {
  if (!webContents) {
    return { ok: false, code: 'no-window' };
  }
  try {
    return await webContents.executeJavaScript(buildActionScript(action));
  } catch (err) {
    return { ok: false, code: 'exception', message: String((err && err.message) || err) };
  }
}

module.exports = { runAction };
