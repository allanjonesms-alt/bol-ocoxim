import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Search, Code, Check, Copy, Activity, ShieldCheck, Filter, ChevronDown, ChevronUp } from 'lucide-react';

interface WebhookLog {
  id: string;
  timestamp: string;
  method: string;
  action?: string;
  type?: string;
  resourceId?: string;
  query?: Record<string, any>;
  body?: Record<string, any>;
  headers?: Record<string, any>;
}

export default function AdminWebhookLogs() {
  const [logs, setLogs] = useState<WebhookLog[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [filter, setFilter] = useState<string>('');
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedLogIds, setExpandedLogIds] = useState<Record<string, boolean>>({});
  const [selectedType, setSelectedType] = useState<string>('all');

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/mercadopago/logs');
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
      }
    } catch (err) {
      console.error("Erro ao buscar logs de webhook:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchLogs();
    }, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh]);

  const toggleExpand = (id: string) => {
    setExpandedLogIds(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  const formatDateTime = (ts: string) => {
    if (!ts) return '-';
    const date = new Date(ts);
    if (isNaN(date.getTime())) return ts;
    return date.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const filteredLogs = logs.filter(log => {
    const jsonStr = JSON.stringify(log).toLowerCase();
    const matchesFilter = !filter || jsonStr.includes(filter.toLowerCase());
    
    if (selectedType === 'all') return matchesFilter;
    if (selectedType === 'payment') return matchesFilter && (log.type === 'payment' || log.action?.includes('payment'));
    if (selectedType === 'order') return matchesFilter && (log.type === 'order' || log.action?.includes('order'));
    if (selectedType === 'merchant_order') return matchesFilter && (log.type === 'merchant_order' || log.action?.includes('merchant_order'));
    return matchesFilter;
  });

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-fade-in pb-16">
      {/* Top Bar Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link 
            to="/admin" 
            className="p-2.5 rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition-colors shadow-sm"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl sm:text-3xl font-display font-bold text-slate-800 flex items-center gap-3">
              <Activity className="h-7 w-7 text-emerald-600" />
              Logs Brutos do Webhook MP
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 font-medium mt-0.5">
              Inspeção em tempo real das notificações enviadas pelo Mercado Pago.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition-all border flex items-center gap-2 cursor-pointer ${
              autoRefresh 
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100' 
                : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${autoRefresh ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`}></span>
            <span>{autoRefresh ? 'Auto-Atualização Ativa (5s)' : 'Auto-Atualização Pausada'}</span>
          </button>

          <button
            onClick={fetchLogs}
            disabled={loading}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-2 shadow-sm shrink-0"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Atualizar</span>
          </button>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-4">
          <div className="bg-emerald-50 p-3 rounded-xl text-emerald-600">
            <Code className="w-6 h-6" />
          </div>
          <div>
            <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">Total de Requisições</p>
            <p className="text-2xl font-mono font-bold text-slate-800">{logs.length}</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-4">
          <div className="bg-blue-50 p-3 rounded-xl text-blue-600">
            <Activity className="w-6 h-6" />
          </div>
          <div>
            <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">Última Notificação</p>
            <p className="text-sm font-mono font-bold text-slate-800">
              {logs.length > 0 ? formatDateTime(logs[0].timestamp) : 'Nenhum log ainda'}
            </p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-4">
          <div className="bg-amber-50 p-3 rounded-xl text-amber-600">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">Status Endpoint</p>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 mt-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> 200 OK (Ativo)
            </span>
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="Buscar por ID, evento, header ou payload..."
            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl bg-slate-50 text-xs font-medium outline-none focus:bg-white focus:ring-2 focus:ring-emerald-500/20 text-slate-800"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <Filter className="w-4 h-4 text-slate-400 shrink-0" />
          <span className="text-xs font-bold text-slate-500">Filtrar:</span>
          <select
            value={selectedType}
            onChange={e => setSelectedType(e.target.value)}
            className="border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 text-xs font-bold text-slate-700 outline-none focus:bg-white cursor-pointer"
          >
            <option value="all">Todos os tipos ({logs.length})</option>
            <option value="payment">Pagamentos (payment)</option>
            <option value="order">Pedidos (order)</option>
            <option value="merchant_order">Ordens do Vendedor (merchant_order)</option>
          </select>
        </div>
      </div>

      {/* Logs List */}
      <div className="space-y-4">
        {filteredLogs.length === 0 ? (
          <div className="bg-white p-12 rounded-3xl shadow-sm border border-slate-200 text-center space-y-3">
            <Code className="w-12 h-12 text-slate-300 mx-auto" />
            <h3 className="text-base font-bold text-slate-700">Nenhum log de webhook encontrado</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Assim que o Mercado Pago enviar uma requisição HTTP para a sua URL de webhook, o payload bruto e os cabeçalhos aparecerão listados aqui instantaneamente.
            </p>
          </div>
        ) : (
          filteredLogs.map(log => {
            const isExpanded = expandedLogIds[log.id] ?? true; // expanded by default for easy inspection
            const rawJson = JSON.stringify(log, null, 2);

            return (
              <div 
                key={log.id} 
                className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden transition-all hover:border-slate-300"
              >
                {/* Log Header */}
                <div 
                  onClick={() => toggleExpand(log.id)}
                  className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer bg-slate-50/50 hover:bg-slate-50 transition-colors border-b border-slate-100"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-bold bg-slate-800 text-white px-2.5 py-1 rounded-lg">
                      {log.method || 'POST'}
                    </span>

                    <span className="font-mono text-xs text-slate-500 bg-white px-2.5 py-1 rounded-lg border border-slate-200">
                      {formatDateTime(log.timestamp)}
                    </span>

                    {log.type && (
                      <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">
                        Type: {log.type}
                      </span>
                    )}

                    {log.action && (
                      <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200">
                        Action: {log.action}
                      </span>
                    )}

                    {log.resourceId && (
                      <span className="font-mono text-xs font-bold px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 border border-amber-200">
                        Resource ID: {log.resourceId}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        copyToClipboard(rawJson, log.id);
                      }}
                      className="px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                    >
                      {copiedId === log.id ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedId === log.id ? 'Copiado!' : 'Copiar JSON'}</span>
                    </button>

                    <button 
                      className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
                      title={isExpanded ? 'Recolher' : 'Expandir'}
                    >
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Log Details Content */}
                {isExpanded && (
                  <div className="p-4 sm:p-5 space-y-4 bg-white">
                    {/* Headers */}
                    {log.headers && Object.keys(log.headers).length > 0 && (
                      <div className="space-y-1.5">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                          Cabeçalhos HTTP (Headers)
                        </span>
                        <div className="bg-slate-900 text-slate-200 p-3.5 rounded-xl text-xs font-mono overflow-x-auto custom-scrollbar border border-slate-800">
                          {Object.entries(log.headers).map(([key, val]) => (
                            <div key={key} className="flex gap-2">
                              <span className="text-indigo-300 font-bold shrink-0">{key}:</span>
                              <span className="text-slate-300 break-all">{String(val)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Query Params */}
                    {log.query && Object.keys(log.query).length > 0 && (
                      <div className="space-y-1.5">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                          Parâmetros de URL (Query)
                        </span>
                        <pre className="bg-slate-900 text-amber-300 p-3.5 rounded-xl text-xs font-mono overflow-x-auto custom-scrollbar border border-slate-800">
                          {JSON.stringify(log.query, null, 2)}
                        </pre>
                      </div>
                    )}

                    {/* Body / Payload */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                          Corpo da Requisição (Body / Payload)
                        </span>
                        {log.body && (
                          <button
                            onClick={() => copyToClipboard(JSON.stringify(log.body, null, 2), `${log.id}-body`)}
                            className="text-[11px] font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1 cursor-pointer"
                          >
                            {copiedId === `${log.id}-body` ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                            <span>{copiedId === `${log.id}-body` ? 'Copiado!' : 'Copiar Payload'}</span>
                          </button>
                        )}
                      </div>
                      <pre className="bg-slate-950 text-emerald-400 p-4 rounded-xl text-xs font-mono overflow-x-auto custom-scrollbar border border-slate-800 leading-relaxed">
                        {log.body ? JSON.stringify(log.body, null, 2) : '// Corpo da requisição vazio'}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
