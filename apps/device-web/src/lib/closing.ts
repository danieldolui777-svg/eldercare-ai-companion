/**
 * Detects "backchannel"/closing utterances — polite acknowledgements that do NOT
 * ask for a reply ("merci", "ok", "c'est bon", "au revoir").
 *
 * Elderly users acknowledge constantly, which otherwise traps them in an endless
 * ping-pong: the AI replies, they say "merci", the AI replies again…
 *
 * Deliberately CONSERVATIVE: bare "oui"/"non" are excluded because they are
 * usually ANSWERS to a question, not closings. Only fires when the whole
 * utterance is nothing but acknowledgement words.
 */
const CLOSING_WORDS = new Set([
  // fr
  "merci", "beaucoup", "bien", "ok", "okay", "daccord", "accord", "d", "c",
  "cest", "est", "bon", "bonne", "tres", "au", "revoir", "a", "bientot",
  "journee", "nuit", "soiree", "salut", "jai", "ai", "compris", "parfait",
  "super", "voila", "entendu", "genial", "impeccable", "nickel", "je", "vous",
  "remercie",
  // en
  "thanks", "thank", "you", "bye", "goodbye", "alright", "great", "perfect",
  "got", "it", "good", "day", "night", "cheers",
]);

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip accents
    .replace(/'/g, "")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isClosing(text: string): boolean {
  const n = normalize(text);
  if (!n) return false;
  const words = n.split(" ").filter(Boolean);
  if (words.length === 0 || words.length > 4) return false; // too long = real content
  return words.every((w) => CLOSING_WORDS.has(w));
}
