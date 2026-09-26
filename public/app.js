const state = {
  language: "en",
  data: null,
  galleryImages: [],
  galleryIndex: 0,
  galleryProductName: "",
  galleryDescription: "",
  galleryTouchStartX: 0,
  galleryTouchStartY: 0,
};

function setupSellerLinks() {
  if (!state.data?.seller) return;

  const whatsappNumber = state.data.seller.whatsapp;
  const telegramValue = state.data.seller.telegram;
  const whatsappLink = document.getElementById("seller-whatsapp");
  const telegramLink = document.getElementById("seller-telegram");
  const whatsappMessage = encodeURIComponent("Hello I want to ask about your products");
  const telegramMessage = encodeURIComponent("Hello I want to ask about your products");

  if (whatsappLink && whatsappNumber) {
    whatsappLink.href = `https://wa.me/${whatsappNumber}?text=${whatsappMessage}`;
  }

  if (telegramLink && telegramValue) {
    const normalizedTelegram = telegramValue.trim().replace(/^@/, "");
    const isNumericId = /^\d+$/.test(normalizedTelegram);
    telegramLink.href = isNumericId
      ? `tg://user?id=${normalizedTelegram}`
      : `https://t.me/${normalizedTelegram}?text=${telegramMessage}`;
  }
}

async function loadContent() {
  const response = await fetch("/content.json");
  if (!response.ok) {
    throw new Error("Failed to load content.json");
  }

  state.data = await response.json();
  const urlParams = new URLSearchParams(window.location.search);
  const requestedLanguage = urlParams.get("lang");
  const configuredLanguage = state.data.languages.some((language) => language.code === requestedLanguage)
    ? requestedLanguage
    : state.data.defaultLanguage;

  if (state.data.languages.some((language) => language.code === configuredLanguage)) {
    state.language = configuredLanguage;
  }
  setupSellerLinks();
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
    const price = typeof product.price === "object"
      ? product.price[state.language]
      : product.price;
    const thumbnail = product.thumbnail ?? state.data.productCard?.thumbnail;
    const thumbnailWidth = Number(thumbnail?.width);
    const thumbnailHeight = Number(thumbnail?.height);
    const thumbnailStyle = Number.isFinite(thumbnailWidth) && thumbnailWidth > 0
      && Number.isFinite(thumbnailHeight) && thumbnailHeight > 0
      ? `style="--product-thumbnail-width: ${thumbnailWidth}px; --product-thumbnail-height: ${thumbnailHeight}px;"`
      : "";
    const cardHeight = Number(state.data.productCard?.height);
    const cardHeightStyle = Number.isFinite(cardHeight) && cardHeight > 0
      ? `--product-card-height: ${cardHeight}px;`
      : "";
    const descriptionMaxHeight = Number(state.data.productCard?.descriptionMaxHeight);
    const descriptionMaxHeightStyle = Number.isFinite(descriptionMaxHeight) && descriptionMaxHeight > 0
      ? `--product-description-max-height: ${descriptionMaxHeight}px;`
      : "";
    const formattedPrice = new Intl.NumberFormat(state.language, {
      minimumFractionDigits: currentText.fractionDigits ?? 2,
      maximumFractionDigits: currentText.fractionDigits ?? 2,
    }).format(Number(price));
    const priceLabel = currentText.currencyPosition === "suffix"
      ? `${formattedPrice} ${currentText.currency}`
      : `${currentText.currency}${formattedPrice}`;
    const card = document.createElement("div");
    card.className = "product-card";
    card.style.cssText = `${cardHeightStyle}${descriptionMaxHeightStyle}`;
    card.innerHTML = `
      <img class="product-image" src="${product.image}" alt="${product.name[state.language]}" ${thumbnailStyle} />
      <div class="product-info">
        <div class="product-title">${product.name[state.language]}</div>
        <div class="product-description">${product.description[state.language]}</div>
        <div class="product-price">${priceLabel}</div>
      </div>
    `;
    card.querySelector(".product-image").addEventListener("click", () => openGallery(product));
    container.appendChild(card);
  });
}

function openGallery(product) {
  state.galleryImages = Array.isArray(product.gallery) && product.gallery.length > 0
    ? product.gallery
    : [product.image];
  state.galleryIndex = 0;
  state.galleryProductName = product.name[state.language];
  state.galleryDescription = product.description[state.language];
  renderGallery();
  document.getElementById("gallery-modal").hidden = false;
  document.body.classList.add("gallery-open");
}

function renderGallery() {
  const modal = document.getElementById("gallery-modal");
  const image = document.getElementById("gallery-image");
  const counter = document.getElementById("gallery-counter");
  const hasMultipleImages = state.galleryImages.length > 1;

  image.src = state.galleryImages[state.galleryIndex];
  image.alt = `${state.galleryProductName} ${state.galleryIndex + 1}`;
  counter.textContent = `${state.galleryIndex + 1} / ${state.galleryImages.length}`;
  document.getElementById("gallery-description").textContent = state.galleryDescription;
  document.getElementById("gallery-previous").hidden = !hasMultipleImages;
  document.getElementById("gallery-next").hidden = !hasMultipleImages;
  modal.querySelector(".gallery-dialog").focus();
}

function closeGallery() {
  document.getElementById("gallery-modal").hidden = true;
  document.body.classList.remove("gallery-open");
}

function moveGallery(step) {
  if (state.galleryImages.length < 2) return;
  state.galleryIndex = (state.galleryIndex + step + state.galleryImages.length)
    % state.galleryImages.length;
  renderGallery();
}

function updateFooterLanguage() {
  if (!state.data) return;

  const footerMessage = document.querySelector(".footer-message");
  const footerAddress = document.querySelector(".footer-address");
  const footerText = state.data.footer?.[state.language] || state.data.footer?.en;

  if (footerMessage && footerText) {
    footerMessage.textContent = footerText.message;
  }

  if (footerAddress && footerText) {
    footerAddress.textContent = footerText.address;
  }
}

function updateLanguageUI() {
  const pageTitle = document.getElementById("page-title");
  const languageSelect = document.getElementById("language-select");
  const currentText = state.data.ui[state.language];
  const languageConfig = state.data.languages.find((lang) => lang.code === state.language);
  const isRtl = languageConfig?.dir === "rtl";

  pageTitle.textContent = currentText.pageTitle;
  languageSelect.value = state.language;
  updateFooterLanguage();

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
  const galleryModal = document.getElementById("gallery-modal");
  const galleryImage = document.getElementById("gallery-image");

  document.getElementById("gallery-close").addEventListener("click", closeGallery);
  document.getElementById("gallery-previous").addEventListener("click", () => moveGallery(-1));
  document.getElementById("gallery-next").addEventListener("click", () => moveGallery(1));
  galleryImage.addEventListener("touchstart", (event) => {
    const touch = event.changedTouches[0];
    state.galleryTouchStartX = touch.clientX;
    state.galleryTouchStartY = touch.clientY;
  }, { passive: true });
  galleryImage.addEventListener("touchend", (event) => {
    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - state.galleryTouchStartX;
    const deltaY = touch.clientY - state.galleryTouchStartY;

    if (Math.abs(deltaX) < 40 || Math.abs(deltaX) <= Math.abs(deltaY)) return;
    moveGallery(deltaX < 0 ? 1 : -1);
  }, { passive: true });
  galleryModal.addEventListener("click", (event) => {
    if (event.target === galleryModal) closeGallery();
  });
  document.addEventListener("keydown", (event) => {
    if (galleryModal.hidden) return;
    if (event.key === "Escape") closeGallery();
    if (event.key === "ArrowLeft") moveGallery(-1);
    if (event.key === "ArrowRight") moveGallery(1);
  });

  languageSelect.addEventListener("change", (event) => {
    state.language = event.target.value;
    updateLanguageUI();
    renderProducts();
  });

  loadContent().catch((error) => {
    console.error(error);
  });
});