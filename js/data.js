/**
 * DSRV validator partners data.
 * Update delegation amounts, explorer links, and uptime here.
 */
const PARTNERS = [
  { name: "Canton", delegationAmount: null, delegationNote: "NaaS Provider & Mainnet Validator", tokenSymbol: "CANTON", coingeckoId: null, explorerDelegation: null, explorerUptime: null, uptimePercent: null },
  { name: "Etherfi (total)", delegationAmount: 288288, tokenSymbol: "ETH", coingeckoId: "ethereum", explorerDelegation: "https://ether.fi/dashboard", explorerUptime: "https://beaconcha.in/", uptimePercent: null },
  { name: "Lido (total)", delegationAmount: 249440, tokenSymbol: "stETH", coingeckoId: "staked-ether", explorerDelegation: "https://lido.fi/", explorerUptime: "https://beaconcha.in/", uptimePercent: null },
  { name: "Solana", delegationAmount: 24983, tokenSymbol: "SOL", coingeckoId: "solana", explorerDelegation: "https://www.validators.app/validators?locale=en&network=mainnet", explorerUptime: "https://www.validators.app/validators?locale=en&network=mainnet", uptimePercent: null },
  { name: "0G", delegationAmount: 3000548, tokenSymbol: "ZRO", coingeckoId: null, explorerDelegation: "https://explorer.0g.ai/mainnet/validators", explorerUptime: "https://explorer.0g.ai/mainnet/validators", uptimePercent: null },
  { name: "Sui", delegationAmount: 135558249, tokenSymbol: "SUI", coingeckoId: "sui", explorerDelegation: "https://suiexplorer.com/validators", explorerUptime: "https://suiexplorer.com/validators", uptimePercent: null },
  { name: "Aptos (total)", delegationAmount: 4291607, tokenSymbol: "APT", coingeckoId: "aptos", explorerDelegation: "https://explorer.aptoslabs.com/validators", explorerUptime: "https://explorer.aptoslabs.com/validators", uptimePercent: null },
  { name: "Babylon", delegationAmount: 56175134, tokenSymbol: "BABY", coingeckoId: null, explorerDelegation: "https://babylon.explorers.guru/validators", explorerUptime: "https://babylon.explorers.guru/validators", uptimePercent: null },
  { name: "Satlayer (Babylon)", delegationAmount: null, tokenSymbol: "BABY", coingeckoId: null, explorerDelegation: "https://babylon.explorers.guru/validators", explorerUptime: "https://babylon.explorers.guru/validators", uptimePercent: null },
  { name: "Celestia", delegationAmount: 5864641, tokenSymbol: "TIA", coingeckoId: "celestia", explorerDelegation: "https://www.mintscan.io/celestia/validators", explorerUptime: "https://celestia.explorers.guru/validators", uptimePercent: null },
  { name: "IOTA", delegationAmount: 47958203, tokenSymbol: "IOTA", coingeckoId: "iota", explorerDelegation: "https://iotascan.com/validators", explorerUptime: "https://iotascan.com/validators", uptimePercent: null },
  { name: "Near", delegationAmount: 2073326, tokenSymbol: "NEAR", coingeckoId: "near", explorerDelegation: "https://nearblocks.io/validators", explorerUptime: "https://nearblocks.io/validators", uptimePercent: null },
  { name: "Story", delegationAmount: 7256548, tokenSymbol: "STRY", coingeckoId: null, explorerDelegation: null, explorerUptime: null, uptimePercent: null },
  { name: "Plume", delegationAmount: 2556993, tokenSymbol: "PLUME", coingeckoId: null, explorerDelegation: null, explorerUptime: null, uptimePercent: null },
  { name: "Polygon", delegationAmount: 118087, tokenSymbol: "POL", coingeckoId: "polygon-ecosystem-token", explorerDelegation: "https://staking.polygon.technology/validators", explorerUptime: "https://staking.polygon.technology/validators", uptimePercent: null },
  { name: "Wemix", delegationAmount: 1505357, tokenSymbol: "WEMIX", coingeckoId: "wemix-token", explorerDelegation: null, explorerUptime: null, uptimePercent: null },
  { name: "Swell", delegationAmount: 2688, tokenSymbol: "SWELL", coingeckoId: "swell-ethereum", explorerDelegation: "https://swellnetwork.io/", explorerUptime: "https://beaconcha.in/", uptimePercent: null },
  { name: "IKA", delegationAmount: 62091780, tokenSymbol: "IKA", coingeckoId: null, explorerDelegation: null, explorerUptime: null, uptimePercent: null },
  { name: "Shentu", delegationAmount: 1080425, tokenSymbol: "CTK", coingeckoId: "shentu", explorerDelegation: "https://www.mintscan.io/shentu/validators", explorerUptime: "https://www.mintscan.io/shentu/validators", uptimePercent: null },
  { name: "Axelar", delegationAmount: 5504221, tokenSymbol: "AXL", coingeckoId: "axelar", explorerDelegation: "https://www.mintscan.io/axelar/validators", explorerUptime: "https://www.mintscan.io/axelar/validators", uptimePercent: null },
  { name: "Cosmos HUB", delegationAmount: 190927, tokenSymbol: "ATOM", coingeckoId: "cosmos", explorerDelegation: "https://www.mintscan.io/cosmos/validators", explorerUptime: "https://www.mintscan.io/cosmos/validators", uptimePercent: null },
  { name: "Mitosis", delegationAmount: 900001, tokenSymbol: "MTS", coingeckoId: null, explorerDelegation: null, explorerUptime: null, uptimePercent: null },
  { name: "Namada", delegationAmount: 2257929, tokenSymbol: "NAM", coingeckoId: "namada", explorerDelegation: "https://namada.explorers.guru/validators", explorerUptime: "https://namada.explorers.guru/validators", uptimePercent: null },
  { name: "Monad", delegationAmount: 59240000, tokenSymbol: "MON", coingeckoId: null, explorerDelegation: null, explorerUptime: null, uptimePercent: null },
  { name: "Supra", delegationAmount: 63561586, tokenSymbol: "SUPRA", coingeckoId: null, explorerDelegation: null, explorerUptime: null, uptimePercent: null },
  { name: "Osmosis", delegationAmount: 3776503, tokenSymbol: "OSMO", coingeckoId: "osmosis", explorerDelegation: "https://www.mintscan.io/osmosis/validators", explorerUptime: "https://osmosis.explorers.guru/validators", uptimePercent: null },
  { name: "Provenance (Figure)", delegationAmount: 200012050, tokenSymbol: "HASH", coingeckoId: "hash-2", explorerDelegation: "https://explorer.provenance.io/validators", explorerUptime: "https://explorer.provenance.io/validators", uptimePercent: null }
];

const DATA_DATE = "2026-02-23";
