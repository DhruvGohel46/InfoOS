# InfoOS Preparation Prompt for Coding Agent

Copy everything in the quote below to your coding agent. It prepares the InfoOS desktop app for a future mobile app, makes no mobile app, and ends with a written change report.

> **Context.** I own a franchise shop and use a desktop POS called InfoOS. In the future I will build a mobile app for my workers. The app will let each worker log in and see their own details, such as salary and advance, which come from InfoOS. The app will use an online Supabase database as a bridge. You know this codebase and its database, I do not, so use your own naming and structure everywhere.
>
> **Your job right now.** Do NOT build the mobile app. Only prepare InfoOS so it is ready for the app later. Work in the order below, and do not change code until I approve your plan.
>
> **Step 1: Investigate and report back, no code changes.** Find out and tell me: how workers are stored (table, fields, the unique worker ID, name, phone, active or inactive status); where salary, advances, and similar payroll data are stored and which fields exist; whether InfoOS already has any API, export, or plugin or extension system; how the app is configured (database type, config files, how it runs offline); and whether it can reach the internet when needed.
>
> **Step 2: Propose a plan.** Show me what you would add to InfoOS, which files you will touch, and any risks to normal POS work. Wait for my approval.
>
> **Step 3: After approval, add these capabilities, as optional and switched off by default.**
>
> 1. A sync settings screen where I can turn the mobile sync on or off and enter the Supabase project URL and key, stored safely in config, never hard-coded in source.
> 2. One-way sync of workers from InfoOS to Supabase whenever a worker is created, edited, or deactivated. The worker ID in InfoOS stays the common ID that links the two systems.
> 3. When a new worker is created, generate a short one-time signup PIN, show it to me once, and sync it so the worker can use it for first-time login in the future app.
> 4. A button to sync all existing workers now.
> 5. Prepare, but do not switch on, sync of each worker's own salary and advance records, so the future app can show a worker only their own data. Ask me before enabling it.
> 6. Offline-first behaviour: queue changes locally, retry when internet returns, and never block or slow normal POS work if sync fails.
> 7. A simple sync log screen showing what was sent, when, and any errors.
> 8. Any Supabase table and column setup that is needed, written as a SQL script for me to run, using names that match this codebase.
>
> **Rules.** Take a backup of the database and code before changing anything, and tell me how to restore it. Keep all changes reversible. Use only the public anon key for anything that will ship inside the mobile app, and keep the powerful service key only on the desktop. Do not break any existing feature.
>
> **Step 4: Final change report.** When finished, give me a clear report with these parts: what InfoOS looked like before; every file, table, and setting you added or changed; the new features and how to use them; how to turn sync on and off; what is still not done; and the exact steps to undo everything.

When the agent sends the report back, share it here and I'll help plan the mobile app and the Supabase side to match it.
