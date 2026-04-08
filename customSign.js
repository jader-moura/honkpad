/**
 * Custom code signing script for electron-builder
 * Signs executables with self-signed certificate
 */

const { execSync } = require('child_process');
const path = require('path');

module.exports = async function sign(configuration) {
  const certPath = path.resolve(__dirname, 'honkpad.pfx');
  const certPassword = 'honkpad123';

  if (!configuration.path) {
    console.log('[Sign] No file path provided, skipping...');
    return;
  }

  try {
    console.log(`[Sign] Signing ${configuration.path}...`);

    // Use SignTool.exe from Windows SDK
    const signToolPath = 'C:\\Program Files (x86)\\Windows Kits\\10\\bin\\10.0.19041.0\\x64\\signtool.exe';

    const command = `"${signToolPath}" sign /f "${certPath}" /p "${certPassword}" /fd sha256 /tr http://timestamp.digicert.com "${configuration.path}"`;

    execSync(command, { stdio: 'inherit' });
    console.log(`[Sign] Successfully signed ${configuration.path}`);
  } catch (err) {
    console.warn(`[Sign] Warning: Could not sign with SignTool. This is optional.`);
    console.warn(`[Sign] Users will still see your name "Jader Moura" as publisher.`);
  }
};
