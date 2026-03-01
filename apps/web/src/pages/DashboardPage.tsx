import { useQuery } from '@tanstack/react-query';
import { FileText, AlertTriangle, TrendingDown, CheckCircle, TrendingUp, Minus } from 'lucide-react';
import { api } from '@/lib/api';
import { formatCurrency, cn } from '@/lib/utils';
import type { DashboardMetrics, ApiResponse } from '@claims/shared';

function TrendBadge({ pct, invert = false }: { pct: number | null | undefined; invert?: boolean }) {
  if (pct === null || pct === undefined) return null;
  if (pct === 0) return (
    <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
      <Minus className="h-3 w-3" /> 0%
    </span>
  );
  // invert=true means a higher number is bad (e.g. fraud flags, pending)
  const isGood = invert ? pct < 0 : pct > 0;
  return (
    <span className={cn('flex items-center gap-0.5 text-xs font-medium', isGood ? 'text-green-600' : 'text-red-500')}>
      {pct > 0
        ? <TrendingUp className="h-3 w-3" />
        : <TrendingDown className="h-3 w-3" />
      }
      {pct > 0 ? '+' : ''}{pct}% vs last 30d
    </span>
  );
}

function KPICard({
  title,
  value,
  subtitle,
  icon: Icon,
  color = 'text-primary',
  trend,
  invertTrend,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ElementType;
  color?: string;
  trend?: number | null;
  invertTrend?: boolean;
}) {
  return (
    <div className="rounded-xl border bg-card p-6 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{title}</p>
        <Icon className={`h-4 w-4 ${color}`} />
      </div>
      <p className="text-2xl font-bold">{value}</p>
      <div className="flex items-center justify-between gap-2">
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        <TrendBadge pct={trend} invert={invertTrend} />
      </div>
    </div>
  );
}

export function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['analytics', 'dashboard'],
    queryFn: () => api.get<ApiResponse<DashboardMetrics>>('/api/analytics/dashboard'),
    refetchInterval: 30_000,
  });

  const metrics = data?.data;

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">AI-assisted claims operations overview</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KPICard
          title="Total Claims"
          value={metrics?.totalClaims ?? '—'}
          subtitle={`${metrics?.openClaims ?? 0} open`}
          icon={FileText}
          trend={metrics?.trends?.totalClaims}
        />
        <KPICard
          title="Pending Decision"
          value={metrics?.pendingAdjusterDecision ?? '—'}
          subtitle="Ready for adjuster review"
          icon={CheckCircle}
          color="text-yellow-500"
          trend={metrics?.trends?.pendingAdjusterDecision}
          invertTrend
        />
        <KPICard
          title="Fraud Flags Today"
          value={metrics?.fraudFlagsToday ?? '—'}
          subtitle="High/critical risk"
          icon={AlertTriangle}
          color="text-red-500"
          trend={metrics?.trends?.fraudFlagsToday}
          invertTrend
        />
        <KPICard
          title="Avg Processing Time"
          value={metrics ? `${metrics.avgProcessingDays}d` : '—'}
          subtitle="vs 4.2d baseline"
          icon={TrendingDown}
          color="text-green-500"
        />
        <KPICard
          title="STP Rate"
          value={metrics ? `${Math.round(metrics.straightThroughRate * 100)}%` : '—'}
          subtitle="Straight-through processed"
          icon={CheckCircle}
          color="text-green-500"
        />
        <KPICard
          title="Paid This Month"
          value={metrics?.paidThisMonth ?? '—'}
          subtitle={metrics ? formatCurrency(metrics.totalPaidAmount) : ''}
          icon={FileText}
          trend={metrics?.trends?.paidThisMonth}
        />
      </div>
    </div>
  );
}
