import { describe, expect, it } from 'vitest';
import { cleanSuggestion } from './autoCategorise';
import { needsCheck } from './calc';

const settings = { categories: ['Tops', 'Coats & jackets', 'Shoes'], subcategories: { Tops: ['T-shirts', 'Shirts'] } };

describe('photo AI answers', () => {
  it('keeps answers that match the lists, whatever the case', () => {
    expect(cleanSuggestion({ name: ' Blue shirt ', gender: 'mens', category: 'tops', subcategory: 'shirts', sure: true }, settings)).toEqual({
      name: 'Blue shirt',
      gender: 'mens',
      category: 'Tops',
      subcategory: 'Shirts',
      keywords: '',
      sure: true,
    });
  });

  it('matches loosely and fills brand, colour and size into keywords', () => {
    const lists = { categories: ['Jumpers & knitwear', 'Jeans & trousers'], subcategories: { 'Jumpers & knitwear': ['Cardigans', 'Jumpers'], 'Jeans & trousers': ['Jeans'] } };
    expect(
      cleanSuggestion({ name: 'Pink cardigan', gender: 'womens', category: 'Jumpers and Knitwear', subcategory: 'cardigan', brand: 'M&S', colour: 'pink', size: 'Size 14', sure: true }, lists),
    ).toMatchObject({ category: 'Jumpers & knitwear', subcategory: 'Cardigans', keywords: 'M&S, pink, size 14', sure: true });
    // A known type under a made-up category still finds its category
    expect(cleanSuggestion({ name: 'Jeans', gender: 'mens', category: 'Bottoms', subcategory: 'Jeans', sure: true }, lists)).toMatchObject({ category: 'Jeans & trousers', subcategory: 'Jeans' });
  });

  it('blanks anything not in the lists and flags it', () => {
    expect(cleanSuggestion({ name: 'Hat', gender: 'unisex', category: 'Hats', subcategory: 'Caps', sure: true }, settings)).toEqual({
      name: 'Hat',
      gender: '',
      category: '',
      subcategory: '',
      keywords: '',
      sure: false,
    });
    expect(cleanSuggestion({ name: 'Boots', gender: 'womens', category: 'Shoes', subcategory: 'Boots', sure: false }, settings)).toMatchObject({ category: 'Shoes', subcategory: '', sure: false });
  });
});

describe('needs check', () => {
  it('flags unsure guesses and items with no category', () => {
    expect(needsCheck({ category: 'Tops', needsCheck: true })).toBe(true);
    expect(needsCheck({ category: '' })).toBe(true);
    expect(needsCheck({ category: 'Tops' })).toBe(false);
  });
});

