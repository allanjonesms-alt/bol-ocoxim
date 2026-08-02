import AdminPixPremiado from './AdminPixPremiado';
import { ArrowLeft, Dices, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function AdminSorteios() {
  return (
    <div className="max-w-7xl mx-auto py-4 space-y-6 animate-fade-in" id="admin-sorteios-container">
      {/* Header */}
      <div className="bg-white rounded-3xl p-6 shadow-md border border-slate-200 flex flex-col md:flex-row items-center justify-between gap-6" id="sorteios-header-card">
        <div className="flex items-center gap-4">
          <Link to="/admin" className="p-3 rounded-2xl bg-slate-50 border border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-all cursor-pointer" id="back-to-admin-link">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-display font-extrabold text-slate-900 flex items-center gap-2">
              <Dices className="w-7 h-7 text-amber-500" />
              Sorteios Especiais - PIX PREMIADO
            </h1>
            <p className="text-slate-500 text-sm font-medium">Gestão de sorteios especiais e bilhetes do PIX Premiado</p>
          </div>
        </div>
        <div className="bg-emerald-800 text-white font-bold px-4 py-2 rounded-2xl text-xs flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-yellow-400" />
          PIX Premiado Ativo
        </div>
      </div>

      {/* Render PIX Premiado management component */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-md border border-slate-200 transition-all duration-300" id="sorteios-content-panel">
        <AdminPixPremiado isSubcomponent={true} />
      </div>
    </div>
  );
}
