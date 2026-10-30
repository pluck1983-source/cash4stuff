import type { AiSuggestion, Item } from './types';

/** True when the photo AI's answer would change something worth a look: a different category or women's/men's, or a name for an unnamed item */
export function suggestionDiffers(item: Pick<Item, 'category' | 'gender' | 'name'>, s: AiSuggestion): boolean {
  return (s.category !== '' && s.category !== item.category) || (s.gender !== '' && s.gender !== item.gender) || (s.name !== '' && !item.name);
}

/** The changes made by accepting a suggestion. Names already typed in are kept. */
export function acceptSuggestion(item: Pick<Item, 'category' | 'subcategory' | 'gender' | 'name'>, s: AiSuggestion): Partial<Item> {
  const newCategory = s.category && s.category !== item.category;
  return {
    category: s.category || item.category,
    subcategory: newCategory ? s.subcategory : item.subcategory || s.subcategory,
    gender: s.gender || item.gender,
    name: item.name || s.name,
    aiSuggestion: undefined,
    needsCheck: false,
  };
}
