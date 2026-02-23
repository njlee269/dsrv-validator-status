# DSRV Validator Status Dashboard

Bloomberg-terminal-style dashboard for DSRV validator partners: delegation, token, price, APR, commission, annual reward (USD), AUM, 24h % (green/red), uptime, and explorer links.

## How to open

**Option 1 — Double-click**  
Open `index.html` in your browser. Use a **local server** if scripts don’t load from `file://`:

```bash
cd "/Users/dsrv/Desktop/dsrv validator status"
python3 -m http.server 8787
```

Then open **http://localhost:8787**

**Option 2 — Node**  
`npx serve -p 8080` then open http://localhost:8080

## What’s in the dashboard

| Column | Description |
|--------|-------------|
| **Partner** | Protocol name |
| **Delegation** | Delegation amount (tokens) |
| **Token** | Token symbol |
| **Price (USD)** | From CoinGecko (refreshed every 5 min) |
| **APR %** | Staking APR — edit in `js/data.js` |
| **Commission %** | DSRV’s commission rate — edit in `js/data.js` |
| **Annual Reward (USD)** | `delegation × price × APR% × commission%` |
| **AUM** | `delegation × price` (USD) |
| **24h %** | 24h price change — **green** if up, **red** if down |
| **Uptime %** | Fill from each chain’s explorer (see Uptime link; search DSRV) |
| **Links** | Delegation and Uptime explorer pages |

- **Chart:** Total AUM by month (USD). Uses current AUM with placeholder monthly trend until you add real history.
- **Uptime:** Not auto-fetched. Use the **Uptime** link for each chain, find DSRV’s validator, and set `uptimePercent` in `js/data.js`.

## Is the table live?

- **Prices and 24h %:** Yes. Fetched from CoinGecko on load and **every 5 minutes** (live refresh). The header shows “Updated HH:MM” when prices are fetched.
- **Delegation, APR, Commission, Uptime:** No. These are static from `js/data.js`. Update that file (or a future backend) when you have new numbers from explorers.

## How to sync every 2 weeks

Run the sync script from your Terminal to refresh prices, snapshot delegation data, and see a rewards summary:

```bash
cd "/Users/dsrv/Desktop/dsrv validator status"
node scripts/sync.js
```

**What the script does:**

1. Fetches live token prices from CoinGecko for all partners
2. Tries to auto-fetch delegation amounts for Cosmos-ecosystem chains (Celestia, Cosmos HUB, Osmosis, Axelar, etc.)
3. Saves a new timestamped snapshot to `data/history.json`
4. Prints a rewards summary table showing monthly reward and AUM per partner

**After running the script:**

- For partners marked "manual lookup needed", open their explorer link (shown in the output), find DSRV's validator, and update the `delegationAmount` in `js/data.js`
- The AUM chart and delegation tiles on the dashboard will automatically reflect the new snapshot

**Prerequisite:** Node.js must be installed. Check with `node --version`. If not installed:

```bash
brew install node
```

## Updating data manually

Edit **`js/data.js`**: change `PARTNERS` (delegationAmount, aprPercent, commissionPercent, uptimePercent, explorer links). The dashboard recalculates Annual Reward, Monthly Reward, AUM, and the chart from prices and this data.

Price reference: [CoinGecko](https://www.coingecko.com/), [CoinMarketCap](https://coinmarketcap.com/).
