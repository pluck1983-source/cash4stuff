import type { AiSuggestion, Item } from './types';

/** True when the photo AI's answer would change something worth a look: a different category or women's/men's, a sub-category or name where there's none */
export function suggestionDiffers(item: Pick<Item, 'category' | 'subcategory' | 'gender' | 'name'>, s: AiSuggestion): boolean {
  return (
    (s.category !== '' && s.category !== item.category) ||
    (s.gender !== '' && s.gender !== item.gender) ||
    (s.name !== '' && !item.name) ||
    (s.subcategory !== '' && s.category === item.category && !item.subcategory)
  );
}

/** The changes made by accepting a suggestion. Names already typed in are kept. */
export function acceptSuggestion(item: Pick<Item, 'category' | 'subcategory' | 'gender' | 'name'> & { keywords?: string }, s: AiSuggestion): Partial<Item> {
  const newCategory = s.category && s.category !== item.category;
  return {
    ...(!item.keywords && s.keywords ? { keywords: s.keywords } : {}),
    category: s.category || item.category,
    subcategory: newCategory ? s.subcategory : item.subcategory || s.subcategory,
    gender: s.gender || item.gender,
    name: item.name || s.name,
    aiSuggestion: undefined,
    needsCheck: false,
  };
}

/** Details on a bulk-add photo the photo AI can fill in */
export type BulkField = 'name' | 'gender' | 'category' | 'subcategory' | 'keywords';

export interface BulkDetails extends Pick<Item, BulkField> {
  /** Fields picked or typed by hand (one by one or "for all") - the AI never changes these */
  manual: Partial<Record<BulkField, true>>;
}

/**
 * A bulk-add photo with the photo AI's answer filled in. Everything not set
 * by hand takes the AI's answer, including values copied from the last item
 * or the batch; where the AI left a field blank the current value stays.
 */
export function fillFromSuggestion<T extends BulkDetails>(row: T, s: AiSuggestion, subcategories: Record<string, string[]>): T & { needsCheck: boolean; suggested: boolean } {
  const m = row.manual;
  const category = m.category ? row.category : s.category || row.category;
  const fits = s.subcategory !== '' && (subcategories[category] ?? []).includes(s.subcategory);
  const subcategory = m.subcategory ? row.subcategory : fits ? s.subcategory : category === row.category ? row.subcategory : '';
  return {
    ...row,
    name: m.name || row.name ? row.name : s.name,
    keywords: m.keywords || row.keywords ? row.keywords : (s.keywords ?? ''),
    gender: m.gender ? row.gender : s.gender || row.gender,
    category,
    subcategory,
    suggested: !m.category && s.category !== '',
    needsCheck: !category || (!m.category && !s.sure),
  };
}
