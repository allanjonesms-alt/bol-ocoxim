import React from 'react';
import { motion } from 'motion/react';
import { BookOpen, Trophy, ShieldCheck, AlertCircle, Sparkles, Ticket, Percent, Coins, CheckCircle2 } from 'lucide-react';
import { Link } from 'react-router-dom';

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
        className="relative bg-gradient-to-br from-amber-600 via-amber-700 to-yellow-800 p-8 sm:p-10 rounded-3xl shadow-lg border border-yellow-300/30 overflow-hidden text-left"
      >
        <div className="absolute top-0 right-0 w-80 h-80 bg-yellow-300/20 rounded-full blur-[90px] pointer-events-none"></div>
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <span className="bg-yellow-400/25 text-yellow-200 border border-yellow-300/40 text-xs px-3.5 py-1 rounded-full font-bold uppercase tracking-wider flex items-center gap-1.5 shadow-xs">
                <Sparkles className="w-3.5 h-3.5 text-yellow-300" />
                Regulamento Oficial
              </span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-display font-black text-white tracking-tight flex items-center gap-3">
              <BookOpen className="h-8 w-8 text-yellow-300 shrink-0" />
              PIX PREMIADO
            </h1>
            <p className="text-amber-100 text-sm sm:text-base font-medium max-w-2xl leading-relaxed">
              Confira as regras oficiais, opções de pacotes de bilhetes com descontos progressivos, prazos e a forma dos sorteios baseados em extrações oficiais.
            </p>
          </div>
        </div>
      </motion.div>

      {/* Rules Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-left">
        
        {/* Rule 1: O que é o PIX PREMIADO */}
        <motion.div 
          variants={itemVariants}
          className="bg-white p-6 sm:p-8 rounded-3xl shadow-xs border border-amber-200 hover:border-amber-400 transition-all duration-300 relative group flex flex-col justify-between"
        >
          <div className="space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 group-hover:bg-amber-500 group-hover:text-white transition-all duration-300 shadow-xs">
              <Ticket className="h-6 w-6" />
            </div>
            <h2 className="text-lg font-display font-bold text-slate-900 uppercase tracking-wider">1. O que é o PIX PREMIADO</h2>
            <div className="text-slate-600 text-sm leading-relaxed space-y-3">
              <p>
                O <strong>PIX PREMIADO</strong> é uma modalidade de sorteios promocionais rápidos, 100% transparentes e auditáveis promovidos pelo PIXCOXIM.
              </p>
              <p className="border-l-4 border-amber-500 pl-3 py-1 bg-amber-50/60 rounded-r-lg font-medium text-amber-900">
                Cada participante adquire a quantidade desejada de bilhetes e concorre diretamente a prêmios em dinheiro creditados na sua conta.
              </p>
              <p>
                Todos os números gerados para cada compra ficam salvos na sua conta e são exibidos de forma clara e organizada na página inicial e no painel do usuário.
              </p>
            </div>
          </div>
          <div className="border-t border-slate-100 mt-6 pt-4 flex items-center justify-between">
            <span className="text-[10px] uppercase font-extrabold tracking-widest text-slate-400">Transparência Total</span>
            <span className="text-xs font-bold text-amber-600 font-mono">100% Auditável</span>
          </div>
        </motion.div>

        {/* Rule 2: Formas de Compra & Descontos Progressivos */}
        <motion.div 
          variants={itemVariants}
          className="bg-white p-6 sm:p-8 rounded-3xl shadow-xs border border-amber-200 hover:border-amber-400 transition-all duration-300 relative group flex flex-col justify-between"
        >
          <div className="space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-all duration-300 shadow-xs">
              <Percent className="h-6 w-6" />
            </div>
            <h2 className="text-lg font-display font-bold text-slate-900 uppercase tracking-wider">2. Formas de Compra e Pacotes</h2>
            <div className="text-slate-600 text-sm leading-relaxed space-y-3">
              <p>
                Você pode escolher comprar bilhetes individuais ou optar por pacotes promocionais com <strong>descontos progressivos automáticos de até 30% OFF</strong>:
              </p>
              <ul className="space-y-1.5 text-xs text-slate-700 font-semibold bg-slate-50 p-3 rounded-xl border border-slate-150">
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> Pacotes pré-definidos (1, 5, 10, 20 ou 50 bilhetes).</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> Campo de quantidade personalizada para o número exato de bilhetes que desejar.</li>
              </ul>
              <p className="text-xs text-slate-500">
                O valor total correspondente é calculado no momento da escolha e debitado instantaneamente do seu saldo disponível na plataforma.
              </p>
            </div>
          </div>
          <div className="border-t border-slate-100 mt-6 pt-4 flex items-center justify-between">
            <span className="text-[10px] uppercase font-extrabold tracking-widest text-slate-400">Economia Garantida</span>
            <span className="text-xs font-bold text-emerald-600">Até 30% OFF</span>
          </div>
        </motion.div>

        {/* Rule 3: Forma do Sorteio e Apuração pela Loteria Federal */}
        <motion.div 
          variants={itemVariants}
          className="bg-white p-6 sm:p-8 rounded-3xl shadow-xs border border-amber-200 hover:border-amber-400 transition-all duration-300 relative group flex flex-col justify-between md:col-span-2"
        >
          <div className="space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-all duration-300 shadow-xs">
              <Trophy className="h-6 w-6" />
            </div>
            <h2 className="text-lg font-display font-bold text-slate-900 uppercase tracking-wider">3. Forma do Sorteio e Apuração (Loteria Federal)</h2>
            <div className="text-slate-600 text-sm leading-relaxed space-y-4">
              <p>
                Os sorteios do <strong>PIX PREMIADO</strong> são baseados rigorosamente nas extrações oficiais da <strong>Loteria Federal</strong> (Caixa Econômica Federal), garantindo total transparência e lisura no resultado.
              </p>

              {/* Step-by-step extraction rules */}
              <div className="bg-amber-50/70 border border-amber-200 p-4 sm:p-5 rounded-2xl space-y-3.5">
                <h3 className="font-bold text-slate-900 text-xs sm:text-sm uppercase tracking-wider text-amber-900 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-600" />
                  Regras de Apuração Passo a Passo:
                </h3>

                <ol className="space-y-3 text-xs sm:text-sm text-slate-700">
                  <li className="flex items-start gap-2.5">
                    <span className="bg-amber-500 text-white font-black text-xs min-w-[22px] h-[22px] rounded-full flex items-center justify-center shrink-0 mt-0.5">1</span>
                    <div>
                      <strong>Milhar do 1º Prêmio:</strong> O bilhete contemplado será inicialmente a milhar (últimos 4 dígitos) do 1º Prêmio da Loteria Federal.
                      <div className="mt-1 bg-white p-2.5 rounded-xl border border-amber-200 font-mono text-xs text-slate-800">
                        💡 <strong>Exemplo:</strong> Se o 1º PRÊMIO for <span className="font-bold text-amber-700">52345</span>, o bilhete vencedor é o <span className="font-bold text-emerald-700">2.345</span>.
                      </div>
                    </div>
                  </li>

                  <li className="flex items-start gap-2.5">
                    <span className="bg-amber-500 text-white font-black text-xs min-w-[22px] h-[22px] rounded-full flex items-center justify-center shrink-0 mt-0.5">2</span>
                    <div>
                      <strong>Busca do 2º ao 5º Prêmio:</strong> Caso o bilhete da milhar do 1º prêmio não tenha sido vendido, a apuração seguirá sequencialmente verificando a milhar do <strong>2º prêmio</strong>, depois do <strong>3º prêmio</strong>, <strong>4º prêmio</strong> até o <strong>5º prêmio</strong>.
                    </div>
                  </li>

                  <li className="flex items-start gap-2.5">
                    <span className="bg-amber-500 text-white font-black text-xs min-w-[22px] h-[22px] rounded-full flex items-center justify-center shrink-0 mt-0.5">3</span>
                    <div>
                      <strong>Próxima Combinação da Milhar (1º ao 5º Prêmio):</strong> Se ainda assim não houver bilhete vendido entre o 1º e 5º prêmio, será considerada a combinação dos 4 primeiros dígitos (a partir do início da milhar do 1º prêmio) e assim por diante até o 5º prêmio.
                      <div className="mt-1 bg-white p-2.5 rounded-xl border border-amber-200 font-mono text-xs text-slate-800">
                        💡 <strong>Exemplo:</strong> Se o 1º PRÊMIO for <span className="font-bold text-amber-700">52345</span>, a próxima milhar testada é <span className="font-bold text-emerald-700">5.234</span> (e assim sucessivamente até o 5º prêmio).
                      </div>
                    </div>
                  </li>

                  <li className="flex items-start gap-2.5">
                    <span className="bg-amber-500 text-white font-black text-xs min-w-[22px] h-[22px] rounded-full flex items-center justify-center shrink-0 mt-0.5">4</span>
                    <div>
                      <strong>Aproximação Numérica (Mais Próximo):</strong> Caso persistir sem um ganhador exato, voltaremos ao número inicial (ex: <span className="font-bold font-mono">2.345</span>) e o prêmio será concedido ao <strong>bilhete vendido mais próximo</strong>, seja para mais ou para menos.
                    </div>
                  </li>

                  <li className="flex items-start gap-2.5">
                    <span className="bg-amber-500 text-white font-black text-xs min-w-[22px] h-[22px] rounded-full flex items-center justify-center shrink-0 mt-0.5">5</span>
                    <div>
                      <strong>Critério de Desempate por Horário:</strong> Em caso de empate exato na distância (ex: a mesma diferença para mais e para menos), o critério de desempate será a <strong>data e horário de compra</strong>, sagrando-se vencedor o bilhete que foi <strong>comprado primeiro</strong>.
                    </div>
                  </li>
                </ol>
              </div>

              <p className="text-xs text-slate-500">
                Os bilhetes do apostador são sempre ordenados em ordem crescente no seu painel para facilitar a conferência imediata com a extração oficial.
              </p>
            </div>
          </div>
          <div className="border-t border-slate-100 mt-6 pt-4 flex items-center justify-between">
            <span className="text-[10px] uppercase font-extrabold tracking-widest text-slate-400">Extração Oficial Caixa</span>
            <span className="text-xs font-bold text-indigo-700 font-mono">Milhar + Regra do Mais Próximo</span>
          </div>
        </motion.div>

        {/* Rule 4: Premiação e Pagamento */}
        <motion.div 
          variants={itemVariants}
          className="bg-white p-6 sm:p-8 rounded-3xl shadow-xs border border-amber-200 hover:border-amber-400 transition-all duration-300 relative group flex flex-col justify-between"
        >
          <div className="space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 group-hover:bg-amber-500 group-hover:text-white transition-all duration-300 shadow-xs">
              <Coins className="h-6 w-6" />
            </div>
            <h2 className="text-lg font-display font-bold text-slate-900 uppercase tracking-wider">4. Premiação e Recebimento</h2>
            <div className="text-slate-600 text-sm leading-relaxed space-y-3">
              <p>
                O valor do prêmio de cada edição é divulgado publicamente na área do sorteio antes do encerramento das compras.
              </p>
              <p>
                Assim que a extração oficial é homologada pela administração, o valor do prêmio é <strong>creditado no saldo do ganhador</strong> ou transferido via chave PIX para o titular da conta.
              </p>
              <p>
                Não há cobrança de taxas de saque para o resgate do prêmio obtido no PIX PREMIADO.
              </p>
            </div>
          </div>
          <div className="border-t border-slate-100 mt-6 pt-4 flex items-center justify-between">
            <span className="text-[10px] uppercase font-extrabold tracking-widest text-slate-400">Pagamento Rápido</span>
            <span className="text-xs font-bold text-amber-600">Via PIX Sem Taxas</span>
          </div>
        </motion.div>

        {/* Rule 5: Saldo & Regras de Segurança */}
        <motion.div 
          variants={itemVariants}
          className="bg-white p-6 sm:p-8 rounded-3xl shadow-xs border border-amber-200 hover:border-amber-400 transition-all duration-300 relative group flex flex-col justify-between md:col-span-2"
        >
          <div className="space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 group-hover:bg-slate-800 group-hover:text-white transition-all duration-300 shadow-xs">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <h2 className="text-lg font-display font-bold text-slate-900 uppercase tracking-wider">5. Saldo e Recargas de Carteira</h2>
            <div className="text-slate-600 text-sm leading-relaxed space-y-3">
              <p>
                Para efetuar a compra de bilhetes, certifique-se de possuir saldo suficiente na sua conta PIXCOXIM. Caso necessite adicionar fundos, acesse o painel do usuário e realize um depósito via PIX.
              </p>
              <p className="text-xs text-slate-500">
                Recomendamos efetuar o carregamento de saldo com antecedência para garantir a participação nas edições desejadas antes do limite de encerramento do sorteio.
              </p>
            </div>
          </div>
          <div className="border-t border-slate-100 mt-6 pt-4 flex items-center justify-between">
            <span className="text-[10px] uppercase font-extrabold tracking-widest text-slate-400">Segurança do Apostador</span>
            <span className="text-xs font-bold text-slate-700">Depósitos PIX 24/7</span>
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
          <h3 className="font-bold text-slate-900 text-sm uppercase tracking-wider">Lembrete Importante</h3>
          <p className="text-slate-600 text-sm leading-relaxed">
            Certifique-se sempre de conferir seus bilhetes na página inicial ou em <strong>"Meus Bilhetes"</strong> no seu painel. Em caso de dúvidas sobre a apuração dos números ou recargas de saldo, entre em contato com nosso suporte oficial.
          </p>
        </div>
      </motion.div>

      {/* Play/Profile prompt */}
      <motion.div 
        variants={itemVariants}
        className="flex flex-col sm:flex-row shadow-xs p-5 bg-amber-50/60 border border-amber-200 rounded-3xl justify-center items-center gap-4 text-center"
      >
        <p className="text-sm font-semibold text-slate-700">Acompanhe as apurações e consulte seus bilhetes:</p>
        <div className="flex gap-4">
          <Link to="/" className="text-xs font-bold uppercase tracking-wider bg-amber-500 hover:bg-amber-600 text-white px-5 py-3 rounded-xl shadow-xs transition-all cursor-pointer">
            Ver Sorteio e Resultados
          </Link>
          <Link to="/panel" className="text-xs font-bold uppercase tracking-wider bg-white hover:bg-slate-50 border border-amber-300 text-slate-800 px-5 py-3 rounded-xl transition-all cursor-pointer">
            Meus Bilhetes e Saldo
          </Link>
        </div>
      </motion.div>
    </motion.div>
  );
}

