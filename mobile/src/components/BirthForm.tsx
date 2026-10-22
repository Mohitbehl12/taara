import React, { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTranslation } from 'react-i18next';
import { space, useTheme } from '@/lib/theme';
import { Button, Chip, Field, T } from './ui';
import { PlaceSearch, type Place } from './PlaceSearch';
import { errorMessage } from '@/lib/errors';

export interface BirthValues {
  name: string; date: Date | null; time: Date | null; timeAccuracy: 'exact' | 'approx' | 'unknown'; place: Place | null;
}

const pad = (n: number) => String(n).padStart(2, '0');
export const toPayload = (v: BirthValues) => ({
  name: v.name.trim(),
  date: `${v.date!.getFullYear()}-${pad(v.date!.getMonth() + 1)}-${pad(v.date!.getDate())}`,
  time: v.timeAccuracy === 'unknown' || !v.time ? null : `${pad(v.time.getHours())}:${pad(v.time.getMinutes())}`,
  timeAccuracy: v.timeAccuracy,
  placeName: v.place!.label, lat: v.place!.lat, lon: v.place!.lon,
});

/** Date or time picker that renders inline on iOS and as a tap-to-open dialog on Android. */
export function PickerField({ mode, value, onChange, placeholder }: { mode: 'date' | 'time'; value: Date | null; onChange: (d: Date) => void; placeholder: string }) {
  const { c, dark } = useTheme();
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const fallback = mode === 'date' ? new Date(1995, 0, 1) : new Date(2000, 0, 1, 6, 0);
  const label = value
    ? mode === 'date' ? value.toLocaleDateString(i18n.language, { day: 'numeric', month: 'long', year: 'numeric' })
      : value.toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' })
    : placeholder;
  if (Platform.OS === 'web') {
    // The native picker library has no web version: use the browser's own date/time input.
    const pad = (n: number) => String(n).padStart(2, '0');
    const v = value
      ? mode === 'date' ? `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}` : `${pad(value.getHours())}:${pad(value.getMinutes())}`
      : '';
    const today = new Date();
    return React.createElement('input', {
      type: mode, value: v, 'aria-label': placeholder,
      max: mode === 'date' ? `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}` : undefined,
      min: mode === 'date' ? '1900-01-01' : undefined,
      onChange: (e: { target: { value: string } }) => {
        const s = e.target.value;
        if (!s) return;
        if (mode === 'date') { const [y, m, d] = s.split('-').map(Number); if (y >= 1900) onChange(new Date(y, m - 1, d)); }
        else { const [h, mi] = s.split(':').map(Number); onChange(new Date(2000, 0, 1, h, mi)); }
      },
      style: {
        minHeight: 56, borderRadius: 12, border: `1px solid ${c.line}`, background: c.surface, color: c.ink, padding: '0 16px',
        fontSize: 20, fontFamily: 'inherit', width: '100%', boxSizing: 'border-box', colorScheme: dark ? 'dark' : 'light',
      },
    });
  }
  if (Platform.OS === 'ios') {
    return (
      <View style={{ alignItems: 'center' }}>
        <DateTimePicker value={value ?? fallback} mode={mode} display="spinner" maximumDate={mode === 'date' ? new Date() : undefined}
          minimumDate={mode === 'date' ? new Date(1900, 0, 1) : undefined} themeVariant={dark ? 'dark' : 'light'} locale={i18n.language}
          onChange={(_, d) => d && onChange(d)} />
      </View>
    );
  }
  return (
    <>
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button"
        style={{ minHeight: 56, borderRadius: 12, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, justifyContent: 'center', paddingHorizontal: space.m }}>
        <T v="h2" color={value ? c.ink : c.inkSoft}>{label}</T>
      </Pressable>
      {open ? (
        <DateTimePicker value={value ?? fallback} mode={mode} maximumDate={mode === 'date' ? new Date() : undefined}
          onChange={(e, d) => { setOpen(false); if (e.type === 'set' && d) onChange(d); }} />
      ) : null}
    </>
  );
}

/** Multi-step birth details form, used in onboarding and when adding another person's chart. */
export function BirthForm({ initial, onSubmit, submitLabel, extraStep, askRelation }: {
  initial?: Partial<BirthValues>; onSubmit: (v: BirthValues & { relation?: string }) => Promise<void>; submitLabel: string;
  extraStep?: React.ReactNode; askRelation?: boolean;
}) {
  const { t } = useTranslation();
  const { c } = useTheme();
  const [v, setV] = useState<BirthValues>({ name: '', date: null, time: null, timeAccuracy: 'exact', place: null, ...initial });
  const [relation, setRelation] = useState('partner');
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const total = extraStep ? 5 : 4;

  const steps = [
    {
      ok: v.name.trim().length > 0,
      body: (
        <View style={{ gap: space.l }}>
          <T v="h1">{t('onboarding.name_q')}</T>
          <Field value={v.name} onChangeText={(name) => setV({ ...v, name })} placeholder={t('onboarding.name_placeholder')} autoFocus autoCapitalize="words" />
          {askRelation ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s }}>
              {['partner', 'child', 'parent', 'sibling', 'friend', 'other'].map((r) => (
                <Chip key={r} label={t(`relations.${r}`)} selected={relation === r} onPress={() => setRelation(r)} />
              ))}
            </View>
          ) : null}
        </View>
      ),
    },
    {
      ok: !!v.date,
      body: (
        <View style={{ gap: space.l }}>
          <T v="h1">{t('onboarding.dob_q')}</T>
          <PickerField mode="date" value={v.date} onChange={(date) => setV({ ...v, date })} placeholder="DD / MM / YYYY" />
        </View>
      ),
    },
    {
      ok: v.timeAccuracy === 'unknown' || !!v.time,
      body: (
        <View style={{ gap: space.l }}>
          <T v="h1">{t('onboarding.time_q')}</T>
          <T color={c.inkSoft}>{t('onboarding.time_hint')}</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s }}>
            {(['exact', 'approx', 'unknown'] as const).map((a) => (
              <Chip key={a} label={t(`onboarding.time_${a}`)} selected={v.timeAccuracy === a} onPress={() => setV({ ...v, timeAccuracy: a })} />
            ))}
          </View>
          {v.timeAccuracy === 'unknown'
            ? <T color={c.inkSoft}>{t('onboarding.time_unknown_note')}</T>
            : <PickerField mode="time" value={v.time} onChange={(time) => setV({ ...v, time })} placeholder="--:--" />}
        </View>
      ),
    },
    {
      ok: !!v.place,
      body: (
        <View style={{ gap: space.l }}>
          <T v="h1">{t('onboarding.place_q')}</T>
          <PlaceSearch value={v.place} onSelect={(place) => setV({ ...v, place })} />
          {v.place ? <T v="small" color={c.leaf}>✓ {v.place.label} ({v.place.lat.toFixed(2)}, {v.place.lon.toFixed(2)})</T> : null}
        </View>
      ),
    },
    ...(extraStep ? [{ ok: true, body: extraStep }] : []),
  ];

  const next = async () => {
    if (step < steps.length - 1) { setStep(step + 1); return; }
    setBusy(true); setError(null);
    try { await onSubmit({ ...v, relation }); } catch (e: any) { setError(errorMessage(t, e)); setBusy(false); }
  };

  return (
    <View style={{ flex: 1, gap: space.xl }}>
      <View style={{ flexDirection: 'row', gap: 4 }} accessibilityLabel={t('onboarding.step', { n: step + 1, total })}>
        {steps.map((_, i) => <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= step ? c.marigold : c.line }} />)}
      </View>
      <View style={{ flex: 1 }}>{steps[step].body}</View>
      {error ? <T color={c.danger}>{error}</T> : null}
      <View style={{ flexDirection: 'row', gap: space.s }}>
        {step > 0 ? <Button title={t('common.back')} kind="secondary" onPress={() => setStep(step - 1)} style={{ flex: 1 }} /> : null}
        <Button title={step === steps.length - 1 ? submitLabel : t('common.continue')} onPress={next} disabled={!steps[step].ok} loading={busy} style={{ flex: 2 }} />
      </View>
    </View>
  );
}
