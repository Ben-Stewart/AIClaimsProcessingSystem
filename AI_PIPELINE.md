# AI Claims Processing Pipeline

This document describes the full automated AI pipeline that runs on every claim — from document upload through to a reimbursement recommendation or auto-approval decision.

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
│                    Claim Pipeline                       │
│                                                         │
│   ┌─────────────────────┐  ┌────────────────────────┐  │
│   │   Fraud Detection   │  │   Benefit Assessment   │  │  ← run in parallel
│   └──────────┬──────────┘  └───────────┬────────────┘  │
│              └──────────────┬──────────┘               │
│                             ▼                           │
│                  ┌─────────────────────┐               │
│                  │ Reimbursement Calc. │               │
│                  └──────────┬──────────┘               │
│                             ▼                           │
│                  ┌─────────────────────┐               │
│                  │  Auto-Approval      │               │
│                  │  Decision           │               │
│                  └─────────────────────┘               │
└────────────────────────────────────────────────────────┘
```

---

## Stage 1 — Document Analysis

**Trigger:** A document is uploaded to a claim via the API. A job is immediately added to the `document_analysis` queue.

**Source:** [`apps/worker/src/processors/documentAnalysis.processor.ts`](apps/worker/src/processors/documentAnalysis.processor.ts)

### Extraction engine selection

The worker chooses between two extraction engines based on the file type and configuration:

| Condition | Engine used |
|-----------|-------------|
| File is an image (`PNG`, `JPEG`, `WebP`, `HEIC`) | GPT-4o Vision |
| `AZURE_DI_ENDPOINT` is not configured | GPT-4o Vision (fallback) |
| PDF/text file + Azure DI is configured | Azure Document Intelligence |

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

### Pipeline trigger

After each document is successfully extracted, the worker counts how many documents on the same claim still have status `PENDING` or `PROCESSING`. When that count reaches zero, a new `claim_pipeline` job is queued automatically.

---

## Stage 2 — Claim Pipeline

**Trigger:** All documents on a claim reach `COMPLETE` extraction status.

**Source:** [`apps/worker/src/processors/claimPipeline.processor.ts`](apps/worker/src/processors/claimPipeline.processor.ts)

The claim status is set to `AI_PROCESSING`, then **fraud detection and benefit assessment run in parallel**. Reimbursement calculation runs after both complete, as it depends on the benefit assessment result.

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

### LLM narrative consistency check

If the claimant provided a written description, GPT-4o is used as a second-pass fraud reviewer. It receives:

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

Inconsistencies are returned with a severity (`LOW | MEDIUM | HIGH`) and converted to additional fraud signals with weights of 0.05, 0.15, and 0.30 respectively.

If no description was provided by the claimant, this step is skipped entirely.

### Risk score and recommendation

The composite risk score is the sum of all signal weights, capped at 1.0.

| Score range | Risk level | Recommendation |
|-------------|------------|----------------|
| 0.00 – 0.29 | LOW | Approve |
| 0.30 – 0.59 | MEDIUM | Flag for review |
| 0.60 – 0.79 | HIGH | Flag for review |
| 0.80 – 1.00 | CRITICAL | Escalate to SIU |

---

## Stage 2b — Benefit Assessment

**Source:** [`apps/worker/src/services/benefitAssessment.service.ts`](apps/worker/src/services/benefitAssessment.service.ts)

GPT-4o is used as an expert paramedical and dental benefits assessor. It receives:

- Service type (e.g. `PHYSIOTHERAPY`, `DENTAL_RESTORATIVE`)
- Written description (if provided)
- Policy coverage limit and deductible
- All extracted document data (as structured JSON)

The model returns:

| Field | Description |
|-------|-------------|
| `claimSeverity` | `MINOR \| MODERATE \| SEVERE \| CATASTROPHIC` |
| `estimatedTreatmentCost` | Numeric cost estimate based on the documents |
| `treatmentCategories` | Array of categorised findings, each with a description and confidence score |
| `coverageApplicable` | Boolean — whether the service type is covered under this policy |
| `coverageReason` | Plain-language explanation of the coverage determination |
| `overallConfidence` | Model confidence 0–1 |

This result is stored as an `AIAssessment` record and is the primary input into reimbursement calculation.

---

## Stage 3 — Reimbursement Calculation

**Source:** [`apps/worker/src/services/reimbursementCalculation.service.ts`](apps/worker/src/services/reimbursementCalculation.service.ts)

Reimbursement calculation runs after both fraud detection and benefit assessment are complete.

### Comparable claims lookup

Before calling the model, the worker queries the database for up to 10 recently paid claims of the same service type that have an adjuster-confirmed reimbursement amount. These are passed to the model as grounding data.

### GPT-4o reimbursement prompt

The model receives:

- Service type and claim severity from the AI assessment
- Estimated treatment cost
- The policy's Reasonable & Customary limit for this service type
- Reimbursement rate (e.g. 80%)
- Annual maximum and deductible
- Whether coverage was determined applicable
- Historical comparable reimbursements

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

When auto-approved, the claim status is set to `APPROVED`, the reimbursement amount is written to the claim record, and an audit event is created with `actorType: AI_SYSTEM` and the reason logged.

When sent for human review, the adjuster sees all four outputs — extracted document data, fraud signals, benefit assessment, and reimbursement recommendation — in the staff portal before making a final decision.

---

## Audit Trail

Every action taken by the AI system is recorded as an `AuditEvent` with `actorType: AI_SYSTEM`. The events logged throughout the pipeline are:

| Action | When |
|--------|------|
| `DOCUMENT_ANALYZED` | Each document extraction completes |
| `FRAUD_SCORED` | Fraud detection completes (includes risk score, level, signal count) |
| `BENEFIT_ASSESSED` | Benefit assessment completes (includes severity, estimated cost, confidence) |
| `REIMBURSEMENT_CALCULATED` | Reimbursement calculation completes (includes recommended amount and range) |
| `AUTO_APPROVED` | Claim is auto-approved (includes risk level, amount, and threshold used) |
| `AI_PIPELINE_COMPLETE` | Pipeline finishes without auto-approval (claim moves to adjuster queue) |

These events are visible in the claim audit log in the staff portal and are used for compliance tracing.
