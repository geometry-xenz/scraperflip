# Price Scraper

A modular Node.js price scraper for Amazon India (amazon.in) and Flipkart (flipkart.com). It extracts product listings across configured search queries, saves normalized records to a timestamped CSV, and reports the lowest price per search query across both platforms.

## Installation and Usage

```bash
npm install
npm start
```

## CLI Examples

```bash
# Run with defaults from config.js
node index.js

# Custom query and category
node index.js --query "samsung galaxy" --category mobiles

# Non-headless mode for debugging
node index.js --headless false

# List all supported category mappings
node index.js --list-categories
```

## Configuration

| Setting / Flag | Default | Effect |
| :--- | :--- | :--- |
| `queries` / `--query` | `['iphone']` | Search terms to scrape (repeatable via CLI) |
| `category` / `--category` | `'electronics'` | Category mapping from `categories.js` |
| `pages` / `--pages` | `2` | Number of pagination pages to scrape per site |
| `platform` / `--platform` | `'both'` | Platform selection (`amazon`, `flipkart`, `both`) |
| `headless` / `--headless` | `true` | Runs Chromium headless or visible |
| `outputFolder` | `'results'` | Target directory for generated CSV files |
| `minDelayMs` | `1500` | Minimum delay in milliseconds between requests |
| `maxDelayMs` | `4000` | Maximum delay in milliseconds between requests |

## Adding a Category

Add a single mapping line to `categories.js`:

```javascript
watches: { amazon: 'watches', flipkart: 'watches' },
```

Both scrapers consume this entry automatically without further code modifications.

## Known Limitations

- Flipkart class churn: Flipkart frequently alters auto-generated CSS classes, requiring selector updates in `scrapers/FlipkartScraper.js`.
- Blocking risk: High query frequency or large page depths can trigger Amazon CAPTCHA forms or Flipkart verification modals.
- Slow by design: Randomized delays between requests are intentionally preserved to mimic organic user traffic and prevent IP bans.
