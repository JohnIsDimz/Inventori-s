/**
 * Pemindai barcode barang.
 *
 * - Kamera belakang memakai `expo-camera` (CameraView) dengan deteksi
 *   EAN-8/13, UPC-A/E, Code 39/128, ITF, dan QR.
 * - Selalu ada kolom input manual: berguna untuk kode yang sulit dibaca,
 *   untuk web (browser belum tentu punya BarcodeDetector), atau saat kamera
 *   tidak diizinkan.
 * - Hasil dikirim sekali lalu modal ditutup (`onScanned`).
 */
import { CameraView, useCameraPermissions } from 'expo-camera';
import React, { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TextField } from './Field';
import { Icon } from './Icon';
import { Button } from './Primitives';
import { colors, fonts, radius, spacing, type } from '../theme/tokens';

const BARCODE_TYPES = [
  'ean13',
  'ean8',
  'upc_a',
  'upc_e',
  'code128',
  'code39',
  'code93',
  'itf14',
  'codabar',
  'qr',
] as const;

export function BarcodeScanner({
  visible,
  onClose,
  onScanned,
  title = 'Pindai barcode',
}: {
  visible: boolean;
  onClose: () => void;
  onScanned: (code: string) => void;
  title?: string;
}) {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [manual, setManual] = useState('');
  const [hint, setHint] = useState<string | null>(null);
  const handled = useRef(false);

  useEffect(() => {
    if (!visible) {
      handled.current = false;
      setManual('');
      setHint(null);
      return;
    }
    if (permission && !permission.granted && permission.canAskAgain) {
      requestPermission().catch(() => setHint('Izin kamera tidak bisa diminta.'));
    }
  }, [visible, permission, requestPermission]);

  const submit = (code: string) => {
    const value = code.trim();
    if (!value) return;
    if (handled.current) return;
    handled.current = true;
    onScanned(value);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <Pressable onPress={onClose} hitSlop={10} style={styles.close} accessibilityLabel="Tutup pemindai">
            <Icon name="close" size={17} color={colors.textMuted} strokeWidth={2} />
          </Pressable>
        </View>

        <View style={styles.cameraBox}>
          {permission?.granted ? (
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: [...BARCODE_TYPES] }}
              onBarcodeScanned={({ data }) => submit(data)}
            />
          ) : (
            <View style={styles.cameraFallback}>
              <Icon name="scan" size={30} color={colors.textDim} strokeWidth={1.7} />
              <Text style={styles.fallbackTitle}>Kamera belum aktif</Text>
              <Text style={styles.fallbackText}>
                {permission && !permission.canAskAgain
                  ? 'Izin kamera diblokir. Aktifkan lewat pengaturan sistem, atau ketik kode barang di bawah.'
                  : 'Izinkan kamera untuk memindai barcode, atau ketik kode barang di bawah.'}
              </Text>
              {permission && permission.canAskAgain ? (
                <Button
                  label="Izinkan kamera"
                  icon="camera"
                  variant="secondary"
                  size="sm"
                  onPress={() => requestPermission().catch(() => setHint('Gagal meminta izin.'))}
                />
              ) : null}
            </View>
          )}

          {permission?.granted ? (
            <View pointerEvents="none" style={styles.reticle}>
              <View style={styles.reticleBox} />
              <Text style={styles.reticleText}>Arahkan kamera ke barcode barang</Text>
            </View>
          ) : null}
        </View>

        <View style={{ padding: spacing.base, gap: spacing.sm }}>
          <TextField
            label="Atau ketik kode barang"
            icon="scan"
            placeholder="Contoh: 8998866200011"
            value={manual}
            onChangeText={setManual}
            keyboardType="default"
            autoCapitalize="none"
            autoCorrect={false}
            onSubmitEditing={() => submit(manual)}
            returnKeyType="done"
          />
          {hint ? <Text style={styles.hint}>{hint}</Text> : null}
          <Button label="Pakai kode ini" icon="check" onPress={() => submit(manual)} disabled={!manual.trim()} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.sm,
  },
  title: { ...type.h2, fontSize: 15, color: colors.white },
  close: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cameraBox: {
    flex: 1,
    margin: spacing.base,
    borderRadius: radius.xl,
    overflow: 'hidden',
    backgroundColor: '#000',
    borderWidth: 1,
    borderColor: colors.border,
  },
  cameraFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.sm,
  },
  fallbackTitle: { ...type.bodyMedium, fontFamily: fonts.bold, color: colors.white },
  fallbackText: { ...type.caption, color: colors.textDim, textAlign: 'center', lineHeight: 17 },
  reticle: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', gap: 10 },
  reticleBox: {
    width: '72%',
    height: 120,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: 'rgba(0,245,160,0.06)',
  },
  reticleText: { ...type.caption, fontFamily: fonts.semibold, color: colors.white },
  hint: { ...type.caption, color: colors.danger },
});
