// Built as a source string and run via webContents.executeJavaScript — MusicKit
// lives in the page's main world, which a contextIsolation preload can't reach.
function buildActionScript(action) {
  return (
    '(async () => {\n' +
    '  const action = ' + JSON.stringify(action) + ';\n' +
    '  const music = window.MusicKit && window.MusicKit.getInstance && window.MusicKit.getInstance();\n' +
    '  if (!music) return { ok: false, code: "no-musickit" };\n' +
    '\n' +
    '  const item = music.nowPlayingItem;\n' +
    '  if (!item) return { ok: false, code: "nothing-playing" };\n' +
    '\n' +
    '  const pp = item.playParams || {};\n' +
    '  const isVideo = /video/i.test(item.type || "") || /video/i.test(pp.kind || "");\n' +
    '  let catalogId = pp.catalogId;\n' +
    '  if (!catalogId && typeof item.id === "string" && item.id.indexOf("i.") !== 0) catalogId = item.id;\n' +
    '  const type = catalogId\n' +
    '    ? (isVideo ? "music-videos" : "songs")\n' +
    '    : (isVideo ? "library-music-videos" : "library-songs");\n' +
    '  const id = String(catalogId || pp.id || item.id);\n' +
    '  const isLibrary = type.indexOf("library-") === 0;\n' +
    '\n' +
    '  const send = (path, opts) => music.api.client.createRequest(path, opts).send();\n' +
    '  const track = { name: item.title, artistName: item.artistName };\n' +
    '\n' +
    '  const readState = async () => {\n' +
    '    const params = { relate: "library", platform: "web", "omit[resource]": "autos" };\n' +
    '    params["ids[" + type + "]"] = id;\n' +
    '    params["fields[" + type + "]"] = isLibrary ? "personalRating" : "inLibrary,personalRating";\n' +
    '    const res = await send(isLibrary ? "/v1/me/library" : "/v1/catalog/{{storefrontId}}", { params });\n' +
    '    const body = await res.json();\n' +
    '    const attrs = (body.data && body.data[0] && body.data[0].attributes) || {};\n' +
    '    const pr = attrs.personalRating;\n' +
    '    return { favorited: pr === 1, suggestLess: pr === -1, inLibrary: attrs.inLibrary };\n' +
    '  };\n' +
    '\n' +
    '  if (action === "health") {\n' +
    '    let state = null;\n' +
    '    try { state = await readState(); } catch (e) { state = null; }\n' +
    '    return { ok: true, action: "health", target: { type, id }, track, state };\n' +
    '  }\n' +
    '\n' +
    '  const repaint = async () => {\n' +
    '    const params = {};\n' +
    '    params["ids[" + type + "]"] = id;\n' +
    '    const res = await send("/v1/catalog/{{storefrontId}}", { params });\n' +
    '    const body = await res.json();\n' +
    '    const url = new URL(body.data[0].attributes.url);\n' +
    '    const path = url.pathname + url.search;\n' +
    '\n' +
    '    const settled = () => new Promise((resolve) => {\n' +
    '      const handler = () => {\n' +
    '        window.removeEventListener("popstate", handler);\n' +
    '        setTimeout(resolve, 0);\n' +
    '      };\n' +
    '      window.addEventListener("popstate", handler);\n' +
    '    });\n' +
    '\n' +
    '    history.pushState({}, "", path);\n' +
    '    window.dispatchEvent(new PopStateEvent("popstate", { state: history.state }));\n' +
    '    const done = settled();\n' +
    '    history.back();\n' +
    '    await done;\n' +
    '  };\n' +
    '\n' +
    '  let res;\n' +
    '  if (action === "favorite" || action === "undo-favorite") {\n' +
    '    const params = {};\n' +
    '    params["ids[" + type + "]"] = id;\n' +
    '    res = await send("/v1/me/favorites", { params, method: action === "favorite" ? "POST" : "DELETE" });\n' +
    '  } else if (action === "suggest-less") {\n' +
    '    res = await send("/v1/me/ratings/" + type + "/" + id, {\n' +
    '      method: "PUT",\n' +
    '      headers: { "Content-Type": "application/json" },\n' +
    '      body: JSON.stringify({ type: "rating", attributes: { value: -1 } }),\n' +
    '    });\n' +
    '  } else {\n' +
    '    return { ok: false, code: "unknown-action" };\n' +
    '  }\n' +
    '\n' +
    '  const noop = action === "undo-favorite" && res.status === 404;\n' +
    '  if (!noop && !res.ok) {\n' +
    '    return { ok: false, code: "apple-request-failed", status: res.status, target: { type, id } };\n' +
    '  }\n' +
    '\n' +
    '  let repainted = false;\n' +
    '  if (action === "favorite" || action === "undo-favorite") {\n' +
    '    try {\n' +
    '      await repaint();\n' +
    '      repainted = true;\n' +
    '    } catch (e) {\n' +
    '      repainted = false;\n' +
    '    }\n' +
    '  }\n' +
    '\n' +
    '  return { ok: true, action, target: { type, id }, repainted, noop, track };\n' +
    '})();'
  );
}

module.exports = { buildActionScript };
