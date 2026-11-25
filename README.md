# EnclosureIQ

A subwoofer enclosure designer for cars and trucks that works on desktop and phones. Pick a vehicle, a sub and an amp; choose a box type; see how it will perform in the vehicle; then download build plans.

## Features

- **Box types:** sealed, ported (slot, round or flared ports), 4th-order bandpass, 6th-order parallel and series, quasi 6th order, 8th-order series, and free air / infinite baffle (trunk as the box). Rectangle or angled (sloped back or sloped baffle). Firing direction, blow-through / trunk-wall builds, isobaric loading, multiple subs, multi-layer baffles, bracing allowance.
- **Acoustic simulation:** Thiele/Small lumped-parameter model solved as an acoustic nodal network, so every enclosure type uses the same solver. Graphs:
  - SPL in the vehicle (with cabin gain) and outdoors
  - Maximum SPL (limited by rated power or Xmax)
  - Cone excursion against Xmax
  - Port air speed
  - Impedance and phase
  - Excursion-limited power
  - Group delay
  - Vehicle cabin transfer function
- **Bandpass auto-tune:** a coordinate-descent optimizer sets chamber volumes and port tunings for the flattest, loudest output across a target band, keeping ports short enough to fit the box.
- **360° view:** drag-to-orbit SVG renderer with auto-spin, X-ray (ports, walls, dividers) and finishes.
- **Build plans:** dimensioned front, side and top drawings; a cut list with bevel angles; panel drawings with cutout positions; 4×8 sheet nesting; port table; wiring and amp setup; materials list; step-by-step instructions. Downloads: PDF build sheet (jsPDF), CSV cut list, JSON design file.
- **Whole system:** every series/parallel wiring option for the chosen subs, amp power at each load (interpolated in 1/Z), load-stability check, current draw, power-wire gauge (0.5 V drop rule) and fuse size.
- **Libraries:** subwoofers, amplifiers and vehicles. Built-in entries come from manufacturer manuals and spec sheets (sources listed in each entry). Users can add, edit and reset entries. Published T/S values are cross-checked against each other and conflicts are flagged.
- **AI:** spec lookup, reading specs from an uploaded manual (PDF text or photos), vehicle space estimates, and a design assistant that reads and changes the design through page tools. On the website it is for signed-in people, with a daily limit, and the spec lookup searches the web for the manufacturer's manual. On claude.ai it uses the viewer's own Claude.
- **Guides & FAQ:** 17 detailed how-to guides (tools, steps, tips, common mistakes) with photos and diagrams, plus 19 FAQ answers.

## Accounts and the website

On the standalone website, people sign in with **Google**, **Microsoft**, **Apple** (once enabled) or an **email link**. Accounts are handled by Supabase Auth, and each person's saved designs and unit preference live in a Supabase Postgres database. Everyone can read the shared subwoofer, amplifier and vehicle libraries; signed-in people can add entries and edit or remove the ones they added. Row-level security enforces all of this.

Inside claude.ai the page doesn't use Supabase; it uses the viewer's Claude account and the artifact's own storage.

The website and its AI server are hosted on **Vercel**. `vercel.json` sets everything: Vercel runs `scripts/build-site.sh`, serves `_site/`, and deploys `api/ai.js` as a function at `/api/ai`. Every push to `main` deploys the live site; every pull request gets a preview.

### One-time setup

1. **Vercel:** in the Vercel dashboard (team *hardwored*) choose **Add New → Project**, import the `Dirtbikingdad1993/EnclosureIQ` GitHub repository, leave the settings as detected (they come from `vercel.json`) and click **Deploy**. Note the address Vercel gives the site, for example `https://enclosureiq.vercel.app`.
2. **AI Gateway:** the AI server reaches the models through Vercel's AI Gateway and signs in to it automatically when it runs on Vercel, so there is no API key to set. AI use is billed to the Vercel team: check **AI Gateway** in the Vercel dashboard for credits, and set a spending limit there if you want one.
3. **Supabase URL settings** (Supabase dashboard → project *EnclosureIQ* → Authentication → URL Configuration): set **Site URL** to the Vercel address and add the same address under **Redirect URLs**. Email sign-in links work after this step.
4. **Google:** in Google Cloud Console → APIs & Services → Credentials, create an *OAuth client ID* of type *Web application*. Add `https://uumnakjtqelkbjnxaxfj.supabase.co/auth/v1/callback` as an authorized redirect URI. Paste the client ID and secret into Supabase → Authentication → Sign In / Providers → Google, and turn it on.
5. **Microsoft:** in the Microsoft Entra admin center → App registrations → New registration, choose "Accounts in any organizational directory and personal Microsoft accounts", and set the redirect URI (Web) to the same Supabase callback URL. Create a client secret. Paste the Application (client) ID and the secret *value* into Supabase → Providers → Azure, leave the tenant URL empty, and turn it on.
6. **Apple (later):** needs an Apple Developer Program membership. Create a Services ID with Sign in with Apple, using the Supabase callback URL as the return URL. Create a key, then fill in Supabase → Providers → Apple.

The sign-in window asks Supabase which methods are switched on and shows only those, so a provider appears on the site as soon as you enable it in Supabase; no code change is needed.

**Email links for everyone:** Supabase's built-in mailer only sends to the email addresses of your Supabase organization's team members, and only a few per hour. To let the public sign in by email, add your own SMTP server in Supabase → Authentication → Emails → SMTP settings (for example Resend, SendGrid or Amazon SES). Until then, Google and Microsoft are how the public signs in.

`js/config.js` holds the Supabase URL and the publishable key. Both are meant to be public; the database's row-level security decides what each person can do.

### The AI server

`api/ai.js` takes a task (`lookup`, `manual`, `vehicle`, `ask` or `assistant`) and its inputs, builds the prompt itself from `js/ai-prompts.js`, and streams the answer back. It only answers signed-in people: the browser sends its Supabase session token, and the database function `ai_take_call()` checks that token and counts the request. The design assistant's tools run in the browser, because they change the design on the page; the server returns the model's tool calls and the page sends the results back.

Settings (Vercel → Project → Settings → Environment Variables; all optional):

| Variable | Default | Meaning |
| --- | --- | --- |
| `AI_MODEL` | `anthropic/claude-sonnet-5.5` | AI Gateway model for every task. |
| `AI_DAILY_LIMIT` | `100` | AI requests per person per day (UTC). One assistant reply can take several requests. |
| `AI_SITE_DAILY_LIMIT` | `3000` | AI requests per day for the whole site, a cap on the bill. |

## Run it locally

No build step. Requires Python 3.

```bash
./scripts/dev.sh
```

Then open http://localhost:8765/. Locally the app uses the same Supabase project as the website (shared libraries load; sign-in redirects only work from addresses listed in Supabase's URL configuration). Signed out, saved designs stay in the browser. The AI server is not part of this local server; to run it locally use the Vercel CLI (`vercel link`, `vercel env pull`, `vercel dev`).

Checks (the same ones CI runs on every pull request):

```bash
npm ci
```

```bash
npm run check
```

```bash
npm test
```

`npm test` runs the AI server against a mock model and a mock database: no network, no cost.

## Project layout

| Path | What it does |
| --- | --- |
| `index.html` | Page markup and all CSS (light and dark themes). Written for the claude.ai artifact host, which adds the `<html>`/`<head>` skeleton. |
| `js/physics.js` | T/S parameter derivation and consistency checks, alignments, port math, filters, cabin gain, network solver, result analysis. |
| `js/geometry.js` | Box sizing (rect and wedge profiles), port layout, bandpass chambers, cut list, sheet nesting, vehicle fit check, wiring options. |
| `js/model.js` | Design pipeline (design → driver → box → network → simulation → system checks), factory presets, bandpass optimizer. |
| `js/system.js` | Amp power at a load, current draw, wire gauge, fuse. |
| `js/app.js` | App shell, routing, Design workspace, results and graphs, saved designs. |
| `js/library.js` | Subwoofer, amplifier and vehicle libraries: lists, details, editors, AI lookup and manual import. |
| `js/plans.js`, `js/export.js` | Build plans page; PDF, CSV and JSON exports. |
| `js/draw.js`, `js/charts.js` | 360° orbit view, blueprint drawings, sheet layouts, icons; frequency charts. |
| `js/assistant.js`, `js/ai.js` | AI design assistant (with page tools), lookups and PDF text extraction. |
| `js/ai-prompts.js` | Prompts and assistant tool definitions, shared by the page and the AI server. |
| `js/ai-remote.js` | Website side of the AI: calls `/api/ai` with the sign-in token, reads the streamed reply, shrinks photos. |
| `api/ai.js` | The website's AI server (a Vercel Function using the AI SDK and AI Gateway): sign-in check, daily limits, prompts, web search for spec lookups. |
| `tests/ai-endpoint.test.mjs` | Tests for the AI server with a mock model. |
| `js/store.js` | Storage: shared `db` collections on claude.ai, Supabase on the website, localStorage when signed out. |
| `js/auth.js`, `js/account.js`, `js/config.js` | Website accounts: Supabase Auth (Google, Microsoft, Apple, email link), sign-in dialog, account panel. |
| `scripts/build-site.sh`, `vercel.json` | Build the standalone site; Vercel build, function and header settings. |
| `.github/workflows/ci.yml` | Checks on every push and pull request: syntax, AI server tests, site build. |
| `js/guides.js` | How-to guides and FAQ content. |
| `data/*.json` | Built-in subwoofer, amplifier and vehicle data. |

## Accuracy notes

- The model was checked against JL Audio's published 12W3v3-4 data: sealed Qtc 0.834 vs 0.83, Fc 50.2 Hz vs 50.2 Hz, F3 43.7 Hz vs 43.7 Hz; ported box width 28.96" vs 29"; port length 25.8" vs 26.1".
- Vehicle entries are typical sizes per vehicle type, not measurements of specific models. Measure your vehicle.
- Simulations are small-signal estimates. Real results depend on build quality, driver tolerances, power compression and the cabin.

## Photo credits

Guide photos come from Wikimedia Commons, resized only:

- `img/infinite-baffle-18in.jpg`: [Large infinite baffle subwoofer with 18 inch woofer driver](https://commons.wikimedia.org/wiki/File:Large_infinite_baffle_subwoofer_with_18_inch_woofer_driver.JPG) by Daniel Christensen, [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/)
- `img/homemade-15in-box.jpg`: [Loudspeaker enclosure](https://commons.wikimedia.org/wiki/File:Loudspeaker_enclosure.jpg) by Daniel Christensen, [CC0](https://creativecommons.org/publicdomain/zero/1.0/)
- `img/internal-bracing.jpg`: [Subwoofer cab internal bracing](https://commons.wikimedia.org/wiki/File:Subwoofer_cab_internal_bracing.jpg) by B137, [CC0](https://creativecommons.org/publicdomain/zero/1.0/)
- `img/sub-and-enclosure.jpg`: [Subwoofer driver and enclosure](https://commons.wikimedia.org/wiki/File:Subwoofer_driver_and_enclosure.jpg) by B137, [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/)

Diagrams in `js/illustrations.js` are original to this project.
