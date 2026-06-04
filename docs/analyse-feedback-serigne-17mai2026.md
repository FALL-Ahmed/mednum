# Analyse du feedback client — Serigne (17/05/2026)

---

## Point 1 — Abonnement par matière ou par chapitre

**Ce qu'il dit :** proposer des abonnements séparés selon les besoins (Maths, Sciences...) ou même par chapitre.

**Analyse :**

C'est une approche de monétisation granulaire qui a fait ses preuves. L'idée est que le parent n'achète que ce dont son enfant a besoin. Quelqu'un qui a un enfant fort en Maths mais faible en SVT ne paie que SVT.

**Avantages :**
- Prix d'entrée plus bas → plus d'abonnés
- Sentiment de contrôle pour le parent
- Permet des offres promotionnelles ("essaie SVT gratuit 7 jours")

**Problèmes si on fait ça par chapitre :**
- Un manuel de 1ère AS a 8 à 12 chapitres → 12 abonnements à gérer par élève
- Le parent va être perdu, trop de choix = abandon
- Gestion technique complexe (permissions par chapitre dans Supabase)
- L'enfant va "sauter" les chapitres difficiles → contre-productif

**Recommandation concrète :**
- **Pack matière** = unité d'abonnement (pas le chapitre)
- Exemple de tarification :
  - 1 matière = 150 MRU/mois
  - Pack 3 matières = 350 MRU/mois (remise)
  - Tout le niveau = 500 MRU/mois
- Les chapitres sont débloqués progressivement À L'INTÉRIEUR de l'abonnement matière (voir point 3)

**Ce qu'il faut faire dans l'app :**
Aujourd'hui l'admin charge un PDF = un cours. Il faut ajouter la notion de **matière → chapitres → contenu**. C'est une évolution de l'interface admin, pas un changement radical.

---

## Point 2 — Intégrer le fondamental, éviter la généralité

**Ce qu'il dit :** éviter le contenu trop général qui conduit à l'abandon. Se concentrer sur l'essentiel du programme.

**Analyse :**

Il touche un problème fondamental de toutes les apps éducatives. Les apps qui essaient de "tout couvrir" perdent l'utilisateur en 3 jours. Les apps qui vont droit au but du programme officiel gardent l'élève.

**Ce que ça veut dire concrètement :**

L'IA ne doit pas répondre comme un encyclopédiste. Elle doit répondre comme un **prof qui a 20 minutes avant l'examen**. Priorité absolue : les définitions du cours, les exercices types, les questions qui tombent souvent au bac.

**Ce qui est déjà en place dans l'app :**
- RAG = l'IA ne répond QUE sur le manuel chargé, pas sur internet
- Les suggestions à la fin de chaque réponse ramènent à des questions du cours
- Le mode "exercice" génère des exercices basés sur le chapitre actif

**Ce qu'il faut encore améliorer :**
- Quand l'élève pose une question hors programme → l'IA dit clairement "ça c'est pas dans ton cours de 1ère AS, concentre-toi sur..." et ramène au chapitre en cours
- Les réponses doivent finir par **"En résumé, retiens que..."** avec la définition exacte du manuel
- Éviter les réponses trop longues et encyclopédiques → l'élève décroche

**Risque si on ignore ce point :**
Un élève qui demande "c'est quoi un atome" et l'IA lui répond avec un cours de physique quantique → il ferme l'app et ne revient pas.

---

## Point 3 — Maîtrise progressive, déblocage par chapitre

**Ce qu'il dit :** si l'élève n'atteint pas un niveau minimal de compréhension du chapitre 1, il ne peut pas accéder au chapitre 2.

**Analyse :**

C'est le principe du **skill tree** de Duolingo et des jeux vidéo. Très efficace pédagogiquement. L'élève ne peut pas "tricher" en sautant les bases.

**Comment ça marche techniquement :**

Chaque chapitre a un **score de maîtrise** (0 à 100). L'élève accumule des points en :
- Répondant correctement aux quiz du chapitre
- Posant des questions sur le cours (montre qu'il s'engage)
- Obtenant des feedbacks positifs (👍) sur les réponses de l'IA

Quand le score atteint 70/100 → chapitre suivant déverrouillé.

**Ce qu'il faut construire :**
1. Quiz de validation à la fin de chaque chapitre (5 questions générées par l'IA depuis le contenu)
2. Stockage du score par élève et par chapitre dans Supabase
3. UI avec cadenas sur les chapitres non débloqués
4. Badge "Chapitre maîtrisé ✅" une fois débloqué

**Ce qui est déjà dans l'app :**
- Le système XP (points d'expérience) est déjà implémenté
- Le système de feedback (👍/👎) existe
- Il faut juste **connecter ces données à un score de maîtrise par chapitre**

**Risque pédagogique à gérer :**
Certains élèves vont bloquer longtemps sur un chapitre → frustration → abandon. Solution : après 3 tentatives ratées, débloquer quand même avec un message "Ce chapitre est difficile, continue avec le suivant et reviens-y."

---

## Point 4 — Contrôle parental et suivi de l'enfant

**Ce qu'il dit :** contrôler le temps passé dans l'app, aider le parent à suivre l'enfant, éviter qu'il utilise l'app pour autre chose que les cours. Important pour lui en tant qu'administrateur des abonnés.

**Analyse :**

En Mauritanie, le parent est le **vrai décideur qui paye**. Si le parent ne voit pas de résultats, il arrête l'abonnement. Lui donner de la visibilité = fidéliser l'abonnement.

**Deux niveaux de suivi :**

**Niveau 1 — Rapport parent (simple) :**
- Rapport hebdomadaire par WhatsApp ou SMS : "Ahmed a travaillé 3h cette semaine sur SVT. Il a posé 12 questions. Ses points forts : Chapitre 1 ✅. À retravailler : Chapitre 2."
- Tableau de bord web simple (pas d'app supplémentaire) accessible avec un code parent

**Niveau 2 — Suivi admin (pour Serigne) :**
- Dashboard admin (déjà en cours de développement) : voir tous les abonnés, leur activité, quels chapitres bloquent le plus
- Alertes si un élève n'a pas ouvert l'app depuis 5 jours → envoyer un rappel WhatsApp

**Ce qui est déjà dans l'app :**
- Streak (jours consécutifs d'utilisation) ✅
- XP total et XP de la semaine ✅
- Historique des conversations ✅
- Ces données sont dans Supabase → un dashboard parent peut les lire

**Ce qu'il veut dire par "éviter son orientation vers autre chose" :**
Il veut s'assurer que l'enfant ne demande pas à l'IA de faire ses devoirs à sa place ou de parler d'autres sujets. La solution est déjà en partie en place (RAG = réponses limitées au cours), mais il faudra un log des questions posées visible par le parent.

---

## Point 5 — Cibler des classes précises pour le démarrage

**Ce qu'il dit :** ne pas ouvrir à tout le secondaire d'un coup. Commencer par des classes et options ciblées, élargir petit à petit.

**Analyse :**

**Il a 100% raison et c'est la leçon numéro 1 des startups.**

Airbnb a commencé avec une seule ville. Uber avec San Francisco. Trop grand trop vite = mauvaise qualité partout = mauvaise réputation = mort du projet.

**Pourquoi c'est critique en Mauritanie :**
- Les manuels sont différents par option (Science, Lettres, Technique...)
- Chaque matière nécessite des manuels chargés par l'admin
- Le support utilisateur est impossible si tu cibles 50 classes dès le départ

**Plan de lancement recommandé :**

| Phase | Classes | Matières | Délai |
|-------|---------|----------|-------|
| Lancement | 1ère AS Sciences | SVT + Maths | Maintenant |
| Phase 2 | + 2ème AS Sciences | + Physique | Mois 3 |
| Phase 3 | + Terminale | + Français | Mois 6 |
| Phase 4 | Toutes options | Toutes matières | An 1 |

**Bénéfice supplémentaire :**
Les premiers utilisateurs de 1ère AS deviennent des **ambassadeurs**. Ils en parlent à leurs amis en 2ème AS → croissance organique naturelle.

---

## Point 6 — Mode hors connexion

**Ce qu'il dit :** intégrer l'option hors connexion pour pallier aux aléas du réseau en Mauritanie.

**Analyse :**

C'est une contrainte réelle et sérieuse. En Mauritanie, la connexion internet est instable, surtout dans les quartiers populaires et les villes secondaires. Si l'app ne fonctionne qu'en ligne → beaucoup d'élèves ne peuvent pas l'utiliser régulièrement.

**3 niveaux de hors connexion, du plus simple au plus complexe :**

**Niveau 1 — Cache du cours (faisable maintenant) :**
Le contenu du manuel (les chunks de texte) est déjà stocké localement dans l'app (AsyncStorage). Ça veut dire que l'élève peut **lire son cours sans connexion**. Ce qui nécessite internet : l'IA.

**Niveau 2 — Réponses pré-générées (phase 3) :**
Pour chaque chapitre, générer à l'avance les 50 questions les plus fréquentes avec leurs réponses. Les stocker en local. Si l'élève pose une question similaire hors connexion → réponse instantanée depuis le cache. Techniquement faisable, mais long à préparer par matière.

**Niveau 3 — IA locale (très complexe) :**
Faire tourner un petit modèle d'IA (Phi-3 Mini, 2 GB) directement sur le téléphone. Possible techniquement mais nécessite un smartphone récent et 2 GB de stockage. Trop lourd pour le marché mauritanien actuel.

**Recommandation :**
Implémenter le Niveau 1 maintenant (le cours est lisible offline), communiquer clairement que l'IA nécessite une connexion, prévoir le Niveau 2 en phase 3.

---

## Point 7 — Droits d'auteur sur les manuels du Ministère

**Ce qu'il dit :** éviter l'utilisation intégrale des manuels du Ministère pour éviter des réclamations de droits d'auteur. Réfléchir comment utiliser ces manuels sans copie textuelle.

**Analyse :**

**C'est le point le plus important légalement et il a tout à fait raison d'y penser maintenant.**

**La situation juridique :**
Les manuels scolaires du Ministère de l'Éducation Nationale sont des œuvres protégées même quand elles sont financées par l'État. En droit mauritanien (et dans la plupart des pays), les reproduire intégralement sans autorisation est une violation des droits d'auteur.

**Ce qui est dangereux :**
- Charger un PDF complet du manuel dans l'app et le redistribuer
- Afficher des pages entières du manuel à l'élève
- Vendre un service basé sur la copie textuelle

**Ce qui est légalement défendable :**

**Option A — Demande d'autorisation officielle (la plus sûre) :**
Écrire une lettre officielle au Ministère de l'Éducation Nationale mauritanien. Expliquer le projet, l'impact social (accès à l'éducation), proposer un partenariat. Les Ministères accordent souvent des licences gratuites aux EdTech nationales, surtout si le projet aide les élèves des zones défavorisées. Cette démarche protège légalement pour la vie du projet.

**Option B — L'IA reformule, ne copie pas (déjà en place) :**
Ce que l'app fait aujourd'hui est différent d'une copie : l'élève envoie son propre PDF (qu'il possède légalement en tant qu'élève), l'IA lit, comprend et reformule en explications pédagogiques. Ce n'est pas une reproduction textuelle, c'est de la valeur ajoutée. En droit, c'est comme un prof qui lit le manuel et explique autrement — personne ne peut l'interdire.

**Option C — Contenu propre inspiré du programme (long terme) :**
Le programme officiel (les thèmes, les objectifs pédagogiques) est public et libre de droits. Ce qui est protégé c'est le texte exact du manuel. On peut créer des explications originales qui couvrent exactement le même programme sans copier le texte. C'est ce que fait Khan Academy : ils ne copient aucun manuel, ils créent leur propre contenu sur le même programme.

**Ce qu'il faut faire maintenant :**
1. Le modèle actuel (élève charge son propre PDF → IA explique) est défendable légalement
2. L'admin ne doit pas charger des PDFs complets de manuels sur Supabase pour les redistribuer → risque
3. Préparer une lettre de demande d'autorisation au Ministère → sécurité à long terme
4. À terme, commencer à créer des fiches de cours originales en remplacement des manuels scannés

**Résumé du risque :**
- Risque faible aujourd'hui (élève charge son propre PDF)
- Risque élevé si l'admin charge et redistribue les manuels à tous les élèves sans autorisation

---

## Tableau récapitulatif — mis à jour le 04/06/2026

| Point | Priorité | Statut | Notes |
|-------|----------|--------|-------|
| Abonnement par matière | Haute | ⏳ À construire | Phase 2 — pas encore touché |
| Focus fondamental / anti-généralité | Haute | ✅ Avancé | Fiche de révision par chapitre avec "Ce qui tombe en compo" (min 5 questions), RAG strict |
| Déblocage progressif par chapitre | Haute | ✅ Fait | SkillTree complet : score maîtrise 0-100, cadenas, seuil 70%, quiz par chapitre, étoiles |
| Suivi parental + dashboard admin | Haute | ⏳ À construire | Données disponibles dans Supabase (XP, streak, mastery), UI pas encore faite |
| Cibler 1ère AS Sciences au lancement | Immédiat | ✅ En production | App live sur Expo Go, 1ère AS testée |
| Mode hors connexion (niveau 1) | Moyenne | ⏳ À faire | Cours déjà en cache local (AsyncStorage), chat nécessite encore connexion |
| Droits d'auteur — lettre Ministère | Urgent | ⏳ En attente | Risque maîtrisé (élève charge son propre PDF), lettre Ministère pas encore envoyée |

## Fonctionnalités ajoutées depuis le feedback (non prévues initialement)

| Feature | Statut | Impact |
|---------|--------|--------|
| Fiche de révision PDF par chapitre | ✅ Fait | Forte valeur — partageable entre élèves |
| Partage fiche Supabase entre élèves de la même classe | ✅ Fait | Économie de tokens, viralité |
| Auth anonyme Supabase (compte par appareil) | ✅ Fait | Base pour suivi parental futur |
| Écran Profil/Paramètres | ✅ Fait | Nom, école, niveau, mode sombre |
| Streak avec couleurs dynamiques + animation flamme | ✅ Fait | Gamification |
| Dernière activité par matière dans Progression | ✅ Fait | Alerte négligence |
| Carte active pleine largeur dans SkillTree | ✅ Fait | UX élève plus claire |
