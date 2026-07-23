/**
 * Deterministic emergency-phrase detection.
 *
 * SAFETY DESIGN: escalation must NOT hinge on the AI's judgement. This is the
 * deterministic, auditable backbone the spec always called for ("must escalate
 * emergency-like language immediately"). A curated list of high-signal distress
 * phrases decides; the AI never gets a vote on whether to raise the alert.
 *
 * It is intentionally tuned to be sensitive rather than precise: a match only
 * texts the resident's family contact and raises a dashboard alert (low-harm on
 * a false positive). It must NEVER be wired to auto-dial emergency services —
 * that path requires explicit human confirmation.
 *
 * This is a placeholder-grade lexicon, not NLP. Extend the phrase lists as real
 * usage surfaces new wordings.
 */

export type EmergencyLanguage = "fr" | "en";

export interface EmergencyDetection {
  detected: boolean;
  /** The normalized phrase that matched, for the audit trail. */
  matched?: string;
}

/**
 * High-signal distress phrases, written in NORMALIZED form (lowercase, accents
 * stripped, apostrophes/punctuation collapsed to single spaces). Multi-word
 * phrases are used deliberately so a bare word like "mal" or "aide" cannot fire,
 * and so simple negations ("je ne suis pas tombe") don't contain the phrase.
 */
const PHRASES: Record<EmergencyLanguage, string[]> = {
  fr: [
    "au secours",
    "a l aide",
    "aidez moi",
    "appelez les secours",
    "appelez une ambulance",
    "appelez le samu",
    "appelez les pompiers",
    "appelez un medecin",
    "suis tombe", // covers tombé / tombée (accents stripped)
    "je suis par terre",
    "j arrive plus a me relever",
    "arrive pas a me relever",
    "peux plus respirer",
    "peux pas respirer",
    "arrive plus a respirer",
    "du mal a respirer",
    "malaise",
    "j ai fait un malaise",
    "mal a la poitrine",
    "douleur dans la poitrine",
    "je vais mourir",
    "je vais m evanouir",
    "au feu",
    "il y a le feu",
  ],
  en: [
    "help me",
    "call for help",
    "call an ambulance",
    "call 911",
    "call 112",
    "i fell",
    "i have fallen",
    "i can t get up",
    "i can t breathe",
    "cant breathe",
    "chest pain",
    "pain in my chest",
    "i m going to faint",
    "i think i m dying",
  ],
};

/** Words that, immediately before a phrase, negate it ("pas mal", "sans aide"). */
const NEGATORS = new Set(["pas", "sans", "aucune", "aucun", "jamais", "no", "not"]);

/** Lowercase, strip accents, replace non-alphanumerics with spaces, collapse. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // drop diacritics
    .replace(/[^a-z0-9]+/g, " ") // punctuation & apostrophes -> space
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * True when `phrase` occurs in `hay` and is NOT immediately preceded by a
 * negation word. Phrases are multi-word (or the unambiguous "malaise"), so a
 * plain substring match won't fire on a fragment of a larger word; the space in
 * every multi-word phrase already forces a word boundary.
 */
function occursUnnegated(hay: string, phrase: string): boolean {
  let from = 0;
  for (;;) {
    const idx = hay.indexOf(phrase, from);
    if (idx < 0) return false;
    const before = hay.slice(0, idx).trim();
    const prevWord = before.slice(before.lastIndexOf(" ") + 1);
    if (!NEGATORS.has(prevWord)) return true; // a genuine, un-negated match
    from = idx + phrase.length; // negated here — keep looking further along
  }
}

/**
 * Detect an emergency phrase in a spoken utterance. Checks the requested
 * language plus French (the primary market) as a fallback, since a French
 * resident may cry out in French even in an EN session.
 */
export function detectEmergency(
  text: string,
  language: EmergencyLanguage = "fr",
): EmergencyDetection {
  if (!text) return { detected: false };
  const haystack = normalize(text);

  const langs: EmergencyLanguage[] =
    language === "en" ? ["en", "fr"] : ["fr", "en"];
  for (const lang of langs) {
    for (const phrase of PHRASES[lang]) {
      if (occursUnnegated(haystack, phrase)) {
        return { detected: true, matched: phrase };
      }
    }
  }
  return { detected: false };
}
