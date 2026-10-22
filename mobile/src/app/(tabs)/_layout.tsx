import React from 'react';
import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/lib/theme';

// Simple glyph icons keep the bundle free of icon fonts and render in every locale.
import type { ColorValue } from 'react-native';
const icon = (glyph: string) => ({ color, focused }: { color: ColorValue; focused: boolean }) => (
  <Text style={{ fontSize: focused ? 22 : 20, color }} accessibilityElementsHidden>{glyph}</Text>
);

export default function TabsLayout() {
  const { t } = useTranslation();
  const { c } = useTheme();
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: c.primary,
      tabBarInactiveTintColor: c.inkSoft,
      tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.line, height: 64, paddingTop: 6 },
      tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
    }}>
      <Tabs.Screen name="index" options={{ title: t('tabs.home'), tabBarIcon: icon('⌂') }} />
      <Tabs.Screen name="horoscope" options={{ title: t('tabs.horoscope'), tabBarIcon: icon('☉') }} />
      <Tabs.Screen name="kundli" options={{ title: t('tabs.kundli'), tabBarIcon: icon('❖\uFE0E') }} />
      <Tabs.Screen name="consult" options={{ title: t('tabs.astrologers'), tabBarIcon: icon('✦') }} />
      <Tabs.Screen name="profile" options={{ title: t('tabs.more'), tabBarIcon: icon('☰') }} />
      {/* Palm reading opens from Home, like AstroSage's tiles; it stays a route but not a tab. */}
      <Tabs.Screen name="palm" options={{ href: null }} />
    </Tabs>
  );
}
