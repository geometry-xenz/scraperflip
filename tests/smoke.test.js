const test = require('node:test');
const assert = require('node:assert/strict');
const { parsePrice, comparePrices, matchSku, versionsConflict } = require('../utils/compare');

test('parsePrice handles currency symbol and commas', () => {
  assert.equal(parsePrice('₹64,999'), 64999);
  assert.equal(parsePrice('₹1,234.50'), 1234.5);
});

test('parsePrice rejects malformed multi-decimal input', () => {
  assert.equal(parsePrice('1.2.3'), 1.2);
});

test('parsePrice returns null for garbage', () => {
  assert.equal(parsePrice('not a price'), null);
  assert.equal(parsePrice(''), null);
  assert.equal(parsePrice('0'), null);
  assert.equal(parsePrice('-5'), null);
  assert.equal(parsePrice(null), null);
  assert.equal(parsePrice(undefined), null);
});

test('parsePrice extracts embedded numbers', () => {
  assert.equal(parsePrice('Price: 1234 rupees'), 1234);
});

test('comparePrices returns empty result for non-array input', () => {
  const result = comparePrices(null, 'apple');
  assert.deepEqual(result, { pairs: [], matched: [], cheapest: null });
});

test('comparePrices matches SKUs across platforms', () => {
  const products = [
    { platform: 'Amazon', title: 'Apple iPhone 16 128 GB White', price: '₹89,900', productUrl: 'https://amazon.in/x' },
    { platform: 'Flipkart', title: 'Apple iPhone 16 (White, 128 GB)', price: '₹69,900', productUrl: 'https://flipkart.com/x' },
    { platform: 'Flipkart', title: 'Apple iPhone 15 (Black, 128 GB)', price: '₹59,900', productUrl: 'https://flipkart.com/y' },
  ];
  const result = comparePrices(products, 'apple');
  assert.equal(result.matched.length, 1);
  assert.equal(result.matched[0].amazon.platform, 'Amazon');
  assert.equal(result.matched[0].flipkart.platform, 'Flipkart');
  assert.equal(result.cheapest.flipkart.platform, 'Flipkart');
  assert.equal(result.cheapest.sku.includes('iPhone 16'), true);
});

test('matchSku returns 0 when one title has no model tokens', () => {
  assert.equal(matchSku('apple', 'Random Widget', 'Apple iPhone 16 128 GB'), 0);
});

test('versionsConflict vetoes different model series', () => {
  assert.equal(versionsConflict('iPhone 18 Pro (256 GB)', 'Apple iPhone 15 (Black, 256 GB)'), true);
  assert.equal(versionsConflict('iPhone 16 128 GB White', 'Apple iPhone 16 (White, 256 GB)'), false);
  assert.equal(versionsConflict('iPhone Air 256 GB', 'Apple iPhone Air (256 GB)'), false);
  assert.equal(versionsConflict('iPhone Air 256 GB Promotion', 'Apple iPhone 16 (Ultramarine, 256 GB)'), true);
  assert.equal(versionsConflict('iPhone 16 Pro Max', 'Apple iPhone 15 (Pro, 256 GB)'), true);
  assert.equal(versionsConflict('iPhone 16 Plus (Pink, 128 GB)', 'Apple iPhone 16 (White, 128 GB)'), false);
});

test('comparePrices never pairs different series', () => {
  const products = [
    { platform: 'Amazon', title: 'iPhone 18 Pro Max (256 GB) - Silver', price: '₹1,79,900', productUrl: 'https://amazon.in/a1' },
    { platform: 'Flipkart', title: 'Apple iPhone 15 (Black, 256 GB)', price: '₹68,900', productUrl: 'https://flipkart.com/f1' },
  ];
  const result = comparePrices(products, 'iphone');
  assert.equal(result.matched.length, 0);
});
