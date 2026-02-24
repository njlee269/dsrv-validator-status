# DSRV Validator Status Dashboard

Monospace-styled dashboard tracking DSRV's active validator delegations, rewards, AUM, and uptime across 25+ chains.

## How to open

**Option 1 — Local server (recommended)**
```bash
cd "/Users/dsrv/Desktop/dsrv validator status"
python3 -m http.server 8787
```
Then open **http://localhost:8787**

**Option 2 — Node**
```bash
npx serve -p 8080
```
Then open http://localhost:8080

## Dashboard features

- **Total AUM chart** — Monthly AUM trend (USD) using historical snapshots
- **Delegation Change tiles** — 5×5 grid with mini sparkline charts, % change, glow hover effect. Click any tile to open partner detail page. Collapsible via Hide/Show toggle.
- **Search bar** — Filter partners table by name
- **Partner table** — Sorted by annual reward (highest first), with $50K annual reward threshold line

| Column | Description |
|--------|-------------|
| **Partner** | Protocol name (click for detail page) |
| **Delegation** | Delegation amount (native tokens) |
| **Token** | Token symbol |
| **Price (USD)** | Live from CoinGecko (refreshed every 5 min) |
| **24h %** | 24h price change — green/red |
| **APR %** | Staking APR — edit in `js/data.js` |
| **Commission %** | DSRV's commission rate — edit in `js/data.js` |
| **Monthly Reward (USD)** | `delegation × price × APR% × commission% / 12` |
| **Annual Reward (USD)** | `delegation × price × APR% × commission%` |
| **AUM** | `delegation × price` |
| **Uptime %** | From explorer (RAVER score / slashable %) |
| **Links** | Delegation and Uptime explorer pages |

## What's live vs static

| Data | Live? | Source |
|------|-------|--------|
| Prices, 24h % | **Yes** — fetched every 5 min | CoinGecko API |
| Delegation, APR, Commission, Uptime | **No** — static | `js/data.js` (update manually or via sync script) |
| AUM chart history | **No** — static | `data/history.json` (updated by sync script) |

## How to sync every 2 weeks

Run the sync script to refresh prices, snapshot delegation data, and see a rewards summary:

```bash
cd "/Users/dsrv/Desktop/dsrv validator status"
node scripts/sync.js
```

**What the script does:**

1. Fetches live token prices from CoinGecko for all active partners
2. Auto-fetches delegation amounts for Cosmos chains via LCD endpoints (Celestia, Cosmos HUB, Osmosis, Axelar, Shentu, Provenance, Babylon)
3. Saves a new timestamped snapshot to `data/history.json`
4. Prints a rewards summary table with monthly reward and AUM per partner
5. Lists all non-Cosmos chains that need manual delegation lookup, with direct explorer links

**After running the script:**

- For chains marked "manual lookup needed", open the explorer link shown in the output, find DSRV's validator, and update `delegationAmount` in `js/data.js`
- The AUM chart and delegation tiles will automatically reflect the new snapshot

**Prerequisite:** Node.js (`node --version`). Install with `brew install node` if needed.

## Active partners (26)

### Ethereum ecosystem
- Etherfi (total), Lido (total), Swell

### L1 chains
- Solana, Sui, Aptos, Near, Monad, Supra

### Cosmos ecosystem
- Babylon, Celestia, Cosmos HUB, Osmosis, Axelar, Shentu, Provenance (Figure)

### Other L1/L2
- 0G, IOTA, Story, Plume, Polygon, Wemix, IKA, Mitosis, Namada

### NaaS
- Canton

## Explorer links for manual updates

| Partner | Explorer |
|---------|----------|
| Etherfi | [Rated Network](https://explorer.rated.network/o/DSRV%20-%20Ether.Fi?network=mainnet&timeWindow=1d&idType=poolShare) |
| Lido | [Rated Network](https://explorer.rated.network/o/DSRV%20-%20Lido?network=mainnet&timeWindow=1d&idType=poolShare) |
| Solana | [StakeWiz](https://stakewiz.com/validator/2mxWiqtwdpE8zgkWxwFaJLn127dbuuHY4D32d8A6UnPL) |
| Sui | [SuiVision](https://suivision.xyz/validator/0x6f4e73ee97bfae95e054d31dff1361a839aaadf2cfdb873ad2b07d479507905a) |
| Monad | [MonadVision](https://monadvision.com/validators) (search DSRV) |
| 0G | [0G Explorer](https://explorer.0g.ai/mainnet/validators/0x7840481938247e47db1488c033e8d18a21c85cfd/delegators) |
| IKA | [IkaScan](https://ikascan.io/mainnet/operator/0x1070423a19ad7097768e8da8d1f2e36663f898bfaeb8325dbb643366bdbf8717) |
| Mitosis | [Mitosis App](https://app.mitosis.org/staking/validator/0xc0cccda718572b80d804214596a7bff1b96064b4) |
| Story | [Story Explorer](https://story.explorers.guru/validator/storyvaloper1pjhn2l646wdphwjw4jkumsa4w4jsezu7nth4dm) |
| Canton | [CantonScan](https://www.cantonscan.com/party/dsrv-mainnetValidator-01%3A%3A1220e2f4abe1c5ca7e07464037fe7fefc839b7b8fea24985d0d2a2790fa72e3c13ac) |

## CoinGecko token IDs

Key IDs that differ from the token name (easy to get wrong):

| Token | CoinGecko ID |
|-------|-------------|
| 0G | `zero-gravity` |
| Swell (SWELL) | `swell-network` |
| Shentu (CTK) | `certik` |
| Story (IP) | `story-2` |
| Lido (stETH) | `staked-ether` |
| Provenance (HASH) | `hash-2` |

## Updating data manually

Edit `js/data.js` — change `PARTNERS` array fields: `delegationAmount`, `aprPercent`, `commissionPercent`, `uptimePercent`, explorer links.

After editing, bump the `?v=` version in `index.html` and `partner.html` script tags to bust browser cache.

Price references: [CoinGecko](https://www.coingecko.com/), [CoinMarketCap](https://coinmarketcap.com/)
