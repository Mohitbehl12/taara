import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import * as Location from 'expo-location';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api';
import { Field, Row, T } from './ui';
import { useTheme } from '@/lib/theme';

export interface Place { label: string; lat: number; lon: number }

/** Instant search over bundled Indian cities, plus the phone's geocoder for any other town or village. */
export function PlaceSearch({ value, onSelect }: { value: Place | null; onSelect: (p: Place) => void }) {
  const { t } = useTranslation();
  const { c } = useTheme();
  const [q, setQ] = useState(value?.label ?? '');
  const [results, setResults] = useState<Place[]>([]);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (value && q === value.label) { setResults([]); return; }
    if (q.trim().length < 2) { setResults([]); return; }
    const h = setTimeout(async () => {
      try { setResults(await api<Place[]>(`/places/search?q=${encodeURIComponent(q)}`)); } catch { setResults([]); }
    }, 200);
    return () => clearTimeout(h);
  }, [q, value]);

  const geocode = async () => {
    setNotFound(false);
    try {
      const r = await Location.geocodeAsync(q);
      if (r[0]) onSelect({ label: q.trim(), lat: r[0].latitude, lon: r[0].longitude });
      else setNotFound(true);
    } catch { setNotFound(true); }
  };

  return (
    <View>
      <Field value={q} onChangeText={(s) => { setQ(s); setNotFound(false); }} placeholder={t('onboarding.place_placeholder')} autoCorrect={false} />
      {results.map((r, i) => (
        <Row key={r.label} title={r.label} onPress={() => { setQ(r.label); onSelect(r); }} last={i === results.length - 1 && q.trim().length < 3} />
      ))}
      {q.trim().length >= 3 && (!value || value.label !== q) ? (
        <Row title={t('onboarding.place_use_typed', { q: q.trim() })} onPress={geocode} last />
      ) : null}
      {notFound ? <T v="small" color={c.danger}>{t('onboarding.place_not_found')}</T> : null}
    </View>
  );
}
