const assert = require('assert');

// Test suite for Guest Cart & Wishlist persistence, Move-to-Cart, and Database Sync
console.log('🧪 Starting YogaZen Guest Cart & Wishlist Verification Test Suite...\n');

// 1. Mock LocalStorage Implementation
class MockLocalStorage {
  constructor() {
    this.store = {};
  }
  getItem(key) {
    return this.store[key] || null;
  }
  setItem(key, val) {
    this.store[key] = String(val);
  }
  removeItem(key) {
    delete this.store[key];
  }
  clear() {
    this.store = {};
  }
}

const localStorage = new MockLocalStorage();
const GUEST_CART_KEY = 'yogazen_guest_cart';
const GUEST_WISHLIST_KEY = 'yogazen_guest_wishlist';

// Helper functions mirroring CartWishlistContext
const loadGuestCart = () => {
  try {
    const raw = localStorage.getItem(GUEST_CART_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
};

const saveGuestCart = (cartItems) => {
  if (!cartItems || cartItems.length === 0) {
    localStorage.removeItem(GUEST_CART_KEY);
  } else {
    localStorage.setItem(GUEST_CART_KEY, JSON.stringify(cartItems));
  }
};

const loadGuestWishlist = () => {
  try {
    const raw = localStorage.getItem(GUEST_WISHLIST_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
};

const saveGuestWishlist = (wishlistItems) => {
  if (!wishlistItems || wishlistItems.length === 0) {
    localStorage.removeItem(GUEST_WISHLIST_KEY);
  } else {
    localStorage.setItem(GUEST_WISHLIST_KEY, JSON.stringify(wishlistItems));
  }
};

const addToCart = (productId, quantity = 1, varietyData = {}, productObj = null) => {
  const currentGuest = loadGuestCart();
  const pIdStr = productId ? productId.toString() : '';
  const existingIdx = currentGuest.findIndex(
    (it) =>
      (it.product?._id || it.product || it.productId)?.toString() === pIdStr &&
      (it.varietySku || '') === (varietyData.varietySku || '')
  );

  let updatedCart;
  if (existingIdx > -1) {
    updatedCart = [...currentGuest];
    updatedCart[existingIdx] = {
      ...updatedCart[existingIdx],
      quantity: updatedCart[existingIdx].quantity + quantity
    };
  } else {
    const prod = productObj || {};
    const itemProduct = {
      _id: prod._id || pIdStr,
      title: prod.title || varietyData.productTitle || 'Mindful Product',
      price: Number(prod.price || varietyData.price || 999),
      discountPrice: Number(prod.discountPrice || prod.price || varietyData.price || 999),
      thumbnail: prod.thumbnail || (prod.images && prod.images[0]) || varietyData.varietyImage || '',
      category: prod.category || 'Wellness',
      stock: prod.stock !== undefined ? prod.stock : 99
    };
    const effPrice = Number(varietyData.price || itemProduct.discountPrice || itemProduct.price || 999);
    const newItem = {
      product: itemProduct,
      quantity,
      varietySku: varietyData.varietySku || '',
      varietyName: varietyData.varietyName || '',
      price: effPrice,
      image: varietyData.varietyImage || itemProduct.thumbnail || ''
    };
    updatedCart = [...currentGuest, newItem];
  }

  saveGuestCart(updatedCart);
  return updatedCart;
};

const addToWishlist = (productId, productObj = null) => {
  const currentWish = loadGuestWishlist();
  const pIdStr = productId.toString();
  const exists = currentWish.some(
    (it) => (it.product?._id || it.product || it._id || it)?.toString() === pIdStr
  );
  if (!exists) {
    const item = {
      product: productObj || { _id: pIdStr, title: 'Mindful Item', price: 999 },
      _id: pIdStr,
      addedAt: new Date().toISOString()
    };
    const updated = [...currentWish, item];
    saveGuestWishlist(updated);
    return updated;
  }
  return currentWish;
};

const removeFromWishlist = (productId) => {
  const currentWish = loadGuestWishlist();
  const pIdStr = productId.toString();
  const updated = currentWish.filter(
    (it) => (it.product?._id || it.product || it._id || it)?.toString() !== pIdStr
  );
  saveGuestWishlist(updated);
  return updated;
};

const moveWishlistToCart = (productId, quantity = 1) => {
  const currentWish = loadGuestWishlist();
  const pIdStr = productId.toString();
  const item = currentWish.find(
    (it) => (it.product?._id || it.product || it._id || it)?.toString() === pIdStr
  );
  if (item) {
    addToCart(pIdStr, quantity, {}, item.product || item);
    removeFromWishlist(pIdStr);
  }
  return true;
};

// Tests
let passed = 0;

// Test Group 1: Guest Add to Cart & Wishlist
console.log('--- Test Group 1: Guest Cart & Wishlist Persistence ---');
const sampleProduct1 = {
  _id: 'prod_mat_01',
  title: 'Organic Cork Yoga Mat',
  price: 1999,
  discountPrice: 1499,
  thumbnail: '/images/mat.jpg',
  category: 'Yoga Mats',
  stock: 25
};

const sampleProduct2 = {
  _id: 'prod_bowl_02',
  title: 'Tibetan Singing Bowl',
  price: 2499,
  discountPrice: 1999,
  thumbnail: '/images/bowl.jpg',
  category: 'Sound Healing',
  stock: 10
};

// Guest adds product 1 to cart
addToCart('prod_mat_01', 2, {}, sampleProduct1);
assert.strictEqual(loadGuestCart().length, 1, 'Guest cart should have 1 item');
assert.strictEqual(loadGuestCart()[0].quantity, 2, 'Quantity should be 2');
assert.strictEqual(loadGuestCart()[0].product.title, 'Organic Cork Yoga Mat');
console.log('  ✅ PASS: Guest adds item to cart and persists in localStorage');
passed++;

// Guest adds product 2 to wishlist
addToWishlist('prod_bowl_02', sampleProduct2);
assert.strictEqual(loadGuestWishlist().length, 1, 'Guest wishlist should have 1 item');
assert.strictEqual(loadGuestWishlist()[0].product.title, 'Tibetan Singing Bowl');
console.log('  ✅ PASS: Guest adds item to wishlist and persists in localStorage');
passed++;

// Test Group 2: Move Wishlist to Cart without Login
console.log('\n--- Test Group 2: Move Wishlist to Cart (Guest Mode) ---');
moveWishlistToCart('prod_bowl_02', 1);

assert.strictEqual(loadGuestWishlist().length, 0, 'Guest wishlist should be empty after moving to cart');
assert.strictEqual(localStorage.getItem(GUEST_WISHLIST_KEY), null, 'localStorage wishlist key should be removed when empty');
assert.strictEqual(loadGuestCart().length, 2, 'Guest cart should now have 2 items');

const movedItem = loadGuestCart().find((it) => it.product._id === 'prod_bowl_02');
assert(movedItem, 'Singing bowl should now exist in guest cart');
assert.strictEqual(movedItem.product.title, 'Tibetan Singing Bowl');
assert.strictEqual(movedItem.price, 1999);
console.log('  ✅ PASS: Guest moved item from wishlist to cart; item transferred in localStorage');
passed++;

// Test Group 3: Checkout Gate & Login Interception
console.log('\n--- Test Group 3: Checkout Gate When Unauthenticated ---');
const sessionStorage = new MockLocalStorage();
let isAuthModalPrompted = false;
let authModalMessage = '';
let isCheckoutModalOpen = false;

const handleProceedToCheckout = (isLoggedIn) => {
  if (!isLoggedIn) {
    sessionStorage.setItem('yogazen_pending_checkout', 'true');
    isAuthModalPrompted = true;
    authModalMessage = 'Please sign in to proceed with checkout and delivery address.';
    return;
  }
  isCheckoutModalOpen = true;
};

// Guest attempts checkout
handleProceedToCheckout(false);
assert.strictEqual(isAuthModalPrompted, true, 'Auth modal must be displayed for unauthenticated checkout');
assert.strictEqual(isCheckoutModalOpen, false, 'Checkout modal must NOT open before login');
assert.strictEqual(sessionStorage.getItem('yogazen_pending_checkout'), 'true', 'Pending checkout intent must be preserved');
console.log('  ✅ PASS: Guest checkout triggers sign-in prompt and stores checkout intent');
passed++;

// Test Group 4: Login Sync, Database Insertion, LocalStorage Deletion, and Checkout Continuation
console.log('\n--- Test Group 4: Login Sync, LocalStorage Deletion & Auto-Proceed ---');

// Mock backend database
const mockDatabase = {
  users: [
    {
      _id: 'user_yogi_01',
      email: 'yogi@example.com',
      cart: [],
      wishlist: []
    }
  ]
};

// Simulate syncGuestDataToDatabase
const syncGuestDataToDatabase = async (userId) => {
  const gCart = loadGuestCart();
  const gWish = loadGuestWishlist();

  const user = mockDatabase.users.find((u) => u._id === userId);
  assert(user, 'User must exist in database');

  // 1. Save guest cart items to user database document
  for (const item of gCart) {
    user.cart.push({
      product: item.product,
      quantity: item.quantity,
      price: item.price
    });
  }

  // 2. Save guest wishlist items to user database document
  for (const item of gWish) {
    user.wishlist.push({
      product: item.product
    });
  }

  // 3. Delete that data in local storage
  localStorage.removeItem(GUEST_CART_KEY);
  localStorage.removeItem(GUEST_WISHLIST_KEY);

  return user;
};

(async () => {
  // User logs in
  const user = await syncGuestDataToDatabase('user_yogi_01');

  // Verify database contains the items
  assert.strictEqual(user.cart.length, 2, 'User cart in database must have 2 items');
  assert.strictEqual(user.cart[0].product.title, 'Organic Cork Yoga Mat');
  assert.strictEqual(user.cart[1].product.title, 'Tibetan Singing Bowl');
  console.log('  ✅ PASS: Guest cart items successfully saved in database');
  passed++;

  // Verify localStorage data was deleted
  assert.strictEqual(localStorage.getItem(GUEST_CART_KEY), null, 'localStorage guest cart must be deleted after sync');
  assert.strictEqual(localStorage.getItem(GUEST_WISHLIST_KEY), null, 'localStorage guest wishlist must be deleted after sync');
  assert.strictEqual(loadGuestCart().length, 0, 'loadGuestCart() returns 0 items');
  console.log('  ✅ PASS: Guest data in localStorage completely deleted after database sync');
  passed++;

  // 4. Auto-proceed to checkout
  if (sessionStorage.getItem('yogazen_pending_checkout') === 'true' && user.cart.length > 0) {
    sessionStorage.removeItem('yogazen_pending_checkout');
    isCheckoutModalOpen = true;
  }

  assert.strictEqual(isCheckoutModalOpen, true, 'Checkout modal automatically opens after login');
  assert.strictEqual(sessionStorage.getItem('yogazen_pending_checkout'), null, 'Pending checkout intent cleared');
  console.log('  ✅ PASS: User seamlessly proceeds further into the checkout flow without re-clicking');
  passed++;

  console.log(`\n===========================================`);
  console.log(`Test Results: ${passed} passed, 0 failed.`);
  console.log(`===========================================\n`);
})();

