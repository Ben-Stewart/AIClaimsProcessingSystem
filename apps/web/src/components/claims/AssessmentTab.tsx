import { formatCurrency, formatConfidence, confidenceColor, cn } from '@/lib/utils';
import { DamageSeverity, type Claim } from '@claims/shared';

const SEVERITY_CONFIG: Record<DamageSeverity, { color: string; bg: string }> = {
  [DamageSeverity.MINOR]: { color: 'text-green-700', bg: 'bg-green-50' },
  [DamageSeverity.MODERATE]: { color: 'text-yellow-700', bg: 'bg-yellow-50' },
  [DamageSeverity.SEVERE]: { color: 'text-orange-700', bg: 'bg-orange-50' },
  [DamageSeverity.TOTAL_LOSS]: { color: 'text-red-700', bg: 'bg-red-50' },
};

export function AssessmentTab({ claim }: { claim: Claim }) {
  const assessment = claim.aiAssessment;

  if (!assessment) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground p-8">
        AI assessment not yet available. Upload documents to trigger AI processing.
      </div>
    );
  }

  const severityConfig = SEVERITY_CONFIG[assessment.damageSeverity];

  return (
    <div className="p-8 max-w-2xl space-y-6">
      {/* Severity + confidence */}
      <div className="grid grid-cols-2 gap-4">
        <div className={cn('rounded-xl border p-5 space-y-1', severityConfig.bg)}>
          <p className="text-xs text-muted-foreground">Damage Severity</p>
          <p className={cn('text-2xl font-bold', severityConfig.color)}>
            {assessment.damageSeverity.replace(/_/g, ' ')}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-5 space-y-1">
          <p className="text-xs text-muted-foreground">AI Confidence</p>
          <p className={cn('text-2xl font-bold', confidenceColor(assessment.overallConfidence))}>
            {formatConfidence(assessment.overallConfidence)}
          </p>
        </div>
      </div>

      {/* Estimated cost */}
      {assessment.estimatedRepairCost !== null && (
        <div className="rounded-xl border bg-card p-5 space-y-1">
          <p className="text-xs text-muted-foreground">Estimated Repair / Loss Cost</p>
          <p className="text-2xl font-bold">{formatCurrency(assessment.estimatedRepairCost)}</p>
        </div>
      )}

      {/* Coverage determination */}
      <div className={cn(
        'rounded-xl border p-5 space-y-2',
        assessment.coverageApplicable ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200',
      )}>
        <p className={cn('font-semibold text-sm', assessment.coverageApplicable ? 'text-green-700' : 'text-red-700')}>
          {assessment.coverageApplicable ? 'Coverage Applicable' : 'Coverage Not Applicable'}
        </p>
        <p className="text-sm text-muted-foreground">{assessment.coverageReason}</p>
      </div>

      {/* Damage categories */}
      {Array.isArray(assessment.damageCategories) && assessment.damageCategories.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-semibold text-sm">Damage Categories</h2>
          <div className="space-y-2">
            {(assessment.damageCategories as Array<{ category: string; description: string; confidence: number }>).map((cat, i) => (
              <div key={i} className="rounded-lg border bg-card p-4 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{cat.category}</span>
                  <span className={cn('text-xs font-medium', confidenceColor(cat.confidence))}>
                    {formatConfidence(cat.confidence)}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">{cat.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
