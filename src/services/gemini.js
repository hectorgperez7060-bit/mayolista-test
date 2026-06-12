const API_KEY = import.meta.env.VITE_GEMINI_KEY;
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`;

export const isAIEnabled = () => Boolean(API_KEY);

export async function parseOrderWithAI(text) {
  if (!API_KEY) throw new Error('Sin clave API');

  const prompt = `Sos un asistente de pedidos mayoristas en Argentina.
Tu tarea: convertir texto libre en español a un JSON array de objetos con "producto" y "cantidad".

REGLAS:
- Convertí números escritos: uno=1, dos=2, tres=3, cuatro=4, cinco=5, seis=6, siete=7, ocho=8, nueve=9, diez=10, once=11, doce=12, trece=13, catorce=14, quince=15, veinte=20, veinticinco=25, treinta=30, cuarenta=40, cincuenta=50
- La cantidad puede estar al inicio o al final
- Si no hay cantidad, usá 1
- El campo "producto" debe incluir nombre, marca y presentación/peso si los hay
- Ignorá palabras como: poneme, dame, quiero, necesito, agregame, mandame
- Devolvé SOLO el JSON array, sin explicación ni bloques de código

Ejemplo entrada: "doce coca cola 2.25\nponeme 5 yerba playadito 500g"
Ejemplo salida: [{"producto":"coca cola 2.25","cantidad":12},{"producto":"yerba playadito 500g","cantidad":5}]

Texto:
${text}`;

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 1000 }
    })
  });

  if (!res.ok) throw new Error(`Gemini ${res.status}`);

  const data = await res.json();
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
  const clean = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(clean);
}

export async function matchProductWithAI(externalDescription, candidates) {
  if (!API_KEY || candidates.length === 0) return 0;

  const list = candidates
    .map((p, i) => `${i}: ${[p.name, p.brand, p.weight, p.presentation].filter(Boolean).join(' ')}`)
    .join('\n');

  const prompt = `Sos un asistente de productos mayoristas en Argentina.
Se escaneó un código de barras. El producto identificado externamente es:
"${externalDescription}"

Del siguiente catálogo, elegí el producto MÁS SIMILAR considerando nombre, marca y presentación.
Pensá en equivalencias reales: "gaseosa cola sin azúcar 2.25l" es lo mismo que "Coca Zero 2.25".
Respondé SOLO con el número índice de la mejor opción (0, 1, 2, etc.).

Catálogo:
${list}

Respondé solo con un número entero:`;

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 10 }
    })
  });

  if (!res.ok) return 0;
  const data = await res.json();
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '0';
  const idx = parseInt(raw.trim());
  return isNaN(idx) || idx >= candidates.length ? 0 : idx;
}

export async function testAIConnection() {
  const result = await parseOrderWithAI('doce coca cola 2.25');
  if (!Array.isArray(result) || result.length === 0) throw new Error('Respuesta inesperada');
  return result;
}
