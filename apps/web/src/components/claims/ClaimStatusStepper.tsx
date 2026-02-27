import { Check } from 'lucide-react';
import { ClaimStatus } from '@claims/shared';
import { cn } from '@/lib/utils';

interface Step {
  label: string;
  statuses: ClaimStatus[];
}

const STEPS: Step[] = [
  {
    label: 'Received',
    statuses: [ClaimStatus.FNOL_RECEIVED],
  },
  {
    label: 'Documents',
    statuses: [ClaimStatus.DOCUMENTS_PENDING, ClaimStatus.DOCUMENTS_UNDER_REVIEW],
  },
  {
    label: 'Under Review',
    statuses: [
      ClaimStatus.AI_PROCESSING,
      ClaimStatus.COVERAGE_VERIFIED,
      ClaimStatus.ASSESSMENT_COMPLETE,
      ClaimStatus.FRAUD_REVIEW,
      ClaimStatus.PENDING_ADJUSTER_DECISION,
      ClaimStatus.PENDING_ADDITIONAL_INFO,
    ],
  },
  {
    label: 'Decision',
    statuses: [ClaimStatus.APPROVED, ClaimStatus.DENIED, ClaimStatus.PAID, ClaimStatus.CLOSED],
  },
];

function getStepIndex(status: ClaimStatus): number {
  return STEPS.findIndex((s) => s.statuses.includes(status));
}

export function ClaimStatusStepper({ status }: { status: ClaimStatus }) {
  const currentIndex = getStepIndex(status);
  const isDenied = status === ClaimStatus.DENIED;

  return (
    <div className="flex items-center gap-0">
      {STEPS.map((step, i) => {
        const isCompleted = i < currentIndex;
        const isCurrent = i === currentIndex;
        const isPending = i > currentIndex;
        const isLastDecision = i === STEPS.length - 1 && isCurrent && isDenied;

        return (
          <div key={step.label} className="flex items-center flex-1 min-w-0">
            {/* Step node */}
            <div className="flex flex-col items-center shrink-0">
              <div
                className={cn(
                  'h-7 w-7 rounded-full flex items-center justify-center text-xs font-semibold border-2 transition-all',
                  isCompleted && 'bg-primary border-primary text-primary-foreground',
                  isCurrent && !isDenied && 'bg-primary/10 border-primary text-primary ring-4 ring-primary/20',
                  isLastDecision && 'bg-red-500 border-red-500 text-white',
                  isPending && 'bg-muted border-border text-muted-foreground',
                )}
              >
                {isCompleted ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <span>{i + 1}</span>
                )}
              </div>
              <span
                className={cn(
                  'mt-1.5 text-xs whitespace-nowrap',
                  isCompleted && 'text-primary font-medium',
                  isCurrent && !isDenied && 'text-primary font-semibold',
                  isLastDecision && 'text-red-600 font-semibold',
                  isPending && 'text-muted-foreground',
                )}
              >
                {step.label}
              </span>
            </div>

            {/* Connector line (not after last step) */}
            {i < STEPS.length - 1 && (
              <div
                className={cn(
                  'h-0.5 flex-1 mx-1 mb-5 rounded-full transition-all',
                  i < currentIndex ? 'bg-primary' : 'bg-border',
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
