import React, { useState, useMemo } from 'react';
import { Firestore } from 'firebase/firestore';
import { UserProfile, PixPremiadoGame } from '../types';
import { 
  OPTIMAL_100_PROXIMITY_NUMBERS, 
  GUILHERME_PEREIRA_DEFAULT, 
  insertOptimalNumbersForGuilherme 
} from '../utils/optimalNumbers';
import { formatTicketNumber } from '../utils/maskEmail';
import { 
  Sparkles, 
  X, 
  CheckCircle2, 
  UserCheck, 
  Ticket, 
  ShieldCheck, 
  AlertCircle, 
  Loader2 
} from 'lucide-react';

interface GuilhermeTicketsModalProps {
  isOpen: boolean;
  onClose: () => void;
  db: Firestore;
  users: UserProfile[];
  games: PixPremiadoGame[];
  onSuccess?: (msg: string) => void;
}

export const GuilhermeTicketsModal: React.FC<GuilhermeTicketsModalProps> = ({
  isOpen,
  onClose,
  db,
  users,
  games,
  onSuccess
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Locate Guilherme Pereira profile
  const guilhermeUser = useMemo(() => {
    return (
      users.find(u => 
        u.id === GUILHERME_PEREIRA_DEFAULT.id ||
        u.name.toLowerCase().includes('guilherme') ||
        (u.email && u.email.toLowerCase().includes('guilherme'))
      ) || {
        id: GUILHERME_PEREIRA_DEFAULT.id,
        name: GUILHERME_PEREIRA_DEFAULT.name,
        email: GUILHERME_PEREIRA_DEFAULT.email,
        role: 'user',
        balance: 0,
        createdAt: new Date().toISOString()
      } as UserProfile
    );
  }, [users]);

  // Set of already registered numbers
  const existingSet = useMemo(() => {
    const set = new Set<number>();
    games.forEach(g => {
      if ((g as any).status === 'cancelled' || (g as any).status === 'refunded') return;
      if (Array.isArray(g.numbers)) {
        g.numbers.forEach(n => {
          const val = typeof n === 'number' ? n : parseInt(String(n), 10);
          if (!isNaN(val)) set.add(val);
        });
      } else if ((g as any).number !== undefined && (g as any).number !== null) {
        set.add((g as any).number);
      } else if ((g as any).ticketNumber !== undefined && (g as any).ticketNumber !== null) {
        set.add((g as any).ticketNumber);
      }
    });
    return set;
  }, [games]);

  const numbersAnalysis = useMemo(() => {
    return OPTIMAL_100_PROXIMITY_NUMBERS.map(num => ({
      num,
      formatted: formatTicketNumber(num),
      alreadySold: existingSet.has(num)
    }));
  }, [existingSet]);

  const newNumbersCount = useMemo(() => {
    return numbersAnalysis.filter(n => !n.alreadySold).length;
  }, [numbersAnalysis]);

  if (!isOpen) return null;

  const handleConfirmInsert = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const res = await insertOptimalNumbersForGuilherme(db, guilhermeUser, games);
      const msg = res.alreadyCount > 0
        ? `${res.insertedCount} novos bilhetes inseridos com sucesso para ${res.userName}! (${res.alreadyCount} já estavam cadastrados).`
        : `Todos os 100 bilhetes estratégicos foram inseridos e confirmados para ${res.userName}!`;
      
      setSuccessMessage(msg);
      if (onSuccess) {
        onSuccess(msg);
      }
    } catch (err: any) {
      console.error('Erro ao inserir bilhetes de Guilherme Pereira:', err);
      setErrorMessage(err.message || 'Falha ao gravar os bilhetes no banco de dados.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-fade-in overflow-y-auto">
      <div 
        className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-2xl my-8 overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-900 via-slate-900 to-indigo-950 p-6 text-white relative">
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 text-slate-400 hover:text-white p-1 rounded-xl hover:bg-white/10 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-3 mb-2">
            <span className="p-2.5 bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-2xl">
              <Sparkles className="w-6 h-6 text-amber-400 animate-pulse" />
            </span>
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-amber-300">
                Lote Estratégico • Loteria Federal
              </span>
              <h3 className="text-xl font-display font-extrabold text-white">
                Inserir 100 Bilhetes como Vendidos
              </h3>
            </div>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Números centróides calculados nos maiores intervalos vazios para maximizar as chances pelo <strong>critério de proximidade</strong>.
          </p>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1 text-slate-700">
          {/* User Details Card */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-indigo-100 border border-indigo-200 text-indigo-700 flex items-center justify-center font-bold text-lg shrink-0">
                GP
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-slate-900 text-sm">
                    {guilhermeUser.name}
                  </span>
                  <span className="bg-emerald-100 text-emerald-800 text-[10px] font-black px-2 py-0.5 rounded-full border border-emerald-300 flex items-center gap-1">
                    <UserCheck className="w-3 h-3" />
                    Cadastrado
                  </span>
                </div>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  {guilhermeUser.email}
                </p>
                <span className="text-[10px] text-slate-400 font-mono">
                  ID: {guilhermeUser.id}
                </span>
              </div>
            </div>

            <div className="text-right sm:border-l sm:border-slate-200 sm:pl-4">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                Total do Lote
              </span>
              <span className="text-lg font-black font-mono text-emerald-700">
                100 Bilhetes
              </span>
              <span className="text-[11px] text-slate-500 block">
                R$ 100,00 (R$ 1,00/un)
              </span>
            </div>
          </div>

          {/* Success / Error Messages */}
          {successMessage && (
            <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-2xl flex items-start gap-3 text-emerald-900 text-xs">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <strong className="block font-bold text-sm">Sucesso!</strong>
                <p className="mt-0.5 leading-relaxed">{successMessage}</p>
                <p className="text-[11px] text-emerald-700 font-medium mt-2">
                  Os bilhetes já constam no relatório público de transparência e estão concorrendo na apuração da Loteria Federal.
                </p>
              </div>
            </div>
          )}

          {errorMessage && (
            <div className="p-4 bg-rose-50 border border-rose-300 rounded-2xl flex items-start gap-3 text-rose-900 text-xs">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <strong className="block font-bold text-sm">Erro ao processar</strong>
                <p className="mt-0.5 leading-relaxed">{errorMessage}</p>
              </div>
            </div>
          )}

          {/* Strategy Description */}
          <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-4 text-xs space-y-1 text-amber-900">
            <div className="flex items-center gap-1.5 font-bold text-amber-950">
              <ShieldCheck className="w-4 h-4 text-amber-600" />
              <span>Critério Matemático de Máxima Proximidade</span>
            </div>
            <p className="text-amber-800 leading-relaxed text-[11px]">
              Estes 100 números foram selecionados nos maiores espaços livres existentes entre os bilhetes já adquiridos, maximizando o raio de atração para que, se a milhar sorteada cair em qualquer desses intervalos, o bilhete de Guilherme Pereira seja o mais próximo e contemplado.
            </p>
          </div>

          {/* Grid of the 100 Numbers */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Lista dos 100 Bilhetes Selecionados:
              </span>
              <span className="text-[11px] font-bold text-indigo-700">
                {newNumbersCount} novos a inserir ({100 - newNumbersCount} já no sistema)
              </span>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 max-h-48 overflow-y-auto grid grid-cols-5 sm:grid-cols-10 gap-1.5 font-mono text-center">
              {numbersAnalysis.map(({ num, formatted, alreadySold }) => (
                <div
                  key={num}
                  className={`text-[11px] font-bold py-1 px-1 rounded-md border transition-all ${
                    alreadySold
                      ? 'bg-slate-200/80 text-slate-500 border-slate-300 line-through opacity-60'
                      : 'bg-white text-indigo-900 border-indigo-200 shadow-xs hover:border-indigo-400'
                  }`}
                  title={alreadySold ? `Bilhete ${formatted} já vendido anteriormente` : `Bilhete ${formatted} livre para inserir`}
                >
                  {formatted}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-50 border-t border-slate-200 p-5 flex flex-col sm:flex-row items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-slate-300 text-slate-600 hover:text-slate-900 hover:bg-slate-100 font-bold text-xs transition cursor-pointer disabled:opacity-50"
          >
            {successMessage ? 'Fechar' : 'Cancelar'}
          </button>

          {!successMessage ? (
            <button
              type="button"
              onClick={handleConfirmInsert}
              disabled={isSubmitting || newNumbersCount === 0}
              className="w-full sm:w-auto px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-extrabold text-xs transition shadow-md shadow-indigo-600/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Gravando no Banco de Dados...</span>
                </>
              ) : (
                <>
                  <Ticket className="w-4 h-4" />
                  <span>Inserir {newNumbersCount} Bilhetes para Guilherme Pereira</span>
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs transition shadow-md cursor-pointer"
            >
              Concluído
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default GuilhermeTicketsModal;
