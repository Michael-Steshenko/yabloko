const { ipcMain } = require("electron");
const { runAction } = require("./actions");
const { buildControlScript } = require("../renderer/playback-state");

// What's playing, for the mini player, the taskbar and the tray tooltip: the song as
// reported by the page, plus its favorite / suggest-less status. The status is read
// from Apple once per song, then follows the rating requests Apple accepts (see
// rating-requests.js). null while nothing is playing.
const isString = (v) =>
  typeof v === "string" && v.length > 0 && v.length < 1000;
const ARTWORK_HOST = /(^|\.)(mzstatic|apple)\.com$/;

function cleanArtworkUrl(value) {
  if (!isString(value)) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && ARTWORK_HOST.test(url.hostname)
      ? url.href
      : null;
  } catch {
    return null;
  }
}

// The page reports every id the song goes by (library and catalog), since a rating
// request can name either
const cleanIds = (ids) =>
  Array.isArray(ids) ? ids.filter(isString).slice(0, 5) : [];

function createNowPlaying({ getContents }) {
  let state = null;
  // Bumped to discard a read still in flight: for an earlier song, or from before a
  // rating change it would undo
  let ratingRequest = 0;
  const listeners = [];

  const set = (next) => {
    state = next;
    for (const listener of listeners) listener(state);
  };

  async function refreshRating() {
    if (!state) return;
    const request = ++ratingRequest;
    const result = await runAction(getContents(), "health");
    if (request !== ratingRequest || !state || !result.ok || !result.state)
      return;
    set({
      ...state,
      favorited: result.state.favorited,
      suggestLess: result.state.suggestLess,
    });
  }

  // Between two songs the page briefly reports nothing playing. Only take that as
  // stopped if it lasts, so "nothing playing" doesn't flash at every song change.
  let clearTimer = null;

  ipcMain.on("now-playing", (event, info) => {
    if (event.sender !== getContents()) return;
    clearTimeout(clearTimer);
    // It comes from the web page, so only keep well-formed values
    if (!info || !isString(info.id) || !isString(info.title)) {
      clearTimer = setTimeout(() => {
        ratingRequest++;
        set(null);
      }, 1500);
      return;
    }
    const sameSong = state && state.id === info.id;
    set({
      id: info.id,
      ids: [info.id, ...cleanIds(info.ids)],
      title: info.title,
      artist: isString(info.artist) ? info.artist : "",
      artworkUrl: cleanArtworkUrl(info.artworkUrl),
      playing: info.playing === true,
      favorited: sameSong ? state.favorited : false,
      suggestLess: sameSong ? state.suggestLess : false,
    });
    if (!sameSong) refreshRating();
  });

  // A rating request Apple accepted. Requests for other songs (e.g. an album row) are
  // ignored.
  function applyRatingChange(change) {
    if (!state || !change.ids.some((id) => state.ids.includes(id))) return;
    ratingRequest++;
    set({
      ...state,
      favorited: change.favorited,
      suggestLess: change.suggestLess,
    });
  }

  // Fallback for a rating request that wasn't recognized: read the rating back. Apple
  // can take a moment to return the new value, so read it a bit later.
  function refreshRatingSoon() {
    setTimeout(refreshRating, 1000);
  }

  // Commands from the mini player and the taskbar buttons. Rating actions only send
  // the request; the status follows once Apple accepts it (applyRatingChange).
  async function command(name) {
    const contents = getContents();
    if (!contents || !state) return;
    if (name === "previous" || name === "next" || name === "play-pause") {
      await contents.executeJavaScript(buildControlScript(name));
    } else if (name === "favorite") {
      await runAction(contents, state.favorited ? "undo-favorite" : "favorite");
    } else if (name === "suggest-less") {
      await runAction(contents, "suggest-less");
    }
  }

  return {
    get: () => state,
    onChange: (listener) => listeners.push(listener),
    applyRatingChange,
    refreshRatingSoon,
    command,
  };
}

module.exports = { createNowPlaying };
