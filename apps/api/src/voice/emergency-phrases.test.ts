import { describe, it, expect } from "vitest";
import { detectEmergency } from "./emergency-phrases";

describe("detectEmergency", () => {
  it("catches French cries for help", () => {
    for (const t of [
      "au secours !",
      "À l'aide, s'il vous plaît",
      "aidez-moi",
      "appelez les secours",
      "je fais un malaise",
      "j'ai mal à la poitrine",
      "je peux plus respirer",
      "je suis tombé",
      "je suis tombée et je n'arrive plus à me relever",
    ]) {
      expect(detectEmergency(t, "fr").detected, t).toBe(true);
    }
  });

  it("catches English cries for help", () => {
    for (const t of [
      "help me please",
      "call an ambulance",
      "I can't breathe",
      "I fell and I can't get up",
      "I have chest pain",
    ]) {
      expect(detectEmergency(t, "en").detected, t).toBe(true);
    }
  });

  it("ignores ordinary conversation", () => {
    for (const t of [
      "bonjour, comment vas-tu ?",
      "il fait beau aujourd'hui",
      "j'ai bien dormi cette nuit",
      "merci pour le rappel",
      "peux-tu m'aider à trouver la télécommande ?", // "aider" but not "aidez-moi"
    ]) {
      expect(detectEmergency(t, "fr").detected, t).toBe(false);
    }
  });

  it("does not fire on negated phrases (reassurance)", () => {
    for (const t of [
      "je n'ai pas mal à la poitrine",
      "je ne suis pas tombé",
      "non je n'ai pas besoin d'aide",
    ]) {
      expect(detectEmergency(t, "fr").detected, t).toBe(false);
    }
  });

  it("detects a French cry even during an English session (fallback)", () => {
    expect(detectEmergency("au secours", "en").detected).toBe(true);
  });

  it("returns the matched phrase for the audit trail", () => {
    const r = detectEmergency("AU SECOURS !!!", "fr");
    expect(r.detected).toBe(true);
    expect(r.matched).toBe("au secours");
  });

  it("handles empty / whitespace input", () => {
    expect(detectEmergency("", "fr").detected).toBe(false);
    expect(detectEmergency("   ", "fr").detected).toBe(false);
  });
});
