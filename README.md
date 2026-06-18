# Expence Tracker

One single file: `index.html`. Open it on a live web server or upload it to GitHub Pages — everything (HTML, CSS, JavaScript, Firebase) is inside that one file.

## If sign up / login / saving doesn't work, check these 3 things first

1. **Email/Password sign-in must be turned on.** Firebase Console → Authentication → Sign-in method → Email/Password → Enable → Save.
2. **Firestore database must exist.** Firebase Console → Firestore Database → Create database (production mode is fine).
3. **Security rules must be published.** Firestore → Rules tab → paste in `firestore.rules` from this folder → Publish.

If all three are done and it still fails, open the browser's developer console (F12 → Console tab) and check the exact red error message — that tells you precisely what's wrong (e.g. `auth/operation-not-allowed` means step 1 wasn't done; `permission-denied` means step 3 wasn't done).

## Deploying to GitHub Pages

1. Push `index.html` to a GitHub repository.
2. Repository → Settings → Pages → Source: "Deploy from a branch" → branch `main`, folder `/ (root)` → Save.
3. Your site goes live at `https://<username>.github.io/<repo-name>/` within a minute or two.
4. Firebase Console → Authentication → Settings → Authorized domains → add that `github.io` domain.

## What it does

Sign up / log in / log out, add an expense (name, amount, currency), see today's total and count, see history grouped into Today / Yesterday / Older, delete a single expense, or clear everything — each with a confirmation prompt. Every save is verified right after writing, and the dashboard numbers are always recalculated fresh from the actual saved expenses, never from a separate stored total.
