import React, { useState, useEffect } from 'react';
import { Check, Copy, QrCode, ShieldCheck, Sparkles } from 'lucide-react';
import { generatePixPayload, generatePixQRCodeDataUrl } from '../utils/pix';

interface PixPaymentCardProps {
  amount: number;
  pixKey?: string;
  onConfirmPayment: () => void;
  onCancel: () => void;
}

export const PixPaymentCard: React.FC<PixPaymentCardProps> = ({
  amount,
  pixKey = 'ecbf2588-9b0b-48e7-bc17-57f66ca2dbff',
  onConfirmPayment,
  onCancel
}) => {
  const [copiedPix, setCopiedPix] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [loading, setLoading] = useState(true);

  // Generate dynamic PIX payload based on exact user amount
  const pixCode = generatePixPayload({
    pixKey,
    amount,
    txId: 'BOLAOCOXIM'
  });

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    generatePixQRCodeDataUrl(pixCode).then((url) => {
      if (isMounted) {
        setQrDataUrl(url);
        setLoading(false);
      }
    });
    return () => {
      isMounted = false;
    };
  }, [pixCode]);

  const handleCopyPix = async () => {
    try {
      await navigator.clipboard.writeText(pixCode);
      setCopiedPix(true);
      setTimeout(() => setCopiedPix(false), 2500);
    } catch (err) {
      console.error('Falha ao copiar o código Pix:', err);
    }
  };

  return (
    <div className="mt-auto flex flex-col items-center bg-white p-5 rounded-2xl border border-emerald-100 relative animate-fade-in shadow-sm w-full">
      {/* Header Badge */}
      <div className="bg-emerald-50 border border-emerald-200/80 rounded-xl px-4 py-2 mb-4 w-full flex items-center justify-between">
        <span className="text-xs font-medium text-emerald-800 flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 text-emerald-600" />
          Valor do Depósito:
        </span>
        <span className="text-lg font-mono font-extrabold text-emerald-700">
          R$ {amount.toFixed(2).replace('.', ',')}
        </span>
      </div>

      {/* QR Code Container */}
      <div className="relative w-52 h-52 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-center p-2 mb-3 shadow-inner">
        {loading || !qrDataUrl ? (
          <div className="flex flex-col items-center gap-2 text-slate-400">
            <QrCode className="w-10 h-10 animate-pulse" />
            <span className="text-xs font-semibold">Gerando QR Code...</span>
          </div>
        ) : (
          <img
            src={qrDataUrl}
            alt={`QR Code PIX R$ ${amount.toFixed(2)}`}
            className="w-full h-full object-contain rounded-xl"
          />
        )}
      </div>

      <p className="text-xs text-center text-slate-600 font-medium mb-4 max-w-xs leading-relaxed">
        Escaneie o QR Code no app do seu banco para o valor de <strong className="text-slate-800 font-bold">R$ {amount.toFixed(2).replace('.', ',')}</strong>.
      </p>

      {/* Pix Copia e Cola */}
      <div className="w-full mb-5 bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col text-left">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            Pix Copia e Cola
          </span>
        </div>
        
        <div className="flex gap-2">
          <input
            type="text"
            readOnly
            value={pixCode}
            className="w-full text-xs font-mono text-slate-700 bg-white border border-slate-200 rounded-lg px-3 py-2 focus:outline-none select-all overflow-hidden text-ellipsis shadow-inner"
          />
          <button
            onClick={handleCopyPix}
            type="button"
            className={`px-3.5 py-2 rounded-lg font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-all shrink-0 shadow-sm ${
              copiedPix
                ? 'bg-emerald-600 text-white border border-emerald-700 scale-105'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white'
            }`}
            title="Copiar Código Pix"
          >
            {copiedPix ? <Check className="h-4 w-4 text-yellow-300" /> : <Copy className="h-4 w-4" />}
            {copiedPix ? 'Copiado!' : 'Copiar'}
          </button>
        </div>
      </div>

      {/* Action Buttons */}
      <button
        onClick={onConfirmPayment}
        className="w-full bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white font-bold rounded-xl py-3 px-4 transition-all text-sm uppercase tracking-wide shadow-md shadow-emerald-600/20 mb-2 cursor-pointer flex items-center justify-center gap-2"
      >
        <Check className="w-4 h-4" />
        EFETUEI O PAGAMENTO
      </button>

      <button
        onClick={onCancel}
        className="text-xs font-bold text-slate-400 hover:text-slate-600 py-1 uppercase tracking-wider cursor-pointer transition-colors"
      >
        Cancelar
      </button>
    </div>
  );
};

export default PixPaymentCard;
