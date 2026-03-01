import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { api } from '@/lib/api';
import type { ApiResponse } from '@claims/shared';

export function AnalyticsPage() {
  const { data: processingData } = useQuery({
    queryKey: ['analytics', 'processing-time'],
    queryFn: () => api.get<ApiResponse<Array<{ date: string; processingDays: number }>>>('/api/analytics/processing-time'),
  });

  const { data: performanceData } = useQuery({
    queryKey: ['analytics', 'ai-performance'],
    queryFn: () => api.get<ApiResponse<{ fraudByRiskLevel: Record<string, number>; totalAssessments: number }>>('/api/analytics/ai-performance'),
  });

  const fraudChartData = Object.entries(performanceData?.data.fraudByRiskLevel ?? {}).map(
    ([level, count]) => ({ level, count }),
  );

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Analytics</h1>
        <p className="text-sm text-muted-foreground mt-1">AI performance and claims processing metrics</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Processing time trend */}
        <div className="rounded-xl border bg-card p-6 space-y-4">
          <h2 className="font-semibold text-sm">Processing Time (days)</h2>
          {processingData?.data && processingData.data.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={processingData.data}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="processingDays" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-60 items-center justify-center text-muted-foreground text-sm">
              No data yet — settle some claims to see trends
            </div>
          )}
        </div>

        {/* Fraud risk distribution */}
        <div className="rounded-xl border bg-card p-6 space-y-4">
          <h2 className="font-semibold text-sm">Fraud Risk Distribution</h2>
          {fraudChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={fraudChartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="level" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-60 items-center justify-center text-muted-foreground text-sm">
              No fraud analyses yet
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl border bg-card p-6">
        <h2 className="font-semibold text-sm mb-4">Coverage Assessment Summary</h2>
        <p className="text-3xl font-bold">{performanceData?.data.totalAssessments ?? 0}</p>
        <p className="text-sm text-muted-foreground mt-1">Total coverage assessments completed</p>
      </div>
    </div>
  );
}
