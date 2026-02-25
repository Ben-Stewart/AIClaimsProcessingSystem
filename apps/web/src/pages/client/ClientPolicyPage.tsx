import { ShieldCheck, CalendarDays, AlertCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { formatDate } from '@/lib/utils';

const SERVICE_LABELS: Record<string, string> = {
  PHYSIOTHERAPY: 'Physiotherapy',
  MASSAGE_THERAPY: 'Massage Therapy',
  CHIROPRACTIC: 'Chiropractic',
  PSYCHOLOGIST: 'Psychologist / Counselling',
  DENTAL_PREVENTIVE: 'Dental – Preventive',
  DENTAL_RESTORATIVE: 'Dental – Restorative',
  VISION_CARE: 'Vision Care',
};

const COVERAGE_DESCRIPTIONS: Record<string, string> = {
  COMPREHENSIVE: 'Covers all eligible paramedical, dental, and vision expenses up to the annual maximum.',
  PARAMEDICAL: 'Covers registered paramedical practitioners including physiotherapy, massage therapy, chiropractic, and mental health counselling.',
  DENTAL_BASIC: 'Covers preventive and basic dental services including cleanings, examinations, fillings, and extractions.',
  DENTAL_MAJOR: 'Covers major restorative dental services including crowns, bridges, dentures, and root canals.',
  VISION: 'Covers vision care expenses including eye examinations, prescription eyeglasses, and contact lenses.',
  'EMPLOYEE BENEFITS PLAN': 'Covers all eligible paramedical, dental, and vision expenses up to the annual maximum.',
};

function getCoverageDescription(coverageType: string): string {
  return COVERAGE_DESCRIPTIONS[coverageType.toUpperCase()] ?? `Coverage for ${coverageType} incidents.`;
}

function PolicyStatus({ effectiveDate, expiryDate }: { effectiveDate: string; expiryDate: string }) {
  const now = new Date();
  const expiry = new Date(expiryDate);
  const effective = new Date(effectiveDate);
  const daysUntilExpiry = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (now < effective) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-yellow-100 px-3 py-1 text-xs font-medium text-yellow-700">
        <AlertCircle className="h-3.5 w-3.5" />
        Not yet active
      </span>
    );
  }
  if (now > expiry) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-700">
        <AlertCircle className="h-3.5 w-3.5" />
        Expired
      </span>
    );
  }
  if (daysUntilExpiry <= 30) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-100 px-3 py-1 text-xs font-medium text-orange-700">
        <AlertCircle className="h-3.5 w-3.5" />
        Expires in {daysUntilExpiry} days
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
      <ShieldCheck className="h-3.5 w-3.5" />
      Active
    </span>
  );
}

export function ClientPolicyPage() {
  const { user } = useAuth();
  const policy = user?.policy;
  const [rcExpanded, setRcExpanded] = useState(false);

  if (!policy) {
    return (
      <div className="rounded-xl border bg-card p-10 text-center">
        <ShieldCheck className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
        <p className="font-medium text-sm">No policy linked</p>
        <p className="text-xs text-muted-foreground mt-1">Contact support to link a policy to your account.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">My Policy</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Your current coverage details</p>
      </div>

      {/* Header card */}
      <div className="rounded-xl border bg-card p-5 space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Policy Number</p>
            <p className="font-mono font-semibold text-lg">{policy.policyNumber}</p>
          </div>
          {policy.effectiveDate && policy.expiryDate && (
            <PolicyStatus effectiveDate={policy.effectiveDate} expiryDate={policy.expiryDate} />
          )}
        </div>

        <p className="text-sm text-muted-foreground">{getCoverageDescription(policy.coverageType)}</p>
      </div>

      {/* Coverage details */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Coverage Details</h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border bg-card p-4 space-y-1">
            <p className="text-xs text-muted-foreground">Plan Type</p>
            <p className="font-semibold text-sm">{policy.coverageType}</p>
          </div>
          <div className="rounded-xl border bg-card p-4 space-y-1">
            <p className="text-xs text-muted-foreground">Annual Maximum</p>
            <p className="font-semibold text-sm">${Number(policy.coverageLimit).toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Total reimbursable per benefit year</p>
          </div>
          <div className="rounded-xl border bg-card p-4 space-y-1">
            <p className="text-xs text-muted-foreground">Deductible</p>
            <p className="font-semibold text-sm">
              {Number(policy.deductible) === 0 ? 'None' : `$${Number(policy.deductible).toLocaleString()}`}
            </p>
            <p className="text-xs text-muted-foreground">Your out-of-pocket before benefits apply</p>
          </div>
          <div className="rounded-xl border bg-card p-4 space-y-1">
            <p className="text-xs text-muted-foreground">Reimbursement Rate</p>
            <p className="font-semibold text-sm">{Math.round((policy.percentCovered ?? 0.8) * 100)}%</p>
            <p className="text-xs text-muted-foreground">Of eligible expenses covered</p>
          </div>
        </div>
      </div>

      {/* Reasonable & Customary limits */}
      {policy.reasonableAndCustomary && Object.keys(policy.reasonableAndCustomary).length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setRcExpanded(v => !v)}
            className="flex items-center justify-between w-full text-left mb-3 group"
          >
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide group-hover:text-foreground transition-colors">
              Reasonable &amp; Customary Limits
            </h2>
            {rcExpanded
              ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
              : <ChevronRight className="h-4 w-4 text-muted-foreground" />
            }
          </button>
          {rcExpanded && (
            <div className="rounded-xl border bg-card divide-y">
              {Object.entries(policy.reasonableAndCustomary).map(([serviceKey, limit]) => (
                <div key={serviceKey} className="flex items-center justify-between px-4 py-3">
                  <p className="text-sm">{SERVICE_LABELS[serviceKey] ?? serviceKey.replace(/_/g, ' ')}</p>
                  <div className="text-right">
                    <p className="text-sm font-semibold">${Number(limit).toLocaleString()}<span className="text-xs font-normal text-muted-foreground"> / session</span></p>
                    <p className="text-xs text-muted-foreground">You receive ${Math.round(Number(limit) * (policy.percentCovered ?? 0.8)).toLocaleString()}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Policy dates */}
      {policy.effectiveDate && policy.expiryDate && (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Policy Period</h2>
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-3">
              <CalendarDays className="h-5 w-5 text-muted-foreground shrink-0" />
              <div className="flex gap-6 flex-wrap">
                <div>
                  <p className="text-xs text-muted-foreground">Effective Date</p>
                  <p className="font-medium text-sm">{formatDate(policy.effectiveDate)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Expiry Date</p>
                  <p className="font-medium text-sm">{formatDate(policy.expiryDate)}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Info note */}
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
        <p className="font-medium mb-1">Filing a claim?</p>
        <p className="text-xs">
          We cover <strong>{Math.round((policy.percentCovered ?? 0.8) * 100)}%</strong> of eligible expenses up to the reasonable &amp; customary limit per service, up to your annual maximum of <strong>${Number(policy.coverageLimit).toLocaleString()}</strong>.
          {Number(policy.deductible) > 0 && (
            <> A deductible of <strong>${Number(policy.deductible).toLocaleString()}</strong> applies.</>
          )}
        </p>
      </div>
    </div>
  );
}
