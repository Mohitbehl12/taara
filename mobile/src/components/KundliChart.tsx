import React from 'react';
import Svg, { G, Line, Polygon, Rect, Text as SvgText } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { planetAbbr as abbr } from '@/lib/explain';

export interface ChartPlanet { planet: string; sign: number; house: number; retrograde?: boolean }

interface Props {
  planets: ChartPlanet[];
  referenceSign: number;          // Lagna sign (or Moon sign when time unknown)
  style?: 'north' | 'south';
  size: number;
  line: string;                   // stroke colour
  ink: string;                    // planet text
  muted: string;                  // sign numbers
  accent?: string;                // Lagna highlight
  background?: string;
}

// Text anchor points for the 12 houses of a North Indian chart, as fractions of the size (house 1 at top centre).
const NORTH: [number, number][] = [
  [0.5, 0.27], [0.25, 0.12], [0.12, 0.27], [0.27, 0.5], [0.12, 0.73], [0.25, 0.88],
  [0.5, 0.73], [0.75, 0.88], [0.88, 0.73], [0.73, 0.5], [0.88, 0.27], [0.75, 0.12],
];
// Where the sign number sits in each house (towards the centre).
const NORTH_NUM: [number, number][] = [
  [0.5, 0.44], [0.25, 0.04], [0.04, 0.25], [0.44, 0.5], [0.04, 0.75], [0.25, 0.97],
  [0.5, 0.58], [0.75, 0.97], [0.96, 0.75], [0.56, 0.5], [0.96, 0.25], [0.75, 0.04],
];
// South Indian: fixed sign cells on a 4×4 grid (col, row). Index = sign (0 = Aries).
const SOUTH: [number, number][] = [
  [1, 0], [2, 0], [3, 0], [3, 1], [3, 2], [3, 3], [2, 3], [1, 3], [0, 3], [0, 2], [0, 1], [0, 0],
];


export function KundliChart({ planets, referenceSign, style = 'north', size, line, ink, muted, accent, background }: Props) {
  const { t } = useTranslation();
  const S = size;
  const sw = Math.max(1, S / 220);
  const fs = Math.max(10, S / 22);
  const label = (p: ChartPlanet) => `${abbr(t(`planets.${p.planet}`))}${p.retrograde && p.planet !== 'Rahu' && p.planet !== 'Ketu' ? '(R)' : ''}`;

  if (style === 'south') {
    const cell = S / 4;
    return (
      <Svg width={S} height={S} accessibilityLabel="South Indian birth chart">
        {background ? <Rect x={0} y={0} width={S} height={S} fill={background} rx={12} /> : null}
        {SOUTH.map(([col, row], sign) => {
          const inSign = planets.filter((p) => p.sign === sign);
          const isRef = sign === referenceSign;
          return (
            <G key={sign}>
              <Rect x={col * cell} y={row * cell} width={cell} height={cell} fill="none" stroke={line} strokeWidth={sw} />
              {isRef ? <Line x1={col * cell} y1={row * cell + cell * 0.28} x2={col * cell + cell * 0.28} y2={row * cell} stroke={accent ?? line} strokeWidth={sw * 2} /> : null}
              <SvgText x={col * cell + cell - 6} y={row * cell + fs} fontSize={fs * 0.75} fill={muted} textAnchor="end">{sign + 1}</SvgText>
              {inSign.map((p, i) => (
                <SvgText key={p.planet} x={col * cell + cell / 2} y={row * cell + cell * 0.42 + i * fs * 1.05} fontSize={fs} fill={ink} textAnchor="middle" fontWeight="600">{label(p)}</SvgText>
              ))}
            </G>
          );
        })}
        <Rect x={cell} y={cell} width={cell * 2} height={cell * 2} fill={background ?? 'none'} stroke={line} strokeWidth={sw} />
      </Svg>
    );
  }

  const m = S / 2;
  return (
    <Svg width={S} height={S} accessibilityLabel="North Indian birth chart">
      {background ? <Rect x={0} y={0} width={S} height={S} fill={background} rx={12} /> : null}
      <Rect x={sw / 2} y={sw / 2} width={S - sw} height={S - sw} fill="none" stroke={line} strokeWidth={sw} />
      <Line x1={0} y1={0} x2={S} y2={S} stroke={line} strokeWidth={sw} />
      <Line x1={S} y1={0} x2={0} y2={S} stroke={line} strokeWidth={sw} />
      <Polygon points={`${m},0 ${S},${m} ${m},${S} 0,${m}`} fill="none" stroke={line} strokeWidth={sw} />
      {accent ? <Polygon points={`${m},${sw * 3} ${S * 0.75 - sw * 2},${S * 0.25} ${m},${m - sw * 3} ${S * 0.25 + sw * 2},${S * 0.25}`} fill={accent} opacity={0.2} /> : null}
      {NORTH.map(([fx, fy], i) => {
        const house = i + 1;
        const sign = (referenceSign + i) % 12;
        const inHouse = planets.filter((p) => p.house === house);
        const [nx, ny] = NORTH_NUM[i];
        const small = [2, 3, 5, 6, 8, 9, 11, 12].includes(house);
        const perRow = small ? 2 : 3;
        return (
          <G key={house}>
            <SvgText x={nx * S} y={ny * S + fs * 0.3} fontSize={fs * 0.75} fill={muted} textAnchor="middle">{sign + 1}</SvgText>
            {inHouse.map((p, k) => {
              const row = Math.floor(k / perRow), col = k % perRow;
              const n = Math.min(perRow, inHouse.length - row * perRow);
              const x = fx * S + (col - (n - 1) / 2) * fs * 1.6;
              const y = fy * S + row * fs * 1.15 - (Math.ceil(inHouse.length / perRow) - 1) * fs * 0.55 + fs * 0.35;
              return <SvgText key={p.planet} x={x} y={y} fontSize={fs} fill={ink} textAnchor="middle" fontWeight="600">{label(p)}</SvgText>;
            })}
          </G>
        );
      })}
    </Svg>
  );
}
