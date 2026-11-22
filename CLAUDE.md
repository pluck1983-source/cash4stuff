# Wardrobe to Wallet (cash4stuff)

## Hosting and Google setup

- **Live:** https://pluck1983-source.github.io/cash4stuff/ (GitHub Pages).
- **Google Cloud project:** **David's Apps** (in the owner's personal Gmail
  account) - project ID `empyrean-plexus-504512-b6`, number `285172097021`.
  Shared with the Tax Planner: same OAuth client, so changing its redirect
  URIs, consent screen or test users affects both apps.
- **OAuth client:** `285172097021-…`, in `.env` (`VITE_GOOGLE_CLIENT_ID`).
- **Scope:** `openid email` + `drive.file` (since PR #48; previously full
  `drive`).
- **Data:** a `Wardrobe to Wallet` folder (`cash4stuff-data.json` + `photos`)
  in Google Drive. PR #47 added moving it into a business Google account -
  confirm with the owner which account holds it now and record it here.

## Keep the app registry up to date

The owner keeps one summary of every app's hosting and Google setup in
`pluck1983-source/app-registry` (`APPS.md`). Whenever you change any of the
following in this repo, update **this file**, the README's Google section,
**and** `APPS.md` in that repo, in the same piece of work:

- the live web address / hosting
- the Google account, Google Cloud project, or OAuth client ID it signs in with
- the Google scopes it asks for
- where its data is stored (Drive folder, app-data folder, which account)

If `app-registry` isn't attached to the session, ask the owner to attach it
rather than skipping the update. Never write email addresses into these
files - the repos are public; describe accounts instead ("personal Gmail",
"Wardrobe to Wallet account").
