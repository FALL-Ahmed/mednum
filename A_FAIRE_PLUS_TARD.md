# Axone — à faire plus tard

Liste de ce qui reste, pour ne rien oublier. Dernière mise à jour : 30 septembre 2026.

## 1. Quand le vrai site sera en ligne (adresse à remplacer : `https://TON-DOMAINE`)

À faire dans cet ordre, **le jour de la mise en ligne** :

- [ ] **Google Cloud** → Identifiants → ton ID client OAuth → **Origines JavaScript autorisées** : ajouter
  `https://TON-DOMAINE` (garder `http://localhost:3002` pour les tests).
- [ ] **Supabase** → Authentication → URL Configuration :
  - **Site URL** : remplacer `http://localhost:3002` par `https://TON-DOMAINE`.
  - **Redirect URLs** : ajouter `https://TON-DOMAINE/**`.
- [ ] **Hébergeur du site** (Vercel ou autre) : ajouter les variables d'environnement
  `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` et `NEXT_PUBLIC_GOOGLE_CLIENT_ID`
  (modèle dans `web/.env.example`).
- [ ] Tester la connexion Google **sur le vrai domaine**, pas seulement en local.
- [ ] Remplacer les liens vides du pied de page (Confidentialité, Conditions) par de vraies pages :
  Google les demandera dans l'écran de consentement dès que l'app sera vérifiée.

## 2. Connexion Google : deux limites connues

1. **App mobile** : le lien Google passe par le navigateur et affiche encore l'adresse du serveur Supabase
   (`zhrnqqcobyrtyqxngwru.supabase.co`) au lieu de « Axone ». La version qui affiche le nom demande une app
   compilée (pas Expo Go) avec la connexion Google native. À faire au moment de publier l'app sur les stores.
2. **Site, si l'ID client Google n'est pas renseigné** : la page retombe sur l'ancien bouton, qui fonctionne mais
   montre aussi l'adresse Supabase. Vérifier que `NEXT_PUBLIC_GOOGLE_CLIENT_ID` est bien défini en production.
   - Option payante pour supprimer l'adresse partout : un domaine personnalisé Supabase (par ex. `auth.TON-DOMAINE`),
     disponible avec une offre payante.

## 3. Contenu du site à compléter

- [ ] **Vrais avis d'étudiants** (prénom, filière, année, accord de la personne) à mettre dans `REVIEWS`
  dans `web/src/app/page.tsx`. Tant que la liste est vide, la section n'apparaît pas en production.
  Les 3 avis actuels (Mariem, Cheikh, Awa) sont **fictifs** et n'existent qu'en développement.
- [ ] **Captures d'écran réelles de l'app** (chat, fiche, QCM) pour remplacer les maquettes.
- [ ] **Prix réels du Sénégal et du Maroc** (aujourd'hui : conversion indicative) dans `web/src/app/pricing.tsx`.
- [ ] **Ajouter un document depuis le site** est fait ; le **paiement depuis le site** ne l'est pas (le paiement
  se fait dans l'app).
- [x] Le **Duo** (révision à deux) est fait sur le site : QCM partagés, invité gratuit, progression en direct, comparaison,
  petite discussion (migration `20261006000000_duo.sql`). Reste : l'ajouter à l'**app mobile**, et des **flashcards à deux**.
  À demander à quelques étudiants : le prix du plan Duo et l'usage réel.
- [ ] Version **arabe** du site (l'app existe déjà en arabe).

## 4. Base de données et facturation

- [ ] Vérifier dans l'app, sur un vrai téléphone : lien du compte Google (Réglages → Compte), limite de documents,
  export PDF réservé aux plans payants, historique limité, écran d'abonnement avec Standard et Premium.
- [ ] Tester un paiement complet : demande dans l'app → reçu dans `payment-screenshots` → activation par requête SQL
  (`supabase/ops/facturation.sql`, requête 2c) → le plan passe à Standard dans l'app et sur le site.
- [ ] **Page « Abonnements » de l'admin** : elle lit d'anciennes colonnes (téléphone, dates de début/fin) et ne
  correspond plus à la base. À refaire pour activer/refuser les demandes sans passer par le SQL.
- [ ] Les reçus de paiement sont dans un espace **public** (noms de fichiers aléatoires). Envisager un espace privé
  avec liens temporaires.
- [ ] Plus tard : supprimer les clés IA de secours (Mistral, Gemini, Groq) embarquées dans l'app.
- [ ] Les anciennes tables `quota_usage` et `user_quotas` ne sont plus utilisées ; les supprimer après quelques
  semaines sans problème.
- [ ] Mettre à jour les prix ou les limites quand tu veux : requêtes 2f et 2g dans `supabase/ops/facturation.sql`.

## 5. Compte unique mobile + site

- [ ] Synchroniser l'historique des conversations, l'XP, la série et les flashcards côté serveur (aujourd'hui ils
  ne restent que sur le téléphone, le site ne les voit pas).
- [ ] Écran « J'ai déjà un compte Axone » dès l'inscription dans l'app (aujourd'hui seulement dans Réglages).

## 6. Espace connecté du site (barre latérale) : ce qui reste

Fait : Accueil, Mes cours (ajout, suppression), Dr. Ahmed, cours avec Questions / Fiche / QCM / Flashcards / Cas
cliniques, Planning (calendrier mensuel), Pomodoro, Abonnement avec paiement, Compte.

- [ ] **Générer** fiches, flashcards et cas cliniques depuis le site (aujourd'hui le site affiche ce qui a été généré
  dans l'application ; les QCM et les questions sont générés sur le site).
- [ ] **Historique des conversations** sur le site (il reste uniquement sur le téléphone aujourd'hui).
- [ ] Flashcards : répétition espacée (notation À revoir / Difficile / Bien / Facile) comme dans l'application.
- [ ] Planning : vue semaine, rappels, glisser-déposer d'une session vers un autre jour.
- [ ] Pomodoro : continuer le minuteur si l'onglet est fermé, notification du navigateur en fin de bloc.
- [ ] Paiement sur le site pour le Sénégal et le Maroc (aujourd'hui : contact WhatsApp).
- [ ] Afficher l'état des demandes de paiement en attente (l'étudiant ne les voit pas encore).
- [ ] Vérifier sur un vrai compte, de bout en bout : ajout d'un PDF, questions, QCM, planning, pomodoro, demande
  d'abonnement. Ces parcours ont été construits et contrôlés visuellement, mais pas essayés avec une vraie session.

## 7. Discussion (chat) : ce qui reste

- [ ] Appliquer la migration `20260930040000_chat_history.sql` (2 blocs), déployer `ask` et `transcribe`, et définir le
  secret `GROQ_API_KEY` : sans cela l'historique, la dictée vocale et la lecture sécurisée des images ne sont pas actifs.
- [ ] Envoyer aussi des documents (PDF) en pièce jointe dans la discussion (aujourd'hui : images seulement).
- [ ] Titres de discussion générés par l'IA (aujourd'hui : début de la première question).
- [ ] Partager une discussion par lien, exporter en PDF.
- [ ] Unifier l'historique du site et celui de l'application mobile (aujourd'hui séparés).
- [ ] Onglet « Questions » à l'intérieur d'un cours : il utilise encore l'ancien panneau simple ; le remplacer par la
  nouvelle discussion (avec historique, images et voix) pré-liée au cours.

## 8. Dictée vocale : pistes d'amélioration

- [ ] Tester avec de vrais étudiants (micro d'ordinateur, bruit de salle, accents, mélange français/arabe) et noter
  les erreurs récurrentes. Les tests faits jusqu'ici utilisent des voix de synthèse.
- [ ] Le hassaniya et le wolof sont mal reconnus par les moteurs actuels. Si besoin, essayer un second moteur
  (par exemple ElevenLabs Scribe ou Google Chirp) et comparer sur des enregistrements réels.
- [ ] Sur un bruit extrême, le moteur peut inventer un texte plausible : le site prévient quand le bruit est fort,
  mais cela ne remplace pas la relecture par l'étudiant.
- [ ] Dictée sur l'application mobile : elle utilise encore Whisper avec une clé dans l'application ; la passer par la
  fonction `transcribe` du serveur.

## 9. Paiements par pays

- [ ] **Mauritanie (KitPay)** : déployer ou obtenir une instance KitPay, créer le compte marchand (KYC), puis définir les
  secrets `KITPAY_BASE_URL`, `KITPAY_API_KEY`, `KITPAY_WEBHOOK_SECRET`, `SITE_URL`, enregistrer le webhook
  (`.../functions/v1/kitpay-webhook`, événements payment.succeeded / expired / cancelled), appliquer la migration
  `20260930050000_kitpay.sql`. Tester d'abord en mode test (`kp_test_…`) avec `POST /api/v1/test/simulate-payment`.
- [ ] KitPay lit les SMS d'un téléphone Android : ce téléphone doit rester allumé, connecté et avec l'application de
  transfert installée. Prévoir un second téléphone de secours et une alerte si les SMS n'arrivent plus.
- [ ] KitPay gère aussi BIM et BCIPAY : ajouter ces deux moyens (logos + correspondance) si tu les encaisses.
- [ ] Logo de **Click** : le fichier de l'application est identique à celui de Sedad.
- [ ] **Sénégal** : choisir un agrégateur (PayDunya ou CinetPay en priorité : mobile money Wave/Orange/Free + cartes via une
  seule API), vérifier qu'une société mauritanienne peut ouvrir un compte marchand et recevoir les fonds, puis brancher
  sur le même modèle que KitPay (fonction de création + webhook signé).
- [ ] **Maroc** : cartes marocaines = CMI (via banque) ou un agrégateur qui l'enveloppe (YouCan Pay, Payzone). Stripe n'est
  pas disponible pour une entreprise marocaine. Vérifier l'éligibilité d'une société mauritanienne avant de s'engager.
