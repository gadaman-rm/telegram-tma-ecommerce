// Product dataset
const PRODUCTS = [
    { id: "1", name: "Premium Coffee Beans", description: "Rich, smooth arabica beans with notes of chocolate and toasted nuts.", price: 14.99, image: "https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=150&q=80" },
    { id: "2", name: "Pour-over Glass Dripper", description: "A clear glass dripper for a balanced brew and precise pour-over control.", price: 29.50, image: "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=150&q=80" },
    { id: "3", name: "Double-walled Mug", description: "An insulated glass mug that keeps coffee warm while staying comfortable to hold.", price: 18.00, image: "https://images.unsplash.com/photo-1517256064527-09c73fc73e38?w=150&q=80" }
];

function renderProducts() {
    const container = document.getElementById("catalog");
    container.innerHTML = "";

    PRODUCTS.forEach((product) => {
        const card = document.createElement("div");
        card.className = "product-card";
        card.innerHTML = `
      <img src="${product.image}" alt="${product.name}" />
      <div class="product-info">
        <div class="product-title">${product.name}</div>
        <div class="product-description">${product.description}</div>
        <div class="product-price">$${product.price.toFixed(2)}</div>
      </div>
    `;
        container.appendChild(card);
    });
}

// Initialize on page load
window.addEventListener("DOMContentLoaded", () => {
    renderProducts();
});