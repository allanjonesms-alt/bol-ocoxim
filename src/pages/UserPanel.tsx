import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, doc, updateDoc, runTransaction, getDocs, limit } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { Bet, Transaction, Match, PixPremiadoGame, UserProfile, PixPremiadoDraw } from '../types';
import { handleFirestoreError, OperationType } from '../lib/error-handler';
import { QrCode, Wallet, ArrowDownToLine, ArrowUpFromLine, Clock, CheckCircle2, Trophy, X, Copy, Check, Sparkles, Award, Calendar, Search, Filter, LayoutGrid, List } from 'lucide-react';
import { fetchAvailableFederalNumbers } from '../utils/loteriaFederal';
import { calculatePixTicketPrice } from '../utils/pixPricing';
import { generatePixPayload } from '../utils/pix';
import { buyOrReservePixTickets, reconcilePendingProvisionalTickets, cancelUserProvisionalReservation } from '../utils/provisionalTicketManager';
import PixPaymentCard from '../components/PixPaymentCard';
import ContemplatedDrawCard from '../components/ContemplatedDrawCard';

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
  const [pixToast, setPixToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);
  const [recentBoughtTickets, setRecentBoughtTickets] = useState<any[]>([]);
  const [showPixBoughtModal, setShowPixBoughtModal] = useState(false);
  const [provisionalPixModalData, setProvisionalPixModalData] = useState<{
    amount: number;
    originalAmount?: number;
    discountPercent?: number;
    ticketCount?: number;
    reservedNumbers?: (number[] | number)[];
    batchId?: string;
  } | null>(null);
  
  // Ticket search and view filter states
  const [ticketSearchTerm, setTicketSearchTerm] = useState('');
  const [ticketViewMode, setTicketViewMode] = useState<'grid' | 'list'>('grid');

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

  
  const pixCode = generatePixPayload({ pixKey: 'ecbf2588-9b0b-48e7-bc17-57f66ca2dbff' });

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
      const amountVal = searchParams.get('amount');
      if (amountVal) {
        setDepositAmount(amountVal);
      }
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('openFinance');
      newParams.delete('amount');
      setSearchParams(newParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);
  
  useEffect(() => {
    if (!user) return;
    
    // Auto-reconcile any pending provisional tickets if user has sufficient balance
    if ((profile?.balance || 0) > 0) {
      reconcilePendingProvisionalTickets(db, user.uid).catch((err) => {
        console.warn('UserPanel auto-reconcile error:', err);
      });
    }

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

    const qPix = collection(db, 'pix_premiado_draws');
    const unsubPixDraws = onSnapshot(qPix, (snapshot) => {
      const draws = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PixPremiadoDraw));
      draws.sort((a, b) => {
        if (a.winningTicket && !b.winningTicket) return -1;
        if (!a.winningTicket && b.winningTicket) return 1;
        if (a.status === 'active' && b.status !== 'active') return -1;
        if (a.status !== 'active' && b.status === 'active') return 1;
        return 0;
      });
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

  const handleBuyPixTickets = async () => {
    setPixToast({ message: 'As vendas de bilhetes estão oficialmente encerradas.', type: 'error' });
    setTimeout(() => setPixToast(null), 4000);
    return;
  };

  const handleCancelReservation = async (batchId?: string) => {
    if (!user) return;
    try {
      const { cancelledTicketsCount } = await cancelUserProvisionalReservation(db, user.uid, batchId);
      if (cancelledTicketsCount > 0) {
        setPixToast({
          message: `Reserva cancelada! ${cancelledTicketsCount} número(s) foram cancelados e liberados novamente para compra.`,
          type: 'warning'
        });
      } else {
        setPixToast({
          message: `Reserva cancelada com sucesso!`,
          type: 'info'
        });
      }
    } catch (err) {
      console.error('Error cancelling reservation:', err);
      setPixToast({ message: 'Erro ao cancelar reserva.', type: 'error' });
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
            <span className="text-sm font-semibold text-slate-500 group-hover:text-emerald-700 transition-colors uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
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
          
          <h3 className="text-xl font-display font-bold text-slate-800 mb-6 flex items-center relative z-10">
            <Wallet className="h-6 w-6 mr-3 text-slate-500" />
            Movimentação Financeira
          </h3>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 flex-1 relative z-10">
            {/* Deposit */}
            <div className="bg-slate-50/60 border border-emerald-100/85 rounded-2xl p-6 flex flex-col shadow-inner">
              <h4 className="font-bold text-slate-800 mb-2 flex items-center text-lg">
                <ArrowDownToLine className="h-5 w-5 mr-2 text-emerald-600" /> Depositar
              </h4>
              <p className="text-xs text-slate-500 mb-6 font-medium leading-relaxed">Adicione créditos para adquirir bilhetes do PIX PREMIADO e participar dos sorteios.</p>
              
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
                  <button onClick={handleDepositRequest} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl py-3.5 transition-colors shadow-md shadow-emerald-500/20 cursor-pointer">
                    Gerar PIX
                  </button>
                </div>
              ) : (
                <PixPaymentCard
                  amount={parseFloat(depositAmount) || 0}
                  onConfirmPayment={handleConfirmPayment}
                  onCancel={() => setShowPix(false)}
                />
              )}
            </div>

            {/* Withdraw */}
            <div className="bg-slate-50/60 border border-slate-200 rounded-2xl p-6 flex flex-col shadow-inner">
              <h4 className="font-bold text-slate-800 mb-2 flex items-center text-lg">
                <ArrowUpFromLine className="h-5 w-5 mr-2 text-slate-500" /> Sacar
              </h4>
              <p className="text-xs text-slate-500 mb-6 font-medium leading-relaxed">Solicite o saque do seu saldo. O administrador fará a transferência para sua chave PIX.</p>
              
              {!requestWithdraw ? (
                <button onClick={() => setRequestWithdraw(true)} className="mt-auto w-full bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl py-3.5 font-bold transition-colors cursor-pointer">
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
                        className="w-full px-4 py-2.5 bg-white border border-red-200 focus:border-red-400 rounded-xl outline-none text-slate-800 text-xs font-mono"
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
                    <button onClick={() => setRequestWithdraw(false)} className="px-5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition-colors border border-slate-300 cursor-pointer">
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

          {/* Card do Número Contemplado Oficial se já houver apuração */}
          {activePixDraws.length > 0 && activePixDraws[0]?.winningTicket && (
            <div className="mb-8">
              <ContemplatedDrawCard 
                draw={activePixDraws[0]} 
                userGames={raffleGames} 
              />
            </div>
          )}

          {/* Seção para Compra Rápida se houver sorteio ativo */}
          {raffleGames.length === 0 ? (
            <p className="text-sm text-slate-400 font-medium text-center py-10 bg-slate-900/40 border border-dashed border-indigo-500/20 rounded-2xl relative z-10">
              Você não possui nenhum bilhete registrado neste sorteio.
            </p>
          ) : (
            <div className="space-y-4 relative z-10">
              {/* Toolbar: Busca rápida de números e modo de visualização */}
              <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 bg-slate-950/80 p-3.5 rounded-2xl border border-indigo-500/25">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={ticketSearchTerm}
                    onChange={(e) => setTicketSearchTerm(e.target.value)}
                    placeholder="Filtrar ou conferir número do bilhete (ex: 0523)..."
                    className="w-full bg-slate-900 text-white placeholder-slate-400 text-xs font-bold pl-9 pr-8 py-2.5 rounded-xl border border-indigo-500/30 outline-none focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400"
                  />
                  {ticketSearchTerm && (
                    <button 
                      type="button"
                      onClick={() => setTicketSearchTerm('')} 
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs font-bold"
                    >
                      ✕
                    </button>
                  )}
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                  {(() => {
                    const filteredRaffleGames = raffleGames.filter(game => {
                      if (!ticketSearchTerm.trim()) return true;
                      const term = ticketSearchTerm.trim().toLowerCase();
                      const formattedNumbers = game.numbers.map(n => 
                        game.numbers.length === 1 ? String(n).padStart(4, '0') : String(n).padStart(2, '0')
                      ).join(' ');
                      const rawNumbers = game.numbers.join(' ');
                      return formattedNumbers.includes(term) || rawNumbers.includes(term);
                    });

                    return (
                      <span className="text-[11px] font-bold text-slate-300 bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-800">
                        Total: <strong className="text-yellow-400 font-mono">{filteredRaffleGames.length}</strong> {filteredRaffleGames.length === 1 ? 'bilhete' : 'bilhetes'}
                      </span>
                    );
                  })()}

                  <div className="flex bg-slate-900 p-1 rounded-xl border border-indigo-500/30">
                    <button
                      type="button"
                      onClick={() => setTicketViewMode('grid')}
                      className={`px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                        ticketViewMode === 'grid' 
                          ? 'bg-yellow-400 text-slate-950 shadow-sm' 
                          : 'text-slate-400 hover:text-white'
                      }`}
                      title="Visualização em Grade"
                    >
                      <LayoutGrid className="w-3.5 h-3.5" />
                      <span>Cards</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setTicketViewMode('list')}
                      className={`px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                        ticketViewMode === 'list' 
                          ? 'bg-yellow-400 text-slate-950 shadow-sm' 
                          : 'text-slate-400 hover:text-white'
                      }`}
                      title="Visualização em Lista Simples"
                    >
                      <List className="w-3.5 h-3.5" />
                      <span>Lista</span>
                    </button>
                  </div>
                </div>
              </div>

              {(() => {
                const filteredRaffleGames = raffleGames.filter(game => {
                  if (!ticketSearchTerm.trim()) return true;
                  const term = ticketSearchTerm.trim().toLowerCase();
                  const formattedNumbers = game.numbers.map(n => 
                    game.numbers.length === 1 ? String(n).padStart(4, '0') : String(n).padStart(2, '0')
                  ).join(' ');
                  const rawNumbers = game.numbers.join(' ');
                  return formattedNumbers.includes(term) || rawNumbers.includes(term);
                });

                if (filteredRaffleGames.length === 0) {
                  return (
                    <div className="bg-slate-900/60 p-8 rounded-2xl border border-indigo-500/20 text-center">
                      <p className="text-xs text-slate-400 font-semibold">
                        Nenhum bilhete encontrado para a busca "{ticketSearchTerm}".
                      </p>
                    </div>
                  );
                }

                // Group games by purchase date and track latest date timestamp per group
                const groupedByDate = filteredRaffleGames.reduce<Record<string, { time: number; games: PixPremiadoGame[] }>>((acc, game) => {
                  let dateStr = 'Data não registrada';
                  let time = 0;
                  if (game.createdAt) {
                    const d = game.createdAt.toDate ? game.createdAt.toDate() : new Date(game.createdAt);
                    if (!isNaN(d.getTime())) {
                      dateStr = d.toLocaleDateString('pt-BR');
                      time = d.getTime();
                    }
                  }
                  if (!acc[dateStr]) {
                    acc[dateStr] = { time, games: [] };
                  }
                  acc[dateStr].games.push(game);
                  if (time > acc[dateStr].time) {
                    acc[dateStr].time = time;
                  }
                  return acc;
                }, {});

                // Sort date groups chronologically descending (newest purchase date first)
                const sortedGroups = (Object.entries(groupedByDate) as [string, { time: number; games: PixPremiadoGame[] }][]).sort((a, b) => b[1].time - a[1].time);

                return (
                  <div className="space-y-4">
                    {sortedGroups.map(([dateStr, { games: gamesList }]) => (
                      <div key={dateStr} className={`bg-slate-900/90 border rounded-2xl p-5 shadow-lg space-y-3 ${
                        gamesList.some(g => g.status === 'pending' || g.paid === false)
                          ? 'border-amber-500/40'
                          : 'border-indigo-500/30'
                      }`}>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-indigo-500/20 pb-3 gap-2">
                          <div className="flex items-center gap-2 text-indigo-300 text-xs font-bold uppercase tracking-wider">
                            <Calendar className="w-4 h-4 text-yellow-400 shrink-0" />
                            <span>Data da Compra: <strong className="text-white font-mono text-sm">{dateStr}</strong></span>
                          </div>
                          
                          <div className="flex items-center gap-2 flex-wrap">
                            {gamesList.some(g => g.status === 'pending' || g.paid === false) ? (
                              <>
                                <span className="text-[10px] font-bold text-amber-300 bg-amber-950/80 px-2.5 py-0.5 rounded-full border border-amber-800 flex items-center gap-1">
                                  <Clock className="w-3 h-3 text-yellow-400" />
                                  Reserva Provisória
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const pendingInGroup = gamesList.filter(g => g.status === 'pending' || g.paid === false);
                                    const pricing = calculatePixTicketPrice(pendingInGroup.length);
                                    setProvisionalPixModalData({
                                      amount: pricing.finalPrice,
                                      originalAmount: pricing.originalPrice,
                                      discountPercent: pricing.discountPercent,
                                      ticketCount: pendingInGroup.length,
                                      reservedNumbers: pendingInGroup.map(g => g.numbers)
                                    });
                                  }}
                                  className="bg-gradient-to-r from-yellow-400 to-amber-500 hover:from-yellow-500 hover:to-amber-600 text-slate-950 text-xs font-black px-3 py-1 rounded-lg uppercase tracking-wider transition shadow cursor-pointer"
                                >
                                  Pagar PIX
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const sampleBatchId = gamesList.find(g => g.batchId)?.batchId;
                                    handleCancelReservation(sampleBatchId);
                                  }}
                                  className="bg-slate-900 hover:bg-red-950/60 text-red-400 hover:text-red-300 border border-red-900/60 text-xs font-bold px-2.5 py-1 rounded-lg uppercase tracking-wider transition cursor-pointer"
                                >
                                  Cancelar Reserva
                                </button>
                              </>
                            ) : (
                              <span className="text-[10px] font-bold text-emerald-300 bg-emerald-950/80 px-2.5 py-0.5 rounded-full border border-emerald-800 flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                Confirmado
                              </span>
                            )}
                            <span className="text-[11px] font-bold text-slate-300 bg-slate-950 px-3 py-1 rounded-lg border border-slate-800">
                              {gamesList.length} {gamesList.length === 1 ? 'bilhete' : 'bilhetes'}
                            </span>
                          </div>
                        </div>

                        {/* Todos os números comprados ordenados de forma crescente para a data */}
                        <div className="flex flex-wrap gap-2 pt-1">
                          {gamesList.flatMap((g) => g.numbers.map((num) => ({
                            gameId: g.id,
                            numVal: num,
                            numStr: g.numbers.length === 1 ? String(num).padStart(4, '0') : String(num).padStart(2, '0'),
                            isFourDigit: g.numbers.length === 1,
                            isPending: g.status === 'pending' || g.paid === false
                          }))).sort((a, b) => a.numVal - b.numVal).map((item, idx) => {
                            const isContemplated = Boolean(
                              activePixDraws[0]?.winningTicket && (
                                item.numStr === String(activePixDraws[0].winningTicket).padStart(4, '0') ||
                                item.numVal === parseInt(String(activePixDraws[0].winningTicket), 10)
                              )
                            );

                            return (
                              <span
                                key={`${item.gameId}-${idx}`}
                                className={`font-mono font-black rounded-xl tracking-wider flex items-center justify-center border transition-transform hover:scale-105 ${
                                  isContemplated
                                    ? 'px-4 py-2 bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-300 text-slate-950 text-sm border-2 border-yellow-200 ring-4 ring-yellow-400/50 shadow-xl animate-pulse'
                                    : item.isPending
                                    ? 'px-3.5 py-1.5 bg-amber-500/20 text-yellow-300 border-amber-400/50 text-sm shadow-sm'
                                    : item.isFourDigit 
                                    ? 'px-3.5 py-1.5 bg-gradient-to-r from-yellow-400 to-amber-500 text-slate-950 text-sm border-amber-300 shadow-sm'
                                    : 'px-3 py-1 bg-yellow-400 text-slate-950 text-xs border-yellow-300 shadow-sm'
                                }`}
                              >
                                {isContemplated ? (
                                  <span className="flex items-center gap-1.5">
                                    <Trophy className="w-4 h-4 text-slate-950" />
                                    <span>Nº {item.numStr} (CONTEMPLADO!)</span>
                                  </span>
                                ) : (
                                  <>
                                    {item.isFourDigit ? `Nº ${item.numStr}` : item.numStr}
                                    {item.isPending && (
                                      <span className="ml-1 text-[8px] font-sans text-amber-300/80 font-bold uppercase">(Pendente)</span>
                                    )}
                                  </>
                                )}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
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
                <p className="text-xs text-slate-500 mb-6 font-medium leading-relaxed">Adicione créditos para adquirir bilhetes do PIX PREMIADO e participar dos sorteios.</p>
                
                {!showPix ? (
                  <div className="mt-auto space-y-4">
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">R$</span>
                      <input 
                        type="number" 
                        value={depositAmount} 
                        onChange={e => setDepositAmount(e.target.value)} 
                        className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500/35 text-slate-800 font-mono font-bold"
                        placeholder="0.00"
                      />
                    </div>
                    <button onClick={handleDepositRequest} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl py-3.5 transition-colors shadow-md shadow-emerald-500/20 cursor-pointer">
                      Gerar PIX
                    </button>
                  </div>
                ) : (
                  <PixPaymentCard
                    amount={parseFloat(depositAmount) || 0}
                    onConfirmPayment={handleConfirmPayment}
                    onCancel={() => setShowPix(false)}
                  />
                )}
              </div>

              {/* Withdraw */}
              <div className="bg-slate-50/60 border border-slate-200 rounded-2xl p-6 flex flex-col shadow-inner">
                <h4 className="font-bold text-slate-800 mb-2 flex items-center text-lg">
                  <ArrowUpFromLine className="h-5 w-5 mr-2 text-slate-500" /> Sacar
                </h4>
                <p className="text-xs text-slate-500 mb-6 font-medium leading-relaxed">Solicite o saque do seu saldo. O administrador fará a transferência para sua chave PIX.</p>
                
                {!requestWithdraw ? (
                  <button onClick={() => setRequestWithdraw(true)} className="mt-auto w-full bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-xl py-3.5 font-bold transition-colors cursor-pointer">
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
                          className="w-full px-4 py-2.5 bg-white border border-red-200 focus:border-red-400 rounded-xl outline-none text-slate-800 text-xs font-mono"
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
                      <button onClick={() => setRequestWithdraw(false)} className="px-5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition-colors border border-slate-300 cursor-pointer">
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
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-6 py-2.5 rounded-xl text-sm font-bold border border-slate-300 transition duration-150 cursor-pointer"
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

      {provisionalPixModalData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/90 backdrop-blur-md overflow-y-auto">
          <div className="absolute inset-0" onClick={() => setProvisionalPixModalData(null)} />
          <div className="relative w-full max-w-lg z-10 my-8">
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
                setPixToast({ message: 'Pagamento informado! Aguardando confirmação do PIX.', type: 'info' });
              }}
              onCancel={() => setProvisionalPixModalData(null)}
              onClose={() => setProvisionalPixModalData(null)}
              isDepositMode={false}
            />
          </div>
        </div>
      )}
    </div>
  );
}
