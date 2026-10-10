# Clothing Store

A mobile-first website for a local clothing shop. Customers browse the catalogue and order on **WhatsApp** — there is no cart and no online payment. The owner manages products from his phone with a simple, installable admin app.

**Stack:** Next.js 14 (App Router, TypeScript) · Tailwind CSS · Supabase (Postgres, Auth, Storage) · Claude API (photo auto-fill) · Vercel

---

## Contents

1. [What's included](#whats-included)
2. [Run it locally in 2 minutes (no database)](#run-it-locally-in-2-minutes-no-database)
3. [Connect Supabase](#connect-supabase)
4. [Turn on AI auto-fill](#turn-on-ai-auto-fill)
5. [Deploy to Vercel](#deploy-to-vercel)
6. [Hand over to the shop owner](#hand-over-to-the-shop-owner)
7. [Customising the shop](#customising-the-shop)
8. [Environment variables](#environment-variables)
9. [Project structure](#project-structure)
10. [Security](#security)
11. [Troubleshooting](#troubleshooting)

---

## What's included

**Customer site**
- **Home** — hero, Shop by Category, New Arrivals, Featured, About and contact strips
- **/shop** — every product, with category, size, colour and price filters, sort and search (filters live in the URL, so a filtered page can be shared)
- **/shop/[category]** — categories and sub-categories come from the database
- **/product/[slug]** — swipeable gallery, sale price, size and colour chips, size chart, and a big **Order on WhatsApp** button that opens `wa.me` with the product name, size, colour, price and link filled in
- **/support** — WhatsApp and call buttons, address, opening hours, Google Map, FAQ
- **/about** — the shop's story
- Floating WhatsApp button, sticky header, sitemap, and Google-friendly product/store data

**Owner admin (`/admin`)**
- Log in with a 6-digit code sent by email — no password. Only emails in the `admins` table can log in. Stays logged in.
- Installable on the phone's home screen (PWA)
- One big **+ Add Product** button → opens camera/gallery → photos are compressed on the phone (WebP, max 1600 px wide, under ~500 KB) and uploaded
- AI fills in name, description, category and colour from the photo; the owner enters the price and taps sizes, then **Publish**
- Product cards with big **In stock** / **Featured** switches, Edit, and Delete (with confirmation)
- **Most popular** — products ranked by WhatsApp order taps in the last 30 days

---

## Run it locally in 2 minutes (no database)

Requires **Node.js 20.12 or newer**.

```bash
cd clothing-store
npm install
npm run dev
```

Open http://localhost:3000. With no Supabase keys the site runs on a built-in catalogue of 24 dummy products, so every customer page works. The admin (`/admin`) needs Supabase.

Other commands:

| Command | What it does |
|---|---|
| `npm run build` / `npm start` | Production build / serve it |
| `npm run lint` · `npm run typecheck` | Checks |
| `npm run seed` | Load the 24 dummy products into Supabase (safe to re-run) |
| `npm run seed -- --reset` | ⚠ Delete **all** products, then load the dummy ones |
| `npm run placeholders` | Regenerate the placeholder images in `public/placeholders/` |

---

## Connect Supabase

### 1. Create the project
Create a free project at [supabase.com](https://supabase.com). Pick a region close to the shop (e.g. Mumbai for India).

### 2. Create the tables
In **SQL Editor**, run these files in order (copy-paste each and press Run):

1. `supabase/migrations/0001_init.sql` — tables, security rules, photo bucket, "most popular" function
2. `supabase/migrations/0002_replace_product_images.sql` — safe photo updates for the admin

Both are safe to run again.

### 3. Add the owner's email
Still in the SQL Editor (use lowercase):

```sql
insert into admins (email) values ('owner@example.com');
```

This one row decides who can use the admin. To change the owner, update this table; to add a second person, insert another row.

### 4. Make the login email send a code
Supabase's default login email contains a link, not a code. In **Authentication → Email Templates** (called **Authentication → Emails** in newer dashboards), edit both **Magic Link** and **Confirm signup** so they include `{{ .Token }}`, for example:

```html
<h2>Your login code</h2>
<p>Enter this code to manage your shop: <strong>{{ .Token }}</strong></p>
<p>It expires in 1 hour. If you didn't ask for it, ignore this email.</p>
```

*Confirm signup* is used the very first time the owner logs in; *Magic Link* after that.

### 5. Set the site URL
In **Authentication → URL Configuration**, set **Site URL** to your live address (e.g. `https://yourshop.in`). For local testing, `http://localhost:3000` is fine.

### 6. Email sending limits
Supabase's built-in email sender is only for testing and allows just a few emails per hour. Before launch, connect a real email provider (Resend, Brevo, Amazon SES, …) under **Authentication → SMTP Settings** (or **Emails → SMTP**).

### 7. Add your keys
```bash
cp .env.example .env.local
```
Fill in from **Project Settings → API**:
- `NEXT_PUBLIC_SUPABASE_URL` — Project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — `anon` / publishable key
- `SUPABASE_SERVICE_ROLE_KEY` — `service_role` / secret key (**keep secret**)

### 8. Load the dummy products (optional)
```bash
npm run seed
```
Restart `npm run dev`. The site now reads from Supabase. Go to http://localhost:3000/admin, enter the owner's email, and type the code from the email.

When the real products are in, remove the dummy ones from the admin, or in SQL: `delete from products where id in (select product_id from product_images where storage_path is null);`

---

## Turn on AI auto-fill

1. Create an API key at [console.anthropic.com](https://console.anthropic.com) and add a little credit.
2. Add it to `.env.local` (and to Vercel later):
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   ```
3. Restart. When the owner adds a photo, the form fills in name, description, category and colour automatically, with a **Suggest again** button.

- Uses Claude Opus 5.5 at low effort; roughly 1–2 US cents per product. To try a cheaper model, set `ANTHROPIC_MODEL` (e.g. `claude-haiku-5-5`) and check the results.
- If a safety check wrongly declines a photo, the request automatically retries on another model (server-side fallback).
- Without a key, the form works normally — the owner just types the details.
- The key is only used on the server; it never reaches the phone.

---

## Deploy to Vercel

1. Push this repository to GitHub.
2. In [Vercel](https://vercel.com) → **Add New → Project** → import the repository.
3. **Root Directory:** set it to **`clothing-store`** (the repository also contains other projects). Framework preset: Next.js (auto-detected).
4. **Environment Variables:** add everything from your `.env.local`:
   `NEXT_PUBLIC_SITE_URL` (your live address, no trailing slash), `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`.
5. **Deploy.**
6. **Custom domain:** Project → Settings → Domains → add e.g. `yourshop.in` and follow the DNS steps.
7. Back in Supabase → Authentication → URL Configuration, set **Site URL** to the live domain.
8. Open the live site on a phone and test: browse, filter, tap **Order on WhatsApp**, then log in at `/admin` and add one product.

> Changing `NEXT_PUBLIC_*` variables needs a redeploy (Vercel → Deployments → Redeploy), because they are built into the site.

New products appear on the site immediately after **Publish**; other pages refresh within 60 seconds.

---

## Hand over to the shop owner

**Replace every placeholder** — all in `lib/siteConfig.ts`:

- [ ] Shop name, short name, tagline, description
- [ ] Logo (put the file in `public/`, set `logo: "/logo.png"`)
- [ ] WhatsApp number (`whatsapp`, digits only with country code, e.g. `919876543210`) and how it's shown (`whatsappDisplay`)
- [ ] Phone number (`phoneDisplay`, `phoneTel`) and email
- [ ] Address, Google Maps embed link (`mapEmbedUrl`: Google Maps → Share → Embed a map → copy the `src`) and directions link (`mapLink`)
- [ ] Opening hours
- [ ] About text: `about.short`, `about.story`, `about.values`, `about.established`, owner name
- [ ] FAQ answers, especially exchange policy (`EXCHANGE_DAYS` at the top of the file), delivery and payment
- [ ] Size chart (inches)
- [ ] Hero text
- [ ] Remove the dummy products once real ones are added

**Set up his phone (5 minutes):**
1. Open `https://yourshop.in/admin` in Chrome (Android) or Safari (iPhone).
2. Type his email → **Send me a code** → type the 6-digit code from his inbox.
3. Android: tap **Install app**. iPhone: tap **Share** → **Add to Home Screen**.
4. Show him: **+ Add Product** → take photos → check the filled-in details → type the price → tap sizes → **Publish**.
5. Show him the **In stock** switch (for sold-out items) and **Most popular**.

---

## Customising the shop

**Colours** — all in `theme/palette.ts`. The site uses role names (`canvas`, `surface`, `primary`, `ink`…), so changing hex values there re-skins everything. A warm "mocha" palette is included — switch with `export const palette = palettes.mocha;` (then update `public/admin/offline.html` colours and run `npm run placeholders` if you still use placeholder images).

**Fonts** — `app/layout.tsx` (Playfair Display for headings, Inter for text).

**Categories** — stored in the database. To add one, run in the SQL Editor:

```sql
-- a new top-level category
insert into categories (name, slug, description, image_url, sort_order)
values ('Kids', 'kids', 'Clothes for little ones', null, 6);

-- a sub-category under it
insert into categories (name, slug, parent_id, sort_order)
values ('Kids T-Shirts', 'kids-t-shirts', (select id from categories where slug = 'kids'), 1);
```

`slug` must be lowercase words joined by hyphens; it becomes the address `/shop/kids`. For the card image on the home page, upload a photo to the `product-images` bucket (Storage) and paste its public URL into `image_url`, or put a file in `public/` and use `/your-file.jpg`. To hide a category, set `is_active = false`. The admin's category chips and the shop filters update automatically.

**Sizes** — `sizes` in `lib/siteConfig.ts` (the admin also offers "Free Size").

**Price filter bands** — `priceBands` in `lib/siteConfig.ts`.

**Colour swatches** — `lib/colours.ts` maps colour names to dots, and lists the quick-pick colours in the admin.

---

## Environment variables

| Name | Needed for | Where it's used |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | Product links in WhatsApp messages, SEO | Browser + server |
| `NEXT_PUBLIC_SUPABASE_URL` | Everything database-related | Browser + server |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Reading the catalogue, admin login, photo uploads | Browser + server (safe to expose; security rules protect writes) |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin login check, click tracking, seed script | **Server only — never prefix with `NEXT_PUBLIC_`** |
| `ANTHROPIC_API_KEY` | AI auto-fill (optional) | Server only |
| `ANTHROPIC_MODEL` | Override the AI model (optional) | Server only |

Without the Supabase variables the site runs on dummy data.

---

## Project structure

```
clothing-store/
├── app/
│   ├── page.tsx                  Home
│   ├── shop/                     /shop and /shop/[category]
│   ├── product/[slug]/           Product page
│   ├── support/  about/          Customer Support, About
│   ├── api/track/                Counts WhatsApp order taps
│   └── admin/
│       ├── login/                Email-code login
│       ├── (app)/                Admin home + edit page (owner only)
│       ├── _actions/             Server actions: auth, products, AI
│       ├── manifest.webmanifest/ PWA manifest
│       └── icons/                App icons (drawn from the shop name)
├── components/                   layout · home · shop · product · support · admin · ui
├── lib/
│   ├── siteConfig.ts             ← all shop details and placeholders
│   ├── queries.ts                Catalogue data (Supabase or dummy), cached
│   ├── catalog.ts                Filtering, sorting, sizes
│   ├── whatsapp.ts               wa.me links and the order message
│   ├── photoUpload.ts            Phone-side compression + upload
│   ├── supabase/                 Browser / server / service clients
│   └── data/seedData.ts          The 24 dummy products
├── theme/palette.ts              ← all colours
├── supabase/migrations/          SQL to run in Supabase
├── scripts/                      seed.ts, generate-placeholders.ts
├── public/admin/                 Service worker + offline page
└── middleware.ts                 Keeps the admin session fresh, guards /admin
```

---

## Security

- **Row Level Security** on every table: anyone can read products, categories and photos; only an email in `admins` can add, change or delete them. Click data is readable only by the admin.
- **Photo bucket** is public to read; only the admin can upload or delete.
- The admin pages and every save action check the owner again on the server; the database rules check a third time.
- The service-role and Claude keys are only used in server code.
- Login codes are only sent to emails in `admins`.
- Click tracking stores product, size, colour and time — no names, phone numbers or IP addresses.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Owner gets a link instead of a code | Add `{{ .Token }}` to the **Magic Link** and **Confirm signup** email templates (step 4). |
| "This email can't manage the shop" | The email isn't in `admins`. Insert it in lowercase. |
| "Please wait a minute before asking for another code" | Supabase rate limit. Wait, or connect your own SMTP provider. |
| No code email arrives | Check spam. The built-in sender has low hourly limits — set up SMTP. |
| Admin says "database isn't connected" | Supabase variables missing in `.env.local` / Vercel. Redeploy after adding them on Vercel. |
| Photo shows **Retry** | Usually a weak connection — tap Retry. If it keeps failing, check that `0001_init.sql` ran (it creates the `product-images` bucket). |
| Product photos don't show on the site | Photos from `*.supabase.co` are always allowed. If you use a custom Supabase domain, `NEXT_PUBLIC_SUPABASE_URL` must be set when the site is built — redeploy after setting it. |
| AI doesn't fill anything | `ANTHROPIC_API_KEY` missing or out of credit. Check Vercel → Logs for "AI suggestion failed". |
| WhatsApp opens the wrong number | `contact.whatsapp` in `lib/siteConfig.ts`: digits only, with country code, no `+`. |
| Product links in WhatsApp say `localhost` | Set `NEXT_PUBLIC_SITE_URL` on Vercel and redeploy. |
| Changes don't show on the site | Pages refresh within 60 seconds. Admin saves refresh immediately. |
