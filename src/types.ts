export type Role = 'user' | 'admin';
export type MatchStatus = 'open' | 'betting_closed' | 'finished';
export type BetStatus = 'confirmed' | 'pending';
export type TransactionType = 'deposit' | 'withdrawal' | 'manual_deduction' | 'bet' | 'prize' | 'refund';
export type TransactionStatus = 'pending' | 'confirmed' | 'rejected';

export interface UserProfile {
  id: string; // Document ID
  email: string;
  name: string;
  phone?: string; // Optional per Firebase blueprint
  pix_key?: string; // Optional
  balance: number;
  role: Role;
  createdAt: string;
  displayId?: string;
  numericId?: number;
  dismissedNotificationId?: string;
}

export interface Match {
  id: string; // Document ID
  team1: string;
  team2: string;
  flag1: string;
  flag2: string;
  date: string;
  status: MatchStatus;
  result1?: number;
  result2?: number;
  liveResult1?: number;
  liveResult2?: number;
  elapsed?: string;
  poolTotal: number;
  isPromotional?: boolean;
  phase?: string;
}

export interface Bet {
  id: string;
  userId: string;
  userName: string;
  matchId: string;
  predicted1: number;
  predicted2: number;
  amount: number;
  status: BetStatus;
  createdAt: string;
  is_winner?: boolean;
  prize_collected?: number;
  points?: number; // 5, 3, 1, or 0 based on results
  paid?: boolean; // Track if the bet value has been deducted
}

export interface Transaction {
  id: string;
  userId: string;
  type: TransactionType;
  amount: number;
  status: TransactionStatus;
  timestamp: string;
  pixReceiptDate?: string; // For withdrawals (Saques)
  description?: string;
  relatedBatchId?: string;
  ticketCount?: number;
  discountPercent?: number;
}

export interface PixPremiadoGame {
  id: string;
  userId: string;
  userName: string;
  numbers: number[]; // Array of 6 numbers or single Federal ticket number [number]
  price: number;
  createdAt: any; // Firestore Timestamp
  status?: 'confirmed' | 'pending';
  paid?: boolean;
  batchId?: string;
  discountPercent?: number;
  totalBatchCost?: number;
  ticketCount?: number;
  drawType?: 'MegaSena' | 'Loteria Federal';
  paidAt?: any;
}

export interface PixPremiadoDraw {
  id: string;
  date: string;
  time: string;
  type: 'MegaSena' | 'Loteria Federal';
  status: 'active' | 'finished';
  drawnNumbers: string[];
  createdAt: any;
  observations?: string;
  winningTicket?: string | null;
  winnerName?: string | null;
  winnerUserId?: string | null;
  winningReason?: string | null;
  finishedAt?: any;
}

export interface MinutoCertoDraw {
  id: string;
  matchName: string;
  date: string;
  time: string;
  status: 'active' | 'finished';
  winningMinute: number | null; // 1 to 100
  winnerId: string | null;
  winnerName: string | null;
  createdAt: any;
  price: number;
  prize: number;
  observations?: string;
}

export interface MinutoCertoTicket {
  id: string;
  drawId: string;
  userId: string;
  userName: string;
  minuteValue: number; // 1 to 100
  minuteLabel: string; // e.g. "45+2" or "89"
  price: number;
  createdAt: any;
}
