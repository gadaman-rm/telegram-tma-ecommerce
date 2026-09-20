const state = {
  language: "en",
  data: null,
};

async function loadContent() {
  const response = await fetch("/content.json");
  if (!response.ok) {
    throw new Error("Failed to load content.json");
  }

  state.data = await response.json();
  populateLanguageSelector();
  updateLanguageUI();
  renderProducts();
}

function populateLanguageSelector() {
  const languageSelect = document.getElementById("language-select");
  languageSelect.innerHTML = "";

  state.data.languages.forEach((lang) => {
    const option = document.createElement("option");
    option.value = lang.code;
    option.textContent = lang.label;
    languageSelect.appendChild(option);
  });

  languageSelect.value = state.language;
}

function renderProducts() {
  const container = document.getElementById("catalog");
  const currentText = state.data.ui[state.language];
  container.innerHTML = "";

  state.data.products.forEach((product) => {
    const card = document.createElement("div");
    card.className = "product-card";
    card.innerHTML = `
      <img src="${product.image}" alt="${product.name[state.language]}" />
      <div class="product-info">
        <div class="product-title">${product.name[state.language]}</div>
        <div class="product-description">${product.description[state.language]}</div>
        <div class="product-price">${currentText.currency}${Number(product.price).toFixed(2)}</div>
      </div>
    `;
    container.appendChild(card);
  });
}

function updateLanguageUI() {
  const pageTitle = document.getElementById("page-title");
  const languageSelect = document.getElementById("language-select");
  const currentText = state.data.ui[state.language];
  const languageConfig = state.data.languages.find((lang) => lang.code === state.language);
  const isRtl = languageConfig?.dir === "rtl";

  pageTitle.textContent = currentText.pageTitle;
  languageSelect.value = state.language;

  document.documentElement.lang = state.language;
  document.documentElement.dir = isRtl ? "rtl" : "ltr";
  document.documentElement.setAttribute("dir", isRtl ? "rtl" : "ltr");
  document.body.dir = isRtl ? "rtl" : "ltr";
  document.body.setAttribute("dir", isRtl ? "rtl" : "ltr");
  document.body.classList.toggle("rtl", isRtl);
  document.body.classList.toggle("ltr", !isRtl);
}

window.addEventListener("DOMContentLoaded", () => {
  const languageSelect = document.getElementById("language-select");

  languageSelect.addEventListener("change", (event) => {
    state.language = event.target.value;
    updateLanguageUI();
    renderProducts();
  });

  loadContent().catch((error) => {
    console.error(error);
  });
});