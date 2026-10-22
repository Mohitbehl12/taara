// Two small gates used across the app:
// - LoginGate: shown in place of a screen that needs an account (wallet, palm, reports, history).
// - KundliPicker: for free tools — pick a saved Kundli, or make one right here without leaving the screen.
import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useApp, useKundliList, usePrimaryKundli } from '@/lib/store';
import type { Kundli } from '@/lib/kundlis';
import { space, useTheme } from '@/lib/theme';
import { Button, Chip, Panel, Screen, T } from '@/components/ui';
import { KundliForm } from '@/components/KundliForm';

export function LoginGate({ next, icon = '🔐', title, body, top }: { next: string; icon?: string; title?: string; body?: string; top?: boolean }) {
  const { t } = useTranslation();
  const { c } = useTheme();
  const router = useRouter();
  const token = useApp((s) => s.token);
  return (
    <Screen edges={top ? ['top'] : []} style={{ paddingTop: space.xl, gap: space.l, alignItems: 'stretch' }}>
      <T style={{ fontSize: 48, lineHeight: 56, textAlign: 'center' }}>{icon}</T>
      <T v="h1" style={{ textAlign: 'center' }}>{title ?? t('gate.title')}</T>
      <T color={c.inkSoft} style={{ textAlign: 'center' }}>{body ?? t('gate.body')}</T>
      <Button title={t('gate.cta')} onPress={() => router.push({ pathname: token ? '/consent' : '/login', params: { next } })} />
    </Screen>
  );
}

/** True when the person can use account-only screens. */
export const useSignedIn = () => useApp((s) => !!s.token && !!s.user?.consentCurrent);

/**
 * Selected Kundli for a tool screen. Shows chips to switch between saved Kundlis; with none saved,
 * shows the one-page form inline so the tool works on the first visit.
 */
export function useKundliChoice() {
  const list = useKundliList();
  const primary = usePrimaryKundli();
  const [id, setId] = useState<string | null>(null);
  const k = list.find((x) => x.id === id) ?? primary;
  return { list, k, setId };
}

export function KundliChips({ list, value, onChange }: { list: Kundli[]; value: Kundli | null; onChange: (id: string) => void }) {
  if (list.length < 2) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.s }} style={{ flexGrow: 0 }}>
      {list.map((p) => <Chip key={p.id} label={p.name} selected={p.id === value?.id} onPress={() => onChange(p.id)} />)}
    </ScrollView>
  );
}

export function MakeKundliInline({ title }: { title?: string }) {
  const { t } = useTranslation();
  const { c } = useTheme();
  const addKundli = useApp((s) => s.addKundli);
  return (
    <Panel style={{ gap: space.m }}>
      <T v="h2">{title ?? t('home.make_kundli_title')}</T>
      <T v="small" color={c.inkSoft}>{t('kundli.free_sub')}</T>
      <View>
        <KundliForm submitLabel={t('kundli.get')} onSubmit={async (b) => { await addKundli({ ...b, relation: 'self' }, true); }} />
      </View>
    </Panel>
  );
}
