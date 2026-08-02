import React from 'react';
import { motion } from 'motion/react';
import { BookOpen, Trophy, Clock, Coins, ShieldCheck, AlertCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import googleScoreboardImg from '../assets/images/google_scoreboard_1783945113545.jpg';

// Teste de alteração para verificação de sincronização e commit no GitHub
export default function Regulations() {
  const containerVariants = {
    hidden: { opacity: 0, y: 15 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.4,
        staggerChildren: 0.08
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.3 } }
  };

  return (
    <motion.div 
      className="max-w-4xl mx-auto space-y-8 animate-fade-in"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Hero Banner */}
      <motion.div 
        variants={itemVariants}
        className="relative bg-gradient-to-r from-emerald-800 to-emerald-950 p-8 sm:p-10 rounded-3xl shadow-lg border border-yellow-400/20 overflow-hidden text-left"
      >
        <div className="absolute top-0 right-0 w-80 h-80 bg-yellow-400/10 rounded-full blur-[90px] pointer-events-none"></div>
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <span className="bg-yellow-400/20 text-yellow-350 border border-yellow-400/30 text-xs px-3 py-1 rounded-full font-bold uppercase tracking-wider">Informativo Geral</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-display font-bold text-white tracking-tight flex items-center gap-3">
              <BookOpen className="h-8 w-8 text-yellow-300 shrink-0" />
              Regulamento do Bolão
            </h1>
            <p className="text-emerald-100/80 text-sm sm:text-base font-medium max-w-2xl">
              Entenda como funciona o PIXCOXIM: divisão de prêmios, prazos inegociáveis, acúmulos para a Seleção Brasileira e regras de homologação.
            </p>
          </div>
        </div>
      </motion.div>

      {/* Rules Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-left">
        
        {/* Rule 1: Divisão de prêmios */}
        <motion.div 
          variants={itemVariants}
          className="bg-white p-6 sm:p-8 rounded-3xl shadow-sm border border-slate-200 hover:border-emerald-500/50 transition-all duration-300 relative group flex flex-col justify-between"
        >
          <div className="space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-all duration-300 shadow-xs">
              <Coins className="h-6 w-6" />
            </div>
            <h2 className="text-lg font-display font-bold text-slate-800 uppercase tracking-wider">Divisão de Valores</h2>
            <div className="text-slate-600 text-sm leading-relaxed space-y-3">
              <p>
                Cada palpite registrado e homologado no bolão possui o valor fixo de <strong>R$ 5,00</strong> por aposta.
              </p>
              <p>
                <strong>90% de todo o valor arrecadado</strong> em cada confronto é destinado exclusivamente para a premiação líquida aos acertadores daquele jogo específico.
              </p>
              <p>
                A premiação correspondente é dividida em partes <strong>rigorosamente iguais</strong> entre todas as apostas com o palpite exato do placar final (Ganhadores).
              </p>
            </div>
          </div>
          <div className="border-t border-slate-100 mt-6 pt-4 flex items-center justify-between">
            <span className="text-[10px] uppercase font-extrabold tracking-widest text-slate-400">90% para o Prêmio</span>
            <span className="text-xs font-bold text-emerald-600 font-mono">10% de Taxa Administrativa</span>
          </div>
        </motion.div>

        {/* Rule 2: Regra de Acúmulo */}
        <motion.div 
          variants={itemVariants}
          className="bg-white p-6 sm:p-8 rounded-3xl shadow-sm border border-slate-200 hover:border-emerald-500/50 transition-all duration-300 relative group flex flex-col justify-between"
        >
          <div className="space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 group-hover:bg-amber-500 group-hover:text-white transition-all duration-300 shadow-xs">
              <Trophy className="h-6 w-6" />
            </div>
            <h2 className="text-lg font-display font-bold text-slate-800 uppercase tracking-wider">Acúmulo de Prêmios</h2>
            <div className="text-slate-600 text-sm leading-relaxed space-y-3">
              <p>
                Se <strong>não houver nenhum acertador</strong> do placar exato de um jogo, o prêmio não é estornado nem faturado para a administração!
              </p>
              <p className="border-l-4 border-yellow-400 pl-3 py-1 bg-yellow-50/50 rounded-r-lg">
                Todo o valor destinado ao prêmio da partida é <strong>totalmente acumulado</strong> para a próxima partida da <strong>Seleção Brasileira</strong>.
              </p>
              <p>
                Excepcionalmente, caso não haja mais nenhuma partida programada da nossa seleção no calendário letivo do bolão, o montante total arrecadado acumulará diretamente para a premiação final da <strong>Classificação Geral</strong>.
              </p>
            </div>
          </div>
          <div className="border-t border-slate-100 mt-6 pt-4 flex items-center justify-between">
            <span className="text-[10px] uppercase font-extrabold tracking-widest text-slate-400">Garantia de Ganho</span>
            <span className="text-xs font-bold text-amber-700">Acúmulo Inteligente</span>
          </div>
        </motion.div>

        {/* Rule 3: Prazo das Apostas */}
        <motion.div 
          variants={itemVariants}
          className="bg-white p-6 sm:p-8 rounded-3xl shadow-sm border border-slate-200 hover:border-emerald-500/50 transition-all duration-300 relative group flex flex-col justify-between"
        >
          <div className="space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-all duration-300 shadow-xs">
              <Clock className="h-6 w-6" />
            </div>
            <h2 className="text-lg font-display font-bold text-slate-800 uppercase tracking-wider">Validade e Prazos</h2>
            <div className="text-slate-600 text-sm leading-relaxed space-y-3">
              <p>
                A pontualidade é mandatória para garantir a lisura, auditoria e equilíbrio do nosso PIXCOXIM.
              </p>
              <p className="border-l-4 border-blue-500 pl-3 py-1 bg-blue-50/50 rounded-r-lg">
                As apostas e palpites só serão considerados válidos se forem completamente <strong>confirmados até 30 minutos antes do início oficial</strong> de cada jogo.
              </p>
              <p>
                O sistema implementa barreiras digitais auto-executáveis de tempo: após o prazo (-30 min), novos palpites e pagamentos para a devida partida serão desativados.
              </p>
            </div>
          </div>
          <div className="border-t border-slate-100 mt-6 pt-4 flex items-center justify-between">
            <span className="text-[10px] uppercase font-extrabold tracking-widest text-slate-400">Prazos de Jogo</span>
            <span className="text-xs font-bold text-blue-700">Bloqueio Automático (-30 min)</span>
          </div>
        </motion.div>

        {/* Rule 4: Homologação e Saldo */}
        <motion.div 
          variants={itemVariants}
          className="bg-white p-6 sm:p-8 rounded-3xl shadow-sm border border-slate-200 hover:border-emerald-500/50 transition-all duration-300 relative group flex flex-col justify-between"
        >
          <div className="space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-all duration-300 shadow-xs">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <h2 className="text-lg font-display font-bold text-slate-800 uppercase tracking-wider">Aprovação e Saldo</h2>
            <div className="text-slate-600 text-sm leading-relaxed space-y-3">
              <p>
                Quando você salva uma aposta, se houver saldo válido (R$ 5,00 ou R$ 2,00 dependendo do tipo da aposta), ela é <strong>aprovada automaticamente pelo sistema</strong>.
              </p>
              <p>
                Apostas para as quais não haja saldo regular suficiente entrarão no sistema sob o rótulo de <strong>Aposta Pendente</strong>.
              </p>
              <p>
                Certifique-se de preencher seus fundos de forma adequada na área do jogador realizando um Pix e solicitando a aprovação do depósito ao suporte administrador.
              </p>
            </div>
          </div>
          <div className="border-t border-slate-100 mt-6 pt-4 flex items-center justify-between">
            <span className="text-[10px] uppercase font-extrabold tracking-widest text-slate-400">Auditoria Clara</span>
            <span className="text-xs font-bold text-indigo-700">Garantia Antifraude</span>
          </div>
        </motion.div>

        {/* Rule 5: Jogos Promocionais */}
        <motion.div 
          variants={itemVariants}
          className="bg-white p-6 sm:p-8 rounded-3xl shadow-sm border border-indigo-200 hover:border-indigo-500/50 transition-all duration-300 relative group flex flex-col justify-between md:col-span-2"
        >
          <div className="space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-all duration-300 shadow-xs">
              <Trophy className="h-6 w-6" />
            </div>
            <h2 className="text-lg font-display font-bold text-indigo-800 uppercase tracking-wider">Jogos Promocionais</h2>
            <div className="text-slate-600 text-sm leading-relaxed space-y-3">
              <p>
                Os Jogos Promocionais são uma modalidade especial que <strong>não distribui prêmios em dinheiro</strong>, mas serve exclusivamente para somar pontos na <strong>Classificação Geral</strong>.
              </p>
              <p className="border-l-4 border-indigo-500 pl-3 py-1 bg-indigo-50/50 rounded-r-lg">
                O custo para registrar um palpite nesta modalidade é de apenas <strong>R$ 2,00</strong>.
              </p>
              <p>
                Cada usuário tem um limite máximo de <strong>2 apostas</strong> por partida em jogos promocionais. Metade dos valores arrecadados nessas partidas são adicionados ao caixa para a grande premiação da Classificação Geral!
              </p>
            </div>
          </div>
          <div className="border-t border-slate-100 mt-6 pt-4 flex items-center justify-between">
            <span className="text-[10px] uppercase font-extrabold tracking-widest text-slate-400">Pontuação na Liga</span>
            <span className="text-xs font-bold text-indigo-700">R$ 2,00 por Palpite</span>
          </div>
        </motion.div>

        {/* Rule 6: Sistema de Pontuação */}
        <motion.div 
          variants={itemVariants}
          className="bg-white p-6 sm:p-8 rounded-3xl shadow-sm border border-slate-200 hover:border-fuchsia-500/50 transition-all duration-300 relative group flex flex-col justify-between md:col-span-2"
        >
          <div className="space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-fuchsia-50 border border-fuchsia-100 flex items-center justify-center text-fuchsia-600 group-hover:bg-fuchsia-600 group-hover:text-white transition-all duration-300 shadow-xs">
              <Trophy className="h-6 w-6" />
            </div>
            <h2 className="text-lg font-display font-bold text-slate-800 uppercase tracking-wider">Sistema de Pontuação</h2>
            <div className="text-slate-600 text-sm leading-relaxed space-y-3">
              <p>
                A pontuação para a classificação geral recompensa acertos parciais. Você soma pontos ao acertar o vencedor (ou se foi empate) e ao acertar a quantidade exata de gols de cada equipe.
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                <div className="border border-emerald-100 bg-emerald-50/50 rounded-2xl p-4">
                  <h3 className="font-bold text-emerald-800 mb-3">Jogos Principais (R$ 5,00)</h3>
                  <ul className="space-y-2">
                    <li className="flex justify-between items-center bg-white p-2.5 rounded-xl border border-emerald-100/50 shadow-sm"><span className="text-xs font-semibold">Acertar o Vencedor (ou Empate)</span> <span className="font-bold text-emerald-700 bg-emerald-100 px-2 rounded">+6 pts</span></li>
                    <li className="flex justify-between items-center bg-white p-2.5 rounded-xl border border-emerald-100/50 shadow-sm"><span className="text-xs font-semibold">Acertar Gols da Equipe Mandante</span> <span className="font-bold text-emerald-700 bg-emerald-100 px-2 rounded">+12 pts</span></li>
                    <li className="flex justify-between items-center bg-white p-2.5 rounded-xl border border-emerald-100/50 shadow-sm"><span className="text-xs font-semibold">Acertar Gols da Equipe Visitante</span> <span className="font-bold text-emerald-700 bg-emerald-100 px-2 rounded">+12 pts</span></li>
                  </ul>
                  <div className="mt-4 text-xs text-center font-bold text-emerald-900 bg-emerald-200 py-2 rounded-xl">Acerto do Placar Exato: 30 pontos no total</div>
                </div>

                <div className="border border-indigo-100 bg-indigo-50/50 rounded-2xl p-4">
                  <h3 className="font-bold text-indigo-800 mb-3">Jogos Promocionais (R$ 2,00)</h3>
                  <ul className="space-y-2">
                    <li className="flex justify-between items-center bg-white p-2.5 rounded-xl border border-indigo-100/50 shadow-sm"><span className="text-xs font-semibold">Acertar o Vencedor (ou Empate)</span> <span className="font-bold text-indigo-700 bg-indigo-100 px-2 rounded">+2 pts</span></li>
                    <li className="flex justify-between items-center bg-white p-2.5 rounded-xl border border-indigo-100/50 shadow-sm"><span className="text-xs font-semibold">Acertar Gols da Equipe Mandante</span> <span className="font-bold text-indigo-700 bg-indigo-100 px-2 rounded">+4 pts</span></li>
                    <li className="flex justify-between items-center bg-white p-2.5 rounded-xl border border-indigo-100/50 shadow-sm"><span className="text-xs font-semibold">Acertar Gols da Equipe Visitante</span> <span className="font-bold text-indigo-700 bg-indigo-100 px-2 rounded">+4 pts</span></li>
                  </ul>
                  <div className="mt-4 text-xs text-center font-bold text-indigo-900 bg-indigo-200 py-2 rounded-xl">Acerto do Placar Exato: 10 pontos no total</div>
                </div>
              </div>

              <div className="mt-4 border-l-4 border-fuchsia-500 pl-3 py-2 bg-fuchsia-50/50 rounded-r-lg">
                <p className="text-sm text-fuchsia-900 leading-relaxed font-medium">
                  <strong>⚠️ Pontuação em Dobro:</strong> Daqui até o final do campeonato, as pontuações de todos os jogos são <strong>DOBRADAS</strong>! Os valores acima já refletem essa pontuação updated. O custo do jogo promocional está fixado em <strong>R$ 2,00</strong>.
                </p>
              </div>
            </div>
          </div>
          <div className="border-t border-slate-100 mt-6 pt-4 flex items-center justify-between">
            <span className="text-[10px] uppercase font-extrabold tracking-widest text-slate-400">Classificação Geral</span>
            <span className="text-xs font-bold text-fuchsia-700">Soma Automática</span>
          </div>
        </motion.div>
      </div>

      {/* Info Warning Card */}
      <motion.div 
        variants={itemVariants}
        className="bg-amber-50 border border-amber-200 p-6 rounded-3xl flex items-start gap-4 text-left"
      >
        <AlertCircle className="h-6 w-6 text-amber-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider">Atenção Especial: Carregamento de Recursos</h3>
          <p className="text-slate-600 text-sm leading-relaxed">
            Recomendamos enfaticamente carregar suas recargas com antecedência para evitar contratempos. Caso uma aposta permaneça registrada como <strong>Pendente</strong> pela falta de crédito após o limite de 30 minutos antes do início do jogo, ela não receberá homologação administrativa e será formalmente invalidada.
          </p>
        </div>
      </motion.div>

      {/* Play/Profile prompt */}
      <motion.div 
        variants={itemVariants}
        className="flex flex-col sm:flex-row shadow-xs p-5 bg-slate-100 border border-slate-200 rounded-3xl justify-center items-center gap-4 text-center"
      >
        <p className="text-sm font-semibold text-slate-600">Entendeu as regras e quer apostar?</p>
        <div className="flex gap-4">
          <Link to="/" className="text-xs font-bold uppercase tracking-wider bg-emerald-700 hover:bg-emerald-800 text-white px-5 py-3 rounded-xl shadow-xs transition-all cursor-pointer">
            Ver Próximos Jogos
          </Link>
          <Link to="/panel" className="text-xs font-bold uppercase tracking-wider bg-white hover:bg-slate-50 border border-slate-250 text-slate-700 px-5 py-3 rounded-xl transition-all cursor-pointer">
            Minhas Carteira e Apostas
          </Link>
        </div>
      </motion.div>
    </motion.div>
  );
}
