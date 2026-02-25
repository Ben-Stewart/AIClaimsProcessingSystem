import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ShieldCheck, ShieldAlert } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { RiskLevel, FraudRecommendation, ClaimStatus, type Claim } from '@claims/shared';

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
  const scorePercent = Math.round(fraud.riskScore * 100);

  return (
    <div className="p-8 max-w-2xl space-y-6">
      {/* Risk score card */}
      <div className={cn('rounded-xl border p-6 space-y-4', config.bg)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {fraud.riskLevel === RiskLevel.LOW ? (
              <ShieldCheck className={cn('h-5 w-5', config.color)} />
            ) : (
              <ShieldAlert className={cn('h-5 w-5', config.color)} />
            )}
            <span className={cn('font-semibold', config.color)}>{config.label}</span>
          </div>
          <span className={cn('text-3xl font-bold', config.color)}>{scorePercent}</span>
        </div>

        {/* Score bar */}
        <div className="h-2 w-full rounded-full bg-white/60">
          <div
            className={cn('h-full rounded-full transition-all', {
              'bg-green-500': fraud.riskLevel === RiskLevel.LOW,
              'bg-yellow-500': fraud.riskLevel === RiskLevel.MEDIUM,
              'bg-orange-500': fraud.riskLevel === RiskLevel.HIGH,
              'bg-red-500': fraud.riskLevel === RiskLevel.CRITICAL,
            })}
            style={{ width: `${scorePercent}%` }}
          />
        </div>

        <p className={cn('text-sm font-medium', config.color)}>
          Recommendation:{' '}
          {fraud.recommendation === FraudRecommendation.APPROVE && 'Proceed with standard adjudication'}
          {fraud.recommendation === FraudRecommendation.FLAG_FOR_REVIEW && 'Flag for additional review before approval'}
          {fraud.recommendation === FraudRecommendation.ESCALATE_SIU && 'Escalate to Special Investigations Unit'}
        </p>
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
