import type { IconName } from '../components/Icon';

/** Jenis transaksi. */
export type TxType = 'sale' | 'expense';

/** Metode pembayaran. `kasbon` = penjualan yang belum jadi uang tunai. */
export type PayMethod = 'cash' | 'qris' | 'kasbon' | 'transfer';

export interface LineItem {
  productId?: string;
  name: string;
  qty: number;
  /** Harga jual satuan. */
  price: number;
  /** Harga pokok satuan (opsional, dipakai untuk hitung laba). */
  cost?: number;
  /** Potongan rupiah untuk baris ini (diskon per barang). */
  discount?: number;
}

export interface Transaction {
  id: string;
  type: TxType;
  amount: number;
  categoryId: string;
  method: PayMethod;
  note?: string;
  photoUri?: string;
  /** ISO 8601. */
  createdAt: string;
  /** Rincian barang (opsional) — dipakai laporan juara penjualan. */
  items?: LineItem[];
  /** Nilai sebelum diskon & pajak. Bila kosong, sama dengan `amount`. */
  subtotal?: number;
  /** Diskon dalam rupiah (hasil hitung dari `discountKind`/`discountValue`). */
  discount?: number;
  discountKind?: 'amount' | 'percent';
  /** Angka yang diketik kasir: nominal rupiah atau persen (0-100). */
  discountValue?: number;
  /** Pajak dalam rupiah (hasil hitung dari `taxRate`). */
  tax?: number;
  /** Tarif pajak dalam persen, mis. 10 untuk PB1. */
  taxRate?: number;
  /** Diisi bila transaksi ini menghasilkan kasbon. */
  receivableId?: string;
  /** Diisi bila kasir memilih pelanggan dari buku pelanggan. */
  customerId?: string;
  /** Cabang tempat transaksi terjadi (Sprint 12). */
  outletId?: string;
}

export interface DebtPayment {
  id: string;
  amount: number;
  paidAt: string;
  method: PayMethod;
  note?: string;
  /**
   * `'retur'` = utang berkurang karena barang dikembalikan ke supplier, bukan
   * karena uang dibayarkan. Pembayaran seperti ini **tidak** mengurangi kas
   * dan tidak dihitung sebagai uang keluar di laporan (Sprint 17).
   */
  source?: 'retur';
}

/** Piutang pelanggan (kasbon). */
export interface Receivable {
  id: string;
  customerId?: string;
  /** Cabang tempat kasbon dibuat. */
  outletId?: string;
  customerName: string;
  amount: number;
  /** ISO 8601. */
  dueDate: string;
  createdAt: string;
  note?: string;
  items?: LineItem[];
  payments: DebtPayment[];
  /** Terakhir kali pelanggan ditagih lewat WhatsApp (Sprint 17). */
  lastRemindedAt?: string;
  /** Berapa kali sudah ditagih — hanya untuk riwayat, tidak memengaruhi hitungan. */
  remindCount?: number;
}

/** Utang ke supplier / agen kulakan. */
export interface Payable {
  id: string;
  supplierName: string;
  /** Cabang yang menanggung utang ini. */
  outletId?: string;
  amount: number;
  dueDate: string;
  createdAt: string;
  note?: string;
  payments: DebtPayment[];
}

export interface Product {
  id: string;
  name: string;
  unit: string;
  sellPrice: number;
  costPrice: number;
  /**
   * Stok untuk toko satu lokasi. Pada toko bercabang, angka yang dipakai layar
   * diambil dari `stockByOutlet` lewat `stockFor()`; kolom ini menjadi cermin
   * cabang pertama supaya data lama & struk tetap terbaca.
   */
  stock: number;
  /** Stok per cabang (Sprint 12). Kunci = id cabang. */
  stockByOutlet?: Record<string, number>;
  minStock: number;
  /** Barcode / kode barang (EAN-13, UPC, atau kode buatan sendiri). */
  barcode?: string;
  /** Harga satuan bila jumlah beli mencapai `wholesaleMinQty`. */
  wholesalePrice?: number;
  /** Minimal jumlah untuk mendapat harga grosir. */
  wholesaleMinQty?: number;
}

export interface Category {
  id: string;
  label: string;
  type: TxType;
  icon: IconName;
}

/**
 * Satu shift kasir: dari membuka laci sampai menghitung uang fisik.
 * Selisih = uang fisik − (modal awal + penjualan tunai − pengeluaran tunai).
 */
export interface Shift {
  id: string;
  /** Cabang tempat laci kasir dibuka. */
  outletId?: string;
  openedAt: string;
  openingCash: number;
  closedAt?: string;
  closingCash?: number;
  expectedCash?: number;
  /** Positif = uang lebih, negatif = uang kurang. */
  difference?: number;
  note?: string;
}

/** Pemindahan saldo kas usaha → tabungan modal. */
export interface CapitalAllocation {
  id: string;
  outletId?: string;
  amount: number;
  createdAt: string;
  note?: string;
}

export interface StoreProfile {
  name: string;
  ownerName: string;
  /** Kode toko, dibuat otomatis saat setup pertama. */
  code: string;
  openTime: string;
  closeTime: string;
  phone?: string;
}

export interface AppSettings {
  hideBalance: boolean;
  autoPrint: boolean;
  /** Nama printer yang terakhir terhubung. */
  printerName: string;
  printerAddress: string;
  /** Template pesan pengingat kasbon. */
  reminderTemplate: string;
  /** Tarif pajak bawaan (persen) yang dipakai layar kasir. 0 = tanpa pajak. */
  taxPercent: number;
  /** Waktu cadangan terakhir berhasil dibuat di perangkat ini (ISO). */
  lastBackupAt: string | null;
  /** Pengingat jatuh tempo (notifikasi lokal) aktif? */
  notifEnabled: boolean;
  /** Jam pengingat dikirim, 0–23. */
  notifHour: number;
}

/**
 * Pesanan / kuotasi: janji jual yang BELUM mengurangi stok dan belum masuk omzet.
 * Stok dan uang baru bergerak saat pesanan dijadikan transaksi ("selesai").
 */
export type OrderStatus = 'terbuka' | 'selesai' | 'batal';

export interface OrderItem {
  /** Kosong bila barang tidak ada di katalog (pesanan bebas). */
  productId?: string;
  name: string;
  qty: number;
  price: number;
  note?: string;
}

export interface Order {
  id: string;
  customerName: string;
  customerPhone?: string;
  /** Diisi bila pelanggan dipilih dari buku pelanggan. */
  customerId?: string;
  /** Cabang yang menerima pesanan. */
  outletId?: string;
  items: OrderItem[];
  /** Jumlah qty × harga, dihitung ulang di store & server. */
  total: number;
  /** Uang muka (DP) yang sudah diterima saat pesanan dibuat. 0 = tanpa DP. */
  deposit?: number;
  /** Tanggal janji ambil/kirim (ISO). */
  dueDate?: string;
  note?: string;
  status: OrderStatus;
  createdAt: string;
  updatedAt?: string;
  /** Diisi setelah pesanan dijadikan transaksi penjualan. */
  transactionId?: string;
}

/**
 * Pelanggan tetap toko (Sprint 11). Bukan akun: tidak ada kata sandi, tidak
 * perlu internet — hanya nama, nomor HP, dan catatan supaya kasbon tidak
 * tertukar antar pelanggan bernama mirip.
 */
export interface Customer {
  id: string;
  name: string;
  /** Sudah diseragamkan ke bentuk 62… oleh `normalizePhone`. */
  phone?: string;
  note?: string;
  createdAt: string;
  updatedAt?: string;
}

/**
 * Satu lokasi usaha (Sprint 12). Toko satu lokasi tetap punya satu cabang
 * otomatis, sehingga layar cabang tidak pernah muncul untuk pengguna lama.
 */
export interface Outlet {
  id: string;
  name: string;
  /** Kode singkat untuk struk, mis. "WB01". */
  code: string;
  address?: string;
  createdAt: string;
  /** Diarsipkan = tidak dipakai lagi, tetapi riwayatnya tetap ada. */
  archivedAt?: string;
}

/**
 * Satu sesi hitung fisik (Sprint 13). Disimpan sebagai catatan supaya pemilik
 * toko bisa menelusuri kapan stok berkurang dan berapa nilainya.
 */
export interface StockOpname {
  id: string;
  outletId?: string;
  createdAt: string;
  note?: string;
  lines: {
    productId: string;
    name: string;
    unit: string;
    system: number;
    counted: number;
    cost: number;
  }[];
  /** Nilai barang kurang (harga modal). */
  lossValue: number;
  /** Nilai barang lebih (harga modal). */
  gainValue: number;
}

/** Satu baris barang yang dibeli dari supplier (Sprint 14). */
export interface PurchaseItem {
  productId: string;
  name: string;
  unit: string;
  qty: number;
  /** Harga beli satuan saat kulakan ini. */
  unitCost: number;
}

/**
 * Satu kulakan / pembelian dari supplier. Menambah stok cabang, memperbarui
 * HPP rata-rata barang, dan menyisakan utang bila belum dibayar lunas.
 */
export interface Purchase {
  id: string;
  outletId?: string;
  supplierName: string;
  createdAt: string;
  items: PurchaseItem[];
  total: number;
  /** Uang yang benar-benar keluar hari ini. */
  paid: number;
  method: PayMethod;
  /** Diisi bila belum lunas — sisa menjadi utang supplier. */
  payableId?: string;
  note?: string;
  /** HPP sebelum & sesudah, supaya pemilik bisa melihat akibatnya. */
  costChanges?: { productId: string; before: number; after: number }[];
  /** Saldo retur lama yang dipakai untuk membayar kulakan ini (Sprint 15). */
  creditUsed?: number;
}

/**
 * Buku supplier (Sprint 15). Hubungannya dengan kulakan & utang lewat NAMA yang
 * dinormalkan, sama seperti buku pelanggan — supaya riwayat lama yang hanya
 * menyimpan nama tetap ikut terbaca.
 */
export interface Supplier {
  id: string;
  name: string;
  /** Sudah diseragamkan ke bentuk 62… oleh `normalizePhone`. */
  phone?: string;
  address?: string;
  note?: string;
  createdAt: string;
  updatedAt?: string;
  /** Diarsipkan = tidak dipakai lagi, riwayatnya tetap ada. */
  archivedAt?: string;
}

/** Satu baris barang yang dikembalikan ke supplier. */
export interface ReturnItem {
  productId: string;
  name: string;
  unit: string;
  qty: number;
  /** Harga beli yang dipakai saat barang itu masuk. */
  unitCost: number;
}

/**
 * Retur barang ke supplier (Sprint 15).
 *
 * Nilainya dipakai lebih dulu untuk memotong utang kulakan yang masih terbuka.
 * Kalau tidak ada utang lagi, sisanya menjadi **saldo retur** yang otomatis
 * memotong pembayaran kulakan berikutnya dari supplier yang sama.
 */
export interface PurchaseReturn {
  id: string;
  outletId?: string;
  supplierName: string;
  supplierId?: string;
  createdAt: string;
  items: ReturnItem[];
  total: number;
  /** Utang yang berhasil dipotong (bila ada). */
  appliedPayableId?: string;
  appliedAmount: number;
  /** Sisa nilai yang menjadi saldo untuk kulakan berikutnya. */
  creditValue: number;
  note?: string;
}

export interface PersistedState {
  version: number;
  profile: StoreProfile;
  settings: AppSettings;
  categories: Category[];
  transactions: Transaction[];
  receivables: Receivable[];
  payables: Payable[];
  products: Product[];
  allocations: CapitalAllocation[];
  shifts: Shift[];
  orders: Order[];
  customers: Customer[];
  outlets: Outlet[];
  /** Cabang yang sedang dibuka. Kosong = cabang pertama. */
  activeOutletId: string | null;
  opnames: StockOpname[];
  purchases: Purchase[];
  suppliers: Supplier[];
  purchaseReturns: PurchaseReturn[];
}

export type MutationResult = { ok: true; id?: string } | { ok: false; reason: string };

/**
 * Potongan data hasil tarikan mesin sinkron (`services/sync/engine.ts`).
 * Semua id sudah diterjemahkan kembali ke id lokal sebelum sampai di sini.
 */
export interface RemotePatch {
  deleted?: Partial<Record<'products' | 'transactions' | 'receivables' | 'payables' | 'categories' | 'allocations' | 'orders', string[]>>;
  products?: Product[];
  transactions?: Transaction[];
  receivables?: Receivable[];
  payables?: Payable[];
  /** Kategori & alokasi modal ikut disinkron sejak sprint 2. */
  categories?: Category[];
  allocations?: CapitalAllocation[];
  shifts?: Shift[];
  orders?: Order[];
  /** Buku pelanggan belum disinkronkan antar perangkat; tetap dibaca bila ada. */
  customers?: Customer[];
  /** Daftar cabang (Sprint 12). */
  outlets?: Outlet[];
  /** Riwayat hitung stok (Sprint 13). */
  opnames?: StockOpname[];
  /** Kulakan supplier (Sprint 14) — tersimpan di perangkat ini. */
  purchases?: Purchase[];
  /** Buku supplier (Sprint 15). */
  suppliers?: Supplier[];
  /** Retur barang ke supplier (Sprint 15). */
  purchaseReturns?: PurchaseReturn[];
  activeOutletId?: string | null;
  profile?: Partial<StoreProfile>;
}
