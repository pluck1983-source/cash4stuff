import { describe, expect, it } from 'vitest';
import { acceptSuggestion, fillFromSuggestion, suggestionDiffers } from './aiReview';

const item = { category: 'Shoes', subcategory: '', gender: 'womens' as const, name: '' };
const jacket = { name: 'Denim jacket', gender: 'womens' as const, category: 'Coats & jackets', subcategory: 'Jackets', sure: true };

describe('photo AI review', () => {
  it('only asks about real differences', () => {
    expect(suggestionDiffers(item, jacket)).toBe(true);
    expect(suggestionDiffers({ ...item, category: 'Coats & jackets', subcategory: 'Jackets', name: 'Jacket' }, jacket)).toBe(false);
    // Same category but no sub-category yet: worth offering the AI's one
    expect(suggestionDiffers({ ...item, category: 'Coats & jackets', name: 'Jacket' }, jacket)).toBe(true);
    expect(suggestionDiffers({ ...item, name: 'x' }, { ...jacket, category: '', gender: '' })).toBe(false);
  });

  it('accepting changes the category but keeps a typed name', () => {
    expect(acceptSuggestion({ ...item, name: 'Levi jacket' }, jacket)).toMatchObject({ category: 'Coats & jackets', subcategory: 'Jackets', name: 'Levi jacket', needsCheck: false });
    expect(acceptSuggestion(item, { ...jacket, category: '' })).toMatchObject({ category: 'Shoes', name: 'Denim jacket' });
  });
});

describe('bulk add photo AI', () => {
  const subs = { 'Jumpers & knitwear': ['Cardigans', 'Jumpers'], Tops: ['Shirts'] };
  const blank = { name: '', gender: 'womens' as const, category: '', subcategory: '', keywords: '', manual: {} };
  const cardigan = { name: 'Pink cardigan', gender: 'womens' as const, category: 'Jumpers & knitwear', subcategory: 'Cardigans', keywords: 'pink', sure: true };

  it('fills everything not set by hand, including values copied from the last item', () => {
    expect(fillFromSuggestion({ ...blank, gender: 'mens', category: 'Tops' }, cardigan, subs)).toMatchObject({
      name: 'Pink cardigan',
      gender: 'womens',
      category: 'Jumpers & knitwear',
      subcategory: 'Cardigans',
      keywords: 'pink',
      suggested: true,
      needsCheck: false,
    });
  });

  it('keeps hand-picked fields and still fills the sub-category within them', () => {
    const row = { ...blank, gender: 'mens' as const, category: 'Jumpers & knitwear', manual: { gender: true, category: true } as const };
    expect(fillFromSuggestion(row, cardigan, subs)).toMatchObject({ gender: 'mens', category: 'Jumpers & knitwear', subcategory: 'Cardigans', suggested: false, needsCheck: false });
    // A sub-category from another category is not used
    expect(fillFromSuggestion({ ...row, category: 'Tops' }, cardigan, subs)).toMatchObject({ category: 'Tops', subcategory: '' });
  });

  it('flags unsure or uncategorised answers', () => {
    expect(fillFromSuggestion(blank, { ...cardigan, sure: false }, subs).needsCheck).toBe(true);
    expect(fillFromSuggestion(blank, { ...cardigan, category: '', subcategory: '' }, subs)).toMatchObject({ category: '', needsCheck: true, suggested: false });
  });
});
