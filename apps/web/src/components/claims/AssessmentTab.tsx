import { formatCurrency, formatConfidence, confidenceColor, cn } from '@/lib/utils';
import { type Claim, type CoverageEndorsements } from '@claims/shared';

const AMOUNT_CONFIG: Record<CoverageEndorsements['amountReasonableness'], { label: string; color: string; bg: string; border: string }> = {
  WITHIN_RANGE: { label: 'Within Range', color: 'text-green-700', bg: 'bg-green-50', border: 'border-green-200' },
  ELEVATED:     { label: 'Elevated',     color: 'text-yellow-700', bg: 'bg-yellow-50', border: 'border-yellow-200' },
  EXCESSIVE:    { label: 'Excessive',    color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200' },
};

export function AssessmentTab({ claim }: { claim: Claim }) {
  const assessment = claim.aiAssessment;

  if (!assessment) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground p-8">
        Coverage assessment not yet available. Upload documents to trigger AI processing.
      </div>
    );
  }

  const endorsements = assessment.applicableEndorsements as CoverageEndorsements | null;
  const amountConfig = endorsements ? AMOUNT_CONFIG[endorsements.amountReasonableness] : null;

  return (
    <div className="p-8 max-w-2xl space-y-6">

      {/* Coverage Determination — primary answer, always at top */}
      <div className={cn(
        'rounded-xl border p-5 space-y-2',
        assessment.coverageApplicable ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200',
      )}>
        <p className={cn('font-semibold text-sm', assessment.coverageApplicable ? 'text-green-700' : 'text-red-700')}>
          {assessment.coverageApplicable ? 'Covered Under Plan' : 'Not Covered Under Plan'}
        </p>
        <p className="text-sm text-muted-foreground">{assessment.coverageReason}</p>
      </div>

      {/* Medical Necessity + Coverage Confidence */}
      <div className="grid grid-cols-2 gap-4">
        {endorsements && (
          <div className={cn(
            'rounded-xl border p-5 space-y-2',
            endorsements.medicalNecessity ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200',
          )}>
            <p className="text-xs text-muted-foreground">Medical Necessity</p>
            <p className={cn('text-2xl font-bold', endorsements.medicalNecessity ? 'text-green-700' : 'text-red-700')}>
              {endorsements.medicalNecessity ? 'Warranted' : 'Not Warranted'}
            </p>
            <p className="text-sm text-muted-foreground">{endorsements.medicalNecessityRationale}</p>
          </div>
        )}

        <div className="rounded-xl border bg-card p-5 space-y-2">
          <p className="text-xs text-muted-foreground">Coverage Confidence</p>
          <p className={cn('text-2xl font-bold', confidenceColor(assessment.overallConfidence))}>
            {formatConfidence(assessment.overallConfidence)}
          </p>
          <p className="text-xs text-muted-foreground italic">
            How certain the AI is that its coverage determination is correct.
          </p>
          {assessment.confidenceRationale && (
            <p className="text-sm text-muted-foreground">{assessment.confidenceRationale}</p>
          )}
        </div>
      </div>

      {/* Amount Assessment */}
      {amountConfig && endorsements && (
        <div className={cn('rounded-xl border p-5 space-y-2', amountConfig.bg, amountConfig.border)}>
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Amount Assessment</p>
            {assessment.estimatedTreatmentCost !== null && (
              <p className="text-xs text-muted-foreground">
                Claimed: <span className="font-semibold text-foreground">{formatCurrency(assessment.estimatedTreatmentCost)}</span>
              </p>
            )}
          </div>
          <p className={cn('text-2xl font-bold', amountConfig.color)}>{amountConfig.label}</p>
          <p className="text-sm text-muted-foreground">{endorsements.amountReasonablenessRationale}</p>
        </div>
      )}

      {/* Treatment Areas */}
      {Array.isArray(assessment.treatmentCategories) && assessment.treatmentCategories.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="font-semibold text-sm">Treatment Areas</h2>
            <span className="text-xs text-muted-foreground italic">Coverage match confidence</span>
          </div>
          <div className="space-y-2">
            {(assessment.treatmentCategories as Array<{ category: string; description: string; confidence: number }>).map((cat, i) => (
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
