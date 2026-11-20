/**
 * Daftar akun baru (mode cloud), dengan kode undangan opsional.
 *
 * Kode undangan didapat dari pemilik toko (layar Anggota). Kalau kode diisi,
 * setelah mendaftar pengguna langsung menjadi anggota outlet tersebut.
 * Kalau kosong, pengguna masuk sebagai pemilik toko baru (buat toko di layar Akun).
 */
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TextField } from '../src/components/Field';
import { Icon } from '../src/components/Icon';
import { Button, Card, SectionTitle } from '../src/components/Primitives';
import { useAuthStore } from '../src/data/auth';
import { isCloudEnabled, supabase } from '../src/services/supabase/client';
import { colors, fonts, spacing, type, radius } from '../src/theme/tokens';

export default function DaftarScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const bootstrap = useAuthStore((s) => s.bootstrap);
  const refreshMembership = useAuthStore((s) => s.refreshMembership);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!supabase) return;
    if (!email.trim() || password.length < 6) {
      setError('Email wajib diisi dan kata sandi minimal 6 karakter.');
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });

    if (signUpError) {
      setBusy(false);
      setError(signUpError.message);
      return;
    }

    // Bila proyek Supabase mewajibkan konfirmasi email, sesi belum terbentuk.
    if (!data.session) {
      setBusy(false);
      setInfo('Akun dibuat. Cek email untuk konfirmasi, lalu masuk dan masukkan kode undangan Anda.');
      return;
    }

    await bootstrap();

    if (code.trim()) {
      const { error: redeemError } = await supabase.rpc('redeem_invite', {
        p_code: code.trim().toUpperCase(),
      });
      if (redeemError) {
        setBusy(false);
        setError(`Akun dibuat, tetapi kode undangan gagal dipakai: ${redeemError.message}`);
        return;
      }
      await refreshMembership();
    }

    setBusy(false);
    router.replace(code.trim() ? '/(tabs)' : '/akun');
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.md }]}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable
          onPress={() => router.back()}
          style={styles.backButton}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Kembali"
        >
          <Icon name="chevronLeft" size={17} color={colors.textMuted} strokeWidth={2} />
        </Pressable>

        <View style={styles.brand}>
          <View style={styles.logo}>
            <Icon name="userPlus" size={24} color={colors.primary} />
          </View>
          <Text style={styles.title}>Daftar akun</Text>
          <Text style={styles.subtitle}>
            Punya kode undangan dari pemilik toko? Masukkan di bawah. Tanpa kode, Anda akan menjadi
            pemilik toko baru.
          </Text>
        </View>

        {!isCloudEnabled ? (
          <Card>
            <Text style={styles.body}>
              Pendaftaran belum bisa dipakai di perangkat ini. Hubungi pemilik toko untuk memakai
              akun yang sama, atau lanjutkan memakai aplikasi tanpa akun — semua fitur kasir tetap
              berjalan.
            </Text>
          </Card>
        ) : (
          <>
            <SectionTitle title="Data akun" icon="user" />
            <Card style={{ gap: spacing.md }}>
              <TextField
                label="Email"
                placeholder="nama@toko.id"
                icon="user"
                autoCapitalize="none"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
              />
              <TextField
                label="Kata sandi"
                placeholder="Minimal 6 karakter"
                secureTextEntry
                value={password}
                onChangeText={setPassword}
              />
              <TextField
                label="Kode undangan (opsional)"
                placeholder="Contoh: 8A3F1C2D"
                icon="userPlus"
                autoCapitalize="characters"
                value={code}
                onChangeText={setCode}
                hint="Kode sekali pakai, berlaku 72 jam. Minta ke pemilik toko."
              />
              {error ? <Text style={styles.error}>{error}</Text> : null}
              {info ? <Text style={styles.info}>{info}</Text> : null}
              <Button
                label={busy ? 'Memproses…' : 'Daftar'}
                icon="check"
                onPress={() => void submit()}
                disabled={busy || !isCloudEnabled}
              />
            </Card>

            <Button
              label="Sudah punya akun? Masuk"
              variant="ghost"
              onPress={() => router.replace('/masuk')}
            />
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  brand: { alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md, marginTop: spacing.md },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  logo: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: { ...type.h1, fontFamily: fonts.extrabold, color: colors.text },
  subtitle: {
    ...type.body,
    color: colors.textDim,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: spacing.md,
  },
  body: { ...type.body, color: colors.textDim, lineHeight: 20 },
  error: { ...type.caption, fontFamily: fonts.medium, color: colors.danger },
  info: { ...type.caption, fontFamily: fonts.medium, color: colors.secondary },
});
