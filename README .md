# POS Africa - Solution de caisse pour commerces africains

## 🚀 Aperçu
POS Africa est une solution de caisse (Point of Sale) complète, conçue spécialement pour les petits commerces en Afrique (alimentations, boutiques, mini marchés, quincailleries).

## ✨ Fonctionnalités

### 🟢 Pack STARTER (Gratuit)
- Point de vente simple
- Enregistrement des ventes
- Historique basique
- Impression de tickets (format 58mm)

### 🔵 Pack BUSINESS (5 000 FCFA/mois)
- ✅ Tout le pack STARTER
- ✅ Gestion de stock automatique
- ✅ Dashboard avec statistiques
- ✅ Alertes stock faible
- ✅ Multi-utilisateurs (3 max)

### 🔴 Pack PREMIUM (15 000 FCFA/mois)
- ✅ Tout le pack BUSINESS
- ✅ Multi-boutiques
- ✅ QR code sur factures
- ✅ Notifications WhatsApp
- ✅ Export CSV/PDF
- ✅ Graphiques avancés

## 🛠 Technologies utilisées
- HTML5 / CSS3 / JavaScript
- Firebase (Authentication + Firestore)
- Chart.js pour les graphiques
- QRCode.js pour les codes QR

## 📦 Installation

1. **Créer un projet Firebase**
   - Allez sur https://console.firebase.google.com
   - Créez un nouveau projet
   - Activez "Authentication" (Email/Password)
   - Créez une base "Firestore"

2. **Configurer Firebase**
   - Dans `firebase-config.js`, remplacez les identifiants par les vôtres

3. **Déployer sur Vercel**
   - Poussez le code sur GitHub
   - Connectez Vercel à votre repository
   - Déployez !

## 🔧 Configuration Firestore

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