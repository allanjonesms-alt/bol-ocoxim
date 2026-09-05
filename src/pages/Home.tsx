import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { collection, query, orderBy, onSnapshot, doc, getDocs, where, runTransaction, serverTimestamp, limit } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Match, Bet, UserProfile, PixPremiadoDraw, PixPremiadoGame } from '../types';
import { Trophy, CalendarClock, ChevronRight, CheckCircle2, Lock, Radio, Flame, Crown, Calendar, Lightbulb, AlertCircle, Download, FileText, Medal, CircleDollarSign, X, AlertTriangle, Clock, Sparkles, Ticket, ShieldCheck, ExternalLink, Printer } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { handleFirestoreError, OperationType } from '../lib/error-handler';
import MatchCountdown from '../components/MatchCountdown';
import PixPaymentCard from '../components/PixPaymentCard';
import { generateMatchBetsPDF } from '../utils/pdfGenerator';
import { fetchAvailableFederalNumbers } from '../utils/loteriaFederal';
import { calculatePixTicketPrice } from '../utils/pixPricing';
import { buyOrReservePixTickets, reconcilePendingProvisionalTickets, cancelUserProvisionalReservation } from '../utils/provisionalTicketManager';
import { LEADERBOARD_PRIZE_MULTIPLIER } from '../utils/constants';
import googleScoreboardImg from '../assets/images/google_scoreboard_1783945113545.jpg';
import { motion, AnimatePresence } from 'motion/react';

// Teste de alteração para verificação de commit no GitHub

export default function Home() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [activePixDraws, setActivePixDraws] = useState<PixPremiadoDraw[]>([]);
  const [isPurchasingPix, setIsPurchasingPix] = useState(false);
  const [pixTicketCount, setPixTicketCount] = useState('1');
  const [recentBoughtTickets, setRecentBoughtTickets] = useState<any[]>([]);
  const [showPixBoughtModal, setShowPixBoughtModal] = useState(false);
  const [userRaffleGames, setUserRaffleGames] = useState<PixPremiadoGame[]>([]);
  const [provisionalPixModalData, setProvisionalPixModalData] = useState<{
    amount: number;
    originalAmount?: number;
    discountPercent?: number;
    ticketCount?: number;
    reservedNumbers?: (number[] | number)[];
    batchId?: string;
  } | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'pix_premiado_draws'), where('status', '==', 'active'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const draws = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PixPremiadoDraw));
      setActivePixDraws(draws);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      setUserRaffleGames([]);
      return;
    }
    const qRaffle = query(collection(db, 'pix_premiado_games'), where('userId', '==', user.uid));
    const unsubRaffle = onSnapshot(qRaffle, (snapshot) => {
      const raffleData = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as PixPremiadoGame));
      raffleData.sort((a, b) => {
        const timeA = a.createdAt ? (a.createdAt.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt).getTime()) : 0;
        const timeB = b.createdAt ? (b.createdAt.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt).getTime()) : 0;
        return timeB - timeA;
      });
      setUserRaffleGames(raffleData);
    });
    return () => unsubRaffle();
  }, [user]);

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

    const activeDraw = activePixDraws[0] || null;
    setIsPurchasingPix(true);
    try {
      const result = await buyOrReservePixTickets(db, user, profile, count, activeDraw);

      if (result.mode === 'confirmed') {
        setRecentBoughtTickets(result.boughtNumbers);
        setShowPixBoughtModal(true);
        showToast(`${result.count} bilhete(s) comprado(s) com sucesso por R$ ${result.finalPrice.toFixed(2)}!`, 'success');
        setPixTicketCount('1');
      } else {
        // Mode is provisional reservation
        setProvisionalPixModalData({
          amount: result.finalPrice,
          originalAmount: result.originalPrice,
          discountPercent: result.discountPercent,
          ticketCount: result.count,
          reservedNumbers: result.boughtNumbers,
          batchId: result.batchId
        });
        showToast(`Reserva provisória de ${result.count} bilhete(s) realizada! Efetue o PIX para ativação automática.`, 'warning');
        setPixTicketCount('1');
      }
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Erro ao processar compra de bilhetes.', 'error');
    } finally {
      setIsPurchasingPix(false);
    }
  };

  const handleCancelReservation = async (batchId?: string) => {
    if (!user) return;
    try {
      const { cancelledTicketsCount } = await cancelUserProvisionalReservation(db, user.uid, batchId);
      if (cancelledTicketsCount > 0) {
        showToast(`Reserva cancelada! ${cancelledTicketsCount} número(s) foram cancelados e liberados novamente para compra.`, 'warning');
      } else {
        showToast(`Reserva cancelada com sucesso!`, 'success');
      }
    } catch (err) {
      console.error('Error cancelling reservation:', err);
      showToast('Erro ao cancelar reserva.', 'error');
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
        console.warn("Unable to fetch live matches:", e);
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



      {/* Vencedores Section (ocultada conforme solicitação) */}


      {/* Sessão PIX PREMIADO */}
      {activePixDraws.length > 0 ? (
        <div className="bg-gradient-to-br from-amber-500/10 via-yellow-500/5 to-white text-slate-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-md relative overflow-hidden border-2 border-amber-300">
          <div className="absolute top-0 right-0 w-64 h-64 bg-yellow-400/10 rounded-full blur-[70px] pointer-events-none"></div>
          
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 relative z-10">
            <div>
              <h2 className="text-xl sm:text-2xl font-display font-black text-amber-900 flex items-center gap-2.5">
                <Sparkles className="w-6 h-6 text-amber-500 animate-spin shrink-0" style={{ animationDuration: '8s' }} />
                <span>PIX PREMIADO ATIVO</span>
                <span className="bg-emerald-600 text-white text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider shadow-xs shrink-0 animate-pulse">Disponível</span>
              </h2>
            </div>
            <div className="flex items-center gap-2 self-start sm:self-center">
              <Link
                to="/transparencia-sorteio"
                className="bg-emerald-800 hover:bg-emerald-700 text-white font-bold text-xs px-3.5 py-2 rounded-xl border border-emerald-600 transition-all flex items-center gap-1.5 shadow-xs"
                title="Visualizar relatório com todos os bilhetes emitidos em ordem crescente e e-mails protegidos"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-300" />
                <span>Transparência do Sorteio</span>
              </Link>
              <Link
                to="/panel"
                className="bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold text-xs px-3.5 py-2 rounded-xl border border-amber-300 transition-all flex items-center gap-1.5"
              >
                <Trophy className="w-3.5 h-3.5 text-amber-600" />
                <span>Meus Bilhetes</span>
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 relative z-10">
            {activePixDraws.map(draw => {
              return (
                <div key={draw.id} className="lg:col-span-12 grid grid-cols-1 md:grid-cols-12 gap-6 bg-white p-6 rounded-2xl border border-amber-200 shadow-sm">
                  
                  {/* Detalhes do Sorteio */}
                  <div className="md:col-span-3 lg:col-span-3 flex flex-col justify-between space-y-4">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="bg-amber-100 text-amber-900 font-bold text-[11px] px-3 py-1 rounded-md border border-amber-300 uppercase tracking-wide">
                          {draw.type === 'Loteria Federal' ? '🎰 LOTERIA FEDERAL' : '🔮 MEGA-SENA'}
                        </span>
                      </div>

                      {draw.observations && (
                        <div className="bg-amber-50/80 border border-amber-200 p-3 rounded-xl text-slate-700 text-xs sm:text-sm font-medium italic whitespace-pre-wrap">
                          <span className="text-amber-800 font-bold not-italic block mb-1">Prêmio e Observações:</span>
                          {draw.observations}
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-2 border-t border-amber-100">
                      <div className="flex items-center gap-2 text-xs sm:text-sm text-slate-600">
                        <Calendar className="w-4.5 h-4.5 text-amber-600 shrink-0" />
                        <div>
                          <span className="block text-[10px] text-slate-400 font-bold uppercase">Data do Sorteio</span>
                          <span className="font-semibold text-slate-800">
                            {draw.date ? draw.date.split('-').reverse().join('/') : '-'}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-xs sm:text-sm text-slate-600">
                        <Clock className="w-4.5 h-4.5 text-amber-600 shrink-0" />
                        <div>
                          <span className="block text-[10px] text-slate-400 font-bold uppercase">Horário do Sorteio</span>
                          <span className="font-semibold text-slate-800">
                            {draw.time || '-'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Interface de Compra */}
                  <div className="md:col-span-9 lg:col-span-9 bg-amber-50/40 p-5 rounded-xl border border-amber-200/80 flex flex-col justify-between space-y-4">
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                          Escolha a Quantidade de Bilhetes
                        </label>
                        <span className="text-[11px] text-white font-black bg-red-600 border border-red-500 shadow-xs px-3 py-1 rounded-full uppercase tracking-wider animate-pulse">
                          Até 30% OFF
                        </span>
                      </div>

                      {/* Options Grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5">
                        {[
                          { count: 1, isPopular: false },
                          { count: 5, isPopular: false },
                          { count: 10, isPopular: false },
                          { count: 20, isPopular: false },
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
                                  ? 'bg-gradient-to-br from-amber-500/20 via-yellow-400/20 to-amber-50 border-amber-500 text-slate-900 ring-2 ring-amber-400/40 shadow-md scale-[1.02]'
                                  : 'bg-white border-slate-200 hover:border-amber-300 text-slate-700 hover:bg-amber-50/50'
                              }`}
                            >
                              {opt.isPopular && (
                                <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-gradient-to-r from-amber-400 to-yellow-400 text-slate-950 font-black text-[8px] px-1.5 py-0.5 rounded-full uppercase tracking-wider shadow-md border border-yellow-300 whitespace-nowrap">
                                  ⭐ MAIS ESCOLHIDO
                                </span>
                              )}
                              
                              <div className="flex justify-between items-center w-full mt-0.5">
                                <span className="font-extrabold text-xs text-slate-900">
                                  {opt.count} {opt.count === 1 ? 'Bilhete' : 'Bilhetes'}
                                </span>
                                {pricing.discountPercent > 0 && (
                                  <span className="bg-red-600 text-white font-black text-[10px] px-2 py-0.5 rounded-md shadow-xs uppercase tracking-wider border border-red-400">
                                    -{pricing.discountPercent}%
                                  </span>
                                )}
                              </div>

                              <div className="mt-2.5 flex items-baseline gap-1.5">
                                <span className="font-mono font-black text-sm text-amber-700">
                                  R$ {pricing.finalPrice.toFixed(2)}
                                </span>
                                {pricing.discountPercent > 0 && (
                                  <span className="font-mono text-[10px] text-slate-400 line-through">
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
                          className="w-full bg-white border border-slate-300 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 rounded-xl py-2 pl-3 pr-10 text-xs font-semibold text-slate-900 placeholder-slate-400 font-mono outline-none shadow-xs"
                          placeholder="Outra quantidade personalizada..."
                        />
                        <span className="absolute right-3 top-2.5 text-xs font-bold text-slate-400">
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
                            <div className="bg-white p-3 rounded-xl border border-amber-200/80 space-y-1 shadow-xs">
                              <div className="flex justify-between items-center text-xs">
                                <span className="text-slate-600 font-bold uppercase">Total</span>
                                <span className="text-amber-800 text-lg font-black font-mono">
                                  R$ {currentPricing.finalPrice.toFixed(2)}
                                </span>
                              </div>
                              {currentPricing.discountPercent > 0 && (
                                <div className="flex justify-between items-center text-[11px] font-bold text-red-600 border-t border-amber-100 pt-1">
                                  <span>Desconto ({currentPricing.discountPercent}%):</span>
                                  <span>- R$ {(currentPricing.originalPrice - currentPricing.finalPrice).toFixed(2)}</span>
                                </div>
                              )}
                            </div>

                            <button
                              type="button"
                              onClick={handleBuyPixTickets}
                              disabled={isPurchasingPix || !currentCount}
                              className="w-full bg-gradient-to-r from-yellow-400 via-amber-400 to-yellow-500 hover:from-yellow-500 hover:to-amber-500 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 font-black text-xs uppercase tracking-wider py-3.5 px-4 rounded-xl transition-all shadow-md hover:shadow-lg active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer"
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
        <div className="bg-gradient-to-br from-amber-500/10 via-yellow-500/5 to-white text-slate-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-md relative overflow-hidden border-2 border-amber-300">
          <div className="absolute top-0 right-0 w-64 h-64 bg-yellow-400/10 rounded-full blur-[70px] pointer-events-none"></div>
          
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 relative z-10">
            <div>
              <h2 className="text-xl sm:text-2xl font-display font-black text-amber-900 flex items-center gap-2.5">
                <Sparkles className="w-6 h-6 text-amber-500 animate-spin shrink-0 animate-pulse" />
                <span>PIX PREMIADO</span>
                <span className="bg-amber-400 text-slate-950 text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider shadow-xs shrink-0">Breve</span>
              </h2>
              <p className="text-slate-600 text-xs sm:text-sm mt-1 font-medium leading-relaxed">
                Prepare-se para o PIX PREMIADO! Fique atento ao lançamento de novos sorteios!
              </p>
            </div>
            <div className="flex items-center gap-2 self-start sm:self-center">
              <Link
                to="/transparencia-sorteio"
                className="bg-emerald-800 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl border border-emerald-600 transition-all flex items-center gap-1.5 shadow-xs whitespace-nowrap"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-300" />
                <span>Transparência do Sorteio</span>
              </Link>
              <Link
                to="/panel"
                className="bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold text-xs px-4 py-2.5 rounded-xl border border-amber-300 transition-all flex items-center gap-1.5 whitespace-nowrap"
              >
                <Trophy className="w-3.5 h-3.5 text-amber-600" />
                <span>Meus Bilhetes</span>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Seção de Bilhetes Adquiridos pelo Usuário Logado */}
      {user && (
        <div className="bg-gradient-to-r from-slate-950 via-indigo-950 to-slate-950 text-white rounded-3xl p-6 sm:p-8 space-y-6 shadow-xl border border-indigo-500/30 relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(99,102,241,0.15),transparent_50%)] pointer-events-none"></div>
          
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 relative z-10 border-b border-indigo-500/20 pb-5">
            <div>
              <h2 className="text-xl sm:text-2xl font-display font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-amber-200 to-yellow-400 flex items-center gap-2.5">
                <Ticket className="w-6 h-6 text-yellow-400 shrink-0" />
                <span>Seus Bilhetes Adquiridos</span>
                <span className="bg-amber-400 text-slate-950 text-xs font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider shadow-sm shrink-0">
                  {userRaffleGames.length}
                </span>
              </h2>
              <p className="text-slate-300 text-xs sm:text-sm mt-1 font-medium">
                Acompanhe aqui os seus bilhetes ativos registrados no PIX PREMIADO.
              </p>
            </div>

            <Link
              to="/panel"
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs px-5 py-2.5 rounded-xl border border-indigo-400/30 transition-all flex items-center gap-1.5 self-start sm:self-center whitespace-nowrap shadow-md cursor-pointer"
            >
              <Trophy className="w-3.5 h-3.5 text-yellow-400" />
              <span>Gerenciar no Painel</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {userRaffleGames.length === 0 ? (
            <div className="text-center py-10 px-4 bg-slate-900/60 border border-dashed border-indigo-500/30 rounded-2xl relative z-10 flex flex-col items-center">
              <Ticket className="w-10 h-10 text-indigo-400/50 mb-3" />
              <p className="text-slate-300 font-semibold text-sm">
                Você ainda não adquiriu nenhum bilhete.
              </p>
              <p className="text-slate-400 text-xs mt-1 max-w-md">
                Escolha uma das opções acima do PIX PREMIADO para garantir suas dezenas e participar dos próximos sorteios!
              </p>
            </div>
          ) : (
            <div className="relative z-10 space-y-4">
              {(() => {
                const confirmedGames = userRaffleGames.filter(g => g.status !== 'pending' && g.paid !== false);
                const pendingGames = userRaffleGames.filter(g => g.status === 'pending' || g.paid === false);

                const confirmedItems = confirmedGames.flatMap((g) =>
                  g.numbers.map((num) => ({
                    gameId: g.id,
                    numVal: num,
                    numStr: g.numbers.length === 1 ? String(num).padStart(4, '0') : String(num).padStart(2, '0'),
                    isFourDigit: g.numbers.length === 1,
                    status: 'confirmed',
                    dateStr: g.createdAt
                      ? (g.createdAt.toDate ? g.createdAt.toDate() : new Date(g.createdAt)).toLocaleDateString('pt-BR')
                      : ''
                  }))
                );
                confirmedItems.sort((a, b) => a.numVal - b.numVal);

                const pendingItems = pendingGames.flatMap((g) =>
                  g.numbers.map((num) => ({
                    gameId: g.id,
                    numVal: num,
                    numStr: g.numbers.length === 1 ? String(num).padStart(4, '0') : String(num).padStart(2, '0'),
                    isFourDigit: g.numbers.length === 1,
                    status: 'pending',
                    batchId: g.batchId,
                    totalBatchCost: g.totalBatchCost,
                    discountPercent: g.discountPercent,
                    ticketCount: g.ticketCount,
                    dateStr: g.createdAt
                      ? (g.createdAt.toDate ? g.createdAt.toDate() : new Date(g.createdAt)).toLocaleDateString('pt-BR')
                      : ''
                  }))
                );
                pendingItems.sort((a, b) => a.numVal - b.numVal);

                return (
                  <div className="space-y-4">
                    {/* Pending / Provisional Alert Banner */}
                    {pendingGames.length > 0 && (
                      <div className="bg-amber-950/40 border border-amber-500/40 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-md">
                        <div className="flex items-start gap-3">
                          <AlertTriangle className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-bold text-yellow-400 text-xs sm:text-sm block">
                              Você tem {pendingGames.length} bilhete(s) com Reserva Provisória!
                            </span>
                            <p className="text-slate-300 text-xs mt-0.5">
                              Pague o PIX para que o saldo entre e ative automaticamente seus números com desconto garantido.
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0 flex-wrap">
                          <button
                            type="button"
                            onClick={() => {
                              const pricing = calculatePixTicketPrice(pendingGames.length);
                              setProvisionalPixModalData({
                                amount: pricing.finalPrice,
                                originalAmount: pricing.originalPrice,
                                discountPercent: pricing.discountPercent,
                                ticketCount: pendingGames.length,
                                reservedNumbers: pendingGames.map(g => g.numbers)
                              });
                            }}
                            className="bg-gradient-to-r from-yellow-400 to-amber-500 hover:from-yellow-500 hover:to-amber-600 text-slate-950 text-xs font-black px-4 py-2 rounded-xl uppercase tracking-wider transition-all shadow cursor-pointer"
                          >
                            Pagar PIX Agora
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const sampleBatchId = pendingGames.find(g => g.batchId)?.batchId;
                              handleCancelReservation(sampleBatchId);
                            }}
                            className="bg-slate-900/80 hover:bg-red-950/60 text-red-400 hover:text-red-300 border border-red-900/60 text-xs font-bold px-3 py-2 rounded-xl uppercase tracking-wider transition cursor-pointer"
                          >
                            Cancelar Reserva
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Confirmed Tickets Card */}
                    {confirmedItems.length > 0 && (
                      <div className="bg-slate-900/90 border border-emerald-500/30 rounded-2xl p-5 shadow-lg space-y-3">
                        <div className="flex items-center justify-between border-b border-emerald-500/20 pb-3">
                          <div className="flex items-center gap-2 text-emerald-300 text-xs font-bold uppercase tracking-wider">
                            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                            <span>Bilhetes Confirmados / Pagos ({confirmedItems.length})</span>
                          </div>
                          <span className="text-[10px] font-bold text-emerald-300 bg-emerald-950/80 px-2.5 py-0.5 rounded-full border border-emerald-800">
                            Ativos para Sorteio
                          </span>
                        </div>

                        <div className="flex flex-wrap gap-2 pt-1">
                          {confirmedItems.map((item, idx) => (
                            <span
                              key={`${item.gameId}-${idx}`}
                              title={item.dateStr ? `Comprado em ${item.dateStr}` : undefined}
                              className={`font-mono font-black rounded-xl tracking-wider shadow-sm flex items-center justify-center border transition-transform hover:scale-105 ${
                                item.isFourDigit 
                                  ? 'px-3.5 py-1.5 bg-gradient-to-r from-yellow-400 to-amber-500 text-slate-950 text-sm border-amber-300'
                                  : 'px-3 py-1 bg-yellow-400 text-slate-950 text-xs border-yellow-300'
                              }`}
                            >
                              {item.isFourDigit ? `Nº ${item.numStr}` : item.numStr}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Provisional Tickets Card */}
                    {pendingItems.length > 0 && (
                      <div className="bg-slate-900/90 border border-amber-500/40 rounded-2xl p-5 shadow-lg space-y-3">
                        <div className="flex items-center justify-between border-b border-amber-500/20 pb-3">
                          <div className="flex items-center gap-2 text-amber-300 text-xs font-bold uppercase tracking-wider">
                            <Clock className="w-4 h-4 text-yellow-400 shrink-0" />
                            <span>Reservas Provisórias Pendentes ({pendingItems.length})</span>
                          </div>
                          <span className="text-[10px] font-bold text-amber-300 bg-amber-950/80 px-2.5 py-0.5 rounded-full border border-amber-800">
                            Aguardando Pagamento
                          </span>
                        </div>

                        <div className="flex flex-wrap gap-2 pt-1">
                          {pendingItems.map((item, idx) => (
                            <span
                              key={`${item.gameId}-${idx}`}
                              title="Reserva Provisória: Aguardando confirmação do pagamento via PIX"
                              className="px-3.5 py-1.5 bg-amber-500/20 border border-amber-400/60 text-yellow-300 font-mono text-sm font-black rounded-xl tracking-wider shadow-sm flex items-center justify-center"
                            >
                              {item.isFourDigit ? `Nº ${item.numStr}` : item.numStr}
                              <span className="ml-1 text-[9px] text-amber-300/80 font-sans font-bold uppercase">(Pendente)</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}

      {/* Card de Transparência e Autenticidade dos Sorteios */}
      <div className="bg-gradient-to-br from-emerald-950 via-slate-900 to-slate-950 text-white rounded-3xl p-6 sm:p-8 space-y-6 shadow-xl border border-emerald-500/30 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/10 rounded-full blur-[90px] pointer-events-none"></div>

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div className="space-y-3 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-xs font-black uppercase tracking-wider">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Auditoria Pública e Imparcial</span>
            </div>
            
            <h2 className="text-xl sm:text-2xl font-display font-black text-white leading-tight">
              Transparência e Autenticidade no Sorteio
            </h2>

            <p className="text-slate-300 text-xs sm:text-sm leading-relaxed">
              Consulte a listagem oficial de todos os bilhetes emitidos em <strong className="text-emerald-400 font-bold">ordem numérica crescente (0000 a 9999)</strong>. O relatório exibe o e-mail do apostador com mascaramento imparcial para assegurar sua total privacidade, acompanhado da data e horário exatos da compra para conferência pública.
            </p>

            <div className="flex flex-wrap gap-2 pt-1 text-[11px] font-bold">
              <span className="bg-slate-800/80 border border-slate-700 text-slate-200 px-3 py-1 rounded-lg flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                Ordem Numérica Crescente
              </span>
              <span className="bg-slate-800/80 border border-slate-700 text-slate-200 px-3 py-1 rounded-lg flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                E-mail Mascarado (Privacidade)
              </span>
              <span className="bg-slate-800/80 border border-slate-700 text-slate-200 px-3 py-1 rounded-lg flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-emerald-400" />
                Data e Horário da Compra
              </span>
              <span className="bg-slate-800/80 border border-slate-700 text-slate-200 px-3 py-1 rounded-lg flex items-center gap-1.5">
                <Printer className="w-3.5 h-3.5 text-emerald-400" />
                Pronto para Imprimir (A4)
              </span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row lg:flex-col gap-3 shrink-0">
            <Link
              to="/transparencia-sorteio"
              className="inline-flex items-center justify-center gap-2.5 bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-slate-950 font-black text-sm px-6 py-3.5 rounded-2xl transition-all shadow-lg shadow-emerald-950/40 cursor-pointer text-center"
            >
              <FileText className="w-4 h-4 text-slate-950" />
              <span>Visualizar e Imprimir Relatório</span>
              <ChevronRight className="w-4 h-4 text-slate-950" />
            </Link>
            <p className="text-[11px] text-slate-400 text-center font-medium">
              Disponível para qualquer participante ou visitante.
            </p>
          </div>
        </div>
      </div>

      {matches.length === 0 ? (
        !user && (
          <div className="text-center bg-white p-12 rounded-3xl shadow-md border border-slate-200 flex flex-col items-center">
            <div className="bg-slate-50 p-4 rounded-full mb-4 border border-slate-100">
              <CalendarClock className="h-8 w-8 text-slate-400" />
            </div>
            <h2 className="text-lg font-bold text-slate-800">Nenhum jogo cadastrado ainda</h2>
            <p className="text-slate-500 text-sm mt-1">Volte mais tarde para conferir os próximos jogos.</p>
          </div>
        )
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

          {/* Sessão de Jogos Promocionais e Oficiais (Próximos Jogos) - OCULTADA da tela inicial por solicitação do usuário */}
          {false && urgentPromotionalMatches.length > 0 && (
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

          {false && officialMatches.length > 0 && (
            <div>
              <h2 className="text-xl font-display font-bold text-slate-800 mb-6 flex items-center justify-between border-b border-slate-200 pb-3">
                <span>Jogos Oficiais</span>
                <Link to="/matches" className="text-sm font-sans font-bold text-emerald-600 hover:text-emerald-700 transition">Ver todos</Link>
              </h2>

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
                          <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-0.5">Partida</span>
                          <span className="font-bold text-emerald-700 text-sm">
                            {match.phase || (match.isPromotional ? 'Jogo Promocional' : 'Bolão Oficial')}
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

          {false && normalPromotionalMatches.length > 0 && (
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





        <AnimatePresence>
          {provisionalPixModalData && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/90 backdrop-blur-md overflow-y-auto">
              <div className="absolute inset-0" onClick={() => setProvisionalPixModalData(null)} />
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="relative w-full max-w-lg z-10 my-8"
              >
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setProvisionalPixModalData(null)}
                    className="absolute -top-3 -right-3 z-30 bg-slate-800 hover:bg-slate-700 text-white rounded-full p-2 shadow-lg border border-slate-700 transition cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                  <PixPaymentCard
                    amount={provisionalPixModalData.amount}
                    originalAmount={provisionalPixModalData.originalAmount}
                    discountPercent={provisionalPixModalData.discountPercent}
                    ticketCount={provisionalPixModalData.ticketCount}
                    reservedNumbers={provisionalPixModalData.reservedNumbers}
                    onConfirmPayment={() => {
                      setProvisionalPixModalData(null);
                      showToast('Pagamento informado! Aguardando confirmação do PIX.', 'success');
                    }}
                    onCancel={() => setProvisionalPixModalData(null)}
                    onClose={() => setProvisionalPixModalData(null)}
                    isDepositMode={false}
                  />
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        <AnimatePresence>
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
