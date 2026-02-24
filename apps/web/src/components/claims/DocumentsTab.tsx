import { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Upload, FileText, Image, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate, formatConfidence, confidenceColor, cn } from '@/lib/utils';
import { DocumentType, ExtractionStatus, type ApiResponse, type Document } from '@claims/shared';

const DOC_TYPE_OPTIONS = [
  { value: DocumentType.DAMAGE_PHOTO, label: 'Damage Photo' },
  { value: DocumentType.POLICE_REPORT, label: 'Police Report' },
  { value: DocumentType.MEDICAL_RECORD, label: 'Medical Record' },
  { value: DocumentType.INVOICE, label: 'Invoice / Bill' },
  { value: DocumentType.REPAIR_ESTIMATE, label: 'Repair Estimate' },
  { value: DocumentType.DRIVERS_LICENSE, label: "Driver's License" },
  { value: DocumentType.WITNESS_STATEMENT, label: 'Witness Statement' },
  { value: DocumentType.OTHER, label: 'Other' },
];

const STATUS_ICON = {
  [ExtractionStatus.PENDING]: <Clock className="h-4 w-4 text-muted-foreground" />,
  [ExtractionStatus.PROCESSING]: <span className="h-4 w-4 animate-spin rounded-full border-2 border-purple-500 border-t-transparent" />,
  [ExtractionStatus.COMPLETE]: <CheckCircle className="h-4 w-4 text-green-500" />,
  [ExtractionStatus.FAILED]: <AlertCircle className="h-4 w-4 text-red-500" />,
};

export function DocumentsTab({ claimId }: { claimId: string }) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [docType, setDocType] = useState<DocumentType>(DocumentType.OTHER);
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);

  const { data } = useQuery({
    queryKey: ['claims', claimId, 'documents'],
    queryFn: () => api.get<ApiResponse<Document[]>>(`/api/claims/${claimId}/documents`),
    refetchInterval: 5000, // Poll while AI may be processing
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', docType);
      return api.uploadFile<ApiResponse<Document>>(`/api/claims/${claimId}/documents`, formData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['claims', claimId, 'documents'] });
      queryClient.invalidateQueries({ queryKey: ['claims', claimId] });
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadMutation.mutate(file);
    e.target.value = '';
  };

  const documents = data?.data ?? [];

  return (
    <div className="flex h-full">
      {/* Document list */}
      <div className="w-80 border-r flex flex-col">
        <div className="p-4 space-y-3 border-b">
          <select
            value={docType}
            onChange={(e) => setDocType(e.target.value as DocumentType)}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {DOC_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploadMutation.isPending}
            className="flex w-full items-center justify-center gap-2 rounded-md border-2 border-dashed px-4 py-3 text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
          >
            <Upload className="h-4 w-4" />
            {uploadMutation.isPending ? 'Uploading...' : 'Upload Document'}
          </button>
          <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="hidden" onChange={handleFileChange} />
        </div>

        <div className="flex-1 overflow-auto divide-y">
          {documents.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">No documents uploaded yet</div>
          ) : (
            documents.map((doc) => (
              <button
                key={doc.id}
                onClick={() => setSelectedDoc(doc)}
                className={cn(
                  'w-full text-left p-4 hover:bg-muted/30 transition-colors space-y-1',
                  selectedDoc?.id === doc.id && 'bg-muted/50',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {doc.mimeType.startsWith('image/') ? (
                      <Image className="h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className="truncate text-sm font-medium">{doc.originalName}</span>
                  </div>
                  {STATUS_ICON[doc.extractionStatus]}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{doc.type.replace(/_/g, ' ')}</span>
                  {doc.extractionConfidence !== null && (
                    <span className={cn('text-xs font-medium', confidenceColor(doc.extractionConfidence))}>
                      {formatConfidence(doc.extractionConfidence)}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{formatDate(doc.createdAt)}</p>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Extracted data panel */}
      <div className="flex-1 overflow-auto p-6">
        {!selectedDoc ? (
          <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
            Select a document to view AI extraction results
          </div>
        ) : (
          <div className="max-w-xl space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">{selectedDoc.originalName}</h2>
              {selectedDoc.extractionConfidence !== null && (
                <span className={cn('text-sm font-semibold', confidenceColor(selectedDoc.extractionConfidence))}>
                  {formatConfidence(selectedDoc.extractionConfidence)} confidence
                </span>
              )}
            </div>

            {selectedDoc.extractionStatus === ExtractionStatus.PROCESSING && (
              <div className="rounded-xl border bg-purple-50 p-4 text-sm text-purple-700">
                AI is analyzing this document...
              </div>
            )}

            {selectedDoc.extractionStatus === ExtractionStatus.FAILED && (
              <div className="rounded-xl border bg-red-50 p-4 text-sm text-red-700">
                Extraction failed. Try re-uploading the document.
              </div>
            )}

            {selectedDoc.extractedData && (
              <div className="rounded-xl border bg-card">
                <div className="border-b px-4 py-2.5">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Extracted Data</p>
                </div>
                <div className="divide-y">
                  {Object.entries(selectedDoc.extractedData).map(([key, value]) => (
                    <div key={key} className="grid grid-cols-2 gap-4 px-4 py-3">
                      <span className="text-xs text-muted-foreground capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                      <span className="text-sm break-words">{String(value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
