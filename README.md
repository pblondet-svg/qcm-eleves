# Tuteur de philosophie (qcm-eleves)

Site de révision et d'entraînement en philosophie (Terminale générale et technologique, spécialité HLP),
déployé sur Vercel à chaque `git push` sur `main`.

## Pile technique
- Next.js (App Router) + Tailwind, base de données Supabase.
- IA : route `app/api/ai/route.js`, avec une cascade de fournisseurs (Groq → Google → Cerebras → Mistral),
  des limites d'usage par élève et par connexion, et l'exemption des appareils du professeur.
- Variables d'environnement : `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `GROQ_API_KEY`,
  `GOOGLE_AI_API_KEY`, `CEREBRAS_API_KEY`, `MISTRAL_API_KEY`.

## Organisation du code (`app/`)
- `page.tsx` : application principale (accueil, Mode Élève, Mode Prof, dissertation, révision de textes, tableau de bord).
- `HomeScreenV2.tsx` : accueil élève (cases de révision, carrés « S'entraîner », assistant méthode).
- `MethodeChatHome.tsx` : assistant méthode et règles communes des prompts (`REGLE_GUIDAGE`, `REGLE_LONGUEUR`).
- Entraînements : `EntrainementChat.tsx` (format chatbot, par défaut), `IntroductionTrainer.tsx`,
  `ParagrapheTrainer.tsx`, `PlanTrainer.tsx` et `DissertationGuidee.tsx` (format « étapes en cadres »).
- `CoursPremiere.tsx` : révision des cours par niveau (HLP Première, Terminale).
- `FaqComponents.tsx` : FAQ élève ↔ professeur.
- Usage de l'IA : `CompteurIA.tsx` (compteur élève), `UsageElevesIA.tsx` et `AppareilsProf.tsx` (Mode Prof),
  `AiQuotaGauge.tsx`, `LimitesIA.tsx`.

## Scripts SQL (`sql/`)
À exécuter une fois dans Supabase (SQL Editor) :
- `faq_vues.sql` : compteur de consultations de la FAQ.
- `usage_eleve_nom.sql` : prénom de l'élève dans les statistiques d'usage de l'IA.

## Développement
```bash
npm install
npm run dev   # http://localhost:3000
```
