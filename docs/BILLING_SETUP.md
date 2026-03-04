# Billing Setup Guide (Stripe + Firebase Admin)

This guide explains how to obtain all keys/files required by the V1 credit system and wire them into EazyUI.

## 1) Required Environment Variables

Set these for `apps/api`:

```env
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_PUBLISHABLE_KEY=pk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
STRIPE_PRICE_PRO_MONTHLY=price_xxx
STRIPE_PRICE_TEAM_MONTHLY=price_xxx
STRIPE_PRICE_TOPUP_1000=price_xxx
# optional: comma-separated operations that require an active paid plan
# default: generate_image,synthesize_screen_images
BILLING_PAID_ONLY_OPERATIONS=generate_image,synthesize_screen_images

# choose one Firebase Admin env method (no repo file path required):
FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
# or
FIREBASE_SERVICE_ACCOUNT_BASE64=eyJ0eXBlIjoic2VydmljZV9hY2NvdW50IiwiLi4u
```

## 2) Firebase Admin Credentials (for API auth verification)

Your API verifies Firebase ID tokens using `firebase-admin`.

## Option A: Inline service account JSON (env only)

1. Open Firebase Console.
2. Go to `Project settings` -> `Service accounts`.
3. Click `Generate new private key`.
4. Download the JSON file.
5. Open the JSON file and copy all content into `FIREBASE_SERVICE_ACCOUNT_JSON` (single line in `.env`).

```env
FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
```

## Option B: Base64 service account (env only)

1. Open Firebase Console.
2. Go to `Project settings` -> `Service accounts`.
3. Click `Generate new private key`.
4. Download the JSON file.
5. Base64 encode the file and set `FIREBASE_SERVICE_ACCOUNT_BASE64`.

PowerShell base64 helper:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\path\service-account.json"))
```

Use output as:

```env
FIREBASE_SERVICE_ACCOUNT_BASE64=eyJ0eXBlIjoic2VydmljZV9hY2NvdW50IiwiLi4u
```

## Option C: Application default credentials

If running on a cloud runtime with ADC configured, you can omit both env vars and rely on `applicationDefault()`.

## 3) Stripe Keys

1. Open Stripe Dashboard.
2. Go to `Developers` -> `API keys`.
3. Copy:
   - `Publishable key` -> `STRIPE_PUBLISHABLE_KEY`
   - `Secret key` -> `STRIPE_SECRET_KEY`

Use test keys for local/dev and live keys only in production.

## 4) Create Stripe Products/Prices and Get Price IDs

Create 3 prices in Stripe:

1. **Pro Monthly Subscription**
   - Billing: recurring monthly
   - Copy `price_...` -> `STRIPE_PRICE_PRO_MONTHLY`

2. **Team Monthly Subscription**
   - Billing: recurring monthly
   - Copy `price_...` -> `STRIPE_PRICE_TEAM_MONTHLY`

3. **Top-up 1000 Credits**
   - Billing: one-time
   - Copy `price_...` -> `STRIPE_PRICE_TOPUP_1000`

You can create products/prices from:
- Dashboard: `Product catalog`
- or Stripe CLI/API (optional).

## 5) Webhook Secret (`STRIPE_WEBHOOK_SECRET`)

The API endpoint is:

`POST /api/stripe/webhook`

## Local development (Stripe CLI)

1. Install Stripe CLI and login:

```bash
stripe login
```

2. Start listener forwarding to your local API:

```bash
stripe listen --forward-to localhost:3001/api/stripe/webhook
```

3. Copy the printed signing secret (`whsec_...`) into:

`STRIPE_WEBHOOK_SECRET`

## Production

1. Stripe Dashboard -> `Developers` -> `Webhooks`.
2. Add endpoint: `https://<your-api-domain>/api/stripe/webhook`
3. Subscribe at minimum to:
   - `checkout.session.completed`
   - `invoice.paid`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. Copy endpoint signing secret (`whsec_...`) -> `STRIPE_WEBHOOK_SECRET`.

## 6) Configure Frontend Origin / Success URLs

Checkout and portal routes use URLs passed from web client:
- success URL
- cancel URL
- return URL

Ensure `FRONTEND_URL` in API env matches your web app origin for CORS.

## 7) Restart Services

After setting env vars:

```bash
npm run dev --workspace=@eazyui/api
npm run dev --workspace=apps/web
```

## 8) Quick Verification Checklist

1. Login in web app.
2. Open Settings -> Billing tab.
3. Confirm summary loads (plan + credits).
4. Click `Buy 1,000 Credits` and confirm Stripe checkout opens.
5. Complete test purchase in Stripe test mode.
6. Reopen Billing tab and verify ledger entry + increased balance.
7. Run a generation and verify credits decrease.

## 9) Idempotency (recommended)

For metered `POST` routes, send:

`X-Idempotency-Key: <stable-uuid-per-logical-request>`

If the same key is retried for the same operation, the API reuses the original billing reservation to prevent double-charge.

## 10) Security Notes

- Never commit service-account JSON or Stripe secret keys to git.
- Keep live and test Stripe keys isolated by environment.
- Rotate keys if exposed.
- Restrict access to deployment secrets.
