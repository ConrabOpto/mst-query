import { execSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Installs mst-query from a packed tarball, so the app uses the published files and its own React
const appDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const packageDir = join(appDir, '../../packages/mst-query');
const packDir = join(appDir, '.pack');

rmSync(packDir, { recursive: true, force: true });
mkdirSync(packDir);

execSync('npm run build', { cwd: packageDir, stdio: 'inherit' });
execSync(`npm pack --pack-destination "${packDir}"`, { cwd: packageDir, stdio: 'inherit' });

const tarball = readdirSync(packDir).find((file) => file.endsWith('.tgz'));
execSync(`npm install --no-save "${join(packDir, tarball)}"`, { cwd: appDir, stdio: 'inherit' });
