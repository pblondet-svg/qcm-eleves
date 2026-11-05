// app/api/extract/route.ts
// Extraction du texte d'un PDF importé par le professeur (Mode Prof).
// Reçoit un FormData { file }, renvoie { text }.
import { extractText, getDocumentProxy } from "unpdf";

export const maxDuration = 30;

// Nettoyage : numéros de ligne isolés, espaces en trop, lignes vides multiples
function clean(raw: string) {
  let lines = raw.split("\n");
  // Numéros de ligne collés en fin de ligne (« repose sur1 », « rhétorique.2 ») :
  // on ne les retire que s'ils forment une suite croissante sur de nombreuses lignes.
  const tail = lines.map((l) => { const m = l.match(/\D(\d{1,3})\s*$/); return m ? parseInt(m[1], 10) : null; });
  let suite = 0;
  for (let i = 1; i < tail.length; i++) {
    const prev = tail.slice(0, i).reverse().find((x) => x !== null);
    if (tail[i] !== null && prev != null && tail[i] === prev + 1) suite++;
  }
  if (suite >= 5) lines = lines.map((l, i) => (tail[i] !== null ? l.replace(/(\D)\d{1,3}\s*$/, "$1") : l));
  return lines
    .map((l) => l.replace(/\s+$/g, ""))
    .filter((l) => !/^\s*\d{1,3}\s*$/.test(l))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!file || typeof file === "string") return Response.json({ error: "Aucun fichier reçu" }, { status: 400 });
    if (file.size > 4 * 1024 * 1024) return Response.json({ error: "Fichier trop lourd (4 Mo maximum)" }, { status: 413 });
    const buf = new Uint8Array(await file.arrayBuffer());
    const pdf = await getDocumentProxy(buf);
    const { text } = await extractText(pdf, { mergePages: true });
    const out = clean(Array.isArray(text) ? text.join("\n") : text);
    if (!out) return Response.json({ error: "Aucun texte trouvé (PDF scanné ?)" }, { status: 422 });
    return Response.json({ text: out });
  } catch (e: any) {
    return Response.json({ error: "Lecture du PDF impossible : " + (e?.message || "erreur") }, { status: 500 });
  }
}
