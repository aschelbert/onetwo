import { DIMENSIONS, bandFor, radarAxisEnd, radarPoints } from '../score/stewardship';

export interface StewardshipRadarProps {
  /** Per-dimension percentages (0..100) in DIMENSIONS order. */
  you: number[];
  total: number;
  /** Building average per dimension, same order; omit to hide the red line. */
  buildingAvg?: number[];
  buildingTotal?: number;
  /** Month-over-month change for the "+2 this month" line. */
  delta?: number;
  /** "you" | a first name for a third-party card. */
  who?: string;
  compact?: boolean;
  /** Only the chart and the building-average line, for a card that draws its own frame. */
  bare?: boolean;
  /** What the red line is compared with; "Building avg" unless told otherwise. */
  compareLabel?: string;
}

/**
 * The one fixed stewardship widget: navy background, aqua line for the
 * person, red line for the building average. Same everywhere it appears.
 */
export function StewardshipRadar({ you, total, buildingAvg, buildingTotal, delta, who = 'you', compact, bare, compareLabel = 'Building avg' }: StewardshipRadarProps) {
  const band = bandFor(total);
  const maxWidth = compact ? 280 : 360;
  const label = (i: number) => {
    const end = radarAxisEnd(i, 5, 150, 150, 126);
    const anchor = Math.abs(end.x - 150) < 1 ? 'middle' : end.x < 150 ? 'end' : 'start';
    return { x: end.x, y: end.y + (end.y < 150 ? -6 : 14), anchor };
  };
  const chart = (
    <>
      <div className="flex justify-center">
      <svg
        viewBox="-60 0 420 276"
        role="img"
        aria-label={`Stewardship radar: ${who} ${total}${buildingTotal !== undefined ? `, ${compareLabel.toLowerCase()} ${buildingTotal}` : ''}. ${DIMENSIONS.map((d, i) => `${d} ${you[i] ?? 0}`).join(', ')}`}
        style={{ display: 'block', width: '100%', maxWidth, height: 'auto' }}
      >
        <polygon points={radarPoints([100, 100, 100, 100, 100])} fill="none" stroke="rgba(255,255,255,0.09)" strokeWidth="0.8" />
        <polygon points={radarPoints([66, 66, 66, 66, 66])} fill="none" stroke="rgba(255,255,255,0.09)" strokeWidth="0.6" />
        <polygon points={radarPoints([33, 33, 33, 33, 33])} fill="none" stroke="rgba(255,255,255,0.09)" strokeWidth="0.6" />
        {buildingAvg && <polygon points={radarPoints(buildingAvg)} fill="none" stroke="#D62839" strokeWidth="1.2" strokeLinejoin="round" />}
        <polygon points={radarPoints(you)} fill="rgba(165,243,252,0.07)" stroke="#A5F3FC" strokeWidth="1.5" strokeLinejoin="round" />
        <text x="150" y="161" textAnchor="middle" fontFamily="DM Sans, sans-serif" fontWeight="700" fontSize="60" fill="#fff" letterSpacing="-2.5">{total}</text>
        {DIMENSIONS.map((d, i) => {
          const p = label(i);
          return (
            <text key={d} x={p.x} y={p.y} textAnchor={p.anchor as 'start' | 'middle' | 'end'} fontFamily="DM Sans, sans-serif" fontWeight="500" fontSize="11" fill="rgba(255,255,255,0.55)">
              {d} <tspan fontWeight="700" fill="#fff">{you[i] ?? 0}</tspan>
            </text>
          );
        })}
      </svg>
    </div>
    <div className="flex items-center justify-between text-[11px] text-white/[0.5]">
      {buildingTotal !== undefined ? (
        <span>
          <span className="mr-1.5 inline-block h-0.5 w-3 rounded-sm bg-[#D62839] align-middle" />
          {compareLabel} <b className="font-semibold text-white">{buildingTotal}</b>
        </span>
      ) : <span />}
      {delta !== undefined && <span className="font-semibold text-ux2-cyan">{delta >= 0 ? '+' : ''}{delta} this month</span>}
    </div>
    </>
  );
  if (bare) return chart;
  return (
    <div data-widget="stewardship-radar" className="flex flex-col gap-2 rounded-[22px] bg-ux2-navy px-[18px] pb-3 pt-4 text-white">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[2px]">Stewardship</div>
          <div className="mt-0.5 text-[13px] font-medium text-white/[0.55]">{band}</div>
        </div>
        <span className="inline-flex items-center rounded-full bg-[rgba(165,243,252,.16)] px-[11px] py-[6px] text-xs font-semibold leading-none text-ux2-cyan">{total >= 70 ? '✓ Good standing' : `${total} of 100`}</span>
      </div>
      {chart}
    </div>
  );
}

export default StewardshipRadar;
