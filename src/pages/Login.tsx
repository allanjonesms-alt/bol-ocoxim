import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword, signOut, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { doc, getDoc, getDocFromCache, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { Trophy } from 'lucide-react';
import logoImg from '../assets/images/logo.jpg';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    const form = e.currentTarget as HTMLFormElement;
    const formData = new FormData(form);
    const formEmail = (formData.get('email') as string || email || '').trim();
    const formPassword = formData.get('password') as string || password || '';

    console.log('[DEBUG] Login Info - Auth exists:', !!auth, 'Email:', formEmail, 'Password length:', formPassword.length);
    if (!auth) {
      setError('Erro de inicialização do Firebase Auth.');
      setLoading(false);
      return;
    }

    if (!formEmail || !formPassword) {
      setError('Por favor, preencha o e-mail e a senha.');
      setLoading(false);
      return;
    }
    
    try {
      const userCredential = await signInWithEmailAndPassword(auth, formEmail, formPassword);
      
      // Attempt profile document verification gracefully without failing auth if offline
      try {
        const userRef = doc(db, 'users', userCredential.user.uid);
        let docSnap;
        try {
          docSnap = await getDoc(userRef);
        } catch (fErr) {
          console.warn('[Login] Server getDoc failed, trying cache:', fErr);
          try {
            docSnap = await getDocFromCache(userRef);
          } catch (cErr) {
            console.warn('[Login] Cache getDoc failed:', cErr);
          }
        }
        
        if (!docSnap || !docSnap.exists()) {
          const userRole = formEmail.toLowerCase().startsWith('allanjonesms') ? 'admin' : 'user';
          await setDoc(userRef, {
            name: userCredential.user.displayName || formEmail.split('@')[0],
            email: formEmail,
            phone: '',
            pix_key: '',
            balance: 0,
            role: userRole,
            createdAt: serverTimestamp()
          }).catch(sErr => console.warn('[Login] setDoc profile warning:', sErr));
        }
      } catch (profileErr) {
        console.warn('[Login] Non-blocking profile check error:', profileErr);
      }
      
      navigate('/');
    } catch (err: any) {
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
         setError('Credenciais inválidas. Se você tem certeza da senha, você pode ter criado esta conta usando Google Auth ou outro provedor. Tente a opção "Esqueci minha senha".');
      } else if (err.code === 'auth/network-request-failed' || (err.message && err.message.toLowerCase().includes('offline'))) {
         setError('Erro de conexão com o servidor. Verifique sua conexão e tente novamente.');
      } else {
         setError(err.message || 'E-mail ou senha incorretos.');
      }
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    setLoading(true);
    
    console.log('[DEBUG] Google Login Info - Auth exists:', !!auth);
    if (!auth) {
      setError('Erro de inicialização do Firebase Auth para login com Google.');
      setLoading(false);
      return;
    }
    
    try {
      const provider = new GoogleAuthProvider();
      const userCredential = await signInWithPopup(auth, provider);
      
      const userEmail = userCredential.user.email || '';
      
      // Attempt profile document verification gracefully without failing auth if offline
      try {
        const userRef = doc(db, 'users', userCredential.user.uid);
        let docSnap;
        try {
          docSnap = await getDoc(userRef);
        } catch (fErr) {
          console.warn('[Google Login] Server getDoc failed, trying cache:', fErr);
          try {
            docSnap = await getDocFromCache(userRef);
          } catch (cErr) {
            console.warn('[Google Login] Cache getDoc failed:', cErr);
          }
        }
        
        if (!docSnap || !docSnap.exists()) {
          const userRole = userEmail.toLowerCase().startsWith('allanjonesms') ? 'admin' : 'user';
          await setDoc(userRef, {
            name: userCredential.user.displayName || userEmail.split('@')[0],
            email: userEmail,
            phone: '',
            pix_key: '',
            balance: 0,
            role: userRole,
            createdAt: serverTimestamp()
          }).catch(sErr => console.warn('[Google Login] setDoc profile warning:', sErr));
        }
      } catch (profileErr) {
        console.warn('[Google Login] Non-blocking profile check error:', profileErr);
      }
      
      navigate('/');
    } catch (err: any) {
      if (err.code === 'auth/popup-closed-by-user') {
        setError('Login com Google cancelado pelo usuário.');
      } else if (err.code === 'auth/network-request-failed' || (err.message && err.message.toLowerCase().includes('offline'))) {
        setError('Erro de conexão com o servidor. Verifique sua conexão e tente novamente.');
      } else {
        setError(err.message || 'Erro ao entrar com Google.');
      }
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 selection:bg-yellow-100 selection:text-emerald-900 animate-fade-in">
      <div className="max-w-md w-full bg-white border border-slate-200 rounded-3xl shadow-xl p-8 relative overflow-hidden">
        {/* Glow effect */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[3px] bg-gradient-to-r from-transparent via-emerald-600 to-transparent"></div>
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-emerald-50 rounded-full blur-[80px] pointer-events-none"></div>

        <div className="flex flex-col items-center mb-8 relative z-10">
          <div className="h-20 w-20 bg-emerald-50 border border-emerald-100 p-1.5 rounded-2xl mb-5 shadow-sm flex items-center justify-center overflow-hidden">
            <img src={logoImg} alt="PIXCOXIM Logo" referrerPolicy="no-referrer" className="h-full w-full object-contain rounded-xl" />
          </div>
          <h1 className="text-3xl font-display font-bold text-slate-800 tracking-tight">BOLÃO COXIM <span className="text-emerald-600">2026</span></h1>
          <p className="text-slate-500 mt-2 text-center text-sm font-medium">
            Sua central de palpites e prêmios da Copa.
          </p>
        </div>

        {error && (
          <div className="bg-red-50 text-red-650 p-4 rounded-xl mb-6 text-sm border border-red-100 flex items-center shadow-inner relative z-10">
            <svg className="w-5 h-5 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg>
            {error}
          </div>
        )}

        <div className="space-y-4 mb-6 relative z-10">
          <button 
            type="button" 
            disabled={loading}
            onClick={handleGoogleLogin}
            className="w-full flex justify-center items-center bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-bold py-3.5 rounded-xl transition-all disabled:opacity-50 shadow-sm cursor-pointer"
          >
            <svg className="h-5 w-5 mr-3" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continuar com Google
          </button>
        </div>

        <div className="relative mb-6 z-10">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-200"></div>
          </div>
          <div className="relative flex justify-center text-sm font-medium">
            <span className="px-3 bg-white text-slate-400 uppercase tracking-wider text-[10px] font-bold">Ou entrar com e-mail</span>
          </div>
        </div>

        <form onSubmit={handleLogin} className="space-y-4 relative z-10">
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5 ml-1">E-mail</label>
            <input 
              type="email" 
              name="email"
              required
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/35 focus:border-emerald-600 outline-none text-slate-800 placeholder-slate-400 transition-all font-medium text-sm"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
            />
          </div>
          <div>
            <div className="flex justify-between items-center mb-1.5 ml-1 mr-1">
               <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide">Senha</label>
              <Link to="/forgot-password" className="text-xs text-emerald-600 hover:text-emerald-700 font-bold transition-colors">
                Esqueci minha senha
              </Link>
            </div>
            <input 
              type="password" 
              name="password"
              required
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
            {loading ? 'Processando...' : 'Entrar na Conta'}
          </button>
        </form>

        <div className="mt-8 text-center text-sm text-slate-500 relative z-10 font-medium">
          Ainda não tem conta?{' '}
          <Link to="/register" className="text-emerald-650 hover:text-emerald-750 font-bold transition-colors border-b border-emerald-550/30 pb-0.5">
            Cadastre-se agora
          </Link>
        </div>
      </div>
    </div>
  );
}
