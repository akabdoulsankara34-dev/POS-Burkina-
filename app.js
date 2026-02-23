// ===========================================
// POS AFRICA - APPLICATION PRINCIPALE
// ===========================================

// État global de l'application
let currentUser = null;
let currentPack = PACKS.STARTER;
let cart = [];
let currentShop = null;
let lastReceipt = null;

// ===========================================
// INITIALISATION
// ===========================================
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 POS Africa démarré');
    
    // Vérifier session utilisateur
    auth.onAuthStateChanged(async (user) => {
        console.log('👤 Auth state:', user ? 'Connecté' : 'Déconnecté');
        
        if (user) {
            // Utilisateur connecté
            currentUser = user;
            
            // Cacher la page de connexion, afficher le POS
            document.getElementById('authPage').style.display = 'none';
            document.getElementById('posInterface').style.display = 'block';
            document.getElementById('logoutBtn').style.display = 'inline-block';
            
            // Charger les données utilisateur
            await loadUserData(user.uid);
            
            // Charger les produits et l'historique
            loadProducts();
            loadHistory();
            
            // Vérifier les fonctionnalités selon le pack
            if (canAccessFeature(currentPack, 'alertes_stock')) {
                checkLowStock();
            }
            
            if (canAccessFeature(currentPack, 'dashboard_stats')) {
                loadDashboard();
            }
            
            showNotification('Connexion réussie ! Bienvenue 👋', 'success');
        } else {
            // Utilisateur déconnecté
            showAuthPage();
        }
    });
});

// ===========================================
// AUTHENTIFICATION
// ===========================================

// Fonction de connexion
async function login() {
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    
    if (!email || !password) {
        showNotification('Veuillez remplir email et mot de passe', 'error');
        return;
    }
    
    try {
        showNotification('Connexion en cours...', 'info');
        
        await auth.signInWithEmailAndPassword(email, password);
        
        // La redirection se fait automatiquement via onAuthStateChanged
        
    } catch (error) {
        let message = 'Erreur de connexion';
        if (error.code === 'auth/user-not-found') message = 'Email non trouvé';
        if (error.code === 'auth/wrong-password') message = 'Mot de passe incorrect';
        if (error.code === 'auth/invalid-email') message = 'Email invalide';
        if (error.code === 'auth/too-many-requests') message = 'Trop de tentatives, réessayez plus tard';
        
        showNotification(message, 'error');
        console.error('❌ Erreur login:', error);
    }
}

// Fonction d'inscription
async function register() {
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    const shopName = document.getElementById('shopName').value;
    const pack = document.getElementById('packChoice').value;
    
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
        
        // Créer l'utilisateur
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        const user = userCredential.user;
        
        // Créer document utilisateur dans Firestore
        await db.collection('users').doc(user.uid).set({
            email: email,
            pack: pack,
            shopName: shopName,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Créer une boutique par défaut
        await db.collection('shops').add({
            userId: user.uid,
            name: shopName,
            address: '',
            phone: '',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        showNotification('Compte créé avec succès !', 'success');
        
    } catch (error) {
        let message = 'Erreur création compte';
        if (error.code === 'auth/email-already-in-use') message = 'Cet email est déjà utilisé';
        if (error.code === 'auth/invalid-email') message = 'Email invalide';
        if (error.code === 'auth/weak-password') message = 'Mot de passe trop faible';
        
        showNotification(message, 'error');
        console.error('❌ Erreur register:', error);
    }
}

// Déconnexion
function logout() {
    auth.signOut()
        .then(() => {
            showNotification('Déconnexion réussie', 'success');
            showAuthPage();
            
            // Vider le panier
            cart = [];
            updateCartDisplay();
            
            // Vider les champs
            document.getElementById('loginEmail').value = '';
            document.getElementById('loginPassword').value = '';
        })
        .catch((error) => {
            showNotification('Erreur déconnexion', 'error');
        });
}

// ===========================================
// GESTION UTILISATEUR
// ===========================================

// Charger données utilisateur
async function loadUserData(userId) {
    try {
        const userDoc = await db.collection('users').doc(userId).get();
        
        if (!userDoc.exists) {
            // Créer document utilisateur si inexistant
            await db.collection('users').doc(userId).set({
                email: currentUser.email,
                pack: PACKS.STARTER,
                shopName: 'Ma boutique',
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            currentPack = PACKS.STARTER;
        } else {
            currentPack = userDoc.data().pack || PACKS.STARTER;
            document.getElementById('currentPack').textContent = 
                currentPack.charAt(0).toUpperCase() + currentPack.slice(1);
            
            // Mettre à jour l'affichage selon le pack
            updateUIBasedOnPack();
            
            // Mettre à jour l'info utilisateur
            document.getElementById('userInfo').innerHTML = `
                <span>${currentUser.email}</span>
                <span class="badge badge-${currentPack}">${currentPack.toUpperCase()}</span>
            `;
        }
        
        // Charger la boutique active
        const shopsSnapshot = await db.collection('shops')
            .where('userId', '==', userId)
            .limit(1)
            .get();
            
        if (!shopsSnapshot.empty) {
            currentShop = {
                id: shopsSnapshot.docs[0].id,
                ...shopsSnapshot.docs[0].data()
            };
        }
    } catch (error) {
        console.error('❌ Erreur chargement utilisateur:', error);
    }
}

// Mise à jour UI selon pack
function updateUIBasedOnPack() {
    // Afficher/cacher fonctionnalités selon pack
    document.getElementById('productsTabBtn').style.display = 
        canAccessFeature(currentPack, 'gestion_stock') ? 'inline-block' : 'none';
    
    document.getElementById('dashboardTabBtn').style.display = 
        canAccessFeature(currentPack, 'dashboard_stats') ? 'inline-block' : 'none';
    
    if (canAccessFeature(currentPack, 'exports')) {
        document.getElementById('exportBtn').style.display = 'inline-block';
    } else {
        document.getElementById('exportBtn').style.display = 'none';
    }
    
    if (canAccessFeature(currentPack, 'multi_boutiques')) {
        document.getElementById('multiStoreSection').style.display = 'block';
    } else {
        document.getElementById('multiStoreSection').style.display = 'none';
    }
    
    if (canAccessFeature(currentPack, 'graphiques_avances')) {
        document.getElementById('premiumCharts').style.display = 'block';
    } else {
        document.getElementById('premiumCharts').style.display = 'none';
    }
}

// ===========================================
// GESTION DES PRODUITS
// ===========================================

// Charger les produits
async function loadProducts() {
    if (!currentUser) return;
    
    try {
        let query = db.collection('products').where('userId', '==', currentUser.uid);
        
        if (currentShop && canAccessFeature(currentPack, 'multi_boutiques')) {
            query = query.where('shopId', '==', currentShop.id);
        }
        
        const snapshot = await query.get();
        const products = [];
        
        snapshot.forEach(doc => {
            products.push({ id: doc.id, ...doc.data() });
        });
        
        displayProducts(products);
        displayProductsTable(products);
    } catch (error) {
        console.error('❌ Erreur chargement produits:', error);
    }
}

// Afficher les produits en grille
function displayProducts(products) {
    const container = document.getElementById('productsList');
    if (!container) return;
    
    container.innerHTML = '';
    
    if (products.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #999;">Aucun produit. Ajoutez-en dans l\'onglet "Produits"</p>';
        return;
    }
    
    products.forEach(product => {
        const card = document.createElement('div');
        card.className = 'product-card';
        card.onclick = () => addToCart(product);
        
        card.innerHTML = `
            <div class="product-name">${product.name}</div>
            <div class="product-price">${product.price.toLocaleString()} FCFA</div>
            ${canAccessFeature(currentPack, 'gestion_stock') ? 
                `<div class="product-stock">Stock: ${product.stock || 0}</div>` : ''}
        `;
        
        container.appendChild(card);
    });
}

// Afficher les produits en tableau
function displayProductsTable(products) {
    const tbody = document.getElementById('productsTableBody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    if (products.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">Aucun produit</td></tr>';
        return;
    }
    
    products.forEach(product => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${product.name}</td>
            <td>${product.price.toLocaleString()} FCFA</td>
            <td>
                <span style="color: ${product.stock < 5 ? 'red' : 'green'}; font-weight: bold;">
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

// Sauvegarder un produit
async function saveProduct() {
    const name = document.getElementById('productName').value;
    const price = parseFloat(document.getElementById('productPrice').value);
    const stock = parseInt(document.getElementById('productStock').value) || 0;
    
    if (!name || !price) {
        showNotification('Veuillez remplir tous les champs', 'error');
        return;
    }
    
    try {
        await db.collection('products').add({
            userId: currentUser.uid,
            name: name,
            price: price,
            stock: stock,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        showNotification('Produit ajouté avec succès', 'success');
        closeProductModal();
        loadProducts();
    } catch (error) {
        showNotification('Erreur: ' + error.message, 'error');
    }
}

// Modifier un produit
async function editProduct(productId) {
    // À implémenter
    showNotification('Fonctionnalité à venir', 'info');
}

// Supprimer un produit
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

// Ajouter au panier
function addToCart(product) {
    // Vérifier stock si pack BUSINESS+
    if (canAccessFeature(currentPack, 'gestion_stock') && product.stock <= 0) {
        showNotification('Stock épuisé', 'error');
        return;
    }
    
    const existingItem = cart.find(item => item.id === product.id);
    
    if (existingItem) {
        if (canAccessFeature(currentPack, 'gestion_stock') && existingItem.quantity >= product.stock) {
            showNotification('Stock insuffisant', 'error');
            return;
        }
        existingItem.quantity++;
    } else {
        cart.push({
            id: product.id,
            name: product.name,
            price: product.price,
            quantity: 1
        });
    }
    
    updateCartDisplay();
    showNotification(`${product.name} ajouté au panier`, 'success');
}

// Mettre à jour l'affichage du panier
function updateCartDisplay() {
    const cartContainer = document.getElementById('cartItems');
    const totalSpan = document.getElementById('cartTotal');
    
    if (!cartContainer || !totalSpan) return;
    
    let total = 0;
    cartContainer.innerHTML = '';
    
    if (cart.length === 0) {
        cartContainer.innerHTML = '<p style="text-align: center; color: #999;">Panier vide</p>';
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
                <button onclick="removeFromCart(${index})" style="border: none; background: none; cursor: pointer; font-size: 18px;">❌</button>
            </div>
        `;
        
        cartContainer.appendChild(itemDiv);
    });
    
    totalSpan.textContent = total.toLocaleString() + ' FCFA';
}

// Retirer du panier
function removeFromCart(index) {
    const removed = cart[index];
    cart.splice(index, 1);
    updateCartDisplay();
    showNotification(`${removed.name} retiré du panier`, 'info');
}

// ===========================================
// VALIDATION DES VENTES
// ===========================================

// Valider la vente
async function checkout() {
    if (cart.length === 0) {
        showNotification('Panier vide', 'error');
        return;
    }
    
    const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    
    try {
        showNotification('Enregistrement de la vente...', 'info');
        
        // Créer la vente
        const sale = {
            userId: currentUser.uid,
            items: cart,
            total: total,
            date: firebase.firestore.FieldValue.serverTimestamp(),
            paymentMethod: 'cash',
            shopId: currentShop?.id || null
        };
        
        // Ajouter numéro de facture pour PREMIUM
        if (canAccessFeature(currentPack, 'qr_code')) {
            const date = new Date();
            sale.invoiceNumber = `INV-${date.getFullYear()}${(date.getMonth()+1).toString().padStart(2,'0')}${date.getDate().toString().padStart(2,'0')}-${Math.floor(Math.random()*10000)}`;
        }
        
        const saleRef = await db.collection('sales').add(sale);
        
        // Mettre à jour le stock (BUSINESS+)
        if (canAccessFeature(currentPack, 'gestion_stock')) {
            for (const item of cart) {
                const productRef = db.collection('products').doc(item.id);
                const productDoc = await productRef.get();
                if (productDoc.exists) {
                    const currentStock = productDoc.data().stock || 0;
                    await productRef.update({
                        stock: Math.max(0, currentStock - item.quantity)
                    });
                }
            }
        }
        
        // Générer ticket
        await generateReceipt(saleRef.id);
        
        // Vider le panier
        cart = [];
        updateCartDisplay();
        
        showNotification('Vente enregistrée avec succès', 'success');
        loadHistory();
        
        if (canAccessFeature(currentPack, 'dashboard_stats')) {
            loadDashboard();
        }
        
        if (canAccessFeature(currentPack, 'alertes_stock')) {
            checkLowStock();
        }
        
    } catch (error) {
        console.error('❌ Erreur vente:', error);
        showNotification('Erreur lors de la vente', 'error');
    }
}

// ===========================================
// GÉNÉRATION DE TICKET
// ===========================================

// Générer un ticket de caisse
async function generateReceipt(saleId) {
    try {
        const saleDoc = await db.collection('sales').doc(saleId).get();
        if (!saleDoc.exists) return;
        
        const saleData = saleDoc.data();
        
        const receiptWindow = window.open('', '_blank');
        
        let receiptHTML = `
            <html>
            <head>
                <title>Ticket de caisse</title>
                <style>
                    body { font-family: 'Courier New', monospace; margin: 0; padding: 20px; font-size: 14px; }
                    .receipt { max-width: 300px; margin: 0 auto; }
                    .header { text-align: center; margin-bottom: 20px; }
                    .header h2 { margin: 0; font-size: 18px; }
                    .header p { margin: 5px 0; font-size: 12px; }
                    .items { margin-bottom: 20px; }
                    .item { display: flex; justify-content: space-between; margin-bottom: 5px; }
                    .total { font-size: 18px; font-weight: bold; text-align: right; border-top: 2px dashed #000; padding-top: 10px; margin-top: 10px; }
                    .footer { text-align: center; margin-top: 20px; font-size: 12px; }
                    hr { border: 1px dashed #000; }
                </style>
            </head>
            <body>
                <div class="receipt">
                    <div class="header">
                        <h2>${currentShop?.name || 'Ma boutique'}</h2>
                        <p>${new Date().toLocaleString()}</p>
                        ${saleData.invoiceNumber ? `<p>Facture: ${saleData.invoiceNumber}</p>` : ''}
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
                    <div class="total">
                        Total: ${saleData.total.toLocaleString()} FCFA
                    </div>
                    <div class="footer">
                        <p>Merci de votre visite!</p>
                        <p>${new Date().toLocaleDateString()}</p>
                    </div>
                </div>
            </body>
            </html>
        `;
        
        receiptWindow.document.write(receiptHTML);
        receiptWindow.document.close();
        receiptWindow.print();
        
        lastReceipt = saleData;
        
    } catch (error) {
        console.error('❌ Erreur génération ticket:', error);
    }
}

// ===========================================
// HISTORIQUE DES VENTES
// ===========================================

// Charger l'historique
async function loadHistory() {
    if (!currentUser) return;
    
    try {
        const query = db.collection('sales')
            .where('userId', '==', currentUser.uid)
            .orderBy('date', 'desc')
            .limit(50);
            
        const snapshot = await query.get();
        const tbody = document.getElementById('historyTableBody');
        
        if (!tbody) return;
        
        tbody.innerHTML = '';
        
        if (snapshot.empty) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">Aucune vente</td></tr>';
            return;
        }
        
        snapshot.forEach(doc => {
            const sale = doc.data();
            const date = sale.date ? sale.date.toDate().toLocaleString() : 'Date inconnue';
            
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${date}</td>
                <td>${sale.invoiceNumber || 'N/A'}</td>
                <td>${sale.total.toLocaleString()} FCFA</td>
                <td>
                    <button onclick="printReceipt('${doc.id}')" class="btn btn-primary btn-sm">🖨️</button>
                </td>
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

// Charger le dashboard
async function loadDashboard() {
    if (!currentUser || !canAccessFeature(currentPack, 'dashboard_stats')) return;
    
    try {
        const now = new Date();
        const startOfDay = new Date(now.setHours(0,0,0,0));
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        
        // Ventes du jour
        const dailySales = await db.collection('sales')
            .where('userId', '==', currentUser.uid)
            .where('date', '>=', startOfDay)
            .get();
            
        let dailyTotal = 0;
        dailySales.forEach(doc => dailyTotal += doc.data().total);
        
        // Ventes du mois
        const monthlySales = await db.collection('sales')
            .where('userId', '==', currentUser.uid)
            .where('date', '>=', startOfMonth)
            .get();
            
        let monthlyTotal = 0;
        monthlySales.forEach(doc => monthlyTotal += doc.data().total);
        
        document.getElementById('dailySales').textContent = dailyTotal.toLocaleString() + ' FCFA';
        document.getElementById('monthlySales').textContent = monthlyTotal.toLocaleString() + ' FCFA';
        document.getElementById('totalSales').textContent = monthlySales.size + ' ventes';
        
    } catch (error) {
        console.error('❌ Erreur chargement dashboard:', error);
    }
}

// Vérifier stock faible
async function checkLowStock() {
    if (!canAccessFeature(currentPack, 'alertes_stock')) return;
    
    try {
        const products = await db.collection('products')
            .where('userId', '==', currentUser.uid)
            .where('stock', '<', 5)
            .get();
            
        document.getElementById('lowStock').textContent = products.size;
        
        if (products.size > 0) {
            showNotification(`⚠️ ${products.size} produit(s) en stock faible`, 'warning');
        }
    } catch (error) {
        console.error('❌ Erreur vérification stock:', error);
    }
}

// ===========================================
// FONCTIONS UTILITAIRES
// ===========================================

// Notifications
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = message;
    notification.style.borderLeftColor = 
        type === 'success' ? '#27ae60' : 
        type === 'error' ? '#e74c3c' : 
        type === 'warning' ? '#f39c12' : '#3498db';
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// Navigation
function showTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.style.display = 'none';
    });
    
    document.getElementById(tabName + 'Section').style.display = 'block';
    
    if (tabName === 'dashboard' && canAccessFeature(currentPack, 'dashboard_stats')) {
        loadDashboard();
    }
    
    if (tabName === 'products') {
        loadProducts();
    }
}

function showAuthPage() {
    document.getElementById('authPage').style.display = 'block';
    document.getElementById('posInterface').style.display = 'none';
    document.getElementById('logoutBtn').style.display = 'none';
}

function showPOSInterface() {
    document.getElementById('authPage').style.display = 'none';
    document.getElementById('posInterface').style.display = 'block';
    document.getElementById('logoutBtn').style.display = 'inline-block';
}

function showRegister() {
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('registerForm').style.display = 'block';
}

function showLogin() {
    document.getElementById('loginForm').style.display = 'block';
    document.getElementById('registerForm').style.display = 'none';
}

// Modals
function showAddProductModal() {
    if (!canAccessFeature(currentPack, 'gestion_stock')) {
        showNotification('Fonctionnalité réservée au pack Business+', 'error');
        return;
    }
    document.getElementById('productModal').style.display = 'block';
}

function closeProductModal() {
    document.getElementById('productModal').style.display = 'none';
    document.getElementById('productName').value = '';
    document.getElementById('productPrice').value = '';
    document.getElementById('productStock').value = '';
}

// Sauvegarde paramètres
async function saveSettings() {
    const shopName = document.getElementById('settingShopName').value;
    const phone = document.getElementById('settingPhone').value;
    const address = document.getElementById('settingAddress').value;
    
    try {
        await db.collection('users').doc(currentUser.uid).update({
            shopName: shopName,
            phone: phone,
            address: address
        });
        
        showNotification('Paramètres sauvegardés', 'success');
    } catch (error) {
        showNotification('Erreur: ' + error.message, 'error');
    }
}

// Impression
async function printReceipt(saleId) {
    await generateReceipt(saleId);
}

function printLastReceipt() {
    if (lastReceipt) {
        printReceipt(lastReceipt.id);
    } else {
        showNotification('Aucun ticket récent', 'info');
    }
}

// Export (PREMIUM)
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
            const sale = doc.data();
            const date = sale.date ? sale.date.toDate().toLocaleDateString() : '';
            const items = sale.items.map(item => `${item.name} (${item.quantity})`).join(' | ');
            
            csv += `"${date}","${sale.invoiceNumber || ''}",${sale.total},"${items}"\n`;
        });
        
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ventes_${new Date().toLocaleDateString()}.csv`;
        a.click();
        
        showNotification('Export réussi', 'success');
    } catch (error) {
        console.error('❌ Erreur export:', error);
        showNotification('Erreur lors de l\'export', 'error');
    }
}