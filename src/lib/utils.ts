import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatMinuteValue(val: number): string {
  if (val >= 1 && val <= 45) {
    return `${val}`;
  } else if (val >= 46 && val <= 50) {
    return `45+${val - 45}`;
  } else if (val >= 51 && val <= 95) {
    return `${val - 5}`;
  } else if (val >= 96 && val <= 100) {
    return `90+${val - 95}`;
  }
  return `${val}`;
}

export function getMinutePeriod(val: number): string {
  if (val >= 1 && val <= 45) {
    return '1º Tempo';
  } else if (val >= 46 && val <= 50) {
    return 'Acréscimos 1ºT';
  } else if (val >= 51 && val <= 95) {
    return '2º Tempo';
  } else if (val >= 96 && val <= 100) {
    return 'Acréscimos 2ºT';
  }
  return 'Desconhecido';
}

export function isAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  const lower = email.toLowerCase().trim();
  return lower.startsWith('allanjonesms') || lower.startsWith('gislene') || lower === 'gislenera@icloud.com';
}

