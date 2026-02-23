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

## Updating data

Edit **`js/data.js`**: change `PARTNERS` (delegationAmount, aprPercent, commissionPercent, uptimePercent, explorer links). The dashboard recalculates Annual Reward, AUM, and the chart from prices and this data.

Price reference: [Finviz Crypto](https://finviz.com/crypto.ashx).
