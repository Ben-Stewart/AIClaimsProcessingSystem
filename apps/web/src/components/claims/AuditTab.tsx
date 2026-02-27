import { useQuery } from '@tanstack/react-query';
import { Bot, User, Clock } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';
import type { ApiResponse } from '@claims/shared';

interface AuditEvent {
  id: string;
  action: string;
  actorType: 'HUMAN' | 'AI_SYSTEM';
  timestamp: string;
  details: Record<string, unknown> | null;
  actor?: { name: string; role: string } | null;
}

const ACTION_LABELS: Record<string, string> = {
  CLAIM_CREATED: 'Claim filed',
  CLAIM_UPDATED: 'Claim updated',
  CLAIM_APPROVED: 'Claim approved',
  CLAIM_DENIED: 'Claim denied',
  CLAIM_DELETED: 'Claim deleted',
  ESCALATED_SIU: 'Escalated to SIU',
  INFO_REQUESTED: 'Additional info requested',
  AI_REANALYSIS_REQUESTED: 'AI reanalysis requested',
  FRAUD_SCORED: 'Fraud analysis completed',
  DOCUMENT_ANALYZED: 'Document analyzed',
  COVERAGE_VERIFIED: 'Coverage verified',
  ASSESSMENT_COMPLETE: 'AI assessment completed',
  REIMBURSEMENT_CALCULATED: 'Reimbursement calculated',
};

function relativeTime(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function AuditTab({ claimId }: { claimId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['claims', claimId, 'audit'],
    queryFn: () => api.get<ApiResponse<AuditEvent[]>>(`/api/claims/${claimId}/timeline`),
  });

  const events = data?.data ?? [];

  if (isLoading) {
    return (
      <div className="p-8 space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex gap-3 animate-pulse">
            <div className="h-8 w-8 rounded-full bg-muted shrink-0" />
            <div className="flex-1 space-y-2 pt-1">
              <div className="h-4 w-40 rounded bg-muted" />
              <div className="h-3 w-24 rounded bg-muted" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        <div className="text-center">
          <Clock className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
          <p>No activity recorded yet</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-2xl">
      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-3.5 top-0 bottom-0 w-px bg-border" />

        <div className="space-y-6">
          {events.map((event) => {
            const isAI = event.actorType === 'AI_SYSTEM';
            const label = ACTION_LABELS[event.action] ?? event.action.replace(/_/g, ' ').toLowerCase();

            return (
              <div key={event.id} className="relative flex gap-4 pl-0">
                {/* Icon */}
                <div className={`
                  relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-background
                  ${isAI ? 'bg-purple-100' : 'bg-muted'}
                `}>
                  {isAI
                    ? <Bot className="h-3.5 w-3.5 text-purple-600" />
                    : <User className="h-3.5 w-3.5 text-muted-foreground" />
                  }
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0 pb-1">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-sm font-medium capitalize">{label}</span>
                    <span className="text-xs text-muted-foreground" title={formatDateTime(event.timestamp)}>
                      {relativeTime(event.timestamp)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {isAI ? 'AI System' : (event.actor?.name ?? 'Unknown')}
                    {event.actor?.role && !isAI && ` · ${event.actor.role}`}
                  </p>
                  {event.details && Object.keys(event.details).length > 0 && (
                    <div className="mt-1.5 rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground space-y-0.5">
                      {Object.entries(event.details)
                        .filter(([, v]) => v !== null && v !== undefined && v !== '')
                        .slice(0, 3)
                        .map(([k, v]) => (
                          <div key={k} className="flex gap-2">
                            <span className="capitalize shrink-0">{k.replace(/([A-Z])/g, ' $1').trim()}:</span>
                            <span className="truncate">{String(v)}</span>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
