import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api';
import { Field, Row, T } from './ui';
import { space, useTheme } from '@/lib/theme';

export interface Place { label: string; lat: number; lon: number }

/**
 * Birthplace search. Instant results from ~150k Indian villages and towns (India Post directory) on the server;
 * anything else (a tiny village, a place abroad) is looked up on OpenStreetMap when the user taps "Search the map".
 */
export function PlaceSearch({ value, onSelect }: { value: Place | null; onSelect: (p: Place) => void }) {
  const { t, i18n } = useTranslation();
  const { c } = useTheme();
  const [q, setQ] = useState(value?.label ?? '');
  const [results, setResults] = useState<Place[]>([]);
  const [mapResults, setMapResults] = useState<Place[] | null>(null);
  const [searchingMap, setSearchingMap] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    setMapResults(null);
    if (value && q === value.label) { setResults([]); return; }
    if (q.trim().length < 2) { setResults([]); return; }
    const h = setTimeout(async () => {
      try { setResults(await api<Place[]>(`/places/search?q=${encodeURIComponent(q)}`)); } catch { setResults([]); }
    }, 200);
    return () => clearTimeout(h);
  }, [q, value]);

  const searchMap = async () => {
    setNotFound(false); setSearchingMap(true);
    try {
      const r = await api<Place[]>(`/places/geocode?q=${encodeURIComponent(q.trim())}&lang=${encodeURIComponent(i18n.language === 'en' ? 'en' : 'en,hi')}`);
      setMapResults(r);
      if (!r.length) setNotFound(true);
    } catch { setNotFound(true); } finally { setSearchingMap(false); }
  };

  const pick = (p: Place) => { setQ(p.label); setResults([]); setMapResults(null); onSelect(p); };
  const typing = q.trim().length >= 3 && (!value || value.label !== q);

  return (
    <View>
      <Field value={q} onChangeText={(s) => { setQ(s); setNotFound(false); }} placeholder={t('onboarding.place_placeholder')} autoCorrect={false} />
      {results.map((r) => <Row key={r.label} title={r.label} onPress={() => pick(r)} />)}
      {mapResults?.map((r) => <Row key={`${r.label}${r.lat}`} title={r.label} subtitle="OpenStreetMap" onPress={() => pick(r)} />)}
      {typing && !mapResults ? (
        <Row title={t('onboarding.place_use_typed', { q: q.trim() })} onPress={searchMap} right={searchingMap ? <ActivityIndicator color={c.primary} /> : undefined} last />
      ) : null}
      {notFound ? <T v="small" color={c.danger} style={{ marginTop: space.s }}>{t('onboarding.place_not_found')}</T> : null}
      {mapResults?.length ? <T v="tiny" color={c.inkSoft} style={{ marginTop: space.s }}>© OpenStreetMap contributors</T> : null}
    </View>
  );
}
