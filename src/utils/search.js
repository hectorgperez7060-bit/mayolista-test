const STOP = new Set([
  'de','del','la','el','los','las','y','o','en','con','para','por',
  'unidades','u','un','paquetes','paquete','caja','cajas',
  'una','esto','ese','eso','que','se','si','al','lo','su','mi',
  'dame','poneme','quiero','necesito','agregar','agregame','mandame'
]);

function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[-]/g, ' ');
}

// Split on any non-alphanumeric character (handles "Har.", "H/Maiz", quotes, etc.)
function tokenize(text) {
  return text.split(/[^a-z0-9]+/).filter(w => w.length > 0);
}

function scoreTermInText(term, text) {
  if (!text) return 0;

  // Exact substring
  if (text.includes(term)) {
    try { return new RegExp(`\\b${term}\\b`).test(text) ? 4 : 2; } catch { return 2; }
  }

  const words = tokenize(text);

  // Forward prefix: any word in text starts with the first ~70% of the query term
  // e.g. query="canuelas" → prefix="canu" → matches "canuelas" in product name
  if (term.length >= 4) {
    const prefix = term.slice(0, Math.max(4, Math.floor(term.length * 0.7)));
    if (words.some(w => w.startsWith(prefix))) return 1;
  }

  // Reverse prefix (abbreviation expansion): the query term starts with a short product word
  // e.g. query="harina" → product has "har" (from "Har.") → "harina".startsWith("har") → match
  // This handles catalogs that use abbreviations like Har., Yer., Ins., etc.
  const abbrevWords = words.filter(w =>
    w.length >= 3 && w.length <= 5 && /^[a-z]+$/.test(w) && !STOP.has(w)
  );
  if (abbrevWords.some(w => term.startsWith(w))) return 1;

  return 0;
}

export function searchProducts(products, query) {
  if (!query || !query.trim()) return products.slice(0, 10);

  const terms = norm(query).split(/\s+/).filter(w => w.length > 1 && !STOP.has(w));
  if (terms.length === 0) return products.slice(0, 10);

  const isNumeric = t => /^\d+([.,]\d+)?$/.test(t);
  const isUnit = t => ['g','gr','kg','ml','lt','l','cc','k'].includes(t);

  // If the query has significant terms (4+ letter, non-numeric), at least one must match.
  // Prevents short/common word coincidences from surfacing unrelated products.
  const hasSignificantTerms = terms.some(t => t.length >= 4 && !isNumeric(t) && !isUnit(t));

  return products
    .map(p => {
      const name   = norm(p.name);
      const desc   = norm(p.description);
      const brand  = norm(p.brand);
      const weight = norm(p.weight);
      const code   = norm(p.code);
      const full   = `${name} ${brand} ${weight} ${desc}`;

      let matchesCount = 0;
      let score = 0;
      let significantMatch = false;

      terms.forEach(term => {
        let s = 0;
        s = Math.max(s, scoreTermInText(term, brand)  * 5);
        s = Math.max(s, scoreTermInText(term, name)   * 4);
        s = Math.max(s, scoreTermInText(term, desc)   * 2);
        if (isNumeric(term)) s = Math.max(s, scoreTermInText(term, weight) * 3, scoreTermInText(term, name) * 3);
        if (isUnit(term))    s = Math.max(s, scoreTermInText(term, full)   * 2);
        if (code.includes(term)) s = Math.max(s, 1);

        if (s > 0) {
          score += s;
          matchesCount++;
          if (term.length >= 4 && !isNumeric(term) && !isUnit(term)) significantMatch = true;
        }
      });

      return { product: p, finalScore: matchesCount * 100 + score, matchesCount, significantMatch };
    })
    .filter(r => r.matchesCount > 0 && (!hasSignificantTerms || r.significantMatch))
    .sort((a, b) => b.finalScore - a.finalScore)
    .map(r => ({ ...r.product, matchesCount: r.matchesCount }));
}
