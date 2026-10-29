# RefLoop: referral, attribution & registration-quality tracker

Working asset for the NxtWave Growth Intern Round 1 challenge ("Build Your First AI Project in 60 Minutes", 500 final-year registrations, 7 days, ₹2,000).

## Run it (no install, no API keys, no internet)
1. Unzip the folder.
2. Double-click `index.html` (Chrome/Edge/Firefox).
That is all. Optional logic tests: `node test.js` (Node 16+).

## Get a live link (needed for the submission form)
Any static host works, all free: drag this folder onto https://app.netlify.com/drop, or push to GitHub and enable Pages. The app is plain HTML/JS, so it needs no build step. After hosting, `index.html?ref=AD-B` opens the student page for that code.

## Files
| File | Purpose |
|---|---|
| `index.html` | Interface |
| `app.js` | UI logic (tabs, forms, rendering) |
| `core.js` | Business logic: validation, attribution, dedupe, decision engine, funnel, demo data |
| `test.js` / `test_results.txt` | 24 automated logic tests and their output |
| `screenshots/` | Captured from the running app |

## The problem it solves
Raw sign-up counts mislead. This tool answers, daily: who is actually driving **valid unique** registrations, who is dormant, where clicks leak, whether duplicates and invalid sign-ups are inflating the count, and whether we are on pace for 500, then tells the operator what to do next (nudge, replace, double down, where to put the ₹400 reserve).

## Features (all implemented and tested)
- Unique ambassador / community-admin codes and trackable links (`?ref=CODE`)
- Share kit: 3 WhatsApp message angles (placement, portfolio, curiosity), copy button
- Student registration page with field validation (name, email, 10-digit Indian mobile, college, branch, final-year batch 2027, disposable-email block)
- First-touch attribution; duplicates (same email incl. Gmail dots / `+alias`, or same phone) are kept but not counted, and credit stays with the first source
- Every valid registrant gets a personal referral link (the growth loop)
- Leaderboard ranked by valid unique registrations with signals: star / dormant / leaky / low quality
- Pace vs planned curve with green/amber/red, run-rate projection, daily action list
- CSV import (paste a Google Form / Sheet export) and CSV export
- Funnel planner: low / base / high scenarios, all inputs editable
- Day selector (1 to 7) to replay the campaign

## What is simulated and what is not
- **Simulated:** all demo students, ambassadors, clicks and registrations (fake names, `example.com` emails, labelled "SIMULATED DEMO DATA" in the header). The student form is a simulation inside the page.
- **Not implemented:** live Google Forms, WhatsApp or any external integration; shared online database. State is stored in the browser's localStorage, so it only sees activity from the same browser. The production path is hosting this page and posting submissions to a shared Google Sheet via Apps Script or Supabase, reusing `core.js` unchanged.

## Tested
- `node test.js`: 24 passed, 0 failed (normalisation, validation, attribution, dedupe, CSV, funnel, decision engine).
- 18-step browser run (Playwright/Chromium): dashboard, add source (valid and invalid), share kit, student arrival via code, valid / duplicate / invalid submissions, CSV import and error, planner recalculation, day switching, real `?ref=` link, reset. No JavaScript errors.

## Manual test checklist
See the "About & test checklist" tab in the app.
