import QRCode from 'qrcode';

export interface PixPayloadParams {
  pixKey: string;
  name?: string;
  city?: string;
  txId?: string;
  amount?: number;
}

function formatTlv(tag: string, value: string): string {
  const len = value.length.toString().padStart(2, '0');
  return `${tag}${len}${value}`;
}

export function crc16(str: string): string {
  let crc = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    crc ^= (str.charCodeAt(i) << 8);
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
      } else {
        crc = (crc << 1) & 0xFFFF;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Generates official BCB PIX BR Code payload string (Pix Copia e Cola)
 */
export function generatePixPayload(params: PixPayloadParams): string {
  const pixKey = params.pixKey.trim();
  const name = (params.name || 'N')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .trim()
    .slice(0, 25) || 'N';
  
  const city = (params.city || 'C')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .trim()
    .slice(0, 15) || 'C';

  const txId = (params.txId || 'BOLAOCOXIM')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 25) || '***';

  const p00 = formatTlv('00', '01'); // Payload Format Indicator
  
  // Merchant Account Info (Tag 26)
  const gui = formatTlv('00', 'BR.GOV.BCB.PIX');
  const key = formatTlv('01', pixKey);
  const p26 = formatTlv('26', gui + key);

  const p52 = formatTlv('52', '0000'); // MCC
  const p53 = formatTlv('53', '986');  // BRL Currency

  let p54 = '';
  if (params.amount && params.amount > 0) {
    const formattedAmount = params.amount.toFixed(2);
    p54 = formatTlv('54', formattedAmount);
  }

  const p58 = formatTlv('58', 'BR');
  const p59 = formatTlv('59', name);
  const p60 = formatTlv('60', city);

  // Additional Data Field Template (Tag 62)
  const sub05 = formatTlv('05', txId);
  const p62 = formatTlv('62', sub05);

  const rawPayload = p00 + p26 + p52 + p53 + p54 + p58 + p59 + p60 + p62 + '6304';
  const checksum = crc16(rawPayload);

  return rawPayload + checksum;
}

/**
 * Converts a PIX payload string to a base64 PNG data URL for rendering in <img>
 */
export async function generatePixQRCodeDataUrl(pixCode: string): Promise<string> {
  try {
    return await QRCode.toDataURL(pixCode, {
      width: 280,
      margin: 1,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
      errorCorrectionLevel: 'M',
    });
  } catch (err) {
    console.error('Error generating PIX QR Code image:', err);
    return '';
  }
}
