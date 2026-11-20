import { Tabs } from 'expo-router';
import React from 'react';

import { TabBar } from '../../src/components/TabBar';
import { colors } from '../../src/theme/tokens';

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Beranda' }} />
      <Tabs.Screen name="transaksi" options={{ title: 'Transaksi' }} />
      <Tabs.Screen name="kasbon" options={{ title: 'Kasbon' }} />
      <Tabs.Screen name="laporan" options={{ title: 'Laporan' }} />
    </Tabs>
  );
}
