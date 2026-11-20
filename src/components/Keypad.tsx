import * as Haptics from 'expo-haptics';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from './Icon';
import { colors, fonts, radius, spacing } from '../theme/tokens';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0', 'del'] as const;

export function Keypad({
  onKey,
  onDelete,
}: {
  onKey: (key: string) => void;
  onDelete: () => void;
}) {
  return (
    <View style={styles.grid}>
      {KEYS.map((key) => {
        const isDelete = key === 'del';
        return (
          <Pressable
            key={key}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              if (isDelete) onDelete();
              else onKey(key);
            }}
            style={({ pressed }) => [
              styles.key,
              isDelete && styles.keyDelete,
              pressed && { backgroundColor: colors.cardHighest },
            ]}
            accessibilityLabel={isDelete ? 'Hapus' : key}
          >
            {isDelete ? (
              <Icon name="backspace" size={20} color={colors.tertiary} strokeWidth={1.9} />
            ) : (
              <Text style={styles.keyText}>{key}</Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  key: {
    width: '31.2%',
    flexGrow: 1,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyDelete: { backgroundColor: colors.tertiarySoft, borderColor: colors.tertiaryBorder },
  keyText: { fontFamily: fonts.numSemibold, fontSize: 19, color: colors.text },
});
