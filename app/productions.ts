// app/productions.ts
// Côté navigateur : chaque exercice d'entraînement a un identifiant (session) et une ligne dans
// productions_eleves (via /api/productions). Le serveur s'en sert pour compter les entraînements du jour
// (un exercice complet = une seule « question ») et le professeur pour consulter les productions.

export type ExerciceProd = "intro" | "paragraphe" | "plan";
export type AskAIAvecSeance = (messages: { role: string; content: string }[], maxTokens?: number, light?: boolean, session?: string) => Promise<string>;

const lire = (k: string) => { try { return localStorage.getItem(k) || ""; } catch { return ""; } };

export function nouvelleSeance(): string {
  try { return crypto.randomUUID(); } catch {
    return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (Number(c) ^ (Math.random() * 16) >> (Number(c) / 4)).toString(16));
  }
}

// Enregistre (ou met à jour) la production. Ne bloque jamais l'exercice en cas d'échec.
export async function sauverProduction(p: { id: string; exercice: ExerciceProd; format: "chat" | "cadres"; sujet: string; contenu?: string; note?: string }) {
  try {
    await fetch("/api/productions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...p, visitor_id: lire("qcm_visitor_id"), eleve_nom: lire("qcm_eleve_nom") }),
    });
  } catch { /* sans conséquence pour l'élève */ }
}

// Note ou verdict repéré dans la dernière réponse du tuteur (« 14/20 », « Étape validée »…)
export function noteDepuisTexte(t: string): string | undefined {
  const notes = [...t.matchAll(/(\d{1,2}(?:[.,]\d)?)\s*\/\s*20\b/g)];
  if (notes.length) return notes[notes.length - 1][1].replace(".", ",") + "/20";
  if (/partie III validée/i.test(t)) return "Partie III validée";
  return undefined;
}
