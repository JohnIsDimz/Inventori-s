/**
 * Tombol mikrofon untuk input suara Bahasa Indonesia.
 *
 * Dipakai di layar Catat (nominal + catatan) dan Kasir (cari barang).
 * Saat mendengarkan, tombol berdenyut dan menampilkan teks sementara hasil
 * pengenalan; bila layanan suara perangkat tidak tersedia, pesan galat
 * ditampilkan lewat `onError` atau teks kecil di bawah tombol.
 */
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from './Icon';
import { colors, fonts, radius, spacing, type } from '../theme/tokens';
import { useVoiceInput } from '../services/voice';

export function VoiceButton({
  onResult,
  onPartial,
  label = 'Ucapkan',
  compact,
  onError,
}: {
  onResult: (transcript: string) => void;
  onPartial?: (transcript: string) => void;
  label?: string;
  compact?: boolean;
  onError?: (message: string) => void;
}) {
  const voice = useVoiceInput({
    onResult,
    onPartial,
    lang: 'id-ID',
  });

  React.useEffect(() => {
    if (voice.error) onError?.(voice.error);
  }, [voice.error, onError]);

  const listening = voice.isListening;

  return (
    <View style={compact ? undefined : styles.wrap}>
      <Pressable
        onPress={() => (listening ? voice.stop() : voice.start())}
        style={[styles.button, compact && styles.buttonCompact, listening && styles.buttonActive]}
        accessibilityRole="button"
        accessibilityLabel={listening ? 'Hentikan input suara' : 'Mulai input suara Bahasa Indonesia'}
        hitSlop={6}
      >
        {voice.state === 'processing' ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <Icon name="mic" size={compact ? 15 : 16} color={listening ? colors.onPrimary : colors.primary} strokeWidth={1.9} />
        )}
        {!compact ? (
          <Text style={[styles.label, listening && { color: colors.onPrimary }]}>
            {listening ? 'Mendengarkan…' : label}
          </Text>
        ) : null}
      </Pressable>

      {!compact && voice.transcript ? (
        <Text style={styles.partial} numberOfLines={2}>
          “{voice.transcript}”
        </Text>
      ) : null}
      {!compact && voice.error ? <Text style={styles.error}>{voice.error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 40,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  buttonCompact: { height: 34, width: 34, paddingHorizontal: 0, borderRadius: radius.sm },
  buttonActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  label: { fontFamily: fonts.bold, fontSize: 11.5, color: colors.primary },
  partial: { ...type.caption, color: colors.textMuted, fontStyle: 'italic' },
  error: { ...type.micro, color: colors.danger },
});
