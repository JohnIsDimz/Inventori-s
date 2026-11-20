/**
 * Buat pesanan baru (kuotasi).
 *
 * Alur dibuat secepat kasir: cari barang → tap untuk menambah → atur jumlah →
 * simpan. Barang yang tidak ada di katalog bisa ditambahkan sebagai "barang
 * bebas" karena banyak warung menerima pesanan barang yang belum pernah dijual.
 */
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TextField } from '../src/components/Field';
import { Icon } from '../src/components/Icon';
import { Button, Card, Chip, Divider, SectionTitle } from '../src/components/Primitives';
import { orderItemSummary, orderRemaining, orderTotal } from '../src/data/orders';
import { useAppStore } from '../src/data/store';
import type { OrderItem } from '../src/data/types';
import { colors, fonts, radius, spacing, type } from '../src/theme/tokens';
import { formatRupiah } from '../src/utils/format';

const DUE_OPTIONS = [
  { id: 'hari-ini', label: 'Hari ini', days: 0 },
  { id: 'besok', label: 'Besok', days: 1 },
  { id: '3-hari', label: '3 hari', days: 3 },
  { id: '7-hari', label: '1 minggu', days: 7 },
] as const;

const isoFromDays = (days: number): string => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(9, 0, 0, 0);
  return date.toISOString();
};

export default function PesananBaruScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const products = useAppStore((s) => s.products);
  const addOrder = useAppStore((s) => s.addOrder);

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<OrderItem[]>([]);
  const [dueChoice, setDueChoice] = useState<string>('besok');
  const [note, setNote] = useState('');
  const [freeName, setFreeName] = useState('');
  const [freePrice, setFreePrice] = useState('');
  const [depositText, setDepositText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const list = needle
      ? products.filter(
          (product) =>
            product.name.toLowerCase().includes(needle) ||
            (product.barcode ?? '').toLowerCase().includes(needle),
        )
      : products;
    return list.slice(0, 40);
  }, [products, search]);

  const total = orderTotal(items);
  const deposit = Math.min(
    total,
    Number(depositText.replace(/[^0-9]/g, '')) || 0,
  );
  const remaining = orderRemaining({ total, deposit });

  const addProduct = (productId: string) => {
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    setItems((current) => {
      const existing = current.find((item) => item.productId === productId);
      if (existing) {
        return current.map((item) =>
          item.productId === productId ? { ...item, qty: item.qty + 1 } : item,
        );
      }
      const wholesale =
        product.wholesalePrice && product.wholesaleMinQty && product.wholesaleMinQty <= 1
          ? product.wholesalePrice
          : product.sellPrice;
      return [
        ...current,
        { productId, name: product.name, qty: 1, price: wholesale },
      ];
    });
    setError(null);
  };

  const changeQty = (index: number, delta: number) => {
    setItems((current) =>
      current
        .map((item, i) => (i === index ? { ...item, qty: Math.round((item.qty + delta) * 100) / 100 } : item))
        .filter((item) => item.qty > 0),
    );
  };

  const addFreeItem = () => {
    const name = freeName.trim();
    const price = Number(freePrice.replace(/[^0-9.]/g, '').replace(/\./g, ''));
    if (!name) {
      setError('Nama barang bebas tidak boleh kosong.');
      return;
    }
    if (!Number.isFinite(price) || price <= 0) {
      setError('Harga barang bebas harus lebih dari 0.');
      return;
    }
    setItems((current) => [...current, { name, qty: 1, price }]);
    setFreeName('');
    setFreePrice('');
    setError(null);
  };

  const fillDeposit = (portion: number) => {
    const value = Math.round(total * portion);
    setDepositText(value > 0 ? String(value) : '');
  };

  const submit = () => {
    if (!customerName.trim()) {
      setError('Nama pelanggan wajib diisi.');
      return;
    }
    if (items.length === 0) {
      setError('Tambahkan minimal satu barang.');
      return;
    }
    if (deposit > total) {
      setError('Uang muka tidak boleh melebihi total pesanan.');
      return;
    }
    const option = DUE_OPTIONS.find((entry) => entry.id === dueChoice);
    const result = addOrder({
      customerName,
      customerPhone,
      items,
      dueDate: option ? isoFromDays(option.days) : undefined,
      note,
      deposit,
    });
    if (!result.ok) {
      setError(result.reason);
      return;
    }
    router.replace('/pesanan');
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => router.back()} style={styles.iconButton} hitSlop={8}>
          <Icon name="chevronLeft" size={17} color={colors.textMuted} strokeWidth={2} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Pesanan baru</Text>
          <Text style={styles.headerSubtitle}>Belum mengurangi stok</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 120 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {error ? (
          <View style={styles.errorBox}>
            <Icon name="alert" size={15} color={colors.danger} strokeWidth={2} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <Card style={{ gap: spacing.md }}>
          <TextField
            label="NAMA PELANGGAN"
            placeholder="Contoh: Bu Ratna"
            value={customerName}
            onChangeText={setCustomerName}
            icon="user"
            maxLength={60}
          />
          <TextField
            label="NOMOR WHATSAPP (OPSIONAL)"
            placeholder="0812…"
            value={customerPhone}
            onChangeText={setCustomerPhone}
            icon="phone"
            keyboardType="phone-pad"
            maxLength={24}
          />
        </Card>

        <View>
          <SectionTitle title="Barang pesanan" icon="package" />
          <Card style={{ gap: spacing.sm }}>
            <TextField
              placeholder="Cari barang untuk ditambahkan"
              value={search}
              onChangeText={setSearch}
              icon="search"
            />
            <View style={{ gap: spacing.xs }}>
              {filtered.length === 0 ? (
                <Text style={styles.hint}>
                  Tidak ada barang yang cocok. Tambahkan sebagai barang bebas di bawah.
                </Text>
              ) : null}
              {filtered.map((product) => {
                const picked = items.find((item) => item.productId === product.id);
                return (
                  <Pressable
                    key={product.id}
                    onPress={() => addProduct(product.id)}
                    style={[styles.productRow, picked && styles.productRowPicked]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.productName} numberOfLines={1}>
                        {product.name}
                      </Text>
                      <Text style={styles.productMeta}>
                        {formatRupiah(product.sellPrice)} • sisa {product.stock} {product.unit}
                      </Text>
                    </View>
                    {picked ? <Chip label={`${picked.qty} dipilih`} tone="primary" size="sm" /> : null}
                    <Icon name="plus" size={16} color={colors.primary} strokeWidth={2.2} />
                  </Pressable>
                );
              })}
            </View>

            <Divider />
            <Text style={styles.label}>BARANG BEBAS (TIDAK ADA DI KATALOG)</Text>
            <View style={styles.freeRow}>
              <View style={{ flex: 1 }}>
                <TextField placeholder="Nama barang" value={freeName} onChangeText={setFreeName} />
              </View>
              <View style={{ width: 118 }}>
                <TextField
                  placeholder="Harga"
                  value={freePrice}
                  onChangeText={setFreePrice}
                  keyboardType="number-pad"
                />
              </View>
            </View>
            <Button label="Tambahkan barang bebas" variant="secondary" size="sm" icon="plus" onPress={addFreeItem} />
          </Card>
        </View>

        {items.length > 0 ? (
          <View>
            <SectionTitle title={`Rincian (${orderItemSummary(items)})`} icon="receipt" />
            <Card style={{ gap: spacing.sm }}>
              {items.map((item, index) => (
                <View key={`${item.productId ?? 'free'}-${index}`} style={{ gap: spacing.sm }}>
                  {index > 0 ? <Divider /> : null}
                  <View style={styles.rowBetween}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={styles.productName} numberOfLines={2}>
                        {item.name}
                      </Text>
                      <Text style={styles.productMeta}>
                        {formatRupiah(item.price)} × {item.qty} = {formatRupiah(item.price * item.qty)}
                      </Text>
                    </View>
                    <View style={styles.stepper}>
                      <Pressable onPress={() => changeQty(index, -1)} hitSlop={6} style={styles.stepButton}>
                        <Icon name="minus" size={14} color={colors.text} strokeWidth={2.2} />
                      </Pressable>
                      <Text style={styles.stepValue}>{item.qty}</Text>
                      <Pressable onPress={() => changeQty(index, 1)} hitSlop={6} style={styles.stepButton}>
                        <Icon name="plus" size={14} color={colors.text} strokeWidth={2.2} />
                      </Pressable>
                    </View>
                  </View>
                </View>
              ))}
            </Card>
          </View>
        ) : null}

        <View>
          <SectionTitle title="Uang muka (DP)" icon="wallet" />
          <Card style={{ gap: spacing.sm }}>
            <Text style={styles.hint}>
              Opsional. DP dicatat ke kas saat pesanan diserahkan, sisanya bisa jadi kasbon.
            </Text>
            <TextField
              label="JUMLAH DP (Rp)"
              placeholder="0"
              value={depositText}
              onChangeText={setDepositText}
              keyboardType="number-pad"
              icon="wallet"
            />
            <View style={styles.chipRow}>
              <Pressable onPress={() => fillDeposit(0)}>
                <Chip label="Tanpa DP" tone={deposit === 0 ? 'primary' : 'neutral'} size="sm" />
              </Pressable>
              <Pressable onPress={() => fillDeposit(0.5)}>
                <Chip label="Setengah" tone="neutral" size="sm" />
              </Pressable>
              <Pressable onPress={() => fillDeposit(1)}>
                <Chip label="Lunas" tone={deposit >= total && total > 0 ? 'primary' : 'neutral'} size="sm" />
              </Pressable>
            </View>
            {total > 0 ? (
              <Text style={styles.hint}>
                Total {formatRupiah(total)} • DP {formatRupiah(deposit)} • sisa saat diambil{' '}
                <Text style={{ color: remaining > 0 ? colors.amber : colors.primary, fontFamily: fonts.semibold }}>
                  {formatRupiah(remaining)}
                </Text>
              </Text>
            ) : null}
          </Card>
        </View>

        <View>
          <SectionTitle title="Kapan diambil?" icon="calendar" />
          <Card style={{ gap: spacing.md }}>
            <View style={styles.chipRow}>
              {DUE_OPTIONS.map((option) => (
                <Pressable key={option.id} onPress={() => setDueChoice(option.id)}>
                  <Chip
                    label={option.label}
                    tone={dueChoice === option.id ? 'primary' : 'neutral'}
                    size="sm"
                  />
                </Pressable>
              ))}
            </View>
            <TextField
              label="CATATAN (OPSIONAL)"
              placeholder="Contoh: ambil sore, dibungkus"
              value={note}
              onChangeText={setNote}
              multiline
              maxLength={240}
            />
          </Card>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.footerLabel}>TOTAL PESANAN</Text>
          <Text style={styles.footerValue}>{formatRupiah(total)}</Text>
        </View>
        <Button label="Simpan pesanan" icon="check" onPress={submit} style={{ width: 190 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerTitle: { ...type.h2, fontSize: 15, color: colors.white },
  headerSubtitle: { ...type.caption, color: colors.textDim, marginTop: 1 },
  content: { padding: spacing.base, gap: spacing.lg },
  label: { ...type.micro, fontFamily: fonts.semibold, color: colors.textFaint, letterSpacing: 0.4 },
  hint: { ...type.caption, color: colors.textFaint, lineHeight: 17 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardHigh,
  },
  productRowPicked: { borderColor: colors.primaryBorder, backgroundColor: colors.primarySoft },
  productName: { ...type.body, fontFamily: fonts.semibold, color: colors.text },
  productMeta: { ...type.caption, color: colors.textFaint, marginTop: 1 },
  freeRow: { flexDirection: 'row', gap: spacing.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  stepButton: {
    width: 26,
    height: 26,
    borderRadius: radius.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepValue: { ...type.num, fontFamily: fonts.numBold, color: colors.text, minWidth: 22, textAlign: 'center' },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
  },
  errorText: { ...type.caption, color: colors.danger, flex: 1, lineHeight: 17 },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bgDeep,
  },
  footerLabel: { ...type.micro, fontFamily: fonts.semibold, color: colors.textFaint, letterSpacing: 0.4 },
  footerValue: { ...type.numLg, fontFamily: fonts.numBold, color: colors.primary, marginTop: 2 },
});
