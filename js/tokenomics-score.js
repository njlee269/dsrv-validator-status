/**
 * Tokenomics Intelligence — Scoring Engine
 * Weighted scoring, traffic-light thresholds, verdict, executive summary,
 * confidence score, and partnership suitability.
 */
var TokenomicsScore = (function () {

  /* ── Traffic-light thresholds ── */

  var THRESHOLDS = {
    floatRatio: {
      green: function (v) { return v > 0.5; },
      yellow: function (v) { return v >= 0.2 && v <= 0.5; },
      label: "Float Ratio",
      greenText: "Majority of supply in circulation — lower dilution risk",
      yellowText: "Moderate float — some dilution risk remains",
      redText: "Low float — significant future dilution likely",
    },
    fdvOverhang: {
      green: function (v) { return v < 1.8; },
      yellow: function (v) { return v >= 1.8 && v <= 3.0; },
      label: "FDV Overhang",
      greenText: "Manageable FDV overhang relative to market cap",
      yellowText: "Notable gap between FDV and market cap",
      redText: "Large dilution overhang — FDV significantly exceeds circulating value",
    },
    liquidityRatio: {
      green: function (v) { return v > 0.1; },
      yellow: function (v) { return v >= 0.04 && v <= 0.1; },
      label: "Liquidity Ratio",
      greenText: "Strong trading liquidity relative to market cap",
      yellowText: "Moderate liquidity — acceptable for mid-cap",
      redText: "Low liquidity — potential absorption issues",
    },
    dilution12m: {
      green: function (v) { return v < 0.1; },
      yellow: function (v) { return v >= 0.1 && v <= 0.3; },
      label: "12M Dilution Pressure",
      greenText: "Minimal upcoming unlock pressure",
      yellowText: "Moderate unlock pressure over next 12 months",
      redText: "Significant unlock pressure — potential sell-side risk",
    },
    insiderConcentration: {
      green: function (v) { return v < 0.3; },
      yellow: function (v) { return v >= 0.3 && v <= 0.5; },
      label: "Insider Concentration",
      greenText: "Token supply appears well-distributed",
      yellowText: "Moderate insider allocation — monitor vesting",
      redText: "High insider concentration — governance and sell-pressure risk",
    },
    mcToTvl: {
      green: function (v) { return v < 1.0; },
      yellow: function (v) { return v >= 1.0 && v <= 3.0; },
      label: "MC / TVL",
      greenText: "Market cap appears backed by protocol value locked",
      yellowText: "Valuation somewhat elevated relative to TVL",
      redText: "Valuation appears stretched relative to TVL",
    },
    fdvToTvl: {
      green: function (v) { return v < 2.0; },
      yellow: function (v) { return v >= 2.0 && v <= 6.0; },
      label: "FDV / TVL",
      greenText: "Fully diluted valuation reasonable vs TVL",
      yellowText: "FDV moderately high relative to TVL",
      redText: "FDV significantly exceeds TVL — valuation risk",
    },
    crossSource: {
      green: function (v) { return v > 0.95; },
      yellow: function (v) { return v >= 0.85 && v <= 0.95; },
      label: "Cross-Source Consistency",
      greenText: "Reported and calculated figures align closely",
      yellowText: "Minor discrepancies between sources",
      redText: "Significant inconsistencies detected — verify data",
    },
  };

  function getSignal(metricId, value) {
    var t = THRESHOLDS[metricId];
    if (!t || value == null) return { color: "gray", text: "Insufficient data", label: t ? t.label : metricId };
    if (t.green(value)) return { color: "green", text: t.greenText, label: t.label };
    if (t.yellow(value)) return { color: "yellow", text: t.yellowText, label: t.label };
    return { color: "red", text: t.redText, label: t.label };
  }

  /* ── Dimension scorers (each returns 0–100 or null) ── */

  function scoreFloat(metrics) {
    var fr = findMetric(metrics, "floatRatio");
    if (fr == null) return null;
    if (fr > 0.7) return 100;
    if (fr > 0.5) return 80;
    if (fr > 0.35) return 60;
    if (fr > 0.2) return 40;
    if (fr > 0.1) return 20;
    return 5;
  }

  function scoreDilution(metrics) {
    var scores = [];
    var fdvOh = findMetric(metrics, "fdvOverhang");
    if (fdvOh != null) {
      if (fdvOh < 1.5) scores.push(100);
      else if (fdvOh < 2.0) scores.push(75);
      else if (fdvOh < 3.0) scores.push(50);
      else if (fdvOh < 5.0) scores.push(25);
      else scores.push(5);
    }
    var rd = findMetric(metrics, "remainingDilution");
    if (rd != null) scores.push(Math.max(0, Math.round((1 - rd) * 100)));
    var d12 = findMetric(metrics, "dilution12m");
    if (d12 != null) {
      if (d12 < 0.05) scores.push(100);
      else if (d12 < 0.1) scores.push(80);
      else if (d12 < 0.2) scores.push(55);
      else if (d12 < 0.3) scores.push(35);
      else scores.push(10);
    }
    return scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  }

  function scoreLiquidity(metrics) {
    var lr = findMetric(metrics, "liquidityRatio");
    if (lr == null) return null;
    if (lr > 0.15) return 100;
    if (lr > 0.1) return 85;
    if (lr > 0.06) return 65;
    if (lr > 0.04) return 50;
    if (lr > 0.02) return 30;
    return 10;
  }

  function scoreInsider(metrics) {
    var ic = findMetric(metrics, "insiderConcentration");
    if (ic == null) return null;
    if (ic < 0.2) return 100;
    if (ic < 0.3) return 80;
    if (ic < 0.4) return 55;
    if (ic < 0.5) return 35;
    return 10;
  }

  function scoreUtility(utilScore) {
    return utilScore != null ? utilScore : null;
  }

  function scoreTransparency(data, metrics) {
    var total = 0;
    var possible = 0;
    var fields = [
      data.market.price, data.market.marketCap, data.market.fdv,
      data.market.circulatingSupply, data.market.totalSupply, data.market.maxSupply,
      data.market.volume24h,
      data.allocations.teamPct, data.allocations.investorPct,
      data.allocations.foundationPct, data.allocations.communityPct,
    ];
    for (var i = 0; i < fields.length; i++) {
      possible++;
      if (fields[i] && fields[i].value != null) total++;
    }
    if (data.identity.tokenomicsUrl) total += 2;
    possible += 2;
    if (data.identity.docsUrl) total += 1;
    possible += 1;
    return possible > 0 ? Math.round((total / possible) * 100) : null;
  }

  function scoreFundamentals(metrics, categories) {
    var isTvlRelevant = false;
    var cats = (categories || []).map(function (c) { return c.toLowerCase(); });
    var relevantTerms = ["defi", "liquid staking", "restaking", "lrt", "lst", "lending", "dex"];
    for (var i = 0; i < cats.length; i++) {
      for (var j = 0; j < relevantTerms.length; j++) {
        if (cats[i].indexOf(relevantTerms[j]) >= 0) { isTvlRelevant = true; break; }
      }
    }

    if (!isTvlRelevant) return 50;

    var scores = [];
    var mt = findMetric(metrics, "mcToTvl");
    if (mt != null) {
      if (mt < 0.5) scores.push(100);
      else if (mt < 1.0) scores.push(80);
      else if (mt < 2.0) scores.push(55);
      else if (mt < 3.0) scores.push(35);
      else scores.push(10);
    }
    return scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  }

  function scoreCrossSource(metrics) {
    var cs = findMetric(metrics, "crossSource");
    if (cs == null) return 70;
    return Math.round(cs * 100);
  }

  function scoreValuation(metrics) {
    var dd = findMetric(metrics, "drawdownAthMc");
    if (dd == null) return null;
    if (dd < 0.2) return 90;
    if (dd < 0.5) return 70;
    if (dd < 0.75) return 50;
    if (dd < 0.9) return 35;
    return 15;
  }

  function findMetric(metrics, id) {
    for (var i = 0; i < metrics.length; i++) {
      if (metrics[i].id === id) return metrics[i].value;
    }
    return null;
  }

  /* ── Main scoring ── */

  var WEIGHTS = [
    { id: "floatQuality", label: "Float Quality", weight: 15, scorer: scoreFloat },
    { id: "dilutionPressure", label: "Dilution Pressure", weight: 15, scorer: scoreDilution },
    { id: "liquidityQuality", label: "Liquidity Quality", weight: 10, scorer: scoreLiquidity },
    { id: "insiderConcentration", label: "Insider Concentration", weight: 10, scorer: scoreInsider },
    { id: "utilityCapture", label: "Utility / Economic Capture", weight: 15, scorer: null },
    { id: "transparency", label: "Tokenomics Transparency", weight: 10, scorer: null },
    { id: "fundamentals", label: "Fundamental Strength", weight: 10, scorer: null },
    { id: "crossSource", label: "Cross-source Consistency", weight: 10, scorer: null },
    { id: "valuation", label: "Sector-adjusted Valuation", weight: 5, scorer: scoreValuation },
  ];

  function computeScore(data, metrics, utilityResult) {
    var categories = data.identity.categories || [];
    var breakdown = [];
    var totalWeighted = 0;
    var totalWeight = 0;
    var greens = 0, yellows = 0, reds = 0, grays = 0;

    for (var i = 0; i < WEIGHTS.length; i++) {
      var w = WEIGHTS[i];
      var raw = null;

      if (w.id === "utilityCapture") raw = scoreUtility(utilityResult ? utilityResult.score : null);
      else if (w.id === "transparency") raw = scoreTransparency(data, metrics);
      else if (w.id === "fundamentals") raw = scoreFundamentals(metrics, categories);
      else if (w.id === "crossSource") raw = scoreCrossSource(metrics);
      else if (w.scorer) raw = w.scorer(metrics);

      var color = "gray";
      if (raw != null) {
        totalWeighted += (raw / 100) * w.weight;
        totalWeight += w.weight;
        if (raw >= 70) { color = "green"; greens++; }
        else if (raw >= 40) { color = "yellow"; yellows++; }
        else { color = "red"; reds++; }
      } else {
        grays++;
      }

      breakdown.push({ id: w.id, label: w.label, weight: w.weight, raw: raw, color: color });
    }

    var overall = totalWeight > 0 ? Math.round((totalWeighted / totalWeight) * 100) : 0;

    return {
      overall: overall,
      breakdown: breakdown,
      greens: greens,
      yellows: yellows,
      reds: reds,
      grays: grays,
      verdict: getVerdict(overall),
      partnership: getPartnership(overall, breakdown),
      confidence: computeConfidence(data, metrics),
    };
  }

  function getVerdict(score) {
    if (score >= 80) return { label: "Strong", color: "green" };
    if (score >= 65) return { label: "Promising with manageable risks", color: "green" };
    if (score >= 50) return { label: "Mixed / needs caution", color: "yellow" };
    if (score >= 35) return { label: "Weak token structure", color: "red" };
    return { label: "High risk / poor token setup", color: "red" };
  }

  function getPartnership(score, breakdown) {
    var transparency = null;
    for (var i = 0; i < breakdown.length; i++) {
      if (breakdown[i].id === "transparency") { transparency = breakdown[i].raw; break; }
    }
    if (score >= 70 && (transparency == null || transparency >= 50)) {
      return "High strategic fit";
    }
    if (score >= 55) {
      return "Moderate fit, monitor token risk";
    }
    if (score >= 40) {
      return "Operational fit but token risk elevated";
    }
    return "Low fit due to token structure / weak transparency";
  }

  function computeConfidence(data, metrics) {
    var total = 0;
    var possible = 0;

    var marketFields = [
      data.market.price, data.market.marketCap, data.market.fdv,
      data.market.circulatingSupply, data.market.maxSupply, data.market.volume24h,
    ];
    for (var i = 0; i < marketFields.length; i++) {
      possible += 2;
      if (marketFields[i] && marketFields[i].value != null) total += 2;
    }

    var allocFields = [
      data.allocations.teamPct, data.allocations.investorPct,
      data.allocations.foundationPct, data.allocations.communityPct,
    ];
    for (var j = 0; j < allocFields.length; j++) {
      possible += 1;
      if (allocFields[j] && allocFields[j].value != null) total += 1;
    }

    possible += 2;
    if (data.identity.docsUrl) total += 1;
    if (data.identity.tokenomicsUrl) total += 1;

    var computable = metrics.filter(function (m) { return m.computable; }).length;
    possible += 14;
    total += computable;

    return possible > 0 ? Math.round((total / possible) * 100) : 0;
  }

  /* ── Executive Summary Generator ── */

  function generateSummary(data, metrics, score, utilityResult) {
    var lines = [];
    var name = data.identity.name || "This protocol";

    var healthy = [];
    var risky = [];
    var missing = [];

    for (var i = 0; i < metrics.length; i++) {
      var m = metrics[i];
      if (!m.computable) {
        missing.push(m.name);
        continue;
      }
      var sig = getSignal(m.id, m.value);
      if (sig.color === "green") healthy.push(m.name);
      else if (sig.color === "red") risky.push(m.name);
    }

    if (healthy.length > 0) {
      lines.push(name + " appears structurally healthy in: " + healthy.join(", ") + ".");
    }
    if (risky.length > 0) {
      lines.push("Elevated risk signals detected for: " + risky.join(", ") + ".");
    }
    if (missing.length > 0) {
      lines.push("Insufficient data for: " + missing.join(", ") + ". These metrics could not be evaluated.");
    }

    if (utilityResult && utilityResult.score > 60) {
      lines.push("Token utility appears strong with a score of " + utilityResult.score + "/100.");
    } else if (utilityResult && utilityResult.score > 30) {
      lines.push("Token utility is moderate (" + utilityResult.score + "/100) — limited economic capture mechanisms detected.");
    } else {
      lines.push("Token utility data is sparse or weak. Manual review of tokenomics documentation is recommended.");
    }

    if (score.confidence < 40) {
      lines.push("Low confidence: some inputs are incomplete or inconsistent. Use caution.");
    }

    lines.push("Overall score: " + score.overall + "/100 — " + score.verdict.label + ".");
    lines.push("Partnership suitability: " + score.partnership + ".");

    return lines.join(" ");
  }

  return {
    THRESHOLDS: THRESHOLDS,
    getSignal: getSignal,
    computeScore: computeScore,
    generateSummary: generateSummary,
  };
})();
