// Bilingual text of the data files: Ukrainian (default UI language) and English. Quotes of sources are never
// translated (DECISIONS D5); these are labels, questions and explanations written for the demo.
import { z } from "zod";

export const TextSchema = z.strictObject({
  uk: z.string().min(1),
  en: z.string().min(1),
});

export type Text = z.infer<typeof TextSchema>;

export const LANGS = ["uk", "en"] as const;
export type Lang = (typeof LANGS)[number];

/** Data ids: lowercase letters, digits, dots and dashes. */
export const IdSchema = z.string().regex(/^[a-z0-9][a-z0-9.-]*$/, "lowercase id: letters, digits, dots, dashes");

/** Calendar date YYYY-MM-DD (dates are compared as strings). */
export const IsoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");
