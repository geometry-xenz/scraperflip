const fs = require('fs');
const path = require('path');
const { success, warn } = require('./logger');

const HEADER = 'platform,query,category,title,price,originalPrice,rating,reviewCount,url,image,pageNo';

function escapeCell(value) {
  if (value === null || value === undefined) {
    return '';
  }
  const text = String(value);
  const hasSpecialChar = text.includes(',') || text.includes('"') || text.includes('\n') || text.includes('\r');
  if (!hasSpecialChar) {
    return text;
  }
  const escapedQuotes = text.replaceAll('"', '""');
  return `"${escapedQuotes}"`;
}

function rowFrom(product) {
  const cells = [
    product.platform || '',
    product.query || '',
    product.category || '',
    product.title || '',
    product.price || '',
    product.originalPrice || '',
    product.rating || '',
    product.reviewCount || '',
    product.url || product.productUrl || '',
    product.image || product.imageUrl || '',
    product.pageNo || '',
  ];
  return cells.map(escapeCell).join(',');
}

function formatTimestamp(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day}-${hours}${minutes}${seconds}`;
}

function buildFilePath(config) {
  const outputDir = path.resolve(config.outputFolder);
  fs.mkdirSync(outputDir, { recursive: true });
  const rawQuery = config.queries?.[0] || config.query || 'products';
  const querySlug = rawQuery.trim().replace(/\s+/g, '-');
  const timestamp = formatTimestamp(new Date());
  const fileName = `${querySlug}-${timestamp}.csv`;
  return path.join(outputDir, fileName);
}

function saveToCsv(products, config) {
  const filePath = buildFilePath(config);

  if (products.length === 0) {
    warn('No products scraped. Writing empty CSV with headers.');
  }

  const rows = products.map(rowFrom);
  const lines = [HEADER, ...rows];
  const csvContent = `${lines.join('\n')}\n`;

  fs.writeFileSync(filePath, csvContent, 'utf-8');
  success(`Saved ${products.length} products to ${filePath}`);

  return filePath;
}

module.exports = saveToCsv;
module.exports.saveToCsv = saveToCsv;
