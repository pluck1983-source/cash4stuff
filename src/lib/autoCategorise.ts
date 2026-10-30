import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import type { ItemGender, Settings } from './types';
import { GENDER_LABELS, GENDER_OPTIONS } from './calc';

/** What the photo AI thinks a photo is. Blank fields mean it couldn't tell. */
export interface Suggestion {
  name: string;
  gender: ItemGender;
  category: string;
  subcategory: string;
  /** False when it's guessing - the item gets flagged to check */
  sure: boolean;
}

// Cheapest model that reads photos well; about 0.03p a photo.
const MODEL = 'claude-haiku-5-5';

const Answer = z.object({
  name: z.string(),
  gender: z.string(),
  category: z.string(),
  subcategory: z.string(),
  sure: z.boolean(),
});

function instructions(settings: Pick<Settings, 'categories' | 'subcategories'>): string {
  const categories = settings.categories
    .map((c) => {
      const subs = settings.subcategories[c] ?? [];
      return subs.length ? `- ${c} (types: ${subs.join(', ')})` : `- ${c}`;
    })
    .join('\n');
  const genders = GENDER_OPTIONS.map((g) => `${g} = ${GENDER_LABELS[g]}`).join(', ');
  return `This is a photo of one second-hand item taken for a clothes resale business's stock list. Say what it is.

- name: a short stock name, 2-5 words, e.g. "Blue denim jacket" or "Nike trainers". Include a brand only if you can read it.
- gender: one of ${genders}, or "" if it could be for anyone or you can't tell.
- category: exactly one of these, written as shown, or "" if none fits:
${categories}
- subcategory: one of the listed types for that category, written as shown, or "" if none fits or the category has no types.
- sure: true only if you're confident of both the category and the gender. False if the photo is unclear, shows several items, or you're guessing.`;
}

/** Reads one photo. Throws if the request fails (bad key, no internet, out of credit). */
export async function suggestFromPhoto(photo: Blob, settings: Pick<Settings, 'categories' | 'subcategories'>, apiKey: string): Promise<Suggestion> {
  // The key never leaves this phone except to go straight to Anthropic.
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const data = await blobToBase64(photo);
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 2000,
    output_config: { effort: 'low', format: zodOutputFormat(Answer) },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } },
          { type: 'text', text: instructions(settings) },
        ],
      },
    ],
  });
  const answer = response.parsed_output;
  if (!answer) return { name: '', gender: '', category: '', subcategory: '', sure: false };
  return cleanSuggestion(answer, settings);
}

/** Keeps only answers that match the app's own lists; anything else is left blank and flagged */
export function cleanSuggestion(answer: z.infer<typeof Answer>, settings: Pick<Settings, 'categories' | 'subcategories'>): Suggestion {
  const category = settings.categories.find((c) => c.toLowerCase() === answer.category.trim().toLowerCase()) ?? '';
  const subcategory = (settings.subcategories[category] ?? []).find((s) => s.toLowerCase() === answer.subcategory.trim().toLowerCase()) ?? '';
  const gender = (GENDER_OPTIONS as string[]).includes(answer.gender) ? (answer.gender as ItemGender) : '';
  return { name: answer.name.trim().slice(0, 60), gender, category, subcategory, sure: answer.sure && category !== '' };
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  // Chunked so big photos don't overflow the argument list.
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
