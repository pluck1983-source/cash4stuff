/** How a pickup's weighed-in kilos are rounded before the per-kg rate is applied */
export type WeightRounding = 'nearest' | 'up' | 'down' | 'none';

export interface Settings {
  /** Price paid per kg of stock bought in, in pounds */
  costPerKg: number;
  /** Kilos are rounded to this step (0.5 = half a kilo) before pricing */
  weightStepKg: number;
  weightRounding: WeightRounding;
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

export interface Pickup {
  id: string;
  /** ISO date (yyyy-mm-dd) */
  date: string;
  /** Who/where it came from - a name, an address or just a reference */
  reference: string;
  /** Weight as weighed, in kg - rounding is applied when working out the cost */
  weightKg: number;
  /**
   * What was actually paid, when it differs from weight x rate (a rounded-up
   * offer, a freebie). Null means use the calculated cost.
   */
  costOverride: number | null;
  notes: string;
  createdAt: string;
  /** Used to merge edits made on different devices - the newer edit of a record wins */
  updatedAt: string;
}

export interface StorageLocation {
  area: string;
  rack: string;
  box: string;
}

export type ItemStatus = 'in_stock' | 'listed' | 'sold' | 'written_off';

export interface Item {
  id: string;
  /** Null for stock not bought by weight (e.g. bought individually, or donated) */
  pickupId: string | null;
  name: string;
  category: string;
  /** Optional - empty when the category has no sub-categories or none was picked */
  subcategory: string;
  /** Key of the compressed photo in the photo store, if one was taken */
  photoId: string | null;
  location: StorageLocation;
  /** Current asking price, null if not yet priced */
  listPrice: number | null;
  /** Every asking price it has had, oldest first - so reductions and sold-vs-listed can be tracked */
  priceHistory: PricePoint[];
  /** Listed = live on a selling site; in_stock = stored but not live yet */
  status: ItemStatus;
  soldPrice: number | null;
  /** ISO date */
  soldDate: string | null;
  salesChannel: string;
  /** Selling fees / postage paid by the seller on this sale */
  saleCosts: number;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface Expense {
  id: string;
  date: string;
  category: string;
  description: string;
  amount: number;
  /** Optionally tie a cost (e.g. fuel for the trip) to a pickup so it counts against that pickup's profit */
  pickupId: string | null;
  updatedAt: string;
}

/** Money in that isn't an item sale (e.g. a bulk lot sold by weight, a refund) */
export interface OtherIncome {
  id: string;
  date: string;
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

export interface AppState {
  version: 1;
  settings: Settings;
  settingsUpdatedAt: string;
  pickups: Pickup[];
  items: Item[];
  expenses: Expense[];
  otherIncome: OtherIncome[];
  employments: Employment[];
  /**
   * Record id -> when it was deleted. Kept so a device that still has the
   * record doesn't bring it back when the two copies are merged.
   */
  tombstones: Record<string, string>;
  /** Photos no longer used by any item, so their cloud copies can be removed */
  deletedPhotoIds: string[];
}
