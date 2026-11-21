import { appAlert } from '../src/utils/alert';
import { friendlyAuthError, friendlySyncError } from '../src/services/sync/errors';
import { wipeDeviceData } from '../src/services/wipe';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TextField } from '../src/components/Field';
import { Icon, type IconName } from '../src/components/Icon';
import {
  Button,
  Card,
  Chip,
  Divider,
  IconBadge,
  KeyValueRow,
  SectionLabel,
  SectionTitle,
} from '../src/components/Primitives';
import { capitalSavings, cashBalance, isStoreConfigured } from '../src/data/selectors';
import { PrinterSheet } from '../src/components/PrinterSheet';
import { SyncBadge } from '../src/components/SyncBadge';
import { useAuthStore } from '../src/data/auth';
import { useAppStore } from '../src/data/store';
import { clearPhotos } from '../src/services/photos';
import { printerSupportHint } from '../src/services/printer';
import { isCloudEnabled, supabase } from '../src/services/supabase/client';
import { shareReportPdf } from '../src/services/export';
import { colors, fonts, radius, spacing, type } from '../src/theme/tokens';
import { formatRupiah, formatTanggalSingkat } from '../src/utils/format';
import { buildReminderMessage } from '../src/utils/reminder';

export default function PengaturanScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const data = useAppStore();
  const updateProfile = useAppStore((s) => s.updateProfile);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const resetAll = useAppStore((s) => s.resetAll);
  const authEmail = useAuthStore((s) => s.email);
  const outletId = useAuthStore((s) => s.outletId);

  const [name, setName] = useState(data.profile.name);
  const [ownerName, setOwnerName] = useState(data.profile.ownerName);
  const [code, setCode] = useState(data.profile.code);
  const [phone, setPhone] = useState(data.profile.phone ?? '');
  const [openTime, setOpenTime] = useState(data.profile.openTime);
  const [closeTime, setCloseTime] = useState(data.profile.closeTime);
  const [template, setTemplate] = useState(data.settings.reminderTemplate);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const [saveError, setSaveError] = useState<string | null>(null);
  const [printerOpen, setPrinterOpen] = useState(false);

  const [taxText, setTaxText] = useState(String(data.settings.taxPercent ?? 0));
  const [taxError, setTaxError] = useState<string | null>(null);

  const saveTax = () => {
    const raw = taxText.trim().replace(',', '.');
    const value = raw === '' ? 0 : Number(raw);
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      setTaxError('Tarif pajak harus antara 0 dan 100.');
      return;
    }
    setTaxError(null);
    void updateSettings({ taxPercent: value });
    setSavedAt(new Date().toISOString());
  };

  // Pemakaian data hanya bermakna di mode cloud (server menghitungnya).
  const [usage, setUsage] = useState<{
    transactions: number;
    products: number;
    members: number;
    est_mb: number;
    first_record: string | null;
  } | null>(null);
  const [usageError, setUsageError] = useState<string | null>(null);

  useEffect(() => {
    if (!isCloudEnabled || !supabase || !outletId) return;
    let alive = true;
    void (async () => {
      const { data: rows, error } = await supabase.rpc('outlet_usage', { p_outlet: outletId });
      if (!alive) return;
      if (error) {
        setUsageError(friendlySyncError(error));
        return;
      }
      const row = Array.isArray(rows) ? rows[0] : rows;
      setUsage(row ?? null);
      setUsageError(null);
    })();
    return () => {
      alive = false;
    };
  }, [outletId]);

  const save = () => {
    const result = updateProfile({
      name: name.trim(),
      ownerName: ownerName.trim(),
      code: code.trim(),
      phone: phone.trim(),
      openTime: openTime.trim() || '06:00',
      closeTime: closeTime.trim() || '21:00',
    });
    if (!result.ok) {
      setSaveError(result.reason);
      return;
    }
    setSaveError(null);
    const templateResult = updateSettings({ reminderTemplate: template });
    if (!templateResult.ok) {
      setSaveError(templateResult.reason);
      return;
    }
    setSavedAt(new Date().toISOString());
    setTimeout(() => setSavedAt(null), 2500);
  };

  const confirmReset = () => {
    appAlert.alert(
      'Hapus semua data?',
      'Transaksi, kasbon, produk, dan tabungan modal akan dihapus permanen. Identitas toko juga ikut dihapus.',
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Hapus semua',
          style: 'destructive',
          onPress: async () => {
            try { await wipeDeviceData(); } catch {
              setSaveError('Penghapusan belum selesai. Coba lagi.');
              return;
            }
            setName('');
            setOwnerName('');
            setCode('');
            setPhone('');
            setOpenTime('06:00');
            setCloseTime('21:00');
            // Form harus mengikuti isi penyimpanan setelah direset (template
            // kembali ke bawaan), bukan menyisakan teks lama di kotak isian.
            setTemplate(useAppStore.getState().settings.reminderTemplate);
            appAlert.alert('Data dihapus', 'Aplikasi kembali ke kondisi awal tanpa data.');
          },
        },
      ],
    );
  };

  // Pratinjau memakai kasbon nyata bila ada, kalau tidak pakai label netral
  // supaya tidak terkesan ada data contoh.
  const sampleName = data.receivables.find((r) => r.payments.reduce((s2, p2) => s2 + p2.amount, 0) < r.amount)?.customerName;
  const sampleAmount = 50_000;
  const preview = buildReminderMessage({
    template,
    customerName: sampleName ?? 'Pelanggan',
    storeName: name || data.profile.name || 'Toko saya',
    amount: sampleAmount,
    dueDate: new Date().toISOString(),
  });

  const rows: { icon: IconName; label: string; value: string }[] = [
    { icon: 'receipt', label: 'Transaksi tercatat', value: `${data.transactions.length}` },
    { icon: 'book', label: 'Kasbon & utang', value: `${data.receivables.length + data.payables.length}` },
    { icon: 'package', label: 'Barang di katalog', value: `${data.products.length}` },
    { icon: 'coins', label: 'Kas harian', value: formatRupiah(cashBalance(data)) },
    { icon: 'wallet', label: 'Tabungan modal', value: formatRupiah(capitalSavings(data)) },
  ];

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconButton} hitSlop={10}>
          <Icon name="chevronLeft" size={17} color={colors.textMuted} strokeWidth={2} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Pengaturan</Text>
          <Text style={styles.headerSubtitle}>
            {isStoreConfigured(data) ? data.profile.name : 'Lengkapi identitas toko'}
          </Text>
        </View>
        {savedAt ? <Chip label="Tersimpan" tone="primary" icon="check" size="sm" /> : null}
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Akun & sinkron — hanya muncul bila aplikasi memang punya akun.
            Fitur yang belum tersedia tidak boleh dipromosikan: pengguna yang
            menekan lalu mendapat "belum bisa dipakai" akan memberi bintang satu. */}
        {isCloudEnabled ? (
        <View>
          <SectionTitle title="Akun & sinkronisasi" icon="shield" />
          <Pressable
            onPress={() => router.push('/akun')}
            accessibilityRole="button"
            accessibilityLabel="Buka akun dan sinkronisasi"
          >
            <Card style={{ gap: spacing.sm }}>
              <View style={styles.accountRow}>
                <IconBadge name="user" tone="secondary" size={34} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.accountTitle}>{authEmail ?? 'Belum masuk'}</Text>
                  <Text style={styles.accountSub}>Sinkron antar perangkat toko</Text>
                </View>
                <SyncBadge compact />
                <Icon name="chevronRight" size={15} color={colors.textFaint} strokeWidth={2} />
              </View>
            </Card>
          </Pressable>
        </View>
        ) : null}

        {/* Tim & keamanan */}
        <View>
          <SectionTitle
            title={isCloudEnabled ? 'Tim & keamanan' : 'Operasional toko'}
            icon={isCloudEnabled ? 'users' : 'settings'}
          />
          <Card style={{ gap: spacing.sm }}>
            <Pressable
              onPress={() => router.push('/shift')}
              style={styles.accountRow}
              accessibilityRole="button"
              accessibilityLabel="Buka shift kasir"
            >
              <IconBadge name="clock" tone="secondary" size={34} />
              <View style={{ flex: 1 }}>
                <Text style={styles.accountTitle}>Shift kasir</Text>
                <Text style={styles.accountSub}>Modal awal, hitung uang laci, selisih</Text>
              </View>
              <Icon name="chevronRight" size={15} color={colors.textFaint} strokeWidth={2} />
            </Pressable>
            {isCloudEnabled ? (
              <>
                <Divider />
                <Pressable
                  onPress={() => router.push('/anggota')}
                  style={styles.accountRow}
                  accessibilityRole="button"
                  accessibilityLabel="Kelola anggota toko"
                >
                  <IconBadge name="users" tone="primary" size={34} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.accountTitle}>Anggota toko</Text>
                    <Text style={styles.accountSub}>Undang kasir/admin lewat kode undangan</Text>
                  </View>
                  <Icon name="chevronRight" size={15} color={colors.textFaint} strokeWidth={2} />
                </Pressable>
                <Divider />
                <Pressable
                  onPress={() => router.push('/audit')}
                  style={styles.accountRow}
                  accessibilityRole="button"
                  accessibilityLabel="Lihat log audit"
                >
                  <IconBadge name="shield" tone="amber" size={34} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.accountTitle}>Log audit</Text>
                    <Text style={styles.accountSub}>Siapa mengubah harga, siapa void transaksi</Text>
                  </View>
                  <Icon name="chevronRight" size={15} color={colors.textFaint} strokeWidth={2} />
                </Pressable>
              </>
            ) : null}
            <Divider />
            <Pressable
              onPress={() => router.push('/cabang')}
              style={styles.accountRow}
              accessibilityRole="button"
              accessibilityLabel="Buka daftar cabang"
            >
              <IconBadge name="store" tone="secondary" size={34} />
              <View style={{ flex: 1 }}>
                <Text style={styles.accountTitle}>Cabang</Text>
                <Text style={styles.accountSub}>
                  {data.outlets.length <= 1
                    ? 'Satu lokasi — stok & laporan terpisah bila menambah'
                    : `${data.outlets.filter((o) => !o.archivedAt).length} cabang aktif`}
                </Text>
              </View>
              <Icon name="chevronRight" size={15} color={colors.textFaint} strokeWidth={2} />
            </Pressable>
            <Divider />
            <Pressable
              onPress={() => router.push('/pembelian')}
              style={styles.accountRow}
              accessibilityRole="button"
              accessibilityLabel="Buka catat kulakan"
            >
              <IconBadge name="truck" tone="primary" size={34} />
              <View style={{ flex: 1 }}>
                <Text style={styles.accountTitle}>Kulakan &amp; harga modal</Text>
                <Text style={styles.accountSub}>
                  {data.purchases.length > 0
                    ? `${data.purchases.length} kulakan tercatat`
                    : 'Catat belanja stok, harga modal rata-rata'}
                </Text>
              </View>
              <Icon name="chevronRight" size={15} color={colors.textFaint} strokeWidth={2} />
            </Pressable>
            <Divider />
            <Pressable
              onPress={() => router.push('/supplier')}
              style={styles.accountRow}
              accessibilityRole="button"
              accessibilityLabel="Buka buku supplier"
            >
              <IconBadge name="users" tone="secondary" size={34} />
              <View style={{ flex: 1 }}>
                <Text style={styles.accountTitle}>Buku supplier</Text>
                <Text style={styles.accountSub}>
                  {data.suppliers.filter((row) => !row.archivedAt).length === 0
                    ? 'Daftar agen, utang & retur barang'
                    : `${data.suppliers.filter((row) => !row.archivedAt).length} supplier • retur barang`}
                </Text>
              </View>
              <Icon name="chevronRight" size={15} color={colors.textFaint} strokeWidth={2} />
            </Pressable>
            <Divider />
            <Pressable
              onPress={() => router.push('/pelanggan')}
              style={styles.accountRow}
              accessibilityRole="button"
              accessibilityLabel="Buka buku pelanggan"
            >
              <IconBadge name="users" tone="primary" size={34} />
              <View style={{ flex: 1 }}>
                <Text style={styles.accountTitle}>Pelanggan</Text>
                <Text style={styles.accountSub}>
                  {data.customers.length === 0
                    ? 'Simpan nama & nomor HP pelanggan tetap'
                    : `${data.customers.length} nama • poin & kasbon`}
                </Text>
              </View>
              <Icon name="chevronRight" size={15} color={colors.textFaint} strokeWidth={2} />
            </Pressable>
            <Divider />
            <Pressable
              onPress={() => router.push('/cadangan')}
              style={styles.accountRow}
              accessibilityRole="button"
              accessibilityLabel="Buka cadangan data"
            >
              <IconBadge name="database" tone="secondary" size={34} />
              <View style={{ flex: 1 }}>
                <Text style={styles.accountTitle}>Cadangan data</Text>
                <Text style={styles.accountSub}>Simpan & pindahkan data</Text>
              </View>
              <Icon name="chevronRight" size={15} color={colors.textFaint} strokeWidth={2} />
            </Pressable>
            <Divider />
            <Pressable
              onPress={() => router.push('/pengingat')}
              style={styles.accountRow}
              accessibilityRole="button"
              accessibilityLabel="Buka pengingat jatuh tempo"
            >
              <IconBadge name="bell" tone="tertiary" size={34} />
              <View style={{ flex: 1 }}>
                <Text style={styles.accountTitle}>Pengingat jatuh tempo</Text>
                <Text style={styles.accountSub}>
                  {data.settings.notifEnabled
                    ? `Aktif • ${String(data.settings.notifHour).padStart(2, '0')}.00`
                    : 'Belum aktif'}
                </Text>
              </View>
              <Icon name="chevronRight" size={15} color={colors.textFaint} strokeWidth={2} />
            </Pressable>
            <Divider />
            <Pressable
              onPress={() => router.push('/privasi')}
              style={styles.accountRow}
              accessibilityRole="button"
              accessibilityLabel="Buka data dan privasi"
            >
              <IconBadge name="shield" tone="amber" size={34} />
              <View style={{ flex: 1 }}>
                <Text style={styles.accountTitle}>Data & privasi</Text>
                <Text style={styles.accountSub}>Hapus data perangkat atau akun</Text>
              </View>
              <Icon name="chevronRight" size={15} color={colors.textFaint} strokeWidth={2} />
            </Pressable>
          </Card>
        </View>

        {/* Pemakaian data toko */}
        {isCloudEnabled ? (
          <View>
            <SectionTitle title="Pemakaian toko" icon="database" />
            <Card style={{ gap: spacing.sm }}>
              {usageError ? (
                <Text style={styles.accountSub}>{usageError}</Text>
              ) : usage ? (
                <>
                  <KeyValueRow label="Transaksi" value={String(Number(usage.transactions))} icon="receipt" />
                  <KeyValueRow label="Barang" value={String(Number(usage.products))} icon="package" />
                  <KeyValueRow label="Anggota" value={String(Number(usage.members))} icon="users" />
                  <KeyValueRow
                    label="Perkiraan ukuran"
                    value={`${Number(usage.est_mb).toFixed(2)} MB`}
                    icon="database"
                  />
                  <KeyValueRow
                    label="Data sejak"
                    value={usage.first_record ? formatTanggalSingkat(usage.first_record) : 'Belum ada transaksi'}
                    icon="clock"
                  />
                  <Text style={styles.accountSub}>
                    Angka ini membantu memantau besarnya data toko. Riwayat gerak stok lama
                    dirapikan otomatis setelah 180 hari; transaksi tidak pernah dihapus.
                  </Text>
                </>
              ) : (
                <Text style={styles.accountSub}>Memuat pemakaian…</Text>
              )}
            </Card>
          </View>
        ) : null}

        {/* Identitas */}
        <View>
          <SectionTitle title="Identitas toko" icon="store" />
          <Card style={{ gap: spacing.md }}>
            <TextField
              label="Nama toko"
              placeholder="Contoh: Warung Berkah"
              icon="store"
              value={name}
              onChangeText={setName}
            />
            <TextField
              label="Nama pemilik / pengelola"
              placeholder="Contoh: Bu Siti"
              icon="user"
              value={ownerName}
              onChangeText={setOwnerName}
            />
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <TextField
                label="Kode toko"
                placeholder="W-0001"
                value={code}
                onChangeText={setCode}
                style={{ flex: 1 }}
              />
              <TextField
                label="Nomor WhatsApp"
                placeholder="08xx"
                keyboardType="phone-pad"
                value={phone}
                onChangeText={setPhone}
                style={{ flex: 1.4 }}
              />
            </View>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <TextField label="Jam buka" placeholder="06:00" value={openTime} onChangeText={setOpenTime} style={{ flex: 1 }} />
              <TextField
                label="Jam tutup"
                placeholder="21:00"
                value={closeTime}
                onChangeText={setCloseTime}
                style={{ flex: 1 }}
              />
            </View>
            {saveError ? <Text style={styles.saveError}>{saveError}</Text> : null}
            <Button label="Simpan identitas" icon="check" onPress={save} />
          </Card>
        </View>

        {/* Pajak */}
        <View>
          <SectionTitle title="Pajak penjualan" icon="receipt" />
          <Card style={{ gap: spacing.md }}>
            <TextField
              label="Tarif pajak bawaan"
              prefix="%"
              keyboardType="number-pad"
              value={taxText}
              onChangeText={setTaxText}
              hint="0 bila tidak memungut pajak. Contoh: 10 untuk PB1 restoran. Kasir masih bisa mengubah per transaksi."
            />
            {taxError ? <Text style={styles.saveError}>{taxError}</Text> : null}
            <Button label="Simpan tarif pajak" variant="secondary" icon="check" onPress={saveTax} />
          </Card>
        </View>

        {/* Pengingat */}
        <View>
          <SectionTitle title="Template pengingat kasbon" icon="whatsapp" />
          <Card style={{ gap: spacing.md }}>
            <TextField
              label="Pesan yang dikirim"
              multiline
              value={template}
              onChangeText={setTemplate}
              hint="Variabel: {nama}, {toko}, {nominal}, {tanggal}"
            />
            <View style={styles.previewBox}>
              <SectionLabel>Pratinjau (contoh pengisian)</SectionLabel>
              <Text style={styles.previewText}>{preview}</Text>
            </View>
            <Button label="Simpan template" variant="secondary" icon="check" onPress={save} />
          </Card>
        </View>

        {/* Printer */}
        <View>
          <SectionTitle title="Printer struk" icon="printer" />
          <Card style={{ gap: spacing.md }}>
            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.switchLabel}>Pratinjau struk setelah simpan</Text>
                <Text style={styles.switchHint}>
                  Membuka pratinjau struk setiap transaksi disimpan. Cetak langsung butuh printer
                  Bluetooth yang sudah dipasangkan.
                </Text>
              </View>
              <Switch
                value={data.settings.autoPrint}
                onValueChange={(value) => void updateSettings({ autoPrint: value })}
                trackColor={{ false: colors.cardHighest, true: colors.primaryBorder }}
                thumbColor={data.settings.autoPrint ? colors.primary : colors.textFaint}
              />
            </View>
            <Divider />
            <Pressable
              onPress={() => setPrinterOpen(true)}
              style={styles.printerRow}
              accessibilityRole="button"
              accessibilityLabel="Buka pengaturan printer Bluetooth"
            >
              <View style={styles.printerIcon}>
                <Icon name="bluetooth" size={15} color={colors.secondary} strokeWidth={1.9} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.switchLabel}>
                  {data.settings.printerName || 'Sambungkan printer'}
                </Text>
                <Text style={styles.switchHint}>{printerSupportHint()}</Text>
              </View>
              <Icon name="chevronRight" size={15} color={colors.textFaint} strokeWidth={2} />
            </Pressable>
          </Card>
        </View>

        {/* Data */}
        <View>
          <SectionTitle title="Data & privasi" icon="shield" />
          <Card>
            {rows.map((row) => (
              <KeyValueRow key={row.label} label={row.label} value={row.value} icon={row.icon} />
            ))}
            <Divider style={{ marginVertical: spacing.md }} />
            <Text style={styles.hint}>
              Data disimpan di HP ini. Bila memakai akun toko, data juga disinkronkan ke akun toko.
            </Text>
            <Button
              label="Bagikan laporan PDF bulan ini"
              variant="secondary"
              icon="fileText"
              onPress={() => {
                const now = new Date();
                const from = new Date(now.getFullYear(), now.getMonth(), 1);
                shareReportPdf(data, from, now);
              }}
              style={{ marginTop: spacing.md }}
            />
            <Button
              label="Hapus semua data"
              variant="danger"
              icon="trash"
              onPress={confirmReset}
              style={{ marginTop: spacing.sm }}
            />
          </Card>
        </View>

        {/* Tentang */}
        <Card style={styles.aboutCard}>
          <View style={styles.aboutRow}>
            <IconBadge name="sparkle" tone="primary" size={40} />
            <View style={{ flex: 1 }}>
              <Text style={styles.aboutTitle}>Inventori’s</Text>
              <Text style={styles.aboutText}>
                Pembukuan warung yang siap dipakai tanpa internet. Versi{' '}
                {Constants.expoConfig?.version ?? '1.0.0'}.
              </Text>
              <Text style={styles.aboutMeta}>Diperbarui {formatTanggalSingkat(new Date())}</Text>
            </View>
          </View>
        </Card>
      </ScrollView>

      <PrinterSheet visible={printerOpen} onClose={() => setPrinterOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  accountRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  accountTitle: { ...type.body, fontFamily: fonts.semibold, color: colors.text },
  accountSub: { ...type.caption, color: colors.textDim, marginTop: 1 },
  saveError: { ...type.caption, color: colors.danger, marginTop: spacing.md },
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
  headerTitle: { ...type.h2, fontSize: 15, color: colors.white },
  headerSubtitle: { ...type.caption, color: colors.textDim, marginTop: 1 },
  content: { padding: spacing.base, gap: spacing.lg, paddingBottom: 48 },

  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  switchLabel: { ...type.caption, fontFamily: fonts.semibold, color: colors.text },
  switchHint: { ...type.micro, fontFamily: fonts.medium, color: colors.textFaint },

  previewBox: {
    backgroundColor: colors.cardHigh,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  previewText: { ...type.caption, color: colors.textMuted, lineHeight: 18 },
  printerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  printerIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cardHigh,
    borderWidth: 1,
    borderColor: colors.border,
  },
  hint: { ...type.micro, fontFamily: fonts.medium, color: colors.textFaint, lineHeight: 15 },

  aboutCard: { borderColor: colors.border },
  aboutRow: { flexDirection: 'row', gap: spacing.md },
  aboutTitle: { ...type.bodyMedium, fontFamily: fonts.bold, color: colors.white },
  aboutText: { ...type.micro, fontFamily: fonts.medium, color: colors.textDim, marginTop: 2, lineHeight: 15 },
  aboutMeta: { ...type.micro, fontFamily: fonts.medium, color: colors.textFaint, marginTop: 6 },
});
