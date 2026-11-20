/**
 * Audit teks rilis: memastikan tidak ada istilah teknis yang bocor ke layar.
 *
 * Aplikasi ini dipublikasikan di Play Store. Kalimat seperti "isi
 * EXPO_PUBLIC_SUPABASE_URL lalu bangun ulang" atau tombol "Periksa database"
 * membuat pengguna merasa disuruh mengerjakan hal developer — dan itu berujung
 * komplain serta penilaian bintang satu.
 *
 * Uji ini memindai SEMUA string literal di lapisan UI (app/ + src/components +
 * src/data) dan gagal bila menemukan kata terlarang. Komentar kode dilewati,
 * jadi catatan internal untuk pengembang tetap boleh memakai istilah teknis.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { ACCOUNTS_ENABLED } from '../../src/config/release';
import { friendlyAuthError, friendlySyncError } from '../../src/services/sync/errors';

let passed = 0;
const check = (label: string, fn: () => void) => {
  try {
    fn();
    passed += 1;
    console.log('  OK   ' + label);
  } catch (error) {
    console.log('  FAIL ' + label);
    console.log('       ' + (error instanceof Error ? error.message.split('\n').slice(0, 12).join('\n       ') : String(error)));
    process.exitCode = 1;
  }
};

const ROOT = join(process.cwd());
const SCAN_DIRS = ['app', 'src/components', 'src/data'];
/** Berkas yang seluruhnya definisi ikon/palet, bukan teks layar. */
const SKIP_FILES = new Set(['src/components/Icon.tsx', 'src/theme/tokens.ts']);
/** Berkas layanan yang teksnya juga tampil di layar/struk. */
const SCAN_FILES = [
  'src/services/backup.ts',
  'src/services/export.ts',
  'src/services/printer/receipt.ts',
  'src/services/sync/errors.ts',
  'src/utils/reminder.ts',
  'src/services/voice.ts',
  'src/data/auth.ts',
];

/** Kata/istilah yang tidak boleh muncul di teks yang dibaca pengguna. */
const BANNED: { pattern: RegExp; why: string }[] = [
  { pattern: /\bsupabase\b/i, why: 'nama penyedia backend' },
  { pattern: /\banon\b|\banonymous key\b/i, why: 'istilah kunci API' },
  { pattern: /\bapi key\b|\bsecret key\b/i, why: 'istilah kunci API' },
  { pattern: /\.env\b|expo_public/i, why: 'berkas konfigurasi build' },
  { pattern: /\bmigrasi\b|\bmigration\b/i, why: 'langkah basis data' },
  { pattern: /\bdatabase\b|\bpostgres\b|\bsql\b|\bsqlite\b/i, why: 'istilah basis data' },
  { pattern: /\boutbox\b/i, why: 'istilah antrean internal' },
  { pattern: /\bcloud\b/i, why: 'istilah awan/backend' },
  { pattern: /\bserver\b/i, why: 'istilah backend' },
  { pattern: /\bdashboard\b/i, why: 'istilah panel admin' },
  { pattern: /\brpc\b|\btrigger\b|\brealtime\b/i, why: 'istilah teknis basis data' },
  { pattern: /\boffline\b|\bdebug\b/i, why: 'istilah teknis' },
  { pattern: /\bjwt\b|\btoken\b/i, why: 'istilah autentikasi' },
  { pattern: /\bkuota\b/i, why: 'istilah teknis penyimpanan' },
  // Aplikasi ini dirilis sebagai aplikasi HP, bukan web.
  { pattern: /\bperamban\b|\bbrowser\b|\bdi web\b|\bemulator\b/i, why: 'menyebut web' },
  { pattern: /\bexpo\b|\bdevelopment build\b|\bnpx\b|\bapk\b/i, why: 'alat build' },
  { pattern: /android\s*\/\s*ios|android\s*&\s*ios/i, why: 'menyebut sistem operasi' },
  // Jangan pernah mengiklankan fitur yang belum bisa dipakai.
  { pattern: /belum tersedia|tidak tersedia|segera hadir|coming soon|dalam pengembangan|versi beta/i, why: 'kesan aplikasi belum jadi' },
  { pattern: /\btodo\b|\bdummy\b|lorem ipsum/i, why: 'sisa pekerjaan' },
];

/** Kalimat yang sengaja memakai kata di atas karena bagian dari merek/fitur. */
const ALLOWED_STRINGS = new Set<string>([
  'application/json',
  'public.comma-separated-values-text',
  'text/csv',
  // Kategori usaha sungguhan (jual pulsa & token listrik), bukan istilah auth.
  'Pulsa & Token',
]);

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, files);
    else if (/\.(ts|tsx)$/.test(entry)) files.push(full);
  }
  return files;
}

/** Buang komentar blok dan baris supaya catatan internal tidak ikut dinilai. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (match, prefix: string) => prefix + ' '.repeat(Math.max(0, match.length - prefix.length)));
}

/**
 * Buang bagian yang bukan teks untuk pengguna: pernyataan import, `require()`,
 * nama ikon, dan nama varian tombol. Semuanya string literal juga, tetapi tidak
 * pernah tampil di layar.
 */
function stripNonCopy(source: string): string {
  return source
    .replace(/import[\s\S]*?from\s*(['"])[^'"]*\1;?/g, (match) => match.replace(/[^\n]/g, ' '))
    .replace(/require\(([^)]*)\)/g, 'require()')
    .replace(/(icon|name|tone|variant|size)\s*=\s*(['"])[^'"]*\2/g, (match) => match.replace(/[^\n]/g, ' '))
    .replace(/(icon|tone|variant|size)\s*:\s*(['"])[^'"]*\2/g, (match) => match.replace(/[^\n]/g, ' '));
}

/** Ambil isi string literal (', ", `) beserta nomor barisnya. */
function stringLiterals(source: string): { text: string; line: number }[] {
  const out: { text: string; line: number }[] = [];
  const pattern = /(['"`])((?:\\.|(?!\1)[^\\])*)\1/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    const text = match[2];
    if (text.trim().length === 0) continue;
    const line = source.slice(0, match.index).split('\n').length;
    out.push({ text, line });
  }
  return out;
}

/** Teks JSX polos: isi yang berada di antara `>` dan `<` (bukan atribut). */
function jsxTextNodes(source: string): { text: string; line: number }[] {
  const out: { text: string; line: number }[] = [];
  const pattern = />([^<>{}]+?)</g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    const text = match[1].replace(/\s+/g, ' ').trim();
    if (text.length < 4) continue;
    // Lewati potongan yang sebenarnya kode, bukan kalimat.
    if (/=>|[;{}]/.test(text)) continue;
    if (/[A-Za-z0-9_]\s*\(/.test(text)) continue;
    const line = source.slice(0, match.index).split('\n').length;
    out.push({ text, line });
  }
  return out;
}

function violations(): string[] {
  const problems: string[] = [];
  const targets = [
    ...SCAN_DIRS.flatMap((dir) => walk(join(ROOT, dir))),
    ...SCAN_FILES.map((file) => join(ROOT, file)),
  ];

  {
    for (const file of targets) {
      if (SKIP_FILES.has(relative(ROOT, file).split('\\').join('/'))) continue;
      const source = stripNonCopy(stripComments(readFileSync(file, 'utf8')));
      const candidates = [...stringLiterals(source), ...jsxTextNodes(source)];
      for (const { text, line } of candidates) {
        if (ALLOWED_STRINGS.has(text)) continue;
        // Kalimat Indonesia yang memuat kata Inggris di dalam konteks kode tidak
        // relevan; yang dinilai hanya string yang tampil sebagai teks.
        for (const rule of BANNED) {
          if (rule.pattern.test(text)) {
            problems.push(`${relative(ROOT, file)}:${line} → "${text.slice(0, 90)}" (${rule.why})`);
            break;
          }
        }
      }
    }
  }
  return problems;
}

console.log('\n== audit teks rilis ==');

check('tidak ada istilah teknis di teks yang dilihat pengguna', () => {
  const found = violations();
  assert.equal(
    found.length,
    0,
    'Istilah teknis ditemukan:\n' + found.join('\n'),
  );
});

check('layar diagnostik teknis sudah tidak ada', () => {
  assert.equal(statSync(join(ROOT, 'app/status-cloud.tsx'), { throwIfNoEntry: false }), undefined);
});

const assertClean = (text: string) => {
  for (const rule of BANNED) {
    assert.doesNotMatch(text, rule.pattern, `"${text}" memuat istilah terlarang`);
  }
};

check('galat jaringan menjelaskan bahwa data tetap aman', () => {
  const text = friendlySyncError(new Error('TypeError: Failed to fetch'));
  assertClean(text);
  assert.match(text, /koneksi/i);
  assert.match(text, /tersimpan di HP ini/i);
});

check('sesi habis meminta masuk lagi', () => {
  const text = friendlySyncError(new Error('JWT expired'));
  assertClean(text);
  assert.match(text, /masuk lagi/i);
});

check('tanpa hak akses menyebut pemilik toko', () => {
  const text = friendlySyncError({ code: '42501', message: 'new row violates row-level security policy' });
  assertClean(text);
  assert.match(text, /pemilik toko/i);
});

check('galat tak dikenal tidak membocorkan istilah teknis', () => {
  const text = friendlySyncError(new Error('could not serialize access due to concurrent update'));
  assertClean(text);
  assert.match(text, /coba lagi/i);
});

check('rilis Play Store berjalan tanpa akun', () => {
  // Bila ini gagal, berarti sakelar akun dinyalakan. Itu keputusan sadar, bukan
  // kecelakaan: pastikan build memang untuk multi-perangkat.
  assert.equal(ACCOUNTS_ENABLED, false, 'sakelar akun harus mati untuk rilis publik');
});

check('galat masuk berbahasa Indonesia, bukan pesan layanan', () => {
  const salah = friendlyAuthError(new Error('Invalid login credentials'));
  const konfirmasi = friendlyAuthError(new Error('Email not confirmed'));
  const jaringan = friendlyAuthError(new Error('TypeError: Failed to fetch'));
  assert.match(salah, /kata sandi salah/i);
  assert.match(konfirmasi, /belum dikonfirmasi/i);
  assert.match(jaringan, /koneksi/i);
  for (const text of [salah, konfirmasi, jaringan]) {
    assert.doesNotMatch(text, /invalid|credentials|fetch|email not confirmed/i);
    assertClean(text);
  }
});

console.log(`\nSELESAI: ${passed} pemeriksaan lulus`);
