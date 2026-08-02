import { useState, useEffect, FormEvent } from 'react';
import { collection, query, onSnapshot, doc, updateDoc, addDoc, serverTimestamp, runTransaction, getDocs, where, deleteDoc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Match, Transaction, UserProfile, Bet, PixPremiadoGame } from '../types';
import { Link } from 'react-router-dom';

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
import { handleFirestoreError, OperationType } from '../lib/error-handler';
import { Trophy, Edit, Check, X, AlertTriangle, Clock, Wallet, Dices, Sparkles } from 'lucide-react';

export default function AdminPanel() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [bets, setBets] = useState<Bet[]>([]);
  const [pixGames, setPixGames] = useState<PixPremiadoGame[]>([]);
  const [pendingBetAction, setPendingBetAction] = useState<{ type: 'approve' | 'reject'; bet: Bet } | null>(null);
  
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
  const [pendingAction, setPendingAction] = useState<{ type: 'approve' | 'reject'; transaction: Transaction } | null>(null);
  const [pixReceiptDate, setPixReceiptDate] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Global Notification
  const [notificationMsg, setNotificationMsg] = useState("");
  const [sendingNotification, setSendingNotification] = useState(false);

  const handleSendNotification = async () => {
    if (!notificationMsg.trim()) return;
    setSendingNotification(true);
    try {
      const ts = Date.now();
      await setDoc(doc(db, 'settings', 'global_notification'), {
        message: notificationMsg,
        id: ts.toString(),
        timestamp: serverTimestamp(),
        active: true
      });
      setNotificationMsg('');
      showNotification("Notificação enviada com sucesso!", "success");
    } catch (error) {
      showNotification("Erro ao enviar notificação.", "error");
    } finally {
      setSendingNotification(false);
    }
  };

  const handleClearNotification = async () => {
    try {
      await updateDoc(doc(db, 'settings', 'global_notification'), {
        active: false
      });
      showNotification("Notificação limpa com sucesso!", "success");
    } catch (error) {
      // Ignorar se não existir
      showNotification("Erro ao limpar notificação.", "error");
    }
  };

  // Winners Section settings
  const [winnersSettings, setWinnersSettings] = useState<{ active: boolean; matchId: string; updatedAt: any } | null>(null);
  const [winnersMatchId, setWinnersMatchId] = useState<string>('');
  const [winnersActive, setWinnersActive] = useState<boolean>(false);
  const [savingWinnersSection, setSavingWinnersSection] = useState(false);

  const showNotification = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4000);
  };


  // Selected user and user details modal states
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [selectedUserBets, setSelectedUserBets] = useState<Bet[]>([]);
  const [loadingBets, setLoadingBets] = useState(false);
  const [customAmount, setCustomAmount] = useState('');
  const [adjustmentType, setAdjustmentType] = useState<'deposit' | 'withdrawal'>('deposit');
  const [adjustingBalance, setAdjustingBalance] = useState(false);
  const [editUserName, setEditUserName] = useState('');
  const [editUserPhone, setEditUserPhone] = useState('');
  const [savingUserData, setSavingUserData] = useState(false);

  // Admin manual bet globally states
  const [adminBetUserId, setAdminBetUserId] = useState('');
  const [adminBetMatchId, setAdminBetMatchId] = useState('');
  const [adminBetP1, setAdminBetP1] = useState('');
  const [adminBetP2, setAdminBetP2] = useState('');
  const [placingAdminBet, setPlacingAdminBet] = useState(false);

  const [matchToDelete, setMatchToDelete] = useState<string | null>(null);
  const [deletingMatch, setDeletingMatch] = useState(false);

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

  const handleOpenUserModal = async (u: UserProfile) => {
    setSelectedUser(u);
    setEditUserName(u.name || '');
    setEditUserPhone(u.phone || '');
    setLoadingBets(true);
    try {
      const betsQuery = query(collection(db, 'bets'), where('userId', '==', u.id));
      const betsSnapshot = await getDocs(betsQuery);
      const fetchedBets = betsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Bet));
      
      fetchedBets.sort((a, b) => {
        const timeA = a.createdAt ? (typeof a.createdAt === 'string' ? new Date(a.createdAt).getTime() : (a.createdAt as any).seconds ? (a.createdAt as any).seconds * 1000 : 0) : 0;
        const timeB = b.createdAt ? (typeof b.createdAt === 'string' ? new Date(b.createdAt).getTime() : (b.createdAt as any).seconds ? (b.createdAt as any).seconds * 1000 : 0) : 0;
        return timeB - timeA;
      });
      setSelectedUserBets(fetchedBets);
    } catch (err) {
      console.error("Error fetching user bets:", err);
    } finally {
      setLoadingBets(false);
    }
  };

  const handleAdjustBalance = async (userId: string) => {
    const amount = parseFloat(customAmount);
    if (isNaN(amount) || amount <= 0) {
      showNotification('Por favor, informe um valor válido maior que zero.', 'error');
      return;
    }

    setAdjustingBalance(true);
    try {
      await runTransaction(db, async (transaction) => {
        const userRef = doc(db, 'users', userId);
        const userDoc = await transaction.get(userRef);

        if (!userDoc.exists()) {
          throw new Error("Usuário não encontrado.");
        }

        const currentBalance = userDoc.data().balance || 0;
        let newBalance = currentBalance;

        if (adjustmentType === 'deposit') {
          newBalance += amount;
        } else {
          if (currentBalance < amount) {
            throw new Error(`Saldo insuficiente. O usuário possui apenas R$ ${currentBalance.toFixed(2)}.`);
          }
          newBalance -= amount;
        }

        transaction.update(userRef, { balance: newBalance });

        const transRef = doc(collection(db, 'transactions'));
        transaction.set(transRef, {
          userId: userId,
          type: adjustmentType,
          amount: amount,
          status: 'confirmed',
          timestamp: serverTimestamp()
        });
      });

      showNotification('Saldo ajustado com sucesso!');
      setCustomAmount('');
    } catch (err: any) {
      showNotification(err.message || 'Erro ao ajustar o saldo.', 'error');
    } finally {
      setAdjustingBalance(false);
    }
  };

  useEffect(() => {
    const unsubMatches = onSnapshot(collection(db, 'matches'), (snapshot) => {
      setMatches(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Match)));
    });
    const unsubTrans = onSnapshot(collection(db, 'transactions'), (snapshot) => {
      setTransactions(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Transaction)));
    });
    const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      const usersData = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as UserProfile));
      usersData.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setUsers(usersData);
    });
    const unsubBets = onSnapshot(collection(db, 'bets'), (snapshot) => {
      setBets(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Bet)));
    });
    const unsubPixGames = onSnapshot(collection(db, 'pix_premiado_games'), (snapshot) => {
      setPixGames(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as PixPremiadoGame)));
    }, (err) => handleFirestoreError(err, OperationType.GET, 'pix_premiado_games'));
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

    return () => { unsubMatches(); unsubTrans(); unsubUsers(); unsubBets(); unsubPixGames(); unsubSettings(); };
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
  }

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

  const startEditMatch = (m: Match) => {
    setEditingMatchId(m.id);
    setEditTeam1(m.team1);
    setEditTeam2(m.team2);
    // Format date for datetime-local input
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
    } catch(err) {
      handleFirestoreError(err, OperationType.UPDATE, 'matches');
    } finally {
      setSavingEdit(false);
    }
  };

  const executeApproveTransaction = async (t: Transaction, pixDate?: string) => {
    try {
      await runTransaction(db, async (transaction) => {
        const userRef = doc(db, 'users', t.userId);
        const transRef = doc(db, 'transactions', t.id);
        
        const userDoc = await transaction.get(userRef);
        if (!userDoc.exists()) throw new Error("Usuário não encontrado.");
        
        const diff = t.type === 'deposit' ? t.amount : (t.type === 'withdrawal' ? -t.amount : 0);
        
        if (t.type === 'withdrawal' && userDoc.data().balance < t.amount) {
          throw new Error("Saldo insuficiente para saque.");
        }

        const newBalance = userDoc.data().balance + diff;
        transaction.update(userRef, { balance: newBalance });
        
        const transUpdate: any = { status: 'confirmed' };
        if (t.type === 'withdrawal' && pixDate) {
          transUpdate.pixReceiptDate = pixDate;
        }
        transaction.update(transRef, transUpdate);

        if (t.type === 'deposit' && newBalance >= 5) {
          const pbets = await getDocs(query(collection(db, 'bets'), where('userId', '==', t.userId), where('status', '==', 'pending')));
          let currentBalance = newBalance;
          for (const pb of pbets.docs) {
            const betData = pb.data();
            const isAlreadyPaid = betData.paid;
            if (!isAlreadyPaid && currentBalance >= 5) {
               currentBalance -= 5;
               transaction.update(doc(db, 'bets', pb.id), { paid: true });
               transaction.update(userRef, { balance: currentBalance });

               // Record standard pending bet transaction
               const btransRef = doc(collection(db, 'transactions'));
               transaction.set(btransRef, {
                 userId: t.userId,
                 type: 'bet',
                 amount: 5,
                 status: 'pending',
                 timestamp: serverTimestamp()
               });
            }
          }
        }
      });
      showNotification('Transação aprovada com sucesso!');
    } catch(err) {
      handleFirestoreError(err, OperationType.UPDATE, 'transactions');
    }
  }

  const executeRejectTransaction = async (t: Transaction) => {
    try {
      await deleteDoc(doc(db, 'transactions', t.id));
      showNotification('Transação recusada e excluída com sucesso!');
    } catch(err) {
      handleFirestoreError(err, OperationType.DELETE, 'transactions');
    }
  }

  const executeApproveBet = async (b: Bet) => {
    try {
      await runTransaction(db, async (transaction) => {
        const userRef = doc(db, 'users', b.userId);
        const matchRef = doc(db, 'matches', b.matchId);
        const betRef = doc(db, 'bets', b.id);

        const userDoc = await transaction.get(userRef);
        const matchDoc = await transaction.get(matchRef);
        const betDoc = await transaction.get(betRef);

        if (!userDoc.exists() || !matchDoc.exists() || !betDoc.exists()) {
          throw new Error("Documentos não encontrados.");
        }

        const betAmount = betDoc.data().amount || b.amount || 5;
        const isPaid = betDoc.data().paid;
        let finalPaid = isPaid;

        if (!isPaid) {
          const userBalance = userDoc.data().balance;
          if (userBalance < betAmount) {
            throw new Error(`O usuário não possui saldo suficiente (R$ ${betAmount.toFixed(2)}) para homologar esta aposta.`);
          }
          transaction.update(userRef, { balance: userBalance - betAmount });
          finalPaid = true;

          // Record a confirmed bet transaction
          const transRef = doc(collection(db, 'transactions'));
          transaction.set(transRef, {
            userId: b.userId,
            type: 'bet',
            amount: betAmount,
            status: 'confirmed',
            timestamp: serverTimestamp()
          });
        } else {
          // Confirm the pending transaction for this bet
          const pendingBetTrans = transactions.find(t => t.userId === b.userId && t.type === 'bet' && t.status === 'pending');
          if (pendingBetTrans) {
            transaction.update(doc(db, 'transactions', pendingBetTrans.id), { status: 'confirmed' });
          }
        }

        // Update bet status to confirmed
        transaction.update(betRef, { status: 'confirmed', paid: finalPaid });

        // Update match's poolTotal
        const matchData = matchDoc.data();
        const poolAddition = matchData.isPromotional ? betAmount * 0.5 : betAmount;
        transaction.update(matchRef, { poolTotal: matchData.poolTotal + poolAddition });
      });

      showNotification('Aposta aprovada com sucesso!');
    } catch(err: any) {
      showNotification(err.message || 'Erro ao aprovar aposta.', 'error');
    }
  };

  const executeRejectBet = async (b: Bet) => {
    try {
      await runTransaction(db, async (transaction) => {
        const userRef = doc(db, 'users', b.userId);
        const betRef = doc(db, 'bets', b.id);

        const userDoc = await transaction.get(userRef);
        const betDoc = await transaction.get(betRef);

        if (!betDoc.exists()) {
          throw new Error("Aposta não encontrada.");
        }

        const betAmount = betDoc.data().amount || b.amount || 5;
        const isPaid = betDoc.data().paid;

        if (isPaid && userDoc.exists()) {
          // Refund user balance
          const userBalance = userDoc.data().balance;
          transaction.update(userRef, { balance: userBalance + betAmount });
        }

        // Delete the bet document
        transaction.delete(betRef);

        // Remove the pending transactions
        const pendingBetTrans = transactions.find(t => t.userId === b.userId && t.type === 'bet' && t.status === 'pending');
        if (pendingBetTrans) {
          transaction.delete(doc(db, 'transactions', pendingBetTrans.id));
        }
      });

      showNotification('Aposta recusada e removida com sucesso!');
    } catch(err: any) {
      showNotification(err.message || 'Erro ao rejeitar aposta.', 'error');
    }
  };

  const handleApproveTransaction = (t: Transaction) => {
    setPendingAction({ type: 'approve', transaction: t });
  }

  const handleRejectTransaction = (t: Transaction) => {
    setPendingAction({ type: 'reject', transaction: t });
  }

  const handleCloseEntries = async (id: string) => {
    try {
      await updateDoc(doc(db, 'matches', id), { status: 'betting_closed' });
    } catch(err) {
      handleFirestoreError(err, OperationType.UPDATE, 'matches');
    }
  }

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
  }

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
          showNotification('O usuário já atingiu o limite de 2 apostas para este jogo.', 'error');
          setPlacingAdminBet(false);
          return;
        }
      }

      const pendingBets = userBets.filter(b => b.matchId === match.id && b.status === 'pending');
      
      let betAmount = 5;
      if (match.isPromotional) {
        betAmount = 2;
      }
      
      const actualBalance = liveUser.balance || 0;
      const hasBalance = actualBalance >= betAmount;
      
      if (!hasBalance && pendingBets.length >= 2) {
        showNotification('O usuário já atingiu o limite de 2 apostas pendentes por falta de saldo neste jogo.', 'error');
        setPlacingAdminBet(false);
        return;
      }

      await runTransaction(db, async (transaction) => {
        const userRef = doc(db, 'users', liveUser.id);
        const matchRef = doc(db, 'matches', match.id);
        
        const userDoc = await transaction.get(userRef);
        const matchDoc = await transaction.get(matchRef);
        
        if (!userDoc.exists() || !matchDoc.exists()) throw new Error('Documento não encontrado.');
        
        if (matchDoc.data().status !== 'open') {
          throw new Error('Apostas encerradas para esta partida.');
        }

        const currentBalance = userDoc.data().balance || 0;
        const canPay = currentBalance >= betAmount;

        if (canPay) {
          transaction.update(userRef, { balance: currentBalance - betAmount });
          
          const transRef = doc(collection(db, 'transactions'));
          transaction.set(transRef, {
            userId: liveUser.id,
            type: 'bet',
            amount: betAmount,
            status: 'confirmed',
            timestamp: serverTimestamp()
          });

          const poolAddition = match.isPromotional ? betAmount * 0.5 : betAmount;
          transaction.update(matchRef, { poolTotal: (matchDoc.data().poolTotal || 0) + poolAddition });
        }
        
        const betRef = doc(collection(db, 'bets'));
        transaction.set(betRef, {
          userId: liveUser.id,
          userName: liveUser.name || 'Usuário',
          matchId: match.id,
          predicted1: p1,
          predicted2: p2,
          amount: betAmount,
          status: canPay ? 'confirmed' : 'pending',
          paid: canPay,
          createdAt: serverTimestamp()
        });
      });
      
      setAdminBetUserId('');
      setAdminBetMatchId('');
      setAdminBetP1('');
      setAdminBetP2('');
      showNotification('Aposta registrada com sucesso!');
    } catch (err: any) {
      showNotification(err.message || 'Erro ao registrar aposta.', 'error');
    } finally {
      setPlacingAdminBet(false);
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

        // Update match result
        transaction.update(matchRef, { result1: res1, result2: res2 });
        
        // Update each bet's points and winner status
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
  }

  const handleDeleteMatch = (id: string) => {
    setMatchToDelete(id);
  }

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
  }

  const totalSiteBalance = users.reduce((sum, u) => sum + (u.balance || 0), 0);

  const totalPlacaresApostado = bets.filter(b => b.status === "confirmed").reduce((sum, b) => {
    const m = matches.find(m => m.id === b.matchId);
    return sum + (b.amount || (m?.isPromotional ? 2 : 5));
  }, 0);

  const totalPixPremiadoApostado = pixGames.reduce((sum, g) => {
    const p = typeof g.price === 'number' && !isNaN(g.price) ? g.price : ((g as any).totalCost || 1);
    return sum + p;
  }, 0);

  const totalApostado = totalPlacaresApostado + totalPixPremiadoApostado;

  const totalCaixa = bets.filter(b => b.status === "confirmed").reduce((sum, b) => {
    const m = matches.find(m => m.id === b.matchId);
    if (m?.isPromotional) {
      return sum + (b.amount || 2) * 0.5;
    }
    return sum + (b.amount || 5) * 0.1;
  }, 0);

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h1 className="text-3xl font-display font-bold text-slate-800 flex items-center gap-3">
          <Trophy className="h-8 w-8 text-emerald-600" />
          Painel Administrativo
        </h1>
        
        {/* Destaques de Saldo */}
        <div className="flex flex-wrap gap-4">
          <div className="bg-gradient-to-br from-emerald-600 to-emerald-800 rounded-2xl p-4 shadow-lg shadow-emerald-900/20 text-white flex items-center gap-4 border border-emerald-500/30">
            <div className="bg-white/20 p-2.5 rounded-xl backdrop-blur-sm">
              <Wallet className="h-6 w-6 text-emerald-50" />
            </div>
            <div>
              <p className="text-emerald-100 text-xs font-semibold uppercase tracking-wider mb-0.5">Saldo do Site</p>
              <p className="text-2xl font-mono font-bold tracking-tight">R$ {totalSiteBalance.toFixed(2)}</p>
            </div>
          </div>
          
          <div className="bg-white rounded-2xl p-4 shadow-md text-slate-800 flex items-center gap-4 border border-slate-200">
            <div>
              <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider mb-0.5">Apostado Total</p>
              <p className="text-2xl font-mono font-bold tracking-tight">R$ {totalApostado.toFixed(2)}</p>
              <p className="text-[10px] text-slate-400 mt-0.5 font-medium">
                Palpites: R$ {totalPlacaresApostado.toFixed(2)} | Sorteios: R$ {totalPixPremiadoApostado.toFixed(2)}
              </p>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-4 shadow-md text-slate-800 flex items-center gap-4 border border-slate-200">
            <div>
              <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider mb-0.5">Caixa (Admin)</p>
              <p className="text-2xl font-mono font-bold text-emerald-600 tracking-tight">R$ {totalCaixa.toFixed(2)}</p>
            </div>
          </div>
        </div>
      </div>


      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left Column: TRANSAÇÕES PENDENTES */}
        <div className="bg-white p-8 rounded-3xl shadow-md border border-slate-200 relative overflow-hidden flex flex-col justify-between">
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-[50px] pointer-events-none"></div>
          <div>
            <h2 className="font-display font-bold mb-4 text-slate-800 text-lg uppercase tracking-wider">TRANSAÇÕES PENDENTES</h2>
            <div className="space-y-3 max-h-[420px] overflow-y-auto w-full pr-1 custom-scrollbar relative z-10">
              {transactions.filter(t => t.status === 'pending').length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-6 font-medium">Nenhuma transação pendente.</p>
              ) : transactions.filter(t => t.status === 'pending').map(t => {
                const u = users.find(u => u.id === t.userId);
                const isDeposit = t.type === 'deposit';
                return (
                  <div key={t.id} className="bg-slate-50 border border-slate-200/80 p-4 rounded-xl flex justify-between items-center text-sm shadow-sm hover:border-slate-300 transition-colors">
                    <div>
                      <strong className="text-slate-800 block mb-1 font-bold">
                        {u?.displayId && <span className="text-emerald-700 font-mono mr-1.5 text-xs">#{u.displayId}</span>}
                        {u?.name || 'Carregando usuário...'}
                      </strong>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${isDeposit ? 'bg-emerald-50 text-emerald-800 font-semibold' : 'bg-amber-50 text-amber-800 font-semibold'}`}>
                          {isDeposit ? 'Depósito' : 'Saque'}
                        </span>
                        <span className="font-mono text-emerald-700 font-bold">R$ {t.amount.toFixed(2)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => handleApproveTransaction(t)} 
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 rounded-lg text-xs transition-all shadow-sm cursor-pointer"
                      >
                        Aprovar
                      </button>
                      <button 
                        onClick={() => handleRejectTransaction(t)} 
                        className="bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-bold px-3 py-1.5 rounded-lg text-xs transition-all cursor-pointer"
                      >
                        Recusar
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column: APOSTAS PENDENTES */}
        <div className="bg-white p-8 rounded-3xl shadow-md border border-slate-200 relative overflow-hidden flex flex-col justify-between">
          <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-[50px] pointer-events-none"></div>
          <div>
            <h2 className="font-display font-bold mb-4 text-slate-800 text-lg uppercase tracking-wider">APOSTAS PENDENTES</h2>
            <div className="space-y-3 max-h-[420px] overflow-y-auto w-full pr-1 custom-scrollbar relative z-10">
              {bets.filter(b => b.status === 'pending').length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-6 font-medium">Nenhuma aposta pendente de aprovação.</p>
              ) : bets.filter(b => b.status === 'pending').map(b => {
                const u = users.find(u => u.id === b.userId);
                const m = matches.find(m => m.id === b.matchId);
                return (
                  <div key={b.id} className="bg-slate-50 border border-slate-200/80 p-4 rounded-xl flex justify-between items-center text-sm shadow-sm hover:border-slate-300 transition-colors">
                    <div>
                      <strong className="text-slate-800 block mb-0.5 font-bold">
                        {u?.displayId && <span className="text-emerald-700 font-mono mr-1.5 text-xs">#{u.displayId}</span>}
                        {u?.name || b.userName}
                      </strong>
                      <span className="text-xs text-slate-500 block mb-1">
                        Jogo: <span className="text-slate-700 font-semibold">{m ? `${m.team1} x ${m.team2}` : 'Carregando...'}</span>
                      </span>
                      <span className="text-xs text-slate-500 block mb-1.5">
                        Palpite: <strong className="text-emerald-700 font-mono text-sm">{b.predicted1} x {b.predicted2}</strong>
                      </span>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${b.paid ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-red-50 text-red-650 border border-red-100'}`}>
                          {b.paid ? 'Pago (Debitado)' : 'Falta Saldo'}
                        </span>
                        <span className="font-mono text-slate-600 font-bold text-xs">R$ {b.amount.toFixed(2)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => setPendingBetAction({ type: 'approve', bet: b })} 
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 rounded-lg text-xs transition-all shadow-sm cursor-pointer"
                      >
                        Aprovar
                      </button>
                      <button 
                        onClick={() => setPendingBetAction({ type: 'reject', bet: b })} 
                        className="bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-bold px-3 py-1.5 rounded-lg text-xs transition-all cursor-pointer"
                      >
                        Recusar
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Aviso Rápido / Notificação Global */}
      <div className="bg-white p-8 rounded-3xl shadow-md border border-slate-200">
        <h2 className="font-display font-bold mb-4 text-slate-800 text-lg uppercase tracking-wider flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-amber-500" />
          Aviso Geral (Pop-up)
        </h2>
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
          <input
            type="text"
            placeholder="Digite a mensagem para exibir em pop-up para todos..."
            value={notificationMsg}
            onChange={e => setNotificationMsg(e.target.value)}
            className="flex-1 w-full p-3 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 outline-none transition-all font-medium text-slate-800"
          />
          <div className="flex gap-2 w-full sm:w-auto">
            <button
              onClick={handleSendNotification}
              disabled={sendingNotification || !notificationMsg.trim()}
              className="flex-1 bg-amber-500 hover:bg-amber-600 text-white px-6 py-3 rounded-xl font-bold shadow-sm transition-colors disabled:opacity-50"
            >
              {sendingNotification ? 'Enviando...' : 'Enviar Aviso'}
            </button>
            <button
              onClick={handleClearNotification}
              className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-4 py-3 rounded-xl font-bold shadow-sm transition-colors"
              title="Desativar aviso atual"
            >
              Limpar
            </button>
          </div>
        </div>
      </div>



      {/* Botões de Acesso Rápido a Novas Telas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        <Link 
          to="/admin/users" 
          className="bg-white p-6 rounded-3xl shadow-md border border-slate-200 hover:border-emerald-300 hover:shadow-lg transition-all group relative overflow-hidden flex flex-col justify-center items-center gap-3 cursor-pointer"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-[50px] pointer-events-none group-hover:bg-emerald-500/10 transition-colors"></div>
          <div className="bg-emerald-50 p-4 rounded-full text-emerald-600 group-hover:scale-110 group-hover:bg-emerald-100 transition-all flex items-center justify-center relative">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            <span className="absolute -top-2 -right-2 bg-emerald-600 text-white text-xs font-bold px-2 py-0.5 rounded-full shadow-sm">{users.length}</span>
          </div>
          <div className="text-center">
            <h3 className="font-display font-bold text-slate-800 text-base uppercase tracking-wider mb-1">Gerenciar Usuários</h3>
            <p className="text-xs text-slate-500 font-medium">Ver lista completa, editar cadastros e gerenciar saldos.</p>
          </div>
        </Link>
        <Link 
          to="/admin/bolao" 
          className="bg-white p-6 rounded-3xl shadow-md border border-slate-200 hover:border-emerald-300 hover:shadow-lg transition-all group relative overflow-hidden flex flex-col justify-center items-center gap-3 cursor-pointer"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-[50px] pointer-events-none group-hover:bg-emerald-500/10 transition-colors"></div>
          <div className="bg-emerald-50 p-4 rounded-full text-emerald-600 group-hover:scale-110 group-hover:bg-emerald-100 transition-all flex items-center justify-center relative">
            <Trophy className="w-8 h-8 text-emerald-650" />
            <span className="absolute -top-2 -right-2 bg-emerald-600 text-white text-xs font-bold px-2 py-0.5 rounded-full shadow-sm">{matches.length}</span>
          </div>
          <div className="text-center">
            <h3 className="font-display font-bold text-slate-800 text-base uppercase tracking-wider mb-1">Gerenciar Bolão</h3>
            <p className="text-xs text-slate-500 font-medium">Cadastrar partidas, palpites manuais e resultados.</p>
          </div>
        </Link>
        <Link 
          to="/admin/logs" 
          className="bg-white p-6 rounded-3xl shadow-md border border-slate-200 hover:border-indigo-300 hover:shadow-lg transition-all group relative overflow-hidden flex flex-col justify-center items-center gap-3 cursor-pointer"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-[50px] pointer-events-none group-hover:bg-indigo-500/10 transition-colors"></div>
          <div className="bg-indigo-50 p-4 rounded-full text-indigo-600 group-hover:scale-110 group-hover:bg-indigo-100 transition-all">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></svg>
          </div>
          <div className="text-center">
            <h3 className="font-display font-bold text-slate-800 text-base uppercase tracking-wider mb-1">Logs de Apostas</h3>
            <p className="text-xs text-slate-500 font-medium">Histórico detalhado das apostas no sistema.</p>
          </div>
        </Link>
        <Link 
          to="/admin/transactions" 
          className="bg-white p-6 rounded-3xl shadow-md border border-slate-200 hover:border-blue-300 hover:shadow-lg transition-all group relative overflow-hidden flex flex-col justify-center items-center gap-3 cursor-pointer"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-[50px] pointer-events-none group-hover:bg-blue-500/10 transition-colors"></div>
          <div className="bg-blue-50 p-4 rounded-full text-blue-600 group-hover:scale-110 group-hover:bg-blue-100 transition-all flex items-center justify-center relative">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
            <span className="absolute -top-2 -right-2 bg-blue-600 text-white text-xs font-bold px-2 py-0.5 rounded-full shadow-sm">{transactions.length}</span>
          </div>
          <div className="text-center">
            <h3 className="font-display font-bold text-slate-800 text-base uppercase tracking-wider mb-1">Transações</h3>
            <p className="text-xs text-slate-500 font-medium">Histórico de entrada e saída de saldos do site.</p>
          </div>
        </Link>
        <Link 
          to="/admin/sorteios" 
          className="bg-white p-6 rounded-3xl shadow-md border border-slate-200 hover:border-amber-300 hover:shadow-lg transition-all group relative overflow-hidden flex flex-col justify-center items-center gap-3 cursor-pointer"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-[50px] pointer-events-none group-hover:bg-amber-500/10 transition-colors"></div>
          <div className="bg-amber-50 p-4 rounded-full text-amber-600 group-hover:scale-110 group-hover:bg-amber-100 transition-all flex items-center justify-center relative animate-pulse">
            <Dices className="w-8 h-8 text-amber-600" />
          </div>
          <div className="text-center">
            <h3 className="font-display font-bold text-slate-800 text-base uppercase tracking-wider mb-1">Sorteios</h3>
            <p className="text-xs text-slate-500 font-medium">Gestão integrada do PIX Premiado.</p>
          </div>
        </Link>
      </div>


      {/* Winners Section Config */}
      <div className="bg-white border border-slate-200 p-6 md:p-8 rounded-3xl shadow-sm mb-12">
        <h2 className="font-display font-bold mb-6 text-slate-800 text-lg uppercase tracking-wider">Configurar Seção de Vencedores na Home</h2>
        <div className="flex flex-col space-y-5 max-w-xl">
          <div>
            <label className="block text-slate-500 text-xs font-bold uppercase tracking-wider mb-2">Exibir Seção na Página Inicial</label>
            <div className="flex items-center gap-3">
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  className="sr-only peer" 
                  checked={winnersActive}
                  onChange={(e) => setWinnersActive(e.target.checked)}
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
              </label>
              <span className="text-sm font-bold text-slate-700">{winnersActive ? 'Ativada' : 'Desativada'}</span>
            </div>
          </div>

          <div>
            <label className="block text-slate-500 text-xs font-bold uppercase tracking-wider mb-2">Partida Oficial a Divulgar</label>
            <select 
              value={winnersMatchId} 
              onChange={(e) => setWinnersMatchId(e.target.value)} 
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 font-bold outline-none focus:bg-white focus:ring-2 focus:ring-emerald-500/25 transition-all"
            >
              <option value="">Selecione uma partida oficial...</option>
              {matches.filter(m => !m.isPromotional && m.status === 'finished').map(m => (
                <option key={m.id} value={m.id}>{m.team1} x {m.team2} - {new Date(m.date).toLocaleDateString('pt-BR')} ({m.status})</option>
              ))}
            </select>
          </div>

          <div className="pt-4 flex justify-between items-center border-t border-slate-100">
             <div className="text-xs text-slate-400 font-mono">
               Última att: {formatDateTime(winnersSettings?.updatedAt)}
             </div>
             <button 
                onClick={handleSaveWinnersSettings} 
                disabled={savingWinnersSection}
                className="bg-slate-800 hover:bg-slate-900 text-white font-bold px-6 py-2.5 rounded-xl text-sm transition-colors cursor-pointer shadow-sm disabled:opacity-50"
             >
                {savingWinnersSection ? 'Salvando...' : 'Salvar Alterações'}
             </button>
          </div>
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
          <button onClick={() => setToast(null)} className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer" title="Fechar">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Transaction Action Confirmation Modal */}
      {pendingAction && (() => {
        const t = pendingAction.transaction;
        const u = users.find(user => user.id === t.userId);
        const isApprove = pendingAction.type === 'approve';
        return (
          <div className="fixed inset-0 bg-slate-900/45 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
            <div className="bg-white rounded-3xl border border-slate-200 w-full max-w-md overflow-hidden flex flex-col shadow-2xl relative">
              {/* Header */}
              <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                <h3 className="text-lg font-display font-bold text-slate-800 flex items-center gap-2">
                  <AlertTriangle className={`w-5 h-5 ${isApprove ? 'text-emerald-600' : 'text-amber-600'}`} />
                  <span>Confirmar Ação</span>
                </h3>
                <button 
                  onClick={() => setPendingAction(null)} 
                  className="text-slate-400 hover:text-slate-600 bg-slate-100 hover:bg-slate-200 p-2 rounded-full transition-colors cursor-pointer"
                  title="Fechar"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Body */}
              <div className="p-6 space-y-4">
                <p className="text-slate-650 text-sm leading-relaxed">
                  Deseja realmente <strong className={isApprove ? "text-emerald-700 font-bold" : "text-red-700 font-bold"}>
                    {isApprove ? 'APROVAR' : 'RECUSAR E EXCLUIR'}
                  </strong> o {t.type === 'deposit' ? 'depósito' : 'saque'} de <span className="font-mono text-slate-800 font-bold bg-slate-100 px-2 py-0.5 rounded">R$ {t.amount.toFixed(2)}</span> solicitado por <strong className="text-slate-800 font-bold">{u?.displayId ? `#${u.displayId} - ` : ''}{u?.name || 'Jogador'}</strong>?
                </p>
                {t.type === 'withdrawal' && (
                  <div className="space-y-3">
                    <div className="bg-slate-50 border border-slate-200 p-3 rounded-lg flex flex-col gap-1">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Chave PIX do Usuário</span>
                      <span className="font-mono text-sm text-slate-800 font-bold break-all select-all">{u?.pix_key || 'Não informada'}</span>
                    </div>
                    {isApprove && (
                      <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-xl flex flex-col gap-2">
                        <label className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider block">
                          Data/Hora do PIX Realizado
                        </label>
                        <input 
                          type="datetime-local" 
                          value={pixReceiptDate}
                          onChange={(e) => setPixReceiptDate(e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-emerald-200 rounded-lg focus:ring-2 focus:ring-emerald-500/35 outline-none text-slate-800 font-mono text-sm"
                        />
                      </div>
                    )}
                  </div>
                )}
                {!isApprove && (
                  <p className="text-xs text-amber-800 font-semibold bg-amber-50 border border-amber-200 p-2.5 rounded-xl">
                    Aviso: Recusar esta transação irá deletá-la definitivamente de todos os históricos!
                  </p>
                )}
              </div>

              {/* Footer */}
              <div className="p-6 border-t border-slate-250 flex justify-end gap-3 bg-slate-50">
                <button 
                  onClick={() => {
                    setPendingAction(null);
                    setPixReceiptDate('');
                  }} 
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-250 rounded-xl px-4 py-2.5 font-bold text-xs transition-colors cursor-pointer uppercase tracking-wider"
                >
                  Cancelar
                </button>
                <button 
                  disabled={isApprove && t.type === 'withdrawal' && !pixReceiptDate}
                  onClick={async () => {
                    const actionItem = pendingAction;
                    const dateVal = pixReceiptDate;
                    setPendingAction(null);
                    setPixReceiptDate('');
                    if (actionItem.type === 'approve') {
                      await executeApproveTransaction(actionItem.transaction, dateVal);
                    } else {
                      await executeRejectTransaction(actionItem.transaction);
                    }
                  }} 
                  className={`rounded-xl px-4 py-2.5 font-bold text-xs transition-colors cursor-pointer uppercase tracking-wider text-white shadow-sm disabled:opacity-50 disabled:cursor-not-allowed ${
                    isApprove ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-amber-600 hover:bg-amber-700'
                  }`}
                >
                  {isApprove ? 'Sim, Aprovar' : 'Sim, Recusar'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Bet Action Confirmation Modal */}
      {pendingBetAction && (() => {
        const b = pendingBetAction.bet;
        const u = users.find(user => user.id === b.userId);
        const m = matches.find(match => match.id === b.matchId);
        const isApprove = pendingBetAction.type === 'approve';
        return (
          <div className="fixed inset-0 bg-slate-900/45 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
            <div className="bg-white rounded-3xl border border-slate-200 w-full max-w-md overflow-hidden flex flex-col shadow-2xl relative">
              {/* Header */}
              <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                <h3 className="text-lg font-display font-bold text-slate-800 flex items-center gap-2">
                  <AlertTriangle className={`w-5 h-5 ${isApprove ? 'text-emerald-600' : 'text-amber-600'}`} />
                  <span>Confirmar Aposta</span>
                </h3>
                <button 
                  onClick={() => setPendingBetAction(null)} 
                  className="text-slate-400 hover:text-slate-650 bg-slate-100 hover:bg-slate-200 p-2 rounded-full transition-colors cursor-pointer"
                  title="Fechar"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Body */}
              <div className="p-6 space-y-4">
                <p className="text-slate-650 text-sm leading-relaxed">
                  Deseja realmente <strong className={isApprove ? "text-emerald-700 font-bold" : "text-red-700 font-bold"}>
                    {isApprove ? 'APROVAR' : 'RECUSAR E DELETAR'}
                  </strong> o palpite de <strong className="text-slate-800 font-bold">{b.predicted1} x {b.predicted2}</strong> para a partida <strong className="text-slate-800 font-bold">{m ? `${m.team1} x ${m.team2}` : 'Carregando...'}</strong> realizado por <strong className="text-slate-800 font-bold">{u?.displayId ? `#${u.displayId} - ` : ''}{u?.name || b.userName}</strong>?
                </p>
                
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs text-slate-500 space-y-1">
                  <div>Status de Pagamento: <strong className={b.paid ? "text-emerald-700 font-semibold" : "text-amber-700 font-semibold"}>{b.paid ? "Pago (Debitado)" : "Falta Saldo (Pagará do saldo atual)"}</strong></div>
                  <div>Valor da Aposta: <strong className="text-slate-800 font-bold">R$ {b.amount.toFixed(2)}</strong></div>
                </div>

                {!isApprove && (
                  <p className="text-xs text-amber-800 font-semibold bg-amber-50 border border-amber-20 border-teal-200 rounded-xl p-2.5">
                    Aviso: Recusar esta aposta irá deletá-la definitivamente. Caso ela estivesse paga, os R$ {b.amount.toFixed(2)} serão reembolsados ao saldo do usuário!
                  </p>
                )}
              </div>

              {/* Footer */}
              <div className="p-6 border-t border-slate-200 flex justify-end gap-3 bg-slate-50">
                <button 
                  onClick={() => setPendingBetAction(null)} 
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl px-4 py-2.5 font-bold text-xs transition-colors cursor-pointer uppercase tracking-wider"
                >
                  Cancelar
                </button>
                <button 
                  onClick={async () => {
                    const actionItem = pendingBetAction;
                    setPendingBetAction(null);
                    if (actionItem.type === 'approve') {
                      await executeApproveBet(actionItem.bet);
                    } else {
                      await executeRejectBet(actionItem.bet);
                    }
                  }} 
                  className={`rounded-xl px-4 py-2.5 font-bold text-xs transition-colors cursor-pointer uppercase tracking-wider text-white shadow-md ${
                    isApprove ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-amber-600 hover:bg-amber-700'
                  }`}
                >
                  {isApprove ? 'Sim, Aprovar' : 'Sim, Recusar'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}


    </div>
  );
}
