import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ShieldCheck, ShieldAlert } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { RiskLevel, FraudRecommendation, ClaimStatus, type Claim } from '@claims/shared';

// Gauge colors per zone (0–25 green, 25–50 yellow, 50–75 orange, 75–100 red)
const GAUGE_ZONE_COLORS = ['#22c55e', '#eab308', '#f97316', '#ef4444'];
const GAUGE_FILL_COLORS: Record<RiskLevel, string> = {
  [RiskLevel.LOW]: '#22c55e',
  [RiskLevel.MEDIUM]: '#eab308',
  [RiskLevel.HIGH]: '#f97316',
  [RiskLevel.CRITICAL]: '#ef4444',
};

function describeArc(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const toRad = (d: number) => ((d - 90) * Math.PI) / 180;
  const x1 = cx + r * Math.cos(toRad(startDeg));
  const y1 = cy + r * Math.sin(toRad(startDeg));
  const x2 = cx + r * Math.cos(toRad(endDeg));
  const y2 = cy + r * Math.sin(toRad(endDeg));
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
}

function RiskGauge({ score, riskLevel }: { score: number; riskLevel: RiskLevel }) {
  const cx = 60, cy = 60, r = 44, strokeW = 10;
  // Semicircle: -135° to +135° (270° arc) starting from bottom-left
  const startAngle = -135;
  const totalArc = 270;
  const scoreAngle = startAngle + totalArc * score;
  const scorePercent = Math.round(score * 100);

  // Four zone arcs (each 67.5° = 270/4)
  const zones = GAUGE_ZONE_COLORS.map((color, i) => ({
    color,
    start: startAngle + i * (totalArc / 4),
    end: startAngle + (i + 1) * (totalArc / 4),
  }));

  return (
    <div className="shrink-0 flex flex-col items-center">
      <svg width="120" height="84" viewBox="0 0 120 84">
        {/* Track zones */}
        {zones.map((z, i) => (
          <path
            key={i}
            d={describeArc(cx, cy, r, z.start, z.end)}
            fill="none"
            stroke={z.color}
            strokeWidth={strokeW}
            strokeLinecap="butt"
            opacity={0.18}
          />
        ))}
        {/* Filled arc */}
        {score > 0 && (
          <path
            d={describeArc(cx, cy, r, startAngle, scoreAngle)}
            fill="none"
            stroke={GAUGE_FILL_COLORS[riskLevel]}
            strokeWidth={strokeW}
            strokeLinecap="round"
          />
        )}
        {/* Score text */}
        <text x={cx} y={cy + 4} textAnchor="middle" fontSize="20" fontWeight="700" fill={GAUGE_FILL_COLORS[riskLevel]}>
          {scorePercent}
        </text>
        <text x={cx} y={cy + 17} textAnchor="middle" fontSize="9" fill="#94a3b8">
          / 100
        </text>
      </svg>
    </div>
  );
}

const RISK_CONFIG: Record<RiskLevel, { color: string; bg: string; label: string }> = {
  [RiskLevel.LOW]: { color: 'text-green-700', bg: 'bg-green-50 border-green-200', label: 'Low Risk' },
  [RiskLevel.MEDIUM]: { color: 'text-yellow-700', bg: 'bg-yellow-50 border-yellow-200', label: 'Medium Risk' },
  [RiskLevel.HIGH]: { color: 'text-orange-700', bg: 'bg-orange-50 border-orange-200', label: 'High Risk' },
  [RiskLevel.CRITICAL]: { color: 'text-red-700', bg: 'bg-red-50 border-red-200', label: 'Critical Risk' },
};

export function FraudTab({ claim }: { claim: Claim }) {
  const queryClient = useQueryClient();
  const fraud = claim.fraudAnalysis;

  const escalate = useMutation({
    mutationFn: () => api.post(`/api/claims/${claim.id}/escalate`, { reason: 'Fraud risk escalation' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['claims', claim.id] }),
  });

  if (!fraud) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground p-8">
        Fraud analysis not yet available. Upload documents to trigger AI processing.
      </div>
    );
  }

  const config = RISK_CONFIG[fraud.riskLevel];

  return (
    <div className="p-8 max-w-2xl space-y-6">
      {/* Risk score card */}
      <div className={cn('rounded-xl border p-6', config.bg)}>
        <div className="flex items-center gap-6">
          {/* Semicircular gauge */}
          <RiskGauge score={fraud.riskScore} riskLevel={fraud.riskLevel} />

          <div className="flex-1 space-y-3">
            <div className="flex items-center gap-2">
              {fraud.riskLevel === RiskLevel.LOW ? (
                <ShieldCheck className={cn('h-5 w-5', config.color)} />
              ) : (
                <ShieldAlert className={cn('h-5 w-5', config.color)} />
              )}
              <span className={cn('font-semibold', config.color)}>{config.label}</span>
            </div>

            <p className={cn('text-sm font-medium', config.color)}>
              Recommendation:{' '}
              {fraud.recommendation === FraudRecommendation.APPROVE && 'Proceed with standard adjudication'}
              {fraud.recommendation === FraudRecommendation.FLAG_FOR_REVIEW && 'Flag for additional review before approval'}
              {fraud.recommendation === FraudRecommendation.ESCALATE_SIU && 'Escalate to Special Investigations Unit'}
            </p>
          </div>
        </div>
      </div>

      {/* Signals */}
      {Array.isArray(fraud.signals) && fraud.signals.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-semibold text-sm">Contributing Signals</h2>
          <div className="space-y-2">
            {(fraud.signals as Array<{ factor: string; weight: number; description: string }>).map((signal, i) => (
              <div key={i} className="flex items-start gap-3 rounded-lg border bg-card p-4">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-yellow-500" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium capitalize">{signal.factor.replace(/_/g, ' ')}</span>
                    <span className="text-xs text-muted-foreground">
                      weight: {Math.round(signal.weight * 100)}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">{signal.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      {fraud.recommendation === FraudRecommendation.ESCALATE_SIU &&
       ![ClaimStatus.APPROVED, ClaimStatus.DENIED, ClaimStatus.PAID, ClaimStatus.CLOSED].includes(claim.status) && (
        <button
          onClick={() => escalate.mutate()}
          disabled={escalate.isPending}
          className="flex items-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
        >
          <ShieldAlert className="h-4 w-4" />
          {escalate.isPending ? 'Escalating...' : 'Escalate to SIU'}
        </button>
      )}
    </div>
  );
}
