import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, CheckCircle2, XCircle, Clock, Upload } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate, cn } from '@/lib/utils';
import { ClaimStatus, CLAIM_STATUS_LABELS, DocumentType, type ApiResponse, type Claim } from '@claims/shared';
import { getSocket } from '@/lib/socket';

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

const FRIENDLY_STATUS: Record<ClaimStatus, string> = {
  [ClaimStatus.FNOL_RECEIVED]: 'Received — we\'ve got your claim',
  [ClaimStatus.DOCUMENTS_PENDING]: 'Waiting for documents',
  [ClaimStatus.DOCUMENTS_UNDER_REVIEW]: 'Reviewing your documents',
  [ClaimStatus.AI_PROCESSING]: 'AI is analyzing your claim',
  [ClaimStatus.COVERAGE_VERIFIED]: 'Coverage confirmed',
  [ClaimStatus.ASSESSMENT_COMPLETE]: 'Assessment complete',
  [ClaimStatus.FRAUD_REVIEW]: 'Under additional review',
  [ClaimStatus.PENDING_ADJUSTER_DECISION]: 'Awaiting final decision',
  [ClaimStatus.PENDING_ADDITIONAL_INFO]: 'We need more information from you',
  [ClaimStatus.APPROVED]: 'Approved',
  [ClaimStatus.DENIED]: 'Claim denied',
  [ClaimStatus.PAID]: 'Paid — reimbursement processed',
  [ClaimStatus.CLOSED]: 'Closed',
};

export function ClientClaimDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [docType, setDocType] = useState<DocumentType>(DocumentType.OTHER);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['client-claim', id],
    queryFn: () => api.get<ApiResponse<Claim>>(`/api/claims/${id}`),
  });

  const claim = data?.data;

  // Subscribe to real-time updates
  useEffect(() => {
    const socket = getSocket();
    if (!socket || !id) return;
    socket.emit('subscribe:claim', id);
    const onUpdate = () => queryClient.invalidateQueries({ queryKey: ['client-claim', id] });
    socket.on('claim:updated', onUpdate);
    socket.on('ai:job:completed', onUpdate);
    return () => {
      socket.emit('unsubscribe:claim', id);
      socket.off('claim:updated', onUpdate);
      socket.off('ai:job:completed', onUpdate);
    };
  }, [id, queryClient]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !id) return;
    setUploadError(null);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', docType);
      await api.uploadFile(`/api/claims/${id}/documents`, formData);
      queryClient.invalidateQueries({ queryKey: ['client-claim', id] });
    } catch {
      setUploadError('Upload failed. Please try again.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-6 w-32 animate-pulse rounded bg-muted" />
        <div className="h-32 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  if (!claim) {
    return <div className="text-center text-muted-foreground py-20">Claim not found.</div>;
  }

  const isApproved = claim.status === ClaimStatus.APPROVED || claim.status === ClaimStatus.PAID;
  const isDenied = claim.status === ClaimStatus.DENIED;
  const needsInfo = claim.status === ClaimStatus.PENDING_ADDITIONAL_INFO;
  const isProcessing = [
    ClaimStatus.FNOL_RECEIVED,
    ClaimStatus.DOCUMENTS_PENDING,
    ClaimStatus.DOCUMENTS_UNDER_REVIEW,
    ClaimStatus.AI_PROCESSING,
    ClaimStatus.COVERAGE_VERIFIED,
    ClaimStatus.ASSESSMENT_COMPLETE,
    ClaimStatus.FRAUD_REVIEW,
    ClaimStatus.PENDING_ADJUSTER_DECISION,
  ].includes(claim.status);

  return (
    <div className="space-y-5">
      <button
        onClick={() => navigate('/client')}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to claims
      </button>

      {/* Header */}
      <div className="rounded-xl border bg-card p-5 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground font-mono">{claim.claimNumber}</p>
            <h1 className="text-xl font-bold mt-0.5">
              {claim.serviceType.replace(/_/g, ' ')}
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Service on {formatDate(claim.serviceDate)} · Filed {formatDate(claim.createdAt)}
            </p>
          </div>
          <span className={cn('rounded-full px-3 py-1 text-sm font-medium shrink-0', STATUS_COLORS[claim.status])}>
            {CLAIM_STATUS_LABELS[claim.status]}
          </span>
        </div>

        {/* Status message */}
        {isApproved && (
          <div className="flex items-start gap-3 rounded-lg bg-green-50 border border-green-200 p-4">
            <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-green-800">Your claim has been approved</p>
              {claim.lossAmount != null && (
                <p className="text-2xl font-bold text-green-700 mt-1">
                  ${Number(claim.lossAmount).toLocaleString()}
                </p>
              )}
              {claim.reimbursementRecommendation && (
                <p className="text-sm text-green-700 mt-1">
                  Reimbursement amount: ${Number(claim.reimbursementRecommendation.recommendedAmount).toLocaleString()}
                </p>
              )}
              {claim.reimbursementRecommendation?.methodology && (
                <div className="mt-3 pt-3 border-t border-green-200">
                  <p className="text-xs font-semibold text-green-800 uppercase tracking-wide mb-1">Reimbursement Breakdown</p>
                  <p className="text-sm text-green-700 leading-relaxed">{claim.reimbursementRecommendation.methodology}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {isDenied && (
          <div className="flex items-start gap-3 rounded-lg bg-red-50 border border-red-200 p-4">
            <XCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-red-800">Your claim was not approved</p>
              {claim.adjusterNotes && (
                <p className="text-sm text-red-700 mt-1">{claim.adjusterNotes}</p>
              )}
            </div>
          </div>
        )}

        {isProcessing && (
          <div className="flex items-center gap-3 rounded-lg bg-muted/60 p-4">
            <Clock className="h-5 w-5 text-muted-foreground shrink-0" />
            <p className="text-sm text-muted-foreground">{FRIENDLY_STATUS[claim.status]}</p>
          </div>
        )}

        {needsInfo && (
          <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-4">
            <p className="font-semibold text-yellow-800 text-sm">Action required</p>
            <p className="text-sm text-yellow-700 mt-1">
              {claim.adjusterNotes ?? 'Please upload the requested documents below.'}
            </p>
          </div>
        )}
      </div>

      {/* Documents */}
      <div className="rounded-xl border bg-card p-5 space-y-4">
        <h2 className="font-semibold">Documents</h2>

        {/* Upload */}
        {!isDenied && claim.status !== ClaimStatus.CLOSED && (
          <div className="space-y-2">
            <div className="flex gap-2">
              <select
                value={docType}
                onChange={(e) => setDocType(e.target.value as DocumentType)}
                className="rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {Object.values(DocumentType).map((t) => (
                  <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-2 rounded-md border px-4 py-2 text-sm hover:bg-muted transition-colors disabled:opacity-50"
              >
                <Upload className="h-4 w-4" />
                {uploading ? 'Uploading...' : 'Upload file'}
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".pdf,image/*"
              onChange={handleUpload}
            />
            {uploadError && <p className="text-xs text-destructive">{uploadError}</p>}
          </div>
        )}

        {/* File list */}
        {claim.documents && claim.documents.length > 0 ? (
          <ul className="divide-y rounded-lg border">
            {claim.documents.map((doc) => (
              <li key={doc.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <div>
                  <p className="font-medium">{doc.originalName}</p>
                  <p className="text-xs text-muted-foreground">
                    {doc.type.replace(/_/g, ' ')} · {(doc.sizeBytes / 1024).toFixed(0)} KB · {formatDate(doc.createdAt)}
                  </p>
                </div>
                <span className={cn(
                  'rounded-full px-2 py-0.5 text-xs font-medium',
                  doc.extractionStatus === 'COMPLETE' ? 'bg-green-100 text-green-700' :
                  doc.extractionStatus === 'FAILED' ? 'bg-red-100 text-red-700' :
                  'bg-muted text-muted-foreground'
                )}>
                  {doc.extractionStatus}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No documents uploaded yet.</p>
        )}
      </div>

      {/* Description */}
      <div className="rounded-xl border bg-card p-5 space-y-2">
        <h2 className="font-semibold">Service Description</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">{claim.serviceDescription}</p>
      </div>
    </div>
  );
}
