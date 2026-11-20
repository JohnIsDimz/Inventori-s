/**
 * Kelola anggota toko (undang kasir/admin, ubah peran, nonaktifkan).
 *
 * Undangan memakai KODE 8 karakter sekali pakai — bukan membuat akun dari
 * aplikasi, karena itu butuh service_role key yang tidak boleh ada di klien.
 * Alur: pemilik membuat kode → kirim ke karyawan → karyawan mendaftar di layar
 * "Daftar" lalu menukar kode → langsung jadi anggota outlet dengan peran tsb.
 */
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '../src/components/Icon';
import { Button, Card, Chip, Divider, SectionTitle, Segmented } from '../src/components/Primitives';
import { useAuthStore } from '../src/data/auth';
import { isCloudEnabled, supabase } from '../src/services/supabase/client';
import { colors, fonts, radius, spacing, type } from '../src/theme/tokens';
import { can, permissionList, ROLE_LABEL, ROLE_SUMMARY, type Role } from '../src/utils/permissions';

interface MemberRow {
  member_id: string;
  user_id: string;
  email: string;
  role: 'owner' | 'admin' | 'kasir';
  active: boolean;
  created_at: string;
}

export default function AnggotaScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { outletId, role, userId } = useAuthStore();
  const isOwner = can(role, 'member.manage');

  const [members, setMembers] = useState<MemberRow[]>([]);
  const [inviteRole, setInviteRole] = useState<'kasir' | 'admin'>('kasir');
  const [matrixRole, setMatrixRole] = useState<Role>('kasir');
  const [showMatrix, setShowMatrix] = useState(false);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isCloudEnabled || !supabase || !outletId) return;
    const { data, error: rpcError } = await supabase.rpc('outlet_members', { p_outlet: outletId });
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setMembers((data ?? []) as MemberRow[]);
    setError(null);
  }, [outletId]);

  useEffect(() => {
    void load();
  }, [load]);

  const createInvite = async () => {
    if (!supabase || !outletId) return;
    setBusy(true);
    const { data, error: rpcError } = await supabase.rpc('create_invite', {
      p_outlet: outletId,
      p_role: inviteRole,
      p_hours: 72,
    });
    setBusy(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setInviteCode(String(data));
    setError(null);
  };

  const shareCode = () => {
    if (!inviteCode) return;
    void Share.share({
      message: `Kode undangan Inventori's: ${inviteCode}\n\nBuka aplikasi → Daftar → masukkan kode ini. Berlaku 72 jam, sekali pakai.`,
    });
  };

  const changeRole = async (member: MemberRow, next: 'admin' | 'kasir') => {
    if (!supabase) return;
    setBusy(true);
    const { error: rpcError } = await supabase.rpc('set_member_role', {
      p_member: member.member_id,
      p_role: next,
    });
    setBusy(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    await load();
  };

  const toggleActive = async (member: MemberRow) => {
    if (!supabase) return;
    setBusy(true);
    const { error: rpcError } = await supabase.rpc('set_member_active', {
      p_member: member.member_id,
      p_active: !member.active,
    });
    setBusy(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    await load();
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconButton} hitSlop={10}>
          <Icon name="chevronLeft" size={17} color={colors.textMuted} strokeWidth={2} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Anggota toko</Text>
          <Text style={styles.headerSubtitle}>
            {members.length > 0 ? `${members.length} orang terdaftar` : 'Kelola akses karyawan'}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}
        showsVerticalScrollIndicator={false}
      >
            <SectionTitle title="Apa yang boleh dilakukan" icon="lock" />
            <Card style={{ gap: spacing.md }}>
              <Text style={styles.body}>
                Peran menentukan menu yang muncul dan tombol yang bisa ditekan. Pilih peran untuk
                melihat izinnya.
              </Text>
              <Segmented
                options={[
                  { value: 'owner', label: ROLE_LABEL.owner },
                  { value: 'admin', label: ROLE_LABEL.admin },
                  { value: 'kasir', label: ROLE_LABEL.kasir },
                ]}
                value={matrixRole}
                onChange={(value) => setMatrixRole(value)}
              />
              <Text style={styles.body}>{ROLE_SUMMARY[matrixRole]}</Text>
              <Pressable onPress={() => setShowMatrix((v) => !v)} hitSlop={8}>
                <Text style={styles.link}>
                  {showMatrix ? 'Sembunyikan rincian izin' : 'Lihat rincian izin'}
                </Text>
              </Pressable>
              {showMatrix ? (
                <View style={{ gap: spacing.sm }}>
                  {permissionList(matrixRole).map((item) => (
                    <View key={item.action} style={styles.permRow}>
                      <Icon
                        name={item.allowed ? 'checkCircle' : 'close'}
                        size={15}
                        color={item.allowed ? colors.primary : colors.textFaint}
                        strokeWidth={2}
                      />
                      <Text
                        style={[styles.permLabel, !item.allowed && { color: colors.textFaint }]}
                      >
                        {item.label}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </Card>

        {!isCloudEnabled ? (
          <Card style={{ gap: spacing.sm }}>
            <Text style={styles.cardTitle}>Masuk dulu untuk mengatur anggota</Text>
            <Text style={styles.body}>
              Daftar anggota, peran, dan kode undangan muncul setelah Anda masuk memakai akun toko.
              Buka menu Akun, masuk, lalu kembali ke halaman ini.
            </Text>
          </Card>
        ) : (
          <>
            {error ? <Text style={styles.error}>{error}</Text> : null}

            <SectionTitle title="Anggota" icon="users" />
            <View style={{ gap: spacing.sm }}>
              {members.length === 0 ? (
                <Card>
                  <Text style={styles.body}>Belum ada data anggota yang bisa ditampilkan.</Text>
                </Card>
              ) : null}
              {members.map((member) => {
                const self = member.user_id === userId;
                return (
                  <Card key={member.member_id} style={{ gap: spacing.sm }}>
                    <View style={styles.rowBetween}>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={styles.memberEmail} numberOfLines={1}>
                          {member.email}
                          {self ? ' (Anda)' : ''}
                        </Text>
                        <Text style={styles.memberMeta}>
                          Sejak{' '}
                          {new Date(member.created_at).toLocaleDateString('id-ID', {
                            day: '2-digit',
                            month: 'short',
                            year: '2-digit',
                          })}
                        </Text>
                      </View>
                      <Chip
                        label={ROLE_LABEL[member.role]}
                        tone={member.role === 'owner' ? 'primary' : member.role === 'admin' ? 'secondary' : 'neutral'}
                        size="sm"
                      />
                      {!member.active ? <Chip label="Nonaktif" tone="danger" size="sm" /> : null}
                    </View>

                    {isOwner && member.role !== 'owner' ? (
                      <>
                        <Divider />
                        <View style={styles.actions}>
                          <Pressable
                            onPress={() => void changeRole(member, member.role === 'admin' ? 'kasir' : 'admin')}
                            style={styles.smallButton}
                            accessibilityRole="button"
                          >
                            <Text style={styles.smallButtonText}>
                              {member.role === 'admin' ? 'Jadikan kasir' : 'Jadikan admin'}
                            </Text>
                          </Pressable>
                          <Pressable
                            onPress={() => void toggleActive(member)}
                            style={styles.smallButton}
                            accessibilityRole="button"
                          >
                            <Text style={styles.smallButtonText}>
                              {member.active ? 'Nonaktifkan' : 'Aktifkan'}
                            </Text>
                          </Pressable>
                        </View>
                      </>
                    ) : null}
                  </Card>
                );
              })}
            </View>

            {isOwner ? (
              <>
                <SectionTitle title="Undang anggota baru" icon="userPlus" />
                <Card style={{ gap: spacing.md }}>
                  <Text style={styles.body}>
                    Buat kode sekali pakai, kirim ke karyawan, lalu mereka memasukkannya di layar
                    Daftar.
                  </Text>
                  <View style={styles.chipRow}>
                    {(['kasir', 'admin'] as const).map((value) => (
                      <Pressable key={value} onPress={() => setInviteRole(value)}>
                        <Chip
                          label={ROLE_LABEL[value]}
                          tone={inviteRole === value ? 'primary' : 'neutral'}
                          size="sm"
                        />
                      </Pressable>
                    ))}
                  </View>
                  <Button
                    label={busy ? 'Memproses…' : 'Buat kode undangan'}
                    icon="userPlus"
                    onPress={() => void createInvite()}
                    disabled={busy}
                  />
                  {inviteCode ? (
                    <View style={styles.codeBox}>
                      <Text style={styles.codeLabel}>KODE UNDANGAN</Text>
                      <Text style={styles.code}>{inviteCode}</Text>
                      <Text style={styles.codeHint}>Berlaku 72 jam • sekali pakai</Text>
                      <Button label="Bagikan kode" icon="share" variant="secondary" onPress={shareCode} />
                    </View>
                  ) : null}
                </Card>
              </>
            ) : (
              <Card>
                <Text style={styles.body}>
                  Hanya pemilik toko yang bisa mengundang atau mengubah peran anggota.
                </Text>
              </Card>
            )}
          </>
        )}
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
  content: { padding: spacing.base, gap: spacing.lg },
  cardTitle: { ...type.h2, fontFamily: fonts.bold, color: colors.text },
  body: { ...type.body, color: colors.textDim, lineHeight: 20 },
  error: { ...type.caption, fontFamily: fonts.medium, color: colors.danger },
  rowBetween: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  memberEmail: { ...type.body, fontFamily: fonts.semibold, color: colors.text },
  memberMeta: { ...type.caption, color: colors.textFaint },
  actions: { flexDirection: 'row', gap: spacing.sm },
  smallButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardHigh,
  },
  smallButtonText: { ...type.caption, fontFamily: fonts.semibold, color: colors.text },
  chipRow: { flexDirection: 'row', gap: spacing.sm },
  link: { ...type.caption, fontFamily: fonts.semibold, color: colors.secondary },
  permRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  permLabel: { ...type.caption, color: colors.text, flex: 1, lineHeight: 17 },
  codeBox: {
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    backgroundColor: colors.primarySoft,
    gap: 6,
  },
  codeLabel: { ...type.micro, fontFamily: fonts.semibold, color: colors.textDim, letterSpacing: 1 },
  code: { fontFamily: fonts.mono, fontSize: 26, letterSpacing: 4, color: colors.primary },
  codeHint: { ...type.caption, color: colors.textDim },
});
