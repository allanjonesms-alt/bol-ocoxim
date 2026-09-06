import React from 'react';
import { Link } from 'react-router-dom';
import { PixPremiadoDraw, PixPremiadoGame } from '../types';
import { 
  Trophy, 
  Sparkles, 
  ShieldCheck, 
  CheckCircle2, 
  Calendar, 
  Clock, 
  Ticket, 
  ExternalLink,
  Award,
  Crown
} from 'lucide-react';

interface ContemplatedDrawCardProps {
  draw: PixPremiadoDraw;
  userGames?: PixPremiadoGame[];
}

export const ContemplatedDrawCard: React.FC<ContemplatedDrawCardProps> = ({ 
  draw, 
  userGames = [] 
}) => {
  const winningTicketStr = draw.winningTicket 
    ? String(draw.winningTicket).padStart(4, '0')
    : null;

  if (!winningTicketStr) return null;

  // Check if current user is the winner
  const winningNumInt = parseInt(winningTicketStr, 10);
  const userOwnsWinningTicket = userGames.some(g => {
    if (Array.isArray(g.numbers)) {
      return g.numbers.includes(winningNumInt);
    }
    return (g as any).number === winningNumInt;
  });

  // Prizes extracted from Federal Lottery
  const prizes = Array.isArray(draw.drawnNumbers) ? draw.drawnNumbers : [];

  return (
    <div 
      id="contemplated-draw-card"
      className="relative overflow-hidden rounded-3xl bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white border-2 border-amber-400/80 shadow-2xl p-6 sm:p-8 space-y-6"
    >
      {/* Decorative ambient glow */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/15 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-[100px] pointer-events-none" />

      {/* Top Header */}
      <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 bg-amber-400 text-slate-950 text-[10px] sm:text-xs font-black px-3 py-1 rounded-full uppercase tracking-wider shadow-sm">
              <Trophy className="w-3.5 h-3.5 text-slate-950" />
              <span>Sorteio Realizado • Resultado Homologado</span>
            </span>
            <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider">
              {draw.type || 'Loteria Federal'}
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl lg:text-3xl font-black font-display text-white tracking-tight flex items-center gap-2">
            <span>Número Contemplado Oficial</span>
            <Sparkles className="w-5 h-5 text-amber-400 animate-pulse" />
          </h2>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <Link
            to="/transparencia-sorteio"
            className="inline-flex items-center gap-1.5 text-xs font-extrabold bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl transition-all shadow-md shadow-emerald-950/50 hover:scale-[1.02] cursor-pointer"
          >
            <ShieldCheck className="w-4 h-4 text-emerald-200" />
            <span>Relatório de Transparência</span>
          </Link>
        </div>
      </div>

      {/* User Win Alert if the logged in user won */}
      {userOwnsWinningTicket && (
        <div className="relative z-10 bg-gradient-to-r from-emerald-950 via-emerald-900 to-emerald-950 border-2 border-emerald-400 rounded-2xl p-4 sm:p-5 flex items-center gap-4 shadow-lg animate-bounce">
          <div className="p-3 bg-emerald-500 text-slate-950 rounded-2xl shrink-0 font-black">
            <Crown className="w-8 h-8" />
          </div>
          <div>
            <span className="text-xs font-black uppercase tracking-wider text-emerald-300">
              Parabéns Apostador!
            </span>
            <h3 className="text-lg sm:text-xl font-black text-white">
              Seu bilhete {winningTicketStr} foi o contemplado deste sorteio!
            </h3>
            <p className="text-xs text-emerald-200 mt-0.5">
              Entre em contato com o suporte ou aguarde a confirmação de premiação.
            </p>
          </div>
        </div>
      )}

      {/* Main Grid: Winning Ticket Display & Winner Details */}
      <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        
        {/* Left: Giant Contemplated Number Badge */}
        <div className="lg:col-span-5 bg-gradient-to-b from-amber-500/20 via-slate-900/90 to-slate-950 p-6 sm:p-8 rounded-3xl border-2 border-amber-400/60 flex flex-col items-center justify-center text-center shadow-inner relative overflow-hidden group">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(251,191,36,0.25),transparent_70%)] pointer-events-none" />
          
          <span className="text-xs font-black uppercase tracking-widest text-amber-300 mb-2 flex items-center gap-1.5">
            <Award className="w-4 h-4 text-amber-400" />
            <span>Bilhete Vencedor</span>
          </span>

          {/* Huge Number */}
          <div className="font-mono font-black text-5xl sm:text-6xl md:text-7xl tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-yellow-400 to-amber-300 drop-shadow-[0_4px_12px_rgba(245,158,11,0.5)] my-2">
            {winningTicketStr}
          </div>

          <div className="inline-flex items-center gap-1.5 bg-amber-400/20 text-amber-300 border border-amber-400/40 text-[11px] font-extrabold px-3 py-1 rounded-full uppercase tracking-wider mt-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-amber-400" />
            <span>Confirmado pela Loteria Federal</span>
          </div>
        </div>

        {/* Right: Winner & Rules Breakdown */}
        <div className="lg:col-span-7 space-y-4">
          
          {/* Winner Profile Box */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 backdrop-blur-xs">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-amber-400 text-slate-950 flex items-center justify-center font-black text-xl shadow-md shrink-0">
                🏆
              </div>
              <div>
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">
                  Apostador(a) Contemplado(a)
                </span>
                <span className="text-lg sm:text-xl font-black text-white">
                  {draw.winnerName || 'Apostador'}
                </span>
                <div className="text-xs text-amber-300/90 font-medium">
                  Titular do bilhete sorteado {winningTicketStr}
                </div>
              </div>
            </div>

            <div className="bg-amber-400/10 border border-amber-400/30 rounded-xl px-4 py-2 text-right shrink-0">
              <span className="text-[10px] font-bold text-amber-300 uppercase tracking-wider block">
                Prêmio
              </span>
              <span className="text-base sm:text-lg font-black text-amber-400">
                R$ 1.000,00
              </span>
            </div>
          </div>

          {/* Rule Applied / Critério */}
          {draw.winningReason && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 text-xs sm:text-sm text-slate-200">
              <span className="font-extrabold text-amber-400 block mb-1 uppercase tracking-wide text-[10px]">
                Critério de Apuração Oficial:
              </span>
              <p className="font-medium text-slate-200 leading-relaxed">
                {draw.winningReason}
              </p>
            </div>
          )}

          {/* Draw Date & Extra info */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1 text-xs">
            <div className="bg-white/5 p-3 rounded-xl border border-white/5">
              <span className="text-[10px] text-slate-400 font-bold uppercase block">Data</span>
              <span className="font-bold text-white">
                {draw.date ? draw.date.split('-').reverse().join('/') : '06/09/2026'}
              </span>
            </div>
            <div className="bg-white/5 p-3 rounded-xl border border-white/5">
              <span className="text-[10px] text-slate-400 font-bold uppercase block">Horário</span>
              <span className="font-bold text-white">
                {draw.time || '10:00'} (-4h UTC)
              </span>
            </div>
            <div className="bg-white/5 p-3 rounded-xl border border-white/5 col-span-2 sm:col-span-1">
              <span className="text-[10px] text-slate-400 font-bold uppercase block">Concurso</span>
              <span className="font-bold text-white">
                PIX da Independência
              </span>
            </div>
          </div>

        </div>

      </div>

      {/* Federal Lottery Official Extraction Numbers Grid */}
      {prizes.length > 0 && (
        <div className="relative z-10 bg-slate-950/70 border border-white/10 rounded-2xl p-4 sm:p-5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-2.5">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span className="text-xs font-black uppercase tracking-wider text-slate-300">
                Extração Oficial da Loteria Federal (CEF)
              </span>
            </div>
            <span className="text-[11px] text-slate-400 font-medium">
              1º Prêmio gerou a Milhar Contemplada
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
            {prizes.map((pz, idx) => {
              const isFirstPrize = idx === 0;
              const pzStr = String(pz).padStart(5, '0');
              const frontalMilhar = pzStr.substring(0, 4);

              return (
                <div 
                  key={idx}
                  className={`p-3 rounded-xl border text-center transition-all ${
                    isFirstPrize
                      ? 'bg-gradient-to-b from-amber-500/20 to-amber-950/40 border-amber-400 ring-1 ring-amber-400 shadow-md col-span-2 sm:col-span-1'
                      : 'bg-white/5 border-white/10'
                  }`}
                >
                  <span className={`text-[10px] font-black uppercase tracking-wider block mb-1 ${
                    isFirstPrize ? 'text-amber-300 font-extrabold' : 'text-slate-400'
                  }`}>
                    {idx + 1}º Prêmio {isFirstPrize ? '⭐ (Alvo)' : ''}
                  </span>
                  <div className={`font-mono text-base sm:text-lg font-black tracking-widest ${
                    isFirstPrize ? 'text-amber-200' : 'text-slate-200'
                  }`}>
                    {pzStr}
                  </div>
                  {isFirstPrize && (
                    <div className="mt-1 text-[9px] font-black uppercase tracking-wider text-amber-300 bg-amber-400/20 rounded py-0.5 px-1">
                      Milhar: {frontalMilhar}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Footer Navigation Buttons */}
      <div className="relative z-10 flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
        <div className="text-xs text-slate-400 flex items-center gap-1.5">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>Apuração com auditoria pública permanente e imutável no banco de dados.</span>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <Link
            to="/panel"
            className="flex-1 sm:flex-none text-center bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl border border-slate-700 transition cursor-pointer"
          >
            Conferir Meus Bilhetes
          </Link>
          <Link
            to="/transparencia-sorteio"
            className="flex-1 sm:flex-none text-center bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs px-5 py-2.5 rounded-xl transition shadow-md shadow-amber-950/30 flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <span>Ver Relação Oficial</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
};

export default ContemplatedDrawCard;
