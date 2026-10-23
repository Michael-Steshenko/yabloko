// Run via webContents.executeJavaScript, like musickit-actions.js: MusicKit lives in the
// page's main world. Written as plain functions and serialized with toString(), so they
// must not reference anything outside their own body.

// Installed after every page load: waits for MusicKit, then reports each song change
// (the song plus the station/playlist/album it came from) through the preload bridge.
// Pausing doesn't change the song, so it never overwrites what was last playing.
// Separately reports what's playing and whether it's paused, for the mini player.
async function watch() {
  if (window.__yablokoWatching || !window.yablokoPlayback) return;
  window.__yablokoWatching = true;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  let music;
  while (
    !(music =
      window.MusicKit &&
      window.MusicKit.getInstance &&
      window.MusicKit.getInstance())
  ) {
    await sleep(1000);
  }
  music.addEventListener("nowPlayingItemDidChange", () => {
    const item = music.nowPlayingItem;
    const container = item && item.container;
    if (!container || !container.id || !container.type) return;
    window.yablokoPlayback.changed({
      containerType: container.type,
      containerId: container.id,
      containerName:
        (container.attributes && container.attributes.name) || null,
      songId: String(item.id),
      songName: item.title,
    });
  });

  const artworkUrl = (item) => {
    const art = item.artwork || (item.attributes && item.attributes.artwork);
    if (!art || !art.url) return null;
    try {
      return window.MusicKit.formatArtworkURL(art, 96, 96);
    } catch (e) {
      return art.url.replace("{w}", "96").replace("{h}", "96");
    }
  };
  const reportNowPlaying = () => {
    const item = music.nowPlayingItem;
    const pp = (item && item.playParams) || {};
    window.yablokoPlayback.nowPlaying(
      item
        ? {
            id: String(item.id),
            // Rating requests use the catalog id or, for library-only songs, the
            // library id
            ids: [pp.id, pp.catalogId].filter(Boolean).map(String),
            title: item.title,
            artist: item.artistName,
            artworkUrl: artworkUrl(item),
            // Follows the page's own play button, which also shows play for a moment
            // at a song change
            playing: music.isPlaying,
          }
        : null,
    );
  };
  music.addEventListener("nowPlayingItemDidChange", reportNowPlaying);
  music.addEventListener("playbackStateDidChange", reportNowPlaying);
  reportNowPlaying();
}

// Player buttons from the mini player and the taskbar
function control(command) {
  const music =
    window.MusicKit &&
    window.MusicKit.getInstance &&
    window.MusicKit.getInstance();
  if (!music || !music.nowPlayingItem) return { ok: false };
  if (command === "previous") music.skipToPreviousItem();
  else if (command === "next") music.skipToNextItem();
  else if (command === "play-pause") {
    if (music.isPlaying) music.pause();
    else music.play();
  }
  return { ok: true };
}

// Queue the saved container, move to the saved song (from its start) and play.
async function restore(state) {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  let music;
  // MusicKit appears, then restores the sign-in, some time after the page loads. No time
  // limit: when signed out, this plays as soon as the user signs in.
  while (
    !(music =
      window.MusicKit &&
      window.MusicKit.getInstance &&
      window.MusicKit.getInstance()) ||
    !music.isAuthorized
  ) {
    await sleep(1000);
  }
  if (music.nowPlayingItem) return { ok: false, code: "already-playing" };

  // Catalog and library resource types map onto setQueue's option names
  const key = {
    stations: "station",
    playlists: "playlist",
    "library-playlists": "playlist",
    albums: "album",
    "library-albums": "album",
  }[state.containerType];
  if (!key)
    return {
      ok: false,
      code: "unsupported-container",
      type: state.containerType,
    };

  await music.setQueue({ [key]: state.containerId });
  if (key !== "station") {
    // Stations generate their songs, so only fixed lists can resume at the saved song
    const index = music.queue.items.findIndex(
      (i) => String(i.id) === state.songId,
    );
    if (index > 0) await music.changeToMediaAtIndex(index);
  }
  await music.play();
  return { ok: true, key, containerName: state.containerName };
}

// Skip to the next song, but only if one of the given ids (from a rating request) is the
// song playing now: Suggest Less can also be picked on other songs, e.g. an album row.
// Ratings use the catalog id or, for library-only songs, the library id.
function skipIfPlaying(requestIds) {
  const music =
    window.MusicKit &&
    window.MusicKit.getInstance &&
    window.MusicKit.getInstance();
  const item = music && music.nowPlayingItem;
  if (!item) return { skipped: false, code: "nothing-playing" };
  const pp = item.playParams || {};
  const ids = [item.id, pp.id, pp.catalogId].filter(Boolean).map(String);
  if (!requestIds.some((id) => ids.includes(id)))
    return { skipped: false, code: "not-playing" };
  music.skipToNextItem();
  return { skipped: true };
}

const buildWatchScript = () => `(${watch.toString()})()`;
const buildRestoreScript = (state) =>
  `(${restore.toString()})(${JSON.stringify(state)})`;
const buildSkipScript = (ids) =>
  `(${skipIfPlaying.toString()})(${JSON.stringify(ids)})`;
const buildControlScript = (command) =>
  `(${control.toString()})(${JSON.stringify(command)})`;

module.exports = {
  buildWatchScript,
  buildRestoreScript,
  buildSkipScript,
  buildControlScript,
};
