import { collection, doc, writeBatch, serverTimestamp, Firestore } from 'firebase/firestore';
import { PixPremiadoGame, UserProfile } from '../types';

export const GUILHERME_PEREIRA_DEFAULT = {
  id: 'WstdGD2euHX9PJEjw2iUu0ieNOG3',
  name: 'Guilherme Pereira',
  email: 'guilhermesouzapereira10@gmail.com'
};

// 100 numbers calculated at the centroids of the largest intervals between existing tickets
export const OPTIMAL_100_PROXIMITY_NUMBERS: number[] = [
  0, 30, 93, 226, 397, 470, 574, 622, 645, 668,
  728, 794, 978, 1033, 1211, 1239, 1266, 1398, 1423, 1448,
  1657, 1686, 1714, 1772, 1802, 1832, 2076, 2289, 2344, 2467,
  2560, 2638, 2698, 2730, 2762, 2834, 2911, 2943, 2974, 3065,
  3191, 3378, 3476, 3505, 3534, 3604, 3627, 3650, 4260, 4414,
  4484, 4548, 4733, 4756, 4779, 4961, 5076, 5105, 5134, 5238,
  5614, 5859, 5957, 5990, 6023, 6268, 6379, 6717, 6740, 6763,
  6880, 6931, 7150, 7228, 7342, 7371, 7400, 7459, 7536, 7576,
  7616, 7687, 7873, 8096, 8213, 8285, 8317, 8349, 8408, 8827,
  9154, 9261, 9362, 9480, 9554, 9788, 9866, 9900, 9933, 9999
];

export async function insertOptimalNumbersForGuilherme(
  targetDb: Firestore,
  user?: UserProfile | null,
  currentGames?: PixPremiadoGame[]
) {
  const guilhermeId = user?.id || GUILHERME_PEREIRA_DEFAULT.id;
  const guilhermeName = user?.name || GUILHERME_PEREIRA_DEFAULT.name;

  // Check already existing taken numbers to avoid duplicating if already inserted
  const existingSet = new Set<number>();
  if (currentGames && currentGames.length > 0) {
    currentGames.forEach(g => {
      if ((g as any).status === 'cancelled' || (g as any).status === 'refunded') return;
      if (Array.isArray(g.numbers)) {
        g.numbers.forEach(n => {
          const val = typeof n === 'number' ? n : parseInt(String(n), 10);
          if (!isNaN(val)) existingSet.add(val);
        });
      } else if ((g as any).number !== undefined && (g as any).number !== null) {
        existingSet.add((g as any).number);
      } else if ((g as any).ticketNumber !== undefined && (g as any).ticketNumber !== null) {
        existingSet.add((g as any).ticketNumber);
      }
    });
  }

  const toInsert = OPTIMAL_100_PROXIMITY_NUMBERS.filter(num => !existingSet.has(num));
  const alreadyCount = OPTIMAL_100_PROXIMITY_NUMBERS.length - toInsert.length;

  if (toInsert.length === 0) {
    return {
      insertedCount: 0,
      alreadyCount,
      totalRequested: OPTIMAL_100_PROXIMITY_NUMBERS.length,
      userId: guilhermeId,
      userName: guilhermeName
    };
  }

  // 1. Commit all game tickets to pix_premiado_games
  const batch = writeBatch(targetDb);
  toInsert.forEach(num => {
    const gameRef = doc(collection(targetDb, 'pix_premiado_games'));
    batch.set(gameRef, {
      userId: guilhermeId,
      userName: guilhermeName,
      numbers: [num],
      price: 1.00,
      paid: true,
      status: 'confirmed',
      drawType: 'Loteria Federal',
      createdAt: serverTimestamp(),
      paidAt: serverTimestamp()
    });
  });

  await batch.commit();

  // 2. Audit record in transactions (non-blocking for tickets)
  try {
    const transRef = doc(collection(targetDb, 'transactions'));
    const transBatch = writeBatch(targetDb);
    transBatch.set(transRef, {
      userId: guilhermeId,
      type: 'manual_grant',
      amount: toInsert.length * 1.00,
      status: 'confirmed',
      timestamp: serverTimestamp(),
      description: `Compra Lote Estratégico Loteria Federal (${toInsert.length} bilhetes por proximidade - Guilherme Pereira)`
    });
    await transBatch.commit();
  } catch (transErr) {
    console.warn('Registro de transação audit não foi gravado (não-bloqueante):', transErr);
  }

  return {
    insertedCount: toInsert.length,
    alreadyCount,
    totalRequested: OPTIMAL_100_PROXIMITY_NUMBERS.length,
    userId: guilhermeId,
    userName: guilhermeName
  };
}
