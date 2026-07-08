# MedNum — Product Requirements Document
**Version 1.0 — Mai 2026**
**Tagline :** Le prof particulier dans la poche de chaque élève mauritanien
**Statut :** Confidentiel — usage interne uniquement

---

> **Note pour Claude (ou tout lecteur IA) :**
> Ce PRD est en cours d'itération active. Certaines sections sont **validées** (marquées ✅), d'autres sont **à confirmer avec le client** (marquées ⚠️), d'autres encore sont des **hypothèses à challenger** (marquées 🔴). Avant toute modification, pose des questions précises et ciblées. Ne change jamais le nom **Prof Moctar**. Ne change jamais les paiements — ils sont **Bankily, Masrivi, Sedad** (pas Wave, pas Orange Money). Le marché est la **Mauritanie uniquement** pour l'instant.

---

## Table des matières

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement](#2-problem-statement)
3. [Target Users & Personas](#3-target-users--personas-5-personas)
4. [Vision produit & North Star Metric](#4-vision-produit--north-star-metric)
5. [État actuel — Ce qui est construit](#5-état-actuel--ce-qui-est-construit)
6. [Feature Specifications](#6-feature-specifications)
7. [Système de gamification complet](#7-système-de-gamification-complet)
8. [Système de quotas](#8-système-de-quotas-dutilisation)
9. [Modèle de monétisation](#9-modèle-de-monétisation)
10. [Architecture technique](#10-architecture-technique)
11. [Dashboard parent & interface admin](#11-dashboard-parent--interface-admin)
12. [Roadmap par phase](#12-stratégie-de-lancement--roadmap-par-phase)
13. [Métriques de succès](#13-métriques-de-succès)
14. [Risques & Mitigations](#14-risques--mitigations)
15. [Aspects légaux et conformité](#15-aspects-légaux-et-conformité)
16. [Glossaire](#16-glossaire)

---

## 1. Executive Summary

| Dimension | Synthèse |
|---|---|
| **Vision** | Rendre accessible à chaque élève mauritanien — du primaire au lycée, arabophone, francophone ou locuteur de langue nationale — un soutien pédagogique IA personnalisé, disponible 24h/24, adapté à son contexte linguistique et culturel. |
| **Problème résolu (double)** | **(1) SCOLAIRE :** cours particuliers à 1 200–1 300 MRU/mois inaccessibles, classes surchargées (50–80 élèves), aucun outil adaptatif sur les manuels officiels MEN. **(2) LINGUISTIQUE :** la politique d'arabisation et la diversité linguistique (pulaar, soninké, wolof, hassaniya) créent une fracture éducative que MedNum peut combler — architecture multilingue prévue dès la conception. |
| **Marché cible** | **SEGMENT 1 (lancement) :** Classes stratégiques secondaire francophone — 1ère AS Sciences, 3ème (prépa BEPC), Terminale (prépa BAC). Zones urbaines : Nouakchott, Nouadhibou. **SEGMENT 2 (Phase 3) :** Primaire CM1–CM2 avec interface langues nationales. ~600 000 élèves adressables au total. |
| **Business model** | Abonnement mensuel SaaS par matière (freemium → payant) via mobile money mauritanien **(Bankily, Masrivi, Sedad)** ou cash agents. ARPU cible : 500–900 MRU/mois. |
| **North Star Metric** | Questions résolues par élève actif par semaine (objectif : ≥ 15/semaine à M+3). |
| **Lancement stratégique** | Phase 1 : 3 niveaux à fort enjeu examens — 1ère AS Sciences (SVT + Maths), 3ème (prépa BEPC), Terminale (matières scientifiques). Objectif : 300 élèves payants à M+2. |
| **Stack technique** | React Native + Expo / React (admin web) / Supabase / LLM chain : Claude Haiku → Mistral → Gemini → Groq. Architecture i18n multilingue (FR/AR/langues nationales) prévue dès Phase 1. |
| **Avantage compétitif** | Seule solution IA construite sur les manuels officiels du MEN mauritanien, multilingue (FR/AR/langues nationales en Phase 3), adaptée au réseau instable, avec méthode socratique, gamification culturellement ancrée (Prof Moctar) et contrôle parental. |

> **🎯 Positionnement clé :** MedNum ne concurrence pas Google ni Wikipedia. MedNum concurrence le **professeur particulier à domicile**. La promesse : *"Ton prof 24h/24, 7j/7, pour le prix d'une heure de cours particulier par mois"* — disponible en français, en arabe, et demain dans ta langue maternelle.

---

## 2. Problem Statement

### 2.1 Le problème de l'élève (secondaire francophone) ✅

- Pas d'accès à un soutien pédagogique hors des heures de classe (enseignant indisponible, 50–80 élèves par classe).
- Les cours particuliers coûtent 1 200–1 300 MRU/mois pour seulement 2h/semaine — inaccessibles pour la majorité des familles.
- Aucun outil adaptatif basé sur les manuels officiels mauritaniens en langue française.
- L'élève bloque sur un exercice le soir, ne peut pas débloquer, accumule du retard en silence.
- Réseau instable, smartphones mid-range : YouTube et Wikipedia ne suivent pas le programme officiel mauritanien.

### 2.2 Le problème de l'élève (primaire — langues nationales) ⚠️ À confirmer avec client

- Les élèves du primaire (CM1–CM2) apprennent en français et en arabe à l'école, mais parlent pulaar, soninké, wolof ou hassaniya à la maison. L'écart langue maternelle / langue d'enseignement crée des blocages cognitifs précoces.
- La politique d'arabisation progressive de l'État mauritanien crée une transition difficile : certains élèves se retrouvent dans des filières qui ne correspondent pas à leur langue de confort.
- Aucun outil numérique éducatif ne supporte les langues nationales mauritaniennes. Les communautés noires (Halpulaar, Soninké, Wolof) sont totalement exclues des solutions existantes.
- Les parents de la communauté noire perçoivent souvent l'école publique comme un système qui n'est pas conçu pour leurs enfants. Un outil en langue nationale changerait radicalement cette perception.

### 2.3 Le problème du parent ✅

- Le parent paye les cours particuliers sans visibilité sur ce que l'enfant apprend réellement.
- Impossible de suivre la progression scolaire entre deux conseils de classe.
- Le parent arabophone ou locuteur d'une langue nationale ne comprend pas les rapports en français — le rapport doit être multilingue.
- Manque de confiance dans les nouvelles technologies pour l'éducation — besoin de preuve de sérieux et de résultats visibles.
- Le parent en zone péri-urbaine ou rurale utilise Bankily (fonctionnaires), Masrivi (commerçants), Sedad (comptes bancaires) ou des agents cash.

### 2.4 Le problème linguistique & politique — contexte mauritanien ⚠️ À approfondir

| Dimension | Réalité mauritanienne | Impact sur MedNum |
|---|---|---|
| **Politique d'arabisation** | L'État pousse à faire de l'arabe standard la langue principale d'enseignement — mais les lycées scientifiques fonctionnent encore en français. | MedNum doit être neutre : interface FR et AR, sans prendre parti. Architecture bilingue obligatoire dès Phase 2. |
| **Communauté noire (≈30% population)** | Halpulaar, Soninké, Wolof, Bambara — sous-représentés dans tous les outils numériques existants. | Marché inexploré à fort potentiel. Différenciateur majeur si MedNum est le premier à les adresser. |
| **Deux filières secondaires** | Filière française (lycées scientifiques) et filière arabe (enseignement général en arabe standard). | Phase 1 = filière française. Phase 2 = filière arabe (interface RTL complète). |
| **Diaspora et mobilité** | Beaucoup de familles mauritaniennes ont des membres au Sénégal, en France ou dans le Golfe. | Abonnement souscriptible depuis l'étranger (paiement international en Phase 4). |

### 2.5 Le problème de l'admin/commercial ✅

- Aucune plateforme centralisée pour distribuer les contenus pédagogiques officiels de manière interactive.
- Pas de retour en temps réel sur les concepts que les élèves ne comprennent pas.
- La distribution des manuels numériques est fragmentée et non monétisable directement.
- L'admin doit pouvoir gérer deux filières (française / arabe) avec des contenus et des langues d'interface différents, depuis un seul dashboard.

> **💡 Insight stratégique — Les 2 marchés de MedNum :** **MARCHÉ 1 (urgent, lancement) :** Secondaire francophone — fort enjeu examens (BEPC/BAC), parents qui paient déjà des cours particuliers, décision d'achat rapide. **MARCHÉ 2 (différenciateur, Phase 3) :** Primaire multilingue — communautés noires, langues nationales, potentiel unique sur le continent. L'architecture produit doit prévoir le Marché 2 dès maintenant, même si le lancement se concentre sur le Marché 1.

---

## 3. Target Users & Personas (5 Personas)

> **Architecture des personas :** Personas 1 & 2 = marché secondaire (lancement Phase 1). Persona 3 = marché primaire / communauté noire (Phase 3). Personas 4 & 5 = décideurs d'achat et distribution.

---

### Persona 1 — Aminata, 15 ans, 1ère AS Sciences (Nouakchott) ✅

| Attribut | Détail |
|---|---|
| **Situation** | 1ère AS Sciences au lycée Chami, Nouakchott. Communauté maure francophone. Parents fonctionnaires. |
| **Appareil** | Samsung Galaxy A14 (Android), réseau 4G instable le soir dans son quartier. |
| **Langue** | Français principal (enseignement). Comprend hassaniya et arabe standard. Mélanges "darija-français" dans ses messages. |
| **Douleur principale** | Bloque sur les exercices de SVT et de maths le soir — son prof ne répond pas après 20h. |
| **Motivation** | Réussir son BAC S, être dans le top 5 de sa classe, ne pas redoubler. |
| **Habitudes digitales** | WhatsApp, TikTok, YouTube. Utilise abréviations SMS ("c koi", "mafhemtch", "pk"). |
| **Rapport à l'IA** | Curieuse mais méfiante — doit voir que Prof Moctar cite le manuel et ne "raconte pas n'importe quoi". |
| **Facteur de succès** | Prof Moctar bienveillant, méthode socratique (indices avant réponse directe), jamais condescendant. |
| **Risque** | Abandon si l'IA répond hors programme ou de façon trop scolaire/froide. |

---

### Persona 2 — Oumar, 13 ans, 3ème (Nouadhibou) — Communauté Halpulaar ⚠️ À valider

| Attribut | Détail |
|---|---|
| **Situation** | 3ème au CEM El Mina, Nouadhibou. Communauté halpulaar (peul). Père pêcheur, mère commerçante. |
| **Langue maternelle** | Pulaar (peul). Parle français à l'école, hassaniya dans la rue. Peu d'arabe standard. |
| **Douleur principale** | Comprend à moitié les explications en français. Bloque sur les maths à cause de la barrière linguistique, pas du contenu mathématique lui-même. |
| **Motivation** | Réussir le BEPC, première génération de sa famille à passer l'examen national. |
| **Appareil** | Tecno Spark 10C (Android), réseau 3G instable, partage le téléphone avec sa sœur. |
| **Rapport à l'IA** | Très réceptif si Prof Moctar peut alterner français et une phrase en pulaar pour clarifier. Effet "wow" immédiat. |
| **Facteur de succès** | Interface en français MAIS avec glossaire en pulaar pour les termes difficiles. Réponses courtes et claires. |
| **Risque** | Abandon si l'app est perçue comme "pour les Maures" ou "trop compliquée". |
| **Valeur stratégique** | Cœur du marché primaire multilingue Phase 3 — potentiel 200 000+ élèves similaires en Mauritanie. |

---

### Persona 3 — Mariam, 9 ans, CM2 (Rosso) — Primaire, Communauté Soninké 🔴 Phase 3 uniquement

| Attribut | Détail |
|---|---|
| **Situation** | CM2 à l'école primaire publique de Rosso. Communauté soninké (Gajaaga). Père agriculteur. |
| **Langue maternelle** | Soninké (sarakollé). Apprend le français et l'arabe à l'école — ne parle ni l'un ni l'autre à la maison. |
| **Douleur principale** | Les cours sont en français mais elle ne parle pas français chez elle. Elle ne comprend pas les **consignes** des exercices — pas le contenu mathématique. |
| **Motivation** | Passer en 6ème, apprendre à lire et compter correctement. |
| **Appareil** | Accès via le téléphone du père ou d'un voisin. Aucun smartphone personnel. |
| **Rapport à l'IA** | N'a jamais utilisé d'IA. Interface doit être ultra-simple : grandes icônes, peu de texte, commandes vocales. |
| **Facteur de succès** | Interface vocale en soninké pour lire les consignes. Prof Moctar qui parle "comme sa maîtresse mais en soninké". |
| **Phase** | Phase 3 uniquement. Nécessite partenariats locuteurs natifs pour validation linguistique. |
| **Valeur stratégique** | Différenciateur unique sur le marché mauritanien. Aucun concurrent n'adresse ce segment. Fort potentiel ONG / subventions UNICEF. |

---

### Persona 4 — Ibrahima, 48 ans, père décideur (Nouakchott) ✅

| Attribut | Détail |
|---|---|
| **Situation** | Fonctionnaire, téléphone Tecno. Utilise **Bankily** (salaire versé via BCM). Parfois Masrivi ou Sedad. |
| **Douleur principale** | Paye 1 250 MRU/mois de cours particuliers sans savoir si son enfant progresse. |
| **Motivation** | Investir intelligemment dans l'éducation, avoir des preuves de progression, économiser. |
| **Rapport à MedNum** | Décideur d'achat. Ne télécharge pas l'app — reçoit un rapport WhatsApp hebdomadaire. |
| **Paiement préféré** | Bankily (dominant chez les fonctionnaires mauritaniens — salaires versés via BCM). |
| **Critères de confiance** | (1) Programme officiel MEN, (2) rapport chiffré clair, (3) prix < cours particuliers, (4) témoignage parent. |
| **Canal acquisition** | Bouche-à-oreille, groupes WhatsApp de parents d'élèves, SMS ciblés. |
| **Facteur de succès** | Premier rapport WhatsApp dans les 7 jours — montrant que son enfant s'est connecté. |
| **Risque** | Résiliation si l'enfant n'utilise pas l'app ou si le rapport ne montre pas de progrès. |

---

### Persona 5 — Serigne, 35 ans, partenaire commercial / admin ✅

| Attribut | Détail |
|---|---|
| **Rôle** | Partenaire commercial de MedNum. Intermédiaire entre la plateforme et les établissements scolaires. |
| **Objectif** | Développer le réseau d'abonnés, gérer les contenus, suivre les KPIs de son portefeuille d'écoles. |
| **Outils** | Interface web admin React, WhatsApp Business, visites terrain lycées. |
| **Douleur principale** | Besoin de données de rétention pour convaincre proviseurs et parents. Argument contre les cours particuliers. |
| **Compétences tech** | À l'aise avec un dashboard web simple. Pas développeur. Utilise Excel pour ses propres suivis. |
| **Facteur de succès** | Dashboard clair, export CSV, feedback par chapitre, argumentaire prix prêt à l'emploi. |
| **Motivation** | Commission sur abonnements, expansion vers d'autres villes, statut de "premier agent EdTech" mauritanien. |
| **Vision bilingue** | Conscient du marché arabophone et de la communauté noire. Veut une version arabe pour doubler son marché adressable. |
| **Risque** | Si la plateforme est trop complexe ou si les résultats ne convainquent pas les proviseurs, il abandonnera. |

---

## 4. Vision produit & North Star Metric

### 4.1 Vision ⚠️ À valider avec client (étendue primaire)

MedNum sera, d'ici 2027, la référence nationale en matière d'assistant pédagogique IA pour le primaire **ET** le secondaire mauritaniens — présente dans 10% des foyers ayant un élève scolarisé dans les zones urbaines, disponible en français, en arabe et dans au moins 2 langues nationales (pulaar, soninké), et reconnue officiellement par le Ministère de l'Éducation Nationale.

### 4.2 Mission

> *"Donner à chaque élève mauritanien — qu'il soit arabophone, francophone, halpulaar, soninké ou wolof, en ville ou en zone rurale — accès à un professeur particulier disponible 24h/24, ancré dans le programme officiel, bienveillant, adaptatif, et qui lui parle dans la langue où il comprend le mieux."*

### 4.3 North Star Metric et métriques secondaires

| Métrique | Définition | Objectif M+1 | Objectif M+3 | Objectif M+6 |
|---|---|---|---|---|
| **Questions résolues / élève actif / semaine (NSM)** | Nb moyen de questions envoyées à Prof Moctar par élève avec session ≥ 1 dans la semaine | 5 | 15 | 20 |
| **DAU / MAU** | Ratio utilisateurs actifs quotidiens vs mensuels | 20% | 30% | 40% |
| **Rétention J7** | % d'élèves revenant 7 jours après inscription | 40% | 55% | 65% |
| **Rétention J30** | % d'élèves revenant 30 jours après inscription | 20% | 35% | 50% |
| **Conversion freemium → payant** | % d'élèves passant du gratuit à un plan payant | 8% | 15% | 20% |
| **Streak moyen** | Nombre de jours consécutifs moyen des élèves actifs | 3j | 7j | 12j |
| **Score maîtrise moyen** | Score moyen de maîtrise sur les chapitres travaillés | 45% | 60% | 70% |
| **NPS parent** | Net Promoter Score mesuré par SMS/WhatsApp | — | 35 | 50 |

> **📌 Note sur le NSM :** Une question "résolue" = une question ayant reçu un feedback 👍 ou pour laquelle l'élève a posé une question suivante (proxy de satisfaction). Ce n'est pas le nombre brut de messages envoyés.

---

## 5. État actuel — Ce qui est construit

### 5.1 Stack technique

| Couche | Technologie | Statut |
|---|---|---|
| Frontend mobile | React Native + Expo (iOS + Android) | ✅ En prod |
| Frontend admin | React (interface web) | ✅ En prod |
| Base de données | Supabase (PostgreSQL + pgvector) | ✅ En prod |
| Stockage fichiers | Supabase Storage (PDF, chunks) | ✅ En prod |
| LLM principal | Claude Haiku (Anthropic) | ✅ En prod |
| LLM fallbacks | Mistral → Gemini → Groq | ✅ En prod |
| Vision / OCR | Gemini Vision (photos d'exercices) | ✅ En prod |
| RAG | hybridSearch : vecteurs pgvector + TF-IDF local | ✅ En prod |
| Persistance locale | AsyncStorage (React Native) | ✅ En prod |
| Paiements | Non implémenté | 🔴 À construire |
| Dashboard parent | Non implémenté | 🔴 À construire |
| Système quotas | Non implémenté | 🔴 À construire |
| Skill tree / chapitres | Non implémenté | 🔴 À construire |
| Mode offline | Partiel (lecture PDF locale) | 🟡 Partiel |
| Architecture i18n (FR/AR) | Non implémenté | 🔴 À construire |

### 5.2 Écrans existants

| Écran | Description | Statut |
|---|---|---|
| OnboardingScreen | Premier lancement, présentation de l'app | ✅ Livré |
| StudentSetupScreen | Saisie prénom et classe de l'élève | ✅ Livré |
| HomeScreen | Accueil : cours actif, raccourcis, historique récent, dark mode | ✅ Livré |
| ChatScreen | Chat principal avec Prof Moctar : RAG, pièces jointes, feedback, TTS, suggestions | ✅ Livré |
| CourseScreen | Chargement PDF/TXT par l'élève, extraction Gemini ou fallback JS | ✅ Livré |
| SubjectScreen | Liste des cours chargés par l'admin dans Supabase (par matière/classe) | ✅ Livré |
| ProgressScreen | Tableau de bord gamification : streak, XP, objectif, concepts faibles | ✅ Livré |
| HistoryScreen | Historique des conversations par cours (50 dernières sessions) | ✅ Livré |
| SubscriptionScreen | Choix du plan, paiement mobile money | 🔴 À construire |
| ParentLinkScreen | Liaison compte parent, envoi code | 🔴 À construire |
| SkillTreeScreen | Arbre des chapitres verrouillés/déverrouillés | 🔴 À construire |
| QuizScreen | Quiz de validation de chapitre (5 questions IA) | 🔴 À construire |
| LeaderboardScreen | Classement par classe / niveau national | 🔴 À construire (P2) |

### 5.3 Fonctionnalités IA déjà en place

- **RAG complet** : hybridSearch (vecteurs pgvector Supabase + TF-IDF local) sur chunks du manuel (~500 tokens)
- **Détection de mode automatique** : exercice / correction / explication / Q&R
- **Enrichissement de requête** : correction fautes SMS/abréviations ("c koi" → "qu'est-ce que")
- **Niveau adaptatif IRT** (2-up/1-down) : difficultyScore 0–10 → facile / moyen / avancé
- **Détection frustration** : si l'élève répète ou dit "je comprends pas" → mode ultra-simplifié
- **Méthode Socratique** : pour corrections, 4 niveaux d'indices progressifs avant la réponse
- **Détection hallucination** : alerte si la réponse contient des mots absents des chunks RAG
- **Document joint** : l'élève peut joindre sa composition PDF → aide avec le cours
- **Suivi des concepts** : conceptHistory par cours pour identifier les lacunes récurrentes
- **Synthèse vocale des réponses** (TTS)
- **Feedback 👍/👎** sur chaque réponse, logué dans `message_feedback` (Supabase)

### 5.4 Store (données persistées localement)

- Profil élève (prénom, classe)
- Cours actifs (chunks, contenu)
- Historique des chats (50 dernières sessions)
- XP (total, aujourd'hui, cette semaine, semaine dernière)
- Streak (actuel, meilleur, dernière date)
- Objectif journalier (50 XP)
- Score de difficulté adaptatif (0–10)
- Historique des concepts par cours
- Dark mode

---

## 6. Feature Specifications

> **Définition des priorités :** P0 = bloquant pour le lancement. P1 = nécessaire avant la fin de la Phase 2. P2 = améliorations souhaitables en Phase 3–4.

---

### F-01 — Système de quotas d'utilisation

**Priorité :** P0 | **Phase :** 1

**Description :** Système de crédits quotidiens limitant le nombre de questions envoyées à Prof Moctar selon le plan d'abonnement. Réinitialisation à minuit (heure de Nouakchott, UTC+0).

**User Stories :**
- En tant qu'élève sans abonnement, je veux pouvoir poser 3 questions gratuites par jour pour tester la qualité de Prof Moctar avant de m'abonner.
- En tant qu'élève abonné à une matière, je veux pouvoir poser jusqu'à 20 questions par jour sur cette matière sans interruption.
- En tant qu'admin, je veux avoir un quota illimité pour tester le système.

**Critères d'acceptance :**
1. Lorsque l'élève atteint son quota journalier, le bouton d'envoi est désactivé avec le message : *"Tu as utilisé tes 3 questions gratuites aujourd'hui. Reviens demain ou abonne-toi pour continuer !"* + bouton CTA "Voir les abonnements".
2. Le quota se réinitialise automatiquement à 00h00 UTC+0. L'élève peut à nouveau poser des questions sans action de sa part.
3. Les quotas sont contrôlés côté serveur (Supabase RLS + Edge Function) — pas uniquement côté client.
4. Le dépassement de quota ne supprime pas l'historique des conversations.
5. L'admin (role = admin dans Supabase) a un quota de 9 999 questions/jour.

---

### F-02 — Système d'abonnements et paiements

**Priorité :** P0 | **Phase :** 1–2

**Description :** Gestion des abonnements mensuels/annuels par matière. Paiement via Bankily, Masrivi, Sedad ou cash agent. Activation manuelle possible par l'admin en Phase 1.

**User Stories :**
- En tant qu'élève, je veux voir clairement les plans disponibles et leur prix avant de payer.
- En tant que parent, je veux payer avec Bankily ou Masrivi depuis mon téléphone en moins de 2 minutes.
- En tant qu'admin, je veux pouvoir activer manuellement un abonnement pour un élève ayant payé en cash.

**Critères d'acceptance :**
1. La SubscriptionScreen affiche les 4 plans disponibles avec comparaison côte à côte.
2. Le flux Bankily/Masrivi/Sedad génère un lien de paiement et vérifie la transaction via webhook dans les 30 secondes.
3. À l'activation, les quotas de l'élève sont mis à jour immédiatement (< 5 secondes).
4. L'élève reçoit un message WhatsApp/SMS de confirmation d'activation dans les 2 minutes.
5. L'admin peut activer/désactiver un abonnement depuis l'interface web en 1 clic.
6. Un abonnement expiré repasse en freemium automatiquement (pas de blocage brutal).

---

### F-03 — Skill Tree (arbre de progression des chapitres)

**Priorité :** P1 | **Phase :** 2

**Description :** Visualisation en arbre des chapitres d'une matière. Chaque nœud est verrouillé/déverrouillé selon le score de maîtrise du chapitre précédent. Inspiré de l'arbre Duolingo.

**Critères d'acceptance :**
1. Le SkillTreeScreen affiche les chapitres comme des nœuds sur un parcours vertical. Les nœuds débloqués sont colorés (bleu), les nœuds verrouillés sont grisés avec un cadenas.
2. Le score de maîtrise minimum pour débloquer un chapitre suivant est de **70%** (configurable par l'admin).
3. Le score de maîtrise est calculé sur la base du dernier quiz de validation réussi + la qualité des interactions (ratio 👍/total).
4. Tapper sur un nœud verrouillé affiche : *"Obtiens 70% au quiz du chapitre X pour débloquer ce chapitre."*
5. L'arbre est persisté en base (Supabase) pour être visible sur tous les appareils de l'élève.

---

### F-04 — Quiz de validation de chapitre

**Priorité :** P1 | **Phase :** 2

**Description :** 5 questions à choix multiples générées dynamiquement par Prof Moctar à partir des chunks du chapitre. Score minimum 70% pour débloquer le chapitre suivant et recevoir l'XP de validation.

**Critères d'acceptance :**
1. Le quiz est généré par un appel LLM (Claude Haiku) avec un prompt structuré demandant 5 QCM basés sur les chunks du chapitre. Le format de réponse est JSON strict.
2. Chaque question a 4 choix de réponse, dont 1 correct.
3. Le temps maximum par quiz est de 15 minutes (timer visible).
4. À la fin du quiz : affichage du score, des bonnes réponses, et d'une explication pour chaque mauvaise réponse.
5. Score ≥ 70% = chapitre validé, +100 XP, chapitre suivant débloqué.
6. Score < 70% = message d'encouragement, suggestion de retravailler les concepts échoués avec Prof Moctar, possibilité de repasser le quiz après 30 minutes.
7. Le quiz n'est pas décompté des crédits quotidiens de chat — quota séparé : **3 quiz/jour max**.

---

### F-05 — Contrôle parental (Dashboard parent)

**Priorité :** P1 | **Phase :** 2

**Description :** Système de liaison compte élève ↔ compte parent. Le parent reçoit un rapport hebdomadaire automatique par WhatsApp/SMS. Interface web légère accessible par code unique.

**Critères d'acceptance :**
1. À l'inscription, l'élève peut (facultativement) entrer le numéro de téléphone de son parent. Un code à 6 chiffres est envoyé au parent par SMS.
2. Le rapport hebdomadaire WhatsApp contient : (1) jours actifs cette semaine, (2) questions posées, (3) streak actuel, (4) chapitres travaillés, (5) score de maîtrise par chapitre, (6) lien vers le dashboard web.
3. Le dashboard web parent est accessible via un **lien tokenisé** (pas de compte à créer) pendant 30 jours avant expiration.
4. Le parent **ne voit PAS** le contenu des conversations — uniquement les métriques agrégées.
5. Alerte automatique WhatsApp si l'élève n'a pas ouvert l'app depuis **5 jours** : *"Aminata n'a pas étudié avec MedNum depuis 5 jours. Encouragez-la !"*
6. L'admin peut désactiver les alertes pour un élève spécifique.

---

### F-06 — Mode hors connexion (partiel)

**Priorité :** P1 | **Phase :** 2 (lecture) / 3 (quiz offline)

**Critères d'acceptance :**
1. Les chunks du cours actif sont mis en cache dans AsyncStorage à la première connexion. Taille max par cours : 5 MB.
2. En mode offline, la SubjectScreen et la CourseScreen sont consultables sans connexion. Un bandeau *"Mode hors ligne — Prof Moctar indisponible"* est affiché.
3. La ChatScreen en mode offline affiche : *"Prof Moctar a besoin d'internet pour te répondre. Tu peux relire ton cours ci-dessous."*
4. Les 5 dernières conversations sont disponibles en lecture offline.
5. La mise en cache est transparente pour l'élève — aucune action requise.

---

### F-07 — Interface arabe (RTL) ⚠️ À valider périmètre avec client

**Priorité :** P1 | **Phase :** 2

**Description :** Traduction complète de l'interface en arabe standard avec support RTL (Right-To-Left). Concerne l'interface utilisateur, les prompts de Prof Moctar, et les rapports parents.

**Critères d'acceptance :**
1. Tout le texte de l'interface bascule en RTL lorsque la langue arabe est sélectionnée dans les paramètres.
2. Prof Moctar répond en arabe standard si la langue de l'élève est configurée sur "arabe".
3. Le RAG fonctionne sur les chunks en arabe (embeddings arabes dans Supabase).
4. Le rapport parent hebdomadaire est disponible en arabe si le parent a configuré sa langue sur "arabe".
5. Le changement de langue est persisté dans le profil élève (Supabase).

---

### F-08 — Interface langues nationales (pulaar prioritaire) 🔴 Phase 3

**Priorité :** P2 | **Phase :** 3

**Description :** Interface vocale et textuelle en pulaar, avec validation par des locuteurs natifs. Priorité aux consignes d'exercices et aux explications de base. Soninké en Phase 3 tardive.

**Critères d'acceptance :**
1. Les consignes des exercices peuvent être lues à voix haute en pulaar (TTS avec voix pulaar validée).
2. Prof Moctar peut inclure une phrase de clarification en pulaar après une explication en français.
3. Un glossaire bilingue FR ↔ Pulaar pour les termes mathématiques et scientifiques est disponible.
4. Chaque contenu en pulaar est validé par au moins 2 locuteurs natifs avant mise en production.
5. L'interface pulaar est disponible en mode dégradé si la connexion est faible (pas de TTS, texte seulement).

---

## 7. Système de gamification complet

### 7.1 Système d'XP — Tableau des événements ✅

| Événement | XP attribués | Fréquence max | Condition |
|---|---|---|---|
| Question posée à Prof Moctar | +5 XP | 20/jour | Toute question valide (≥ 5 mots) |
| Question posée avec feedback 👍 | +10 XP | 20/jour | 👍 reçu sur la réponse |
| Session de travail ≥ 10 min | +15 XP | 3/jour | Durée mesurée côté client |
| Session de travail ≥ 30 min | +30 XP | 2/jour | Durée mesurée côté client |
| Photo d'exercice jointe | +8 XP | 5/jour | Pièce jointe image envoyée |
| PDF de composition joint | +12 XP | 2/jour | Pièce jointe PDF envoyée |
| Quiz chapitre complété (< 70%) | +20 XP | 3/jour | Quiz terminé, quel que soit le score |
| Quiz chapitre validé (≥ 70%) | +100 XP | 1/chapitre | Score ≥ 70% (non répétable) |
| Quiz chapitre validé (≥ 90%) | +150 XP | 1/chapitre | Bonus excellence (remplace les 100) |
| Daily challenge complété | +50 XP | 1/jour | Défi quotidien accompli |
| Streak 7 jours | +100 XP bonus | 1/semaine | Déclenché le 7e jour consécutif |
| Streak 30 jours | +500 XP bonus | 1/mois | Déclenché le 30e jour consécutif |
| Objectif journalier atteint | +25 XP bonus | 1/jour | Si ≥ 50 XP dans la journée |
| Premier cours chargé | +50 XP (one-shot) | 1 fois | Onboarding |
| Première question posée | +20 XP (one-shot) | 1 fois | Onboarding |

### 7.2 Niveaux de l'élève ✅

| Niveau | Titre (FR) | Titre culturel | XP requis (total) | Avantages |
|---|---|---|---|---|
| 1 | Novice | طالب (Tâlib) | 0 XP | Accès de base |
| 2 | Apprenti | متعلم (Muta'allim) | 500 XP | +5% XP sur les quiz |
| 3 | Étudiant | دارس (Dâris) | 1 500 XP | Badge partageable WhatsApp |
| 4 | Érudit | عالم (Âlim) | 3 500 XP | +10% XP général, accès leaderboard |
| 5 | Expert | حكيم (Hakîm) | 7 000 XP | Daily challenge avancé débloqué |
| 6 | Maître | أستاذ (Ustâdh) | 15 000 XP | 1 semaine d'abonnement offerte |
| 7 | Grand Maître | شيخ المعرفة (Sheikh) | 30 000 XP | Badge "Sheikh" permanent, mention admin |

### 7.3 Streak system ✅

- Un streak = une session de travail par jour calendaire (minuit UTC+0). Durée minimum : 5 minutes ou ≥ 1 question.
- Le streak est sauvegardé localement (AsyncStorage) **ET** en base (Supabase).
- **Streak freeze :** l'élève peut "protéger" son streak une fois par semaine avec 100 XP.
- **Streak comeback bonus :** si l'élève reprend après 2–7 jours d'absence → +50 XP "Bon retour !" + animation.
- **Meilleur streak :** affiché en permanence dans le ProgressScreen, même si le streak actuel est plus faible.
- **Notification push** à 19h si l'élève n'a pas encore travaillé ce jour : *"🔥 Ton streak de X jours est en danger !"*

### 7.4 Badges et trophées ✅

| Badge | Condition | Type | Partageable WhatsApp |
|---|---|---|---|
| 🔥 Première flamme | 3 jours de streak consécutifs | Streak | Non |
| 💎 Semaine parfaite | 7 jours de streak consécutifs | Streak | Oui |
| 🏆 Mois champion | 30 jours de streak consécutifs | Streak | Oui |
| 📚 Premier chapitre | Valider son 1er quiz à ≥ 70% | Progression | Oui |
| 🧠 Toutes les matières | Valider un chapitre dans chaque matière abonnée | Progression | Oui |
| ⚡ Flash | Poser 10 questions en une journée | Engagement | Non |
| 🎯 Précision | 5 quiz validés avec score ≥ 90% | Excellence | Oui |
| 🌙 Élève de la nuit | Travailler après 21h pendant 5 jours | Habitude | Non |
| 🌅 Lève-tôt | Travailler avant 7h pendant 5 jours | Habitude | Non |
| ❓ Curieux | 100 questions posées (cumulatif) | Milestone | Oui |
| 🚀 Décollage | 500 questions posées (cumulatif) | Milestone | Oui |
| 👑 Top classe | Classé 1er du leaderboard de sa classe pendant 1 semaine | Compétition | Oui |

Les badges partageables génèrent une image PNG 400×400 avec le nom de l'élève, le badge, et le logo MedNum. Partageable directement sur WhatsApp via le Share API de React Native.

### 7.5 Daily Challenge ✅

- Un défi quotidien est généré automatiquement par chapitre actif par Claude Haiku (batch Supabase Edge Function à 00h01 chaque jour), basé sur les chunks du chapitre le **moins maîtrisé** de l'élève.
- Complétion = répondre à la question avec une réponse approuvée par Prof Moctar (score de pertinence ≥ 0.7). Récompense : **+50 XP**.
- Les défis non complétés expirent à minuit et ne s'accumulent pas.

### 7.6 Leaderboard ⚠️ À valider avec client (opt-in ou opt-out ?)

- **Phase 2 :** Leaderboard par classe uniquement (ex : "Top 10 de ta 1ère AS Sciences").
- **Phase 3 :** Leaderboard par école (si l'admin a renseigné l'établissement).
- **Phase 4 :** Leaderboard national par niveau (anonymisé par défaut).
- Basé sur les XP de la **semaine en cours** (remise à zéro chaque lundi 00h00 UTC+0).
- Les 3 premiers du leaderboard hebdomadaire reçoivent des badges temporaires 🥇🥈🥉.

---

## 8. Système de quotas d'utilisation

### 8.1 Tableau des quotas par plan ✅

| Fonctionnalité / Quota | Freemium (Gratuit) | 1 Matière | Pack 3 Matières | Pack Complet | Admin |
|---|---|---|---|---|---|
| Questions chat / jour | **3** | 20 | 20 / matière | 50 cross-matières | 9 999 |
| Matières accessibles | 1 (prévisualisation) | 1 au choix | 3 au choix | Toutes (niveau) | Toutes |
| Photos exercices / jour | 1 | 5 | 10 | 20 | 999 |
| PDFs composition / jour | 0 | 2 | 5 | 10 | 999 |
| Quiz chapitres / jour | 0 | 3 | 3 / matière | 5 cross | 999 |
| Daily challenge | Non | Oui | Oui | Oui | Oui |
| Synthèse vocale (TTS) | Non | Oui | Oui | Oui | Oui |
| Historique conversations | 7 jours | 30 jours | 60 jours | Illimité | Illimité |
| Skill tree visible | Partiel (1 chapitre) | Oui | Oui | Oui | Oui |
| Dashboard parent | Non | Oui | Oui | Oui | Non |
| Mode offline (lecture) | Non | Oui | Oui | Oui | Oui |
| Leaderboard | Non | Lecture seule | Oui | Oui | Oui |
| Badges partageables | Non | Non | Oui | Oui | Oui |

### 8.2 Gestion du dépassement de quota

| Scénario | Comportement | Message affiché |
|---|---|---|
| Quota journalier atteint (freemium) | Bouton d'envoi désactivé | *"Tu as utilisé tes 3 questions gratuites aujourd'hui. Reviens demain ou découvre nos abonnements 📚"* |
| Quota journalier atteint (abonné) | Bouton désactivé, compteur affiché | *"Tu as atteint ta limite pour aujourd'hui. Prof Moctar t'attend demain ! Streak sauvegardé. 🔥"* |
| Matière non abonnée | Liste chapitres visible, chat bloqué | *"Cette matière n'est pas dans ton abonnement. Ajoute-la pour accéder à Prof Moctar 💡"* |
| Quiz épuisé pour la journée | Bouton "Quiz" grisé avec compteur | *"Tu as fait tes 3 quiz d'aujourd'hui. Bravo ! Reviens demain pour continuer."* |

### 8.3 Règles techniques des quotas

- Table Supabase : `user_quotas (user_id, date, questions_used, photos_used, pdfs_used, quizzes_used)`
- Vérification côté Edge Function **avant** chaque appel LLM (protection contre contournement client).
- Réinitialisation automatique : cron job Supabase à 00h00 UTC+0 chaque jour.
- En cas d'erreur réseau lors de la vérification : comportement par défaut = **REFUSER** la requête (fail-safe).

---

## 9. Modèle de monétisation

### 9.1 Plans et tarification ⚠️ Prix à valider avec client

| Plan | Prix / mois | Prix / an | Économie annuelle | Cible |
|---|---|---|---|---|
| Freemium (Gratuit) | 0 MRU | 0 MRU | — | Découverte, onboarding |
| 1 Matière | **350 MRU** | 3 150 MRU | 1 050 MRU (-25%) | Élève avec 1 matière difficile |
| Pack 3 Matières | **800 MRU** | 7 200 MRU | 2 400 MRU (-25%) | Élève sérieux, prépa examens |
| Pack Complet (niveau) | **1 100 MRU** | 9 900 MRU | 3 300 MRU (-25%) | Élève très motivé / parents exigeants |
| Abonnement école (B2B) | Sur devis | Sur devis | — | Partenariats lycées (Phase 4) |

> **📊 Comparaison vs cours particuliers :** Le cours particulier standard (2h/semaine) coûte 1 200–1 300 MRU/mois pour **UNE seule matière**. MedNum Pack Complet (toutes matières, 24h/24) = **1 100 MRU/mois** — soit MOINS cher pour TOUTES les matières.

### 9.2 Période d'essai ✅

- **7 jours gratuits** pour le plan "1 Matière" à la première inscription (pas de carte bancaire requise).
- Activation automatique à la complétion de l'onboarding.
- À J+5 : notification *"Plus que 2 jours d'essai gratuit — abonne-toi pour continuer !"*
- À J+7 : retour automatique en freemium. Aucune donnée perdue.
- Période d'essai utilisable **une seule fois** par numéro de téléphone.

### 9.3 Flux de paiement — Mobile money mauritanien (Bankily, Masrivi, Sedad) ✅

1. L'élève (ou le parent) tape sur "S'abonner" dans l'app.
2. Sélection du plan et de la durée (mensuel ou annuel).
3. Sélection du mode de paiement : **Bankily**, **Masrivi**, **Sedad**, ou *"Payer chez un agent"*.
4. **Bankily :** API BCM/Mauritel — deep-link `bankily://pay?amount=X&merchant=PROFNUM`. Dominant chez les fonctionnaires mauritaniens (salaires versés via BCM).
5. **Masrivi :** API Mattel — USSD `*205#` ou deep-link. Dominant dans les zones péri-urbaines et chez les commerçants informels.
6. **Sedad :** plateforme de paiement électronique mauritanienne — cartes CCP et virements bancaires locaux. Pour les parents avec compte bancaire formel.
7. Si aucune app n'est installée : affichage du numéro USSD et du numéro de l'agent le plus proche (base de données agents par wilaya).
8. Webhook reçu par Supabase Edge Function → mise à jour de la table `subscriptions`.
9. SMS/WhatsApp de confirmation envoyé dans les 2 minutes.
10. Pour les agents : l'admin génère un code coupon à 8 chiffres. L'agent encaisse le cash. Le parent entre le coupon dans l'app.

### 9.4 Gestion des abonnements ✅

| Paramètre | Valeur |
|---|---|
| Renouvellement | Manuel (pas de prélèvement automatique — non adapté au mobile money mauritanien) |
| Rappel d'expiration | J-5, J-2, J-1 : notification push + WhatsApp au parent |
| Grâce à l'expiration | 3 jours en mode gratuit étendu (10 questions/jour) pour faciliter le renouvellement |
| Remise renouvellement fidélité | -10% si renouvellement avant expiration (code automatique) |
| Upgrade | Possible à tout moment. Remise proratisée sur le mois en cours. |
| Downgrade | Possible à la prochaine facturation uniquement. |
| Remboursement | Non applicable (mobile money non remboursable). Crédit sur compte MedNum possible via admin. |

### 9.5 Projections financières — Scénario conservateur 🔴 Hypothèses à valider

| Période | Élèves gratuits | Élèves payants | ARPU moyen (MRU) | MRR (MRU) | ARR (MRU) |
|---|---|---|---|---|---|
| M+1 | 150 | 30 | 500 | 15 000 | 180 000 |
| M+3 | 500 | 150 | 600 | 90 000 | 1 080 000 |
| M+6 | 1 500 | 400 | 650 | 260 000 | 3 120 000 |
| M+12 | 4 000 | 1 000 | 700 | 700 000 | 8 400 000 |

---

## 10. Architecture technique

### 10.1 Vue d'ensemble des composants

L'architecture de MedNum repose sur 4 couches :
1. **Couche cliente :** App React Native (Expo) + Interface web admin (React)
2. **Couche API/BFF :** Supabase Edge Functions (Deno) — authentification, quotas, webhooks paiement
3. **Couche données :** Supabase (PostgreSQL + pgvector + Storage)
4. **Couche LLM :** Claude Haiku (primaire) → Mistral → Gemini → Groq (fallbacks)

### 10.2 Schéma des tables Supabase (principales)

| Table | Colonnes clés | Usage |
|---|---|---|
| `users` | id, phone, name, grade, role, language, created_at | Profils élèves et admins |
| `subscriptions` | user_id, plan, subjects[], start_at, end_at, status, payment_method | Abonnements actifs |
| `user_quotas` | user_id, date, questions_used, photos_used, pdfs_used, quizzes_used | Quotas journaliers |
| `courses` | id, subject, grade, title, admin_id, chunk_count, language | Métadonnées des cours |
| `course_chunks` | id, course_id, content, embedding (vector), tfidf_index, position, language | Chunks RAG |
| `conversations` | id, user_id, course_id, created_at, message_count | Sessions de chat |
| `messages` | id, conversation_id, role, content, mode, difficulty, created_at | Messages individuels |
| `message_feedback` | message_id, user_id, feedback (👍/👎), created_at | Feedback qualité |
| `xp_events` | user_id, event_type, xp_amount, created_at | Journal XP |
| `user_gamification` | user_id, total_xp, streak_current, streak_best, level, last_activity_date | Métriques gamification |
| `chapter_mastery` | user_id, course_id, chapter_id, mastery_score, quiz_attempts, last_quiz_at | Maîtrise par chapitre |
| `badges` | id, code, label, description, condition_type, condition_value | Définition des badges |
| `user_badges` | user_id, badge_id, earned_at, shared_at | Badges gagnés |
| `daily_challenges` | user_id, date, challenge_text, course_id, completed, xp_earned | Défis quotidiens |
| `parent_links` | student_id, parent_phone, code, verified, active | Liaisons parent-élève |
| `parent_reports` | student_id, week_start, report_json, sent_at | Rapports hebdo générés |
| `skill_tree_config` | course_id, chapter_order (jsonb), min_mastery_to_unlock | Config arbre chapitres |

### 10.3 Flux de données — Question à Prof Moctar

1. L'élève envoie un message dans ChatScreen.
2. Client vérifie le quota local (AsyncStorage) — si 0, affiche le message de dépassement sans appel serveur.
3. Si quota > 0 : appel à Supabase Edge Function `/ask`.
4. Edge Function : (1) vérifie JWT, (2) vérifie quota côté serveur en DB, (3) enrichit la requête (correction SMS), (4) détecte le mode (exercice/correction/explication).
5. hybridSearch : requête vectorielle (pgvector) + TF-IDF local → top 5 chunks pertinents.
6. Prompt construit : system_prompt + chunks + historique (3 derniers messages) + question enrichie.
7. Appel Claude Haiku (Anthropic API). Si timeout > 8s ou erreur : fallback Mistral → Gemini → Groq.
8. Détection hallucination : vérification que les faits de la réponse sont présents dans les chunks.
9. Réponse streamée vers le client. Mise à jour du quota dans `user_quotas`. Enregistrement dans `messages`.
10. Post-traitement client : TTS (si activé), suggestions de questions, mise à jour XP.

### 10.4 Considérations réseau pour la Mauritanie ✅

- **Timeout LLM :** 15 secondes maximum. Au-delà : *"Prof Moctar prend du temps, réessaie dans un instant."*
- **Streaming activé** pour réduire la latence perçue (affichage token par token).
- **Compression gzip** sur toutes les réponses API.
- **Taille des chunks** limitée à 500 tokens pour des réponses rapides (< 2s de génération pour Haiku).
- **Images compressées** à 800px max avant envoi (Gemini Vision).
- **Mode dégradé :** si tous les LLM sont indisponibles, suggestion de relire le cours avec lien direct.

---

## 11. Dashboard parent & interface admin

### 11.1 Dashboard parent — Wireframe textuel

> **URL d'accès :** `https://parent.mednum.mr/[token-unique-32-chars]` — Lien tokenisé, valable 30 jours, envoyé par WhatsApp chaque semaine. Pas de compte à créer.

Structure de la page (mobile-first, une seule page scrollable) :

| Zone | Contenu affiché |
|---|---|
| **En-tête** | Logo MedNum + "Suivi de [Prénom] — Semaine du [date]" |
| **Bandeau résumé** | 4 cartes : (1) Jours actifs cette semaine / 7, (2) Questions posées, (3) Streak actuel 🔥, (4) Niveau actuel |
| **Progression par matière** | Pour chaque matière abonnée : barre de progression (%), chapitres validés / total, dernier quiz passé |
| **Activité de la semaine** | Graphique en barres : XP par jour (Lu–Di). Simple, lisible sur mobile. |
| **Chapitres travaillés** | Liste des chapitres travaillés cette semaine avec score de maîtrise |
| **Alertes éventuelles** | Si score en baisse : *"⚠️ [Prénom] semble avoir des difficultés en [concept]."* / Si inactivité : *"📵 Aucune activité depuis X jours."* |
| **Pied de page** | Contact WhatsApp MedNum |

### 11.2 Rapport WhatsApp hebdomadaire — Format texte

Envoyé chaque dimanche soir à 20h00 (heure locale) :

```
📚 Rapport MedNum — Semaine du 12 au 18 mai 2026
Élève : Aminata Ba — 1ère AS Sciences
─────────────────────────────
✅ Jours actifs : 5 / 7
❓ Questions posées : 47
🔥 Streak : 12 jours consécutifs
🎯 Niveau : Érudit (4/7)

📊 Progression cette semaine :
  SVT — Chap. 3 (Génétique) : 78% ✅
  Maths — Chap. 5 (Trigo) : 61% 🔄

👉 Voir le rapport complet :
https://parent.mednum.mr/abc123...
```

### 11.3 Interface admin — Structure des écrans ✅

| Onglet | Contenu / Fonctionnalités |
|---|---|
| **Dashboard** | KPIs temps réel : DAU, MAU, abonnements actifs, MRR, questions/jour, rétention J7/J30. Graphiques 30 jours. |
| **Cours** | Liste des cours par classe/matière/langue. Upload PDF (chunking auto). Gestion chapitres et skill tree. Paramètre : score minimum de déblocage (défaut 70%). |
| **Élèves** | Liste des élèves inscrits : nom, classe, plan, streak, XP, dernière activité. Filtres. Export CSV. Action : activer/suspendre abonnement. |
| **Feedback** | Tableau des 👍/👎 par cours, chapitre, type de question. Identification des chunks problématiques (taux de 👎 > 30%). |
| **Abonnements** | Gestion manuelle : activer, prolonger, annuler. Génération de coupons cash. Historique des paiements. |
| **Rapports parents** | Voir les rapports générés, renvoyer manuellement, liste des numéros liés. |
| **Paramètres** | Configuration des quotas par plan, seuil de maîtrise, délai de grâce à l'expiration, messages de notifications. |

---

## 12. Stratégie de lancement — Roadmap par phase

### Phase 1 — Lancement (Maintenant → M+2)

> **Périmètre :** 3 niveaux à fort enjeu examens : (1) **1ère AS Sciences** — SVT + Maths (prépa BAC S). (2) **3ème** — Maths + Français + SVT (prépa BEPC). (3) **Terminale** — matières scientifiques (prépa BAC). Objectif : **300 élèves payants** à M+2.

| Feature | Priorité | Statut |
|---|---|---|
| Chat Prof Moctar (RAG + modes IA) | P0 | ✅ Construit |
| Onboarding + profil élève | P0 | ✅ Construit |
| Chargement cours (SubjectScreen) | P0 | ✅ Construit |
| Système d'XP de base + streak | P0 | ✅ Construit |
| Feedback 👍/👎 | P0 | ✅ Construit |
| Système de quotas (vérification serveur) | P0 | 🔴 À construire |
| SubscriptionScreen + plans | P0 | 🔴 À construire |
| Paiement Bankily / Masrivi / Sedad (basique) | P0 | 🔴 À construire |
| Activation manuelle par admin (coupons cash) | P0 | 🔴 À construire |
| Période d'essai 7 jours | P0 | 🔴 À construire |
| Contenu SVT + Maths 1ère AS Sciences (manuels MEN) | P0 | 🔴 À construire |
| Contenu Maths + Français + SVT 3ème (manuels MEN) | P0 | 🔴 À construire |
| Contenu matières scientifiques Terminale (manuels MEN) | P0 | 🔴 À construire |
| Architecture i18n FR/AR — structure uniquement | P0 | 🔴 À construire |

**Critères de passage à Phase 2 :**
- 300 élèves payants actifs sur les 3 niveaux ciblés (≥ 1 session/semaine)
- Rétention J7 ≥ 40%
- NPS parent (via SMS) ≥ 30
- Taux de 👍 sur les réponses Prof Moctar ≥ 75%

---

### Phase 2 — Croissance (M+2 → M+5)

> **Périmètre :** Élargissement à toutes les classes du secondaire (6ème → Terminale, filières française ET arabe). Interface arabe (RTL) bêta. Skill tree, quiz, dashboard parent bilingue FR/AR déployés.

| Feature | Priorité |
|---|---|
| Skill tree (arbre de chapitres verrouillés) | P1 |
| Quiz de validation de chapitre (5 QCM IA) | P1 |
| Dashboard parent (web + WhatsApp) | P1 |
| Daily challenge par chapitre | P1 |
| Mode offline (lecture cours) | P1 |
| Badges et trophées (système complet) | P1 |
| Leaderboard par classe | P1 |
| Contenu toutes matières secondaire filière française (6ème → Terminale) | P1 |
| Interface arabe RTL bêta — filière arabophone du secondaire | P1 |
| Contenu matières filière arabe (secondaire) | P1 |
| Rapport parent bilingue FR/AR | P1 |
| Export rapport admin (CSV) | P1 |
| Notifications push (streak, quota, expiration) | P1 |

**Critères de passage à Phase 3 :**
- 1 000 élèves payants actifs
- Rétention J30 ≥ 35%
- Skill tree utilisé par ≥ 60% des élèves
- Score maîtrise moyen ≥ 60%

---

### Phase 3 — Primaire & Multilingue (M+5 → M+9)

> **Périmètre :** Lancement marché primaire (CM1–CM2) avec interface langues nationales (pulaar prioritaire, puis soninké). Gamification avancée. Leaderboard école. Partenariats ONG éducatives.

| Feature | Priorité |
|---|---|
| Lancement primaire CM1–CM2 (langues nationales) | P1 |
| Interface pulaar (voix + texte) avec locuteurs natifs validateurs | P1 |
| Interface soninké (voix + texte) | P2 |
| Partenariats ONG éducatives (UNICEF, Save the Children Mauritanie) | P2 |
| Leaderboard par école | P2 |
| Badges partageables WhatsApp (PNG générés) | P1 |
| Mode offline partiel (quiz en cache) | P2 |
| Streak freeze (protection streak) | P2 |
| Daily challenge avancé (niveau Expert+) | P2 |
| Rapport admin avancé (concepts faibles par classe) | P2 |
| API B2B pour lycées partenaires | P2 |

---

### Phase 4 — Expansion (M+9 → M+12)

| Feature | Description |
|---|---|
| Leaderboard national | Classement anonymisé par niveau, national (opt-in) |
| Contenu propre MedNum | Production de fiches de révision originales (droits propres, no copyright MEN) |
| Interface wolof | Langue nationale supplémentaire (communauté wolof du Sénégal + Mauritanie) |
| Partenariats lycées B2B | Offre institutionnelle, facturation annuelle par établissement |
| Mode prépa examens | Entraînement spécial BEPC / BAC : sujets corrigés, annales IA |
| Application parent native | App dédiée au parent (iOS + Android) si base parents > 5 000 |
| Abonnement diaspora | Paiement international (carte bancaire, PayPal) pour familles en France/Golfe |

---

## 13. Métriques de succès

### 13.1 KPIs par phase

| KPI | Phase 1 (M+2) | Phase 2 (M+5) | Phase 3 (M+9) | Phase 4 (M+12) |
|---|---|---|---|---|
| Élèves payants actifs | 300 | 1 000 | 3 000 | 7 000 |
| DAU | 100 | 400 | 1 200 | 3 000 |
| MAU | 400 | 1 500 | 4 000 | 9 000 |
| Rétention J7 | 40% | 55% | 65% | 70% |
| Rétention J30 | 20% | 35% | 50% | 60% |
| Questions/élève/semaine (NSM) | 8 | 15 | 20 | 25 |
| Streak moyen | 4j | 8j | 12j | 15j |
| Conversion freemium → payant | 8% | 15% | 18% | 22% |
| Score maîtrise moyen | 45% | 60% | 70% | 75% |
| NPS parent | 30 | 40 | 50 | 60 |
| Taux 👍 réponses | 75% | 80% | 83% | 85% |
| MRR (MRU) | 15 000 | 90 000 | 250 000 | 700 000 |

### 13.2 Métriques de qualité produit

| Métrique | Objectif | Méthode de mesure |
|---|---|---|
| Latence réponse Prof Moctar (P95) | < 8 secondes | Log des timestamps dans Supabase `messages` |
| Taux d'erreur LLM (timeout + erreurs) | < 3% | Log Edge Function, alertes Supabase |
| Taux de détection hallucination | > 95% des cas réels | Revue manuelle échantillon mensuel (20 messages) |
| Crash rate app mobile | < 0.5% | Sentry (React Native) |
| Temps d'onboarding complet | < 3 minutes | Suivi events analytics (écran par écran) |
| Taux de complétion onboarding | > 80% | Funnel analytics |

---

## 14. Risques & Mitigations

| # | Risque | Probabilité | Impact | Mitigation |
|---|---|---|---|---|
| R1 | **Droits d'auteur manuels MEN** — utilisation sans autorisation formelle | Élevée | Élevé | 3 stratégies parallèles : (1) Demande officielle MEN, (2) Reformulation IA systématique (déjà en place), (3) Contenu propre en Phase 4. |
| R2 | **Réseau instable** — IA inutilisable sans connexion | Très élevée | Moyen | Mode offline Phase 2 (lecture cours). Streaming. Message d'erreur non bloquant. |
| R3 | **Hallucinations IA** — Prof Moctar donne une mauvaise réponse | Moyenne | Élevé | Détection hallucination déjà en place. RAG strict. Feedback 👎 déclenche alerte admin. |
| R4 | **Faible adoption des parents** | Moyenne | Élevé | Rapport WhatsApp dès J+7. Argumentaire prix. 5 familles test en Phase 1. Période d'essai 7 jours. |
| R5 | **Coûts LLM trop élevés** si croissance rapide | Faible | Élevé | Quotas limitent les abus. Haiku = modèle le moins cher. Objectif < 0.05 MRU/question. |
| R6 | **Concurrence** — acteur plus gros copie le concept | Faible (CT) | Moyen | Avantage premier entrant. Accords exclusifs lycées Phase 3. Contenu propre Phase 4. |
| R7 | **Fraude quota** — élèves créent plusieurs comptes freemium | Moyenne | Faible | Quota lié au numéro de téléphone (vérification OTP). Device fingerprinting. |
| R8 | **Protection données mineurs** | Faible | Moyen | Pas de données sensibles. Consentement parental. Données hébergées en Europe (Supabase EU). |
| R9 | **Dépendance fournisseur LLM** (Anthropic) | Faible | Élevé | Architecture multi-LLM (4 fallbacks). Monitoring uptime temps réel. |
| R10 | **Résistance à l'arabisation** — communauté noire méfiante vis-à-vis d'un produit perçu comme "arabe" | Moyenne | Élevé | Positionnement neutre et multilingue. Interface pulaar/soninké en Phase 3 comme signal d'inclusion. Ambassadeurs de la communauté noire en Phase 2. |
| R11 | **Politique d'arabisation** — changement de programme officiel qui invalide les manuels chargés | Faible | Élevé | Veille sur les circulaires MEN. Architecture permettant le rechargement rapide de nouveaux manuels. |

---

## 15. Aspects légaux et conformité

### 15.1 Stratégie droits d'auteur — 3 options parallèles

| Option | Description | Délai | Risque | Priorité |
|---|---|---|---|---|
| **A — Autorisation MEN** | Lettre officielle au Ministère de l'Éducation Nationale mauritanien demandant l'autorisation d'utiliser les manuels à des fins d'assistance pédagogique numérique. | 3–6 mois | Refus possible, délai long | À initier en Phase 1 |
| **B — Reformulation IA (déjà active)** | Tous les chunks du RAG sont reformulés par Claude Haiku avant stockage — jamais de reproduction verbatim. Audit juridique du processus recommandé. | Immédiat | Faible si reformulation suffisamment transformative | P0 — Déjà en place |
| **C — Contenu propre** | Production de fiches de révision originales rédigées par des enseignants mauritaniens contractuels, droits cédés à MedNum. | Phase 4 (M+9) | Nul (droits propres) | Phase 4 |

> **⚠️ Action immédiate requise :** Faire valider par un avocat mauritanien spécialisé en droit de la propriété intellectuelle que la reformulation IA constitue une transformation suffisante pour écarter tout risque de violation du droit d'auteur. Budget estimé : 50 000–100 000 MRU pour consultation.

### 15.2 Protection des données des mineurs

- **Collecte minimale :** prénom, classe, numéro de téléphone uniquement. Aucune géolocalisation précise.
- **Consentement parental :** case à cocher obligatoire pour les moins de 16 ans. En Phase 2 : validation par OTP envoyé au parent.
- **Données hébergées dans l'UE :** Supabase EU (Frankfurt) — conformité RGPD by default.
- **Droit à l'effacement :** bouton "Supprimer mon compte et toutes mes données" dans les paramètres — exécution dans les 30 jours.
- **Pas de publicité ciblée :** aucun tracker publicitaire tiers. Analytics : Sentry uniquement (bug tracking, no PII).
- **Chiffrement :** communications en HTTPS/TLS. Messages chiffrés at-rest (Supabase AES-256).

### 15.3 CGU — Points clés

- Rédigées en français simple, niveau lycée. Version arabe en Phase 2. Versions audio en pulaar/soninké en Phase 3.
- MedNum est un outil d'aide à l'apprentissage, **pas un substitut à l'enseignant**.
- Utilisation réservée aux élèves inscrits dans un établissement du secondaire mauritanien. ⚠️ *À étendre au primaire en Phase 3.*
- Interdiction d'utiliser MedNum pour tricher lors d'examens officiels. Clause de suspension en cas de violation.
- Le contenu des conversations est confidentiel et n'est pas partagé avec des tiers — sauf métriques agrégées accessibles au parent.

---

## 16. Glossaire

| Terme | Définition |
|---|---|
| **1ère AS Sciences** | 1ère année du lycée, filière Sciences (équivalent Terminale S en France). Classe cible du lancement. |
| **Admin** | Utilisateur ayant le rôle "admin" dans Supabase — accès à l'interface web MedNum. |
| **ARPU** | Average Revenue Per User — revenu moyen par utilisateur payant. |
| **AsyncStorage** | Mécanisme de persistance locale dans React Native — utilisé pour les données offline. |
| **Arabisation** | Politique éducative de l'État mauritanien visant à faire de l'arabe standard la langue principale d'enseignement, créant une tension avec la tradition francophone des lycées scientifiques. |
| **Bankily** | Application de mobile money de la Banque Centrale de Mauritanie (BCM) / Mauritel. Dominant chez les fonctionnaires mauritaniens (salaires versés via BCM). **Mode de paiement principal de MedNum.** |
| **BEPC** | Brevet d'Études du Premier Cycle — examen de fin de collège en Mauritanie (équivalent du Brevet en France). |
| **Chunk** | Fragment de texte (~500 tokens) extrait d'un manuel pédagogique. Unité de base du RAG. |
| **Daily challenge** | Défi quotidien généré par Prof Moctar, basé sur le chapitre le moins maîtrisé. Expire à minuit. |
| **difficultyScore** | Score de 0 à 10 représentant le niveau de difficulté adapté à l'élève (IRT 2-up/1-down). |
| **Edge Function** | Fonction serverless hébergée chez Supabase (Deno), utilisée pour la logique métier. |
| **Filière française** | Filière du secondaire mauritanien où l'enseignement scientifique se fait en français. Principal marché de MedNum au lancement. |
| **Filière arabe** | Filière du secondaire mauritanien où l'enseignement se fait en arabe standard. Marché Phase 2 de MedNum. |
| **Freemium** | Plan gratuit de MedNum — 3 questions/jour, fonctionnalités limitées. |
| **Halpulaar / Pulaar** | Langue et communauté nationale mauritanienne (aussi appelée peul). ≈20–25% de la population. Langue cible Phase 3 MedNum. |
| **Hassaniya** | Dialecte arabe parlé par la communauté maure en Mauritanie. Distinct de l'arabe standard utilisé dans l'enseignement. |
| **hybridSearch** | Méthode de recherche combinant les embeddings vectoriels (pgvector) et le TF-IDF local pour retrouver les chunks les plus pertinents. |
| **IRT** | Item Response Theory — modèle psychométrique utilisé pour adapter la difficulté des questions (2-up/1-down). |
| **LMD** | Licence-Master-Doctorat — réforme universitaire adoptée en Mauritanie. |
| **Masrivi** | Service de mobile money de Mattel (opérateur télécom mauritanien). Dominant dans les zones péri-urbaines et chez les commerçants informels. |
| **MEN** | Ministère de l'Éducation Nationale de Mauritanie — éditeur des manuels officiels. |
| **MRR** | Monthly Recurring Revenue — revenus récurrents mensuels. |
| **MRU** | Ouguiya mauritanien — devise nationale. Taux de référence : 1 EUR ≈ 40 MRU (2026). |
| **NSM** | North Star Metric — questions résolues / élève actif / semaine. |
| **pgvector** | Extension PostgreSQL pour le stockage et la recherche de vecteurs d'embeddings. |
| **Prof Moctar** | ⚠️ **Nom immuable** de l'IA de MedNum. Ce nom ne doit JAMAIS être changé. Ancré culturellement (prénom mauritanien répandu). |
| **RAG** | Retrieval Augmented Generation — architecture IA où le LLM génère ses réponses en s'appuyant uniquement sur des chunks pertinents récupérés dans la base vectorielle. |
| **RLS** | Row-Level Security — fonctionnalité Supabase/PostgreSQL contrôlant l'accès aux données par utilisateur. |
| **RTL** | Right-To-Left — sens d'écriture de l'arabe. L'interface arabe de MedNum nécessite une adaptation RTL complète (layout, typographie, sens du scroll React Native). |
| **Sedad** | Plateforme de paiement électronique mauritanienne acceptant les cartes CCP et virements bancaires locaux. |
| **Skill tree** | Représentation visuelle des chapitres d'une matière sous forme d'arbre. Nœuds verrouillés/déverrouillés selon le score de maîtrise. |
| **Soninké** | Langue nationale mauritanienne (aussi appelée sarakollé). Communauté présente dans le sud de la Mauritanie. Langue cible Phase 3 MedNum. |
| **Streak** | Nombre de jours consécutifs d'utilisation de l'app. |
| **TF-IDF** | Term Frequency-Inverse Document Frequency — algorithme de recherche textuelle classique, utilisé en complément des vecteurs dans hybridSearch. |
| **XP** | Points d'expérience — système de récompense gamification. |

---

*MedNum PRD v1.0 — Mai 2026 — Confidentiel*
*Dernière mise à jour : Mai 2026*
