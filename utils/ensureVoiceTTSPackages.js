const { execFileSync } = require('child_process');

const REQUIRED_PACKAGES = [
  { name: '@discordjs/voice', spec: '@discordjs/voice@0.18.0' },
  { name: 'google-tts-api', spec: 'google-tts-api@2.0.2' },
  { name: 'libsodium-wrappers', spec: 'libsodium-wrappers@0.7.15' }
];

function hasPackage(packageName) {
  try {
    require.resolve(packageName);
    return true;
  } catch {
    return false;
  }
}

function ensureVoiceTTSPackages() {
  const missing = REQUIRED_PACKAGES.filter(packageInfo => !hasPackage(packageInfo.name));
  if (missing.length === 0) return;

  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  console.log(`[VoiceTTS] Installing missing package(s): ${missing.map(packageInfo => packageInfo.name).join(', ')}`);

  try {
    execFileSync(npmCommand, ['install', '--no-audit', '--no-fund', '--omit=dev', ...missing.map(packageInfo => packageInfo.spec)], {
      cwd: process.cwd(),
      stdio: 'inherit'
    });
  } catch (err) {
    console.log(`[VoiceTTS] Package install failed: ${err.message}`);
  }
}

module.exports = { ensureVoiceTTSPackages };
