# yabloko

Apple Music desktop wrapper (Electron, wrapping `music.apple.com`) with a loopback HTTP
control server for hotkey-driven favorite / suggest-less actions that never steal focus
from whatever app you're using.

Targets: **Linux** natively, **Windows** natively (castlabs EVS VMP-signed), or Windows via
WSL2 + WSLg. See "Platform notes" below.

## Running

```
npm install
npm start
```

On native Windows, VMP-sign the dev Electron once before `npm start` (see "Native
Windows" below): `npm run sign:dev`.

`npm install` doesn't download the Electron binaries: the castlabs `electron` package has
no install script and fetches them into `node_modules/electron/dist` on first run instead.
`npm run sign:dev` and `npm run dist` read that folder directly, so they run
`install-electron` first (a no-op once the binaries are there).

Sign in inside the app window once; the session persists across restarts.

yabloko puts an icon in the system tray. Clicking it brings the window up (from hidden
or minimized); right-clicking it opens a menu (the same items are in the window's `Yabloko` menu):

- **Show Yabloko**
- **When closing the window:** _Keep playing in tray_ (default: the X hides the window and
  music and the control server keep running) or _Quit Yabloko_
- **Start hidden in tray:** off by default. Turn it on to run yabloko headless, controlled
  only through the control server (sign in with the window shown first)
- **Resume last playback on start:** off by default. While on, yabloko remembers the
  station, playlist or album that's playing (in `last-playback.json`, updated on every song
  change, so it also survives a crash) and, on the next start, plays it again
  once you're signed in: playlists and albums from the start of the song you were on,
  stations from wherever the station is
- **Skip song on suggest less:** on by default. Suggesting less of the song that's
  playing, from the page's own menu or the `suggest-less` endpoint, also skips to the next song.
  Suggesting less of a song that isn't playing (e.g. a row in an album) doesn't skip anything
- **Reset settings to defaults…:** asks for confirmation, then restores the defaults above
- **Quit Yabloko**

These settings are saved in `settings.json` in yabloko's user-data folder. Starting
yabloko again while it's running also brings back its window.

When run unpackaged, `src/renderer/musickit-actions.js` is re-read on every action, so
edits to it apply on the next request without a restart. Changes under `src/main/` still
need one.

## Control server

Binds to loopback by default. Configurable via env vars:

- `YABLOKO_PORT` — default `8787`
- `YABLOKO_HOST` — default `127.0.0.1`. Only override this if you need the server
  reachable from outside loopback (e.g. from Windows against a WSL2 VM in NAT mode) — see
  the WSL section below. Doing so drops the loopback-address check, leaving the
  Origin / Sec-Fetch-Site / Host checks as the only protection.

All endpoints accept `GET` or `POST`, so a bare `curl` needs no flags:

```
curl http://127.0.0.1:8787/favorite
curl http://127.0.0.1:8787/undo-favorite
curl http://127.0.0.1:8787/suggest-less
curl http://127.0.0.1:8787/health
curl http://127.0.0.1:8787/quit
```

`/quit` quits the app completely, whatever the window's X is set to do (it doesn't
just hide it in the tray). It works even before MusicKit has loaded.

Responses are JSON. `/health` reports MusicKit availability, the current now-playing
track, the resolved rating target, and current favorite/suggest-less state. Unknown path
→ `404`; nothing playing → `409`; MusicKit not ready → `503`; a request rejected by the
hardening checks below → `403`.

Note: `favorite` and `suggest-less` are mutually exclusive server-side (Apple stores both
as one `personalRating` field) — calling `suggest-less` on a favorited track un-favorites
it, and there is deliberately no `undo-suggest-less` endpoint (see the source comments in
`musickit-actions.js`/plan history for why).

`suggest-less` also skips to the next track while _Skip song on suggest less_ is on (see
above).

### Hardening

Every request must pass all of these, or it gets a `403`:

- `remoteAddress` must be loopback, unless `YABLOKO_HOST` was overridden.
- No `Origin` header may be present.
- `Sec-Fetch-Site`, if present, must be `none`.
- `Host` must match the configured host/port (or a loopback alias) — blocks DNS rebinding.

## Hotkeys

Out of scope for this app on purpose: bind a global hotkey in whatever your platform's
native hotkey tool is (AutoHotkey/PowerToys on Windows, your desktop environment's
keybindings on Linux) to hit the relevant endpoint with `curl`. This keeps the app
identical across platforms and avoids Electron's `globalShortcut`, which — under WSLg in
particular — cannot see keypresses made while a Windows app has focus.

## Platform notes

CastLabs' Electron build (bundles the Widevine CDM) is required on every platform. Whether
it also needs **VMP signing** depends on the platform:

- **Linux:** no. The Linux Widevine CDM doesn't support or require VMP. Verified: Apple
  issues streaming licenses to an unverified Linux software CDM (confirmed in Chromium on
  Linux, no VMP, `PLATFORM_UNVERIFIED`). Persistent/offline licenses are unavailable on
  Linux; streaming is unaffected.
- **Windows:** yes, with a _production_ signature from castlabs EVS. See below.

### Native Windows (the Windows path)

CastLabs' Electron builds ship VMP-signed with a _development_ certificate, which Apple
Music's production license server rejects: sign-in works but playback fails,
Re-signing with a production certificate from castlabs' free EVS service fixes it.
Verified: playback works both for the EVS-signed dev Electron and for the packaged `Yabloko.exe`.

One-time setup (needs Python):

```
python -m pip install --upgrade castlabs-evs
python -m castlabs_evs.account signup
```

The EVS login token expires about monthly. Signing then asks for credentials again (or run
`python -m castlabs_evs.account reauth`). Already-signed builds keep their signature
(EVS reports it valid for ~3.7 years), so this only affects signing new builds.

Dev workflow:

```
npm run sign:dev   # signs node_modules/electron/dist; redo after reinstalling electron
npm start
```

`sign:dev` is deliberately explicit rather than a `postinstall`, because it can prompt for
credentials. On non-Windows platforms it's a no-op, so the same `package.json` works under
WSL.

Release workflow:

```
npm run dist
```

On Windows this produces the unpacked app in `dist/win-unpacked/` (run `Yabloko.exe` from
there). Quit a running packaged `Yabloko.exe` first, or the build fails with `EPERM`
replacing its files. It packages the castlabs binaries from
`node_modules/electron/dist`, not stock Electron. Each build VMP-signs `Yabloko.exe` in an
`afterSign` hook (`scripts/after-sign.js`), independent of `sign:dev`. That hook has to be
`afterSign`, not `afterPack`: electron-builder's sign step edits the exe's resources even
without an Authenticode certificate, which invalidates an earlier VMP signature. If
Authenticode signing is ever added, VMP signing still has to come after it. Check a build
with `python -m castlabs_evs.vmp verify-pkg dist/win-unpacked`.

The dev app and the packaged app share a user-data directory and the single-instance
lock: with one running, launching the other just focuses the first.

### Linux release builds

`npm run dist` builds for the OS it runs on, so on Linux (or inside WSL) it produces
`dist/Yabloko-<version>.AppImage` and `dist/Yabloko-<version>.tar.gz` from the Linux
castlabs binaries. No VMP signing is involved; the signing hook only runs for Windows
builds. Windows and Linux packages each have to be built on their own OS, because
`node_modules/electron/dist` only holds the binaries for the OS that ran `npm install`.

Running the AppImage needs FUSE (`fuse2` on Arch, `libfuse2` on Ubuntu/Debian). Without
it, use the tar.gz.

Stock GNOME doesn't show tray icons without the AppIndicator extension (Ubuntu ships it).
Without a tray, a hidden window is brought back by starting yabloko again (e.g.
double-clicking the AppImage); its `Yabloko` menu can then switch _When closing the window_
to _Quit Yabloko_. On Linux, clicking the tray icon may open the menu instead of showing
the window.

### WSL2 + WSLg (alternative Windows path)

Works without any VMP signing (it runs the Linux build), but **WSLg can't resize windows
from the Windows side**: FancyZones, AHK `WinMove` and dragging the outer frame edge move
the window but don't resize it, then leave it frozen (microsoft/wslg#22,
microsoft/wslg#1267; affects every WSLg app, not just yabloko). If you use FancyZones,
exclude `msrdc.exe` from it.

Requires WSL2 with WSLg (WSL1 cannot run GUI apps). `npm install` must be run separately
inside WSL — CastLabs Electron downloads platform-specific binaries, so `node_modules`
isn't portable across host/WSL.

If a bare WSL distro fails to launch Electron at all, install the required base display and audio libraries:

- **Arch Linux:** `sudo pacman -S gtk3 mesa nss pulseaudio-alsa`
- **Ubuntu / Debian:** `sudo apt install libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libgbm1 libasound2 libgtk-3-0 libxshmfence1`

If the sandbox refuses to start, that's a restricted user-namespace
setting; `--no-sandbox` is a diagnostic, not a fix. `--disable-gpu` narrows down GPU
rendering issues.

Verified: with the default `127.0.0.1` bind and no extra config, Windows-side scripts
reach the control server inside the WSL2 VM via WSL2's localhost forwarding. If it doesn't
reach the server on your setup (e.g. `localhostForwarding=false`), either set
`YABLOKO_HOST=0.0.0.0` (safe-ish under default NAT networking, but re-check exposure) or
switch to `networkingMode=mirrored` in `.wslconfig` (Windows 11 22H2+), which keeps
`localhost` meaningful in both directions.

## TODO

- [ ] For the refresh star hack (using navigation to force a repaint), check if we can use await instead of the 0ms delay we do.
- [ ] check if we can preserve the scroll location when doing the refresh star hack
