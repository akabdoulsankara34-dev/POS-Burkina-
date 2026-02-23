// Configuration des packs commerciaux
const PACKS = {
    STARTER: 'starter',
    BUSINESS: 'business',
    PREMIUM: 'premium'
};

// Fonction pour déterminer le pack d'un utilisateur
async function getUserPack(userId) {
    try {
        const userDoc = await db.collection('users').doc(userId).get();
        if (userDoc.exists) {
            return userDoc.data().pack || PACKS.STARTER;
        }
        return PACKS.STARTER;
    } catch (error) {
        console.error('Erreur récupération pack:', error);
        return PACKS.STARTER;
    }
}

// Vérification des fonctionnalités par pack
function canAccessFeature(userPack, feature) {
    const features = {
        // Pack STARTER
        'pos_simple': [PACKS.STARTER, PACKS.BUSINESS, PACKS.PREMIUM],
        'historique_simple': [PACKS.STARTER, PACKS.BUSINESS, PACKS.PREMIUM],
        'impression_base': [PACKS.STARTER, PACKS.BUSINESS, PACKS.PREMIUM],
        
        // Pack BUSINESS
        'gestion_stock': [PACKS.BUSINESS, PACKS.PREMIUM],
        'dashboard_stats': [PACKS.BUSINESS, PACKS.PREMIUM],
        'multi_utilisateurs': [PACKS.BUSINESS, PACKS.PREMIUM],
        'alertes_stock': [PACKS.BUSINESS, PACKS.PREMIUM],
        
        // Pack PREMIUM
        'multi_boutiques': [PACKS.PREMIUM],
        'qr_code': [PACKS.PREMIUM],
        'whatsapp_notif': [PACKS.PREMIUM],
        'exports': [PACKS.PREMIUM],
        'graphiques_avances': [PACKS.PREMIUM]
    };
    
    return features[feature]?.includes(userPack) || false;
}