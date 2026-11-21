import { appAlert } from '../src/utils/alert';
/**
 * Kasir (POS) — layar jual cepat untuk warung.
 *
 * Alur: pilih barang (ketuk kartu, pindai barcode, atau cari dengan suara) →
 * keranjang → bayar (tunai/QRIS/transfer/kasbon) → struk (cetak BLE, bagikan,
 * atau salin).
 *
 * Transaksi disimpan lewat `addTransaction` yang sama dengan layar Catat,
 * sehingga stok berkurang, laporan omzet/laba, dan buku kasbon otomatis ikut
 * terbarui tanpa jalur data kedua.
 */
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BarcodeScanner } from '../src/components/BarcodeScanner';
import { TextField } from '../src/components/Field';
import { Icon, type IconName } from '../src/components/Icon';
import {
  Button,
  Card,
  Chip,
  Divider,
  EmptyState,
  IconBadge,
  SectionLabel,
  Segmented,
  Sheet,
} from '../src/components/Primitives';
import { VoiceButton } from '../src/components/VoiceButton';
import { PAY_METHODS } from '../src/data/categories';
import { computeTotals, useAppStore } from '../src/data/store';
import { activeOutlet, outletLabel } from '../src/data/outlets';
import { useScopedData } from '../src/data/scope';
import type { LineItem, PayMethod, Product } from '../src/data/types';
import { buildReceiptText } from '../src/services/printer/receipt';
import { connectPrinter, connectedPrinter, printReceiptText } from '../src/services/printer';
import { colors, fonts, radius, shadow, spacing, type } from '../src/theme/tokens';
import { formatRupiah, maskNominal, parseNumber } from '../src/utils/format';
import { extractSpokenNote } from '../src/utils/speech';
import { shareMessage } from '../src/utils/reminder';

type CartLine = {
  product: Product;
  qty: number;
  /** Harga satuan yang dipakai (harga grosir bila jumlahnya memenuhi). */
  price: number;
  /** Diskon rupiah khusus baris ini. */
  discount: number;
};

/** Harga satuan sesuai jumlah: grosir dipakai bila melewati minimalnya. */
const unitPriceOf = (product: Product, qty: number) =>
  product.wholesalePrice && product.wholesaleMinQty && qty >= product.wholesaleMinQty
    ? product.wholesalePrice
    : product.sellPrice;

const METHODS: PayMethod[] = ['cash', 'qris', 'transfer', 'kasbon'];

export default function KasirScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const data = useScopedData();
  const addTransaction = useAppStore((s) => s.addTransaction);
  const upsertProduct = useAppStore((s) => s.upsertProduct);
  const findByBarcode = useAppStore((s) => s.findByBarcode);

  const [query, setQuery] = useState('');
  const [cart, setCart] = useState<Record<string, number>>({});
  // Potongan per barang (diskon item), terpisah dari diskon nota.
  const [lineDiscounts, setLineDiscounts] = useState<Record<string, string>>({});
  const [discountKind, setDiscountKind] = useState<'amount' | 'percent'>('amount');
  const [discountText, setDiscountText] = useState('');
  const [taxText, setTaxText] = useState(String(data.settings.taxPercent ?? 0));
  const [cartOpen, setCartOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [unknownCode, setUnknownCode] = useState<string | null>(null);

  const [method, setMethod] = useState<PayMethod>('cash');
  const [paidText, setPaidText] = useState('');
  const [customerName, setCustomerName] = useState('');
  /** Diisi bila kasir memilih pelanggan dari buku pelanggan. */
  const [customerId, setCustomerId] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const saveLock = useRef(false);
  const [success, setSuccess] = useState<{ text: string; total: number; change: number; method: PayMethod } | null>(null);
  const [printState, setPrintState] = useState<string | null>(null);

  const products = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? data.products.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            (p.barcode ?? '').includes(q),
        )
      : data.products;
    return list;
  }, [data.products, query]);

  const productsById = useMemo(() => new Map(data.products.map((p) => [p.id, p])), [data.products]);
  const lines: CartLine[] = useMemo(
    () =>
      Object.entries(cart)
        .map(([id, qty]) => {
          const product = productsById.get(id);
          if (!product) return null;
          const price = unitPriceOf(product, qty);
          const discount = Math.min(parseNumber(lineDiscounts[id] ?? '') || 0, price * qty);
          return { product, qty, price, discount };
        })
        .filter((line): line is CartLine => line !== null),
    [cart, productsById, lineDiscounts],
  );

  // Subtotal sudah memperhitungkan harga grosir & diskon per barang.
  const subtotal = lines.reduce((sum, line) => sum + line.price * line.qty - line.discount, 0);

  // Diskon & pajak: dihitung dengan fungsi yang sama seperti store & server.
  const totals = computeTotals({
    subtotal,
    discountKind,
    discountValue: parseNumber(discountText) || 0,
    taxRate: parseNumber(taxText) || 0,
  });
  const total = totals.total;
  const itemCount = lines.reduce((sum, line) => sum + line.qty, 0);
  const paid = parseNumber(paidText) || 0;
  const change = method === 'cash' ? paid - total : 0;

  const addToCart = (product: Product, qty = 1) => {
    setCart((prev) => {
      const next = (prev[product.id] ?? 0) + qty;
      if (next > product.stock) {
        appAlert.alert('Stok tidak cukup', `Sisa stok ${product.name}: ${product.stock} ${product.unit}.`);
        return prev;
      }
      return { ...prev, [product.id]: next };
    });
  };

  const setQty = (product: Product, qty: number) => {
    setCart((prev) => {
      const next = { ...prev };
      if (qty <= 0) delete next[product.id];
      else if (qty > product.stock) {
        next[product.id] = product.stock;
      } else next[product.id] = qty;
      return next;
    });
  };

  const resetAll = () => {
    setCart({});
    setLineDiscounts({});
    setPaidText('');
    setCustomerName('');
    setCustomerId(undefined);
    setMethod('cash');
    setError(null);
    setDiscountText('');
    setTaxText(String(data.settings.taxPercent ?? 0));
  };

  const handleScanned = (code: string) => {
    setScanOpen(false);
    const found = findByBarcode(code);
    // Stok yang diperiksa harus stok cabang yang sedang dibuka, bukan kolom
    // stok lama di data mentah.
    const product = found ? data.products.find((row) => row.id === found.id) ?? found : undefined;
    if (product) {
      addToCart(product);
      setQuery('');
      return;
    }
    setUnknownCode(code);
  };

  const openPay = () => {
    setError(null);
    setPaidText(maskNominal(String(total)));
    setMethod('cash');
    setPayOpen(true);
  };

  useEffect(() => { if (itemCount > 0) saveLock.current = false; }, [itemCount]);
  const save = async () => {
    if (saveLock.current) return;
    if (lines.length === 0) {
      setError('Keranjang masih kosong.');
      return;
    }
    if (method === 'kasbon' && !customerName.trim()) {
      setError('Nama pelanggan wajib diisi untuk pembayaran kasbon.');
      return;
    }
    if (method === 'cash' && paid < total) {
      setError('Uang diterima kurang dari total belanja.');
      return;
    }

    saveLock.current = true;
    setSaving(true);
    const items: LineItem[] = lines.map((line) => ({
      productId: line.product.id,
      name: line.product.name,
      qty: line.qty,
      price: line.price,
      cost: line.product.costPrice,
      discount: line.discount > 0 ? line.discount : undefined,
    }));

    const saleCategory = data.categories.find((c) => c.type === 'sale');
    const result = addTransaction({
      type: 'sale',
      amount: total,
      subtotal: totals.subtotal,
      discountKind: totals.discountKind,
      discountValue: totals.discountValue,
      taxRate: totals.taxRate,
      categoryId: saleCategory?.id ?? 'sale-lain',
      method,
      note: lines.map((l) => `${l.product.name} x${l.qty}`).join(', ').slice(0, 200),
      items,
      // Nama boleh diketik untuk metode apa pun; pelanggan dari buku tetap
      // ditautkan lewat id supaya riwayat & poin ikut terhitung.
      customerName: customerName.trim() || undefined,
      customerId,
      saveCustomer: customerName.trim().length > 0,
      dueDate: method === 'kasbon' ? new Date(Date.now() + 7 * 86_400_000).toISOString() : undefined,
    });
    setSaving(false);

    if (!result.ok) {
      saveLock.current = false;
      setError(result.reason);
      return;
    }

    const receipt = buildReceiptText({
      storeName: data.profile.name,
      outletName: data.outlets.length > 1 ? outletLabel(activeOutlet(data.outlets, data.activeOutletId)) : undefined,
      storeCode: data.profile.code,
      storePhone: data.profile.phone,
      invoice: result.id ?? '',
      createdAt: useAppStore.getState().transactions.find((tx) => tx.id === result.id)?.createdAt ?? new Date().toISOString(),
      paid: method === 'cash' ? paid : total,
      change: Math.max(0, change),
      items,
      total,
      subtotal: totals.subtotal,
      discount: totals.discount,
      tax: totals.tax,
      taxRate: totals.taxRate,
      method,
      cashier: data.profile.ownerName,
    });

    setPrintState(null);
    setSuccess({ text: receipt, total, change: Math.max(0, change), method });
    setPayOpen(false);
    setCartOpen(false);
    resetAll();
  };

  const doPrint = async () => {
    if (!success) return;
    if (!connectedPrinter()) {
      setPrintState('Menghubungkan printer…');
      const id = data.settings.printerAddress;
      if (!id) {
        setPrintState('Printer belum dipilih. Buka Pengaturan → Printer struk.');
        return;
      }
      const conn = await connectPrinter(id, data.settings.printerName || undefined);
      if (!conn.ok) {
        setPrintState(conn.message);
        return;
      }
    }
    const result = await printReceiptText(success.text);
    setPrintState(result.message);
  };

  const quickItems: { label: string; icon: IconName; onPress: () => void; tone: 'primary' | 'secondary' | 'amber' }[] = [
    { label: 'Pindai', icon: 'scan', onPress: () => setScanOpen(true), tone: 'primary' },
    { label: 'Keranjang', icon: 'cart', onPress: () => setCartOpen(true), tone: 'secondary' },
    { label: 'Pengaturan', icon: 'settings', onPress: () => router.push('/pengaturan'), tone: 'amber' },
  ];

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconButton} hitSlop={10} accessibilityLabel="Kembali">
          <Icon name="chevronLeft" size={17} color={colors.textMuted} strokeWidth={2} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Kasir</Text>
          <Text style={styles.headerSubtitle}>
            {/* Toko bercabang: kasir harus tahu sedang menjual di cabang mana. */}
            {data.outlets.length > 1
              ? `${outletLabel(activeOutlet(data.outlets, data.activeOutletId))} • ${data.products.length} barang`
              : `${data.profile.name || 'Inventori’s'} • ${data.products.length} barang`}
          </Text>
        </View>
        {quickItems.map((item) => (
          <Pressable
            key={item.label}
            onPress={item.onPress}
            style={styles.iconButton}
            hitSlop={8}
            accessibilityLabel={item.label}
          >
            <Icon name={item.icon} size={16} color={colors.textMuted} strokeWidth={1.9} />
            {item.label === 'Keranjang' && itemCount > 0 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{itemCount > 9 ? '9+' : itemCount}</Text>
              </View>
            ) : null}
          </Pressable>
        ))}
      </View>

      <FlatList
        data={products}
        keyExtractor={(product) => product.id}
        numColumns={2}
        extraData={cart}
        initialNumToRender={16}
        maxToRenderPerBatch={16}
        windowSize={7}
        contentContainerStyle={styles.content}
        columnWrapperStyle={{ gap: spacing.sm }}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={<View style={{ gap: spacing.md }}>
        <View style={styles.searchRow}>
          <TextField
            icon="search"
            placeholder="Cari barang atau barcode"
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            style={{ flex: 1 }}
            right={
              query ? (
                <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityLabel="Bersihkan pencarian">
                  <Icon name="close" size={14} color={colors.textFaint} />
                </Pressable>
              ) : null
            }
          />
          <VoiceButton
            compact
            onResult={(text) => setQuery(extractSpokenNote(text) || text)}
            onError={(message) => appAlert.alert('Input suara', message)}
          />
        </View>

        {data.products.length === 0 ? (
          <Card>
            <EmptyState
              icon="package"
              title="Belum ada barang"
              description="Tambahkan barang di Katalog Stok (nama, harga jual, modal, dan barcode) supaya bisa dijual lewat kasir."
              action={<Button label="Buka katalog" icon="package" onPress={() => router.push('/stok')} />}
            />
          </Card>
        ) : products.length === 0 ? (
          <Card>
            <EmptyState
              compact
              icon="search"
              title="Barang tidak ditemukan"
              description="Coba kata lain, atau pindai barcode barang."
              action={<Button label="Pindai barcode" icon="scan" variant="secondary" onPress={() => setScanOpen(true)} />}
            />
          </Card>
        ) : null}
        </View>}
        ListFooterComponent={
        <Card style={{ gap: spacing.sm }}>
          <View style={styles.helpHead}>
            <IconBadge name="info" tone="secondary" size={32} />
            <View style={{ flex: 1 }}>
              <Text style={styles.helpTitle}>Jual tanpa daftar barang?</Text>
              <Text style={styles.helpText}>
                Pakai Catat Penjualan untuk nominal bebas tanpa mengurangi stok. Tombol mikrofon mengisi nominal dari
                ucapan Bahasa Indonesia.
              </Text>
            </View>
          </View>
          <Button
            label="Catat penjualan manual"
            icon="plusCircle"
            variant="ghost"
            onPress={() => router.push({ pathname: '/catat', params: { type: 'sale' } })}
          />
        </Card>
        }
        renderItem={({ item: product }) => {
              const qty = cart[product.id] ?? 0;
              // Stok menipis: pengingat halus supaya kasir tidak kaget saat barang habis.
              const menipis = product.stock > 0 && product.stock <= product.minStock;
              const habis = product.stock <= 0;
              return (
                <Pressable
                  key={product.id}
                  onPress={() => (habis ? appAlert.alert('Stok habis', `${product.name} tidak bisa dijual sebelum stok ditambah.`) : addToCart(product))}
                  style={({ pressed }) => [
                    styles.tile,
                    qty > 0 && styles.tileActive,
                    pressed && { opacity: 0.85 },
                  ]}
                  accessibilityLabel={`Tambahkan ${product.name} ke keranjang`}
                >
                  <View style={styles.tileTop}>
                    <Text style={styles.tileName} numberOfLines={2}>
                      {product.name}
                    </Text>
                    {qty > 0 ? (
                      <View style={styles.tileQty}>
                        <Text style={styles.tileQtyText}>{qty}</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.tilePrice}>{formatRupiah(product.sellPrice)}</Text>
                  {product.wholesalePrice && product.wholesaleMinQty ? (
                    <Text style={styles.tileWholesale} numberOfLines={1}>
                      grosir {formatRupiah(product.wholesalePrice)} · {product.wholesaleMinQty}+
                    </Text>
                  ) : null}
                  <Text
                    style={[
                      styles.tileStock,
                      habis && { color: colors.danger },
                      !habis && menipis && { color: colors.amber },
                    ]}
                  >
                    {habis
                      ? 'Stok habis'
                      : `stok ${product.stock} ${product.unit}${menipis ? ' • menipis' : ''}`}
                  </Text>
                </Pressable>
              );
        }}
      />

      {/* Bar keranjang */}
      {itemCount > 0 ? (
        <View style={[styles.cartBar, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
          <Pressable style={styles.cartSummary} onPress={() => setCartOpen(true)}>
            <Text style={styles.cartCount}>{itemCount} item</Text>
            <Text style={styles.cartTotal}>{formatRupiah(total)}</Text>
          </Pressable>
          <Button label="Bayar" icon="banknote" onPress={openPay} style={{ flex: 1 }} />
        </View>
      ) : (
        <View style={[styles.cartBarEmpty, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
          <Text style={styles.cartEmptyText}>Ketuk barang untuk mulai transaksi, atau pindai barcode.</Text>
        </View>
      )}

      {/* Keranjang */}
      <Sheet
        visible={cartOpen}
        onClose={() => setCartOpen(false)}
        title="Keranjang"
        subtitle={itemCount > 0 ? `${itemCount} item • ${formatRupiah(total)}` : 'Belum ada barang'}
      >
        {lines.length === 0 ? (
          <EmptyState compact icon="cart" title="Keranjang kosong" description="Ketuk barang di daftar untuk menambah." />
        ) : (
          <View style={{ gap: spacing.sm }}>
            {lines.map((line) => (
              <View key={line.product.id} style={styles.lineRow}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.lineName} numberOfLines={1}>
                    {line.product.name}
                  </Text>
                  <Text style={styles.lineMeta}>
                    {formatRupiah(line.price)} • {line.product.unit}
                    {line.price !== line.product.sellPrice ? ' • harga grosir' : ''}
                  </Text>
                </View>
                <View style={styles.stepper}>
                  <Pressable
                    onPress={() => setQty(line.product, line.qty - 1)}
                    style={styles.stepBtn}
                    hitSlop={6}
                    accessibilityLabel={`Kurangi ${line.product.name}`}
                  >
                    <Icon name="minus" size={13} color={colors.tertiary} strokeWidth={2.4} />
                  </Pressable>
                  <Text style={styles.stepValue}>{line.qty}</Text>
                  <Pressable
                    onPress={() => setQty(line.product, line.qty + 1)}
                    style={styles.stepBtn}
                    hitSlop={6}
                    accessibilityLabel={`Tambah ${line.product.name}`}
                  >
                    <Icon name="plus" size={13} color={colors.primary} strokeWidth={2.4} />
                  </Pressable>
                </View>
                <Text style={styles.lineTotal}>
                  {formatRupiah(line.price * line.qty - line.discount)}
                </Text>
              </View>
            ))}
            {lines.map((line) => (
              <View key={`disc-${line.product.id}`} style={styles.lineDiscRow}>
                <Text style={styles.lineDiscLabel} numberOfLines={1}>
                  Diskon {line.product.name}
                </Text>
                <View style={{ width: 110 }}>
                  <TextField
                    prefix="Rp"
                    keyboardType="number-pad"
                    placeholder="0"
                    value={lineDiscounts[line.product.id] ?? ''}
                    onChangeText={(text) =>
                      setLineDiscounts((prev) => ({ ...prev, [line.product.id]: maskNominal(text) }))
                    }
                  />
                </View>
              </View>
            ))}
            <Divider style={{ marginVertical: spacing.sm }} />

            <SectionLabel>Diskon & pajak</SectionLabel>
            <View style={styles.quickRow}>
              {[
                { id: 'none' as const, label: 'Tanpa diskon' },
                { id: 'amount' as const, label: 'Diskon Rp' },
                { id: 'percent' as const, label: 'Diskon %' },
              ].map((opt) => {
                const active =
                  opt.id === 'none'
                    ? discountText.trim() === ''
                    : discountText.trim() !== '' && discountKind === opt.id;
                return (
                  <Pressable
                    key={opt.id}
                    style={[styles.quickChip, active && styles.quickChipActive]}
                    onPress={() => {
                      if (opt.id === 'none') {
                        setDiscountText('');
                        return;
                      }
                      setDiscountKind(opt.id);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                  >
                    <Text style={[styles.quickText, active && { color: colors.primary }]}>
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <View style={{ flex: 1 }}>
                <TextField
                  label="Diskon"
                  prefix={discountKind === 'amount' ? 'Rp' : '%'}
                  keyboardType="number-pad"
                  value={discountText}
                  onChangeText={(text) => setDiscountText(maskNominal(text))}
                  placeholder="0"
                />
              </View>
              <View style={{ flex: 1 }}>
                <TextField
                  label="Pajak"
                  prefix="%"
                  keyboardType="number-pad"
                  value={taxText}
                  onChangeText={(text) => setTaxText(maskNominal(text))}
                  placeholder="0"
                  hint="Mis. 10 untuk PB1"
                />
              </View>
            </View>

            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Subtotal</Text>
              <Text style={styles.totalValue}>{formatRupiah(subtotal)}</Text>
            </View>
            {totals.discount > 0 ? (
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>
                  Diskon{totals.discountKind === 'percent' ? ` ${totals.discountValue}%` : ''}
                </Text>
                <Text style={[styles.totalValue, { color: colors.tertiary }]}>
                  −{formatRupiah(totals.discount)}
                </Text>
              </View>
            ) : null}
            {totals.tax > 0 ? (
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Pajak {totals.taxRate}%</Text>
                <Text style={styles.totalValue}>{formatRupiah(totals.tax)}</Text>
              </View>
            ) : null}
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>{formatRupiah(total)}</Text>
            </View>
            <Button label="Lanjut bayar" icon="banknote" onPress={() => { setCartOpen(false); openPay(); }} />
            <Button label="Kosongkan" variant="ghost" icon="trash" onPress={() => setCart({})} />
          </View>
        )}
      </Sheet>

      {/* Pembayaran */}
      <Sheet
        visible={payOpen}
        onClose={() => setPayOpen(false)}
        title="Pembayaran"
        subtitle={`${itemCount} item • ${formatRupiah(total)}`}
      >
        <SectionLabel>Metode bayar</SectionLabel>
        <View style={styles.methodRow}>
          {METHODS.map((id) => {
            const meta = PAY_METHODS.find((m) => m.id === id);
            const active = method === id;
            return (
              <Pressable
                key={id}
                onPress={() => {
                  setMethod(id);
                  setError(null);
                  setPaidText(id === 'cash' ? maskNominal(String(total)) : '');
                }}
                style={[styles.method, active && styles.methodActive]}
              >
                <Icon
                  name={(meta?.icon ?? 'banknote') as IconName}
                  size={15}
                  color={active ? colors.primary : colors.textMuted}
                  strokeWidth={1.9}
                />
                <Text style={[styles.methodLabel, active && { color: colors.primary }]}>
                  {meta?.label.split(' ')[0] ?? id}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {method === 'cash' ? (
          <>
            <TextField
              label="Uang diterima"
              prefix="Rp"
              keyboardType="number-pad"
              value={paidText}
              onChangeText={(text) => {
                setPaidText(maskNominal(text));
                setError(null);
              }}
              style={{ marginTop: spacing.md }}
            />
            <View style={styles.quickRow}>
              {[total, 20000, 50000, 100000].map((nominal, index) => (
                <Pressable
                  key={`${nominal}-${index}`}
                  style={styles.quickChip}
                  onPress={() => setPaidText(maskNominal(String(nominal)))}
                >
                  <Text style={styles.quickText}>
                    {index === 0 ? 'Uang pas' : formatRupiah(nominal)}
                  </Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.changeRow}>
              <Text style={styles.changeLabel}>Kembalian</Text>
              <Text style={[styles.changeValue, { color: change >= 0 ? colors.primary : colors.danger }]}>
                {formatRupiah(Math.max(0, change))}
              </Text>
            </View>
          </>
        ) : null}

        {data.customers.length > 0 ? (
          <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
            <SectionLabel>{method === 'kasbon' ? 'Pelanggan tersimpan' : 'Pelanggan tersimpan (opsional)'}</SectionLabel>
            <View style={styles.customerRow}>
              {data.customers.slice(0, 6).map((customer) => {
                const active = customerId === customer.id;
                return (
                  <Pressable
                    key={customer.id}
                    onPress={() => {
                      // Ketuk sekali untuk memilih, ketuk lagi untuk melepas.
                      if (active) {
                        setCustomerId(undefined);
                        setCustomerName('');
                      } else {
                        setCustomerId(customer.id);
                        setCustomerName(customer.name);
                      }
                      setError(null);
                    }}
                    style={[styles.customerChip, active && styles.customerChipActive]}
                    accessibilityRole="button"
                    accessibilityLabel={`Pilih pelanggan ${customer.name}`}
                  >
                    <Text style={[styles.customerChipText, active && { color: colors.primary }]} numberOfLines={1}>
                      {customer.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        <TextField
          label={method === 'kasbon' ? 'Nama pelanggan' : 'Nama pelanggan (opsional)'}
          icon="user"
          placeholder="Contoh: Bu Ani"
          value={customerName}
          onChangeText={(text) => {
            setCustomerName(text);
            setCustomerId(undefined);
            setError(null);
          }}
          style={{ marginTop: spacing.md }}
        />
        <Text style={styles.hintText}>
          {method === 'kasbon'
            ? 'Nama baru otomatis disimpan ke buku pelanggan.'
            : 'Diisi bila pelanggan tetap — namanya disimpan ke buku pelanggan supaya poin & riwayat belanja terhitung.'}
        </Text>

        {method !== 'cash' ? (
          <Text style={styles.methodHint}>
            {method === 'kasbon'
              ? 'Kasbon masuk ke Buku Kasbon dan tidak menambah kas sampai dibayar.'
              : 'Pembayaran non-tunai tetap dihitung sebagai uang masuk (masuk rekening).'}
          </Text>
        ) : null}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <Button
          label={total > 0 ? `Simpan • ${formatRupiah(total)}` : 'Simpan'}
          icon="check"
          loading={saving}
          onPress={save}
          disabled={total <= 0}
          style={{ marginTop: spacing.base }}
        />
      </Sheet>

      {/* Struk & sukses */}
      <Sheet
        visible={success !== null}
        onClose={() => {
          setSuccess(null);
          setPrintState(null);
        }}
        title="Transaksi tersimpan"
        subtitle={success ? `${formatRupiah(success.total)} • ${methodLabel(success.method)}` : undefined}
      >
        {success ? (
          <>
            {success.method === 'cash' && success.change > 0 ? (
              <View style={styles.changeCard}>
                <Text style={styles.changeCardLabel}>Kembalian</Text>
                <Text style={styles.changeCardValue}>{formatRupiah(success.change)}</Text>
              </View>
            ) : null}
            <View style={styles.receiptPaper}>
              <Text style={styles.receiptText}>{success.text}</Text>
            </View>
            {printState ? <Text style={styles.printState}>{printState}</Text> : null}
            <Button label="Cetak ke printer" icon="printer" onPress={doPrint} style={{ marginTop: spacing.md }} />
            <Button
              label="Bagikan struk"
              icon="share"
              variant="secondary"
              onPress={() => shareMessage(success.text, 'Struk')}
              style={{ marginTop: spacing.sm }}
            />
            <Button
              label="Transaksi baru"
              icon="plusCircle"
              variant="ghost"
              onPress={() => {
                setSuccess(null);
                setPrintState(null);
              }}
              style={{ marginTop: spacing.sm }}
            />
          </>
        ) : null}
      </Sheet>

      {/* Buat barang baru dari barcode yang belum dikenal */}
      <Sheet
        visible={unknownCode !== null}
        onClose={() => setUnknownCode(null)}
        title="Barang belum terdaftar"
        subtitle={unknownCode ? `Barcode ${unknownCode}` : undefined}
      >
        <NewProductFromBarcode
          barcode={unknownCode ?? ''}
          onCancel={() => setUnknownCode(null)}
          onCreate={({ name, sellPrice, costPrice, stock }) => {
            const result = upsertProduct({
              name,
              unit: 'pcs',
              sellPrice,
              costPrice,
              stock,
              minStock: 0,
              barcode: unknownCode ?? undefined,
            });
            if (!result.ok) {
              appAlert.alert('Gagal menyimpan barang', result.reason);
              return;
            }
            setUnknownCode(null);
            if (result.id) {
              const created = useAppStore.getState().products.find((p) => p.id === result.id);
              if (created) addToCart(created);
            }
          }}
        />
      </Sheet>

      <BarcodeScanner
        visible={scanOpen}
        onClose={() => setScanOpen(false)}
        onScanned={handleScanned}
        title="Pindai barcode barang"
      />
    </View>
  );
}

function methodLabel(method: PayMethod): string {
  return PAY_METHODS.find((m) => m.id === method)?.label ?? method;
}

function NewProductFromBarcode({
  barcode,
  onCreate,
  onCancel,
}: {
  barcode: string;
  onCreate: (value: { name: string; sellPrice: number; costPrice: number; stock: number }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [sell, setSell] = useState('');
  const [cost, setCost] = useState('');
  const [stock, setStock] = useState('1');

  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={styles.newProductHint}>
        Barcode ini belum ada di katalog. Isi data barang sekali saja — berikutnya cukup pindai.
      </Text>
      <TextField label="Nama barang" icon="package" value={name} onChangeText={setName} placeholder="Contoh: Indomie Goreng" />
      <View style={styles.fieldRow}>
        <TextField
          label="Harga jual"
          prefix="Rp"
          keyboardType="number-pad"
          value={sell}
          onChangeText={(text) => setSell(maskNominal(text))}
          style={{ flex: 1 }}
        />
        <TextField
          label="Harga modal"
          prefix="Rp"
          keyboardType="number-pad"
          value={cost}
          onChangeText={(text) => setCost(maskNominal(text))}
          style={{ flex: 1 }}
        />
      </View>
      <TextField
        label="Stok awal"
        keyboardType="number-pad"
        value={stock}
        onChangeText={setStock}
        placeholder="0"
      />
      <Button
        label="Simpan & masukkan keranjang"
        icon="check"
        disabled={!name.trim() || parseNumber(sell) <= 0}
        onPress={() =>
          onCreate({
            name: name.trim(),
            sellPrice: parseNumber(sell),
            costPrice: parseNumber(cost),
            stock: Math.max(0, parseNumber(stock)),
          })
        }
        style={{ marginTop: spacing.sm }}
      />
      <Button label="Batal" variant="ghost" onPress={onCancel} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: { ...type.h2, fontSize: 16, color: colors.white },
  headerSubtitle: { ...type.caption, color: colors.textDim, marginTop: 1 },
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  badge: {
    position: 'absolute',
    top: -5,
    right: -5,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    borderRadius: 8,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontFamily: fonts.bold, fontSize: 9, color: colors.onPrimary },

  content: { padding: spacing.base, gap: spacing.md, paddingBottom: 120 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },

  grid: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'stretch', gap: spacing.sm },
  /**
   * Tinggi petak TIDAK dikunci: nama barang dua baris + harga + grosir + stok
   * butuh ruang lebih, dan tinggi tetap membuat baris terakhir saling menimpa.
   * `minHeight` + `alignItems: 'stretch'` di grid menjaga petak dalam satu baris
   * tetap sama tinggi.
   */
  tile: {
    width: '48.5%',
    minHeight: 96,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'space-between',
  },
  tileActive: { borderColor: colors.primaryBorder, backgroundColor: colors.primarySoft },
  tileTop: { gap: 4 },
  tileName: { ...type.bodyMedium, fontFamily: fonts.bold, color: colors.white },
  tileQty: {
    position: 'absolute',
    top: -6,
    right: -6,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  tileQtyText: { fontFamily: fonts.bold, fontSize: 10, color: colors.onPrimary },
  tilePrice: { fontFamily: fonts.numBold, fontSize: 13.5, color: colors.primary },
  tileWholesale: { ...type.micro, fontFamily: fonts.medium, color: colors.textFaint, marginTop: 1 },
  tileStock: { ...type.micro, fontFamily: fonts.medium, color: colors.textFaint },

  helpHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  helpTitle: { ...type.bodyMedium, fontFamily: fonts.bold, color: colors.white },
  helpText: { ...type.caption, color: colors.textDim, marginTop: 2, lineHeight: 16 },

  cartBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.md,
    backgroundColor: colors.cardHigh,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    ...shadow.card,
  },
  cartSummary: { flex: 1 },
  cartCount: { ...type.micro, fontFamily: fonts.semibold, color: colors.textDim },
  cartTotal: { fontFamily: fonts.numBold, fontSize: 17, color: colors.white, marginTop: 2 },
  cartBarEmpty: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.md,
    backgroundColor: colors.cardHigh,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  cartEmptyText: { ...type.caption, color: colors.textDim, textAlign: 'center' },

  lineRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  lineName: { ...type.bodyMedium, fontFamily: fonts.bold, color: colors.white },
  lineMeta: { ...type.micro, fontFamily: fonts.medium, color: colors.textFaint, marginTop: 1 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepBtn: {
    width: 28,
    height: 28,
    borderRadius: radius.xs,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cardHigh,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stepValue: { fontFamily: fonts.numBold, fontSize: 13, color: colors.white, minWidth: 18, textAlign: 'center' },
  lineDiscRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: -2,
  },
  lineDiscLabel: { flex: 1, ...type.caption, color: colors.textFaint, fontSize: 11 },
  lineTotal: { fontFamily: fonts.numSemibold, fontSize: 12.5, color: colors.text, minWidth: 74, textAlign: 'right' },
  totalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  totalLabel: { ...type.bodyMedium, fontFamily: fonts.semibold, color: colors.textMuted },
  totalValue: { fontFamily: fonts.numBold, fontSize: 18, color: colors.primary },

  methodRow: { flexDirection: 'row', gap: spacing.sm },
  method: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  methodActive: { borderColor: colors.primaryBorder, backgroundColor: colors.primarySoft },
  methodLabel: { fontFamily: fonts.semibold, fontSize: 10.5, color: colors.textMuted },
  hintText: {
    ...type.caption,
    color: colors.textDim,
    marginTop: spacing.xs,
    lineHeight: 16,
  },
  methodHint: { ...type.caption, color: colors.textDim, marginTop: spacing.sm, lineHeight: 16 },

  quickRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  customerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  customerChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    maxWidth: '100%',
  },
  customerChipActive: { borderColor: colors.primaryBorder, backgroundColor: colors.primarySoft },
  customerChipText: { ...type.label, color: colors.textMuted },
  quickChip: {
    flex: 1,
    height: 34,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickChipActive: {
    borderColor: colors.primaryBorder,
    backgroundColor: colors.primarySoft,
  },
  quickText: { fontFamily: fonts.semibold, fontSize: 10.5, color: colors.textMuted },
  changeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  changeLabel: { ...type.caption, fontFamily: fonts.semibold, color: colors.textMuted },
  changeValue: { fontFamily: fonts.numBold, fontSize: 16 },
  errorText: { ...type.caption, color: colors.danger, marginTop: spacing.sm },

  changeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    marginBottom: spacing.md,
  },
  changeCardLabel: { ...type.caption, fontFamily: fonts.semibold, color: colors.primary },
  changeCardValue: { fontFamily: fonts.numBold, fontSize: 18, color: colors.primary },

  receiptPaper: {
    backgroundColor: '#f7f5ef',
    borderRadius: radius.md,
    padding: spacing.md,
  },
  receiptText: { fontFamily: fonts.mono, fontSize: 10, lineHeight: 14.5, color: '#26221a' },
  printState: { ...type.caption, color: colors.textDim, marginTop: spacing.sm },

  newProductHint: { ...type.caption, color: colors.textDim, lineHeight: 16 },
  fieldRow: { flexDirection: 'row', gap: spacing.sm },
});
