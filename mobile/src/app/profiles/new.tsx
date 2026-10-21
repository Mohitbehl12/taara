import React from 'react';
import { KeyboardAvoidingView, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api';
import { useApp } from '@/lib/store';
import { space } from '@/lib/theme';
import { Screen } from '@/components/ui';
import { BirthForm, toPayload } from '@/components/BirthForm';

export default function NewProfile() {
  const { t } = useTranslation();
  const router = useRouter();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const refreshUser = useApp((s) => s.refreshUser);
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen scroll={false} edges={['bottom']} style={{ paddingTop: space.m, paddingBottom: space.l }}>
        <BirthForm askRelation submitLabel={t('common.save')} onSubmit={async (v) => {
          await api('/profiles', { body: { ...toPayload(v), relation: v.relation ?? 'other', isPrimary: false } });
          await refreshUser();
          if (returnTo) router.replace(returnTo as any); else router.back();
        }} />
      </Screen>
    </KeyboardAvoidingView>
  );
}
