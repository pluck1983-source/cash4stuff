/** How a pickup's weighed-in kilos are rounded before the per-kg rate is applied */
export type WeightRounding = 'nearest' | 'up' | 'down' | 'none';

export interface Settings {
  /** Price paid per kg of stock bought in, in pounds */
  costPerKg: number;
  /** Kilos are rounded to this step (0.5 = half a kilo) before pricing */
  weightStepKg: number;
  weightRounding: WeightRounding;
  /**
   * When a repeat customer's new pickup comes at least this many days after
   * their last one, with no more than newGroupItemsLeft of the old stock still
   * in hand, the app offers to start a new group for their costs and profit.
   */
  newGroupAfterDays: number;
  newGroupItemsLeft: number;
  /** Item categories offered when adding stock */
  categories: string[];
  /** Optional sub-categories per category (e.g. Tops -> T-shirts, Shirts) */
  subcategories: Record<string, string[]>;
  /** Storage areas offered when adding stock (e.g. "Garage", "Unit 4") */
  storageAreas: string[];
  /** Where things sell (e.g. "Vinted", "eBay", "Depop") */
  salesChannels: string[];
  expenseCategories: string[];
  /** Which self-assessment expense box each cost type goes in (Finance tab) */
  expenseTaxBoxes: Record<string, TaxExpenseBox>;
  /** Cash basis (the default for sole traders) records money when it moves; there's no stock valuation */
  accountingBasis: 'cash' | 'accruals';
  /** Printed on purchase receipts */
  businessName: string;
  traderName: string;
  businessAddress: string;
}

export type PaymentMethod = '' | 'cash' | 'bank' | 'card' | 'other';

/** One change to a record made after the day it was entered: field -> [before, after] */
export interface EditRecord {
  at: string;
  changes: Record<string, [string, string]>;
}

/**
 * Money records are never deleted - they're voided, with a reason, and edits
 * made after the day of entry are logged - so the books show what happened.
 */
export interface Audited {
  /** When it was first entered - shown in the records, since back-filled books are a red flag */
  createdAt: string;
  voidedAt: string | null;
  voidReason: string;
  history: EditRecord[];
}

/** Allowable-expense headings on the HMRC self-employment pages (SA103) */
export type TaxExpenseBox =
  | 'goods'
  | 'travel'
  | 'staff'
  | 'premises'
  | 'repairs'
  | 'office'
  | 'advertising'
  | 'interest'
  | 'financial'
  | 'professional'
  | 'other'
  | 'not_allowable';

export interface PricePoint {
  /** ISO date the item was (re)priced */
  date: string;
  price: number;
}

export type Handover = 'pickup' | 'dropoff';

export interface Pickup extends Audited {
  id: string;
  /** ISO date (yyyy-mm-dd) */
  date: string;
  /** The seller's name (older pickups may hold an address or other label here) */
  reference: string;
  sellerAddress: string;
  sellerPostcode: string;
  /** Collected from the seller, or they dropped it off */
  handover: Handover;
  /** Weight as weighed, in kg - rounding is applied when working out the cost */
  weightKg: number;
  /**
   * What was actually paid, when it differs from weight x rate (a rounded-up
   * offer, a freebie). Null means use the calculated cost.
   */
  costOverride: number | null;
  /** £/kg when it was bought - later rate changes don't re-price it */
  ratePerKg: number;
  /** What was paid, worked out and saved when entered */
  amountPaid: number;
  paymentMethod: PaymentMethod;
  /** Bank statement reference, for transfers */
  bankRef: string;
  /** Seller's phone or email, in case HMRC asks */
  sellerContact: string;
  /** Business miles driven for this pickup (there and back), if recorded */
  miles: number | null;
  /** Sequential purchase receipt number, given once and never changed */
  receiptNumber: number | null;
  /** On-screen seller signature, kept in the photo store */
  signaturePhotoId: string | null;
  /** Seller signed a paper slip instead */
  paperSlipSigned: boolean;
  notes: string;
  /**
   * When every item from this pickup had been added to stock. Resolved
   * pickups drop out of the pickup picker when adding items; null = still open.
   */
  resolvedAt: string | null;
  /**
   * Starts a new group for a repeat customer: this pickup and their later ones
   * are counted together, apart from the ones before it.
   */
  startsNewGroup: boolean;
  /** Used to merge edits made on different devices - the newer edit of a record wins */
  updatedAt: string;
}

export interface StorageLocation {
  area: string;
  rack: string;
  box: string;
}

/** Who it's for - separate from category so "Tops" works for everyone */
export type ItemGender = '' | 'mens' | 'womens' | 'boys' | 'girls';

export type ItemStatus = 'in_stock' | 'listed' | 'sold' | 'written_off';

export interface Item {
  id: string;
  /** Stock code, e.g. TOP-0042 - given automatically when left blank, or typed in */
  sku: string;
  /** Null for stock not bought by weight (e.g. bought individually, or donated) */
  pickupId: string | null;
  name: string;
  /** Extra search words - brand, colour, size, style */
  keywords: string;
  category: string;
  /** Optional - empty when the category has no sub-categories or none was picked */
  subcategory: string;
  gender: ItemGender;
  /** Key of the compressed photo in the photo store, if one was taken */
  photoId: string | null;
  /**
   * SHA-256 of the photo file exactly as it was picked (before shrinking), so
   * picking the same file again can be spotted. Null for photos added before
   * this was recorded, and for items without a photo.
   */
  photoHash: string | null;
  /** Set when the photo AI wasn't sure of its guess; cleared once someone saves or confirms the item */
  needsCheck?: boolean;
  location: StorageLocation;
  /** How many identical units this record covers (1 for a single piece) */
  quantity: number;
  /** Current asking price per unit, null if not yet priced */
  listPrice: number | null;
  /** Every asking price it has had, oldest first - so reductions and sold-vs-listed can be tracked */
  priceHistory: PricePoint[];
  /** Listed = live on a selling site; in_stock = stored but not live yet */
  status: ItemStatus;
  /** ISO date it went up online; null if not listed or listed before this was recorded */
  listedDate: string | null;
  /** Total for every unit in this record (a part-sold record is split off, so this is what that sale took) */
  soldPrice: number | null;
  /** ISO date */
  soldDate: string | null;
  salesChannel: string;
  /** Selling fees / postage paid by the seller on this sale */
  saleCosts: number;
  /** Changes to the sale made after the day it was recorded */
  history: EditRecord[];
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface Expense extends Audited {
  id: string;
  date: string;
  category: string;
  description: string;
  amount: number;
  /** Optionally tie a cost (e.g. fuel for the trip) to a pickup so it counts against that pickup's profit */
  pickupId: string | null;
  /** Set when the cost was posted automatically by a repeating cost */
  recurringId: string | null;
  paymentMethod: PaymentMethod;
  /** Photos of receipts/invoices, kept in the photo store */
  attachmentIds: string[];
  updatedAt: string;
}

export type RecurringFrequency = 'weekly' | 'monthly';

/** A cost that repeats (rent, storage unit) - one Expense is posted per period up to today */
export interface RecurringCost {
  id: string;
  category: string;
  description: string;
  /** Normal amount per week/month */
  amount: number;
  frequency: RecurringFrequency;
  /** ISO date of the first payment; later ones fall on the same weekday / day of the month */
  startDate: string;
  /** Last date a payment can fall on, null = until stopped */
  endDate: string | null;
  /** Discounted amount for the first introPeriods payments (e.g. first 8 weeks half price) */
  introAmount: number | null;
  introPeriods: number;
  pickupId: string | null;
  updatedAt: string;
}

/** rag = unsellable stock to a rag merchant; charity = unsellable bags weighed out to charity bins; bulk = a lot sold by weight */
export type IncomeKind = 'rag' | 'charity' | 'bulk' | 'other';

/** Money in that isn't an item sale (e.g. a bulk lot sold by weight, a refund) */
export interface OtherIncome extends Audited {
  id: string;
  date: string;
  kind: IncomeKind;
  /** Who paid - the rag merchant, a market buyer */
  buyer: string;
  weightKg: number | null;
  paymentMethod: PaymentMethod;
  description: string;
  amount: number;
  pickupId: string | null;
  updatedAt: string;
}

/** Pay and tax from a job (P60/P45 figures), for the tax estimate on the Finance tab */
export interface Employment {
  id: string;
  /** UK tax year id, e.g. "2025-26" */
  taxYear: string;
  employer: string;
  grossPay: number;
  taxPaid: number;
  updatedAt: string;
}

export type BookingStatus = 'booked' | 'done' | 'cancelled';

/** A pickup arranged in the Diary - who, where and when */
export interface Booking {
  id: string;
  /** ISO date agreed for the pickup */
  date: string;
  /** "HH:MM", or '' when no time was agreed */
  time: string;
  name: string;
  address: string;
  postcode: string;
  contact: string;
  notes: string;
  status: BookingStatus;
  /** The pickup recorded for it, once done */
  pickupId: string | null;
  /** Round-trip miles tracked (or typed) for the visit */
  miles: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface AppState {
  version: 1;
  settings: Settings;
  settingsUpdatedAt: string;
  pickups: Pickup[];
  items: Item[];
  expenses: Expense[];
  otherIncome: OtherIncome[];
  employments: Employment[];
  recurring: RecurringCost[];
  bookings: Booking[];
  /**
   * Record id -> when it was deleted. Kept so a device that still has the
   * record doesn't bring it back when the two copies are merged.
   */
  tombstones: Record<string, string>;
  /** Photos no longer used by any item, so their cloud copies can be removed */
  deletedPhotoIds: string[];
}
