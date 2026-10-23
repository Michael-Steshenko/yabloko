const path = require("path");
const { nativeImage, nativeTheme } = require("electron");

// Windows taskbar: buttons in the window's hover preview (☆ ⏮ ⏯ ⏭ 👎) and a badge on
// its taskbar button showing the song's status. The icons are PNGs rendered by
// scripts/render-icons.js; nativeImage picks the @2x file on high-DPI screens.
const ICONS_DIR = path.join(__dirname, "..", "..", "assets", "icons");
const image = (name) =>
  nativeImage.createFromPath(path.join(ICONS_DIR, `${name}.png`));

function updateTaskbar(win, state, onCommand) {
  if (process.platform !== "win32" || !win) return;
  // A hidden window has no taskbar button. The first setThumbarButtons call adds the
  // buttons and later ones only update them, so a first call while hidden (start hidden
  // in tray) would leave them missing for good. Showing the window calls this again.
  if (!win.isVisible()) return;

  // The preview and the badge follow the taskbar's theme, which can differ from the
  // apps' theme
  const dark =
    nativeTheme.shouldUseDarkColorsForSystemIntegratedUI ??
    nativeTheme.shouldUseDarkColors;
  const glyph = (name) => image(`${name}-${dark ? "white" : "black"}`);
  const badge = (name) => image(`badge-${name}-${dark ? "dark" : "light"}`);
  const flags = state ? [] : ["disabled"];
  const button = (tooltip, icon, command) => ({
    tooltip,
    icon: glyph(icon),
    flags,
    click: () => onCommand(command),
  });
  const favorited = Boolean(state && state.favorited);
  const suggestLess = Boolean(state && state.suggestLess);
  const playing = Boolean(state && state.playing);

  win.setThumbarButtons([
    button(
      favorited ? "Remove from favorites" : "Favorite",
      favorited ? "star-filled" : "star",
      "favorite",
    ),
    button("Previous", "previous", "previous"),
    button(
      playing ? "Pause" : "Play",
      playing ? "pause" : "play",
      "play-pause",
    ),
    button("Next", "next", "next"),
    button(
      "Suggest less",
      suggestLess ? "thumb-down-filled" : "thumb-down",
      "suggest-less",
    ),
  ]);

  if (!state) win.setOverlayIcon(null, "");
  else if (favorited) win.setOverlayIcon(badge("star-filled"), "Favorite");
  else if (suggestLess)
    win.setOverlayIcon(badge("thumb-down"), "Suggested less");
  else win.setOverlayIcon(badge("star"), "Not favorited");
}

module.exports = { updateTaskbar };
