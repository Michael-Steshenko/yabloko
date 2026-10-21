// electron-builder afterSign hook. VMP signing must run after electron-builder's sign
// step: even with no Authenticode certificate, that step edits the exe's resources
// (rcedit: icon/version info), which invalidates a VMP signature made in afterPack.
import evsSign from "./evs-sign.js";

const _default = async function afterSign(context) {
  // win32 here stands for windows not a 32bit binary, holdover form the Win32 API
  if (context.electronPlatformName !== "win32") return;
  evsSign(context.appOutDir);
};
export { _default as default };
