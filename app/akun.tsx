/**
 * Layar Akun & Sinkron.
 *
 * Menjelaskan dengan jujur mode yang sedang aktif (lokal atau cloud), peran
 * pengguna, outlet tempat ia terdaftar, dan berapa perubahan yang menunggu
 * terkirim. Juga tempat keluar (logout) dan membuat toko baru bila akun belum
 * terhubung ke outlet mana pun.
 */
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '../src/components/Icon';
import { TextField } from '../src/components/Field';
import { Button, Card, Chip, Divider, KeyValueRow, SectionTitle } from '../src/components/Primitives';
import { useAuthStore } from '../src/data/auth';
import { localStore } from '../src/services/db/local';
import { refreshPending, syncNow } from '../src/services/sync/engine';
import { useSyncStore } from '../src/services/sync/state';
import { isCloudEnabled, supabase } from '../src/services/supabase/client';
import { colors, fonts, radius, spacing, type } from '../src/theme/tokens';
import { ROLE_LABEL } from '../src/utils/permissions';

export default function AkunScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { email, role, outletId, outletName, userId, signOut, refreshMembership } = useAuthStore();
  const { status, pending, lastSyncAt, error, online } = useSyncStore();

  const [busy, setBusy] = useState(false);
  const [storeName, setStoreName] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    void refreshPending();
  }, []);

  const runSync = async () => {
    setBusy(true);
    await syncNow();
    setBusy(false);
  };

  const createStore = async () => {
    if (!supabase) return;
    if (!storeName.trim()) {
      setFormError('Nama toko wajib diisi.');
      return;
    }
    setBusy(true);
    setFormError(null);
    const { error: rpcError } = await supabase.rpc('create_outlet', {
      p_name: storeName.trim(),
      p_code: null,
    });
    setBusy(false);
    if (rpcError) {
      setFormError(rpcError.message);
      return;
    }
    await refreshMembership();
    await syncNow();
  };

  const leave = async () => {
    await signOut();
    router.replace('/masuk');
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconButton} hitSlop={10}>
          <Icon name="chevronLeft" size={17} color={colors.textMuted} strokeWidth={2} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Akun &amp; Sinkron</Text>
          <Text style={styles.headerSubtitle}>
            {isCloudEnabled ? 'Tersambung antar perangkat' : 'Hanya tersimpan di HP ini'}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.lg }]}
        showsVerticalScrollIndicator={false}
      >
        {!isCloudEnabled ? (
          <>
            <Card style={{ gap: spacing.sm }}>
              <Text style={styles.cardTitle}>Semua fitur kasir jalan tanpa akun</Text>
              <Text style={styles.body}>
                Barang, transaksi, kasbon, shift, laporan, laba, printer, dan catatan suara
                tersimpan penuh di HP ini. Tidak butuh internet dan tidak butuh akun.
              </Text>
              <Text style={styles.body}>
                Bedanya bila memakai akun toko: data bisa dibuka dari HP lain, ada cadangan
                otomatis, serta peran anggota dan log audit.
              </Text>
            </Card>

            {isCloudEnabled ? (
            <Card style={{ gap: spacing.sm }}>
              <Text style={styles.cardTitle}>Ingin dibuka dari HP lain?</Text>
              <Text style={styles.body}>
                Masuk memakai akun toko Anda. Data yang sudah tercatat di HP ini tetap utuh dan
                ikut tersalin setelah masuk — tidak ada yang hilang.
              </Text>
              <Text style={styles.body}>
                Belum punya akun? Pemilik toko membuatkannya, atau Anda bisa menjadi pemilik toko
                baru dengan mendaftar memakai kode undangan.
              </Text>
              <Button
                label="Masuk atau daftar"
                icon="user"
                onPress={() => router.push('/masuk')}
              />
            </Card>
            ) : (
            <Card style={{ gap: spacing.sm }}>
              <Text style={styles.cardTitle}>Pindah ke HP baru?</Text>
              <Text style={styles.body}>
                Buat cadangan dari Menu Cadangan, lalu pulihkan berkasnya di HP baru. Semua barang,
                transaksi, kasbon, dan pengaturan toko ikut pindah.
              </Text>
              <Button
                label="Buka Cadangan data"
                variant="secondary"
                icon="database"
                onPress={() => router.push('/cadangan')}
              />
            </Card>
            )}
          </>
        ) : (
          <>
            <SectionTitle title="Sesi" icon="user" />
            <Card style={{ gap: spacing.sm }}>
              <KeyValueRow label="Email" value={email ?? 'Belum masuk'} />
              <Divider />
              <KeyValueRow label="Peran" value={role ? ROLE_LABEL[role] : 'Belum terhubung'} />
              <Divider />
              <KeyValueRow label="Toko" value={outletName ?? 'Belum tersambung'} />
            </Card>

            {userId && !outletId ? (
              <Card style={{ gap: spacing.md }}>
                <Text style={styles.cardTitle}>Buat toko pertama</Text>
                <Text style={styles.body}>
                  Akun ini belum tersambung ke toko. Buat nama toko dulu; Anda otomatis menjadi
                  pemiliknya.
                </Text>
                <TextField
                  label="Nama toko"
                  placeholder="Contoh: Warung Berkah"
                  icon="store"
                  value={storeName}
                  onChangeText={setStoreName}
                />
                {formError ? <Text style={styles.error}>{formError}</Text> : null}
                <Button
                  label={busy ? 'Memproses…' : 'Buat toko'}
                  icon="plus"
                  onPress={() => void createStore()}
                  disabled={busy}
                />
              </Card>
            ) : null}

            <SectionTitle title="Sinkronisasi" icon="refresh" />
            <Card style={{ gap: spacing.sm }}>
              <View style={styles.rowBetween}>
                <Text style={styles.body}>Status</Text>
                <Chip
                  label={
                    !online
                      ? 'Tidak tersambung'
                      : status === 'syncing'
                        ? 'Berjalan'
                        : status === 'error'
                          ? 'Gagal'
                          : pending > 0
                            ? `${pending} menunggu`
                            : 'Tersinkron'
                  }
                  tone={!online || pending > 0 ? 'amber' : status === 'error' ? 'danger' : 'primary'}
                  size="sm"
                />
              </View>
              <Divider />
              <KeyValueRow
                label="Jaringan"
                value={online ? 'Tersambung' : 'Tidak tersambung — perubahan ditahan dulu'}
              />
              <Divider />
              <KeyValueRow
                label="Terakhir sinkron"
                value={
                  lastSyncAt
                    ? new Date(lastSyncAt).toLocaleString('id-ID', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : 'Belum pernah'
                }
              />
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Button
                label={busy ? 'Menyinkronkan…' : 'Sinkron sekarang'}
                icon="refresh"
                onPress={() => void runSync()}
                disabled={busy}
              />
            </Card>

            <Button label="Keluar" icon="logout" variant="ghost" onPress={() => void leave()} />
          </>
        )}

        <SectionTitle title="Penyimpanan di HP" icon="package" />
        <Card>
          <Text style={styles.body}>
            Semua catatan disimpan di HP ini. Perubahan yang belum sempat terkirim tetap aman dan
            tidak hilang saat aplikasi ditutup.
          </Text>
        </Card>
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
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.lg },
  cardTitle: { ...type.h2, fontFamily: fonts.bold, color: colors.text },
  body: { ...type.body, color: colors.textDim, lineHeight: 20 },
  code: { ...type.caption, fontFamily: fonts.mono, color: colors.secondary },
  error: { ...type.caption, fontFamily: fonts.medium, color: colors.danger },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
