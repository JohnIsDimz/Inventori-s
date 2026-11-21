import { friendlyAuthError, friendlySyncError } from '../src/services/sync/errors';
import { useCan, useCanSeeProfit } from '../src/utils/usePermissions';
/**
 * Log audit: siapa mengubah apa, kapan.
 *
 * Sumbernya tabel `audit_logs` yang diisi otomatis oleh trigger Postgres
 * (perubahan harga/penghapusan barang) dan oleh RPC (void transaksi).
 * Hanya owner/admin; server juga menolak peran lain.
 */
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '../src/components/Icon';
import { Button, Card, Chip, EmptyState, SectionTitle } from '../src/components/Primitives';
import { useAuthStore } from '../src/data/auth';
import { isCloudEnabled, supabase } from '../src/services/supabase/client';
import { colors, fonts, radius, spacing, type } from '../src/theme/tokens';
import { formatRupiah } from '../src/utils/format';
import { can } from '../src/utils/permissions';

interface AuditRow {
  id: number;
  at: string;
  actor_email: string;
  action: string;
  entity: string;
  entity_id: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

const ACTION_LABEL: Record<string, string> = {
  'product.update': 'Data barang diubah',
  'product.delete': 'Barang dihapus',
  'transaction.void': 'Transaksi dibatalkan',
  'stock.adjust': 'Stok disesuaikan manual',
  'member.add': 'Anggota bergabung',
  'member.role': 'Peran anggota diubah',
  'member.active': 'Status anggota diubah',
  'member.leave': 'Anggota keluar dari toko',
  'ownership.transfer': 'Kepemilikan toko diserahkan',
  'account.delete': 'Akun dihapus (data toko ikut terhapus)',
};

function actionIcon(action: string): IconName {
  if (action === 'transaction.void') return 'receipt';
  if (action === 'product.delete') return 'trash';
  if (action === 'stock.adjust') return 'package';
  if (action.startsWith('member.')) return 'users';
  if (action === 'ownership.transfer') return 'shield';
  if (action === 'account.delete') return 'trash';
  return 'edit';
}

const ROLE_LABEL: Record<string, string> = {
  owner: 'Pemilik',
  admin: 'Admin',
  kasir: 'Kasir',
};

function detailOf(row: AuditRow): string | null {
  const before = row.before ?? {};
  const after = row.after ?? {};
  const num = (value: unknown) => (typeof value === 'number' ? value : Number(value));

  if ('sell_price' in before && 'sell_price' in after) {
    const from = num(before.sell_price);
    const to = num(after.sell_price);
    if (from !== to) return `Harga jual ${formatRupiah(from)} → ${formatRupiah(to)}`;
    const costFrom = num(before.cost_price);
    const costTo = num(after.cost_price);
    if (costFrom !== costTo) return `Harga modal ${formatRupiah(costFrom)} → ${formatRupiah(costTo)}`;
    return 'Perubahan harga tanpa selisih';
  }
  if ('total' in before) {
    const total = num(before.total);
    return `Nilai transaksi ${formatRupiah(total)}`;
  }
  if ('stock' in after) {
    const from = num(before.stock);
    const to = num(after.stock);
    const delta = to - from;
    const note = typeof after.note === 'string' && after.note ? ` • ${after.note}` : '';
    return `Stok ${from} → ${to} (${delta > 0 ? '+' : ''}${delta})${note}`;
  }
  if ('role' in after || 'role' in before) {
    const from = ROLE_LABEL[String(before.role ?? '')] ?? before.role;
    const to = ROLE_LABEL[String(after.role ?? '')] ?? after.role;
    return `Peran ${String(from)} → ${String(to)}`;
  }
  if ('active' in after) {
    return after.active ? 'Anggota diaktifkan kembali' : 'Anggota dinonaktifkan';
  }
  return null;
}

export default function AuditScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { outletId, role } = useAuthStore();
  const allowed = useCan('audit.view');

  const [rows, setRows] = useState<AuditRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!isCloudEnabled || !supabase || !outletId) return;
    setLoading(true);
    const { data, error: rpcError } = await supabase.rpc('audit_feed', {
      p_outlet: outletId,
      p_limit: 100,
    });
    setLoading(false);
    if (rpcError) {
      setError(friendlySyncError(rpcError));
      return;
    }
    setRows((data ?? []) as AuditRow[]);
    setError(null);
  }, [outletId]);

  useEffect(() => {
    if (allowed) void load();
  }, [allowed, load]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconButton} hitSlop={10}>
          <Icon name="chevronLeft" size={17} color={colors.textMuted} strokeWidth={2} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Log audit</Text>
          <Text style={styles.headerSubtitle}>Riwayat perubahan penting</Text>
        </View>
        {isCloudEnabled && allowed ? (
          <Pressable onPress={() => void load()} style={styles.iconButton} hitSlop={10}>
            <Icon name="refresh" size={16} color={colors.textMuted} strokeWidth={2} />
          </Pressable>
        ) : null}
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}
        showsVerticalScrollIndicator={false}
      >
        {!isCloudEnabled ? (
          <Card style={{ gap: spacing.sm }}>
            <Text style={styles.cardTitle}>Log audit perlu akun toko</Text>
            <Text style={styles.body}>
              Catatan siapa mengubah harga dan siapa membatalkan transaksi dibuat di sisi akun toko,
              jadi baru muncul setelah Anda masuk. Tanpa akun, semua perubahan tetap tersimpan di
              HP ini — hanya tidak ada riwayatnya.
            </Text>
          </Card>
        ) : !allowed ? (
          <Card>
            <Text style={styles.body}>Peran Anda tidak berhak melihat log audit.</Text>
          </Card>
        ) : error ? (
          <Card style={{ gap: spacing.sm }}>
            <Text style={styles.cardTitle}>Gagal memuat</Text>
            <Text style={styles.body}>{error}</Text>
            <Button label="Coba lagi" icon="refresh" variant="secondary" onPress={() => void load()} />
          </Card>
        ) : rows.length === 0 ? (
          <EmptyState
            icon="shield"
            title={loading ? 'Memuat…' : 'Belum ada catatan'}
            description="Audit akan terisi begitu ada perubahan harga barang atau pembatalan transaksi."
          />
        ) : (
          <>
            <SectionTitle title={`${rows.length} catatan terakhir`} icon="shield" />
            <View style={{ gap: spacing.sm }}>
              {rows.map((row) => {
                const detail = detailOf(row);
                return (
                  <Card key={String(row.id)} style={{ gap: 6 }}>
                    <View style={styles.rowBetween}>
                      <View style={styles.rowLeft}>
                        <Icon name={actionIcon(row.action)} size={15} color={colors.secondary} strokeWidth={1.9} />
                        <Text style={styles.actionTitle}>
                          {ACTION_LABEL[row.action] ?? row.action}
                        </Text>
                      </View>
                      <Text style={styles.time}>
                        {new Date(row.at).toLocaleString('id-ID', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </Text>
                    </View>
                    {detail ? <Text style={styles.detail}>{detail}</Text> : null}
                    <View style={styles.rowBetween}>
                      <Text style={styles.actor} numberOfLines={1}>
                        oleh {row.actor_email}
                      </Text>
                      <Chip label={row.entity} tone="neutral" size="sm" />
                    </View>
                  </Card>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>
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
    paddingVertical: spacing.md,
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
  cardTitle: { ...type.h2, fontFamily: fonts.bold, color: colors.text },
  body: { ...type.body, color: colors.textDim, lineHeight: 20 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  actionTitle: { ...type.body, fontFamily: fonts.semibold, color: colors.text },
  detail: { ...type.caption, color: colors.textDim },
  time: { ...type.micro, color: colors.textFaint },
  actor: { ...type.caption, color: colors.textFaint, flex: 1 },
});
