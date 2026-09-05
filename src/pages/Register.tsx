import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, setDoc, serverTimestamp, getDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/error-handler';
import { isAdminEmail } from '../lib/utils';
import { signInWithGoogle, getNextAvailableNumericId } from '../lib/auth-helpers';
import logoImg from '../assets/images/pix_coxim_logo_1784559379366.jpg';

export default function Register() {
  const location = useLocation();
  const locationState = location.state as { email?: string; infoMessage?: string } | null;

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [popupBlocked, setPopupBlocked] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const paramEmail = searchParams.get('email');
    const stateEmail = locationState?.email;
    const targetEmail = stateEmail || paramEmail;

    if (targetEmail) {
      setEmail(targetEmail);
    }
    if (locationState?.infoMessage) {
      setError(locationState.infoMessage);
    }
  }, [location, locationState]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setPopupBlocked(false);
    setLoading(true);
    
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);

      // Update basic Auth profile
      await updateProfile(userCredential.user, { displayName: name });
      
      const userRole = isAdminEmail(email) ? 'admin' : 'user';
      
      // Compute ID
      const nextId = await getNextAvailableNumericId();
      const displayId = nextId.toString().padStart(3, '0');
      
      // Create user document, handling potential concurrent profile creation in AuthProvider
      try {
        const userRef = doc(db, 'users', userCredential.user.uid);
        const userSnap = await getDoc(userRef);
        
        if (userSnap.exists()) {
          // Profile was already initialized by AuthProvider's listener fallback,
          // simply update the custom user fields (name and phone) to match form input.
          await updateDoc(userRef, {
            name,
            phone,
            updatedAt: serverTimestamp()
          });
        } else {
          // Profile does not exist yet, create it fully.
          await setDoc(userRef, {
            name,
            email,
            phone,
            pix_key: '',
            balance: 0,
            role: userRole,
            createdAt: serverTimestamp(),
            numericId: nextId,
            displayId: displayId,
          });
        }
      } catch (dbError) {
        handleFirestoreError(dbError, OperationType.CREATE, 'users');
      }

      navigate('/');
    } catch (err: any) {
      if (err.code === 'auth/email-already-in-use') {
        setError('E-mail já cadastrado. Acesse a aba Login.');
      } else {
        setError(err.message || 'Erro ao criar conta. Tente novamente.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleRegister = async () => {
    setError('');
    setPopupBlocked(false);
    setLoading(true);
    
    try {
      const result = await signInWithGoogle();
      if (result.success) {
        if (!result.redirected) {
          navigate('/');
        }
      } else {
        if (result.isPopupBlocked) {
          setPopupBlocked(true);
        }
        setError(result.error || 'Erro ao cadastrar com o Google.');
      }
    } catch (err: any) {
      setError(err?.message || 'Erro inesperado ao cadastrar com Google.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 selection:bg-yellow-101 selection:text-emerald-900 animate-fade-in">
      <div className="max-w-md w-full bg-white border border-slate-200 rounded-3xl shadow-xl p-8 relative overflow-hidden">
        {/* Glow effect */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[3px] bg-gradient-to-r from-transparent via-emerald-600 to-transparent"></div>
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-emerald-50 rounded-full blur-[80px] pointer-events-none"></div>

        <div className="flex flex-col items-center mb-6 relative z-10">
          <div className="h-20 w-20 bg-emerald-50 border border-emerald-100 p-1.5 rounded-2xl mb-4 shadow-sm flex items-center justify-center overflow-hidden">
            <img src={logoImg} alt="PIXCOXIM Logo" referrerPolicy="no-referrer" className="h-full w-full object-contain rounded-xl" />
          </div>
          <h1 className="text-2xl font-display font-bold text-slate-800 tracking-tight">Criar Conta</h1>
          <p className="text-slate-500 mt-1 text-center text-sm font-medium">Junte-se ao PIXCOXIM e ganhe prêmios!</p>
        </div>

        {error && (
          <div className="bg-red-50 text-red-700 p-4 rounded-xl mb-6 text-sm border border-red-200 flex flex-col gap-2.5 shadow-inner relative z-10">
            <div className="flex items-start">
              <svg className="w-5 h-5 mr-2.5 flex-shrink-0 text-red-500 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <span className="font-medium leading-relaxed">{error}</span>
            </div>
            {popupBlocked && (
              <a
                href={window.location.href}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 text-center bg-red-100 hover:bg-red-200 text-red-800 font-bold py-2 px-3 rounded-lg text-xs transition-colors border border-red-300 shadow-xs"
              >
                Abrir em nova aba para autenticar com Google ↗
              </a>
            )}
          </div>
        )}

        <div className="space-y-4 mb-6 relative z-10">
          <button 
            type="button" 
            disabled={loading}
            onClick={handleGoogleRegister}
            className="w-full flex justify-center items-center bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-bold py-3.5 rounded-xl transition-all disabled:opacity-50 shadow-sm cursor-pointer"
          >
            <svg className="h-5 w-5 mr-3" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Cadastrar com Google
          </button>
        </div>

        <div className="relative mb-6 z-10">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-200"></div>
          </div>
          <div className="relative flex justify-center text-sm font-medium">
            <span className="px-3 bg-white text-slate-400 uppercase tracking-wider text-[10px] font-bold">Ou cadastrar com e-mail</span>
          </div>
        </div>

        <form onSubmit={handleRegister} className="space-y-4 relative z-10">
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5 ml-1">Nome Completo</label>
            <input 
              type="text" 
              required
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/35 focus:border-emerald-600 outline-none text-slate-800 placeholder-slate-400 transition-all font-medium text-sm"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Maria Silva"
            />
          </div>
          
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5 ml-1">E-mail</label>
            <input 
              type="email" 
              required
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/35 focus:border-emerald-600 outline-none text-slate-800 placeholder-slate-400 transition-all font-medium text-sm"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5 ml-1">Telefone (Whatsapp)</label>
            <input 
              type="tel" 
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/35 focus:border-emerald-600 outline-none text-slate-800 placeholder-slate-400 transition-all font-medium text-sm"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(67) 99999-9999"
            />
          </div>
          
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5 ml-1">Senha</label>
            <input 
              type="password" 
              required
              minLength={6}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/35 focus:border-emerald-600 outline-none text-slate-800 placeholder-slate-400 transition-all font-medium text-sm"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 rounded-xl transition-all disabled:opacity-50 mt-6 shadow-md shadow-emerald-600/10 hover:shadow-lg transform hover:-translate-y-0.5 relative overflow-hidden cursor-pointer"
          >
            {loading ? 'Cadastrando...' : 'Cadastrar na Plataforma'}
          </button>
        </form>

        <div className="mt-8 text-center text-sm text-slate-500 relative z-10 font-medium">
          Já tem uma conta?{' '}
          <Link to="/login" className="text-emerald-650 hover:text-emerald-750 font-bold transition-colors border-b border-emerald-550/30 pb-0.5">
            Fazer login
          </Link>
        </div>
      </div>
    </div>
  );
}
