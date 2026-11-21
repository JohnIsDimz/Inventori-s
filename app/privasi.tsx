import { appAlert } from '../src/utils/alert';
import { wipeDeviceData } from '../src/services/wipe';
/**
 * Data & privasi — hak pengguna atas datanya sendiri (UU PDP).
 *
 * Tiga hal yang bisa dilakukan di sini:
 * 1. melihat ringkasan data yang tersimpan di perangkat;
 * 2. menghapus seluruh data di perangkat (mode lokal maupun cloud);
 * 3. menghapus akun cloud beserta data toko milik sendiri, atau keluar dari
 *    toko orang lain.
 *
 * Konfirmasi sengaja "ketik nama toko / kata HAPUS" — penghapusan tidak bisa
 * dibatalkan, jadi tombol sekali tekan terlalu berbahaya.
 */
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TextField } from '../src/components/Field';
import { Icon } from '../src/components/Icon';
import {
  Button,
  Card,
  Chip,
  Divider,
  KeyValueRow,
  SectionLabel,
  SectionTitle,
} from '../src/components/Primitives';
import { useAuthStore } from '../src/data/auth';
import { useAppStore } from '../src/data/store';
import {
  deleteMyAccount,
  leaveOutlet,
  previewAccountDelete,
  type DeletePreview,
} from '../src/services/account';
import { countPayload } from '../src/services/backup';
import { isCloudEnabled } from '../src/services/supabase/client';
import { colors, fonts, radius, spacing, type } from '../src/theme/tokens';
import { ROLE_LABEL } from '../src/utils/permissions';

const CONFIRM_WORD = 'HAPUS';

export default function PrivasiScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const data = useAppStore();
  const resetAll = useAppStore((s) => s.resetAll);
  const auth = useAuthStore();

  const [preview, setPreview] = useState<DeletePreview | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const counts = useMemo(
    () =>
      countPayload({
        profile: data.profile,
        settings: data.settings,
        categories: data.categories,
        products: data.products,
        transactions: data.transactions,
        receivables: data.receivables,
        payables: data.payables,
        allocations: data.allocations,
        shifts: data.shifts,
        orders: data.orders,
        customers: data.customers,
        outlets: data.outlets,
        opnames: data.opnames,
        purchases: data.purchases,
        suppliers: data.suppliers,
        purchaseReturns: data.purchaseReturns,
      }),
    [data],
  );
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  const signedIn = isCloudEnabled && !!auth.email;

  useEffect(() => {
    if (!signedIn) return;
    let alive = true;
    void previewAccountDelete()
      .then((result) => {
        if (alive) setPreview(result);
      })
      .catch(() => {
        if (alive) setPreview(null);
      });
    return () => {
      alive = false;
    };
  }, [signedIn]);

  /** Alert bawaan tidak tampil di web — dipakai confirm peramban agar tetap jelas. */
  const ask = (title: string, message: string, onYes: () => void) => {
    if (Platform.OS === 'web') {
      const yes =
        typeof window !== 'undefined' && typeof window.confirm === 'function'
          ? window.confirm(`${title}\n\n${message}`)
          : false;
      if (yes) onYes();
      return;
    }
    appAlert.alert(title, message, [
      { text: 'Batal', style: 'cancel' },
      { text: 'Hapus', style: 'destructive', onPress: onYes },
    ]);
  };

  const wipeDevice = () => {
    ask(
      'Hapus semua data di perangkat?',
      'Seluruh barang, transaksi, kasbon, dan pengaturan di HP ini akan hilang. Buat cadangan dulu bila masih dibutuhkan.',
      () => {
        void wipeDeviceData().then(() => {
          setStatus({ tone: 'ok', text: 'Data di perangkat sudah dihapus.' });
        }).catch(() => setStatus({ tone: 'error', text: 'Penghapusan belum selesai. Coba lagi.' }));
        setConfirmText('');
      },
    );
  };

  const removeAccount = async () => {
    if (!preview?.canDelete) {
      setStatus({ tone: 'error', text: preview?.reason ?? 'Akun belum bisa dihapus.' });
      return;
    }
    if (confirmText.trim().toUpperCase() !== CONFIRM_WORD) {
      setStatus({ tone: 'error', text: `Ketik ${CONFIRM_WORD} untuk mengonfirmasi.` });
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      const result = await deleteMyAccount();
      await auth.signOut();
      setStatus({
        tone: 'ok',
        text: `Data akun dihapus. ${result.outletsDeleted} toko dan ${result.membershipsRemoved} keanggotaan dibersihkan. Identitas masuk perlu dihapus oleh pengelola layanan.`,
      });
      setConfirmText('');
      setPreview(null);
    } catch (error) {
      setStatus({
        tone: 'error',
        text: error instanceof Error ? error.message : 'Gagal menghapus akun.',
      });
    } finally {
      setBusy(false);
    }
  };

  const leaveStore = () => {
    if (!auth.outletId) return;
    ask(
      'Keluar dari toko ini?',
      'Akses Anda ke data toko ini dicabut. Pemilik bisa mengundang lagi kapan saja.',
      () => {
        void (async () => {
          setBusy(true);
          try {
            await leaveOutlet(auth.outletId!);
            await auth.signOut();
            setStatus({ tone: 'ok', text: 'Anda sudah keluar dari toko.' });
          } catch (error) {
            setStatus({
              tone: 'error',
              text: error instanceof Error ? error.message : 'Gagal keluar dari toko.',
            });
          } finally {
            setBusy(false);
          }
        })();
      },
    );
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => router.back()} style={styles.iconButton} hitSlop={8}>
          <Icon name="chevronLeft" size={17} color={colors.textMuted} strokeWidth={2} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Data & privasi</Text>
          <Text style={styles.headerSubtitle}>Kendali penuh atas data toko Anda</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}
        showsVerticalScrollIndicator={false}
      >
        {status ? (
          <View
            style={[
              styles.banner,
              status.tone === 'ok' ? styles.bannerOk : styles.bannerError,
            ]}
          >
            <Icon
              name={status.tone === 'ok' ? 'checkCircle' : 'alert'}
              size={15}
              color={status.tone === 'ok' ? colors.primary : colors.danger}
              strokeWidth={2}
            />
            <Text
              style={[
                styles.bannerText,
                { color: status.tone === 'ok' ? colors.primary : colors.danger },
              ]}
            >
              {status.text}
            </Text>
          </View>
        ) : null}

        <View>
          <SectionTitle title="Data di perangkat ini" icon="database" />
          <Card style={{ gap: spacing.sm }}>
            <KeyValueRow label="Barang" value={String(counts.produk)} icon="package" />
            <KeyValueRow label="Transaksi" value={String(counts.transaksi)} icon="receipt" />
            <KeyValueRow label="Kasbon & utang" value={String(counts.kasbon + counts.utang)} icon="book" />
            <KeyValueRow label="Cadangan terakhir" value={data.settings.lastBackupAt ? 'Ada' : 'Belum pernah'} icon="history" />
            <Divider />
            <Text style={styles.body}>
              Total {total} catatan tersimpan di HP ini
              {isCloudEnabled
                ? ' dan disalin ke perangkat toko Anda saat tersambung.'
                : ' dan tidak pernah dikirim ke mana pun.'}
            </Text>
            <Button
              label="Buka Cadangan data"
              variant="secondary"
              icon="database"
              onPress={() => router.push('/cadangan')}
            />
            <Button
              label="Hapus semua data di perangkat"
              variant="danger"
              icon="trash"
              onPress={wipeDevice}
              disabled={total === 0 || busy}
            />
            {total === 0 ? <Text style={styles.hint}>Belum ada data untuk dihapus.</Text> : null}
          </Card>
        </View>

        {/* Akun hanya relevan (dan hanya ditampilkan) bila aplikasi memakai akun. */}
        {isCloudEnabled ? (
        <View>
          <SectionTitle title="Akun" icon="user" />
          <Card style={{ gap: spacing.sm }}>
            {signedIn ? (
              <>
                <View style={styles.rowBetween}>
                  <Text style={styles.accountEmail} numberOfLines={1}>
                    {auth.email}
                  </Text>
                  {auth.role ? <Chip label={ROLE_LABEL[auth.role]} tone="secondary" size="sm" /> : null}
                </View>
                <Text style={styles.body}>
                  {auth.outletName ?? 'Toko'} • {preview ? `${preview.memberships} keanggotaan` : 'memuat…'}
                </Text>
                <Divider />
                {auth.role && auth.role !== 'owner' ? (
                  <Button
                    label="Keluar dari toko ini"
                    variant="secondary"
                    icon="logout"
                    onPress={leaveStore}
                    disabled={busy}
                  />
                ) : (
                  <Text style={styles.hint}>
                    Sebagai pemilik, serahkan toko ke anggota lain dulu (Anggota toko) sebelum keluar.
                  </Text>
                )}
                <SectionLabel>HAPUS DATA AKUN</SectionLabel>
                {preview && !preview.canDelete ? (
                  <View style={styles.warnBox}>
                    <Icon name="alert" size={15} color={colors.amber} strokeWidth={1.9} />
                    <Text style={styles.warnText}>{preview.reason}</Text>
                  </View>
                ) : (
                  <Text style={styles.body}>
                    Menghapus data akun ikut menghapus {preview?.outletsOwned ?? 1} toko milik Anda beserta
                    seluruh barang, transaksi, kasbon, dan anggotanya. Tidak bisa dibatalkan. Identitas masuk, termasuk email, masih tercatat sampai dihapus oleh pengelola layanan.
                  </Text>
                )}
                <TextField
                  label={`Ketik ${CONFIRM_WORD} untuk mengonfirmasi`}
                  value={confirmText}
                  onChangeText={setConfirmText}
                  autoCapitalize="characters"
                  placeholder={CONFIRM_WORD}
                  editable={preview?.canDelete !== false && !busy}
                />
                <Button
                  label={busy ? 'Menghapus…' : 'Hapus data akun saya'}
                  variant="danger"
                  icon="trash"
                  onPress={() => void removeAccount()}
                  disabled={busy || preview?.canDelete === false}
                />
              </>
            ) : (
              <>
                <Text style={styles.body}>
                  Anda belum masuk akun toko. Semua data hanya ada di HP ini.
                </Text>
                <Button
                  label="Masuk ke akun toko"
                  variant="secondary"
                  icon="user"
                  onPress={() => router.push('/masuk')}
                />
              </>
            )}
          </Card>
        </View>
        ) : null}

        <View>
          <SectionTitle title="Cara kami memperlakukan data" icon="shield" />
          <Card style={{ gap: spacing.sm }}>
            <Text style={styles.body}>
              <Text style={styles.strong}>Tanpa iklan & pelacakan.</Text> Tidak ada iklan, tidak ada pelacak,
              tidak ada penjualan data ke pihak lain.
            </Text>
            {isCloudEnabled ? (
              <Text style={styles.body}>
                <Text style={styles.strong}>Log audit</Text> (siapa mengubah harga, siapa membatalkan
                transaksi) disimpan untuk membantu pemeriksaan. Jadwal pembersihannya diatur oleh pengelola layanan.
              </Text>
            ) : null}
            <Text style={styles.body}>
              <Text style={styles.strong}>Hapus = benar-benar dihapus.</Text>{' '}
              {isCloudEnabled
                ? 'Data toko di akun dan salinan di HP ini dibersihkan. Berkas cadangan, perangkat yang tidak tersambung, serta salinan yang sudah dibagikan perlu dibersihkan terpisah.'
                : 'Data yang dihapus tidak bisa dikembalikan. Buat cadangan dulu bila masih diperlukan.'}
            </Text>
            {isCloudEnabled ? (
              <Pressable onPress={() => router.push('/audit')} hitSlop={8}>
                <Text style={styles.link}>Lihat log audit toko</Text>
              </Pressable>
            ) : null}
          </Card>
        </View>
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
  body: { ...type.body, color: colors.textDim, lineHeight: 20 },
  strong: { fontFamily: fonts.semibold, color: colors.text },
  hint: { ...type.caption, color: colors.textFaint, lineHeight: 17 },
  link: { ...type.caption, fontFamily: fonts.semibold, color: colors.secondary },
  rowBetween: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  accountEmail: { ...type.body, fontFamily: fonts.semibold, color: colors.text, flex: 1 },
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
  warnBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.sm + 2,
    borderRadius: radius.md,
    backgroundColor: colors.amberSoft,
    borderWidth: 1,
    borderColor: colors.amberBorder,
  },
  warnText: { ...type.caption, color: colors.amber, flex: 1, lineHeight: 17 },
});
