# DSRV Validator Status Dashboard

Bloomberg-terminal-style dashboard for DSRV validator partners: delegation amounts, token info, prices, 24h change (green/red), uptime, and explorer links.

## How to open (offline app)

**Option 1 — Double-click (easiest)**  
Open `index.html` in your browser (Chrome, Firefox, Safari, Edge).  
- Table and chart work immediately.  
- **Prices**: Load when you’re online (CoinGecko). When offline, price columns show "—".

**Option 2 — Local server (optional)**  
If you want to load external data from `data/validators.json` later, run a simple server from this folder:

```bash
# Python 3
python3 -m http.server 8080

# or Node (npx)
npx serve -p 8080
```

Then open: **http://localhost:8080**

## What’s in the dashboard

| Column | Description |
|--------|-------------|
| **Partner** | Protocol name |
| **Delegation** | Delegation amount (from your source table; search explorers for latest) |
| **Token** | Token symbol per project |
| **Price (USD)** | From CoinGecko when online |
| **24h %** | 24h price change — **green** if up, **red** if down |
| **Uptime %** | From explorers (fill in from each chain’s explorer) |
| **Links** | **Delegation** = explorer page for delegation; **Uptime** = page that shows uptime clearly |

## Data and links

- **Table data** is embedded in `index.html` so it works from `file://`.  
- **Explorer links** point to each chain’s validator list; search for **DSRV** on that page for the exact validator.  
- **Monthly chart** uses placeholder totals; replace with your own monthly delegation history in the script if you have it.

## Updating delegation / uptime / links

1. Edit `data/validators.json` with new delegation amounts, uptime %, and URLs.  
2. Sync the same changes into the `PARTNERS` array inside `index.html` (so the file-only open still works).

Price reference: [Finviz Crypto](https://finviz.com/crypto.ashx).
