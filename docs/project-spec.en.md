# Deniz — Project Specification

> **النسخة العربية:** [project-spec.ar.md](project-spec.ar.md)

| | |
|---|---|
| **Version** | 0.1 (draft) |
| **Date** | 2026-10-16 |
| **Owner** | Sumaia Ahmad |

---

## 1. Overview

### 1.1 About Deniz
Deniz is a shop for scented candles in cute shapes. Every candle has its own special touch and is handmade with love and care, to become part of an occasion and a gift that lasts as a memory.

All pieces are **made to order and personalized**. Customers browse past work as examples and order similar pieces with their own colors, name or phrase, and quantity.

**Sections:**
- **Event favors:** newborn (baby), graduation, and engagement or wedding.
- **Candle gifts for any occasion:** such as candle flower boxes, or a candle in a custom shape.

**Location:** Damascus, with shipping to all Syrian governorates.

### 1.2 The Problem
The business currently runs entirely through Instagram, which causes the following problems:
- **Deadlines:** delivery dates get missed.
- **Details:** order details (colors, names, quantities) get lost across messages.
- **Customer inquiries:** customers keep asking "what's the status of my order?".
- **Raw materials:** a material can run out without anyone noticing.
- **Pricing:** wrong prices can be quoted, or prices get forgotten.
- **Accounting:** there is no way to know the monthly profit or loss.

### 1.3 Goals

**Business goals:**
- Manage orders, deadlines, and finances in one place.
- Present a professional, organized image of Deniz to customers.
- Know the real cost and profit of every order and every month.

**Project goals:**
- Demonstrate the ability to build a complete system to industry standards: requirements analysis, design, testing, documentation, and real deployment.

### 1.4 Problem-to-Feature Traceability

| Problem | Feature that solves it |
|---|---|
| Missed delivery dates | Order calendar (FR-22, FR-23) |
| Details lost in messages | Online order form (FR-05, FR-06) |
| Customers asking about their orders | Order tracking page (FR-11, FR-12) |
| Materials running out unnoticed | Raw materials with alerts (FR-28, FR-29) |
| Wrong or forgotten prices | Fixed catalog prices, automatic totals (FR-03, BR-5) |
| Unknown profit | Expenses and monthly reports (FR-31, FR-32) |

---

## 2. Users and Roles

| Role | Description | Permissions |
|---|---|---|
| **Customer** | Any site visitor, **no account** | Browse the catalog, place an order, track it with a private code |
| **Admin** | The owner of Deniz | Everything |
| **Assistant** | A helper in the business | View orders and change their status **only**; no profits, reports, or costs |

---

## 3. Scope

**In scope:**
- A public website for customers in Arabic and English.
- A dashboard to manage orders, catalog, materials, pricing, and finances.
- Generating quote and invoice PDFs.

**Out of scope (for now):**
- Online card payments on the site.
- Customer accounts (username and password).
- Direct integration with Al-Qadmous's systems.
- A native mobile app. The site works on mobile browsers.

---

## 4. Functional Requirements

### 4.1 Public Website

**Catalog**
- **FR-01** Display work in two sections: **favors**, grouped by occasion (newborn, graduation, engagement or wedding), and **gifts** for any occasion.
- **FR-02** Each piece has photos, a description, and its available options (colors, size, name or phrase).
- **FR-03** Each piece has a **fixed unit price**. Some pieces come in **sizes**, each with its own price (e.g. flower boxes come in 3 sizes).
- **FR-04** An **"I want one like this"** button opens the order form with the piece preselected.

**Order Form**
- **FR-05** The customer fills in: occasion, event date, requested pieces (for each: quantity, colors, name or phrase), and notes.
- **FR-06** One order can contain **more than one type of piece**.
- **FR-07** Upload a reference image (optional).
- **FR-08** Choose a delivery method:
  - **Delivery within Damascus:** the customer picks her area, and the delivery fee is added to the total automatically.
  - **Shipping to other governorates via Al-Qadmous:** the customer is told that the shipping fee is paid to the company on pickup, and that the full amount must be transferred before shipping.
- **FR-09** Spam protection on the form.
- **FR-10** After submission, the order appears in the dashboard with status **"New"**.

**Order Tracking**
- **FR-11** Every order has a private, hard-to-guess code or link.
- **FR-12** The tracking page shows the order status, delivery date, total, amount paid, and remaining balance.
- **FR-13** When the order status changes in the dashboard, the tracking page updates automatically.

**Language**
- **FR-14** The entire site is available in Arabic (right-to-left) and English, with a language switch.

### 4.2 Dashboard

**Order Management**
- **FR-15** Show all order details: customer, occasion, date, pieces, colors, text, reference image, and prices.
- **FR-16** Order lifecycle: New → Confirmed → In Progress → Ready → Delivered.
- **FR-17** Show a warning when changing status if a required payment has not been recorded (BR-7).

**Payments**
- **FR-18** Each order has a payment method: **bank/money transfer** or **cash on delivery**.
- **FR-19** **Transfer:** record the amount and the transfer number, with an optional receipt image upload.
- **FR-20** **Cash on delivery:** the amount stays marked "with the delivery driver" until the admin confirms she has received it.
- **FR-21** Every order shows the total, deposit, amount paid, and remaining balance.

**Calendar**
- **FR-22** Show all orders by event date.
- **FR-23** Highlight orders due this week and those with approaching deadlines.

**Quotes and Invoices**
- **FR-24** A quote PDF before confirmation and an invoice PDF after confirmation, with the Deniz logo.
- **FR-25** Both include the details, total, deposit, and remaining balance.

**Pricing and Cost Calculation**
- **FR-26** A "recipe" for each type of piece: which raw materials it uses, and how much of each per unit.
- **FR-27** Calculate the real cost and profit, and suggest a price for large orders.

**Raw Materials**
- **FR-28** Manage materials (wax, dyes, wicks, boxes, ribbons, dried flowers, cards, stickers) with their quantities.
- **FR-29** Alert when any material is running low.

**Customers**
- **FR-30** Contact info, Instagram handle, and full order history for each customer.

**Expenses and Reports**
- **FR-31** Record expenses by category: materials, packaging, delivery, advertising.
- **FR-32** Monthly reports: number of orders, profit, the occasion that brings the most work, and the most requested pieces.

**Catalog Management**
- **FR-33** Add, edit, and hide pieces, with photos.

**Delivery Areas**
- **FR-34** Manage the list of Damascus delivery areas and the fee for each, in one place.

**Accounts and Permissions**
- **FR-35** Login for the admin and the assistant, with the permissions described in Section 2.

---

## 5. Business Rules

| # | Rule |
|---|---|
| **BR-1** | **Delivery within Damascus:** a fixed fee per area, added to the order total automatically. |
| **BR-2** | **Shipping to other governorates:** via Al-Qadmous. The company sets the fee, the customer pays it directly to the company on pickup, and it is **not** part of the order total. |
| **BR-3** | **Cash on delivery:** available for Damascus orders only. |
| **BR-4** | **Governorate orders:** must be **paid in full by transfer** before shipping. |
| **BR-5** | **Price snapshot:** each piece's price is stored with the order when it is created. Later catalog price changes do not affect existing orders or their invoices. |
| **BR-6** | **Deposit by order type:** **event favor** orders are only confirmed after a deposit is paid by transfer. **Gift** orders (e.g. a candle flower box or a single candle) need no deposit. A piece's type (favor or gift) is **fixed** in the catalog. |
| **BR-7** | **Payment rules are soft:** if a required deposit or transfer has not been recorded, the system only shows a **warning** when the status changes, and the admin decides. The system **never blocks**. |
| **BR-8** | **The assistant** cannot see any cost, profit, or report data. |

---

## 6. Non-Functional Requirements

| # | Requirement |
|---|---|
| **NFR-1** | **Language:** full support for Arabic (RTL) and English. |
| **NFR-2** | **Mobile:** the website and the dashboard work well on mobile screens. |
| **NFR-3** | **Security:** hashed passwords, role-based permissions, secrets in a `.env` file outside the code, and spam protection on forms. |
| **NFR-4** | **Performance:** images are compressed and optimized automatically for fast loading. |
| **NFR-5** | **Quality:** automated tests (pytest) and CI/CD with GitHub Actions. |
| **NFR-6** | **Documentation:** API documentation with Swagger, and decisions recorded as ADRs. |
| **NFR-7** | **Operations:** Docker, and real deployment to the internet. |

---

## 7. Technology and Constraints

| Part | Technology |
|---|---|
| Frontend | React (Vite) |
| Backend | Flask (Python) |
| Database | PostgreSQL |
| Source control | Git and GitHub, **monorepo** (ADR-0001) |

---

## 8. Build Phases

| Phase | Content |
|---|---|
| **1** | Catalog and bilingual support |
| **2** | Order form, delivery areas, dashboard, order management, login ← **CV-ready milestone** |
| **3** | Tracking page, payments, calendar, customers |
| **4** | Raw materials, pricing, quotes and invoices |
| **5** | Expenses, reports, roles and permissions |

Engineering quality (tests, Docker, CI, documentation) is **added with every phase**, not at the end.

---

## 9. Glossary

| Term | Meaning |
|---|---|
| **Favors (توزيعات)** | Small pieces ordered in large quantities and handed out to guests at an event (graduation, newborn, engagement, wedding) |
| **Gift** | A piece or box ordered as a present for one person, usually in a small quantity |
| **Deposit (عربون)** | An upfront payment that confirms an order |
| **Product** | A catalog model piece, made to order, with no stock |
| **Order item** | One piece within an order, with its quantity, options, and the price at the time of ordering |
| **Al-Qadmous** | The shipping company used for other governorates |

---

## 10. Open Questions

| # | Question |
|---|---|
| ~~**Q-1**~~ | ✅ **Resolved:** a piece's type is fixed. Boxes are always gifts (BR-6). |
| **Q-2** | If an order contains both favors and gifts, does it need a deposit? |
| **Q-3** | How much is the deposit: a fixed percentage of the total, or an amount the admin sets per order? |
| ~~**Q-4**~~ | ✅ **Resolved:** prices are in US dollars. |
| **Q-5** | Is there an in-person pickup option, without delivery? |
| **Q-6** | How does the customer receive her tracking code: on screen after ordering, or does the admin send it via WhatsApp or Instagram? |
| **Q-7** | For governorate orders, do we need a **"Shipped"** status, and should we store the Al-Qadmous waybill number? |
| **Q-8** | The list of Damascus delivery areas and the fee for each. |
| ~~**Q-9**~~ | ✅ **Resolved:** gifts are shown all together, with no occasion filter. |
| ~~**Q-10**~~ | ✅ **Resolved:** each custom-shaped candle the admin has made is added to the catalog as its own piece, with photos and a fixed price. |
