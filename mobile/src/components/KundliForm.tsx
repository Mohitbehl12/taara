// One-page birth details form (like AstroSage's "Free Kundli"): name, gender, date, time, place → Get Kundli.
import React, { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { space, useTheme } from '@/lib/theme';
import { errorMessage } from '@/lib/errors';
import type { BirthInput } from '@/lib/kundlis';
import { Button, Chip, Field, T } from '@/components/ui';
import { Checkbox } from '@/components/Safety';
import { PickerField, toPayload } from '@/components/BirthForm';
import { PlaceSearch, type Place } from '@/components/PlaceSearch';

const RELATIONS = ['self', 'partner', 'child', 'parent', 'sibling', 'friend', 'other'] as const;

export function KundliForm({ submitLabel, onSubmit, askRelation, defaultRelation = 'self', compact }: {
  submitLabel: string; onSubmit: (k: BirthInput) => Promise<void>; askRelation?: boolean; defaultRelation?: string; compact?: boolean;
}) {
  const { t } = useTranslation();
  const { c } = useTheme();
  const [name, setName] = useState('');
  const [gender, setGender] = useState<string | null>(null);
  const [date, setDate] = useState<Date | null>(null);
  const [time, setTime] = useState<Date | null>(null);
  const [noTime, setNoTime] = useState(false);
  const [place, setPlace] = useState<Place | null>(null);
  const [relation, setRelation] = useState(defaultRelation);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = name.trim().length > 0 && !!date && (noTime || !!time) && !!place;

  const submit = async () => {
    if (!ready) return;
    setBusy(true); setError(null);
    try {
      const p = toPayload({ name, date, time, timeAccuracy: noTime ? 'unknown' : 'exact', place });
      await onSubmit({ ...p, relation, gender } as BirthInput);
    } catch (e: any) { setError(errorMessage(t, e)); } finally { setBusy(false); }
  };

  const label = (s: string) => <T v="small" color={c.inkSoft} style={{ fontWeight: '700' }}>{s}</T>;

  return (
    <View style={{ gap: compact ? space.m : space.l }}>
      <View style={{ gap: space.xs }}>
        {label(t('onboarding.name_placeholder'))}
        <Field value={name} onChangeText={setName} placeholder={t('onboarding.name_placeholder')} autoCapitalize="words" />
      </View>
      <View style={{ gap: space.xs }}>
        {label(t('onboarding.gender_q'))}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s }}>
          {(['male', 'female', 'other'] as const).map((g) => <Chip key={g} label={t(`onboarding.gender_${g}`)} selected={gender === g} onPress={() => setGender(gender === g ? null : g)} />)}
        </View>
      </View>
      {askRelation ? (
        <View style={{ gap: space.xs }}>
          {label(t('kundli.relation'))}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s }}>
            {RELATIONS.map((r) => <Chip key={r} label={t(`relations.${r}`)} selected={relation === r} onPress={() => setRelation(r)} />)}
          </View>
        </View>
      ) : null}
      <View style={{ gap: space.xs }}>
        {label(t('onboarding.dob_q'))}
        <PickerField mode="date" value={date} onChange={setDate} placeholder="DD / MM / YYYY" />
      </View>
      <View style={{ gap: space.xs }}>
        {label(t('onboarding.time_q'))}
        {noTime ? null : <PickerField mode="time" value={time} onChange={setTime} placeholder="--:--" />}
        <Checkbox checked={noTime} onChange={setNoTime} label={t('onboarding.time_unknown')}>
          <T v="small">{t('onboarding.time_unknown')}</T>
        </Checkbox>
      </View>
      <View style={{ gap: space.xs }}>
        {label(t('onboarding.place_q'))}
        <PlaceSearch value={place} onSelect={setPlace} />
      </View>
      {error ? <T color={c.danger}>{error}</T> : null}
      <Button title={submitLabel} onPress={submit} loading={busy} disabled={!ready} />
    </View>
  );
}
