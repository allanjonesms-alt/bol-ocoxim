import { collection, getDocs, Firestore } from 'firebase/firestore';

/**
 * Generates distinct random ticket numbers for Loteria Federal in the range [1, 9999] (formatted as 0001 to 9999).
 * Checks existing sold games in Firestore to avoid duplicate ticket numbers across all users.
 */
export async function fetchAvailableFederalNumbers(db: Firestore, count: number): Promise<number[]> {
  const gamesSnap = await getDocs(collection(db, 'pix_premiado_games'));
  const takenNumbers = new Set<number>();
  
  gamesSnap.docs.forEach(docSnap => {
    const data = docSnap.data();
    if (Array.isArray(data.numbers) && data.numbers.length === 1 && typeof data.numbers[0] === 'number') {
      takenNumbers.add(data.numbers[0]);
    }
  });

  const available: number[] = [];
  for (let i = 1; i <= 9999; i++) {
    if (!takenNumbers.has(i)) {
      available.push(i);
    }
  }

  if (available.length < count) {
    throw new Error(`Não há bilhetes suficientes disponíveis na Loteria Federal (0001 a 9999). Restam ${available.length} bilhetes disponíveis, mas foram solicitados ${count}.`);
  }

  const chosen: number[] = [];
  for (let i = 0; i < count; i++) {
    const randomIndex = Math.floor(Math.random() * available.length);
    chosen.push(available[randomIndex]);
    available[randomIndex] = available[available.length - 1];
    available.pop();
  }

  return chosen;
}
