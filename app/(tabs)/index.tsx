import { useCan, useCanSeeProfit } from '../../src/utils/usePermissions';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppHeader } from '../../src/components/AppHeader';
import { Icon, type IconName } from '../../src/components/Icon';
import { TextField } from '../../src/components/Field';
import {
  Button,
  Card,
  Chip,
  Divider,
  EmptyState,
  IconBadge,
  SectionLabel,
  SectionTitle,
  Segmented,
  Sheet,
} from '../../src/components/Primitives';
import { TransactionRow } from '../../src/components/TransactionRow';
import {
  activeReceivables,
  capitalSavings,
  cashBalance,
  debtRemaining,
  lowStock,
  orderSummary,
  receivableSummary,
  recentTransactions,
  todaySummary,
} from '../../src/data/selectors';
import { activeShift } from '../../src/data/selectors';
import { useAppStore } from '../../src/data/store';
import { useScopedData } from '../../src/data/scope';
import { backupReminder } from '../../src/services/backup';
import { colors, fonts, gradients, radius, shadow, spacing, type } from '../../src/theme/tokens';
import {
  formatRupiah,
  formatTanggalSingkat,
  greeting,
  labelJatuhTempo,
  maskNominal,
  parseNumber,
} from '../../src/utils/format';
import { buildReminderMessage, shareMessage } from '../../src/utils/reminder';

const TIPS = [
  'Pisahkan uang laci kas dan tabungan modal setiap tutup buku. Uang kulakan besok pagi jadi aman tanpa mengganggu kebutuhan rumah.',
  'Catat kasbon tepat saat barang diambil — nominal kecil yang lupa dicatat paling sering jadi kerugian warung.',
  'Isi rincian barang saat mencatat penjualan supaya laporan juara penjualan dan laba per barang otomatis terisi.',
  'Stok minimum berguna: begitu barang menyentuh batasnya, aplikasi mengingatkan sebelum pelanggan menanyakan.',
];

export default function BerandaScreen() {
  const router = useRouter();
  const showProfit = useCanSeeProfit();
  const mayVoid = useCan('tx.void');
  const data = useScopedData();
  const settings = useAppStore((s) => s.settings);
  const profile = useAppStore((s) => s.profile);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const moveCapital = useAppStore((s) => s.moveCapital);
  const deleteAllocation = useAppStore((s) => s.deleteAllocation);

  const [savingsOpen, setSavingsOpen] = useState(false);
  const [savingsAmount, setSavingsAmount] = useState('');
  const [savingsDirection, setSavingsDirection] = useState<'in' | 'out'>('in');
  const [savingsError, setSavingsError] = useState<string | null>(null);

  const cash = cashBalance(data);
  const savings = capitalSavings(data);
  const today = todaySummary(data);
  const kasbon = receivableSummary(data);
  const dueList = activeReceivables(data).slice(0, 2);
  const stokKritis = lowStock(data).slice(0, 2);
  const orderSummaryState = orderSummary(data);
  const reminder = backupReminder({
    lastBackupAt: data.settings.lastBackupAt,
    hasData: data.products.length + data.transactions.length > 0,
  });
  const showBackupReminder = reminder.state === 'belum-pernah' || reminder.state === 'waktunya';
  const recent = recentTransactions(data, 3);
  const hidden = settings.hideBalance;
  const tip = TIPS[new Date().getDate() % TIPS.length];
  const needsSetup = profile.name.trim().length === 0;

  const money = (value: number) => (hidden ? 'Rp ••••••' : formatRupiah(value));

  const sendReminder = (name: string, amount: number, dueDate: string, itemCount?: number) => {
    const message = buildReminderMessage({
      template: settings.reminderTemplate,
      customerName: name,
      storeName: profile.name,
      amount,
      dueDate,
      itemCount,
    });
    shareMessage(message, `Pengingat kasbon ${name}`);
  };

  const openCatat = (txType: 'sale' | 'expense') => router.push({ pathname: '/catat', params: { type: txType } });

  // Status shift dipakai untuk memberi tahu kasir apakah laci sedang dibuka.
  const shiftNow = activeShift(data);

  const quickActions: {
    label: string;
    hint: string;
    icon: IconName;
    tone: 'primary' | 'tertiary' | 'amber' | 'secondary' | 'neutral';
    badge?: string;
    onPress: () => void;
  }[] = [
    { label: 'Kasir', hint: 'Jual cepat', icon: 'cart', tone: 'primary', onPress: () => router.push('/kasir') },
    {
      label: 'Shift',
      hint: shiftNow ? 'Berjalan' : 'Buka laci',
      icon: 'clock',
      tone: 'secondary',
      onPress: () => router.push('/shift'),
    },
    { label: 'Pengeluaran', hint: 'Kulakan/biaya', icon: 'banknote', tone: 'tertiary', onPress: () => openCatat('expense') },
    {
      label: 'Buku Kasbon',
      hint: kasbon.activeCount > 0 ? `${kasbon.activeCount} aktif` : 'Piutang',
      icon: 'book',
      tone: 'amber',
      badge: kasbon.overdueCount > 0 ? `${kasbon.overdueCount} telat` : undefined,
      onPress: () => router.push('/kasbon'),
    },
    {
      label: 'Pesanan',
      hint: orderSummaryState.openCount > 0 ? `${orderSummaryState.openCount} terbuka` : 'Kuotasi',
      icon: 'fileText',
      tone: 'secondary',
      onPress: () => router.push('/pesanan'),
    },
    {
      label: 'Kulakan',
      hint: data.purchases.length > 0 ? `${data.purchases.length} tercatat` : 'Belanja stok',
      icon: 'truck',
      tone: 'primary',
      onPress: () => router.push('/pembelian'),
    },
    { label: 'Katalog Stok', hint: stokKritis.length > 0 ? `${stokKritis.length} menipis` : 'Hitung fisik', icon: 'package', tone: 'secondary', onPress: () => router.push('/stok') },
    { label: 'Tabungan', hint: 'Modal usaha', icon: 'coins', tone: 'primary', onPress: () => openSavings('in') },
    {
      label: 'Cadangan',
      hint: 'Simpan data',
      icon: 'database',
      tone: 'secondary',
      onPress: () => router.push('/cadangan'),
    },
    { label: 'Pengaturan', hint: 'Toko & printer', icon: 'settings', tone: 'neutral', onPress: () => router.push('/pengaturan') },
  ];

  const submitSavings = () => {
    const amount = parseNumber(savingsAmount);
    const signed = savingsDirection === 'in' ? amount : -amount;
    const result = moveCapital(signed);
    if (!result.ok) {
      setSavingsError(result.reason);
      return;
    }
    setSavingsError(null);
    setSavingsAmount('');
    setSavingsOpen(false);
  };

  const openSavings = (direction: 'in' | 'out') => {
    setSavingsDirection(direction);
    setSavingsAmount('');
    setSavingsError(null);
    setSavingsOpen(true);
  };

  const availableForMove = savingsDirection === 'in' ? cash : savings;

  return (
    <View style={styles.root}>
      <AppHeader subtitle="Beranda" />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ----------------------------- Kartu saldo ----------------------------- */}
        <View style={styles.heroShadow}>
          <View style={styles.heroClip}>
            <LinearGradient
              colors={gradients.hero}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.heroGlow} />
            <View style={styles.heroBody}>
              <View style={styles.heroTopRow}>
                <Chip label="SALDO KAS USAHA" tone="primary" dot size="sm" />
                <Pressable
                  onPress={() => void updateSettings({ hideBalance: !hidden })}
                  style={styles.eyeButton}
                  hitSlop={8}
                >
                  <Icon
                    name={hidden ? 'eyeOff' : 'eye'}
                    size={14}
                    color={colors.secondary}
                    strokeWidth={1.9}
                  />
                  <Text style={styles.eyeText}>{hidden ? 'Tampilkan' : 'Sembunyikan'}</Text>
                </Pressable>
              </View>

              <Text style={styles.heroGreeting} numberOfLines={1}>
                {greeting()}
                {profile.ownerName.trim() ? `, ${profile.ownerName.trim()}` : ''}
              </Text>
              <View style={styles.heroAmountRow}>
                <Text
                  style={[styles.heroAmount, cash < 0 && { color: colors.danger }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {money(cash)}
                </Text>
                <View style={[styles.readyChip, cash < 0 && styles.readyChipDanger]}>
                  <Text style={[styles.readyChipText, cash < 0 && { color: colors.danger }]}>
                    {cash < 0 ? 'Kas minus' : 'Siap pakai'}
                  </Text>
                </View>
              </View>

              <View style={styles.fundRow}>
                <View style={[styles.fundTile, { borderColor: colors.primaryBorder }]}>
                  <View style={styles.fundHeader}>
                    <Text style={[styles.fundLabel, { color: colors.primary }]}>Kas Harian</Text>
                    <View style={[styles.fundDot, { backgroundColor: colors.primary }]} />
                  </View>
                  <Text style={[styles.fundValue, cash < 0 && { color: colors.danger }]} numberOfLines={1}>
                    {money(cash)}
                  </Text>
                </View>
                <View style={[styles.fundTile, { borderColor: colors.amberBorder }]}>
                  <View style={styles.fundHeader}>
                    <Text style={[styles.fundLabel, { color: colors.amber }]}>Tabungan Modal</Text>
                    <View style={[styles.fundDot, { backgroundColor: colors.amber }]} />
                  </View>
                  <Text style={styles.fundValue} numberOfLines={1}>
                    {money(savings)}
                  </Text>
                </View>
              </View>

              <View style={styles.heroActions}>
                <Pressable style={styles.heroActionGhost} onPress={() => openSavings('in')}>
                  <Icon name="coins" size={14} color={colors.primary} strokeWidth={2} />
                  <Text style={styles.heroActionGhostText}>Pisahkan tabungan</Text>
                </Pressable>
                <Pressable style={styles.heroActionSolid} onPress={() => router.push('/transaksi')}>
                  <Icon name="history" size={14} color={colors.onPrimary} strokeWidth={2} />
                  <Text style={styles.heroActionSolidText}>Riwayat</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>

        {/* ------------------------------ Ringkasan ------------------------------ */}
        <Card padded={false} style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <SummaryTile
              icon="arrowDownLeft"
              label="Masuk"
              value={formatRupiah(today.incomeCash)}
              hint={`${today.saleCount} penjualan`}
              tone={colors.primary}
            />
            <View style={styles.summaryDivider} />
            <SummaryTile
              icon="arrowUpRight"
              label="Keluar"
              value={formatRupiah(today.expense)}
              hint="Biaya & kulakan"
              tone={colors.tertiary}
            />
            <View style={styles.summaryDivider} />
            <SummaryTile
              icon="trendUp"
              label="Laba tunai"
              value={showProfit ? formatRupiah(today.profit) : '—'}
              hint={today.income > 0 ? 'Masuk − keluar' : 'Belum ada omzet'}
              tone={today.profit >= 0 ? colors.secondary : colors.danger}
            />
          </View>
        </Card>

        {/* ------------------------------ Profil toko ---------------------------- */}
        {needsSetup ? (
          <Card style={styles.setupCard}>
            <View style={styles.setupRow}>
              <IconBadge name="store" tone="primary" />
              <View style={{ flex: 1 }}>
                <Text style={styles.setupTitle}>Lengkapi identitas toko</Text>
                <Text style={styles.setupDesc}>
                  Nama toko dipakai di header, struk, dan pesan pengingat kasbon.
                </Text>
              </View>
            </View>
            <Button
              label="Atur sekarang"
              icon="arrowRight"
              size="sm"
              onPress={() => router.push('/pengaturan')}
              style={{ marginTop: spacing.md }}
            />
          </Card>
        ) : null}

        {/* ------------------------------ Aksi cepat ---------------------------- */}
        <View>
          <SectionTitle
            title="Aksi cepat"
            icon="sparkle"
            right={<Text style={styles.sectionHint}>{kasbon.activeCount} kasbon aktif</Text>}
          />
          <View style={styles.grid}>
            {quickActions.map((action) => (
              <Pressable
                key={action.label}
                onPress={action.onPress}
                style={({ pressed }) => [styles.gridItem, pressed && { opacity: 0.65 }]}
              >
                <IconBadge
                  name={action.icon}
                  tone={action.tone}
                  filled={action.tone === 'primary' && action.label === 'Penjualan'}
                  size={46}
                />
                <Text style={styles.gridLabel}>{action.label}</Text>
                {action.badge ? (
                  // Lencana kecil, tidak boleh melebar keluar kotak aksi.
                  <View style={styles.gridBadge}>
                    <Text style={styles.gridBadgeText} numberOfLines={1}>
                      {action.badge}
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.gridHint} numberOfLines={1}>
                    {action.hint}
                  </Text>
                )}
              </Pressable>
            ))}
          </View>
        </View>

        {/* ------------------------------ Prioritas ----------------------------- */}
        <View>
          <SectionTitle
            title="Perlu ditindak"
            icon="alert"
            right={
              <Pressable onPress={() => router.push('/notifikasi')} hitSlop={8}>
                <Icon name="chevronRight" size={16} color={colors.textDim} />
              </Pressable>
            }
          />
          {dueList.length === 0 && stokKritis.length === 0 ? (
            <Card>
              <EmptyState
                compact
                icon="checkCircle"
                title="Tidak ada yang mendesak"
                description="Kasbon dan stok aman. Begitu ada jatuh tempo atau stok menyentuh batas minimum, pengingatnya muncul di sini."
              />
            </Card>
          ) : (
            <View style={{ gap: spacing.sm }}>
              {showBackupReminder ? (
                <Card style={styles.alertCard}>
                  <View style={styles.alertRow}>
                    <IconBadge name="database" tone="amber" size={38} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.alertTitle} numberOfLines={2}>
                        Cadangkan data toko
                      </Text>
                      <Text style={styles.alertDesc} numberOfLines={2}>
                        {reminder.message}
                      </Text>
                    </View>
                  </View>
                  <Pressable onPress={() => router.push('/cadangan')} style={styles.alertLink}>
                    <Text style={styles.alertLinkText}>Buka Cadangan data</Text>
                    <Icon name="arrowRight" size={13} color={colors.secondary} strokeWidth={2} />
                  </Pressable>
                </Card>
              ) : null}

              {dueList.map((item) => (
                <Card key={item.id} style={styles.alertCard}>
                  <View style={styles.alertRow}>
                    <IconBadge name="clock" tone="amber" size={38} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.alertTitle} numberOfLines={1}>
                        Kasbon {item.customerName}
                      </Text>
                      <Text style={styles.alertDesc} numberOfLines={1}>
                        Sisa {formatRupiah(debtRemaining(item))} • {labelJatuhTempo(item.dueDate)}
                      </Text>
                    </View>
                    <Pressable
                      style={styles.alertAction}
                      onPress={() =>
                        sendReminder(item.customerName, debtRemaining(item), item.dueDate, item.items?.length)
                      }
                    >
                      <Icon name="whatsapp" size={14} color={colors.primary} strokeWidth={1.9} />
                    </Pressable>
                  </View>
                  <Pressable onPress={() => router.push(`/kasbon/${item.id}`)} style={styles.alertLink}>
                    <Text style={styles.alertLinkText}>Catat pembayaran</Text>
                    <Icon name="arrowRight" size={13} color={colors.secondary} strokeWidth={2} />
                  </Pressable>
                </Card>
              ))}

              {stokKritis.map((product) => (
                <Card key={product.id} style={styles.alertCard}>
                  <View style={styles.alertRow}>
                    <IconBadge name="package" tone="tertiary" size={38} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.alertTitle} numberOfLines={2}>
                        Stok menipis: {product.name}
                      </Text>
                      <Text style={styles.alertDesc} numberOfLines={1}>
                        Sisa {product.stock} {product.unit} • minimum {product.minStock} {product.unit}
                      </Text>
                    </View>
                    <Pressable style={styles.alertAction} onPress={() => router.push('/stok')}>
                      <Icon name="plus" size={15} color={colors.tertiary} strokeWidth={2.2} />
                    </Pressable>
                  </View>
                </Card>
              ))}
            </View>
          )}
        </View>

        {/* --------------------------- Transaksi terbaru ------------------------- */}
        <View>
          <SectionTitle
            title="Transaksi terbaru"
            icon="receipt"
            right={
              <Pressable
                style={styles.sectionLink}
                onPress={() => router.push('/transaksi')}
                hitSlop={6}
              >
                <Text style={styles.sectionLinkText}>Lihat semua</Text>
                <Icon name="chevronRight" size={13} color={colors.secondary} strokeWidth={2} />
              </Pressable>
            }
          />
          <Card padded={false}>
            {recent.length === 0 ? (
              <EmptyState
                icon="receipt"
                title="Belum ada transaksi"
                description="Setiap penjualan dan pengeluaran yang Anda catat akan muncul di sini beserta labanya."
                action={
                  <Button
                    label="Catat transaksi pertama"
                    icon="plus"
                    onPress={() => router.push('/pilih-transaksi')}
                  />
                }
              />
            ) : (
              recent.map((tx, index) => (
                <TransactionRow
                  key={tx.id}
                  tx={tx}
                  last={index === recent.length - 1}
                  onPress={() => router.push({ pathname: '/transaksi', params: { focus: tx.id } })}
                />
              ))
            )}
          </Card>
        </View>

        {/* -------------------------------- Tips -------------------------------- */}
        <Card style={styles.tipCard}>
          <View style={styles.tipRow}>
            <IconBadge name="bulb" tone="secondary" size={36} />
            <View style={{ flex: 1 }}>
              <Text style={styles.tipTitle}>Kiat Inventori’s</Text>
              <Text style={styles.tipText}>{tip}</Text>
            </View>
          </View>
        </Card>

        <Text style={styles.footerNote}>
          Saldo dihitung otomatis dari transaksi Anda — tidak ada data contoh di aplikasi ini.
        </Text>
      </ScrollView>

      {/* ------------------------- Sheet pisah tabungan ------------------------- */}
      <Sheet
        visible={savingsOpen}
        onClose={() => setSavingsOpen(false)}
        title="Tabungan modal"
        subtitle="Pisahkan kas supaya uang kulakan tidak terpakai — bisa juga ditarik kembali."
      >
        <Segmented
          value={savingsDirection}
          onChange={(value) => {
            setSavingsDirection(value);
            setSavingsAmount('');
            setSavingsError(null);
          }}
          options={[
            { value: 'in', label: 'Sisihkan ke tabungan' },
            { value: 'out', label: 'Tarik ke kas' },
          ]}
        />

        <Text style={styles.sheetAvailable}>
          {savingsDirection === 'in' ? 'Kas harian tersedia' : 'Tabungan tersedia'}:{' '}
          <Text style={{ color: savingsDirection === 'in' ? colors.primary : colors.amber }}>
            {formatRupiah(availableForMove)}
          </Text>
        </Text>

        <TextField
          prefix="Rp"
          keyboardType="number-pad"
          placeholder="0"
          value={savingsAmount}
          onChangeText={(text) => {
            setSavingsAmount(maskNominal(text));
            setSavingsError(null);
          }}
          style={{ marginTop: spacing.md }}
        />

        <View style={styles.quickAmountRow}>
          {[10000, 50000, 100000].map((amount) => (
            <Pressable
              key={amount}
              style={styles.quickAmount}
              onPress={() => setSavingsAmount(maskNominal(String(parseNumber(savingsAmount) + amount)))}
            >
              <Text style={styles.quickAmountText}>+{formatRupiah(amount)}</Text>
            </Pressable>
          ))}
          <Pressable
            style={[styles.quickAmount, availableForMove <= 0 && { opacity: 0.45 }]}
            disabled={availableForMove <= 0}
            onPress={() => setSavingsAmount(maskNominal(String(availableForMove)))}
          >
            <Text style={styles.quickAmountText}>Semua</Text>
          </Pressable>
        </View>

        {savingsError ? <Text style={styles.errorText}>{savingsError}</Text> : null}

        <Button
          label={savingsDirection === 'in' ? 'Pindahkan ke tabungan' : 'Tarik ke kas harian'}
          icon={savingsDirection === 'in' ? 'coins' : 'wallet'}
          onPress={submitSavings}
          disabled={parseNumber(savingsAmount) <= 0 || parseNumber(savingsAmount) > availableForMove}
          style={{ marginTop: spacing.lg }}
        />

        {data.allocations.length > 0 ? (
          <View style={styles.historyBlock}>
            <SectionLabel>Riwayat pemindahan</SectionLabel>
            {data.allocations.slice(0, 4).map((allocation) => (
              <View key={allocation.id} style={styles.historyRow}>
                <Icon
                  name={allocation.amount >= 0 ? 'arrowUpRight' : 'arrowDownLeft'}
                  size={13}
                  color={allocation.amount >= 0 ? colors.amber : colors.primary}
                  strokeWidth={2}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.historyAmount}>
                    {formatRupiah(Math.abs(allocation.amount))}
                  </Text>
                  <Text style={styles.historyDate}>{formatTanggalSingkat(allocation.createdAt)}</Text>
                </View>
                <Pressable
                  hitSlop={12}
                  accessibilityLabel="Batalkan pemindahan"
                  onPress={() => {
                    const result = deleteAllocation(allocation.id);
                    if (!result.ok) setSavingsError(result.reason);
                  }}
                >
                  <Icon name="trash" size={13} color={colors.textFaint} />
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}

        <Text style={styles.sheetNote}>
          Pemindahan dana bukan pengeluaran, jadi laporan laba rugi tetap bersih.
        </Text>
      </Sheet>
    </View>
  );
}

/* ------------------------------------------------------------- Sub-komponen --- */

function SummaryTile({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: IconName;
  label: string;
  value: string;
  hint: string;
  tone: string;
}) {
  return (
    <View style={styles.summaryTile}>
      <View style={styles.summaryLabelRow}>
        <Icon name={icon} size={12} color={tone} strokeWidth={2.1} />
        <Text style={styles.summaryLabel} numberOfLines={1}>
          {label}
        </Text>
      </View>
      <Text style={[styles.summaryValue, { color: tone }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={styles.summaryHint} numberOfLines={1}>
        {hint}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  // 150 = tinggi tab bar + FAB + jarak aman, supaya tile terakhir tidak tertutup FAB.
  content: { padding: spacing.base, gap: spacing.lg, paddingBottom: 150 },

  heroShadow: { borderRadius: radius.xxl, ...shadow.card },
  heroClip: {
    borderRadius: radius.xxl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  heroGlow: {
    position: 'absolute',
    top: -70,
    right: -60,
    width: 190,
    height: 190,
    borderRadius: 95,
    backgroundColor: 'rgba(0,245,160,0.16)',
  },
  heroBody: { padding: spacing.base },
  heroTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: colors.border,
  },
  eyeText: { fontFamily: fonts.medium, fontSize: 10, color: colors.textMuted },
  heroGreeting: { ...type.caption, color: 'rgba(224,225,244,0.72)', marginTop: spacing.md },
  heroAmountRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 4, flexWrap: 'wrap' },
  heroAmount: { ...type.hero, color: colors.white, flexShrink: 1 },
  readyChip: {
    backgroundColor: colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  readyChipDanger: { backgroundColor: 'rgba(255,107,107,0.12)', borderColor: 'rgba(255,107,107,0.35)' },
  readyChipText: { fontFamily: fonts.extrabold, fontSize: 9.5, color: colors.onPrimary },

  fundRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.base },
  fundTile: {
    flex: 1,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: 'rgba(10,13,26,0.72)',
    borderWidth: 1,
  },
  fundHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  fundLabel: { fontFamily: fonts.bold, fontSize: 9.5, letterSpacing: 0.4, textTransform: 'uppercase' },
  fundDot: { width: 5, height: 5, borderRadius: 3 },
  fundValue: { fontFamily: fonts.numBold, fontSize: 15, color: colors.white, marginTop: 5 },

  heroActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.base },
  heroActionGhost: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 38,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  heroActionGhostText: { fontFamily: fonts.semibold, fontSize: 11, color: colors.primary },
  heroActionSolid: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 38,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.primary,
  },
  heroActionSolidText: { fontFamily: fonts.bold, fontSize: 11, color: colors.onPrimary },

  summaryCard: { paddingVertical: spacing.md },
  summaryRow: { flexDirection: 'row', alignItems: 'stretch' },
  summaryDivider: { width: 1, backgroundColor: colors.border, marginVertical: 2 },
  summaryTile: { flex: 1, paddingHorizontal: 10, gap: 3 },
  summaryLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  summaryLabel: { ...type.micro, fontFamily: fonts.semibold, color: colors.textDim },
  summaryValue: { fontFamily: fonts.numBold, fontSize: 13.5 },
  summaryHint: { ...type.micro, fontFamily: fonts.medium, color: colors.textFaint },

  setupCard: { borderColor: colors.primaryBorder, backgroundColor: colors.card },
  setupRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  setupTitle: { ...type.bodyMedium, fontFamily: fonts.bold, color: colors.white },
  setupDesc: { ...type.caption, color: colors.textDim, marginTop: 2, lineHeight: 16 },

  sectionHint: { ...type.caption, fontFamily: fonts.semibold, color: colors.textDim },
  sectionLink: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  sectionLinkText: { fontFamily: fonts.semibold, fontSize: 11, color: colors.secondary },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  gridItem: {
    width: '31.5%',
    flexGrow: 1,
    alignItems: 'center',
    gap: 5,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  gridLabel: { ...type.caption, fontFamily: fonts.bold, color: colors.white },
  gridHint: { ...type.micro, fontFamily: fonts.medium, color: colors.textFaint },
  gridBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.amberSoft,
    borderWidth: 1,
    borderColor: colors.amberBorder,
    maxWidth: '100%',
  },
  gridBadgeText: { fontFamily: fonts.bold, fontSize: 9, color: colors.amber },

  alertCard: { padding: spacing.md, gap: spacing.sm },
  alertRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  alertTitle: { ...type.bodyMedium, fontFamily: fonts.bold, color: colors.white },
  alertDesc: { ...type.caption, color: colors.textDim, marginTop: 2 },
  alertAction: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: colors.border,
  },
  alertLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  alertLinkText: { fontFamily: fonts.semibold, fontSize: 11, color: colors.secondary },

  tipCard: { borderColor: colors.border },
  tipRow: { flexDirection: 'row', gap: spacing.md },
  tipTitle: { ...type.bodyMedium, fontFamily: fonts.bold, color: colors.white, marginBottom: 3 },
  tipText: { ...type.caption, color: colors.textMuted, lineHeight: 17 },

  footerNote: {
    ...type.micro,
    fontFamily: fonts.medium,
    color: colors.textFaint,
    textAlign: 'center',
    letterSpacing: 0,
    lineHeight: 15,
  },

  sheetAvailable: { ...type.caption, color: colors.textMuted, marginTop: spacing.base },
  errorText: { ...type.caption, color: colors.danger, marginTop: spacing.sm },
  historyBlock: { marginTop: spacing.lg },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  historyAmount: { fontFamily: fonts.numSemibold, fontSize: 12.5, color: colors.text },
  historyDate: { ...type.micro, fontFamily: fonts.medium, color: colors.textFaint },
  quickAmountRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  quickAmount: {
    flex: 1,
    height: 36,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickAmountText: { fontFamily: fonts.numSemibold, fontSize: 11.5, color: colors.textMuted },
  sheetNote: { ...type.micro, fontFamily: fonts.medium, color: colors.textFaint, marginTop: spacing.md, lineHeight: 15 },
});
