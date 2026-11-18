/* go:) kart (SPA) - script.js
   Hash routing | JSON data | cart + orders in localStorage | checkout validation */

const app = document.getElementById("app");
const KEYS = { cart: "cart", orders: "orders", coupon: "coupon" };
const COUPONS = { SAVE10: 10, STUDENT20: 20 };      // code -> percent off
const MAX_QTY = 10;
const DATA = { categories: [], products: [] };       // filled by loadData()

/* ===== 1. HELPERS ===== */
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}
function show(templateId) {                           // draw a <template> inside #app
  app.replaceChildren(document.getElementById(templateId).content.cloneNode(true));
}
function money(n) { return "₹" + n.toLocaleString("en-IN"); }
function stars(r) { return "★".repeat(Math.round(r)) + "☆".repeat(5 - Math.round(r)) + " " + r; }
function readStore(key, fallback) {
  const data = localStorage.getItem(key);             // string or null
  return data ? JSON.parse(data) : fallback;          // string -> object
}
function writeStore(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
function findProduct(id) { return DATA.products.find(function (p) { return p.id === Number(id); }); }
function findCategory(id) { return DATA.categories.find(function (c) { return c.id === id; }); }

let toastTimer;
function showToast(message) {
  const t = document.getElementById("toast");
  t.textContent = message;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { t.classList.remove("show"); }, 2000);
}

/* ===== 2. LOAD JSON DATA ===== */
async function loadData() {
  const res = await Promise.all([fetch("data/categories.json"), fetch("data/products.json")]);
  if (!res[0].ok || !res[1].ok) throw new Error("JSON file not found");
  DATA.categories = await res[0].json();
  DATA.products = await res[1].json();
}

/* ===== 3. CART (stores only id + qty; price always comes from JSON) ===== */
function getCart() { return readStore(KEYS.cart, []); }
function saveCart(cart) { writeStore(KEYS.cart, cart); updateCartBadge(); }
function cartCount() { return getCart().reduce(function (sum, i) { return sum + i.qty; }, 0); }
function updateCartBadge() { document.getElementById("cartCount").textContent = cartCount(); }

function addToCart(id) {
  const cart = getCart();
  const item = cart.find(function (i) { return i.id === id; });
  if (item && item.qty >= MAX_QTY) { showToast("Maximum " + MAX_QTY + " per product"); return; }
  if (item) { item.qty++; } else { cart.push({ id: id, qty: 1 }); }
  saveCart(cart);
  showToast(findProduct(id).name + " added to cart");
}
function changeQty(id, delta) {
  const cart = getCart();
  const item = cart.find(function (i) { return i.id === id; });
  if (!item) return;
  item.qty = Math.min(MAX_QTY, Math.max(1, item.qty + delta));
  saveCart(cart);
}
function removeFromCart(id) {
  saveCart(getCart().filter(function (i) { return i.id !== id; }));
}
function clearCart() { saveCart([]); localStorage.removeItem(KEYS.coupon); }

// subtotal, coupon discount, delivery fee and total
function calcTotals() {
  let subtotal = 0;
  getCart().forEach(function (i) {
    const p = findProduct(i.id);
    if (p) subtotal += p.price * i.qty;
  });
  const code = readStore(KEYS.coupon, "");
  const percent = COUPONS[code] || 0;
  const discount = Math.round(subtotal * percent / 100);
  const delivery = (subtotal === 0 || subtotal - discount >= 999) ? 0 : 49;   // free above Rs 999
  return { subtotal: subtotal, code: percent ? code : "", discount: discount, delivery: delivery,
           total: subtotal - discount + delivery };
}

/* ===== 4. SMALL UI BUILDERS ===== */
function priceBox(p) {
  const box = el("div", "price");
  box.appendChild(el("strong", "", money(p.price)));
  box.appendChild(el("s", "mrp", money(p.mrp)));
  box.appendChild(el("span", "off", Math.round((p.mrp - p.price) * 100 / p.mrp) + "% off"));
  return box;
}

function createProductCard(p) {
  const card = el("article", "product-card");
  const link = el("a");
  link.href = "#/product/" + p.id;
  const img = el("img");
  img.src = p.image; img.alt = p.name; img.loading = "lazy";
  link.appendChild(img);

  const body = el("div", "product-body");
  const name = el("a", "product-name", p.name);
  name.href = "#/product/" + p.id;
  body.append(name, el("div", "rating", stars(p.rating)), priceBox(p));

  const btn = el("button", "btn-small", "Add to cart");
  btn.dataset.add = p.id;
  card.append(link, body, btn);
  return card;
}

// Expand/collapse block: title button + hidden body
function makeAccordion(title, content) {
  const box = el("div", "acc");
  const btn = el("button", "acc-btn");
  btn.append(el("span", "", title), el("span", "sign", "+"));
  btn.setAttribute("aria-expanded", "false");
  const body = el("div", "acc-body");
  body.appendChild(content);
  box.append(btn, body);
  return box;
}
function toggleAccordion(btn) {
  const isOpen = btn.closest(".acc").classList.toggle("open");
  btn.setAttribute("aria-expanded", isOpen);
  btn.querySelector(".sign").textContent = isOpen ? "−" : "+";
}

function createSummary(t) {
  const box = el("div", "summary");
  function row(label, value, cls) {
    const r = el("div", "row " + (cls || ""));
    r.append(el("span", "", label), el("span", "", value));
    box.appendChild(r);
  }
  row("Subtotal", money(t.subtotal));
  if (t.discount) row("Coupon " + t.code, "- " + money(t.discount), "save");
  row("Delivery", t.delivery ? money(t.delivery) : "FREE");
  row("Total", money(t.total), "total");
  return box;
}

function emptyMessage(text) {
  const box = el("div");
  box.appendChild(el("p", "empty", text));
  const a = el("a", "btn", "Browse products");
  a.href = "#/shop";
  box.appendChild(a);
  return box;
}

/* ===== 5. NAVBAR ===== */
function buildDropdown() {
  const menu = document.getElementById("deptMenu");
  DATA.categories.forEach(function (c) {
    const li = el("li");
    const a = el("a", "", c.icon + " " + c.name);
    a.href = "#/shop/" + c.id;
    li.appendChild(a);
    menu.appendChild(li);
  });
}
function closeMenus() {
  document.getElementById("deptMenu").classList.remove("open");
  document.getElementById("mainNav").classList.remove("open");
}
function setupNavbar() {
  document.getElementById("deptBtn").addEventListener("click", function () {
    const open = document.getElementById("deptMenu").classList.toggle("open");
    this.setAttribute("aria-expanded", open);
  });
  document.getElementById("menuToggle").addEventListener("click", function () {
    document.getElementById("mainNav").classList.toggle("open");
  });
  document.addEventListener("click", function (e) {
    if (!document.querySelector(".dropdown").contains(e.target)) {
      document.getElementById("deptMenu").classList.remove("open");
    }
  });
}

/* ===== 6. ROUTER ===== */
const routes = {
  home: renderHome, shop: renderShop, product: renderProduct,
  cart: renderCartPage, checkout: renderCheckout, orders: renderOrders
};

function router() {
  const parts = location.hash.replace("#/", "").split("/");   // "#/shop/books" -> ["shop","books"]
  const page = parts[0] || "home";
  const param = parts[1] || "all";
  closeMenus();
  if (routes[page]) { routes[page](param); } else { show("tpl-404"); }
  document.querySelectorAll("[data-route]").forEach(function (a) {
    a.classList.toggle("active", a.dataset.route === page);
  });
  window.scrollTo(0, 0);
}

/* ===== 7. VIEWS ===== */
function renderHome() {
  show("tpl-home");
  const cats = document.getElementById("homeCats");
  DATA.categories.forEach(function (c) {
    const card = el("article", "card");
    card.appendChild(el("h3", "", c.icon + " " + c.name));
    const n = DATA.products.filter(function (p) { return p.category === c.id; }).length;
    card.appendChild(el("p", "", n + " products"));
    const a = el("a", "", "Browse");
    a.href = "#/shop/" + c.id;
    card.appendChild(a);
    cats.appendChild(card);
  });
  const top = DATA.products.slice().sort(function (a, b) { return b.rating - a.rating; }).slice(0, 4);
  top.forEach(function (p) { document.getElementById("homeTop").appendChild(createProductCard(p)); });
}

function renderShop(catId) {
  show("tpl-shop");
  const catSel = document.getElementById("catFilter");
  const search = document.getElementById("search");
  const sort = document.getElementById("sort");
  const grid = document.getElementById("productGrid");
  catSel.appendChild(new Option("All categories", "all"));
  DATA.categories.forEach(function (c) { catSel.appendChild(new Option(c.name, c.id)); });
  catSel.value = catId;

  function draw() {                                    // filter -> sort -> build cards
    const text = search.value.trim().toLowerCase();
    const list = DATA.products.filter(function (p) {
      return (catId === "all" || p.category === catId) && p.name.toLowerCase().includes(text);
    });
    if (sort.value === "low") list.sort(function (a, b) { return a.price - b.price; });
    if (sort.value === "high") list.sort(function (a, b) { return b.price - a.price; });
    if (sort.value === "rating") list.sort(function (a, b) { return b.rating - a.rating; });
    grid.replaceChildren();
    list.forEach(function (p) { grid.appendChild(createProductCard(p)); });
    document.getElementById("resultCount").textContent =
      list.length ? list.length + " product(s) found" : "No products match your search.";
  }
  catSel.addEventListener("change", function () { location.hash = "#/shop/" + catSel.value; });
  search.addEventListener("input", draw);
  sort.addEventListener("change", draw);
  draw();
}

function renderProduct(id) {
  const p = findProduct(id);
  if (!p) { show("tpl-404"); return; }
  show("tpl-product");
  const cat = findCategory(p.category);
  const crumb = document.getElementById("crumbCat");
  crumb.textContent = cat.name; crumb.href = "#/shop/" + cat.id;
  const img = document.getElementById("pImg");
  img.src = p.image; img.alt = p.name;
  document.getElementById("pName").textContent = p.name;
  document.getElementById("pBadge").textContent = cat.name;
  document.getElementById("pRating").textContent = stars(p.rating);
  document.getElementById("pPrice").appendChild(priceBox(p));
  document.getElementById("pDesc").textContent = p.description;
  document.getElementById("pAdd").dataset.add = p.id;
  document.getElementById("pBuy").dataset.buy = p.id;

  const specs = el("ul");
  p.specs.forEach(function (s) { specs.appendChild(el("li", "", s)); });
  const acc = document.getElementById("pAcc");
  acc.appendChild(makeAccordion("Specifications", specs));
  acc.appendChild(makeAccordion("Delivery & Returns",
    el("p", "", "Delivery in 3-5 days. Free delivery above ₹999. 7 day easy returns.")));

  DATA.products.filter(function (x) { return x.category === p.category && x.id !== p.id; })
    .slice(0, 4).forEach(function (x) { document.getElementById("related").appendChild(createProductCard(x)); });
}

/* ----- Cart page ----- */
function renderCartPage() { show("tpl-cart"); renderCart(); }

function renderCart() {
  const box = document.getElementById("cartContent");
  box.replaceChildren();
  const cart = getCart().filter(function (i) { return findProduct(i.id); });
  if (cart.length === 0) { box.appendChild(emptyMessage("Your cart is empty.")); return; }

  const layout = el("div", "two-col");
  const list = el("section");
  cart.forEach(function (item) {
    const p = findProduct(item.id);
    const row = el("div", "cart-row");
    const img = el("img"); img.src = p.image; img.alt = p.name;

    const info = el("div");
    const name = el("a", "product-name", p.name); name.href = "#/product/" + p.id;
    info.append(name, el("span", "", money(p.price) + " each"));

    const qty = el("div", "qty");
    const minus = el("button", "", "−"); minus.dataset.qty = -1; minus.dataset.id = p.id;
    const plus = el("button", "", "+"); plus.dataset.qty = 1; plus.dataset.id = p.id;
    qty.append(minus, el("span", "", item.qty), plus);

    const total = el("div", "line-total", money(p.price * item.qty));
    const remove = el("button", "link-btn", "Remove"); remove.dataset.remove = p.id;
    row.append(img, info, qty, total, remove);
    list.appendChild(row);
  });
  const clear = el("button", "btn-small", "Clear cart");
  clear.dataset.clear = "1";
  list.appendChild(clear);

  const side = el("aside");
  const t = calcTotals();
  side.appendChild(createSummary(t));
  const coupon = el("div", "coupon");
  const input = el("input"); input.id = "couponInput"; input.placeholder = "Coupon code"; input.value = t.code;
  const apply = el("button", "btn-small", t.code ? "Remove" : "Apply");
  apply.dataset.coupon = t.code ? "remove" : "apply";
  coupon.append(input, apply);
  side.appendChild(coupon);
  const checkout = el("a", "btn", "Proceed to Checkout");
  checkout.href = "#/checkout";
  side.appendChild(checkout);

  layout.append(list, side);
  box.appendChild(layout);
}

function applyCoupon() {
  const code = document.getElementById("couponInput").value.trim().toUpperCase();
  if (COUPONS[code]) { writeStore(KEYS.coupon, code); showToast("Coupon " + code + " applied"); }
  else { showToast("Invalid coupon code"); }
  renderCart();
}

/* ----- Checkout ----- */
function showError(id, msg) {
  document.getElementById(id + "Error").textContent = msg;
  const f = document.getElementById(id);
  f.classList.add("invalid"); f.classList.remove("valid");
}
function clearError(id) {
  document.getElementById(id + "Error").textContent = "";
  const f = document.getElementById(id);
  f.classList.remove("invalid"); f.classList.add("valid");
}
function check(id, ok, msg) { if (ok) { clearError(id); } else { showError(id, msg); } return ok; }

function validateCheckout() {
  const v = function (id) { return document.getElementById(id).value.trim(); };
  const payment = v("payment");
  const results = [
    check("name", /^[A-Za-z .]{3,}$/.test(v("name")), "Enter a valid name (letters only, min 3)."),
    check("email", /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v("email")), "Enter a valid email address."),
    check("phone", /^[6-9]\d{9}$/.test(v("phone")), "Enter a 10-digit mobile number starting with 6-9."),
    check("address", v("address").length >= 10, "Address must be at least 10 characters."),
    check("pincode", /^[1-9]\d{5}$/.test(v("pincode")), "Enter a valid 6-digit pincode."),
    check("payment", payment !== "", "Select a payment method.")
  ];
  if (payment === "UPI") {
    results.push(check("upi", /^[\w.-]{2,}@[A-Za-z]{2,}$/.test(v("upi")), "Enter a valid UPI ID like name@bank."));
  }
  return results.every(Boolean);
}

function placeOrder(event) {
  event.preventDefault();                              // stop page reload
  if (!validateCheckout()) return;
  const v = function (id) { return document.getElementById(id).value.trim(); };
  const items = getCart().map(function (i) {
    const p = findProduct(i.id);
    return { name: p.name, price: p.price, qty: i.qty };   // snapshot of price at purchase time
  });
  const order = {
    id: "ORD" + Date.now(),
    date: new Date().toLocaleString(),
    customer: { name: v("name"), email: v("email"), phone: v("phone"), address: v("address"), pincode: v("pincode") },
    payment: v("payment"),
    items: items,
    totals: calcTotals()
  };
  const orders = readStore(KEYS.orders, []);
  orders.push(order);
  writeStore(KEYS.orders, orders);
  clearCart();
  showToast("Order placed successfully!");
  location.hash = "#/orders";
}

function renderCheckout() {
  if (getCart().length === 0) {
    app.replaceChildren(emptyMessage("Your cart is empty. Add items before checkout."));
    return;
  }
  show("tpl-checkout");
  const summary = document.getElementById("summaryBox");
  const items = el("ul");
  getCart().forEach(function (i) {
    const p = findProduct(i.id);
    items.appendChild(el("li", "", p.name + " x " + i.qty + " = " + money(p.price * i.qty)));
  });
  summary.append(createSummary(calcTotals()), makeAccordion("Items in this order", items));

  document.getElementById("payment").addEventListener("change", function () {
    document.getElementById("upiField").classList.toggle("hidden", this.value !== "UPI");
  });
  document.getElementById("checkoutForm").addEventListener("submit", placeOrder);
}

/* ----- Orders ----- */
function renderOrders() {
  show("tpl-orders");
  const box = document.getElementById("orderList");
  const orders = readStore(KEYS.orders, []);
  if (orders.length === 0) { box.appendChild(emptyMessage("You have no orders yet.")); return; }

  orders.slice().reverse().forEach(function (o) {
    const body = el("div");
    const ul = el("ul");
    o.items.forEach(function (i) { ul.appendChild(el("li", "", i.name + " x " + i.qty + " = " + money(i.price * i.qty))); });
    body.appendChild(ul);
    body.appendChild(el("p", "", "Total paid: " + money(o.totals.total) + " (" + o.payment + ")"));
    body.appendChild(el("p", "", "Deliver to: " + o.customer.name + ", " + o.customer.address + " - " + o.customer.pincode));
    box.appendChild(makeAccordion(o.id + "  |  " + o.date, body));
  });
  const clear = el("button", "btn-small", "Clear order history");
  clear.dataset.clearOrders = "1";
  box.appendChild(clear);
}

/* ===== 8. ONE CLICK LISTENER FOR THE WHOLE APP (event delegation) ===== */
function handleAppClick(event) {
  const btn = event.target.closest("button");
  if (!btn) return;
  const d = btn.dataset;
  if (d.add) { addToCart(Number(d.add)); }
  else if (d.buy) { addToCart(Number(d.buy)); location.hash = "#/checkout"; }
  else if (d.qty) { changeQty(Number(d.id), Number(d.qty)); renderCart(); }
  else if (d.remove) { removeFromCart(Number(d.remove)); renderCart(); }
  else if (d.clear) { clearCart(); renderCart(); }
  else if (d.coupon === "apply") { applyCoupon(); }
  else if (d.coupon === "remove") { localStorage.removeItem(KEYS.coupon); renderCart(); }
  else if (d.clearOrders) { localStorage.removeItem(KEYS.orders); renderOrders(); }
  else if (btn.classList.contains("acc-btn")) { toggleAccordion(btn); }
}

/* ===== 9. START ===== */
async function init() {
  setupNavbar();
  app.addEventListener("click", handleAppClick);
  updateCartBadge();
  try {
    await loadData();
    buildDropdown();
    router();
    window.addEventListener("hashchange", router);
  } catch (error) {
    app.replaceChildren(el("p", "error",
      "Could not load data (" + error.message + "). Run the project with a local server, e.g. VS Code Live Server."));
  }
}
init();
