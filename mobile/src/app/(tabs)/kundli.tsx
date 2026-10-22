// Kundli tab (like AstroSage): make a free Kundli on one page, see saved ones, jump to matching. No login needed.
import React, { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useApp, useKundliList } from '@/lib/store';
import { space, useTheme } from '@/lib/theme';
import { Button, Panel, Row, Screen, Section, T } from '@/components/ui';
import { KundliForm } from '@/components/KundliForm';

export default function KundliTab() {
  const { t, i18n } = useTranslation();
  const { c } = useTheme();
  const router = useRouter();
  const list = useKundliList();
  const { addKundli, removeKundli, token } = useApp();
  const [showForm, setShowForm] = useState(list.length === 0);
  const date = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short', year: 'numeric' });

  const remove = (id: string, name: string) => Alert.alert(t('kundli.delete_q', { name }), '', [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('common.delete'), style: 'destructive', onPress: () => removeKundli(id) },
  ]);

  return (
    <Screen style={{ gap: space.l, paddingTop: space.l }}>
      <T v="h1">{t('kundli.title')}</T>

      <Pressable onPress={() => router.push('/match')} accessibilityRole="button"
        style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, padding: space.m, borderRadius: 16, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line }}>
        <T style={{ fontSize: 28, lineHeight: 34 }}>💞</T>
        <View style={{ flex: 1 }}>
          <T style={{ fontWeight: '700' }}>{t('kundli.matching')}</T>
          <T v="small" color={c.inkSoft}>{t('kundli.matching_sub')}</T>
        </View>
        <T color={c.inkSoft}>›</T>
      </Pressable>

      {list.length ? (
        <Section title={t('kundli.saved')} style={{ marginTop: 0 }}>
          {list.map((k, i) => (
            <Row key={k.id} title={`${k.name}${k.isPrimary ? ` · ${t('kundli.mine')}` : ''}`}
              subtitle={`${date(k.date)}${k.time ? ` · ${k.time}` : ''} · ${k.placeName}`}
              onPress={() => router.push({ pathname: '/kundli/[id]', params: { id: k.id } })}
              right={<Pressable onPress={() => remove(k.id, k.name)} hitSlop={10} accessibilityLabel={t('common.delete')}><T color={c.inkSoft}>✕</T></Pressable>}
              last={i === list.length - 1} />
          ))}
          {!token ? <T v="tiny" color={c.inkSoft} style={{ marginTop: space.s }}>{t('kundli.saved_on_device')}</T> : null}
        </Section>
      ) : null}

      {showForm ? (
        <Panel style={{ gap: space.m }}>
          <T v="h2">{t('kundli.free_title')}</T>
          <T v="small" color={c.inkSoft}>{t('kundli.free_sub')}</T>
          <KundliForm askRelation={list.length > 0} defaultRelation={list.length ? 'other' : 'self'} submitLabel={t('kundli.get')}
            onSubmit={async (b) => {
              const k = await addKundli(b, list.length === 0);
              setShowForm(false);
              router.push({ pathname: '/kundli/[id]', params: { id: k.id } });
            }} />
        </Panel>
      ) : list.length ? <Button title={`+ ${t('kundli.new')}`} kind="secondary" onPress={() => setShowForm(true)} /> : null}

      <T v="tiny" color={c.inkSoft}>{t('common.disclaimer')}</T>
    </Screen>
  );
}
