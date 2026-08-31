import { 
  Firestore, 
  collection, 
  doc, 
  getDocs, 
  getDoc,
  query, 
  where, 
  runTransaction, 
  serverTimestamp, 
  limit, 
  orderBy,
  deleteDoc,
  setDoc,
  updateDoc
} from 'firebase/firestore';
import { UserProfile, PixPremiadoDraw, PixPremiadoGame, Transaction } from '../types';
import { calculatePixTicketPrice, PixPricingResult } from './pixPricing';
import { fetchAvailableFederalNumbers } from './loteriaFederal';

export interface BuyTicketResult {
  success: boolean;
  mode: 'confirmed' | 'provisional';
  finalPrice: number;
  originalPrice: number;
  discountPercent: number;
  count: number;
  boughtNumbers: (number[] | number)[];
  batchId: string;
  message?: string;
}

/**
 * Fetches random unassigned pool games for MegaSena
 */
export async function fetchRandomFreePoolGames(db: Firestore, nToFetch: number): Promise<any[]> {
  const randomIndex = Math.floor(Math.random() * 30000);
  
  let q = query(
    collection(db, 'pix_premiado_pool'),
    where('assigned', '==', false),
    where('index', '>=', randomIndex),
    limit(nToFetch)
  );
  let snap = await getDocs(q);
  let results = [...snap.docs];

  if (results.length < nToFetch) {
    const needed = nToFetch - results.length;
    q = query(
      collection(db, 'pix_premiado_pool'),
      where('assigned', '==', false),
      where('index', '<', randomIndex),
      limit(needed)
    );
    const snap2 = await getDocs(q);
    results = [...results, ...snap2.docs];
  }
  return results;
}

/**
 * Purchases tickets or creates provisional reservation if balance is insufficient
 */
export async function buyOrReservePixTickets(
  db: Firestore,
  user: { uid: string; displayName?: string | null; email?: string | null },
  profile: UserProfile,
  count: number,
  activeDraw: PixPremiadoDraw | null,
  forceProvisional = false
): Promise<BuyTicketResult> {
  const safeCount = Math.max(1, count || 1);
  const pricing = calculatePixTicketPrice(safeCount);
  const totalCost = pricing.finalPrice;
  const unitPriceVal = safeCount > 0 ? (pricing.finalPrice / safeCount) : 1.00;
  const currentBalance = profile.balance || 0;

  const willBeProvisional = forceProvisional || (currentBalance < totalCost);
  const isFederal = activeDraw ? (activeDraw.type === 'Loteria Federal') : true;
  const batchId = `batch_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  const boughtList: (number[] | number)[] = [];

  if (isFederal) {
    // Generate distinct federal numbers [0001 a 9999]
    // fetchAvailableFederalNumbers checks all existing documents in pix_premiado_games (both confirmed and provisional)
    const chosenNumsArray = await fetchAvailableFederalNumbers(db, safeCount);

    await runTransaction(db, async (transaction) => {
      const userRef = doc(db, 'users', user.uid);
      const userSnap = await transaction.get(userRef);

      if (!userSnap.exists()) throw new Error('Perfil de usuário não encontrado.');
      const freshProfile = userSnap.data() as UserProfile;
      const freshBalance = freshProfile.balance || 0;

      const isActuallyProvisional = willBeProvisional || (freshBalance < totalCost);

      if (!isActuallyProvisional) {
        // Has balance: deduct immediately and mark as confirmed
        transaction.update(userRef, { balance: freshBalance - totalCost });

        // Record confirmed bet transaction
        const transRef = doc(collection(db, 'transactions'));
        transaction.set(transRef, {
          userId: user.uid,
          type: 'bet',
          amount: -totalCost,
          status: 'confirmed',
          timestamp: serverTimestamp(),
          description: `Compra de ${safeCount} bilhete(s) Loteria Federal (Pix Premiado)${pricing.discountPercent > 0 ? ` (${pricing.discountPercent}% desc.)` : ''}`,
          relatedBatchId: batchId,
          ticketCount: safeCount,
          discountPercent: pricing.discountPercent
        });
      } else {
        // Insufficient balance: Create pending deposit transaction for exact discounted amount
        const transRef = doc(collection(db, 'transactions'));
        transaction.set(transRef, {
          userId: user.uid,
          type: 'deposit',
          amount: totalCost,
          status: 'pending',
          timestamp: serverTimestamp(),
          description: `Depósito PIX - Reserva Provisória de ${safeCount} bilhete(s) Loteria Federal${pricing.discountPercent > 0 ? ` (${pricing.discountPercent}% desc.)` : ''}`,
          relatedBatchId: batchId,
          ticketCount: safeCount,
          discountPercent: pricing.discountPercent
        });
      }

      // Write games (either confirmed or pending provisional reservation)
      chosenNumsArray.forEach(num => {
        boughtList.push([num]);
        const gameRef = doc(collection(db, 'pix_premiado_games'));
        transaction.set(gameRef, {
          userId: user.uid,
          userName: freshProfile.name || user.displayName || 'Apostador',
          numbers: [num],
          price: unitPriceVal,
          status: isActuallyProvisional ? 'pending' : 'confirmed',
          paid: !isActuallyProvisional,
          batchId: batchId,
          discountPercent: pricing.discountPercent,
          totalBatchCost: totalCost,
          ticketCount: safeCount,
          drawType: 'Loteria Federal',
          createdAt: serverTimestamp()
        });
      });
    });

    return {
      success: true,
      mode: willBeProvisional ? 'provisional' : 'confirmed',
      finalPrice: totalCost,
      originalPrice: pricing.originalPrice,
      discountPercent: pricing.discountPercent,
      count: safeCount,
      boughtNumbers: boughtList,
      batchId
    };
  } else {
    // MegaSena: Get random unassigned games from pool
    const poolDocs = await fetchRandomFreePoolGames(db, safeCount);
    if (poolDocs.length < safeCount) {
      throw new Error(`Não há jogos livres suficientes no pool! Disponíveis: ${poolDocs.length}, Solicitados: ${safeCount}.`);
    }

    await runTransaction(db, async (transaction) => {
      const userRef = doc(db, 'users', user.uid);
      const userSnap = await transaction.get(userRef);

      if (!userSnap.exists()) throw new Error('Perfil de usuário não encontrado.');
      const freshProfile = userSnap.data() as UserProfile;
      const freshBalance = freshProfile.balance || 0;

      const isActuallyProvisional = willBeProvisional || (freshBalance < totalCost);

      if (!isActuallyProvisional) {
        transaction.update(userRef, { balance: freshBalance - totalCost });

        const transRef = doc(collection(db, 'transactions'));
        transaction.set(transRef, {
          userId: user.uid,
          type: 'bet',
          amount: -totalCost,
          status: 'confirmed',
          timestamp: serverTimestamp(),
          description: `Compra de ${safeCount} bilhete(s) MegaSena (Pix Premiado)${pricing.discountPercent > 0 ? ` (${pricing.discountPercent}% desc.)` : ''}`,
          relatedBatchId: batchId,
          ticketCount: safeCount,
          discountPercent: pricing.discountPercent
        });
      } else {
        const transRef = doc(collection(db, 'transactions'));
        transaction.set(transRef, {
          userId: user.uid,
          type: 'deposit',
          amount: totalCost,
          status: 'pending',
          timestamp: serverTimestamp(),
          description: `Depósito PIX - Reserva Provisória de ${safeCount} bilhete(s) MegaSena${pricing.discountPercent > 0 ? ` (${pricing.discountPercent}% desc.)` : ''}`,
          relatedBatchId: batchId,
          ticketCount: safeCount,
          discountPercent: pricing.discountPercent
        });
      }

      // Write games and assign pool docs
      poolDocs.forEach(docSnap => {
        const gameNumbers = docSnap.data().numbers as number[];
        boughtList.push(gameNumbers);

        const poolDocRef = doc(db, 'pix_premiado_pool', docSnap.id);
        transaction.update(poolDocRef, {
          assigned: true,
          assignedUserId: user.uid,
          assignedUserName: freshProfile.name || user.displayName || 'Apostador',
          assignedAt: serverTimestamp(),
          status: isActuallyProvisional ? 'pending' : 'confirmed'
        });

        const gameRef = doc(collection(db, 'pix_premiado_games'));
        transaction.set(gameRef, {
          userId: user.uid,
          userName: freshProfile.name || user.displayName || 'Apostador',
          numbers: gameNumbers,
          price: unitPriceVal,
          status: isActuallyProvisional ? 'pending' : 'confirmed',
          paid: !isActuallyProvisional,
          batchId: batchId,
          discountPercent: pricing.discountPercent,
          totalBatchCost: totalCost,
          ticketCount: safeCount,
          drawType: 'MegaSena',
          createdAt: serverTimestamp()
        });
      });
    });

    // Update metadata counts
    try {
      const metaRef = doc(db, 'pix_premiado_metadata', 'pool');
      await runTransaction(db, async (transaction) => {
        const metaSnap = await transaction.get(metaRef);
        const currentAssigned = metaSnap.exists() ? (metaSnap.data().assignedGames || 0) : 0;
        transaction.set(metaRef, {
          assignedGames: currentAssigned + safeCount
        }, { merge: true });
      });
    } catch (metaErr) {
      console.warn("Error updating pool metadata count:", metaErr);
    }

    return {
      success: true,
      mode: willBeProvisional ? 'provisional' : 'confirmed',
      finalPrice: totalCost,
      originalPrice: pricing.originalPrice,
      discountPercent: pricing.discountPercent,
      count: safeCount,
      boughtNumbers: boughtList,
      batchId
    };
  }
}

/**
 * Reconciles any pending provisional tickets and bets when user receives deposit or has balance.
 * Respects all discount rules accurately.
 */
export async function reconcilePendingProvisionalTickets(
  db: Firestore, 
  userId: string
): Promise<{ paidTicketsCount: number; totalDeducted: number }> {
  let paidTicketsCount = 0;
  let totalDeducted = 0;

  try {
    // 1. Fetch pending games for user
    const gamesQuery = query(
      collection(db, 'pix_premiado_games'),
      where('userId', '==', userId)
    );
    const gamesSnap = await getDocs(gamesQuery);

    const pendingGames = gamesSnap.docs
      .map(d => ({ id: d.id, ...d.data() } as PixPremiadoGame))
      .filter(g => g.status === 'pending' || g.paid === false);

    if (pendingGames.length === 0) {
      return { paidTicketsCount: 0, totalDeducted: 0 };
    }

    // Group by batchId
    const batchesMap: { [batchId: string]: PixPremiadoGame[] } = {};
    const ungrouped: PixPremiadoGame[] = [];

    pendingGames.forEach(g => {
      if (g.batchId) {
        if (!batchesMap[g.batchId]) batchesMap[g.batchId] = [];
        batchesMap[g.batchId].push(g);
      } else {
        ungrouped.push(g);
      }
    });

    await runTransaction(db, async (transaction) => {
      const userRef = doc(db, 'users', userId);
      const userSnap = await transaction.get(userRef);
      if (!userSnap.exists()) return;

      let currentBalance = userSnap.data().balance || 0;
      if (currentBalance <= 0) return;

      // Process grouped batches first
      for (const [batchId, games] of Object.entries(batchesMap)) {
        const count = games.length;
        // Calculate discounted price for this batch
        const pricing = calculatePixTicketPrice(count);
        const requiredCost = pricing.finalPrice;

        if (currentBalance >= requiredCost) {
          currentBalance -= requiredCost;
          totalDeducted += requiredCost;
          paidTicketsCount += count;

          // Update each game in the batch
          games.forEach(g => {
            transaction.update(doc(db, 'pix_premiado_games', g.id), {
              status: 'confirmed',
              paid: true,
              paidAt: serverTimestamp(),
              price: requiredCost / count,
              discountPercent: pricing.discountPercent,
              totalBatchCost: requiredCost
            });
          });

          // Record deduction transaction
          const transRef = doc(collection(db, 'transactions'));
          transaction.set(transRef, {
            userId,
            type: 'bet',
            amount: -requiredCost,
            status: 'confirmed',
            timestamp: serverTimestamp(),
            description: `Pagamento automático de ${count} bilhete(s) provisório(s) Pix Premiado (${pricing.discountPercent > 0 ? `${pricing.discountPercent}% desc.` : 'sem desc.'})`,
            relatedBatchId: batchId,
            ticketCount: count,
            discountPercent: pricing.discountPercent
          });
        }
      }

      // Process any ungrouped pending games
      if (ungrouped.length > 0 && currentBalance >= 1) {
        const count = ungrouped.length;
        const pricing = calculatePixTicketPrice(count);
        
        if (currentBalance >= pricing.finalPrice) {
          currentBalance -= pricing.finalPrice;
          totalDeducted += pricing.finalPrice;
          paidTicketsCount += count;

          ungrouped.forEach(g => {
            transaction.update(doc(db, 'pix_premiado_games', g.id), {
              status: 'confirmed',
              paid: true,
              paidAt: serverTimestamp(),
              price: pricing.finalPrice / count,
              discountPercent: pricing.discountPercent
            });
          });

          const transRef = doc(collection(db, 'transactions'));
          transaction.set(transRef, {
            userId,
            type: 'bet',
            amount: -pricing.finalPrice,
            status: 'confirmed',
            timestamp: serverTimestamp(),
            description: `Pagamento automático de ${count} bilhete(s) provisório(s) Pix Premiado`,
            ticketCount: count,
            discountPercent: pricing.discountPercent
          });
        }
      }

      // Update final user balance
      transaction.update(userRef, { balance: currentBalance });
    });

  } catch (err) {
    console.error('[reconcilePendingProvisionalTickets] Error:', err);
  }

  return { paidTicketsCount, totalDeducted };
}

/**
 * Cancels all provisional / reserved tickets tied to a rejected or cancelled transaction/deposit,
 * releasing the numbers back to the pool so they are immediately available for other users to buy.
 */
export async function cancelAndReleaseReservedTicketsForTransaction(
  db: Firestore,
  transactionItem: Transaction | { id?: string; userId: string; relatedBatchId?: string; ticketCount?: number }
): Promise<{ cancelledTicketsCount: number; cancelledNumbers: (number[] | number)[] }> {
  const cancelledNumbers: (number[] | number)[] = [];
  let cancelledTicketsCount = 0;

  try {
    const userId = transactionItem.userId;
    const batchId = transactionItem.relatedBatchId;

    // 1. Query pending/unpaid games for this user
    let gamesToCancel: PixPremiadoGame[] = [];
    
    if (batchId) {
      const qBatch = query(
        collection(db, 'pix_premiado_games'),
        where('userId', '==', userId),
        where('batchId', '==', batchId)
      );
      const snap = await getDocs(qBatch);
      gamesToCancel = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as PixPremiadoGame))
        .filter(g => g.status === 'pending' || g.paid === false || (g.status !== 'confirmed' && !g.paid));
    }

    // If no games found by batchId or batchId was not specified, search for all pending/unpaid games for this user
    if (gamesToCancel.length === 0) {
      const qUser = query(
        collection(db, 'pix_premiado_games'),
        where('userId', '==', userId)
      );
      const snap = await getDocs(qUser);
      const allPending = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as PixPremiadoGame))
        .filter(g => g.status === 'pending' || g.paid === false || (g.status !== 'confirmed' && !g.paid));
      
      if (transactionItem && transactionItem.ticketCount && allPending.length > transactionItem.ticketCount) {
        gamesToCancel = allPending.slice(0, transactionItem.ticketCount);
      } else {
        gamesToCancel = allPending;
      }
    }

    if (gamesToCancel.length === 0) {
      return { cancelledTicketsCount: 0, cancelledNumbers: [] };
    }

    let megaSenaCount = 0;

    // 2. Delete each pending game from pix_premiado_games (freeing Federal numbers) and unassign MegaSena pool
    for (const game of gamesToCancel) {
      cancelledTicketsCount++;
      cancelledNumbers.push(game.numbers && game.numbers.length === 1 ? game.numbers[0] : game.numbers);

      // Deleting document from pix_premiado_games immediately frees Loteria Federal numbers
      try {
        await deleteDoc(doc(db, 'pix_premiado_games', game.id));
      } catch (delErr) {
        console.error(`[cancelReserved] Error deleting game ${game.id}:`, delErr);
      }

      // If MegaSena, unassign from pool
      if (game.numbers && game.numbers.length > 1) {
        megaSenaCount++;
        try {
          const poolQuery = query(
            collection(db, 'pix_premiado_pool'),
            where('assignedUserId', '==', userId)
          );
          const poolSnap = await getDocs(poolQuery);
          const gameNumbersStr = game.numbers.join('-');
          const matchingPoolDoc = poolSnap.docs.find(d => {
            const nums = d.data().numbers as number[];
            return nums && nums.join('-') === gameNumbersStr;
          });

          if (matchingPoolDoc) {
            const poolDocRef = doc(db, 'pix_premiado_pool', matchingPoolDoc.id);
            await setDoc(poolDocRef, {
              assigned: false,
              assignedUserId: null,
              assignedUserName: null,
              assignedAt: null,
              status: null
            }, { merge: true });
          }
        } catch (poolErr) {
          console.error('[cancelReserved] Error releasing pool ticket:', poolErr);
        }
      }
    }

    // 3. Update MegaSena pool metadata count
    if (megaSenaCount > 0) {
      try {
        const metaRef = doc(db, 'pix_premiado_metadata', 'pool');
        await runTransaction(db, async (transaction) => {
          const metaSnap = await transaction.get(metaRef);
          const currentAssigned = metaSnap.exists() ? (metaSnap.data().assignedGames || 0) : 0;
          transaction.set(metaRef, {
            assignedGames: Math.max(0, currentAssigned - megaSenaCount)
          }, { merge: true });
        });
      } catch (metaErr) {
        console.warn('[cancelReserved] Error updating pool metadata count:', metaErr);
      }
    }

  } catch (err) {
    console.error('[cancelAndReleaseReservedTicketsForTransaction] Error:', err);
  }

  return { cancelledTicketsCount, cancelledNumbers };
}

/**
 * Cancels a user's provisional reservation directly, releasing reserved numbers and updating/deleting any associated pending transaction
 */
export async function cancelUserProvisionalReservation(
  db: Firestore,
  userId: string,
  batchId?: string
): Promise<{ cancelledTicketsCount: number }> {
  try {
    // 1. Cancel tickets
    const { cancelledTicketsCount } = await cancelAndReleaseReservedTicketsForTransaction(db, {
      userId,
      relatedBatchId: batchId
    });

    // 2. Find and update/delete any pending deposit transaction for this user/batch
    if (batchId) {
      const qTrans = query(
        collection(db, 'transactions'),
        where('userId', '==', userId),
        where('relatedBatchId', '==', batchId),
        where('status', '==', 'pending')
      );
      const transSnap = await getDocs(qTrans);
      for (const tDoc of transSnap.docs) {
        await updateDoc(doc(db, 'transactions', tDoc.id), {
          status: 'rejected',
          description: (tDoc.data().description || '') + ' (Cancelado pelo usuário)',
          rejectedAt: serverTimestamp()
        });
      }
    } else {
      const qTrans = query(
        collection(db, 'transactions'),
        where('userId', '==', userId),
        where('type', '==', 'deposit'),
        where('status', '==', 'pending')
      );
      const transSnap = await getDocs(qTrans);
      for (const tDoc of transSnap.docs) {
        const desc = tDoc.data().description || '';
        if (desc.includes('Reserva Provisória') || desc.includes('Pix Premiado')) {
          await updateDoc(doc(db, 'transactions', tDoc.id), {
            status: 'rejected',
            description: desc + ' (Cancelado pelo usuário)',
            rejectedAt: serverTimestamp()
          });
        }
      }
    }

    return { cancelledTicketsCount };
  } catch (err) {
    console.error('[cancelUserProvisionalReservation] Error:', err);
    return { cancelledTicketsCount: 0 };
  }
}

