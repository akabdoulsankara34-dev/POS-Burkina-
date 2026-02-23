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
    cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED
});

// Activer la persistance hors-ligne (méthode correcte)
db.enablePersistence({ synchronizeTabs: true })
    .then(() => console.log('✅ Persistance hors-ligne activée'))
    .catch(err => {
        if (err.code === 'failed-precondition') {
            console.warn('⚠️ Persistance impossible : plusieurs onglets ouverts');
        } else if (err.code === 'unimplemented') {
            console.warn('⚠️ Le navigateur ne supporte pas la persistance hors-ligne');
        }
    });

console.log('✅ Firebase initialisé avec succès');