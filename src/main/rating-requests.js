// Watches the requests that change a song's rating: favorite / unfavorite, and ratings
// (-1 is suggest less). Every change goes through one of these, whether it comes from
// the page's own buttons, the mini player, the taskbar or a hotkey, so they're the one
// source of truth for rating changes.
//
// onSent(change) runs as a recognized request goes out (the skip on suggest less uses
// it), onDone(change) once Apple has accepted it. A request that changes something at
// these addresses but isn't recognized goes to onUnrecognized: Apple may have changed
// its API, so the caller falls back to reading the rating back.
// change: { ids: [song ids], favorited, suggestLess }
const URLS = [
  "https://*.apple.com/v1/me/ratings/*",
  "https://*.apple.com/v1/me/favorites*",
];
const RATING_PATH = /^\/v1\/me\/ratings\/[a-z-]+\/([^/]+)$/;
const FAVORITES_PATH = /^\/v1\/me\/favorites\/?$/;
const CHANGES = new Set(["PUT", "POST", "DELETE"]); // anything else only reads

function readJsonBody(details) {
  try {
    const bytes = (details.uploadData || [])
      .filter((d) => d.bytes)
      .map((d) => d.bytes);
    return JSON.parse(Buffer.concat(bytes).toString("utf8"));
  } catch {
    return null;
  }
}

// What the request does to the rating, or null if it isn't one we know
function parse(details) {
  const url = new URL(details.url);

  const rating = RATING_PATH.exec(url.pathname);
  if (rating) {
    const ids = [decodeURIComponent(rating[1])];
    if (details.method === "DELETE")
      return { ids, favorited: false, suggestLess: false };
    if (details.method === "PUT") {
      const body = readJsonBody(details);
      const value = body && body.attributes && body.attributes.value;
      if (value === -1) return { ids, favorited: false, suggestLess: true };
      if (value === 1) return { ids, favorited: true, suggestLess: false };
    }
    return null;
  }

  // ids come as ids[songs]=1,2 (or another type)
  if (FAVORITES_PATH.test(url.pathname)) {
    const ids = [];
    for (const [key, value] of url.searchParams) {
      if (/^ids\[[a-z-]+\]$/.test(key)) ids.push(...value.split(","));
    }
    if (
      ids.length &&
      (details.method === "POST" || details.method === "DELETE")
    )
      return { ids, favorited: details.method === "POST", suggestLess: false };
  }
  return null;
}

function watchRatingRequests(session, { onSent, onDone, onUnrecognized }) {
  const pending = new Map(); // request id -> change, or null if unrecognized

  session.webRequest.onBeforeRequest({ urls: URLS }, (details, callback) => {
    callback({}); // never hold up the request itself
    if (!CHANGES.has(details.method)) return;
    const change = parse(details);
    pending.set(details.id, change);
    if (change) onSent(change);
  });

  session.webRequest.onCompleted({ urls: URLS }, (details) => {
    if (!pending.has(details.id)) return;
    const change = pending.get(details.id);
    pending.delete(details.id);
    // Refused (e.g. unfavoriting a song that isn't a favorite): nothing changed
    if (details.statusCode < 200 || details.statusCode >= 300) return;
    if (change) onDone(change);
    else onUnrecognized(details);
  });

  session.webRequest.onErrorOccurred({ urls: URLS }, (details) =>
    pending.delete(details.id),
  );
}

module.exports = { watchRatingRequests };
