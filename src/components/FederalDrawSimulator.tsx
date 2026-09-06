import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { PixPremiadoGame, UserProfile, PixPremiadoDraw } from '../types';
import { maskEmail, formatTicketNumber } from '../utils/maskEmail';
import { 
  Trophy, 
  Sparkles, 
  Dices, 
  RotateCcw, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  User, 
  Phone, 
  AlertCircle, 
  Layers, 
  ChevronRight,
  ShieldCheck,
  Award,
  Hash,
  FileText,
  Printer,
  ExternalLink,
  Ticket,
  UserCheck
} from 'lucide-react';
import { doc, setDoc, Firestore } from 'firebase/firestore';
import { db as defaultDb } from '../lib/firebase';
import GuilhermeTicketsModal from './GuilhermeTicketsModal';

export interface FederalDrawSimulatorProps {
  games: PixPremiadoGame[];
  users: UserProfile[];
  activeDraw?: PixPremiadoDraw | null;
  db?: Firestore;
  onShowToast?: (msg: string, type: 'success' | 'error' | 'warning') => void;
}

export interface StepAudit {
  stepNumber: number;
  title: string;
  description: string;
  testedValues: { label: string; rawPrize: string; milharStr: string; milharNum: number; status: 'hit' | 'miss' }[];
  matchedGame?: PixPremiadoGame;
  winnerReason?: string;
  isHit: boolean;
}

export interface SimulationResult {
  hasRun: boolean;
  isValid: boolean;
  errorMessage?: string;
  prizes: string[];
  winnerGame?: PixPremiadoGame;
  winnerUser?: UserProfile;
  winningTicketStr?: string;
  ruleApplied: string;
  stepsAudit: StepAudit[];
  targetMilhar: string;
  distance?: number;
  tieBreakerApplied?: boolean;
}

export const EXAMPLE_PRIZES = ['008932', '049314', '017181', '010373', '047859'];

export const FederalDrawSimulator: React.FC<FederalDrawSimulatorProps> = ({
  games,
  users,
  activeDraw,
  db,
  onShowToast
}) => {
  const [p1, setP1] = useState<string>('');
  const [p2, setP2] = useState<string>('');
  const [p3, setP3] = useState<string>('');
  const [p4, setP4] = useState<string>('');
  const [p5, setP5] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [showGuilhermeModal, setShowGuilhermeModal] = useState(false);

  // Exclusively Real tickets from database (all sold tickets)
  const federalGames = useMemo(() => {
    const list: PixPremiadoGame[] = [];
    games.forEach(g => {
      if (g.status === 'cancelled' || (g.status as string) === 'refunded') return;

      let rawNumbers: any[] = [];
      if (Array.isArray(g.numbers) && g.numbers.length > 0) {
        rawNumbers = g.numbers;
      } else if ((g as any).number !== undefined && (g as any).number !== null) {
        rawNumbers = [(g as any).number];
      } else if ((g as any).ticketNumber !== undefined && (g as any).ticketNumber !== null) {
        rawNumbers = [(g as any).ticketNumber];
      } else if ((g as any).numbers !== undefined && (g as any).numbers !== null) {
        rawNumbers = [(g as any).numbers];
      }

      rawNumbers.forEach((rawNum, idx) => {
        const num = typeof rawNum === 'number' ? rawNum : parseInt(String(rawNum).trim(), 10);
        if (isNaN(num)) return;

        list.push({
          ...g,
          id: g.id ? `${g.id}${rawNumbers.length > 1 ? `-${idx + 1}` : ''}` : `TKT-${num}`,
          numbers: [num],
        });
      });
    });

    return list;
  }, [games]);

  // Helper to extract purchase timestamp for tie-breaker
  const getGameTimestamp = (g: PixPremiadoGame): number => {
    if (!g.createdAt) return 0;
    if (typeof g.createdAt === 'object' && 'seconds' in g.createdAt) {
      return g.createdAt.seconds * 1000 + (g.createdAt.nanoseconds || 0) / 1000000;
    }
    if (typeof g.createdAt?.toDate === 'function') {
      return g.createdAt.toDate().getTime();
    }
    return new Date(g.createdAt).getTime() || 0;
  };

  const formatGameDate = (g: PixPremiadoGame): string => {
    if (!g.createdAt) return '-';
    try {
      let date: Date;
      if (typeof g.createdAt === 'object' && 'seconds' in g.createdAt) {
        date = new Date(g.createdAt.seconds * 1000);
      } else if (typeof g.createdAt?.toDate === 'function') {
        date = g.createdAt.toDate();
      } else {
        date = new Date(g.createdAt);
      }
      return date.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    } catch {
      return '-';
    }
  };

  // Run the lottery verification algorithm
  const simulationResult = useMemo((): SimulationResult => {
    const rawPrizes = [p1.trim(), p2.trim(), p3.trim(), p4.trim(), p5.trim()];
    const anyFilled = rawPrizes.some(p => p.length > 0);

    if (!anyFilled) {
      return {
        hasRun: false,
        isValid: false,
        prizes: [],
        stepsAudit: [],
        ruleApplied: '',
        targetMilhar: ''
      };
    }

    const allFilled = rawPrizes.every(p => p.length >= 4 && !isNaN(Number(p)));
    if (!allFilled) {
      return {
        hasRun: true,
        isValid: false,
        errorMessage: 'Preencha os 5 prêmios com números válidos (mínimo 4 e até 6 dígitos).',
        prizes: rawPrizes,
        stepsAudit: [],
        ruleApplied: '',
        targetMilhar: ''
      };
    }

    // Format all prizes with leading zero padding up to at least 5 or 6 digits
    const prizes = rawPrizes.map(p => (p.length < 5 ? p.padStart(5, '0') : p));
    const target1stMilhar = prizes[0].slice(-4);
    const target1stMilharNum = parseInt(target1stMilhar, 10);

    const stepsAudit: StepAudit[] = [];
    let winnerGame: PixPremiadoGame | undefined;
    let ruleApplied = '';
    let winnerReason = '';
    let distance: number | undefined;
    let tieBreakerApplied = false;

    // STEP 1: Milhar do 1º Prêmio (Últimos 4 dígitos)
    const step1Tested = [{
      label: '1º Prêmio',
      rawPrize: prizes[0],
      milharStr: prizes[0].slice(-4),
      milharNum: parseInt(prizes[0].slice(-4), 10),
      status: 'miss' as 'hit' | 'miss'
    }];
    
    const step1Match = federalGames.find(g => g.numbers[0] === step1Tested[0].milharNum);
    if (step1Match) {
      step1Tested[0].status = 'hit';
      winnerGame = step1Match;
      ruleApplied = '1ª Regra: Milhar Exata do 1º Prêmio';
      winnerReason = `Bilhete Nº ${step1Tested[0].milharStr} vendido correspondente exatamente à milhar final do 1º Prêmio (${prizes[0]}).`;
    }

    stepsAudit.push({
      stepNumber: 1,
      title: 'Milhar do 1º Prêmio (Últimos 4 dígitos)',
      description: 'Verificação da milhar final oficial do 1º Prêmio da Loteria Federal.',
      testedValues: step1Tested,
      matchedGame: step1Match,
      winnerReason: step1Match ? winnerReason : undefined,
      isHit: !!step1Match
    });

    // STEP 2: Busca do 2º ao 5º Prêmio (Últimos 4 dígitos)
    if (!winnerGame) {
      const step2Tested: StepAudit['testedValues'] = [];
      let step2Match: PixPremiadoGame | undefined;
      let matchedPrizeLabel = '';

      for (let i = 1; i < 5; i++) {
        const milharStr = prizes[i].slice(-4);
        const milharNum = parseInt(milharStr, 10);
        const isMatched = !step2Match && federalGames.some(g => g.numbers[0] === milharNum);
        
        step2Tested.push({
          label: `${i + 1}º Prêmio`,
          rawPrize: prizes[i],
          milharStr,
          milharNum,
          status: isMatched ? 'hit' : 'miss'
        });

        if (isMatched && !step2Match) {
          step2Match = federalGames.find(g => g.numbers[0] === milharNum);
          matchedPrizeLabel = `${i + 1}º Prêmio`;
          winnerGame = step2Match;
          ruleApplied = `2ª Regra: Milhar do ${matchedPrizeLabel}`;
          winnerReason = `Bilhete Nº ${milharStr} vendido correspondente à milhar final do ${matchedPrizeLabel} (${prizes[i]}).`;
        }
      }

      stepsAudit.push({
        stepNumber: 2,
        title: 'Busca do 2º ao 5º Prêmio (Últimos 4 dígitos)',
        description: 'Verificação sequencial das milhares finais do 2º, 3º, 4º e 5º prêmios.',
        testedValues: step2Tested,
        matchedGame: step2Match,
        winnerReason: step2Match ? winnerReason : undefined,
        isHit: !!step2Match
      });
    }

    // STEP 3: Próxima Combinação da Milhar Frontal (1º ao 5º Prêmio - Primeiros 4 dígitos)
    if (!winnerGame) {
      const step3Tested: StepAudit['testedValues'] = [];
      let step3Match: PixPremiadoGame | undefined;
      let matchedPrizeLabel = '';

      for (let i = 0; i < 5; i++) {
        const frontalStr = prizes[i].slice(0, 4);
        const frontalNum = parseInt(frontalStr, 10);
        const isMatched = !step3Match && federalGames.some(g => g.numbers[0] === frontalNum);

        step3Tested.push({
          label: `${i + 1}º Prêmio (Frontal)`,
          rawPrize: prizes[i],
          milharStr: frontalStr,
          milharNum: frontalNum,
          status: isMatched ? 'hit' : 'miss'
        });

        if (isMatched && !step3Match) {
          step3Match = federalGames.find(g => g.numbers[0] === frontalNum);
          matchedPrizeLabel = `${i + 1}º Prêmio`;
          winnerGame = step3Match;
          ruleApplied = `3ª Regra: Milhar Frontal do ${matchedPrizeLabel}`;
          winnerReason = `Bilhete Nº ${frontalStr} vendido correspondente aos 4 primeiros dígitos do ${matchedPrizeLabel} (${prizes[i]}).`;
        }
      }

      stepsAudit.push({
        stepNumber: 3,
        title: 'Milhar Frontal (Primeiros 4 dígitos do 1º ao 5º Prêmio)',
        description: 'Verificação dos 4 dígitos iniciais de cada um dos 5 prêmios extraídos.',
        testedValues: step3Tested,
        matchedGame: step3Match,
        winnerReason: step3Match ? winnerReason : undefined,
        isHit: !!step3Match
      });
    }

    // STEP 4 & 5: Aproximação Numérica em relação ao 1º Prêmio + Desempate por Horário
    if (!winnerGame) {
      if (federalGames.length === 0) {
        stepsAudit.push({
          stepNumber: 4,
          title: 'Aproximação Numérica (Mais Próximo)',
          description: 'Nenhum bilhete vendido cadastrado no banco de dados para calcular aproximação.',
          testedValues: [],
          isHit: false
        });
      } else {
        let minDiff = Infinity;
        federalGames.forEach(g => {
          const diff = Math.abs(g.numbers[0] - target1stMilharNum);
          if (diff < minDiff) {
            minDiff = diff;
          }
        });

        const candidates = federalGames.filter(g => Math.abs(g.numbers[0] - target1stMilharNum) === minDiff);
        distance = minDiff;

        if (candidates.length === 1) {
          winnerGame = candidates[0];
          const ticketNumStr = String(winnerGame.numbers[0]).padStart(4, '0');
          const diffSign = winnerGame.numbers[0] >= target1stMilharNum ? `+${minDiff}` : `-${minDiff}`;
          ruleApplied = '4ª Regra: Aproximação Numérica (Mais Próximo)';
          winnerReason = `Bilhete Nº ${ticketNumStr} sagrou-se vencedor por ser o bilhete vendido mais próximo da milhar do 1º Prêmio (${target1stMilhar}), com diferença de ${minDiff} (${diffSign}).`;

          stepsAudit.push({
            stepNumber: 4,
            title: 'Aproximação Numérica (Mais Próximo)',
            description: `Alvo do 1º Prêmio: ${target1stMilhar}. Menor distância encontrada: ${minDiff}.`,
            testedValues: [{
              label: 'Mais Próximo',
              rawPrize: prizes[0],
              milharStr: ticketNumStr,
              milharNum: winnerGame.numbers[0],
              status: 'hit'
            }],
            matchedGame: winnerGame,
            winnerReason,
            isHit: true
          });
        } else if (candidates.length > 1) {
          tieBreakerApplied = true;
          // Sort by earliest purchase
          const sorted = [...candidates].sort((a, b) => getGameTimestamp(a) - getGameTimestamp(b));
          winnerGame = sorted[0];
          const ticketNumStr = String(winnerGame.numbers[0]).padStart(4, '0');
          const diffSign = winnerGame.numbers[0] >= target1stMilharNum ? `+${minDiff}` : `-${minDiff}`;
          ruleApplied = '5ª Regra: Aproximação com Desempate por Horário';
          winnerReason = `Houve empate de distância (${minDiff}) entre ${candidates.length} bilhetes. O bilhete Nº ${ticketNumStr} venceu pelo critério de desempate por ter sido comprado primeiro (${formatGameDate(winnerGame)}).`;

          stepsAudit.push({
            stepNumber: 4,
            title: 'Aproximação Numérica com Desempate por Horário',
            description: `Empate na distância ${minDiff} entre ${candidates.length} bilhetes. Desempate pela compra mais antiga.`,
            testedValues: candidates.map((c, idx) => ({
              label: `Candidato ${idx + 1} (${formatGameDate(c)})`,
              rawPrize: prizes[0],
              milharStr: String(c.numbers[0]).padStart(4, '0'),
              milharNum: c.numbers[0],
              status: c.id === winnerGame?.id ? 'hit' : 'miss'
            })),
            matchedGame: winnerGame,
            winnerReason,
            isHit: true
          });
        }
      }
    }

    const winnerUser = winnerGame ? users.find(u => u.id === winnerGame?.userId) : undefined;
    const winningTicketStr = winnerGame ? String(winnerGame.numbers[0]).padStart(4, '0') : undefined;

    return {
      hasRun: true,
      isValid: true,
      prizes,
      winnerGame,
      winnerUser,
      winningTicketStr,
      ruleApplied,
      stepsAudit,
      targetMilhar: target1stMilhar,
      distance,
      tieBreakerApplied
    };
  }, [p1, p2, p3, p4, p5, federalGames, users]);

  // Load example values
  const handleLoadExample = () => {
    setP1(EXAMPLE_PRIZES[0]);
    setP2(EXAMPLE_PRIZES[1]);
    setP3(EXAMPLE_PRIZES[2]);
    setP4(EXAMPLE_PRIZES[3]);
    setP5(EXAMPLE_PRIZES[4]);
    if (onShowToast) {
      onShowToast('Exemplo oficial da Loteria Federal carregado!', 'success');
    }
  };

  // Clear fields
  const handleClear = () => {
    setP1('');
    setP2('');
    setP3('');
    setP4('');
    setP5('');
  };

  // Generate random prizes for testing
  const handleGenerateRandom = () => {
    const gen5 = () => String(Math.floor(10000 + Math.random() * 90000));
    setP1(gen5());
    setP2(gen5());
    setP3(gen5());
    setP4(gen5());
    setP5(gen5());
  };

  // Save/Homologate draw result in active draw if available
  const handleSaveResultToDraw = async () => {
    if (!activeDraw || !db) return;
    if (!simulationResult.isValid || !simulationResult.winnerGame) {
      if (onShowToast) onShowToast('Nenhum resultado válido para homologar.', 'warning');
      return;
    }

    setIsSaving(true);
    try {
      await setDoc(doc(db, 'pix_premiado_draws', activeDraw.id), {
        drawnNumbers: simulationResult.prizes,
        winningReason: simulationResult.ruleApplied + ' - ' + (simulationResult.stepsAudit.find(s => s.isHit)?.winnerReason || ''),
        winnerName: simulationResult.winnerGame.userName || simulationResult.winnerUser?.name || 'Apostador',
        winnerUserId: simulationResult.winnerGame.userId,
        winningTicket: simulationResult.winningTicketStr,
        status: 'finished',
        finishedAt: new Date().toISOString()
      }, { merge: true });

      if (onShowToast) {
        onShowToast('Resultado homologado e salvo com sucesso no sorteio ativo!', 'success');
      }
    } catch (err) {
      console.error('Error saving draw result:', err);
      if (onShowToast) onShowToast('Erro ao salvar resultado no sorteio.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6" id="federal-draw-simulator-root">
      {/* Top Banner with description & action buttons */}
      <div className="bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-200/80 rounded-3xl p-6 relative overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-1.5 max-w-2xl">
            <div className="flex items-center gap-2">
              <span className="bg-amber-500 text-white p-1.5 rounded-xl shadow-xs">
                <Trophy className="w-5 h-5" />
              </span>
              <h2 className="text-xl font-display font-extrabold text-slate-900 tracking-tight">
                Simulador & Conferência da Loteria Federal
              </h2>
            </div>
            <p className="text-slate-600 text-xs sm:text-sm leading-relaxed">
              Digite os números oficiais sorteados do <strong>1º ao 5º Prêmio</strong> da Loteria Federal para auditar instantaneamente o bilhete contemplado seguindo todas as <strong>5 regras oficiais</strong> de apuração e desempate.
            </p>
            <div className="flex flex-wrap items-center gap-4 text-xs font-semibold text-slate-500 pt-1">
              <span className="flex items-center gap-1.5 text-emerald-700 font-bold">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                Apuração oficial da Loteria Federal
              </span>
              {activeDraw && (
                <span className="bg-indigo-50 text-indigo-700 px-2.5 py-0.5 rounded-lg border border-indigo-200 font-mono text-[11px]">
                  Sorteio: {activeDraw.date || 'Ativo'}
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto">
            <button
              type="button"
              onClick={() => setShowGuilhermeModal(true)}
              className="bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-bold text-xs px-3.5 py-2.5 rounded-xl transition shadow-xs flex items-center gap-1.5 cursor-pointer"
              title="Inserir 100 bilhetes com maior chance por proximidade para Guilherme Pereira"
            >
              <UserCheck className="w-3.5 h-3.5 text-indigo-200" />
              <span>Inserir 100 Bilhetes (Guilherme Pereira)</span>
            </button>
            <Link
              to="/transparencia-sorteio"
              target="_blank"
              rel="noopener noreferrer"
              className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs px-3.5 py-2.5 rounded-xl transition shadow-xs flex items-center gap-1.5 cursor-pointer"
              title="Abrir página pública com a listagem de todos os bilhetes"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Ver Bilhetes Concorrendo</span>
              <ExternalLink className="w-3 h-3 text-emerald-200" />
            </Link>
            <button
              type="button"
              onClick={handleLoadExample}
              className="bg-amber-500 hover:bg-amber-600 active:scale-95 text-white font-bold text-xs px-3.5 py-2.5 rounded-xl transition shadow-xs flex items-center gap-1.5 cursor-pointer"
              title="Carregar exemplo oficial da solicitação"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Carregar Exemplo (008932...)
            </button>
            <button
              type="button"
              onClick={handleGenerateRandom}
              className="bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-bold text-xs px-3 py-2.5 rounded-xl transition shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <Dices className="w-3.5 h-3.5 text-indigo-600" />
              Gerar Aleatório
            </button>
            <button
              type="button"
              onClick={handleClear}
              className="bg-white hover:bg-slate-50 border border-slate-200 text-slate-500 hover:text-slate-800 font-bold text-xs px-3 py-2.5 rounded-xl transition shadow-xs flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Limpar
            </button>
          </div>
        </div>
      </div>

      {/* Main Grid: Inputs on Left, Real-time Result on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: 5 Prize Inputs */}
        <div className="lg:col-span-5 bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-sm font-display font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Hash className="w-4 h-4 text-amber-500" />
              Extração dos 5 Prêmios
            </h3>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Caixa Econômica
            </span>
          </div>

          <div className="space-y-3">
            {[
              { label: '1º PRÊMIO', val: p1, setVal: setP1, placeholder: 'Ex: 008932', highlight: true },
              { label: '2º PRÊMIO', val: p2, setVal: setP2, placeholder: 'Ex: 049314' },
              { label: '3º PRÊMIO', val: p3, setVal: setP3, placeholder: 'Ex: 017181' },
              { label: '4º PRÊMIO', val: p4, setVal: setP4, placeholder: 'Ex: 010373' },
              { label: '5º PRÊMIO', val: p5, setVal: setP5, placeholder: 'Ex: 047859' }
            ].map((prize, idx) => {
              const milharFinal = prize.val.length >= 4 ? prize.val.slice(-4) : '';
              const milharFrontal = prize.val.length >= 4 ? prize.val.slice(0, 4) : '';

              return (
                <div 
                  key={idx}
                  className={`p-3 rounded-2xl border transition-all ${
                    prize.highlight 
                      ? 'bg-amber-50/40 border-amber-300/80 shadow-xs' 
                      : 'bg-slate-50/70 border-slate-200/80'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-black text-slate-800 font-mono flex items-center gap-1.5">
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black ${
                        prize.highlight ? 'bg-amber-500 text-white' : 'bg-slate-200 text-slate-700'
                      }`}>
                        {idx + 1}
                      </span>
                      {prize.label}
                    </span>
                    {milharFinal && (
                      <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold">
                        <span className="text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-md border border-emerald-200">
                          Final: <strong>{milharFinal}</strong>
                        </span>
                        <span className="text-indigo-700 bg-indigo-100/80 px-2 py-0.5 rounded-md border border-indigo-200">
                          Frontal: <strong>{milharFrontal}</strong>
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="relative">
                    <input
                      type="text"
                      maxLength={6}
                      value={prize.val}
                      onChange={(e) => {
                        const cleaned = e.target.value.replace(/[^0-9]/g, '');
                        prize.setVal(cleaned);
                      }}
                      placeholder={prize.placeholder}
                      className="w-full text-center py-2 px-3 bg-white border border-slate-200 rounded-xl font-mono font-black text-lg focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400 outline-none text-slate-900 tracking-widest transition-all placeholder:text-slate-300"
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-200 text-xs text-slate-500 space-y-1 leading-relaxed">
            <p className="font-bold text-slate-700 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              Dica de Digitação:
            </p>
            <p>
              Você pode digitar números de <strong>4, 5 ou 6 dígitos</strong> conforme saem no bilhete da Loteria Federal (ex: <code>008932</code> ou <code>8932</code>). A busca é calculada em tempo real!
            </p>
          </div>
        </div>

        {/* Right Column: Real-time Analysis & Winner Details */}
        <div className="lg:col-span-7 space-y-6">
          {/* Winner Card or Empty State */}
          {!simulationResult.hasRun ? (
            <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-xs flex flex-col items-center justify-center text-center h-full min-h-[300px] space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-500 shadow-xs">
                <Dices className="w-7 h-7" />
              </div>
              <h3 className="text-base font-display font-bold text-slate-800">
                Aguardando Extração da Loteria Federal
              </h3>
              <p className="text-slate-500 text-xs max-w-md leading-relaxed">
                Preencha os campos ao lado com os resultados oficiais ou clique em <strong>"Carregar Exemplo (008932...)"</strong> para simular a apuração imediata.
              </p>
            </div>
          ) : !simulationResult.isValid ? (
            <div className="bg-amber-50 border border-amber-200 p-6 rounded-3xl text-amber-800 space-y-2">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
                <h4 className="font-bold text-sm">Dados Incompletos</h4>
              </div>
              <p className="text-xs text-amber-700 leading-relaxed">
                {simulationResult.errorMessage}
              </p>
            </div>
          ) : (
            <div className="space-y-6 animate-fade-in">
              {/* Winner Highlight Card */}
              <div className={`p-6 rounded-3xl border shadow-md relative overflow-hidden transition-all ${
                simulationResult.winnerGame 
                  ? 'bg-gradient-to-br from-emerald-950 via-slate-900 to-slate-950 text-white border-emerald-500/40 shadow-emerald-950/20'
                  : 'bg-gradient-to-br from-slate-900 to-slate-950 text-white border-slate-800'
              }`}>
                {/* Background glow decoration */}
                <div className="absolute top-0 right-0 -mt-8 -mr-8 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>

                <div className="relative z-10 space-y-5">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span className={`p-2 rounded-xl ${simulationResult.winnerGame ? 'bg-emerald-500 text-slate-950' : 'bg-slate-700 text-slate-300'}`}>
                        <Trophy className="w-5 h-5" />
                      </span>
                      <div>
                        <p className="text-[10px] font-extrabold tracking-widest uppercase text-emerald-400">
                          {simulationResult.winnerGame ? '★ GANHADOR OFICIAL ENCONTRADO' : 'APURAÇÃO FINALIZADA'}
                        </p>
                        <h3 className="text-lg font-display font-black text-white">
                          {simulationResult.ruleApplied || 'Resultado da Apuração'}
                        </h3>
                      </div>
                    </div>

                    {simulationResult.winningTicketStr && (
                      <div className="bg-emerald-500/20 border border-emerald-400/40 rounded-2xl px-4 py-2 text-right">
                        <span className="text-[9px] uppercase font-extrabold tracking-wider text-emerald-300 block">
                          Bilhete Contemplado
                        </span>
                        <span className="font-mono text-2xl font-black text-emerald-400 tracking-wider">
                          Nº {simulationResult.winningTicketStr}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Winner details banner */}
                  {simulationResult.winnerGame ? (
                    <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/10 space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-11 h-11 rounded-full bg-emerald-500 text-slate-950 font-black flex items-center justify-center text-lg font-display shadow-md">
                            {(simulationResult.winnerGame.userName || 'J').charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-black text-white flex items-center gap-1.5">
                              {simulationResult.winnerGame.userName || 'Jogador'}
                              {simulationResult.winnerUser?.displayId && (
                                <span className="text-[10px] font-mono font-bold bg-white/20 text-emerald-200 px-2 py-0.5 rounded-full">
                                  #{simulationResult.winnerUser.displayId}
                                </span>
                              )}
                            </p>
                            <p className="text-xs text-slate-300">
                              {simulationResult.winnerUser?.email ? maskEmail(simulationResult.winnerUser.email) : 'Apostador cadastrado'}
                            </p>
                          </div>
                        </div>

                        {simulationResult.winnerUser?.phone && (
                          <div className="flex items-center gap-1.5 text-xs text-emerald-300 bg-emerald-950/60 border border-emerald-800/80 px-3 py-1.5 rounded-xl self-start sm:self-auto font-mono">
                            <Phone className="w-3.5 h-3.5 text-emerald-400" />
                            {simulationResult.winnerUser.phone}
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                        <div className="bg-black/20 p-2.5 rounded-xl border border-white/5">
                          <span className="text-[10px] text-slate-400 uppercase font-bold block">Status do Bilhete</span>
                          <span className="font-bold text-emerald-300 flex items-center gap-1 mt-0.5">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Confirmado
                          </span>
                        </div>
                        <div className="bg-black/20 p-2.5 rounded-xl border border-white/5">
                          <span className="text-[10px] text-slate-400 uppercase font-bold block">Data da Compra</span>
                          <span className="font-mono text-slate-200 font-semibold mt-0.5 block truncate">
                            {formatGameDate(simulationResult.winnerGame)}
                          </span>
                        </div>
                        <div className="bg-black/20 p-2.5 rounded-xl border border-white/5 col-span-2 sm:col-span-1">
                          <span className="text-[10px] text-slate-400 uppercase font-bold block">Alvo 1º Prêmio</span>
                          <span className="font-mono text-amber-300 font-bold mt-0.5 block">
                            Milhar: {simulationResult.targetMilhar}
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-amber-950/40 border border-amber-800/60 rounded-2xl p-4 text-amber-200 text-xs leading-relaxed">
                      Nenhum bilhete vendido na base de dados correspondeu às extrações e não há bilhetes suficientes para a aproximação numérica.
                    </div>
                  )}

                  {/* Button to save/homologate result if in admin mode */}
                  {activeDraw && db && simulationResult.winnerGame && (
                    <div className="flex justify-end pt-1">
                      <button
                        type="button"
                        disabled={isSaving}
                        onClick={handleSaveResultToDraw}
                        className="bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-slate-950 font-black text-xs px-5 py-2.5 rounded-xl transition-all shadow-md flex items-center gap-2 cursor-pointer disabled:opacity-50 uppercase tracking-wider"
                      >
                        <Award className="w-4 h-4" />
                        {isSaving ? 'Homologando...' : 'Homologar Resultado no Sorteio Oficial'}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Step-by-Step Rule Audit Breakdown */}
              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h4 className="text-sm font-display font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                    <Layers className="w-4 h-4 text-indigo-600" />
                    Trilha de Auditoria das 5 Regras
                  </h4>
                  <span className="text-xs font-semibold text-slate-500">
                    Conferência Oficial
                  </span>
                </div>

                <div className="space-y-3">
                  {simulationResult.stepsAudit.map((step) => (
                    <div 
                      key={step.stepNumber}
                      className={`p-4 rounded-2xl border transition-all ${
                        step.isHit 
                          ? 'bg-emerald-50/70 border-emerald-300 shadow-xs' 
                          : 'bg-slate-50/60 border-slate-200'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex items-center gap-2.5">
                          <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${
                            step.isHit 
                              ? 'bg-emerald-600 text-white' 
                              : 'bg-slate-300 text-slate-700'
                          }`}>
                            {step.stepNumber}
                          </span>
                          <div>
                            <h5 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                              {step.title}
                              {step.isHit && (
                                <span className="bg-emerald-600 text-white text-[9px] font-black uppercase px-2 py-0.5 rounded-full tracking-wider">
                                  REGRA ATENDIDA!
                                </span>
                              )}
                            </h5>
                            <p className="text-[11px] text-slate-500 leading-tight mt-0.5">
                              {step.description}
                            </p>
                          </div>
                        </div>

                        {step.isHit ? (
                          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                        ) : (
                          <XCircle className="w-4 h-4 text-slate-300 shrink-0 mt-0.5" />
                        )}
                      </div>

                      {/* Values checked in this step */}
                      {step.testedValues.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2.5 pt-2.5 border-t border-slate-200/60">
                          {step.testedValues.map((tv, tvIdx) => (
                            <span 
                              key={tvIdx}
                              className={`text-[11px] font-mono px-2.5 py-1 rounded-lg border font-bold flex items-center gap-1.5 ${
                                tv.status === 'hit'
                                  ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs'
                                  : 'bg-white text-slate-600 border-slate-200'
                              }`}
                            >
                              <span className="opacity-80 text-[10px]">{tv.label}:</span>
                              <strong>{tv.milharStr}</strong>
                              {tv.status === 'hit' ? '✓' : '✗'}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Winner text if matched in this step */}
                      {step.isHit && step.winnerReason && (
                        <div className="mt-2.5 bg-emerald-100/90 border border-emerald-300 p-2.5 rounded-xl text-emerald-950 font-bold text-xs leading-relaxed flex items-center gap-2">
                          <Sparkles className="w-4 h-4 text-emerald-700 shrink-0" />
                          <span>{step.winnerReason}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <GuilhermeTicketsModal
        isOpen={showGuilhermeModal}
        onClose={() => setShowGuilhermeModal(false)}
        db={db || defaultDb}
        users={users}
        games={games}
        onSuccess={(msg) => {
          if (onShowToast) onShowToast(msg, 'success');
        }}
      />
    </div>
  );
};

export default FederalDrawSimulator;
