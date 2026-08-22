# yabloko

Apple Music desktop wrapper with a loopback HTTP control server.

Targets: **Linux** natively, **Windows** via WSL2 + WSLg.

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
