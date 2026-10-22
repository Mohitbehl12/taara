import React from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '@/lib/store';
import { space, useTheme } from '@/lib/theme';
import { Button, T } from '@/components/ui';
import { KundliChart } from '@/components/KundliChart';
import { LANGUAGES } from '@/i18n/languages';

export default function Welcome() {
  const { t } = useTranslation();
  const { c } = useTheme();
  const router = useRouter();
  const { language, chooseLanguage } = useApp();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.sky }} edges={['top']}>
      <View style={{ alignItems: 'center', paddingTop: space.xl, paddingBottom: space.l, gap: space.s }}>
        <KundliChart size={96} planets={[]} referenceSign={0} line={c.marigold} ink={c.skyInk} muted="transparent" />
        <T v="hero" color={c.skyInk}>{t('welcome.title')}</T>
        <T color={c.skyInk} style={{ opacity: 0.85 }}>{t('welcome.tagline')}</T>
      </View>
      <View style={{ flex: 1, backgroundColor: c.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: space.xl }}>
        <T v="h2" style={{ paddingHorizontal: space.l, marginBottom: space.m }}>{t('welcome.choose_language')}</T>
        <FlatList
          data={LANGUAGES}
          keyExtractor={(l) => l.code}
          numColumns={2}
          contentContainerStyle={{ paddingHorizontal: space.l, gap: space.s, paddingBottom: space.l }}
          columnWrapperStyle={{ gap: space.s }}
          renderItem={({ item }) => {
            const sel = item.code === language;
            return (
              <Pressable onPress={() => chooseLanguage(item.code)} accessibilityRole="radio" accessibilityState={{ selected: sel }}
                style={{ flex: 1, minHeight: 64, borderRadius: 14, padding: space.m, justifyContent: 'center',
                  backgroundColor: sel ? c.primary : c.surface, borderWidth: sel ? 0 : 1, borderColor: c.line }}>
                <T style={{ fontWeight: '600' }} color={sel ? c.onPrimary : c.ink}>{item.native}</T>
                {item.native !== item.english ? <T v="tiny" color={sel ? c.onPrimary : c.inkSoft}>{item.english}</T> : null}
              </Pressable>
            );
          }}
        />
        <View style={{ padding: space.l, gap: space.s, borderTopWidth: 1, borderTopColor: c.line }}>
          <Button title={t('common.continue')} onPress={async () => { await chooseLanguage(language); router.replace('/(tabs)'); }} />
          <T v="tiny" color={c.inkSoft} style={{ textAlign: 'center' }}>{t('welcome.change_later')}</T>
        </View>
      </View>
    </SafeAreaView>
  );
}
