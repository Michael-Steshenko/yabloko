# yabloko

Apple Music desktop wrapper (Electron, wrapping `music.apple.com`) with a loopback HTTP
control server for hotkey-driven favorite / suggest-less actions that never steal focus
from whatever app you're using.

Targets: **Linux** natively, **Windows** via WSL2 + WSLg. No VMP signing anywhere — see
"Platform notes" below.

## Running

```
npm install
npm start
```

Sign in inside the app window once; the session persists across restarts. Closing the
window hides it (the control server keeps running); quit fully from the app menu / Cmd+Q
equivalent.

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
```

Responses are JSON. `/health` reports MusicKit availability, the current now-playing
track, the resolved rating target, and current favorite/suggest-less state. Unknown path
→ `404`; nothing playing → `409`; MusicKit not ready → `503`; a request rejected by the
hardening checks below → `403`.

Note: `favorite` and `suggest-less` are mutually exclusive server-side (Apple stores both
as one `personalRating` field) — calling `suggest-less` on a favorited track un-favorites
it, and there is deliberately no `undo-suggest-less` endpoint (see the source comments in
`musickit-actions.js`/plan history for why).

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

CastLabs' Electron build (bundles the Widevine CDM) is required on every platform; only
**VMP signing** is being dropped, which is Linux-only-safe because the Linux Widevine CDM
doesn't support or require VMP. That's why Linux (native, or via WSL2 + WSLg on Windows)
is the supported target and macOS/native-Windows are not.

Verified: Apple issues streaming licenses to an unverified Linux software CDM (confirmed
in Chromium on Linux, no VMP, `PLATFORM_UNVERIFIED`). Persistent/offline licenses are
unavailable on Linux; streaming is unaffected.

### WSL2 + WSLg (the Windows path)

Requires WSL2 with WSLg (WSL1 cannot run GUI apps). `npm install` must be run separately
inside WSL — CastLabs Electron downloads platform-specific binaries, so `node_modules`
isn't portable across host/WSL.

If a bare WSL distro fails to launch Electron at all, install the required base display and audio libraries:
- **Arch Linux:** `sudo pacman -S gtk3 mesa nss pulseaudio-alsa`
- **Ubuntu / Debian:** `sudo apt install libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libgbm1 libasound2 libgtk-3-0 libxshmfence1`

If the sandbox refuses to start, that's a restricted user-namespace
setting; `--no-sandbox` is a diagnostic, not a fix. `--disable-gpu` narrows down GPU
rendering issues.

Loopback reachability from Windows into the WSL2 VM is untested — try `curl` against the
default `127.0.0.1` bind from Windows first; if it doesn't reach the server, either set
`YABLOKO_HOST=0.0.0.0` (safe-ish under default NAT networking, but re-check exposure) or
switch to `networkingMode=mirrored` in `.wslconfig` (Windows 11 22H2+), which keeps
`localhost` meaningful in both directions.

## TODO

- [ ] **Test native Windows with the dev VMP signature.** CastLabs ships its
      Electron builds already VMP-signed, but with a _development_ certificate —
      valid for "Widevine UAT or other servers accepting development clients".
      Apple Music is a production license server, so it will probably reject it,
      but this has never been tried.

      Cost to test: zero. On Windows, `npm install && npm start`, sign in, press
      play. Audio plays → native Windows works with no signing, no account, no
      packaging, and WSL becomes unnecessary. Playback fails (expect it at
      license acquisition, so the UI loads but audio doesn't start) → stay on
      WSLg.

      Not a dependency of anything; purely an upside check. Note that even if it
      works it is "works until Apple tightens dev-client acceptance", so don't
      build on it without a fallback.

      Deliberately **not** pursuing EVS production signing: it is free, but it
      needs monthly `castlabs_evs.account reauth` and it only signs *packaged*
      apps, which would pull packaging into scope.

- [ ] Suggest less should also skip the track
- [ ] For the refresh star hack (using navigation to force a repaint), check if we can use await instead of the 0ms delay we do.
- [ ] check if we can preserve the scroll location when doing the refresh star hack
