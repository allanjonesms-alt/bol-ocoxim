import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, doc, getDocs, where, runTransaction, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { UserProfile, Transaction, Bet, Match } from '../types';
import { handleFirestoreError, OperationType } from '../lib/error-handler';
import { isAdminEmail } from '../lib/utils';
import { ArrowLeft, Edit, Wallet, Check, X, AlertTriangle, Clock, Search } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function AdminUsers() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);

  // Selected user and user details modal states
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [selectedUserBets, setSelectedUserBets] = useState<Bet[]>([]);
  const [loadingBets, setLoadingBets] = useState(false);
  const [customAmount, setCustomAmount] = useState('');
  const [adjustmentType, setAdjustmentType] = useState<'deposit' | 'withdrawal' | 'manual_deduction'>('deposit');
  const [pixReceiptDate, setPixReceiptDate] = useState('');
  const [adjustingBalance, setAdjustingBalance] = useState(false);
  const [editUserName, setEditUserName] = useState('');
  const [editUserPhone, setEditUserPhone] = useState('');
  const [editUserPixKey, setEditUserPixKey] = useState('');
  const [editUserRole, setEditUserRole] = useState<'admin' | 'user'>('user');
  const [savingUserData, setSavingUserData] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [adminBetMatchId, setAdminBetMatchId] = useState('');
  const [adminBetP1, setAdminBetP1] = useState('');
  const [adminBetP2, setAdminBetP2] = useState('');
  const [placingAdminBet, setPlacingAdminBet] = useState(false);

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showNotification = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    const unsubMatches = onSnapshot(collection(db, 'matches'), (snapshot) => {
      setMatches(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Match)));
    });
    const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      const usersData = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as UserProfile));
      usersData.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setUsers(usersData);
      setLoading(false);
    });
    return () => { unsubMatches(); unsubUsers(); };
  }, []);

  const formatDateTime = (ts: any) => {
    if (!ts) return '-';
    let date: Date;
    if (typeof ts === 'string') date = new Date(ts);
    else if (ts && typeof ts.toDate === 'function') date = ts.toDate();
    else if (ts && ts.seconds) date = new Date(ts.seconds * 1000);
    else date = new Date(ts);
    if (isNaN(date.getTime())) return '-';
    return date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const handleOpenUserModal = async (u: UserProfile) => {
    setSelectedUser(u);
    setEditUserName(u.name || '');
    setEditUserPhone(u.phone || '');
    setEditUserPixKey(u.pix_key || '');
    setEditUserRole(u.role || 'user');
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

        if (!userDoc.exists()) throw new Error("Usuário não encontrado.");

        const currentBalance = userDoc.data().balance || 0;
        let newBalance = currentBalance;

        if (adjustmentType === 'deposit') newBalance += amount;
        else if (adjustmentType === 'withdrawal' || adjustmentType === 'manual_deduction') {
          if (currentBalance < amount) throw new Error(`Saldo insuficiente. O usuário possui apenas R$ ${currentBalance.toFixed(2)}.`);
          newBalance -= amount;
        }

        transaction.update(userRef, { balance: newBalance });

        const transRef = doc(collection(db, 'transactions'));
        const transData: any = {
          userId: userId,
          type: adjustmentType,
          amount: amount,
          status: 'confirmed',
          timestamp: serverTimestamp()
        };
        
        if (adjustmentType === 'withdrawal') {
          if (!pixReceiptDate) {
              throw new Error("Para registrar um saque, informe a data e hora do PIX.");
          }
          transData.pixReceiptDate = pixReceiptDate;
        }

        transaction.set(transRef, transData);
      });

      showNotification('Saldo ajustado com sucesso!');
      setCustomAmount('');
      setPixReceiptDate('');
    } catch (err: any) {
      showNotification(err.message || 'Erro ao ajustar o saldo.', 'error');
    } finally {
      setAdjustingBalance(false);
    }
  };

  const handleSaveUserData = async () => {
    if (!selectedUser) return;
    setSavingUserData(true);
    try {
      const isMasterAdmin = isAdminEmail(selectedUser.email);
      const finalRole = isMasterAdmin ? editUserRole : 'user';

      if (editUserRole === 'admin' && !isMasterAdmin) {
        showNotification('Apenas o e-mail master pode ser Administrador. Novos administradores não são permitidos sem autorização.', 'error');
      }

      await updateDoc(doc(db, 'users', selectedUser.id), {
        name: editUserName,
        phone: editUserPhone,
        pix_key: editUserPixKey,
        role: finalRole,
      });
      showNotification('Dados do usuário atualizados com sucesso!');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'users');
      showNotification('Erro ao atualizar usuário.', 'error');
    } finally {
      setSavingUserData(false);
    }
  };

  const handlePlaceAdminBet = async (userId: string, userName: string) => {
    if (!adminBetMatchId || adminBetP1 === '' || adminBetP2 === '' || placingAdminBet) return;
    
    const p1 = parseInt(adminBetP1, 10);
    const p2 = parseInt(adminBetP2, 10);
    if (isNaN(p1) || isNaN(p2) || p1 < 0 || p2 < 0) {
      showNotification('Placar inválido.', 'error');
      return;
    }
    
    const match = matches.find(m => m.id === adminBetMatchId);
    if (!match) return;

    setPlacingAdminBet(true);
    
    try {
      if (match.isPromotional) {
        const userBetsForMatch = selectedUserBets.filter(b => b.matchId === match.id);
        if (userBetsForMatch.length >= 2) {
          showNotification('O usuário já atingiu o limite de 2 apostas para este jogo.', 'error');
          setPlacingAdminBet(false);
          return;
        }
      }

      const pendingBets = selectedUserBets.filter(b => b.matchId === match.id && b.status === 'pending');
      
      let betAmount = 5;
      if (match.isPromotional) {
        betAmount = 2;
      }
      
      const liveUser = users.find(u => u.id === userId);
      const actualBalance = liveUser?.balance || 0;
      const hasBalance = actualBalance >= betAmount;
      
      if (!hasBalance && pendingBets.length >= 2) {
        showNotification('O usuário já atingiu o limite de 2 apostas pendentes por falta de saldo neste jogo.', 'error');
        setPlacingAdminBet(false);
        return;
      }

      await runTransaction(db, async (transaction) => {
        const userRef = doc(db, 'users', userId);
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
            userId: userId,
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
          userId: userId,
          userName: userName,
          matchId: match.id,
          predicted1: p1,
          predicted2: p2,
          amount: betAmount,
          status: canPay ? 'confirmed' : 'pending',
          paid: canPay,
          createdAt: serverTimestamp()
        });
      });
      
      setAdminBetMatchId('');
      setAdminBetP1('');
      setAdminBetP2('');
      showNotification('Aposta registrada com sucesso!');
      
      if (liveUser) {
          handleOpenUserModal(liveUser);
      }
    } catch (err: any) {
      showNotification(err.message || 'Erro ao registrar aposta.', 'error');
    } finally {
      setPlacingAdminBet(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-slate-500 font-medium">Carregando usuários...</div>;

  const filteredUsers = users.filter(u => 
    (u.name || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
    (u.email || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (u.phone || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (u.displayId || '').includes(searchQuery)
  );

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-fade-in relative pb-16">
      
      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[60] shadow-xl animate-fade-in">
          <div className={`p-2 rounded-xl ${toast.type === 'success' ? 'bg-emerald-50' : 'bg-red-50'}`}>
            <div className={`flex items-start gap-4 p-4 border rounded-lg bg-white ${toast.type === 'success' ? 'border-emerald-200' : 'border-red-200'}`}>
              <div className={`p-1.5 rounded-full ${toast.type === 'success' ? 'bg-emerald-100' : 'bg-red-100'}`}>
                {toast.type === 'success' ? <Check className="w-5 h-5 text-emerald-600" /> : <X className="w-5 h-5 text-red-600" />}
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">{toast.type === 'success' ? 'Sucesso' : 'Erro'}</p>
                <p className="text-sm font-bold text-slate-800 leading-tight">{toast.message}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-4">
          <Link to="/admin" className="p-2.5 rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-3xl font-display font-bold text-slate-800">
            Usuários Cadastrados
          </h1>
          <span className="bg-emerald-50 text-emerald-700 border border-emerald-250 text-xs px-2.5 py-0.5 rounded-full font-mono font-bold ml-2">
            {users.length}
          </span>
        </div>
        <div className="flex flex-col items-end">
           <span className="text-xs font-bold text-slate-400 uppercase tracking-widest bg-slate-100 px-3 py-1 rounded-full border border-slate-200">
             Saldo Total dos Usuários
           </span>
           <span className="text-2xl font-mono font-black text-amber-500 mt-1">
             R$ {users.reduce((sum, u) => sum + (u.balance || 0), 0).toFixed(2)}
           </span>
        </div>
      </div>

      <div className="bg-white p-8 rounded-3xl shadow-md border border-slate-200">
        <div className="mb-6">
          <div className="relative max-w-md">
             <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
             <input
               type="text"
               value={searchQuery}
               onChange={(e) => setSearchQuery(e.target.value)}
               placeholder="Buscar usuário por nome, email ou celular..."
               className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/25 outline-none text-slate-800 text-sm font-medium transition-all"
             />
          </div>
        </div>

        <div className="overflow-x-auto custom-scrollbar border border-slate-150 rounded-2xl">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 text-xs uppercase tracking-wider font-bold">
                <th className="py-4 px-5">ID</th>
                <th className="py-4 px-5">Nome</th>
                <th className="py-4 px-5">E-mail</th>
                <th className="py-4 px-5">Celular</th>
                <th className="py-4 px-5">Saldo</th>
                <th className="py-4 px-5">Função</th>
                <th className="py-4 px-5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm text-slate-600 bg-white">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400 font-medium">
                    {searchQuery ? 'Nenhum usuário encontrado na busca.' : 'Nenhum usuário cadastrado.'}
                  </td>
                </tr>
              ) : (
                filteredUsers.map(u => (
                  <tr key={u.id} className="hover:bg-slate-50/55 transition-colors">
                    <td className="py-3.5 px-5 font-mono text-slate-400 font-bold">#{u.displayId || '---'}</td>
                    <td className="py-3.5 px-5 font-bold text-slate-800">{u.name}</td>
                    <td className="py-3.5 px-5 text-slate-500 select-all font-medium">{u.email}</td>
                    <td className="py-3.5 px-5 font-mono text-slate-500">{u.phone || '-'}</td>
                    <td className="py-3.5 px-5 font-mono font-bold text-emerald-700">R$ {(u.balance || 0).toFixed(2)}</td>
                    <td className="py-3.5 px-5">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${u.role === 'admin' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-500 border border-slate-200/50'}`}>
                        {u.role === 'admin' ? 'Admin' : 'Usuário'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button 
                        onClick={() => handleOpenUserModal(u)}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3.5 py-1.5 rounded-lg text-xs transition-colors shadow-sm cursor-pointer"
                      >
                        EDITAR
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Dossier de Detalhes do Usuário */}
      {selectedUser && (() => {
        const liveSelectedUser = users.find(u => u.id === selectedUser.id) || selectedUser;
        return (
          <div className="fixed inset-0 bg-slate-900/45 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
            <div className="bg-white rounded-3xl border border-slate-200 w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl relative">
              
              {/* Header */}
              <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                <div>
                  <h3 className="text-xl font-display font-bold text-slate-800 flex items-center gap-2">
                    <span className="text-emerald-700">#{liveSelectedUser.displayId || '---'}</span>
                    <span>{liveSelectedUser.name}</span>
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold tracking-wider uppercase ml-3 ${liveSelectedUser.role === 'admin' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'}`}>
                      {liveSelectedUser.role === 'admin' ? 'Administrador' : 'Usuário Regular'}
                    </span>
                  </h3>
                  <p className="text-slate-500 text-sm mt-1">{liveSelectedUser.email}</p>
                </div>
                <button onClick={() => setSelectedUser(null)} className="text-slate-400 hover:text-slate-650 bg-slate-100 hover:bg-slate-200 p-2 rounded-full transition-colors cursor-pointer">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Body */}
              <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-8 bg-white">
                
                {/* Stats row */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex flex-col justify-center">
                    <span className="text-xs font-semibold text-emerald-800 uppercase tracking-widest block mb-1">Saldo Atual</span>
                    <span className="text-2xl font-mono font-bold text-emerald-700">R$ {(liveSelectedUser.balance || 0).toFixed(2)}</span>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col justify-center">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest block mb-1">Apostas Realizadas</span>
                    <span className="text-2xl font-mono font-bold text-slate-800">{selectedUserBets.length}</span>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col justify-center">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest block mb-1">Apenas Promocionais</span>
                    <span className="text-2xl font-mono font-bold text-slate-800">{selectedUserBets.filter(b => matches.find(m => m.id === b.matchId)?.isPromotional).length}</span>
                  </div>
                  <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4 flex flex-col justify-center">
                    <span className="text-xs font-semibold text-indigo-800 uppercase tracking-widest block mb-1">Taxa de Acertos</span>
                    <span className="text-2xl font-mono font-bold text-indigo-700">
                      {selectedUserBets.length > 0 
                        ? Math.round((selectedUserBets.filter(b => b.is_winner).length / selectedUserBets.filter(b => b.status === 'confirmed').length) * 100 || 0) + '%' 
                        : '-'}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Editar Dados do Usuário */}
                  <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
                    <h4 className="font-display font-bold text-slate-800 mb-5 flex items-center gap-2 uppercase tracking-wider text-sm">
                      <Edit className="w-4 h-4 text-emerald-600" />
                      <span>Editar Cadastro do Usuário</span>
                    </h4>
                    <div className="space-y-4">
                      <div>
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">Nome Completo</label>
                        <input 
                          type="text" 
                          value={editUserName} 
                          onChange={e => setEditUserName(e.target.value)} 
                          placeholder="Nome do usuário"
                          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/25 outline-none text-slate-800 text-sm font-medium" 
                        />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">Telefone / Celular</label>
                        <input 
                          type="text" 
                          value={editUserPhone} 
                          onChange={e => setEditUserPhone(e.target.value)} 
                          placeholder="(00) 00000-0000"
                          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/25 outline-none text-slate-800 font-mono text-sm font-medium" 
                        />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">Chave PIX (Para Saque)</label>
                        <input 
                          type="text" 
                          value={editUserPixKey} 
                          onChange={e => setEditUserPixKey(e.target.value)} 
                          placeholder="Email, CPF, Celular ou Aleatória"
                          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/25 outline-none text-slate-800 font-mono text-sm font-medium" 
                        />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">Nível de Acesso (Função)</label>
                        <select 
                          value={editUserRole} 
                          onChange={e => setEditUserRole(e.target.value as 'admin' | 'user')} 
                          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/25 outline-none text-slate-800 text-sm font-medium cursor-pointer"
                        >
                          <option value="user">Usuário Regular</option>
                          <option value="admin">Administrador</option>
                        </select>
                      </div>
                      <button 
                        onClick={handleSaveUserData}
                        disabled={savingUserData}
                        className="w-full px-6 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all disabled:opacity-50 cursor-pointer text-white bg-slate-800 hover:bg-slate-900 mt-2"
                      >
                        {savingUserData ? 'Salvando...' : 'Salvar Alterações de Cadastro'}
                      </button>
                    </div>
                  </div>

                  {/* Ajustar Saldo (Admin Balance Actions) */}
                  <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
                    <h4 className="font-display font-bold text-slate-800 mb-5 flex items-center gap-2 uppercase tracking-wider text-sm">
                      <Wallet className="w-4 h-4 text-emerald-600" />
                      <span>Ajustar Saldo do Usuário</span>
                    </h4>
                    
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-[40px] pointer-events-none"></div>
                      
                      <div className="space-y-4 relative z-10">
                        <div className="grid grid-cols-3 gap-2 mb-4">
                          <button 
                            type="button"
                            onClick={() => setAdjustmentType('deposit')}
                            className={`py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                              adjustmentType === 'deposit' 
                                ? 'bg-emerald-600 text-white shadow-sm ring-2 ring-emerald-600 ring-offset-2 ring-offset-slate-50' 
                                : 'bg-white border border-slate-200 text-slate-500 hover:text-slate-800'
                            }`}
                          >
                            Add Saldo
                          </button>
                          <button 
                            type="button"
                            onClick={() => setAdjustmentType('manual_deduction')}
                            className={`py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                              adjustmentType === 'manual_deduction' 
                                ? 'bg-orange-600 text-white shadow-sm ring-2 ring-orange-600 ring-offset-2 ring-offset-slate-50' 
                                : 'bg-white border border-slate-200 text-slate-500 hover:text-slate-800'
                            }`}
                          >
                            Remover
                          </button>
                          <button 
                            type="button"
                            onClick={() => setAdjustmentType('withdrawal')}
                            className={`py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                              adjustmentType === 'withdrawal' 
                                ? 'bg-rose-600 text-white shadow-sm ring-2 ring-rose-600 ring-offset-2 ring-offset-slate-50' 
                                : 'bg-white border border-slate-200 text-slate-500 hover:text-slate-800'
                            }`}
                          >
                            Saque
                          </button>
                        </div>

                        <div>
                          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
                            Valor do Ajuste (R$)
                          </label>
                          <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">R$</span>
                            <input 
                              type="number" 
                              value={customAmount}
                              onChange={(e) => setCustomAmount(e.target.value)}
                              placeholder="0.00"
                              step="0.01"
                              min="0.01"
                              className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/35 outline-none text-slate-800 font-mono font-bold text-lg"
                            />
                          </div>
                        </div>

                        {adjustmentType === 'withdrawal' && (
                          <div className="bg-rose-50 border border-rose-100 p-4 rounded-xl space-y-3 mt-2">
                            <div>
                              <label className="text-[10px] font-bold text-rose-700 uppercase tracking-wider block mb-1">
                                Chave PIX do Usuário
                              </label>
                              <div className="w-full px-3 py-2 bg-white border border-rose-200 rounded-lg text-rose-900 font-mono text-xs font-bold break-all">
                                {liveSelectedUser.pix_key || 'Não cadastrada pelo usuário'}
                              </div>
                            </div>
                            <div>
                              <label className="text-[10px] font-bold text-rose-700 uppercase tracking-wider block mb-1">
                                Data/Hora do PIX Realizado
                              </label>
                              <input 
                                type="datetime-local" 
                                value={pixReceiptDate}
                                onChange={(e) => setPixReceiptDate(e.target.value)}
                                className="w-full px-3 py-2 bg-white border border-rose-200 rounded-lg focus:ring-2 focus:ring-rose-500/35 outline-none text-slate-800 font-mono text-sm"
                              />
                            </div>
                          </div>
                        )}

                        <button 
                          onClick={() => handleAdjustBalance(liveSelectedUser.id)} 
                          disabled={adjustingBalance || !customAmount || (adjustmentType === 'withdrawal' && !pixReceiptDate)} 
                          className={`w-full px-6 py-3.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all disabled:opacity-50 shadow-sm mt-2 ${
                            adjustmentType === 'deposit' 
                              ? 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer' 
                              : adjustmentType === 'withdrawal'
                                ? 'bg-rose-600 hover:bg-rose-700 text-white cursor-pointer'
                                : 'bg-orange-600 hover:bg-orange-700 text-white cursor-pointer'
                          }`}
                        >
                          {adjustingBalance ? 'Processando...' : `Confirmar ${adjustmentType === 'deposit' ? 'Adição' : adjustmentType === 'withdrawal' ? 'Saque' : 'Remoção'} de Saldo`}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Nova Aposta (Admin) */}
                <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
                  <h4 className="font-display font-bold text-slate-800 mb-5 flex items-center gap-2 uppercase tracking-wider text-sm">
                    <Check className="w-4 h-4 text-emerald-600" />
                    <span>Fazer Aposta Manual</span>
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                    <div className="md:col-span-6">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">Jogo Disponível</label>
                      <select 
                        value={adminBetMatchId} 
                        onChange={(e) => setAdminBetMatchId(e.target.value)}
                        className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/25 outline-none text-slate-800 text-sm font-medium"
                      >
                        <option value="">Selecione uma partida...</option>
                        {matches.filter(m => m.status === 'open').map(m => (
                          <option key={m.id} value={m.id}>
                            {m.team1} x {m.team2} ({m.isPromotional ? 'Promocional' : 'Regular'})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="md:col-span-2">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">Casa</label>
                      <input 
                        type="number" min="0" 
                        value={adminBetP1} onChange={(e) => setAdminBetP1(e.target.value)}
                        className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-center focus:ring-2 focus:ring-emerald-500/25 outline-none font-bold text-slate-800 text-sm"
                        placeholder="0"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">Fora</label>
                      <input 
                        type="number" min="0" 
                        value={adminBetP2} onChange={(e) => setAdminBetP2(e.target.value)}
                        className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-center focus:ring-2 focus:ring-emerald-500/25 outline-none font-bold text-slate-800 text-sm"
                        placeholder="0"
                      />
                    </div>
                    <div className="md:col-span-2 flex items-end">
                      <button 
                        onClick={() => handlePlaceAdminBet(liveSelectedUser.id, liveSelectedUser.name || 'Usuário')}
                        disabled={placingAdminBet || !adminBetMatchId || adminBetP1 === '' || adminBetP2 === ''}
                        className="w-full py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all disabled:opacity-50 text-white bg-emerald-600 hover:bg-emerald-700 cursor-pointer"
                      >
                        {placingAdminBet ? '...' : 'Apostar'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Relatório de Apostas do Usuário */}
                <div className="pt-6 border-t border-slate-200">
                  <h4 className="font-display font-bold text-slate-800 mb-6 flex items-center gap-2 uppercase tracking-wider text-sm">
                    <Clock className="w-4 h-4 text-emerald-600" />
                    <span>Histórico de Apostas do Usuário</span>
                  </h4>
                  
                  {loadingBets ? (
                    <div className="text-center py-10 bg-slate-50 border border-slate-200 rounded-2xl">
                      <div className="w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                      <p className="text-sm font-medium text-slate-500">Carregando apostas...</p>
                    </div>
                  ) : selectedUserBets.length === 0 ? (
                    <div className="text-center py-12 bg-slate-50 border border-slate-200 border-dashed rounded-2xl">
                      <p className="text-sm font-medium text-slate-500">Nenhuma aposta registrada.</p>
                    </div>
                  ) : (
                    <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                      {selectedUserBets.map((bet) => {
                        const match = matches.find(m => m.id === bet.matchId);
                        if (!match) return null;
                        
                        let pointsLabel = '-';
                        let pointsClass = 'text-slate-500 bg-slate-100 border-slate-200';
                        if (match.status === 'finished' && bet.status === 'confirmed') {
                          const pts = bet.points ?? 0;
                          if (pts === 0) {
                            pointsLabel = 'Errou (0)';
                            pointsClass = 'text-red-700 bg-red-50 border-red-200';
                          } else {
                            const p1 = bet.predicted1;
                            const p2 = bet.predicted2;
                            const m1 = match.result1!;
                            const m2 = match.result2!;
                            const betOutcome = p1 > p2 ? 1 : (p1 < p2 ? 2 : 0);
                            const matchOutcome = m1 > m2 ? 1 : (m1 < m2 ? 2 : 0);
                            
                            const exact = (p1 === m1 && p2 === m2);
                            const rightOutcome = (betOutcome === matchOutcome);
                            const oneScore = ((p1 === m1 || p2 === m2) && !exact);
                            
                            if (exact) {
                                pointsLabel = `Exato (+${pts})`;
                                pointsClass = 'text-emerald-700 bg-emerald-50 border-emerald-200';
                            } else if (rightOutcome && oneScore) {
                                pointsLabel = `Vencedor + 1 Placar (+${pts})`;
                                pointsClass = 'text-blue-700 bg-blue-50 border-blue-200';
                            } else if (oneScore) {
                                pointsLabel = `1 Placar (+${pts})`;
                                pointsClass = 'text-indigo-700 bg-indigo-50 border-indigo-200';
                            } else if (rightOutcome) {
                                pointsLabel = `Vencedor (+${pts})`;
                                pointsClass = 'text-amber-700 bg-amber-50 border-amber-200';
                            } else {
                                pointsLabel = `Pontuou (+${pts})`;
                                pointsClass = 'text-slate-700 bg-slate-100 border-slate-200';
                            }
                          }
                        }

                        return (
                          <div key={bet.id} className="bg-white border border-slate-200 hover:border-slate-300 p-4 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 transition-colors">
                            <div className="space-y-2 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider ${match.isPromotional ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' : 'bg-slate-100 text-slate-600 border border-slate-200'}`}>
                                  {match.isPromotional ? 'Promocional' : 'Regular'}
                                </span>
                                <span className="font-bold text-slate-800 text-sm">
                                  {match.team1} x {match.team2}
                                </span>
                              </div>
                              <div className="flex flex-wrap gap-4 text-xs font-medium text-slate-500">
                                <span>Apostado: <span className="font-mono bg-slate-100 px-1 py-0.5 rounded">{formatDateTime(bet.createdAt)}</span></span>
                                <div>Status: <span className={`font-bold ${bet.status === 'confirmed' ? 'text-emerald-600' : 'text-amber-600'}`}>{bet.status.toUpperCase()}</span></div>
                                <div>Pagamento: <span className={`font-bold ${bet.paid ? 'text-emerald-600' : 'text-slate-400'}`}>{bet.paid ? 'PAGO' : 'PENDENTE'}</span></div>
                              </div>
                            </div>
                            <div className="flex items-center gap-4 flex-wrap sm:flex-nowrap min-w-[200px] justify-start sm:justify-end">
                              <div className="text-center bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg w-20">
                                <p className="text-[10px] uppercase font-bold text-slate-400 tracking-widest mb-0.5">Palpite</p>
                                <p className="font-mono font-bold text-lg text-emerald-800 leading-none">{bet.predicted1} - {bet.predicted2}</p>
                              </div>
                              {match.status === 'finished' && (
                                <div className="text-center w-24">
                                  <span className={`inline-block px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider border ${pointsClass}`}>
                                    {pointsLabel}
                                  </span>
                                  {bet.is_winner && bet.prize_collected && (
                                    <div className="mt-1 font-mono text-xs font-bold text-emerald-700">
                                      + R$ {bet.prize_collected.toFixed(2)}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

              </div>

              {/* Footer */}
              <div className="p-5 border-t border-slate-200 flex justify-end bg-slate-50">
                <button 
                  onClick={() => setSelectedUser(null)} 
                  className="bg-slate-800 hover:bg-slate-900 text-white rounded-xl px-6 py-2.5 font-bold text-xs transition-colors cursor-pointer uppercase tracking-wider shadow-sm"
                >
                  Fechar Painel
                </button>
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
}
