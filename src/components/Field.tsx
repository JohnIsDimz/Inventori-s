import React from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { Icon, type IconName } from './Icon';
import { colors, fonts, radius, spacing, type } from '../theme/tokens';

export function TextField({
  label,
  icon,
  prefix,
  right,
  style,
  multiline,
  hint,
  ...props
}: TextInputProps & {
  label?: string;
  icon?: IconName;
  prefix?: string;
  right?: React.ReactNode;
  hint?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={style}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={[styles.field, multiline && styles.fieldMultiline]}>
        {icon ? <Icon name={icon} size={16} color={colors.textFaint} strokeWidth={1.8} /> : null}
        {prefix ? <Text style={styles.prefix}>{prefix}</Text> : null}
        <TextInput
          {...props}
          multiline={multiline}
          placeholderTextColor={colors.textFaint}
          style={[styles.input, multiline && { minHeight: 92, textAlignVertical: 'top', paddingTop: 8 }]}
        />
        {right}
      </View>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    ...type.micro,
    color: colors.textDim,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 46,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  fieldMultiline: { alignItems: 'flex-start', paddingVertical: 4 },
  prefix: { fontFamily: fonts.numSemibold, fontSize: 14, color: colors.textMuted },
  input: {
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.text,
    paddingVertical: 10,
  },
  hint: { ...type.caption, color: colors.textFaint, marginTop: 5 },
});
