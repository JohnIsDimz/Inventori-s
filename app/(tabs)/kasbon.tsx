import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppHeader } from '../../src/components/AppHeader';
import { DebtCard } from '../../src/components/DebtCard';
import { DebtPaymentSheet } from '../../src/components/DebtPaymentSheet';
import { TextField } from '../../src/components/Field';
import { Icon } from '../../src/components/Icon';
import {
  Button,
  Card,
  Chip,
  EmptyState,
  SectionLabel,
  Segmented,
  Sheet,
} from '../../src/components/Primitives';
import {
  activePayables,
  activeReceivables,
  debtPaid,
  debtRemaining,
  debtSettled,
  payableSummary,
  receivableSummary,
} from '../../src/data/selectors';
import { useAppStore } from '../../src/data/store';
import { useScopedData } from '../../src/data/scope';
import type { PayMethod, Receivable } from '../../src/data/types';
import { colors, fonts, radius, spacing, type } from '../../src/theme/tokens';
import {
  addDays,
  formatRupiah,
  formatTanggalSingkat,
  maskNominal,
  parseNumber,
} from '../../src/utils/format';
import { buildReminderMessage, shareMessage } from '../../src/utils/reminder';

type Tab = 'pelanggan' | 'supplier' | 'lunas';

export default function KasbonScreen() {
  const router = useRouter();
  const data = useScopedData();
  const addReceivable = useAppStore((s) => s.addReceivable);
  const addPayable = useAppStore((s) => s.addPayable);
  const payReceivable = useAppStore((s) => s.payReceivable);
  const payPayable = useAppStore((s) => s.payPayable);

  const [tab, setTab] = useState<Tab>('pelanggan');
  const [query, setQuery] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [addKind, setAddKind] = useState<'pelanggan' | 'supplier'>('pelanggan');
  const [name, setName] = useState('');
  /** Diisi bila pelanggan dipilih dari buku pelanggan (Sprint 11). */
  const [customerId, setCustomerId] = useState<string | undefined>(undefined);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [dueDays, setDueDays] = useState(7);
  const [payTarget, setPayTarget] = useState<{ id: string; name: string; remaining: number; kind: 'rcv' | 'pay' } | null>(
    null,
  );

  const rcv = receivableSummary(data);
  const pay = payableSummary(data);
  const receivables = activeReceivables(data);
  const payables = activePayables(data);

  const filteredReceivables = useMemo(
    () =>
      receivables.filter(
        (r) =>
          r.customerName.toLowerCase().includes(query.trim().toLowerCase()) ||
          (r.note ?? '').toLowerCase().includes(query.trim().toLowerCase()),
      ),
    [receivables, query],
  );

  const filteredPayables = useMemo(
    () =>
      payables.filter((p) =>
        p.supplierName.toLowerCase().includes(query.trim().toLowerCase()),
      ),
    [payables, query],
  );

  const settledList = useMemo(() => {
    const items: { id: string; name: string; amount: number; date: string; kind: 'rcv' | 'pay' }[] = [];
    for (const r of data.receivables) {
      if (debtSettled(r)) items.push({ id: r.id, name: r.customerName, amount: r.amount, date: r.dueDate, kind: 'rcv' });
    }
    for (const p of data.payables) {
      if (debtSettled(p)) items.push({ id: p.id, name: p.supplierName, amount: p.amount, date: p.dueDate, kind: 'pay' });
    }
    return items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [data.receivables, data.payables]);

  const remind = (item: Receivable) => {
    const message = buildReminderMessage({
      template: data.settings.reminderTemplate,
      customerName: item.customerName,
      storeName: data.profile.name,
      amount: debtRemaining(item),
      dueDate: item.dueDate,
      itemCount: item.items?.length,
    });
    shareMessage(message, `Pengingat kasbon ${item.customerName}`);
  };

  const [addError, setAddError] = useState<string | null>(null);

  const openAdd = (kind: 'pelanggan' | 'supplier') => {
    setAddKind(kind);
    setAddError(null);
    setCustomerId(undefined);
    setAddOpen(true);
  };

  const submitAdd = () => {
    const value = parseNumber(amount);
    if (!name.trim() || value <= 0) return;
    const dueDate = addDays(new Date(), dueDays).toISOString();

    const result =
      addKind === 'pelanggan'
        ? addReceivable({ customerName: name, customerId, amount: value, dueDate, note })
        : addPayable({ supplierName: name, amount: value, dueDate, note });

    if (!result.ok) {
      setAddError(result.reason);
      return;
    }

    setAddError(null);
    setName('');
    setCustomerId(undefined);
    setAmount('');
    setNote('');
    setDueDays(7);
    setAddOpen(false);
  };

  return (
    <View style={styles.root}>
      <AppHeader subtitle="Kasbon & utang" />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Ringkasan */}
        <View style={styles.summaryRow}>
          <Card style={styles.summaryCard} tone="default">
            <View style={styles.summaryHead}>
              <View style={[styles.summaryIcon, { backgroundColor: colors.amberSoft, borderColor: colors.amberBorder }]}>
                <Icon name="users" size={15} color={colors.amber} strokeWidth={1.9} />
              </View>
              <Text style={styles.summaryTitle}>Kasbon pelanggan</Text>
            </View>
            <Text style={[styles.summaryValue, { color: colors.amber }]} numberOfLines={1} adjustsFontSizeToFit>
              {formatRupiah(rcv.outstanding)}
            </Text>
            <View style={styles.summaryMeta}>
              <Chip label={`${rcv.activeCount} aktif`} tone="neutral" size="sm" />
              {rcv.overdueCount > 0 ? (
                <Chip label={`${rcv.overdueCount} telat`} tone="danger" size="sm" />
              ) : null}
            </View>
          </Card>

          <Card style={styles.summaryCard} tone="default">
            <View style={styles.summaryHead}>
              <View style={[styles.summaryIcon, { backgroundColor: colors.tertiarySoft, borderColor: colors.tertiaryBorder }]}>
                <Icon name="truck" size={15} color={colors.tertiary} strokeWidth={1.9} />
              </View>
              <Text style={styles.summaryTitle}>Utang supplier</Text>
            </View>
            <Text style={[styles.summaryValue, { color: colors.tertiary }]} numberOfLines={1} adjustsFontSizeToFit>
              {formatRupiah(pay.outstanding)}
            </Text>
            <View style={styles.summaryMeta}>
              <Chip label={`${pay.activeCount} aktif`} tone="neutral" size="sm" />
              {pay.overdueCount > 0 ? <Chip label={`${pay.overdueCount} telat`} tone="danger" size="sm" /> : null}
            </View>
          </Card>
        </View>

        <View style={styles.actionRow}>
          <Button
            label="Kasbon baru"
            icon="plus"
            onPress={() => { openAdd('pelanggan'); }}
            style={{ flex: 1 }}
          />
          <Button
            label="Utang kulakan"
            icon="truck"
            variant="ghost"
            onPress={() => { openAdd('supplier'); }}
            style={{ flex: 1 }}
          />
        </View>

        <Button
          label="Tagih kasbon lewat WhatsApp"
          icon="whatsapp"
          variant="ghost"
          onPress={() => router.push('/tagih-kasbon')}
          fullWidth
        />

        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'pelanggan', label: 'Pelanggan', badge: String(rcv.activeCount) },
            { value: 'supplier', label: 'Supplier', badge: String(pay.activeCount) },
            { value: 'lunas', label: 'Lunas', badge: String(settledList.length) },
          ]}
        />

        {tab !== 'lunas' ? (
          <TextField
            icon="search"
            placeholder={tab === 'pelanggan' ? 'Cari nama pelanggan' : 'Cari nama supplier'}
            value={query}
            onChangeText={setQuery}
          />
        ) : null}

        {/* Daftar */}
        {tab === 'pelanggan' ? (
          filteredReceivables.length === 0 ? (
            <Card>
              <EmptyState
                icon="book"
                title={receivables.length === 0 ? 'Belum ada kasbon' : 'Tidak ditemukan'}
                description={
                  receivables.length === 0
                    ? 'Catat barang yang diambil dulu oleh pelanggan. Aplikasi mengingatkan saat jatuh tempo dan menghitung sisa tagihannya.'
                    : 'Coba nama lain.'
                }
                action={
                  receivables.length === 0 ? (
                    <Button label="Catat kasbon" icon="plus" onPress={() => { openAdd('pelanggan'); }} />
                  ) : undefined
                }
              />
            </Card>
          ) : (
            <Card padded={false}>
              {filteredReceivables.map((item, index) => (
                <DebtCard
                  key={item.id}
                  name={item.customerName}
                  amount={item.amount}
                  paid={debtPaid(item)}
                  dueDate={item.dueDate}
                  note={item.note}
                  itemCount={item.items?.length}
                  last={index === filteredReceivables.length - 1}
                  onPress={() => router.push(`/kasbon/${item.id}`)}
                  onRemind={() => remind(item)}
                  onPay={() =>
                    setPayTarget({
                      id: item.id,
                      name: item.customerName,
                      remaining: debtRemaining(item),
                      kind: 'rcv',
                    })
                  }
                />
              ))}
            </Card>
          )
        ) : null}

        {tab === 'supplier' ? (
          filteredPayables.length === 0 ? (
            <Card>
              <EmptyState
                icon="truck"
                title="Belum ada utang kulakan"
                description="Catat barang yang diambil dari agen dengan tempo pembayaran agar jatuh temponya tidak terlewat."
                action={
                  <Button
                    label="Catat utang"
                    icon="plus"
                    onPress={() => { openAdd('supplier'); }}
                  />
                }
              />
            </Card>
          ) : (
            <Card padded={false}>
              {filteredPayables.map((item, index) => (
                <DebtCard
                  key={item.id}
                  name={item.supplierName}
                  amount={item.amount}
                  paid={debtPaid(item)}
                  dueDate={item.dueDate}
                  note={item.note}
                  last={index === filteredPayables.length - 1}
                  onPay={() =>
                    setPayTarget({
                      id: item.id,
                      name: item.supplierName,
                      remaining: debtRemaining(item),
                      kind: 'pay',
                    })
                  }
                />
              ))}
            </Card>
          )
        ) : null}

        {tab === 'lunas' ? (
          settledList.length === 0 ? (
            <Card>
              <EmptyState
                icon="checkCircle"
                title="Belum ada yang lunas"
                description="Kasbon dan utang yang sudah dibayar penuh akan diarsipkan di sini."
              />
            </Card>
          ) : (
            <Card padded={false}>
              {settledList.map((item, index) => (
                <View
                  key={`${item.kind}-${item.id}`}
                  style={[styles.settledRow, index !== settledList.length - 1 && styles.settledBorder]}
                >
                  <View style={styles.settledIcon}>
                    <Icon name="check" size={13} color={colors.primary} strokeWidth={2.4} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.settledName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={styles.settledMeta}>
                      {item.kind === 'rcv' ? 'Kasbon pelanggan' : 'Utang supplier'} • jatuh tempo{' '}
                      {formatTanggalSingkat(item.date)}
                    </Text>
                  </View>
                  <Text style={styles.settledAmount}>{formatRupiah(item.amount)}</Text>
                </View>
              ))}
            </Card>
          )
        ) : null}

        {rcv.overdueAmount > 0 ? (
          <Card style={{ borderColor: colors.dangerBorder, backgroundColor: colors.dangerSoft }}>
            <View style={styles.warnRow}>
              <Icon name="alert" size={16} color={colors.danger} strokeWidth={2} />
              <Text style={styles.warnText}>
                Ada {formatRupiah(rcv.overdueAmount)} kasbon melewati jatuh tempo. Kirim pengingat santun lewat
                tombol Ingatkan.
              </Text>
            </View>
          </Card>
        ) : null}
      </ScrollView>

      {/* Sheet tambah */}
      <Sheet
        visible={addOpen}
        onClose={() => setAddOpen(false)}
        title={addKind === 'pelanggan' ? 'Kasbon pelanggan baru' : 'Utang kulakan baru'}
        subtitle={
          addKind === 'pelanggan'
            ? 'Barang diambil dulu, dibayar saat jatuh tempo.'
            : 'Barang diterima dari agen, pembayaran dijadwalkan.'
        }
      >
        <View style={styles.sheetSegmented}>
          <Segmented
            value={addKind}
            onChange={setAddKind}
            options={[
              { value: 'pelanggan', label: 'Piutang pelanggan' },
              { value: 'supplier', label: 'Utang supplier' },
            ]}
          />
        </View>

        <View style={{ gap: spacing.md }}>
          {addKind === 'pelanggan' && data.customers.length > 0 ? (
            <View style={{ gap: spacing.sm }}>
              <SectionLabel>{'Pilih pelanggan tersimpan'}</SectionLabel>
              <View style={styles.customerRow}>
                {data.customers.slice(0, 8).map((customer) => {
                  const active = customerId === customer.id;
                  return (
                    <Pressable
                      key={customer.id}
                      onPress={() => {
                        setCustomerId(customer.id);
                        setName(customer.name);
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
            label={addKind === 'pelanggan' ? 'Nama pelanggan' : 'Nama supplier / agen'}
            placeholder={addKind === 'pelanggan' ? 'Contoh: Bu Sri' : 'Contoh: Agen Sumber Rejeki'}
            icon="user"
            value={name}
            onChangeText={(text) => {
              setName(text);
              setCustomerId(undefined);
            }}
          />
          <TextField
            label="Nominal"
            prefix="Rp"
            keyboardType="number-pad"
            placeholder="0"
            value={amount}
            onChangeText={(text) => setAmount(maskNominal(text))}
          />
          <View>
            <Text style={styles.sheetLabel}>Jatuh tempo</Text>
            <View style={styles.dueRow}>
              {[3, 7, 14, 30].map((days) => {
                const active = dueDays === days;
                return (
                  <Pressable
                    key={days}
                    onPress={() => setDueDays(days)}
                    style={[styles.dueChip, active && { backgroundColor: colors.primarySoft, borderColor: colors.primaryBorder }]}
                  >
                    <Text style={[styles.dueChipText, active && { color: colors.primary }]}>{days} hari</Text>
                  </Pressable>
                );
              })}
              <Text style={styles.dueDate}>
                {formatTanggalSingkat(addDays(new Date(), dueDays).toISOString())}
              </Text>
            </View>
          </View>
          <TextField
            label="Catatan (opsional)"
            placeholder="Contoh: Telur 2kg + minyak 1L"
            icon="edit"
            value={note}
            onChangeText={setNote}
          />
        </View>

        {addError ? <Text style={styles.errorText}>{addError}</Text> : null}

        <Button
          label="Simpan"
          icon="check"
          onPress={submitAdd}
          disabled={!name.trim() || parseNumber(amount) <= 0}
          style={{ marginTop: spacing.lg }}
        />
      </Sheet>

      {/* Sheet bayar */}
      <DebtPaymentSheet
        visible={payTarget !== null}
        onClose={() => setPayTarget(null)}
        title={`Pembayaran ${payTarget?.name ?? ''}`}
        subtitle="Pembayaran langsung menambah kas masuk."
        remaining={payTarget?.remaining ?? 0}
        onSubmit={(value: number, method: PayMethod) => {
          if (!payTarget) return;
          return payTarget.kind === 'rcv'
            ? payReceivable(payTarget.id, value, method)
            : payPayable(payTarget.id, value, method);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  errorText: { ...type.caption, color: colors.danger, marginTop: spacing.md },
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.base, gap: spacing.lg, paddingBottom: 104 },

  summaryRow: { flexDirection: 'row', gap: spacing.sm },
  summaryCard: { flex: 1, padding: spacing.md, gap: 6 },
  summaryHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  summaryIcon: {
    width: 26,
    height: 26,
    borderRadius: radius.xs,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  summaryTitle: { ...type.micro, fontFamily: fonts.bold, color: colors.textMuted, flexShrink: 1 },
  summaryValue: { fontFamily: fonts.numBold, fontSize: 17, letterSpacing: -0.5 },
  summaryMeta: { flexDirection: 'row', gap: 4, flexWrap: 'wrap' },

  actionRow: { flexDirection: 'row', gap: spacing.sm },

  settledRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  settledBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  settledIcon: {
    width: 26,
    height: 26,
    borderRadius: radius.xs,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  settledName: { ...type.caption, fontFamily: fonts.bold, color: colors.text },
  settledMeta: { ...type.micro, fontFamily: fonts.medium, color: colors.textFaint, marginTop: 1 },
  settledAmount: { fontFamily: fonts.numSemibold, fontSize: 12, color: colors.primary },

  warnRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  warnText: { ...type.caption, color: colors.textMuted, flex: 1, lineHeight: 16 },

  sheetSegmented: { marginBottom: spacing.base },
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
  sheetLabel: {
    ...type.micro,
    color: colors.textDim,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  dueRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  dueChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.sm,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dueChipText: { fontFamily: fonts.semibold, fontSize: 11, color: colors.textMuted },
  dueDate: { ...type.caption, color: colors.textDim, marginLeft: 'auto' },
});
