import React from 'react';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useApp } from '@/lib/store';
import { space, useTheme } from '@/lib/theme';
import { LANGUAGES } from '@/i18n/languages';
import { Row, Screen, T } from '@/components/ui';

export default function LanguageScreen() {
  const { t } = useTranslation();
  const { c } = useTheme();
  const router = useRouter();
  const { language, chooseLanguage } = useApp();
  return (
    <Screen edges={[]}>
      <T v="h1" style={{ paddingVertical: space.m }}>{t('profile.language')}</T>
      {LANGUAGES.map((l, i) => (
        <Row key={l.code} title={l.native} subtitle={l.native !== l.english ? l.english : null} last={i === LANGUAGES.length - 1}
          right={l.code === language ? <T color={c.primary} style={{ fontWeight: '700' }}>✓</T> : <T> </T>}
          onPress={async () => { await chooseLanguage(l.code); router.back(); }} />
      ))}
    </Screen>
  );
}
