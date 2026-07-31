import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { collection, query, orderBy, onSnapshot, doc, getDocs, where, runTransaction, serverTimestamp, limit } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Match, Bet, MinutoCertoDraw, MinutoCertoTicket, UserProfile, PixPremiadoDraw, PixPremiadoGame } from '../types';
import { Trophy, CalendarClock, ChevronRight, CheckCircle2, Lock, Radio, Flame, Crown, Calendar, Lightbulb, AlertCircle, Download, FileText, Medal, CircleDollarSign, X, AlertTriangle, Clock, Sparkles } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { formatMinuteValue } from '../lib/utils';
import { handleFirestoreError, OperationType } from '../lib/error-handler';
import MatchCountdown from '../components/MatchCountdown';
import { generateMatchBetsPDF } from '../utils/pdfGenerator';
import { fetchAvailableFederalNumbers } from '../utils/loteriaFederal';
import { calculatePixTicketPrice } from '../utils/pixPricing';
import { LEADERBOARD_PRIZE_MULTIPLIER } from '../utils/constants';
import googleScoreboardImg from '../assets/images/google_scoreboard_1783945113545.jpg';
import minutoCertoPosterImg from '../assets/images/minuto_certo_poster_1783948747129.jpg';
import { motion, AnimatePresence } from 'motion/react';

// Teste de alteração para verificação de commit no GitHub

export default function Home() {
  const { user, profile } = useAuth();
  const [activeMinutoDraws, setActiveMinutoDraws] = useState<MinutoCertoDraw[]>([]);
  const [activePixDraws, setActivePixDraws] = useState<PixPremiadoDraw[]>([]);
  const [isPurchasingPix, setIsPurchasingPix] = useState(false);
  const [pixTicketCount, setPixTicketCount] = useState('1');
  const [recentBoughtTickets, setRecentBoughtTickets] = useState<any[]>([]);
  const [showPixBoughtModal, setShowPixBoughtModal] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [showConvertConfirm, setShowConvertConfirm] = useState(false);
  const [convertSummary, setConvertSummary] = useState<{
    currentBalance: number;
    paidQty: number;
    freeQty: number;
    totalQty: number;
    totalCost: number;
    remainingBalance: number;
    targetDrawName: string;
  } | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'minuto_certo_draws'), where('status', '==', 'active'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const draws = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MinutoCertoDraw));
      setActiveMinutoDraws(draws);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'pix_premiado_draws'), where('status', '==', 'active'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const draws = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PixPremiadoDraw));
      setActivePixDraws(draws);
    });
    return () => unsubscribe();
  }, []);

  const [matches, setMatches] = useState<Match[]>(() => {
    try {
      const cached = localStorage.getItem('home_matches_cache');
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });
  const [loading, setLoading] = useState(() => {
    try {
      const cached = localStorage.getItem('home_matches_cache');
      return !cached;
    } catch {
      return true;
    }
  });
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [leader, setLeader] = useState<{ userName: string; points: number } | null>(() => {
    try {
      const cached = localStorage.getItem('home_leader_cache');
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });
  const [totalPrizePool, setTotalPrizePool] = useState<number>(() => {
    try {
      const cached = localStorage.getItem('home_prize_pool_cache');
      return cached ? Number(cached) : 0;
    } catch {
      return 0;
    }
  });
  const [printingPdfId, setPrintingPdfId] = useState<string | null>(null);
  const [bets, setBets] = useState<Bet[]>([]);
  const [winnersSettings, setWinnersSettings] = useState<{ active: boolean; matchId: string } | null>(null);
  const [leaderboardSettings, setLeaderboardSettings] = useState<{ active: boolean } | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);
  const [showMinutoPromo, setShowMinutoPromo] = useState(false);

  const showToast = (message: string, type: 'success' | 'error' | 'warning') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const isBrasilHaitiMatch = (m: Match): boolean => {
    const h = m.team1?.toLowerCase() || '';
    const a = m.team2?.toLowerCase() || '';
    return (h.includes('brasil') && a.includes('haiti')) || 
           (h.includes('haiti') && a.includes('brasil'));
  };

  const isFrancaEspanhaMatch = (m: Match): boolean => {
    const h = m.team1?.toLowerCase() || '';
    const a = m.team2?.toLowerCase() || '';
    return (h.includes('frança') || h.includes('franca') || h.includes('france')) && (a.includes('espanha') || a.includes('spain')) ||
           (h.includes('espanha') || h.includes('spain')) && (a.includes('frança') || a.includes('franca') || a.includes('france'));
  };

  const isBefore16hAppTime = () => {
    const now = new Date();
    const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
    const appTime = new Date(utcTime - (4 * 3600000));
    return appTime.getHours() < 16;
  };

  const handleConvertClick = () => {
    if (!user || !profile) {
      showToast("Por favor, faça login para converter seu saldo em minutos!", "error");
      return;
    }

    if (!isBefore16hAppTime()) {
      showToast("As conversões de saldo se encerraram às 16h (horário do app, -4:00 UTC).", "error");
      return;
    }

    if (activeMinutoDraws.length === 0) {
      showToast("Nenhum sorteio de Minuto Certo ativo no momento para receber a conversão.", "warning");
      return;
    }

    const currentBalance = profile.balance || 0;
    if (currentBalance < 2.00) {
      showToast("Você precisa de pelo menos R$ 2,00 de saldo para converter em minutos. Sem o saldo mínimo, não é possível conceder os 2 bilhetes gratuitos.", "error");
      return;
    }

    const paidQty = Math.floor(currentBalance / 2);
    const freeQty = 2;
    const totalQty = paidQty + freeQty;

    const totalCost = paidQty * 2;
    const remainingBalance = currentBalance - totalCost;
    const targetDraw = activeMinutoDraws[0];

    setConvertSummary({
      currentBalance,
      paidQty,
      freeQty,
      totalQty,
      totalCost,
      remainingBalance,
      targetDrawName: targetDraw.matchName
    });
    setShowConvertConfirm(true);
  };

  const handleConvertBalanceToMinutes = async () => {
    if (!user || !profile || !convertSummary) {
      return;
    }

    if (!isBefore16hAppTime()) {
      showToast("As conversões de saldo se encerraram às 16h (horário do app, -4:00 UTC).", "error");
      setShowConvertConfirm(false);
      return;
    }

    const currentBalance = profile.balance || 0;
    if (currentBalance < 2.00) {
      showToast("Você precisa de pelo menos R$ 2,00 de saldo para realizar a conversão.", "error");
      setShowConvertConfirm(false);
      return;
    }

    setShowConvertConfirm(false);
    setIsConverting(true);

    const targetDraw = activeMinutoDraws[0];

    try {
      // 1. Fetch sold tickets for this draw
      const ticketsSnap = await getDocs(
        query(collection(db, 'minuto_certo_tickets'), where('drawId', '==', targetDraw.id))
      );
      const soldMinutes = ticketsSnap.docs.map(doc => (doc.data() as MinutoCertoTicket).minuteValue);

      // 2. Find available minutes of the second half (46 to 95)
      const availableMinutes: number[] = [];
      for (let i = 46; i <= 95; i++) {
        if (!soldMinutes.includes(i)) {
          availableMinutes.push(i);
        }
      }

      if (availableMinutes.length === 0) {
        showToast("Todos os minutos do segundo tempo (46 a 95) para este sorteio já foram adquiridos!", "error");
        setIsConverting(false);
        return;
      }

      const totalRequestedQty = convertSummary.totalQty;
      const actualQty = Math.min(totalRequestedQty, availableMinutes.length);
      const actualPaidQty = Math.max(0, actualQty - convertSummary.freeQty);
      const totalCost = actualPaidQty * 2;

      if (currentBalance < totalCost) {
        showToast(`Saldo insuficiente para converter. Você precisa de pelo menos R$ ${totalCost.toFixed(2)}.`, "error");
        setIsConverting(false);
        return;
      }

      // 3. Select distinct random minutes from available ones
      const selectedMinutes: number[] = [];
      const tempAvailable = [...availableMinutes];
      for (let i = 0; i < actualQty; i++) {
        const randomIndex = Math.floor(Math.random() * tempAvailable.length);
        selectedMinutes.push(tempAvailable[randomIndex]);
        tempAvailable.splice(randomIndex, 1);
      }

      // 4. Run Transaction
      await runTransaction(db, async (transaction) => {
        const userRef = doc(db, 'users', user.uid);
        const userSnap = await transaction.get(userRef);
        if (!userSnap.exists()) throw new Error('Perfil de usuário não encontrado.');

        const freshProfile = userSnap.data() as UserProfile;
        const freshBalance = freshProfile.balance || 0;

        if (freshBalance < 2.00) {
          throw new Error('Você precisa de no mínimo R$ 2,00 de saldo para poder converter.');
        }

        if (freshBalance < totalCost) {
          throw new Error('Saldo insuficiente para a conversão.');
        }

        const ticketCheckResults = [];
        for (const m of selectedMinutes) {
          const tDocId = `${targetDraw.id}_${m}`;
          const tRef = doc(db, 'minuto_certo_tickets', tDocId);
          const tSnap = await transaction.get(tRef);
          if (tSnap.exists()) {
            throw new Error(`O minuto ${formatMinuteValue(m)} foi adquirido por outro jogador. Tente novamente!`);
          }
          ticketCheckResults.push({ ref: tRef, minute: m, label: formatMinuteValue(m) });
        }

        // Deduct balance
        const newBalance = freshBalance - totalCost;
        transaction.update(userRef, { balance: newBalance });

        // Save tickets
        for (const item of ticketCheckResults) {
          transaction.set(item.ref, {
            drawId: targetDraw.id,
            userId: user.uid,
            userName: freshProfile.name,
            minuteValue: item.minute,
            minuteLabel: item.label,
            price: targetDraw.price,
            createdAt: serverTimestamp()
          });
        }

        // Create transaction receipt
        const transRef = doc(collection(db, 'transactions'));
        const labelsList = [...selectedMinutes].sort((a, b) => a - b).map(m => formatMinuteValue(m)).join(', ');
        transaction.set(transRef, {
          userId: user.uid,
          type: 'bet',
          amount: -totalCost,
          status: 'confirmed',
          timestamp: serverTimestamp(),
          description: `Conversão de Saldo em Minuto Certo (${actualQty}x, sendo 2 gratuitos) - Minutos: ${labelsList} (Partida: ${targetDraw.matchName})`
        });
      });

      const formattedMinutes = [...selectedMinutes].sort((a, b) => a - b).map(m => formatMinuteValue(m)).join(', ');
      showToast(`Sucesso! Seu saldo de R$ ${currentBalance.toFixed(2)} foi convertido em ${actualQty} minutos (+2 gratuitos): ${formattedMinutes}!`, 'success');
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Erro ao realizar a conversão de saldo.', 'error');
    } finally {
      setIsConverting(false);
      setConvertSummary(null);
    }
  };

  useEffect(() => {
    // Hidden as per user request to hide the pop-up do minuto certo
    setShowMinutoPromo(false);
  }, []);

  const closePromo = () => {
    setShowMinutoPromo(false);
  };

  // Helper to fetch random free pool games
  const fetchRandomFreeGames = async (nToFetch: number): Promise<any[]> => {
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
  };

  const handleBuyPixTickets = async () => {
    if (!user || !profile) {
      showToast('Por favor, faça login para comprar bilhetes!', 'error');
      return;
    }

    const count = parseInt(pixTicketCount);
    if (isNaN(count) || count <= 0) {
      showToast('Por favor, insira uma quantidade de bilhetes válida.', 'error');
      return;
    }

    const { finalPrice, discountPercent } = calculatePixTicketPrice(count);
    const totalCost = finalPrice;
    const ticketPriceVal = count > 0 ? (finalPrice / count) : 1.00;
    const currentBalance = profile.balance || 0;

    if (currentBalance < totalCost) {
      showToast(`Você não possui saldo suficiente (Saldo: R$ ${currentBalance.toFixed(2)} / Custo: R$ ${totalCost.toFixed(2)}). Por favor, recarregue seu saldo no Painel do Usuário!`, 'error');
      return;
    }

    const activeDraw = activePixDraws[0];
    const isFederal = activeDraw && activeDraw.type === 'Loteria Federal';

    setIsPurchasingPix(true);
    try {
      const boughtList: any[] = [];
      if (isFederal) {
        // Generate distinctive random numbers for Loteria Federal [0001 a 9999]
        const chosenNumsArray = await fetchAvailableFederalNumbers(db, count);

        await runTransaction(db, async (transaction) => {
          const userRef = doc(db, 'users', user.uid);
          const userSnap = await transaction.get(userRef);

          if (!userSnap.exists()) throw new Error('Perfil de usuário não encontrado.');
          const freshProfile = userSnap.data() as UserProfile;
          const freshBalance = freshProfile.balance || 0;

          if (freshBalance < totalCost) {
            throw new Error('Saldo insuficiente detectado.');
          }

          // Deduct balance
          transaction.update(userRef, { balance: freshBalance - totalCost });

          // Log transaction
          const transRef = doc(collection(db, 'transactions'));
          transaction.set(transRef, {
            userId: user.uid,
            type: 'bet',
            amount: -totalCost,
            status: 'confirmed',
            timestamp: serverTimestamp(),
            description: `Compra de ${count} bilhete(s) Loteria Federal (Pix Premiado)${discountPercent > 0 ? ` (${discountPercent}% desc.)` : ''}`
          });

          // Write public games
          chosenNumsArray.forEach(num => {
            boughtList.push([num]);

            const gameRef = doc(collection(db, 'pix_premiado_games'));
            transaction.set(gameRef, {
              userId: user.uid,
              userName: freshProfile.name,
              numbers: [num],
              price: ticketPriceVal,
              createdAt: serverTimestamp()
            });
          });
        });

        setRecentBoughtTickets(boughtList);
        setShowPixBoughtModal(true);
        showToast(`${count} bilhete(s) Loteria Federal comprado(s) com sucesso por R$ ${totalCost.toFixed(2)}!`, 'success');
        setPixTicketCount('1');
      } else {
        // MegaSena: Get random unassigned games from pool
        const poolDocs = await fetchRandomFreeGames(count);
        if (poolDocs.length < count) {
          throw new Error(`Não há jogos livres suficientes no pool! Disponíveis: ${poolDocs.length}, Solicitados: ${count}.`);
        }

        // 2. Write using Firestore transaction
        await runTransaction(db, async (transaction) => {
          const userRef = doc(db, 'users', user.uid);
          const userSnap = await transaction.get(userRef);

          if (!userSnap.exists()) throw new Error('Perfil de usuário não encontrado.');
          const freshProfile = userSnap.data() as UserProfile;
          const freshBalance = freshProfile.balance || 0;

          if (freshBalance < totalCost) {
            throw new Error('Saldo insuficiente detectado.');
          }

          // Deduct balance
          transaction.update(userRef, { balance: freshBalance - totalCost });

          // Log transaction
          const transRef = doc(collection(db, 'transactions'));
          transaction.set(transRef, {
            userId: user.uid,
            type: 'bet',
            amount: -totalCost,
            status: 'confirmed',
            timestamp: serverTimestamp(),
            description: `Compra de ${count} bilhete(s) do Pool PIX PREMIADO${discountPercent > 0 ? ` (${discountPercent}% desc.)` : ''}`
          });

          // Write games and assign in pool
          poolDocs.forEach(docSnap => {
            const gameNumbers = docSnap.data().numbers as number[];
            boughtList.push(gameNumbers);
            
            // Mark assigned in pool doc
            const poolDocRef = doc(db, 'pix_premiado_pool', docSnap.id);
            transaction.update(poolDocRef, {
              assigned: true,
              assignedUserId: user.uid,
              assignedUserName: freshProfile.name,
              assignedAt: serverTimestamp()
            });

            // Write game
            const gameRef = doc(collection(db, 'pix_premiado_games'));
            transaction.set(gameRef, {
              userId: user.uid,
              userName: freshProfile.name,
              numbers: gameNumbers,
              price: ticketPriceVal,
              createdAt: serverTimestamp()
            });
          });
        });

        // 3. Update metadata counts
        try {
          const metaRef = doc(db, 'pix_premiado_metadata', 'pool');
          await runTransaction(db, async (transaction) => {
            const metaSnap = await transaction.get(metaRef);
            const currentAssigned = metaSnap.exists() ? (metaSnap.data().assignedGames || 0) : 0;
            transaction.set(metaRef, {
              assignedGames: currentAssigned + count
            }, { merge: true });
          });
        } catch (metaErr) {
          console.error("Error updating pool metadata count:", metaErr);
        }

        setRecentBoughtTickets(boughtList);
        setShowPixBoughtModal(true);
        showToast(`${count} bilhete(s) do pool comprado(s) com sucesso por R$ ${totalCost.toFixed(2)}!`, 'success');
        setPixTicketCount('1');
      }
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Erro ao comprar bilhetes.', 'error');
    } finally {
      setIsPurchasingPix(false);
    }
  };

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  const [winnersDataState, setWinnersDataState] = useState<{ name: string; amount: string; id: string }[]>(() => {
    try {
      const cached = localStorage.getItem('home_winners_data_cache');
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    // Fetch only confirmed bets asynchronously to keep the page load extremely fast
    const fetchConfirmedBets = async () => {
      try {
        const lastFetch = localStorage.getItem('home_bets_last_fetch');
        const cachedLeader = localStorage.getItem('home_leader_cache');
        const cachedPrizePool = localStorage.getItem('home_prize_pool_cache');
        const nowTime = Date.now();
        
        // If we have cached values and they are less than 5 minutes old, don't fetch!
        if (cachedLeader && cachedPrizePool && lastFetch && (nowTime - Number(lastFetch) < 5 * 60 * 1000)) {
          return;
        }

        const q = query(collection(db, 'bets'), where('status', '==', 'confirmed'));
        const snapshot = await getDocs(q);
        const scores: Record<string, { userName: string, points: number }> = {};
        const allBets: Bet[] = [];
        
        snapshot.docs.forEach(doc => {
          const betData = doc.data() as Bet;
          const bet = { ...betData, id: doc.id };
          allBets.push(bet);
          
          if (!scores[bet.userId]) {
            scores[bet.userId] = { userName: bet.userName, points: 0 };
          }
          scores[bet.userId].points += (bet.points || 0);
        });
        
        const rows = Object.keys(scores).map(userId => ({
          userId,
          userName: scores[userId].userName,
          points: scores[userId].points
        })).sort((a, b) => b.points - a.points);
        
        setBets(allBets);
        if (rows.length > 0) {
          const topLeader = rows[0];
          setLeader(topLeader);
          localStorage.setItem('home_leader_cache', JSON.stringify(topLeader));
        } else {
          setLeader(null);
          localStorage.removeItem('home_leader_cache');
        }
        
        localStorage.setItem('home_bets_last_fetch', nowTime.toString());
      } catch (error) {
        console.error("Error loading home leaderboard summary:", error);
      }
    };

    fetchConfirmedBets();
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'matches'), orderBy('date', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const matchData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Match));
      setMatches(matchData);
      localStorage.setItem('home_matches_cache', JSON.stringify(matchData));
      setError(null);
      setLoading(false);
    }, (error) => {
      console.error("Error listing matches:", error);
      setError(error.message || "Erro ao carregar os jogos.");
      setLoading(false);
      try {
        handleFirestoreError(error, OperationType.LIST, 'matches');
      } catch (e) {
        console.error("Mapped Firestore Error:", e);
      }
    });

    const unsubSettings = onSnapshot(doc(db, 'settings', 'winnersSection'), (d) => {
      if (d.exists()) {
        const data = d.data();
        setWinnersSettings({
          active: data.active === true,
          matchId: data.matchId || ''
        });
      } else {
         setWinnersSettings(null);
      }
    });

    const unsubLeaderboard = onSnapshot(doc(db, 'settings', 'leaderboard'), (d) => {
      if (d.exists()) {
        const data = d.data();
        setLeaderboardSettings({
          active: data.active !== false
        });
      } else {
        setLeaderboardSettings({ active: true });
      }
    });

    return () => { unsubscribe(); unsubSettings(); unsubLeaderboard(); };
  }, []);

  useEffect(() => {
    if (!winnersSettings?.active || !winnersSettings?.matchId || matches.length === 0) return;
    const match = matches.find(m => m.id === winnersSettings.matchId);
    if (!match || match.status !== 'finished') return;

    const fetchWinners = async () => {
      try {
        const q = query(
          collection(db, 'bets'), 
          where('matchId', '==', winnersSettings.matchId), 
          where('status', '==', 'confirmed')
        );
        const snap = await getDocs(q);
        const res1 = Number(match.result1);
        const res2 = Number(match.result2);
        const winningBets = snap.docs
          .map(doc => doc.data() as Bet)
          .filter(b => Number(b.predicted1) === res1 && Number(b.predicted2) === res2);
        
        const prizePool = match.poolTotal * 0.9;
        const prizePerWinner = winningBets.length > 0 ? prizePool / winningBets.length : 0;
        
        const data = winningBets.map((b, i) => ({
          id: b.id || (b.userId + i),
          name: b.userName,
          amount: prizePerWinner.toFixed(2)
        }));
        
        setWinnersDataState(data);
        localStorage.setItem('home_winners_data_cache', JSON.stringify(data));
      } catch (e) {
        console.error("Error fetching round winners:", e);
      }
    };

    fetchWinners();
  }, [winnersSettings, matches]);

  useEffect(() => {
    if (matches.length === 0 || bets.length === 0) return;
    
    let calculatedPrizePool = 0;
    bets.forEach(bet => {
      if (bet.status !== 'confirmed') return;
      const match = matches.find(m => m.id === bet.matchId);
      if (match?.isPromotional) {
        calculatedPrizePool += (bet.amount || 2) * 0.50;
      } else {
        calculatedPrizePool += (bet.amount || 5) * 0.02;
      }
    });
    setTotalPrizePool(calculatedPrizePool);
  }, [bets, matches]);

  const [liveFixtures, setLiveFixtures] = useState<any[]>([]);

  useEffect(() => {
    const fetchLiveMatches = async () => {
      try {
        const res = await fetch("/api/live-matches");
        if (res.ok) {
          const json = await res.json();
          if (json.success && json.data) {
            setLiveFixtures(json.data);
          }
        }
      } catch (e) {
        console.error("Failed to fetch live matches", e);
      }
    };
    
    fetchLiveMatches();
    const interval = setInterval(fetchLiveMatches, 60000); // poll every 1 minute
    return () => clearInterval(interval);
  }, []);

  const getLiveMatchStats = (match: Match) => {
    const norm1 = match.team1?.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    const norm2 = match.team2?.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    
    const activeFixture = liveFixtures.find((f: any) => {
      const h = f.teams.home.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
      const a = f.teams.away.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
      
      const checkMatch = (t1: string, t2: string) => {
         return (h.includes(t1) || t1.includes(h) || (t1.startsWith('brasil') && h.startsWith('brazil')) || (t1.startsWith('jord') && h.startsWith('jordan')) || (t1.startsWith('arge') && h.startsWith('algeria')) || (t1.startsWith('alem') && h.startsWith('german'))) &&
                (a.includes(t2) || t2.includes(a) || (t2.startsWith('brasil') && a.startsWith('brazil')) || (t2.startsWith('jord') && a.startsWith('jordan')) || (t2.startsWith('arge') && a.startsWith('algeria')) || (t2.startsWith('alem') && a.startsWith('german')));
      };
      
      return checkMatch(norm1, norm2) || checkMatch(norm2, norm1);
    });

    if (activeFixture) {
      const h = activeFixture.teams.home.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
      const isInverse = h.includes(norm2) || norm2.includes(h) || (norm2.startsWith('brasil') && h.startsWith('brazil')) || (norm2.startsWith('jord') && h.startsWith('jordan')) || (norm2.startsWith('arge') && h.startsWith('algeria')) || (norm2.startsWith('alem') && h.startsWith('german'));
      
      return {
        l1: isInverse ? activeFixture.goals.away : activeFixture.goals.home,
        l2: isInverse ? activeFixture.goals.home : activeFixture.goals.away,
        elapsed: activeFixture.fixture.status.elapsed ? `${activeFixture.fixture.status.elapsed}'` : 'Ao Vivo'
      };
    }
    
    return { l1: match.liveResult1 ?? 0, l2: match.liveResult2 ?? 0, elapsed: null };
  };

  const checkPdfAvailability = (match: Match): { allowed: boolean; remainingText?: string } => {
    if (isBrasilHaitiMatch(match)) {
      return { allowed: true };
    }
    const matchTime = new Date(match.date).getTime();
    const closingTime = matchTime - 30 * 60 * 1000;
    const pdfAvailableTime = closingTime + 15 * 60 * 1000; // 15 mins after closure
    const nowTime = Date.now();
    
    if (nowTime < pdfAvailableTime) {
      const diffMs = pdfAvailableTime - nowTime;
      const totalSeconds = Math.ceil(diffMs / 1000);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      const remainingText = minutes > 0 ? `${minutes} min e ${seconds} seg` : `${seconds} seg`;
      return { allowed: false, remainingText };
    }
    return { allowed: true };
  };

  if (loading) {
    return <div className="p-12 text-center text-slate-500 font-medium">Carregando jogos...</div>;
  }

  if (error) {
    return (
      <div className="p-12 text-center max-w-lg mx-auto bg-white rounded-3xl border border-red-100 shadow-sm">
        <div className="text-red-500 font-bold mb-2">Ops! Ocorreu um erro</div>
        <p className="text-slate-500 text-sm mb-4">{error}</p>
        <button 
          onClick={() => window.location.reload()} 
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2 rounded-xl text-sm transition"
        >
          Tentar Novamente
        </button>
      </div>
    );
  }

  const liveMatches = matches.filter(match => {
    if (match.status === 'finished') return false;
    const matchDate = new Date(match.date).getTime();
    return now >= matchDate;
  });

  const urgentPromotionalMatches = matches.filter(match => {
    if (!match.isPromotional || match.status !== 'open') return false;
    const matchDate = new Date(match.date).getTime();
    if (now >= matchDate) return false;
    const closingTime = matchDate - 30 * 60 * 1000;
    const timeLeft = closingTime - now;
    return timeLeft > 0 && timeLeft <= 3 * 60 * 60 * 1000;
  }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const normalPromotionalMatches = matches.filter(match => {
    if (!match.isPromotional) return false;
    const matchDate = new Date(match.date).getTime();
    if (now >= matchDate) return false;
    if (match.status === 'open') {
      const closingTime = matchDate - 30 * 60 * 1000;
      const timeLeft = closingTime - now;
      if (timeLeft > 0 && timeLeft <= 3 * 60 * 60 * 1000) return false;
    }
    return true;
  }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const officialMatches = matches.filter(match => {
    if (match.isPromotional) return false;
    if (match.status === 'finished') return false; // remove finished matches
    const matchDate = new Date(match.date).getTime();
    const isLive = match.status !== 'finished' && now >= matchDate;
    return !isLive;
  }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  let winnersData: { name: string; amount: string; id: string }[] = winnersDataState;
  let winnersMatch: Match | undefined;

  if (winnersSettings?.active && winnersSettings.matchId) {
    winnersMatch = matches.find(m => m.id === winnersSettings.matchId);
  }

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-50 w-full max-w-sm animate-in slide-in-from-top-10 fade-in duration-300">
          <div className={`p-2 rounded-xl shadow-xl ${toast.type === 'success' ? 'bg-emerald-50' : toast.type === 'warning' ? 'bg-amber-50' : 'bg-red-50'}`}>
            <div className={`flex items-start gap-4 p-4 border rounded-lg bg-white ${toast.type === 'success' ? 'border-emerald-200' : toast.type === 'warning' ? 'border-amber-200' : 'border-red-200'}`}>
              <div className={`p-1.5 rounded-full ${toast.type === 'success' ? 'bg-emerald-100' : toast.type === 'warning' ? 'bg-amber-100' : 'bg-red-100'}`}>
                {toast.type === 'success' ? <CheckCircle2 className="w-5 h-5 text-emerald-600" /> : toast.type === 'warning' ? <AlertTriangle className="w-5 h-5 text-amber-600" /> : <X className="w-5 h-5 text-red-600" />}
              </div>
              <div className="flex-1">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                  {toast.type === 'success' ? 'Sucesso' : toast.type === 'warning' ? 'Aviso' : 'Erro'}
                </p>
                <p className="text-sm font-bold text-slate-800 leading-tight">{toast.message}</p>
              </div>
              <button onClick={() => setToast(null)} className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer" title="Fechar">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}



      {/* Dica de Ouro de Jogos Promocionais
      <div id="promotional-games-tip" className="bg-gradient-to-r from-yellow-500/10 via-amber-500/5 to-white border border-amber-300/40 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-24 h-24 bg-yellow-400/5 rounded-full blur-xl pointer-events-none"></div>
        <div className="bg-amber-100 border border-amber-300 p-2 rounded-xl shrink-0">
          <Lightbulb className="h-5 w-5 text-amber-600 animate-pulse" />
        </div>
        <div className="text-slate-700 text-sm leading-relaxed relative z-10 font-medium">
          <strong className="text-amber-800 font-extrabold mr-1">Dica de Campeão:</strong> 
          Dê atenção especial aos jogos promocionais! As apostas promocionais de <strong className="text-slate-900 font-bold">R$ 2,00</strong> agora valem pontos em <strong className="text-slate-900 font-bold">dobro</strong> para o Ranking Geral. Acumule pontos em dobro e concorra ao grande prêmio acumulado que já ultrapassa a marca de <strong className="text-slate-900 font-bold text-emerald-700">R$ 400,00</strong>!
        </div>
      </div>
      */}



      {/* Vencedores Section */}
      {winnersSettings?.active && winnersMatch && (
        <div className="bg-gradient-to-r from-yellow-500/10 via-amber-500/5 to-white border border-amber-300 rounded-3xl p-6 md:p-8 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-48 h-48 bg-yellow-400/10 rounded-full blur-[60px] pointer-events-none"></div>
          <div className="flex flex-col md:flex-row items-center justify-between gap-6 relative z-10">
            <div>
              <h2 className="text-2xl font-display font-black text-amber-600 flex items-center justify-center md:justify-start gap-2.5">
                <Medal className="h-7 w-7" />
                VENCEDORES: {winnersMatch.team1} <span className="text-slate-400 font-mono mx-1">{winnersMatch.result1}x{winnersMatch.result2}</span> {winnersMatch.team2}
              </h2>
              <p className="text-slate-600 text-sm mt-1.5 font-medium text-center md:text-left">
                Ganhadores da última rodada oficial e o prêmio que cada um levou!
              </p>
            </div>
          </div>
          
          <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {winnersData.length > 0 ? (
              winnersData.map((winner, idx) => (
                <div key={`${winner.id}-${idx}`} className="bg-white border border-amber-200 rounded-2xl p-4 flex items-center gap-4 hover:border-amber-400 transition-colors shadow-sm">
                  <div className="bg-amber-100 p-2.5 rounded-full text-amber-700">
                    <Trophy className="h-5 w-5" />
                  </div>
                  <div className="overflow-hidden">
                    <h4 className="font-bold text-slate-800 text-sm truncate">{winner.name}</h4>
                    <p className="text-amber-700 font-mono font-bold text-xs mt-0.5">Ganhou: R$ {winner.amount}</p>
                  </div>
                </div>
              ))
            ) : (
              <div className="col-span-full py-6 text-center text-slate-500 font-medium">Nenhum ganhador nesta partida. O prêmio acumulou!</div>
            )}
          </div>
        </div>
      )}


      {/* Sessão PIX PREMIADO */}
      {activePixDraws.length > 0 ? (
        <div className="bg-gradient-to-r from-slate-950 via-indigo-955 to-slate-950 text-white rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl relative overflow-hidden border border-indigo-500/30">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(99,102,241,0.12),transparent_50%)] pointer-events-none"></div>
          
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 relative z-10">
            <div>
              <h2 className="text-xl sm:text-2xl font-display font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-amber-200 to-yellow-400 flex items-center gap-2.5">
                <Sparkles className="w-6 h-6 text-yellow-400 animate-spin shrink-0" style={{ animationDuration: '8s' }} />
                <span>PIX PREMIADO ATIVO</span>
                <span className="bg-emerald-500 text-slate-950 text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider shadow-sm shrink-0 animate-pulse">Disponível</span>
              </h2>
              <p className="text-slate-300 text-xs sm:text-sm mt-1 font-medium">
                Escolha a quantidade de bilhetes desejada e concorra! O sorteio é realizado diretamente com base na extração oficial.
              </p>
            </div>
            <Link
              to="/panel"
              className="bg-indigo-650/30 hover:bg-indigo-650/50 text-indigo-200 font-bold text-xs px-4 py-2 rounded-xl border border-indigo-500/30 transition-all flex items-center gap-1.5 self-start sm:self-center"
            >
              <Trophy className="w-3.5 h-3.5 text-yellow-400" />
              <span>Meus Bilhetes</span>
            </Link>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 relative z-10">
            {activePixDraws.map(draw => {
              return (
                <div key={draw.id} className="lg:col-span-12 grid grid-cols-1 md:grid-cols-12 gap-6 bg-slate-950/60 p-6 rounded-2xl border border-indigo-500/20 shadow-inner">
                  
                  {/* Detalhes do Sorteio */}
                  <div className="md:col-span-4 lg:col-span-4 flex flex-col justify-between space-y-4">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="bg-indigo-900/60 text-indigo-200 font-bold text-[11px] px-3 py-1 rounded-md border border-indigo-700/30 uppercase tracking-wide">
                          {draw.type === 'Loteria Federal' ? '🎰 LOTERIA FEDERAL' : '🔮 MEGA-SENA'}
                        </span>
                        <span className="bg-yellow-400/10 text-yellow-300 font-bold text-[11px] px-3 py-1 rounded-md border border-yellow-400/20">
                          Preço: R$ 1,00/bilhete
                        </span>
                      </div>

                      <h3 className="text-lg sm:text-xl font-bold text-slate-100 flex items-center gap-2">
                        {draw.type === 'Loteria Federal' ? 'Extração da Loteria Federal' : 'Sorteio Especial Mega-Sena'}
                      </h3>

                      {draw.observations && (
                        <div className="bg-slate-900/80 border border-indigo-950/50 p-3 rounded-xl text-slate-300 text-xs sm:text-sm font-medium italic whitespace-pre-wrap">
                          <span className="text-yellow-400 font-bold not-italic block mb-1">Prêmio e Observações:</span>
                          {draw.observations}
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-800/60">
                      <div className="flex items-center gap-2 text-xs sm:text-sm text-slate-400">
                        <Calendar className="w-4.5 h-4.5 text-indigo-400 shrink-0" />
                        <div>
                          <span className="block text-[10px] text-slate-500 font-bold uppercase">Data do Sorteio</span>
                          <span className="font-semibold text-slate-200">
                            {draw.date ? draw.date.split('-').reverse().join('/') : '-'}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-xs sm:text-sm text-slate-400">
                        <Clock className="w-4.5 h-4.5 text-indigo-400 shrink-0" />
                        <div>
                          <span className="block text-[10px] text-slate-500 font-bold uppercase">Horário do Sorteio</span>
                          <span className="font-semibold text-slate-200">
                            {draw.time || '-'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Interface de Compra */}
                  <div className="md:col-span-8 lg:col-span-8 bg-gradient-to-br from-indigo-950/40 to-slate-950 p-5 rounded-xl border border-indigo-500/15 flex flex-col justify-between space-y-4">
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                          Escolha a Quantidade de Bilhetes
                        </label>
                        <span className="text-[10px] text-emerald-400 font-extrabold bg-emerald-950/60 border border-emerald-500/30 px-2.5 py-0.5 rounded-full">
                          Até 30% OFF
                        </span>
                      </div>

                      {/* Options Grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5">
                        {[
                          { count: 1, isPopular: false },
                          { count: 5, isPopular: false },
                          { count: 10, isPopular: false },
                          { count: 50, isPopular: true },
                          { count: 100, isPopular: false },
                        ].map((opt) => {
                          const pricing = calculatePixTicketPrice(opt.count);
                          const isSelected = parseInt(pixTicketCount) === opt.count;

                          return (
                            <button
                              key={opt.count}
                              type="button"
                              onClick={() => setPixTicketCount(String(opt.count))}
                              className={`relative p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                                isSelected
                                  ? 'bg-gradient-to-br from-yellow-400/20 via-amber-400/10 to-transparent border-yellow-400 text-white ring-2 ring-yellow-400/30 shadow-lg shadow-yellow-400/10 scale-[1.02]'
                                  : 'bg-slate-900/90 border-slate-800 hover:border-slate-700 text-slate-300 hover:bg-slate-850'
                              }`}
                            >
                              {opt.isPopular && (
                                <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-gradient-to-r from-amber-400 to-yellow-400 text-slate-950 font-black text-[8px] px-1.5 py-0.5 rounded-full uppercase tracking-wider shadow-md border border-yellow-300 whitespace-nowrap">
                                  ⭐ MAIS ESCOLHIDO
                                </span>
                              )}
                              
                              <div className="flex justify-between items-center w-full mt-0.5">
                                <span className="font-extrabold text-xs text-white">
                                  {opt.count} {opt.count === 1 ? 'Bilhete' : 'Bilhetes'}
                                </span>
                                {pricing.discountPercent > 0 && (
                                  <span className="bg-emerald-500/25 text-emerald-300 text-[10px] font-black px-1.5 py-0.2 rounded border border-emerald-500/40">
                                    -{pricing.discountPercent}%
                                  </span>
                                )}
                              </div>

                              <div className="mt-2.5 flex items-baseline gap-1.5">
                                <span className="font-mono font-black text-sm text-yellow-400">
                                  R$ {pricing.finalPrice.toFixed(2)}
                                </span>
                                {pricing.discountPercent > 0 && (
                                  <span className="font-mono text-[10px] text-slate-500 line-through">
                                    R$ {pricing.originalPrice.toFixed(2)}
                                  </span>
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>

                      {/* Custom Input */}
                      <div className="relative mt-2">
                        <input
                          type="number"
                          min="1"
                          max="1000"
                          value={pixTicketCount}
                          onChange={(e) => setPixTicketCount(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl py-2 pl-3 pr-10 text-xs font-semibold text-white placeholder-slate-500 font-mono outline-none"
                          placeholder="Outra quantidade personalizada..."
                        />
                        <span className="absolute right-3 top-2.5 text-xs font-bold text-slate-500">
                          un
                        </span>
                      </div>
                    </div>

                    <div className="space-y-3 pt-2">
                      {(() => {
                        const currentCount = parseInt(pixTicketCount) || 0;
                        const currentPricing = calculatePixTicketPrice(currentCount);

                        return (
                          <>
                            <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800 space-y-1">
                              <div className="flex justify-between items-center text-xs">
                                <span className="text-slate-400 font-bold uppercase">Total</span>
                                <span className="text-yellow-400 text-base font-black font-mono">
                                  R$ {currentPricing.finalPrice.toFixed(2)}
                                </span>
                              </div>
                              {currentPricing.discountPercent > 0 && (
                                <div className="flex justify-between items-center text-[11px] font-bold text-emerald-400 border-t border-slate-800 pt-1">
                                  <span>Desconto ({currentPricing.discountPercent}%):</span>
                                  <span>- R$ {(currentPricing.originalPrice - currentPricing.finalPrice).toFixed(2)}</span>
                                </div>
                              )}
                            </div>

                            <button
                              type="button"
                              onClick={handleBuyPixTickets}
                              disabled={isPurchasingPix || !currentCount}
                              className="w-full bg-gradient-to-r from-yellow-400 via-amber-300 to-yellow-400 hover:from-yellow-500 hover:to-yellow-500 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 font-black text-xs uppercase tracking-wider py-3.5 px-4 rounded-xl transition-all shadow-lg shadow-yellow-400/10 hover:shadow-yellow-400/20 active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer"
                            >
                              {isPurchasingPix ? (
                                <>
                                  <span className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></span>
                                  <span>Processando Compra...</span>
                                </>
                              ) : (
                                <>
                                  <CircleDollarSign className="w-4 h-4 shrink-0" />
                                  <span>COMPRAR BILHETES AGORA</span>
                                </>
                              )}
                            </button>

                            <p className="text-[10px] text-center text-slate-500">
                              * O valor será debitado do seu saldo.
                            </p>
                          </>
                        );
                      })()}
                    </div>

                  </div>

                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="bg-gradient-to-r from-slate-950 via-indigo-955 to-slate-950 text-white rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl relative overflow-hidden border border-indigo-500/30">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(99,102,241,0.12),transparent_50%)] pointer-events-none"></div>
          
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 relative z-10">
            <div>
              <h2 className="text-xl sm:text-2xl font-display font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-amber-200 to-yellow-400 flex items-center gap-2.5">
                <Sparkles className="w-6 h-6 text-yellow-400 animate-spin shrink-0 animate-pulse" />
                <span>PIX PREMIADO</span>
                <span className="bg-amber-400 text-slate-950 text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider shadow-sm shrink-0">Breve</span>
              </h2>
              <p className="text-slate-300 text-xs sm:text-sm mt-1 font-medium leading-relaxed">
                Prepare-se para o PIX PREMIADO! Compre bilhetes e concorra a prêmios incríveis baseados nas extrações oficiais. Fique atento ao lançamento de novos sorteios!
              </p>
            </div>
            <Link
              to="/panel"
              className="bg-indigo-650/30 hover:bg-indigo-650/50 text-indigo-200 font-bold text-xs px-5 py-2.5 rounded-xl border border-indigo-500/30 transition-all flex items-center gap-1.5 self-start sm:self-center whitespace-nowrap"
            >
              <Trophy className="w-3.5 h-3.5 text-yellow-400" />
              <span>Meus Bilhetes</span>
            </Link>
          </div>
        </div>
      )}

      {matches.length === 0 ? (
        <div className="text-center bg-white p-12 rounded-3xl shadow-md border border-slate-200 flex flex-col items-center">
          <div className="bg-slate-50 p-4 rounded-full mb-4 border border-slate-100">
            <CalendarClock className="h-8 w-8 text-slate-400" />
          </div>
          <h2 className="text-lg font-bold text-slate-800">Nenhum jogo cadastrado ainda</h2>
          <p className="text-slate-500 text-sm mt-1">Volte mais tarde para conferir os próximos jogos.</p>
        </div>
      ) : (
        <div className="space-y-12">
          {/* Jogos Ao Vivo / Em Andamento */}
          {liveMatches.length > 0 && (
            <div className="bg-gradient-to-r from-red-55/40 via-white to-red-55/40 border-2 border-red-500/80 rounded-3xl p-6 sm:p-8 space-y-6 shadow-md shadow-red-500/5 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-48 h-48 bg-red-400/5 rounded-full blur-[60px] pointer-events-none"></div>
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 relative z-10">
                <div>
                  <h2 className="text-2xl font-display font-black text-red-650 flex items-center gap-2.5">
                    <span className="relative flex h-4.5 w-4.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-450 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-4.5 w-4.5 bg-red-650"></span>
                    </span>
                    <Radio className="h-6 w-6 text-red-600 shrink-0" />
                    PARTIDAS AO VIVO / EM ANDAMENTO
                  </h2>
                  <p className="text-slate-500 text-sm mt-1 font-medium">
                    Veja os placares em andamento e acompanhe a lista de palpites válidos! (Apostas encerradas)
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 relative z-10">
                {liveMatches.map(match => {
                  const date = new Date(match.date);
                  const isPromo = match.isPromotional;

                  const { l1, l2, elapsed } = getLiveMatchStats(match);
                  
                  // Calculate bets stats
                  const matchBets = bets.filter(b => b.matchId === match.id && b.status === 'confirmed');
                  const totalBets = matchBets.length;
                  const eligibleBets = matchBets.filter(b => {
                    const p1 = parseInt(b.predicted1, 10);
                    const p2 = parseInt(b.predicted2, 10);
                    return !isNaN(p1) && !isNaN(p2) && p1 >= l1 && p2 >= l2;
                  }).length;

                  return (
                    <Link
                      key={match.id}
                      to={`/match/${match.id}`}
                      className="group bg-white rounded-3xl border-2 border-red-500/60 overflow-hidden hover:border-red-600 hover:shadow-lg transition-all flex flex-col relative transform hover:-translate-y-1"
                    >
                      {/* Live Badge */}
                      <div className="absolute top-0 right-0 bg-red-650 text-white font-mono text-[9px] font-black px-3.5 py-1.5 rounded-bl-xl uppercase tracking-widest relative z-20 shadow-sm flex items-center gap-1 animate-pulse">
                        <span className="h-1.5 w-1.5 rounded-full bg-white inline-block"></span>
                        {elapsed || 'AO VIVO'}
                      </div>

                      <div className="bg-red-50/50 px-5 py-3.5 border-b border-red-100 flex items-center justify-between text-sm relative z-10 pr-24">
                        <span className="text-red-700 font-extrabold text-xs flex items-center gap-1.5">
                          {isPromo ? '🌟 Jogo Promocional' : '⚽ Jogo Oficial'}
                        </span>
                      </div>

                      <div className="p-8 flex-1 flex flex-col justify-center relative z-10">
                        <div className="flex items-center justify-between">
                          {/* Team 1 */}
                          <div className="flex flex-col items-center space-y-3 w-1/3">
                            {match.flag1?.startsWith('http') || match.flag1?.startsWith('data:') ? (
                              <div className="relative">
                                <div className="absolute inset-0 bg-slate-200 rounded-md blur"></div>
                                <img src={match.flag1} alt={match.team1} className="w-16 h-11 object-cover rounded-md shadow-md border border-slate-100 relative z-10" />
                              </div>
                            ) : (
                              <span className="text-5xl drop-shadow-md" title={match.team1}>{match.flag1}</span>
                            )}
                            <span className="font-extrabold text-slate-800 text-center text-sm truncate w-full">{match.team1}</span>
                          </div>

                          {/* Live Score Display */}
                          <div className="w-1/3 flex flex-col items-center justify-center">
                            <span className="text-[9px] text-red-500 font-black uppercase tracking-wider mb-2">PLACAR</span>
                            <div className="bg-red-600 text-white px-4.5 py-2 rounded-xl font-display text-2xl font-black flex space-x-2.5 shadow-md shadow-red-500/20">
                              <span>{l1}</span>
                              <span className="text-red-305 opacity-85 animate-pulse">:</span>
                              <span>{l2}</span>
                            </div>
                          </div>

                          {/* Team 2 */}
                          <div className="flex flex-col items-center space-y-3 w-1/3">
                            {match.flag2?.startsWith('http') || match.flag2?.startsWith('data:') ? (
                              <div className="relative">
                                <div className="absolute inset-0 bg-slate-200 rounded-md blur"></div>
                                <img src={match.flag2} alt={match.team2} className="w-16 h-11 object-cover rounded-md shadow-md border border-slate-100 relative z-10" />
                              </div>
                            ) : (
                              <span className="text-5xl drop-shadow-md" title={match.team2}>{match.flag2}</span>
                            )}
                            <span className="font-extrabold text-slate-800 text-center text-sm truncate w-full">{match.team2}</span>
                          </div>
                        </div>
                      </div>

                      <div className="bg-red-55/10 px-5 py-4 border-t border-red-100/50 flex justify-between items-center transition relative z-10">
                        <div className="text-xs flex flex-col text-slate-400 space-y-1.5">
                          <span className="font-semibold">{date.toLocaleDateString('pt-BR', { timeZone: 'America/Manaus' })} {date.toLocaleTimeString('pt-BR', { timeZone: 'America/Manaus', hour: '2-digit', minute: '2-digit' })} <span className="text-slate-300 mx-1">•</span> {match.phase || 'GRUPOS'}</span>
                          <span className="font-bold text-slate-650 bg-white border border-slate-200 shadow-sm px-2 py-1 rounded-md inline-flex items-center w-max">
                            {totalBets} palpites <span className="mx-1.5 text-slate-300">|</span> <span className="text-emerald-700 font-extrabold">{eligibleBets} aptos a vencer</span>
                          </span>
                        </div>
                        <div className="text-xs font-bold text-red-650 flex items-center gap-0.5 bg-red-50 border border-red-100 px-2.5 py-1.5 rounded-xl group-hover:bg-red-600 group-hover:text-white transition">
                          Acompanhar <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {/* Sessão de Jogos Promocionais em Destaque (Urgentes - < 3h de expiração) */}
          {urgentPromotionalMatches.length > 0 && (
            <div className="bg-indigo-50/40 border border-indigo-200 rounded-3xl p-6 sm:p-8 space-y-6">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                <div>
                  <h2 className="text-xl font-display font-bold text-red-600 flex items-center gap-2">
                    <span className="relative flex h-3.5 w-3.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-red-600"></span>
                    </span>
                    🚨 DESTAQUE: ÚLTIMAS HORAS PARA PALPITAR!
                  </h2>
                  <p className="text-slate-500 text-sm mt-1">
                    Estes jogos promocionais se encerram em menos de 3 horas! Faça já seus palpites por apenas R$ 2,00.
                  </p>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {urgentPromotionalMatches.map(match => {
                  const date = new Date(match.date);
                  const isFinished = match.status === 'finished';
                  const isOpen = match.status === 'open' && (date.getTime() - Date.now() >= 30 * 60 * 1000);

                  return (
                    <Link 
                      key={match.id} 
                      to={`/match/${match.id}`}
                      className="group bg-gradient-to-b from-indigo-100/50 via-white to-white rounded-3xl border-2 border-red-500/70 overflow-hidden hover:border-indigo-500 hover:shadow-lg transition-all flex flex-col relative transform hover:-translate-y-1"
                    >
                      <div className="absolute top-0 right-0 bg-red-600 text-white font-mono text-[9px] font-bold px-3 py-1 rounded-bl-xl uppercase tracking-wider relative z-20 shadow-sm animate-pulse">
                        Última Chance
                      </div>
                      
                      <div className="bg-indigo-50/80 px-5 py-3 border-b border-indigo-100 flex justify-between items-center text-sm relative z-10">
                        <div className="flex flex-col items-start pr-14">
                          <span className="text-indigo-600/80 font-bold tracking-wide text-xs">
                            {date.toLocaleDateString('pt-BR', { timeZone: 'America/Manaus' })} às {date.toLocaleTimeString('pt-BR', { timeZone: 'America/Manaus', hour: '2-digit', minute: '2-digit' })} <span className="text-indigo-300 mx-1">•</span> {match.phase || 'GRUPOS'}
                          </span>
                          <MatchCountdown matchDate={match.date} isOpen={isOpen} />
                        </div>
                      </div>
                      
                      <div className="p-8 flex-1 flex flex-col justify-center relative z-10">
                        <div className="flex items-center justify-between">
                          <div className="flex flex-col items-center space-y-3 w-1/3">
                            {match.flag1?.startsWith('http') || match.flag1?.startsWith('data:') ? (
                              <div className="relative">
                                 <div className="absolute inset-0 bg-slate-200 rounded-md blur"></div>
                                 <img src={match.flag1} alt={match.team1} className="w-16 h-11 object-cover rounded-md shadow-md border border-slate-100 relative z-10" />
                              </div>
                             ) : (
                              <span className="text-5xl drop-shadow-md" title={match.team1}>{match.flag1}</span>
                            )}
                            <span className="font-bold text-slate-800 text-center text-sm">{match.team1}</span>
                          </div>
                          
                          <div className="w-1/3 flex flex-col items-center justify-center">
                            <span className="text-red-500 font-extrabold text-sm tracking-widest uppercase animate-pulse">VS</span>
                          </div>

                          <div className="flex flex-col items-center space-y-3 w-1/3">
                            {match.flag2?.startsWith('http') || match.flag2?.startsWith('data:') ? (
                               <div className="relative">
                                  <div className="absolute inset-0 bg-slate-200 rounded-md blur"></div>
                                  <img src={match.flag2} alt={match.team2} className="w-16 h-11 object-cover rounded-md shadow-md border border-slate-100 relative z-10" />
                               </div>
                             ) : (
                              <span className="text-5xl drop-shadow-md" title={match.team2}>{match.flag2}</span>
                            )}
                            <span className="font-bold text-slate-800 text-center text-sm">{match.team2}</span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="bg-red-50/30 px-5 py-4 border-t border-red-100/50 flex justify-end items-center transition relative z-10">
                        <div className="text-sm flex flex-col items-end">
                          <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-0.5">Custo Aposta</span>
                          <span className="font-bold text-red-600 font-mono text-base">
                            R$ 2.00
                          </span>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {/* Seção Destaque MINUTO CERTO - OCULTADA */}
          {false && (
            <div className="bg-gradient-to-br from-amber-500/10 via-amber-50/20 to-white border border-amber-300/80 rounded-3xl p-6 sm:p-8 shadow-sm relative overflow-hidden text-left">
              <div className="absolute top-0 right-0 w-32 h-32 bg-amber-400/15 rounded-full blur-[50px] pointer-events-none animate-pulse"></div>
              
              <div className="flex flex-col xl:flex-row items-stretch justify-between gap-8 relative z-10">
                <div className="space-y-4 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="bg-amber-100 text-amber-800 border border-amber-200 text-[10px] px-2.5 py-1 rounded-full font-black uppercase tracking-wider flex items-center gap-1.5 shadow-xs">
                      <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      Novidade Imperdível
                    </span>
                    <span className="bg-indigo-50 text-indigo-700 border border-indigo-100 text-[10px] px-2.5 py-1 rounded-full font-black uppercase tracking-wider shadow-xs font-mono">
                      Bilhete: R$ 2,00
                    </span>
                    <span className="bg-emerald-50 text-emerald-700 border border-emerald-100 text-[10px] px-2.5 py-1 rounded-full font-black uppercase tracking-wider shadow-xs">
                      Prêmio: R$ 100,00 Fixo
                    </span>
                  </div>
                  
                  <h3 className="text-2xl sm:text-3xl font-display font-black text-amber-850 tracking-tight">
                    MINUTO CERTO ⚽⏱️
                  </h3>

                  <div className="text-slate-605 text-sm leading-relaxed space-y-4">
                    <p className="text-slate-800 text-base sm:text-lg font-bold leading-snug">
                      Participe do <span className="text-amber-700 font-black">Minuto Certo</span> por apenas <span className="text-amber-700 font-black">R$ 2,00</span> por bilhete! Se o <span className="text-amber-700 font-black">1º GOL</span> do jogo sair no seu minuto, você leva o prêmio de <span className="text-emerald-700 font-black">R$ 100,00 sozinho</span>!
                    </p>
                    
                    <p className="text-slate-600 text-sm">
                      Nessa modalidade especial, o prêmio terá um <strong className="text-slate-800">vencedor único</strong> e <strong className="text-slate-800">não será dividido</strong> de forma alguma. <strong>Aposta válida para o 1º gol oficial da partida</strong> (caso o minuto do 1º gol esteja vazio, passa para os gols seguintes). Adquira seus bilhetes aleatórios para aumentar suas chances!
                    </p>

                    <p className="text-xs text-slate-500 flex items-center gap-2 pt-2 border-t border-slate-100">
                      <AlertCircle className="w-4 h-4 text-indigo-500 shrink-0" />
                      <span>
                        Usamos a <strong>transmissão oficial e o painel de busca do Google</strong> como referência de minutagem oficial do gol.
                      </span>
                    </p>
                  </div>
                </div>

                {/* Lado Direito: Exemplo de Imagem e Botão */}
                <div className="flex flex-col justify-between items-center xl:w-[320px] shrink-0 bg-white/65 border border-slate-200/60 p-4 rounded-2xl gap-4">
                  <div className="w-full text-center space-y-2">
                    <span className="text-[9px] uppercase tracking-wider font-extrabold text-slate-400 block">Exemplo de Apuração (Google)</span>
                    <div className="bg-slate-50 border border-slate-200/60 p-2 rounded-lg flex justify-center">
                      <img 
                        src={googleScoreboardImg} 
                        alt="Painel Google Scoreboard Exemplo" 
                        className="max-w-full h-auto max-h-[85px] object-contain rounded"
                        referrerPolicy="no-referrer"
                        loading="lazy"
                      />
                    </div>
                    <span className="text-[10px] text-slate-500 font-bold block leading-tight">
                      Schjelderup 36&apos; (Minuto 36) <br /> Bellingham 45+2&apos; (Minuto 45+2)
                    </span>
                  </div>

                  <div className="w-full space-y-2">
                    <button
                      onClick={handleConvertClick}
                      disabled={isConverting}
                      className="bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50 text-white font-black text-xs uppercase tracking-wider py-3.5 px-3 rounded-xl transition-all shadow-md hover:shadow-lg active:scale-95 flex flex-col items-center justify-center gap-1 border border-emerald-400/30 cursor-pointer w-full text-center group"
                    >
                      <span className="flex items-center gap-1.5 justify-center">
                        <Sparkles className="w-4 h-4 text-yellow-300 animate-pulse shrink-0 group-hover:rotate-12 transition-transform" />
                        <span>{isConverting ? "Convertendo..." : "CONVERTA SEU SALDO em MINUTOS"}</span>
                      </span>
                      <span className="text-[10px] text-emerald-100 font-extrabold normal-case tracking-normal">
                        Promoção: Ganhe +2 Bilhetes Gratuitos! 🎁
                      </span>
                    </button>

                    <Link
                      to="/minuto-certo"
                      className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs uppercase tracking-wider py-3 rounded-xl transition-all shadow-md shadow-amber-500/10 hover:shadow-lg active:scale-95 flex items-center gap-1.5 border border-amber-400 justify-center text-center w-full"
                    >
                      <span>Adquirir Meu Minuto</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </Link>

                    <Link
                      to="/regulamento"
                      className="text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors flex items-center gap-1 justify-center w-full"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>Ver regulamento completo</span>
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          )}



          {officialMatches.length > 0 && (
            <div>
              <h2 className="text-xl font-display font-bold text-slate-800 mb-6 flex items-center justify-between border-b border-slate-200 pb-3">
                <span>Jogos Oficiais</span>
                <Link to="/matches" className="text-sm font-sans font-bold text-emerald-600 hover:text-emerald-700 transition">Ver todos</Link>
              </h2>

              {/* Informação Importante sobre Encerramento e PDF - OCULTADO
              <div className="bg-gradient-to-r from-emerald-500/10 via-emerald-600/5 to-white border border-emerald-500/30 rounded-3xl p-5 mb-6 flex flex-col md:flex-row items-start md:items-center gap-4 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none"></div>
                <div className="bg-emerald-100 border border-emerald-300 p-3 rounded-2xl shrink-0 flex items-center justify-center">
                  <AlertCircle className="h-6 w-6 text-emerald-700 animate-pulse" />
                </div>
                <div className="flex-1">
                  <h4 className="text-sm font-bold text-emerald-900 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                    📢 INFORMAÇÃO IMPORTANTE & TRANSPARÊNCIA
                  </h4>
                  <p className="text-slate-650 text-xs sm:text-sm leading-relaxed font-medium">
                    As apostas se encerram pontualmente às <strong className="text-emerald-800 font-extrabold">17h30</strong>. Logo após o encerramento, estará disponível para download o <strong className="text-slate-800 font-bold">arquivo PDF com todas as apostas registradas</strong>, garantindo total lisura, transparência e segurança de todos os participantes do nosso Bolão!
                  </p>
                </div>
              </div>
              */}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {officialMatches.map(match => {
                  const date = new Date(match.date);
                  const isFinished = match.status === 'finished';
                  const isOpen = match.status === 'open' && (date.getTime() - Date.now() >= 30 * 60 * 1000);

                  return (
                    <Link 
                      key={match.id} 
                      to={`/match/${match.id}`}
                      className="group bg-white rounded-3xl border border-slate-200 overflow-hidden hover:border-emerald-600 transition-all flex flex-col relative shadow-sm hover:shadow-md transform hover:-translate-y-1"
                    >
                      {/* Glow effect on hover */}
                      <div className="absolute inset-0 bg-gradient-to-b from-emerald-500/0 via-emerald-500/0 to-yellow-500/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                      
                      <div className="bg-slate-50/80 px-5 py-3 border-b border-slate-100 flex justify-between items-center text-sm relative z-10">
                        <div className="flex flex-col items-start">
                          <span className="text-slate-500 font-semibold tracking-wide text-xs">
                            {date.toLocaleDateString('pt-BR', { timeZone: 'America/Manaus' })} às {date.toLocaleTimeString('pt-BR', { timeZone: 'America/Manaus', hour: '2-digit', minute: '2-digit' })} <span className="text-slate-300 mx-1">•</span> {match.phase || 'GRUPOS'}
                          </span>
                          <MatchCountdown matchDate={match.date} isOpen={isOpen} />
                        </div>
                        
                        {isOpen ? (
                          <span className="bg-emerald-50 text-emerald-700 font-bold px-2.5 py-1 rounded-md text-xs border border-emerald-100 flex items-center">Aberto</span>
                        ) : isFinished ? (
                          <span className="bg-blue-50 text-blue-700 font-bold px-2.5 py-1 rounded-md text-xs flex items-center border border-blue-100">
                            <CheckCircle2 className="h-3 w-3 mr-1.5" /> Finalizado
                          </span>
                        ) : (
                          <span className="bg-amber-50 text-amber-700 font-bold px-2.5 py-1 rounded-md text-xs flex items-center border border-amber-100">
                            <Lock className="h-3 w-3 mr-1.5" /> Fechado
                          </span>
                        )}
                      </div>
                      
                      <div className="p-8 flex-1 flex flex-col justify-center relative z-10">
                        <div className="flex items-center justify-between">
                          <div className="flex flex-col items-center space-y-3 w-1/3">
                            {match.flag1?.startsWith('http') || match.flag1?.startsWith('data:') ? (
                              <div className="relative">
                                 <div className="absolute inset-0 bg-slate-200 rounded-md blur"></div>
                                 <img src={match.flag1} alt={match.team1} className="w-16 h-11 object-cover rounded-md shadow-md border border-slate-100 relative z-10" />
                              </div>
                             ) : (
                              <span className="text-5xl drop-shadow-md" title={match.team1}>{match.flag1}</span>
                            )}
                            <span className="font-bold text-slate-800 text-center text-sm">{match.team1}</span>
                          </div>
                          
                          <div className="w-1/3 flex flex-col items-center justify-center">
                            {isFinished ? (
                              <div className="bg-slate-100 border border-slate-200 text-slate-800 px-5 py-2.5 rounded-xl font-display text-2xl font-bold flex space-x-2 shadow-inner">
                                <span>{match.result1}</span>
                                <span className="text-slate-400">-</span>
                                <span>{match.result2}</span>
                              </div>
                            ) : (
                              <span className="text-slate-400 font-bold text-sm tracking-widest uppercase">VS</span>
                            )}
                          </div>

                          <div className="flex flex-col items-center space-y-3 w-1/3">
                            {match.flag2?.startsWith('http') || match.flag2?.startsWith('data:') ? (
                               <div className="relative">
                                  <div className="absolute inset-0 bg-slate-200 rounded-md blur"></div>
                                  <img src={match.flag2} alt={match.team2} className="w-16 h-11 object-cover rounded-md shadow-md border border-slate-100 relative z-10" />
                               </div>
                             ) : (
                              <span className="text-5xl drop-shadow-md" title={match.team2}>{match.flag2}</span>
                            )}
                            <span className="font-bold text-slate-800 text-center text-sm">{match.team2}</span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="bg-slate-50/80 px-5 py-4 border-t border-slate-100 flex justify-between items-center transition relative z-10">
                        <div className="text-sm flex flex-col">
                          <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-0.5">Prêmio Acumulado</span>
                          <span className="font-bold text-emerald-600 font-mono text-base">
                            R$ {(match.poolTotal * 0.9).toFixed(2)}
                          </span>
                        </div>
                        
                        {!isOpen || isBrasilHaitiMatch(match) ? (
                          <div className="flex flex-col items-end gap-1.5">
                            {isFrancaEspanhaMatch(match) && (
                              <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                                PALPITES PENDENTES APROVADOS AS 14:51. 19 palpites
                              </span>
                            )}
                            <button
                              onClick={async (e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                if (printingPdfId) return;

                                const { allowed, remainingText } = checkPdfAvailability(match);
                                if (!allowed) {
                                  showToast(`O PDF de apostas estará disponível 15 minutos após o encerramento das apostas (faltam ${remainingText}).`, 'warning');
                                  return;
                                }

                                setPrintingPdfId(match.id);
                                await generateMatchBetsPDF(match);
                                setPrintingPdfId(null);
                              }}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-2 rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-sm cursor-pointer border border-emerald-500/10 hover:scale-[1.03] active:scale-95 disabled:opacity-50"
                              title="Baixar PDF com todos os palpites para transparência"
                              disabled={printingPdfId !== null}
                            >
                              <Download className={`h-3.5 w-3.5 ${printingPdfId === match.id ? 'animate-bounce' : ''}`} />
                              <span>{printingPdfId === match.id ? 'Gerando...' : 'Palpites PDF'}</span>
                            </button>
                          </div>
                        ) : (
                          <div className="bg-slate-100 p-2 rounded-xl group-hover:bg-yellow-400/25 transition-colors border border-slate-200 group-hover:border-yellow-300">
                            <ChevronRight className="h-5 w-5 text-slate-500 group-hover:text-amber-800 transition-colors" />
                          </div>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {normalPromotionalMatches.length > 0 && (
            <div>
              <h2 className="text-xl font-display font-bold text-indigo-800 mb-2 flex items-center gap-2">
                🌟 Jogos Promocionais
              </h2>
              <p className="text-slate-500 text-sm mb-6 border-b border-indigo-100 pb-4">Estas partidas valem somente para pontuação na classificação geral. O palpite custa R$ 2,00.</p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {normalPromotionalMatches.map(match => {
                  const date = new Date(match.date);
                  const isFinished = match.status === 'finished';
                  const isOpen = match.status === 'open' && (date.getTime() - Date.now() >= 30 * 60 * 1000);

                  return (
                    <Link 
                      key={match.id} 
                      to={`/match/${match.id}`}
                      className="group bg-gradient-to-b from-indigo-50/50 to-white rounded-3xl border border-indigo-200 overflow-hidden hover:border-indigo-500 transition-all flex flex-col relative shadow-sm hover:shadow-md transform hover:-translate-y-1"
                    >
                      <div className="bg-indigo-100/50 px-5 py-3 border-b border-indigo-100 flex justify-between items-center text-sm relative z-10">
                        <div className="flex flex-col items-start">
                          <span className="text-indigo-600/80 font-semibold tracking-wide text-xs">
                            {date.toLocaleDateString('pt-BR', { timeZone: 'America/Manaus' })} às {date.toLocaleTimeString('pt-BR', { timeZone: 'America/Manaus', hour: '2-digit', minute: '2-digit' })} <span className="text-indigo-300 mx-1">•</span> {match.phase || 'GRUPOS'}
                          </span>
                          <MatchCountdown matchDate={match.date} isOpen={isOpen} />
                        </div>
                        
                        {isOpen ? (
                          <span className="bg-indigo-500 text-white font-bold px-2.5 py-1 rounded-md text-xs shadow-sm flex items-center">Aberto</span>
                        ) : isFinished ? (
                          <span className="bg-blue-50 text-blue-700 font-bold px-2.5 py-1 rounded-md text-xs flex items-center border border-blue-100">
                            <CheckCircle2 className="h-3 w-3 mr-1.5" /> Finalizado
                          </span>
                        ) : (
                          <span className="bg-amber-50 text-amber-700 font-bold px-2.5 py-1 rounded-md text-xs flex items-center border border-amber-100">
                            <Lock className="h-3 w-3 mr-1.5" /> Fechado
                          </span>
                        )}
                      </div>
                      
                      <div className="p-8 flex-1 flex flex-col justify-center relative z-10">
                        <div className="flex items-center justify-between">
                          <div className="flex flex-col items-center space-y-3 w-1/3">
                            {match.flag1?.startsWith('http') || match.flag1?.startsWith('data:') ? (
                              <div className="relative">
                                 <div className="absolute inset-0 bg-slate-200 rounded-md blur"></div>
                                 <img src={match.flag1} alt={match.team1} className="w-16 h-11 object-cover rounded-md shadow-md border border-slate-100 relative z-10" />
                              </div>
                             ) : (
                              <span className="text-5xl drop-shadow-md" title={match.team1}>{match.flag1}</span>
                            )}
                            <span className="font-bold text-slate-800 text-center text-sm">{match.team1}</span>
                          </div>
                          
                          <div className="w-1/3 flex flex-col items-center justify-center">
                            {isFinished ? (
                              <div className="bg-indigo-100 border border-indigo-200 text-indigo-900 px-5 py-2.5 rounded-xl font-display text-2xl font-bold flex space-x-2 shadow-inner">
                                <span>{match.result1}</span>
                                <span className="text-indigo-400">-</span>
                                <span>{match.result2}</span>
                              </div>
                            ) : (
                              <span className="text-slate-400 font-bold text-sm tracking-widest uppercase">VS</span>
                            )}
                          </div>

                          <div className="flex flex-col items-center space-y-3 w-1/3">
                            {match.flag2?.startsWith('http') || match.flag2?.startsWith('data:') ? (
                               <div className="relative">
                                  <div className="absolute inset-0 bg-slate-200 rounded-md blur"></div>
                                  <img src={match.flag2} alt={match.team2} className="w-16 h-11 object-cover rounded-md shadow-md border border-slate-100 relative z-10" />
                               </div>
                             ) : (
                              <span className="text-5xl drop-shadow-md" title={match.team2}>{match.flag2}</span>
                            )}
                            <span className="font-bold text-slate-800 text-center text-sm">{match.team2}</span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="bg-indigo-50/80 px-5 py-4 border-t border-indigo-100 flex justify-between items-center transition relative z-10">
                        <div className="text-sm flex flex-col">
                          <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-0.5">Custo Aposta</span>
                          <span className="font-bold text-indigo-700 font-mono text-base">
                            R$ 2.00
                          </span>
                        </div>
                        
                        {!isOpen || isBrasilHaitiMatch(match) ? (
                          <div className="flex flex-col items-end gap-1.5">
                            {isFrancaEspanhaMatch(match) && (
                              <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                                PALPITES PENDENTES APROVADOS AS 14:51. 19 palpites
                              </span>
                            )}
                            <button
                              onClick={async (e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                if (printingPdfId) return;

                                const { allowed, remainingText } = checkPdfAvailability(match);
                                if (!allowed) {
                                  showToast(`O PDF de apostas estará disponível 15 minutos após o encerramento das apostas (faltam ${remainingText}).`, 'warning');
                                  return;
                                }

                                setPrintingPdfId(match.id);
                                await generateMatchBetsPDF(match);
                                setPrintingPdfId(null);
                              }}
                              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-3 py-2 rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-sm cursor-pointer border border-indigo-500/10 hover:scale-[1.03] active:scale-95 disabled:opacity-50"
                              title="Baixar PDF com todos os palpites para transparência"
                              disabled={printingPdfId !== null}
                            >
                              <Download className={`h-3.5 w-3.5 ${printingPdfId === match.id ? 'animate-bounce' : ''}`} />
                              <span>{printingPdfId === match.id ? 'Gerando...' : 'Palpites PDF'}</span>
                            </button>
                          </div>
                        ) : (
                          <div className="bg-slate-100 p-2 rounded-xl group-hover:bg-indigo-100 transition-colors border border-slate-200">
                            <ChevronRight className="h-5 w-5 text-indigo-500 transition-colors" />
                          </div>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal Promocional Minuto Certo */}
      <AnimatePresence>
        {showMinutoPromo && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md">
            {/* Click outside to close */}
            <div className="absolute inset-0" onClick={closePromo} />
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 15 }}
              transition={{ type: "spring", duration: 0.5, bounce: 0.3 }}
              className="relative w-full max-w-sm bg-slate-950 rounded-3xl overflow-hidden shadow-2xl border border-slate-800/80 flex flex-col gap-4 p-5 z-10"
            >
              {/* Header / Close */}
              <div className="flex items-center justify-between border-b border-slate-800/60 pb-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
                  <h3 className="text-xs font-black text-amber-400 uppercase tracking-widest">Aviso Especial!</h3>
                </div>
                <button
                  onClick={closePromo}
                  className="p-1.5 rounded-full bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white transition-all cursor-pointer border border-slate-800/50 flex items-center justify-center"
                  aria-label="Fechar"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Poster / Image Link */}
              <Link 
                to="/minuto-certo" 
                onClick={closePromo}
                className="relative aspect-[3/4] w-full rounded-2xl overflow-hidden border border-slate-800 shadow-lg group hover:border-amber-500/50 transition-all duration-300 block"
              >
                <img 
                  src={minutoCertoPosterImg} 
                  alt="Minuto Certo PIXCOXIM" 
                  referrerPolicy="no-referrer"
                  loading="lazy"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent opacity-45 group-hover:opacity-20 transition-opacity" />
                
                {/* Badge Overlay */}
                <div className="absolute bottom-3 left-3 bg-amber-500 text-slate-950 font-black px-3 py-1.5 rounded-xl text-[9px] uppercase tracking-wider shadow-md">
                  Clique para comprar
                </div>
              </Link>

              {/* CTA Button */}
              <Link
                to="/minuto-certo"
                onClick={closePromo}
                className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 active:scale-95 text-slate-950 font-black py-3 px-6 rounded-2xl text-center uppercase tracking-wider text-xs transition-all shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 cursor-pointer border border-amber-400/20"
              >
                <Trophy className="h-3.5 w-3.5" />
                <span>Adquirir Bilhetes</span>
              </Link>
            </motion.div>
          </div>
        )}

        {showConvertConfirm && convertSummary && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md">
            {/* Click outside to close */}
            <div className="absolute inset-0" onClick={() => setShowConvertConfirm(false)} />
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="relative w-full max-w-md bg-slate-900 text-slate-100 rounded-3xl overflow-hidden shadow-2xl border border-slate-800 flex flex-col gap-5 p-6 z-10"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-yellow-400 animate-pulse" />
                  <h3 className="text-sm font-black text-emerald-400 uppercase tracking-wider">Confirmar Conversão de Saldo</h3>
                </div>
                <button
                  onClick={() => setShowConvertConfirm(false)}
                  className="p-1.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Summary Body */}
              <div className="space-y-4">
                <p className="text-xs text-slate-350 leading-relaxed">
                  Você está prestes a converter seu saldo disponível em bilhetes do sorteio <strong className="text-slate-100">{convertSummary.targetDrawName}</strong> e receber os bilhetes gratuitos promocionais.
                </p>

                <div className="bg-slate-950/65 rounded-2xl p-4 border border-slate-800/80 space-y-3 font-medium text-xs">
                  <div className="flex justify-between items-center text-slate-400">
                    <span>Seu Saldo Atual:</span>
                    <span className="font-mono font-bold text-slate-100">R$ {convertSummary.currentBalance.toFixed(2)}</span>
                  </div>
                  
                  <div className="flex justify-between items-center text-slate-400 border-t border-slate-800/55 pt-2.5">
                    <span>Bilhetes Convertidos (R$ 2,00 cada):</span>
                    <span className="font-mono font-bold text-slate-100">+{convertSummary.paidQty} un</span>
                  </div>

                  <div className="flex justify-between items-center text-emerald-400 bg-emerald-950/20 px-2 py-1.5 rounded-lg border border-emerald-900/30">
                    <span className="font-bold flex items-center gap-1">🎁 Promoção Bilhetes Grátis:</span>
                    <span className="font-mono font-black">+{convertSummary.freeQty} un</span>
                  </div>

                  <div className="flex justify-between items-center text-slate-300 font-bold border-t border-slate-800/55 pt-2.5">
                    <span>Total de Bilhetes que Receberá:</span>
                    <span className="font-mono text-sm font-black text-amber-400">{convertSummary.totalQty} Bilhetes</span>
                  </div>

                  <div className="flex justify-between items-center text-slate-400">
                    <span>Custo Total da Conversão:</span>
                    <span className="font-mono font-bold text-red-400">R$ {convertSummary.totalCost.toFixed(2)}</span>
                  </div>

                  <div className="flex justify-between items-center text-slate-300 font-bold border-t border-slate-800 pt-2.5">
                    <span>Saldo Restante Estimado:</span>
                    <span className="font-mono text-emerald-400">R$ {convertSummary.remainingBalance.toFixed(2)}</span>
                  </div>
                </div>

                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 flex gap-2.5 items-start">
                  <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-amber-200/90 leading-normal">
                    <strong>Atenção:</strong> Os minutos/bilhetes correspondentes serão escolhidos aleatoriamente de forma automática entre os números disponíveis no sorteio. Esta ação não poderá ser desfeita.
                  </p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 justify-end mt-2">
                <button
                  onClick={() => setShowConvertConfirm(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-700 bg-transparent hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleConvertBalanceToMinutes}
                  disabled={isConverting}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase tracking-wider transition-colors shadow-md hover:shadow-lg disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                >
                  {isConverting ? "Convertendo..." : "Confirmar Conversão"}
                </button>
              </div>
            </motion.div>
          </div>
        )}



        {showPixBoughtModal && recentBoughtTickets.length > 0 && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/90 backdrop-blur-md">
            <div className="absolute inset-0" onClick={() => setShowPixBoughtModal(false)} />
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-lg bg-slate-950 text-white rounded-3xl overflow-hidden shadow-2xl border border-indigo-500/30 flex flex-col gap-6 p-6 sm:p-8 z-10 text-center"
            >
              <div className="mx-auto bg-gradient-to-tr from-yellow-400 to-amber-500 p-4 rounded-full shadow-lg shadow-yellow-500/20 text-slate-950 animate-bounce flex items-center justify-center">
                <Trophy className="w-8 h-8" />
              </div>

              <div>
                <h3 className="text-xl sm:text-2xl font-display font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-amber-200 to-yellow-400">
                  COMPRA CONFIRMADA! 🎉
                </h3>
                <p className="text-slate-400 text-xs sm:text-sm mt-1">
                  Seus bilhetes foram gerados com sucesso pelo sistema e adicionados à sua conta. Boa sorte!
                </p>
              </div>

              {/* Grid de bilhetes comprados */}
              <div className="max-h-60 overflow-y-auto pr-1 space-y-3">
                {recentBoughtTickets.map((numbers, idx) => (
                  <div key={idx} className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-left">
                    <span className="text-[10px] uppercase font-black text-indigo-400">Bilhete #{idx + 1}</span>
                    <div className="flex flex-wrap gap-1.5">
                      {numbers.length === 1 ? (
                        <span className="px-4 py-1.5 rounded-xl bg-indigo-950 border border-indigo-500/40 text-indigo-200 font-mono text-xs font-black tracking-wider shadow-inner">
                          Nº {String(numbers[0]).padStart(4, '0')}
                        </span>
                      ) : (
                        numbers.map((n: number, nIdx: number) => (
                          <span key={nIdx} className="w-8 h-8 rounded-full bg-indigo-950 border border-indigo-500/40 text-indigo-200 font-mono text-xs font-black flex items-center justify-center shadow-inner">
                            {n.toString().padStart(2, '0')}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-indigo-950/20 border border-indigo-500/10 rounded-2xl p-4 text-xs text-indigo-300 text-left space-y-1">
                <span className="font-bold text-yellow-400 block mb-1">Dica de Ouro:</span>
                <p>Estes bilhetes estão salvos na sua conta e você pode visualizá-los a qualquer momento acessando o <strong className="text-white">Painel do Usuário</strong> pelo menu superior.</p>
              </div>

              <div className="flex gap-3 justify-center mt-2">
                <button
                  onClick={() => setShowPixBoughtModal(false)}
                  className="px-8 py-3.5 rounded-2xl bg-gradient-to-r from-yellow-400 to-amber-500 hover:from-yellow-500 hover:to-amber-600 text-slate-950 text-xs font-black uppercase tracking-wider transition-all shadow-lg shadow-yellow-400/10 hover:shadow-yellow-400/20 active:scale-95 cursor-pointer w-full"
                >
                  FECHAR & CONTINUAR
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
