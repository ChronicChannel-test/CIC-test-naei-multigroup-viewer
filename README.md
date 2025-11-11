# NAEI Multi-Group Viewer

This workspace hosts the shared v3.0 shell plus the current bubble (v2.0) and line (v2.4) chart applications for exploring NAEI emissions data.

## Structure at a Glance
- `index.html` &rarr; parent shell that preloads shared data, swaps between the line and bubble chart iframes, and injects shared styles/assets.
- `SharedResources/` &rarr; common Supabase client config, analytics helper, shared-data loader, color palette, fonts, and images consumed by both charts.
- `CIC-test-naei-bubblechart-v2.0/` &rarr; self-contained bubble chart app with its own Supabase module (`supabase.js`), bridge loader, chart renderer, export helper, and main UI script.
- `CIC-test-naei-linechart-v2.4/` &rarr; modular line chart app with its own Supabase module, chart logic, and export workflow.
- `supabase/` &rarr; edge function and configuration scaffolding used by Supabase for scheduled aggregations and analytics capture.

## How Things Fit Together
1. The shell loads `SharedResources/shared-data-loader.js`, which fetches and caches pollutant, group, and timeseries tables from Supabase once per session.
2. Each iframe (bubble or line) reuses the shared cache through `SharedDataLoader`, then renders via Google Charts with its respective UI scripts.
3. User actions (filters, exports) stay inside each iframe, while high-level tab changes and analytics events are handled by the parent shell.
4. Exports rely on client-side XLSX/PNG generation; analytics events post to Supabase via `SharedResources/analytics.js` when enabled.

## Working Locally
- Serve the repository with any static file server (`python -m http.server`, `npx serve`, etc.) so the Supabase client can resolve relative paths.
- Configure credentials in `SharedResources/supabase-config.js`; the helper exports `initSupabaseClient()` used everywhere.
- Supabase functions live under `supabase/functions/` and can be deployed via the Supabase CLI when backend updates are needed.

## Tailwind Build
- Run `npm install` once to pull in the Tailwind/PostCSS toolchain.
- Execute `npm run build:css` to regenerate `dist/tailwind.css` for production (GitHub Pages, Netlify, etc.).
- Use `npm run watch:css` during local development to keep the compiled stylesheet in sync.

## Debugging Console Output
- Logging is suppressed by default to keep the browser console quiet.
- Append `?debug=1` (or `?logs=1`) to the URL to re-enable verbose logs across the shell and both iframes.
- Remove the flag for production-style runs; critical warnings/errors always remain visible.
