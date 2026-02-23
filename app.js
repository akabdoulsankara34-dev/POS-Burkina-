// ===========================================
// POS AFRICA - APPLICATION PRINCIPALE
// ===========================================

// État global de l'application
let currentUser = null;
let currentPack = PACKS.STARTER;
let cart = [];
let currentShop = null;
let lastReceipt = null;
let allProducts = [];       // cache pour la recherche
let isRegistering = false;  // bloque onAuthStateChanged pendant l'inscription

// ===========================================
// INITIALISATION
// ===========================================
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 POS Africa démarré');

    // Écouteur pour la recherche de produits
    const searchInput = document.getElementById('searchProduct');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            const query = searchInput.value.toLowerCase().trim();
            const filtered = query
                ? allProducts.filter(p => p.name.toLowerCase().includes(query))
                : allProducts;
            displayProducts(filtered);
        });
    }

    // Vérifier session utilisateur
    auth.onAuthStateChanged(async (user) => {
        console.log('👤 Auth state:', user ? 'Connecté' : 'Déconnecté');

        if (user) {
            // Si inscription en cours, on attend que register() finisse
            if (isRegistering) return;

            currentUser = user;

            // Afficher l'interface POS
            document.getElementById('authPage').style.display = 'none';
            document.getElementById('posInterface').style.display = 'block';
            document.getElementById('logoutBtn').style.display = 'inline-block';

            // Charger les données utilisateur
            await loadUserData(user.uid);

            // Charger produits et historique
            loadProducts();
            loadHistory();

            if (canAccessFeature(currentPack, 'alertes_stock')) checkLowStock();
            if (canAccessFeature(currentPack, 'dashboard_stats')) loadDashboard();

            showNotification('Connexion réussie ! Bienvenue 👋', 'success');
        } else {
            showAuthPage();
        }
    });
});

// ===========================================
// AUTHENTIFICATION
// ===========================================

async function login() {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;

    if (!email || !password) {
        showNotification('Veuillez remplir email et mot de passe', 'error');
        return;
    }

    try {
        showNotification('Connexion en cours...', 'info');
        await auth.signInWithEmailAndPassword(email, password);
    } catch (error) {
        let message = 'Erreur de connexion';
        if (error.code === 'auth/user-not-found')    message = 'Email non trouvé';
        if (error.code === 'auth/wrong-password')    message = 'Mot de passe incorrect';
        if (error.code === 'auth/invalid-email')     message = 'Email invalide';
        if (error.code === 'auth/too-many-requests') message = 'Trop de tentatives, réessayez plus tard';
        showNotification(message, 'error');
        console.error('❌ Erreur login:', error);
    }
}

async function register() {
    const email    = document.getElementById('registerEmail').value.trim();
    const password = document.getElementById('registerPassword').value;
    const shopName = document.getElementById('shopName').value.trim();
    const pack     = document.getElementById('packChoice').value;

    if (!email || !password || !shopName) {
        showNotification('Veuillez remplir tous les champs', 'error');
        return;
    }
    if (password.length < 6) {
        showNotification('Le mot de passe doit contenir au moins 6 caractères', 'error');
        return;
    }

    try {
        showNotification('Création du compte...', 'info');

        // Bloquer onAuthStateChanged le temps d'écrire le bon pack
        isRegistering = true;

        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        const user = userCredential.user;

        // Écrire le document avec le BON pack AVANT de charger l'interface
        await db.collection('users').doc(user.uid).set({
            email:     email,
            pack:      pack,
            shopName:  shopName,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        await db.collection('shops').add({
            userId:    user.uid,
            name:      shopName,
            address:   '',
            phone:     '',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Débloquer et charger l'interface manuellement avec le bon pack
        isRegistering = false;
        currentUser   = user;

        document.getElementById('authPage').style.display = 'none';
        document.getElementById('posInterface').style.display = 'block';
        document.getElementById('logoutBtn').style.display = 'inline-block';

        await loadUserData(user.uid);
        loadProducts();
        loadHistory();

        if (canAccessFeature(currentPack, 'alertes_stock')) checkLowStock();
        if (canAccessFeature(currentPack, 'dashboard_stats')) loadDashboard();

        showNotification('Compte créé avec succès ! Bienvenue 🎉', 'success');

    } catch (error) {
        isRegistering = false;
        let message = 'Erreur création compte';
        if (error.code === 'auth/email-already-in-use') message = 'Cet email est déjà utilisé';
        if (error.code === 'auth/invalid-email')        message = 'Email invalide';
        if (error.code === 'auth/weak-password')        message = 'Mot de passe trop faible';
        showNotification(message, 'error');
        console.error('❌ Erreur register:', error);
    }
}

function logout() {
    auth.signOut()
        .then(() => {
            showNotification('Déconnexion réussie', 'success');
            cart = [];
            allProducts = [];
            currentUser = null;
            currentShop = null;
            lastReceipt = null;
            updateCartDisplay();
            document.getElementById('loginEmail').value    = '';
            document.getElementById('loginPassword').value = '';
            showAuthPage();
        })
        .catch(() => showNotification('Erreur déconnexion', 'error'));
}

// ===========================================
// GESTION UTILISATEUR
// ===========================================

async function loadUserData(userId) {
    try {
        const userDoc = await db.collection('users').doc(userId).get();

        if (!userDoc.exists) {
            await db.collection('users').doc(userId).set({
                email:     currentUser.email,
                pack:      PACKS.STARTER,
                shopName:  'Ma boutique',
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            currentPack = PACKS.STARTER;
        } else {
            currentPack = userDoc.data().pack || PACKS.STARTER;
        }

        document.getElementById('currentPack').textContent =
            currentPack.charAt(0).toUpperCase() + currentPack.slice(1);

        document.getElementById('userInfo').innerHTML = `
            <span>${currentUser.email}</span>
            <span class="badge badge-${currentPack}">${currentPack.toUpperCase()}</span>
        `;

        updateUIBasedOnPack();

        // Charger la boutique active
        const shopsSnapshot = await db.collection('shops')
            .where('userId', '==', userId)
            .limit(1)
            .get();

        if (!shopsSnapshot.empty) {
            currentShop = { id: shopsSnapshot.docs[0].id, ...shopsSnapshot.docs[0].data() };
        }

    } catch (error) {
        console.error('❌ Erreur chargement utilisateur:', error);
    }
}

function updateUIBasedOnPack() {
    // Onglet Produits : visible pour TOUS les packs
    document.getElementById('productsTabBtn').style.display = 'inline-block';

    // Tableau de bord : Business et Premium uniquement
    document.getElementById('dashboardTabBtn').style.display =
        canAccessFeature(currentPack, 'dashboard_stats') ? 'inline-block' : 'none';

    // Export CSV : Premium uniquement
    document.getElementById('exportBtn').style.display =
        canAccessFeature(currentPack, 'exports') ? 'inline-block' : 'none';

    // Multi-boutiques : Premium uniquement
    document.getElementById('multiStoreSection').style.display =
        canAccessFeature(currentPack, 'multi_boutiques') ? 'block' : 'none';

    // Graphiques avancés : Premium uniquement
    document.getElementById('premiumCharts').style.display =
        canAccessFeature(currentPack, 'graphiques_avances') ? 'block' : 'none';
}

// ===========================================
// GESTION DES PRODUITS
// ===========================================

async function loadProducts() {
    if (!currentUser) return;
    try {
        const snapshot = await db.collection('products')
            .where('userId', '==', currentUser.uid)
            .get();

        allProducts = [];
        snapshot.forEach(doc => allProducts.push({ id: doc.id, ...doc.data() }));

        displayProducts(allProducts);
        displayProductsTable(allProducts);
    } catch (error) {
        console.error('❌ Erreur chargement produits:', error);
    }
}

function displayProducts(products) {
    const container = document.getElementById('productsList');
    if (!container) return;
    container.innerHTML = '';

    if (products.length === 0) {
        container.innerHTML = '<p style="text-align:center;color:#999;">Aucun produit. Ajoutez-en dans l\'onglet "Produits"</p>';
        return;
    }

    products.forEach(product => {
        const card = document.createElement('div');
        card.className = 'product-card';
        card.onclick = () => addToCart(product);
        card.innerHTML = `
            <div class="product-name">${product.name}</div>
            <div class="product-price">${product.price.toLocaleString()} FCFA</div>
            <div class="product-stock">Stock: ${product.stock || 0}</div>
        `;
        container.appendChild(card);
    });
}

function displayProductsTable(products) {
    const tbody = document.getElementById('productsTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (products.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Aucun produit</td></tr>';
        return;
    }

    products.forEach(product => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${product.name}</td>
            <td>${product.price.toLocaleString()} FCFA</td>
            <td>
                <span style="color:${(product.stock || 0) < 5 ? 'red' : 'green'};font-weight:bold;">
                    ${product.stock || 0}
                </span>
            </td>
            <td>
                <button onclick="editProduct('${product.id}')" class="btn btn-primary btn-sm">✏️</button>
                <button onclick="deleteProduct('${product.id}')" class="btn btn-danger btn-sm">🗑️</button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function showAddProductModal() {
    document.getElementById('productModal').style.display = 'block';
}

function closeProductModal() {
    document.getElementById('productModal').style.display = 'none';
    document.getElementById('productName').value  = '';
    document.getElementById('productPrice').value = '';
    document.getElementById('productStock').value = '';
}

async function saveProduct() {
    const name  = document.getElementById('productName').value.trim();
    const price = parseFloat(document.getElementById('productPrice').value);
    const stock = parseInt(document.getElementById('productStock').value) || 0;

    if (!name || isNaN(price) || price <= 0) {
        showNotification('Veuillez remplir tous les champs correctement', 'error');
        return;
    }

    try {
        await db.collection('products').add({
            userId:    currentUser.uid,
            name:      name,
            price:     price,
            stock:     stock,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        showNotification('Produit ajouté avec succès ✅', 'success');
        closeProductModal();
        loadProducts();
    } catch (error) {
        showNotification('Erreur: ' + error.message, 'error');
    }
}

async function editProduct(productId) {
    showNotification('Fonctionnalité à venir', 'info');
}

async function deleteProduct(productId) {
    if (confirm('Êtes-vous sûr de vouloir supprimer ce produit ?')) {
        try {
            await db.collection('products').doc(productId).delete();
            showNotification('Produit supprimé', 'success');
            loadProducts();
        } catch (error) {
            showNotification('Erreur: ' + error.message, 'error');
        }
    }
}

// ===========================================
// GESTION DU PANIER
// ===========================================

function addToCart(product) {
    if ((product.stock || 0) <= 0) {
        showNotification('Stock épuisé', 'error');
        return;
    }

    const existingItem = cart.find(item => item.id === product.id);

    if (existingItem) {
        if (existingItem.quantity >= (product.stock || 0)) {
            showNotification('Stock insuffisant', 'error');
            return;
        }
        existingItem.quantity++;
    } else {
        cart.push({ id: product.id, name: product.name, price: product.price, quantity: 1 });
    }

    updateCartDisplay();
    showNotification(`${product.name} ajouté au panier`, 'success');
}

function updateCartDisplay() {
    const cartContainer = document.getElementById('cartItems');
    const totalSpan     = document.getElementById('cartTotal');
    if (!cartContainer || !totalSpan) return;

    let total = 0;
    cartContainer.innerHTML = '';

    if (cart.length === 0) {
        cartContainer.innerHTML = '<p style="text-align:center;color:#999;">Panier vide</p>';
        totalSpan.textContent = '0 FCFA';
        return;
    }

    cart.forEach((item, index) => {
        total += item.price * item.quantity;
        const itemDiv = document.createElement('div');
        itemDiv.className = 'cart-item';
        itemDiv.innerHTML = `
            <div>
                <strong>${item.name}</strong><br>
                ${item.price.toLocaleString()} FCFA x${item.quantity}
            </div>
            <div>
                ${(item.price * item.quantity).toLocaleString()} FCFA
                <button onclick="removeFromCart(${index})" style="border:none;background:none;cursor:pointer;font-size:18px;">❌</button>
            </div>
        `;
        cartContainer.appendChild(itemDiv);
    });

    totalSpan.textContent = total.toLocaleString() + ' FCFA';
}

function removeFromCart(index) {
    const removed = cart[index];
    cart.splice(index, 1);
    updateCartDisplay();
    showNotification(`${removed.name} retiré du panier`, 'info');
}

// ===========================================
// VALIDATION DES VENTES
// ===========================================

async function checkout() {
    if (cart.length === 0) {
        showNotification('Panier vide', 'error');
        return;
    }

    const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    try {
        showNotification('Enregistrement de la vente...', 'info');

        const date = new Date();
        const sale = {
            userId:        currentUser.uid,
            items:         [...cart],
            total:         total,
            date:          firebase.firestore.FieldValue.serverTimestamp(),
            paymentMethod: 'cash',
            shopId:        currentShop?.id || null,
            invoiceNumber: `INV-${date.getFullYear()}${(date.getMonth()+1).toString().padStart(2,'0')}${date.getDate().toString().padStart(2,'0')}-${Math.floor(Math.random()*10000)}`
        };

        const saleRef = await db.collection('sales').add(sale);

        // Mettre à jour le stock
        for (const item of cart) {
            const productRef = db.collection('products').doc(item.id);
            const productDoc = await productRef.get();
            if (productDoc.exists) {
                const currentStock = productDoc.data().stock || 0;
                await productRef.update({ stock: Math.max(0, currentStock - item.quantity) });
            }
        }

        lastReceipt = { id: saleRef.id, ...sale };

        await generateReceipt(saleRef.id);

        cart = [];
        updateCartDisplay();

        showNotification('Vente enregistrée avec succès ✅', 'success');
        loadProducts();
        loadHistory();

        if (canAccessFeature(currentPack, 'dashboard_stats')) loadDashboard();
        if (canAccessFeature(currentPack, 'alertes_stock'))   checkLowStock();

    } catch (error) {
        console.error('❌ Erreur vente:', error);
        showNotification('Erreur lors de la vente: ' + error.message, 'error');
    }
}

// ===========================================
// GÉNÉRATION DE TICKET
// ===========================================

async function generateReceipt(saleId) {
    try {
        const saleDoc = await db.collection('sales').doc(saleId).get();
        if (!saleDoc.exists) return;

        const saleData = saleDoc.data();
        const receiptWindow = window.open('', '_blank');
        if (!receiptWindow) {
            showNotification('Autorisez les popups pour imprimer le ticket', 'warning');
            return;
        }

        let receiptHTML = `
            <html><head><title>Ticket de caisse</title>
            <style>
                body { font-family: 'Courier New', monospace; margin: 0; padding: 20px; font-size: 14px; }
                .receipt { max-width: 300px; margin: 0 auto; }
                .header { text-align: center; margin-bottom: 20px; }
                .header h2 { margin: 0; font-size: 18px; }
                .header p { margin: 5px 0; font-size: 12px; }
                .item { display: flex; justify-content: space-between; margin-bottom: 5px; }
                .total { font-size: 18px; font-weight: bold; text-align: right; border-top: 2px dashed #000; padding-top: 10px; margin-top: 10px; }
                .footer { text-align: center; margin-top: 20px; font-size: 12px; }
                hr { border: 1px dashed #000; }
            </style></head><body>
            <div class="receipt">
                <div class="header">
                    <h2>${currentShop?.name || 'Ma boutique'}</h2>
                    <p>${new Date().toLocaleString()}</p>
                    <p>Facture: ${saleData.invoiceNumber || 'N/A'}</p>
                </div>
                <hr>
                <div class="items">
        `;

        saleData.items.forEach(item => {
            receiptHTML += `
                <div class="item">
                    <span>${item.name} x${item.quantity}</span>
                    <span>${(item.price * item.quantity).toLocaleString()} FCFA</span>
                </div>
            `;
        });

        receiptHTML += `
                </div>
                <hr>
                <div class="total">Total: ${saleData.total.toLocaleString()} FCFA</div>
                <div class="footer"><p>Merci de votre visite !</p><p>POS Africa</p></div>
            </div></body></html>
        `;

        receiptWindow.document.write(receiptHTML);
        receiptWindow.document.close();
        receiptWindow.print();

    } catch (error) {
        console.error('❌ Erreur génération ticket:', error);
    }
}

// ===========================================
// HISTORIQUE DES VENTES
// ===========================================

async function loadHistory() {
    if (!currentUser) return;
    try {
        const snapshot = await db.collection('sales')
            .where('userId', '==', currentUser.uid)
            .orderBy('date', 'desc')
            .limit(50)
            .get();

        const tbody = document.getElementById('historyTableBody');
        if (!tbody) return;
        tbody.innerHTML = '';

        if (snapshot.empty) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Aucune vente</td></tr>';
            return;
        }

        snapshot.forEach(doc => {
            const sale = doc.data();
            const date = sale.date ? sale.date.toDate().toLocaleString() : 'Date inconnue';
            const row  = document.createElement('tr');
            row.innerHTML = `
                <td>${date}</td>
                <td>${sale.invoiceNumber || 'N/A'}</td>
                <td>${sale.total.toLocaleString()} FCFA</td>
                <td><button onclick="printReceipt('${doc.id}')" class="btn btn-primary btn-sm">🖨️</button></td>
            `;
            tbody.appendChild(row);
        });
    } catch (error) {
        console.error('❌ Erreur chargement historique:', error);
    }
}

// ===========================================
// TABLEAU DE BORD
// ===========================================

async function loadDashboard() {
    if (!currentUser || !canAccessFeature(currentPack, 'dashboard_stats')) return;
    try {
        const now          = new Date();
        const startOfDay   = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        const dailySales = await db.collection('sales')
            .where('userId', '==', currentUser.uid)
            .where('date', '>=', startOfDay)
            .get();

        let dailyTotal = 0;
        dailySales.forEach(doc => dailyTotal += doc.data().total);

        const monthlySales = await db.collection('sales')
            .where('userId', '==', currentUser.uid)
            .where('date', '>=', startOfMonth)
            .get();

        let monthlyTotal = 0;
        monthlySales.forEach(doc => monthlyTotal += doc.data().total);

        document.getElementById('dailySales').textContent   = dailyTotal.toLocaleString() + ' FCFA';
        document.getElementById('monthlySales').textContent = monthlyTotal.toLocaleString() + ' FCFA';
        document.getElementById('totalSales').textContent   = monthlySales.size + ' ventes';

    } catch (error) {
        console.error('❌ Erreur chargement dashboard:', error);
    }
}

async function checkLowStock() {
    if (!canAccessFeature(currentPack, 'alertes_stock')) return;
    try {
        const products = await db.collection('products')
            .where('userId', '==', currentUser.uid)
            .where('stock', '<', 5)
            .get();

        document.getElementById('lowStock').textContent = products.size;
        if (products.size > 0) showNotification(`⚠️ ${products.size} produit(s) en stock faible`, 'warning');
    } catch (error) {
        console.error('❌ Erreur vérification stock:', error);
    }
}

// ===========================================
// PARAMÈTRES
// ===========================================

async function loadSettingsForm() {
    if (!currentUser) return;
    try {
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        if (userDoc.exists) {
            const data = userDoc.data();
            document.getElementById('settingShopName').value = data.shopName || '';
            document.getElementById('settingPhone').value    = data.phone    || '';
            document.getElementById('settingAddress').value  = data.address  || '';
        }

        // Afficher le pack actuel dans la section upgrade
        const packLabel = currentPack.charAt(0).toUpperCase() + currentPack.slice(1);
        const el = document.getElementById('currentPackSettings');
        if (el) el.textContent = packLabel;

        // Griser le bouton du pack actuel et des packs inférieurs
        updateUpgradeButtons();

        if (canAccessFeature(currentPack, 'multi_boutiques')) loadStores();
    } catch (error) {
        console.error('❌ Erreur chargement paramètres:', error);
    }
}

function updateUpgradeButtons() {
    const packOrder = ['starter', 'business', 'premium'];
    const currentIndex = packOrder.indexOf(currentPack);

    ['business', 'premium'].forEach(pack => {
        const btn  = document.getElementById(`upgradeBtn-${pack}`);
        const card = document.getElementById(`packCard-${pack}`);
        if (!btn || !card) return;

        const packIndex = packOrder.indexOf(pack);

        if (packIndex <= currentIndex) {
            // Pack déjà actif ou inférieur
            btn.disabled = true;
            btn.textContent = packIndex === currentIndex ? '✅ Pack actuel' : '✓ Déjà inclus';
            btn.style.opacity = '0.5';
            btn.style.cursor = 'not-allowed';
            card.style.opacity = '0.6';
        } else {
            btn.disabled = false;
            btn.style.opacity = '1';
            btn.style.cursor = 'pointer';
            card.style.opacity = '1';
        }
    });
}

async function upgradePack(newPack) {
    const prices = { business: '5 000', premium: '15 000' };
    const names  = { business: 'Business', premium: 'Premium' };

    const confirmed = confirm(
        `⚠️ Passage au pack ${names[newPack]}\n\n` +
        `Montant : ${prices[newPack]} FCFA / mois\n\n` +
        `Veuillez effectuer le paiement par Mobile Money ou virement, puis cliquez OK pour activer votre pack.\n\n` +
        `Confirmer l'activation du pack ${names[newPack]} ?`
    );

    if (!confirmed) return;

    try {
        await db.collection('users').doc(currentUser.uid).update({ pack: newPack });

        // Mettre à jour l'état local
        currentPack = newPack;

        // Rafraîchir toute l'interface
        document.getElementById('currentPack').textContent =
            newPack.charAt(0).toUpperCase() + newPack.slice(1);

        document.getElementById('userInfo').innerHTML = `
            <span>${currentUser.email}</span>
            <span class="badge badge-${newPack}">${newPack.toUpperCase()}</span>
        `;

        updateUIBasedOnPack();
        updateUpgradeButtons();

        const el = document.getElementById('currentPackSettings');
        if (el) el.textContent = names[newPack];

        showNotification(`🎉 Pack ${names[newPack]} activé avec succès !`, 'success');

    } catch (error) {
        console.error('❌ Erreur upgrade pack:', error);
        showNotification('Erreur lors du changement de pack : ' + error.message, 'error');
    }
}

async function saveSettings() {
    const shopName = document.getElementById('settingShopName').value.trim();
    const phone    = document.getElementById('settingPhone').value.trim();
    const address  = document.getElementById('settingAddress').value.trim();

    try {
        await db.collection('users').doc(currentUser.uid).update({ shopName, phone, address });

        if (currentShop?.id) {
            await db.collection('shops').doc(currentShop.id).update({ name: shopName, phone, address });
            currentShop = { ...currentShop, name: shopName, phone, address };
        }

        showNotification('Paramètres sauvegardés ✅', 'success');
    } catch (error) {
        showNotification('Erreur: ' + error.message, 'error');
    }
}

// ===========================================
// MULTI-BOUTIQUES (PREMIUM)
// ===========================================

async function addStore() {
    if (!canAccessFeature(currentPack, 'multi_boutiques')) {
        showNotification('Fonctionnalité réservée au pack Premium', 'error');
        return;
    }
    const name = prompt('Nom de la nouvelle boutique :');
    if (!name || !name.trim()) return;

    try {
        await db.collection('shops').add({
            userId: currentUser.uid, name: name.trim(), address: '', phone: '',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        showNotification('Boutique ajoutée ✅', 'success');
        loadStores();
    } catch (error) {
        showNotification('Erreur: ' + error.message, 'error');
    }
}

async function loadStores() {
    if (!canAccessFeature(currentPack, 'multi_boutiques')) return;
    try {
        const snapshot  = await db.collection('shops').where('userId', '==', currentUser.uid).get();
        const container = document.getElementById('storesList');
        if (!container) return;
        container.innerHTML = '';
        snapshot.forEach(doc => {
            const shop = doc.data();
            const div  = document.createElement('div');
            div.style.cssText = 'padding:10px;border:1px solid #ddd;border-radius:6px;margin-bottom:8px;';
            div.innerHTML = `<strong>${shop.name}</strong> <span style="color:#999;font-size:12px;">${shop.address || ''}</span>`;
            container.appendChild(div);
        });
    } catch (error) {
        console.error('❌ Erreur chargement boutiques:', error);
    }
}

// ===========================================
// EXPORT (PREMIUM)
// ===========================================

async function exportSales() {
    if (!canAccessFeature(currentPack, 'exports')) {
        showNotification('Fonctionnalité réservée au pack Premium', 'error');
        return;
    }
    try {
        const sales = await db.collection('sales')
            .where('userId', '==', currentUser.uid)
            .orderBy('date', 'desc')
            .get();

        let csv = 'Date,Numéro Facture,Total,Articles\n';
        sales.forEach(doc => {
            const sale  = doc.data();
            const date  = sale.date ? sale.date.toDate().toLocaleDateString() : '';
            const items = sale.items.map(item => `${item.name} (${item.quantity})`).join(' | ');
            csv += `"${date}","${sale.invoiceNumber || ''}",${sale.total},"${items}"\n`;
        });

        const blob = new Blob([csv], { type: 'text/csv' });
        const url  = window.URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href = url;
        a.download = `ventes_${new Date().toLocaleDateString()}.csv`;
        a.click();

        showNotification('Export réussi ✅', 'success');
    } catch (error) {
        console.error('❌ Erreur export:', error);
        showNotification('Erreur lors de l\'export', 'error');
    }
}

// ===========================================
// FONCTIONS UTILITAIRES
// ===========================================

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = message;
    notification.style.borderLeftColor =
        type === 'success' ? '#27ae60' :
        type === 'error'   ? '#e74c3c' :
        type === 'warning' ? '#f39c12' : '#3498db';
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3500);
}

function showTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.style.display = 'none');
    document.getElementById(tabName + 'Section').style.display = 'block';
    if (tabName === 'dashboard') loadDashboard();
    if (tabName === 'products')  loadProducts();
    if (tabName === 'history')   loadHistory();
    if (tabName === 'settings')  loadSettingsForm();
}

function showAuthPage() {
    document.getElementById('authPage').style.display     = 'block';
    document.getElementById('posInterface').style.display = 'none';
    document.getElementById('logoutBtn').style.display    = 'none';
}

function showRegister() {
    document.getElementById('loginForm').style.display    = 'none';
    document.getElementById('registerForm').style.display = 'block';
}

function showLogin() {
    document.getElementById('loginForm').style.display    = 'block';
    document.getElementById('registerForm').style.display = 'none';
}

async function printReceipt(saleId) {
    await generateReceipt(saleId);
}

function printLastReceipt() {
    if (lastReceipt?.id) {
        printReceipt(lastReceipt.id);
    } else {
        showNotification('Aucun ticket récent', 'info');
    }
}
