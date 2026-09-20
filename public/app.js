// Product dataset
const PRODUCTS = [
    { id: "1", name: "Premium Coffee Beans", description: "Rich, smooth arabica beans with notes of chocolate and toasted nuts.", price: 14.99, image: "/images/coffee-beans.jpg" },
    { id: "2", name: "Pour-over Glass Dripper", description: "A clear glass dripper for a balanced brew and precise pour-over control.", price: 29.50, image: "/images/glass-dripper.jpg" },
    { id: "3", name: "Double-walled Mug", description: "An insulated glass mug that keeps coffee warm while staying comfortable to hold.", price: 18.00, image: "/images/double-walled-mug.jpg" }
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