import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle, XCircle } from 'lucide-react';
import { ApproveClaimSchema, ApproveClaimInput, DenyClaimSchema, DenyClaimInput, type Claim } from '@claims/shared';
import { api } from '@/lib/api';
import { formatCurrency, formatConfidence, confidenceColor, cn } from '@/lib/utils';

export function SettlementTab({ claim }: { claim: Claim }) {
  const queryClient = useQueryClient();
  const settlement = claim.settlementRecommendation;
  const [showDenyForm, setShowDenyForm] = useState(false);

  const approveForm = useForm<ApproveClaimInput>({
    resolver: zodResolver(ApproveClaimSchema),
    defaultValues: { amount: settlement?.recommendedAmount ?? 0 },
  });

  const denyForm = useForm<DenyClaimInput>({ resolver: zodResolver(DenyClaimSchema) });

  const approveMutation = useMutation({
    mutationFn: (data: ApproveClaimInput) => api.post(`/api/claims/${claim.id}/approve`, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['claims', claim.id] }),
  });

  const denyMutation = useMutation({
    mutationFn: (data: DenyClaimInput) => api.post(`/api/claims/${claim.id}/deny`, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['claims', claim.id] }),
  });

  if (!settlement) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground p-8">
        Settlement recommendation not yet available. AI analysis must complete first.
      </div>
    );
  }

  const range = settlement.rangeHigh - settlement.rangeLow;
  const recommendedPosition = range > 0
    ? ((settlement.recommendedAmount - settlement.rangeLow) / range) * 100
    : 50;

  return (
    <div className="p-8 max-w-2xl space-y-6">
      {/* Recommended amount */}
      <div className="rounded-xl border bg-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">AI Recommended Settlement</p>
          <span className={cn('text-sm font-medium', confidenceColor(settlement.confidence))}>
            {formatConfidence(settlement.confidence)} confidence
          </span>
        </div>
        <p className="text-4xl font-bold">{formatCurrency(settlement.recommendedAmount)}</p>

        {/* Range visualization */}
        <div className="space-y-1.5">
          <div className="relative h-2 w-full rounded-full bg-muted">
            <div
              className="absolute top-0 h-full rounded-full bg-primary/20"
              style={{ left: '0%', width: '100%' }}
            />
            <div
              className="absolute top-1/2 h-4 w-1 -translate-y-1/2 rounded bg-primary"
              style={{ left: `${recommendedPosition}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{formatCurrency(settlement.rangeLow)}</span>
            <span className="text-primary font-medium">Recommended</span>
            <span>{formatCurrency(settlement.rangeHigh)}</span>
          </div>
        </div>

        <div className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
          <p className="font-medium text-foreground mb-1">Methodology</p>
          <p>{settlement.methodology}</p>
          {settlement.comparableCount > 0 && (
            <p className="mt-1 text-xs">Based on {settlement.comparableCount} comparable claims</p>
          )}
        </div>
      </div>

      {/* Adjuster decision */}
      {settlement.adjusterDecision ? (
        <div className="rounded-xl border bg-green-50 border-green-200 p-5 space-y-2">
          <p className="text-sm font-semibold text-green-700">Settlement Approved</p>
          <p className="text-2xl font-bold text-green-700">{formatCurrency(settlement.adjusterDecision)}</p>
          {settlement.adjusterRationale && (
            <p className="text-sm text-muted-foreground">{settlement.adjusterRationale}</p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {!showDenyForm ? (
            <form
              onSubmit={approveForm.handleSubmit((d) => approveMutation.mutate(d))}
              className="space-y-4"
            >
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Settlement Amount</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  {...approveForm.register('amount', { valueAsNumber: true })}
                />
                {approveForm.formState.errors.amount && (
                  <p className="text-xs text-destructive">{approveForm.formState.errors.amount.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Notes (optional)</label>
                <textarea
                  rows={2}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                  {...approveForm.register('notes')}
                />
              </div>
              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={approveMutation.isPending}
                  className="flex items-center gap-2 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  <CheckCircle className="h-4 w-4" />
                  {approveMutation.isPending ? 'Approving...' : 'Approve Settlement'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowDenyForm(true)}
                  className="flex items-center gap-2 rounded-md border px-4 py-2 text-sm hover:bg-muted transition-colors text-destructive"
                >
                  <XCircle className="h-4 w-4" />
                  Deny Claim
                </button>
              </div>
            </form>
          ) : (
            <form
              onSubmit={denyForm.handleSubmit((d) => denyMutation.mutate(d))}
              className="space-y-4 rounded-xl border border-destructive/30 bg-red-50 p-4"
            >
              <p className="text-sm font-medium text-red-700">Deny Claim</p>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Denial Reason</label>
                <textarea
                  rows={3}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                  placeholder="Provide a clear reason for denial..."
                  {...denyForm.register('reason')}
                />
                {denyForm.formState.errors.reason && (
                  <p className="text-xs text-destructive">{denyForm.formState.errors.reason.message}</p>
                )}
              </div>
              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={denyMutation.isPending}
                  className="rounded-md bg-destructive px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {denyMutation.isPending ? 'Denying...' : 'Confirm Denial'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowDenyForm(false)}
                  className="rounded-md border px-4 py-2 text-sm hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
