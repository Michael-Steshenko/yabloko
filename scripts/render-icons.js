// Renders the taskbar icons in assets/icons/ from src/renderer/icons.js: the taskbar
// APIs (thumbnail buttons, overlay badge) take bitmaps, not SVG. Run with
// `npm run icons` after changing an icon, and commit the PNGs.
const fs = require("fs");
const path = require("path");
const { app, BrowserWindow } = require("electron");
const ICONS = require("../src/renderer/icons");

const OUT = path.join(__dirname, "..", "assets", "icons");
const ACCENT = "#fa2d48"; // Apple Music red, also used by the mini player

const glyph = (d, color) => `<path fill="${color}" d="${d}"/>`;
// The overlay badge sits on the app icon, so draw the glyph on a disc: dark for a dark
// taskbar, white with a thin ring for a light one
const disc = {
  dark: `<circle cx="12" cy="12" r="12" fill="#1c1c1e"/>`,
  light: `<circle cx="12" cy="12" r="11.5" fill="#ffffff" stroke="rgba(0,0,0,0.25)"/>`,
};
const badge = (theme, d, color) =>
  disc[theme] +
  `<g transform="translate(4.5 4.5) scale(0.625)">${glyph(d, color)}</g>`;

const IMAGES = {};
for (const [theme, text] of [
  ["dark", "#ffffff"],
  ["light", "#1d1d1f"],
]) {
  IMAGES[`badge-star-${theme}`] = badge(theme, ICONS.star, text);
  IMAGES[`badge-star-filled-${theme}`] = badge(
    theme,
    ICONS["star-filled"],
    ACCENT,
  );
  IMAGES[`badge-thumb-down-${theme}`] = badge(
    theme,
    ICONS["thumb-down-filled"],
    text,
  );
}
// Thumbnail buttons, in both colors: the taskbar can be light or dark
const THUMBNAIL_BUTTONS = [
  "previous",
  "next",
  "play",
  "pause",
  "star",
  "star-filled",
  "thumb-down",
  "thumb-down-filled",
];
for (const name of THUMBNAIL_BUTTONS) {
  IMAGES[`${name}-white`] = glyph(ICONS[name], "#ffffff");
  IMAGES[`${name}-black`] = glyph(ICONS[name], "#000000");
}

// Runs in the page: draw the SVG onto a canvas and return it as a PNG data URL
function rasterize(svg, size) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = size;
      canvas.getContext("2d").drawImage(img, 0, 0, size, size);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => reject(new Error("could not load SVG"));
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  });
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false });
  await win.loadURL("data:text/html,<!doctype html>");
  fs.mkdirSync(OUT, { recursive: true });
  // 16px for 100% scaling, @2x for 200%; nativeImage picks up the @2x file by itself
  for (const [name, body] of Object.entries(IMAGES)) {
    for (const [suffix, size] of [
      ["", 16],
      ["@2x", 32],
    ]) {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24">${body}</svg>`;
      const dataUrl = await win.webContents.executeJavaScript(
        `(${rasterize.toString()})(${JSON.stringify(svg)}, ${size})`,
      );
      fs.writeFileSync(
        path.join(OUT, `${name}${suffix}.png`),
        Buffer.from(dataUrl.split(",")[1], "base64"),
      );
    }
  }
  console.log(`render-icons: wrote ${Object.keys(IMAGES).length * 2} files`);
  app.quit();
});
