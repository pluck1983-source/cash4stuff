import { describe, expect, it } from 'vitest';
import { acceptSuggestion, suggestionDiffers } from './aiReview';

const item = { category: 'Shoes', subcategory: '', gender: 'womens' as const, name: '' };
const jacket = { name: 'Denim jacket', gender: 'womens' as const, category: 'Coats & jackets', subcategory: 'Jackets', sure: true };

describe('photo AI review', () => {
  it('only asks about real differences', () => {
    expect(suggestionDiffers(item, jacket)).toBe(true);
    expect(suggestionDiffers({ ...item, category: 'Coats & jackets', name: 'Jacket' }, jacket)).toBe(false);
    expect(suggestionDiffers({ ...item, name: 'x' }, { ...jacket, category: '', gender: '' })).toBe(false);
  });

  it('accepting changes the category but keeps a typed name', () => {
    expect(acceptSuggestion({ ...item, name: 'Levi jacket' }, jacket)).toMatchObject({ category: 'Coats & jackets', subcategory: 'Jackets', name: 'Levi jacket', needsCheck: false });
    expect(acceptSuggestion(item, { ...jacket, category: '' })).toMatchObject({ category: 'Shoes', name: 'Denim jacket' });
  });
});
