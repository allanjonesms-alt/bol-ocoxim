import { useState, useEffect, FormEvent } from 'react';
import { collection, query, onSnapshot, doc, updateDoc, addDoc, serverTimestamp, runTransaction, getDocs, where, deleteDoc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Match, UserProfile, Bet } from '../types';
import { Link } from 'react-router-dom';
import { handleFirestoreError, OperationType } from '../lib/error-handler';
import { Trophy, Edit, Check, X, AlertTriangle, ArrowLeft, PlusCircle } from 'lucide-react';

const processImage = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 200;
        const scaleSize = MAX_WIDTH / img.width;
        canvas.width = MAX_WIDTH;
        canvas.height = img.height * scaleSize;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/webp', 0.8));
      };
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
};

export default function AdminBolao() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [bets, setBets] = useState<Bet[]>([]);
  
  const [newMatchTeam1, setNewMatchTeam1] = useState('');
  const [newMatchTeam2, setNewMatchTeam2] = useState('');
  const [flagFile1, setFlagFile1] = useState<File | null>(null);
  const [flagFile2, setFlagFile2] = useState<File | null>(null);
  const [newMatchDate, setNewMatchDate] = useState('');
  const [newMatchIsPromotional, setNewMatchIsPromotional] = useState(false);
  const [newMatchPhase, setNewMatchPhase] = useState('GRUPOS');
  const [uploadingMatch, setUploadingMatch] = useState(false);
  const [showAllMatches, setShowAllMatches] = useState(false);

  // Edit match state
  const [editingMatchId, setEditingMatchId] = useState<string | null>(null);
  const [editTeam1, setEditTeam1] = useState('');
  const [editTeam2, setEditTeam2] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editPhase, setEditPhase] = useState('GRUPOS');
  const [editFlagFile1, setEditFlagFile1] = useState<File | null>(null);
  const [editFlagFile2, setEditFlagFile2] = useState<File | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  // Custom alert/toast states
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Admin manual bet states
  const [adminBetUserId, setAdminBetUserId] = useState('');
  const [adminBetMatchId, setAdminBetMatchId] = useState('');
  const [adminBetP1, setAdminBetP1] = useState('');
  const [adminBetP2, setAdminBetP2] = useState('');
  const [placingAdminBet, setPlacingAdminBet] = useState(false);

  const [matchToDelete, setMatchToDelete] = useState<string | null>(null);
  const [deletingMatch, setDeletingMatch] = useState(false);

  // Winners Section settings
  const [winnersSettings, setWinnersSettings] = useState<{ active: boolean; matchId: string; updatedAt: any } | null>(null);
  const [winnersMatchId, setWinnersMatchId] = useState<string>('');
  const [winnersActive, setWinnersActive] = useState<boolean>(false);
  const [savingWinnersSection, setSavingWinnersSection] = useState(false);

  // Leaderboard settings
  const [leaderboardActive, setLeaderboardActive] = useState<boolean>(true);
  const [savingLeaderboardSettings, setSavingLeaderboardSettings] = useState(false);
  const [leaderboardSettings, setLeaderboardSettings] = useState<{ active: boolean; updatedAt: any } | null>(null);

  // Advanced system actions
  const [showResetLeaderboardConfirm, setShowResetLeaderboardConfirm] = useState(false);
  const [resettingLeaderboard, setResettingLeaderboard] = useState(false);

  const [showDeleteAllMatchesConfirm, setShowDeleteAllMatchesConfirm] = useState(false);
  const [deletingAllMatches, setDeletingAllMatches] = useState(false);

  const formatDateTime = (ts: any) => {
    if (!ts) return '-';
    let date: Date;
    if (typeof ts === 'string') {
      date = new Date(ts);
    } else if (ts && typeof ts.toDate === 'function') {
      date = ts.toDate();
    } else if (ts && ts.seconds) {
      date = new Date(ts.seconds * 1000);
    } else {
      date = new Date(ts);
    }
    
    if (isNaN(date.getTime())) return '-';
    
    return date.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const showNotification = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4000);
  };

  const handleSaveWinnersSettings = async () => {
    setSavingWinnersSection(true);
    try {
      await setDoc(doc(db, 'settings', 'winnersSection'), {
        active: winnersActive,
        matchId: winnersMatchId,
        updatedAt: serverTimestamp()
      }, { merge: true });
      showNotification('Configuração de Vencedores salva com sucesso!');
    } catch(err) {
      handleFirestoreError(err, OperationType.UPDATE, 'settings');
      showNotification('Erro ao salvar configurações.', 'error');
    } finally {
      setSavingWinnersSection(false);
    }
  };

  const handleSaveLeaderboardSettings = async () => {
    setSavingLeaderboardSettings(true);
    try {
      await setDoc(doc(db, 'settings', 'leaderboard'), {
        active: leaderboardActive,
        updatedAt: serverTimestamp()
      }, { merge: true });
      showNotification('Configuração da Classificação Geral salva com sucesso!');
    } catch(err) {
      handleFirestoreError(err, OperationType.UPDATE, 'settings');
      showNotification('Erro ao salvar configurações da classificação geral.', 'error');
    } finally {
      setSavingLeaderboardSettings(false);
    }
  };

  const handleResetLeaderboard = async () => {
    setResettingLeaderboard(true);
    try {
      const betsSnap = await getDocs(collection(db, 'bets'));
      const promises = betsSnap.docs.map(d => {
        return updateDoc(doc(db, 'bets', d.id), { points: 0 });
      });
      await Promise.all(promises);
      showNotification('Classificação Geral zerada com sucesso!');
      setShowResetLeaderboardConfirm(false);
    } catch (err) {
      console.error(err);
      showNotification('Erro ao zerar a classificação geral.', 'error');
    } finally {
      setResettingLeaderboard(false);
    }
  };

  const handleDeleteAllMatches = async () => {
    setDeletingAllMatches(true);
    try {
      const matchesSnap = await getDocs(collection(db, 'matches'));
      const promises = matchesSnap.docs.map(d => {
        return deleteDoc(doc(db, 'matches', d.id));
      });
      await Promise.all(promises);
      showNotification('Todas as partidas foram deletadas com sucesso!');
      setShowDeleteAllMatchesConfirm(false);
    } catch (err) {
      console.error(err);
      showNotification('Erro ao deletar todas as partidas.', 'error');
    } finally {
      setDeletingAllMatches(false);
    }
  };

  useEffect(() => {
    const unsubMatches = onSnapshot(collection(db, 'matches'), (snapshot) => {
      setMatches(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Match)));
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, 'matches');
    });
    const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      const usersData = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as UserProfile));
      usersData.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setUsers(usersData);
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, 'users');
    });
    const unsubBets = onSnapshot(collection(db, 'bets'), (snapshot) => {
      setBets(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Bet)));
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, 'bets');
    });
    const unsubSettings = onSnapshot(doc(db, 'settings', 'winnersSection'), (d) => {
      if (d.exists()) {
        const data = d.data();
        setWinnersSettings(data as any);
        setWinnersMatchId(data.matchId || '');
        setWinnersActive(data.active || false);
      } else {
        setWinnersSettings(null);
        setWinnersMatchId('');
        setWinnersActive(false);
      }
    });
    const unsubLeaderboardSettings = onSnapshot(doc(db, 'settings', 'leaderboard'), (d) => {
      if (d.exists()) {
        const data = d.data();
        setLeaderboardSettings(data as any);
        setLeaderboardActive(data.active !== false);
      } else {
        setLeaderboardSettings(null);
        setLeaderboardActive(true);
      }
    });

    return () => { unsubMatches(); unsubUsers(); unsubBets(); unsubSettings(); unsubLeaderboardSettings(); };
  }, []);

  const handleAddMatch = async (e: FormEvent) => {
    e.preventDefault();
    setUploadingMatch(true);
    try {
      let flag1Url = '';
      let flag2Url = '';

      if (flagFile1) {
        flag1Url = await processImage(flagFile1);
      }
      if (flagFile2) {
        flag2Url = await processImage(flagFile2);
      }

      await addDoc(collection(db, 'matches'), {
        team1: newMatchTeam1,
        team2: newMatchTeam2,
        flag1: flag1Url,
        flag2: flag2Url,
        date: new Date(newMatchDate).toISOString(),
        status: 'open',
        poolTotal: 0,
        isPromotional: newMatchIsPromotional,
        phase: newMatchPhase
      });
      setNewMatchTeam1(''); setNewMatchTeam2(''); 
      setFlagFile1(null); setFlagFile2(null);
      setNewMatchDate('');
      setNewMatchIsPromotional(false);
      setNewMatchPhase('GRUPOS');
      showNotification('Partida adicionada com sucesso!');
    } catch(err) {
      handleFirestoreError(err, OperationType.CREATE, 'matches');
    } finally {
      setUploadingMatch(false);
    }
  };

  const startEditMatch = (m: Match) => {
    setEditingMatchId(m.id);
    setEditTeam1(m.team1);
    setEditTeam2(m.team2);
    const d = new Date(m.date);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    setEditDate(d.toISOString().slice(0, 16));
    setEditPhase(m.phase || 'GRUPOS');
    setEditFlagFile1(null);
    setEditFlagFile2(null);
  };

  const cancelEditMatch = () => {
    setEditingMatchId(null);
  };

  const handleSaveEdit = async (m: Match) => {
    setSavingEdit(true);
    try {
      let flag1Url = m.flag1;
      let flag2Url = m.flag2;

      if (editFlagFile1) {
        flag1Url = await processImage(editFlagFile1);
      }
      if (editFlagFile2) {
        flag2Url = await processImage(editFlagFile2);
      }

      await updateDoc(doc(db, 'matches', m.id), {
        team1: editTeam1,
        team2: editTeam2,
        date: new Date(editDate).toISOString(),
        flag1: flag1Url,
        flag2: flag2Url,
        phase: editPhase
      });
      
      setEditingMatchId(null);
      showNotification('Partida editada com sucesso!');
    } catch(err) {
      handleFirestoreError(err, OperationType.UPDATE, 'matches');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleCloseEntries = async (id: string) => {
    try {
      await updateDoc(doc(db, 'matches', id), { status: 'betting_closed' });
      showNotification('Apostas encerradas para esta partida!');
    } catch(err) {
      handleFirestoreError(err, OperationType.UPDATE, 'matches');
    }
  };

  const handleFinalizeMatch = async (match: Match) => {
    const r1 = prompt(`Resultado: Gols de ${match.team1}`);
    const r2 = prompt(`Resultado: Gols de ${match.team2}`);
    if (r1 === null || r2 === null) return;
    
    const res1 = parseInt(r1, 10);
    const res2 = parseInt(r2, 10);
    if (isNaN(res1) || isNaN(res2)) return;

    try {
      await runTransaction(db, async (transaction) => {
        const matchRef = doc(db, 'matches', match.id);
        
        const betsQuery = query(collection(db, 'bets'), where('matchId', '==', match.id), where('status', '==', 'confirmed'));
        const betsDocs = await getDocs(betsQuery);
        
        const winners: any[] = [];
        const updateBets: { ref: any, points: number, isWinner: boolean }[] = [];
        
        const isPromotional = !!match.isPromotional;
        const phaseMultiplier = (match.phase && match.phase !== 'GRUPOS') ? 2 : 1;
        
        betsDocs.forEach(b => {
          const p1 = b.data().predicted1;
          const p2 = b.data().predicted2;
          
          let points = 0;
          let isWinner = false;
          
          const matchRealOutcome = res1 > res2 ? 1 : (res1 < res2 ? 2 : 0);
          const betOutcome = p1 > p2 ? 1 : (p1 < p2 ? 2 : 0);

          if (matchRealOutcome === betOutcome) {
            points += (isPromotional ? 1 : 3) * phaseMultiplier;
          }
          if (p1 === res1) {
            points += (isPromotional ? 2 : 6) * phaseMultiplier;
          }
          if (p2 === res2) {
            points += (isPromotional ? 2 : 6) * phaseMultiplier;
          }

          if (p1 === res1 && p2 === res2) {
            isWinner = true;
          }

          if (isWinner) {
            winners.push(b);
          }
          updateBets.push({ ref: doc(db, 'bets', b.id), points, isWinner });
        });

        const prizePool = isPromotional ? 0 : match.poolTotal * 0.9;
        const prizePerWinner = winners.length > 0 ? prizePool / winners.length : 0;

        transaction.update(matchRef, { status: 'finished', result1: res1, result2: res2 });
        
        for (const up of updateBets) {
           transaction.update(up.ref, { 
             points: up.points, 
             is_winner: up.isWinner,
             prize_collected: up.isWinner ? prizePerWinner : 0
           });
        }
        
        if (!isPromotional && winners.length > 0) {
          const userPrizes: Record<string, number> = {};
          winners.forEach(w => {
            const uid = w.data().userId;
            userPrizes[uid] = (userPrizes[uid] || 0) + prizePerWinner;
          });
          
          for (const uid in userPrizes) {
            const uRef = doc(db, 'users', uid);
            const uDoc = await transaction.get(uRef);
            if (uDoc.exists()) {
               transaction.update(uRef, { balance: uDoc.data().balance + userPrizes[uid] });
               
               const tRef = doc(collection(db, 'transactions'));
               transaction.set(tRef, {
                 userId: uid,
                 type: 'prize',
                 amount: userPrizes[uid],
                 status: 'confirmed',
                 timestamp: serverTimestamp()
               });
            }
          }
        }
      });
      showNotification('Partida finalizada e prêmios distribuídos!');
    } catch(err) {
      handleFirestoreError(err, OperationType.UPDATE, 'matches');
    }
  };

  const handleRecalculatePromotionalMatch = async (match: Match) => {
    const r1 = prompt(`Novo Resultado: Gols de ${match.team1}`, match.result1 !== undefined ? match.result1.toString() : '');
    const r2 = prompt(`Novo Resultado: Gols de ${match.team2}`, match.result2 !== undefined ? match.result2.toString() : '');
    if (r1 === null || r2 === null) return;
    
    const res1 = parseInt(r1, 10);
    const res2 = parseInt(r2, 10);
    if (isNaN(res1) || isNaN(res2)) return;

    try {
      await runTransaction(db, async (transaction) => {
        const matchRef = doc(db, 'matches', match.id);
        
        const betsQuery = query(collection(db, 'bets'), where('matchId', '==', match.id), where('status', '==', 'confirmed'));
        const betsDocs = await getDocs(betsQuery);
        
        const updateBets: { ref: any, points: number, isWinner: boolean }[] = [];
        
        const isPromotional = !!match.isPromotional;
        const phaseMultiplier = (match.phase && match.phase !== 'GRUPOS') ? 2 : 1;
        
        betsDocs.forEach(b => {
          const p1 = b.data().predicted1;
          const p2 = b.data().predicted2;
          
          let points = 0;
          let isWinner = false;
          
          const matchRealOutcome = res1 > res2 ? 1 : (res1 < res2 ? 2 : 0);
          const betOutcome = p1 > p2 ? 1 : (p1 < p2 ? 2 : 0);

          if (matchRealOutcome === betOutcome) {
            points += (isPromotional ? 1 : 3) * phaseMultiplier;
          }
          if (p1 === res1) {
            points += (isPromotional ? 2 : 6) * phaseMultiplier;
          }
          if (p2 === res2) {
            points += (isPromotional ? 2 : 6) * phaseMultiplier;
          }

          if (p1 === res1 && p2 === res2) {
            isWinner = true;
          }

          updateBets.push({ ref: doc(db, 'bets', b.id), points, isWinner });
        });

        transaction.update(matchRef, { result1: res1, result2: res2 });
        
        for (const up of updateBets) {
           transaction.update(up.ref, { 
             points: up.points, 
             is_winner: up.isWinner
           });
        }
      });
      showNotification('Placar alterado e pontos dos palpites recalculados com sucesso!');
    } catch(err) {
      handleFirestoreError(err, OperationType.UPDATE, 'matches');
    }
  };

  const handlePlaceAdminBet = async () => {
    if (!adminBetUserId || !adminBetMatchId || adminBetP1 === '' || adminBetP2 === '' || placingAdminBet) return;
    
    const p1 = parseInt(adminBetP1, 10);
    const p2 = parseInt(adminBetP2, 10);
    if (isNaN(p1) || isNaN(p2) || p1 < 0 || p2 < 0) {
      showNotification('Placar inválido.', 'error');
      return;
    }
    
    const match = matches.find(m => m.id === adminBetMatchId);
    if (!match) return;

    const liveUser = users.find(u => u.id === adminBetUserId);
    if (!liveUser) return;

    setPlacingAdminBet(true);
    
    try {
      const userBets = bets.filter(b => b.userId === adminBetUserId);
      if (match.isPromotional) {
        const userBetsForMatch = userBets.filter(b => b.matchId === match.id);
        if (userBetsForMatch.length >= 2) {
          showNotification('O usuário já atingiu o limite de 2 palpites para este jogo.', 'error');
          setPlacingAdminBet(false);
          return;
        }
      }

      await runTransaction(db, async (transaction) => {
        const matchRef = doc(db, 'matches', match.id);
        const matchDoc = await transaction.get(matchRef);
        
        if (!matchDoc.exists()) throw new Error('Partida não encontrada.');
        
        if (matchDoc.data().status !== 'open') {
          throw new Error('Palpites encerrados para esta partida.');
        }

        const betRef = doc(collection(db, 'bets'));
        transaction.set(betRef, {
          userId: liveUser.id,
          userName: liveUser.name || 'Usuário',
          matchId: match.id,
          predicted1: p1,
          predicted2: p2,
          amount: 0,
          status: 'confirmed',
          paid: true,
          createdAt: serverTimestamp()
        });
      });
      
      setAdminBetUserId('');
      setAdminBetMatchId('');
      setAdminBetP1('');
      setAdminBetP2('');
      showNotification('Palpite registrado com sucesso!');
    } catch (err: any) {
      showNotification(err.message || 'Erro ao registrar palpite.', 'error');
    } finally {
      setPlacingAdminBet(false);
    }
  };

  const handleDeleteMatch = (id: string) => {
    setMatchToDelete(id);
  };

  const confirmDeleteMatch = async () => {
    if (!matchToDelete) return;
    setDeletingMatch(true);
    try {
      await deleteDoc(doc(db, 'matches', matchToDelete));
      showNotification('Partida excluída com sucesso!');
      setMatchToDelete(null);
    } catch(err) {
      handleFirestoreError(err, OperationType.DELETE, 'matches');
    } finally {
      setDeletingMatch(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-fade-in py-6">
      <div className="flex items-center gap-4">
        <Link to="/admin" className="p-2 hover:bg-slate-100 rounded-full transition-colors" title="Voltar ao Painel Administrativo">
          <ArrowLeft className="w-6 h-6 text-slate-700" />
        </Link>
        <div>
          <h1 className="text-3xl font-display font-bold text-slate-800 flex items-center gap-3">
            <Trophy className="h-8 w-8 text-emerald-600" />
            Gerenciamento de Bolão
          </h1>
          <p className="text-sm text-slate-500 font-medium">Cadastre novas partidas, gerencie resultados e realize palpites manuais para os usuários.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* ADICIONAR PARTIDA */}
        <div className="bg-white p-8 rounded-3xl shadow-md border border-slate-200 relative overflow-hidden flex flex-col justify-between">
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-[50px] pointer-events-none"></div>
          <div>
            <h2 className="font-display font-bold mb-6 text-slate-800 text-lg uppercase tracking-wider flex items-center gap-2">
              <PlusCircle className="w-5 h-5 text-emerald-600" />
              Adicionar Partida
            </h2>
            <form onSubmit={handleAddMatch} className="space-y-4 relative z-10">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1 space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Time de Casa</label>
                  <input 
                    type="text" 
                    placeholder="Time 1 (ex: Brasil)" 
                    value={newMatchTeam1} 
                    onChange={e => setNewMatchTeam1(e.target.value)} 
                    required 
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/35 focus:border-emerald-500/70 outline-none text-slate-800 placeholder-slate-400 font-medium text-sm" 
                  />
                </div>
                <div className="flex-1 space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Bandeira Time Casa</label>
                  <input 
                    type="file" 
                    accept=".jpg,.jpeg,.png" 
                    onChange={e => setFlagFile1(e.target.files?.[0] || null)} 
                    required 
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/35 outline-none text-slate-600 font-medium text-sm file:mr-4 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-bold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 transition-all cursor-pointer" 
                    title="Bandeira do Time 1" 
                  />
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1 space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Time de Fora</label>
                  <input 
                    type="text" 
                    placeholder="Time 2 (ex: Sérvia)" 
                    value={newMatchTeam2} 
                    onChange={e => setNewMatchTeam2(e.target.value)} 
                    required 
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/35 focus:border-emerald-500/70 outline-none text-slate-800 placeholder-slate-400 font-medium text-sm" 
                  />
                </div>
                <div className="flex-1 space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Bandeira Time Fora</label>
                  <input 
                    type="file" 
                    accept=".jpg,.jpeg,.png" 
                    onChange={e => setFlagFile2(e.target.files?.[0] || null)} 
                    required 
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/35 outline-none text-slate-600 font-medium text-sm file:mr-4 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-bold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 transition-all cursor-pointer" 
                    title="Bandeira do Time 2" 
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Data e Horário do Jogo</label>
                <input 
                  type="datetime-local" 
                  value={newMatchDate} 
                  onChange={e => setNewMatchDate(e.target.value)} 
                  required 
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/35 focus:border-emerald-500/70 outline-none text-slate-800 font-medium text-sm" 
                />
              </div>
              <div className="flex gap-4">
                <div className="space-y-1.5 flex-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Fase do Torneio</label>
                  <select 
                    value={newMatchPhase} 
                    onChange={e => setNewMatchPhase(e.target.value)} 
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/35 focus:border-emerald-500/70 outline-none text-slate-800 font-medium text-sm"
                  >
                    <option value="GRUPOS">GRUPOS</option>
                    <option value="2ª FASE">2ª FASE</option>
                    <option value="OITAVAS DE FINAL">OITAVAS DE FINAL</option>
                    <option value="QUARTAS DE FINAL">QUARTAS DE FINAL</option>
                    <option value="SEMI FINAL">SEMI FINAL</option>
                    <option value="FINAL">FINAL</option>
                  </select>
                </div>
                <div className="space-y-1.5 flex-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Jogo Promocional?</label>
                  <select 
                    value={newMatchIsPromotional ? 'sim' : 'nao'} 
                    onChange={e => setNewMatchIsPromotional(e.target.value === 'sim')} 
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/35 focus:border-emerald-500/70 outline-none text-slate-800 font-medium text-sm"
                  >
                    <option value="nao">NÃO</option>
                    <option value="sim">SIM</option>
                  </select>
                </div>
              </div>
              <button 
                type="submit" 
                disabled={uploadingMatch} 
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl py-3.5 disabled:opacity-50 transition-colors shadow-sm cursor-pointer mt-2 text-sm uppercase tracking-wider"
              >
                {uploadingMatch ? 'Salvando...' : 'Salvar Partida'}
              </button>
            </form>
          </div>
        </div>

        {/* FAZER APOSTA MANUAL PARA O USUÁRIO */}
        <div className="bg-white p-8 rounded-3xl shadow-md border border-slate-200 relative overflow-hidden flex flex-col justify-between">
          <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-[50px] pointer-events-none"></div>
          <div>
            <h2 className="font-display font-bold mb-6 text-slate-800 text-lg uppercase tracking-wider flex items-center gap-2">
              <Check className="w-5 h-5 text-indigo-600" />
              Palpite Manual para Usuário
            </h2>
            <div className="space-y-4 relative z-10">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Selecionar Usuário</label>
                <select 
                  value={adminBetUserId} 
                  onChange={(e) => setAdminBetUserId(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/25 outline-none text-slate-800 text-sm font-medium"
                >
                  <option value="">Selecione um usuário...</option>
                  {users.map(u => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Jogo Disponível</label>
                <select 
                  value={adminBetMatchId} 
                  onChange={(e) => setAdminBetMatchId(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/25 outline-none text-slate-800 text-sm font-medium"
                >
                  <option value="">Selecione uma partida...</option>
                  {matches.filter(m => m.status === 'open').map(m => (
                    <option key={m.id} value={m.id}>{m.team1} x {m.team2} ({m.isPromotional ? 'Promocional' : 'Regular'})</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Gols Casa</label>
                  <input 
                    type="number" min="0" 
                    value={adminBetP1} onChange={(e) => setAdminBetP1(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-center focus:ring-2 focus:ring-indigo-500/25 outline-none font-bold text-slate-800 text-sm"
                    placeholder="0"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Gols Fora</label>
                  <input 
                    type="number" min="0" 
                    value={adminBetP2} onChange={(e) => setAdminBetP2(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-center focus:ring-2 focus:ring-indigo-500/25 outline-none font-bold text-slate-800 text-sm"
                    placeholder="0"
                  />
                </div>
              </div>
              <button 
                onClick={handlePlaceAdminBet}
                disabled={placingAdminBet || !adminBetUserId || !adminBetMatchId || adminBetP1 === '' || adminBetP2 === ''}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl py-3.5 transition-all disabled:opacity-50 text-sm uppercase tracking-wider cursor-pointer"
              >
                {placingAdminBet ? 'Processando...' : 'Registrar Palpite'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* GERENCIAR PARTIDAS */}
      <div className="bg-white p-8 rounded-3xl shadow-md border border-slate-200">
        <h2 className="font-display font-bold mb-6 text-slate-800 text-lg uppercase tracking-wider">Gerenciar Partidas</h2>
        {(() => {
          const sortedMatches = [...matches].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
          const displayMatches = showAllMatches ? sortedMatches : sortedMatches.slice(0, 10);
          return (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {displayMatches.map(m => (
                  <div key={m.id} className="bg-slate-55/60 border border-slate-200 p-6 rounded-2xl flex flex-col justify-between shadow-sm relative hover:border-slate-300 transition-colors">
                    {editingMatchId === m.id ? (
                      <div className="space-y-4 w-full">
                        <div className="flex justify-between items-center mb-2">
                          <span className="font-bold text-slate-800 text-sm">Editando Partida</span>
                          <button onClick={cancelEditMatch} className="text-slate-400 hover:text-slate-650 cursor-pointer"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-4">
                          <div className="flex-1 space-y-2">
                            <input 
                              type="text" 
                              value={editTeam1} 
                              onChange={(e) => setEditTeam1(e.target.value)} 
                              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500/25" 
                              placeholder="Time 1" 
                            />
                            <input 
                              type="file" 
                              accept=".jpg,.jpeg,.png" 
                              onChange={(e) => setEditFlagFile1(e.target.files?.[0] || null)} 
                              className="w-full text-xs text-slate-500 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:bg-slate-100 file:text-slate-700" 
                              title="Nova Bandeira 1" 
                            />
                          </div>
                          <div className="flex-1 space-y-2">
                            <input 
                              type="text" 
                              value={editTeam2} 
                              onChange={(e) => setEditTeam2(e.target.value)} 
                              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500/25" 
                              placeholder="Time 2" 
                            />
                            <input 
                              type="file" 
                              accept=".jpg,.jpeg,.png" 
                              onChange={(e) => setEditFlagFile2(e.target.files?.[0] || null)} 
                              className="w-full text-xs text-slate-500 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:bg-slate-100 file:text-slate-700" 
                              title="Nova Bandeira 2" 
                            />
                          </div>
                        </div>
                        <input 
                          type="datetime-local" 
                          value={editDate} 
                          onChange={(e) => setEditDate(e.target.value)} 
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500/25 font-mono" 
                        />
                        <div className="space-y-1">
                          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Fase do Torneio</label>
                          <select 
                            value={editPhase} 
                            onChange={e => setEditPhase(e.target.value)} 
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500/25"
                          >
                            <option value="GRUPOS">GRUPOS</option>
                            <option value="2ª FASE">2ª FASE</option>
                            <option value="OITAVAS DE FINAL">OITAVAS DE FINAL</option>
                            <option value="QUARTAS DE FINAL">QUARTAS DE FINAL</option>
                            <option value="SEMI FINAL">SEMI FINAL</option>
                            <option value="FINAL">FINAL</option>
                          </select>
                        </div>
                        
                        <div className="flex justify-end pt-2">
                          <button 
                            onClick={() => handleSaveEdit(m)} 
                            disabled={savingEdit} 
                            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl font-bold text-sm disabled:opacity-50 transition-colors cursor-pointer shadow-sm"
                          >
                            {savingEdit ? 'Salvando...' : <><Check className="w-4 h-4" /> Salvar</>}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <div className="flex items-center gap-3">
                              <span className="text-slate-800 font-bold text-base">{m.team1}</span>
                              {m.flag1?.startsWith('http') || m.flag1?.startsWith('data:') ? (
                                <img src={m.flag1} alt={m.team1} className="w-8 h-5 object-cover rounded shadow-xs border border-slate-200" referrerPolicy="no-referrer" />
                              ) : (
                                <span className="text-xl">{m.flag1}</span>
                              )}
                              <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider">vs</span>
                              {m.flag2?.startsWith('http') || m.flag2?.startsWith('data:') ? (
                                <img src={m.flag2} alt={m.team2} className="w-8 h-5 object-cover rounded shadow-xs border border-slate-200" referrerPolicy="no-referrer" />
                              ) : (
                                <span className="text-xl">{m.flag2}</span>
                              )}
                              <span className="text-slate-800 font-bold text-base">{m.team2}</span>
                            </div>
                            <p className="text-xs text-slate-500 mt-2.5 font-medium flex items-center gap-2">
                              <span>Status: <span className={`font-bold ${m.status === 'open' ? 'text-emerald-600' : 'text-amber-600'}`}>{m.status.toUpperCase()}</span></span>
                              <span className="text-slate-300">•</span>
                              <span className="font-bold text-slate-700">{m.phase || 'GRUPOS'}</span>
                            </p>
                            <p className="text-xs font-mono text-emerald-800 font-bold mt-1.5 bg-emerald-50 inline-block px-2.5 py-1 rounded-lg border border-emerald-100">
                              Pool arrecadado: R$ {m.poolTotal.toFixed(2)}
                            </p>
                            {m.status === 'finished' && (
                              <div className="mt-1.5 flex">
                                <span className="text-xs font-bold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200 font-mono">
                                  Resultado Final: {m.result1} x {m.result2}
                                </span>
                              </div>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <button 
                              onClick={() => startEditMatch(m)} 
                              className="text-slate-400 hover:text-emerald-700 p-2 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                              title="Editar Partida"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => handleDeleteMatch(m.id)} 
                              className="text-slate-400 hover:text-red-600 p-2 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                              title="Excluir Partida"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                            </button>
                          </div>
                        </div>
                        <div className="flex gap-3 border-t border-slate-200/65 pt-4 mt-auto">
                          {m.status === 'open' && (
                            <button 
                              onClick={() => handleCloseEntries(m.id)} 
                              className="flex-1 text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-250 py-2.5 rounded-xl transition-colors cursor-pointer"
                            >
                              Fechar Apostas
                            </button>
                          )}
                          {(m.status === 'open' || m.status === 'betting_closed') && (
                            <button 
                              onClick={() => handleFinalizeMatch(m)} 
                              className="flex-1 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-xl transition-colors cursor-pointer shadow-sm"
                            >
                              Informar Resultado
                            </button>
                          )}
                          {m.status === 'finished' && m.isPromotional && (
                            <button 
                              onClick={() => handleRecalculatePromotionalMatch(m)} 
                              className="flex-1 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-xl transition-colors cursor-pointer shadow-sm flex items-center justify-center gap-1.5"
                            >
                              <Edit className="w-3.5 h-3.5" /> Alterar Placar e Recalcular
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
              {!showAllMatches && sortedMatches.length > 10 && (
                <div className="mt-8 flex justify-center">
                  <button
                    onClick={() => setShowAllMatches(true)}
                    className="px-6 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors border border-slate-200 cursor-pointer text-sm"
                  >
                    Ver Mais Partidas
                  </button>
                </div>
              )}
              {showAllMatches && sortedMatches.length > 10 && (
                <div className="mt-8 flex justify-center">
                  <button
                    onClick={() => setShowAllMatches(false)}
                    className="px-6 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors border border-slate-200 cursor-pointer text-sm"
                  >
                    Ver Menos Partidas
                  </button>
                </div>
              )}
            </>
          );
        })()}
      </div>



      {/* Leaderboard Section Config */}
      <div className="bg-white border border-slate-200 p-6 md:p-8 rounded-3xl shadow-sm mb-12">
        <h2 className="font-display font-bold mb-6 text-slate-800 text-lg uppercase tracking-wider">Configurar Classificação Geral na Home</h2>
        <div className="flex flex-col space-y-6 max-w-xl">
          <div>
            <label className="block text-slate-500 text-xs font-bold uppercase tracking-wider mb-2">Exibir Classificação na Página Inicial</label>
            <div className="flex items-center gap-3">
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  className="sr-only peer" 
                  checked={leaderboardActive}
                  onChange={(e) => setLeaderboardActive(e.target.checked)}
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
              </label>
              <span className="text-sm font-bold text-slate-700">{leaderboardActive ? 'Ativada' : 'Desativada'}</span>
            </div>
            <p className="text-xs text-slate-450 mt-1.5 font-medium leading-relaxed">
              Controla se o botão de acesso à **Classificação Geral** será exibido ou desativado na tela inicial do site.
            </p>
          </div>

          <div className="pt-4 flex justify-between items-center border-t border-slate-100">
             <div className="text-xs text-slate-400 font-mono">
                Última att: {formatDateTime(leaderboardSettings?.updatedAt)}
             </div>
             <button 
                onClick={handleSaveLeaderboardSettings} 
                disabled={savingLeaderboardSettings}
                className="bg-slate-800 hover:bg-slate-900 text-white font-bold px-6 py-2.5 rounded-xl text-sm transition-colors cursor-pointer shadow-sm disabled:opacity-50"
             >
                {savingLeaderboardSettings ? 'Salvando...' : 'Salvar Configuração'}
             </button>
          </div>

          <div className="pt-6 border-t border-slate-100">
            <label className="block text-slate-500 text-xs font-bold uppercase tracking-wider mb-2">Zerar Classificação</label>
            <p className="text-xs text-slate-450 mb-3.5 font-medium leading-relaxed">
              Define para 0 os pontos de todos os palpites realizados por todos os usuários. Isso reinicia a pontuação geral da classificação do bolão.
            </p>
            <button
              onClick={() => setShowResetLeaderboardConfirm(true)}
              className="bg-amber-600 hover:bg-amber-700 text-white font-bold px-5 py-2.5 rounded-xl text-xs sm:text-sm transition-colors cursor-pointer shadow-sm flex items-center gap-2 uppercase tracking-wider"
            >
              <Trophy className="w-4 h-4" />
              Zerar Classificação Geral
            </button>
          </div>
        </div>
      </div>

      {/* Advanced Cleanup Section */}
      <div className="bg-white border border-red-200 p-6 md:p-8 rounded-3xl shadow-sm mb-12">
        <h2 className="font-display font-bold mb-3 text-red-800 text-lg uppercase tracking-wider">Ações de Limpeza de Dados (Avançado)</h2>
        <p className="text-slate-500 text-xs sm:text-sm mb-6 leading-relaxed">
          Área com ações administrativas destrutivas. Tenha absoluta certeza do que está fazendo antes de prosseguir.
        </p>
        
        <div className="max-w-xl">
          <label className="block text-slate-500 text-xs font-bold uppercase tracking-wider mb-2">Deletar Todas as Partidas</label>
          <p className="text-xs text-slate-450 mb-4 font-medium leading-relaxed">
            Exclui permanentemente todas as partidas cadastradas na coleção de jogos do bolão.
          </p>
          <button
            onClick={() => setShowDeleteAllMatchesConfirm(true)}
            className="bg-red-600 hover:bg-red-700 text-white font-bold px-5 py-2.5 rounded-xl text-xs sm:text-sm transition-colors cursor-pointer shadow-sm flex items-center gap-2 uppercase tracking-wider"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
            Deletar Todas as Partidas
          </button>
        </div>
      </div>

      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-6 right-6 z-[100] bg-white border border-slate-200 shadow-2xl rounded-2xl p-4 flex items-center gap-3 animate-fade-in-down max-w-sm">
          <div className={`p-2 rounded-xl ${toast.type === 'success' ? 'bg-emerald-50' : 'bg-red-50'}`}>
            {toast.type === 'success' ? (
              <Check className="w-5 h-5 text-emerald-600" />
            ) : (
              <X className="w-5 h-5 text-red-600" />
            )}
          </div>
          <div className="flex-1">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Notificação</p>
            <p className="text-sm font-bold text-slate-800 mt-0.5 leading-tight">{toast.message}</p>
          </div>
          <button onClick={() => setToast(null)} className="text-slate-400 hover:text-slate-650 p-1 cursor-pointer" title="Fechar">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Match Delete Confirmation Modal */}
      {matchToDelete && (() => {
        const m = matches.find(match => match.id === matchToDelete);
        return (
          <div className="fixed inset-0 bg-slate-900/45 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
            <div className="bg-white rounded-3xl border border-slate-200 w-full max-w-md overflow-hidden flex flex-col shadow-2xl relative">
              <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                <h3 className="text-lg font-display font-bold text-slate-800 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                  <span>Confirmar Exclusão</span>
                </h3>
                <button 
                  onClick={() => !deletingMatch && setMatchToDelete(null)} 
                  className="text-slate-400 hover:text-slate-650 bg-slate-100 hover:bg-slate-200 p-2 rounded-full transition-colors cursor-pointer"
                  title="Fechar"
                  disabled={deletingMatch}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <p className="text-slate-650 text-sm leading-relaxed">
                  Tem certeza que deseja <strong className="text-red-700 font-bold">excluir definitivamente</strong> a partida{' '}
                  <strong className="text-slate-800 font-bold">{m ? `${m.team1} x ${m.team2}` : 'Carregando...'}</strong>?
                </p>
                <div className="bg-red-50 p-3 rounded-xl border border-red-200 text-xs text-red-700 space-y-1 font-semibold">
                  Esta ação é irreversível e todas as apostas vinculadas a esta partida podem ficar órfãs.
                </div>
              </div>

              <div className="p-6 border-t border-slate-200 flex justify-end gap-3 bg-slate-50">
                <button 
                  onClick={() => !deletingMatch && setMatchToDelete(null)} 
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl px-4 py-2.5 font-bold text-xs transition-colors cursor-pointer uppercase tracking-wider"
                  disabled={deletingMatch}
                >
                  Cancelar
                </button>
                <button 
                  onClick={confirmDeleteMatch} 
                  className="bg-red-600 hover:bg-red-700 rounded-xl px-4 py-2.5 font-bold text-xs transition-colors cursor-pointer uppercase tracking-wider text-white shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={deletingMatch}
                >
                  {deletingMatch ? 'Excluindo...' : 'Sim, Excluir'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Leaderboard Reset Confirmation Modal */}
      {showResetLeaderboardConfirm && (
        <div className="fixed inset-0 bg-slate-900/45 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl border border-slate-200 w-full max-w-md overflow-hidden flex flex-col shadow-2xl relative">
            <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <h3 className="text-lg font-display font-bold text-slate-800 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-550" />
                <span>Confirmar Reinício</span>
              </h3>
              <button 
                onClick={() => !resettingLeaderboard && setShowResetLeaderboardConfirm(false)} 
                className="text-slate-400 hover:text-slate-650 bg-slate-100 hover:bg-slate-200 p-2 rounded-full transition-colors cursor-pointer"
                title="Fechar"
                disabled={resettingLeaderboard}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-slate-650 text-sm leading-relaxed">
                Tem certeza que deseja <strong className="text-amber-700 font-bold">zerar a Classificação Geral</strong>?
              </p>
              <div className="bg-amber-50 p-3 rounded-xl border border-amber-200 text-xs text-amber-800 space-y-1 font-semibold">
                Todos os palpites confirmados no sistema terão sua pontuação definida para zero. Isso irá recalcular a classificação e zerar o placar de todos os competidores.
              </div>
            </div>

            <div className="p-6 border-t border-slate-200 flex justify-end gap-3 bg-slate-50">
              <button 
                onClick={() => !resettingLeaderboard && setShowResetLeaderboardConfirm(false)} 
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl px-4 py-2.5 font-bold text-xs transition-colors cursor-pointer uppercase tracking-wider"
                disabled={resettingLeaderboard}
              >
                Cancelar
              </button>
              <button 
                onClick={handleResetLeaderboard} 
                className="bg-amber-600 hover:bg-amber-700 rounded-xl px-4 py-2.5 font-bold text-xs transition-colors cursor-pointer uppercase tracking-wider text-white shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={resettingLeaderboard}
              >
                {resettingLeaderboard ? 'Zerando...' : 'Zerar Classificação'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete All Matches Confirmation Modal */}
      {showDeleteAllMatchesConfirm && (
        <div className="fixed inset-0 bg-slate-900/45 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl border border-slate-200 w-full max-w-md overflow-hidden flex flex-col shadow-2xl relative">
            <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <h3 className="text-lg font-display font-bold text-slate-800 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-600" />
                <span>Excluir Todas as Partidas</span>
              </h3>
              <button 
                onClick={() => !deletingAllMatches && setShowDeleteAllMatchesConfirm(false)} 
                className="text-slate-400 hover:text-slate-650 bg-slate-100 hover:bg-slate-200 p-2 rounded-full transition-colors cursor-pointer"
                title="Fechar"
                disabled={deletingAllMatches}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-slate-650 text-sm leading-relaxed">
                Tem certeza que deseja <strong className="text-red-700 font-bold">excluir absolutamente todas as partidas</strong> do sistema?
              </p>
              <div className="bg-red-50 p-3 rounded-xl border border-red-200 text-xs text-red-700 space-y-1 font-semibold">
                Esta ação é definitiva, destrutiva e irreversível. Todos os dados de partidas serão eliminados.
              </div>
            </div>

            <div className="p-6 border-t border-slate-200 flex justify-end gap-3 bg-slate-50">
              <button 
                onClick={() => !deletingAllMatches && setShowDeleteAllMatchesConfirm(false)} 
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl px-4 py-2.5 font-bold text-xs transition-colors cursor-pointer uppercase tracking-wider"
                disabled={deletingAllMatches}
              >
                Cancelar
              </button>
              <button 
                onClick={handleDeleteAllMatches} 
                className="bg-red-600 hover:bg-red-700 rounded-xl px-4 py-2.5 font-bold text-xs transition-colors cursor-pointer uppercase tracking-wider text-white shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={deletingAllMatches}
              >
                {deletingAllMatches ? 'Deletando...' : 'Excluir Todas'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
