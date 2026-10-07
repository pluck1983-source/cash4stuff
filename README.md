# Wardrobe to Wallet

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
- **Stock you already have** - add a pickup back-dated to when you got it
  (enter what you paid if you don't know the weight), choose **Save & quick
  entry**, then type one item per line: name, category, list price,
  area/rack/box, status (or "already sold" with the price and date) and
  press Enter. Everything except the name and prices stays set for the next
  item, and items count as in stock since the pickup date. Add photos later
  from each item.
- **Asking vs selling price** - every change to an item's asking price is
  kept (type the new price when you drop it), the stock table
  shows reductions and what each sale got as a % of list, and the dashboard
  shows sold-vs-asking across all sales.
- **Selling** - open an item and tap **Sold at £X** if it went for the asking
  price (one tap: today, the last site you sold on, no fees), or **Sold -
  adjust price**, which
  asks for the final selling price (left blank on
  purpose, so the asking price is never recorded by mistake), the date,
  where, and any fees/postage, then **Confirm sale**.
- **Categories** - your own list in Settings, one per line, with optional
  types after a colon (`Tops: T-shirts, Shirts, Vests`). Renaming a
  category doesn't relabel items already saved under the old name.
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
  - **Monthly figures**: a month-by-month table (income, stock and running
    costs, profit, pickups, items added/sold, average sale, sold vs list) on
    both the phone and desktop dashboards.
  - Period: this month, last month, this year, this UK tax year, all time.
    Stock value figures are always "as of now".

## Finance & tax

The **Finance** tab works per UK tax year (6 April - 5 April) on the cash
basis: sales count when they're sold, stock when it's paid for.

- Turnover and allowable expenses under the headings of the self-employment
  pages of the return (SA103), ready to copy across. Which heading each
  cost type goes under can be changed there.
- Whether the £1,000 trading allowance beats claiming actual expenses.
- Pay and tax from other jobs (P60/P45 figures), then an estimate of income
  tax and Class 4 National Insurance on everything, minus PAYE already paid:
  what's due by 31 January, likely payments on account, and how much the
  business adds to the bill.
- A ledger CSV of every sale, cost and pickup in the year for an accountant.

It's an estimate using England/Wales/NI rates (thresholds frozen to 2031);
Scotland, losses and savings/dividend/property income aren't modelled.

## Sign-in, sync and where the data lives

Everyone signs in with their **own** Google account. There's no server of
our own: the browser talks straight to Google.

- The data lives in a normal **Wardrobe to Wallet** folder in the business owner's
  (folders made before the rename are called Cash4Stuff - rename them freely,
  the app finds its data by file name, not folder name)
  Google Drive: `cash4stuff-data.json` plus a `photos` subfolder with one
  `photo-<id>.jpg` per item. The owner can open it in Drive like any other
  folder.
- Anyone else who uses the app (e.g. a helper) gets access when the owner
  **shares that folder with them as Editor** in Google Drive, and loses it
  when the owner unshares it. Nobody needs anyone else's password.
- The first time an account signs in and no Wardrobe to Wallet data is in its Drive
  or shared with it, the app asks before creating a new folder. The owner
  says OK; a helper says Cancel, gets the owner to share the folder, and
  signs in again. If the shared data later disappears (unshared or
  binned), the app shows an error rather than quietly starting a second
  copy.
- Every device keeps its own copy, so it works offline and syncs when back
  online. Edits upload a couple of seconds after you stop; opening or
  switching back to the app pulls in changes from other devices, and an
  open desktop checks every minute.
- Several people/devices can edit at once: copies are merged record by
  record (the newer edit of a record wins, and deletions stick), so nobody
  is asked to pick one whole copy over another.
- Photos upload in the background; other devices download each one the
  first time it's shown. Photos a helper uploads into the owner's folder
  are owned by the helper's Google account (that's how Drive sharing works
  for personal accounts) and count against the helper's storage.
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
Planner (same `pluck1983-source.github.io` origin). In
[console.cloud.google.com](https://console.cloud.google.com), open that
project, then:

1. **Google Auth Platform → Data access**: add the scope
   `https://www.googleapis.com/auth/drive` (Google Drive API, "See, edit,
   create and delete all of your Google Drive files").
2. **Google Auth Platform → Audience → Test users**: add the Gmail address
   of **every person** who will sign in (the owner and any helpers). While
   the app is in *Testing*, nobody else can sign in at all.
3. **Google Auth Platform → Clients** → the web client → *Authorized
   redirect URIs*: add `https://pluck1983-source.github.io/cash4stuff/`.
4. Repo Settings → Pages → Source: **GitHub Actions** (the workflow tries to
   enable this itself).

Then:

1. **The owner** opens the app, signs in with their Google account and
   presses **OK** to start a new Wardrobe to Wallet folder.
2. In Google Drive, the owner right-clicks the **Wardrobe to Wallet** folder →
   *Share* → adds each helper's Gmail as **Editor**.
3. **Each helper** opens the app and signs in with their own Google account.

Expect Google to show "Google hasn't verified this app" on sign-in
(*Advanced → Go to …*): full Drive access is a restricted scope, and
verifying it is only needed to open the app to the public, not for a
handful of listed test users. Testing-mode sign-ins may also need
re-approving every 7 days.

To give Wardrobe to Wallet its own consent-screen name instead of "Tax Planner",
create a separate Cloud project with the same steps (plus enabling the
Google Drive API) and put its client ID in `.env` as
`VITE_GOOGLE_CLIENT_ID`. The data stays in the Drive folder either way.

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
