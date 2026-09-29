import { healthColor } from "@/utils/status";

/** Radial gauge for a 0-100 structural health score. */
export function HealthGauge({ score, size = 112, label = "Health score" }: { score: number | null | undefined; size?: number; label?: string }) {
  const stroke = Math.max(6, size / 14);
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const arc = circumference * 0.75;
  const value = score === null || score === undefined ? 0 : Math.max(0, Math.min(100, score));
  const color = healthColor(score);
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }} role="img" aria-label={`${label}: ${score === null || score === undefined ? "not available" : Math.round(value)} out of 100`}>
      <svg width={size} height={size} className="-rotate-[225deg]" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#1e2a3f" strokeWidth={stroke} strokeDasharray={`${arc} ${circumference}`} strokeLinecap="round" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={`${(arc * value) / 100} ${circumference}`}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.8s cubic-bezier(0.16,1,0.3,1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-semibold tracking-tight text-ink" style={{ fontSize: size * 0.27 }}>
          {score === null || score === undefined ? "—" : Math.round(value)}
        </span>
        <span className="text-[10px] text-ink-3">/ 100</span>
      </div>
    </div>
  );
}
