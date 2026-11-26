# Brief: "Import from Vinted"

Written 26 Nov 2026 in a claude.ai chat, for the Cash4stuff Claude Code session.
Status: not started. Nothing in `src/` has been changed for this yet.

## Goal

Pull Yvonne's live Vinted listings into the stock list. Listings already in the
app must not be added again. Running the import later should refresh the list
safely, without creating duplicates.

## Where the data comes from

Vinted's own data export is too slow (still not arrived after 2+ weeks). In a
separate chat, Claude will open her Vinted profile in a browser and scroll it,
saving one file: **`vinted-import.zip`**. The app only needs to read that file.
There is no scraping or Vinted API inside the app.

### File format (version 1)

```
vinted-import.zip
├── listings.json
└── photos/
    ├── 4567890123-1.jpg     <vintedId>-<photo number>.jpg, 1 = main photo
    ├── 4567890123-2.jpg
    └── ...
```

`listings.json`:

```json
{
  "format": "cash4stuff-vinted-import",
  "version": 1,
  "capturedAt": "2026-11-27T19:40:00Z",
  "profileUrl": "https://www.vinted.co.uk/member/...",
  "listings": [
    {
      "vintedId": "4567890123",
      "url": "https://www.vinted.co.uk/items/4567890123-...",
      "title": "Levi's 501 jeans W32 L30",
      "description": "Free text exactly as on Vinted",
      "price": 14.0,
      "currency": "GBP",
      "brand": "Levi's",
      "size": "W32 L30",
      "condition": "Very good",
      "vintedCategory": ["Men", "Clothing", "Jeans"],
      "colours": ["Blue"],
      "state": "active",
      "uploadedText": "2 weeks ago",
      "photos": ["photos/4567890123-1.jpg", "photos/4567890123-2.jpg"]
    }
  ]
}
```

- `state` is `active`, `reserved` or `sold`. Sold items may still appear on the
  profile.
- Every field apart from `vintedId`, `url`, `title`, `price` and `photos` can be
  missing or empty. Handle missing fields without failing.
- `uploadedText` is Vinted's rough wording ("2 weeks ago"). Don't turn it into
  a date. Keep `listedDate` null unless the item already has one.
- Check `format` and `version`. Refuse a file that doesn't match, with a plain
  message.

## The key design decision: match on the Vinted ID, not on photos

- **Photo fingerprints won't work for this.** `photoHash` is a SHA-256 of the
  original file. Vinted shrinks and re-saves every photo, so a Vinted photo
  never matches the photo taken in the app.
- **Add an optional field to `Item`:** `vintedId?: string`. It's optional so
  existing data and older devices keep working. *Check:* sync merges a whole
  record and the newer `updatedAt` wins. Make sure a device running an older
  build doesn't remove the field when it saves an item. If it does, the field
  has to survive those saves before this ships.
- Once an item has a `vintedId`, every later import matches it exactly. The AI
  is used **only** for listings that aren't linked to an item yet, which in
  practice means the first import.

## Import flow

1. **Settings / Stock → "Import from Vinted"**. Choose `vinted-import.zip`.
   Unzip it in the browser (`src/lib/zip.ts` may already do this; check).
2. **Exact matches** (`vintedId` already on an item):
   - If the price changed, update `listPrice` and add to `priceHistory`.
   - If `state` is `active`/`reserved` and the item is `in_stock`, set it to
     `listed` with `salesChannel: 'Vinted'`.
   - If `state` is `sold`, **don't record the sale** (the price and date aren't
     known). Show it under "Sold on Vinted – record the sale?".
   - Never overwrite a name, keywords, notes or photo Yvonne has edited.
3. **Unlinked listings → AI check.** Reuse `findSameItem()` in
   `src/lib/autoCategorise.ts`. It already compares one photo with candidate
   photos and returns `{ candidate, sure }`.
   - Candidates: items with no `vintedId`, `status` `in_stock` or `listed`,
     and a photo.
   - **Narrow the candidates first, or the cost grows quickly.** Run the
     existing categorise call on the listing's main photo (or map
     `vintedCategory`). Compare only against items with the same category
     and gender. If that gives nothing, fall back to the same category only.
   - Before running, show "About N photo checks, roughly £X". Base the estimate
     on the actual candidate counts, using the same per-photo cost wording as
     PhotoAiSettings.
   - Needs the unlocked photo-AI key (`aiKey.ts`). If it's locked, ask for Face
     ID. If there's no key, skip the AI step and treat every unlinked listing
     as new, saying so on screen.
   - Run in small batches with a progress bar and a Stop button. A failed call
     should mark that listing "not checked", not stop the whole import.
4. **Review screen** (nothing is saved before this step):
   - **Probably already in stock (sure)**: listing photo next to the item's
     photo, ticked, with "Confirm all".
   - **Might be in stock (not sure)**: shown one at a time, unticked: "Same
     item" / "Not the same".
   - **New**: listings with no match, ticked to add.
   - **Sold on Vinted**: see step 2.
   - **No longer on Vinted**: items with a `vintedId` that aren't in this file.
     Show only; they may be sold, hidden or deleted. Don't change them
     automatically.
5. **Import** button applies everything ticked:
   - **Confirmed match:** set `vintedId`, `status: 'listed'`,
     `salesChannel: 'Vinted'`, update `listPrice`/`priceHistory`. Keep the
     item's own photo, name, SKU, pickup and location.
   - **New item:** `name` = title; `keywords` = brand, size and colours;
     `notes` = description + condition + URL; `listPrice` = price;
     `priceHistory` = one point; `status: 'listed'`;
     `salesChannel: 'Vinted'`; `vintedId`; `pickupId: null`; empty
     location; SKU through the existing `makeSku`/`assignMissingSkus`;
     category/subcategory/gender from the AI categorise result, with
     `needsCheck: true` when the AI isn't sure. Photo = main Vinted photo
     through `compressImage` → `savePhoto` and `photoFingerprint` for
     `photoHash`, the same path as a normal add, so it syncs to Drive.
   - Show a summary toast: "12 linked, 40 added, 3 to check".
6. Make it safe to run again: importing the same file twice must change
   nothing the second time.

## Rules to keep

- The AI never changes `status`, prices, quantity or sale fields itself
  (`AI_FORBIDDEN` in `useAppState.ts`). Every change in this flow comes from
  Yvonne's review choices, not from the AI's answer directly.
- Don't auto-merge, even when the AI is sure. One tap confirms, but it's still
  a tap.
- Any list that can be reordered uses drag, not visible up/down arrows
  (keyboard arrows only as a hidden fallback).
- Write unit tests next to the existing `*.test.ts` files: parsing and
  validating the file, exact-match updates, running the import twice, the
  "no longer on Vinted" list, and narrowing the candidates.

## Things this doesn't change

Hosting, Google sign-in, OAuth client, scopes and the Drive data location all
stay as they are. If nothing in that list changes, `CLAUDE.md`, the README's
Google section and `app-registry/APPS.md` don't need editing. If anything does
change, update all three in the same piece of work, as `CLAUDE.md` says.

## Open questions for David

1. Should matched items keep the app photo (planned) or swap it for the
   Vinted main photo?
2. Should extra Vinted photos (2, 3, …) be kept as well? `Item` only has one
   `photoId` today.
3. Should "Sold on Vinted" items offer a quick "record sale at list price"
   button, or always be entered by hand?
