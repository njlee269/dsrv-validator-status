/**
 * Tokenomics Intelligence — Calculation Engine
 * 14 metric formulas + cross-source checks + utility sub-scorer
 */
var TokenomicsCalc = (function () {
  function v(srcRef) {
    if (!srcRef) return null;
    const val = srcRef.value != null ? srcRef.value : srcRef;
    return typeof val === "number" && isFinite(val) ? val : null;
  }

  function metric(id, name, formula, value, inputs) {
    const missing = inputs.filter((i) => i === null);
    return {
      id: id,
      name: name,
      formula: formula,
      value: value,
      computable: value !== null,
      confidence: missing.length === 0 ? "high" : "none",
      missingInputs: missing.length,
    };
  }

  function computeAll(data) {
    var price = v(data.market.price);
    var mcap = v(data.market.marketCap);
    var fdv = v(data.market.fdv);
    var circSupply = v(data.market.circulatingSupply);
    var totalSupply = v(data.market.totalSupply);
    var maxSupply = v(data.market.maxSupply);
    var vol24h = v(data.market.volume24h);
    var ath = v(data.market.ath);
    var athMcap = v(data.market.athMarketCap);
    var tvl = v(data.fundamentals.tvl);

    var teamPct = v(data.allocations.teamPct);
    var investorPct = v(data.allocations.investorPct);
    var foundationPct = v(data.allocations.foundationPct);
    var unlock12m = v(data.unlocks.tokens12mEstimate);

    var supplyRef = maxSupply != null ? maxSupply : totalSupply;

    // 1. Market Cap cross-check
    var mcapCalc = price != null && circSupply != null ? price * circSupply : null;

    // 2. FDV cross-check
    var fdvCalc = null;
    if (price != null && maxSupply != null) fdvCalc = price * maxSupply;
    else if (price != null && totalSupply != null) fdvCalc = price * totalSupply;

    // 3. Float Ratio
    var floatRatio = circSupply != null && supplyRef != null && supplyRef > 0
      ? circSupply / supplyRef : null;

    // 4. FDV Overhang
    var fdvVal = fdv != null ? fdv : fdvCalc;
    var mcapVal = mcap != null ? mcap : mcapCalc;
    var fdvOverhang = fdvVal != null && mcapVal != null && mcapVal > 0
      ? fdvVal / mcapVal : null;

    // 5. Liquidity Ratio
    var liquidityRatio = vol24h != null && mcapVal != null && mcapVal > 0
      ? vol24h / mcapVal : null;

    // 6. Circulating % of Max
    var circPct = floatRatio;

    // 7. Remaining Dilution %
    var remainingDilution = circSupply != null && supplyRef != null && supplyRef > 0
      ? (supplyRef - circSupply) / supplyRef : null;

    // 8. 12M Dilution Pressure
    var dilution12m = unlock12m != null && circSupply != null && circSupply > 0
      ? unlock12m / circSupply : null;

    // 9. Insider Concentration
    var insiderParts = [teamPct, investorPct, foundationPct];
    var insiderAvailable = insiderParts.filter((x) => x != null);
    var insiderConcentration = insiderAvailable.length > 0
      ? insiderAvailable.reduce((a, b) => a + b, 0) / 100 : null;
    var insiderPartial = insiderAvailable.length < 3 && insiderAvailable.length > 0;

    // 10. FDV / TVL
    var fdvToTvl = fdvVal != null && tvl != null && tvl > 0
      ? fdvVal / tvl : null;

    // 11. MC / TVL
    var mcToTvl = mcapVal != null && tvl != null && tvl > 0
      ? mcapVal / tvl : null;

    // 12. Drawdown from ATH Market Cap
    var drawdownAthMc = null;
    if (athMcap != null && mcapVal != null && athMcap > 0) {
      drawdownAthMc = (athMcap - mcapVal) / athMcap;
    } else if (ath != null && price != null && circSupply != null && ath > 0) {
      var athMcEst = ath * circSupply;
      var curMcEst = price * circSupply;
      drawdownAthMc = (athMcEst - curMcEst) / athMcEst;
    }

    // 13. Fully Diluted Price Check
    var fdPriceCheck = fdvVal != null && supplyRef != null && supplyRef > 0
      ? fdvVal / supplyRef : null;

    // 14. Cross-Source Consistency
    var crossSourceScore = computeCrossSource(mcap, mcapCalc, fdv, fdvCalc);

    return [
      metric("marketCapCheck", "Market Cap (calculated)", "price × circulatingSupply", mcapCalc, [price, circSupply]),
      metric("fdvCheck", "FDV (calculated)", "price × maxSupply", fdvCalc, [price, supplyRef]),
      metric("floatRatio", "Float Ratio", "circulatingSupply / maxSupply", floatRatio, [circSupply, supplyRef]),
      metric("fdvOverhang", "FDV Overhang", "FDV / marketCap", fdvOverhang, [fdvVal, mcapVal]),
      metric("liquidityRatio", "Liquidity Ratio", "volume24h / marketCap", liquidityRatio, [vol24h, mcapVal]),
      metric("circulatingPct", "Circulating % of Max", "circulatingSupply / maxSupply", circPct, [circSupply, supplyRef]),
      metric("remainingDilution", "Remaining Dilution %", "(maxSupply − circulatingSupply) / maxSupply", remainingDilution, [circSupply, supplyRef]),
      metric("dilution12m", "12M Dilution Pressure", "tokensUnlocking12m / circulatingSupply", dilution12m, [unlock12m, circSupply]),
      metric("insiderConcentration", "Insider Concentration", "(team + investor + foundation) / 100", insiderConcentration, insiderAvailable.length > 0 ? [] : [null]),
      metric("fdvToTvl", "FDV / TVL", "FDV / TVL", fdvToTvl, [fdvVal, tvl]),
      metric("mcToTvl", "MC / TVL", "marketCap / TVL", mcToTvl, [mcapVal, tvl]),
      metric("drawdownAthMc", "Drawdown from ATH MC", "(athMC − currentMC) / athMC", drawdownAthMc, [athMcap || ath, mcapVal || price]),
      metric("fdPriceCheck", "Fully Diluted Price", "FDV / maxSupply", fdPriceCheck, [fdvVal, supplyRef]),
      metric("crossSource", "Cross-Source Consistency", "compare reported vs calculated", crossSourceScore, []),
    ];
  }

  function computeCrossSource(mcapReported, mcapCalc, fdvReported, fdvCalc) {
    var checks = [];

    if (mcapReported != null && mcapCalc != null && mcapReported > 0) {
      var diff = Math.abs(mcapReported - mcapCalc) / mcapReported;
      checks.push(diff);
    }
    if (fdvReported != null && fdvCalc != null && fdvReported > 0) {
      var diff2 = Math.abs(fdvReported - fdvCalc) / fdvReported;
      checks.push(diff2);
    }

    if (checks.length === 0) return null;
    var avg = checks.reduce((a, b) => a + b, 0) / checks.length;
    return 1 - avg;
  }

  function computeUtilityScore(flags) {
    var weights = {
      gas: 15,
      staking: 15,
      governance: 10,
      feeShare: 15,
      burn: 10,
      buyback: 10,
      collateral: 8,
      mandatoryUse: 10,
      validatorSecurity: 7,
    };
    var total = 0;
    var possible = 0;
    for (var key in weights) {
      possible += weights[key];
      if (flags[key]) total += weights[key];
    }
    return { score: possible > 0 ? Math.round((total / possible) * 100) : 0, total: total, possible: possible };
  }

  return {
    computeAll: computeAll,
    computeUtilityScore: computeUtilityScore,
    v: v,
  };
})();
