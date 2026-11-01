import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import type { AiSuggestion, ItemGender, Settings } from './types';
import { GENDER_LABELS, GENDER_OPTIONS } from './calc';
import { compressImage } from './photos';

export type Suggestion = AiSuggestion;

// Cheapest model that reads photos well; about 0.03p a photo.
const MODEL = 'claude-haiku-5-5';

const Answer = z.object({
  name: z.string(),
  gender: z.string(),
  category: z.string(),
  subcategory: z.string(),
  brand: z.string(),
  colour: z.string(),
  size: z.string(),
  sure: z.boolean(),
});

type Lists = Pick<Settings, 'categories' | 'subcategories'>;

/** What's already been picked by hand, so the AI works within it */
export interface KnownDetails {
  category?: string;
  gender?: ItemGender;
}

function instructions(settings: Lists, known: KnownDetails = {}): string {
  const categories = settings.categories
    .map((c) => {
      const subs = settings.subcategories[c] ?? [];
      return subs.length ? `- ${c} (types: ${subs.join(', ')})` : `- ${c}`;
    })
    .join('\n');
  const genders = GENDER_OPTIONS.map((g) => `${g} = ${GENDER_LABELS[g]}`).join(', ');
  const knownLines = [
    known.category && `The category has already been set to "${known.category}" by hand - answer that category and pick its type.`,
    known.gender && `It has already been marked ${GENDER_LABELS[known.gender]} by hand - answer that.`,
  ].filter(Boolean);
  return `This is a photo of one second-hand item taken for a clothes resale business's stock list. Fill in as much as you can - the owner wants you to do the legwork, so always give your best guess for category and type rather than leaving them blank, and use "sure" to say how confident you are.
${knownLines.length ? `\n${knownLines.join('\n')}\n` : ''}
- name: a short stock name, 2-6 words, with colour and garment, e.g. "Pink button cardigan" or "Black Nike trainers". Include the brand if you can read it.
- gender: one of ${genders}. Judge from cut, styling and fastenings; "" only if it really could be for anyone.
- category: exactly one of these, written as shown:
${categories}
  Only "" if nothing in the list fits at all.
- subcategory: one of the listed types for that category, written exactly as shown, or "" if the category has no types.
- brand: the brand if a label or logo is readable, else "".
- colour: the main colour or pattern in plain words, e.g. "pink", "navy stripe", "leopard print".
- size: the size if a label is readable, else "".
- sure: true only if you're confident of both the category and the gender. False if the photo is unclear, shows several items, or you're guessing.`;
}

/** Reads one photo. Throws if the request fails (bad key, no internet, out of credit). */
export async function suggestFromPhoto(photo: Blob, settings: Lists, apiKey: string, known: KnownDetails = {}): Promise<Suggestion> {
  // The key never leaves this phone except to go straight to Anthropic.
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const data = await blobToBase64(photo);
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 4000,
    output_config: { effort: 'low', format: zodOutputFormat(Answer) },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } },
          { type: 'text', text: instructions(settings, known) },
        ],
      },
    ],
  });
  const answer = response.parsed_output;
  // Used to come back as a blank answer, which looked as if the AI hadn't tried.
  if (!answer) throw new Error(response.stop_reason === 'refusal' ? 'the AI declined this photo' : `no answer (${response.stop_reason ?? 'unknown'})`);
  return cleanSuggestion(answer, settings);
}

/** Compares list names loosely: case, "&" vs "and", punctuation and a plural "s" don't matter */
function same(a: string, b: string): boolean {
  const norm = (x: string) =>
    x
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .replace(/s\b/g, '');
  return norm(a) !== '' && norm(a) === norm(b);
}

/** Keeps only answers that match the app's own lists; anything else is left blank and flagged */
export function cleanSuggestion(answer: Partial<z.infer<typeof Answer>> & Pick<z.infer<typeof Answer>, 'name' | 'gender' | 'category' | 'subcategory' | 'sure'>, settings: Lists): Suggestion {
  let category = settings.categories.find((c) => same(c, answer.category)) ?? '';
  // A known type under the wrong (or no) category still says which category it is.
  if (!category && answer.subcategory) category = settings.categories.find((c) => (settings.subcategories[c] ?? []).some((s) => same(s, answer.subcategory))) ?? '';
  const subcategory = (settings.subcategories[category] ?? []).find((s) => same(s, answer.subcategory)) ?? '';
  const gender = (GENDER_OPTIONS as string[]).includes(answer.gender) ? (answer.gender as ItemGender) : '';
  const keywords = [answer.brand, answer.colour, answer.size && `size ${answer.size.replace(/^size\s*/i, '')}`]
    .map((k) => (k ?? '').trim())
    .filter(Boolean)
    .join(', ')
    .slice(0, 100);
  return { name: answer.name.trim().slice(0, 60), gender, category, subcategory, keywords, sure: answer.sure && category !== '' };
}

/** A photo to compare against, with how the warning should name it */
export interface Candidate {
  label: string;
  photo: Blob;
}

const SameItem = z.object({
  /** Number of the photo showing the same physical item, 0 if none */
  match: z.number(),
  sure: z.boolean(),
});

// Small copies are enough to compare and keep the cost down (about 350 tokens each).
const THUMB_EDGE = 512;
const PER_REQUEST = 30;

/**
 * Looks for a photo of the same physical item (re-shot, different angle or
 * light) among the candidates. Returns the first match, or null.
 */
export async function findSameItem(photo: Blob, candidates: Candidate[], apiKey: string): Promise<{ candidate: Candidate; sure: boolean } | null> {
  if (candidates.length === 0) return null;
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const target = await blobToBase64(await compressImage(photo, 768));
  for (let start = 0; start < candidates.length; start += PER_REQUEST) {
    const chunk = candidates.slice(start, start + PER_REQUEST);
    const images: Anthropic.ContentBlockParam[] = [];
    for (const [i, c] of chunk.entries()) {
      const thumb = await compressImage(c.photo, THUMB_EDGE).catch(() => null);
      if (!thumb) continue;
      images.push({ type: 'text', text: `Photo ${i + 1}:` }, { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: await blobToBase64(thumb) } });
    }
    const response = await client.messages.parse({
      model: MODEL,
      max_tokens: 2000,
      output_config: { effort: 'low', format: zodOutputFormat(SameItem) },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'New photo:' },
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: target } },
            ...images,
            {
              type: 'text',
              text: `A second-hand clothes business is adding the new photo to its stock list. Does any numbered photo show the very same physical item - the same garment photographed again, perhaps from another angle, in other light or folded differently? Look at specific details: print, logo, stains, wear, labels, buttons. Merely the same style, colour or brand is NOT a match.

match: the number of the photo showing the same item, or 0 if none does. sure: true only if the details make it clear it's the same one.`,
            },
          ],
        },
      ],
    });
    const answer = response.parsed_output;
    const index = answer ? Math.round(answer.match) - 1 : -1;
    if (answer && index >= 0 && index < chunk.length) return { candidate: chunk[index], sure: answer.sure };
  }
  return null;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  // Chunked so big photos don't overflow the argument list.
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
