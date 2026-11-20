import type { Category } from './types';

/**
 * Kategori master bawaan. Semua angka transaksi tetap kosong — yang ada di
 * sini hanya daftar kategori (bukan data demo), boleh diubah pengguna.
 */
export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'sale-sembako', label: 'Sembako', type: 'sale', icon: 'cart' },
  { id: 'sale-mamin', label: 'Makanan & Minuman', type: 'sale', icon: 'cup' },
  { id: 'sale-pulsa', label: 'Pulsa & Token', type: 'sale', icon: 'phone' },
  { id: 'sale-rokok', label: 'Rokok', type: 'sale', icon: 'tag' },
  { id: 'sale-gas', label: 'Gas & Galon', type: 'sale', icon: 'package' },
  { id: 'sale-lain', label: 'Lain-lain', type: 'sale', icon: 'plus' },
  { id: 'exp-kulakan', label: 'Kulakan Grosir', type: 'expense', icon: 'truck' },
  { id: 'exp-operasional', label: 'Operasional', type: 'expense', icon: 'bulb' },
  { id: 'exp-gaji', label: 'Gaji / Upah', type: 'expense', icon: 'users' },
  { id: 'exp-listrik', label: 'Listrik & Air', type: 'expense', icon: 'bolt' },
  { id: 'exp-transport', label: 'Transport', type: 'expense', icon: 'truck' },
  { id: 'exp-lain', label: 'Lain-lain', type: 'expense', icon: 'plus' },
];

/** Label & ikon metode pembayaran. */
export const PAY_METHODS = [
  { id: 'cash', label: 'Tunai', hint: 'Uang laci kas', icon: 'banknote' },
  { id: 'qris', label: 'QRIS / Bank', hint: 'Masuk rekening', icon: 'qr' },
  { id: 'transfer', label: 'Transfer', hint: 'Antar rekening', icon: 'creditCard' },
  { id: 'kasbon', label: 'Kasbon', hint: 'Catat piutang', icon: 'book' },
] as const;
