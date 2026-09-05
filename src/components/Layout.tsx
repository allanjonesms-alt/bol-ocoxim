import { useState, useEffect } from 'react';
import { Outlet, Link, useNavigate } from 'react-router-dom';
import { LogOut, User, Menu, Trophy, Home, BookOpen, Bell, CheckCircle2, X, ShieldCheck, FileText } from 'lucide-react';
import { signOut } from 'firebase/auth';
import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { Transaction, UserProfile } from '../types';
import logoImg from '../assets/images/pix_coxim_logo_1784559379366.jpg';

interface PixRequest {
  id: string;
  userId: string;
  userName: string;
  amount: number;
  type: string;
  verified: boolean;
  timestamp: any;
}

export default function Layout() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [pixRequests, setPixRequests] = useState<PixRequest[]>([]);
  const [pendingWithdrawals, setPendingWithdrawals] = useState<Transaction[]>([]);
  const [users, setUsers] = useState<Record<string, UserProfile>>({});
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);
  const [globalNotification, setGlobalNotification] = useState<{ id: string, message: string, active: boolean } | null>(null);
  const [dismissedNotificationId, setDismissedNotificationId] = useState<string | null>(localStorage.getItem('dismissed_notification_id'));

  useEffect(() => {
    const unsubGlobal = onSnapshot(doc(db, 'settings', 'global_notification'), (d) => {
      if (d.exists()) {
        setGlobalNotification(d.data() as any);
      }
    });

    return () => {
      unsubGlobal();
    };
  }, []);

  const handleDismissGlobalNotification = async () => {
    if (globalNotification?.id) {
      localStorage.setItem('dismissed_notification_id', globalNotification.id);
      setDismissedNotificationId(globalNotification.id);
      
      if (profile?.id) {
        try {
          await updateDoc(doc(db, 'users', profile.id), {
            dismissedNotificationId: globalNotification.id
          });
        } catch (err) {
          console.error("Erro ao salvar dismiss no perfil:", err);
        }
      }
    }
  };

  useEffect(() => {
    if (profile?.role === 'admin') {
      const qPix = query(
        collection(db, 'pix_requests'),
        where('verified', '==', false)
      );
      const unsubscribePix = onSnapshot(qPix, (snapshot) => {
        setPixRequests(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PixRequest)));
      });

      const qWithdrawal = query(
        collection(db, 'transactions'),
        where('type', '==', 'withdrawal'),
        where('status', '==', 'pending')
      );
      const unsubscribeWithdrawal = onSnapshot(qWithdrawal, (snapshot) => {
        setPendingWithdrawals(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Transaction)));
      });

      const unsubscribeUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
        const usersMap: Record<string, UserProfile> = {};
        snapshot.docs.forEach(doc => {
          usersMap[doc.id] = { id: doc.id, ...doc.data() } as UserProfile;
        });
        setUsers(usersMap);
      });

      return () => {
        unsubscribePix();
        unsubscribeWithdrawal();
        unsubscribeUsers();
      };
    }
  }, [profile?.role]);

  const handleVerifyPixRequest = async (id: string) => {
    await updateDoc(doc(db, 'pix_requests', id), { verified: true });
  };

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-800">
      <header className="bg-emerald-900 shadow-md border-b-2 border-yellow-400 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16 sm:h-20">
            <Link to="/" className="flex items-center group z-50 py-1">
              <img 
                src={logoImg} 
                alt="PIXCOXIM Logo" 
                referrerPolicy="no-referrer" 
                className="h-12 sm:h-16 w-auto max-w-[160px] object-contain transition-transform duration-200 group-hover:scale-105 rounded-xl shadow-sm" 
              />
            </Link>

            {profile ? (
              <div className="flex items-center space-x-4 sm:space-x-6 animate-fade-in">
                <Link to="/" className="text-emerald-100 hover:text-yellow-400 transition" title="Início">
                  <Home className="h-5 w-5" />
                </Link>
                <Link to="/transparencia-sorteio" className="text-emerald-100 hover:text-yellow-400 transition" title="Transparência e Autenticidade do Sorteio">
                  <ShieldCheck className="h-5 w-5 text-emerald-300 hover:text-yellow-400" />
                </Link>
                <Link to="/regulamento" className="text-emerald-100 hover:text-yellow-400 transition" title="Regulamento">
                  <BookOpen className="h-5 w-5" />
                </Link>
                <Link to="/panel?openFinance=true" className="flex flex-col items-end group transition" title="Depositar ou Sacar">
                  <span className="text-sm font-medium text-emerald-50 group-hover:text-yellow-400 transition">{profile.name}</span>
                  <span className="text-xs text-yellow-300 bg-white/10 px-2.5 py-0.5 rounded-full mt-0.5 font-mono font-medium border border-yellow-400/20 shadow-inner group-hover:bg-white/20 transition-all duration-200">
                    R$ {(profile.balance ?? 0).toFixed(2)}
                  </span>
                </Link>
                
                <Link to="/panel" className="text-emerald-100 hover:text-yellow-400 transition" title="Painel do Usuário">
                  <User className="h-5 w-5" />
                </Link>
                
                {profile.role === 'admin' && (
                  <div className="flex items-center space-x-4">
                    <button 
                      onClick={() => setShowNotificationsModal(true)}
                      className="relative text-emerald-100 hover:text-yellow-400 transition"
                      title="Notificações"
                    >
                      <Bell className="h-5 w-5" />
                      {(pixRequests.length > 0 || pendingWithdrawals.length > 0) && (
                        <span className="absolute -top-1 -right-1 flex h-3 w-3">
                          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${pendingWithdrawals.length > 0 ? 'bg-red-400' : 'bg-green-400'}`}></span>
                          <span className={`relative inline-flex rounded-full h-3 w-3 ${pendingWithdrawals.length > 0 ? 'bg-red-500' : 'bg-green-500'}`}></span>
                        </span>
                      )}
                    </button>
                    
                    <Link to="/admin" className="text-yellow-300 bg-emerald-800/80 border border-yellow-400/30 hover:bg-emerald-800 px-3 py-1.5 rounded-md text-sm transition font-medium">
                      Admin
                    </Link>
                  </div>
                )}
                
                <button onClick={handleLogout} className="text-emerald-200 hover:text-rose-300 transition ml-2 cursor-pointer" title="Sair">
                  <LogOut className="h-5 w-5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center space-x-3 sm:space-x-5 animate-fade-in">
                <Link to="/" className="text-emerald-100 hover:text-yellow-400 font-medium text-sm hidden md:block transition">
                  Início
                </Link>
                <Link to="/transparencia-sorteio" className="text-emerald-100 hover:text-yellow-400 font-medium text-sm hidden md:flex items-center gap-1 transition" title="Relatório Público de Bilhetes Concorrendo">
                  <ShieldCheck className="h-4 w-4 text-emerald-300" />
                  Bilhetes Concorrendo
                </Link>
                <Link to="/leaderboard" className="text-emerald-100 hover:text-yellow-400 font-medium text-sm hidden md:block transition">
                  Classificação Geral
                </Link>
                <Link to="/regulamento" className="text-emerald-100 hover:text-yellow-400 font-medium text-sm hidden md:block transition">
                  Regulamento
                </Link>
                <Link 
                  to="/login" 
                  className="bg-yellow-400 hover:bg-yellow-300 text-slate-950 font-bold px-4 py-2 sm:px-5 sm:py-2.5 rounded-xl text-xs sm:text-sm transition-all duration-200 shadow-sm hover:shadow-md hover:scale-[1.02] flex items-center"
                >
                  <User className="h-4 w-4 mr-1.5" />
                  Entrar / Cadastro
                </Link>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
        <Outlet />
      </main>
      
      <footer className="bg-emerald-950 border-t border-emerald-900 text-emerald-100/60 py-8 text-center text-sm">
        <div className="max-w-7xl mx-auto px-4 flex flex-col items-center space-y-4">
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-emerald-200/85 font-medium">
            <Link to="/" className="hover:text-yellow-400 transition">Início</Link>
            <Link to="/transparencia-sorteio" className="hover:text-yellow-400 transition flex items-center gap-1 text-emerald-300 font-semibold">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              Bilhetes Concorrendo
            </Link>
            <Link to="/regulamento" className="hover:text-yellow-400 transition">Regulamento</Link>
            <Link to="/leaderboard" className="hover:text-yellow-400 transition">Classificação Geral</Link>
            <Link to="/panel" className="hover:text-yellow-400 transition">Minhas Apostas</Link>
          </div>
          <div className="flex flex-col items-center pt-2">
            <Trophy className="h-5 w-5 text-yellow-400/40 mb-2" />
            <p className="text-emerald-100/50">&copy; 2026 PIXCOXIM. Jogue com responsabilidade.</p>
          </div>
        </div>
      </footer>

      {/* Notifications Modal for Admins */}
      {showNotificationsModal && profile?.role === 'admin' && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl shadow-xl border border-slate-200 w-full max-w-lg p-6 relative overflow-hidden">
            <button 
              onClick={() => setShowNotificationsModal(false)}
              className="absolute top-6 right-6 text-slate-400 hover:text-slate-600 transition"
              title="Fechar"
            >
              <X className="h-5 w-5" />
            </button>
            <h3 className="text-xl font-display font-bold text-slate-800 mb-6 flex items-center">
              <Bell className="h-6 w-6 mr-3 text-amber-500" />
              Notificações Pendentes
            </h3>
            
            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
              {pixRequests.length === 0 && pendingWithdrawals.length === 0 ? (
                <p className="text-slate-500 font-medium text-center py-8">Nenhuma notificação pendente.</p>
              ) : (
                <>
                  {pixRequests.map(req => (
                    <div key={req.id} className="bg-emerald-50/50 border border-emerald-100 rounded-2xl p-4 flex justify-between items-center">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">Depósito PIX</span>
                        </div>
                        <p className="font-bold text-slate-800">{req.userName}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs font-mono text-emerald-700 font-bold bg-white px-2.5 py-0.5 rounded-full border border-emerald-100 shadow-sm">
                            R$ {req.amount.toFixed(2)}
                          </span>
                          <span className="text-[10px] text-slate-400 font-medium lowercase">
                            {req.timestamp?.toDate ? req.timestamp.toDate().toLocaleString() : ''}
                          </span>
                        </div>
                      </div>
                      <button 
                        onClick={() => handleVerifyPixRequest(req.id)}
                        className="bg-emerald-200/50 hover:bg-emerald-300/50 text-emerald-700 p-2.5 rounded-xl transition-colors shrink-0 shadow-sm"
                        title="Verificar"
                      >
                        <CheckCircle2 className="h-5 w-5" />
                      </button>
                    </div>
                  ))}
                  
                  {pendingWithdrawals.map(req => {
                    const u = users[req.userId];
                    return (
                      <div key={req.id} className="bg-red-50/50 border border-red-100 rounded-2xl p-4 flex justify-between items-center">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="bg-red-100 text-red-700 text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">Solicitação de Saque</span>
                          </div>
                          <p className="font-bold text-slate-800">{u?.name || 'Carregando...'}</p>
                          {u?.pix_key && (
                            <p className="text-xs font-mono text-slate-500 mt-0.5"><strong className="text-slate-600 font-sans text-[10px] uppercase tracking-wider">Chave PIX:</strong> {u.pix_key}</p>
                          )}
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs font-mono text-red-700 font-bold bg-white px-2.5 py-0.5 rounded-full border border-red-100 shadow-sm">
                              R$ {req.amount.toFixed(2)}
                            </span>
                            <span className="text-[10px] text-slate-400 font-medium lowercase">
                              {new Date(req.timestamp).toLocaleString()}
                            </span>
                          </div>
                        </div>
                        <button 
                          onClick={() => {
                            setShowNotificationsModal(false);
                            navigate('/admin');
                          }}
                          className="bg-amber-100 hover:bg-amber-200 text-amber-800 px-3 py-2 text-xs font-bold rounded-xl transition-colors shrink-0 shadow-sm"
                          title="Ir para o Admin"
                        >
                          Avaliar no Admin
                        </button>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Global Notification Popup for all users */}
      {globalNotification?.active && 
       globalNotification.id !== dismissedNotificationId && 
       (!profile || profile.dismissedNotificationId !== globalNotification.id) && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl shadow-2xl border border-amber-200 w-full max-w-md p-6 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-amber-400 to-amber-500"></div>
            
            <button 
              onClick={handleDismissGlobalNotification}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition"
              title="Fechar Aviso"
            >
              <X className="h-5 w-5" />
            </button>
            
            <div className="flex flex-col items-center text-center mt-2">
              <div className="bg-amber-100 p-3 rounded-full mb-4">
                <Bell className="h-6 w-6 text-amber-600" />
              </div>
              <h3 className="text-xl font-display font-bold text-slate-800 mb-2">Aviso Importante</h3>
              <p className="text-slate-600 font-medium whitespace-pre-wrap">
                {globalNotification.message}
              </p>
              
              <button 
                onClick={handleDismissGlobalNotification}
                className="mt-6 w-full bg-amber-500 hover:bg-amber-600 text-white font-bold py-3 rounded-xl transition-colors shadow-sm"
              >
                Ciente
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
