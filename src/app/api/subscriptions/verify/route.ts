import { NextResponse } from 'next/server';

/**
 * Ruta heredada de pagos directos con wallet. Aceptaba el plan y el precio que decía el navegador y solo comprobaba
 * que la tesorería apareciera en la transacción (sin monto ni anti-repetición), por lo que cualquiera podía activar
 * cualquier plan con una transacción pública. Se cerró: los pagos con Solana usan /api/subscriptions/qr/*, donde el
 * servidor fija el monto, genera una referencia única y valida la transferencia.
 */
export async function POST() {
  return NextResponse.json(
    { error: 'Este método de verificación fue retirado. Usa el pago por QR de Solana o tarjeta.' },
    { status: 410 }
  );
}
