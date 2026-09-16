// Product dataset
const PRODUCTS = [
    { id: "1", name: "Premium Coffee Beans", price: 14.99, image: "https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=150&q=80" },
    { id: "2", name: "Pour-over Glass Dripper", price: 29.50, image: "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=150&q=80" },
    { id: "3", name: "Double-walled Mug", price: 18.00, image: "https://images.unsplash.com/photo-1517256064527-09c73fc73e38?w=150&q=80" }
];

const tg = window.Telegram?.WebApp;
const cart = new Map(); // productId -> quantity

function initTelegram() {
    if (!tg) return;
    tg.ready();
    tg.expand();

    tg.MainButton.setText("CHECKOUT ($0.00)");
    tg.MainButton.onClick(handleCheckout);
}

function updateCart(productId, delta) {
    const current = cart.get(productId) || 0;
    const next = current + delta;

    if (next <= 0) {
        cart.delete(productId);
    } else {
        cart.set(productId, next);
    }

    renderProducts();
    syncMainButton();
}

function syncMainButton() {
    if (!tg) return;

    let totalItems = 0;
    let totalPrice = 0;

    for (const [id, qty] of cart.entries()) {
        const product = PRODUCTS.find((p) => p.id === id);
        if (product) {
            totalItems += qty;
            totalPrice += product.price * qty;
        }
    }

    if (totalItems > 0) {
        tg.MainButton.setText(`CHECKOUT ($${totalPrice.toFixed(2)})`);
        tg.MainButton.show();
    } else {
        tg.MainButton.hide();
    }
}

function handleCheckout() {
    if (!tg) return;

    const items = [];
    let totalPrice = 0;

    for (const [id, qty] of cart.entries()) {
        const product = PRODUCTS.find((p) => p.id === id);
        if (product) {
            items.push({
                productId: product.id,
                name: product.name,
                quantity: qty,
                price: product.price
            });
            totalPrice += product.price * qty;
        }
    }

    const payload = {
        items,
        totalPrice
    };

    // Sends stringified JSON back to the bot (triggers message:web_app_data event)
    tg.sendData(JSON.stringify(payload));
    tg.close();
}

function renderProducts() {
    const container = document.getElementById("catalog");
    container.innerHTML = "";

    PRODUCTS.forEach((product) => {
        const qty = cart.get(product.id) || 0;

        const card = document.createElement("div");
        card.className = "product-card";
        card.innerHTML = `
      <img src="${product.image}" alt="${product.name}" />
      <div class="product-info">
        <div class="product-title">${product.name}</div>
        <div class="product-price">$${product.price.toFixed(2)}</div>
      </div>
      <div class="counter-controls">
        ${qty > 0 ? `<button class="counter-btn" onclick="updateCart('${product.id}', -1)">-</button>` : ""}
        ${qty > 0 ? `<span class="counter-val">${qty}</span>` : ""}
        <button class="counter-btn" onclick="updateCart('${product.id}', 1)">+</button>
      </div>
    `;
        container.appendChild(card);
    });
}

// Initialize on page load
window.addEventListener("DOMContentLoaded", () => {
    initTelegram();
    renderProducts();
});