/**
 * Daftar pesanan / kuotasi.
 *
 * Pesanan adalah janji jual: stok dan omzet TIDAK berubah sampai pesanan
 * dijadikan transaksi. Ini penting untuk warung: barang yang dipesan pelanggan
 * belum tentu diambil, jadi tidak boleh mengacaukan stok dan laporan.
 */
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '../src/components/Icon';
import {
  Button,
  Card,
  Chip,
  Divider,
  EmptyState,
  IconBadge,
  KeyValueRow,
  SectionTitle,
  Sheet,
} from '../src/components/Primitives';
import { PAY_METHODS } from '../src/data/categories';
import {
  ORDER_STATUS_LABEL,
  orderDueTone,
  orderItemSummary,
  orderRemaining,
  orderShareText,
} from '../src/data/orders';
import { openOrders, orderSummary } from '../src/data/selectors';
import { useAppStore } from '../src/data/store';
import { useScopedData } from '../src/data/scope';
import type { Order, PayMethod } from '../src/data/types';
import { colors, fonts, radius, spacing, type } from '../src/theme/tokens';
import { formatRupiah, formatTanggalJam, formatTanggalSingkat } from '../src/utils/format';

export default function PesananScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const data = useScopedData();
  const completeOrder = useAppStore((s) => s.completeOrder);
  const cancelOrder = useAppStore((s) => s.cancelOrder);
  const deleteOrder = useAppStore((s) => s.deleteOrder);

  const [active, setActive] = useState<Order | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const summary = useMemo(() => orderSummary(data), [data]);
  const terbuka = useMemo(() => openOrders(data), [data]);
  const riwayat = useMemo(
    () =>
      [...(data.orders ?? [])]
        .filter((order) => order.status !== 'terbuka')
        .sort((a, b) => new Date(b.updatedAt ?? b.createdAt).getTime() - new Date(a.updatedAt ?? a.createdAt).getTime())
        .slice(0, 12),
    [data.orders],
  );

  const confirm = (title: string, message: string, onYes: () => void) => {
    if (Platform.OS === 'web') {
      const yes =
        typeof window !== 'undefined' && typeof window.confirm === 'function'
          ? window.confirm(`${title}\n\n${message}`)
          : false;
      if (yes) onYes();
      return;
    }
    Alert.alert(title, message, [
      { text: 'Batal', style: 'cancel' },
      { text: 'Lanjut', style: 'destructive', onPress: onYes },
    ]);
  };

  const share = async (order: Order) => {
    const text = orderShareText(order, data.profile.name);
    try {
      await Share.share({ message: text });
    } catch {
      setStatus({ tone: 'error', text: 'Dialog berbagi belum terbuka. Coba lagi.' });
    }
  };

  const convert = (order: Order, method: PayMethod) => {
    setBusy(true);
    const result = completeOrder(order.id, {
      method,
      dueDate: method === 'kasbon' ? order.dueDate ?? new Date(Date.now() + 7 * 86_400_000).toISOString() : undefined,
    });
    setBusy(false);
    setActive(null);
    if (!result.ok) {
      setStatus({ tone: 'error', text: result.reason });
      return;
    }
    setStatus({
      tone: 'ok',
      text:
        method === 'kasbon'
          ? 'Pesanan jadi transaksi kasbon. Cicilan bisa dicatat di menu Kasbon.'
          : 'Pesanan jadi transaksi. Stok dan omzet sudah diperbarui.',
    });
  };

  const dueChip = (order: Order) => {
    const tone = orderDueTone(order);
    if (tone === 'tanpa') return null;
    if (tone === 'lewat') return <Chip label="Lewat tenggat" tone="danger" size="sm" />;
    if (tone === 'dekat') return <Chip label="Hari ini/besok" tone="amber" size="sm" />;
    return <Chip label={formatTanggalSingkat(order.dueDate!)} tone="neutral" size="sm" />;
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => router.back()} style={styles.iconButton} hitSlop={8}>
          <Icon name="chevronLeft" size={17} color={colors.textMuted} strokeWidth={2} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Pesanan</Text>
          <Text style={styles.headerSubtitle}>Kuotasi & janji jual</Text>
        </View>
        <Pressable
          onPress={() => router.push('/pesanan-baru')}
          style={styles.addButton}
          accessibilityRole="button"
          accessibilityLabel="Buat pesanan baru"
        >
          <Icon name="plus" size={18} color={colors.onPrimary} strokeWidth={2.4} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}
        showsVerticalScrollIndicator={false}
      >
        {status ? (
          <View style={[styles.banner, status.tone === 'ok' ? styles.bannerOk : styles.bannerError]}>
            <Icon
              name={status.tone === 'ok' ? 'checkCircle' : 'alert'}
              size={15}
              color={status.tone === 'ok' ? colors.primary : colors.danger}
              strokeWidth={2}
            />
            <Text
              style={[styles.bannerText, { color: status.tone === 'ok' ? colors.primary : colors.danger }]}
            >
              {status.text}
            </Text>
          </View>
        ) : null}

        <Card style={{ gap: spacing.sm }}>
          <View style={styles.summaryRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.summaryLabel}>PESANAN TERBUKA</Text>
              <Text style={styles.summaryValue}>{summary.openCount}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.summaryLabel}>NILAI</Text>
              <Text style={styles.summaryValue}>{formatRupiah(summary.openValue)}</Text>
            </View>
          </View>
          <Divider />
          <KeyValueRow label="Jatuh tempo hari ini/lewat" value={`${summary.dueCount} pesanan`} icon="clock" />
          <KeyValueRow label="Sudah jadi transaksi" value={`${summary.doneCount} pesanan`} icon="checkCircle" />
          <Text style={styles.hint}>
            Pesanan tidak mengurangi stok dan tidak dihitung omzet sampai dijadikan transaksi.
          </Text>
        </Card>

        <View>
          <SectionTitle title="Perlu dikerjakan" icon="clock" />
          <View style={{ gap: spacing.sm }}>
            {terbuka.length === 0 ? (
              <EmptyState
                icon="book"
                title="Belum ada pesanan terbuka"
                description="Buat pesanan untuk pelanggan yang memesan dulu, lalu jadikan transaksi saat barang diambil."
              />
            ) : null}

            {terbuka.map((order) => (
              <Card key={order.id} style={{ gap: spacing.sm }}>
                <View style={styles.rowBetween}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={styles.who} numberOfLines={1}>
                      {order.customerName}
                    </Text>
                    <Text style={styles.meta} numberOfLines={1}>
                      {orderItemSummary(order.items)}
                    </Text>
                  </View>
                  <Text style={styles.total}>{formatRupiah(order.total)}</Text>
                </View>

                {(order.deposit ?? 0) > 0 ? (
                  <Text style={styles.depositLine}>
                    DP {formatRupiah(order.deposit ?? 0)} diterima • sisa{' '}
                    <Text style={{ color: orderRemaining(order) > 0 ? colors.amber : colors.primary }}>
                      {formatRupiah(orderRemaining(order))}
                    </Text>
                  </Text>
                ) : null}

                <View style={styles.chipRow}>
                  {dueChip(order)}
                  {order.customerPhone ? (
                    <Chip label={order.customerPhone} tone="neutral" size="sm" />
                  ) : null}
                </View>

                {order.note ? <Text style={styles.note}>Catatan: {order.note}</Text> : null}

                <Divider />
                <View style={styles.actions}>
                  <Pressable onPress={() => setActive(order)} style={styles.primaryAction}>
                    <Icon name="check" size={14} color={colors.onPrimary} strokeWidth={2.4} />
                    <Text style={styles.primaryActionText}>Jadikan transaksi</Text>
                  </Pressable>
                  <Pressable onPress={() => void share(order)} style={styles.ghostAction}>
                    <Icon name="share" size={14} color={colors.text} strokeWidth={1.9} />
                    <Text style={styles.ghostActionText}>Bagikan</Text>
                  </Pressable>
                </View>
                <Pressable
                  onPress={() =>
                    confirm('Batalkan pesanan ini?', `${order.customerName} — ${formatRupiah(order.total)}. Pesanan batal tidak dihitung omzet.`, () => {
                      const result = cancelOrder(order.id);
                      if (!result.ok) setStatus({ tone: 'error', text: result.reason });
                      else setStatus({ tone: 'ok', text: 'Pesanan dibatalkan.' });
                    })
                  }
                  hitSlop={8}
                >
                  <Text style={styles.dangerLink}>Batalkan pesanan</Text>
                </Pressable>
              </Card>
            ))}
          </View>
        </View>

        {riwayat.length > 0 ? (
          <View>
            <SectionTitle title="Riwayat pesanan" icon="history" />
            <Card style={{ gap: spacing.sm }}>
              {riwayat.map((order, index) => (
                <View key={order.id} style={{ gap: spacing.sm }}>
                  {index > 0 ? <Divider /> : null}
                  <View style={styles.rowBetween}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={styles.who} numberOfLines={1}>
                        {order.customerName}
                      </Text>
                      <Text style={styles.meta} numberOfLines={1}>
                        {formatTanggalJam(order.updatedAt ?? order.createdAt)} • {formatRupiah(order.total)}
                      </Text>
                    </View>
                    <Chip
                      label={ORDER_STATUS_LABEL[order.status]}
                      tone={order.status === 'selesai' ? 'primary' : 'neutral'}
                      size="sm"
                    />
                  </View>
                  {order.status === 'batal' ? (
                    <Pressable
                      onPress={() => {
                        const result = deleteOrder(order.id);
                        if (!result.ok) setStatus({ tone: 'error', text: result.reason });
                      }}
                      hitSlop={8}
                    >
                      <Text style={styles.dangerLink}>Hapus dari daftar</Text>
                    </Pressable>
                  ) : null}
                </View>
              ))}
            </Card>
          </View>
        ) : null}
      </ScrollView>

      <Sheet
        visible={!!active}
        onClose={() => setActive(null)}
        title="Jadikan transaksi"
        subtitle={active ? `${active.customerName} • ${formatRupiah(active.total)}` : undefined}
      >
        <View style={{ gap: spacing.sm }}>
          <Text style={styles.hint}>
            Stok barang akan berkurang dan omzet bertambah saat metode dipilih.
          </Text>
          {active && (active.deposit ?? 0) > 0 ? (
            <View style={styles.depositBox}>
              <Icon name="wallet" size={15} color={colors.primary} strokeWidth={1.9} />
              <Text style={styles.depositBoxText}>
                DP {formatRupiah(active.deposit ?? 0)} dicatat sebagai pembayaran pertama. Sisa{' '}
                {formatRupiah(orderRemaining(active))} masuk kasbon otomatis.
              </Text>
            </View>
          ) : null}
          {PAY_METHODS.map((method) => (
            <Pressable
              key={method.id}
              disabled={busy}
              onPress={() => active && convert(active, method.id)}
              style={styles.methodRow}
            >
              <IconBadge name={method.icon} tone={method.id === 'kasbon' ? 'amber' : 'primary'} size={34} />
              <View style={{ flex: 1 }}>
                <Text style={styles.methodLabel}>{method.label}</Text>
                <Text style={styles.methodHint}>{method.hint}</Text>
              </View>
              <Icon name="chevronRight" size={15} color={colors.textFaint} strokeWidth={2} />
            </Pressable>
          ))}
        </View>
      </Sheet>
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
  addButton: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  headerTitle: { ...type.h2, fontSize: 15, color: colors.white },
  headerSubtitle: { ...type.caption, color: colors.textDim, marginTop: 1 },
  content: { padding: spacing.base, gap: spacing.lg },
  summaryRow: { flexDirection: 'row', gap: spacing.md },
  summaryLabel: { ...type.micro, fontFamily: fonts.semibold, color: colors.textFaint, letterSpacing: 0.4 },
  summaryValue: { ...type.numLg, fontFamily: fonts.numBold, color: colors.text, marginTop: 2 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  who: { ...type.body, fontFamily: fonts.semibold, color: colors.text },
  meta: { ...type.caption, color: colors.textFaint },
  total: { ...type.num, fontFamily: fonts.numBold, color: colors.primary },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  note: { ...type.caption, color: colors.textDim, lineHeight: 17 },
  hint: { ...type.caption, color: colors.textFaint, lineHeight: 17 },
  actions: { flexDirection: 'row', gap: spacing.sm },
  primaryAction: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
  },
  primaryActionText: { ...type.label, fontFamily: fonts.semibold, color: colors.onPrimary },
  ghostAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 40,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardHigh,
  },
  ghostActionText: { ...type.label, fontFamily: fonts.semibold, color: colors.text },
  dangerLink: { ...type.caption, fontFamily: fonts.semibold, color: colors.danger },
  depositLine: { ...type.caption, color: colors.textDim, lineHeight: 17 },
  depositBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  depositBoxText: { ...type.caption, color: colors.text, flex: 1, lineHeight: 17 },
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  bannerOk: { backgroundColor: colors.primarySoft, borderColor: colors.primaryBorder },
  bannerError: { backgroundColor: colors.dangerSoft, borderColor: colors.dangerBorder },
  bannerText: { ...type.caption, flex: 1, lineHeight: 17 },
  methodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardHigh,
  },
  methodLabel: { ...type.body, fontFamily: fonts.semibold, color: colors.text },
  methodHint: { ...type.caption, color: colors.textFaint, marginTop: 1 },
});
