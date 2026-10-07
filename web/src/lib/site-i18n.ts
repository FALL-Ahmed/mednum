/* Textes du site public (accueil, tarifs, connexion) en français et en arabe. */

export type Lang = "fr" | "ar";

export const isRtl = (l: Lang) => l === "ar";
export const prefix = (l: Lang) => (l === "ar" ? "/ar" : "");

const FR = {
  htmlTitle: "Axone — Dépose ton cours, retiens-le",
  htmlDescription:
    "Axone transforme tes cours en fiches, QCM, flashcards et cas cliniques. Pour les étudiants en médecine et pharmacie de Mauritanie, du Sénégal et du Maroc.",
  switchLabel: "العربية",
  switchHref: "/ar",
  whatsappText: "Bonjour, j'ai une question sur Axone.",
  nav: { features: "Fonctions", pricing: "Tarifs", faq: "FAQ", login: "Se connecter" },
  hero: {
    label: "Révision · Médecine et pharmacie",
    line1: "Dépose ton cours.",
    line2: "Retiens-le.",
    text: "Axone transforme tes cours en fiches, QCM, flashcards et cas cliniques. Dr. Ahmed répond à tes questions : il part de ton cours, puis va plus loin quand il le faut.",
    cta: "Essayer gratuitement",
    countries: "Pour les étudiants de Mauritanie, du Sénégal et du Maroc",
    alt: "Dr. Ahmed, ton prof virtuel",
    chip: "Dr. Ahmed · ton prof virtuel",
  },
  proof: (n: string) => ({ before: "Utilisé par plus de", n, after: "étudiants" }),
  weekQuestions: "questions posées à Dr. Ahmed cette semaine par des étudiants en santé.",
  features: {
    label: "Ce que fait Axone",
    title: "Du cours à l'examen, sans perdre le signal.",
    around: "Et tout autour",
    ariaTabs: "Fonctions d'Axone",
  },
  tabs: [
    { id: "questions", label: "Questions", title: "Une notion bloque ? Demande à Dr. Ahmed.", text: "Écris, parle ou envoie une photo. La réponse part de ton cours, va plus loin si besoin, et finit par ce qu'il faut retenir." },
    { id: "fiches", label: "Fiches", title: "Ton cours, en une page.", text: "Chaque chapitre devient une fiche avec ce qui tombe en compo. Tu l'exportes en PDF ou tu la partages avec ta promo." },
    { id: "qcm", label: "QCM", title: "Des QCM comme en faculté.", text: "Plusieurs propositions exactes, notation complète, partielle ou fausse. Tu vois ce que tu as oublié, avec la correction." },
    { id: "flashcards", label: "Flashcards", title: "Ce qui résiste revient plus vite.", text: "Tu te notes carte par carte. La répétition espacée te représente chaque notion au bon moment." },
    { id: "cas", label: "Cas cliniques", title: "Raisonne comme en stage.", text: "Histoire, hypothèses, examen, examens complémentaires, diagnostic. Tu réponds à chaque étape avant de voir la suite." },
  ],
  included: [
    { t: "Réviser à deux", d: "Invite un ami (gratuit pour lui), faites la même série de QCM et comparez vos réponses." },
    { t: "PDF, scans et photos", d: "Dépose ton cours en PDF, même scanné, ou prends-le en photo : il est lu et découpé tout seul." },
    { t: "Voix et photo", d: "Pose ta question à l'oral ou photographie la page." },
    { t: "Lecture à voix haute", d: "Dr. Ahmed lit ses réponses : utile dans le bus." },
    { t: "Pomodoro et sons", d: "Séances chronométrées, avec musique et bruits de nature." },
    { t: "Planning et série", d: "Planifie tes sessions et garde ta série de jours." },
    { t: "Historique", d: "Retrouve tes conversations et tes séries de QCM." },
  ],
  reviews: { label: "Ce que disent les étudiants", title: "Ils révisent déjà avec Axone." },
  pricingSection: { label: "Tarifs", title: "Commence gratuit. Passe au payant quand tu veux." },
  faq: {
    label: "FAQ",
    title: "Des questions ?",
    items: [
      { q: "Axone remplace-t-il mes cours ?", a: "Non. Il part de tes cours pour t'aider à les apprendre. Pour les points importants, vérifie toujours avec tes enseignants." },
      { q: "D'où viennent les réponses ?", a: "D'abord de tes documents, avec la page source. Si ta question va plus loin que ton cours, Dr. Ahmed développe avec des connaissances médicales établies, dans une partie séparée « Pour aller plus loin ». Pour tout ce qui doit être exact au chiffre près (doses, seuils), vérifie avec tes enseignants." },
      {
        q: "Comment je paie ?",
        a: "En Mauritanie, avec Bankily, Masrivi, Sedad ou Click : tu envoies la capture de ton paiement et ton plan est activé après vérification. Au Sénégal, par mobile money (Wave, Orange Money…) ou carte bancaire, et au Maroc par carte bancaire : ces moyens arrivent bientôt, et en attendant tu peux nous écrire sur WhatsApp.",
      },
      { q: "Quels fichiers puis-je ajouter ?", a: "Des PDF, même scannés, des photos de tes pages de cours (plusieurs à la fois) ou des fichiers .txt. Pour une bonne lecture d'une photo : page bien à plat, bonne lumière, sans reflet." },
    ],
    other: "Une autre question ?",
    whatsapp: "Écris-nous sur WhatsApp",
  },
  cta: { title: "La rentrée est là. Révise dès la première semaine.", button: "Essayer gratuitement", whatsapp: "WhatsApp" },
  footer: { rights: "Axone · Mauritanie, Sénégal, Maroc", privacy: "Confidentialité", terms: "Conditions", whatsapp: "WhatsApp" },
  pricing: {
    countries: [
      { id: "mr", label: "Mauritanie", pay: "Paiement par Bankily, Masrivi, Sedad ou Click." },
      { id: "sn", label: "Sénégal", pay: "Paiement par mobile money (Wave, Orange Money…) ou carte bancaire, bientôt disponible." },
      { id: "ma", label: "Maroc", pay: "Paiement par carte bancaire, bientôt disponible." },
    ],
    aria: "Pays",
    perMonth: "/ mois",
    recommended: "Recommandé",
    promoUntil: (d: string) => `jusqu'au ${d}`,
    choose: "Choisir",
    indicative: " Prix indicatifs, ils peuvent changer à l'ouverture du marché.",
    free: { name: "Gratuit", text: "Pour découvrir Axone.", cta: "Commencer gratuitement" },
    standardText: "Pour réviser toute l'année.",
    duoText: "Pour la préparation intensive, à deux.",
    items: {
      docs: (n: number | null) => (n === null ? "Documents illimités" : `${n} ${n > 1 ? "documents actifs" : "document actif"}`),
      questions: (n: number) => `${n} ${n > 1 ? "questions" : "question"} par jour à Dr. Ahmed`,
      contents: (n: number) => `${n} ${n > 1 ? "fiches, flashcards ou cas cliniques" : "fiche, flashcards ou cas clinique"} par jour`,
      qcm: (n: number) => `${n * 5} questions de QCM par jour`,
      pdf: "Export des fiches en PDF",
      history: (d: number | null) => (d === null ? "Historique illimité" : `Historique de ${d} jours`),
      duo: "Révision à deux : QCM, flashcards, cas cliniques et salle avec Dr. Ahmed (invité gratuit)",
    },
  },
  demo: {
    hero: {
      aria: "Exemple de question posée à Dr. Ahmed",
      writing: "Dr. Ahmed écrit",
      keep: "À retenir · ",
      source: "Source : ",
      script: [
        { q: "Pourquoi l'insuffisance cardiaque gauche donne un œdème pulmonaire ?", a: "Le sang s'accumule en amont du ventricule gauche : la pression monte dans les veines pulmonaires et le plasma passe dans les alvéoles.", keep: "gauche = poumons, droite = corps.", src: "Cardiologie · p. 42" },
        { q: "Quel est le mécanisme des IEC ?", a: "Ils bloquent l'enzyme de conversion : moins d'angiotensine II, donc vasodilatation et baisse de l'aldostérone.", keep: "effet indésirable typique : la toux sèche.", src: "Pharmacologie · p. 118" },
        { q: "Bactériostatique ou bactéricide, quelle différence ?", a: "Un bactériostatique bloque la multiplication des bactéries : c'est ensuite le système immunitaire qui les élimine. Un bactéricide les détruit directement.", keep: "stase = elle s'arrête, cide = elle meurt.", src: "Infectiologie · p. 27" },
      ],
    },
    fiche: { label: "Fiche · Cardiologie · Chap. 5", title: "L'insuffisance cardiaque", text: "Le cœur n'assure plus un débit suffisant pour les besoins de l'organisme. Gauche : congestion pulmonaire. Droite : congestion systémique.", boxLabel: "Ce qui tombe en compo", points: ["Signes cliniques : insuffisance gauche vs droite", "Les causes principales", "Traitement de base : diurétiques, IEC, bêtabloquants"] },
    qcm: {
      label: "QCM · Question 4 sur 10",
      question: "Insuffisance cardiaque gauche : quelles propositions sont exactes ?",
      props: ["Dyspnée d'effort et orthopnée", "Crépitants pulmonaires", "Turgescence jugulaire isolée", "L'œdème aigu du poumon en est une complication", "L'hépatomégalie douloureuse est le signe cardinal"],
      forgot: "Oubliée",
      partial: "Partiel · 5 points",
      missing: "Il te manquait la D.",
    },
    chat: {
      label: "Question sur ton cours",
      q: "Pourquoi l'insuffisance cardiaque gauche donne un œdème pulmonaire, et la droite des œdèmes des jambes ?",
      a: "À gauche, le sang s'accumule en amont du ventricule : la pression monte dans les veines pulmonaires et le plasma passe dans les alvéoles. À droite, il s'accumule dans les veines du corps : jugulaires, foie, jambes.",
      keep: "gauche = poumons, droite = corps.",
      source: "Source : ton cours, page 42",
    },
    flash: { label: "Flashcards · 12 à revoir aujourd'hui", question: "Question", q: "Quels sont les 3 signes de la triade de Beck ?", hint: "Tu as la réponse ? Note-toi.", grades: ["À revoir", "Difficile", "Bien", "Facile"], note: "Ce que tu maîtrises revient plus tard. Ce qui résiste revient vite." },
    caseDemo: {
      label: "Cas clinique · Étape 2 sur 5",
      steps: ["Histoire", "Hypothèses", "Examen", "Examens complémentaires", "Diagnostic"],
      story: "Femme de 27 ans. Elle consulte pour une chute de la paupière et une vision double qui apparaissent en fin de journée et s'améliorent après le repos.",
      q: "Quelles hypothèses diagnostiques envisages-tu ?",
      placeholder: "Écris ton raisonnement…",
      note: "Dr. Ahmed corrige ton raisonnement étape par étape, comme en stage.",
    },
  },
  login: {
    title: "Connecte-toi pour réviser.",
    text: "Un seul clic avec ton compte Google. Pas de mot de passe à retenir.",
    loadingButton: "Chargement du bouton Google…",
    google: "Continuer avec Google",
    redirecting: "Redirection…",
    notConfigured: "La connexion n'est pas encore configurée.",
    failed: "Connexion impossible pour le moment. Réessaie dans un instant.",
    bullets: [
      "Dr. Ahmed part de tes cours, puis va plus loin quand ta question le demande.",
      "Fiches, QCM, flashcards et cas cliniques générés pour toi.",
      "Chaque étudiant ne voit que ses propres documents.",
    ],
    trouble: "Un souci pour te connecter ? Écris-nous sur",
    googleLocale: "fr",
  },
};

export type SiteDict = typeof FR;

const AR: SiteDict = {
  htmlTitle: "أكسون — ارفع درسك، واحفظه",
  htmlDescription:
    "يحوّل أكسون دروسك إلى ملخّصات وأسئلة QCM وبطاقات مراجعة وحالات سريرية. لطلبة الطب والصيدلة في موريتانيا والسنغال والمغرب.",
  switchLabel: "Français",
  switchHref: "/?l=fr",
  whatsappText: "مرحبًا، لدي سؤال عن أكسون.",
  nav: { features: "الميزات", pricing: "الأسعار", faq: "أسئلة شائعة", login: "تسجيل الدخول" },
  hero: {
    label: "مراجعة · الطب والصيدلة",
    line1: "ارفع درسك.",
    line2: "واحفظه.",
    text: "يحوّل أكسون دروسك إلى ملخّصات وأسئلة QCM وبطاقات مراجعة وحالات سريرية. ويجيب الدكتور أحمد عن أسئلتك: ينطلق من درسك، ثم يتوسّع عند الحاجة.",
    cta: "جرّب مجانًا",
    countries: "لطلبة موريتانيا والسنغال والمغرب",
    alt: "الدكتور أحمد، أستاذك الافتراضي",
    chip: "الدكتور أحمد · أستاذك الافتراضي",
  },
  proof: (n: string) => ({ before: "يستخدمه أكثر من", n, after: "طالب" }),
  weekQuestions: "سؤال طرحه طلبة العلوم الصحية على الدكتور أحمد هذا الأسبوع.",
  features: {
    label: "ماذا يفعل أكسون",
    title: "من الدرس إلى الامتحان، دون أن تفقد التركيز.",
    around: "وما حول ذلك",
    ariaTabs: "ميزات أكسون",
  },
  tabs: [
    { id: "questions", label: "الأسئلة", title: "فكرة مستعصية؟ اسأل الدكتور أحمد.", text: "اكتب أو تكلّم أو أرسل صورة. الجواب ينطلق من درسك ويتوسّع عند الحاجة، وينتهي بما يجب حفظه." },
    { id: "fiches", label: "الملخّصات", title: "درسك في صفحة واحدة.", text: "يتحوّل كل فصل إلى ملخّص يركّز على ما يأتي في الامتحان. صدّره بصيغة PDF أو شاركه مع دفعتك." },
    { id: "qcm", label: "أسئلة QCM", title: "أسئلة QCM كما في الكلية.", text: "عدة اقتراحات صحيحة، وتنقيط كامل أو جزئي أو خاطئ. ترى ما نسيته مع التصحيح." },
    { id: "flashcards", label: "بطاقات المراجعة", title: "ما يصعب عليك يعود أسرع.", text: "تقيّم نفسك بطاقة بطاقة. والتكرار المتباعد يعرض عليك كل فكرة في الوقت المناسب." },
    { id: "cas", label: "حالات سريرية", title: "فكّر كما في التربّص.", text: "القصة، الفرضيات، الفحص، الفحوص التكميلية، التشخيص. تجيب عن كل مرحلة قبل أن ترى التي بعدها." },
  ],
  included: [
    { t: "المراجعة مع صديق", d: "ادعُ صديقًا (مجانًا له)، وحلّا معًا نفس سلسلة QCM وقارنا إجاباتكما." },
    { t: "PDF وصور ومسح ضوئي", d: "ارفع درسك بصيغة PDF حتى لو كان ممسوحًا ضوئيًا، أو صوّره: يُقرأ ويُقسَّم تلقائيًا." },
    { t: "الصوت والصورة", d: "اطرح سؤالك شفهيًا أو صوّر الصفحة." },
    { t: "القراءة بصوت عالٍ", d: "يقرأ لك الدكتور أحمد إجاباته: مفيد في الحافلة." },
    { t: "بومودورو وأصوات", d: "جلسات تركيز بمؤقّت، مع موسيقى وأصوات الطبيعة." },
    { t: "التخطيط والمواظبة", d: "خطّط جلساتك وحافظ على سلسلة أيامك." },
    { t: "السجل", d: "استرجع محادثاتك وسلاسل QCM." },
  ],
  reviews: { label: "ما يقوله الطلبة", title: "يراجعون مع أكسون." },
  pricingSection: { label: "الأسعار", title: "ابدأ مجانًا. وانتقل إلى الاشتراك متى شئت." },
  faq: {
    label: "أسئلة شائعة",
    title: "أسئلة؟",
    items: [
      { q: "هل يعوّض أكسون دروسي؟", a: "لا. ينطلق من دروسك ليساعدك على تعلّمها. وفي النقاط المهمة، تحقّق دائمًا مع أساتذتك." },
      { q: "من أين تأتي الإجابات؟", a: "أولًا من مستنداتك، مع ذكر الصفحة. وإذا تجاوز سؤالك درسك، يتوسّع الدكتور أحمد بمعارف طبية راسخة في قسم منفصل بعنوان «للتوسّع». وفي كل ما يجب أن يكون دقيقًا بالرقم (الجرعات، العتبات)، تحقّق مع أساتذتك." },
      {
        q: "كيف أدفع؟",
        a: "في موريتانيا عبر بنكيلي أو مصريفي أو سداد أو كليك: ترسل لقطة شاشة للدفع فيُفعَّل اشتراكك بعد التحقق. وفي السنغال عبر الدفع بالهاتف (واف، أورنج موني…) أو البطاقة البنكية، وفي المغرب بالبطاقة البنكية: هذه الوسائل قريبة، وفي انتظارها يمكنك مراسلتنا على واتساب.",
      },
      { q: "ما الملفات التي يمكنني إضافتها؟", a: "ملفات PDF حتى لو كانت ممسوحة ضوئيًا، وصور صفحات درسك (عدة صور دفعة واحدة)، أو ملفات .txt. لقراءة جيدة للصورة: صفحة مسطّحة، إضاءة جيدة، دون انعكاس." },
    ],
    other: "سؤال آخر؟",
    whatsapp: "راسلنا على واتساب",
  },
  cta: { title: "حان وقت الدخول الجامعي. راجع منذ الأسبوع الأول.", button: "جرّب مجانًا", whatsapp: "واتساب" },
  footer: { rights: "أكسون · موريتانيا، السنغال، المغرب", privacy: "الخصوصية", terms: "الشروط", whatsapp: "واتساب" },
  pricing: {
    countries: [
      { id: "mr", label: "موريتانيا", pay: "الدفع عبر بنكيلي أو مصريفي أو سداد أو كليك." },
      { id: "sn", label: "السنغال", pay: "الدفع عبر الهاتف (واف، أورنج موني…) أو البطاقة البنكية، قريبًا." },
      { id: "ma", label: "المغرب", pay: "الدفع بالبطاقة البنكية، قريبًا." },
    ],
    aria: "البلد",
    perMonth: "/ شهريًا",
    recommended: "موصى به",
    promoUntil: (d: string) => `حتى ${d}`,
    choose: "اختر",
    indicative: " الأسعار إرشادية وقد تتغير عند افتتاح السوق.",
    free: { name: "مجاني", text: "لاكتشاف أكسون.", cta: "ابدأ مجانًا" },
    standardText: "للمراجعة طوال السنة.",
    duoText: "للتحضير المكثّف، مع صديق.",
    items: {
      docs: (n: number | null) => (n === null ? "مستندات غير محدودة" : `${arCount(n, "مستند نشط واحد", "مستندان نشطان", "مستندات نشطة", "مستندًا نشطًا")}`),
      questions: (n: number) => `${arCount(n, "سؤال واحد", "سؤالان", "أسئلة", "سؤالًا")} يوميًا للدكتور أحمد`,
      contents: (n: number) => `${arCount(n, "ملخّص أو بطاقات مراجعة أو حالة سريرية", "ملخّصان أو بطاقتا مراجعة أو حالتان سريريتان", "ملخّصات أو بطاقات مراجعة أو حالات سريرية", "ملخّصًا أو بطاقة مراجعة أو حالة سريرية")} يوميًا`,
      qcm: (n: number) => `${arCount(n * 5, "سؤال QCM واحد", "سؤالا QCM", "أسئلة QCM", "سؤال QCM")} يوميًا`,
      pdf: "تصدير الملخّصات بصيغة PDF",
      history: (d: number | null) => (d === null ? "سجل غير محدود" : `سجل ${arCount(d, "يوم واحد", "يومين", "أيام", "يومًا")}`),
      duo: "المراجعة مع صديق: QCM وبطاقات مراجعة وحالات سريرية وغرفة مع الدكتور أحمد (المدعو مجانًا)",
    },
  },
  demo: {
    hero: {
      aria: "مثال على سؤال مطروح على الدكتور أحمد",
      writing: "الدكتور أحمد يكتب",
      keep: "للحفظ · ",
      source: "المصدر : ",
      script: [
        { q: "لماذا يؤدي فشل القلب الأيسر إلى وذمة رئوية؟", a: "يتراكم الدم قبل البطين الأيسر، فيرتفع الضغط في الأوردة الرئوية ويتسرّب البلازما إلى الحويصلات الهوائية.", keep: "الأيسر = الرئتان، الأيمن = الجسم.", src: "أمراض القلب · ص. 42" },
        { q: "ما آلية عمل مثبّطات الإنزيم المحوِّل (IEC)؟", a: "تثبّط الإنزيم المحوِّل: فينخفض الأنجيوتنسين II، فيحدث توسّع وعائي وينخفض الألدوستيرون.", keep: "أثرها الجانبي المعتاد: السعال الجاف.", src: "علم الأدوية · ص. 118" },
        { q: "ما الفرق بين المثبّط للجراثيم والمبيد للجراثيم؟", a: "المثبّط (bactériostatique) يوقف تكاثر البكتيريا، ثم يتولّى جهاز المناعة القضاء عليها. أما المبيد (bactéricide) فيقتلها مباشرة.", keep: "المثبّط = تتوقف، المبيد = تموت.", src: "الأمراض المعدية · ص. 27" },
      ],
    },
    fiche: { label: "ملخّص · أمراض القلب · الفصل 5", title: "فشل القلب", text: "لم يعد القلب يؤمّن تدفقًا كافيًا لحاجات الجسم. في الجهة اليسرى: احتقان رئوي. وفي اليمنى: احتقان جهازي.", boxLabel: "ما يأتي في الامتحان", points: ["العلامات السريرية: القصور الأيسر مقابل الأيمن", "الأسباب الرئيسية", "العلاج الأساسي: مدرّات البول، مثبّطات الإنزيم المحوِّل، حاصرات بيتا"] },
    qcm: {
      label: "QCM · السؤال 4 من 10",
      question: "فشل القلب الأيسر: ما الاقتراحات الصحيحة؟",
      props: ["ضيق التنفس الجهدي وضيق التنفس الاضطجاعي (orthopnée)", "خراخر فقاعية رئوية (crépitants)", "انتفاخ الوريد الوداجي المعزول", "الوذمة الرئوية الحادة من مضاعفاته", "تضخّم الكبد المؤلم هو العلامة الأساسية"],
      forgot: "منسية",
      partial: "جزئي · 5 نقاط",
      missing: "فاتك الاقتراح D.",
    },
    chat: {
      label: "سؤال عن درسك",
      q: "لماذا يسبّب فشل القلب الأيسر وذمة رئوية، والأيمن وذمات في الساقين؟",
      a: "في الجهة اليسرى يتراكم الدم قبل البطين: يرتفع الضغط في الأوردة الرئوية ويتسرّب البلازما إلى الحويصلات. وفي اليمنى يتراكم في أوردة الجسم: الوداجيات والكبد والساقان.",
      keep: "الأيسر = الرئتان، الأيمن = الجسم.",
      source: "المصدر : درسك، الصفحة 42",
    },
    flash: { label: "بطاقات المراجعة · 12 للمراجعة اليوم", question: "سؤال", q: "ما هي العلامات الثلاث لثالوث بيك (triade de Beck)؟", hint: "هل عرفت الجواب؟ قيّم نفسك.", grades: ["للمراجعة", "صعب", "جيد", "سهل"], note: "ما تتقنه يعود لاحقًا. وما يصعب عليك يعود سريعًا." },
    caseDemo: {
      label: "حالة سريرية · المرحلة 2 من 5",
      steps: ["القصة", "الفرضيات", "الفحص", "الفحوص التكميلية", "التشخيص"],
      story: "امرأة عمرها 27 سنة. تستشير بسبب تدلّي الجفن وازدواج الرؤية، يظهران في آخر النهار ويتحسّنان بعد الراحة.",
      q: "ما الفرضيات التشخيصية التي تفكر فيها؟",
      placeholder: "اكتب استدلالك…",
      note: "يصحّح الدكتور أحمد استدلالك مرحلة بعد مرحلة، كما في التربّص.",
    },
  },
  login: {
    title: "سجّل الدخول لتراجع.",
    text: "بنقرة واحدة بحسابك في Google. لا كلمة سر لتحفظها.",
    loadingButton: "جارٍ تحميل زر Google…",
    google: "المتابعة مع Google",
    redirecting: "جارٍ التحويل…",
    notConfigured: "تسجيل الدخول غير مُعدّ بعد.",
    failed: "تعذّر تسجيل الدخول حاليًا. حاول بعد قليل.",
    bullets: [
      "ينطلق الدكتور أحمد من دروسك أنت، ثم يتوسّع عندما يحتاج سؤالك إلى ذلك.",
      "ملخّصات وأسئلة QCM وبطاقات مراجعة وحالات سريرية تُنشأ من أجلك.",
      "كل طالب لا يرى إلا مستنداته.",
    ],
    trouble: "مشكلة في تسجيل الدخول؟ راسلنا على",
    googleLocale: "ar",
  },
};

/** Accord du nom après un nombre en arabe : 1 (singulier), 2 (duel), 3 à 10 (pluriel), au-delà (singulier à l'accusatif). */
export function arCount(n: number, one: string, two: string, few: string, many: string): string {
  if (n === 1) return one;
  if (n === 2) return two;
  if (n >= 3 && n <= 10) return `${n} ${few}`;
  return `${n} ${many}`;
}

export const SITE: Record<Lang, SiteDict> = { fr: FR, ar: AR };
