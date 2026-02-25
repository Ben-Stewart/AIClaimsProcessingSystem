import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ArrowLeft, Search, CheckCircle2, X } from 'lucide-react';
import { CreateClaimSchema, CreateClaimInput, ServiceType, type ApiResponse, type Claim } from '@claims/shared';
import { api } from '@/lib/api';

const SERVICE_TYPE_LABELS: Record<ServiceType, string> = {
  [ServiceType.PHYSIOTHERAPY]: 'Physiotherapy',
  [ServiceType.MASSAGE_THERAPY]: 'Massage Therapy',
  [ServiceType.CHIROPRACTIC]: 'Chiropractic',
  [ServiceType.PSYCHOLOGIST]: 'Psychologist / Counselling',
  [ServiceType.DENTAL_PREVENTIVE]: 'Dental – Preventive',
  [ServiceType.DENTAL_RESTORATIVE]: 'Dental – Restorative',
  [ServiceType.VISION_CARE]: 'Vision Care',
};

type ProviderResult = { name: string; address: string; phone: string };

export function NewClaimPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CreateClaimInput>({ resolver: zodResolver(CreateClaimSchema) });

  const serviceType = watch('serviceType');

  const [providerQuery, setProviderQuery] = useState('');
  const [providerResults, setProviderResults] = useState<ProviderResult[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<ProviderResult | null>(null);
  const [isSearchingProvider, setIsSearchingProvider] = useState(false);
  const [providerSearchError, setProviderSearchError] = useState('');

  async function searchProvider() {
    if (!providerQuery.trim()) return;
    setIsSearchingProvider(true);
    setProviderSearchError('');
    setProviderResults([]);
    try {
      const params = new URLSearchParams({ q: providerQuery.trim() });
      if (serviceType) params.set('type', serviceType);
      const res = await api.get<{ data: ProviderResult[] }>(`/api/providers/search?${params}`);
      if (res.data.length === 0) {
        setProviderSearchError('No providers found. Try a different name.');
      } else {
        setProviderResults(res.data);
      }
    } catch {
      setProviderSearchError('Search failed. Please try again.');
    } finally {
      setIsSearchingProvider(false);
    }
  }

  function selectProvider(p: ProviderResult) {
    setSelectedProvider(p);
    setValue('provider', p);
    setProviderResults([]);
    setProviderQuery('');
  }

  function clearProvider() {
    setSelectedProvider(null);
    setValue('provider', undefined);
  }

  const createClaim = useMutation({
    mutationFn: (data: CreateClaimInput) =>
      api.post<ApiResponse<Claim>>('/api/claims', {
        ...data,
        serviceDate: new Date(data.serviceDate).toISOString(),
      }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['claims'] });
      navigate(`/claims/${res.data.id}`);
    },
  });

  return (
    <div className="p-8 max-w-2xl">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </button>

      <h1 className="text-2xl font-bold mb-1">New Benefits Claim</h1>
      <p className="text-sm text-muted-foreground mb-8">
        Submit a new claim. AI will begin processing once documents are uploaded.
      </p>

      <form onSubmit={handleSubmit((d) => createClaim.mutate(d))} className="space-y-6">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Policy Number</label>
          <input
            className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="e.g. POL-DEMO-0001"
            {...register('policyNumber')}
          />
          {errors.policyNumber && <p className="text-xs text-destructive">{errors.policyNumber.message}</p>}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Service Date</label>
            <input
              type="datetime-local"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              {...register('serviceDate')}
            />
            {errors.serviceDate && <p className="text-xs text-destructive">{errors.serviceDate.message}</p>}
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Service Type</label>
            <select
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              {...register('serviceType')}
            >
              <option value="">Select type...</option>
              {Object.entries(SERVICE_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            {errors.serviceType && <p className="text-xs text-destructive">{errors.serviceType.message}</p>}
          </div>
        </div>

        {/* Provider lookup */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Provider</label>

          {selectedProvider ? (
            <div className="rounded-md border bg-muted/40 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold">{selectedProvider.name}</p>
                    <p className="text-xs text-muted-foreground">{selectedProvider.address}</p>
                    <p className="text-xs text-muted-foreground">{selectedProvider.phone}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={clearProvider}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Clear provider"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={providerQuery}
                  onChange={(e) => setProviderQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); searchProvider(); } }}
                  className="flex-1 rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="e.g. Dr. Jane Smith or City Physio Clinic"
                />
                <button
                  type="button"
                  onClick={searchProvider}
                  disabled={isSearchingProvider || !providerQuery.trim()}
                  className="flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm hover:bg-muted transition-colors disabled:opacity-50"
                >
                  <Search className="h-3.5 w-3.5" />
                  {isSearchingProvider ? 'Searching...' : 'Look Up'}
                </button>
              </div>

              {providerSearchError && (
                <p className="text-xs text-destructive">{providerSearchError}</p>
              )}

              {providerResults.length > 0 && (
                <div className="rounded-md border bg-card divide-y shadow-sm">
                  {providerResults.map((p, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => selectProvider(p)}
                      className="w-full text-left px-3 py-2.5 hover:bg-muted/50 transition-colors"
                    >
                      <p className="text-sm font-medium">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{p.address}</p>
                      <p className="text-xs text-muted-foreground">{p.phone}</p>
                    </button>
                  ))}
                </div>
              )}

              <p className="text-xs text-muted-foreground">Search by provider name or clinic. Select to confirm details.</p>
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">Description <span className="text-muted-foreground font-normal">(optional)</span></label>
          <textarea
            rows={5}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            placeholder="Describe the service received..."
            {...register('serviceDescription')}
          />
          {errors.serviceDescription && (
            <p className="text-xs text-destructive">{errors.serviceDescription.message}</p>
          )}
          <p className="text-xs text-muted-foreground">AI will extract structured data from the description.</p>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">Amount Paid</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
            <input
              type="number"
              step="0.01"
              min="0"
              className="w-full rounded-md border bg-background pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="0.00"
              {...register('lossAmount', { valueAsNumber: true })}
            />
          </div>
          {errors.lossAmount && <p className="text-xs text-destructive">{errors.lossAmount.message}</p>}
        </div>

        {createClaim.error && (
          <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            Failed to create claim. Please check your policy number and try again.
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={isSubmitting || createClaim.isPending}
            className="rounded-md bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {createClaim.isPending ? 'Submitting...' : 'Submit Claim'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/claims')}
            className="rounded-md border px-6 py-2 text-sm hover:bg-muted transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
