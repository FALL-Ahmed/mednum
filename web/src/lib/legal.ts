import type { Lang } from "./site-i18n";

/*
  Textes légaux d'Axone (confidentialité et conditions), en français et en arabe.
  Brouillon rédigé pour le fonctionnement réel du produit : à faire relire par un juriste avant d'en faire un engagement définitif.
*/

export type LegalDoc = { title: string; updated: string; intro: string; sections: { h: string; p: string[] }[] };
export const LEGAL_UPDATED = "7 octobre 2026";

const WA = "+222 41 51 32 11";

const privacyFr: LegalDoc = {
  title: "Politique de confidentialité",
  updated: `Dernière mise à jour : ${LEGAL_UPDATED}`,
  intro:
    "Axone t'aide à réviser tes cours de médecine et de pharmacie. Cette page explique, simplement, quelles informations nous gardons, pourquoi, et comment tu gardes la main dessus.",
  sections: [
    {
      h: "1. Qui est responsable",
      p: ["Axone est édité par Loop IA (Mauritanie). Pour toute question sur tes données, écris-nous sur WhatsApp au " + WA + "."],
    },
    {
      h: "2. Les informations que nous gardons",
      p: [
        "Ton compte : le nom et l'adresse e-mail de ton compte Google, utilisés pour te connecter. Nous ne voyons jamais ton mot de passe Google.",
        "Ton profil : ton prénom, ton pays, ta filière, ton année et, si tu le renseignes, ton université.",
        "Ce que tu déposes et ce que tu fais : tes cours (PDF, images, texte) et le fichier d'origine de chaque cours, tes questions à Dr. Ahmed et l'historique des discussions, les fiches, flashcards, QCM et cas cliniques créés, ta progression, tes planning et sessions à deux.",
        "Ton abonnement : le plan choisi, le montant, le moyen de paiement, la référence, la capture du reçu que tu envoies et, si tu le saisis, le numéro avec lequel tu paies.",
        "Des données techniques : ton navigateur, ton appareil, les erreurs rencontrées dans l'application et des statistiques d'utilisation (pages visitées, étapes franchies) pour améliorer le service.",
      ],
    },
    {
      h: "3. Pourquoi nous les utilisons",
      p: [
        "Pour faire fonctionner Axone : générer tes fiches et tes QCM, répondre à tes questions, retrouver ton historique, appliquer les limites de ton offre.",
        "Pour vérifier tes paiements et activer ton abonnement.",
        "Pour te prévenir quand ton abonnement se termine, répondre à ton support et corriger les erreurs.",
        "Pour comprendre comment le produit est utilisé et l'améliorer, de façon globale.",
        "Les cours que tu déposes alimentent une banque de cours interne : nous en conservons une copie du fichier d'origine, de façon confidentielle (jamais visible par les autres étudiants, seule l'équipe d'Axone y accède) afin d'améliorer nos services : qualité des fiches et des QCM, lecture des documents scannés, contenus proposés.",
        "Nous ne vendons pas tes données et nous n'affichons pas de publicité.",
      ],
    },
    {
      h: "4. L'intelligence artificielle",
      p: [
        "Pour répondre, Axone envoie tes questions, les extraits de tes cours concernés et, si tu en joins, tes images à des fournisseurs d'intelligence artificielle (notamment Anthropic, Google et Groq). Ils les traitent pour produire la réponse. Évite d'y déposer des informations personnelles sur des patients.",
      ],
    },
    {
      h: "5. Les services qui nous aident",
      p: [
        "Supabase héberge la base de données et les fichiers. Google gère la connexion et la mesure d'audience du site. Microsoft Clarity enregistre de façon anonyme les clics et les parcours des visiteurs sur les pages publiques (accueil, connexion), jamais dans ton espace de travail. Les paiements en ligne passent par des prestataires de paiement (PayDunya, KitPay) quand ils sont disponibles ; les paiements par reçu sont vérifiés par notre équipe. Le site est hébergé par un prestataire d'hébergement web.",
        "Ces services peuvent traiter des données hors de ton pays.",
      ],
    },
    {
      h: "6. Cookies et stockage dans ton navigateur",
      p: [
        "Axone garde dans ton navigateur ce qui est nécessaire : ta session de connexion et tes préférences (langue, repères de progression). Google Analytics et Microsoft Clarity mesurent la fréquentation et l'usage des pages publiques. Tu peux bloquer ou effacer ces données dans les réglages de ton navigateur ; la connexion ne fonctionnera alors plus.",
      ],
    },
    {
      h: "7. Combien de temps",
      p: [
        "Nous gardons tes données tant que ton compte existe. Si tu supprimes un cours, la copie de son fichier est supprimée avec lui. Si tu supprimes ton compte, ton profil, tes cours (et leurs fichiers), tes historiques et tes créations sont effacés.",
        "Les enregistrements de paiement (montant, date, offre) sont conservés sans ton nom ni ton reçu, pour notre comptabilité. Les journaux d'erreurs sont gardés une durée limitée.",
      ],
    },
    {
      h: "8. Tes droits",
      p: [
        "Tu peux modifier ton profil à tout moment dans la page Compte. Tu peux supprimer ton compte et tes données toi-même : Compte, puis « Supprimer mon compte ». Tu peux aussi nous demander une copie de tes données ou une correction sur WhatsApp au " + WA + ".",
      ],
    },
    {
      h: "9. Sécurité",
      p: [
        "Tes cours sont rattachés à ton compte et ne sont pas visibles par les autres étudiants. Nous protégeons l'accès par connexion sécurisée, mais aucun service n'est sûr à 100 % : garde l'accès à ton compte Google en sécurité.",
      ],
    },
    {
      h: "10. Changements",
      p: ["Si cette politique change de façon importante, nous te le dirons dans l'application. La date de mise à jour est en haut de cette page."],
    },
  ],
};

const termsFr: LegalDoc = {
  title: "Conditions d'utilisation",
  updated: `Dernière mise à jour : ${LEGAL_UPDATED}`,
  intro: "En utilisant Axone, tu acceptes ces conditions. Elles sont courtes et écrites pour être comprises.",
  sections: [
    {
      h: "1. Ce qu'est Axone",
      p: [
        "Axone est un outil de révision pour les étudiants en médecine et en pharmacie : à partir de tes cours, il crée des fiches, des flashcards, des QCM et des cas cliniques, et répond à tes questions via Dr. Ahmed.",
        "Axone est un outil d'aide à l'étude. Il ne remplace ni tes cours, ni tes enseignants, ni un avis médical. Il ne doit jamais servir à décider de soins pour un patient.",
      ],
    },
    {
      h: "2. Ton compte",
      p: [
        "Tu te connectes avec ton compte Google. Tu es responsable de l'usage fait avec ton compte. Un compte est personnel : ne le partage pas.",
      ],
    },
    {
      h: "3. Les offres et les limites",
      p: [
        "Axone propose une offre Gratuite et des offres payantes (Standard, Premium). Chaque offre a des limites par jour (questions, QCM, contenus) et par compte (nombre de cours, historique), affichées sur la page des tarifs. Ces limites peuvent évoluer.",
        "Les prix sont affichés dans la devise de ton pays. Des promotions peuvent s'appliquer pendant une durée limitée ; le prix affiché avant de payer est celui demandé.",
      ],
    },
    {
      h: "4. Le paiement",
      p: [
        "Tu paies pour un mois ou pour un an. L'abonnement ne se renouvelle pas automatiquement : à la fin, tu choisis de le renouveler ou non.",
        "En Mauritanie, tu envoies le montant exact au numéro indiqué dans l'application (Bankily, Masrivi, Sedad ou Click), puis tu ajoutes la capture du reçu. Ton plan est activé après vérification, en général sous 24 heures. D'autres moyens de paiement arrivent progressivement dans d'autres pays.",
      ],
    },
    {
      h: "5. Remboursement",
      p: [
        "Tu peux demander un remboursement dans les 7 jours qui suivent l'activation de ton abonnement, en nous écrivant sur WhatsApp au " + WA + ". Nous te remboursons par le même moyen, hors éventuels frais de transfert.",
        "Si ton paiement a été reçu mais que ton plan n'a pas été activé, ou si un problème de notre côté t'empêche d'utiliser le service de façon durable, nous corrigeons ou nous te remboursons.",
      ],
    },
    {
      h: "6. Ce que tu t'engages à faire",
      p: [
        "Déposer uniquement des contenus que tu as le droit d'utiliser pour tes études. Tes cours restent à toi ; tu nous autorises à les traiter pour te fournir le service et à en conserver une copie, en toute confidentialité, pour améliorer Axone.",
        "Ne pas tenter de contourner les limites, de copier le service, de surcharger les serveurs, ni de déposer des contenus illégaux ou qui portent atteinte à d'autres.",
      ],
    },
    {
      h: "7. Les réponses de l'IA",
      p: [
        "Les réponses, fiches et QCM sont générés par une intelligence artificielle à partir de tes cours. Ils peuvent comporter des erreurs ou des oublis. Vérifie toujours avec ton cours et tes enseignants. Tu peux nous signaler une erreur depuis la question concernée.",
      ],
    },
    {
      h: "8. Disponibilité",
      p: [
        "Nous faisons de notre mieux pour que le service soit disponible, mais nous ne pouvons pas garantir qu'il fonctionne sans interruption. Nous pouvons le faire évoluer ou le suspendre pour maintenance.",
      ],
    },
    {
      h: "9. Suspension et fin",
      p: [
        "Tu peux arrêter à tout moment et supprimer ton compte depuis la page Compte. Nous pouvons suspendre un compte qui ne respecte pas ces conditions, après t'avoir prévenu quand c'est possible.",
      ],
    },
    {
      h: "10. Responsabilité",
      p: [
        "Axone est fourni tel quel. Dans la limite permise par la loi, notre responsabilité est limitée au montant que tu as payé pour la période en cours. Nous ne sommes pas responsables des résultats d'examen.",
      ],
    },
    {
      h: "11. Droit applicable et contact",
      p: [
        "Ces conditions sont régies par le droit mauritanien. Pour toute question ou réclamation, écris-nous sur WhatsApp au " + WA + ".",
        "Voir aussi notre politique de confidentialité.",
      ],
    },
  ],
};

const privacyAr: LegalDoc = {
  title: "سياسة الخصوصية",
  updated: "آخر تحديث: 7 أكتوبر 2026",
  intro: "يساعدك أكسون على مراجعة دروس الطب والصيدلة. توضّح هذه الصفحة ببساطة المعلومات التي نحتفظ بها ولماذا، وكيف تتحكّم فيها.",
  sections: [
    { h: "1. الجهة المسؤولة", p: ["يُصدر أكسون شركة Loop IA (موريتانيا). لأي سؤال حول بياناتك راسلنا عبر واتساب على الرقم " + WA + "."] },
    {
      h: "2. المعلومات التي نحتفظ بها",
      p: [
        "حسابك: اسم وبريد حساب جوجل المستخدم لتسجيل الدخول. لا نرى كلمة مرور جوجل أبدًا.",
        "ملفك: اسمك الأول وبلدك وتخصصك وسنتك الدراسية وجامعتك إن أدخلتها.",
        "ما ترفعه وما تفعله: دروسك (ملفات PDF وصور ونصوص) والملف الأصلي لكل درس، أسئلتك لـ Dr. Ahmed وسجل المحادثات، والملخصات والبطاقات والأسئلة متعددة الاختيارات والحالات السريرية التي أُنشئت، وتقدّمك وجدولك وجلسات المراجعة الثنائية.",
        "اشتراكك: الخطة المختارة والمبلغ ووسيلة الدفع والمرجع ولقطة الإيصال التي ترسلها، والرقم الذي تدفع به إن أدخلته.",
        "بيانات تقنية: المتصفح والجهاز والأخطاء التي تظهر في التطبيق وإحصاءات الاستخدام (الصفحات والخطوات) لتحسين الخدمة.",
      ],
    },
    {
      h: "3. لماذا نستخدمها",
      p: [
        "لتشغيل أكسون: إنشاء ملخصاتك وأسئلتك، والإجابة عن أسئلتك، واسترجاع سجلّك، وتطبيق حدود خطتك.",
        "للتحقق من مدفوعاتك وتفعيل اشتراكك.",
        "لتنبيهك عند قرب انتهاء الاشتراك، والرد على الدعم وإصلاح الأخطاء.",
        "لفهم كيفية استخدام المنتج وتحسينه بشكل عام.",
        "الدروس التي ترفعها تغذّي «بنك دروس» داخليًا: نحتفظ بنسخة من الملف الأصلي بشكل سري (لا يراها الطلاب الآخرون، ولا يطّلع عليها إلا فريق أكسون) لتحسين خدماتنا: جودة الملخصات والأسئلة وقراءة المستندات الممسوحة ضوئيًا والمحتويات المقترحة.",
        "لا نبيع بياناتك ولا نعرض إعلانات.",
      ],
    },
    {
      h: "4. الذكاء الاصطناعي",
      p: [
        "للإجابة، يرسل أكسون أسئلتك ومقاطع دروسك المعنية، وصورك إن أرفقتها، إلى مزوّدي ذكاء اصطناعي (منهم Anthropic وGoogle وGroq) لمعالجتها وإنتاج الإجابة. تجنّب رفع معلومات شخصية عن المرضى.",
      ],
    },
    {
      h: "5. الخدمات التي تساعدنا",
      p: [
        "تستضيف Supabase قاعدة البيانات والملفات. وتدير Google تسجيل الدخول وقياس زيارات الموقع. وتسجّل Microsoft Clarity بشكل مجهول النقرات وتنقّل الزوار في الصفحات العامة (الرئيسية وتسجيل الدخول)، ولا تسجّل أبدًا داخل مساحة عملك. تمرّ المدفوعات عبر الإنترنت عبر مزوّدي دفع (PayDunya وKitPay) عند توفرهم؛ أما الدفع بالإيصال فيتحقق منه فريقنا. يُستضاف الموقع لدى مزوّد استضافة.",
        "قد تعالج هذه الخدمات البيانات خارج بلدك.",
      ],
    },
    {
      h: "6. ملفات الارتباط والتخزين في متصفحك",
      p: [
        "يحتفظ أكسون في متصفحك بما هو ضروري: جلسة تسجيل الدخول وتفضيلاتك (اللغة وعلامات التقدّم). وتقيس Google Analytics وMicrosoft Clarity زيارات الصفحات العامة واستخدامها. يمكنك حظر هذه البيانات أو حذفها من إعدادات المتصفح، وعندها لن يعمل تسجيل الدخول.",
      ],
    },
    {
      h: "7. مدة الاحتفاظ",
      p: [
        "نحتفظ ببياناتك ما دام حسابك موجودًا. إذا حذفت درسًا حُذفت معه نسخة ملفه. وإذا حذفت حسابك تُمحى بياناتك الشخصية ودروسك (وملفاتها) وسجلاتك وما أنشأته.",
        "تُحفظ سجلات الدفع (المبلغ والتاريخ والخطة) دون اسمك ودون إيصالك لأغراض المحاسبة. وتُحفظ سجلات الأخطاء لمدة محدودة.",
      ],
    },
    {
      h: "8. حقوقك",
      p: [
        "يمكنك تعديل ملفك في أي وقت من صفحة الحساب. ويمكنك حذف حسابك وبياناتك بنفسك: الحساب ثم «حذف حسابي». ويمكنك أيضًا طلب نسخة من بياناتك أو تصحيحها عبر واتساب على الرقم " + WA + ".",
      ],
    },
    {
      h: "9. الأمان",
      p: ["دروسك مرتبطة بحسابك ولا يراها الطلاب الآخرون. نحمي الوصول بتسجيل دخول آمن، لكن لا توجد خدمة آمنة بنسبة 100%؛ حافظ على أمان حساب جوجل الخاص بك."],
    },
    { h: "10. التغييرات", p: ["إذا تغيّرت هذه السياسة تغييرًا مهمًا فسنخبرك داخل التطبيق. تاريخ التحديث مذكور أعلى هذه الصفحة."] },
  ],
};

const termsAr: LegalDoc = {
  title: "شروط الاستخدام",
  updated: "آخر تحديث: 7 أكتوبر 2026",
  intro: "باستخدامك أكسون فإنك توافق على هذه الشروط. وهي مختصرة ومكتوبة لتُفهم بسهولة.",
  sections: [
    {
      h: "1. ما هو أكسون",
      p: [
        "أكسون أداة مراجعة لطلاب الطب والصيدلة: انطلاقًا من دروسك ينشئ ملخصات وبطاقات وأسئلة متعددة الاختيارات وحالات سريرية، ويجيب عن أسئلتك عبر Dr. Ahmed.",
        "أكسون أداة مساعدة على الدراسة، ولا يحلّ محلّ دروسك ولا أساتذتك ولا الاستشارة الطبية، ويجب ألا يُستخدم أبدًا لاتخاذ قرارات علاج لمريض.",
      ],
    },
    { h: "2. حسابك", p: ["تسجّل الدخول بحساب جوجل. أنت مسؤول عن الاستخدام الذي يتم بحسابك. الحساب شخصي فلا تشاركه."] },
    {
      h: "3. الخطط والحدود",
      p: [
        "يوفّر أكسون خطة مجانية وخططًا مدفوعة (Standard وPremium). لكل خطة حدود يومية (الأسئلة والاختبارات والمحتويات) وحدود للحساب (عدد الدروس والسجل) معروضة في صفحة الأسعار، وقد تتغيّر.",
        "تُعرض الأسعار بعملة بلدك. قد تُطبَّق عروض لمدة محدودة، والسعر المعروض قبل الدفع هو السعر المطلوب.",
      ],
    },
    {
      h: "4. الدفع",
      p: [
        "تدفع لمدة شهر أو سنة. لا يتجدد الاشتراك تلقائيًا: في نهايته تختار تجديده أو لا.",
        "في موريتانيا ترسل المبلغ بالضبط إلى الرقم المعروض في التطبيق (Bankily أو Masrivi أو Sedad أو Click) ثم تضيف لقطة الإيصال. يُفعَّل اشتراكك بعد التحقق، عادةً خلال 24 ساعة. وستتوفر وسائل دفع أخرى تدريجيًا في بلدان أخرى.",
      ],
    },
    {
      h: "5. الاسترداد",
      p: [
        "يمكنك طلب استرداد المبلغ خلال 7 أيام من تفعيل اشتراكك بمراسلتنا عبر واتساب على الرقم " + WA + ". نردّ المبلغ بالوسيلة نفسها دون احتساب رسوم التحويل إن وُجدت.",
        "إذا استلمنا دفعتك ولم تُفعَّل خطتك، أو منعك خطأ من جانبنا من استخدام الخدمة بشكل مستمر، فإننا نصلح الأمر أو نردّ المبلغ.",
      ],
    },
    {
      h: "6. التزاماتك",
      p: [
        "ألا ترفع إلا محتوى يحق لك استخدامه في دراستك. دروسك تبقى لك، وتأذن لنا بمعالجتها لتقديم الخدمة وبالاحتفاظ بنسخة منها بشكل سري لتحسين أكسون.",
        "ألا تحاول تجاوز الحدود أو نسخ الخدمة أو إرهاق الخوادم، ولا ترفع محتوى غير قانوني أو يضرّ بالآخرين.",
      ],
    },
    {
      h: "7. إجابات الذكاء الاصطناعي",
      p: ["تُنتج الإجابات والملخصات والأسئلة بالذكاء الاصطناعي انطلاقًا من دروسك، وقد تحتوي على أخطاء أو سهو. تحقّق دائمًا من درسك وأساتذتك. يمكنك التبليغ عن خطأ من السؤال المعني."],
    },
    { h: "8. توفّر الخدمة", p: ["نبذل جهدنا لتكون الخدمة متاحة، لكن لا نضمن عملها دون انقطاع. قد نطوّرها أو نوقفها مؤقتًا للصيانة."] },
    { h: "9. التعليق والإنهاء", p: ["يمكنك التوقف في أي وقت وحذف حسابك من صفحة الحساب. وقد نعلّق حسابًا لا يحترم هذه الشروط بعد تنبيهك عند الإمكان."] },
    { h: "10. المسؤولية", p: ["يُقدَّم أكسون كما هو. في الحدود التي يسمح بها القانون تقتصر مسؤوليتنا على المبلغ الذي دفعته عن الفترة الجارية. ولسنا مسؤولين عن نتائج الامتحانات."] },
    {
      h: "11. القانون المطبق والتواصل",
      p: ["تخضع هذه الشروط للقانون الموريتاني. لأي سؤال أو شكوى راسلنا عبر واتساب على الرقم " + WA + ".", "راجع أيضًا سياسة الخصوصية."],
    },
  ],
};

export const LEGAL: Record<"privacy" | "terms", Record<Lang, LegalDoc>> = {
  privacy: { fr: privacyFr, ar: privacyAr },
  terms: { fr: termsFr, ar: termsAr },
};
