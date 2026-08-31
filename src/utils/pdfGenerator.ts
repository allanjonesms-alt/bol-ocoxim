import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Match, Bet } from '../types';

/**
 * Formats a Firestore timestamp or general datetime value into a clean Portuguese locale string.
 */
function formatDateTime(ts: any): string {
  if (!ts) return '-';
  let date: Date;
  if (typeof ts === 'string') {
    date = new Date(ts);
  } else if (ts && typeof ts.toDate === 'function') {
    date = ts.toDate();
  } else if (ts && ts.seconds) {
    date = new Date(ts.seconds * 1000);
  } else {
    date = new Date(ts);
  }
  if (isNaN(date.getTime())) return '-';
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'America/Manaus', // standard time zone for this Applet's visual displays
  });
}

/**
 * Generates and downloads a beautiful PDF document containing all confirmed bets for a given match.
 * Provides high levels of bolão auditing transparency.
 * 
 * @param match The Match object whose bets should be printed
 */
export async function generateMatchBetsPDF(match: Match): Promise<boolean> {
  try {
    // 1. Fetch confirmed bets for this match
    const betsQuery = query(
      collection(db, 'bets'),
      where('matchId', '==', match.id),
      where('status', '==', 'confirmed'),
      orderBy('userName', 'asc')
    );
    const snap = await getDocs(betsQuery);
    
    const betsList: Bet[] = [];
    snap.docs.forEach(doc => {
      betsList.push({ id: doc.id, ...doc.data() } as Bet);
    });

    // 2. Setup jsPDF (A4 Portrait, Unit in mm)
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    // 3. Document Branding Color Schema
    const primaryColor = [16, 115, 73]; // Emerald Green
    const secondaryColor = [30, 41, 59]; // Slate Gray / Charcoal
    const lightBg = [241, 245, 249]; // Soft Slate light background

    // 4. Header Section - Emerald Banner
    doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.rect(0, 0, 210, 45, 'F'); // Width: 210mm (A4), Height: 45mm

    // Header Titles
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.text('BOLÃO DA COPA 2026', 15, 18);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(231, 250, 240);
    doc.text('RELATÓRIO DE TRANSPARÊNCIA E AUDITORIA DE PALPITES', 15, 25);
    doc.text('Todas as apostas confirmadas para conferência de todos os participantes', 15, 30);

    // Live Date of Generation (top right)
    const genDateStr = formatDateTime(new Date());
    doc.setFontSize(9);
    doc.setTextColor(190, 242, 210);
    doc.text(`Gerado em: ${genDateStr}`, 145, 18, { align: 'left' });
    doc.text('Status: Documento Público', 145, 23);

    // 5. Match Information Panel (Card style)
    doc.setFillColor(lightBg[0], lightBg[1], lightBg[2]);
    doc.roundedRect(15, 52, 180, 32, 3, 3, 'F');
    
    // Label
    doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('DETALHES DA PARTIDA', 20, 58);

    // Match Teams Design
    doc.setFontSize(14);
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text(`${match.team1}  VS  ${match.team2}`, 20, 66);

    // Match Metadata Details
    const matchDateFormatted = formatDateTime(match.date);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(71, 85, 105); // Slate 600
    doc.text(`Data/Hora do Jogo: ${matchDateFormatted}`, 20, 73);
    doc.text(`Fase: ${match.phase || 'Fase de Grupos'}`, 20, 78);

    // Right Aligned stats in the match card
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
    doc.text(`Total de Palpites: ${betsList.length}`, 190, 66, { align: 'right' });
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const costText = match.isPromotional ? 'Jogo Promocional' : 'Jogo Oficial';
    doc.text(`Tipo do Jogo: ${costText}`, 190, 73, { align: 'right' });

    // 6. Bets Table Header and content
    const tableHeaders = [['Nº', 'Participante', 'Palpite Registrado', 'Data/Hora Confirmação']];
    
    const tableBody = betsList.length > 0 
      ? betsList.map((bet, index) => {
          return [
            String(index + 1).padStart(3, '0'),
            bet.userName || 'Participante',
            `${bet.predicted1} x ${bet.predicted2}`,
            formatDateTime(bet.createdAt),
          ];
        })
      : [['-', 'Nenhum palpite confirmado para este jogo.', '-', '-']];

    // Build beautiful table using jspdf-autotable
    autoTable(doc, {
      startY: 90,
      head: tableHeaders,
      body: tableBody,
      theme: 'striped',
      headStyles: {
        fillColor: [16, 115, 73] as [number, number, number],
        textColor: [255, 255, 255] as [number, number, number],
        fontStyle: 'bold',
        fontSize: 10,
        halign: 'left',
      },
      columnStyles: {
        0: { cellWidth: 15, halign: 'center' }, // index
        1: { fontStyle: 'bold', textColor: [30, 41, 59] }, // name
        2: { fontStyle: 'bold', textColor: [16, 115, 73], halign: 'center', fontSize: 11 }, // score
        3: { textColor: [100, 116, 139], halign: 'right' }, // date
      },
      styles: {
        font: 'helvetica',
        fontSize: 9,
        cellPadding: 3.5,
      },
      didDrawPage: (data) => {
        // Footer for each page
        const pageCount = doc.internal.pages.length - 1;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184); // Slate-400
        
        // Horizontal line right above footer
        doc.setDrawColor(226, 232, 240);
        doc.line(15, 282, 195, 282);

        doc.text(
          'Este é um relatório oficial de transparência do Bolão da Copa 2026. Todos os dados são auditáveis publicamente.',
          15,
          287
        );
        doc.text(
          `Página ${data.pageNumber} de ${pageCount}`,
          195,
          287,
          { align: 'right' }
        );
      },
    });

    // 7. Save / Trigger Download
    const cleanMatchName = `${match.team1}_x_${match.team2}`.replace(/[\s/\\?%*:|"<>]/g, '_');
    doc.save(`Apostas_${cleanMatchName}.pdf`);
    return true;
  } catch (error) {
    console.error('Error generating bets PDF:', error);
    return false;
  }
}
