"use client";
// app/CoursPremiere.tsx
// Révision du cours, par niveau : Spécialité HLP Première, Philosophie Terminale (tronc commun).
// - Côté élève : choix d'une séance, puis « Le cours », « Réviser avec le tuteur » (chat),
//   « Quiz » (QCM générés sur la séance) et « Expliquer une citation » (correction par l'IA).
// - Côté prof : création des séances (semestre, thème, titre) et de leurs documents
//   (texte collé ou import .pdf / .docx / .txt).
// Stockage : table config, une clé par niveau (« cours_hlp1 », « cours_tle »), en JSON. Tant que rien n'est enregistré,
// la séance d'exemple fournie par le professeur est utilisée.

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, BookOpen, CheckCircle2, MessageCircle, Plus, Quote, RotateCcw, Save, Send, Sparkles, Trash2, Upload, XCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { DEMANDES_RAPIDES, REGLE_LONGUEUR, RichText } from "./MethodeChatHome";

export type CoursDoc = { id: string; titre: string; contenu: string; partie?: string };
export type Seance = { id: string; semestre: string; theme: string; titre: string; docs: CoursDoc[] };
type AskAI = (messages: { role: string; content: string }[], maxTokens?: number, light?: boolean) => Promise<string>;

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

export const DEFAULT_SEANCES_HLP1: Seance[] = [
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
      { id: "g2", titre: "Introduction modèle (question d'interprétation philosophique)", contenu: "Question d’interprétation philosophique : Dans cet extrait, en quoi la rhétorique peut-elle détourner l’âme du vrai, comme la flatterie détourne le corps du bien ?\n\nPrésentation générale de l’œuvre\nDans cet extrait du Gorgias, dialogue écrit par Platon vers 390-385 av. J.-C., Socrate répond au jeune Polos, qui lui demande ce qu’est la rhétorique. L’auteur tente de défendre l’idée que la rhétorique est une forme de flatterie et qu’elle n’est donc pas un véritable art. Le texte nous invite ainsi à réfléchir à l’art de la parole et à ses pouvoirs.\n\nDéfinition\nLa flatterie, au sens courant, c’est chercher à plaire à quelqu’un par des louanges excessives et intéressées. Chez Platon, le mot a un sens plus large : la flatterie désigne toute pratique qui cherche à procurer du plaisir sans viser le bien, en prenant l’apparence de ce qui fait vraiment du bien. La rhétorique, c’est l’art de bien parler pour persuader. Le vrai désigne ce qui est conforme au réel, par opposition à ce qui n’en a que l’apparence. Le bien, c’est ce qui est réellement bon pour un être : pour le corps, c’est la santé ; pour l’âme, c’est la justice. Enfin, le corps et l’âme sont les deux réalités qui nous constituent : le corps est physique et matériel, l’âme est immatérielle.\n\nParadoxe\nEn apparence, la flatterie semble inoffensive : elle embellit les choses et les rend plus agréables qu’elles ne le sont en réalité. De même, la rhétorique est présentée par ses défenseurs, comme Gorgias, comme un art utile et même le plus beau de tous, puisqu’elle permet de convaincre tout le monde sur tous les sujets. Platon fait pourtant intervenir Socrate pour la critiquer : s’il n’en rejette pas tous les aspects, il met largement en garde contre elle, en raison des dangers qu’elle fait courir, notamment dans la vie politique. Car ce qui plaît n’est pas forcément ce qui fait du bien : nous pouvons être corrompus dans notre âme par les belles paroles, comme nous pouvons l’être dans notre corps par les bons petits plats.\n\nProblématique\nTout discours qui flatte est-il dangereux ? En quoi rendre un discours plus beau peut-il éloigner l’âme de la vérité ?\n\nPlan\nNous verrons d’abord comment, dans le domaine des soins du corps, Socrate distingue les véritables arts de leurs contrefaçons (l. 1 à 9). Puis nous verrons le statut de la rhétorique, présentée comme la contrefaçon d’un art qui s’adresse à l’âme (l. 9 à la fin)." },
      { id: "g3", titre: "Paragraphe commenté modèle", contenu: "Question d’interprétation philosophique : Dans cet extrait, en quoi la rhétorique peut-elle détourner l’âme du vrai, comme la flatterie détourne le corps du bien ?\n\nParagraphe commenté (argumenté)\n\n[Thèse]\nLa thèse de Socrate est que la rhétorique n’a que l’apparence d’un art : comme la cuisine pour le corps, elle procure du plaisir à l’âme sans viser son bien. La rhétorique est donc une flatterie, et non un véritable art.\n\n[Argumentation de la thèse (du texte)]\nChez Platon, la flatterie ne se réduit pas aux louanges : c’est toute pratique qui cherche à plaire sans se soucier du bien, en se faisant passer pour ce qui fait vraiment du bien. Socrate procède par analogie et commence par les soins du corps, qu’il divise en deux catégories. D’un côté, les véritables arts, qui visent le bien réel du corps, c’est-à-dire sa santé : la gymnastique, qui l’entretient, et la médecine, qui le soigne. De l’autre, leurs contrefaçons, qui n’en ont que l’apparence : la toilette et la cuisine. La toilette, c’est-à-dire l’art de se parer, « emploie pour séduire les formes, les couleurs, le poli, les vêtements ». Cela signifie qu’elle fabrique une beauté « étrangère », ajoutée de l’extérieur, au lieu de la beauté naturelle que donne l’exercice. De même, la cuisine vise le plaisir du goût et non la santé. Pourquoi ces pratiques ne sont-elles pas de véritables arts ? Pour Socrate, un art (technè) connaît la nature de ce dont il s’occupe et peut expliquer pourquoi il agit ainsi ; la flatterie, elle, n’est qu’une routine, un savoir-faire acquis par l’habitude, qui devine ce qui plaît sans savoir ce qui est bon. Socrate s’oppose ainsi à l’idée, vue avec Cicéron et Corax, selon laquelle la rhétorique serait une technique : pour lui, elle n’en a que l’apparence. Il transpose ensuite ce tableau à l’âme : la sophistique imite la législation, comme la toilette imite la gymnastique, et la rhétorique imite la justice, comme la cuisine imite la médecine. D’où la formule : « ce que la cuisine est à la médecine, la rhétorique l’est à la justice ». Cela veut dire que la rhétorique prend la place de la justice, comme la cuisine se fait passer pour la médecine : elle donne à l’âme ce qui lui plaît, des discours agréables et des opinions flatteuses, au lieu de ce qui la rend meilleure. Enfin, Socrate explique que ces pratiques se confondent parce qu’elles sont « voisines » : si le corps jugeait seul, d’après les plaisirs qu’il en retire, on ne distinguerait plus la cuisine de la médecine. De même, une âme qui juge les discours d’après le plaisir qu’ils lui procurent ne distingue plus ce qui est vrai de ce qui est seulement persuasif. C’est ainsi que la rhétorique peut détourner l’âme du vrai.\n\n[Exemple]\nLa véritable science du juste doit, pour l’âme, ressembler à la médecine, qui prescrit souvent des remèdes pénibles mais qui seule assure au corps sa santé. Ainsi, lorsque je dois prendre un sirop au goût désagréable, je ne dois pas me fier à mes papilles pour savoir s’il est bon ou mauvais pour moi : c’est le médecin qui le sait, et je dois lui faire confiance. De la même façon, un discours qui me plaît, parce qu’il me dit ce que j’ai envie d’entendre, n’est pas pour autant un discours vrai.\n\n[Conclusion du paragraphe]\nL’âme doit donc se méfier des discours flatteurs, comme le corps doit se méfier du plaisir immédiat. La justice et le bien, qui sont la véritable santé de l’âme, demandent de traverser un certain désagrément : accepter d’être contredit, réfuté, corrigé. Ce qui semble sur le moment blesser l’âme est en réalité ce qui la rend meilleure." },
    ],
  },
];

export const DEFAULT_SEANCES_TLE: Seance[] = [
  {
    id: "tle-s1-esclave-soi",
    semestre: "Notion : la liberté",
    theme: "Philosophie — tronc commun",
    titre: "Sujet 1 — Peut-on être esclave de soi-même ?",
    docs: [
      { id: "t1", partie: "Introduction", titre: "Introduction", contenu: "Introduction\n\n1 – Opinion Commune Il semble logique de penser qu’il est impossible d’être son propre esclave.\n\n2 – Définitions En effet, un esclave est une personne qui obéit à quelqu’un d’autre que lui-même. L’expression « soi-même » peut faire référence à l’individu que l’on incarne, c’est-à-dire l’être doué de conscience. Enfin le « peut-on » nous oblige à envisager la possibilité de quelque chose.\n\n3 – Paradoxe Même si de prime abord, le sujet semble poser une question dont la réponse est évidente, il serait motivant d’envisager que l’esclavage n’est pas qu’une relation avec un être extérieur à soi. En d’autres termes, il faudrait imaginer qu’il est possible que nous nous privions nous-mêmes de notre pouvoir d’agir. Ainsi, l’individu lui-même pourrait se poser ses propres barrières et gagner par la même une forme de dignité qui passerait par le renoncement.\n\n4 – Problématique(s) Est-ce qu’obéir s’oppose nécessairement à la liberté ? Suis-je prisonnier de mon libre arbitre ? Est-ce que s’imposer des règles est une voie d’accès vers l’indépendance ? Peut-on véritablement être maître de soi-même ?\n\n5 – Annonce de Plan Dans un premier temps, nous verrons qu’il existe des servitudes volontaires. Par la suite, nous envisagerons que l’origine d’un acte peut nous masquer notre liberté. Enfin, nous verrons que le déterminisme est un défi pour la liberté." },
      { id: "t2", partie: "I.a", titre: "I.a — La Boétie (1530-1563) – Une incompréhensible soumission (cours)", contenu: "I – Il existe des servitudes volontaires La Boétie (1530-1563) – Une incompréhensible soumission\n\n[Thèse] La liberté est le bien le plus précieux de l'homme ; il semble absurde d'imaginer que certains puissent vouloir y renoncer. Pourtant, selon La Boétie, la servitude est librement consentie, ce qui pose un paradoxe redoutable : comment pouvons-nous accepter l'esclavage, pire, le rechercher ?\n\n[Arguments] La Boétie identifie trois raisons à cette incompréhensible soumission : l'habitude, qui fait que les hommes nés dans la servitude « servent sans regret » ; les spectacles et la religion, par lesquels le tyran « sucre la servitude d'une venimeuse douceur » et endort les consciences ; et la corruption des courtisans, complices qui l'aident à asservir tout un peuple.\n\n[Citation] « Soyez résolus à ne plus servir, et vous voilà libres » : le tyran ne tient sa puissance que de ceux qui la lui accordent.\n\n[Exemple] Rosa Parks, en 1955 à Montgomery, refuse de céder sa place dans le bus à un Blanc ; son refus déclenche un boycott qui aboutit, en 1956, à la fin légale de la ségrégation dans les bus.\n\n[Conclusion] Il ne peut exister de tyrannie sans l'assentiment du peuple : la servitude est donc par essence volontaire, elle résulte d'un consentement intérieur et non d'une contrainte extérieure — mais à l'échelle collective : c'est ici le peuple, et non l'individu isolé, qui s'asservit lui-même." },
      { id: "t3", partie: "I.a", titre: "I.a — La Boétie (1530-1563) – Une incompréhensible soumission (textes)", contenu: "I – Il existe des servitudes volontaires\n\na) La Boétie (1530-1563) – Une incompréhensible soumission\n\nTexte\n « Je prends plaisir à rappeler ici une anecdote concernant l’un des favoris de Xerxès, grand roi de Perse, et deux Spartiates. Lorsque Xerxès faisait ses préparatifs de guerre pour conquérir la Grèce entière, il envoya ses ambassadeurs dans plusieurs villes de ce pays pour demander de l’eau et de la terre - c’était la manière qu’avaient les Perses de sommer les villes de se rendre. Il se garda bien d’en envoyer à Sparte ni à Athènes parce que les Spartiates et les Athéniens, auxquels son père Darius en avait envoyés auparavant, les avaient jetés, les uns dans les fossés, les autres dans les puits en leur disant : \"Allez-y, prenez là de l’eau et de la terre, et portez les à votre prince.\" Ces gens ne pouvaient souffrir que, même par la moindre parole, on attentât à leur liberté. » […] « Deux Spartiates, l’un nommé Sperthiès et l’autre Bulis, s’offrirent comme victimes volontaires. Ils partirent. Arrivés au palais d’un Perse nommé Hydarnes, lieutenant du roi pour toutes les villes d’Asie qui étaient sur les côtes de la mer, celui-ci les accueillit fort honorablement, leur fit grande chère et, de fil en aiguille, leur demanda pourquoi ils rejetaient si fort l’amitié du roi. « Spartiates, dit-il, voyez par mon exemple comment le Roi sait honorer ceux qui le méritent. Croyez que si vous étiez à son service et qu’il vous eût connus, vous seriez tous les deux gouverneurs de quelque ville grecque. » Les Lacédémoniens\n\n[= Spartiates] répondirent : « En ceci, Hydarnes, tu ne pourrais nous donner un bon conseil ; car si tu as essayé le bonheur que tu nous promets, tu ignores entièrement celui dont nous jouissons. Tu as éprouvé la faveur du roi, mais tu ne sais pas quel goût délicieux à la liberté. Or si tu en avais seulement gouté, tu nous conseillerais de la défendre non seulement avec la lance et le bouclier, mais avec les dents et avec les ongles ». La Boétie, Discours de la servitude volontaire, 1548¹\n\nTexte\n « Or ce tyran seul, il n’est pas besoin de le combattre, ni de l’abattre. Il est défait de lui-même, pourvu que le pays ne consente point à sa servitude. Il ne s’agit pas de lui ôter quelque chose, mais de ne rien lui donner. Pas besoin que le pays se mette en peine de faire rien pour soi, pourvu qu’il ne fasse rien contre soi. Ce sont donc les peuples eux-mêmes qui se laissent, ou plutôt qui se font malmener, puisqu’ils en seraient quittes en cessant de servir. C’est le peuple qui s’asservit et qui se coupe la gorge ; qui pouvant choisir d’être soumis ou d’être libre, repousse la liberté et prend le joug ; qui consent à son mal, ou plutôt qui le recherche … » « Certes, comme le feu d’une étincelle grandit et se renforce toujours, et plus il trouve de bois à brûler, plus il en dévore, mais se consume et finit par s’éteindre de lui-même quand on cesse de l’alimenter, de même, plus les tyrans pillent, plus ils exigent ; plus ils ruinent et détruisent, plus on leur fournit, plus on les sert. Ils se fortifient d’autant, deviennent de plus en plus frais et dispos pour tout anéantir et tout détruire. Mais si on ne leur fournit rien, si on ne leur obéit pas, sans les combattre, sans les frapper, ils restent nus et défaits et ne sont plus rien, de même que la branche, n’ayant plus de suc ni d’aliment à sa racine, devient sèche et morte ». La Boétie, Discours de la servitude volontaire, 1548²\n\n1 Éditions Mille et Une Nuits, traduction en français moderne de Séverine Auffret\n\n2 Ibid" },
      { id: "t4", partie: "I.b", titre: "I.b — Épictète (50-130 ap. JC) Ce qui dépend de nous est vraiment libre (cours)", contenu: "I – Il existe des servitudes volontaires.\n\nb) Épictète (50-130 ap. JC) Ce qui dépend de nous est vraiment libre\n\n[Citation] Lorsqu'Épictète affirme que « l'éducation philosophique consiste à apprendre à vouloir chaque chose comme elle arrive » (Entretiens), il vise l'opinion commune, qui identifie la liberté au fait que tout arrive selon nos désirs.\n\n[Thèse de l'auteur] Or Épictète disqualifie d'emblée cette conception en l'attribuant à un fou : la liberté, c'est accepter la raison présente dans le monde.\n\n[Argument] L'homme libre n'est pas celui à qui tout advient selon sa volonté, car les lois physiques du monde ne se plient pas toujours à ce que je veux.\n\n[Thèse] Pour Épictète, la liberté est donc une chose raisonnable,\n\n[Argument] car vouloir les choses telles qu'elles sont, c'est se conformer à la nécessité, comprendre et vouloir l'ordre rationnel du cosmos : certaines choses dépendent de moi, d'autres non — à moi de me concentrer sur les premières et de rester indifférent aux secondes.\n\n[Exemple] Vouloir ne pas être mouillé en entrant dans une piscine est absurde — pourtant combien s'indignent d'être éclaboussés ?\n\n[Conclusion de l'argument] L'esclavage est donc intérieur : c'est la tyrannie de nos désirs excessifs qui nous enferme dans une représentation fausse du monde. Savoir raison garder est le meilleur moyen de rester libre." },
      { id: "t5", partie: "I.b", titre: "I.b — Épictète (50-130 ap. JC) Ce qui dépend de nous est vraiment libre (textes)", contenu: "I – Il existe des servitudes volontaires\n\nb) Épictète (50-130 ap. JC) Ce qui dépend de nous est vraiment libre\n\nTexte\n « De toutes les choses du monde, les unes dépendent de nous, les autres n’en dépendent pas. Celles qui en dépendent sont nos opinions, nos mouvements, nos désirs, nos inclinations, nos aversions ; en un mot, toutes nos actions. Celles qui ne dépendent point de nous sont le corps, les biens, la réputation, les dignités ; en un mot, toutes les choses qui ne sont pas du nombre de nos actions. Les choses qui dépendent de nous sont libres par leur nature, rien ne peut ni les arrêter, ni leur faire obstacle ; celles qui n’en dépendent pas sont faibles, esclaves, dépendantes, sujettes à mille obstacles et à mille inconvénients, et entièrement étrangères. Souviens-toi donc que, si tu crois libres les choses qui de leur nature sont esclaves, et propres à toi celles qui dépendent d’autrui, tu rencontreras à chaque pas des obstacles, tu seras affligé, troublé, et tu te plaindras des dieux et des hommes. Au lieu que si tu crois tien ce qui t’appartient en propre, et étranger ce qui est à autrui, jamais personne ne te forcera à faire ce que tu ne veux point, ni ne t’empêchera de faire ce que tu veux; tu ne te plaindras de personne; tu n’accuseras personne; tu ne feras rien, pas même la plus petite chose, malgré toi; personne ne te fera aucun mal, et tu n’auras point d’ennemi, car il ne t’arrivera rien de nuisible. »\nÉpictète, Manuel1 (+/- 125 ap. JC)\n\nTexte\n « Puisque l’homme libre est celui à qui tout arrive comme il le désire, me dit un fou, je veux aussi que tout m’arrive comme il me plaît. - Eh ! mon ami, la folie et la liberté ne se trouvent jamais ensemble. La liberté est une chose non seulement très belle, mais très raisonnable et il n’y a rien de plus absurde ni de plus déraisonnable que de former des désirs téméraires et de vouloir que les choses arrivent comme nous les avons pensées. […] Non mon ami : la liberté consiste à vouloir que les choses arrivent, non comme il te plaît, mais comme elles arrivent. »\nEpictète, Entretiens², I, 1\n\n¹ Editions Mille et une nuit, traduction Myrto Gondicas" },
      { id: "t6", partie: "I.c", titre: "I.c — Ibsen (1828-1906) & Beauvoir (1908-1986) - Un asservissement inconscient (cours)", contenu: "I – Il existe des servitudes volontaires.\n\nc) Ibsen (1828-1906) & Beauvoir (1908-1986) - Un asservissement inconscient\n\n[Thèse de l'auteur] La condition féminine est l'image même d'une servitude volontaire, bien qu'inconsciente.\n\n[Arguments] Sacralisée comme mère et épouse dévouée, admirée pour son abnégation, la femme demeure pourtant une éternelle mineure à qui l'on dénie des droits élémentaires — gagner, emprunter ou dépenser de l'argent sans l'accord de son mari. Elle se trouve dans une situation d'aliénation : dépossédée de son libre arbitre, elle ne peut être elle-même dans une société exclusivement masculine, où lois, mœurs et jugements sont pensés du seul point de vue de l'homme. Le mariage devient alors une contrainte qui enferme chacun, homme et femme, dans un rôle étouffant sa personnalité propre. Mais c'est uniquement par une prise de conscience de ce statut d'être inférieur qu'elle pourra s'en libérer.\n\n[Exemple] Avant la loi du 13 juillet 1965 portant réforme des régimes matrimoniaux, le mariage plaçait la femme sous la tutelle de son mari : ni compte en banque, ni emploi sans son autorisation — c'est cette loi qui lui accorde enfin la gestion de ses biens propres et le droit de travailler librement.\n\n[Citation] « Mes devoirs envers moi-même », que réclame Nora Helmer dans La Maison de poupée d'Ibsen, montre que le premier devoir d'un être est de se libérer d'un asservissement inconscient, inconnu de la personne qui le subit — la femme s'est longtemps oubliée, écrasée par l'ombre de son mari et son rôle de mère.\n\n[Conclusion de l'argument] On comprend dès lors que l'être humain, et donc la femme, peut être esclave sans même le savoir." },
      { id: "t7", partie: "I.c", titre: "I.c — Ibsen (1828-1906) Beauvoir (1908-1986) - Un asservissement inconscient (textes)", contenu: "I – Il existe des servitudes volontaires.\n\nc) Ibsen (1828-1906) Beauvoir (1908-1986) - Un asservissement inconscient\n\nTexte\n Nora Helmer - L'héroïne, femme de Torvald, mère de trois enfants, elle vit selon la mentalité du XIXème siècle, mais à la fin découvre sa condition de femme. Torvald Helmer - Le mari de Nora, un banquier récemment promu, étranglé d'indignation par la conduite de sa femme, bien qu'il déclare être amoureux d'elle.\n\nNora. J’ai besoin d’être seule pour me rendre compte de moi-même et de tout ce qui m’entoure. Voilà pourquoi je ne puis demeurer avec toi.\n\nHelmer. Nora ! Nora !\n\nNora. Je veux partir tout de suite. Cette nuit je trouverai asile chez Christine.\n\nHelmer. Tu divagues. Tu n’as pas le droit de partir, je te le défends.\n\nNora. Dorénavant tu ne peux rien me défendre… J’emporte tout ce qui est à moi. Je ne veux rien recevoir de toi ni maintenant ni jamais.\n\nHelmer. Mais que veut dire cette folie.\n\nNora. Demain je pars pour mon pays. Là je pourrai vivre plus facilement.\n\nHelmer. Aveugle que tu es, pauvre créature sans expérience !\n\nNora. Je tâcherai d’acquérir de l’expérience, 20 Torvald.\n\nHelmer. Abandonner ton foyer, ton mari, tes enfants. Tu ne penses pas à ce que l’on va dire.\n\nNora. Je n’y puis penser. Je ne sais que ce qui m’est indispensable.\n\nHelmer. Ah ! c’est irritant. De sorte que tu manqueras à tes devoirs les plus sacrés.\n\nNora. Qu’appelles-tu mes devoirs les plus sacrés ?\n\nHelmer. Ai-je vraiment besoin de te le dire ? Est-ce que ce ne sont pas tes devoirs envers ton mari et tes enfants ?\n\nNora. J’en ai d’autres non moins sacrés.\n\nHelmer. Tu n’en as pas. Quels sont ces devoirs ?\n\nNora. Mes devoirs envers moi-même.\n\nHelmer. Avant tout tu es épouse et mère.\n\nNora. Je n’y crois plus. Je crois que je suis avant tout un être humain, avec les mêmes droits que toi, ou que du moins je dois tâcher de l’être. Je sais que la majorité des hommes te donnera raison et, que ces idées sont imprimées dans les livres, mais maintenant je ne puis penser à ce que disent les hommes et à ce qu’ils impriment dans les livres. Je ne sais rien, mais je vais tout tirer de moi-même. Il faut que je forme moi-même mes idées làdessus, et que j’essaye de m’en rendre compte. Ibsen, Une maison de poupée (1879)\n\nI – Il existe des servitudes volontaires.\n\nc) Ibsen (1828-1906) Beauvoir (1908-1986) - Un asservissement inconscient\n\nTexte\n « La destinée que la société propose traditionnellement à la femme, c’est le mariage. La plupart des femmes, aujourd’hui encore, sont mariées, l’ont été, se préparent à l’être ou souffrent de ne l’être pas. C’est par rapport au mariage que se définit la célibataire, qu’elle soit frustrée, révoltée ou même indifférente à l’égard de cette institution. C’est donc par l’analyse du mariage qu’il nous faut poursuivre cette étude. […] La femme essaie quelquefois de lutter. Mais souvent elle accepte bon gré mal gré, telle Nora de Maison de Poupée, que l’homme pense à sa place ; c’est lui qui sera la conscience du couple. Par timidité, par maladresse, par paresse, elle s’en remet à l’homme du soin de forger les opinions communes sur tous les sujets généraux et abstraits. Une femme intelligente, cultivée, indépendante, mais qui avait admiré pendant quinze ans un mari qu’elle jugeait supérieur, me disait avec quel désarroi, après sa mort, elle s’était vue obligée de décider elle-même de ses convictions et de ses conduites : elle essaie encore de deviner ce qu’il eût pensé et résolu en chaque circonstance. Le mari se complaît généralement dans ce rôle de mentor et de chef. Au soir d’une journée où il a connu les difficultés des rapports avec des égaux, la soumission à des supérieurs, il aime se sentir un supérieur absolu et dispenser des vérités incontestées. Il expose les événements du jour, se donne raison contre les adversaires, heureux de trouver en son épouse un double qui le confirme en lui-même ; il commente le journal et les nouvelles politiques, il fait volontiers à sa femme la lecture à haute voix afin que son rapport même avec la culture ne soit pas autonome. Pour étendre son autorité, il exagère à plaisir l’incapacité féminine ; elle accepte plus ou moins docilement ce rôle subordonné. On sait avec quel plaisir étonné des femmes, qui regrettent sincèrement l’absence de leur mari, découvrent en elles-mêmes en cette occasion des possibilités insoupçonnées ; elles gèrent les affaires, élèvent les enfants, décident, administrent sans secours. Elles souffrent quand le retour du mari les voue à nouveau à l’incompétence. »\nSimone de Beauvoir, Le deuxième sexe (1949), tome 2, Chapitre 5, La femme mariée" },
      { id: "t8", partie: "II.a", titre: "II.a — Aristote (384-322 av. J.-C.) – Les actes mixtes (cours)", contenu: "II - L’origine d’un acte volontaire est complexe\n\nTRANSITION\n\n[Problème (je constate une difficulté)] Nous devons donc questionner la mesure du volontaire dans nos actions afin de constater notre degré de servitude dans nos décisions.\n\na) Aristote (384 - 322 av. JC) – Les actes mixtes\n\n[Thèse] Pour Aristote, chacun est responsable de ses vices, ce qui suppose qu'il aurait pu agir autrement s'il l'avait voulu ; il s'agit alors de voir en quoi l'ignorance et la contrainte peuvent nous faire agir contre notre gré.\n\n[Argumentation] L'action volontaire se définit par le plein gré (agir par soi-même, sans contrainte) et la connaissance (agir en connaissance de cause, sans ignorance). Seule l'ignorance excusable, celle dont l'agent n'est pas responsable, rend l'acte involontaire : l'ivrogne ou le négligent, qui se sont eux-mêmes mis dans l'ignorance, restent responsables. Entre les deux existent les actes mixtes : j'agis par mon propre pouvoir, mais sous la pression de circonstances extrêmes (la menace d'un tyran, la tempête qui oblige à jeter la cargaison) ; la responsabilité est alors atténuée, non abolie.\n\n[Citation] Ainsi, « de telles actions sont donc mixtes », mais Aristote ajoute qu'elles ressemblent davantage aux actions volontaires : j'agis bien volontairement, même si je n'aurais jamais choisi cet acte pour lui-même. Ce sont des cas limites, non la condition ordinaire de nos actes.\n\n[Exemple] Sous l'emprise de la colère, je peux me croire libre alors que je suis dominé par un état affectif : la pression n'est plus extérieure (le tyran) mais intérieure. Aristote ne l'excuse pourtant pas : ces actes restent volontaires, car leur principe est en nous.\n\n[Conclusion du paragraphe argumenté] Nous pouvons donc être asservis par ce qui est en nous sans nous en rendre compte, et pourtant en rester responsables : la servitude que l'on se donne à soi-même est masquée, non excusée." },
      { id: "t9", partie: "II.a", titre: "II.a — Aristote – Les actes mixtes (textes)", contenu: "II - L’origine d’un acte volontaire est complexe\n\na) Les actes mixtes\n\nTexte\n « Puisque la vertu a rapport aux passions et aux actions, qu'on loue et blâme ce qui émane de notre volonté, tandis qu'on ne refuse pas son pardon et parfois même sa pitié à ce qui est accompli sans volonté de choix, peut-être est-il nécessaire de déterminer, puisque notre examen porte sur la vertu, ce qui est volontaire et ce qui est involontaire. Du reste, cette étude ne manquera pas d'être utile aussi aux législateurs chargés de fixer les récompenses et les peines. On admet d’ordinaire qu’un acte est involontaire quand il est fait sous la contrainte, ou par ignorance. Est fait par contrainte tout ce qui a son principe hors de nous, c’est-à-dire un principe dans lequel on ne relève aucun concours de l’agent ou du patient : si, par exemple, on est emporté quelque part, soit par le vent, soit par des gens qui vous tiennent en leur pouvoir. Mais pour les actes accomplis par crainte de plus grands maux ou pour quelque noble motif (par exemple, si un tyran nous ordonne d’accomplir une action honteuse, alors qu’il tient en son pouvoir nos parents et nos enfants, et qu’en accomplissant cette action nous assurerions leur salut, et en refusant de la faire, leur mort), pour de telles actions la question est débattue de savoir si elles sont volontaires ou involontaires. C’est là encore ce qui se produit dans le cas d’une cargaison que l’on jette par-dessus bord au cours d’une tempête : dans l’absolu, personne ne se débarrasse ainsi de son bien volontairement, mais quand il s’agit de son propre salut et de celui de ses compagnons, un homme de sens agit toujours ainsi. De telles actions sont donc mixtes, tout en ressemblant plutôt à des actions volontaires, car elles sont librement choisies au moment où on les accomplit, et la fin de l’action varie avec les circonstances de temps. On doit donc, pour qualifier une action de volontaire ou d’involontaire, se référer au moment où elle s’accomplit. Or ici l’homme agit volontairement, car le principe qui, en de telles actions, meut les parties instrumentales de son corps, réside en lui, et les choses dont le principe est en l’homme même, il dépend de lui de les faire ou de ne pas les faire. Volontaires sont donc les actions de ce genre, quoique dans l’absolu elles soient peut-être involontaires, puisque personne ne choisirait jamais une pareille action en elle-même.\n\n[...] Étant donné que ce qui est fait sous la contrainte ou par ignorance est involontaire, l'acte volontaire semblerait être ce dont le principe réside dans l'agent lui-même connaissant les circonstances particulières au sein desquelles son action se produit. »\nAristote, Ethique à Nicomque1 III,1 et 2, 1109b35-1111a2, tr. fr. J. Tricot, éd. Vrin, pp. 119-124." },
      { id: "t10", partie: "II.b", titre: "II.b — André Gide (1869-1951) L’acte gratuit (cours)", contenu: "II - L’origine d’un acte volontaire est complexe\n\nb) André Gide (1869-1951) L’acte gratuit\n\n[Thèse] L'acte gratuit serait la preuve irréfutable de notre liberté : c'est la thèse que met en acte Lafcadio, héros des Caves du Vatican d'André Gide.\n\n[Argumentation de la thèse] Un acte gratuit est le fait d'agir en dehors de toute raison ou motivation, comme pour se prouver à soi-même que rien ne peut nous entraver : agir sans raison, sans cause, de la façon la plus imprévisible possible, semble démontrer que je ne suis esclave de rien ni de personne, pas même de mes propres désirs ou de mes habitudes.\n\n[Exemple] Lafcadio tue Fleurissoire sans raison, remettant même son acte au hasard de la présence d'un feu dans la nuit.\n\n[Contre-argument] Mais l'absence de motif n'est qu'apparente : le besoin d'agir librement, sans contrainte, est déjà la raison de l'acte, et un geste purement gratuit n'est pas possible. En voulant prouver qu'il est libre, il rend son acte dépendant de ce besoin de preuve, et il confond la liberté avec l'absence de raisons.\n\n[Conclusion de l'objection] Vouloir agir sans motif est déjà un motif : l'acte gratuit n'est qu'un leurre. Ce qui devait prouver la liberté de Lafcadio révèle au contraire sa servitude : en voulant prouver qu'il n'est esclave de rien, il devient esclave du désir même de le prouver, désir dont il n'a pas conscience. On peut donc être esclave de soi-même, de ses propres désirs, sans le savoir : l'origine d'un acte volontaire est plus complexe qu'il n'y paraît. La liberté ne consiste donc pas à agir sans raison, mais à connaître celles qui nous font agir." },
      { id: "t11", partie: "II.b", titre: "II.b — Gide – L’acte gratuit (textes)", contenu: "II - L’origine d’un acte volontaire est complexe\n\nb) L’acte gratuit\n\nTexte\n « Le train longeait alors un talus, qu'on voyait à travers la vitre, éclairé par cette lumière de chaque compartiment projeté ; cela formait une suite de carrés clairs qui dansaient le long de la voie et se déformaient tour à tour selon chaque accident du terrain. On apercevait au milieu de l'un d'eux, danser l'ombre falote de Fleurissoire ; les autres carrés étaient vides. — Qui le verrait ? pensait Lafcadio. Là, tout près de ma main, sous ma main, cette double fermeture, que je peux faire jouer aisément ; cette porte qui, cédant tout à coup, le laisserait crouler en avant ; une petite poussée suffirait ; il tomberait dans la nuit comme une masse ; même on n'entendrait pas un cri... Et demain, en route pour les îles !... Qui le saurait ? […] — Un crime immotivé, continuait Lafcadio : quel embarras pour la police ! Au demeurant, sur ce sacré talus, n'importe qui peut, d'un compartiment voisin, remarquer qu'une portière s'ouvre, et voir l'ombre du Chinois cabrioler. Du moins les rideaux du couloir sont tirés... Ce n'est pas tant des événements que j'ai curiosité, que de moi-même. Tel se croit capable de tout, qui, devant que d'agir, recule... Qu'il y a loin, entre l'imagination et le fait !... Et pas plus le droit de reprendre son coup qu'aux échecs. Bah ! qui prévoirait tous les risques, le jeu perdrait tout intérêt !... Entre l'imagination d'un fait et... Tiens ! le talus cesse. Nous sommes sur un pont, je crois ; une rivière... — Là, sous la main, cette double fermeture — tandis qu'il est distrait et regarde au loin devant lui — joue, ma foi ! plus aisément encore qu'on eût cru. Si je puis compter jusqu'à douze, sans me presser, avant de voir dans la campagne quelque feu, le tapir est sauvé. Je commence : Une ; deux ; trois ; quatre ; (lentement ! lentement !) cinq ; six ; sept ; huit ; neuf... Dix, un feu... »\nAndré Gide, Les caves du Vatican, 1914" },
      { id: "t12", partie: "II.c", titre: "II.c — Descartes (1596-1650) – La liberté d’indifférence (cours)", contenu: "II - L’origine d’un acte volontaire est complexe\n\nc) Descartes (1596-1650) – La liberté d’indifférence\n\n[Thèse] Pour Descartes, celui qui agit librement est celui qui agit avec raison : plus sa raison est éclairée, plus grande est sa liberté.\n\n[Argumentation] La liberté d'indifférence est l'état d'une volonté que rien dans l'entendement ne détermine, faute de raisons claires : c'est le plus bas degré de la liberté, signe d'un défaut de connaissance. L'erreur elle-même naît de ce que ma volonté, infinie, va au-delà de mon entendement, fini : je juge sans concevoir clairement. À l'inverse, lorsque je comprends les raisons de mon choix, ma liberté devient plus forte : être libre, c'est pouvoir donner ou refuser son assentiment à ce que la raison me présente comme vrai ou bon. Il semble alors que je me détermine naturellement vers le bien dès que je le connais clairement.\n\n[Objection — Citation] Mais Ovide objecte, dans Les Métamorphoses : « le meilleur parti je le vois et je l'approuve mais je choisis le pire¹ » Je peux reconnaître ce qui est mauvais pour moi et pourtant le vouloir : c'est la faiblesse de la volonté, qui montre que la connaissance du bien ne suffit pas à déterminer la volonté.\n\n[Exemple] Ainsi du paquet de cigarettes : je lis « Fumer tue ! » et je sais que c'est vrai, mais je n'arrive pas à m'en détacher — un savoir abstrait ne pèse pas face à un désir ou une habitude présents.\n\n[Conclusion de l'argumentation] La connaissance est donc nécessaire mais non suffisante : on n'est pas plus libre avec moins de raisons d'agir, mais en comprenant mieux celles qui nous guident. Reste alors à savoir si je suis esclave de mes passions, ou de ma raison si être libre, c'est lui obéir. uideo meliora proboque, deteriora sequor" },
      { id: "t13", partie: "II.c", titre: "II.c — Descartes (1596-1650) – La Liberté d’indifférence, une liberté illusoire ? (textes)", contenu: "II - L’origine d’un acte volontaire est complexe\n\nc) Descartes (1596-1650) – La Liberté d’indifférence, une liberté illusoire ?\n\nTexte\n « Car elle\n\n[la volonté] consiste seulement en ce que nous pouvons faire une chose ou ne la faire pas, (c’est-à-dire affirmer ou nier, poursuivre ou fuir) ou plutôt seulement en ce que pour affirmer ou nier, poursuivre ou fuir les choses que l’entendement nous propose, nous agissons en telle sorte que nous ne sentons point qu’aucune force extérieure nous y contraigne. Car, afin que je sois libre, il n’est pas nécessaire que je sois indifférent à choisir l’un ou l’autre des deux contraires, mais plutôt d’autant plus que je penche vers l’un, soit que je connaisse évidemment que le bien et le vrai s’y rencontrent, soit que Dieu dispose ainsi l’intérieur de ma pensée, d’autant plus librement j’en fais choix et je l’embrasse : Et certes la grâce divine et la connaissance naturelle, bien loin de diminuer ma liberté, l’augmentent plutôt et la fortifient. De façon que cette indifférence que je sens, lorsque je ne suis point emporté vers un côté plutôt que vers un autre par le poids d’aucune raison, est le plus bas degré de liberté, et fait plutôt paraître un défaut dans la connaissance, qu’une perfection dans la volonté ; car si je connaissais toujours clairement ce qui est vrai, et ce qui est bon, je ne serais jamais en peine de délibérer quel jugement, et quel choix je devrais faire ; et ainsi je serais entièrement libre, sans jamais être indifférent. »\nDescartes, Méditations métaphysiques, IV" },
      { id: "t14", partie: "III.a", titre: "III.a — Spinoza (1632-1677) – La prétendue liberté humaine (cours)", contenu: "III – Le déterminisme est un défi pour la liberté\n\na) Spinoza (1632-1677) – La prétendue liberté humaine\n\n[Transition (je constate une difficulté)] Pour avancer, introduisons le concept de déterminisme, qui désigne la relation nécessaire entre une cause et son effet. Dès lors, on peut se demander si tout le réel, y compris nos choix apparemment libres, est régi par ce lien causal. Chaque élément dépendrait invariablement d’autres, au point d’être prévisible. Serions-nous alors nous-mêmes esclaves de ce déterminisme ?\n\na) Spinoza (1632-1677) – La prétendue liberté humaine\n\n[Thèse] Pour Spinoza, la croyance au libre arbitre est une illusion qui a elle-même une cause : l’ignorance de ce qui nous détermine.\n\n[Argumentation] En effet, toute chose singulière est déterminée par une autre à exister et à agir de façon précise : elle est alors « contrainte » et non libre, car n’est libre que ce qui agit par la seule nécessité de sa propre nature. L’homme, pareil à la pierre qu’on lance, n’échappe pas à cette loi ; la seule différence est qu’il a conscience de ce qu’il fait et croit donc agir librement. Faut-il renoncer à toute liberté ? Il faut faire le deuil du libre arbitre, mais la liberté peut se concevoir autrement : elle ne s’oppose pas à la nécessité, elle s’oppose à la contrainte. Est libre celui qui agit à partir de sa propre nature, ce qui suppose de comprendre ce qui le détermine.\n\n[Exemple] Prenons l’élève qui croit choisir librement la musique qu’il écoute : le sentiment de choisir est bien réel, mais ce goût a des causes qu’il ignore (ses amis, son milieu, ses habitudes).\n\n[Citation] Spinoza l’écrit dans l’Éthique : « Les hommes se trompent en ce qu’ils se croient libres ; et cette opinion consiste en cela seul qu’ils ont conscience de leurs actions et sont ignorants des causes par où ils sont déterminés ; ce qui constitue donc leur idée de la liberté, c’est qu’ils ne connaissent aucune cause de leurs actions. » Ignorant les causes qui pèsent sur lui, l’homme croit qu’elles n’existent pas.\n\n[Conclusion de l’argumentation] Être libre, c’est donc se défaire du préjugé du libre arbitre et comprendre les causes de nos actes : on cesse alors de subir passivement nos passions et on accroît notre puissance d’agir. On n’est donc pas esclave de soi-même, mais des causes extérieures qui agissent à travers nos passions." },
      { id: "t15", partie: "III.a", titre: "III.a — Spinoza (1632-1677) - La prétendue liberté humaine (textes)", contenu: "III – Le déterminisme est un défi pour la liberté\n\na) Spinoza (1632-1677) - La prétendue liberté humaine\n\nTexte\n « J’appelle libre, quant à moi, une chose qui est et agit par la seule nécessité de sa nature ; contrainte, celle qui est déterminée par une autre à exister et à agir d’une certaine façon déterminée. […] Vous le voyez bien, je ne fais pas consister la liberté dans un libre décret, mais dans une libre nécessité. Mais descendons aux choses créées qui sont toutes déterminées à exister et à agir d’une certaine façon déterminée. Pour rendre cela clair et intelligible, concevons une chose très simple: une pierre par exemple reçoit d’une cause extérieure qui la pousse, une certaine quantité de mouvement et, l’impulsion de la cause extérieure venant à cesser, elle continuera à se mouvoir nécessairement. Cette persistance de la pierre dans son mouvement est une contrainte, non parce qu’elle est nécessaire, mais parce qu’elle doit être définie par l’impulsion d’une cause extérieure. Et ce qui est vrai de la pierre il faut l’entendre de toute chose singulière, quelle que soit la complexité qu’il vous plaise de lui attribuer, si nombreuses que puissent être ses aptitudes, parce que toute chose singulière est nécessairement déterminée par une cause extérieure à exister et à agir d’une certaine manière déterminée. Concevez maintenant, si vous voulez bien, que la pierre, tandis qu’elle continue de se mouvoir, pense et sache qu’elle fait effort, autant qu’elle peut, pour se mouvoir. Cette pierre assurément, puisqu’elle a conscience de son effort seulement et qu’elle n’est en aucune façon indifférente, croira qu’elle est très libre et qu’elle ne persévère dans son mouvement que parce qu’elle le veut. Telle est cette liberté humaine que tous se vantent de posséder et qui consiste en cela seul que les hommes ont conscience de leurs appétits\n\n[désirs] et ignorent les causes qui les déterminent. »\nSpinoza, Lettre à Schuller, 1675" },
      { id: "t16", partie: "III.b", titre: "III.b — Kant (1724-1804) – Liberté et loi morale (cours)", contenu: "III – Le déterminisme est un défi pour la liberté\n\nb) Kant (1724-1804) – Liberté et loi morale\n\n[Problème] Peut-on concilier l’idée qu’il y a du déterminisme et néanmoins que l’homme est libre, et donc qu’on peut lui imputer la responsabilité de ses actes ?\n\n[Thèse] À travers la situation d’un homme qui ment, Kant veut montrer que je peux être à l’origine d’une décision et non l’esclave d’une concaténation, c’est-à-dire d’un enchaînement de faits suivant la causalité (Larousse).\n\n[Argumentation] En effet, quand on cherche l’origine de ce mensonge, on lui cherche des causes (éducation, caractère, entourage), comme le savant qui, pour rendre les faits intelligibles, postule que « tout fait a une cause » et que « les mêmes causes produisent les mêmes effets ». Si l’on s’en tenait à ce seul point de vue, il serait absurde de juger moralement l’acte : ce qui relève d’une nécessité naturelle se constate, mais ne se blâme pas. Or le blâme et la louange présupposent que l’auteur aurait pu agir autrement, donc qu’il est libre. Kant concilie les deux en distinguant l’homme comme être de la nature, soumis à la causalité, et l’homme comme être raisonnable, capable de se donner à lui-même une loi : ces deux points de vue ne se contredisent pas.\n\n[Exemple] Le médecin aux urgences ressent le besoin biologique de dormir, effet de causes naturelles ; pourtant il résiste à cette inclination parce que son devoir est de sauver des vies.\n\n[Conclusion de l’argumentation] Selon Kant, je peux donc me donner à moi-même une règle d’action qui ne vient pas de mes inclinations : cette autonomie préserve la liberté. En tant qu’être naturel, je reste soumis au déterminisme ; en tant qu’être raisonnable, je peux agir par devoir et non par simple impulsion." },
      { id: "t17", partie: "III.b", titre: "III.b — Kant (1724-1804) – Liberté et loi morale (textes)", contenu: "III – Le déterminisme est un défi pour la liberté\n\nb) Kant (1724-1804) – Liberté et loi morale\n\nTexte\n « Supposons que quelqu'un affirme, en parlant de son penchant au plaisir, qu'il lui est tout à fait impossible d'y résister quand se présente l'objet aimé et l’occasion : si, devant la maison où il rencontre cette occasion, une potence était dressée pour l'y attacher aussitôt qu'il aurait satisfait sa passion, ne triompherait-il pas alors de son penchant ? On ne doit pas chercher longtemps ce qu'il répondrait. Mais demandez-lui si, dans le cas où son prince lui ordonnerait, en le menaçant d'une mort immédiate, de porter un faux témoignage contre un honnête homme qu'il voudrait perdre sous un prétexte plausible, il tiendrait comme possible de vaincre son amour pour la vie, si grand qu'il puisse être. Il n'osera peut-être assurer qu'il le ferait ou qu'il ne le ferait pas, mais il accordera sans hésiter que cela lui est possible. Il juge donc qu'il peut faire une chose, parce qu'il a conscience qu'il doit la faire et il reconnaît ainsi en lui la liberté qui, sans la loi morale, lui serait restée inconnue. »\nKant, Critique de la raison pratique, 1788\n\nTexte\n « Qu’on prenne un acte volontaire, par exemple un mensonge pernicieux, par lequel un homme a introduit un certain désordre dans la société, dont on recherche d’abord les raisons déterminantes, qui lui ont donné naissance, pour juger ensuite comment il peut lui être imputé avec toutes ses conséquences. Sous le premier point de vue, on pénètre le caractère empirique de cet homme jusque dans ses sources que l’on recherche dans la mauvaise éducation, dans les mauvaises fréquentations, en partie aussi dans la méchanceté d’un naturel insensible à la honte, qu’on attribue en partie à la légèreté et à l’inconsidération, sans négliger les circonstances tout à fait occasionnelles qui ont pu influer. Dans tout cela, on procède comme on le fait, en général, dans la recherche de la série des causes déterminantes d’un effet naturel donné. Or, bien que l’on croie que l’action soit déterminée par-là, on n’en blâme pas moins l’auteur et cela, non pas à cause de son mauvais naturel, non pas à cause des circonstances qui ont influé sur lui, et non pas même à cause de sa conduite passée ; car on suppose qu’on peut laisser tout à fait de côté ce qu’a été cette conduite et regarder la série écoulée des conditions comme non avenue, et cette action comme entièrement inconditionnée par rapport à l’état antérieur, comme si l’auteur commençait absolument avec elle une série de conséquences. Ce blâme se fonde sur une loi de la raison où l’on regarde celle-ci comme une cause qui a pu et a dû déterminer autrement la conduite de l’homme indépendamment de toutes les conditions empiriques nommées. Et on n’envisage pas la causalité de la raison, pour ainsi dire, simplement comme concomitante, mais au contraire, comme complète en soi, quand même les mobiles sensibles ne seraient pas du tout en sa faveur et qu’ils lui seraient tout à fait contraires ; l’action est attribuée au caractère intelligible de l’auteur ; il est entièrement coupable à l’instant où il ment ; par conséquent, malgré toutes les conditions empiriques de l’action la raison était pleinement libre, et cet acte doit être attribué entièrement à sa négligence ». Kant, Critique de la raison pure1 1781 (2°édition 1787).PUF. Trad.Tremesaygues et Pacaud. p.405." },
      { id: "t18", partie: "III.c", titre: "III.c — Sartre (1905-1980) - La liberté est une condamnation (cours)", contenu: "III – Le déterminisme est un défi pour la liberté\n\nc) Sartre (1905-1980) - La liberté est une condamnation\n\n[Constat] Être confronté à la liberté, c’est être face à un problème : soit je suis déterminé dans mes choix (Spinoza), soit je peux être le premier élément déterminant d’une décision (Kant).\n\n[Thèse] On peut sortir de cette impasse en posant que la liberté n’est pas un élément extérieur à moi, mais la matière même de mon être : je suis libre ou je ne suis pas.\n\n[Citation] Sartre l’affirme dans L’existentialisme est un humanisme : « l’homme est condamné à être libre ». Condamné, parce qu’il ne s’est pas créé lui-même ; libre, parce que, jeté dans le monde, il est responsable de tout ce qu’il fait. Je ne peux donc pas me soustraire à ma liberté : même refuser de choisir est un choix. Certaines situations semblent la limiter, mais ce qui est obstacle ou aide ne se comprend qu’en fonction des fins vers lesquelles je me projette.\n\n[Exemple] En randonnée, un rocher m’apparaît comme un empêchement si je veux le déplacer, mais il est une aide précieuse si je veux l’escalader pour contempler le panorama : c’est par moi que surgit ce que Sartre appelle le « coefficient d’adversité » des choses.\n\n[Arguments] Le coupe-papier est fabriqué à partir d’un concept préalable : son essence précède son existence, et il ne peut être autre chose qu’un coupe-papier. L’homme, lui, n’a pas d’essence préalable : il existe d’abord, puis se définit par ses choix et se pense comme projet plutôt que comme le résultat de son passé. Rien ne définit d’avance ce que nous serons : cette absence d’essence, que Sartre nomme « néant », rend notre liberté possible.\n\n[Conclusion du paragraphe] Il est donc absurde de dire que nous sommes esclaves de nous-mêmes : « L’homme ne saurait être tantôt libre et tantôt esclave : il est tout entier et toujours libre ou il n’est pas » (L’Être et le Néant). On peut seulement se le cacher en prétendant être déterminé : c’est ce que Sartre appelle la mauvaise foi." },
      { id: "t19", partie: "III.c", titre: "III.c — Sartre (1905-1980) – La liberté est une condamnation (textes)", contenu: "III – Le déterminisme est un défi pour la liberté\n\nc) Sartre (1905-1980) – La liberté est une condamnation\n\nTexte\n « Le coupe-papier est à la fois un objet qui se produit d'une certaine manière et qui, d'autre part, a une utilité définie ; et on ne peut pas supposer un homme qui produirait un coupe-papier sans savoir à quoi l'objet va servir. Nous dirons donc que, pour le coupe-papier, l’essence c’est-à-dire l'ensemble des recettes et des qualités qui permettent de le produire et de le définir - précède l'existence, et ainsi la présence, en face de moi, de tel coupe-papier ou de tel livre est déterminé. Nous avons donc là une vision technique du monde, dans laquelle on peut dire que la production précède l'existence. Lorsque nous concevons un Dieu créateur, ce Dieu est assimilé la plupart du temps à un artisan supérieur, et quelle que soit la doctrine que nous considérions, qu'il s'agisse d'une doctrine comme celle de Descartes ou de la doctrine de Leibniz, nous admettons toujours que la volonté suit plus ou moins l'entendement, ou tout au moins l'accompagne, et que Dieu, lorsqu'il crée, sait précisément ce qu'il crée. Ainsi, le concept d'homme, dans l'esprit de Dieu, est assimilable au concept de coupe papier dans l'esprit de l'industriel. L'existentialisme athée, que je représente, est plus cohérent. Il déclare que si Dieu n'existe pas, il y a au moins un être chez qui l'existence précède l'essence, un être qui existe avant de pouvoir être défini par aucun concept et que cet être c'est l'homme ou, comme dit Heidegger, la réalité humaine. Qu'est-ce que signifie ici que l'existence précède l’essence ? Cela signifie que l'homme existe d'abord, se rencontre, surgit dans le monde, et qu'il se définit après. L'homme, tel que le conçoit l'existentialiste, s'il n'est pas définissable, c'est qu'il n'est d'abord rien. Il ne sera qu'ensuite, et il sera tel qu'il se sera fait. Ainsi, il n'y a pas de nature humaine, puisqu'il n'y a pas de Dieu pour la concevoir. L'homme est seulement, non seulement tel qu'il se conçoit, mais tel qu'il se veut, et comme il se conçoit après l'existence, comme il se veut après cet élan vers l’existence ; l'homme n'est rien d'autre que ce qu'il se fait ». Jean-Paul Sartre, L'existentialisme est un humanisme (1946), Éd. Nagel 1970, pp; 17-24" },
      { id: "t20", partie: "Conclusion", titre: "Conclusion", contenu: "Conclusion\n\nMéthode : Dans une conclusion, nous résumons les différentes idées de notre devoir. Limitez-vous à une phrase par partie, donc votre conclusion peut n’être composée que de … trois phrases ! Il n’est pas nécessaire de faire plus long. Conseil très important : Il n’est pas conseillé de faire une ouverture en fin de conclusion.\n\n[Partie I] A l’issue de cette analyse, nous avons pu voir que le clivage qui semble ancré entre la servitude et la volonté propre est en réalité fallacieux, car l’action volontaire, comme l’action involontaire, peut être le sujet d’un consentement et d’un asservissement intérieurs qui troublent l’efficacité de nos intentions.\n\n[Partie II] Cependant, si la liberté peut sembler volontaire, elle se fait également plus ambiguë car il existe des niveaux de servitude qui impliquent une liberté illusoire, objet de cause et d’effets : l’individu voit alors son indépendance reposer sur ses capacités de délibération et d’entendement.\n\n[Partie III] Cependant, si nous considérons que ce que nous sommes, ce que dont nous sommes faits est la liberté même, nous comprenons que l’humain est parfois esclave de sa propre liberté et donc de lui-même car il est condamné à choisir sa vie." }
    ],
  },
];

// Les niveaux de révision : chacun a sa carte sur l'accueil et ses propres séances
export type Niveau = "hlp1" | "tle";
export const NIVEAUX: Record<Niveau, { key: string; titre: string; court: string; public: string; prof: string; defaults: Seance[] }> = {
  hlp1: {
    key: "cours_hlp1",
    titre: "Spécialité HLP — Première",
    court: "HLP Première",
    public: "un élève de Première, spécialité HLP (Humanités, Littérature et Philosophie)",
    prof: "professeur de HLP",
    defaults: DEFAULT_SEANCES_HLP1,
  },
  tle: {
    key: "cours_tle",
    titre: "Philosophie — Terminale générale (tronc commun)",
    court: "Philosophie Terminale",
    public: "un élève de Terminale générale, en philosophie (tronc commun)",
    prof: "professeur de philosophie",
    defaults: DEFAULT_SEANCES_TLE,
  },
};

// Séances enregistrées + séances fournies avec le site qui n'y sont pas encore
// (sauf celles que le professeur a supprimées : leur id est gardé dans « retirees »).
const retirees: Record<string, string[]> = {};
export async function loadSeances(niveau: Niveau): Promise<Seance[]> {
  const N = NIVEAUX[niveau];
  try {
    const { data } = await supabase.from("config").select("value").eq("key", N.key).maybeSingle();
    if (!data?.value) { retirees[niveau] = []; return N.defaults; }
    const v = JSON.parse(data.value);
    retirees[niveau] = Array.isArray(v?.retirees) ? v.retirees : [];
    const saved: Seance[] = Array.isArray(v?.seances) ? v.seances : [];
    const ids = new Set(saved.map((s) => s.id));
    return [...saved, ...N.defaults.filter((d) => !ids.has(d.id) && !retirees[niveau].includes(d.id))];
  } catch { return N.defaults; }
}
async function saveSeances(niveau: Niveau, seances: Seance[], retireesMaj: string[]) {
  const { error } = await supabase.from("config").upsert({ key: NIVEAUX[niveau].key, value: JSON.stringify({ seances, retirees: retireesMaj }) }, { onConflict: "key" });
  if (error) throw error;
  retirees[niveau] = retireesMaj;
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

const coursTexte = (s: Seance, max = 45000) =>
  s.docs.map((d) => `### ${d.titre}\n${d.contenu}`).join("\n\n").slice(0, max);
const norm = (t: string) => t.toLowerCase().replace(/[«»"“”'’]/g, "").replace(/\[\s*(\.\.\.|…)\s*\]/g, " ").replace(/\s+/g, " ").trim();

// ═════════════════════════════════════════════════════════════════════════════
// CÔTÉ ÉLÈVE
// ═════════════════════════════════════════════════════════════════════════════
export function CoursRevisionEleve({ niveau, askAI, onBack, eleveNom }: { niveau: Niveau; askAI: AskAI; onBack: () => void; eleveNom?: string }) {
  const N = NIVEAUX[niveau];
  const [seances, setSeances] = useState<Seance[] | null>(null);
  const [sid, setSid] = useState<string>("");
  const [partie, setPartie] = useState<string>("");
  const [tab, setTab] = useState<"cours" | "chat" | "quiz" | "citation">("chat");

  useEffect(() => {
    loadSeances(niveau).then((s) => { setSeances(s); if (s.length === 1) setSid(s[0].id); });
  }, []);

  const seanceComplete = seances?.find((s) => s.id === sid) || null;
  // Parties de la séance (Introduction, I.a, I.b…) : l'élève peut réviser une partie seulement
  const parties = useMemo(() => {
    const out: string[] = [];
    (seanceComplete?.docs || []).forEach((d) => { const p = (d.partie || "").trim(); if (p && !out.includes(p)) out.push(p); });
    return out;
  }, [seanceComplete]);
  const seance = useMemo(() => {
    if (!seanceComplete || !partie) return seanceComplete;
    const docs = seanceComplete.docs.filter((d) => (d.partie || "").trim() === partie);
    return { ...seanceComplete, titre: `${seanceComplete.titre} — partie ${partie}`, docs };
  }, [seanceComplete, partie]);
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
            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">{N.titre}</p>
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
              onChange={(e) => { setSid(e.target.value); setPartie(""); }}
              className="mt-1.5 w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm font-semibold text-gray-800 focus:border-emerald-400 focus:outline-none bg-white">
              <option value="">Choisis une séance…</option>
              {groupes.map(([g, list]) => (
                <optgroup key={g} label={g}>
                  {list.map((s) => <option key={s.id} value={s.id}>{s.titre}</option>)}
                </optgroup>
              ))}
            </select>
            {seanceComplete && <p className="text-xs text-gray-500 mt-2">{seanceComplete.semestre} · {seanceComplete.theme} · {seanceComplete.docs.length} document{seanceComplete.docs.length > 1 ? "s" : ""}</p>}
            {parties.length > 1 && (
              <div className="mt-3">
                <label className="text-xs font-black uppercase tracking-widest text-gray-500">Partie à réviser</label>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {["", ...parties].map((p) => (
                    <button key={p || "tout"} onClick={() => setPartie(p)}
                      className={`text-xs font-bold px-3 py-1.5 rounded-full border transition-all ${partie === p ? "bg-emerald-600 border-emerald-600 text-white" : "bg-white border-gray-200 text-gray-600 hover:border-emerald-300"}`}>
                      {p || "Tout le cours"}
                    </button>
                  ))}
                </div>
              </div>
            )}
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
            {tab === "cours" && <LeCours key={seance.id + partie} seance={seance} />}
            {tab === "chat" && <TuteurChat key={seance.id + partie} seance={seance} askAI={askAI} eleveNom={eleveNom} niveau={niveau} />}
            {tab === "quiz" && <QuizSeance key={seance.id + partie} seance={seance} askAI={askAI} niveau={niveau} />}
            {tab === "citation" && <CitationExercice key={seance.id + partie} seance={seance} askAI={askAI} niveau={niveau} />}
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

function TuteurChat({ seance, askAI, eleveNom, niveau }: { seance: Seance; askAI: AskAI; eleveNom?: string; niveau: Niveau }) {
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prenom = (eleveNom || "").trim().split(/\s+/)[0];

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [messages, loading]);

  const contexte = `Tu es le tuteur de révision d'${NIVEAUX[niveau].public}.
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

function QuizSeance({ seance, askAI, niveau }: { seance: Seance; askAI: AskAI; niveau: Niveau }) {
  const [quiz, setQuiz] = useState<QCM[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [qi, setQi] = useState(0);
  const [pick, setPick] = useState<number | null>(null);
  const [score, setScore] = useState(0);

  const generer = async () => {
    setLoading(true); setErr(""); setQuiz(null); setQi(0); setPick(null); setScore(0);
    try {
      const x = await askJSON(askAI, `Voici le cours d'une séance (${NIVEAUX[niveau].titre}) : « ${seance.titre} ».

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

function CitationExercice({ seance, askAI, niveau }: { seance: Seance; askAI: AskAI; niveau: Niveau }) {
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
      const x = await askJSON(askAI, `Voici le cours d'une séance (${NIVEAUX[niveau].titre}) : « ${seance.titre} ».

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
      const c = await askJSON(askAI, `Tu es ${NIVEAUX[niveau].prof} et tu corriges l'explication de citation d'${NIVEAUX[niveau].public}.

Cours de référence (séance « ${seance.titre} ») :
${coursTexte(seance, 20000)}

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
export function ProfCoursRevision({ extractFile }: { extractFile: (f: File) => Promise<string> }) {
  const [niveau, setNiveau] = useState<Niveau>("hlp1");
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {(Object.keys(NIVEAUX) as Niveau[]).map((n) => (
          <button key={n} onClick={() => setNiveau(n)}
            className={`text-xs font-bold px-4 py-2 rounded-xl border-2 transition-all ${niveau === n ? "bg-emerald-600 border-emerald-600 text-white" : "bg-white border-gray-200 text-gray-700 hover:border-emerald-300"}`}>
            {NIVEAUX[n].titre}
          </button>
        ))}
      </div>
      <ProfCoursNiveau key={niveau} niveau={niveau} extractFile={extractFile} />
    </div>
  );
}

function ProfCoursNiveau({ niveau, extractFile }: { niveau: Niveau; extractFile: (f: File) => Promise<string> }) {
  const N = NIVEAUX[niveau];
  const [seances, setSeances] = useState<Seance[] | null>(null);
  const [sel, setSel] = useState<string>("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [importing, setImporting] = useState(false);
  const [retireesMaj, setRetireesMaj] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadSeances(niveau).then((s) => { setSeances(s); setSel(s[0]?.id || ""); setRetireesMaj(retirees[niveau] || []); }); }, [niveau]);

  const seance = seances?.find((s) => s.id === sel) || null;
  const update = (fn: (s: Seance) => Seance) => {
    setSeances((all) => (all || []).map((s) => (s.id === sel ? fn(s) : s)));
    setDirty(true); setMsg("");
  };

  const ajouterSeance = () => {
    const s: Seance = { id: uid(), semestre: seance?.semestre || "", theme: seance?.theme || "", titre: "Nouvelle séance", docs: [] };
    setSeances([...(seances || []), s]); setSel(s.id); setDirty(true);
  };
  const supprimerSeance = () => {
    if (!seance || !confirm(`Supprimer la séance « ${seance.titre} » et ses documents ?`)) return;
    const rest = (seances || []).filter((s) => s.id !== sel);
    if (N.defaults.some((d) => d.id === sel)) setRetireesMaj((r) => Array.from(new Set([...r, sel])));
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
    try { await saveSeances(niveau, seances, retireesMaj); setDirty(false); setMsg("Enregistré : les élèves voient la nouvelle version."); }
    catch { setMsg("L'enregistrement a échoué. Réessaie."); }
    setSaving(false);
  };

  if (!seances) return <p className="text-sm text-gray-500">Chargement…</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-gray-800">{N.titre}</h2>
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
              {([["semestre", niveau === "tle" ? "Notion" : "Semestre"], ["theme", "Thème / objet d'étude"], ["titre", "Titre de la séance"]] as const).map(([k, l]) => (
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
                  <input value={d.partie || ""} onChange={(e) => update((s) => ({ ...s, docs: s.docs.map((x) => (x.id === d.id ? { ...x, partie: e.target.value } : x)) }))}
                    title="Partie (Introduction, I.a, I.b…) : permet aux élèves de réviser une partie seulement" placeholder="Partie"
                    className="w-24 px-2 py-1.5 border-2 border-gray-200 rounded-lg text-xs font-bold text-center focus:border-emerald-400 focus:outline-none" />
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
