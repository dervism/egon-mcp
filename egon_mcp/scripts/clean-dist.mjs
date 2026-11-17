// Empties dist/ before npm pack builds it, so the package holds no output of
// sources that were deleted since the last build.
import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

rmSync(fileURLToPath(new URL('../dist', import.meta.url)), { recursive: true, force: true });
