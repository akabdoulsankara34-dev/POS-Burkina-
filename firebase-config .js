// Configuration Firebase - Remplace avec tes identifiants
const firebaseConfig = {
    apiKey: "AIzaSyD9nisNmNnagzRp-jNlwTbJ7q5bdPtF9Jw",
    authDomain: "inte-84ea7.firebaseapp.com",
    projectId: "inte-84ea7",
    storageBucket: "inte-84ea7.firebasestorage.app",
    messagingSenderId: "958738051181",
    appId: "1:958738051181:web:e305c5d8cb1a4b95680f64"
};

// Initialisation Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Configuration Firestore pour le mode hors-ligne
db.settings({
    cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED,
    persistenceEnabled: true
});

console.log('✅ Firebase initialisé avec succès');