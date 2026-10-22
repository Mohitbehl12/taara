// Add a Kundli from another screen (e.g. "+ Add a new person" in matching), then go back there.
import React from 'react';
import { KeyboardAvoidingView, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useApp, useKundliList } from '@/lib/store';
import { space } from '@/lib/theme';
import { Screen, T } from '@/components/ui';
import { KundliForm } from '@/components/KundliForm';

export default function NewKundli() {
  const { t } = useTranslation();
  const router = useRouter();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const addKundli = useApp((s) => s.addKundli);
  const list = useKundliList();
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen edges={['bottom']} style={{ paddingTop: space.m, gap: space.l }}>
        <T v="h1">{t('kundli.new')}</T>
        <KundliForm askRelation={list.length > 0} defaultRelation={list.length ? 'other' : 'self'} submitLabel={t('common.save')}
          onSubmit={async (b) => {
            const k = await addKundli(b, list.length === 0);
            if (returnTo && router.canGoBack()) router.back();
            else router.replace({ pathname: '/kundli/[id]', params: { id: k.id } });
          }} />
      </Screen>
    </KeyboardAvoidingView>
  );
}
