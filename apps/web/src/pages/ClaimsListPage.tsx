import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ChevronUp, ChevronDown, ChevronsUpDown, FileSearch } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate, cn } from '@/lib/utils';
import { ClaimStatus, CLAIM_STATUS_LABELS, ServiceType, RiskLevel, type PaginatedResponse, type Claim } from '@claims/shared';

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
  [ClaimStatus.PAID]: 'bg-green-100 text-green-700',
  [ClaimStatus.CLOSED]: 'bg-gray-100 text-gray-600',
};

const RISK_COLORS: Record<RiskLevel, string> = {
  [RiskLevel.LOW]: 'text-green-600',
  [RiskLevel.MEDIUM]: 'text-yellow-600',
  [RiskLevel.HIGH]: 'text-orange-600',
  [RiskLevel.CRITICAL]: 'text-red-600',
};

type SortField = 'createdAt' | 'serviceDate' | 'lossAmount' | 'status';

function SortIcon({ field, sortBy, sortDir }: { field: SortField; sortBy: SortField; sortDir: 'asc' | 'desc' }) {
  if (sortBy !== field) return <ChevronsUpDown className="inline h-3.5 w-3.5 ml-1 text-muted-foreground/50" />;
  return sortDir === 'asc'
    ? <ChevronUp className="inline h-3.5 w-3.5 ml-1 text-primary" />
    : <ChevronDown className="inline h-3.5 w-3.5 ml-1 text-primary" />;
}

export function ClaimsListPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ClaimStatus | ''>('');
  const [serviceTypeFilter, setServiceTypeFilter] = useState<ServiceType | ''>('');
  const [sortBy, setSortBy] = useState<SortField>('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortDir('desc');
    }
    setPage(1);
  };

  const { data, isLoading } = useQuery({
    queryKey: ['claims', { page, search, statusFilter, serviceTypeFilter, sortBy, sortDir }],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: '20', sortBy, sortDir });
      if (search) params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);
      if (serviceTypeFilter) params.set('serviceType', serviceTypeFilter);
      return api.get<PaginatedResponse<Claim & { fraudAnalysis?: { riskLevel: RiskLevel; riskScore: number } }>>(`/api/claims?${params}`);
    },
    refetchInterval: 30_000,
  });

  const hasFilters = !!search || !!statusFilter || !!serviceTypeFilter;

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Claims</h1>
          <p className="text-sm text-muted-foreground mt-1">{data?.total ?? 0} total claims</p>
        </div>
      </div>

      {/* Search + filters row */}
      <div className="flex flex-wrap gap-2">
        <input
          type="text"
          placeholder="Search by claim number, policy holder, or description..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="flex-1 min-w-[220px] max-w-md rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value as ClaimStatus | ''); setPage(1); }}
          className="rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring text-muted-foreground"
        >
          <option value="">All Statuses</option>
          {Object.values(ClaimStatus).map((s) => (
            <option key={s} value={s}>{CLAIM_STATUS_LABELS[s]}</option>
          ))}
        </select>
        <select
          value={serviceTypeFilter}
          onChange={(e) => { setServiceTypeFilter(e.target.value as ServiceType | ''); setPage(1); }}
          className="rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring text-muted-foreground"
        >
          <option value="">All Service Types</option>
          {Object.values(ServiceType).map((t) => (
            <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
          ))}
        </select>
        {hasFilters && (
          <button
            onClick={() => { setSearch(''); setStatusFilter(''); setServiceTypeFilter(''); setPage(1); }}
            className="rounded-md border px-3 py-2 text-sm text-muted-foreground hover:bg-muted transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>

      <div className="rounded-xl border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Claim #</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Policy Holder</th>
              <th
                className="px-4 py-3 text-left font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors"
                onClick={() => handleSort('status')}
              >
                Status <SortIcon field="status" sortBy={sortBy} sortDir={sortDir} />
              </th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Fraud Risk</th>
              <th
                className="px-4 py-3 text-left font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors"
                onClick={() => handleSort('serviceDate')}
              >
                Service Date <SortIcon field="serviceDate" sortBy={sortBy} sortDir={sortDir} />
              </th>
              <th
                className="px-4 py-3 text-left font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors"
                onClick={() => handleSort('createdAt')}
              >
                Filed <SortIcon field="createdAt" sortBy={sortBy} sortDir={sortDir} />
              </th>
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
                <td colSpan={6} className="px-4 py-16 text-center">
                  <FileSearch className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="font-medium text-sm">
                    {hasFilters ? 'No claims match your filters' : 'No claims yet'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {hasFilters ? 'Try adjusting your search or filters.' : 'Claims will appear here once filed.'}
                  </p>
                  {hasFilters && (
                    <button
                      onClick={() => { setSearch(''); setStatusFilter(''); setServiceTypeFilter(''); }}
                      className="mt-3 text-xs text-primary hover:underline"
                    >
                      Clear all filters
                    </button>
                  )}
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
                  <td className="px-4 py-3">
                    <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', STATUS_COLORS[claim.status])}>
                      {CLAIM_STATUS_LABELS[claim.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {claim.fraudAnalysis ? (
                      <span className={cn('font-medium', RISK_COLORS[claim.fraudAnalysis.riskLevel])}>
                        {claim.fraudAnalysis.riskLevel} · {Math.round(claim.fraudAnalysis.riskScore * 100)}%
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(claim.serviceDate)}</td>
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
