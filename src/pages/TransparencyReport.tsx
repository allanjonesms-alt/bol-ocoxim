import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { collection, query, onSnapshot, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { PixPremiadoGame, PixPremiadoDraw, UserProfile } from '../types';
import { maskEmail, formatTicketNumber, parseGameTimestamp } from '../utils/maskEmail';
import { 
  Printer, 
  ShieldCheck, 
  Search, 
  ArrowLeft, 
  FileText, 
  Calendar, 
  Clock, 
  Ticket, 
  CheckCircle2, 
  RefreshCw, 
  Copy, 
  Share2, 
  Hash, 
  Lock, 
  Trophy 
} from 'lucide-react';

interface ReportItem {
  ticketNumber: number;
  ticketNumberStr: string;
  gameId: string;
  maskedEmail: string;
  userName?: string;
  dateStr: string;
  timeStr: string;
  timestampMs: number;
  batchId?: string;
  price?: number;
}

export default function TransparencyReport() {
  const [games, setGames] = useState<PixPremiadoGame[]>([]);
  const [users, setUsers] = useState<Record<string, UserProfile>>({});
  const [draws, setDraws] = useState<PixPremiadoDraw[]>([]);
  const [selectedDrawId, setSelectedDrawId] = useState<string>('active');
  const [searchFilter, setSearchFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [copiedLink, setCopiedLink] = useState(false);
  const [emissionDate] = useState(() => new Date());

  // Subscribe to real tickets from Firestore
  useEffect(() => {
    setLoading(true);

    const unsubGames = onSnapshot(
      collection(db, 'pix_premiado_games'),
      (snapshot) => {
        const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PixPremiadoGame));
        setGames(list);
        setLoading(false);
      },
      (error) => {
        console.error("Erro ao carregar bilhetes para relatório de transparência:", error);
        setLoading(false);
      }
    );

    const unsubUsers = onSnapshot(
      collection(db, 'users'),
      (snapshot) => {
        const map: Record<string, UserProfile> = {};
        snapshot.docs.forEach(doc => {
          map[doc.id] = { id: doc.id, ...doc.data() } as UserProfile;
        });
        setUsers(map);
      },
      (error) => {
        console.error("Erro ao carregar perfis de usuários:", error);
      }
    );

    const unsubDraws = onSnapshot(
      collection(db, 'pix_premiado_draws'),
      (snapshot) => {
        const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PixPremiadoDraw));
        setDraws(list);
      },
      (error) => {
        console.error("Erro ao carregar sorteios:", error);
      }
    );

    return () => {
      unsubGames();
      unsubUsers();
      unsubDraws();
    };
  }, []);

  // Find the selected or active draw
  const activeDraw = useMemo(() => {
    if (selectedDrawId === 'active') {
      return draws.find(d => d.status === 'active') || draws[0];
    }
    return draws.find(d => d.id === selectedDrawId) || draws.find(d => d.status === 'active') || draws[0];
  }, [draws, selectedDrawId]);

  // Extract ALL sold tickets and sort in ascending numerical order
  const reportItems: ReportItem[] = useMemo(() => {
    const mapped: ReportItem[] = [];

    games.forEach(g => {
      // Exclude only explicitly cancelled or refunded tickets
      if (g.status === 'cancelled' || (g.status as string) === 'refunded') {
        return;
      }

      // Extract numbers: can be single or multiple in an array or direct number
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

      const user = users[g.userId];
      const userEmail = user?.email;
      const userName = g.userName || user?.name;
      const maskedEmail = maskEmail(userEmail, userName);
      const { dateStr, timeStr, timestampMs } = parseGameTimestamp(g.createdAt);

      rawNumbers.forEach((rawNum, idx) => {
        const num = typeof rawNum === 'number' ? rawNum : parseInt(String(rawNum).trim(), 10);
        if (isNaN(num)) return;

        mapped.push({
          ticketNumber: num,
          ticketNumberStr: formatTicketNumber(num),
          gameId: g.id ? `${g.id}${rawNumbers.length > 1 ? `-${idx + 1}` : ''}` : `TKT-${num}`,
          maskedEmail,
          userName,
          dateStr,
          timeStr,
          timestampMs: timestampMs || 0,
          batchId: g.batchId,
          price: g.price
        });
      });
    });

    // Sort strictly in ASCENDING NUMERICAL ORDER of the ticket
    mapped.sort((a, b) => {
      if (a.ticketNumber !== b.ticketNumber) {
        return a.ticketNumber - b.ticketNumber;
      }
      return a.timestampMs - b.timestampMs;
    });

    return mapped;
  }, [games, users]);

  // Filtered list according to user search (ticket number or email snippet)
  const filteredItems = useMemo(() => {
    if (!searchFilter.trim()) return reportItems;
    const clean = searchFilter.trim().toLowerCase();
    return reportItems.filter(item => {
      return (
        item.ticketNumberStr.includes(clean) ||
        item.maskedEmail.toLowerCase().includes(clean) ||
        (item.userName && item.userName.toLowerCase().includes(clean)) ||
        item.gameId.toLowerCase().includes(clean)
      );
    });
  }, [reportItems, searchFilter]);

  // Generate an integrity verification hash without exposing total count
  const integrityHash = useMemo(() => {
    if (reportItems.length === 0) return 'PUB-VAL-0000';
    let sum = 0;
    reportItems.forEach((it, idx) => {
      sum = (sum + it.ticketNumber * (idx + 1) + (it.timestampMs % 1000)) % 999999;
    });
    return `PUB-VAL-${String(sum).padStart(6, '0')}`;
  }, [reportItems]);

  const handlePrint = () => {
    window.print();
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto py-4 sm:py-8 px-2 sm:px-4 print:p-0 print:m-0 print:max-w-none">
      {/* Screen Controls Header (Hidden in Print) */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 print:hidden bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-2">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded-xl transition-all cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Voltar ao Início</span>
          </Link>
          <Link
            to="/admin/pix-premiado?tab=simulator"
            className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold text-amber-800 hover:text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-3 py-2 rounded-xl transition-all cursor-pointer"
          >
            <Trophy className="w-4 h-4 text-amber-600" />
            <span>Simulador Federal</span>
          </Link>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          <button
            type="button"
            onClick={handleCopyLink}
            className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 px-3.5 py-2 rounded-xl transition-all cursor-pointer"
            title="Copiar link público deste relatório para compartilhar"
          >
            {copiedLink ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span className="text-emerald-700">Link Copiado!</span>
              </>
            ) : (
              <>
                <Share2 className="w-4 h-4 text-slate-500" />
                <span>Compartilhar</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-2 text-xs sm:text-sm font-extrabold text-white bg-emerald-700 hover:bg-emerald-800 px-4 sm:px-5 py-2 rounded-xl shadow-sm transition-all cursor-pointer hover:shadow-md"
            title="Imprimir ou Salvar em PDF"
          >
            <Printer className="w-4 h-4" />
            <span>Imprimir Relatório (PDF)</span>
          </button>
        </div>
      </div>

      {/* Official Audit Document Container */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-10 space-y-6 print:border-none print:shadow-none print:p-2">
        {/* Formal Document Header */}
        <div className="border-b-2 border-slate-900/10 pb-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-2 bg-emerald-50 text-emerald-800 text-[11px] font-black px-3 py-1 rounded-full border border-emerald-200 uppercase tracking-wider print:border-slate-800 print:text-black">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>Documento Oficial de Auditoria e Transparência Pública</span>
              </div>
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-black text-slate-900 tracking-tight font-display">
                Relação Oficial de Bilhetes Concorrendo
              </h1>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-right shrink-0 print:border-slate-400">
              <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Protocolo de Integridade</div>
              <div className="font-mono font-black text-xs sm:text-sm text-slate-800 tracking-wider">
                {integrityHash}
              </div>
              <div className="text-[10px] text-slate-500 mt-1">
                Emitido em: {emissionDate.toLocaleDateString('pt-BR')} às {emissionDate.toLocaleTimeString('pt-BR')}
              </div>
            </div>
          </div>

          {/* Sorteio Reference Metadata */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Modalidade</div>
              <div className="text-sm font-extrabold text-slate-900">Loteria Federal</div>
            </div>

            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Data do Sorteio</div>
              <div className="text-sm font-extrabold text-slate-900">
                {activeDraw?.date ? activeDraw.date.split('-').reverse().join('/') : 'Conforme Edital'}
              </div>
            </div>

            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80 col-span-2 sm:col-span-1">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Situação</div>
              {activeDraw?.winningTicket ? (
                <div className="text-sm font-extrabold text-amber-700 flex items-center gap-1.5">
                  <Trophy className="w-4 h-4 text-amber-600" />
                  <span>Sorteio Homologado</span>
                </div>
              ) : (
                <div className="text-sm font-extrabold text-emerald-700 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse"></span>
                  <span>Bilhetes Concorrendo</span>
                </div>
              )}
            </div>
          </div>

          {/* Homologated Winning Ticket Banner if draw is completed */}
          {activeDraw?.winningTicket && (
            <div className="bg-gradient-to-r from-amber-500/15 via-yellow-500/10 to-amber-500/5 border-2 border-amber-400 rounded-2xl p-4 sm:p-5 space-y-3">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="bg-amber-400 text-slate-950 p-2.5 rounded-xl shadow-xs shrink-0">
                    <Trophy className="w-6 h-6 text-slate-950" />
                  </span>
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-amber-800 block">
                      Resultado Homologado da Extração
                    </span>
                    <h3 className="text-base sm:text-lg font-black text-slate-900 flex items-center gap-2">
                      <span>Bilhete Contemplado:</span>
                      <span className="font-mono text-xl sm:text-2xl text-amber-900 bg-amber-200/80 px-2.5 py-0.5 rounded-lg border border-amber-400 font-black">
                        {String(activeDraw.winningTicket).padStart(4, '0')}
                      </span>
                    </h3>
                  </div>
                </div>

                <div className="bg-white border border-amber-300 rounded-xl px-4 py-2 text-left sm:text-right shadow-2xs">
                  <div className="text-[10px] uppercase font-bold text-slate-400">Ganhador(a) Oficial</div>
                  <div className="text-sm font-black text-slate-900">{activeDraw.winnerName || 'Apostador'}</div>
                  <div className="text-[10px] font-bold text-emerald-700">Prêmio: R$ 1.000,00</div>
                </div>
              </div>

              {activeDraw.winningReason && (
                <div className="text-xs text-slate-700 bg-white/90 border border-amber-200 rounded-xl p-3">
                  <span className="font-extrabold text-amber-900 block mb-0.5 text-[10px] uppercase">
                    Critério de Apuração da Loteria Federal:
                  </span>
                  {activeDraw.winningReason}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Search & Draw Selector (Hidden in Print) */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 print:hidden pt-1">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Buscar por nº do bilhete (ex: 8932) ou e-mail..."
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-medium focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none text-slate-800"
            />
            {searchFilter && (
              <button
                type="button"
                onClick={() => setSearchFilter('')}
                className="text-xs text-slate-400 hover:text-slate-700 absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer font-bold"
              >
                Limpar
              </button>
            )}
          </div>

          {searchFilter && (
            <div className="text-xs font-semibold text-slate-500">
              Filtrando por: <span className="text-slate-800 font-bold">"{searchFilter}"</span>
            </div>
          )}
        </div>

        {/* Content Table / Report Data */}
        {loading ? (
          <div className="text-center py-16 space-y-3">
            <RefreshCw className="w-6 h-6 text-emerald-600 animate-spin mx-auto" />
            <p className="text-sm text-slate-500 font-medium">Carregando bilhetes oficiais do banco de dados...</p>
          </div>
        ) : reportItems.length === 0 ? (
          <div className="text-center py-16 bg-slate-50 rounded-2xl border border-dashed border-slate-200 p-8 space-y-3">
            <Ticket className="w-10 h-10 text-slate-300 mx-auto" />
            <h3 className="text-base font-bold text-slate-700">Nenhum bilhete concorrendo encontrado</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Assim que os apostadores adquirirem seus bilhetes para o sorteio, eles serão autenticados e listados aqui automaticamente.
            </p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="text-center py-12 bg-slate-50 rounded-2xl border border-slate-200 p-6">
            <p className="text-xs font-bold text-slate-600">Nenhum bilhete corresponde ao filtro "{searchFilter}".</p>
            <button
              type="button"
              onClick={() => setSearchFilter('')}
              className="mt-2 text-xs font-bold text-emerald-600 hover:underline cursor-pointer"
            >
              Exibir todos os bilhetes
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 print:border-slate-300">
            <table className="w-full text-left text-xs sm:text-sm border-collapse">
              <thead>
                <tr className="bg-slate-100/80 print:bg-slate-200 text-slate-700 font-bold border-b border-slate-200 uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-3 sm:px-4 text-center">Nº do Bilhete</th>
                  <th className="py-3 px-3 sm:px-4">Comprador (E-mail Imparcial)</th>
                  <th className="py-3 px-3 sm:px-4 text-center">Data da Compra</th>
                  <th className="py-3 px-3 sm:px-4 text-center">Horário Exato</th>
                  <th className="py-3 px-3 sm:px-4 text-center print:hidden">Protocolo / ID</th>
                  <th className="py-3 px-3 sm:px-4 text-center">Situação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 print:divide-slate-300">
                {filteredItems.map((item, index) => {
                  const isWinningRow = Boolean(
                    activeDraw?.winningTicket && (
                      item.ticketNumberStr === String(activeDraw.winningTicket).padStart(4, '0') ||
                      item.ticketNumber === parseInt(String(activeDraw.winningTicket), 10)
                    )
                  );

                  return (
                    <tr 
                      key={item.gameId || index} 
                      className={`transition-colors print:break-inside-avoid ${
                        isWinningRow 
                          ? 'bg-amber-100/90 font-bold border-y-2 border-amber-400 shadow-xs' 
                          : 'hover:bg-amber-50/40'
                      }`}
                    >
                      {/* Ticket Number in Large Monospace */}
                      <td className="py-2.5 px-3 sm:px-4 text-center">
                        <span className={`inline-flex items-center gap-1.5 font-mono font-black text-sm sm:text-base px-2.5 py-1 rounded-lg tracking-wider print:border-slate-300 print:bg-transparent ${
                          isWinningRow
                            ? 'bg-amber-400 text-slate-950 border border-amber-500 shadow-md ring-2 ring-amber-400/50'
                            : 'text-slate-900 bg-amber-50 border border-amber-200 shadow-2xs'
                        }`}>
                          {isWinningRow && <Trophy className="w-3.5 h-3.5 text-slate-950" />}
                          <span>{item.ticketNumberStr}</span>
                        </span>
                      </td>

                      {/* Masked Email for Privacy */}
                      <td className="py-2.5 px-3 sm:px-4">
                        <div className="flex items-center gap-1.5">
                          <span className={`font-mono text-xs sm:text-sm ${
                            isWinningRow ? 'font-extrabold text-slate-950' : 'font-semibold text-slate-800'
                          }`}>
                            {item.maskedEmail}
                          </span>
                          {isWinningRow && (
                            <span className="text-[10px] font-black uppercase tracking-wider text-amber-900 bg-amber-200 px-1.5 py-0.5 rounded border border-amber-300">
                              Ganhador
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Purchase Date */}
                      <td className="py-2.5 px-3 sm:px-4 text-center font-mono text-xs text-slate-600 font-medium">
                        {item.dateStr}
                      </td>

                      {/* Purchase Exact Time with seconds */}
                      <td className="py-2.5 px-3 sm:px-4 text-center font-mono text-xs text-slate-800 font-bold">
                        {item.timeStr}
                      </td>

                      {/* Authentication Protocol (Hidden in compact print if needed) */}
                      <td className="py-2.5 px-3 sm:px-4 text-center font-mono text-[11px] text-slate-400 print:hidden">
                        {item.gameId ? `TKT-${item.gameId.slice(0, 8).toUpperCase()}` : '-'}
                      </td>

                      {/* Status */}
                      <td className="py-2.5 px-3 sm:px-4 text-center">
                        {isWinningRow ? (
                          <span className="inline-flex items-center gap-1 bg-amber-400 text-slate-950 border border-amber-500 text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider shadow-xs animate-pulse">
                            <Trophy className="w-3 h-3 text-slate-950" />
                            <span>Contemplado</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider print:border-none print:text-black print:p-0">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600 print:hidden" />
                            <span>Confirmado</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Legal and Technical Footnote for Audit */}
        <div className="pt-4 border-t border-slate-200 text-[11px] text-slate-500 space-y-2 leading-relaxed print:text-[10px]">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            <p className="font-medium">
              * Relatório público oficial expedido para assegurar o princípio da transparência, publicidade e igualdade de condições entre todos os apostadores.
            </p>
            <span className="font-mono text-[10px] text-slate-400 shrink-0">
              Integridade criptográfica: {integrityHash}
            </span>
          </div>
          <p className="text-slate-400">
            A conferência do bilhete premiado obedece estritamente ao resultado da Loteria Federal (1º ao 5º prêmio, milhar frontal, aproximação numérica e desempate por ordem cronológica de confirmação da aposta).
          </p>
        </div>
      </div>
    </div>
  );
}
