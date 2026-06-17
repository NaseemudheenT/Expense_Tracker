# Expence Tracker

A premium, mobile-first expense tracker with a white-and-gold luxury finance look, secure per-user data in Firebase, and real-time syncing.

![Expence Tracker logo](logo.png)

## What it does

People sign up, log in, and log daily expenses (name, amount, currency). The dashboard shows **today's total and count only** — never a lifetime total — and a full history grouped into **Today / Yesterday / Older**, newest first. Every number on screen is recalculated live from the actual saved expense records, so the dashboard can never drift out of sync with the data.

## Project structure

```
.github/                          (keep as-is)
README.md                         (this file)
app-design.png                    UI reference used to build the interface
google703551b964aecad2.html       Google Search Console verification (keep as-is, do not touch)
index.html                        App markup — auth screens + dashboard
logo.png                          App logo / favicon
script.js                         All application logic
styles.css                        All styling
firebase.js                       Firebase initialization (Auth + Firestore)
firestore.rules                   Security rules to paste into Firebase Console
```

> **Do not delete, rename, or edit** `.github/`, `google703551b964aecad2.html`, or this `README.md`'s existing content if you already have versions of them in your repo — they're untouched by this build.

## Tech stack

Plain HTML, CSS, and JavaScript (ES modules) — no build step, no framework, no npm install required. Firebase v9+ Modular SDK is loaded straight from Google's CDN inside `firebase.js` and `script.js`. This means you can open the project directly or host it on GitHub Pages with zero configuration.

## How the data flow works

Every expense follows the same disciplined pipeline, implemented in `script.js`:

1. **Input** — read the name, amount, and currency from the form.
2. **Validation** — reject empty names, non-numeric or non-positive amounts, and unreasonably large values immediately, with an inline error message.
3. **Transaction creation** — build a transaction object with a server timestamp.
4. **Save** — write it to Firestore under `users/{uid}/expenses/{expenseId}` (Firestore generates the unique ID).
5. **Save verification** — re-fetch the document right after saving to confirm it actually exists; if not, the save is treated as failed.
6. **Loading protection** — the Add Expense button is disabled and shows a spinner from the moment of submission until the operation finishes, success or failure, with a 15-second hard safety timeout so it can never hang forever.
7. **Recalculation** — a real-time Firestore listener (`onSnapshot`) recomputes today's total, today's count, and every day-group total directly from the live list of transactions — nothing is read from a pre-stored "total" field.
8. **Data integrity** — incoming records are de-duplicated by document ID and any record with a missing name or invalid amount is silently dropped rather than corrupting the totals.
9. **Dashboard update** — the today card and history list re-render automatically every time the underlying data changes.
10. **Backup** — every successful sync is mirrored into `localStorage` as a fallback, and users can also download a manual JSON backup from the side menu.
11. **Recovery** — if a save fails (e.g. offline), the entry is queued locally and automatically retried the next time the browser comes back online; if the real-time listener itself fails, the UI falls back to the last good local backup instead of showing a blank screen.
12. **Audit log** — deletions and "clear all" actions are recorded with a timestamp in `localStorage` for traceability.
13. **Reporting** — the Today / Yesterday / Older grouping with per-group totals is the report; everything is generated from the transaction list, on demand.
14. **Startup verification** — when the app loads, Firebase's auth listener fires, the expense listener attaches, and the same recalculation/render pipeline runs immediately, so the dashboard is always correct on first load and after every refresh.

Because totals are always derived from the transaction list rather than stored separately, the dashboard cannot show a number that disagrees with the underlying records.

## Firebase setup guide

This project is already wired to a specific Firebase project's config inside `firebase.js`. If that project is yours and already exists, skip to step 4. Otherwise, to create your own:

1. **Create the Firebase project** — go to [console.firebase.google.com](https://console.firebase.google.com), click **Add project**, name it, and finish the wizard (Google Analytics is optional).
2. **Enable Authentication** — in the left sidebar, open **Build → Authentication → Get started**.
3. **Enable Email/Password sign-in** — under the **Sign-in method** tab, click **Email/Password**, toggle it **on**, and save.
4. **Create the Firestore database** — open **Build → Firestore Database → Create database**. Choose **Start in production mode** and pick a location close to your users.
5. **Apply the security rules** — open the **Rules** tab in Firestore, replace the contents with everything inside `firestore.rules` from this project, and click **Publish**.
6. **Register a Web App** — from Project Overview, click the **</>** (web) icon, give the app a nickname, and Firebase will show you a config object. If you're using your own Firebase project (not the one already configured), copy that config into `firebaseConfig` inside `firebase.js`, replacing the existing values exactly field-for-field.
7. **Test locally** — this project uses ES module imports (`<script type="module">`), which browsers block from loading over the `file://` protocol for security reasons. **Do not just double-click `index.html`.** Instead, serve the folder, for example by running `python3 -m http.server 8000` inside the project folder and opening `http://localhost:8000` in your browser, or by using the "Live Server" extension in VS Code. Try signing up; a new document should appear under **Firestore → users** in the console. This restriction disappears entirely once the site is deployed to GitHub Pages, since it's served over `https://`.

## GitHub Pages deployment guide

1. Push this entire folder to a GitHub repository (public or private, both work with Pages on a paid plan; public repos work on the free plan).
2. In the repository, go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
4. Choose the branch (usually `main`) and the folder `/ (root)`, then click **Save**.
5. Wait 1–2 minutes; GitHub will show your live URL at the top of the Pages settings page, in the form `https://<username>.github.io/<repository-name>/`.
6. Open that URL — your Expence Tracker is now live. Any future push to that branch redeploys it automatically.
7. In the Firebase Console, go to **Authentication → Settings → Authorized domains** and add your `github.io` domain (and any custom domain you later attach), or sign-in requests from that origin will be blocked.

## Google Search Console

`google703551b964aecad2.html` is your Google site-ownership verification file. **Do not modify, rename, move, or delete it** — Google checks for that exact file at that exact path to confirm you own the site. Once the site is live on GitHub Pages, simply add the property in [Google Search Console](https://search.google.com/search-console) using the same domain and click **Verify**; since the file is already deployed alongside `index.html`, verification should succeed immediately.

## Final testing checklist

- [ ] Sign up with a new email — a Firebase Auth user is created and you land on the dashboard immediately.
- [ ] Refresh the page while logged in — you stay logged in (no redirect to the login screen).
- [ ] Log out, then log back in with the same credentials — it works and shows the correct name in the side menu.
- [ ] Try logging in with a wrong password — a clear, friendly error message appears (not a raw Firebase error code).
- [ ] Try signing up with mismatched passwords — the form blocks submission with an inline message.
- [ ] Add an expense with a valid name and amount — it appears instantly at the top of Today's history, and the Today total/count update immediately.
- [ ] Try adding an expense with an empty name, a zero amount, or a negative amount — each is rejected with a specific inline error and nothing is saved.
- [ ] Add several expenses across different days (you can temporarily check Firestore Console to backdate a test record) — they correctly group under Today / Yesterday / Older.
- [ ] Delete a single expense — a confirmation dialog appears first; after confirming, it disappears and totals recalculate correctly.
- [ ] Click Clear All — a confirmation dialog appears first; after confirming, the history is empty and Today's total resets to ₹0.00.
- [ ] Turn off your network, try adding an expense — you see a clear failure message instead of an infinite spinner; turn the network back on and confirm the queued expense saves automatically.
- [ ] Toggle dark mode from the moon icon or side menu — colors invert cleanly and the preference persists after a refresh.
- [ ] Resize the browser from mobile width up to a large desktop — the layout reflows cleanly with no overlapping elements at any width.
- [ ] Open the browser console — no errors are logged during normal use (sign up, log in, add, delete, clear all, log out).
- [ ] Confirm in the Firebase Console under Firestore that each user's expenses live only under `users/{their-own-uid}/expenses` and that one account cannot see another account's data.
