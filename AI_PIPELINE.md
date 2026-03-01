# AI Claims Processing Pipeline

This document describes the full automated AI pipeline that runs on every claim — from document upload through to a reimbursement recommendation or auto-approval decision — and the staff portal views that surface the results.

---

## Overview

The pipeline is split into two independent queues processed by the background worker (`apps/worker`):

1. **Document Analysis** — triggered immediately when a document is uploaded
2. **Claim Pipeline** — triggered automatically once all documents on a claim are fully extracted

```
Client uploads document(s)
        │
        ▼
┌─────────────────────────┐
│   Document Analysis     │  ← one job per document, runs immediately
│   (per document)        │
└────────────┬────────────┘
             │  all docs complete?
             ▼
┌────────────────────────────────────────────────────────┐
│                    Claim Pipeline                      │
│                                                        │
│   ┌─────────────────────┐  ┌────────────────────────┐  │
│   │   Fraud Detection   │  │   Benefit Assessment   │  │  ← run in parallel
│   └──────────┬──────────┘  └───────────┬────────────┘  │
│              └──────────────┬──────────┘               │
│                             ▼                          │
│                  ┌─────────────────────┐               │
│                  │ Reimbursement Calc. │               │
│                  └──────────┬──────────┘               │
│                             ▼                          │
│                  ┌─────────────────────┐               │
│                  │  Auto-Approval      │               │
│                  │  Decision           │               │
│                  └─────────────────────┘               │
└────────────────────────────────────────────────────────┘
```

Real-time progress is broadcast to connected clients via **Socket.IO** throughout every stage (see [Real-Time Events](#real-time-events)).

---

## Stage 1 — Document Analysis

**Trigger:** A document is uploaded to a claim via the API. A job is immediately added to the `document-analysis` BullMQ queue.

**Source:** [`apps/worker/src/processors/documentAnalysis.processor.ts`](apps/worker/src/processors/documentAnalysis.processor.ts)

### Extraction engine selection

The worker chooses between two extraction engines based on the file type and configuration:

| Condition | Engine used |
|-----------|-------------|
| File is an image (`PNG`, `JPEG`, `WebP`, `HEIC`) | GPT-4o Vision |
| `AZURE_DI_ENDPOINT` is not configured | GPT-4o Vision (fallback) |
| PDF/text file + Azure DI is configured | Azure Document Intelligence |

GPT-4o vision extraction is implemented in [`apps/worker/src/services/imageAnalysis.service.ts`](apps/worker/src/services/imageAnalysis.service.ts). Azure Document Intelligence extraction is implemented in [`apps/worker/src/services/documentIntelligence.service.ts`](apps/worker/src/services/documentIntelligence.service.ts).

### What GPT-4o Vision extracts

GPT-4o receives the document as a high-resolution image alongside a document-type-specific structured prompt. The prompt varies by document type:

**Receipt / Invoice**
- Vendor/provider name and address
- Service date and receipt date
- Total amount and line items
- Payment method
- Invoice or receipt number
- `documentQuality`: `GOOD | FAIR | SUSPICIOUS`
- `tamperingIndicators`: array of strings describing any smudges, erasures, whiteout, inconsistent fonts, corrected amounts or dates

**Medical Record / Referral Letter**
- Patient name
- Provider name and credentials
- Diagnosis codes and descriptions
- Treatment dates and recommendations

**Treatment Plan / Explanation of Benefits**
- Planned procedures and estimated costs
- Covered vs. non-covered items
- Member name and policy identifiers

**Dental X-Ray**
- Visible pathology indicators
- Teeth notation
- Estimated treatment complexity

Each prompt instructs the model to return structured JSON only and to include a `confidence` score (0–100), which is normalised to 0–1 and stored against the document record.

### Error handling

If extraction fails, the document's `extractionStatus` is set to `FAILED` and the error message is stored in `extractionError`. Failed documents are not counted as pending when the pipeline trigger check runs — only `PENDING` and `PROCESSING` documents block the pipeline.

### Pipeline trigger

After each document is successfully extracted, the worker counts how many documents on the same claim still have status `PENDING` or `PROCESSING`. When that count reaches zero, a new `claim-pipeline` job is queued automatically (with `attempts: 2` for retry resilience).

---

## Stage 2 — Claim Pipeline

**Trigger:** All documents on a claim reach `COMPLETE` extraction status.

**Source:** [`apps/worker/src/processors/claimPipeline.processor.ts`](apps/worker/src/processors/claimPipeline.processor.ts)

The claim status is set to `AI_PROCESSING`, then **fraud detection and benefit assessment run in parallel**. Reimbursement calculation runs after both complete, as it depends on the benefit assessment result.

If the pipeline throws at any stage, the claim status is rolled back to `DOCUMENTS_UNDER_REVIEW` so staff can manually investigate and re-trigger if needed.

---

## Stage 2a — Fraud Detection

**Source:** [`apps/worker/src/services/fraudDetection.service.ts`](apps/worker/src/services/fraudDetection.service.ts)

Fraud detection combines **rule-based signals** and an **LLM narrative consistency check**. Each signal carries a weighted contribution to a composite risk score (0–1).

### Rule-based signals

| Signal | Weight | Trigger condition |
|--------|--------|-------------------|
| `early_claim` | 0.30 | Claim service date is within 30 days of policy inception |
| `multiple_claims` | 0.20 | 2 or more prior claims on the same policy in the past 24 months |
| `excessive_amount` | 0.25 | Claimed amount is > 2.5× the Reasonable & Customary (R&C) limit for the service type |
| `high_amount` | 0.15 | Claimed amount is 1.5–2.5× the R&C limit |
| `elevated_amount` | 0.00 | Claimed amount is 1.0–1.5× the R&C limit (informational only, no score contribution) |
| `round_number_billing` | 0.10 | Claimed amount ≥ $100 and is an exact multiple of $50 |
| `name_mismatch` | 0.30 | Patient/member name extracted from documents does not match the policy holder name |
| `provider_mismatch` | 0.25 | Provider name on documents does not match the provider stated on the claim |
| `date_inconsistency` | 0.25 | Any extracted service/invoice date differs from the claimed service date by more than 7 days |
| `document_tampering` | 0.35 | GPT-4o flagged `documentQuality: SUSPICIOUS` or returned non-empty `tamperingIndicators` |
| `duplicate_document` | 0.35 | An invoice or receipt number extracted from this claim's documents already exists on a different claim |
| `future_dated_document` | 0.30 | Any extracted date on a document is in the future |

Name matching is fuzzy: it normalises case and punctuation, checks for substring containment, and falls back to matching just the last word (surname), so "John Smith" matches "J. Smith".

Date fields checked for `date_inconsistency` and `future_dated_document` are: `serviceDate`, `visitDate`, `invoiceDate`, `receiptDate`, `referralDate`, `dateIssued`.

Provider name fields searched are: `providerName`, `vendorName`, `clinicName`.

### LLM narrative consistency check

The full extracted data from all documents (as serialised JSON) is always passed to GPT-4o for a narrative check. However, if the claimant did not provide a written description (`serviceDescription` is blank), the function returns immediately with no signals — no API call is made.

When a description is present, GPT-4o receives:

- Policy holder name
- Claimed service date and amount
- Service type
- The written description
- All extracted document data (as JSON)

The model is instructed to check specifically for:
1. Patient/member name mismatches versus the policy holder
2. Date mismatches versus the claimed service date
3. Amount discrepancies
4. Service type inconsistencies

Inconsistencies are returned with a severity (`LOW | MEDIUM | HIGH`) and converted to additional `narrative_inconsistency` fraud signals with weights of 0.05, 0.15, and 0.30 respectively.

### Risk score and recommendation

The composite risk score is the sum of all signal weights, capped at 1.0.

**Risk level** is determined by the score band (from `RISK_THRESHOLDS` in `packages/shared`):

| Score range | Risk level |
|-------------|------------|
| 0.00 – 0.29 | LOW |
| 0.30 – 0.59 | MEDIUM |
| 0.60 – 0.79 | HIGH |
| 0.80 – 1.00 | CRITICAL |

**Recommendation** uses separate thresholds (from `getRecommendation()` in the fraud service):

| Score | Recommendation |
|-------|----------------|
| < 0.25 | `APPROVE` — proceed with standard adjudication |
| 0.25 – 0.69 | `FLAG_FOR_REVIEW` — flag for additional review before approval |
| ≥ 0.70 | `ESCALATE_SIU` — escalate to Special Investigations Unit |

Note: the ESCALATE_SIU recommendation triggers at a score of 0.70, which spans both HIGH and CRITICAL risk levels. A claim can have a HIGH risk level but still receive an ESCALATE_SIU recommendation.

The `FraudAnalysis` record is upserted with a hardcoded `confidence` of 0.85 (representing model consistency across the rule set).

---

## Stage 2b — Benefit Assessment

**Source:** [`apps/worker/src/services/benefitAssessment.service.ts`](apps/worker/src/services/benefitAssessment.service.ts)

GPT-4o is used as an expert paramedical and dental benefits assessor. It receives:

- Service type (e.g. `PHYSIOTHERAPY`, `DENTAL_RESTORATIVE`, `MASSAGE_THERAPY`, `CHIROPRACTIC`, `PSYCHOLOGIST`, `DENTAL_PREVENTIVE`, `VISION_CARE`)
- Written description (if provided)
- Policy coverage limit and deductible
- All extracted document data (as structured JSON)

The model returns:

| Field | Description |
|-------|-------------|
| `claimSeverity` | `MINOR \| MODERATE \| SEVERE \| CATASTROPHIC` |
| `estimatedTreatmentCost` | Numeric cost estimate based on the documents, or `null` |
| `treatmentCategories` | Array of categorised findings, each with a `category`, `description`, and `confidence` score |
| `coverageApplicable` | Boolean — whether the service type is covered under this policy |
| `coverageReason` | Plain-language explanation of the coverage determination |
| `overallConfidence` | Model confidence 0–1 |
| `adjusterSummary` | Plain-language summary for the adjuster (returned by the model but not currently stored) |

This result is stored as an `AIAssessment` record along with `processingTimeMs` (time to store, not total model latency) and `modelVersions: { gpt: 'gpt-4o' }`. It is the primary input into reimbursement calculation.

---

## Stage 3 — Reimbursement Calculation

**Source:** [`apps/worker/src/services/reimbursementCalculation.service.ts`](apps/worker/src/services/reimbursementCalculation.service.ts)

Reimbursement calculation runs after both fraud detection and benefit assessment are complete.

### Comparable claims lookup

Before calling the model, the worker queries the database for up to 10 recently paid claims (`status: PAID`) of the same service type that have an adjuster-confirmed reimbursement amount (`adjusterDecision` is non-null). These are passed to the model as grounding data along with the claim severity from the AI assessment.

### GPT-4o reimbursement prompt

The model receives:

- Service type and claim severity from the AI assessment
- Estimated treatment cost
- The policy's Reasonable & Customary limit for this service type (from the `reasonableAndCustomary` JSON field on the policy)
- Reimbursement rate (the policy's `percentCovered`, e.g. 80%)
- Annual maximum (`coverageLimit`) and deductible
- Whether coverage was determined applicable
- Historical comparable reimbursements (service type, severity, adjuster-confirmed amount)

The model is instructed to calculate using the formula:

```
reimbursement = min(estimated_cost, R&C_limit) × reimbursement_rate − deductible
                capped at annual_maximum
```

It returns:

| Field | Description |
|-------|-------------|
| `recommendedAmount` | The single recommended reimbursement figure |
| `rangeLow` / `rangeHigh` | A plausible reimbursement range |
| `methodology` | Plain-language explanation of how the amount was derived |
| `confidence` | Model confidence 0–1 |

The `ReimbursementRecommendation` record also stores `comparableCount` — the number of historical claims that were actually used as grounding data.

---

## Stage 4 — Auto-Approval Decision

**Source:** [`apps/worker/src/processors/claimPipeline.processor.ts`](apps/worker/src/processors/claimPipeline.processor.ts)

After all three stages complete, the pipeline applies a final binary decision:

```
if fraud risk level == LOW
   AND recommended reimbursement <= AUTO_APPROVE_THRESHOLD
→ APPROVED automatically, reimbursement amount locked in

else
→ PENDING_ADJUSTER_DECISION (human review required)
```

The default threshold is controlled by the `AUTO_APPROVE_THRESHOLD` environment variable (defaults to `500` if unset). Both the fraud risk level and the recommended amount must independently meet their criteria — a low-risk claim above the threshold still goes to an adjuster.

When auto-approved, the claim status is set to `APPROVED`, the `lossAmount` on the claim record is written with the recommended reimbursement amount, and an audit event is created with `actorType: AI_SYSTEM`.

When sent for human review, the claim status is set to `PENDING_ADJUSTER_DECISION` and a `claim:ready_for_review` Socket.IO event is broadcast. The adjuster sees all pipeline outputs — extracted document data, fraud signals, benefit assessment, and reimbursement recommendation — in the staff portal before making a final decision.

---

## Staff Portal — Claim Detail Tabs

The claim detail page (`apps/web/src/pages/ClaimDetailPage.tsx`) surfaces the pipeline results across six tabs. A purple "AI Processing" badge is shown in the header whenever BullMQ jobs are actively running for the claim.

### Overview

Displays the claimant's written service description, adjuster notes (if any), and key policy facts: policy number, coverage type, coverage limit, and deductible.

### Documents

Lists all uploaded documents with their type, extraction status (`PENDING | PROCESSING | COMPLETE | FAILED`), file size, and extracted data. Allows uploading new documents, which immediately triggers a new `document_analysis` job.

### AI Assessment

**Source:** [`apps/web/src/components/claims/AssessmentTab.tsx`](apps/web/src/components/claims/AssessmentTab.tsx)

Displays the `AIAssessment` record once available:

- **Claim Severity** — `MINOR | MODERATE | SEVERE | CATASTROPHIC` with colour coding (green → red)
- **AI Confidence** — overall model confidence as a percentage
- **Estimated Treatment Cost** — GPT-4o's cost estimate from the documents
- **Coverage Determination** — whether coverage applies and the model's plain-language reasoning
- **Treatment Areas** — each treatment category with its description and per-category confidence score

### Fraud Risk

**Source:** [`apps/web/src/components/claims/FraudTab.tsx`](apps/web/src/components/claims/FraudTab.tsx)

Displays the `FraudAnalysis` record once available:

- **Semicircular risk gauge** — visual 0–100 score with colour-coded zones (green / yellow / orange / red)
- **Risk level and recommendation** — e.g. "Low Risk — Proceed with standard adjudication"
- **Contributing signals** — each rule-based or LLM-derived signal with its factor name, weight, and description
- **Escalate to SIU button** — shown only when the recommendation is `ESCALATE_SIU` and the claim is still open; calls `POST /api/claims/:id/escalate`

### Reimbursement

**Source:** [`apps/web/src/components/claims/ReimbursementTab.tsx`](apps/web/src/components/claims/ReimbursementTab.tsx)

Displays the `ReimbursementRecommendation` record and the adjuster decision workflow:

- **Recommended amount** — large display of the AI-recommended figure with model confidence
- **Range visualisation** — a bar showing the low/high range with the recommended amount marked
- **Methodology** — the model's explanation of how the amount was calculated, plus the comparable claim count used as grounding
- **Adjuster decision form** — if no decision has been recorded yet, the adjuster can edit the amount and approve, or switch to a denial form with a required reason field
- **Confirmed decision panel** — once approved, shows the adjuster-confirmed amount and any rationale

### Activity

**Source:** [`apps/web/src/components/claims/AuditTab.tsx`](apps/web/src/components/claims/AuditTab.tsx)

A chronological timeline of all `AuditEvent` records for the claim, fetched from `GET /api/claims/:id/timeline`. AI-generated events are shown with a purple bot icon; human actions use a grey user icon. Up to three detail fields are shown per event inline.

---

## Real-Time Events

Throughout the pipeline, Socket.IO events are emitted to all clients subscribed to the claim's room. The frontend subscribes by emitting `subscribe:claim` when a claim detail page opens.

| Event | When emitted |
|-------|-------------|
| `ai:job:started` | Job begins processing (document or pipeline) |
| `ai:job:progress` | Progress update at each stage, includes a `stage` label and 0–100 `progress` value |
| `ai:job:completed` | Job finishes successfully, includes a plain-text `resultSummary` |
| `ai:job:failed` | Job throws an unhandled error, includes the error message |
| `claim:updated` | Claim status or fields change (e.g. auto-approval sets `APPROVED`) |
| `claim:ready_for_review` | Pipeline completes without auto-approval; claim moves to adjuster queue |

The frontend uses these events to invalidate React Query caches and show the live progress panel above the tab bar.

---

## Audit Trail

Every action taken by the AI system is recorded as an `AuditEvent` with `actorType: AI_SYSTEM`. The events logged throughout the pipeline are:

| Action | When |
|--------|------|
| `DOCUMENT_ANALYZED` | Each document extraction completes (includes `documentId`, `documentType`, `confidence`) |
| `FRAUD_SCORED` | Fraud detection completes (includes `riskScore`, `riskLevel`, `signalCount`) |
| `BENEFIT_ASSESSED` | Benefit assessment completes (includes `severity`, `estimatedCost`, `confidence`) |
| `REIMBURSEMENT_CALCULATED` | Reimbursement calculation completes (includes `recommended`, `range.low`, `range.high`, `comparableCount`) |
| `AUTO_APPROVED` | Claim is auto-approved (includes `riskLevel`, `amount`, `threshold`) |
| `AI_PIPELINE_COMPLETE` | Pipeline finishes without auto-approval (claim moves to adjuster queue) |

These events are visible in the **Activity** tab in the staff portal and are used for compliance tracing.
