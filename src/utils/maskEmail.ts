/**
 * Impartial email and ticket formatting utilities for draw transparency reports.
 * Ensures strict buyer privacy while preserving public verification and authenticity.
 */

export function maskEmail(email?: string | null, fallbackName?: string | null): string {
  if (email && email.includes('@')) {
    const [localPart, domain] = email.split('@');
    if (!localPart || !domain) return 'participante***@***';

    if (localPart.length <= 2) {
      return `${localPart.slice(0, 1)}***@${domain}`;
    }
    if (localPart.length <= 4) {
      return `${localPart.slice(0, 2)}***@${domain}`;
    }
    // For normal email addresses, show first 3 chars, mask the middle, show last 1 char
    const first = localPart.slice(0, 3);
    const last = localPart.slice(-1);
    return `${first}***${last}@${domain}`;
  }

  if (fallbackName && fallbackName.trim().length > 0) {
    const parts = fallbackName.trim().split(/\s+/);
    if (parts.length === 1) {
      const p = parts[0];
      return p.length > 2 ? `${p.slice(0, 2)}*** (nome)` : `${p}*** (nome)`;
    }
    const first = parts[0];
    const lastInitial = parts[parts.length - 1].slice(0, 1).toUpperCase();
    return `${first} ${lastInitial}.*** (comprador)`;
  }

  return 'comprador***@sorteio';
}

export function formatTicketNumber(num: number | string | undefined | null): string {
  if (num === undefined || num === null) return '----';
  const numeric = typeof num === 'number' ? num : parseInt(String(num), 10);
  if (isNaN(numeric)) return '----';
  return String(numeric).padStart(4, '0');
}

export function parseGameTimestamp(createdAt: any): { dateStr: string; timeStr: string; timestampMs: number } {
  if (!createdAt) {
    return { dateStr: '--/--/----', timeStr: '--:--:--', timestampMs: 0 };
  }

  try {
    let d: Date;
    if (typeof createdAt === 'object' && 'seconds' in createdAt) {
      d = new Date(createdAt.seconds * 1000 + (createdAt.nanoseconds || 0) / 1000000);
    } else if (typeof createdAt?.toDate === 'function') {
      d = createdAt.toDate();
    } else {
      d = new Date(createdAt);
    }

    if (isNaN(d.getTime())) {
      return { dateStr: '--/--/----', timeStr: '--:--:--', timestampMs: 0 };
    }

    const dateStr = d.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });

    const timeStr = d.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    return { dateStr, timeStr, timestampMs: d.getTime() };
  } catch {
    return { dateStr: '--/--/----', timeStr: '--:--:--', timestampMs: 0 };
  }
}
