// Clean only cache/test to preserve user cache artifacts
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
const dir = path.join(repoRoot, 'cache', 'test');

try {
  fs.rmSync(dir, { recursive: true, force: true });
  // eslint-disable-next-line no-console
  console.log(`Removed: ${dir}`);
} catch (e) {
  // eslint-disable-next-line no-console
  console.warn(`Failed to remove ${dir}:`, e?.message || e);
}

