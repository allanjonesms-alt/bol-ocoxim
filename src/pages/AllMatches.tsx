import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Match } from '../types';
import { Calendar, ChevronRight, Lock, Trophy, AlertCircle, FileText, Download, CheckCircle2 } from 'lucide-react';
import { handleFirestoreError, OperationType } from '../lib/error-handler';
import { generateMatchBetsPDF } from '../utils/pdfGenerator';
import MatchCountdown from '../components/MatchCountdown';

export default function AllMatches() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [printingPdfId, setPrintingPdfId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'warning') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    setLoading(true);
    const q = query(collection(db, 'matches'), orderBy('date', 'desc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const matchesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Match[];
        setMatches(matchesData);
        setError(null);
        setLoading(false);
      },
      (error) => {
        console.error("Error fetching matches:", error);
        setError(handleFirestoreError(error, OperationType.LIST, 'matches'));
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const isBrasilHaitiMatch = (m: Match): boolean => {
    const h = m.team1?.toLowerCase() || '';
    const a = m.team2?.toLowerCase() || '';
    return (h.includes('brasil') && a.includes('haiti')) || 
           (h.includes('haiti') && a.includes('brasil'));
  };

  const checkPdfAvailability = (match: Match): { allowed: boolean; remainingText?: string } => {
    if (isBrasilHaitiMatch(match)) {
      return { allowed: true };
    }
    const matchTime = new Date(match.date).getTime();
    const closingTime = matchTime - 30 * 60 * 1000;
    const pdfAvailableTime = closingTime + 15 * 60 * 1000;
    const currentTime = Date.now();
    
    if (currentTime < pdfAvailableTime) {
      const diffMs = pdfAvailableTime - currentTime;
      const totalSeconds = Math.ceil(diffMs / 1000);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      const remainingText = minutes > 0 ? `${minutes} min e ${seconds} seg` : `${seconds} seg`;
      return { allowed: false, remainingText };
    }
    return { allowed: true };
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 min-h-[50vh]">
        <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-slate-500 font-medium animate-pulse text-sm uppercase tracking-wider">Carregando todos os jogos...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 text-red-700 p-8 rounded-3xl m-4 md:m-8 max-w-xl mx-auto flex flex-col items-center justify-center text-center shadow-sm border border-red-100">
        <AlertCircle className="h-10 w-10 mb-4 text-red-500" />
        <p className="font-bold mb-2">Erro de Conquexão</p>
        <p className="text-sm opacity-80 mb-6">{error}</p>
        <button 
          onClick={() => window.location.reload()} 
          className="bg-red-600 hover:bg-red-700 text-white font-bold px-5 py-2.5 rounded-xl text-sm transition shadow-sm"
        >
          Tentar Novamente
        </button>
      </div>
    );
  }

  // Split into Official and Promotional
  const officialMatches = matches.filter(match => !match.isPromotional).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const promotionalMatches = matches.filter(match => match.isPromotional).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const MatchCard = ({ match }: { match: Match }) => {
    const matchDate = new Date(match.date);
    const dateFormatted = matchDate.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
    const timeFormatted = matchDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const isLive = match.status !== 'finished' && now >= matchDate.getTime();
    const isClosed = match.status === 'betting_closed' || (match.status === 'open' && now >= (matchDate.getTime() - 30 * 60 * 1000));
    const isFinished = match.status === 'finished';

    return (
      <Link 
        to={`/match/${match.id}`}
        className="group relative bg-white flex flex-col h-full rounded-3xl p-6 transition-all duration-300 hover:shadow-xl hover:shadow-emerald-900/5 hover:-translate-y-1 border border-slate-100 overflow-hidden"
      >
        <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-50 rounded-full blur-3xl -z-10 group-hover:bg-emerald-100 transition-colors"></div>
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-blue-50 rounded-full blur-2xl -z-10 group-hover:bg-blue-100 transition-colors"></div>

        <div className="flex justify-between items-start mb-6 relative">
          <div className="flex items-center gap-2">
            {!isFinished && !isLive && (
              <span className="flex items-center gap-1.5 text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
                <Calendar className="h-3.5 w-3.5" />
                {dateFormatted} • {timeFormatted}
              </span>
            )}
            {isLive && (
              <span className="flex items-center gap-1.5 text-[11px] font-bold text-white bg-red-500 px-3 py-1 rounded-full shadow-sm animate-pulse">
                <span className="w-1.5 h-1.5 bg-white rounded-full"></span>
                AO VIVO
              </span>
            )}
            {isFinished && (
              <span className="flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-slate-200 px-3 py-1 rounded-full">
                <Trophy className="h-3.5 w-3.5 text-yellow-600" />
                FINALIZADO
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            {isClosed && !isFinished && (
              <span className="flex items-center gap-1.5 text-xs font-bold text-orange-600 bg-orange-100 shadow-sm shadow-orange-900/5 px-3 py-1 rounded-full">
                <Lock className="h-3 w-3" /> Apostas Encerradas
              </span>
            )}

            {!isClosed && !isFinished && !isLive && (
              <div className="bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full text-[11px] font-bold font-mono tracking-tight border border-emerald-200 shadow-sm flex items-center gap-1.5">
                <MatchCountdown matchDate={match.date} isOpen={match.status === 'open'} />
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-between items-center px-2 relative z-10">
          <div className="text-center w-1/3 flex flex-col items-center">
            <div className="w-16 h-16 sm:w-20 sm:h-20 bg-slate-50 rounded-2xl p-2 sm:p-3 shadow-inner mb-3 border border-slate-100 group-hover:scale-105 transition-transform">
              <img src={match.flag1} alt={match.team1} className="w-full h-full object-contain filter drop-shadow-sm" />
            </div>
            <span className="font-display font-bold text-slate-800 text-sm sm:text-base leading-tight truncate w-full">{match.team1}</span>
          </div>

          <div className="flex flex-col items-center justify-center w-1/3 px-2">
            {(isLive || isFinished) ? (
              <div className="flex items-center gap-2 sm:gap-3 bg-slate-50 px-3 sm:px-4 py-2 sm:py-3 rounded-2xl border border-slate-200 shadow-inner">
                <span className="text-xl sm:text-3xl font-display font-bold text-slate-800">{match.result1 ?? 0}</span>
                <span className="text-slate-400 font-medium">×</span>
                <span className="text-xl sm:text-3xl font-display font-bold text-slate-800">{match.result2 ?? 0}</span>
              </div>
            ) : (
              <span className="text-xs sm:text-sm font-bold text-slate-400 uppercase tracking-widest bg-slate-50 px-3 sm:px-4 py-1.5 rounded-full border border-slate-100 flex items-center gap-1 bg-opacity-70">
                <span className="text-emerald-500 font-bold">x</span>
              </span>
            )}
          </div>

          <div className="text-center w-1/3 flex flex-col items-center">
            <div className="w-16 h-16 sm:w-20 sm:h-20 bg-slate-50 rounded-2xl p-2 sm:p-3 shadow-inner mb-3 border border-slate-100 group-hover:scale-105 transition-transform">
              <img src={match.flag2} alt={match.team2} className="w-full h-full object-contain filter drop-shadow-sm" />
            </div>
            <span className="font-display font-bold text-slate-800 text-sm sm:text-base leading-tight truncate w-full">{match.team2}</span>
          </div>
        </div>

        <div className="mt-auto pt-4 border-t border-slate-100 flex justify-between items-center relative z-10 w-full flex-wrap sm:flex-nowrap gap-2">
          <div className="flex items-center gap-2">
            <span className="bg-emerald-50 text-emerald-700 text-xs px-3 py-1.5 rounded-full font-bold border border-emerald-100 flex items-center gap-1.5">
              <span>{match.phase || (match.isPromotional ? 'Promocional' : 'Oficial')}</span>
            </span>
          </div>

          {isClosed || isBrasilHaitiMatch(match) ? (
            <button
              onClick={async (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                if (printingPdfId === match.id) return;
                
                const check = checkPdfAvailability(match);
                if (!check.allowed) {
                  showToast(`O PDF de apostas estará disponível 15 minutos após o encerramento. Faltam: ${check.remainingText}`, 'warning');
                  return;
                }

                setPrintingPdfId(match.id);
                try {
                  await generateMatchBetsPDF(match);
                  showToast('PDF gerado com sucesso!', 'success');
                } catch (error) {
                  console.error('Error generating PDF:', error);
                  showToast('Erro ao gerar o PDF. Tente novamente mais tarde.', 'error');
                } finally {
                  setPrintingPdfId(null);
                }
              }}
              disabled={printingPdfId === match.id}
              className="flex items-center justify-center gap-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 px-3 overflow-hidden whitespace-nowrap py-1.5 w-auto rounded-full transition-colors order-last sm:order-none ml-auto sm:ml-0"
              title="Palpites do Jogo"
            >
              {printingPdfId === match.id ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin shrink-0"></div>
                  <span className="truncate max-w-[100px]">Gerando...</span>
                </>
              ) : (
                <>
                  <Download className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                  <span>PDF de Palpites</span>
                </>
              )}
            </button>
          ) : null}

          <div className="flex items-center text-xs font-bold text-emerald-600 group-hover:text-emerald-700 transition-colors bg-emerald-50/50 hover:bg-emerald-100/50 px-3 py-1.5 rounded-full">
            Ver detalhes <ChevronRight className="h-4 w-4 ml-0.5" />
          </div>
        </div>
      </Link>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg border animate-in slide-in-from-top-2 fade-in duration-200 ${
          toast.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 
          toast.type === 'warning' ? 'bg-orange-50 text-orange-800 border-orange-200' :
          'bg-red-50 text-red-800 border-red-200'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> : 
           toast.type === 'warning' ? <AlertCircle className="h-5 w-5 text-orange-500" /> :
           <AlertCircle className="h-5 w-5 text-red-500" />}
          <p className="font-medium text-sm">{toast.message}</p>
        </div>
      )}

      <div className="bg-emerald-600 pt-16 pb-12 px-4 sm:px-6 shadow-sm overflow-hidden relative">
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500 rounded-full blur-3xl opacity-50 pointer-events-none -translate-y-1/2 translate-x-1/3"></div>
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-emerald-700 rounded-full blur-3xl opacity-50 pointer-events-none translate-y-1/3 -translate-x-1/4"></div>
        
        <div className="max-w-7xl mx-auto relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <Link 
              to="/" 
              className="bg-white/10 hover:bg-white/20 text-white rounded-xl p-2.5 transition-colors"
            >
              <ChevronRight className="h-5 w-5 rotate-180" />
            </Link>
            <div>
              <h1 className="text-3xl sm:text-4xl font-display font-black text-white tracking-tight mb-2 drop-shadow-sm">
                Todos os Jogos
              </h1>
              <p className="text-emerald-100 text-sm font-medium">
                Acompanhe o histórico de todas as partidas na plataforma.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 -mt-6 relative z-20 pb-12">
        {/* Official Matches Section */}
        {officialMatches.length > 0 && (
          <div className="mb-12">
            <h2 className="text-xl font-display font-bold text-slate-800 mb-6 flex items-center border-b border-slate-200 pb-3">
              Jogos Oficiais
            </h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
              {officialMatches.map((match) => (
                <div key={match.id} className="h-full">
                  <MatchCard match={match} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Promotional Matches Section */}
        {promotionalMatches.length > 0 && (
          <div className="mb-12">
            <h2 className="text-xl font-display font-bold text-slate-800 mb-6 flex items-center border-b border-slate-200 pb-3">
              Jogos Promocionais
            </h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
              {promotionalMatches.map((match) => (
                <div key={match.id} className="h-full">
                  <MatchCard match={match} />
                </div>
              ))}
            </div>
          </div>
        )}

        {matches.length === 0 && !loading && (
          <div className="bg-white rounded-3xl p-12 text-center shadow-sm border border-slate-100 flex flex-col items-center">
            <Trophy className="h-12 w-12 text-slate-300 mb-4" />
            <h3 className="text-lg font-bold text-slate-700 mb-2">Nenhum Jogo Encontrado</h3>
            <p className="text-slate-500 font-medium">Ainda não há jogos disponíveis na plataforma.</p>
          </div>
        )}
      </div>
    </div>
  );
}
