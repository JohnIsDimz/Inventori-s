import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TextField } from '../src/components/Field';
import { BarcodeScanner } from '../src/components/BarcodeScanner';
import { Icon } from '../src/components/Icon';
import {
  Button,
  Card,
  Chip,
  EmptyState,
  IconBadge,
  ProgressBar,
  SectionLabel,
  Sheet,
} from '../src/components/Primitives';
import { lowStock, stockValue } from '../src/data/selectors';
import { useAppStore } from '../src/data/store';
import { useScopedData } from '../src/data/scope';
import type { Product } from '../src/data/types';
import { colors, fonts, radius, spacing, type } from '../src/theme/tokens';
import {
  formatCompactRupiah,
  formatRupiah,
  marginPercent,
  markupPercent,
  maskNominal,
  parseNumber,
} from '../src/utils/format';

export default function StokScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const data = useScopedData();
  const upsertProduct = useAppStore((s) => s.upsertProduct);
  const deleteProduct = useAppStore((s) => s.deleteProduct);
  const adjustStock = useAppStore((s) => s.adjustStock);

  const [query, setQuery] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('pcs');
  const [sellPrice, setSellPrice] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [stock, setStock] = useState('');
  const [minStock, setMinStock] = useState('5');
  const [barcode, setBarcode] = useState('');
  const [wholesalePrice, setWholesalePrice] = useState('');
  const [wholesaleMinQty, setWholesaleMinQty] = useState('');
  const [scanOpen, setScanOpen] = useState(false);

  const critical = lowStock(data);
  const totalValue = stockValue(data);
  const filtered = useMemo(
    () =>
      data.products.filter((p) => p.name.toLowerCase().includes(query.trim().toLowerCase())),
    [data.products, query],
  );

  const openNew = () => {
    setEditing(null);
    setName('');
    setUnit('pcs');
    setSellPrice('');
    setCostPrice('');
    setStock('');
    setMinStock('5');
    setBarcode('');
    setWholesalePrice('');
    setWholesaleMinQty('');
    setSheetOpen(true);
  };

  const openEdit = (product: Product) => {
    setFormError(null);
    setEditing(product);
    setName(product.name);
    setUnit(product.unit);
    setSellPrice(maskNominal(String(product.sellPrice)));
    setCostPrice(maskNominal(String(product.costPrice)));
    setStock(String(product.stock));
    setMinStock(String(product.minStock));
    setBarcode(product.barcode ?? '');
    setWholesalePrice(product.wholesalePrice ? maskNominal(String(product.wholesalePrice)) : '');
    setWholesaleMinQty(product.wholesaleMinQty ? String(product.wholesaleMinQty) : '');
    setSheetOpen(true);
  };

  const [formError, setFormError] = useState<string | null>(null);

  const submit = () => {
    if (!name.trim()) return;
    const result = upsertProduct({
      id: editing?.id,
      name: name.trim(),
      unit: unit.trim() || 'pcs',
      sellPrice: parseNumber(sellPrice),
      costPrice: parseNumber(costPrice),
      stock: parseNumber(stock),
      minStock: parseNumber(minStock),
      barcode: barcode.trim() || undefined,
      wholesalePrice: wholesalePrice.trim() ? parseNumber(wholesalePrice) : undefined,
      wholesaleMinQty: wholesaleMinQty.trim() ? parseNumber(wholesaleMinQty) : undefined,
    });
    if (!result.ok) {
      setFormError(result.reason);
      return;
    }
    setFormError(null);
    setSheetOpen(false);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconButton} hitSlop={10}>
          <Icon name="chevronLeft" size={17} color={colors.textMuted} strokeWidth={2} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Katalog & stok</Text>
          <Text style={styles.headerSubtitle}>{data.profile.name || 'Toko Anda'}</Text>
        </View>
        <Pressable onPress={openNew} style={styles.addButton} hitSlop={8}>
          <Icon name="plus" size={16} color={colors.onPrimary} strokeWidth={2.4} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.statsRow}>
          <Card style={styles.statCard}>
            <IconBadge name="package" tone="secondary" size={32} />
            <Text style={styles.statValue}>{data.products.length}</Text>
            <Text style={styles.statLabel}>Jenis barang</Text>
          </Card>
          <Card style={styles.statCard}>
            <IconBadge name="coins" tone="primary" size={32} />
            <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
              {formatCompactRupiah(totalValue)}
            </Text>
            <Text style={styles.statLabel}>Nilai stok (modal)</Text>
          </Card>
          <Card style={[styles.statCard, critical.length > 0 && { borderColor: colors.amberBorder }]}>
            <IconBadge name="alert" tone="amber" size={32} />
            <Text style={styles.statValue}>{critical.length}</Text>
            <Text style={styles.statLabel}>Stok menipis</Text>
          </Card>
        </View>

        <Button
          label="Hitung stok fisik"
          icon="checkCircle"
          variant="secondary"
          onPress={() => router.push('/opname')}
        />

        <TextField
          icon="search"
          placeholder="Cari barang"
          value={query}
          onChangeText={setQuery}
        />
        <Text style={styles.helpText}>
          Tombol − / + untuk koreksi cepat satu barang. Untuk menghitung banyak barang sekaligus, pakai
          Hitung stok fisik di atas. Penjualan yang dicatat dengan rincian barang mengurangi stok otomatis.
        </Text>

        {data.products.length === 0 ? (
          <Card>
            <EmptyState
              icon="package"
              title="Katalog masih kosong"
              description="Tambahkan barang dagangan beserta harga jual, harga modal, dan stok minimum. Aplikasi akan mengingatkan saat stok menipis."
              action={<Button label="Tambah barang" icon="plus" onPress={openNew} />}
            />
          </Card>
        ) : (
          <Card padded={false}>
            {filtered.length === 0 ? (
              <EmptyState compact icon="search" title="Barang tidak ditemukan" description="Coba kata kunci lain." />
            ) : (
              filtered.map((product, index) => {
                const isCritical = product.stock <= product.minStock;
                const ratio = product.minStock > 0 ? Math.min(1, product.stock / (product.minStock * 3)) : 1;
                return (
                  <View
                    key={product.id}
                    style={[styles.productRow, index !== filtered.length - 1 && styles.productBorder]}
                  >
                    <View style={styles.productTop}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <View style={styles.productNameRow}>
                          <Text style={styles.productName} numberOfLines={1}>
                            {product.name}
                          </Text>
                          {isCritical ? <Chip label="Menipis" tone="amber" size="sm" /> : null}
                        </View>
                      </View>

                      <View style={styles.stockControls}>
                        <Pressable
                          style={styles.stepButton}
                          onPress={() => {
                            const result = adjustStock(product.id, -1);
                            if (!result.ok) Alert.alert('Stok tidak bisa dikurangi', result.reason);
                          }}
                          hitSlop={10}
                          accessibilityLabel={`Kurangi stok ${product.name}`}
                        >
                          <Icon name="minus" size={13} color={colors.tertiary} strokeWidth={2.4} />
                        </Pressable>
                        <View style={styles.stockValueBox}>
                          <Text style={styles.stockValue}>{product.stock}</Text>
                          <Text style={styles.stockUnit}>{product.unit}</Text>
                        </View>
                        <Pressable
                          style={styles.stepButton}
                          onPress={() => adjustStock(product.id, 1)}
                          hitSlop={10}
                          accessibilityLabel={`Tambah stok ${product.name}`}
                        >
                          <Icon name="plus" size={13} color={colors.primary} strokeWidth={2.4} />
                        </Pressable>
                      </View>
                    </View>

                    {/* Rincian harga diberi lebar penuh supaya tidak terpotong. */}
                    <Text style={styles.productMeta} numberOfLines={1}>
                      Jual {formatRupiah(product.sellPrice)} • modal {formatRupiah(product.costPrice)}
                      {marginPercent(product.sellPrice, product.costPrice) !== null
                        ? ` • margin ${marginPercent(product.sellPrice, product.costPrice)}%`
                        : ''}
                    </Text>
                    <View style={styles.productMetaRow}>
                      <Text style={styles.productMetaSecond} numberOfLines={1}>
                        min {product.minStock} {product.unit}
                        {product.wholesalePrice && product.wholesaleMinQty
                          ? ` • grosir ${formatRupiah(product.wholesalePrice)}/${product.wholesaleMinQty}`
                          : ''}
                      </Text>
                    </View>
                    <View style={{ marginTop: 6 }}>
                      <ProgressBar progress={ratio} tone={isCritical ? 'amber' : 'primary'} height={4} />
                    </View>

                    <View style={styles.productActions}>
                      <Pressable onPress={() => openEdit(product)} style={styles.smallAction} hitSlop={10}>
                        <Icon name="edit" size={12} color={colors.textMuted} strokeWidth={1.9} />
                        <Text style={styles.smallActionText}>Ubah</Text>
                      </Pressable>
                      <Pressable
                        hitSlop={10}
                        onPress={() =>
                          Alert.alert('Hapus barang?', product.name, [
                            { text: 'Batal', style: 'cancel' },
                            { text: 'Hapus', style: 'destructive', onPress: () => {
                              const result = deleteProduct(product.id);
                              if (!result.ok) Alert.alert('Tidak bisa dihapus', result.reason);
                            } },
                          ])
                        }
                        style={styles.smallAction}
                      >
                        <Icon name="trash" size={12} color={colors.danger} strokeWidth={1.9} />
                        <Text style={[styles.smallActionText, { color: colors.danger }]}>Hapus</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })
            )}
          </Card>
        )}
      </ScrollView>

      <Sheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={editing ? 'Ubah barang' : 'Barang baru'}
        subtitle="Harga modal dipakai untuk menghitung laba kotor."
      >
        <View style={{ gap: spacing.md }}>
          <TextField label="Nama barang" placeholder="Beras Rojolele 5kg" icon="package" value={name} onChangeText={setName} />
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <TextField label="Satuan" placeholder="pcs" value={unit} onChangeText={setUnit} style={{ flex: 1 }} />
            <TextField
              label="Stok saat ini"
              keyboardType="number-pad"
              placeholder="0"
              value={stock}
              onChangeText={(text) => setStock(maskNominal(text))}
              style={{ flex: 1 }}
            />
            <TextField
              label="Stok minimum"
              keyboardType="number-pad"
              placeholder="5"
              value={minStock}
              onChangeText={(text) => setMinStock(maskNominal(text))}
              style={{ flex: 1 }}
            />
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-end' }}>
            <TextField
              label="Barcode / kode barang"
              icon="scan"
              placeholder="Pindai atau ketik kode"
              value={barcode}
              onChangeText={setBarcode}
              autoCapitalize="none"
              autoCorrect={false}
              style={{ flex: 1 }}
            />
            <Pressable
              onPress={() => setScanOpen(true)}
              style={styles.scanButton}
              hitSlop={6}
              accessibilityLabel="Pindai barcode barang"
            >
              <Icon name="scan" size={16} color={colors.primary} strokeWidth={1.9} />
            </Pressable>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <TextField
              label="Harga jual"
              prefix="Rp"
              keyboardType="number-pad"
              placeholder="0"
              value={sellPrice}
              onChangeText={(text) => setSellPrice(maskNominal(text))}
              style={{ flex: 1 }}
            />
            <TextField
              label="Harga modal"
              prefix="Rp"
              keyboardType="number-pad"
              placeholder="0"
              value={costPrice}
              onChangeText={(text) => setCostPrice(maskNominal(text))}
              style={{ flex: 1 }}
            />
          </View>
          <MarginPreview sell={parseNumber(sellPrice)} cost={parseNumber(costPrice)} unit={unit || 'pcs'} />
          <Text style={styles.groupLabel}>Harga grosir (opsional)</Text>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <TextField
              label="Harga per satuan"
              prefix="Rp"
              keyboardType="number-pad"
              placeholder="Kosongkan"
              value={wholesalePrice}
              onChangeText={(text) => setWholesalePrice(maskNominal(text))}
              style={{ flex: 1 }}
            />
            <TextField
              label="Minimal jumlah"
              keyboardType="number-pad"
              placeholder="5"
              value={wholesaleMinQty}
              onChangeText={(text) => setWholesaleMinQty(text.replace(/[^0-9]/g, ''))}
              style={{ flex: 1 }}
            />
          </View>
          <Text style={styles.wholesaleHint}>
            Isi keduanya bila ada harga kulakan. Kasir otomatis memakai harga ini saat jumlah
            mencapai batas. Kosongkan bila tidak ada.
          </Text>
        </View>
        {formError ? <Text style={styles.formError}>{formError}</Text> : null}
        <Button
          label={editing ? 'Simpan perubahan' : 'Tambah barang'}
          icon="check"
          onPress={submit}
          disabled={!name.trim()}
          style={{ marginTop: spacing.base }}
        />
        {editing ? (
          <Button
            label="Riwayat harga beli"
            icon="chart"
            variant="ghost"
            onPress={() => {
              const id = editing.id;
              setSheetOpen(false);
              router.push({ pathname: '/harga-beli', params: { product: id } });
            }}
            style={{ marginTop: spacing.sm }}
          />
        ) : null}
      </Sheet>

      <BarcodeScanner
        visible={scanOpen}
        onClose={() => setScanOpen(false)}
        onScanned={(code) => {
          setScanOpen(false);
          setBarcode(code);
        }}
        title="Pindai barcode barang"
      />
    </View>
  );
}

/**
 * Ringkasan untung per satuan: nominal, margin (% dari harga jual), dan
 * markup (% dari harga modal). Dua persentase ditampilkan karena pemilik
 * warung sering memakai istilah "untung 20%" untuk keduanya.
 */
function MarginPreview({ sell, cost, unit }: { sell: number; cost: number; unit: string }) {
  const margin = marginPercent(sell, cost);
  const markup = markupPercent(sell, cost);

  if (sell <= 0) {
    return <SectionLabel>{`Isi harga jual untuk melihat untung per ${unit}`}</SectionLabel>;
  }

  return (
    <View style={styles.marginBox}>
      <View style={styles.marginCol}>
        <Text style={styles.marginLabel}>Untung per {unit}</Text>
        <Text style={styles.marginValue}>{formatRupiah(Math.max(0, sell - cost))}</Text>
      </View>
      <View style={styles.marginDivider} />
      <View style={styles.marginCol}>
        <Text style={styles.marginLabel}>Margin</Text>
        <Text style={[styles.marginValue, { color: margin !== null && margin < 0 ? colors.danger : colors.primary }]}>
          {margin === null ? '—' : `${margin}%`}
        </Text>
      </View>
      <View style={styles.marginDivider} />
      <View style={styles.marginCol}>
        <Text style={styles.marginLabel}>Markup</Text>
        <Text style={styles.marginValue}>{markup === null ? '—' : `${markup}%`}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scanButton: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  marginBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  marginCol: { flex: 1, gap: 2 },
  marginDivider: { width: 1, height: 26, backgroundColor: colors.border, marginHorizontal: spacing.sm },
  marginLabel: { ...type.micro, fontFamily: fonts.semibold, color: colors.textDim },
  marginValue: { fontFamily: fonts.numBold, fontSize: 13.5, color: colors.white },
  helpText: { ...type.micro, fontFamily: fonts.medium, color: colors.textFaint, lineHeight: 15 },
  groupLabel: {
    ...type.caption,
    color: colors.textDim,
    marginTop: spacing.md,
    marginBottom: 2,
  },
  wholesaleHint: { ...type.micro, color: colors.textFaint, lineHeight: 14 },
  formError: { ...type.caption, color: colors.danger, marginTop: spacing.base },
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
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
  addButton: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  headerTitle: { ...type.h2, fontSize: 15, color: colors.white },
  headerSubtitle: { ...type.caption, color: colors.textDim, marginTop: 1 },

  content: { padding: spacing.base, gap: spacing.lg, paddingBottom: 40 },
  statsRow: { flexDirection: 'row', gap: spacing.sm },
  statCard: { flex: 1, flexBasis: 0, padding: spacing.md, gap: 4, alignItems: 'flex-start' },
  statValue: { fontFamily: fonts.numBold, fontSize: 14, color: colors.white, marginTop: 2 },
  statLabel: { ...type.micro, fontFamily: fonts.medium, color: colors.textFaint },

  productRow: { padding: spacing.md, gap: spacing.sm },
  productBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  productTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  productNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  productName: { ...type.bodyMedium, fontFamily: fonts.bold, color: colors.white, flexShrink: 1 },
  productMetaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 2 },
  productMetaSecond: { ...type.caption, color: colors.textFaint },
  productMeta: { ...type.micro, fontFamily: fonts.medium, color: colors.textDim, marginTop: 2 },

  stockControls: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepButton: {
    width: 26,
    height: 26,
    borderRadius: radius.xs,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cardHigh,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stockValueBox: { alignItems: 'center', minWidth: 34 },
  stockValue: { fontFamily: fonts.numBold, fontSize: 14, color: colors.white },
  stockUnit: { ...type.micro, fontFamily: fonts.medium, color: colors.textFaint },

  productActions: { flexDirection: 'row', gap: spacing.md },
  smallAction: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4 },
  smallActionText: { fontFamily: fonts.semibold, fontSize: 10.5, color: colors.textMuted },
});
