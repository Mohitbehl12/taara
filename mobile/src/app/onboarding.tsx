import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api';
import { useApp } from '@/lib/store';
import { space } from '@/lib/theme';
import { Chip, Screen, T } from '@/components/ui';
import { BirthForm, toPayload } from '@/components/BirthForm';

const GOALS = ['love', 'career', 'money', 'health', 'marriage', 'family', 'education', 'general'];

export default function Onboarding() {
  const { t } = useTranslation();
  const { user, refreshUser, updateUser } = useApp();
  const [goal, setGoal] = useState<string | null>(null);
  const [gender, setGender] = useState<string | null>(null);

  const extra = (
    <View style={{ gap: space.l }}>
      <T v="h1">{t('onboarding.goal_q')}</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s }}>
        {GOALS.map((g) => <Chip key={g} label={t(`goals.${g}`)} selected={goal === g} onPress={() => setGoal(g)} />)}
      </View>
      <T v="h2" style={{ marginTop: space.l }}>{t('onboarding.gender_q')}</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s }}>
        {['male', 'female', 'other', 'prefer_not'].map((g) => (
          <Chip key={g} label={t(`onboarding.gender_${g === 'prefer_not' ? 'skip' : g}`)} selected={gender === g} onPress={() => setGender(g)} />
        ))}
      </View>
    </View>
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen scroll={false} style={{ paddingTop: space.l, paddingBottom: space.l }}>
        <BirthForm
          initial={{ name: user?.name ?? '' }}
          submitLabel={t('onboarding.finish')}
          extraStep={extra}
          onSubmit={async (v) => {
            await api('/profiles', { body: { ...toPayload(v), relation: 'self', isPrimary: true } });
            await updateUser({ name: v.name.trim(), goal, gender: gender as any });
            await refreshUser(); // profiles.length > 0 → router guard moves to the tabs
          }}
        />
      </Screen>
    </KeyboardAvoidingView>
  );
}
