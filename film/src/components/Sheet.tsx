import React from 'react';
import { C, FONT } from '../theme';

/** Synthetic sheet in drawing units. Geometry follows the showcase scene's synthetic plan. */
export const SHEET_W = 1416;
export const SHEET_H = 984;

export type Layer = 'arch' | 'mech' | 'plumb' | 'elec';

type Tone = 'color' | 'ghost';

interface LayerProps {
  /** 0 → nothing drawn, 1 → fully drawn. Lines draw first, symbols and labels resolve after. */
  draw?: number;
  tone?: Tone;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const strokeFor = (draw: number) => ({ pathLength: 1, strokeDasharray: 1, strokeDashoffset: 1 - clamp01(draw) });
const symbolsFor = (draw: number) => clamp01((draw - 0.55) / 0.45);

const COLS: [number, string][] = [[156, 'A'], [338, 'B'], [520, 'C'], [665, 'D'], [810, 'E'], [965, 'F'], [1108, 'G']];
const ROWS: [number, string][] = [[170, '1'], [310, '2'], [448, '3'], [580, '4'], [710, '5']];

const WALLS = [
  'M156 170 H1108 V710 H662', 'M520 710 H156 V170',
  'M520 170 V345', 'M520 448 V710', 'M810 170 V300', 'M810 410 V710',
  'M520 448 H810', 'M900 448 H1108', 'M278 448 H520',
];

export function ArchLayer({ draw = 1, tone = 'color' }: LayerProps) {
  const line = tone === 'ghost' ? C.ghost : C.linework;
  const faint = tone === 'ghost' ? C.ghost : C.lineworkFaint;
  const sym = symbolsFor(draw);
  return (
    <g fill="none" strokeLinecap="square">
      {/* Sheet border */}
      <rect x={47} y={48} width={SHEET_W - 94} height={SHEET_H - 96} stroke={line} strokeWidth={2.4} />
      <rect x={67} y={68} width={SHEET_W - 134} height={SHEET_H - 136} stroke={line} strokeWidth={1.2} />
      {/* Column grid */}
      {COLS.map(([x]) => <path key={`c${x}`} d={`M${x} 122 V760`} stroke={faint} strokeWidth={1} strokeDasharray="14 8 3 8" opacity={sym} />)}
      {ROWS.map(([y]) => <path key={`r${y}`} d={`M122 ${y} H1150`} stroke={faint} strokeWidth={1} strokeDasharray="14 8 3 8" opacity={sym} />)}
      <g opacity={sym} fontFamily={FONT.mono} fontSize={15} fill={faint} stroke="none" textAnchor="middle">
        {COLS.map(([x, l]) => <g key={`cb${x}`}><circle cx={x} cy={104} r={15} fill="none" stroke={faint} strokeWidth={1.2} /><text x={x} y={109}>{l}</text></g>)}
        {ROWS.map(([y, l]) => <g key={`rb${y}`}><circle cx={104} cy={y} r={15} fill="none" stroke={faint} strokeWidth={1.2} /><text x={104} y={y + 5}>{l}</text></g>)}
      </g>
      {/* Double-line walls */}
      {WALLS.map((d) => <path key={d} d={d} stroke={line} strokeWidth={9} {...strokeFor(draw)} />)}
      {WALLS.map((d) => <path key={`i${d}`} d={d} stroke={C.paperLight} strokeWidth={5} {...strokeFor(draw)} />)}
      {/* Doors, fixtures */}
      <g stroke={faint} strokeWidth={1.4} opacity={sym}>
        <path d="M520 448 m-78 0 a78 78 0 0 1 78 -78" />
        <path d="M810 410 m0 -70 a70 70 0 0 1 70 70" />
        <rect x={208} y={504} width={118} height={104} /><rect x={225} y={520} width={84} height={72} />
        <rect x={954} y={517} width={94} height={114} /><rect x={972} y={535} width={58} height={76} />
      </g>
      {/* Room names */}
      <g opacity={sym} fontFamily={FONT.mono} fontSize={19} fill={faint} stroke="none" letterSpacing={1.5}>
        <text x={204} y={232}>MECHANICAL</text><text x={572} y={232}>OPEN OFFICE</text>
        <text x={884} y={232}>SERVICE</text><text x={582} y={672}>CORRIDOR</text>
      </g>
      {/* Title block */}
      <g opacity={sym}>
        <rect x={67} y={798} width={SHEET_W - 134} height={105} stroke={line} strokeWidth={1.3} />
        <path d="M790 798 V903 M1040 798 V903" stroke={line} strokeWidth={1.3} />
        <g fontFamily={FONT.mono} stroke="none" fill={tone === 'ghost' ? C.ghost : C.ink}>
          <text x={88} y={834} fontSize={20} letterSpacing={2}>SYNTHETIC PLAN · LEVEL 02</text>
          <text x={88} y={866} fontSize={15} fill={faint} letterSpacing={1}>CONCEPT SHEET · NOT TO SCALE · ILLUSTRATIVE ONLY</text>
          <text x={812} y={834} fontSize={15} fill={faint}>MEP COORDINATION</text>
          <text x={812} y={866} fontSize={15} fill={faint}>ISSUED FOR REVIEW</text>
          <text x={1062} y={850} fontSize={30} letterSpacing={2}>M—201</text>
        </g>
      </g>
    </g>
  );
}

export const SUPPLY_MAIN = 'M240 390 H440 V330 H720 V398 H1000';
const SUPPLY_BRANCHES = ['M440 390 V550', 'M720 398 V570', 'M880 398 V535'];
const DIFFUSERS: [number, number][] = [[440, 560], [720, 580], [880, 545], [300, 300], [380, 600], [640, 260], [960, 280], [1040, 600], [620, 560]];

export function MechLayer({ draw = 1, tone = 'color', highlightMain = false }: LayerProps & { highlightMain?: boolean }) {
  const col = tone === 'ghost' ? C.ghost : C.supply;
  const mainCol = highlightMain ? C.supply : col;
  const sym = symbolsFor(draw);
  return (
    <g fill="none" strokeLinejoin="miter" strokeLinecap="butt">
      {/* Double-line duct: outer stroke in trade colour, inner knocked out to paper */}
      <path d={SUPPLY_MAIN} stroke={mainCol} strokeWidth={26} {...strokeFor(draw)} />
      <path d={SUPPLY_MAIN} stroke={C.paperLight} strokeWidth={21} {...strokeFor(draw)} />
      {SUPPLY_BRANCHES.map((d) => <path key={d} d={d} stroke={col} strokeWidth={15} {...strokeFor(draw)} />)}
      {SUPPLY_BRANCHES.map((d) => <path key={`i${d}`} d={d} stroke={C.paperLight} strokeWidth={11} {...strokeFor(draw)} />)}
      <path d={SUPPLY_MAIN} stroke={mainCol} strokeWidth={1.4} strokeDasharray="12 10" opacity={sym} />
      <g opacity={sym} stroke={col} strokeWidth={2.4}>
        {DIFFUSERS.map(([x, y]) => (
          <g key={`${x}-${y}`}><rect x={x - 22} y={y - 22} width={44} height={44} fill={C.paperLight} /><path d={`M${x - 22} ${y - 22} L${x + 22} ${y + 22} M${x + 22} ${y - 22} L${x - 22} ${y + 22}`} strokeWidth={1.2} /></g>
        ))}
        {[[440, 390], [720, 398]].map(([x, y]) => <rect key={`v${x}`} x={x - 34} y={y - 26} width={68} height={52} fill={C.paperLight} />)}
      </g>
      <g opacity={sym} fontFamily={FONT.mono} fill={col} stroke="none" fontSize={15} textAnchor="middle">
        <text x={440} y={395}>VAV—02</text><text x={720} y={403}>VAV—03</text>
        <text x={580} y={312} textAnchor="middle" letterSpacing={1.5}>SA / SUPPLY</text>
        <text x={290} y={370} letterSpacing={1}>D—04</text>
      </g>
    </g>
  );
}

const PLUMB_MAIN = 'M240 625 H380 V575 H590 V618 H956 V540';
export function PlumbLayer({ draw = 1, tone = 'color' }: LayerProps) {
  const col = tone === 'ghost' ? C.ghost : C.plumbing;
  const sym = symbolsFor(draw);
  return (
    <g fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d={PLUMB_MAIN} stroke={col} strokeWidth={5} {...strokeFor(draw)} />
      <path d="M380 575 V500 M590 618 V680 M956 540 V480" stroke={col} strokeWidth={3} {...strokeFor(draw)} />
      <g opacity={sym} stroke={col} strokeWidth={2.4} fill={C.paperLight}>
        {[[380, 575], [590, 618], [956, 618], [380, 500], [956, 480]].map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r={9} />)}
      </g>
      <text opacity={sym} x={612} y={600} fontFamily={FONT.mono} fontSize={15} fill={col} letterSpacing={1}>CW / P—02</text>
    </g>
  );
}

const ELEC_RUN = 'M260 270 H360 V520 H620 V660 H918';
const LIGHTS: [number, number][] = [];
for (const x of [600, 680, 760]) for (const y of [280, 360]) LIGHTS.push([x, y]);
for (const x of [880, 960, 1040]) for (const y of [300, 380]) LIGHTS.push([x, y]);
for (const x of [220, 300, 420]) LIGHTS.push([x, 240]);

export function ElecLayer({ draw = 1, tone = 'color' }: LayerProps) {
  const col = tone === 'ghost' ? C.ghost : C.electrical;
  const sym = symbolsFor(draw);
  return (
    <g fill="none" strokeLinecap="square">
      <path d={ELEC_RUN} stroke={col} strokeWidth={3} {...strokeFor(draw)} />
      <path d="M845 660 V704 M360 340 H300" stroke={col} strokeWidth={3} {...strokeFor(draw)} />
      <g opacity={sym} stroke={col} strokeWidth={1.8} fill={C.paperLight}>
        {LIGHTS.map(([x, y]) => <g key={`${x}-${y}`}><rect x={x - 24} y={y - 12} width={48} height={24} /><path d={`M${x - 24} ${y} H${x + 24}`} strokeWidth={1} /></g>)}
        {[[360, 270], [360, 520], [620, 520], [620, 660], [845, 660]].map(([x, y]) => <rect key={`j${x}-${y}`} x={x - 8} y={y - 8} width={16} height={16} />)}
      </g>
      <text opacity={sym} x={648} y={648} fontFamily={FONT.mono} fontSize={15} fill={col} letterSpacing={1}>E—12</text>
    </g>
  );
}

/** Whole sheet in one SVG. `draws` controls each layer independently. */
export function Sheet({
  draws = { arch: 1, mech: 1, plumb: 1, elec: 1 },
  tone = 'color',
  highlightMain = false,
  paper = true,
  style,
}: {
  draws?: Partial<Record<Layer, number>>;
  tone?: Tone;
  highlightMain?: boolean;
  paper?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <svg width={SHEET_W} height={SHEET_H} viewBox={`0 0 ${SHEET_W} ${SHEET_H}`} style={{ overflow: 'visible', ...style }}>
      {paper && <rect width={SHEET_W} height={SHEET_H} fill={C.paperLight} />}
      <ArchLayer draw={draws.arch ?? 1} tone={tone} />
      <PlumbLayer draw={draws.plumb ?? 1} tone={tone} />
      <ElecLayer draw={draws.elec ?? 1} tone={tone} />
      <MechLayer draw={draws.mech ?? 1} tone={tone} highlightMain={highlightMain} />
    </svg>
  );
}
