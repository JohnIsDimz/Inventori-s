/**
 * Panel printer struk: pindai → sambung → uji cetak.
 *
 * Printer yang dipilih disimpan di `settings.printerAddress` + `printerName`
 * sehingga kasir bisa menyambung ulang otomatis saat mencetak struk.
 */
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from './Icon';
import { Button, Chip, Divider, SectionLabel, Sheet } from './Primitives';
import { useAppStore } from '../data/store';
import {
  connectPrinter,
  connectedPrinter,
  disconnectPrinter,
  isPrinterSupported,
  onPrinterChange,
  printTestPage,
  printerSupportHint,
  scanPrinters,
  type PrinterDevice,
} from '../services/printer';
import { colors, fonts, radius, spacing, type } from '../theme/tokens';

export function PrinterSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const data = useAppStore();
  const updateSettings = useAppStore((s) => s.updateSettings);

  const [scanning, setScanning] = useState(false);
  const [devices, setDevices] = useState<PrinterDevice[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [active, setActive] = useState<PrinterDevice | null>(connectedPrinter());

  useEffect(() => onPrinterChange(setActive), []);

  const scan = async (all = showAll) => {
    setScanning(true);
    setMessage(null);
    const result = await scanPrinters(9000, all);
    setScanning(false);
    setDevices(result.devices);
    if (!result.ok) {
      setMessage(result.message ?? 'Pemindaian gagal.');
      return;
    }
    if (result.devices.length === 0) {
      setMessage(
        all
          ? 'Tidak ada perangkat Bluetooth ditemukan. Pastikan printer menyala dan sudah dipasangkan.'
          : 'Belum ada printer terdeteksi. Coba "Tampilkan semua perangkat" bila nama printer tidak standar.',
      );
    }
  };

  const connect = async (device: PrinterDevice) => {
    setBusyId(device.id);
    setMessage(null);
    const result = await connectPrinter(device.id, device.name);
    setBusyId(null);
    setMessage(result.message);
    if (result.ok) {
      void updateSettings({ printerAddress: device.id, printerName: device.name });
    }
  };

  const test = async () => {
    setMessage('Mengirim halaman uji…');
    const result = await printTestPage(data.profile.name);
    setMessage(result.message);
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Printer struk" subtitle={printerSupportHint()}>
      <View style={styles.statusRow}>
        <Icon name={active ? 'checkCircle' : 'printer'} size={15} color={active ? colors.primary : colors.textMuted} strokeWidth={1.9} />
        <Text style={styles.statusText}>
          {active ? `Tersambung: ${active.name}` : data.settings.printerName ? `Terakhir dipakai: ${data.settings.printerName}` : 'Belum ada printer tersambung'}
        </Text>
        {active ? <Chip label="siap" tone="primary" size="sm" /> : null}
      </View>

      {isPrinterSupported() ? (
        <>
          <Button
            label={scanning ? 'Memindai…' : 'Pindai printer'}
            icon={scanning ? undefined : 'scan'}
            variant="secondary"
            onPress={() => scan()}
            disabled={scanning}
            style={{ marginTop: spacing.md }}
          />
          {scanning ? (
            <View style={styles.scanningRow}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.scanningText}>Mencari printer thermal di sekitar…</Text>
            </View>
          ) : null}

          {devices.length > 0 ? (
            <View style={{ marginTop: spacing.md }}>
              <SectionLabel>Perangkat ditemukan</SectionLabel>
              {devices.map((device) => (
                <Pressable
                  key={device.id}
                  onPress={() => connect(device)}
                  style={styles.deviceRow}
                  disabled={busyId !== null}
                >
                  <Icon name="bluetooth" size={14} color={colors.secondary} strokeWidth={1.9} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.deviceName} numberOfLines={1}>
                      {device.name}
                    </Text>
                    <Text style={styles.deviceMeta} numberOfLines={1}>
                      {device.id}
                      {device.rssi !== null ? ` • sinyal ${device.rssi} dBm` : ''}
                    </Text>
                  </View>
                  {busyId === device.id ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Text style={styles.connectText}>Sambung</Text>
                  )}
                </Pressable>
              ))}
            </View>
          ) : null}

          {devices.length === 0 && !scanning ? (
            <Pressable
              onPress={() => {
                setShowAll(true);
                scan(true);
              }}
              style={styles.linkRow}
              hitSlop={6}
            >
              <Icon name="search" size={13} color={colors.secondary} strokeWidth={1.9} />
              <Text style={styles.linkText}>Tampilkan semua perangkat Bluetooth</Text>
            </Pressable>
          ) : null}

          <Divider style={{ marginVertical: spacing.md }} />
          <View style={styles.actionRow}>
            <Button label="Uji cetak" icon="printer" variant="outline" onPress={test} style={{ flex: 1 }} />
            <Button
              label="Putuskan"
              icon="close"
              variant="ghost"
              onPress={async () => {
                await disconnectPrinter();
                void updateSettings({ printerAddress: '' });
                setMessage('Printer diputuskan.');
              }}
              style={{ flex: 1 }}
            />
          </View>
        </>
      ) : null}

      {message ? <Text style={styles.message}>{message}</Text> : null}

      <Text style={styles.note}>
        Printer yang didukung: thermal 58 mm berbasis Bluetooth LE (RPP02N, GoojPRT, XP-58, MTP-II, dan sejenisnya).
        Jika kertas tidak keluar, coba putuskan lalu sambungkan ulang, dan pastikan printer tidak sedang tersambung ke
        aplikasi lain.
      </Text>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  statusText: { ...type.caption, fontFamily: fonts.semibold, color: colors.text, flex: 1 },
  scanningRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  scanningText: { ...type.micro, color: colors.textDim },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: radius.sm,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 6,
  },
  deviceName: { ...type.caption, fontFamily: fonts.bold, color: colors.white },
  deviceMeta: { ...type.micro, fontFamily: fonts.medium, color: colors.textFaint, marginTop: 1 },
  connectText: { fontFamily: fonts.bold, fontSize: 10.5, color: colors.primary },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: spacing.sm },
  linkText: { fontFamily: fonts.semibold, fontSize: 11, color: colors.secondary },
  actionRow: { flexDirection: 'row', gap: spacing.sm },
  message: { ...type.caption, color: colors.textMuted, marginTop: spacing.sm, lineHeight: 16 },
  note: { ...type.micro, fontFamily: fonts.medium, color: colors.textFaint, lineHeight: 15, marginTop: spacing.md },
});
