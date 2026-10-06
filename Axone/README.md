# Axone 📚

Assistant pédagogique intelligent pour étudiants en médecine et pharmacie.  
Basé sur un système RAG : répond uniquement depuis les PDF de cours.

---

## 🚀 Installation rapide

### Prérequis
- Node.js 18+
- npm ou yarn
- Expo CLI : `npm install -g expo-cli`
- App **Expo Go** sur ton téléphone (App Store / Google Play)

### 1. Installe les dépendances

```bash
npm install
```

### 2. Configure ta clé API

```bash
cp .env.example .env
```

Ouvre `.env` et remplace par ta vraie clé Anthropic :
```
EXPO_PUBLIC_ANTHROPIC_API_KEY=sk-ant-ta-cle-ici
```

👉 Crée une clé sur https://console.anthropic.com

### 3. Lance l'app

```bash
npx expo start
```

Scanne le QR code avec **Expo Go** sur ton téléphone.

---

## 📱 Structure de l'app

```
Axone/
├── App.tsx                    # Navigation principale
├── src/
│   ├── screens/
│   │   ├── OnboardingScreen.tsx  # 3 écrans d'intro
│   │   ├── HomeScreen.tsx        # Accueil + cours actif
│   │   ├── ChatScreen.tsx        # Chat principal (RAG)
│   │   ├── CourseScreen.tsx      # Upload PDF
│   │   └── HistoryScreen.tsx     # Historique sessions
│   ├── components/
│   │   └── index.tsx             # Composants réutilisables
│   ├── store/
│   │   └── index.ts              # Zustand store
│   ├── theme/
│   │   └── index.ts              # Couleurs, typo, spacing
│   └── utils/
│       └── rag.ts                # Appel API Anthropic
```

---

## 🧠 Architecture RAG

Le système fonctionne ainsi :
1. L'élève charge un **PDF de cours**
2. Le texte est extrait du PDF
3. Chaque question est envoyée à **Claude** avec le contenu du cours comme contexte
4. Claude répond **uniquement depuis le cours** (ou refuse si hors sujet)
5. Les **pages sources** sont affichées sous chaque réponse

### Pour une extraction PDF réelle

Intègre l'une de ces solutions :

**Option A — Backend FastAPI (recommandé production)**
```python
# pip install fastapi pdfplumber anthropic
from pdfplumber import open as pdf_open

def extract_pdf(path):
    with pdf_open(path) as pdf:
        return "\n".join(p.extract_text() for p in pdf.pages)
```

**Option B — React Native côté client**
```bash
npm install react-native-pdf-lib
# ou
npm install @pdf-lib/pdf-lib
```

---

## 🎨 Design System

| Token | Valeur |
|-------|--------|
| Bleu primaire | `#1A6FD4` |
| Vert source | `#1D9E75` |
| Border radius | 10-18px |
| Font body | 15px / 400 |
| Font label | 13px / 500 |

---

## ⚙️ Fonctionnalités

- [x] Onboarding 3 écrans
- [x] Upload PDF (expo-document-picker)
- [x] Chat avec animation typing
- [x] Badge "Basé sur le cours · p.X"
- [x] Message de refus hors cours
- [x] Feedback 👍 / 👎
- [x] Historique sessions
- [x] Mode sombre
- [x] Multi-cours (switch actif)
- [ ] Extraction PDF réelle (voir ci-dessus)
- [ ] Mode offline (AsyncStorage cache)
- [ ] Notifications push

---

## 🔧 Stack technique

| Outil | Rôle |
|-------|------|
| React Native (Expo) | Framework mobile |
| Zustand | Gestion d'état |
| expo-document-picker | Sélection PDF |
| @react-navigation | Navigation |
| Claude API (Haiku) | IA RAG |

---

## 📞 Support

Problème ? Ouvre une issue ou contacte ton enseignant référent.
