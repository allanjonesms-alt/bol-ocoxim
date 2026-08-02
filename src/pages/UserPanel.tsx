import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, doc, updateDoc, runTransaction, getDocs, limit } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { Bet, Transaction, Match, PixPremiadoGame, UserProfile, PixPremiadoDraw } from '../types';
import { handleFirestoreError, OperationType } from '../lib/error-handler';
import { QrCode, Wallet, ArrowDownToLine, ArrowUpFromLine, Clock, CheckCircle2, Trophy, X, Copy, Check, Sparkles, Award, Calendar, Trash2 } from 'lucide-react';
import { fetchAvailableFederalNumbers } from '../utils/loteriaFederal';
import { calculatePixTicketPrice } from '../utils/pixPricing';

export default function UserPanel() {
  const { user, profile } = useAuth();
  const [bets, setBets] = useState<(Bet & { match?: Match })[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [raffleGames, setRaffleGames] = useState<PixPremiadoGame[]>([]);

  // Pix Premiado states
  const [activePixDraws, setActivePixDraws] = useState<PixPremiadoDraw[]>([]);
  const [isPurchasingPix, setIsPurchasingPix] = useState(false);
  const [pixTicketCount, setPixTicketCount] = useState('1');
  const [pixToast, setPixToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [recentBoughtTickets, setRecentBoughtTickets] = useState<any[]>([]);
  const [showPixBoughtModal, setShowPixBoughtModal] = useState(false);

  // Refund and delete ticket states/logic
  const [ticketToRefund, setTicketToRefund] = useState<PixPremiadoGame | null>(null);
  const [isDeletingTicketId, setIsDeletingTicketId] = useState<string | null>(null);

  const handleRefundTicket = async (game: PixPremiadoGame) => {
    if (!user || !profile) return;
    setIsDeletingTicketId(game.id);
    try {
      await runTransaction(db, async (transaction) => {
        const userRef = doc(db, 'users', game.userId);
        const userSnap = await transaction.get(userRef);
        if (!userSnap.exists()) throw new Error('Perfil de usuário não encontrado.');

        const freshProfile = userSnap.data() as UserProfile;
        const freshBalance = freshProfile.balance || 0;

        // Refund user balance
        const refundedBalance = freshBalance + game.price;
        transaction.update(userRef, { balance: refundedBalance });

        // Log transaction
        const transRef = doc(collection(db, 'transactions'));
        transaction.set(transRef, {
          userId: game.userId,
          type: 'refund',
          amount: game.price,
          status: 'confirmed',
          timestamp: serverTimestamp(),
          description: `Cancelamento de bilhete Pix Premiado #${game.id} - Reembolso de R$ ${game.price.toFixed(2)}`
        });

        // Delete game document
        const gameRef = doc(db, 'pix_premiado_games', game.id);
        transaction.delete(gameRef);
      });

      // Update pool doc to not assigned (if it was a pool game)
      if (game.numbers.length > 1) {
        try {
          const poolQuery = query(
            collection(db, 'pix_premiado_pool'),
            where('assigned', '==', true),
            where('assignedUserId', '==', game.userId)
          );
          const poolSnap = await getDocs(poolQuery);
          const gameNumbersStr = game.numbers.join('-');
          const matchingPoolDoc = poolSnap.docs.find(d => {
            const numbers = d.data().numbers as number[];
            return numbers && numbers.join('-') === gameNumbersStr;
          });

          if (matchingPoolDoc) {
            await updateDoc(doc(db, 'pix_premiado_pool', matchingPoolDoc.id), {
              assigned: false,
              assignedUserId: null,
              assignedUserName: null,
              assignedAt: null
            });

            // Update metadata count
            const metaRef = doc(db, 'pix_premiado_metadata', 'pool');
            await runTransaction(db, async (transaction) => {
              const metaSnap = await transaction.get(metaRef);
              const currentAssigned = metaSnap.exists() ? (metaSnap.data().assignedGames || 0) : 0;
              transaction.set(metaRef, {
                assignedGames: Math.max(0, currentAssigned - 1)
              }, { merge: true });
            });
          }
        } catch (poolErr) {
          console.error("Error releasing pool ticket or updating metadata:", poolErr);
        }
      }

      setPixToast({ message: `Bilhete cancelado e R$ ${game.price.toFixed(2)} reembolsados com sucesso!`, type: 'success' });
      setTimeout(() => setPixToast(null), 4000);
    } catch (err: any) {
      console.error(err);
      setPixToast({ message: err.message || 'Erro ao cancelar bilhete.', type: 'error' });
      setTimeout(() => setPixToast(null), 4000);
    } finally {
      setIsDeletingTicketId(null);
      setTicketToRefund(null);
    }
  };
  
  const [showPix, setShowPix] = useState(false);
  const [depositAmount, setDepositAmount] = useState('50');
  const [requestWithdraw, setRequestWithdraw] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [copiedPix, setCopiedPix] = useState(false);
  
  const [pixKeyInput, setPixKeyInput] = useState('');
  const [isUpdatingPixKey, setIsUpdatingPixKey] = useState(false);

  useEffect(() => {
    if (profile?.pix_key) {
      setPixKeyInput(profile.pix_key);
    }
  }, [profile]);

  
  const pixCode = '00020126360014BR.GOV.BCB.PIX0114+55679843730395204000053039865802BR5901N6001C62140510BOLAOCOXIM63049152';

  const handleCopyPix = async () => {
    try {
      await navigator.clipboard.writeText(pixCode);
      setCopiedPix(true);
      setTimeout(() => setCopiedPix(false), 2000);
    } catch (err) {
      console.error('Failed to copy Pix code', err);
    }
  };
  
  const [searchParams, setSearchParams] = useSearchParams();
  const [showFinanceModal, setShowFinanceModal] = useState(false);

  useEffect(() => {
    if (searchParams.get('openFinance') === 'true') {
      setShowFinanceModal(true);
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('openFinance');
      setSearchParams(newParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);
  
  useEffect(() => {
    if (!user) return;
    
    const qBets = query(collection(db, 'bets'), where('userId', '==', user.uid));
    const unsubBets = onSnapshot(qBets, async (snapshot) => {
      const betsData = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Bet));
      setBets(betsData);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'bets'));
    
    const qTrans = query(collection(db, 'transactions'), where('userId', '==', user.uid));
    const unsubTrans = onSnapshot(qTrans, (snapshot) => {
      const transData = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Transaction));
      transData.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setTransactions(transData);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'transactions'));

    const unsubMatches = onSnapshot(collection(db, 'matches'), (snapshot) => {
      setMatches(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Match)));
    });

    const qRaffle = query(collection(db, 'pix_premiado_games'), where('userId', '==', user.uid));
    const unsubRaffle = onSnapshot(qRaffle, (snapshot) => {
      const raffleData = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as PixPremiadoGame));
      setRaffleGames(raffleData);
    });

    const qPix = query(collection(db, 'pix_premiado_draws'), where('status', '==', 'active'));
    const unsubPixDraws = onSnapshot(qPix, (snapshot) => {
      const draws = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PixPremiadoDraw));
      setActivePixDraws(draws);
    });

    return () => { unsubBets(); unsubTrans(); unsubMatches(); unsubRaffle(); unsubPixDraws(); };
  }, [user]);

  const handleDepositRequest = async () => {
    const amount = parseFloat(depositAmount);
    if (isNaN(amount) || amount <= 0) return;
    
    try {
      await addDoc(collection(db, 'pix_requests'), {
        userId: user!.uid,
        userName: profile.name,
        amount,
        type: 'deposit',
        verified: false,
        timestamp: serverTimestamp()
      });
      setShowPix(true);
    } catch(err) {
      console.error(err);
      setShowPix(true); // show pix anyway
    }
  };

  const handleConfirmPayment = async () => {
    const amount = parseFloat(depositAmount);
    if (isNaN(amount) || amount <= 0) return;
    
    try {
      await addDoc(collection(db, 'transactions'), {
        userId: user!.uid,
        type: 'deposit',
        amount,
        status: 'pending',
        timestamp: serverTimestamp()
      });
      setShowPix(false);
      alert('Seu depósito de R$ ' + amount.toFixed(2) + ' foi registrado como PENDENTE e aguarda validação do administrador!');
    } catch(err) {
      handleFirestoreError(err, OperationType.CREATE, 'transactions');
    }
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
      setPixToast({ message: 'Por favor, faça login para comprar bilhetes!', type: 'error' });
      setTimeout(() => setPixToast(null), 4000);
      return;
    }

    const count = parseInt(pixTicketCount);
    if (isNaN(count) || count <= 0) {
      setPixToast({ message: 'Por favor, insira uma quantidade de bilhetes válida.', type: 'error' });
      setTimeout(() => setPixToast(null), 4000);
      return;
    }

    const { finalPrice, discountPercent } = calculatePixTicketPrice(count);
    const totalCost = finalPrice;
    const ticketPriceVal = count > 0 ? (finalPrice / count) : 1.00;
    const currentBalance = profile.balance || 0;

    if (currentBalance < totalCost) {
      setPixToast({ message: `Você não possui saldo suficiente (Saldo: R$ ${currentBalance.toFixed(2)} / Custo: R$ ${totalCost.toFixed(2)}).`, type: 'error' });
      setTimeout(() => setPixToast(null), 4000);
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
            description: `Compra de ${count} bilhete(s) Loteria Federal (Pix Premiado)`
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
        setPixToast({ message: `${count} bilhete(s) Loteria Federal comprado(s) com sucesso por R$ ${totalCost.toFixed(2)}!`, type: 'success' });
        setTimeout(() => setPixToast(null), 4000);
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
            type: 'bet', // Mark type as bet so it tracks properly
            amount: -totalCost,
            status: 'confirmed',
            timestamp: serverTimestamp(),
            description: `Compra de ${count} bilhete(s) do Pool PIX PREMIADO`
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
        setPixToast({ message: `${count} bilhete(s) do pool comprado(s) com sucesso por R$ ${totalCost.toFixed(2)}!`, type: 'success' });
        setTimeout(() => setPixToast(null), 4000);
        setPixTicketCount('1');
      }
    } catch (err: any) {
      console.error(err);
      setPixToast({ message: err.message || 'Erro ao comprar bilhetes.', type: 'error' });
      setTimeout(() => setPixToast(null), 4000);
    } finally {
      setIsPurchasingPix(false);
    }
  };

  const handleWithdrawRequest = async () => {
    const amount = parseFloat(withdrawAmount);
    if (isNaN(amount) || amount <= 0 || amount > profile!.balance) {
      alert('Valor inválido ou saldo insuficiente.');
      return;
    }

    const currentPixKey = (profile?.pix_key || pixKeyInput || '').trim();
    if (!currentPixKey) {
      alert('Chave PIX obrigatória. Por favor, digite sua chave PIX para podermos efetuar a transferência.');
      return;
    }
    
    try {
      if (profile?.pix_key !== currentPixKey) {
        await updateDoc(doc(db, 'users', user!.uid), {
          pix_key: currentPixKey
        });
      }

      await addDoc(collection(db, 'transactions'), {
        userId: user!.uid,
        type: 'withdrawal',
        amount,
        status: 'pending',
        timestamp: serverTimestamp()
      });
      setRequestWithdraw(false);
      setWithdrawAmount('');
      alert('Solicitação de saque enviada com sucesso! O administrador fará a transferência e debitará de seu saldo.');
    } catch(err) {
      handleFirestoreError(err, OperationType.CREATE, 'transactions');
    }
  };

  const handleUpdatePixKey = async () => {
    if (!user) return;
    setIsUpdatingPixKey(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        pix_key: pixKeyInput
      });
      alert('Chave PIX atualizada com sucesso!');
    } catch(err) {
      console.error(err);
      alert('Erro ao atualizar a chave PIX.');
    } finally {
      setIsUpdatingPixKey(false);
    }
  };

  if (!profile) return null;

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-fade-in">
      <h1 className="text-3xl font-display font-bold text-slate-800 tracking-tight">Painel do Usuário</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Profile Card */}
        <div className="bg-white rounded-3xl shadow-md border border-slate-200 p-8 md:col-span-1 flex flex-col items-center text-center relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-[50px] pointer-events-none"></div>
          
          <div className="h-24 w-24 bg-emerald-50 border-2 border-emerald-500/25 text-emerald-600 rounded-full flex items-center justify-center text-4xl font-display font-bold mb-5 shadow-sm relative z-10">
            {profile.name.charAt(0).toUpperCase()}
          </div>
          <h2 className="text-xl font-display font-bold text-slate-800 relative z-10 flex items-center gap-2">
            <span className="text-emerald-600">#{profile.displayId || '---'}</span>
            <span>{profile.name}</span>
          </h2>
          <p className="text-slate-500 text-sm mb-4 font-medium relative z-10">{profile.email}</p>
          
          <div className="w-full relative z-10 mb-8 border border-slate-200 rounded-xl p-3 bg-slate-50 flex flex-col text-left">
             <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Sua Chave PIX (Para Saques)</span>
             <div className="flex gap-2">
               <input 
                 type="text" 
                 value={pixKeyInput}
                 onChange={e => setPixKeyInput(e.target.value)}
                 placeholder="Insira sua chave PIX..."
                 className="w-full text-xs font-mono text-slate-700 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-500"
               />
               <button 
                 onClick={handleUpdatePixKey}
                 disabled={isUpdatingPixKey || pixKeyInput === (profile.pix_key || '')}
                 className="px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1 cursor-pointer transition-colors shrink-0 bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
               >
                 Salvar
               </button>
             </div>
          </div>
          
          <button 
            id="balance-button-userpanel"
            onClick={() => setShowFinanceModal(true)}
            className="w-full bg-slate-50 hover:bg-slate-100/80 p-5 rounded-2xl border border-slate-200 hover:border-emerald-500/30 transition-all flex flex-col items-center relative z-10 group cursor-pointer focus:outline-none"
          >
            <span className="text-sm font-semibold text-slate-555 group-hover:text-emerald-700 transition-colors uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <Wallet className="h-4 w-4 text-emerald-600" /> Saldo Disponível
            </span>
            <span className="text-4xl font-bold text-emerald-700 font-mono group-hover:scale-105 transition-transform duration-200">
              R$ {(profile.balance ?? 0).toFixed(2)}
            </span>
            <span className="text-[10px] text-slate-400 mt-2 group-hover:text-slate-500 transition-colors">
              Clique para depositar ou sacar
            </span>
          </button>
        </div>

        {/* Banking Controls */}
        <div className="bg-white rounded-3xl shadow-md border border-slate-200 p-8 md:col-span-2 flex flex-col relative overflow-hidden">
          <div className="absolute top-0 right-0 w-48 h-48 bg-blue-500/5 rounded-full blur-[60px] pointer-events-none"></div>
          
          <h3 className="text-xl font-display font-bold text-slate-850 mb-6 flex items-center relative z-10">
            <Wallet className="h-6 w-6 mr-3 text-slate-500" />
            Movimentação Financeira
          </h3>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 flex-1 relative z-10">
            {/* Deposit */}
            <div className="bg-slate-50/60 border border-emerald-100/85 rounded-2xl p-6 flex flex-col shadow-inner">
              <h4 className="font-bold text-slate-800 mb-2 flex items-center text-lg">
                <ArrowDownToLine className="h-5 w-5 mr-2 text-emerald-600" /> Depositar
              </h4>
              <p className="text-xs text-slate-500 mb-6 font-medium leading-relaxed">Adicione créditos para fazer apostas. Suas apostas pendentes serão confirmadas automaticamente.</p>
              
              {!showPix ? (
                <div className="mt-auto space-y-4">
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">R$</span>
                    <input 
                      type="number" 
                      value={depositAmount} 
                      onChange={e => setDepositAmount(e.target.value)} 
                      className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500/35 text-slate-800 font-mono font-semibold"
                      placeholder="0.00"
                    />
                  </div>
                  <button onClick={handleDepositRequest} className="w-full bg-emerald-605 hover:bg-emerald-705 text-white font-bold rounded-xl py-3.5 transition-colors shadow-md shadow-emerald-500/10 cursor-pointer">
                    Gerar PIX
                  </button>
                </div>
              ) : (
                <div className="mt-auto flex flex-col items-center bg-white p-5 rounded-xl border border-emerald-100 relative shadow-sm">
                  <img 
                    src="https://lh3.googleusercontent.com/d/1b4csBjKmNy33G5G1lo3lB_Alfb-_bzkf" 
                    alt="PIX QR Code" 
                    className="w-48 h-48 object-contain mb-3 rounded-lg" 
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = "https://docs.google.com/uc?export=download&id=1b4csBjKmNy33G5G1lo3lB_Alfb-_bzkf";
                    }}
                  />
                  <p className="text-xs text-center text-slate-600 font-medium mb-3">Escaneie o QR Code no seu app de banco.</p>
                  
                  {/* Pix Copia e Cola */}
                  <div className="w-full mb-4 bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col text-left">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Pix Copia e Cola</span>
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        readOnly 
                        value={pixCode} 
                        className="w-full text-xs font-mono text-slate-700 bg-slate-100 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none select-all overflow-hidden text-ellipsis"
                      />
                      <button 
                        onClick={handleCopyPix}
                        type="button"
                        className={`px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1 cursor-pointer transition-colors shrink-0 ${
                          copiedPix 
                            ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' 
                            : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                        }`}
                        title="Copiar Código Pix"
                      >
                        {copiedPix ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                        {copiedPix ? 'Copiado!' : 'Copiar'}
                      </button>
                    </div>
                  </div>

                  <button 
                    onClick={handleConfirmPayment}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl py-2.5 px-4 transition-colors text-sm uppercase shadow-md mb-2 cursor-pointer"
                  >
                    EFETUEI O PAGAMENTO
                  </button>
                  <button 
                    onClick={() => setShowPix(false)} 
                    className="text-xs font-bold text-slate-400 hover:text-slate-600 uppercase tracking-wider cursor-pointer"
                  >
                    Cancelar
                  </button>
                </div>
              )}
            </div>

            {/* Withdraw */}
            <div className="bg-slate-50/60 border border-slate-200 rounded-2xl p-6 flex flex-col shadow-inner">
              <h4 className="font-bold text-slate-800 mb-2 flex items-center text-lg">
                <ArrowUpFromLine className="h-5 w-5 mr-2 text-slate-555" /> Sacar
              </h4>
              <p className="text-xs text-slate-500 mb-6 font-medium leading-relaxed">Solicite o saque do seu saldo. O administrador fará a transferência para sua chave PIX.</p>
              
              {!requestWithdraw ? (
                <button onClick={() => setRequestWithdraw(true)} className="mt-auto w-full bg-slate-150 hover:bg-slate-250 text-slate-700 border border-slate-200/80 rounded-xl py-3.5 font-bold transition-colors cursor-pointer">
                  Solicitar Saque
                </button>
              ) : (
                <div className="mt-auto space-y-4">
                  {!(profile?.pix_key || '').trim() && (
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-red-600 uppercase tracking-wider block">Chave PIX Obrigatória para Receber o Saque</label>
                      <input 
                        type="text" 
                        value={pixKeyInput} 
                        onChange={e => setPixKeyInput(e.target.value)} 
                        placeholder="Digite sua chave PIX aqui..."
                        className="w-full px-4 py-2.5 bg-white border border-red-200 focus:border-red-450 rounded-xl outline-none text-slate-800 text-xs font-mono"
                      />
                    </div>
                  )}
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">R$</span>
                    <input 
                      type="number" 
                      value={withdrawAmount} 
                      onChange={e => setWithdrawAmount(e.target.value)} 
                      className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500/35 text-slate-800 font-mono font-semibold"
                      placeholder="0.00"
                    />
                  </div>
                  <div className="flex space-x-3">
                    <button onClick={handleWithdrawRequest} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl py-3.5 transition-colors cursor-pointer">
                      Confirmar
                    </button>
                    <button onClick={() => setRequestWithdraw(false)} className="px-5 bg-slate-200 hover:bg-slate-300 text-slate-705 rounded-xl font-bold transition-colors border border-slate-250 cursor-pointer">
                      Sair
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* History Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Seção PIX PREMIADO com Destaque Máximo */}
        <div className="lg:col-span-2 bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-950 border-2 border-indigo-500/45 p-8 rounded-3xl shadow-2xl relative overflow-hidden text-white animate-fade-in">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(99,102,241,0.22),transparent_50%)] pointer-events-none"></div>
          
          <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-indigo-500/25 pb-5 mb-6">
            <div>
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <span className="bg-gradient-to-r from-yellow-400 to-amber-300 text-slate-950 text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-wider shadow-sm shrink-0">
                  ⭐ MÓDULO EXCLUSIVO ESTRELA
                </span>
                <span className="bg-indigo-900/60 border border-indigo-500/30 text-indigo-200 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wide shrink-0">
                  PREMIAÇÃO MÁXIMA
                </span>
              </div>
              <h3 className="text-2xl sm:text-3xl font-display font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-amber-200 to-yellow-400 flex items-center gap-2.5">
                <Sparkles className="h-7 w-7 text-yellow-400 animate-spin shrink-0" style={{ animationDuration: '8s' }} />
                Seus Bilhetes - PIX PREMIADO
              </h3>
              <p className="text-xs sm:text-sm text-indigo-200/80 mt-1 font-medium leading-relaxed max-w-2xl">
                Acompanhe seus bilhetes adquiridos para o sorteio especial do PIX PREMIADO. Cada jogo possui dezenas e quadras exclusivas, garantindo premiações únicas!
              </p>
            </div>
            
            <div className="flex items-center gap-2 shrink-0">
              <span className="bg-emerald-500/10 text-emerald-300 border border-emerald-500/35 text-xs font-bold px-4 py-1.5 rounded-xl uppercase tracking-wider shadow-sm">
                ● ATIVO E CONFIRMADO
              </span>
            </div>
          </div>

          {/* Pix Premiado Toast Notification */}
          {pixToast && (
            <div className={`mb-6 p-4 rounded-2xl border text-sm font-semibold flex items-center gap-2 animate-fade-in relative z-10 ${
              pixToast.type === 'success' 
                ? 'bg-emerald-950/60 text-emerald-300 border-emerald-550/40' 
                : 'bg-rose-950/60 text-rose-300 border-rose-550/40'
            }`}>
              {pixToast.type === 'success' ? <CheckCircle2 className="w-5 h-5 text-emerald-400" /> : <X className="w-5 h-5 text-rose-400" />}
              <span>{pixToast.message}</span>
            </div>
          )}

          {/* Seção para Compra Rápida se houver sorteio ativo */}
          {activePixDraws.length > 0 && (
            <div className="mb-8 bg-slate-900/80 text-white rounded-2xl p-5 border border-indigo-500/30 relative overflow-hidden shadow-inner z-10">
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(99,102,241,0.15),transparent_50%)] pointer-events-none"></div>
              
              <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="bg-amber-400 text-slate-950 text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
                      Sorteio Ativo
                    </span>
                    <span className="text-[10px] font-bold text-indigo-300">
                      {activePixDraws[0].type === 'Loteria Federal' ? '🎰 LOTERIA FEDERAL' : '🔮 MEGA-SENA'}
                    </span>
                    <span className="text-[10px] font-semibold text-slate-300 bg-slate-950/60 px-2 py-0.5 rounded border border-slate-850/60">
                      Sorteio: {activePixDraws[0].date ? activePixDraws[0].date.split('-').reverse().join('/') : '-'} às {activePixDraws[0].time || '-'}
                    </span>
                  </div>
                  <h4 className="text-lg font-black text-slate-100 flex items-center gap-1.5">
                    {activePixDraws[0].type === 'Loteria Federal' ? 'Extração da Loteria Federal' : 'Sorteio Especial Mega-Sena'}
                  </h4>
                  {activePixDraws[0].observations && (
                    <p className="text-xs text-slate-300 max-w-lg line-clamp-2 italic">
                      {activePixDraws[0].observations}
                    </p>
                  )}
                </div>

                <div className="bg-slate-950/80 border border-indigo-500/20 rounded-xl p-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-4 shrink-0 shadow-lg">
                  <div className="space-y-1">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Qtd. Bilhetes
                    </label>
                    <div className="flex items-center gap-1">
                      {['1', '5', '10', '50'].map(val => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setPixTicketCount(val)}
                          className={`px-2.5 py-1 rounded text-xs font-bold transition-all border cursor-pointer ${
                            pixTicketCount === val
                              ? 'bg-yellow-400 border-yellow-400 text-slate-950 shadow'
                              : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                          }`}
                        >
                          {val}
                        </button>
                      ))}
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={pixTicketCount}
                        onChange={(e) => setPixTicketCount(e.target.value)}
                        className="w-12 bg-slate-900 border border-slate-800 text-white rounded px-1.5 py-1 text-xs text-center font-mono font-bold"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col justify-end pt-1 sm:pt-0">
                    <div className="flex justify-between items-center text-[10px] text-slate-400 font-bold uppercase mb-1">
                      <span>Total:</span>
                      <span className="text-yellow-400 font-mono text-xs font-black">
                        R$ {(parseInt(pixTicketCount) || 0).toFixed(2)}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={handleBuyPixTickets}
                      disabled={isPurchasingPix || !parseInt(pixTicketCount)}
                      className="bg-gradient-to-r from-yellow-400 via-amber-300 to-yellow-400 hover:from-yellow-500 hover:to-yellow-500 disabled:opacity-50 text-slate-950 font-black text-xs uppercase tracking-wider py-2.5 px-4 rounded-xl transition-all shadow-md shadow-yellow-400/5 active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      {isPurchasingPix ? (
                        <>
                          <span className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></span>
                          <span>Processando...</span>
                        </>
                      ) : (
                        <>
                          <Award className="w-3.5 h-3.5 shrink-0" />
                          <span>Comprar Bilhetes</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {raffleGames.length === 0 ? (
            <p className="text-sm text-slate-400 font-medium text-center py-10 bg-slate-900/40 border border-dashed border-indigo-500/20 rounded-2xl relative z-10">
              Você não possui nenhum bilhete no sorteio ativo. Adquira na Página Inicial ou utilize a compra rápida acima!
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 relative z-10">
              {raffleGames.map(game => (
                <div key={game.id} className="bg-slate-900/60 border border-indigo-500/25 rounded-2xl p-5 flex flex-col justify-between hover:border-indigo-400/40 hover:bg-slate-900/90 transition-all shadow-lg shadow-slate-950/40">
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-[10px] font-bold text-yellow-400 uppercase tracking-wider bg-yellow-400/10 border border-yellow-400/20 px-2.5 py-0.5 rounded-md">
                      🎟️ Bilhete Ativo
                    </span>
                    <span className="text-[10px] font-semibold text-indigo-300">
                      {game.createdAt ? (game.createdAt.toDate ? game.createdAt.toDate().toLocaleDateString('pt-BR') : new Date(game.createdAt).toLocaleDateString('pt-BR')) : '-'}
                    </span>
                  </div>
                  
                  <div className="flex justify-center mb-4 bg-slate-950/65 p-3.5 rounded-xl border border-indigo-950 shadow-inner">
                    {game.numbers.length === 1 ? (
                      <span className="px-5 py-2.5 bg-gradient-to-r from-indigo-900 to-indigo-950 border-2 border-indigo-500/40 text-yellow-400 font-mono text-xl font-black rounded-xl tracking-wider shadow-md">
                        Nº {String(game.numbers[0]).padStart(4, '0')}
                      </span>
                    ) : (
                      <div className="flex gap-2 justify-center flex-wrap">
                        {game.numbers.map((num, i) => (
                          <span key={i} className="w-9 h-9 rounded-full bg-slate-950 text-yellow-400 font-mono font-black text-sm flex items-center justify-center border-2 border-indigo-500/35 shadow-sm">
                            {String(num).padStart(2, '0')}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  
                  <div className="flex justify-between items-center border-t border-indigo-500/10 pt-3">
                    <div className="flex flex-col text-left">
                      <span className="text-[9px] text-indigo-300 uppercase font-bold tracking-wide">Custo:</span>
                      <span className="font-mono font-extrabold text-yellow-300 text-xs">R$ {game.price.toFixed(2)}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setTicketToRefund(game)}
                      className="px-3 py-1.5 rounded-xl border border-rose-500/20 hover:border-rose-500/40 text-rose-450 hover:text-rose-400 bg-rose-950/10 hover:bg-rose-950/25 font-bold text-[10px] uppercase tracking-wider flex items-center gap-1.5 cursor-pointer transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5 shrink-0" />
                      <span>Cancelar</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-3xl shadow-md border border-slate-200 p-8 relative overflow-hidden">
          <h3 className="text-xl font-display font-bold text-slate-850 mb-6 flex items-center">
            Histórico de Transações
          </h3>
          <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
            {transactions.length === 0 ? <p className="text-sm text-slate-400 font-medium text-center py-8">Nenhuma transação.</p> : transactions.map(t => (
              <div key={t.id} className="bg-slate-50 border border-slate-150 rounded-2xl p-4 flex justify-between items-center hover:border-slate-250 transition-colors">
                <div className="flex items-center">
                  <div className={`p-3 rounded-xl mr-4 border ${
                    t.status === 'pending' 
                      ? 'bg-orange-50 border-orange-200' 
                      : t.status === 'rejected'
                      ? 'bg-red-50 border-red-200'
                      : 'bg-emerald-50 border-emerald-100'
                  }`}>
                    {t.status === 'pending' ? (
                      <Clock className="h-5 w-5 text-orange-600" />
                    ) : t.status === 'rejected' ? (
                      <X className="h-5 w-5 text-red-650" />
                    ) : (
                      <CheckCircle2 className="h-5 w-5 text-emerald-650" />
                    )}
                  </div>
                  <div>
                    <div className="text-slate-805 font-extrabold capitalize text-base tracking-wide flex flex-col sm:flex-row sm:items-center gap-2">
                      <span>
                        {t.type === 'deposit' ? 'Depósito' : 
                         t.type === 'withdrawal' ? 'Saque' : 
                         t.type === 'manual_deduction' ? 'Remoção de Saldo' :
                         t.type === 'prize' ? 'Prêmio Recebido' : 'Aposta'}
                      </span>
                      {t.status === 'pending' && t.type === 'deposit' && (
                        <span className="text-[10px] uppercase font-bold text-orange-650 bg-orange-55 border border-orange-200 px-2.5 py-0.5 rounded-full inline-block">
                          PENDENTE (Aprovação do admin)
                        </span>
                      )}
                      {t.status === 'pending' && t.type === 'withdrawal' && (
                        <span className="text-[10px] uppercase font-bold text-amber-800 bg-yellow-50 border border-yellow-200 px-2.5 py-0.5 rounded-full inline-block">
                          Aguardando Saque
                        </span>
                      )}
                      {t.status === 'rejected' && (
                        <span className="text-[10px] uppercase font-bold text-red-700 bg-red-50 border border-red-200 px-2.5 py-0.5 rounded-full inline-block">
                          Recusada
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-450 mt-1 font-semibold">{new Date(t.timestamp).toLocaleDateString()}</div>
                    {t.type === 'withdrawal' && t.status === 'confirmed' && t.pixReceiptDate && (
                      <div className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-100 mt-1.5 px-2 py-0.5 rounded-md inline-block font-bold">
                        PIX realizado em: {new Date(t.pixReceiptDate).toLocaleString()}
                      </div>
                    )}
                  </div>
                </div>
                <div className={`text-lg font-mono font-bold px-3 py-1 rounded-lg border ${
                  ['deposit', 'prize'].includes(t.type) ? 'text-emerald-700 bg-emerald-50 border-emerald-100' : 'text-slate-655 bg-slate-100 border border-slate-205'
                }`}>
                  {['deposit', 'prize'].includes(t.type) ? '+' : '-'} R$ {t.amount.toFixed(2)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Finance Movement Modal */}
      {showFinanceModal && (
        <div id="finance-modal" className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl border border-slate-200 w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl relative p-6 sm:p-8">
            <button 
              onClick={() => setShowFinanceModal(false)}
              className="absolute top-6 right-6 text-slate-400 hover:text-slate-650 transition p-2 bg-slate-105 rounded-full hover:bg-slate-200 cursor-pointer"
              title="Fechar"
            >
              <X className="h-5 w-5" />
            </button>
            
            <h3 className="text-2xl font-display font-bold text-slate-800 mb-6 flex items-center">
              <Wallet className="h-7 w-7 mr-3 text-emerald-600" />
              Movimentação Financeira
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Deposit */}
              <div className="bg-slate-50/60 border border-emerald-100/85 rounded-2xl p-6 flex flex-col shadow-inner">
                <h4 className="font-bold text-slate-800 mb-2 flex items-center text-lg">
                  <ArrowDownToLine className="h-5 w-5 mr-2 text-emerald-600" /> Depositar
                </h4>
                <p className="text-xs text-slate-500 mb-6 font-medium leading-relaxed">Adicione créditos para fazer apostas. Suas apostas pendentes serão confirmadas automaticamente.</p>
                
                {!showPix ? (
                  <div className="mt-auto space-y-4">
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">R$</span>
                      <input 
                        type="number" 
                        value={depositAmount} 
                        onChange={e => setDepositAmount(e.target.value)} 
                        className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500/35 text-slate-850 font-mono font-bold"
                        placeholder="0.00"
                      />
                    </div>
                    <button onClick={handleDepositRequest} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl py-3.5 transition-colors shadow-md shadow-emerald-550/10 cursor-pointer">
                      Gerar PIX
                    </button>
                  </div>
                ) : (
                  <div className="mt-auto flex flex-col items-center bg-white p-5 rounded-xl border border-emerald-100 relative animate-fade-in shadow-sm">
                    <img 
                      src="https://lh3.googleusercontent.com/d/1b4csBjKmNy33G5G1lo3lB_Alfb-_bzkf" 
                      alt="PIX QR Code" 
                      className="w-48 h-48 object-contain mb-3 rounded-lg" 
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = "https://docs.google.com/uc?export=download&id=1b4csBjKmNy33G5G1lo3lB_Alfb-_bzkf";
                      }}
                    />
                    <p className="text-xs text-center text-slate-700 font-semibold mb-3">Escaneie o QR Code no seu app de banco.</p>
                    
                    {/* Pix Copia e Cola */}
                    <div className="w-full mb-4 bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col text-left">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Pix Copia e Cola</span>
                      <div className="flex gap-2">
                        <input 
                          type="text" 
                          readOnly 
                          value={pixCode} 
                          className="w-full text-xs font-mono text-slate-700 bg-slate-100 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none select-all overflow-hidden text-ellipsis"
                        />
                        <button 
                          onClick={handleCopyPix}
                          type="button"
                          className={`px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1 cursor-pointer transition-colors shrink-0 ${
                            copiedPix 
                              ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' 
                              : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                          }`}
                          title="Copiar Código Pix"
                        >
                          {copiedPix ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                          {copiedPix ? 'Copiado!' : 'Copiar'}
                        </button>
                      </div>
                    </div>

                    <button 
                      onClick={handleConfirmPayment}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl py-2.5 px-4 transition-colors text-sm uppercase shadow-md mb-2 cursor-pointer"
                    >
                      EFETUEI O PAGAMENTO
                    </button>
                    <button 
                      onClick={() => setShowPix(false)} 
                      className="text-xs font-bold text-slate-400 hover:text-slate-650 uppercase tracking-wider cursor-pointer"
                    >
                      Cancelar
                    </button>
                  </div>
                )}
              </div>

              {/* Withdraw */}
              <div className="bg-slate-50/60 border border-slate-200 rounded-2xl p-6 flex flex-col shadow-inner">
                <h4 className="font-bold text-slate-800 mb-2 flex items-center text-lg">
                  <ArrowUpFromLine className="h-5 w-5 mr-2 text-slate-505" /> Sacar
                </h4>
                <p className="text-xs text-slate-500 mb-6 font-medium leading-relaxed">Solicite o saque do seu saldo. O administrador fará a transferência para sua chave PIX.</p>
                
                {!requestWithdraw ? (
                  <button onClick={() => setRequestWithdraw(true)} className="mt-auto w-full bg-slate-200 hover:bg-slate-250 text-slate-700 border border-slate-250 rounded-xl py-3.5 font-bold transition-colors cursor-pointer">
                    Solicitar Saque
                  </button>
                ) : (
                  <div className="mt-auto space-y-4">
                    {!(profile?.pix_key || '').trim() && (
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-red-600 uppercase tracking-wider block">Chave PIX Obrigatória para Receber o Saque</label>
                        <input 
                          type="text" 
                          value={pixKeyInput} 
                          onChange={e => setPixKeyInput(e.target.value)} 
                          placeholder="Digite sua chave PIX aqui..."
                          className="w-full px-4 py-2.5 bg-white border border-red-200 focus:border-red-450 rounded-xl outline-none text-slate-800 text-xs font-mono"
                        />
                      </div>
                    )}
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">R$</span>
                      <input 
                        type="number" 
                        value={withdrawAmount} 
                        onChange={e => setWithdrawAmount(e.target.value)} 
                        className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500/35 text-slate-800 font-mono font-semibold"
                        placeholder="0.00"
                      />
                    </div>
                    <div className="flex space-x-3">
                      <button onClick={handleWithdrawRequest} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl py-3.5 transition-colors cursor-pointer">
                        Confirmar
                      </button>
                      <button onClick={() => setRequestWithdraw(false)} className="px-5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl font-bold transition-colors border border-slate-250 cursor-pointer">
                        Sair
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            <div className="mt-8 flex justify-end">
              <button 
                onClick={() => setShowFinanceModal(false)}
                className="bg-slate-150 hover:bg-slate-250 text-slate-705 px-6 py-2.5 rounded-xl text-sm font-bold border border-slate-250 transition duration-150 cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {showPixBoughtModal && recentBoughtTickets.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/90 backdrop-blur-md animate-fade-in">
          <div className="absolute inset-0" onClick={() => setShowPixBoughtModal(false)} />
          
          <div className="relative w-full max-w-lg bg-slate-950 text-white rounded-3xl overflow-hidden shadow-2xl border border-indigo-500/30 flex flex-col gap-6 p-6 sm:p-8 z-10 text-center">
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
                  <div>
                    {numbers.length === 1 ? (
                      <span className="px-3.5 py-1.5 bg-indigo-950 border border-indigo-500/35 text-indigo-100 font-mono text-sm font-black rounded-lg tracking-wider">
                        Nº {numbers[0].toString().padStart(4, '0')}
                      </span>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {numbers.map((n: number, nIdx: number) => (
                          <span key={nIdx} className="w-8 h-8 rounded-full bg-indigo-950 border border-indigo-500/40 text-indigo-200 font-mono text-xs font-black flex items-center justify-center shadow-inner">
                            {n.toString().padStart(2, '0')}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-indigo-950/20 border border-indigo-500/10 rounded-2xl p-4 text-xs text-indigo-300 text-left space-y-1">
              <span className="font-bold text-yellow-400 block mb-1">Dica de Ouro:</span>
              <p>Estes bilhetes estão salvos na sua conta e você pode visualizá-los a qualquer momento abaixo.</p>
            </div>

            <div className="flex gap-3 justify-center mt-2">
              <button
                onClick={() => setShowPixBoughtModal(false)}
                className="px-8 py-3.5 rounded-2xl bg-gradient-to-r from-yellow-400 to-amber-500 hover:from-yellow-500 hover:to-amber-600 text-slate-950 text-xs font-black uppercase tracking-wider transition-all shadow-lg shadow-yellow-400/10 hover:shadow-yellow-400/20 active:scale-95 cursor-pointer w-full"
              >
                FECHAR & CONTINUAR
              </button>
            </div>
          </div>
        </div>
      )}

      {ticketToRefund && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md">
          <div className="absolute inset-0" onClick={() => setTicketToRefund(null)} />
          
          <div className="relative w-full max-w-md bg-white text-slate-800 rounded-3xl overflow-hidden shadow-2xl border border-slate-100 flex flex-col gap-5 p-6 z-10 text-left animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-red-600 mb-2">
              <Trash2 className="w-6 h-6 shrink-0" />
              <h3 className="text-lg font-bold">Cancelar e Reembolsar Bilhete?</h3>
            </div>

            <p className="text-sm text-slate-500 leading-relaxed">
              Tem certeza de que deseja cancelar seu bilhete Pix Premiado? O bilhete será removido permanentemente de seus registros e o valor de <strong className="text-emerald-700">R$ {ticketToRefund.price.toFixed(2)}</strong> será devolvido integralmente ao seu saldo.
            </p>

            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-150 space-y-2">
              <span className="text-[10px] font-bold text-slate-450 uppercase block">Dezenas do Bilhete:</span>
              <div className="flex flex-wrap gap-1.5 justify-start">
                {ticketToRefund.numbers.map((num, i) => (
                  <span key={i} className="px-2.5 py-1 rounded bg-white text-indigo-900 font-mono font-bold text-sm border border-slate-200 shadow-sm">
                    {ticketToRefund.numbers.length === 1 ? String(num).padStart(4, '0') : String(num).padStart(2, '0')}
                  </span>
                ))}
              </div>
            </div>

            <div className="flex gap-3 justify-end mt-2">
              <button
                type="button"
                onClick={() => setTicketToRefund(null)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 bg-transparent hover:bg-slate-50 text-slate-500 text-xs font-bold uppercase cursor-pointer"
              >
                Voltar
              </button>
              <button
                type="button"
                disabled={!!isDeletingTicketId}
                onClick={() => handleRefundTicket(ticketToRefund)}
                className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold uppercase cursor-pointer flex items-center justify-center gap-2"
              >
                {isDeletingTicketId ? "Cancelando..." : "Confirmar Reembolso"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
