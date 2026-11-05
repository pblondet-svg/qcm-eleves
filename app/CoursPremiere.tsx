"use client";
// app/CoursPremiere.tsx
// Révision du cours — Spécialité HLP Première.
// - Côté élève : choix d'une séance, puis « Le cours », « Réviser avec le tuteur » (chat),
//   « Quiz » (QCM générés sur la séance) et « Expliquer une citation » (correction par l'IA).
// - Côté prof : création des séances (semestre, thème, titre) et de leurs documents
//   (texte collé ou import .pdf / .docx / .txt).
// Stockage : table config, clé « cours_hlp1 » (JSON). Tant que rien n'est enregistré,
// la séance d'exemple fournie par le professeur est utilisée.

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, BookOpen, CheckCircle2, MessageCircle, Plus, Quote, RotateCcw, Save, Send, Sparkles, Trash2, Upload, XCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { DEMANDES_RAPIDES, REGLE_LONGUEUR, RichText } from "./MethodeChatHome";

export type CoursDoc = { id: string; titre: string; contenu: string };
export type Seance = { id: string; semestre: string; theme: string; titre: string; docs: CoursDoc[] };
type AskAI = (messages: { role: string; content: string }[], maxTokens?: number, light?: boolean) => Promise<string>;

const KEY = "cours_hlp1";
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

export const DEFAULT_SEANCES: Seance[] = [
  {
    id: "s1-parole-art",
    semestre: "Semestre 1",
    theme: "Les pouvoirs de la parole — L'art de la parole",
    titre: "La parole est-elle un art ?",
    docs: [
      { id: "d1", titre: "Introduction modèle (question de réflexion philosophique)", contenu: "Question de réflexion philosophique : La parole est-elle un art ?\n\nOpinion Commune (on répond rapidement à la question posée)\n\nÀ première vue, parler et faire œuvre d'art semblent deux choses bien différentes.\n\nDéfinitions (on… définit les mots importants)\n\nSi l’on se penche sur le terme art, il nous semble logique de penser qu’il s’agit d’une production esthétique que l’on pourrait comparer à la peinture, la musique, la danse, etc. Cependant si l’on regarde de plus près, l’art désigne un ensemble de procédés et de règles à observer dans une action. L’étymologie latine, ars, indique que nous avons affaire à un savoir-faire ou bien même une technique. De même le terme de parole fait référence à la capacité à exprimer ses pensées à l'aide d'un langage articulé.\n\nParadoxe (on souligne ce qui pose problème dans le sujet)\n\nAinsi, il serait trop hâtif d’exclure totalement la recherche esthétique des discours et il serait intéressant d’envisager que la parole puisse rechercher à être agréable et harmonieuse. C’est même précisément ce que cherche à faire les orateurs, ceux utilisant la rhétorique. C’est pourquoi il semble judicieux de penser que la parole est une forme d’art. Mais de la même manière la parole et l'art peuvent être réalisées par un talent naturel, quelque chose de l’ordre de l’inné. Car certains d'entre nous semblent naturellement bien parler et aussi disposer d'une prédisposition à la pratique artistique. Nous pourrions donc nous demander si la parole est véritablement un art sachant qu’il pourrait s’agir d’une aptitude particulière, un don qui n’est donc pas lié à l'apprentissage de techniques mais quelque chose présent dès la naissance chez quelques élus. Tout semble alors dépendre de la nature de la parole elle-même : si elle relève d'un savoir-faire qui s'acquiert, elle peut prétendre au titre d'art ; si elle relève d'un don reçu à la naissance, elle lui échappe.\n\nProblématiques (on énonce des problèmes sous forme interrogative)\n\nEst-ce qu’il s’agit d’un talent naturel, inné ? Ou bien, sont-ce des techniques apprises rigoureusement, acquis ?" },
      { id: "d2", titre: "Paragraphe argumenté modèle", contenu: "[La thèse] = l’idée que l’on essaye de formuler et d’affirmer. Nous allons tenter d’affirmer que La parole peut être considérée comme un art, car elle repose sur un savoir-faire structuré, comme la rhétorique.\n[Argumentation de la thèse] = L’argumentation consiste à donner des éléments (arguments) qui vont convaincre le lecteur.\n\nPremièrement, il faut comprendre ce qu’est un art. En latin ars traduit le terme grec de techné qui donnera technique. Dans l’Antiquité, le terme techné (ou ars en latin) désignait à la fois un savoir-faire technique et une compétence artistique. Ainsi, un orateur, comme un artisan, maîtrise des règles pour produire un résultat efficace. On peut dès lors envisager que les maîtres de la rhétorique sont des techniciens car ils disposent d’un savoir-faire pour bien parler. Les fondements de la rhétorique remontent à la Grèce antique. Elle naît au Ve siècle avant J-C en Sicile, qui est alors une colonie grecque et apparaît dans un contexte judiciaire. Les tyrans qui régnaient sur la Sicile avaient en effet exproprié un certain nombre de propriétaires au cours de leur règne. Lorsque les tyrans furent chassés, ces propriétaires eurent à faire valoir leurs droits face à des tribunaux populaires. C'est alors qu'un élève du philosophe Empédocle nommé Corax mit au point une technique destinée à venir en aide aux justiciables. Il en publia les principes, accompagnés d'exemples concrets, dans un traité d'art oratoire. La rhétorique est l’art de bien parler pour convaincre, plaire ou émouvoir un auditoire.\n\n[Citation] Comme le souligne Cicéron, « l’éloquence sans la sagesse [...] ne peut jamais être utile ». Cela signifie que la parole, même maîtrisée techniquement (comme un art), peut servir des causes néfastes si elle n’est pas guidée par la morale.\n\n[Exemple(s) et Explication] Sur le fait que la technique dans la parole est un élément important, on peut penser au film Le discours d’un roi de Tom Hooper inspiré d’un fait réel. Dans les années 1930, au Royaume-Uni, le prince Albert, vit un profond problème de bégaiement. Des événements inattendus l'obligent à monter sur le trône sous le nom de George VI. Or le roi doit s'exprimer en public. Sur les conseils de sa femme, il rencontre Lionel Logue, orthophoniste australien aux méthodes peu orthodoxes comme la relaxation musculaire et de contrôle de la respiration. Ainsi, il existe bien des techniques, des savoir-faire, afin de bien s’exprimer.\n\n[Conclusion de l’argumentation] En conclusion, la parole peut effectivement être considérée comme un art en raison de la maîtrise technique qu'elle requiert. Comme l'indique la rhétorique, l'art de bien parler repose sur un savoir-faire élaboré, semblable à celui d'un artiste." },
      { id: "d3", titre: "Textes de Cicéron (Brutus ; De l'invention)", contenu: "Texte 1\n« Le siècle de Périclès¹ fut donc le premier âge de l'éloquence athénienne, et il produisit un orateur presque accompli. Ce n'est point, en effet, quand on fonde les États, ni quand on fait la guerre, ni quand le génie est entravé et enchaîné par la domination d'un roi, que peut naître le goût de l'éloquence. Compagne de la paix, amie du repos, elle est le fruit d'une société déjà régulièrement constituée. Aussi ce ne fut, suivant Aristote, qu'après l'abolition de la tyrannie² en Sicile, et lorsque les tribunaux, fermés depuis longtemps, se rouvrirent pour juger les différends entre particuliers, que Corax et Tisias³ commencèrent à donner des leçons de rhétorique chez ce peuple naturellement subtil et disputeur. Avant eux on ne connaissait ni art ni méthode ; et cependant on parlait avec soin, et la plupart écrivaient leurs discours.»\nCicéron, Brutus, XII, 46 av. J.-C. (trad. Nisard XIXe s.)\n\nTexte 2\n« J'ai souvent examiné dans de longues méditations, si le talent de la parole et l'étude approfondie de l'éloquence⁴ ont été plus avantageux que nuisibles à l'homme et à la société. En effet, si je considère les maux qui ont déchiré notre patrie, si je me rappelle les catastrophes qui ont bouleversé autrefois les cités les plus florissantes, partout je vois la plus grande partie de ces malheurs causée par des hommes éloquents. Mais lorsque je veux, avec le secours de l'histoire, remonter à des époques plus reculées, je vois la sagesse, et plus encore l'éloquence, fonder des villes, éteindre les guerres, établir des alliances durables, et serrer les nœuds d'une sainte amitié. Ainsi, après un mûr examen, la raison elle-même me porte à croire que la sagesse sans l'éloquence est peu utile aux États, mais que l'éloquence sans la sagesse n'est souvent que trop funeste, et ne peut jamais être utile. En effet, il fut un temps où les hommes, errant dans les campagnes comme les animaux, n'avaient pour soutenir leur vie qu'une nourriture sauvage et grossière. La raison avait peu d'empire ; la force décidait de tout. Ces barbares n'avaient nulle idée de leurs devoirs envers la Divinité ni envers leurs semblables ; point de mariage légal, point d'enfants dont on pût s'assurer d'être le père ; on ne sentait point encore les avantages de l'équité. Aussi, au milieu des ténèbres de l'erreur et de l'ignorance, les passions aveugles et brutales asservissaient l'âme, et abusaient, pour se satisfaire, des forces du corps, leurs pernicieux satellites. […] Et ce n'était point, ce me semble, une sagesse muette et sans éloquence, qui pouvait opérer une révolution si prompte, arracher les hommes à l'empire de l'habitude, et les amener à un genre de vie si différent du premier. Mais, les villes une fois établies, comment apprendre aux hommes à respecter la justice, à pratiquer la bonne foi, à obéir volontairement aux autres, à supporter les plus pénibles travaux, à sacrifier leur vie même pour le bien public, si l'éloquence n'était venue leur persuader les vertus découvertes par la raison ? Oui, sans doute, il fallut tout le charme d'une éloquence à la fois profonde et séduisante, pour amener sans violence la force à plier sous le joug des lois. Tels furent l'origine et les progrès de l'éloquence, qui, par la suite, décida des plus grands intérêts, et dans la paix et dans la guerre, et rendit aux hommes les plus importants services. »\nCicéron, De l'invention, livre I, § I-II, vers 84-83 av. J.-C. (trad. Nisard/Liez, XIXe s.)\n\nNotes\n1 Siècle de Périclès : Période correspondant approximativement au Ve siècle avant J.-C., considérée comme l'apogée de la démocratie athénienne et de la civilisation grecque.\n2 Tyrannie : régime politique dans lequel le pouvoir est exercé arbitrairement par un seul homme.\n3 Corax et Tisias : deux Siciliens considérés traditionnellement comme les premiers maîtres de rhétorique de la Grèce antique, au Ve siècle avant J.-C.\n4 Éloquence : art de bien parler et de persuader par la parole." },
    ],
  },
  {
    id: "s1-homere-ulysse",
    semestre: "Semestre 1",
    theme: "Les pouvoirs de la parole — L'art de la parole",
    titre: "Homère, L'Odyssée : l'art de la parole d'Ulysse",
    docs: [
      { id: "h1", titre: "Texte : Homère, L'Odyssée, livre IX (Ulysse et Polyphème)", contenu: "Texte\n« Le Cyclope arrache de son œil ce pieu souillé de sang, et dans sa fureur il le jette au loin. Aussitôt il appelle à grands cris les autres Cyclopes qui habitent les grottes voisines sur des montagnes exposées aux vents. Les géants, en entendant la voix de Polyphème, accourent de tous côtés ; ils entourent sa caverne et lui demandent en ces termes la cause de son affliction : « Pourquoi pousser de tristes clameurs pendant la nuit divine et nous arracher au sommeil ? Quelqu'un parmi les mortels t'aurait-il enlevé malgré toi une brebis ou une chèvre ? Crains-tu que quelqu'un ne t'égorge en usant de ruse ou de violence ? »\nPolyphème, du fond de son antre, leur répond en disant : « Mes amis, Personne me tue, non par force, mais par ruse. »\nLes Cyclopes répliquent aussitôt : « Puisque personne ne te fait violence dans ta solitude, que nous veux-tu ? Il est impossible d'échapper aux maux que nous envoie le grand Jupiter. Adresse-toi donc à ton père, le puissant Neptune. » […]\n[Ulysse et ses compagnons parviennent à s'échapper de la grotte accrochés sous le ventre des béliers. Une fois embarqué sur son navire au large, Ulysse s'adresse à nouveau au Cyclope]\n« Cyclope, si quelqu'un parmi les faibles mortels t'interroge sur la honteuse plaie causée par la perte de ton œil, dis-lui qu'elle te fut faite par le fils de Laërte, Ulysse, le destructeur des villes, Ulysse qui possède de superbes palais dans Ithaque »\nA ces paroles le monstre répond en gémissant : « Hélas ! la voilà donc accomplie cette ancienne prédiction ! Jadis était en cette île un devin fort et puissant qui s'appelait Télémus : il était fils d'Euryme, et il excellait dans l'art de la divination. Télémus vieillit au milieu des Cyclopes en leur annonçant l'avenir : il me prédit tout ce qui devait plus tard s'accomplir, et il me dit qu'Ulysse me ravirait la vue. Je m'attendais toujours à voir arriver dans ma grotte un héros grand, superbe, et doué d'une force immense ; et pourtant aujourd'hui c'est un homme petit, faible et lâche, qui m'arrache l'œil après m'avoir dompté par le vin ! Viens donc maintenant, Ulysse, pour que je t'offre les dons de l'hospitalité et que je supplie Neptune de t'accorder un heureux voyage ; car moi, je suis son fils, et il se glorifie, lui, d'être mon père ! Mais si cet immortel le veut, il me guérira : lui seul, parmi les hommes et les dieux, en a le pouvoir ! »\nIl dit ; et moi je lui réponds en ces termes :\n« Que ne suis-je aussi sûr, monstre cruel, de te priver de la vie et de t'envoyer dans les sombres demeures de Pluton, comme il est certain que Neptune ne te rendra pas ton œil ! »\nAlors le Cyclope implore Neptune en élevant ses mains vers le ciel étoile. « Écoute-moi, puissant Neptune, immortel à la chevelure azurée, toi qui entoures la terre et les eaux ! Si vraiment je suis ton fils, et si tu te glorifies d'être mon père, fais que ce destructeur des villes (ce fils de Laërte, habitant d'Ithaque) ne retourne point dans ses demeures ! Cependant, si le destin veut qu'il revoie ses amis, sa patrie et ses riches palais, fais du moins que, conduit sur un navire étranger, il ne rentre dans ses foyers qu'après de longues années de souffrances ; fais encore, ô Neptune, qu'après avoir perdu tous ses compagnons, il ne trouve dans sa maison que de nouvelles infortunes ! » C'est ainsi qu'il priait, et Neptune exauça ses vœux. »\nHomère, L’Odyssée, Livre IX vers 369-536, trad. Eugène Bareste, fin du VIIIe siècle av. J.-C\nQuestion d’interprétation philosophique\nDans cet extrait, que peut-on penser de l’art de la parole dont use Ulysse ?" },
      { id: "h2", titre: "Introduction modèle (question d'interprétation philosophique)", contenu: "Présentation Générale du texte et thème\nDans cet extrait de l’Odyssée d’Homère composé vers la fin du VIIIe siècle av. J.-C, l’auteur tente de nous présenter les pouvoirs de la parole.\n\nDéfinition\nL’art de la parole peut se définir comme la capacité à exprimer ses idées de manière claire et persuasive à travers le langage. Il ne s’agit pas seulement de parler, mais de structurer un discours, d’adapter son propos à son interlocuteur et de manier les mots avec précision pour convaincre, émouvoir ou influencer. Cet art repose sur des compétences variées, allant de la maîtrise du vocabulaire à l’habileté rhétorique, en passant par la justesse du ton et la force de l’argumentation. Elle ne se limite pas à un simple échange d’informations ; elle engage celui qui parle et déploie une dynamique d’action et de persuasion.\n\nParadoxe\nDans cette perspective, la parole devient un outil puissant, capable de façonner le réel, de créer des liens, mais aussi de modifier les perceptions et d’orienter les décisions. Si l’on associe immédiatement Ulysse à l’art de la parole, c’est parce qu’il incarne la figure du héros rusé, capable d’influencer les autres et de se sortir des situations les plus périlleuses grâce à son éloquence. Pourtant, ce pouvoir sur le langage peut aussi se révéler problématique. En effet, la parole est une force ambivalente : elle permet de convaincre, de manipuler, de séduire, mais elle peut aussi exposer, trahir, ou provoquer des conséquences inattendues. L’excès de confiance dans l’éloquence peut ainsi devenir un piège, où la parole, censée être un outil de maîtrise, finit par être une source de complications.\n\nProblématique\nDans cet extrait, que peut-on penser de l’art de la parole dont use Ulysse ?" },
      { id: "h3", titre: "Commentaire modèle : la ruse et la démesure", contenu: "§1 La ruse : une parole efficace sans être vraie\nThèse : L’art de la parole d’Ulysse est d’abord une ruse : une parole dont la puissance tient à son efficacité plutôt qu’à sa vérité.\nArgumentation de la thèse : Polyphème s’écrie devant les autres Cyclopes : « Mes amis, Personne me tue, non par force, mais par ruse. » Cette phrase repose sur une ambiguïté : « Personne » est un nom pour Ulysse, mais un pronom indéfini pour les Cyclopes, qui concluent que nul ne s’en prend à Polyphème. La parole d’Ulysse agit donc sur le réel sans avoir besoin d’être vraie : elle change la conduite de ceux qui l’entendent par la seule manière dont elle est comprise. Il faut ici distinguer deux pouvoirs de la parole : persuader, qui cherche l’adhésion à ce que l’on tient pour vrai ou juste, et tromper, qui obtient un effet en exploitant une ambiguïté. Ulysse relève du second. Pourtant, c’est bien un art au sens défini en classe : un savoir-faire (technè) qui produit le résultat voulu. Le plus faible l’emporte ainsi sur la force, non parce qu’il est plus fort, mais parce qu’il maîtrise mieux le langage.\nExemple du texte : Les Cyclopes ne viennent pas à l’aide de Polyphème. Ils ne lui portent aucun secours : la ruse a réussi.\nConclusion: La valeur d’un art de la parole ne se mesure donc pas seulement à sa vérité, mais à son efficacité. Reste à savoir si cette efficacité suffit à faire de lui une véritable maîtrise.\n\n§2 La démesure : une parole qui échappe à celui qui parle\nThèse : Maîtriser l’art de la parole ne se réduit pas à l’efficacité : cela suppose aussi de maîtriser sa propre parole, c’est-à-dire de savoir la retenir.\nArgumentation de la thèse : Une fois hors de danger, Ulysse lance : « Dis-lui qu’elle te fut faite par le fils de Laërte, Ulysse, le destructeur des villes, Ulysse qui possède de superbes palais dans Ithaque. » Ces mots n’ont plus aucune utilité : il ne cherche plus à agir, mais à être reconnu. On peut donc distinguer parler pour agir et parler pour être reconnu. La première parole est un instrument que l’on contrôle ; la seconde nous gouverne, car elle dépend du regard de l’autre. Ulysse devait n’être « Personne » pour être sauvé, mais il veut être « Ulysse » pour être glorieux, et il ne peut pas être les deux. Sa parole devient démesure : en livrant son nom, son père, son titre de gloire et sa patrie, il offre à son ennemi tout ce qu’il faut pour le désigner et le retrouver. Il n’a plus la maîtrise de sa parole : c’est elle qui le conduit.\nExemple du texte : Polyphème demande aussitôt à Neptune qu’Ulysse « ne retourne point dans ses demeures », ou seulement « après de longues années de souffrances », et « Neptune exauça ses vœux ». En prononçant son nom et celui d’Ithaque, Ulysse a lui-même fourni à la malédiction sa cible.\nConclusion: Un art de la parole qui n’est pas gouverné par la mesure se retourne contre celui qui le possède. La véritable maîtrise est donc une maîtrise de soi : savoir quand parler et quand se taire.\n\nConclusion globale (facultative) : L’art de la parole d’Ulysse est admirable par son efficacité, mais incomplet : il lui manque la mesure. La parole est un pouvoir, et un pouvoir exige de savoir s’en retenir." },
    ],
  },
  {
    id: "s1-platon-gorgias",
    semestre: "Semestre 1",
    theme: "Les pouvoirs de la parole — L'art de la parole",
    titre: "Platon, Gorgias : la rhétorique, une flatterie ?",
    docs: [
      { id: "g1", titre: "Texte : Platon, Gorgias, 465 b–e", contenu: "Socrate, mis en scène par Platon, s'entretient avec le sophiste Gorgias sur son métier, qui consiste à enseigner la rhétorique. Il répond ici au jeune Polos, qui assiste à la discussion, et veut connaître la définition que donne Socrate de la rhétorique.\n\n« Ainsi donc, je le répète, la flatterie culinaire s'est recelée sous la médecine, et de même, sous la gymnastique, la toilette, chose malfaisante, décevante, basse, indigne d'un homme libre, qui emploie pour séduire les formes, les couleurs, le poli, les vêtements et qui fait qu'en recherchant une beauté étrangère, on néglige la beauté naturelle que donne la gymnastique. Pour être bref, je te dirai dans le langage des géomètres (peut être alors me comprendras tu mieux) que ce que la toilette est à la gymnastique, la cuisine l'est à la médecine, ou plutôt que ce que la toilette est à la gymnastique, la sophistique l'est à la législation, et que ce que la cuisine est à la médecine, la rhétorique l'est à la justice. Telles sont, je le répète, les différences naturelles de ces choses ; mais comme elles sont voisines, sophistes et orateurs se confondent pêle-mêle sur le même terrain, autour des mêmes sujets, et ne savent pas eux-mêmes quel est au vrai leur emploi, et les autres hommes ne le savent pas davantage. De fait, si l'âme ne commandait pas au corps et qu'il se gouvernât lui-même, et si l'âme n'examinait pas elle-même et ne distinguait pas la cuisine et la médecine, et que le corps seul en jugeât en les appréciant sur les plaisirs qui lui en reviendraient, […] toutes les choses seraient confondues pêle-mêle, et l'on ne distinguerait pas celles qui regardent la médecine, la santé et la cuisine. Tu as donc entendu ce que je crois qu'est la rhétorique ; elle correspond pour l'âme à ce qu'est la cuisine pour le corps. »\nPlaton, Gorgias, 465 b–e, vers 395-390 av. JC\n\nQuestion d’interprétation philosophique : Dans cet extrait, en quoi la rhétorique peut-elle détourner l’âme du vrai, comme la flatterie détourne le corps du bien ?" },
      { id: "g2", titre: "Introduction modèle (question d'interprétation philosophique)", contenu: "Question d’interprétation philosophique : Dans cet extrait, en quoi la rhétorique peut-elle détourner l’âme du vrai, comme la flatterie détourne le corps du bien ?\n\nPrésentation générale de l’œuvre\nDans cet extrait du Gorgias écrit par Platon, écrit vers 395-390 av. JC, l’auteur tente de défendre l’idée que la rhétorique agit comme une forme de flatterie et n’est donc pas un véritable art. L’auteur tente de nous parler de l’art de la parole et de ses pouvoirs.\n\nDéfinition\nLa flatterie c’est chercher à plaire à quelqu'un par des louanges excessives, intéressées. Alors que la rhétorique c’est l’art de bien parler. Le vrai fait, lui, référence à la vérité, c’est-à-dire à ce qui apparait comme conforme au réel. Le bien, c’est ce qui sera positif, ce qui va nous apporter des éléments bénéfiques. Enfin, l’âme et le corps apparaissent comme les deux réalités nous constituant, l’une étant physique et matérielle, l’autre étant le contraire, intangible et immatérielle.\n\nParadoxe\nEn apparence, on pourrait penser que la flatterie est une pratique qui permet d’embellir les choses, les rendre plus agréables que ce qu’elles ne sont en réalité. Cependant, le Gorgias de Platon a pour sujet la rhétorique, c'est-à-dire l'art de la persuasion par le discours. Elle est présentée par ses défenseurs comme un art utile et même le plus beau de tous, car permettant de convaincre tout le monde sur tous les sujets. Platon fait alors intervenir Socrate pour critiquer la rhétorique : s'il n'en rejette pas tous les aspects, il met néanmoins largement en garde contre elle, au titre des dangers qu'elle peut faire encourir s'agissant notamment de la vie politique. Il est possible que nous soyons corrompus dans notre âme par les belles paroles, tout comme nous pouvons être corrompus par des beaux petits plats.\n\nProblématique\nTout discours encenseur est il dangereux ? En quoi rendre plus beau un discours peut s’apparenter à un risque ?\n\nPlan\nNous allons voir alors comment dans un premier moment le domaine des arts et techniques, doit distinguer les véritables arts des faussaires (l.1 à 9). Puis nous verrons le statut de la rhétorique, en tant qu'art s'adressant à l'âme (l.9 à fin)." },
      { id: "g3", titre: "Paragraphe commenté modèle", contenu: "Question d’interprétation philosophique : Dans cet extrait, en quoi la rhétorique peut-elle détourner l’âme du vrai, comme la flatterie détourne le corps du bien ?\n\nParagraphe commenté (argumenté)\n\n[Thèse]\nLa thèse de Socrate est de montrer combien la rhétorique ne fait que profiter d'un statut d'apparence, donc usurpé et trompeur : la rhétorique est une flatterie.\n\n[Argumentation de la thèse (du texte)]\nLa flatterie peut se comprendre comme la volonté de chercher à plaire à quelqu'un par des louanges excessives, intéressées. Ainsi, Socrate commence son raisonnement en procédant par analogie, sans parler directement de la rhétorique et de son lien avec la flatterie. Ainsi parle-t-il d'abord d'esthétique, de gymnastique, de cuisine et de médecine. Il faut ici comprendre que Socrate parle en premier lieu de ce qui concerne les soins du corps que l’on peut les diviser en deux catégories : en premier, celle de l'apparence du soin, comme l'esthétique, c'est-à-dire le fait de se parer, de s'habiller, d'entretenir son corps de manière superficielle et dans un seul but de beauté et non de santé, ou comme la cuisine, qui a pour objet le plaisir gustatif et non l'intérêt diététique. En second, viennent donc les disciplines qui ont pour fonction l'entretien réel du corps, comme la gymnastique et la médecine. On peut ainsi remarquer que cuisine et esthétique ont des objets qui sont comme des simulacres de santé, c'est-à-dire qu'elles ont l'apparence, plaisante, de favoriser ou maintenir la santé sans en avoir le but réel. Elles ne visent pas le bien du corps mais seulement son plaisir, à l'inverse de la médecine et la gymnastique. C'est donc en ce sens que Socrate estime par analogie que « la cuisine est à la médecine ce que la rhétorique est à la justice ». La rhétorique est une flatterie, car elle vise l'agréable, le plaisir et ne se préoccupe pas du véritable bien de l'âme, la justice. On peut ici retrouver le sens de l'analogie avec la cuisine : la rhétorique est un danger pour l'âme, qui pourrait devenir avide de croyance et d'apparence de vérité, comme la cuisine peut mener à la gourmandise et aux troubles du corps.\n\n[Exemple]\nLa véritable science du juste doit pour l'âme, ressembler à la médecine, qui prescrit souvent des remèdes pénibles mais qui seule assure au corps sa santé. Ainsi lorsque je dois prendre un sirop désagréable au gout, je ne dois pas me fier à mes papilles gustatives afin de savoir si cela est bon ou mauvais pour moi, c’est le médecin qui doit le déterminer et je dois lui faire confiance.\n\n[Conclusion du paragraphe]\nL'âme doit donc se méfier des apparences flatteuses comme le corps doit fuir le plaisir immédiat : la justice et le Bien, destinations ultimes de l'âme, réclament la traversée d'un certain désagrément, le passage par l'effort, qui, sous l'apparence momentanée d'être ce qui détruit la conscience, est en réalité ce qui la construit." },
    ],
  },
];

// Séances enregistrées + séances fournies avec le site qui n'y sont pas encore
// (sauf celles que le professeur a supprimées : leur id est gardé dans « retirees »).
let retirees: string[] = [];
export async function loadSeances(): Promise<Seance[]> {
  try {
    const { data } = await supabase.from("config").select("value").eq("key", KEY).maybeSingle();
    if (!data?.value) return DEFAULT_SEANCES;
    const v = JSON.parse(data.value);
    retirees = Array.isArray(v?.retirees) ? v.retirees : [];
    const saved: Seance[] = Array.isArray(v?.seances) ? v.seances : [];
    const ids = new Set(saved.map((s) => s.id));
    return [...saved, ...DEFAULT_SEANCES.filter((d) => !ids.has(d.id) && !retirees.includes(d.id))];
  } catch { return DEFAULT_SEANCES; }
}
async function saveSeances(seances: Seance[], retireesMaj: string[]) {
  const { error } = await supabase.from("config").upsert({ key: KEY, value: JSON.stringify({ seances, retirees: retireesMaj }) }, { onConflict: "key" });
  if (error) throw error;
  retirees = retireesMaj;
}

const parseJSONLoose = (txt: string) => {
  const c = txt.replace(/```json/g, "").replace(/```/g, "").trim();
  const m = c.match(/[\[{][\s\S]*[\]}]/);
  return JSON.parse(m ? m[0] : c);
};
async function askJSON(askAI: AskAI, prompt: string, maxTokens: number, valid: (x: any) => boolean) {
  for (const light of [false, true]) {
    try {
      const x = parseJSONLoose(await askAI([{ role: "user", content: prompt }], maxTokens, light));
      if (valid(x)) return x;
    } catch { /* on tente l'autre chaîne de modèles */ }
  }
  throw new Error("json");
}

const coursTexte = (s: Seance, max = 14000) =>
  s.docs.map((d) => `### ${d.titre}\n${d.contenu}`).join("\n\n").slice(0, max);
const norm = (t: string) => t.toLowerCase().replace(/[«»"“”'’]/g, "").replace(/\[\s*(\.\.\.|…)\s*\]/g, " ").replace(/\s+/g, " ").trim();

// ═════════════════════════════════════════════════════════════════════════════
// CÔTÉ ÉLÈVE
// ═════════════════════════════════════════════════════════════════════════════
export function CoursPremiereEleve({ askAI, onBack, eleveNom }: { askAI: AskAI; onBack: () => void; eleveNom?: string }) {
  const [seances, setSeances] = useState<Seance[] | null>(null);
  const [sid, setSid] = useState<string>("");
  const [tab, setTab] = useState<"cours" | "chat" | "quiz" | "citation">("chat");

  useEffect(() => {
    loadSeances().then((s) => { setSeances(s); if (s.length === 1) setSid(s[0].id); });
  }, []);

  const seance = seances?.find((s) => s.id === sid) || null;
  const groupes = useMemo(() => {
    const g: Record<string, Seance[]> = {};
    (seances || []).forEach((s) => { const k = `${s.semestre} — ${s.theme}`; (g[k] ||= []).push(s); });
    return Object.entries(g);
  }, [seances]);

  const TABS: [typeof tab, string, any][] = [
    ["chat", "Réviser avec le tuteur", MessageCircle],
    ["quiz", "Quiz", CheckCircle2],
    ["citation", "Expliquer une citation", Quote],
    ["cours", "Le cours", BookOpen],
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50">
      <div className="bg-white border-b-2 border-emerald-200 shadow-sm sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Spécialité HLP — Première</p>
            <h1 className="text-lg font-black text-gray-800 truncate">Révision du cours</h1>
          </div>
          <button onClick={onBack} className="text-sm font-semibold text-gray-600 hover:text-gray-800 flex items-center gap-1 flex-shrink-0">
            <ArrowLeft className="w-4 h-4" /> Accueil
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        {!seances ? (
          <p className="text-sm text-gray-500">Chargement du cours…</p>
        ) : seances.length === 0 ? (
          <p className="text-sm text-gray-500">Aucune séance n'est encore disponible.</p>
        ) : (
          <div className="bg-white rounded-2xl border-2 border-emerald-100 p-4">
            <label className="text-xs font-black uppercase tracking-widest text-gray-500">Séance</label>
            <select
              value={sid}
              onChange={(e) => setSid(e.target.value)}
              className="mt-1.5 w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm font-semibold text-gray-800 focus:border-emerald-400 focus:outline-none bg-white">
              <option value="">Choisis une séance…</option>
              {groupes.map(([g, list]) => (
                <optgroup key={g} label={g}>
                  {list.map((s) => <option key={s.id} value={s.id}>{s.titre}</option>)}
                </optgroup>
              ))}
            </select>
            {seance && <p className="text-xs text-gray-500 mt-2">{seance.semestre} · {seance.theme} · {seance.docs.length} document{seance.docs.length > 1 ? "s" : ""}</p>}
          </div>
        )}

        {seance && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {TABS.map(([k, label, Icon]) => (
                <button
                  key={k}
                  onClick={() => setTab(k)}
                  className={`flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border-2 text-xs font-bold transition-all ${tab === k ? "bg-emerald-600 border-emerald-600 text-white" : "bg-white border-gray-200 text-gray-700 hover:border-emerald-300"}`}>
                  <Icon className="w-4 h-4" /> {label}
                </button>
              ))}
            </div>
            {/* key = séance : on repart de zéro quand l'élève change de séance */}
            {tab === "cours" && <LeCours key={seance.id} seance={seance} />}
            {tab === "chat" && <TuteurChat key={seance.id} seance={seance} askAI={askAI} eleveNom={eleveNom} />}
            {tab === "quiz" && <QuizSeance key={seance.id} seance={seance} askAI={askAI} />}
            {tab === "citation" && <CitationExercice key={seance.id} seance={seance} askAI={askAI} />}
          </>
        )}
      </div>
    </div>
  );
}

function LeCours({ seance }: { seance: Seance }) {
  const [open, setOpen] = useState(seance.docs[0]?.id || "");
  return (
    <div className="space-y-2">
      {seance.docs.map((d) => (
        <div key={d.id} className="bg-white rounded-2xl border-2 border-gray-100 overflow-hidden">
          <button onClick={() => setOpen(open === d.id ? "" : d.id)} className="w-full text-left px-5 py-3 font-black text-sm text-gray-800 hover:bg-gray-50 flex justify-between">
            {d.titre} <span className="text-gray-400">{open === d.id ? "−" : "+"}</span>
          </button>
          {open === d.id && (
            <div className="px-5 pb-5 text-sm text-gray-700 leading-relaxed whitespace-pre-wrap border-t border-gray-100 pt-3">{d.contenu}</div>
          )}
        </div>
      ))}
    </div>
  );
}

function TuteurChat({ seance, askAI, eleveNom }: { seance: Seance; askAI: AskAI; eleveNom?: string }) {
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prenom = (eleveNom || "").trim().split(/\s+/)[0];

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [messages, loading]);

  const contexte = `Tu es le tuteur de révision d'un élève de Première, spécialité HLP (Humanités, Littérature et Philosophie).
Séance : « ${seance.titre} » (${seance.semestre} — ${seance.theme}).

=== COURS DU PROFESSEUR (seule référence) ===
${coursTexte(seance)}

Règles :
- Appuie-toi UNIQUEMENT sur ce cours. Si la réponse n'y est pas, dis-le simplement et conseille de demander au professeur.
- N'invente aucune citation ni référence. Quand tu cites le cours, cite-le exactement et explique la citation avec des mots simples.
- Aide l'élève à comprendre et à retenir : pose-lui de temps en temps une petite question pour vérifier.
- Ne rédige jamais un devoir à sa place.
${REGLE_LONGUEUR}`;

  const send = async (preset?: string) => {
    const q = (preset ?? input).trim();
    if (!q || loading) return;
    const next = [...messages, { role: "user" as const, content: q }];
    setMessages(next); setInput(""); setLoading(true);
    try {
      const r = await askAI([
        { role: "user", content: contexte },
        { role: "assistant", content: `D'accord, je suis prêt à t'aider à réviser « ${seance.titre} ».` },
        ...next,
      ], 800);
      setMessages([...next, { role: "assistant", content: r || "Je n'ai pas réussi à répondre. Reformule ta question ?" }]);
    } catch {
      setMessages([...next, { role: "assistant", content: "Désolé, une erreur s'est produite. Réessaie dans un instant." }]);
    }
    setLoading(false);
  };

  const starters = ["Résume-moi la séance en 5 lignes", "Quels sont les mots clés à retenir ?", "Pose-moi 3 questions sur le cours", "Explique-moi le texte étudié"];

  return (
    <div className="bg-white rounded-2xl border-2 border-emerald-100 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
        <p className="text-xs font-bold text-gray-500">Le tuteur répond à partir de ton cours</p>
        {messages.length > 0 && <button onClick={() => setMessages([])} className="text-xs font-bold text-gray-400 hover:text-gray-700 flex items-center gap-1"><RotateCcw className="w-3.5 h-3.5" /> Nouvelle conversation</button>}
      </div>
      <div ref={scrollRef} className="h-[24rem] overflow-y-auto p-4 space-y-3 bg-emerald-50/30">
        <div className="max-w-[85%] bg-white border border-emerald-100 rounded-2xl rounded-bl-md px-4 py-3 text-sm text-gray-800">
          Bonjour{prenom ? ` ${prenom}` : ""} ! On révise « <strong>{seance.titre}</strong> ». Pose ta question ou choisis une suggestion.
        </div>
        {messages.length === 0 && (
          <div className="flex flex-wrap gap-2">
            {starters.map((s) => (
              <button key={s} onClick={() => send(s)} className="text-xs font-semibold text-emerald-700 bg-white border border-emerald-200 hover:border-emerald-400 rounded-full px-3 py-1.5">{s}</button>
            ))}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${m.role === "user" ? "bg-emerald-600 text-white rounded-br-md whitespace-pre-wrap" : "bg-white border border-emerald-100 text-gray-800 rounded-bl-md"}`}>
              {m.role === "user" ? m.content : <RichText text={m.content} />}
            </div>
          </div>
        ))}
        {!loading && messages.length > 0 && messages[messages.length - 1].role === "assistant" && (
          <div className="flex flex-wrap gap-2">
            {DEMANDES_RAPIDES.map((d) => (
              <button key={d.label} onClick={() => send(d.texte)} className="text-xs font-semibold text-emerald-700 bg-white border border-emerald-200 hover:border-emerald-400 rounded-full px-3 py-1.5">{d.label}</button>
            ))}
          </div>
        )}
        {loading && <p className="text-sm text-gray-500 flex items-center gap-2"><Sparkles className="w-4 h-4 animate-spin text-emerald-500" /> Le tuteur réfléchit…</p>}
      </div>
      <div className="border-t border-gray-100 p-3 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          disabled={loading}
          className="flex-1 px-4 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:border-emerald-400 focus:outline-none"
          placeholder="Ta question sur le cours…"
        />
        <button onClick={() => send()} disabled={!input.trim() || loading} aria-label="Envoyer"
          className={`px-4 rounded-xl text-white ${!input.trim() || loading ? "bg-gray-300" : "bg-emerald-600 hover:bg-emerald-700"}`}>
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

type QCM = { question: string; options: string[]; correct: number; explication: string };

function QuizSeance({ seance, askAI }: { seance: Seance; askAI: AskAI }) {
  const [quiz, setQuiz] = useState<QCM[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [qi, setQi] = useState(0);
  const [pick, setPick] = useState<number | null>(null);
  const [score, setScore] = useState(0);

  const generer = async () => {
    setLoading(true); setErr(""); setQuiz(null); setQi(0); setPick(null); setScore(0);
    try {
      const x = await askJSON(askAI, `Voici le cours d'une séance de HLP en classe de Première : « ${seance.titre} ».

${coursTexte(seance)}

Écris 6 questions à choix multiples pour vérifier qu'un élève a compris et retenu ce cours : définitions, idées et thèses, auteurs et œuvres, étapes de la méthode, sens des citations.
- Chaque question porte UNIQUEMENT sur ce qui est dans le cours.
- 4 propositions par question, une seule correcte. Les mauvaises réponses sont plausibles et de même longueur que la bonne.
- Varie la place de la bonne réponse.
- "explication" : une ou deux phrases qui justifient la bonne réponse à partir du cours.
Réponds uniquement en JSON : [{"question":"...","options":["...","...","...","..."],"correct":0,"explication":"..."}]`,
        2500, (a) => Array.isArray(a) && a.length >= 3);
      const clean: QCM[] = x
        .filter((q: any) => q && typeof q.question === "string" && Array.isArray(q.options) && q.options.length === 4 && Number.isInteger(q.correct) && q.correct >= 0 && q.correct < 4)
        .map((q: any) => ({ question: q.question, options: q.options.map(String), correct: q.correct, explication: String(q.explication || "") }))
        .slice(0, 6);
      if (clean.length < 3) throw new Error("quiz");
      setQuiz(clean);
    } catch { setErr("Impossible de préparer le quiz pour l'instant. Réessaie dans un instant."); }
    setLoading(false);
  };

  const q = quiz && qi < quiz.length ? quiz[qi] : null;

  return (
    <div className="bg-white rounded-2xl border-2 border-emerald-100 p-5">
      {!quiz && (
        <div className="text-center py-6">
          <p className="font-black text-gray-800">Quiz sur « {seance.titre} »</p>
          <p className="text-sm text-gray-500 mt-1">6 questions tirées de ton cours, avec la correction après chaque réponse.</p>
          <button onClick={generer} disabled={loading} className="mt-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white font-bold text-sm px-5 py-2.5 rounded-xl inline-flex items-center gap-2">
            {loading ? <><Sparkles className="w-4 h-4 animate-spin" /> Préparation…</> : "Lancer le quiz"}
          </button>
          {err && <p className="text-sm text-red-600 mt-3">{err}</p>}
        </div>
      )}
      {quiz && q && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-black text-emerald-700">Question {qi + 1} / {quiz.length}</p>
            <p className="text-xs font-bold text-gray-400">Score : {score}</p>
          </div>
          <p className="font-bold text-gray-800 leading-snug">{q.question}</p>
          <div className="space-y-2 mt-4">
            {q.options.map((o, i) => {
              const state = pick === null ? "idle" : i === q.correct ? "good" : i === pick ? "bad" : "off";
              return (
                <button key={i} disabled={pick !== null}
                  onClick={() => { setPick(i); if (i === q.correct) setScore((s) => s + 1); }}
                  className={`w-full text-left px-4 py-3 rounded-xl border-2 text-sm transition-all flex items-start gap-2 ${
                    state === "idle" ? "border-gray-200 hover:border-emerald-400 hover:bg-emerald-50" :
                    state === "good" ? "border-green-400 bg-green-50 text-green-800 font-semibold" :
                    state === "bad" ? "border-red-300 bg-red-50 text-red-700" : "border-gray-100 text-gray-400"}`}>
                  {state === "good" && <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />}
                  {state === "bad" && <XCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />}
                  <span>{o}</span>
                </button>
              );
            })}
          </div>
          {pick !== null && (
            <div className="mt-4 rounded-xl bg-gray-50 border border-gray-200 p-3 text-sm text-gray-700">
              <p className="font-black mb-1">{pick === q.correct ? "Bonne réponse !" : "Pas tout à fait."}</p>
              <p>{q.explication}</p>
              <div className="text-right mt-3">
                <button onClick={() => { setPick(null); setQi(qi + 1); }} className="text-xs font-black bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl">
                  {qi + 1 < quiz.length ? "Question suivante →" : "Voir mon score"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      {quiz && !q && (
        <div className="text-center py-6">
          <p className="text-2xl font-black text-gray-800">{score} / {quiz.length}</p>
          <p className="text-sm text-gray-500 mt-1">{score === quiz.length ? "Parfait, le cours est bien retenu." : "Relis le cours, puis retente un nouveau quiz."}</p>
          <button onClick={generer} disabled={loading} className="mt-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm px-5 py-2.5 rounded-xl">
            {loading ? "Préparation…" : "Nouveau quiz"}
          </button>
        </div>
      )}
    </div>
  );
}

type Citation = { texte: string; auteur: string; source: string };
type CorrectionCitation = { verdict: "reussi" | "presque" | "a_retravailler"; points_forts: string; a_ameliorer: string; piste: string };

function CitationExercice({ seance, askAI }: { seance: Seance; askAI: AskAI }) {
  const [citations, setCitations] = useState<Citation[] | null>(null);
  const [ci, setCi] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [rep, setRep] = useState("");
  const [correcting, setCorrecting] = useState(false);
  const [corr, setCorr] = useState<CorrectionCitation | null>(null);

  // L'IA choisit des passages courts ; on ne garde que ceux qui figurent mot pour mot dans le cours
  const charger = async () => {
    setLoading(true); setErr("");
    const brut = norm(seance.docs.map((d) => d.contenu).join(" "));
    try {
      const x = await askJSON(askAI, `Voici le cours d'une séance de HLP (Première) : « ${seance.titre} ».

${coursTexte(seance)}

Choisis 5 citations d'auteurs présentes dans ce cours (dans les textes étudiés ou citées dans le cours), de 8 à 35 mots chacune, qui méritent d'être expliquées.
Recopie chaque citation MOT POUR MOT, sans rien changer, sans guillemets. Indique l'auteur et l'œuvre tels qu'ils figurent dans le cours.
Réponds uniquement en JSON : [{"texte":"...","auteur":"...","source":"..."}]`,
        1500, (a) => Array.isArray(a) && a.length > 0);
      const ok: Citation[] = x
        .filter((c: any) => c?.texte && brut.includes(norm(String(c.texte))))
        .map((c: any) => ({ texte: String(c.texte).replace(/^[«"\s]+|[»"\s]+$/g, ""), auteur: String(c.auteur || ""), source: String(c.source || "") }));
      if (ok.length === 0) throw new Error("aucune");
      setCitations(ok); setCi(0); setRep(""); setCorr(null);
    } catch { setErr("Impossible de trouver des citations dans ce cours pour l'instant. Réessaie dans un instant."); }
    setLoading(false);
  };

  useEffect(() => { charger(); }, []);

  const cit = citations?.[ci];

  const corriger = async () => {
    if (!cit || rep.trim().length < 30 || correcting) return;
    setCorrecting(true); setCorr(null);
    try {
      const c = await askJSON(askAI, `Tu es professeur de HLP et tu corriges l'explication de citation d'un élève de Première.

Cours de référence (séance « ${seance.titre} ») :
${coursTexte(seance, 8000)}

Citation : « ${cit.texte} » (${cit.auteur}${cit.source ? ", " + cit.source : ""})
Explication de l'élève : ${rep.trim()}

Une bonne explication de citation :
- reformule l'idée avec ses propres mots (elle ne répète pas la citation) ;
- explique les mots importants ;
- dit ce que l'auteur veut montrer et le relie au problème de la séance ;
- reste fidèle au texte, sans contresens.
Sois bienveillant mais exigeant. Tutoie l'élève. Commentaires courts (deux phrases au plus chacun).
Dans "piste", propose une explication possible en 3 phrases.
Réponds uniquement en JSON : {"verdict":"reussi|presque|a_retravailler","points_forts":"...","a_ameliorer":"...","piste":"..."}`,
        1200, (o) => !!o?.verdict);
      setCorr({
        verdict: ["reussi", "presque", "a_retravailler"].includes(c.verdict) ? c.verdict : "presque",
        points_forts: String(c.points_forts || ""), a_ameliorer: String(c.a_ameliorer || ""), piste: String(c.piste || ""),
      });
    } catch { setErr("La correction n'a pas pu être faite. Réessaie dans un instant."); }
    setCorrecting(false);
  };

  const VERDICT = {
    reussi: ["Explication réussie", "bg-green-50 border-green-300 text-green-800"],
    presque: ["Presque : encore un effort", "bg-amber-50 border-amber-300 text-amber-900"],
    a_retravailler: ["À retravailler", "bg-rose-50 border-rose-300 text-rose-800"],
  } as const;

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-2xl border-2 border-emerald-100 p-5">
        <p className="text-xs font-black uppercase tracking-widest text-emerald-700">Expliquer une citation</p>
        <p className="text-sm text-gray-500 mt-1">Une citation doit toujours être expliquée : dis avec tes mots ce qu'elle signifie et ce qu'elle apporte au problème.</p>
        {loading && <p className="text-sm text-gray-500 mt-4 flex items-center gap-2"><Sparkles className="w-4 h-4 animate-spin text-emerald-500" /> Recherche de citations dans le cours…</p>}
        {err && <p className="text-sm text-red-600 mt-3">{err} <button onClick={charger} className="underline font-bold">Réessayer</button></p>}
        {cit && (
          <>
            <blockquote className="mt-4 border-l-4 border-emerald-400 bg-emerald-50/60 rounded-r-xl px-4 py-3">
              <p className="text-gray-800 font-semibold leading-relaxed">« {cit.texte} »</p>
              <p className="text-xs text-gray-500 mt-1.5">{cit.auteur}{cit.source ? `, ${cit.source}` : ""}</p>
            </blockquote>
            <textarea
              value={rep}
              onChange={(e) => setRep(e.target.value)}
              rows={5}
              className="mt-3 w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:border-emerald-400 focus:outline-none resize-none"
              placeholder="Cela signifie que… L'auteur veut montrer que… Cela permet de comprendre que…"
            />
            <div className="flex flex-col sm:flex-row gap-2 mt-2">
              <button onClick={corriger} disabled={rep.trim().length < 30 || correcting}
                className={`flex-1 py-2.5 rounded-xl font-bold text-sm text-white ${rep.trim().length >= 30 && !correcting ? "bg-emerald-600 hover:bg-emerald-700" : "bg-gray-300"}`}>
                {correcting ? "Correction en cours…" : "Faire corriger mon explication"}
              </button>
              {citations && citations.length > 1 && (
                <button onClick={() => { setCi((ci + 1) % citations.length); setRep(""); setCorr(null); }}
                  className="px-4 py-2.5 rounded-xl font-bold text-sm border-2 border-emerald-200 text-emerald-700 hover:bg-emerald-50">
                  Autre citation
                </button>
              )}
            </div>
          </>
        )}
      </div>
      {corr && (
        <div className="space-y-2">
          <div className={`rounded-2xl border-2 p-4 ${VERDICT[corr.verdict][1]}`}>
            <p className="font-black">{VERDICT[corr.verdict][0]}</p>
            {corr.points_forts && <p className="text-sm mt-1">{corr.points_forts}</p>}
          </div>
          {corr.a_ameliorer && (
            <div className="bg-indigo-50 border-2 border-indigo-200 rounded-2xl p-4">
              <p className="text-xs font-black uppercase tracking-widest text-indigo-700">Pour progresser</p>
              <p className="text-sm text-indigo-900 mt-1">{corr.a_ameliorer}</p>
            </div>
          )}
          {corr.piste && (
            <details className="bg-white border-2 border-emerald-200 rounded-2xl overflow-hidden">
              <summary className="px-4 py-3 cursor-pointer text-sm font-bold text-emerald-700 list-none">Voir une explication possible</summary>
              <p className="px-4 pb-4 text-sm text-gray-700 leading-relaxed">{corr.piste}</p>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// CÔTÉ PROF
// ═════════════════════════════════════════════════════════════════════════════
export function ProfCoursPremiere({ extractFile }: { extractFile: (f: File) => Promise<string> }) {
  const [seances, setSeances] = useState<Seance[] | null>(null);
  const [sel, setSel] = useState<string>("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [importing, setImporting] = useState(false);
  const [retireesMaj, setRetireesMaj] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadSeances().then((s) => { setSeances(s); setSel(s[0]?.id || ""); setRetireesMaj(retirees); }); }, []);

  const seance = seances?.find((s) => s.id === sel) || null;
  const update = (fn: (s: Seance) => Seance) => {
    setSeances((all) => (all || []).map((s) => (s.id === sel ? fn(s) : s)));
    setDirty(true); setMsg("");
  };

  const ajouterSeance = () => {
    const s: Seance = { id: uid(), semestre: seance?.semestre || "Semestre 1", theme: seance?.theme || "", titre: "Nouvelle séance", docs: [] };
    setSeances([...(seances || []), s]); setSel(s.id); setDirty(true);
  };
  const supprimerSeance = () => {
    if (!seance || !confirm(`Supprimer la séance « ${seance.titre} » et ses documents ?`)) return;
    const rest = (seances || []).filter((s) => s.id !== sel);
    if (DEFAULT_SEANCES.some((d) => d.id === sel)) setRetireesMaj((r) => Array.from(new Set([...r, sel])));
    setSeances(rest); setSel(rest[0]?.id || ""); setDirty(true);
  };

  const importer = async (files: FileList | null) => {
    if (!files || !seance) return;
    setImporting(true); setMsg("");
    const docs: CoursDoc[] = [];
    for (const f of Array.from(files)) {
      try { docs.push({ id: uid(), titre: f.name.replace(/\.[^.]+$/, ""), contenu: (await extractFile(f)).trim() }); }
      catch (e: any) { setMsg(`${f.name} : ${e?.message || "import impossible"}`); }
    }
    if (docs.length) update((s) => ({ ...s, docs: [...s.docs, ...docs] }));
    setImporting(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const enregistrer = async () => {
    if (!seances) return;
    setSaving(true);
    try { await saveSeances(seances, retireesMaj); setDirty(false); setMsg("Enregistré : les élèves voient la nouvelle version."); }
    catch { setMsg("L'enregistrement a échoué. Réessaie."); }
    setSaving(false);
  };

  if (!seances) return <p className="text-sm text-gray-500">Chargement…</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-gray-800">Cours HLP — Première</h2>
          <p className="text-sm text-gray-500 mt-1">Les élèves révisent chaque séance avec le tuteur, un quiz et l'explication de citations. Tout s'appuie uniquement sur les documents ci-dessous.</p>
        </div>
        <button onClick={enregistrer} disabled={!dirty || saving}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-white flex-shrink-0 ${dirty ? "bg-emerald-600 hover:bg-emerald-700" : "bg-gray-300"}`}>
          <Save className="w-4 h-4" /> {saving ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
      {msg && <p className="text-sm font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">{msg}</p>}

      <div className="flex flex-col md:flex-row gap-4">
        <div className="md:w-64 flex-shrink-0 space-y-1">
          {seances.map((s) => (
            <button key={s.id} onClick={() => setSel(s.id)}
              className={`w-full text-left px-3 py-2.5 rounded-xl border-2 transition-all ${sel === s.id ? "bg-emerald-600 border-emerald-600 text-white" : "bg-white border-gray-200 text-gray-700 hover:border-emerald-300"}`}>
              <p className="text-xs font-black">{s.titre}</p>
              <p className={`text-[11px] mt-0.5 ${sel === s.id ? "text-emerald-100" : "text-gray-400"}`}>{s.semestre} · {s.docs.length} doc.</p>
            </button>
          ))}
          <button onClick={ajouterSeance} className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border-2 border-dashed border-gray-300 text-xs font-bold text-gray-500 hover:border-emerald-400 hover:text-emerald-700">
            <Plus className="w-4 h-4" /> Nouvelle séance
          </button>
        </div>

        {seance && (
          <div className="flex-1 bg-white rounded-2xl border-2 border-gray-200 p-4 space-y-3">
            <div className="grid sm:grid-cols-3 gap-2">
              {([["semestre", "Semestre"], ["theme", "Thème / objet d'étude"], ["titre", "Titre de la séance"]] as const).map(([k, l]) => (
                <label key={k} className="text-xs font-bold text-gray-600">
                  {l}
                  <input value={seance[k]} onChange={(e) => update((s) => ({ ...s, [k]: e.target.value }))}
                    className="mt-1 w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:border-emerald-400 focus:outline-none" />
                </label>
              ))}
            </div>

            <div className="flex items-center justify-between pt-2">
              <p className="text-sm font-black text-gray-800">Documents ({seance.docs.length})</p>
              <div className="flex gap-2">
                <input ref={fileRef} type="file" multiple accept=".pdf,.docx,.txt" className="hidden" onChange={(e) => importer(e.target.files)} />
                <button onClick={() => fileRef.current?.click()} disabled={importing}
                  className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg border-2 border-emerald-200 text-emerald-700 hover:bg-emerald-50">
                  <Upload className="w-3.5 h-3.5" /> {importing ? "Import…" : "Importer (.pdf, .docx, .txt)"}
                </button>
                <button onClick={() => update((s) => ({ ...s, docs: [...s.docs, { id: uid(), titre: "Nouveau document", contenu: "" }] }))}
                  className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg border-2 border-gray-200 text-gray-600 hover:border-gray-300">
                  <Plus className="w-3.5 h-3.5" /> Coller un texte
                </button>
              </div>
            </div>

            {seance.docs.map((d) => (
              <div key={d.id} className="border-2 border-gray-100 rounded-xl p-3 space-y-2">
                <div className="flex gap-2">
                  <input value={d.titre} onChange={(e) => update((s) => ({ ...s, docs: s.docs.map((x) => (x.id === d.id ? { ...x, titre: e.target.value } : x)) }))}
                    className="flex-1 px-3 py-1.5 border-2 border-gray-200 rounded-lg text-sm font-bold focus:border-emerald-400 focus:outline-none" />
                  <button onClick={() => update((s) => ({ ...s, docs: s.docs.filter((x) => x.id !== d.id) }))} title="Retirer ce document"
                    className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50"><Trash2 className="w-4 h-4" /></button>
                </div>
                <textarea value={d.contenu} onChange={(e) => update((s) => ({ ...s, docs: s.docs.map((x) => (x.id === d.id ? { ...x, contenu: e.target.value } : x)) }))}
                  rows={8} className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-xs font-mono leading-relaxed focus:border-emerald-400 focus:outline-none resize-y"
                  placeholder="Texte du document (vérifie l'import : numéros de ligne, coupures…)" />
              </div>
            ))}

            <div className="flex justify-between pt-2 border-t border-gray-100">
              <p className="text-[11px] text-gray-400">Pense à cliquer sur « Enregistrer » en haut pour publier tes modifications.</p>
              <button onClick={supprimerSeance} className="text-xs font-bold text-red-500 hover:text-red-700">Supprimer la séance</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
