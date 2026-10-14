# StockLink (Rusape Orders App) — Project Notes

> Read this at the start of every session to get up to speed fast.

---

## What Is This App?
**StockLink** — A B2B ordering web app for Rusape, Zimbabwe.
*Tagline: "Order stock from suppliers, simply."*
- **Shops** browse suppliers and place orders.
- **Suppliers** list products and manage incoming orders.

## Stack
- Frontend: React 19 + Vite 8
- Backend/Auth/DB: Supabase (free tier)
- Routing: react-router-dom v6
- Hosting (planned): Vercel

---

## Design System & Branding
Defined as CSS variables in `src/index.css`:
- `--green: #0F6B4A` (primary buttons, links, logo)
- `--green-dark: #0B5139` (hover/pressed)
- `--amber: #F59E0B` (accents, warning borders)
- `--amber-light: #FEF3C7` (warning background, badges)
- `--bg: #F3F7F5` (page background)
- `--card: #FFFFFF` (form card)
- `--text: #1F2937`, `--muted: #6B7280`, `--border: #D1D5DB`
- `--error: #B91C1C`, `--success: #15803D`

### Design Decisions:
- **Phone-first**: Min tap target 44px, input height 48px, 16px input text prevents mobile auto-zoom.
- **System Font Stack**: Fast loading on slow mobile data without external font downloads.
- **Layout**: Centered cards and clean vertical forms without horizontal scrolling.
- **Config**: App name centralized in `src/config.js` (`StockLink`).

---

## Progress

### ✅ Step 1 — Project Setup (DONE)
- Vite + React scaffold in `C:\Users\nyama\rusape-orders-app`
- Dependencies installed: `@supabase/supabase-js`, `react-router-dom`
- `.env` configured with Supabase URL & anon key (gitignored)
- Supabase client initialized in `src/lib/supabase.js`

### ✅ Step 2 — Supabase Dashboard Setup (DONE)
- Email/Password auth enabled (Confirm email disabled for development)
- `profiles` table created (`id`, `role`, `full_name`, `created_at`)
- Row Level Security (RLS) enabled on `profiles`

### ✅ Step 3 — Signup & Login Pages Styled (DONE)
- Routing configured in `src/App.jsx`
- `src/pages/LoginPage.jsx` built and styled with StockLink theme
- `src/pages/SignupPage.jsx` built with role cards and StockLink theme

### ✅ Step 4 — Role-Based Routing & Dashboard Shells (DONE)
- Route protection and dashboards for `/shop/dashboard` and `/supplier/dashboard`
- Working logout flow on both dashboards

### ✅ Step 5 — Database Tables & RLS (DONE)
- Tables created in Supabase: `products`, `orders`, `order_items`
- RLS policies configured for authenticated users and role access

### ✅ Step 6 — Supplier Product Management (DONE)
- Search-as-you-type combobox with 23 common grocery products and dynamic custom row
- Typo suggestions, custom name validation, and optional brand formatting
- Price thresholds with amber warnings and confirmation checkbox
- Confirmation summary card before database insert

### ✅ Step 7 — Shop Dashboard (DONE)
- **Three Core Tabs**: "Shop", "Cart (n)", "My Orders" under first-name welcome header.
- **Shop Tab**:
  - Lists suppliers from `supplier_directory` view with phone numbers.
  - Tapping a supplier opens their catalogue sorted by name.
  - Real-time search box filters products by name.
  - Products show name, price formatted as `$0.00`, unit, and quantity steppers (1 to 999).
  - Out of stock items (`in_stock: false`) are greyed out with "Out of stock" badge and disabled buttons.
  - "Back to suppliers" button at top.
  - **One Supplier Per Cart**: If adding from another supplier, asks *"Your cart has items from [supplier]. Start a new cart?"* with Start new cart and Keep old cart.
- **Cart Tab**:
  - Saved in `localStorage` under `stocklink_cart_[userId]`.
  - Items grouped by product with quantity steppers, line totals, and Remove buttons.
  - Subtotal calculation and optional note box (max 200 chars with counter).
  - **Shop Details Check**: If `business_name` or `phone` is missing on profile, displays form to save details before order can be placed (never sends `role`).
  - **Checkout Flow**: "Place order" opens summary card with Confirm and Change buttons.
  - Submits via `supabase.rpc('place_order', { p_supplier_id, p_items, p_note })`. Database sets verified unit prices.
  - Displays green success card with uppercase 8-character order reference, confirmed items, and total.
  - Friendly error handling for network issues and known database messages.
- **My Orders Tab**:
  - Fetches shop orders newest first (20 per page with "Load more" button).
  - Displays supplier name, local date/time, order total, note, and expandable item lists.
  - Color-coded status badges: Waiting for supplier (amber), Accepted (green), Declined (red), Delivered (dark green), Cancelled (grey).
  - Manual Refresh button (no polling).

### ✅ Step 8 — Supplier Order Inbox & Commission System (DONE)
- Added `supabase/migrations/001_supplier_inbox_rpcs.sql`:
  - `commission_amount` (numeric 10,2) and `delivered_at` (timestamptz) columns on `orders`.
  - RPC function `reject_order(p_order_id)` allowing suppliers to decline pending orders.
  - RPC function `mark_ready(p_order_id)` advancing orders from `accepted` to `ready`.
  - Upgraded RPC function `mark_delivered(p_order_id)` advancing orders from `ready` to `delivered` and computing 3% commission on delivery.
- Upgraded `src/pages/SupplierDashboard.jsx`:
  - 3-tab layout: **Orders** (with pending count badge), **Products**, and **Earnings**.
  - Incoming orders display with active/completed/all filter pills, newest first.
  - Line items, quantities, totals, and delivery notes clearly displayed.
  - Shop business name & phone revealed strictly after acceptance via `get_shop_contact`.
  - Legal status flow with confirmations: `pending` → `accepted`/`rejected` → `ready` → `delivered`.
  - Shop confirms receipt (`confirm_received`) to transition to `completed`.
  - Monthly earnings & commission summary with 7-day chart.

### ⏳ Step 9 — End-to-end Testing (Current Step)
- Test loop with 2 accounts: 1 shop and 1 supplier across two browser sessions.
- Security boundary and RLS validation checks.

### ⬜ Step 10 — Deploy to Vercel

---

## How to Run Locally
```bash
npm run dev
```
Open browser at: http://localhost:5173
