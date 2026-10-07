# Cash4Stuff

A phone-and-desktop app for a small resale clothing business that buys
people's old clothes by the kilo and sells them on. It tracks what every
pickup cost, every item that came out of it (with a photo and where it's
stored), what each item is listed at and what it sold for - so you can see
whether a pickup actually made money - plus all the running costs of the
business.

Live at **https://pluck1983-source.github.io/cash4stuff/** once the
one-time Google setup below is done. Add it to your phone's home screen
(Safari: Share → Add to Home Screen) and it runs like an app, including
offline.

## What it does

- **Pickups** - log who/where it came from (a name, an address or just a
  reference), the date and the weight. The cost is worked out as you type:
  weight rounded to the nearest 0.5 kg × £1/kg by default (rate, rounding
  step and rounding direction are in Settings). If you paid something
  different, enter the actual amount and that's used instead.
- **Adding stock (the quick flow)** - pick the pickup (defaults to the
  latest), snap a photo, give it a quick name, tap a category, tap the
  storage area and type the rack and box, enter the listing price, then
  **Save & add another**. The pickup, category and location stay filled in
  for the next item, so boxing up a bag of clothes is a few taps each.
  Photos are shrunk on the phone (to ~1200 px JPEG, typically 100-300 KB)
  before they're stored.
- **Selling** - open an item (search or filter for it), enter what it sold
  for, where, and any fees/postage you paid, and **Mark as sold**.
- **Per-pickup profitability** - each pickup shows total cost (stock plus
  any fuel/parking etc. you tag to it), what's sold so far, profit so far
  and return, and the profit if the rest sells at list price. Stock cost is
  split evenly across the items logged from a pickup to give a cost per item.
- **Stock** - every item, filterable by text, status, category, pickup,
  storage area, rack, box and price, sortable, with a photo table on desktop
  and cards on a phone. Export the filtered list as CSV.
- **Costs & income** - running costs (fuel, storage, rent, bags, postage,
  equipment…) with a type, optionally linked to a pickup; and income that
  isn't an item sale (e.g. a bulk lot sold by weight).
- **Dashboards**
  - *Phone*: quick-action buttons and the key numbers for this month (or
    any period), the latest pickups and what needs attention.
  - *Desktop*: total income, net profit, total business cost, stock cost,
    running costs, stock value at list price, stock at cost and more, an
    income-vs-costs chart for the last 12 months, pickup profitability,
    costs by type, sales by category, recent sales, stock by location and a
    "needs attention" list. **Customise** shows/hides, reorders and widens
    panels and picks which key figures to show (saved per computer).
  - Period: this month, last month, this year, this UK tax year, all time.
    Stock value figures are always "as of now".

## Sign-in, sync and where the data lives

Signing in with Google is how you get into the app. There's no server of
our own: the browser talks straight to Google.

- Data is saved as `cash4stuff-data.json`, and each photo as
  `photo-<id>.jpg`, in the Drive *app data* folder - a hidden folder only
  this app can see. The app is only granted that folder (`drive.appdata`)
  plus your email address (to show who's signed in), not the rest of your
  Drive.
- Every device keeps its own copy, so it works offline and syncs when back
  online. Edits upload a couple of seconds after you stop; opening or
  switching back to the app pulls in changes from other devices, and an
  open desktop checks every minute.
- Phone and desktop can both be used at the same time: the two copies are
  merged record by record (the newer edit of a record wins, and deletions
  stick), so you're never asked to pick one whole copy over the other.
- Photos taken on the phone upload in the background; the desktop
  downloads each one the first time it's shown.
- Google's sign-in lasts an hour. When it runs out the app briefly bounces
  to Google and straight back (once per session); if Google needs you to
  act, a **Reconnect Google** button appears. Edits made meanwhile stay on
  the device and upload after you reconnect.
- **Settings → Sign out & clear this device** removes all data and photos
  from that device (use it on a borrowed/shared computer). Plain sign out
  keeps the device's copy.
- Settings also has a JSON backup download/restore (everything except
  photos).

### One-time Google setup

The app uses the same Google Cloud project and OAuth client as the Tax
Planner (same `pluck1983-source.github.io` origin), so there's one step:

1. In [console.cloud.google.com](https://console.cloud.google.com), open the
   Tax Planner project → **Google Auth Platform → Clients** → the web
   client → under *Authorized redirect URIs* add
   `https://pluck1983-source.github.io/cash4stuff/` and save.
2. Make sure GitHub Pages is set to deploy from **GitHub Actions**
   (repo Settings → Pages); the workflow tries to enable it itself.

Google's consent screen will show the Tax Planner project's app name. To
give Cash4Stuff its own name/consent screen, create a separate project
following the same steps as the Tax Planner README (enable Drive API,
External consent screen with your address as a test user, a Web client with
the origin and redirect above) and put its client ID in `.env` as
`VITE_GOOGLE_CLIENT_ID`. Note the Drive app-data folder belongs to the
Cloud project, so switching projects later starts with an empty cloud copy
(each device's local copy then merges into it on next sign-in).

While the consent screen is in *Testing*, only the Google accounts listed
as test users can sign in - that's the access control for the cloud data.

## Development

```bash
npm install
npm run dev      # dev server on http://localhost:5173
npm test         # vitest
npm run lint     # oxlint
npm run build    # type-check and production build
```

To test sign-in locally, add `http://localhost:5173` as an authorised origin
and redirect URI on the OAuth client. Building with an empty
`VITE_GOOGLE_CLIENT_ID` skips sign-in entirely and keeps data on the device
("Local only").
