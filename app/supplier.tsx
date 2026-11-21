import { appAlert } from '../src/utils/alert';
/**
 * Buku supplier (Sprint 15).
 *
 * Tujuannya sederhana: pemilik warung bisa melihat **ke siapa** ia berutang dan
 * **berapa** — tanpa membuka satu per satu nota kulakan. Supplier juga bisa
 * disimpan nomor HP-nya supaya gampang dihubungi saat mau retur atau menagih
 * nota.
 *
 * Semua angka diambil dari fungsi murni di `src/data/suppliers.ts`, sehingga
 * layar ini menampilkan hitungan yang sama dengan yang diuji
 * (`npm run test:suppliers`).
 */
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TextField } from '../src/components/Field';
import { Icon } from '../src/components/Icon';
import {
  Button,
  Card,
  Chip,
  EmptyState,
  SectionLabel,
  Sheet,
} from '../src/components/Primitives';
import {
  displaySupplierPhone,
  supplierKey,
  supplierStats,
  validateSupplier,
} from '../src/data/suppliers';
import { useAppStore } from '../src/data/store';
import type { Supplier } from '../src/data/types';
import { colors, radius, spacing, type } from '../src/theme/tokens';
import { formatRupiah, formatTanggalSingkat, initials } from '../src/utils/format';

interface Draft {
  id?: string;
  name: string;
  phone: string;
  address: string;
  note: string;
}

const emptyDraft: Draft = { name: '', phone: '', address: '', note: '' };

export default function SupplierScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const suppliers = useAppStore((s) => s.suppliers);
  const purchases = useAppStore((s) => s.purchases);
  const payables = useAppStore((s) => s.payables);
  const returns = useAppStore((s) => s.purchaseReturns);
  const addSupplier = useAppStore((s) => s.addSupplier);
  const updateSupplier = useAppStore((s) => s.updateSupplier);
  const archiveSupplier = useAppStore((s) => s.archiveSupplier);

  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const active = useMemo(() => suppliers.filter((row) => !row.archivedAt), [suppliers]);

  const rows = useMemo(() => {
    const text = query.trim().toLowerCase();
    const list = active.map((supplier) => ({
      supplier,
      stats: supplierStats(supplier.name, purchases, payables, returns),
    }));
    if (!text) return list;
    return list.filter(
      (row) =>
        row.supplier.name.toLowerCase().includes(text) ||
        (row.supplier.phone ?? '').includes(text.replace(/[^\d]/g, '')),
    );
  }, [active, purchases, payables, returns, query]);

  const detail = detailId ? active.find((row) => row.id === detailId) ?? null : null;
  const detailStats = detail
    ? supplierStats(detail.name, purchases, payables, returns)
    : null;
  const detailPurchases = detail
    ? purchases.filter((row) => supplierKey(row.supplierName) === supplierKey(detail.name)).slice(0, 3)
    : [];

  const totalDebt = rows.reduce((sum, row) => sum + row.stats.debtTotal, 0);

  const openAdd = () => {
    setError(null);
    setDraft({ ...emptyDraft });
  };

  const openEdit = (supplier: Supplier) => {
    setError(null);
    setDraft({
      id: supplier.id,
      name: supplier.name,
      phone: supplier.phone ?? '',
      address: supplier.address ?? '',
      note: supplier.note ?? '',
    });
  };

  const submitDraft = () => {
    if (!draft) return;
    const checked = validateSupplier(
      { name: draft.name, phone: draft.phone, address: draft.address, note: draft.note },
      suppliers,
      draft.id,
    );
    if (!checked.ok) {
      setError(checked.reason);
      return;
    }
    const result = draft.id
      ? updateSupplier(draft.id, {
          name: checked.value.name,
          phone: checked.value.phone ?? '',
          address: checked.value.address ?? '',
          note: checked.value.note ?? '',
        })
      : addSupplier({ name: checked.value.name, phone: checked.value.phone });
    if (!result.ok) {
      setError(result.reason);
      return;
    }
    setDraft(null);
    setError(null);
  };

  const confirmArchive = (supplier: Supplier) => {
    appAlert.alert(
      'Arsipkan supplier?',
      `${supplier.name} akan hilang dari daftar. Riwayat kulakan dan utangnya tetap tersimpan.`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Arsipkan',
          style: 'destructive',
          onPress: () => {
            const result = archiveSupplier(supplier.id);
            if (!result.ok) {
              setError(result.reason);
              return;
            }
            setDetailId(null);
          },
        },
      ],
    );
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconButton} hitSlop={10}>
          <Icon name="chevronLeft" size={17} color={colors.textMuted} strokeWidth={2} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Buku supplier</Text>
          <Text style={styles.headerSub}>
            {active.length === 0
              ? 'Belum ada supplier'
              : totalDebt > 0
                ? `${active.length} supplier • utang ${formatRupiah(totalDebt)}`
                : `${active.length} supplier • tidak ada utang`}
          </Text>
        </View>
        <Pressable
          onPress={openAdd}
          style={styles.addButton}
          hitSlop={10}
          accessibilityLabel="Tambah supplier"
        >
          <Icon name="plus" size={17} color={colors.bg} strokeWidth={2.4} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <TextField
          icon="search"
          placeholder="Cari nama supplier"
          value={query}
          onChangeText={setQuery}
        />

        {rows.length === 0 ? (
          <Card>
            <EmptyState
              icon="truck"
              title={active.length === 0 ? 'Belum ada supplier' : 'Supplier tidak ditemukan'}
              description={
                active.length === 0
                  ? 'Supplier otomatis tercatat saat kamu menyimpan kulakan. Bisa juga ditambahkan di sini lebih dulu.'
                  : 'Coba kata lain, atau tambahkan supplier baru.'
              }
              action={
                active.length === 0 ? (
                  <Button label="Tambah supplier" icon="plus" onPress={openAdd} />
                ) : undefined
              }
            />
          </Card>
        ) : (
          <Card padded={false}>
            {rows.map((row, index) => (
              <Pressable
                key={row.supplier.id}
                onPress={() => setDetailId(row.supplier.id)}
                style={[styles.row, index !== rows.length - 1 && styles.rowBorder]}
                accessibilityLabel={`Buka supplier ${row.supplier.name}`}
              >
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{initials(row.supplier.name)}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.rowName} numberOfLines={1}>
                    {row.supplier.name}
                  </Text>
                  <Text style={styles.rowMeta} numberOfLines={1}>
                    {displaySupplierPhone(row.supplier.phone) || 'Nomor belum diisi'} •{' '}
                    {row.stats.purchaseCount} kulakan
                  </Text>
                </View>
                {row.stats.debtTotal > 0 ? (
                  <Chip label={`Utang ${formatRupiah(row.stats.debtTotal)}`} tone="amber" size="sm" />
                ) : row.stats.creditAvailable > 0 ? (
                  <Chip label="Ada saldo retur" tone="secondary" size="sm" />
                ) : (
                  <Icon name="chevronRight" size={15} color={colors.textFaint} strokeWidth={2} />
                )}
              </Pressable>
            ))}
          </Card>
        )}

        <Text style={styles.footNote}>
          Supplier tercatat otomatis dari kulakan yang sudah kamu simpan. Nomor HP hanya dipakai
          untuk menghubungi supplier.
        </Text>
      </ScrollView>

      <Sheet
        visible={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.id ? 'Ubah supplier' : 'Supplier baru'}
        subtitle="Nama saja sudah cukup. Nomor HP membantu saat mau retur."
      >
        {draft ? (
          <View style={{ gap: spacing.md }}>
            <TextField
              label="Nama supplier"
              icon="truck"
              placeholder="Contoh: Agen Sumber Rejeki"
              value={draft.name}
              onChangeText={(text) => {
                setDraft({ ...draft, name: text });
                setError(null);
              }}
              maxLength={60}
            />
            <TextField
              label="Nomor HP (opsional)"
              icon="phone"
              keyboardType="phone-pad"
              placeholder="08xx"
              value={draft.phone}
              onChangeText={(text) => setDraft({ ...draft, phone: text })}
              maxLength={18}
            />
            <TextField
              label="Alamat (opsional)"
              icon="home"
              placeholder="Contoh: Pasar Induk, blok C"
              value={draft.address}
              onChangeText={(text) => setDraft({ ...draft, address: text })}
              maxLength={120}
            />
            <TextField
              label="Catatan (opsional)"
              icon="edit"
              placeholder="Contoh: antar tiap Selasa"
              value={draft.note}
              onChangeText={(text) => setDraft({ ...draft, note: text })}
              maxLength={120}
            />
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            <Button label="Simpan" icon="check" onPress={submitDraft} fullWidth />
          </View>
        ) : null}
      </Sheet>

      <Sheet
        visible={detail !== null}
        onClose={() => setDetailId(null)}
        title={detail?.name ?? ''}
        subtitle={detail ? displaySupplierPhone(detail.phone) || 'Nomor belum diisi' : undefined}
      >
        {detail && detailStats ? (
          <View style={{ gap: spacing.md }}>
            <View style={styles.stats}>
              <Stat label="Kulakan" value={String(detailStats.purchaseCount)} />
              <View style={styles.statDivider} />
              <Stat
                label="Utang"
                value={
                  detailStats.debtTotal > 0 ? formatRupiah(detailStats.debtTotal) : 'Lunas'
                }
                tone={detailStats.debtTotal > 0 ? colors.amber : colors.primary}
              />
              <View style={styles.statDivider} />
              <Stat
                label="Saldo retur"
                value={detailStats.creditAvailable > 0 ? formatRupiah(detailStats.creditAvailable) : '—'}
                tone={colors.secondary}
              />
            </View>

            {detail.address || detail.note ? (
              <Card tone="flat">
                {detail.address ? (
                  <Text style={styles.detailLine}>Alamat: {detail.address}</Text>
                ) : null}
                {detail.note ? <Text style={styles.detailLine}>Catatan: {detail.note}</Text> : null}
              </Card>
            ) : null}

            {detailPurchases.length > 0 ? (
              <View>
                <SectionLabel>KULAKAN TERAKHIR</SectionLabel>
                <Card padded={false} tone="flat">
                  {detailPurchases.map((row, index) => (
                    <View
                      key={row.id}
                      style={[styles.historyRow, index !== detailPurchases.length - 1 && styles.rowBorder]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rowName}>{formatTanggalSingkat(row.createdAt)}</Text>
                        <Text style={styles.rowMeta}>
                          {row.items.length} barang • {row.items.reduce((sum, item) => sum + item.qty, 0)} unit
                        </Text>
                      </View>
                      <Text style={styles.historyValue}>{formatRupiah(row.total)}</Text>
                    </View>
                  ))}
                </Card>
              </View>
            ) : null}

            <View style={{ gap: spacing.sm }}>
              <Button
                label="Retur barang"
                icon="refresh"
                onPress={() => {
                  const name = detail.name;
                  setDetailId(null);
                  router.push({ pathname: '/retur', params: { supplier: name } });
                }}
                fullWidth
              />
              <View style={styles.actionRow}>
                <Button
                  label="Catat kulakan"
                  icon="truck"
                  variant="ghost"
                  onPress={() => {
                    setDetailId(null);
                    router.push('/pembelian');
                  }}
                  style={{ flex: 1 }}
                />
                <Button
                  label="Ubah"
                  icon="edit"
                  variant="ghost"
                  onPress={() => openEdit(detail)}
                  style={{ flex: 1 }}
                />
              </View>
              <Button
                label="Arsipkan supplier"
                icon="trash"
                variant="ghost"
                onPress={() => confirmArchive(detail)}
                fullWidth
              />
            </View>
          </View>
        ) : null}
      </Sheet>

    </View>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, tone ? { color: tone } : null]}>{value}</Text>
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
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButton: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { ...type.h1, color: colors.text },
  headerSub: { ...type.caption, color: colors.textDim, marginTop: 2 },
  content: { paddingHorizontal: spacing.base, paddingBottom: 40, gap: spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    backgroundColor: colors.cardHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { ...type.label, color: colors.secondary },
  rowName: { ...type.bodyMedium, color: colors.text },
  rowMeta: { ...type.caption, color: colors.textDim, marginTop: 2 },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  historyValue: { ...type.bodyMedium, color: colors.text },
  footNote: { ...type.caption, color: colors.textDim, lineHeight: 18 },
  errorText: { ...type.caption, color: colors.danger },
  stats: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.base,
  },
  stat: { flex: 1, gap: 4 },
  statDivider: { width: 1, height: 28, backgroundColor: colors.border },
  statLabel: { ...type.caption, color: colors.textDim },
  statValue: { ...type.bodyMedium, color: colors.text },
  detailLine: { ...type.caption, color: colors.textMuted, marginBottom: 4 },
  actionRow: { flexDirection: 'row', gap: spacing.sm },
});
