import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PlusCircle, FileText } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate, cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { ClaimStatus, CLAIM_STATUS_LABELS, type PaginatedResponse, type Claim } from '@claims/shared';

const STATUS_COLORS: Record<ClaimStatus, string> = {
  [ClaimStatus.FNOL_RECEIVED]: 'bg-blue-100 text-blue-700',
  [ClaimStatus.DOCUMENTS_PENDING]: 'bg-yellow-100 text-yellow-700',
  [ClaimStatus.DOCUMENTS_UNDER_REVIEW]: 'bg-yellow-100 text-yellow-700',
  [ClaimStatus.AI_PROCESSING]: 'bg-purple-100 text-purple-700',
  [ClaimStatus.COVERAGE_VERIFIED]: 'bg-blue-100 text-blue-700',
  [ClaimStatus.ASSESSMENT_COMPLETE]: 'bg-blue-100 text-blue-700',
  [ClaimStatus.FRAUD_REVIEW]: 'bg-orange-100 text-orange-700',
  [ClaimStatus.PENDING_ADJUSTER_DECISION]: 'bg-orange-100 text-orange-700',
  [ClaimStatus.PENDING_ADDITIONAL_INFO]: 'bg-yellow-100 text-yellow-700',
  [ClaimStatus.APPROVED]: 'bg-green-100 text-green-700',
  [ClaimStatus.DENIED]: 'bg-red-100 text-red-700',
  [ClaimStatus.PAID]: 'bg-green-100 text-green-700',
  [ClaimStatus.CLOSED]: 'bg-gray-100 text-gray-600',
};

export function ClientDashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['client-claims'],
    queryFn: () => api.get<PaginatedResponse<Claim>>('/api/claims?limit=50'),
  });

  const policy = user?.policy;

  return (
    <div className="space-y-6">
      {/* Policy card */}
      {policy && (
        <div className="rounded-xl border bg-card p-5 space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Your Policy</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <p className="text-xs text-muted-foreground">Policy Number</p>
              <p className="font-mono font-medium text-sm">{policy.policyNumber}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Coverage Type</p>
              <p className="font-medium text-sm">{policy.coverageType}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Coverage Limit</p>
              <p className="font-medium text-sm">${Number(policy.coverageLimit).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Deductible</p>
              <p className="font-medium text-sm">${Number(policy.deductible).toLocaleString()}</p>
            </div>
          </div>
        </div>
      )}

      {/* Claims header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Your Claims</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{data?.total ?? 0} total</p>
        </div>
        <button
          onClick={() => navigate('/client/claims/new')}
          className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
        >
          <PlusCircle className="h-4 w-4" />
          File a Claim
        </button>
      </div>

      {/* Claims list */}
      <div className="space-y-3">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl border bg-card p-4 animate-pulse">
              <div className="h-4 w-32 bg-muted rounded mb-2" />
              <div className="h-3 w-48 bg-muted rounded" />
            </div>
          ))
        ) : data?.data.length === 0 ? (
          <div className="rounded-xl border bg-card p-10 text-center">
            <FileText className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="font-medium text-sm">No claims yet</p>
            <p className="text-xs text-muted-foreground mt-1">File your first claim when you need to.</p>
          </div>
        ) : (
          data?.data.map((claim) => (
            <div
              key={claim.id}
              onClick={() => navigate(`/client/claims/${claim.id}`)}
              className="rounded-xl border bg-card p-4 cursor-pointer hover:shadow-sm transition-shadow flex items-center justify-between gap-4"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono font-semibold text-sm">{claim.claimNumber}</span>
                  <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', STATUS_COLORS[claim.status])}>
                    {CLAIM_STATUS_LABELS[claim.status]}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mt-1 truncate">
                  {claim.serviceType.replace(/_/g, ' ')} · {formatDate(claim.serviceDate)}
                </p>
              </div>
              {claim.lossAmount != null && (
                <p className="text-sm font-semibold shrink-0">${Number(claim.lossAmount).toLocaleString()}</p>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
