import React, { useState } from 'react';
import { Alert, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { api, rupees } from '@/lib/api';
import { useApp } from '@/lib/store';
import { useFetch } from '@/lib/useFetch';
import { space, useTheme } from '@/lib/theme';
import { Button, Chip, Row, Screen, Section, Sheet, T } from '@/components/ui';
import { LoginGate, useSignedIn } from '@/components/Gates';

interface Catalog { kind: string; title: string; sections: string[]; pricePaise: number }
interface Mine { id: string; kind: string; status: string; createdAt: string }

function ReportsScreen() {
  const { t, i18n } = useTranslation();
  const { c } = useTheme();
  const router = useRouter();
  const { user, refreshUser } = useApp();
  const catalog = useFetch<Catalog[]>('/reports/catalog');
  const mine = useFetch<Mine[]>('/reports');
  const profiles = user?.profiles ?? [];
  const [buy, setBuy] = useState<Catalog | null>(null);
  const [pid, setPid] = useState(profiles.find((p) => p.isPrimary)?.id ?? null);
  const [partner, setPartner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const purchase = async () => {
    if (!buy || !pid) return;
    if ((user?.balancePaise ?? 0) < buy.pricePaise) { setBuy(null); router.push('/topup'); return; }
    setBusy(true);
    try {
      const r = await api<{ id: string }>('/reports', { body: { kind: buy.kind, profileId: pid, partnerProfileId: partner ?? undefined, lang: i18n.language } });
      setBuy(null); await refreshUser();
      router.push({ pathname: '/reports/[id]', params: { id: r.id } });
    } catch { Alert.alert(t('common.error_generic')); } finally { setBusy(false); }
  };

  return (
    <Screen edges={[]}>
      <T v="h1" style={{ paddingTop: space.m }}>{t('reports.title')}</T>
      {catalog.data?.map((r, i) => (
        <Row key={r.kind} title={t(`reports.${r.kind}`)} subtitle={r.sections.slice(0, 3).join(' · ')} last={i === catalog.data!.length - 1}
          right={<T style={{ fontWeight: '700' }}>{rupees(r.pricePaise)}</T>} onPress={() => { setBuy(r); setPartner(null); }} />
      ))}
      {mine.data?.length ? (
        <Section title={t('reports.mine')}>
          {mine.data.map((r, i) => (
            <Row key={r.id} title={t(`reports.${r.kind}`)} subtitle={new Date(r.createdAt).toLocaleDateString(i18n.language)} last={i === mine.data!.length - 1}
              onPress={() => router.push({ pathname: '/reports/[id]', params: { id: r.id } })} />
          ))}
        </Section>
      ) : null}
      <Sheet visible={!!buy} onClose={() => setBuy(null)}>
        {buy ? (
          <View style={{ gap: space.m }}>
            <T v="h2">{t(`reports.${buy.kind}`)}</T>
            <T v="small" color={c.inkSoft}>{buy.sections.join(' · ')}</T>
            <T v="small" style={{ fontWeight: '700' }}>{t('reports.choose_chart')}</T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s }}>
              {profiles.map((p) => <Chip key={p.id} label={p.name} selected={p.id === pid} onPress={() => setPid(p.id)} />)}
            </View>
            {buy.kind === 'compatibility' ? (
              <>
                <T v="small" style={{ fontWeight: '700' }}>{t('reports.choose_partner')}</T>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s }}>
                  {profiles.filter((p) => p.id !== pid).map((p) => <Chip key={p.id} label={p.name} selected={p.id === partner} onPress={() => setPartner(p.id)} />)}
                </View>
              </>
            ) : null}
            <T v="small" color={c.inkSoft}>{t('reports.confirm', { price: rupees(buy.pricePaise) })}</T>
            <Button title={t('reports.buy', { price: rupees(buy.pricePaise) })} loading={busy} onPress={purchase}
              disabled={!pid || (buy.kind === 'compatibility' && !partner)} />
          </View>
        ) : null}
      </Sheet>
    </Screen>
  );
}

/** Needs an account; guests see a short explanation and a login button. */
export default function Reports() {
  return useSignedIn() ? <ReportsScreen /> : <LoginGate next="/reports" icon="📄" />;
}
