// setup-hook.js - Install the pre-push hook
import { execSync } from 'child_process';
import { copyFileSync, chmodSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

try {
  const gitDir = execSync('git rev-parse --git-dir', { encoding: 'utf8' }).trim();
  const hookPath = join(gitDir, 'hooks', 'pre-push');
  const sourcePath = join(__dirname, 'pre-push');
  
  copyFileSync(sourcePath, hookPath);
  chmodSync(hookPath, 0o755);
  
  console.log('✓ Pre-push hook installed successfully!');
  console.log('Now when you "git push", staged changes will auto-commit with AI-generated messages.');
} catch (error) {
  console.error('Failed to install hook:', error.message);
  process.exit(1);
}
