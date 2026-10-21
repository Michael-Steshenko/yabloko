// VMP-signs an Electron package directory with castlabs EVS. Windows only: the Linux
// Widevine CDM has no VMP, and the same package.json is used under WSL.
const { spawnSync } = require("child_process");
const path = require("path");

function evsSign(dir) {
  if (process.platform !== "win32") {
    console.log(`evs-sign: skipping VMP signing on ${process.platform}`);
    return;
  }
  const target = path.resolve(dir);
  console.log(`evs-sign: signing ${target}`);
  const result = spawnSync(
    "python",
    ["-m", "castlabs_evs.vmp", "sign-pkg", target],
    { stdio: "inherit" },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`castlabs_evs.vmp sign-pkg exited with ${result.status}`);
  }
}

module.exports = evsSign;

if (require.main === module) {
  const dir = process.argv[2];
  if (!dir) {
    console.error("usage: node scripts/evs-sign.js <dir>");
    process.exit(1);
  }
  try {
    evsSign(dir);
  } catch (err) {
    console.error(`evs-sign: ${err.message}`);
    process.exit(1);
  }
}
