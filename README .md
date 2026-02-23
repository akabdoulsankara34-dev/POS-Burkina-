# POS Africa - Solution de caisse pour commerces africains

## 🚀 Déploiement sur Vercel

### Prérequis
- Compte Firebase (gratuit)
- Compte Vercel (gratuit via GitHub)

### Configuration Firebase

1. Créez un projet Firebase sur https://console.firebase.google.com
2. Activez Authentication (Email/Password)
3. Créez une base de données Firestore
4. Dans Règles Firestore, ajoutez :

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    match /products/{product} {
      allow read, write: if request.auth != null;
    }
    match /sales/{sale} {
      allow read, write: if request.auth != null;
    }
    match /shops/{shop} {
      allow read, write: if request.auth != null;
    }
  }
}