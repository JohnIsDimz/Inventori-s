/**
 * Layar masuk (mode cloud).
 *
 * Hanya dipakai bila aplikasi dikonfigurasi dengan Supabase. Tanpa konfigurasi,
 * aplikasi langsung memakai mode lokal dan layar ini tidak pernah muncul.
 */
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TextField } from '../src/components/Field';
import { Icon } from '../src/components/Icon';
import { Button, Card, SectionTitle } from '../src/components/Primitives';
import { useAuthStore } from '../src/data/auth';
import { colors, fonts, spacing, type, radius } from '../src/theme/tokens';

export default function MasukScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const signIn = useAuthStore((s) => s.signIn);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!email.trim() || !password) {
      setError('Email dan kata sandi wajib diisi.');
      return;
    }
    setBusy(true);
    setError(null);
    const message = await signIn(email, password);
    setBusy(false);
    if (message) {
      setError(message);
      return;
    }
    router.replace('/(tabs)');
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
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
            <Icon name="store" size={26} color={colors.primary} />
          </View>
          <Text style={styles.title}>Inventori&apos;s</Text>
          <Text style={styles.subtitle}>
            Masuk untuk menyinkronkan stok dan penjualan ke seluruh perangkat toko.
          </Text>
        </View>

        <SectionTitle title="Akun" icon="user" />
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
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button
            label={busy ? 'Memeriksa…' : 'Masuk'}
            icon="check"
            onPress={() => void submit()}
            disabled={busy}
          />
        </Card>

        <Button
          label="Belum punya akun? Daftar dengan kode undangan"
          variant="ghost"
          onPress={() => router.push('/daftar')}
        />

        <Text style={styles.hint}>
          Data yang sudah tercatat di HP ini tetap aman dan ikut tersalin setelah masuk. Akun dibuat
          oleh pemilik toko — minta kode undangan bila belum punya.
        </Text>
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
  error: { ...type.caption, fontFamily: fonts.medium, color: colors.danger },
  hint: {
    ...type.caption,
    color: colors.textFaint,
    lineHeight: 18,
  },
});
