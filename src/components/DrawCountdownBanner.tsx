import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { PixPremiadoDraw } from '../types';
import { Clock, Sparkles, ShieldCheck, Ticket, ChevronRight, AlertCircle, Trophy, CheckCircle2 } from 'lucide-react';

interface DrawCountdownBannerProps {
  draw?: PixPremiadoDraw | null;
  onScrollToBuy?: () => void;
}

export default function DrawCountdownBanner({ draw, onScrollToBuy }: DrawCountdownBannerProps) {
  // If the draw already has a winning ticket (contemplated number), display the winner banner!
  if (draw?.winningTicket) {
    const winningTicketStr = String(draw.winningTicket).padStart(4, '0');
    return (
      <div id="countdown-draw-banner" className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950 text-white shadow-xl border-2 border-amber-400 p-5 sm:p-6 transition-all">
        <div className="absolute -top-12 -right-12 w-64 h-64 bg-amber-500/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-12 -left-12 w-64 h-64 bg-emerald-500/15 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="space-y-2 max-w-xl">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="bg-amber-400 text-slate-950 text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1 shadow-xs">
                <Trophy className="w-3 h-3" />
                <span>Sorteio Realizado</span>
              </span>
              <span className="text-[10px] text-emerald-300 font-bold bg-emerald-950/70 border border-emerald-500/30 px-2 py-0.5 rounded-full uppercase tracking-wider">
                Resultado Homologado
              </span>
            </div>
            <h3 className="text-xl sm:text-2xl font-black text-white font-display tracking-tight leading-snug flex items-center gap-2">
              <span>Número Contemplado:</span>
              <span className="font-mono text-2xl sm:text-3xl text-amber-400 bg-slate-950 px-3 py-0.5 rounded-xl border border-amber-400/50 shadow-md">
                {winningTicketStr}
              </span>
            </h3>
            <p className="text-slate-300 text-xs sm:text-sm leading-relaxed">
              Ganhador(a): <strong className="text-white">{draw.winnerName || 'Apostador'}</strong> — Confira o bilhete contemplado e a auditoria completa.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => {
                const el = document.getElementById('contemplated-draw-card') || document.getElementById('pix-premiado-section');
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }}
              className="w-full sm:w-auto bg-amber-400 hover:bg-amber-300 active:scale-95 text-slate-950 font-black text-xs sm:text-sm px-4 py-2.5 rounded-xl transition-all shadow-md shadow-amber-950/40 flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Trophy className="w-4 h-4 text-slate-950" />
              <span>Ver Apuração Completa</span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-950" />
            </button>

            <Link
              to="/transparencia-sorteio"
              className="w-full sm:w-auto bg-slate-800/90 hover:bg-slate-700 text-slate-200 hover:text-white font-bold text-xs px-4 py-2.5 rounded-xl border border-slate-700 transition-all flex items-center justify-center gap-1.5 shadow-xs whitespace-nowrap"
            >
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Relatório de Auditoria</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Target date resolution:
  // Default target specified by user: amanhã 06/09 às 10:00 (-4:00 UTC)
  // If active draw date is provided, use that with UTC-4 timezone
  const targetDateIso = useMemo(() => {
    if (draw?.date) {
      // If draw date is 2026-09-06, force 10:00 as requested for 06/09
      const time = draw.date === '2026-09-06' ? '10:00' : (draw.time || '10:00');
      return `${draw.date}T${time}:00-04:00`;
    }
    return '2026-09-06T10:00:00-04:00';
  }, [draw?.date, draw?.time]);

  const targetTimestamp = useMemo(() => {
    return new Date(targetDateIso).getTime();
  }, [targetDateIso]);

  const [timeLeft, setTimeLeft] = useState(() => {
    const diff = targetTimestamp - Date.now();
    return {
      totalMs: diff,
      days: Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24))),
      hours: Math.max(0, Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))),
      minutes: Math.max(0, Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))),
      seconds: Math.max(0, Math.floor((diff % (1000 * 60)) / 1000)),
      isOver: diff <= 0,
      isOngoing: diff <= 0 && diff > -2 * 60 * 60 * 1000, // ongoing within 2h
    };
  });

  useEffect(() => {
    function updateCountdown() {
      const now = Date.now();
      const diff = targetTimestamp - now;

      setTimeLeft({
        totalMs: diff,
        days: Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24))),
        hours: Math.max(0, Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))),
        minutes: Math.max(0, Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))),
        seconds: Math.max(0, Math.floor((diff % (1000 * 60)) / 1000)),
        isOver: diff <= 0,
        isOngoing: diff <= 0 && diff > -2 * 60 * 60 * 1000,
      });
    }

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [targetTimestamp]);

  // If draw ended more than 2 hours ago, don't show the countdown banner
  if (timeLeft.isOver && !timeLeft.isOngoing) {
    return null;
  }

  // Only show when the draw is near (e.g. within 7 days)
  const isNear = timeLeft.totalMs <= 7 * 24 * 60 * 60 * 1000;
  if (!isNear && !timeLeft.isOngoing) {
    return null;
  }

  return (
    <div id="countdown-draw-banner" className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-emerald-950 to-slate-900 text-white shadow-xl border-2 border-emerald-500/40 p-5 sm:p-7 transition-all">
      {/* Background ambient lighting */}
      <div className="absolute -top-12 -right-12 w-64 h-64 bg-emerald-500/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-12 -left-12 w-64 h-64 bg-amber-500/15 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
        
        {/* Left column: Title & info */}
        <div className="space-y-2.5 max-w-xl">
          <h3 className="text-xl sm:text-2xl font-black text-white font-display tracking-tight leading-snug">
            {timeLeft.isOngoing ? (
              <span className="text-amber-300 animate-pulse">
                O sorteio está sendo realizado agora!
              </span>
            ) : (
              <>
                Grande Sorteio <span className="text-amber-400">amanhã às 10h00</span>
              </>
            )}
          </h3>

          <p className="text-slate-300 text-xs sm:text-sm leading-relaxed">
            {timeLeft.isOngoing
              ? 'A apuração oficial está em andamento. Consulte a lista de bilhetes participantes e acompanhe o resultado.'
              : 'Vendas de bilhetes encerradas. Acompanhe a lista de bilhetes participantes e o resultado oficial da apuração.'}
          </p>
        </div>

        {/* Right column: Digital Countdown Timer Blocks & Action Buttons */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 lg:gap-6 shrink-0">
          {!timeLeft.isOngoing ? (
            <div className="flex items-center gap-2 sm:gap-3 bg-slate-950/60 p-3 sm:p-4 rounded-2xl border border-slate-800 shadow-inner">
              {/* Days (if > 0) */}
              {timeLeft.days > 0 && (
                <>
                  <div className="flex flex-col items-center min-w-[52px] sm:min-w-[60px]">
                    <span className="font-mono text-2xl sm:text-3xl font-black text-white bg-slate-900 px-2.5 py-1 rounded-xl border border-slate-700/80 shadow-xs">
                      {String(timeLeft.days).padStart(2, '0')}
                    </span>
                    <span className="text-[9px] sm:text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mt-1">
                      {timeLeft.days === 1 ? 'Dia' : 'Dias'}
                    </span>
                  </div>
                  <span className="text-amber-400 font-black text-lg pb-4">:</span>
                </>
              )}

              {/* Hours */}
              <div className="flex flex-col items-center min-w-[52px] sm:min-w-[60px]">
                <span className="font-mono text-2xl sm:text-3xl font-black text-amber-400 bg-slate-900 px-2.5 py-1 rounded-xl border border-amber-500/30 shadow-xs">
                  {String(timeLeft.hours).padStart(2, '0')}
                </span>
                <span className="text-[9px] sm:text-[10px] font-extrabold text-amber-300/80 uppercase tracking-widest mt-1">
                  Horas
                </span>
              </div>

              <span className="text-amber-400 font-black text-lg pb-4">:</span>

              {/* Minutes */}
              <div className="flex flex-col items-center min-w-[52px] sm:min-w-[60px]">
                <span className="font-mono text-2xl sm:text-3xl font-black text-white bg-slate-900 px-2.5 py-1 rounded-xl border border-slate-700/80 shadow-xs">
                  {String(timeLeft.minutes).padStart(2, '0')}
                </span>
                <span className="text-[9px] sm:text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mt-1">
                  Min
                </span>
              </div>

              <span className="text-amber-400 font-black text-lg pb-4">:</span>

              {/* Seconds */}
              <div className="flex flex-col items-center min-w-[52px] sm:min-w-[60px]">
                <span className="font-mono text-2xl sm:text-3xl font-black text-emerald-400 bg-slate-900 px-2.5 py-1 rounded-xl border border-emerald-500/30 shadow-xs animate-pulse">
                  {String(timeLeft.seconds).padStart(2, '0')}
                </span>
                <span className="text-[9px] sm:text-[10px] font-extrabold text-emerald-400/80 uppercase tracking-widest mt-1">
                  Seg
                </span>
              </div>
            </div>
          ) : (
            <div className="bg-amber-500/20 border border-amber-400/40 px-5 py-3.5 rounded-2xl flex items-center gap-3">
              <span className="w-3 h-3 rounded-full bg-amber-400 animate-ping inline-block" />
              <div className="text-xs font-bold text-amber-200">
                Sorteio em andamento
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-col gap-2.5">
            <Link
              to="/panel"
              className="bg-amber-400 hover:bg-amber-300 active:scale-95 text-slate-950 font-black text-xs sm:text-sm px-4 py-2.5 rounded-xl transition-all shadow-md shadow-amber-950/40 flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Ticket className="w-4 h-4 text-slate-950" />
              <span>Meus Bilhetes</span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-950" />
            </Link>

            <Link
              to="/transparencia-sorteio"
              className="bg-slate-800/90 hover:bg-slate-700 text-slate-200 hover:text-white font-bold text-xs px-4 py-2.5 rounded-xl border border-slate-700 transition-all flex items-center justify-center gap-1.5 shadow-xs whitespace-nowrap"
            >
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Bilhetes Concorrendo</span>
            </Link>
          </div>

        </div>

      </div>
    </div>
  );
}
