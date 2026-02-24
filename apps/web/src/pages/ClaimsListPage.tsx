import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { PlusCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate, cn } from '@/lib/utils';
import { ClaimStatus, CLAIM_STATUS_LABELS, RiskLevel, type PaginatedResponse, type Claim } from '@claims/shared';

const STATUS_COLORS: Record<ClaimStatus, string> = {
  [ClaimStatus.FNOL_RECEIVED]: 'bg-blue-100 text-blue-700',
  [ClaimStatus.DOCUMENTS_PENDING]: 'bg-yellow-100 text-yellow-700',
  [ClaimStatus.DOCUMENTS_UNDER_REVIEW]: 'bg-yellow-100 text-yellow-700',
  [ClaimStatus.AI_PROCESSING]: 'bg-purple-100 text-purple-700',
  [ClaimStatus.COVERAGE_VERIFIED]: 'bg-blue-100 text-blue-700',
  [ClaimStatus.ASSESSMENT_COMPLETE]: 'bg-blue-100 text-blue-700',
  [ClaimStatus.FRAUD_REVIEW]: 'bg-red-100 text-red-700',
  [ClaimStatus.PENDING_ADJUSTER_DECISION]: 'bg-orange-100 text-orange-700',
  [ClaimStatus.PENDING_ADDITIONAL_INFO]: 'bg-yellow-100 text-yellow-700',
  [ClaimStatus.APPROVED]: 'bg-green-100 text-green-700',
  [ClaimStatus.DENIED]: 'bg-red-100 text-red-700',
  [ClaimStatus.SETTLED]: 'bg-green-100 text-green-700',
  [ClaimStatus.CLOSED]: 'bg-gray-100 text-gray-600',
};

const RISK_COLORS: Record<RiskLevel, string> = {
  [RiskLevel.LOW]: 'text-green-600',
  [RiskLevel.MEDIUM]: 'text-yellow-600',
  [RiskLevel.HIGH]: 'text-orange-600',
  [RiskLevel.CRITICAL]: 'text-red-600',
};

export function ClaimsListPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['claims', { page, search }],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (search) params.set('search', search);
      return api.get<PaginatedResponse<Claim & { fraudAnalysis?: { riskLevel: RiskLevel; riskScore: number } }>>(`/api/claims?${params}`);
    },
  });

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Claims</h1>
          <p className="text-sm text-muted-foreground mt-1">{data?.total ?? 0} total claims</p>
        </div>
        <button
          onClick={() => navigate('/claims/new')}
          className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
        >
          <PlusCircle className="h-4 w-4" />
          New Claim
        </button>
      </div>

      <input
        type="text"
        placeholder="Search by claim number, policy holder, or description..."
        value={search}
        onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        className="w-full max-w-md rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />

      <div className="rounded-xl border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Claim #</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Policy Holder</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Type</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Fraud Risk</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Date</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 10 }).map((_, i) => (
                <tr key={i} className="border-b">
                  {Array.from({ length: 6 }).map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                    </td>
                  ))}
                </tr>
              ))
            ) : data?.data.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  No claims found
                </td>
              </tr>
            ) : (
              data?.data.map((claim) => (
                <tr
                  key={claim.id}
                  onClick={() => navigate(`/claims/${claim.id}`)}
                  className="border-b cursor-pointer hover:bg-muted/30 transition-colors"
                >
                  <td className="px-4 py-3 font-mono font-medium">{claim.claimNumber}</td>
                  <td className="px-4 py-3">{claim.policy?.holderName ?? '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{claim.incidentType.replace(/_/g, ' ')}</td>
                  <td className="px-4 py-3">
                    <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', STATUS_COLORS[claim.status])}>
                      {CLAIM_STATUS_LABELS[claim.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {claim.fraudAnalysis ? (
                      <span className={cn('font-medium', RISK_COLORS[claim.fraudAnalysis.riskLevel])}>
                        {claim.fraudAnalysis.riskLevel}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(claim.createdAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {page} of {data.totalPages}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50 hover:bg-muted transition-colors"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
              disabled={page === data.totalPages}
              className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50 hover:bg-muted transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
