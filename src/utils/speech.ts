/**
 * Pengurai ucapan Bahasa Indonesia → nominal rupiah & catatan.
 *
 * Contoh yang didukung:
 *   "tiga puluh satu ribu"            → 31.000
 *   "dua belas ribu lima ratus"       → 12.500
 *   "seratus lima puluh ribu rupiah"  → 150.000
 *   "jual indomie dua puluh lima ribu"→ 25.000, catatan "indomie"
 *   "31 ribu" / "31rb" / "31000"      → 31.000
 *   "satu juta dua ratus ribu"        → 1.200.000
 *
 * Bukan speech-to-text itu sendiri (itu tugas layanan suara perangkat) —
 * fungsi di sini hanya menafsirkan teks yang sudah jadi, sehingga bisa
 * diuji tanpa mikrofon.
 */

const SATUAN: Record<string, number> = {
  nol: 0,
  kosong: 0,
  satu: 1,
  dua: 2,
  tiga: 3,
  empat: 4,
  lima: 5,
  enam: 6,
  tujuh: 7,
  delapan: 8,
  sembilan: 9,
  sepuluh: 10,
  sebelas: 11,
};

const KATA_NOMINAL = new Set([
  'puluh',
  'belas',
  'ratus',
  'seratus',
  'ribu',
  'seribu',
  'rb',
  'rbu',
  'ribuan',
  'juta',
  'jt',
  'jutaan',
  'rupiah',
  'perak',
  'sen',
  'setengah',
]);

const SATUAN_AKHIRAN: Record<string, string> = {
  k: 'ribu',
  rb: 'ribu',
  rbu: 'ribu',
  ribu: 'ribu',
  jt: 'juta',
  juta: 'juta',
};

/** Pecah token gabungan seperti "31rb" / "25k" menjadi ["31", "ribu"]. */
function pecahToken(token: string): string[] {
  const match = /^(\d+)(k|rb|rbu|ribu|jt|juta)$/i.exec(token);
  if (match) return [match[1], SATUAN_AKHIRAN[match[2].toLowerCase()]];
  return [token];
}

const KATA_ABAIKAN = new Set([
  'jual', 'jualan', 'jualan', 'beli', 'belanja', 'catat', 'mencatat', 'tambah', 'input',
  'transaksi', 'pemasukan', 'penjualan', 'pengeluaran', 'uang', 'bayar', 'dibayar',
  'sebanyak', 'sebesar', 'untuk', 'dengan', 'yang', 'itu', 'dan', 'ya', 'dong',
  'tolong', 'mohon', 'nominal', 'harga', 'total', 'saja', 'aja', 'rupiahnya',
]);

/** Ubah deretan kata angka Indonesia menjadi nilai numerik. */
export function wordsToNumber(tokens: string[]): number | null {
  let total = 0;
  let acc = 0;
  let digit = 0;
  let found = false;

  for (const token of tokens) {
    const bersih = token.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!bersih) continue;

    if (/^\d+$/.test(bersih)) {
      const value = Number(bersih);
      if (!Number.isFinite(value)) continue;
      acc += value;
      digit = value;
      found = true;
      continue;
    }

    if (bersih in SATUAN) {
      const value = SATUAN[bersih];
      acc += value;
      digit = value;
      found = true;
      continue;
    }

    if (bersih === 'seratus') {
      acc += 100;
      digit = 0;
      found = true;
      continue;
    }
    if (bersih === 'seribu') {
      total += Math.max(acc, 1) * 1_000;
      acc = 0;
      digit = 0;
      found = true;
      continue;
    }
    if (bersih === 'puluh') {
      const basis = digit || 1;
      acc += basis * 9; // digit sudah masuk sekali, jadi tambahkan 9× lagi
      digit = 0;
      found = true;
      continue;
    }
    if (bersih === 'belas') {
      acc += 10;
      digit = 0;
      found = true;
      continue;
    }
    if (bersih === 'ratus') {
      const basis = digit || 1;
      acc += basis * 99;
      digit = 0;
      found = true;
      continue;
    }
    if (bersih === 'ribu' || bersih === 'rb' || bersih === 'rbu' || bersih === 'ribuan') {
      total += Math.max(acc, 1) * 1_000;
      acc = 0;
      digit = 0;
      found = true;
      continue;
    }
    if (bersih === 'juta' || bersih === 'jt' || bersih === 'jutaan') {
      total += Math.max(acc, 1) * 1_000_000;
      acc = 0;
      digit = 0;
      found = true;
      continue;
    }
    if (bersih === 'setengah') {
      acc += 0.5;
      digit = 0;
      found = true;
      continue;
    }
  }

  if (!found) return null;
  const value = Math.round(total + acc);
  return value > 0 ? value : null;
}

/** Nominal dari kalimat bebas, mis. "jual indomie dua puluh lima ribu". */
export function parseSpokenAmount(text: string): number | null {
  const tokens = text
    .toLowerCase()
    .replace(/rp\.?/g, ' ')
    .split(/[\s,]+/)
    .filter(Boolean)
    .flatMap(pecahToken);

  // Ambil hanya deret token yang mengandung angka/angka-kata.
  const deret: string[] = [];
  for (const token of tokens) {
    const bersih = token.replace(/[^a-z0-9]/g, '');
    const angka = /^\d+$/.test(bersih) || bersih in SATUAN || KATA_NOMINAL.has(bersih);
    if (angka) deret.push(bersih);
    else if (deret.length > 0) break; // deret angka pertama selesai
  }

  return deret.length > 0 ? wordsToNumber(deret) : null;
}

/** Sisa kata yang bukan angka — dipakai sebagai nama barang / catatan. */
export function extractSpokenNote(text: string): string {
  return text
    .toLowerCase()
    .replace(/rp\.?/g, ' ')
    .split(/[\s,]+/)
    .filter(Boolean)
    .flatMap(pecahToken)
    .filter((token) => {
      const bersih = token.replace(/[^a-z0-9]/g, '');
      if (!bersih) return false;
      if (/^\d+$/.test(bersih)) return false;
      if (bersih in (SATUAN as Record<string, number>)) return false;
      if (KATA_NOMINAL.has(bersih)) return false;
      if (KATA_ABAIKAN.has(bersih)) return false;
      return true;
    })
    .join(' ')
    .trim()
    .slice(0, 120);
}

export interface SpokenTransaction {
  amount: number | null;
  note: string;
  raw: string;
}

/** Baca satu ucapan menjadi nominal + catatan sekaligus. */
export function parseSpokenTransaction(text: string): SpokenTransaction {
  return { amount: parseSpokenAmount(text), note: extractSpokenNote(text), raw: text.trim() };
}

/** Contoh ucapan untuk ditampilkan sebagai petunjuk di UI. */
export const CONTOH_UCAPAN = ['"jual indomie dua puluh lima ribu"', '"telur tiga puluh satu ribu"'];
