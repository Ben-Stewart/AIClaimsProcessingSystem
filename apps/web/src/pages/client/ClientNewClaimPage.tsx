import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { CreateClaimSchema, CreateClaimInput, IncidentType, type ApiResponse, type Claim } from '@claims/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

const INCIDENT_TYPE_LABELS: Record<IncidentType, string> = {
  [IncidentType.AUTO_COLLISION]: 'Auto Collision',
  [IncidentType.AUTO_THEFT]: 'Auto Theft',
  [IncidentType.PROPERTY_DAMAGE]: 'Property Damage',
  [IncidentType.PERSONAL_INJURY]: 'Personal Injury',
  [IncidentType.MEDICAL]: 'Medical',
  [IncidentType.NATURAL_DISASTER]: 'Natural Disaster',
  [IncidentType.LIABILITY]: 'Liability',
};

export function ClientNewClaimPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateClaimInput>({
    resolver: zodResolver(CreateClaimSchema),
    defaultValues: { policyNumber: user?.policy?.policyNumber ?? '' },
  });

  const createClaim = useMutation({
    mutationFn: (data: CreateClaimInput) =>
      api.post<ApiResponse<Claim>>('/api/claims', data),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['client-claims'] });
      navigate(`/client/claims/${res.data.id}`);
    },
  });

  return (
    <div className="space-y-6">
      <button
        onClick={() => navigate('/client')}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to claims
      </button>

      <div>
        <h1 className="text-2xl font-bold">File a Claim</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Describe your incident and our AI will begin processing immediately.
        </p>
      </div>

      <div className="rounded-xl border bg-card p-6">
        <form onSubmit={handleSubmit((d) => createClaim.mutate(d))} className="space-y-6">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Policy Number</label>
            <input
              className="w-full rounded-md border bg-muted px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
              readOnly={!!user?.policy?.policyNumber}
              {...register('policyNumber')}
            />
            {errors.policyNumber && <p className="text-xs text-destructive">{errors.policyNumber.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Incident Date</label>
              <input
                type="datetime-local"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                {...register('incidentDate')}
              />
              {errors.incidentDate && <p className="text-xs text-destructive">{errors.incidentDate.message}</p>}
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Incident Type</label>
              <select
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                {...register('incidentType')}
              >
                <option value="">Select type...</option>
                {Object.entries(INCIDENT_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
              {errors.incidentType && <p className="text-xs text-destructive">{errors.incidentType.message}</p>}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">What happened?</label>
            <textarea
              rows={5}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              placeholder="Describe what happened in as much detail as possible. Include date, time, location, and any other relevant details."
              {...register('incidentDescription')}
            />
            {errors.incidentDescription && (
              <p className="text-xs text-destructive">{errors.incidentDescription.message}</p>
            )}
            <p className="text-xs text-muted-foreground">Our AI will extract key information from your description.</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Estimated Loss Amount (optional)</label>
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
          </div>

          {createClaim.error && (
            <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              Failed to submit claim. Please check your policy number and try again.
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={isSubmitting || createClaim.isPending}
              className="rounded-md bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {createClaim.isPending ? 'Submitting...' : 'Submit Claim'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/client')}
              className="rounded-md border px-6 py-2 text-sm hover:bg-muted transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
