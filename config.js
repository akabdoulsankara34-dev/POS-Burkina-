// Configuration des packs commerciaux
const PACKS = {
    STARTER: 'starter',
    BUSINESS: 'business',
    PREMIUM: 'premium'
};

// Tarifs des packs (en FCFA)
const PACK_PRICES = {
    starter: 0,
    business: 5000,
    premium: 15000
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
        console.error('❌ Erreur récupération pack:', error);
        return PACKS.STARTER;
    }
}

// Vérification des fonctionnalités par pack
function canAccessFeature(userPack, feature) {
    const features = {
        // Pack STARTER (fonctionnalités de base)
        'pos_simple': [PACKS.STARTER, PACKS.BUSINESS, PACKS.PREMIUM],
        'historique_simple': [PACKS.STARTER, PACKS.BUSINESS, PACKS.PREMIUM],
        'impression_base': [PACKS.STARTER, PACKS.BUSINESS, PACKS.PREMIUM],
        
        // Pack BUSINESS (fonctionnalités intermédiaires)
        'gestion_stock': [PACKS.STARTER, PACKS.BUSINESS, PACKS.PREMIUM],
        'dashboard_stats': [PACKS.BUSINESS, PACKS.PREMIUM],
        'multi_utilisateurs': [PACKS.BUSINESS, PACKS.PREMIUM],
        'alertes_stock': [PACKS.BUSINESS, PACKS.PREMIUM],
        
        // Pack PREMIUM (fonctionnalités avancées)
        'multi_boutiques': [PACKS.PREMIUM],
        'qr_code': [PACKS.PREMIUM],
        'whatsapp_notif': [PACKS.PREMIUM],
        'exports': [PACKS.PREMIUM],
        'graphiques_avances': [PACKS.PREMIUM]
    };
    
    return features[feature]?.includes(userPack) || false;
}