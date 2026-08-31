import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, deleteDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Bet, Match, UserProfile } from '../types';
import { ArrowLeft, History, Search, Trash2, Check, X, AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function AdminLogs() {
  const [bets, setBets] = useState<Bet[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [betToDelete, setBetToDelete] = useState<Bet | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showNotification = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    const unsubBets = onSnapshot(collection(db, 'bets'), (snapshot) => {
      const fetchedBets = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Bet));
      fetchedBets.sort((a, b) => {
        const timeA = a.createdAt ? (typeof a.createdAt === 'string' ? new Date(a.createdAt).getTime() : (a.createdAt as any).seconds ? (a.createdAt as any).seconds * 1000 : 0) : 0;
        const timeB = b.createdAt ? (typeof b.createdAt === 'string' ? new Date(b.createdAt).getTime() : (b.createdAt as any).seconds ? (b.createdAt as any).seconds * 1000 : 0) : 0;
        return timeB - timeA;
      });
      setBets(fetchedBets);
      
      // Need a second to set loading false so at least bets render
      if (matches.length > 0 && users.length > 0) setLoading(false);
    });

    const unsubMatches = onSnapshot(collection(db, 'matches'), (snapshot) => {
      setMatches(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Match)));
    });

    const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      setUsers(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as UserProfile)));
    });

    return () => { unsubBets(); unsubMatches(); unsubUsers(); };
  }, []);

  useEffect(() => {
    if (matches.length > 0 && users.length > 0 && bets.length > -1) setLoading(false);
  }, [matches, users, bets]);

  const formatDateTime = (ts: any) => {
    if (!ts) return '-';
    let date: Date;
    if (typeof ts === 'string') date = new Date(ts);
    else if (ts && typeof ts.toDate === 'function') date = ts.toDate();
    else if (ts && ts.seconds) date = new Date(ts.seconds * 1000);
    else date = new Date(ts);
    if (isNaN(date.getTime())) return '-';
    return date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const filteredBets = bets.filter(bet => {
    if (!filter) return true;
    const match = matches.find(m => m.id === bet.matchId);
    const user = users.find(u => u.id === bet.userId);
    const searchString = `${user?.name || bet.userName} ${user?.displayId || ''} ${match?.team1} ${match?.team2}`.toLowerCase();
    return searchString.includes(filter.toLowerCase());
  });

  const handleDeleteBet = async () => {
    if (!betToDelete) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, 'bets', betToDelete.id!));
      showNotification('Registro de aposta excluído com sucesso.');
      setBetToDelete(null);
    } catch (err: any) {
      console.error("Erro ao deletar aposta:", err);
      showNotification('Houve um erro ao tentar excluir o registro.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-slate-500 font-medium">Carregando logs do sistema...</div>;

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

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link to="/admin" className="p-2.5 rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-3xl font-display font-bold text-slate-800 flex items-center gap-3">
            <History className="h-8 w-8 text-emerald-600" />
            Logs de Palpites
          </h1>
        </div>
        <div className="relative w-full sm:w-72">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><Search className="w-4 h-4" /></span>
          <input 
            type="text" 
            placeholder="Buscar usuário ou jogo..." 
            value={filter}
            onChange={e => setFilter(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl bg-white focus:ring-2 focus:ring-emerald-500/20 outline-none text-sm font-medium text-slate-700"
          />
        </div>
      </div>

      <div className="bg-white p-6 rounded-3xl shadow-md border border-slate-200">
        <div className="overflow-x-auto custom-scrollbar border border-slate-150 rounded-2xl">
          <table className="w-full text-left border-collapse min-w-[700px]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 text-xs uppercase tracking-wider font-bold">
                <th className="py-4 px-5 w-40">Data/Hora</th>
                <th className="py-4 px-5 flex-1">Usuário</th>
                <th className="py-4 px-5">Jogo</th>
                <th className="py-4 px-5">Tipo</th>
                <th className="py-4 px-5">Palpite</th>
                <th className="py-4 px-5">Status</th>
                <th className="py-4 px-5 text-right w-20">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm text-slate-600 bg-white">
              {filteredBets.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400 font-medium">Nenhum palpite encontrado.</td>
                </tr>
              ) : (
                filteredBets.map(b => {
                  const u = users.find(usr => usr.id === b.userId);
                  const m = matches.find(mt => mt.id === b.matchId);
                  return (
                    <tr key={b.id} className="hover:bg-slate-50/55 transition-colors">
                      <td className="py-3 px-5 font-mono text-xs text-slate-500">{formatDateTime(b.createdAt)}</td>
                      <td className="py-3 px-5 font-bold text-slate-800">
                        {u?.displayId && <span className="text-emerald-700 font-mono mr-1.5 text-xs">#{u.displayId}</span>}
                        {u?.name || b.userName}
                      </td>
                      <td className="py-3 px-5 font-medium text-slate-700">{m ? `${m.team1} x ${m.team2}` : 'Jogo Excluído'}</td>
                      <td className="py-3 px-5">
                        {m?.isPromotional 
                          ? <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200">Promocional</span>
                          : <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200">Regular</span>
                        }
                      </td>
                      <td className="py-3 px-5">
                        <span className="font-mono font-bold text-emerald-800 bg-emerald-50 px-2 py-1 rounded border border-emerald-100">
                          {b.predicted1} x {b.predicted2}
                        </span>
                      </td>
                      <td className="py-3 px-5">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${b.status === 'confirmed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                          {b.status === 'confirmed' ? 'Confirmado' : 'Pendente'}
                        </span>
                      </td>
                      <td className="py-3 px-5 text-right">
                        <button 
                          onClick={() => setBetToDelete(b)}
                          className="text-red-500 hover:text-white hover:bg-red-500 p-2 rounded-lg transition-colors inline-block cursor-pointer"
                          title="Excluir Registro de Palpite"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {betToDelete && (
        <div className="fixed inset-0 min-h-screen bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-fade-in text-left">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl space-y-6 relative border border-slate-200">
            <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/5 rounded-full blur-[40px] pointer-events-none"></div>
            <div className="bg-red-50 text-red-600 w-12 h-12 rounded-full flex items-center justify-center mb-4">
              <AlertTriangle className="w-6 h-6" />
            </div>
            
            <div>
              <h3 className="text-xl font-display font-bold text-slate-800 mb-2">Excluir Log de Palpite</h3>
              <p className="text-sm text-slate-600 font-medium">Tem certeza que deseja excluir o palpite <span className="font-bold text-slate-800">{betToDelete.predicted1} x {betToDelete.predicted2}</span> do usuário <span className="font-bold text-slate-800">{users.find(u => u.id === betToDelete.userId)?.name || betToDelete.userName}</span>?</p>
              <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <p className="text-xs text-amber-800 font-bold uppercase tracking-wider block mb-1">Atenção</p>
                <p className="text-xs text-amber-900 font-medium leading-relaxed">Esta ação remove o palpite da partida e do ranking.</p>
              </div>
            </div>

            <div className="flex gap-3 pt-4 border-t border-slate-100">
              <button 
                onClick={() => setBetToDelete(null)}
                className="flex-1 px-4 py-3 bg-slate-50 hover:bg-slate-100 text-slate-600 font-bold text-sm uppercase tracking-wider rounded-xl transition-colors cursor-pointer border border-slate-200"
              >
                Cancelar
              </button>
              <button 
                onClick={handleDeleteBet}
                disabled={deleting}
                className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-700 text-white font-bold text-sm uppercase tracking-wider rounded-xl transition-colors cursor-pointer disabled:opacity-50 shadow-md shadow-red-600/20"
              >
                {deleting ? 'Aguarde...' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
