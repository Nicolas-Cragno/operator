// ARS/USD: decimal arithmetic, half-up, prices/discount 2 decimals,
// each line rounded to cents before summing; final discount rounded to cents.
function decimalFraction(value) {
  const text = String(value ?? '').trim().replace(/^\./, '0.').replace(/\.$/, '.0');
  if (!/^\d+(\.\d+)?(e[+-]?\d+)?$/i.test(text) || text.length > 80) throw new Error('Importe decimal inválido');
  const [mantissa, exponent = '0'] = text.toLowerCase().split('e');
  const [whole, fraction = ''] = mantissa.split('.');
  const scale = fraction.length - Number(exponent);
  if (Math.abs(scale) > 400) throw new Error('Precisión decimal fuera de rango');
  const numerator = BigInt(whole + fraction);
  return scale >= 0 ? [numerator, 10n ** BigInt(scale)] : [numerator * 10n ** BigInt(-scale), 1n];
}
const roundRatio = (n, d) => (n * 2n + d) / (d * 2n);
const centsText = cents => `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;
export function calculateDocumentAmounts(lines = [], discount = 0) {
  const [dn, dd] = decimalFraction(discount || 0);
  const basisPoints = roundRatio(dn * 100n, dd);
  if (dn > 100n * dd) throw new Error('Descuento fuera de 0–100');
  let subtotalCents = 0n;
  const prices = lines.map(line => {
    const [pn, pd] = decimalFraction(line.valor ?? 0);
    const priceCents = roundRatio(pn * 100n, pd);
    const [qn, qd] = decimalFraction(line.cantidad);
    subtotalCents += roundRatio(qn * priceCents, qd);
    // Bound compatible numeric fields to a range that preserves individual cents.
    if (priceCents > 99999999999999n) throw new Error('Precio fuera de rango');
    return Number(centsText(priceCents));
  });
  const totalCents = roundRatio(subtotalCents * (10000n - basisPoints), 10000n);
  if (subtotalCents > 99999999999999n) throw new Error('Subtotal fuera de rango');
  return { prices, descuento: Number(centsText(basisPoints)), subtotal: Number(centsText(subtotalCents)), total: Number(centsText(totalCents)),
    importesDecimales: { subtotal: centsText(subtotalCents), total: centsText(totalCents), politica: 'DECIMAL_HALF_UP_LINEA_2_V1' } };
}
