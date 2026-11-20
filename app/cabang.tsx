/**
 * Cabang (Sprint 12).
 *
 * Toko satu lokasi tetap melihat satu baris di sini dan tidak perlu melakukan
 * apa pun. Yang punya cabang kedua bisa menambah, mengganti nama, dan
 * mengarsipkan cabang. Stok tiap cabang dihitung sendiri; kasbon, shift, dan
 * laporan mengikuti cabang yang sedang dibuka.
 */
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TextField } from '../src/components/Field';
import { Icon } from '../src/components/Icon';
import {
  Button,
  Card,
  Chip,
  Divider,
  EmptyState,
  IconBadge,
  SectionLabel,
  Sheet,
} from '../src/components/Primitives';
import { outletTotals, MAX_OUTLETS, type OutletTotals } from '../src/data/outlets';
import { useAppStore } from '../src/data/store';
import type { Outlet } from '../src/data/types';
import { colors, radius, spacing, type } from '../src/theme/tokens';
import { formatRupiah } from '../src/utils/format';

export default function CabangScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const data = useAppStore();
  const addOutlet = useAppStore((s) => s.addOutlet);
  const updateOutlet = useAppStore((s) => s.updateOutlet);
  const archiveOutlet = useAppStore((s) => s.archiveOutlet);
  const switchOutlet = useAppStore((s) => s.switchOutlet);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Outlet | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [address, setAddress] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const rows = outletTotals(data);
  const activeCount = rows.filter((row) => !row.outlet.archivedAt).length;

  const openNew = () => {
    setEditing(null);
    setName('');
    setCode('');
    setAddress('');
    setFormError(null);
    setFormOpen(true);
  };

  const openEdit = (outlet: Outlet) => {
    setEditing(outlet);
    setName(outlet.name);
    setCode(outlet.code);
    setAddress(outlet.address ?? '');
    setFormError(null);
    setFormOpen(true);
  };

  const submit = () => {
    const result = editing
      ? updateOutlet(editing.id, { name, code, address })
      : addOutlet({ name, code, address });
    if (!result.ok) {
      setFormError(result.reason);
      return;
    }
    setFormError(null);
    setFormOpen(false);
  };

  const confirmArchive = (outlet: Outlet) => {
    Alert.alert(
      'Arsipkan cabang?',
      `"${outlet.name}" tidak akan muncul lagi saat memilih cabang. Riwayat transaksi dan kasbonnya tetap tersimpan.`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Arsipkan',
          style: 'destructive',
          onPress: () => {
            const result = archiveOutlet(outlet.id);
            if (!result.ok) Alert.alert('Belum bisa diarsipkan', result.reason);
          },
        },
      ],
    );
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconButton} hitSlop={10}>
          <Icon name="chevronLeft" size={17} color={colors.textMuted} strokeWidth={2} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Cabang</Text>
          <Text style={styles.headerSub}>
            {activeCount} cabang aktif
            {rows.some((row) => row.outlet.archivedAt) ? ' • ada yang diarsipkan' : ''}
          </Text>
        </View>
        {activeCount < MAX_OUTLETS ? (
          <Pressable
            onPress={openNew}
            style={styles.addButton}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Tambah cabang"
          >
            <Icon name="plus" size={17} color={colors.onPrimary} strokeWidth={2.4} />
          </Pressable>
        ) : null}
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {rows.length === 0 ? (
          <Card>
            <EmptyState
              icon="store"
              title="Belum ada cabang"
              description="Cabang dibuat otomatis saat data toko pertama kali disimpan."
            />
          </Card>
        ) : (
          <>
            {rows.map((row) => (
              <OutletCard
                key={row.outlet.id}
                row={row}
                onUse={() => {
                  const result = switchOutlet(row.outlet.id);
                  if (!result.ok) Alert.alert('Belum bisa dipakai', result.reason);
                  else router.back();
                }}
                onEdit={() => openEdit(row.outlet)}
                onArchive={() => confirmArchive(row.outlet)}
              />
            ))}

            <Card tone="flat">
              <Text style={styles.hintText}>
                Setiap cabang punya stok, kasbon, shift, dan laporan sendiri. Buku pelanggan
                dipakai bersama, jadi pelanggan bisa belanja di cabang mana saja.
              </Text>
            </Card>
          </>
        )}
      </ScrollView>

      <Sheet
        visible={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? 'Ubah cabang' : 'Cabang baru'}
        subtitle={
          editing
            ? 'Nama dan kode ikut tercetak di struk cabang ini.'
            : `Maksimal ${MAX_OUTLETS} cabang aktif.`
        }
      >
        <View style={{ gap: spacing.md }}>
          <TextField
            label="Nama cabang"
            icon="store"
            placeholder="Contoh: Cabang Pasar Baru"
            value={name}
            onChangeText={setName}
          />
          <TextField
            label="Kode singkat (opsional)"
            icon="tag"
            placeholder="Contoh: PSR1"
            autoCapitalize="characters"
            value={code}
            onChangeText={setCode}
          />
          <TextField
            label="Alamat (opsional)"
            icon="fileText"
            placeholder="Contoh: Jl. Pasar Baru No. 12"
            value={address}
            onChangeText={setAddress}
          />
        </View>
        {formError ? <Text style={styles.formError}>{formError}</Text> : null}
        <Button
          label={editing ? 'Simpan perubahan' : 'Tambah cabang'}
          icon="check"
          onPress={submit}
          disabled={!name.trim()}
          style={{ marginTop: spacing.base }}
        />
      </Sheet>
    </View>
  );
}

function OutletIcons({
  outlet,
  onEdit,
  onArchive,
}: {
  outlet: Outlet;
  onEdit: () => void;
  onArchive: () => void;
}) {
  return (
    <View style={styles.iconRow}>
      <Pressable onPress={onEdit} hitSlop={10} accessibilityLabel={`Ubah cabang ${outlet.name}`}>
        <Icon name="edit" size={17} color={colors.textMuted} strokeWidth={1.9} />
      </Pressable>
      <Pressable onPress={onArchive} hitSlop={10} accessibilityLabel={`Arsipkan cabang ${outlet.name}`}>
        <Icon name="trash" size={17} color={colors.textFaint} strokeWidth={1.9} />
      </Pressable>
    </View>
  );
}

function OutletCard({
  row,
  onUse,
  onEdit,
  onArchive,
}: {
  row: OutletTotals;
  onUse: () => void;
  onEdit: () => void;
  onArchive: () => void;
}) {
  const archived = Boolean(row.outlet.archivedAt);
  return (
    <Card style={{ gap: spacing.md }}>
      <View style={styles.rowTop}>
        <IconBadge name="store" tone={row.isActive ? 'primary' : 'neutral'} size={38} />
        <View style={{ flex: 1, gap: 3 }}>
          <View style={styles.nameRow}>
            <Text style={styles.outletName} numberOfLines={1}>
              {row.outlet.name}
            </Text>
            {row.isActive ? <Chip label="Sedang dipakai" tone="primary" size="sm" /> : null}
            {archived ? <Chip label="Diarsipkan" tone="neutral" size="sm" /> : null}
          </View>
          <Text style={styles.outletMeta} numberOfLines={1}>
            {row.outlet.code}
            {row.outlet.address ? ` • ${row.outlet.address}` : ''}
          </Text>
        </View>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>Transaksi</Text>
          <Text style={styles.statValue}>{row.transactions}</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.stat}>
          <Text style={styles.statLabel}>Omzet</Text>
          <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
            {formatRupiah(row.sales)}
          </Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.stat}>
          <Text style={styles.statLabel}>Kasbon</Text>
          <Text
            style={[styles.statValue, { color: row.receivablesOpen > 0 ? colors.amber : colors.primary }]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {formatRupiah(row.receivablesOpen)}
          </Text>
        </View>
      </View>

      {archived ? null : (
        <>
          <Divider />
          {row.isActive ? (
            <View style={styles.actionRow}>
              <Chip label="Cabang yang sedang dibuka" tone="secondary" size="sm" icon="check" />
              <View style={{ flex: 1 }} />
              <OutletIcons outlet={row.outlet} onEdit={onEdit} onArchive={onArchive} />
            </View>
          ) : (
            <>
              <Button label="Pakai cabang ini" icon="arrowRight" onPress={onUse} />
              <View style={[styles.actionRow, { justifyContent: 'flex-end' }]}>
                <OutletIcons outlet={row.outlet} onEdit={onEdit} onArchive={onArchive} />
              </View>
            </>
          )}
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { ...type.h1, color: colors.text },
  headerSub: { ...type.caption, color: colors.textDim, marginTop: 2 },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { paddingHorizontal: spacing.base, paddingBottom: spacing.xxl, gap: spacing.md },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  outletName: { ...type.h3, color: colors.text },
  outletMeta: { ...type.caption, color: colors.textDim },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stat: { flex: 1, gap: 3 },
  statDivider: { width: 1, alignSelf: 'stretch', backgroundColor: colors.border, marginHorizontal: spacing.sm },
  statLabel: { ...type.micro, color: colors.textDim },
  statValue: { ...type.num, color: colors.text },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.base },
  iconRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  hintText: { ...type.caption, color: colors.textDim, lineHeight: 18 },
  formError: { ...type.caption, color: colors.danger, marginTop: spacing.sm },
});
