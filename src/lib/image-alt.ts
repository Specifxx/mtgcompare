// Descriptive alt text for card images: name, treatment, set, collector number
// and finish, in the words a shopper types into an image search. One helper so
// every <img> of a card says the same thing and none ships with an empty alt
// (tests/image-alt-text.test.ts).
import { FINISH_LABEL, type Finish } from "./constants";

export interface AltInput {
  name: string;
  /** Card.label ("Borderless · Serial Numbered"): the printing words the product name states. */
  variant?: string | null;
  setName?: string | null;
  setCode?: string | null;
  number?: string | null;
  finish?: Finish | null;
  /** The finish word for an etched unit, when the caller knows it (finishLabel in constants.ts). */
  finishWord?: string | null;
}

/** "Sol Ring (Borderless) from Commander Masters (CMM) #270, Foil, Magic: The Gathering card". */
export function cardImageAlt(c: AltInput): string {
  const vari = c.variant ? ` (${c.variant.replace(/\s*·\s*/g, ", ")})` : "";
  const set = c.setName ? ` from ${c.setName}${c.setCode ? ` (${c.setCode.toUpperCase()})` : ""}` : c.setCode ? ` from ${c.setCode.toUpperCase()}` : "";
  const num = c.number ? ` #${c.number}` : "";
  const fin = c.finishWord ?? (c.finish === "F" ? FINISH_LABEL.foil : null);
  return `${c.name}${vari}${set}${num}${fin ? `, ${fin}` : ""}, Magic: The Gathering card`.replace(/\s+/g, " ");
}

/** The alt of an image that has no card data (a placeholder): never empty. */
export const FALLBACK_ALT = "Magic: The Gathering card";
