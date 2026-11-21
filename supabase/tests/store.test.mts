/**
 * Pembungkus `npm run test:store`.
 *
 * `src/data/store.ts` memakai modul khusus perangkat (expo-sqlite &
 * AsyncStorage), jadi berkas kasusnya dibundel lebih dulu dengan tiruan
 * penyimpanan, baru dijalankan di Node. Hasilnya sama seperti menjalankan
 * aplikasi sungguhan: setiap aksi store benar-benar mengubah state.
 */
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const outfile = path.join(mkdtempSync(path.join(tmpdir(), 'inventoris-store-')), 'cases.mjs');

await build({
  entryPoints: [path.join(here, 'store/cases.ts')],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  logLevel: 'error',
  alias: {
    'expo-crypto': path.join(here, 'stubs/expo-crypto.mjs'),
    'expo-sqlite': path.join(here, 'stubs/expo-sqlite.mjs'),
    '@react-native-async-storage/async-storage': path.join(here, 'stubs/async-storage.mjs'),
  },
});

try {
  execFileSync(process.execPath, [outfile], { stdio: 'inherit' });
} catch {
  process.exitCode = 1;
}
