const { execFileSync } = require('node:child_process');
const { existsSync } = require('node:fs');
const path = require('node:path');

exports.default = async function stampPackagedIcon(context) {
  if (context.electronPlatformName !== 'win32') return;

  const root = context.packager.projectDir;
  const executable = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`);
  const icon = path.join(root, 'assets', 'material-cookie-clicker.ico');
  const editor = path.join(root, 'node_modules', 'electron-winstaller', 'vendor', 'rcedit.exe');
  for (const [label, candidate] of [['packaged executable', executable], ['committed icon', icon], ['reviewed resource editor', editor]]) {
    if (!existsSync(candidate)) throw new Error(`${label} is missing: ${candidate}`);
  }

  execFileSync(editor, [executable, '--set-icon', icon], {
    cwd: root,
    stdio: 'inherit',
    windowsHide: true,
  });
};
