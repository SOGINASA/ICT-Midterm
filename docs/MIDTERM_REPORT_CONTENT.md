# TengeFlow ICT Midterm Report

> **Document status:** This is the historical Stage 1 report for the original local prototype. The current codebase includes a public landing page, mobile layouts, registration, email confirmation, password recovery, onboarding and a custom Flask API with SQLAlchemy/Alembic. It uses SQLite locally and supports PostgreSQL for deployment; Supabase is no longer the selected backend. The own backend can run locally; an external deployment has not been performed. Statements below about absent authentication, a future backend, Supabase and original routes describe the historical design only. See [the current README](../README.md), [backend architecture](BACKEND_INTEGRATION.md) and [deployment instructions](BACKEND_SETUP.md). Update this report before submitting it as a description of the latest application.

**Course:** Information and Communication Technologies  
**Assessment:** Midterm Project, Stage 1  
**Topic 35:** Personal Finance — Personal Expense Tracking Application

TengeFlow is an interactive frontend prototype for recording everyday expenses in Kazakhstan tenge. This report describes the implemented local application and a separate proposed cloud architecture. The prototype has no backend, bank connection or user authentication.

## 1 Problem and Context

University students and young adults in Kazakhstan often pay for food, transport, study materials and leisure through a mixture of card and cash payments. Small purchases can be easy to forget, so the amount remaining in a monthly allowance may be unclear until the end of the month. A bank history records activity on that bank account, but it does not necessarily combine cash purchases with a personal spending plan. A spreadsheet can provide that overview, although entering and reviewing rows on a phone adds effort to a frequent task.

TengeFlow addresses this design problem by making manual expense entry short and immediately showing its effect on a monthly budget. The project assumes that users want understandable category totals rather than advanced accounting tools; this assumption should be tested with students. The Consumer Financial Protection Bureau explains that tracking spending can help people understand their habits and make budgeting decisions. TengeFlow applies that principle through expense records, category limits and clear feedback. Its purpose is to improve awareness of recorded spending, without making payments or promising financial outcomes. [CFPB spending tracker guidance](https://www.consumerfinance.gov/archive/blog/track-your-spending-with-this-easy-tool/).

## 2 Target Users

The primary users are students and young adults, approximately 18–25, who use smartphones daily and have medium to high digital literacy. Their goals are to record purchases quickly, understand the remaining budget and identify their largest spending categories. Limited time, a small screen, intermittent connectivity and forgotten cash purchases shape the design. The interface uses familiar language, visible labels, readable amounts and accessible form controls.

**Persona:** Ayan S. is a 20-year-old university student. He receives scholarship and family support, uses an iPhone for daily tasks and a laptop for study, and pays mostly by card. He wants to check whether he can afford leisure spending without calculating his balance manually. He sometimes forgets cash purchases and may enter an expense while the network is unavailable. His success criterion is to record a purchase and understand the new budget balance in a few simple steps. This is a design persona, not a claim based on completed user interviews.

## 3 Proposed ICT Solution

TengeFlow is a responsive web application whose purpose is to connect a recorded purchase with understandable budget feedback. **The primary function is to add an expense and immediately show its effect on the current monthly budget.** Completing that task in approximately 15 seconds is a design target that requires usability testing.

The prototype provides six connected functions:

1. Expense entry with amount, category, date, card or cash and an optional note.
2. A dashboard showing the monthly limit, spent amount, remaining amount and recent activity.
3. Transaction history with search, filters, editing and deletion.
4. Overall and category budgets with progress and exceeded-limit feedback.
5. Visual insights with category breakdown and a spending trend.
6. Local persistence and a demonstrable offline pending state.

Each transaction belongs to one of Food, Transport, Study, Leisure or Other. Counting each record once prevents overlap between category totals. Seed data totals ₸77,650 against a ₸120,000 budget, leaving ₸42,350. These are fictional examples, generated for the current month when the data is first initialized.

## 4 System Components

| Component | Implemented prototype | Proposed cloud version |
| --- | --- | --- |
| User device | Smartphone or laptop | Same devices, with optional native client later |
| Operating system and browser | Browser runs JavaScript and manages local storage | Browser additionally manages authenticated network sessions |
| Client | React, TypeScript, Tailwind CSS, React Router | Existing client remains the presentation layer |
| State and calculations | Zustand and shared finance utilities | Same state layer, using confirmed server data |
| Data access | Asynchronous FinanceRepository with a local adapter | HTTP or Supabase adapter implements the same boundary |
| Storage | Fake financial records in browser localStorage | PostgreSQL tables plus a local offline queue |
| Server and API | None for financial data | Supabase API and Auth, or an equivalent authenticated API |
| Cloud hosting | Vercel serves static build files after deployment | Vercel frontend and a separately configured backend service |
| Communication | HTTPS downloads the frontend; local operations stay on device | Authenticated HTTPS carries JSON requests and responses |
| External services | No bank or payment provider | No external financial integration is required for the core design |

The device processor executes validation and calculations; memory holds the active UI state; browser storage persists the demo records. These roles connect the prototype to basic computer architecture concepts.

## 5 System Architecture Diagram

The complete diagram is supplied as [architecture.mmd](architecture.mmd). Its solid local path represents the actual application: user → device → React interface → Zustand → repository → localStorage. Calculations derive the displayed balances from the stored transactions. Vercel's role is to deliver the frontend files over the Internet after publication.

The diagram's future path shows the repository adapter sending authenticated HTTPS requests over Wi-Fi or 4G/5G to a cloud API. Supabase Auth would identify users with JWTs, while PostgreSQL would store their records. Row Level Security would restrict permitted operations to the appropriate user's records. These services are documented as an integration design; they are not running in the prototype. [Supabase Auth documentation](https://supabase.com/docs/guides/auth), [Supabase RLS documentation](https://supabase.com/docs/guides/database/postgres/row-level-security).

The browser communicates directly with the chosen cloud API. Static hosting does not need to proxy every expense request. No bank connection, payment execution service or banking credential is part of this architecture.

## 6 Network and Data Flow

The [data-flow.mmd](data-flow.mmd) sequence diagram separates the implemented transaction from the future server flow.

**Implemented transaction:** Ayan enters ₸3,500, selects Food and Card, checks the date and presses Save. Zod validates the fields locally. The store calls the asynchronous local repository, which persists the record in localStorage. After a successful write, the UI recalculates the monthly and category totals and shows confirmation. Starting from the seed data, spent becomes ₸81,150 and remaining becomes ₸38,850. A failed validation preserves the draft and displays a correction; a failed storage write must not be presented as a successful save.

**Offline behavior:** In an already loaded app, Ayan can save locally with `syncStatus = pending`. When connectivity returns, the prototype changes that flag locally to demonstrate recovery. Even the `synced` label represents a simulation; no data is uploaded. There is no service worker, so a fresh offline visit or reload is not guaranteed. The browser's online indicator is only a connectivity hint, not proof that a future API can be reached. [MDN on navigator.onLine](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/onLine).

**Future online transaction:** The adapter would send an authenticated HTTPS request, the API would validate it, database authorization would check ownership, and PostgreSQL would commit the record. Only a successful server acknowledgement would complete synchronization. A durable operation queue, stable IDs and retry rules would be needed to avoid lost or duplicated changes.

Wi-Fi provides local wireless access through a router; 4G/5G provides mobile wide-area access. Internet access is needed to download the deployed application initially and, in the future design, authenticate and synchronize. Validation, calculations and current prototype storage operate locally.

## 7 Cloud or Mobile Technology

The implemented mobile technology is a responsive web interface. The same application can be opened on a phone or laptop without installing a separate native build. Its small-screen layout prioritizes the main action and uses navigation suited to frequent short visits. Full offline PWA delivery remains future work.

Vercel is the deployment target for static frontend hosting. A future Supabase backend would add account-based storage and cross-device access. Compared with fully local data, a remote store could support device replacement, shared state across signed-in devices and managed backup processes. Actual recovery guarantees would depend on the selected service plan, backup configuration and testing; they are not features of this demo.

The tradeoffs include network latency, service outages, operational cost and responsibility for personal financial information. The production design therefore calls for encrypted transport, restricted access and minimal data collection. OWASP MASVS identifies storage, authentication, network communication and privacy as security areas for mobile applications; it is used here as a design reference, not a claim that the web prototype has passed a security assessment. [OWASP MASVS](https://mas.owasp.org/MASVS/).

## 8 Main User Scenario

**User:** Ayan. **Goal:** Record lunch and see how it affects this month's allowance. **Starting condition:** The app is loaded, the current month is selected by the application, and the seed budget has not been changed.

1. Ayan opens Home and sees ₸42,350 remaining.
2. He selects Add expense; the amount field receives focus.
3. He enters `3500`, selects Food, keeps Card and today's date, and optionally enters “Lunch”.
4. He selects Save expense.
5. The client validates and saves the record locally.
6. Confirmation shows the saved expense and ₸38,850 remaining.
7. He selects Done to return Home, then can find the record in Transactions.

If he enters zero or leaves the amount blank, the app explains that the amount must be greater than zero and keeps the other values. If the network is unavailable, the record is stored as pending in the loaded app. If local storage cannot be written, an error gives him a chance to retry. Editing or deleting an expense recalculates the same shared totals; deletion requires confirmation.

## 9 Interface Prototype

The prototype has exactly five main routes. Home (`/`) is the starting screen; Add Expense (`/add`) is the primary task; Transactions (`/transactions`) supports review and correction; Budgets (`/budgets`) adjusts limits; and Insights (`/insights`) visualizes recorded spending. Confirmation and editing use states within those screens, so they do not create extra main routes. The connected flow is documented in [user-flow.mmd](user-flow.mmd).

HCI decisions include a prominent Add expense action, sensible input defaults, a short form, visible validation messages, a confirmation with the changed balance and retained draft values when navigating between screens. Labels accompany controls, icons support recognizable actions and exceeded budgets use text as well as visual emphasis. Charts are accompanied by amounts or summaries so users do not have to infer exact values from shapes alone.

The interface is designed for a phone viewport around 390 × 844 pixels and expands for desktop use. A validation error and an offline pending state provide distinct recovery demonstrations. Formal accessibility certification and measured usability results are outside this Stage 1 report.

## 10 Technology Justification

| Choice | Reason in this prototype |
| --- | --- |
| Responsive single-page web app | One frontend demonstrates the flow on phones and laptops and can be deployed as static files |
| React 18 with Create React App | Follows the requested stack and supplies a familiar build and test workflow |
| TypeScript | Defines finance entities and repository contracts so integration mistakes can be found during development |
| Tailwind CSS | Keeps responsive spacing, typography and component styling consistent |
| Zustand | Shares transactions, limits and actions between five screens without a large state framework |
| React Router | Connects the five views and supports direct URLs |
| Zod | Centralizes validation of amounts, categories, dates and notes |
| Recharts and Lucide | Provide simple charts and consistent line icons |
| localStorage repository | Makes the academic demo persistent without credentials or a hosted API |
| HTTPS over Wi-Fi or mobile data | Delivers the frontend and supports the proposed remote API communication |
| Supabase as a future option | Provides a documented path to authenticated PostgreSQL data access |

Create React App was chosen to match the project request, with compatible versions pinned. React has deprecated CRA for new projects, making build-tool maintenance a future consideration. [React announcement](https://react.dev/blog/2025/02/14/sunsetting-create-react-app). The current prototype needs no external accounts or environment variables. The repository boundary prepares a backend integration point; authentication, reliable synchronization and database policies still require implementation and testing.

## 11 Limitations and Future Development

Manual entry depends on the user's memory and accuracy. The app has no bank imports, automatic income tracking or payment capability. Browser storage is device and origin specific, can be cleared and is unsuitable as a complete backup strategy. The demo has no account security, real cloud synchronization or guaranteed cold-start offline mode. Its monthly limits are simple settings, not a historical budget ledger, and the persona and 15-second task target require validation with actual users.

The next development stage would implement an authenticated repository adapter, per-user database ownership, monthly budget records and integration tests. True offline operation would require cached application assets, a durable queue for creates, edits and deletes, idempotent server requests and explicit conflict handling. These are the principal technical challenges in adding the backend safely.

Later functions could include CSV export, recurring expenses, transparent budget alerts and multi-currency support. A native version could evaluate biometric re-authentication. The core scope would remain expense awareness; bank linking and payments would be separate projects.

## References

- Project requirements: the supplied *TengeFlow Codex Master Brief*, which reproduces the Stage 1 criteria. The original university assignment was not separately supplied.
- Consumer Financial Protection Bureau. [Track your spending with this easy tool](https://www.consumerfinance.gov/archive/blog/track-your-spending-with-this-easy-tool/).
- Supabase. [Auth](https://supabase.com/docs/guides/auth) and [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security).
- OWASP. [Mobile Application Security Verification Standard](https://mas.owasp.org/MASVS/).
- MDN. [Navigator onLine property](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/onLine).
- Create React App. [Available Scripts](https://create-react-app.dev/docs/available-scripts/).
- React. [Sunsetting Create React App](https://react.dev/blog/2025/02/14/sunsetting-create-react-app).
- Vercel. [Create React App on Vercel](https://vercel.com/docs/frameworks/frontend/create-react-app).

Primary web sources reviewed on 30 September 2026. Submission packaging still requires the student's identification, final PDF layout and the active deployment URL.
