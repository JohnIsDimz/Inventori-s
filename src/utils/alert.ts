import { Alert, Platform, type AlertButton, type AlertOptions } from 'react-native';

export const appAlert = {
  alert(title: string, message?: string, buttons?: AlertButton[], options?: AlertOptions): void {
    if (Platform.OS !== 'web') { Alert.alert(title, message, buttons, options); return; }
    if (typeof window === 'undefined') return;
    const text = [title, message].filter(Boolean).join('\n\n');
    const action = buttons?.find((b) => b.style !== 'cancel');
    if (action) {
      if (window.confirm(text)) action.onPress?.();
      else buttons?.find((b) => b.style === 'cancel')?.onPress?.();
    } else window.alert(text);
  },
};
