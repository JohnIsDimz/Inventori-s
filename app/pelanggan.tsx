import { appAlert } from '../src/utils/alert';
/**
 * Buku pelanggan (Sprint 11).
 *
 * Satu tempat untuk melihat siapa pelanggan tetap toko: nomor HP, total
 * belanja, poin, dan kasbon yang belum lunas. Tujuannya sangat praktis —
 * supaya kasbon tidak tertukar antar pelanggan bernama mirip, dan supaya
 * pemilik warung tahu siapa yang paling sering belanja.
 *
 * Semua hitungan diambil dari fungsi murni di `src/data/customers.ts` supaya
 * angka di layar ini sama dengan yang diuji (`npm run test:customers`).
 */
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TextField } from '../src/components/Field';
import { Icon } from '../src/components/Icon';
import {
  Button,
  Card,
  Chip,
  Divider,
  EmptyState,
  IconBadge,
  ProgressBar,
  SectionLabel,
  Sheet,
} from '../src/components/Primitives';
import {
  customerBadge,
  customerRows,
  customerStats,
  displayPhone,
  searchCustomers,
  spendToNextTier,
  whatsappNumber,
  type CustomerRow,
} from '../src/data/customers';
import { useAppStore } from '../src/data/store';
import type { Customer } from '../src/data/types';
import { colors, radius, spacing, type } from '../src/theme/tokens';
import { formatRupiah, formatTanggalSingkat, initials } from '../src/utils/format';

export default function PelangganScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const data = useAppStore();
  const addCustomer = useAppStore((s) => s.addCustomer);
  const updateCustomer = useAppStore((s) => s.updateCustomer);
  const deleteCustomer = useAppStore((s) => s.deleteCustomer);

  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Customer | null>(null);
  const [detail, setDetail] = useState<Customer | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const rows = useMemo(
    () =>
      customerRows({
        customers: data.customers,
        transactions: data.transactions,
        receivables: data.receivables,
        orders: data.orders,
      }),
    [data.customers, data.transactions, data.receivables, data.orders],
  );

  const filtered = useMemo(() => {
    const matched = new Set(searchCustomers(data.customers, query).map((item) => item.id));
    return rows.filter((row) => matched.has(row.customer.id));
  }, [rows, data.customers, query]);

  const withKasbon = rows.filter((row) => row.stats.kasbonOpen > 0).length;
  const totalPoints = rows.reduce((sum, row) => sum + row.stats.points, 0);

  const openNew = () => {
    setEditing(null);
    setName('');
    setPhone('');
    setNote('');
    setFormError(null);
    setFormOpen(true);
  };

  const openEdit = (customer: Customer) => {
    setEditing(customer);
    setName(customer.name);
    setPhone(customer.phone ? displayPhone(customer.phone) : '');
    setNote(customer.note ?? '');
    setFormError(null);
    setFormOpen(true);
  };

  const submit = () => {
    const result = editing
      ? updateCustomer(editing.id, { name, phone, note })
      : addCustomer({ name, phone, note });
    if (!result.ok) {
      setFormError(result.reason);
      return;
    }
    setFormError(null);
    setFormOpen(false);
    if (editing) {
      const fresh = useAppStore.getState().customers.find((item) => item.id === editing.id);
      if (fresh) setDetail(fresh);
    }
  };

  const remove = (customer: Customer) => {
    appAlert.alert(
      'Hapus pelanggan?',
      `"${customer.name}" akan dihapus dari buku pelanggan. Riwayat transaksi dan kasbonnya tetap tersimpan dengan namanya.`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Hapus',
          style: 'destructive',
          onPress: () => {
            const result = deleteCustomer(customer.id);
            if (!result.ok) {
              appAlert.alert('Belum bisa dihapus', result.reason);
              return;
            }
            setDetail(null);
          },
        },
      ],
    );
  };

  const sendMessage = async (customer: Customer, remaining: number) => {
    const number = whatsappNumber(customer);
    if (!number) return;
    const store = data.profile.name.trim() || 'toko kami';
    const message =
      remaining > 0
        ? `Halo ${customer.name}, ini ${store}. Kami catat kasbon Bapak/Ibu sebesar ${formatRupiah(
            remaining,
          )}. Mohon dibayarkan bila sudah memungkinkan ya. Terima kasih.`
        : `Halo ${customer.name}, terima kasih sudah belanja di ${store}. Bila butuh apa-apa lagi, kabari kami ya.`;
    const url = `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
    try {
      await Linking.openURL(url);
    } catch {
      appAlert.alert('Belum bisa membuka WhatsApp', 'Nomor pelanggan sudah tersimpan. Buka WhatsApp sendiri lalu cari nomornya ya.');
    }
  };

  const detailStats = detail
    ? customerStats(
        { transactions: data.transactions, receivables: data.receivables, orders: data.orders },
        detail,
      )
    : null;
  const detailHistory = detail
    ? data.transactions
        .filter((tx) => tx.customerId === detail.id)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 5)
    : [];

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconButton} hitSlop={10}>
          <Icon name="chevronLeft" size={17} color={colors.textMuted} strokeWidth={2} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Pelanggan</Text>
          <Text style={styles.headerSub}>
            {rows.length === 0
              ? 'Belum ada pelanggan tersimpan'
              : `${rows.length} pelanggan • ${withKasbon} punya kasbon`}
          </Text>
        </View>
        <Pressable
          onPress={openNew}
          style={styles.addButton}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Tambah pelanggan"
        >
          <Icon name="userPlus" size={16} color={colors.onPrimary} strokeWidth={2.2} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {rows.length === 0 ? (
          <Card>
            <EmptyState
              icon="users"
              title="Belum ada pelanggan"
              description="Simpan nama dan nomor HP pelanggan tetap. Kasbon tidak akan tertukar, dan pengingat bisa langsung dikirim lewat WhatsApp."
              action={<Button label="Tambah pelanggan" icon="userPlus" onPress={openNew} />}
            />
          </Card>
        ) : (
          <>
            <View style={styles.statsRow}>
              <Card style={styles.statCard} padded={false}>
                <Text style={styles.statLabel}>Pelanggan tersimpan</Text>
                <Text style={styles.statValue}>{rows.length}</Text>
              </Card>
              <Card style={styles.statCard} padded={false}>
                <Text style={styles.statLabel}>Total poin</Text>
                <Text style={[styles.statValue, { color: colors.secondary }]}>{totalPoints}</Text>
              </Card>
            </View>

            <TextField
              icon="search"
              placeholder="Cari nama atau nomor HP"
              value={query}
              onChangeText={setQuery}
            />

            {filtered.length === 0 ? (
              <Card>
                <EmptyState
                  icon="search"
                  title="Tidak ditemukan"
                  description="Coba nama lain atau beberapa angka terakhir nomor HP."
                />
              </Card>
            ) : (
              <Card padded={false}>
                {filtered.map((row, index) => (
                  <CustomerListRow
                    key={row.customer.id}
                    row={row}
                    last={index === filtered.length - 1}
                    onPress={() => setDetail(row.customer)}
                  />
                ))}
              </Card>
            )}

            <Card tone="flat">
              <Text style={styles.hintText}>
                Poin dihitung otomatis: setiap Rp 10.000 belanja jadi 1 poin. Tidak perlu dicatat
                manual, dan tidak akan dobel saat data dipulihkan dari cadangan.
              </Text>
            </Card>
          </>
        )}
      </ScrollView>

      {/* Form tambah / ubah */}
      <Sheet
        visible={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? 'Ubah pelanggan' : 'Pelanggan baru'}
        subtitle={
          editing
            ? 'Perubahan nama ikut memperbarui kasbon yang belum lunas.'
            : 'Cukup nama. Nomor HP dipakai untuk mengirim pengingat.'
        }
      >
        <View style={{ gap: spacing.md }}>
          <TextField
            label="Nama pelanggan"
            icon="user"
            placeholder="Contoh: Bu Ratna"
            value={name}
            onChangeText={setName}
          />
          <TextField
            label="Nomor HP (opsional)"
            icon="phone"
            keyboardType="phone-pad"
            placeholder="0812 3456 7890"
            value={phone}
            onChangeText={setPhone}
          />
          <TextField
            label="Catatan (opsional)"
            icon="edit"
            placeholder="Contoh: langganan kue basah tiap Sabtu"
            value={note}
            onChangeText={setNote}
          />
        </View>
        <SectionLabel>{'Nomor HP hanya disimpan di HP ini.'}</SectionLabel>
        {formError ? <Text style={styles.formError}>{formError}</Text> : null}
        <Button
          label={editing ? 'Simpan perubahan' : 'Tambah pelanggan'}
          icon="check"
          onPress={submit}
          disabled={!name.trim()}
          style={{ marginTop: spacing.base }}
        />
      </Sheet>

      {/* Rincian pelanggan */}
      <Sheet
        visible={detail !== null}
        onClose={() => setDetail(null)}
        title={detail?.name ?? 'Pelanggan'}
        subtitle={detail?.phone ? displayPhone(detail.phone) : 'Nomor HP belum diisi'}
      >
        {detail && detailStats ? (
          <View style={{ gap: spacing.md }}>
            <View style={styles.detailTop}>
              <View style={styles.avatarLg}>
                <Text style={styles.avatarLgText}>{initials(detail.name)}</Text>
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Chip
                  label={detailStats.tier.label}
                  tone={detailStats.tier.level === 2 ? 'primary' : detailStats.tier.level === 1 ? 'secondary' : 'neutral'}
                  icon={detailStats.tier.level > 0 ? 'sparkle' : undefined}
                  size="sm"
                />
                <Text style={styles.detailMeta}>
                  {detailStats.visits === 0
                    ? 'Belum pernah belanja'
                    : `${detailStats.visits} kali belanja • terakhir ${formatTanggalSingkat(
                        detailStats.lastVisitAt ?? '',
                      )}`}
                </Text>
              </View>
            </View>

            <View style={styles.detailStatsRow}>
              <View style={styles.detailStat}>
                <Text style={styles.detailStatLabel}>Total belanja</Text>
                <Text style={styles.detailStatValue} numberOfLines={1} adjustsFontSizeToFit>
                  {formatRupiah(detailStats.totalSpend)}
                </Text>
              </View>
              <View style={styles.detailStatDivider} />
              <View style={styles.detailStat}>
                <Text style={styles.detailStatLabel}>Poin</Text>
                <Text style={[styles.detailStatValue, { color: colors.secondary }]}>
                  {detailStats.points}
                </Text>
              </View>
              <View style={styles.detailStatDivider} />
              <View style={styles.detailStat}>
                <Text style={styles.detailStatLabel}>Kasbon</Text>
                <Text
                  style={[
                    styles.detailStatValue,
                    { color: detailStats.kasbonOpen > 0 ? colors.amber : colors.primary },
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {formatRupiah(detailStats.kasbonOpen)}
                </Text>
              </View>
            </View>

            {detailStats.tier.nextAt !== null ? (
              <View style={{ gap: 6 }}>
                <ProgressBar
                  progress={
                    detailStats.tier.nextAt === 0
                      ? 0
                      : Math.min(1, detailStats.totalSpend / detailStats.tier.nextAt)
                  }
                />
                <Text style={styles.progressHint}>
                  {`${formatRupiah(spendToNextTier(detailStats))} lagi menuju ${nextTierLabel(
                    detailStats.tier.level,
                  )}.`}
                </Text>
              </View>
            ) : (
              <Text style={styles.progressHint}>
                Pelanggan paling setia — sudah melewati batas langganan.
              </Text>
            )}

            {detailStats.kasbonCount > 0 ? (
              <Card tone="flat" style={{ borderColor: colors.amberBorder, backgroundColor: colors.amberSoft }}>
                <View style={styles.warnRow}>
                  <Icon name="alert" size={15} color={colors.amber} strokeWidth={2} />
                  <Text style={styles.warnText}>
                    {`Ada ${detailStats.kasbonCount} kasbon belum lunas. Lihat rinciannya di menu Kasbon.`}
                  </Text>
                </View>
              </Card>
            ) : null}

            <View>
              <SectionLabel>{'Belanja terakhir'}</SectionLabel>
              {detailHistory.length === 0 ? (
                <Text style={styles.emptyHint}>
                  Belum ada catatan belanja. Pilih pelanggan ini saat mencatat kasbon atau pesanan.
                </Text>
              ) : (
                <Card padded={false} tone="flat">
                  {detailHistory.map((tx, index) => (
                    <View
                      key={tx.id}
                      style={[styles.historyRow, index !== detailHistory.length - 1 && styles.historyBorder]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.historyDate}>{formatTanggalSingkat(tx.createdAt)}</Text>
                        <Text style={styles.historyMeta} numberOfLines={1}>
                          {tx.method === 'kasbon' ? 'Kasbon' : tx.method === 'cash' ? 'Tunai' : tx.method === 'qris' ? 'QRIS' : 'Transfer'}
                          {tx.items && tx.items.length > 0 ? ` • ${tx.items.length} barang` : ''}
                        </Text>
                      </View>
                      <Text style={styles.historyAmount}>{formatRupiah(tx.amount)}</Text>
                    </View>
                  ))}
                </Card>
              )}
            </View>

            <View style={{ gap: spacing.sm }}>
              {whatsappNumber(detail) ? (
                <Button
                  label="Kirim pesan WhatsApp"
                  icon="whatsapp"
                  variant="secondary"
                  onPress={() => void sendMessage(detail, detailStats.kasbonOpen)}
                />
              ) : (
                <Button label="Tambah nomor HP" icon="phone" variant="ghost" onPress={() => openEdit(detail)} />
              )}
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <Button
                  label="Ubah"
                  icon="edit"
                  variant="ghost"
                  style={{ flex: 1 }}
                  onPress={() => {
                    setDetail(null);
                    openEdit(detail);
                  }}
                />
                <Button
                  label="Hapus"
                  icon="trash"
                  variant="danger"
                  style={{ flex: 1 }}
                  onPress={() => remove(detail)}
                />
              </View>
            </View>
          </View>
        ) : null}
      </Sheet>
    </View>
  );
}

function nextTierLabel(level: 0 | 1 | 2): string {
  if (level === 0) return 'Sering belanja';
  if (level === 1) return 'Langganan setia';
  return 'langganan setia';
}

function CustomerListRow({
  row,
  last,
  onPress,
}: {
  row: CustomerRow;
  last: boolean;
  onPress: () => void;
}) {
  const { customer, stats } = row;
  return (
    <Pressable
      onPress={onPress}
      style={[styles.row, !last && styles.rowBorder]}
      accessibilityRole="button"
      accessibilityLabel={`Buka pelanggan ${customer.name}`}
    >
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{initials(customer.name)}</Text>
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={styles.rowName} numberOfLines={1}>
          {customer.name}
        </Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {customer.phone ? displayPhone(customer.phone) : 'Nomor HP belum diisi'}
        </Text>
        <View style={styles.rowChips}>
          <Chip label={customerBadge(stats)} tone={stats.kasbonOpen > 0 ? 'amber' : 'neutral'} size="sm" />
          {stats.totalSpend > 0 ? (
            <Chip label={formatRupiah(stats.totalSpend)} tone="primary" size="sm" />
          ) : null}
        </View>
      </View>
      <Icon name="chevronRight" size={15} color={colors.textFaint} strokeWidth={2} />
    </Pressable>
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
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { ...type.h1, color: colors.text },
  headerSub: { ...type.caption, color: colors.textDim, marginTop: 2 },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { paddingHorizontal: spacing.base, paddingBottom: spacing.xxl, gap: spacing.md },
  statsRow: { flexDirection: 'row', gap: spacing.md },
  statCard: { flex: 1, padding: spacing.md, gap: 4 },
  statLabel: { ...type.caption, color: colors.textDim },
  statValue: { ...type.h1, color: colors.text },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
  },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: radius.xs,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { ...type.label, color: colors.primary },
  avatarLg: {
    width: 52,
    height: 52,
    borderRadius: radius.sm,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLgText: { ...type.h2, color: colors.primary },
  rowName: { ...type.h3, color: colors.text },
  rowMeta: { ...type.caption, color: colors.textDim },
  rowChips: { flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' },
  hintText: { ...type.caption, color: colors.textDim, lineHeight: 18 },
  formError: { ...type.caption, color: colors.danger, marginTop: spacing.sm },
  detailTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  detailMeta: { ...type.caption, color: colors.textDim },
  detailStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  detailStat: { flex: 1, gap: 3 },
  detailStatDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: colors.border,
    marginHorizontal: spacing.sm,
  },
  detailStatLabel: { ...type.micro, color: colors.textDim },
  detailStatValue: { ...type.num, color: colors.text },
  progressHint: { ...type.caption, color: colors.textDim },
  warnRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  warnText: { flex: 1, ...type.caption, color: colors.textMuted, lineHeight: 18 },
  emptyHint: { ...type.caption, color: colors.textDim, paddingVertical: spacing.sm },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  historyBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  historyDate: { ...type.label, color: colors.text },
  historyMeta: { ...type.micro, color: colors.textDim, marginTop: 2 },
  historyAmount: { ...type.num, color: colors.primary },
});
