/**
 * Pengingat jatuh tempo (notifikasi lokal).
 *
 * Semua pengingat dijadwalkan di perangkat, jadi tetap berbunyi walau aplikasi
 * tertutup dan tanpa internet. Layar ini menjelaskan apa yang akan diingatkan,
 * kapan, dan memberi tombol untuk mencoba satu notifikasi.
 */
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '../src/components/Icon';
import { Button, Card, Chip, Divider, SectionTitle } from '../src/components/Primitives';
import { useAppStore } from '../src/data/store';
import {
  cancelAll,
  ensurePermission,
  remindersSupported,
  rescheduleAll,
  scheduledCount,
  sendTest,
  type PermissionState,
} from '../src/services/notifications/local';
import { buildReminders, summarize } from '../src/services/notifications/schedule';
import { colors, fonts, radius, spacing, type } from '../src/theme/tokens';
import { BULAN_SINGKAT } from '../src/utils/format';

/** "20 Nov, 20.00" — ringkas supaya tidak memakan dua baris di kartu. */
const waktuRingkas = (iso: string): string => {
  const date = new Date(iso);
  const jam = `${String(date.getHours()).padStart(2, '0')}.${String(date.getMinutes()).padStart(2, '0')}`;
  return `${date.getDate()} ${BULAN_SINGKAT[date.getMonth()]}, ${jam}`;
};

const HOURS = [6, 7, 8, 9, 10, 12, 15, 17, 19, 20];

export default function PengingatScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const receivables = useAppStore((s) => s.receivables);
  const orders = useAppStore((s) => s.orders);

  const [permission, setPermission] = useState<PermissionState>('unsupported');
  const [scheduled, setScheduled] = useState(0);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const plans = useMemo(
    () => buildReminders({ receivables, orders, hour: settings.notifHour }),
    [receivables, orders, settings.notifHour],
  );

  const refreshCount = useCallback(async () => {
    setScheduled(await scheduledCount());
  }, []);

  useEffect(() => {
    void (async () => {
      if (!remindersSupported) {
        setPermission('unsupported');
        return;
      }
      setPermission(await ensurePermission());
      await refreshCount();
    })();
  }, [refreshCount]);

  const applyReminders = useCallback(
    async (next: { enabled: boolean; hour: number }) => {
      if (!next.enabled) {
        await cancelAll();
        setScheduled(0);
        setStatus({ tone: 'ok', text: 'Pengingat dimatikan. Tidak ada notifikasi terjadwal.' });
        return;
      }
      const state = await ensurePermission();
      setPermission(state);
      if (state === 'unsupported') {
        setStatus({ tone: 'error', text: 'Perangkat ini tidak mendukung notifikasi lokal.' });
        return;
      }
      if (state === 'denied') {
        setStatus({
          tone: 'error',
          text: 'Izin notifikasi ditolak. Buka Pengaturan HP → Notifikasi → Inventori’s untuk mengizinkan.',
        });
        return;
      }
      const list = buildReminders({ receivables, orders, hour: next.hour });
      const count = await rescheduleAll(list);
      setScheduled(count);
      setStatus({
        tone: 'ok',
        text: count === 0
          ? 'Tidak ada kasbon/pesanan yang perlu diingatkan saat ini.'
          : `${count} pengingat dijadwalkan.`,
      });
    },
    [orders, receivables],
  );

  const toggle = async (enabled: boolean) => {
    const result = updateSettings({ notifEnabled: enabled });
    if (!result.ok) return;
    setBusy(true);
    await applyReminders({ enabled, hour: settings.notifHour });
    setBusy(false);
  };

  const changeHour = async (hour: number) => {
    const result = updateSettings({ notifHour: hour });
    if (!result.ok) return;
    if (!settings.notifEnabled) return;
    setBusy(true);
    await applyReminders({ enabled: true, hour });
    setBusy(false);
  };

  const test = async () => {
    setBusy(true);
    const sent = await sendTest();
    setBusy(false);
    setStatus({
      tone: sent ? 'ok' : 'error',
      text: sent
        ? 'Notifikasi uji dikirim. Tampil 3 detik lagi — cek laci notifikasi.'
        : 'Gagal mengirim notifikasi uji. Periksa izin notifikasi perangkat.',
    });
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => router.back()} style={styles.iconButton} hitSlop={8}>
          <Icon name="chevronLeft" size={17} color={colors.textMuted} strokeWidth={2} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Pengingat jatuh tempo</Text>
          <Text style={styles.headerSubtitle}>Diingatkan otomatis, tanpa internet</Text>
        </View>
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
            <Text style={[styles.bannerText, { color: status.tone === 'ok' ? colors.primary : colors.danger }]}>
              {status.text}
            </Text>
          </View>
        ) : null}

        <Card style={{ gap: spacing.md }}>
          <View style={{ gap: 4 }}>
            <Text style={styles.cardTitle}>Tagih sekarang lewat WhatsApp</Text>
            <Text style={styles.hint}>
              Pengingat di bawah berbunyi di HP ini. Kalau mau langsung menagih pelanggan, buka
              daftar tagih — pesannya sudah terisi.
            </Text>
            <Button
              label="Buka daftar tagih kasbon"
              icon="whatsapp"
              variant="ghost"
              onPress={() => router.push('/tagih-kasbon')}
              fullWidth
            />
          </View>
          <Divider />
          <View style={styles.rowBetween}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.cardTitle}>Pengingat aktif</Text>
              <Text style={styles.hint}>
                Diingatkan H-1 dan pada hari jatuh tempo kasbon maupun pesanan.
              </Text>
            </View>
            <Switch
              value={settings.notifEnabled}
              onValueChange={(value) => void toggle(value)}
              disabled={busy || !remindersSupported}
              trackColor={{ false: colors.cardHigh, true: colors.primarySoft }}
              thumbColor={settings.notifEnabled ? colors.primary : colors.textFaint}
            />
          </View>

          {!remindersSupported ? (
            <Text style={styles.warn}>
              Perangkat ini belum bisa menjadwalkan pengingat otomatis.
            </Text>
          ) : permission === 'denied' ? (
            <Text style={styles.warn}>
              Izin notifikasi belum diberikan. Buka Pengaturan HP → Notifikasi → Inventori’s.
            </Text>
          ) : null}

          <Divider />
          <Text style={styles.label}>JAM PENGINGAT</Text>
          <View style={styles.chipRow}>
            {HOURS.map((hour) => (
              <Pressable key={hour} onPress={() => void changeHour(hour)} disabled={busy}>
                <Chip
                  label={`${String(hour).padStart(2, '0')}.00`}
                  tone={settings.notifHour === hour ? 'primary' : 'neutral'}
                  size="sm"
                />
              </Pressable>
            ))}
          </View>
        </Card>

        <Card style={{ gap: spacing.sm }}>
          <Text style={styles.cardTitle}>Yang akan diingatkan</Text>
          <Text style={styles.hint}>{summarize(plans)}</Text>
          <Text style={styles.hint}>
            {remindersSupported
              ? `${scheduled} notifikasi tersimpan di perangkat.`
              : 'Perangkat ini belum bisa menjadwalkan pengingat otomatis.'}
          </Text>
          {plans.slice(0, 6).map((plan) => (
            <View key={plan.key} style={styles.planRow}>
              <Icon
                name={plan.kind === 'kasbon' ? 'book' : 'fileText'}
                size={15}
                color={plan.kind === 'kasbon' ? colors.amber : colors.secondary}
                strokeWidth={1.9}
              />
              <View style={{ flex: 1, gap: 1 }}>
                <Text style={styles.planTitle} numberOfLines={1}>
                  {plan.title}
                </Text>
                <Text style={styles.hint} numberOfLines={2}>
                  {plan.body}
                </Text>
              </View>
              <Text style={styles.planAt}>{waktuRingkas(plan.at)}</Text>
            </View>
          ))}
          {plans.length === 0 ? (
            <Text style={styles.hint}>
              Belum ada kasbon atau pesanan bertanggal. Pengingat akan dibuat otomatis begitu ada.
            </Text>
          ) : null}
        </Card>

        <View style={{ gap: spacing.sm }}>
          <Button
            label={busy ? 'Menyiapkan…' : 'Jadwalkan ulang sekarang'}
            icon="refresh"
            onPress={() => void applyReminders({ enabled: true, hour: settings.notifHour })}
            disabled={busy || !remindersSupported}
          />
          <Button
            label="Kirim notifikasi uji"
            variant="secondary"
            icon="bell"
            onPress={() => void test()}
            disabled={busy || !remindersSupported}
          />
        </View>

        <View>
          <SectionTitle title="Kalau pengingat tidak muncul" icon="info" />
          <Card style={{ gap: spacing.sm }}>
            <Text style={styles.hint}>
              1. Pastikan izin notifikasi diberikan untuk aplikasi Inventori’s.
            </Text>
            <Text style={styles.hint}>
              2. Matikan pembatas baterai untuk aplikasi ini (Pengaturan HP → Baterai → Tanpa
              batas) supaya jadwal tidak ditunda sistem.
            </Text>
            <Text style={styles.hint}>
              3. Pengingat hanya dibuat untuk kasbon/pesanan yang punya tanggal jatuh tempo.
            </Text>
            <Text style={styles.hint}>
              Aplikasi menjadwalkan ulang setiap kali data berubah, jadi tanggal yang digeser tidak
              meninggalkan pengingat lama.
            </Text>
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
  rowBetween: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardTitle: { ...type.h2, fontFamily: fonts.bold, color: colors.text },
  label: { ...type.micro, fontFamily: fonts.semibold, color: colors.textFaint, letterSpacing: 0.4 },
  hint: { ...type.caption, color: colors.textFaint, lineHeight: 17 },
  warn: { ...type.caption, color: colors.amber, lineHeight: 17 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  planRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  planTitle: { ...type.body, fontFamily: fonts.semibold, color: colors.text },
  planAt: { ...type.micro, fontFamily: fonts.semibold, color: colors.textDim, maxWidth: 104, textAlign: 'right' },
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
});
