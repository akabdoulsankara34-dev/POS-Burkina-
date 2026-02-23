// État global de l'application
let currentUser = null;
let currentPack = PACKS.STARTER;
let cart = [];
let currentShop = null;
let lastReceipt = null;

// Initialisation
document.addEventListener('DOMContentLoaded', () => {
    // Vérifier session utilisateur
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            currentUser = user;
            await loadUserData(user.uid);
            showPOSInterface();
            loadProducts();
            loadHistory();
            
            if (canAccessFeature(currentPack, 'gestion_stock')) {
                checkLowStock();
            }
            
            if (canAccessFeature(currentPack, 'dashboard_stats')) {
                loadDashboard();
            }
        } else {
            showAuthPage();
        }
    });
});

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
        }
        
        // Charger la boutique active
        const shopsSnapshot = await db.collection('shops')
            .where('userId', '==', userId)
            .limit(1)
            .get();
            
        if (!shopsSnapshot.empty) {
            currentShop = shopsSnapshot.docs[0].data();
        }
    } catch (error) {
        console.error('Erreur chargement utilisateur:', error);
    }
}

// Mise à jour UI selon pack
function updateUIBasedOnPack() {
    const packBadge = document.createElement('span');
    packBadge.className = `badge badge-${currentPack}`;
    packBadge.textContent = currentPack.toUpperCase();
    
    document.getElementById('userInfo').innerHTML = `
        ${currentUser.email} 
        ${packBadge.outerHTML}
    `;
    
    // Afficher/cacher fonctionnalités selon pack
    document.getElementById('productsTabBtn').style.display = 
        canAccessFeature(currentPack, 'gestion_stock') ? 'inline-block' : 'none';
    
    document.getElementById('dashboardTabBtn').style.display = 
        canAccessFeature(currentPack, 'dashboard_stats') ? 'inline-block' : 'none';
    
    if (canAccessFeature(currentPack, 'exports')) {
        document.getElementById('exportBtn').style.display = 'inline-block';
    }
    
    if (canAccessFeature(currentPack, 'multi_boutiques')) {
        document.getElementById('multiStoreSection').style.display = 'block';
    }
    
    if (canAccessFeature(currentPack, 'graphiques_avances')) {
        document.getElementById('premiumCharts').style.display = 'block';
    }
}

// Authentification
async function login() {
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    
    try {
        await auth.signInWithEmailAndPassword(email, password);
        showNotification('Connexion réussie', 'success');
    } catch (error) {
        showNotification('Erreur de connexion: ' + error.message, 'error');
    }
}

async function register() {
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    const shopName = document.getElementById('shopName').value;
    const pack = document.getElementById('packChoice').value;
    
    try {
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        const user = userCredential.user;
        
        // Créer document utilisateur
        await db.collection('users').doc(user.uid).set({
            email: email,
            pack: pack,
            shopName: shopName,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Créer boutique par défaut
        await db.collection('shops').add({
            userId: user.uid,
            name: shopName,
            address: '',
            phone: '',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        showNotification('Compte créé avec succès', 'success');
    } catch (error) {
        showNotification('Erreur création compte: ' + error.message, 'error');
    }
}

function logout() {
    auth.signOut();
    showAuthPage();
}

// Gestion des produits
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
        console.error('Erreur chargement produits:', error);
    }
}

function displayProducts(products) {
    const container = document.getElementById('productsList');
    container.innerHTML = '';
    
    products.forEach(product => {
        const card = document.createElement('div');
        card.className = 'product-card';
        card.onclick = () => addToCart(product);
        
        card.innerHTML = `
            <div class="product-name">${product.name}</div>
            <div class="product-price">${product.price.toLocaleString()} FCFA</div>
            ${canAccessFeature(currentPack, 'gestion_stock') ? 
                `<div class="product-stock">Stock: ${product.stock}</div>` : ''}
        `;
        
        container.appendChild(card);
    });
}

function displayProductsTable(products) {
    const tbody = document.getElementById('productsTableBody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    products.forEach(product => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${product.name}</td>
            <td>${product.price.toLocaleString()} FCFA</td>
            <td>
                <span style="color: ${product.stock < 10 ? 'red' : 'green'};">
                    ${product.stock}
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

async function saveProduct() {
    const name = document.getElementById('productName').value;
    const price = parseFloat(document.getElementById('productPrice').value);
    const stock = parseInt(document.getElementById('productStock').value);
    
    if (!name || !price) {
        showNotification('Veuillez remplir tous les champs', 'error');
        return;
    }
    
    try {
        await db.collection('products').add({
            userId: currentUser.uid,
            name: name,
            price: price,
            stock: stock || 0,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        showNotification('Produit ajouté avec succès', 'success');
        closeProductModal();
        loadProducts();
    } catch (error) {
        showNotification('Erreur: ' + error.message, 'error');
    }
}

// Gestion du panier
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
}

function updateCartDisplay() {
    const cartContainer = document.getElementById('cartItems');
    const totalSpan = document.getElementById('cartTotal');
    
    let total = 0;
    cartContainer.innerHTML = '';
    
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
                <button onclick="removeFromCart(${index})" style="border: none; background: none; cursor: pointer;">❌</button>
            </div>
        `;
        
        cartContainer.appendChild(itemDiv);
    });
    
    totalSpan.textContent = total.toLocaleString() + ' FCFA';
}

function removeFromCart(index) {
    cart.splice(index, 1);
    updateCartDisplay();
}

// Validation de vente
async function checkout() {
    if (cart.length === 0) {
        showNotification('Panier vide', 'error');
        return;
    }
    
    const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    
    try {
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
                const currentStock = productDoc.data().stock;
                await productRef.update({
                    stock: currentStock - item.quantity
                });
            }
        }
        
        // Générer ticket
        await generateReceipt(saleRef.id);
        
        // Notification WhatsApp (PREMIUM)
        if (canAccessFeature(currentPack, 'whatsapp_notif')) {
            sendWhatsAppNotification(sale);
        }
        
        // Vider le panier
        cart = [];
        updateCartDisplay();
        
        showNotification('Vente enregistrée avec succès', 'success');
        loadHistory();
        
        if (canAccessFeature(currentPack, 'dashboard_stats')) {
            loadDashboard();
        }
    } catch (error) {
        console.error('Erreur vente:', error);
        showNotification('Erreur lors de la vente', 'error');
    }
}

// Génération ticket
async function generateReceipt(saleId) {
    const sale = await db.collection('sales').doc(saleId).get();
    const saleData = sale.data();
    
    const receiptWindow = window.open('', '_blank');
    
    let receiptHTML = `
        <html>
        <head>
            <title>Ticket de caisse</title>
            <style>
                body { font-family: 'Courier New', monospace; margin: 0; padding: 20px; }
                .receipt { max-width: 300px; margin: 0 auto; }
                .header { text-align: center; margin-bottom: 20px; }
                .items { margin-bottom: 20px; }
                .item { display: flex; justify-content: space-between; margin-bottom: 5px; }
                .total { font-size: 18px; font-weight: bold; text-align: right; border-top: 2px dashed #000; padding-top: 10px; }
                .footer { text-align: center; margin-top: 20px; font-size: 12px; }
                hr { border: 1px dashed #000; }
            </style>
        </head>
        <body>
            <div class="receipt">
                <div class="header">
                    <h2>${currentShop?.name || 'Ma boutique'}</h2>
                    <p>${new Date().toLocaleString()}</p>
    `;
    
    // Ajouter QR code pour PREMIUM
    if (canAccessFeature(currentPack, 'qr_code')) {
        receiptHTML += `<div id="qrcode"></div>`;
    }
    
    receiptHTML += `
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
    `;
    
    if (canAccessFeature(currentPack, 'qr_code')) {
        receiptHTML += `
            <script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.1/build/qrcode.min.js"></script>
            <script>
                QRCode.toCanvas(document.getElementById('qrcode'), '${saleData.invoiceNumber}', function(error) {
                    if (error) console.error(error);
                });
            </script>
        `;
    }
    
    receiptHTML += `</body></html>`;
    
    receiptWindow.document.write(receiptHTML);
    receiptWindow.document.close();
    receiptWindow.print();
    
    lastReceipt = saleData;
}

// Charger historique
async function loadHistory() {
    if (!currentUser) return;
    
    try {
        let query = db.collection('sales')
            .where('userId', '==', currentUser.uid)
            .orderBy('date', 'desc')
            .limit(50);
            
        const snapshot = await query.get();
        const tbody = document.getElementById('historyTableBody');
        
        tbody.innerHTML = '';
        
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
        console.error('Erreur chargement historique:', error);
    }
}

// Charger dashboard
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
        document.getElementById('totalSales').textContent = monthlySales.size;
        
        // Graphiques PREMIUM
        if (canAccessFeature(currentPack, 'graphiques_avances')) {
            generateSalesChart();
        }
    } catch (error) {
        console.error('Erreur chargement dashboard:', error);
    }
}

// Vérifier stock faible
async function checkLowStock() {
    if (!canAccessFeature(currentPack, 'alertes_stock')) return;
    
    try {
        const products = await db.collection('products')
            .where('userId', '==', currentUser.uid)
            .where('stock', '<', 10)
            .get();
            
        document.getElementById('lowStock').textContent = products.size;
        
        if (products.size > 0) {
            showNotification(`⚠️ ${products.size} produit(s) en stock faible`, 'warning');
        }
    } catch (error) {
        console.error('Erreur vérification stock:', error);
    }
}

// Générer graphique (PREMIUM)
function generateSalesChart() {
    const ctx = document.getElementById('salesChart').getContext('2d');
    
    // Récupérer les ventes des 7 derniers jours
    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        last7Days.push(date.toLocaleDateString());
    }
    
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: last7Days,
            datasets: [{
                label: 'Ventes (FCFA)',
                data: [12000, 15000, 8000, 20000, 18000, 25000, 22000],
                borderColor: '#3498db',
                backgroundColor: 'rgba(52, 152, 219, 0.1)',
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            }
        }
    });
}

// Export ventes (PREMIUM)
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
    } catch (error) {
        console.error('Erreur export:', error);
        showNotification('Erreur lors de l\'export', 'error');
    }
}

// Notification WhatsApp (PREMIUM - simulation)
function sendWhatsAppNotification(sale) {
    if (!canAccessFeature(currentPack, 'whatsapp_notif')) return;
    
    const message = `Nouvelle vente: ${sale.total.toLocaleString()} FCFA - ${new Date().toLocaleString()}`;
    console.log('WhatsApp notification:', message);
    // Intégration API WhatsApp à implémenter
}

// Notifications UI
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = message;
    
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

// Impression ticket
async function printReceipt(saleId) {
    await generateReceipt(saleId);
}

function printLastReceipt() {
    if (lastReceipt) {
        printReceipt(lastReceipt.id);
    }
}