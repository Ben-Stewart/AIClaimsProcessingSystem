import { useEffect } from 'react';
import { useParams, useNavigate, NavLink, Routes, Route, Navigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate, cn } from '@/lib/utils';
import { CLAIM_STATUS_LABELS, WS_EVENTS, type ApiResponse, type Claim } from '@claims/shared';
import { subscribeToClaimUpdates, unsubscribeFromClaimUpdates, getSocket } from '@/lib/socket';
import { useAIJobs } from '@/context/AIJobContext';
import { AIJobProgressPanel } from '@/components/claims/AIJobProgressPanel';
import { DocumentsTab } from '@/components/claims/DocumentsTab';
import { FraudTab } from '@/components/claims/FraudTab';
import { AssessmentTab } from '@/components/claims/AssessmentTab';
import { SettlementTab } from '@/components/claims/SettlementTab';

export function ClaimDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { hasActiveJobsForClaim, getJobsForClaim } = useAIJobs();

  const { data, isLoading } = useQuery({
    queryKey: ['claims', id],
    queryFn: () => api.get<ApiResponse<Claim>>(`/api/claims/${id}`),
    enabled: !!id,
  });

  // Subscribe to real-time updates for this claim
  useEffect(() => {
    if (!id) return;
    subscribeToClaimUpdates(id);

    const socket = getSocket();
    const handleClaimUpdate = () => {
      queryClient.invalidateQueries({ queryKey: ['claims', id] });
    };

    socket.on(WS_EVENTS.CLAIM_UPDATED, handleClaimUpdate);
    socket.on(WS_EVENTS.CLAIM_READY_FOR_REVIEW, handleClaimUpdate);
    socket.on(WS_EVENTS.AI_JOB_COMPLETED, handleClaimUpdate);

    return () => {
      unsubscribeFromClaimUpdates(id);
      socket.off(WS_EVENTS.CLAIM_UPDATED, handleClaimUpdate);
      socket.off(WS_EVENTS.CLAIM_READY_FOR_REVIEW, handleClaimUpdate);
      socket.off(WS_EVENTS.AI_JOB_COMPLETED, handleClaimUpdate);
    };
  }, [id, queryClient]);

  const claim = data?.data;
  const activeJobs = id ? getJobsForClaim(id) : [];
  const hasActiveJobs = id ? hasActiveJobsForClaim(id) : false;

  const tabs = [
    { path: '', label: 'Overview', end: true },
    { path: 'documents', label: 'Documents' },
    { path: 'assessment', label: 'AI Assessment' },
    { path: 'fraud', label: 'Fraud Risk' },
    { path: 'settlement', label: 'Settlement' },
  ];

  if (isLoading) {
    return (
      <div className="p-8 space-y-4">
        <div className="h-8 w-64 animate-pulse rounded bg-muted" />
        <div className="h-48 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  if (!claim) return null;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b bg-card px-8 py-4 space-y-3">
        <button
          onClick={() => navigate('/claims')}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          All Claims
        </button>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold font-mono">{claim.claimNumber}</h1>
            <p className="text-sm text-muted-foreground">
              {claim.policy?.holderName} · {claim.incidentType.replace(/_/g, ' ')} · {formatDate(claim.incidentDate)}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {hasActiveJobs && (
              <span className="flex items-center gap-1.5 text-xs text-purple-600 font-medium">
                <span className="h-2 w-2 animate-pulse rounded-full bg-purple-500" />
                AI Processing
              </span>
            )}
            <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              {CLAIM_STATUS_LABELS[claim.status]}
            </span>
          </div>
        </div>

        {/* Tabs */}
        <nav className="flex gap-1 -mb-4">
          {tabs.map((tab) => (
            <NavLink
              key={tab.path}
              to={tab.path}
              end={tab.end}
              relative="path"
              className={({ isActive }) =>
                cn(
                  'px-4 py-2 text-sm border-b-2 transition-colors',
                  isActive
                    ? 'border-primary text-primary font-medium'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )
              }
            >
              {tab.label}
            </NavLink>
          ))}
        </nav>
      </div>

      {/* Active AI job progress */}
      {activeJobs.length > 0 && (
        <div className="border-b bg-purple-50 px-8 py-3">
          <AIJobProgressPanel jobs={activeJobs} />
        </div>
      )}

      {/* Tab content */}
      <div className="flex-1 overflow-auto">
        <Routes>
          <Route index element={<ClaimOverviewTab claim={claim} />} />
          <Route path="documents" element={<DocumentsTab claimId={claim.id} />} />
          <Route path="assessment" element={<AssessmentTab claim={claim} />} />
          <Route path="fraud" element={<FraudTab claim={claim} />} />
          <Route path="settlement" element={<SettlementTab claim={claim} />} />
          <Route path="*" element={<Navigate to="" replace />} />
        </Routes>
      </div>
    </div>
  );
}

function ClaimOverviewTab({ claim }: { claim: Claim }) {
  return (
    <div className="p-8 max-w-3xl space-y-6">
      <div className="rounded-xl border bg-card p-6 space-y-4">
        <h2 className="font-semibold">Incident Description</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">{claim.incidentDescription}</p>
      </div>

      {claim.adjusterNotes && (
        <div className="rounded-xl border bg-card p-6 space-y-2">
          <h2 className="font-semibold">Adjuster Notes</h2>
          <p className="text-sm leading-relaxed">{claim.adjusterNotes}</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border bg-card p-4 space-y-1">
          <p className="text-xs text-muted-foreground">Policy</p>
          <p className="font-medium text-sm">{claim.policy?.policyNumber}</p>
        </div>
        <div className="rounded-xl border bg-card p-4 space-y-1">
          <p className="text-xs text-muted-foreground">Coverage Type</p>
          <p className="font-medium text-sm">{claim.policy?.coverageType}</p>
        </div>
        <div className="rounded-xl border bg-card p-4 space-y-1">
          <p className="text-xs text-muted-foreground">Coverage Limit</p>
          <p className="font-medium text-sm">${Number(claim.policy?.coverageLimit ?? 0).toLocaleString()}</p>
        </div>
        <div className="rounded-xl border bg-card p-4 space-y-1">
          <p className="text-xs text-muted-foreground">Deductible</p>
          <p className="font-medium text-sm">${Number(claim.policy?.deductible ?? 0).toLocaleString()}</p>
        </div>
      </div>
    </div>
  );
}
