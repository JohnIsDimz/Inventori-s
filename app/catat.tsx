import { appAlert } from '../src/utils/alert';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TextField } from '../src/components/Field';
import { Icon, type IconName } from '../src/components/Icon';
import { Keypad } from '../src/components/Keypad';
import {
  Button,
  Card,
  Chip,
  Divider,
  IconBadge,
  SectionLabel,
  Sheet,
} from '../src/components/Primitives';
import { PAY_METHODS } from '../src/data/categories';
import { useAppStore } from '../src/data/store';
import { useScopedData } from '../src/data/scope';
import type { LineItem, PayMethod, TxType } from '../src/data/types';
import { buildReceiptText } from '../src/services/printer/receipt';
import { printerSupportHint } from '../src/services/printer';
import { colors, fonts, gradients, radius, spacing, type } from '../src/theme/tokens';
import {
  addDays,
  formatJam,
  formatRupiah,
  formatTanggalSingkat,
  maskNominal,
  parseNumber,
} from '../src/utils/format';
import { LinearGradient } from 'expo-linear-gradient';

import { shareMessage } from '../src/utils/reminder';
import { parseSpokenTransaction } from '../src/utils/speech';
import { VoiceButton } from '../src/components/VoiceButton';
import { connectPrinter, connectedPrinter, printReceiptText, printerSupportHint as printerHint } from '../src/services/printer';
import { deletePhoto, persistPhoto } from '../src/services/photos';

export default function CatatScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ type?: string }>();
  const insets = useSafeAreaInsets();

  const data = useScopedData();
  const categories = useAppStore((s) => s.categories);
  const addTransaction = useAppStore((s) => s.addTransaction);
  const addCategory = useAppStore((s) => s.addCategory);
  const deleteCategory = useAppStore((s) => s.deleteCategory);
  const updateSettings = useAppStore((s) => s.updateSettings);

  const [txType, setTxType] = useState<TxType>(params.type === 'expense' ? 'expense' : 'sale');
  const [digits, setDigits] = useState('');
  const [categoryId, setCategoryId] = useState<string>(
    params.type === 'expense' ? 'exp-kulakan' : 'sale-sembako',
  );
  const [method, setMethod] = useState<PayMethod>('cash');
  const [note, setNote] = useState('');
  const [photoUri, setPhotoUri] = useState<string | undefined>();
  const [savedPhotoTaken, setSavedPhotoTaken] = useState(false);
  const [printMessage, setPrintMessage] = useState<string | null>(null);
  const [when, setWhen] = useState<Date>(new Date());
  const [items, setItems] = useState<LineItem[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [dueDate, setDueDate] = useState<Date>(addDays(new Date(), 7));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedInfo, setSavedInfo] = useState<{ amount: number; isKasbon: boolean } | null>(null);

  const [timeSheet, setTimeSheet] = useState(false);
  const [itemSheet, setItemSheet] = useState(false);
  const [catSheet, setCatSheet] = useState(false);
  const [receiptSheet, setReceiptSheet] = useState(false);
  const [receiptText, setReceiptText] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [catError, setCatError] = useState<string | null>(null);

  const saveLock = useRef(false);
  useEffect(() => { saveLock.current = false; }, [digits, items, method, note]);
  const amount = parseNumber(digits);
  const visibleCategories = useMemo(
    () => categories.filter((c) => c.type === txType),
    [categories, txType],
  );
  const activeCategory = categories.find((c) => c.id === categoryId);
  const isKasbon = method === 'kasbon';

  const changeType = (next: TxType) => {
    setTxType(next);
    const first = categories.find((c) => c.type === next);
    if (first) setCategoryId(first.id);
    if (next === 'expense' && method === 'kasbon') setMethod('cash');
  };

  const onKey = (key: string) => {
    setDigits((prev) => {
      const next = (prev === '' && key === '000' ? '0' : prev + key).replace(/^0+(?=\d)/, '');
      return next.slice(0, 12);
    });
  };

  const pickPhoto = async (source: 'camera' | 'library') => {
    try {
      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          appAlert.alert('Izin kamera dibutuhkan', 'Aktifkan izin kamera untuk memfoto nota.');
          return;
        }
        const result = await ImagePicker.launchCameraAsync({ quality: 0.6 });
        if (!result.canceled) setPhotoUri(await persistPhoto(result.assets[0].uri));
      } else {
        const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.6, mediaTypes: ['images'] });
        if (!result.canceled) setPhotoUri(await persistPhoto(result.assets[0].uri));
      }
    } catch {
      appAlert.alert('Gagal membuka kamera', 'Coba lagi atau lampirkan dari galeri.');
    }
  };

  const resetForm = () => {
    setDigits('');
    setNote('');
    setPhotoUri(undefined);
    setSavedPhotoTaken(false);
    setItems([]);
    setCustomerName('');
    setWhen(new Date());
  };

  const generateInvoice = () => {
    const now = when;
    const stamp = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}${String(
      now.getDate(),
    ).padStart(2, '0')}`;
    const todayCount = data.transactions.filter(
      (t) => new Date(t.createdAt).toDateString() === now.toDateString(),
    ).length;
    return `INV-${stamp}-${String(todayCount + 1).padStart(3, '0')}`;
  };

  const buildCurrentReceipt = (invoice?: string) =>
    buildReceiptText({
      storeName: data.profile.name || 'Toko Saya',
      storeCode: data.profile.code,
      storePhone: data.profile.phone,
      invoice: invoice ?? 'PRATINJAU',
      type: txType,
      createdAt: when.toISOString(),
      items,
      total: amount,
      method,
      note,
      cashier: data.profile.ownerName,
    });

  /** Isi nominal (dan catatan) dari ucapan Bahasa Indonesia. */
  const applyVoice = (transcript: string) => {
    const spoken = parseSpokenTransaction(transcript);
    if (spoken.amount === null) {
      setError(`Belum ada nominal yang terbaca dari “${transcript}”. Coba sebut angkanya, mis. "dua puluh lima ribu".`);
      return;
    }
    setError(null);
    setDigits(String(spoken.amount));
    if (spoken.note && !note.trim()) setNote(spoken.note);
  };

  const openReceiptPreview = () => {
    setReceiptText(buildCurrentReceipt());
    setReceiptSheet(true);
  };

  const save = (again = false) => {
    if (saveLock.current) return;
    if (amount <= 0) {
      setError('Nominal transaksi belum diisi.');
      return;
    }
    if (isKasbon && !customerName.trim()) {
      setError('Nama pelanggan wajib diisi untuk transaksi kasbon.');
      return;
    }
    setError(null);
    saveLock.current = true;
    setSaving(true);

    const result = addTransaction({
      type: txType,
      amount,
      categoryId,
      method,
      note: note.trim() || activeCategory?.label,
      photoUri,
      createdAt: when.toISOString(),
      customerName: txType === 'sale' ? customerName.trim() || undefined : undefined,
      saveCustomer: txType === 'sale' && customerName.trim().length > 0,
      dueDate: isKasbon ? dueDate.toISOString() : undefined,
      items: items.length > 0 ? items : undefined,
    });

    if (!result.ok) {
      saveLock.current = false;
      setSaving(false);
      setError(result.reason);
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setReceiptText(buildCurrentReceipt(result.id));
    if (data.settings.autoPrint) setReceiptSheet(true);
    setSavedInfo({ amount, isKasbon });
    setSaving(false);
    setSavedPhotoTaken(true);

    if (again) resetForm();
  };

  return (
    <KeyboardAvoidingView
      style={[styles.root, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <Pressable
          onPress={() => {
            // Foto sudah disalin ke penyimpanan permanen; buang hanya kalau
            // transaksi batal disimpan (kalau sudah tersimpan, foto jadi milik transaksi).
            if (!savedPhotoTaken) deletePhoto(photoUri);
            router.back();
          }}
          hitSlop={10}
          style={styles.closeButton}
          accessibilityLabel="Tutup tanpa menyimpan"
        >
          <Icon name="close" size={17} color={colors.textMuted} strokeWidth={2} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Catat Transaksi</Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            {data.profile.name || 'Toko Anda'} • {formatTanggalSingkat(when)}
          </Text>
        </View>
        <Pressable
          onPress={() => setTimeSheet(true)}
          style={styles.timeChip}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Ubah jam transaksi"
        >
          <Icon name="clock" size={12} color={colors.secondary} strokeWidth={2} />
          <Text style={styles.timeChipText}>{formatJam(when).replace(' WIB', '')}</Text>
          <Icon name="chevronDown" size={11} color={colors.secondary} strokeWidth={2.2} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Jenis transaksi */}
        <View style={styles.typeSwitch}>
          <Pressable
            onPress={() => changeType('sale')}
            style={[styles.typeOption, txType === 'sale' && styles.typeOptionActiveSale]}
          >
            <Icon
              name="arrowDownLeft"
              size={16}
              color={txType === 'sale' ? colors.onPrimary : colors.textMuted}
              strokeWidth={2.1}
            />
            <View>
              <Text style={[styles.typeLabel, txType === 'sale' && { color: colors.onPrimary }]}>
                Pemasukan
              </Text>
              <Text style={[styles.typeHint, txType === 'sale' && { color: 'rgba(0,43,25,0.7)' }]}>
                Penjualan
              </Text>
            </View>
          </Pressable>
          <Pressable
            onPress={() => changeType('expense')}
            style={[styles.typeOption, txType === 'expense' && styles.typeOptionActiveExpense]}
          >
            <Icon
              name="arrowUpRight"
              size={16}
              color={txType === 'expense' ? colors.tertiary : colors.textMuted}
              strokeWidth={2.1}
            />
            <View>
              <Text style={[styles.typeLabel, txType === 'expense' && { color: colors.tertiary }]}>
                Pengeluaran
              </Text>
              <Text style={styles.typeHint}>Kulakan/biaya</Text>
            </View>
          </Pressable>
        </View>

        {/* Nominal */}
        <Card padded={false} style={styles.amountCard}>
          <LinearGradient
            colors={txType === 'sale' ? gradients.income : gradients.expense}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.amountInner}>
            <View style={styles.amountLabelRow}>
              <Text style={styles.amountLabel}>Nominal transaksi</Text>
              {amount > 0 ? (
                <Pressable onPress={() => setDigits('')} hitSlop={8}>
                  <Text style={styles.resetLink}>Reset</Text>
                </Pressable>
              ) : null}
            </View>
            <View style={styles.amountRow}>
              <Text style={styles.amountPrefix}>Rp</Text>
              <Text
                style={[
                  styles.amountValue,
                  { color: amount > 0 ? colors.white : colors.textFaint },
                ]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {amount > 0 ? maskNominal(String(amount)) : '0'}
              </Text>
            </View>
            <View style={{ marginTop: spacing.md }}>
              <VoiceButton
                label={amount > 0 ? 'Ubah nominal dengan suara' : 'Sebut nominal dengan suara'}
                onResult={applyVoice}
                onError={(message) => setError(message)}
              />
            </View>
            <View style={styles.quickRow}>
              {[
                { value: 5000, label: '+5rb' },
                { value: 10000, label: '+10rb' },
                { value: 50000, label: '+50rb' },
                { value: 100000, label: '+100rb' },
              ].map((chip) => (
                <Pressable
                  key={chip.value}
                  onPress={() => setDigits(String(amount + chip.value))}
                  style={styles.quickChip}
                >
                  <Text style={styles.quickChipText}>{chip.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </Card>

        <Keypad onKey={onKey} onDelete={() => setDigits((prev) => prev.slice(0, -1))} />

        {/* Kategori */}
        <View>
          <View style={styles.sectionHeadRow}>
            <SectionLabel>{txType === 'sale' ? 'Kategori penjualan' : 'Kategori pengeluaran'}</SectionLabel>
            <Pressable onPress={() => setCatSheet(true)} hitSlop={8}>
              <Text style={styles.linkText}>Kelola kategori</Text>
            </Pressable>
          </View>
          <View style={styles.categoryGrid}>
            {visibleCategories.map((category) => {
              const active = category.id === categoryId;
              return (
                <Pressable
                  key={category.id}
                  onPress={() => setCategoryId(category.id)}
                  style={[
                    styles.categoryItem,
                    active && {
                      borderColor: colors.primaryBorder,
                      backgroundColor: colors.primarySoft,
                    },
                  ]}
                >
                  <Icon
                    name={category.icon as IconName}
                    size={16}
                    color={active ? colors.primary : colors.textMuted}
                    strokeWidth={1.9}
                  />
                  <Text style={[styles.categoryLabel, active && { color: colors.primary }]} numberOfLines={2}>
                    {category.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Metode pembayaran */}
        <View>
          <SectionLabel>Metode pembayaran</SectionLabel>
          <View style={styles.methodRow}>
            {PAY_METHODS.filter((m) => !(txType === 'expense' && m.id === 'kasbon')).map((m) => {
              const active = method === m.id;
              return (
                <Pressable
                  key={m.id}
                  onPress={() => setMethod(m.id)}
                  style={[
                    styles.methodItem,
                    active && { borderColor: colors.primaryBorder, backgroundColor: colors.primarySoft },
                  ]}
                >
                  <Icon
                    name={m.icon as IconName}
                    size={17}
                    color={active ? colors.primary : colors.textMuted}
                    strokeWidth={1.9}
                  />
                  <Text style={[styles.methodLabel, active && { color: colors.primary }]}>{m.label}</Text>
                  <Text style={styles.methodHint} numberOfLines={1}>
                    {m.hint}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Pelanggan tetap untuk penjualan non-kasbon (opsional) */}
        {txType === 'sale' && !isKasbon ? (
          <Card style={{ gap: spacing.sm }}>
            <View style={styles.inlineHead}>
              <Icon name="users" size={14} color={colors.secondary} strokeWidth={2} />
              <Text style={styles.inlineTitle}>Pelanggan tetap (opsional)</Text>
            </View>
            <TextField
              label="Nama pelanggan"
              placeholder="Contoh: Bu Sri"
              icon="user"
              value={customerName}
              onChangeText={setCustomerName}
            />
            <Text style={styles.customerHint}>
              Nama ini disimpan ke buku pelanggan supaya poin dan riwayat belanjanya terhitung.
            </Text>
          </Card>
        ) : null}

        {/* Detail kasbon */}
        {isKasbon ? (
          <Card style={{ borderColor: colors.amberBorder, gap: spacing.md }}>
            <View style={styles.inlineHead}>
              <Icon name="book" size={14} color={colors.amber} strokeWidth={2} />
              <Text style={styles.inlineTitle}>Detail kasbon</Text>
            </View>
            <TextField
              label="Nama pelanggan"
              placeholder="Contoh: Bu Sri"
              icon="user"
              value={customerName}
              onChangeText={setCustomerName}
            />
            <View style={styles.dueRow}>
              {[3, 7, 14, 30].map((days) => {
                const option = addDays(new Date(), days);
                const active = dueDate.toDateString() === option.toDateString();
                return (
                  <Pressable
                    key={days}
                    onPress={() => setDueDate(option)}
                    style={[styles.dueChip, active && { backgroundColor: colors.amberSoft, borderColor: colors.amberBorder }]}
                  >
                    <Text style={[styles.dueChipText, active && { color: colors.amber }]}>{days} hari</Text>
                  </Pressable>
                );
              })}
              <Text style={styles.dueLabel}>{formatTanggalSingkat(dueDate)}</Text>
            </View>
          </Card>
        ) : null}

        {/* Catatan & foto */}
        <TextField
          label="Catatan / rincian"
          placeholder="Contoh: Beras 5kg + minyak 2L"
          icon="edit"
          multiline
          value={note}
          onChangeText={setNote}
        />

        <View style={styles.photoRow}>
          <Pressable style={styles.photoButton} onPress={() => pickPhoto('camera')}>
            <Icon name="camera" size={16} color={colors.textMuted} strokeWidth={1.9} />
            <Text style={styles.photoButtonText}>Foto nota</Text>
          </Pressable>
          <Pressable style={styles.photoButton} onPress={() => pickPhoto('library')}>
            <Icon name="image" size={16} color={colors.textMuted} strokeWidth={1.9} />
            <Text style={styles.photoButtonText}>Galeri</Text>
          </Pressable>
          {photoUri ? (
            <View style={styles.photoPreviewWrap}>
              <Image source={{ uri: photoUri }} style={styles.photoPreview} contentFit="cover" />
              <Pressable
                style={styles.photoRemove}
                onPress={() => {
                  if (!savedPhotoTaken) deletePhoto(photoUri);
                  setPhotoUri(undefined);
                }}
                hitSlop={6}
                accessibilityLabel="Hapus foto nota"
              >
                <Icon name="close" size={10} color={colors.bgDeep} strokeWidth={3} />
              </Pressable>
            </View>
          ) : null}
        </View>

        {/* Rincian barang */}
        <Card padded={false}>
          <Pressable style={styles.itemsHeader} onPress={() => setItemSheet(true)}>
            <IconBadge name="package" tone="secondary" size={34} />
            <View style={{ flex: 1 }}>
              <Text style={styles.inlineTitle}>Rincian barang</Text>
              <Text style={styles.inlineDesc}>
                {items.length > 0
                  ? `${items.length} item • total ${formatRupiah(items.reduce((s, i) => s + i.price * i.qty, 0))}`
                  : txType === 'sale'
                    ? 'Opsional — dipakai untuk laporan juara penjualan'
                    : 'Catatan barang yang dibeli. Stok tidak berubah di sini — pakai Catat kulakan.'}
              </Text>
            </View>
            <Chip
              label={items.length > 0 ? `${items.length} item` : 'Tambah'}
              tone={items.length > 0 ? 'secondary' : 'neutral'}
              size="sm"
            />
          </Pressable>
        </Card>

        {/* Printer */}
        <Card padded={false}>
          <View style={styles.printerBlock}>
            <View style={styles.inlineHead}>
              <Icon name="printer" size={15} color={colors.textMuted} strokeWidth={1.9} />
              <Text style={styles.inlineTitle}>Printer struk</Text>
              <Chip
                label={data.settings.printerName || 'Belum terhubung'}
                tone={data.settings.printerName ? 'primary' : 'neutral'}
                size="sm"
              />
            </View>
            <Text style={styles.printerHint}>{printerSupportHint()}</Text>
            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.switchLabel}>Pratinjau struk setelah simpan</Text>
                <Text style={styles.switchHint}>Membuka pratinjau struk yang bisa disalin/dibagikan. Cetak langsung butuh printer Bluetooth.</Text>
              </View>
              <Switch
                value={data.settings.autoPrint}
                onValueChange={(value) => void updateSettings({ autoPrint: value })}
                trackColor={{ false: colors.cardHighest, true: colors.primaryBorder }}
                thumbColor={data.settings.autoPrint ? colors.primary : colors.textFaint}
              />
            </View>
            <Divider style={{ marginVertical: spacing.md }} />
            <Pressable style={styles.previewLink} onPress={openReceiptPreview}>
              <Icon name="receipt" size={14} color={colors.secondary} strokeWidth={1.9} />
              <Text style={styles.previewLinkText}>Simpan & lihat pratinjau struk</Text>
            </Pressable>
          </View>
        </Card>
      </ScrollView>

      {/* Footer aksi */}
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
        <Button
          label={amount > 0 ? `Simpan • ${formatRupiah(amount)}` : 'Simpan transaksi'}
          icon="check"
          size="lg"
          loading={saving}
          disabled={amount <= 0}
          onPress={() => save(false)}
        />
        <Pressable
          onPress={() => save(true)}
          disabled={amount <= 0}
          style={[styles.footerSecondary, amount <= 0 && { opacity: 0.5 }]}
          accessibilityRole="button"
          accessibilityLabel="Simpan lalu catat transaksi berikutnya"
        >
          <Icon name="plusCircle" size={14} color={colors.secondary} strokeWidth={2} />
          <Text style={styles.footerSecondaryText}>Simpan &amp; catat lagi</Text>
        </Pressable>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </View>

      {/* ------------------------------------------------------------ Sheets */}
      <Sheet
        visible={timeSheet}
        onClose={() => setTimeSheet(false)}
        title="Waktu transaksi"
        subtitle="Catat transaksi yang terjadi sebelumnya."
        scroll={false}
      >
        <View style={styles.sheetChips}>
          {[
            { label: 'Hari ini', date: new Date() },
            { label: 'Kemarin', date: addDays(new Date(), -1) },
            { label: '2 hari lalu', date: addDays(new Date(), -2) },
          ].map((option) => {
            const active = when.toDateString() === option.date.toDateString();
            return (
              <Pressable
                key={option.label}
                onPress={() => {
                  const next = new Date(option.date);
                  next.setHours(when.getHours(), when.getMinutes(), 0, 0);
                  setWhen(next);
                }}
                style={[styles.dueChip, active && { backgroundColor: colors.primarySoft, borderColor: colors.primaryBorder }]}
              >
                <Text style={[styles.dueChipText, active && { color: colors.primary }]}>{option.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.timeStepper}>
          <Pressable
            style={styles.stepperButton}
            onPress={() => {
              const next = new Date(when);
              next.setMinutes(next.getMinutes() - 15);
              setWhen(next);
            }}
          >
            <Icon name="minus" size={16} color={colors.text} strokeWidth={2.2} />
          </Pressable>
          <Text style={styles.stepperValue}>{formatJam(when)}</Text>
          <Pressable
            style={styles.stepperButton}
            onPress={() => {
              const next = new Date(when);
              next.setMinutes(next.getMinutes() + 15);
              setWhen(next);
            }}
          >
            <Icon name="plus" size={16} color={colors.text} strokeWidth={2.2} />
          </Pressable>
        </View>
        <Button label="Gunakan waktu ini" onPress={() => setTimeSheet(false)} style={{ marginTop: spacing.lg }} />
      </Sheet>

      <Sheet
        visible={itemSheet}
        onClose={() => setItemSheet(false)}
        title="Rincian barang"
        subtitle="Boleh dikosongkan. Rincian dipakai untuk laporan juara penjualan & laba per barang."
      >
        <ItemEditor
          items={items}
          saveLabel="Terapkan rincian"
          onChange={setItems}
          onDone={() => setItemSheet(false)}
          total={amount}
          onMatchTotal={() => setDigits(String(items.reduce((s, i) => s + i.price * i.qty, 0)))}
        />
      </Sheet>

      <Sheet
        visible={catSheet}
        onClose={() => setCatSheet(false)}
        title="Kategori"
        subtitle="Tambah kategori milik Anda sendiri."
        scroll={false}
      >
        <TextField
          label="Nama kategori baru"
          placeholder="Contoh: Gas Melon"
          icon="tag"
          value={newCategory}
          onChangeText={setNewCategory}
          right={
            <Pressable
              onPress={() => {
                const label = newCategory.trim();
                if (!label) return;
                const result = addCategory({
                  label,
                  type: txType,
                  icon: txType === 'sale' ? 'cart' : 'truck',
                });
                if (!result.ok) {
                  setCatError(result.reason);
                  return;
                }
                setCatError(null);
                setNewCategory('');
              }}
            >
              <Icon name="plus" size={18} color={colors.primary} strokeWidth={2.2} />
            </Pressable>
          }
        />
        {catError ? <Text style={styles.errorText}>{catError}</Text> : null}
        <View style={styles.catList}>
          {visibleCategories.map((category) => (
            <View key={category.id} style={styles.catListRow}>
              <Icon name={category.icon as IconName} size={13} color={colors.textMuted} />
              <Text style={styles.catListLabel} numberOfLines={1}>
                {category.label}
              </Text>
              {category.id === categoryId ? <Chip label="dipakai" tone="primary" size="sm" /> : null}
              <Pressable
                hitSlop={8}
                onPress={() => {
                  const result = deleteCategory(category.id);
                  if (!result.ok) setCatError(result.reason);
                  else {
                    setCatError(null);
                    if (categoryId === category.id) {
                      const next = categories.find(
                        (c) => c.type === txType && c.id !== category.id,
                      );
                      if (next) setCategoryId(next.id);
                    }
                  }
                }}
                accessibilityLabel={`Hapus kategori ${category.label}`}
              >
                <Icon name="trash" size={13} color={colors.textFaint} />
              </Pressable>
            </View>
          ))}
        </View>
        <Button label="Selesai" variant="ghost" onPress={() => setCatSheet(false)} style={{ marginTop: spacing.lg }} />
      </Sheet>

      <Sheet
        visible={savedInfo !== null}
        onClose={() => {
          setSavedInfo(null);
          router.back();
        }}
        title="Transaksi tersimpan"
        subtitle={savedInfo?.isKasbon ? 'Dicatat sebagai piutang pelanggan' : 'Kas dan laporan sudah diperbarui'}
        scroll={false}
      >
        <View style={styles.savedBox}>
          <View style={styles.savedIcon}>
            <Icon name="check" size={22} color={colors.onPrimary} strokeWidth={2.6} />
          </View>
          <Text style={styles.savedAmount}>{formatRupiah(savedInfo?.amount ?? 0)}</Text>
          <Text style={styles.savedHint}>
            {txType === 'sale' ? 'Pemasukan' : 'Pengeluaran'} • {activeCategory?.label ?? 'Tanpa kategori'}
          </Text>
        </View>
        <Button label="Lihat struk" icon="receipt" onPress={() => { setSavedInfo(null); openReceiptPreview(); }} />
        <Button
          label="Catat transaksi lain"
          variant="secondary"
          icon="plus"
          onPress={() => { setSavedInfo(null); resetForm(); }}
          style={{ marginTop: spacing.sm }}
        />
        <Button
          label="Selesai"
          variant="ghost"
          onPress={() => { setSavedInfo(null); router.back(); }}
          style={{ marginTop: spacing.sm }}
        />
      </Sheet>

      <Sheet visible={receiptSheet} onClose={() => setReceiptSheet(false)} title="Pratinjau struk" subtitle="58mm">
        <View style={styles.receiptPaper}>
          <Text style={styles.receiptText}>{receiptText}</Text>
        </View>
        <Text style={styles.receiptHint}>{printerHint()}</Text>
        {printMessage ? <Text style={styles.printMessage}>{printMessage}</Text> : null}
        <Button
          label="Cetak ke printer"
          icon="printer"
          onPress={async () => {
            if (!connectedPrinter()) {
              const id = data.settings.printerAddress;
              if (!id) {
                setPrintMessage('Printer belum dipilih. Buka Pengaturan → Printer struk untuk menyambungkan.');
                return;
              }
              setPrintMessage('Menyambungkan printer…');
              const conn = await connectPrinter(id, data.settings.printerName || undefined);
              if (!conn.ok) {
                setPrintMessage(conn.message);
                return;
              }
            }
            const result = await printReceiptText(receiptText);
            setPrintMessage(result.message);
          }}
          style={{ marginTop: spacing.md }}
        />
        <Button
          label="Bagikan struk"
          icon="share"
          variant="secondary"
          onPress={() => shareMessage(receiptText, 'Struk')}
          style={{ marginTop: spacing.md }}
        />
        <Button label="Tutup" variant="ghost" onPress={() => setReceiptSheet(false)} style={{ marginTop: spacing.sm }} />
      </Sheet>
    </KeyboardAvoidingView>
  );
}

/* ---------------------------------------------------------- Item editor --- */

function ItemEditor({
  items,
  onChange,
  onDone,
  onMatchTotal,
  total,
  saveLabel,
}: {
  items: LineItem[];
  onChange: (items: LineItem[]) => void;
  onDone: () => void;
  onMatchTotal: () => void;
  total: number;
  saveLabel: string;
}) {
  const [name, setName] = useState('');
  const [qty, setQty] = useState('1');
  const [price, setPrice] = useState('');
  const [cost, setCost] = useState('');

  const add = () => {
    const qtyNum = Math.max(1, parseNumber(qty));
    const priceNum = parseNumber(price);
    if (!name.trim() || priceNum <= 0) return;
    onChange([
      ...items,
      {
        name: name.trim(),
        qty: qtyNum,
        price: priceNum,
        cost: cost ? parseNumber(cost) : undefined,
      },
    ]);
    setName('');
    setQty('1');
    setPrice('');
    setCost('');
  };

  const itemsTotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);

  return (
    <View>
      {items.length === 0 ? (
        <Text style={styles.itemEmpty}>Belum ada rincian. Tambahkan di bawah.</Text>
      ) : (
        <View style={{ gap: spacing.sm }}>
          {items.map((item, index) => (
            <View key={`${item.name}-${index}`} style={styles.itemRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.itemMeta}>
                  {item.qty} × {formatRupiah(item.price)}
                  {item.cost !== undefined ? ` • modal ${formatRupiah(item.cost)}` : ''}
                </Text>
              </View>
              <Text style={styles.itemTotal}>{formatRupiah(item.qty * item.price)}</Text>
              <Pressable onPress={() => onChange(items.filter((_, i) => i !== index))} hitSlop={8}>
                <Icon name="trash" size={15} color={colors.danger} strokeWidth={1.9} />
              </Pressable>
            </View>
          ))}
          <View style={styles.itemSumRow}>
            <Text style={styles.itemSumLabel}>Total rincian</Text>
            <Text style={styles.itemSumValue}>{formatRupiah(itemsTotal)}</Text>
          </View>
          {total !== itemsTotal ? (
            <Pressable onPress={onMatchTotal} style={styles.matchButton}>
              <Icon name="refresh" size={13} color={colors.secondary} strokeWidth={2} />
              <Text style={styles.matchButtonText}>Samakan nominal transaksi dengan total rincian</Text>
            </Pressable>
          ) : null}
        </View>
      )}

      <Divider style={{ marginVertical: spacing.md }} />

      <View style={{ gap: spacing.sm }}>
        <TextField label="Nama barang" placeholder="Beras 5kg" value={name} onChangeText={setName} icon="package" />
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <TextField
            label="Qty"
            placeholder="1"
            keyboardType="number-pad"
            value={qty}
            onChangeText={setQty}
            style={{ width: 74 }}
          />
          <TextField
            label="Harga jual"
            prefix="Rp"
            placeholder="0"
            keyboardType="number-pad"
            value={price}
            onChangeText={(text) => setPrice(maskNominal(text))}
            style={{ flex: 1 }}
          />
          <TextField
            label="Modal"
            prefix="Rp"
            placeholder="opsional"
            keyboardType="number-pad"
            value={cost}
            onChangeText={(text) => setCost(maskNominal(text))}
            style={{ flex: 1 }}
          />
        </View>
        <Button label="Tambah item" icon="plus" variant="secondary" onPress={add} />
      </View>

      <Button label={saveLabel} onPress={onDone} style={{ marginTop: spacing.lg }} />
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
  closeButton: {
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
  timeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: radius.sm,
    backgroundColor: colors.secondarySoft,
    borderWidth: 1,
    borderColor: colors.secondaryBorder,
  },
  timeChipText: { fontFamily: fonts.numSemibold, fontSize: 11, color: colors.secondary },

  content: { padding: spacing.base, gap: spacing.lg, paddingBottom: 24 },

  typeSwitch: { flexDirection: 'row', gap: spacing.sm },
  typeOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  typeOptionActiveSale: { backgroundColor: colors.primary, borderColor: colors.primary },
  typeOptionActiveExpense: { backgroundColor: colors.tertiarySoft, borderColor: colors.tertiaryBorder },
  typeLabel: { ...type.caption, fontFamily: fonts.bold, color: colors.text },
  typeHint: { ...type.micro, fontFamily: fonts.medium, color: colors.textFaint },

  amountCard: { overflow: 'hidden', borderColor: colors.border },
  amountInner: { padding: spacing.base },
  amountLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  resetLink: { fontFamily: fonts.semibold, fontSize: 10.5, color: colors.danger },
  amountLabel: { ...type.micro, color: colors.textMuted, letterSpacing: 0.6, textTransform: 'uppercase' },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  amountPrefix: { fontFamily: fonts.numSemibold, fontSize: 18, color: colors.textMuted },
  amountValue: { fontFamily: fonts.numBold, fontSize: 36, letterSpacing: -1.2, flexShrink: 1 },
  quickRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, flexWrap: 'wrap' },
  quickChip: {
    flex: 1,
    height: 30,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickChipText: { fontFamily: fonts.numSemibold, fontSize: 11, color: colors.textMuted },

  sectionHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  linkText: { fontFamily: fonts.semibold, fontSize: 11, color: colors.secondary },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  categoryItem: {
    width: '31.5%',
    minHeight: 46, // label 1 atau 2 baris tetap sejajar rapi
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  categoryLabel: { fontFamily: fonts.semibold, fontSize: 10.5, color: colors.textMuted, flexShrink: 1, lineHeight: 13 },

  methodRow: { flexDirection: 'row', gap: spacing.sm },
  methodItem: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  methodLabel: { fontFamily: fonts.semibold, fontSize: 10, color: colors.textMuted },
  methodHint: { ...type.micro, fontFamily: fonts.medium, color: colors.textFaint, letterSpacing: 0 },

  inlineHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  inlineTitle: { ...type.bodyMedium, fontFamily: fonts.bold, color: colors.white },
  inlineDesc: { ...type.caption, color: colors.textDim, marginTop: 2 },

  dueRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  dueChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.sm,
    backgroundColor: colors.cardHigh,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dueChipText: { fontFamily: fonts.semibold, fontSize: 11, color: colors.textMuted },
  customerHint: {
    ...type.caption,
    color: colors.textDim,
    lineHeight: 16,
  },
  dueLabel: { ...type.caption, color: colors.textDim, marginLeft: 'auto' },

  photoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  photoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  photoButtonText: { fontFamily: fonts.semibold, fontSize: 11.5, color: colors.textMuted },
  photoPreviewWrap: { marginLeft: 'auto' },
  photoPreview: { width: 44, height: 44, borderRadius: radius.sm },
  photoRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },

  itemsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
  },

  printerBlock: { padding: spacing.md, gap: spacing.sm },
  printerHint: { ...type.caption, color: colors.textDim, lineHeight: 16 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  switchLabel: { ...type.caption, fontFamily: fonts.semibold, color: colors.text },
  switchHint: { ...type.micro, fontFamily: fonts.medium, color: colors.textFaint },
  previewLink: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  previewLinkText: { fontFamily: fonts.semibold, fontSize: 11.5, color: colors.secondary },

  footerSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 40,
    marginTop: spacing.xs,
  },
  footerSecondaryText: { fontFamily: fonts.semibold, fontSize: 11.5, color: colors.secondary },
  footer: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bgDeep,
  },

  sheetChips: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', marginTop: spacing.md },
  timeStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginTop: spacing.lg,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stepperButton: {
    width: 40,
    height: 36,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cardHigh,
  },
  stepperValue: { fontFamily: fonts.numBold, fontSize: 16, color: colors.white },

  catList: { marginTop: spacing.md, gap: 2 },
  catListRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: radius.sm,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  catListLabel: { ...type.caption, fontFamily: fonts.semibold, color: colors.text, flex: 1 },
  categoryChipStatic: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  categoryChipText: { fontFamily: fonts.medium, fontSize: 10.5, color: colors.textMuted },

  receiptPaper: {
    backgroundColor: '#f7f5ef',
    borderRadius: radius.sm,
    padding: spacing.md,
  },
  receiptText: { fontFamily: fonts.mono, fontSize: 10, lineHeight: 14.5, color: '#26221a' },
  printMessage: { ...type.caption, color: colors.textMuted, marginTop: spacing.sm, lineHeight: 16 },
  receiptHint: { ...type.micro, fontFamily: fonts.medium, color: colors.textFaint, marginTop: spacing.sm, lineHeight: 15 },

  errorText: { ...type.caption, color: colors.danger, textAlign: 'center', marginTop: spacing.sm },
  savedBox: { alignItems: 'center', gap: 4, paddingVertical: spacing.base },
  savedIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    marginBottom: spacing.sm,
  },
  savedAmount: { fontFamily: fonts.numBold, fontSize: 28, color: colors.white, letterSpacing: -1 },
  savedHint: { ...type.caption, color: colors.textDim },

  itemEmpty: { ...type.caption, color: colors.textDim, textAlign: 'center', paddingVertical: spacing.base },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  itemName: { ...type.caption, fontFamily: fonts.semibold, color: colors.white },
  itemMeta: { ...type.micro, fontFamily: fonts.medium, color: colors.textFaint, marginTop: 1 },
  itemTotal: { fontFamily: fonts.numSemibold, fontSize: 12, color: colors.primary },
  itemSumRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 2 },
  itemSumLabel: { ...type.caption, color: colors.textMuted },
  itemSumValue: { fontFamily: fonts.numBold, fontSize: 13, color: colors.white },
  matchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
  },
  matchButtonText: { fontFamily: fonts.semibold, fontSize: 11, color: colors.secondary, flexShrink: 1 },
});
