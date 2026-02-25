# AI Claims Processing System

An AI-powered insurance claims processing platform with two portals: a **staff portal** for adjusters/supervisors/admins, and a **client portal** for policyholders to file and track their own claims.

---

## Demo Accounts

All demo accounts use the password: **`demo1234`**

### Staff Portal — `http://localhost:3000/login`

| Email | Password | Role | Access |
|---|---|---|---|
| `admin@demo.com` | `demo1234` | Admin | Full system access |
| `supervisor@demo.com` | `demo1234` | Supervisor | Claims oversight + analytics |
| `adjuster@demo.com` | `demo1234` | Adjuster | Review, approve, and deny claims |

### Client Portal — `http://localhost:3000/login`

| Email | Password | Role | Policy |
|---|---|---|---|
| `client@demo.com` | `demo1234` | Client | `POL-DEMO-0001` |

---

## Logging In

Both staff and client accounts share a single login page at **`http://localhost:3000/login`**. Clickable demo credential chips are shown on the page for quick sign-in.

After login, each role is automatically redirected to the correct portal:
- **Client** → `/client` (client claims portal)
- **Adjuster / Supervisor / Admin** → `/` (staff dashboard)

---

## Registering a New Client Account

New policyholders can self-register without admin involvement:

1. Go to **`http://localhost:3000/client/register`**
2. Fill in:
   - **Full Name** — your name
   - **Email** — your email address
   - **Password** — minimum 8 characters
   - **Policy Number** — must match an existing policy in the system (e.g. `POL-DEMO-0001`)
3. Click **Create account** — you'll be logged in and taken to your portal immediately

> Each policy can only have one registered client account. If you see "An account is already registered for this policy", use the sign-in page instead.

---

## Filing a Claim (Client)

1. Log in to the client portal
2. Click **File a Claim**
3. Your policy number is pre-filled — select the incident date, type, and describe what happened
4. Click **Submit Claim**
5. Upload any supporting documents (receipts, referral letters, treatment plans) from the claim detail page
6. The AI pipeline runs automatically — low-risk claims under **$5,000** are approved without any adjuster action

---

## Reviewing Claims (Staff)

1. Log in to the staff portal
2. Click **Claims** in the sidebar to see all claims
3. Click any claim to open the detail view with five tabs:
   - **Overview** — status, policy details, adjuster notes
   - **Documents** — uploaded files and AI extraction results
   - **AI Assessment** — claim severity, coverage analysis
   - **Fraud Risk** — risk score, signals, and anomalies
   - **Reimbursement** — AI-recommended amount and adjuster decision tools
4. Use **Approve**, **Deny**, **Request Info**, or **Escalate** to action the claim

---

## Local Development Setup

### Prerequisites
- Node.js 20+
- pnpm (`npm install -g pnpm`)

### Install dependencies
```bash
pnpm install
```

### Configure environment
Copy `.env.example` to `.env` (or edit `.env` directly) and fill in:
- `DATABASE_URL` — PostgreSQL connection string (recommended: [Neon](https://neon.tech) free tier)
- `REDIS_URL` — Redis connection string (recommended: [Upstash](https://upstash.com) free tier)
- `JWT_SECRET` / `JWT_REFRESH_SECRET` — random 64-char strings
- `OPENAI_API_KEY` — from [platform.openai.com](https://platform.openai.com/api-keys)

### Apply database schema
```bash
pnpm --filter @claims/api db:generate
```
Then push the schema:
```bash
cd apps/api && DATABASE_URL="<your-url>" npx prisma db push
```

### Seed demo data
```bash
pnpm --filter @claims/api db:seed
```

### Start all services
```bash
# Terminal 1 — API server (port 3001)
pnpm --filter @claims/api dev

# Terminal 2 — Background worker
pnpm --filter @claims/worker dev

# Terminal 3 — Web app (port 3000)
pnpm --filter @claims/web dev
```

Then open **`http://localhost:3000`**.

---

## AI Pipeline

The system runs a fully automated AI pipeline on every claim — document extraction, fraud detection, benefit assessment, reimbursement calculation, and an auto-approval decision.

For a detailed breakdown of each stage, the decision logic, signal weights, and model prompts, see **[AI_PIPELINE.md](AI_PIPELINE.md)**.

---

## Auto-Approval Threshold

Claims are automatically approved by the AI (no adjuster needed) when:
- Fraud risk level is **LOW**
- AI reimbursement estimate is **≤ $5,000**

To change the threshold, update `AUTO_APPROVE_THRESHOLD` in `.env`:
```
AUTO_APPROVE_THRESHOLD=10000
```
