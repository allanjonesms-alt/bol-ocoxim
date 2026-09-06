import { useState, useEffect, FormEvent } from 'react';
import { collection, onSnapshot, doc, runTransaction, serverTimestamp, getDocs, deleteDoc, writeBatch, query, where, limit, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { UserProfile, PixPremiadoGame, PixPremiadoDraw } from '../types';
import { ArrowLeft, Check, X, Sparkles, RefreshCw, Trophy, Trash2, ShieldCheck, Dices, Coins, AlertCircle, CalendarDays, Plus, Edit2, Search, Ticket, FileText, CheckCircle2, ChevronDown, UserCheck } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { fetchAvailableFederalNumbers } from '../utils/loteriaFederal';
import FederalDrawSimulator from '../components/FederalDrawSimulator';
import GuilhermeTicketsModal from '../components/GuilhermeTicketsModal';

// Mathematical rules supplied by the user
function chave(quadra: number[]) {
  return [...quadra].sort((a, b) => a - b).join("-");
}

function combinacoes4(jogo: number[]): string[] {
  const resp: string[] = [];
  if (jogo.length < 6) return resp;

  for (let a = 0; a < 3; a++) {
    for (let b = a + 1; b < 4; b++) {
      for (let c = b + 1; c < 5; c++) {
        for (let d = c + 1; d < 6; d++) {
          resp.push(
            chave([
              jogo[a],
              jogo[b],
              jogo[c],
              jogo[d]
            ])
          );
        }
      }
    }
  }
  return resp;
}

function podeAdicionar(jogo: number[], usedQuads: Set<string>): boolean {
  const quads = combinacoes4(jogo);
  for (const q of quads) {
    if (usedQuads.has(q)) {
      return false;
    }
  }
  return true;
}

function gerarJogo(): number[] {
  const numeros: number[] = [];
  while (numeros.length < 6) {
    const n = Math.floor(Math.random() * 60) + 1;
    if (!numeros.includes(n)) {
      numeros.push(n);
    }
  }
  return numeros.sort((a, b) => a - b);
}

export default function AdminPixPremiado({ isSubcomponent = false }: { isSubcomponent?: boolean }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlTab = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState<'simulator' | 'management'>(
    urlTab === 'management' ? 'management' : 'simulator'
  );

  useEffect(() => {
    if (urlTab === 'simulator' || urlTab === 'management') {
      setActiveTab(urlTab);
    }
  }, [urlTab]);

  const handleTabChange = (tab: 'simulator' | 'management') => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [games, setGames] = useState<PixPremiadoGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [visibleTicketsLimit, setVisibleTicketsLimit] = useState<number>(100);

  // Pool Metadata State
  const [poolMetadata, setPoolMetadata] = useState<{
    totalGames: number;
    assignedGames: number;
    isInitialized: boolean;
  }>({ totalGames: 0, assignedGames: 0, isInitialized: false });

  // Pool Generation Progress State
  const [isGeneratingPool, setIsGeneratingPool] = useState(false);
  const [poolGenStatus, setPoolGenStatus] = useState('');
  const [poolGenProgress, setPoolGenProgress] = useState(0);

  // Confirmation state modals
  const [showPoolConfirm, setShowPoolConfirm] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showResetFederalConfirm, setShowResetFederalConfirm] = useState(false);
  const [showResetMegaConfirm, setShowResetMegaConfirm] = useState(false);

  // Pool Type Selection & Search state
  const [selectedPoolType, setSelectedPoolType] = useState<'megasena' | 'federal'>('megasena');
  const [federalSearch, setFederalSearch] = useState('');
  const [showGuilhermeModal, setShowGuilhermeModal] = useState(false);

  // Form State for buying tickets from pool
  const [selectedUserId, setSelectedUserId] = useState('');
  const [ticketCountToBuy, setTicketCountToBuy] = useState('1');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Drawing simulation state
  const [drawnNumbers, setDrawnNumbers] = useState<string[]>(['', '', '', '', '', '']);
  const [drawResults, setDrawResults] = useState<{
    sena: PixPremiadoGame[];
    quina: PixPremiadoGame[];
    quadra: PixPremiadoGame[];
    terno: PixPremiadoGame[];
    hasChecked: boolean;
    isFederal?: boolean;
    federalReason?: string;
    targetMilhar?: string;
    winningTicketStr?: string;
  }>({ sena: [], quina: [], quadra: [], terno: [], hasChecked: false });

  // Helper to extract timestamp for tie-breaker
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

  
  // Draws State
  const [draws, setDraws] = useState<PixPremiadoDraw[]>([]);
  const [showDrawForm, setShowDrawForm] = useState(false);
  const [editingDrawId, setEditingDrawId] = useState<string | null>(null);
  const [drawForm, setDrawForm] = useState<{
    date: string;
    time: string;
    type: 'MegaSena' | 'Loteria Federal';
    status: 'active' | 'finished';
    observations: string;
  }>({
    date: '',
    time: '',
    type: 'MegaSena',
    status: 'active',
    observations: ''
  });

  // Toast State
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);

  // State for refunding / deleting registered ticket
  const [ticketToRefund, setTicketToRefund] = useState<PixPremiadoGame | null>(null);
  const [isDeletingTicketId, setIsDeletingTicketId] = useState<string | null>(null);

  const handleRefundTicket = async (game: PixPremiadoGame) => {
    setIsDeletingTicketId(game.id);
    try {
      await runTransaction(db, async (transaction) => {
        const userRef = doc(db, 'users', game.userId);
        const userSnap = await transaction.get(userRef);
        if (!userSnap.exists()) throw new Error('Perfil de usuário não encontrado.');

        const freshProfile = userSnap.data() as UserProfile;
        const freshBalance = freshProfile.balance || 0;

        // Refund user balance
        const refundedBalance = freshBalance + game.price;
        transaction.update(userRef, { balance: refundedBalance });

        // Log transaction
        const transRef = doc(collection(db, 'transactions'));
        transaction.set(transRef, {
          userId: game.userId,
          type: 'refund',
          amount: game.price,
          status: 'confirmed',
          timestamp: serverTimestamp(),
          description: `Cancelamento de bilhete Pix Premiado #${game.id} por administrador - Reembolso de R$ ${game.price.toFixed(2)}`
        });

        // Delete game document
        const gameRef = doc(db, 'pix_premiado_games', game.id);
        transaction.delete(gameRef);
      });

      // Update pool doc to not assigned (if it was a pool game)
      if (game.numbers.length > 1) {
        try {
          const poolQuery = query(
            collection(db, 'pix_premiado_pool'),
            where('assigned', '==', true),
            where('assignedUserId', '==', game.userId)
          );
          const poolSnap = await getDocs(poolQuery);
          const gameNumbersStr = game.numbers.join('-');
          const matchingPoolDoc = poolSnap.docs.find(d => {
            const numbers = d.data().numbers as number[];
            return numbers && numbers.join('-') === gameNumbersStr;
          });

          if (matchingPoolDoc) {
            const poolDocRef = doc(db, 'pix_premiado_pool', matchingPoolDoc.id);
            await setDoc(poolDocRef, {
              assigned: false,
              assignedUserId: null,
              assignedUserName: null,
              assignedAt: null
            }, { merge: true });

            // Update metadata count
            const metaRef = doc(db, 'pix_premiado_metadata', 'pool');
            await runTransaction(db, async (transaction) => {
              const metaSnap = await transaction.get(metaRef);
              const currentAssigned = metaSnap.exists() ? (metaSnap.data().assignedGames || 0) : 0;
              transaction.set(metaRef, {
                assignedGames: Math.max(0, currentAssigned - 1)
              }, { merge: true });
            });
          }
        } catch (poolErr) {
          console.error("Error releasing pool ticket or updating metadata:", poolErr);
        }
      }

      showToast(`Bilhete do apostador ${game.userName} cancelado e valor de R$ ${game.price.toFixed(2)} reembolsado com sucesso!`, 'success');
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Erro ao cancelar e reembolsar bilhete.', 'error');
    } finally {
      setIsDeletingTicketId(null);
      setTicketToRefund(null);
    }
  };

  const showToast = (message: string, type: 'success' | 'error' | 'warning' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  };

  // Real-time sync for games and users
  useEffect(() => {
    const unsubGames = onSnapshot(collection(db, 'pix_premiado_games'), (snapshot) => {
      const fetched = snapshot.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          userId: data.userId,
          userName: data.userName,
          numbers: data.numbers || [],
          price: data.price || 10,
          createdAt: data.createdAt
        } as PixPremiadoGame;
      });
      // Sort newest first
      fetched.sort((a, b) => {
        const timeA = a.createdAt ? (a.createdAt.seconds ? a.createdAt.seconds * 1000 : new Date(a.createdAt).getTime()) : 0;
        const timeB = b.createdAt ? (b.createdAt.seconds ? b.createdAt.seconds * 1000 : new Date(b.createdAt).getTime()) : 0;
        return timeB - timeA;
      });
      setGames(fetched);
      setLoading(false);
    });

    const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      const fetchedUsers = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as UserProfile));
      // Sort alphabetically
      fetchedUsers.sort((a, b) => a.name.localeCompare(b.name));
      setUsers(fetchedUsers);
    });

    
    const unsubDraws = onSnapshot(collection(db, 'pix_premiado_draws'), (snapshot) => {
      const fetched = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as PixPremiadoDraw));
      fetched.sort((a, b) => new Date(`${b.date}T${b.time}`).getTime() - new Date(`${a.date}T${a.time}`).getTime());
      setDraws(fetched);
    });

    const unsubMetadata = onSnapshot(doc(db, 'pix_premiado_metadata', 'pool'), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setPoolMetadata({
          totalGames: data.totalGames || 30000,
          assignedGames: data.assignedGames || 0,
          isInitialized: data.isInitialized !== false
        });
      } else {
        // Fallback check if the collection actually has games
        const checkPoolPresence = async () => {
          try {
            const q = query(collection(db, 'pix_premiado_pool'), limit(1));
            const poolSnap = await getDocs(q);
            if (!poolSnap.empty) {
              setPoolMetadata({
                totalGames: 30000,
                assignedGames: 0,
                isInitialized: true
              });
            } else {
              setPoolMetadata({ totalGames: 0, assignedGames: 0, isInitialized: false });
            }
          } catch (err) {
            setPoolMetadata({ totalGames: 0, assignedGames: 0, isInitialized: false });
          }
        };
        checkPoolPresence();
      }
    });

    return () => {
      unsubGames();
      unsubUsers();
      unsubMetadata();
      unsubDraws();
    };
  }, []);


  const handleSaveDraw = async (e: FormEvent) => {
    e.preventDefault();
    if (!drawForm.date || !drawForm.time) {
      showToast('Preencha data e hora do sorteio.', 'error');
      return;
    }
    
    try {
      if (editingDrawId) {
        await setDoc(doc(db, 'pix_premiado_draws', editingDrawId), {
          ...drawForm,
        }, { merge: true });
        showToast('Sorteio atualizado!', 'success');
      } else {
        const newRef = doc(collection(db, 'pix_premiado_draws'));
        await setDoc(newRef, {
          ...drawForm,
          drawnNumbers: ['', '', '', '', '', ''],
          createdAt: serverTimestamp()
        });
        showToast('Novo sorteio cadastrado!', 'success');
      }
      setShowDrawForm(false);
      setEditingDrawId(null);
      setDrawForm({ date: '', time: '', type: 'MegaSena', status: 'active', observations: '' });
    } catch (err) {
      showToast('Erro ao salvar sorteio.', 'error');
    }
  };

  const handleEditDraw = (draw: PixPremiadoDraw) => {
    setDrawForm({
      date: draw.date,
      time: draw.time,
      type: draw.type,
      status: draw.status,
      observations: draw.observations || ''
    });
    setEditingDrawId(draw.id);
    setShowDrawForm(true);
  };

  // Compute Mega-Sena vs Federal games
  const megaGames = games.filter(g => Array.isArray(g.numbers) && g.numbers.length === 6);
  const federalGames = games.filter(g => Array.isArray(g.numbers) && g.numbers.length === 1);

  // Federal Search Lookup
  const parsedFederalSearch = parseInt(federalSearch.replace(/[^0-9]/g, ''), 10);
  const searchedFederalGame = !isNaN(parsedFederalSearch) && parsedFederalSearch >= 1 && parsedFederalSearch <= 9999
    ? federalGames.find(g => g.numbers[0] === parsedFederalSearch)
    : null;

  // Compute used quads on the fly
  const usedQuads = new Set<string>();
  games.forEach(g => {
    const quads = combinacoes4(g.numbers);
    quads.forEach(q => usedQuads.add(q));
  });

  const effectiveAssignedGames = Math.max(poolMetadata.assignedGames || 0, games.length);

  // NEW: Pre-generate a Pool of 30,000 games in the database using the exact algorithm requested
  const handleGeneratePool = async () => {
    setIsGeneratingPool(true);
    setPoolGenStatus('Gerando 30.000 dezenas exclusivas em memória...');
    setPoolGenProgress(0);

    try {
      const pool: number[][] = [];
      const localUsedQuads = new Set<string>();
      const localUsedGames = new Set<string>();

      // Generate in chunks of 2,000 to keep UI responsive
      const chunkSize = 2000;
      const targetTotal = 30000;

      const generateChunk = (): Promise<void> => {
        return new Promise((resolve) => {
          setTimeout(() => {
            let attemptsThisChunk = 0;
            const maxAttemptsThisChunk = 150000;
            const targetLen = Math.min(targetTotal, pool.length + chunkSize);

            while (pool.length < targetLen && attemptsThisChunk < maxAttemptsThisChunk) {
              attemptsThisChunk++;
              let candidate = gerarJogo();
              let key = candidate.join("-");
              let attempts = 0;
              let added = false;

              while (attempts < 50) {
                if (podeAdicionar(candidate, localUsedQuads) && !localUsedGames.has(key)) {
                  const quads = combinacoes4(candidate);
                  quads.forEach(q => localUsedQuads.add(q));
                  localUsedGames.add(key);
                  pool.push(candidate);
                  added = true;
                  break;
                }
                candidate = gerarJogo();
                key = candidate.join("-");
                attempts++;
              }

              if (!added) {
                while (localUsedGames.has(key)) {
                  candidate = gerarJogo();
                  key = candidate.join("-");
                }
                localUsedGames.add(key);
                pool.push(candidate);
              }
            }

            const progressPercent = Math.round((pool.length / targetTotal) * 40); // Memory represents 40% of visual progress
            setPoolGenProgress(progressPercent);
            setPoolGenStatus(`Gerando jogos na memória... ${pool.length.toLocaleString('pt-BR')} / 30.000`);
            resolve();
          }, 20);
        });
      };

      while (pool.length < targetTotal) {
        await generateChunk();
      }

      setPoolGenStatus('Limpando pool anterior do banco de dados...');
      setPoolGenProgress(45);

      // Delete existing pool in small batches to avoid out-of-memory errors
      let hasMore = true;
      let totalDeleted = 0;
      while (hasMore) {
        const q = query(collection(db, 'pix_premiado_pool'), limit(500));
        const poolSnap = await getDocs(q);
        if (poolSnap.empty) {
          hasMore = false;
        } else {
          const batch = writeBatch(db);
          poolSnap.docs.forEach(d => batch.delete(d.ref));
          await batch.commit();
          totalDeleted += poolSnap.size;
          setPoolGenStatus(`Limpando pool anterior... ${totalDeleted.toLocaleString('pt-BR')} removidos`);
        }
      }

      setPoolGenStatus('Salvando 30.000 jogos no banco de dados em lotes...');
      
      // Write new pool
      const writeBatchSize = 500;
      let savedCount = 0;

      for (let i = 0; i < pool.length; i += writeBatchSize) {
        const chunk = pool.slice(i, i + writeBatchSize);
        const batch = writeBatch(db);

        chunk.forEach((gameNumbers, idx) => {
          const index = i + idx;
          const poolDocRef = doc(collection(db, 'pix_premiado_pool'));
          batch.set(poolDocRef, {
            numbers: gameNumbers,
            index: index,
            assigned: false,
            assignedUserId: null,
            assignedUserName: null,
            assignedAt: null,
            price: 1.00
          });
        });

        await batch.commit();
        savedCount += chunk.length;

        // Balance the remaining 60% progress
        const dbProgress = 45 + Math.round((savedCount / targetTotal) * 55);
        setPoolGenProgress(dbProgress);
        setPoolGenStatus(`Salvando no banco... ${savedCount.toLocaleString('pt-BR')} / 30.000 salvos`);
      }

      // Update metadata
      const metaRef = doc(db, 'pix_premiado_metadata', 'pool');
      await setDoc(metaRef, {
        totalGames: targetTotal,
        assignedGames: 0,
        isInitialized: true
      });

      showToast('Pool de 30.000 jogos válidos e exclusivos gerado com sucesso no banco de dados!', 'success');
    } catch (error: any) {
      showToast(error.message || 'Erro ao inicializar pool.', 'error');
    } finally {
      setIsGeneratingPool(false);
      setPoolGenStatus('');
      setPoolGenProgress(0);
    }
  };

  // Helper to fetch random free pool games
  const fetchRandomFreeGames = async (nToFetch: number): Promise<any[]> => {
    const randomIndex = Math.floor(Math.random() * 30000);
    
    let q = query(
      collection(db, 'pix_premiado_pool'),
      where('assigned', '==', false),
      where('index', '>=', randomIndex),
      limit(nToFetch)
    );
    let snap = await getDocs(q);
    let results = [...snap.docs];

    if (results.length < nToFetch) {
      const needed = nToFetch - results.length;
      q = query(
        collection(db, 'pix_premiado_pool'),
        where('assigned', '==', false),
        where('index', '<', randomIndex),
        limit(needed)
      );
      snap = await getDocs(q);
      results = [...results, ...snap.docs];
    }
    return results;
  };

  // NEW: Buy/Register ticket(s) randomly from the pre-generated pool (or generate random numbers for Loteria Federal)
  const handleBuyTicketsFromPool = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedUserId) {
      showToast('Por favor, selecione o apostador.', 'error');
      return;
    }

    const count = parseInt(ticketCountToBuy, 10);
    if (isNaN(count) || count <= 0 || count > 10000) {
      showToast('Quantidade inválida (digite um valor de 1 a 10.000).', 'error');
      return;
    }

    const selectedUser = users.find(u => u.id === selectedUserId);
    if (!selectedUser) return;

    const ticketPriceVal = 1.00; // Fixed price of R$ 1,00 as requested
    const totalCost = count * ticketPriceVal;

    if (selectedUser.balance < totalCost) {
      showToast(`O apostador não possui saldo suficiente (Saldo: R$ ${selectedUser.balance.toFixed(2)} / Custo: R$ ${totalCost.toFixed(2)}).`, 'error');
      return;
    }

    const activeDraw = draws.find(d => d.status === 'active');
    const isFederal = activeDraw && activeDraw.type === 'Loteria Federal';

    setIsSubmitting(true);
    try {
      if (isFederal) {
        // Generate distinctive random numbers for Loteria Federal [0001 a 9999]
        const chosenNumsArray = await fetchAvailableFederalNumbers(db, count);

        const writeBatchSize = 500;
        let savedCount = 0;

        for (let i = 0; i < chosenNumsArray.length; i += writeBatchSize) {
          const chunk = chosenNumsArray.slice(i, i + writeBatchSize);
          const chunkCost = chunk.length * ticketPriceVal;

          await runTransaction(db, async (transaction) => {
            const userRef = doc(db, 'users', selectedUserId);
            const userSnap = await transaction.get(userRef);

            if (!userSnap.exists()) throw new Error('Usuário não encontrado.');
            const currentBalance = userSnap.data().balance || 0;

            if (currentBalance < chunkCost) {
              throw new Error('Saldo insuficiente detectado na transação.');
            }

            // Deduct balance
            transaction.update(userRef, { balance: currentBalance - chunkCost });

            // Log transaction
            const transRef = doc(collection(db, 'transactions'));
            transaction.set(transRef, {
              userId: selectedUserId,
              type: 'manual_deduction',
              amount: chunkCost,
              status: 'confirmed',
              timestamp: serverTimestamp(),
              description: `Compra Lote Loteria Federal (${chunk.length} bilhetes - Pix Premiado)`
            });

            // Write public games
            chunk.forEach(num => {
              const gameRef = doc(collection(db, 'pix_premiado_games'));
              transaction.set(gameRef, {
                userId: selectedUserId,
                userName: selectedUser.name,
                numbers: [num],
                price: ticketPriceVal,
                createdAt: serverTimestamp()
              });
            });
          });

          savedCount += chunk.length;
        }

        setSelectedUserId('');
        setTicketCountToBuy('1');
        showToast(`${savedCount} bilhete(s) Loteria Federal comprado(s) e registrado(s) com sucesso por R$ 1,00 cada!`, 'success');
      } else {
        // MegaSena: Get random unassigned games from pool
        const poolDocs = await fetchRandomFreeGames(count);
        if (poolDocs.length < count) {
          throw new Error(`Não há jogos livres suficientes no pool! Disponíveis: ${poolDocs.length}, Solicitados: ${count}. Crie um novo pool de 30.000 dezenas.`);
        }

        // 2. Write in chunks of 500 using Firestore transactions
        const writeBatchSize = 500;
        let savedCount = 0;

        for (let i = 0; i < poolDocs.length; i += writeBatchSize) {
          const chunk = poolDocs.slice(i, i + writeBatchSize);
          const chunkCost = chunk.length * ticketPriceVal;

          await runTransaction(db, async (transaction) => {
            const userRef = doc(db, 'users', selectedUserId);
            const userSnap = await transaction.get(userRef);

            if (!userSnap.exists()) throw new Error('Usuário não encontrado.');
            const currentBalance = userSnap.data().balance || 0;

            if (currentBalance < chunkCost) {
              throw new Error('Saldo insuficiente detectado na transação.');
            }

            // Deduct balance
            transaction.update(userRef, { balance: currentBalance - chunkCost });

            // Log transaction
            const transRef = doc(collection(db, 'transactions'));
            transaction.set(transRef, {
              userId: selectedUserId,
              type: 'manual_deduction',
              amount: chunkCost,
              status: 'confirmed',
              timestamp: serverTimestamp(),
              description: `Compra Lote PIX PREMIADO (${chunk.length} bilhetes do Pool)`
            });

            // Write public games and assign in pool
            chunk.forEach(docSnap => {
              const gameNumbers = docSnap.data().numbers as number[];
              
              // Mark assigned in pool doc
              const poolDocRef = doc(db, 'pix_premiado_pool', docSnap.id);
              transaction.update(poolDocRef, {
                assigned: true,
                assignedUserId: selectedUserId,
                assignedUserName: selectedUser.name,
                assignedAt: serverTimestamp()
              });

              // Write game
              const gameRef = doc(collection(db, 'pix_premiado_games'));
              transaction.set(gameRef, {
                userId: selectedUserId,
                userName: selectedUser.name,
                numbers: gameNumbers,
                price: ticketPriceVal,
                createdAt: serverTimestamp()
              });
            });
          });

          savedCount += chunk.length;
        }

        // 3. Update metadata counts
        const metaRef = doc(db, 'pix_premiado_metadata', 'pool');
        await runTransaction(db, async (transaction) => {
          const metaSnap = await transaction.get(metaRef);
          const currentAssigned = metaSnap.exists() ? (metaSnap.data().assignedGames || 0) : 0;
          transaction.set(metaRef, {
            assignedGames: currentAssigned + savedCount
          }, { merge: true });
        });

        setSelectedUserId('');
        setTicketCountToBuy('1');
        showToast(`${savedCount} bilhete(s) do pool comprado(s) e registrado(s) com sucesso por R$ 1,00 cada!`, 'success');
      }
    } catch (err: any) {
      showToast(err.message || 'Erro ao comprar bilhetes.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };



  // Reset only Federal Tickets
  const handleResetFederalTickets = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'pix_premiado_games'));
      const snap = await getDocs(q);
      const federalDocs = snap.docs.filter(d => {
        const data = d.data();
        return Array.isArray(data.numbers) && data.numbers.length === 1;
      });

      if (federalDocs.length > 0) {
        const writeBatchSize = 500;
        for (let i = 0; i < federalDocs.length; i += writeBatchSize) {
          const batch = writeBatch(db);
          const chunk = federalDocs.slice(i, i + writeBatchSize);
          chunk.forEach(d => batch.delete(d.ref));
          await batch.commit();
        }
      }

      showToast('Pool de bilhetes da Loteria Federal resetado com sucesso! Todos os bilhetes foram liberados.', 'success');
    } catch (err) {
      showToast('Erro ao resetar bilhetes da Loteria Federal.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Reset only Mega-Sena Tickets
  const handleResetMegaTickets = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'pix_premiado_games'));
      const snap = await getDocs(q);
      const megaDocs = snap.docs.filter(d => {
        const data = d.data();
        return Array.isArray(data.numbers) && data.numbers.length === 6;
      });

      if (megaDocs.length > 0) {
        const writeBatchSize = 500;
        for (let i = 0; i < megaDocs.length; i += writeBatchSize) {
          const batch = writeBatch(db);
          const chunk = megaDocs.slice(i, i + writeBatchSize);
          chunk.forEach(d => batch.delete(d.ref));
          await batch.commit();
        }
      }

      // Set all assigned games in pool to false
      const qPoolAssigned = query(collection(db, 'pix_premiado_pool'), where('assigned', '==', true));
      const poolAssignedSnap = await getDocs(qPoolAssigned);
      if (poolAssignedSnap.size > 0) {
        const batchPool = writeBatch(db);
        poolAssignedSnap.docs.forEach(d => {
          batchPool.update(d.ref, {
            assigned: false,
            assignedUserId: null,
            assignedUserName: null,
            assignedAt: null
          });
        });
        await batchPool.commit();
      }

      // Reset metadata
      const metaRef = doc(db, 'pix_premiado_metadata', 'pool');
      await setDoc(metaRef, { assignedGames: 0 }, { merge: true });

      showToast('Todos os bilhetes da Mega-Sena foram devolvidos ao pool com sucesso!', 'success');
    } catch (err) {
      showToast('Erro ao resetar bilhetes da Mega-Sena.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Reset all raffle tickets (new draw) returning them to the pool
  const handleResetRaffle = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'pix_premiado_games'));
      const snap = await getDocs(q);
      const batch = writeBatch(db);
      snap.docs.forEach(d => {
        batch.delete(d.ref);
      });
      await batch.commit();

      // Set all assigned games in pool to false
      const qPoolAssigned = query(collection(db, 'pix_premiado_pool'), where('assigned', '==', true));
      const poolAssignedSnap = await getDocs(qPoolAssigned);
      if (poolAssignedSnap.size > 0) {
        const batchPool = writeBatch(db);
        poolAssignedSnap.docs.forEach(d => {
          batchPool.update(d.ref, {
            assigned: false,
            assignedUserId: null,
            assignedUserName: null,
            assignedAt: null
          });
        });
        await batchPool.commit();
      }

      // Reset metadata
      const metaRef = doc(db, 'pix_premiado_metadata', 'pool');
      await runTransaction(db, async (transaction) => {
        transaction.update(metaRef, {
          assignedGames: 0
        });
      });

      setDrawResults({ sena: [], quina: [], quadra: [], terno: [], hasChecked: false });
      setDrawnNumbers(['', '', '', '', '', '']);
      showToast('Todo o sorteio foi resetado! Os bilhetes comprados voltaram a ficar livres no pool.', 'success');
    } catch (err) {
      showToast('Erro ao resetar sorteio.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Execute a Simulation draw and find winners
  const handleCheckDraw = async () => {
    const activeDraw = draws.find(d => d.status === 'active');
    const isFederal = activeDraw && activeDraw.type === 'Loteria Federal';

    if (isFederal) {
      const p1 = (drawnNumbers[0] || '').trim();
      const p2 = (drawnNumbers[1] || '').trim();
      const p3 = (drawnNumbers[2] || '').trim();
      const p4 = (drawnNumbers[3] || '').trim();
      const p5 = (drawnNumbers[4] || '').trim();

      const prizesRaw = [p1, p2, p3, p4, p5];

      if (prizesRaw.some(p => !p || p.length < 4 || isNaN(Number(p)))) {
        showToast('Por favor, preencha os 5 prêmios da Loteria Federal (números de 4 a 6 dígitos cada).', 'error');
        return;
      }

      // Format prizes with leading zero padding up to at least 5 digits if shorter
      const prizes = prizesRaw.map(p => (p.length < 5 ? p.padStart(5, '0') : p));

      let winners: PixPremiadoGame[] = [];
      let reason = '';
      let targetMilhar = '';
      let winningTicketStr = '';

      // STEP 1: Check milhar (last 4 digits) from 1st to 5th prize
      for (let i = 0; i < 5; i++) {
        const milharStr = prizes[i].slice(-4); // last 4 digits
        const milharNum = parseInt(milharStr, 10);
        const matches = federalGames.filter(g => Array.isArray(g.numbers) && g.numbers[0] === milharNum);

        if (matches.length > 0) {
          winners = matches;
          reason = `Ganhador encontrado no ${i + 1}º PRÊMIO da Loteria Federal (Milhar: ${milharStr})!`;
          targetMilhar = milharStr;
          winningTicketStr = milharStr;
          break;
        }
      }

      // STEP 2: Check frontal milhar (first 4 digits) from 1st to 5th prize
      if (winners.length === 0) {
        for (let i = 0; i < 5; i++) {
          const milharStr = prizes[i].slice(0, 4); // first 4 digits
          const milharNum = parseInt(milharStr, 10);
          const matches = federalGames.filter(g => Array.isArray(g.numbers) && g.numbers[0] === milharNum);

          if (matches.length > 0) {
            winners = matches;
            reason = `Ganhador encontrado pela Milhar Frontal do ${i + 1}º PRÊMIO da Loteria Federal (${milharStr})!`;
            targetMilhar = milharStr;
            winningTicketStr = milharStr;
            break;
          }
        }
      }

      // STEP 3: Closest number to 1st Prize Milhar + Tie breaker by earliest purchase time
      if (winners.length === 0) {
        const initialTargetStr = prizes[0].slice(-4); // last 4 digits of 1st Prize
        const initialTargetNum = parseInt(initialTargetStr, 10);
        targetMilhar = initialTargetStr;

        if (federalGames.length === 0) {
          reason = `Nenhum bilhete da Loteria Federal foi vendido para este sorteio. (Alvo 1º Prêmio: ${initialTargetStr}).`;
        } else {
          // Find minimum difference
          let minDiff = Infinity;
          federalGames.forEach(g => {
            if (Array.isArray(g.numbers)) {
              const diff = Math.abs(g.numbers[0] - initialTargetNum);
              if (diff < minDiff) {
                minDiff = diff;
              }
            }
          });

          // Candidates with minDiff
          const candidates = federalGames.filter(g => Array.isArray(g.numbers) && Math.abs(g.numbers[0] - initialTargetNum) === minDiff);

          if (candidates.length === 1) {
            winners = [candidates[0]];
            winningTicketStr = String(candidates[0].numbers[0]).padStart(4, '0');
            reason = `Ganhador encontrado por APROXIMAÇÃO NUMÉRICA! (Alvo 1º Prêmio: ${initialTargetStr}, Bilhete Vencedor: ${winningTicketStr}, Distância: ${minDiff}).`;
          } else if (candidates.length > 1) {
            // Sort by earliest purchase time
            const sorted = [...candidates].sort((a, b) => getGameTimestamp(a) - getGameTimestamp(b));
            winners = [sorted[0]];
            winningTicketStr = String(sorted[0].numbers[0]).padStart(4, '0');
            reason = `Ganhador encontrado por APROXIMAÇÃO com DESEMPATE POR HORÁRIO DE COMPRA! (Alvo: ${initialTargetStr}, Bilhete Vencedor: ${winningTicketStr}, Distância: ${minDiff}, Comprado Primeiro).`;
          }
        }
      }

      setDrawResults({
        sena: winners,
        quina: [],
        quadra: [],
        terno: [],
        hasChecked: true,
        isFederal: true,
        federalReason: reason,
        targetMilhar,
        winningTicketStr
      });

      if (activeDraw) {
        try {
          await setDoc(doc(db, 'pix_premiado_draws', activeDraw.id), {
            drawnNumbers: prizes,
            winningReason: reason,
            winnerName: winners.length > 0 ? winners[0].userName : 'Sem Ganhador',
            winningTicket: winningTicketStr || null
          }, { merge: true });
          showToast('Apuração da Loteria Federal concluída e resultado salvo!', 'success');
        } catch (err) {
          showToast('Apuração concluída, mas erro ao salvar resultado no banco.', 'warning');
        }
      } else {
        showToast('Apuração da Loteria Federal concluída!', 'success');
      }
      return;
    }

    const parsedDraw = drawnNumbers.map(n => parseInt(n, 10));
    if (parsedDraw.some(isNaN)) {
      showToast('Por favor, preencha todos os 6 números do sorteio.', 'error');
      return;
    }
    if (parsedDraw.some(n => n < 1 || n > 60)) {
      showToast('Os números sorteados devem estar entre 1 e 60.', 'error');
      return;
    }
    const uniqueCheck = new Set(parsedDraw);
    if (uniqueCheck.size !== 6) {
      showToast('Os números sorteados devem ser distintos.', 'error');
      return;
    }

    const sena: PixPremiadoGame[] = [];
    const quina: PixPremiadoGame[] = [];
    const quadra: PixPremiadoGame[] = [];
    const terno: PixPremiadoGame[] = [];

    games.forEach(g => {
      let hits = 0;
      g.numbers.forEach(num => {
        if (parsedDraw.includes(num)) {
          hits++;
        }
      });

      if (hits === 6) sena.push(g);
      else if (hits === 5) quina.push(g);
      else if (hits === 4) quadra.push(g);
      else if (hits === 3) terno.push(g);
    });

    setDrawResults({
      sena,
      quina,
      quadra,
      terno,
      hasChecked: true,
      isFederal: false
    });
    
    if (activeDraw) {
      try {
        await setDoc(doc(db, 'pix_premiado_draws', activeDraw.id), {
          drawnNumbers: drawnNumbers
        }, { merge: true });
        showToast('Apuração concluída e resultado salvo no sorteio ativo!', 'success');
      } catch (err) {
        showToast('Apuração concluída, mas erro ao salvar resultado no banco.', 'warning');
      }
    } else {
      showToast('Apuração concluída! (Nenhum sorteio ativo para salvar o resultado).', 'success');
    }
  };

  // Random draw numbers
  const handleAutoDraw = () => {
    const activeDraw = draws.find(d => d.status === 'active');
    const isFederal = activeDraw && activeDraw.type === 'Loteria Federal';

    if (isFederal) {
      const p1 = String(Math.floor(10000 + Math.random() * 90000));
      const p2 = String(Math.floor(10000 + Math.random() * 90000));
      const p3 = String(Math.floor(10000 + Math.random() * 90000));
      const p4 = String(Math.floor(10000 + Math.random() * 90000));
      const p5 = String(Math.floor(10000 + Math.random() * 90000));
      setDrawnNumbers([p1, p2, p3, p4, p5, '']);
      showToast('Prêmios da Loteria Federal gerados aleatoriamente!', 'success');
    } else {
      const drawn = gerarJogo();
      setDrawnNumbers(drawn.map(String));
      showToast('Números sorteados aleatoriamente!', 'success');
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-fade-in relative pb-16">
      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[100] shadow-xl animate-fade-in">
          <div className={`p-2 rounded-xl ${toast.type === 'success' ? 'bg-emerald-50' : toast.type === 'warning' ? 'bg-orange-55' : 'bg-red-50'}`}>
            <div className={`flex items-start gap-4 p-4 border rounded-lg bg-white ${toast.type === 'success' ? 'border-emerald-200' : toast.type === 'warning' ? 'border-orange-200' : 'border-red-200'}`}>
              <div className={`p-1.5 rounded-full ${toast.type === 'success' ? 'bg-emerald-100' : toast.type === 'warning' ? 'bg-orange-100' : 'bg-red-100'}`}>
                {toast.type === 'success' ? <Check className="w-5 h-5 text-emerald-600" /> : <AlertCircle className="w-5 h-5 text-red-600" />}
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                  {toast.type === 'success' ? 'Sucesso' : toast.type === 'warning' ? 'Alerta' : 'Erro'}
                </p>
                <p className="text-sm font-bold text-slate-800 leading-tight">{toast.message}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          {!isSubcomponent && (
            <Link to="/admin" className="p-2.5 rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </Link>
          )}
          <div>
            <h1 className="text-3xl font-display font-bold text-slate-800 tracking-tight flex items-center gap-2">
              <Sparkles className="w-8 h-8 text-indigo-600" />
              PIX PREMIADO
            </h1>
            <p className="text-slate-500 text-sm font-medium">Gestão inteligente do sorteio de quadras exclusivas.</p>
          </div>
        </div>

        <button 
          onClick={() => setShowResetConfirm(true)}
          className="bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 text-xs font-bold px-4 py-2.5 rounded-xl transition-all flex items-center gap-2 cursor-pointer shadow-sm self-start sm:self-auto"
        >
          <RefreshCw className="w-4 h-4" /> Resetar Todo o Sorteio
        </button>
      </div>

      {/* Top Tab Navigation: Simulator vs Management */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div className="flex items-center gap-2 p-1.5 bg-slate-100/90 rounded-2xl border border-slate-200/80">
          <button
            type="button"
            onClick={() => handleTabChange('simulator')}
            className={`py-2.5 px-4 sm:px-6 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'simulator'
                ? 'bg-white text-slate-900 shadow-sm border border-slate-200/80'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/40'
            }`}
          >
            <Trophy className="w-4 h-4 text-amber-500" />
            <span>Simulador & Conferência da Federal</span>
            <span className="bg-amber-100 text-amber-800 text-[10px] font-black px-1.5 py-0.5 rounded-md uppercase tracking-wider">
              Oficial
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('management')}
            className={`py-2.5 px-4 sm:px-6 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'management'
                ? 'bg-white text-slate-900 shadow-sm border border-slate-200/80'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/40'
            }`}
          >
            <CalendarDays className="w-4 h-4 text-indigo-600" />
            <span>Gestão de Sorteios & Bilhetes</span>
          </button>
        </div>
      </div>

      {activeTab === 'simulator' ? (
        <FederalDrawSimulator 
          games={games} 
          users={users} 
          activeDraw={draws.find(d => d.status === 'active')} 
          db={db} 
          onShowToast={showToast} 
        />
      ) : (
        <>
      {/* Gerenciamento de Sorteios */}
      <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-display font-bold text-slate-800 flex items-center gap-2">
            <CalendarDays className="w-6 h-6 text-indigo-600" />
            Cadastro de Sorteios
          </h2>
          <button
            onClick={() => {
              setDrawForm({ date: '', time: '', type: 'MegaSena', status: 'active' });
              setEditingDrawId(null);
              setShowDrawForm(!showDrawForm);
            }}
            className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold px-4 py-2.5 rounded-xl transition-colors flex items-center gap-2 text-sm"
          >
            {showDrawForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {showDrawForm ? 'Cancelar' : 'Novo Sorteio'}
          </button>
        </div>

        {showDrawForm && (
          <form onSubmit={handleSaveDraw} className="mb-8 p-6 bg-slate-50 border border-slate-100 rounded-2xl">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 block">Data</label>
                <input
                  type="date"
                  value={drawForm.date}
                  onChange={e => setDrawForm({...drawForm, date: e.target.value})}
                  className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/25 outline-none text-slate-800 text-sm font-semibold"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 block">Horário</label>
                <input
                  type="time"
                  value={drawForm.time}
                  onChange={e => setDrawForm({...drawForm, time: e.target.value})}
                  className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/25 outline-none text-slate-800 text-sm font-semibold"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 block">Tipo</label>
                <select
                  value={drawForm.type}
                  onChange={e => setDrawForm({...drawForm, type: e.target.value as any})}
                  className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/25 outline-none text-slate-800 text-sm font-semibold"
                >
                  <option value="MegaSena">Mega-Sena</option>
                  <option value="Loteria Federal">Loteria Federal</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 block">Status</label>
                <select
                  value={drawForm.status}
                  onChange={e => setDrawForm({...drawForm, status: e.target.value as any})}
                  className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/25 outline-none text-slate-800 text-sm font-semibold"
                >
                  <option value="active">Ativo</option>
                  <option value="finished">Finalizado</option>
                </select>
              </div>
            </div>
            
            <div className="mb-4">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 block">Observações (Valores de Prêmio, Regras Extras, etc.)</label>
              <textarea
                placeholder="Insira detalhes adicionais do prêmio, regras específicas, observações de acumulação ou restrições."
                value={drawForm.observations}
                onChange={e => setDrawForm({...drawForm, observations: e.target.value})}
                className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/25 outline-none text-slate-800 text-sm font-semibold min-h-[80px]"
              />
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-6 rounded-xl transition-all shadow-md shadow-indigo-600/15 text-sm uppercase tracking-wider"
              >
                Salvar Sorteio
              </button>
            </div>
          </form>
        )}

        {draws.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Data / Hora</th>
                  <th className="py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Tipo</th>
                  <th className="py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Status</th>
                  <th className="py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {draws.map(draw => (
                  <tr key={draw.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                    <td className="py-3">
                      <span className="font-bold text-slate-800 text-sm">
                        {draw.date.split('-').reverse().join('/')} às {draw.time}
                      </span>
                      {draw.observations && (
                        <div className="text-[10px] text-indigo-600 font-medium max-w-xs mt-1 italic break-words">
                          Obs: {draw.observations}
                        </div>
                      )}
                    </td>
                    <td className="py-3">
                      <span className="font-semibold text-slate-600 text-sm">{draw.type}</span>
                    </td>
                    <td className="py-3">
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-lg ${draw.status === 'active' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-600 border border-slate-200'}`}>
                        {draw.status === 'active' ? 'ATIVO' : 'FINALIZADO'}
                      </span>
                    </td>
                    <td className="py-3 text-right">
                      <button
                        onClick={() => handleEditDraw(draw)}
                        className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors inline-block"
                        title="Editar"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-slate-500 font-medium text-center py-6">Nenhum sorteio cadastrado.</p>
        )}
      </div>


      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 flex items-center gap-4">
          <div className="bg-indigo-50 p-4 rounded-2xl text-indigo-600">
            <Trophy className="w-8 h-8" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Total de Jogos</span>
            <h3 className="text-2xl font-bold font-mono text-slate-800">{games.length} Bilhetes</h3>
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 flex items-center gap-4">
          <div className="bg-emerald-50 p-4 rounded-2xl text-emerald-600">
            <Coins className="w-8 h-8" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Acumulado do Caixa</span>
            <h3 className="text-2xl font-bold font-mono text-emerald-700">
              R$ {games.reduce((sum, g) => sum + g.price, 0).toFixed(2)}
            </h3>
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 flex items-center gap-4">
          <div className="bg-amber-50 p-4 rounded-2xl text-amber-600">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Quadras Usadas</span>
            <h3 className="text-2xl font-bold font-mono text-slate-800">{usedQuads.size} Quadras</h3>
          </div>
        </div>
      </div>

      {/* SEÇÃO: GERENCIADOR DO POOL - ORGANIZADO EM DOIS SISTEMAS DISTINTOS */}
      <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200 relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-xl font-display font-bold text-slate-800 flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-indigo-600" />
              Gerenciador dos POOLs de Sorteios
            </h2>
            <p className="text-xs text-slate-500 font-medium mt-1">
              Sistemas de gerenciamento de bilhetes e dezenas independentes para resultados oficiais externos.
            </p>
          </div>

          {/* Sub-tabs for switching between Mega-Sena and Federal Pool Managers */}
          <div className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200/80 self-start md:self-auto">
            <button
              type="button"
              onClick={() => setSelectedPoolType('megasena')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                selectedPoolType === 'megasena'
                  ? 'bg-white text-indigo-700 shadow-sm border border-slate-200/50'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Sparkles className="w-4 h-4 text-indigo-600" />
              Pool Mega-Sena (30k)
            </button>
            <button
              type="button"
              onClick={() => setSelectedPoolType('federal')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                selectedPoolType === 'federal'
                  ? 'bg-white text-amber-700 shadow-sm border border-slate-200/50'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Ticket className="w-4 h-4 text-amber-600" />
              Pool Loteria Federal (0001-9999)
            </button>
          </div>
        </div>

        {/* POOL MEGA-SENA MANAGER */}
        {selectedPoolType === 'megasena' && (
          <div className="space-y-6 animate-fade-in">
            <div className="p-4 bg-indigo-50/60 border border-indigo-100 rounded-2xl flex items-start gap-3">
              <Sparkles className="w-5 h-5 text-indigo-600 mt-0.5 shrink-0" />
              <div>
                <h4 className="text-sm font-bold text-indigo-950">Sistema Mega-Sena (6 Dezenas • Resultado Externo Caixa)</h4>
                <p className="text-xs text-indigo-800/80 mt-1 leading-relaxed">
                  O algoritmo gera um pool de 30.000 combinações exclusivas e únicas de quadras no banco de dados. Os resultados são conferidos contra os 6 números sorteados oficialmente na Mega-Sena da Caixa (Sena, Quina, Quadra e Terno).
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Status do Pool</span>
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${poolMetadata.isInitialized ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`}></span>
                  <span className="text-sm font-bold text-slate-800">
                    {poolMetadata.isInitialized ? 'Inicializado e Ativo' : 'Não Inicializado'}
                  </span>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Bilhetes Livres no Pool</span>
                <span className="text-lg font-bold font-mono text-indigo-600">
                  {poolMetadata.isInitialized 
                    ? (30000 - megaGames.length).toLocaleString('pt-BR') 
                    : '0'} / 30.000
                </span>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Bilhetes Vendidos</span>
                <span className="text-lg font-bold font-mono text-emerald-700">
                  {megaGames.length.toLocaleString('pt-BR')} Bilhetes
                </span>
              </div>
            </div>

            {isGeneratingPool && (
              <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-5 animate-pulse">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-bold text-indigo-800 uppercase tracking-wider flex items-center gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin text-indigo-600" />
                    {poolGenStatus}
                  </span>
                  <span className="text-xs font-mono font-bold text-indigo-900">
                    {poolGenProgress}%
                  </span>
                </div>
                <div className="w-full bg-indigo-100 rounded-full h-3 overflow-hidden">
                  <div 
                    className="bg-indigo-600 h-full rounded-full transition-all duration-300"
                    style={{ width: `${poolGenProgress}%` }}
                  ></div>
                </div>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowPoolConfirm(true)}
                disabled={isGeneratingPool}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl py-3 px-4 transition-all shadow-md shadow-indigo-600/15 text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className="w-4 h-4" />
                Gerar / Regerar Pool Matemático (30.000 Jogos)
              </button>

              <button
                type="button"
                onClick={() => setShowResetMegaConfirm(true)}
                disabled={isGeneratingPool || megaGames.length === 0}
                className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold rounded-xl py-3 px-4 transition-all text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                Resetar Apenas Bilhetes Mega-Sena
              </button>
            </div>
          </div>
        )}

        {/* POOL LOTERIA FEDERAL MANAGER */}
        {selectedPoolType === 'federal' && (
          <div className="space-y-6 animate-fade-in">
            <div className="p-4 bg-amber-50/60 border border-amber-100 rounded-2xl flex items-start gap-3">
              <Ticket className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
              <div>
                <h4 className="text-sm font-bold text-amber-950">Sistema Loteria Federal (Bilhetes de 0001 a 9999 • Resultado Externo Caixa)</h4>
                <p className="text-xs text-amber-800/80 mt-1 leading-relaxed">
                  Para a Loteria Federal, o pool engloba bilhetes de 4 dígitos do número <strong>0001 ao 9999</strong> (total de 9.999 bilhetes numerados e únicos). O ganhador do prêmio principal é apurado diretamente pelo bilhete do 1º prêmio oficial.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Capacidade Total Pool</span>
                <span className="text-lg font-bold font-mono text-slate-800">
                  9.999 Bilhetes (0001 - 9999)
                </span>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Bilhetes Livres / Disponíveis</span>
                <span className="text-lg font-bold font-mono text-emerald-600">
                  {(9999 - federalGames.length).toLocaleString('pt-BR')} Livres
                </span>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Bilhetes Vendidos</span>
                <span className="text-lg font-bold font-mono text-amber-700">
                  {federalGames.length.toLocaleString('pt-BR')} Vendidos
                </span>
              </div>
            </div>

            {/* Bilhete Consultor / Search Tool */}
            <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200/80 space-y-3">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                Consultar Status de Bilhete da Loteria Federal (0001 a 9999)
              </label>
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  maxLength={4}
                  value={federalSearch}
                  onChange={(e) => setFederalSearch(e.target.value)}
                  placeholder="Digite o bilhete ex: 0523..."
                  className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl font-mono text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-amber-500/25"
                />
              </div>

              {federalSearch && (
                <div className="mt-2">
                  {!isNaN(parsedFederalSearch) && parsedFederalSearch >= 1 && parsedFederalSearch <= 9999 ? (
                    searchedFederalGame ? (
                      <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="px-2.5 py-1 bg-red-100 text-red-800 font-mono font-bold text-xs rounded-lg border border-red-200">
                            Nº {String(parsedFederalSearch).padStart(4, '0')}
                          </span>
                          <div>
                            <p className="text-xs font-bold text-red-900">VENDIDO / INDISPONÍVEL</p>
                            <p className="text-[11px] text-red-700 font-medium">Apostador: <strong>{searchedFederalGame.userName}</strong></p>
                          </div>
                        </div>
                        <span className="text-xs font-mono font-bold text-red-800">R$ {searchedFederalGame.price.toFixed(2)}</span>
                      </div>
                    ) : (
                      <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3">
                        <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 font-mono font-bold text-xs rounded-lg border border-emerald-200">
                          Nº {String(parsedFederalSearch).padStart(4, '0')}
                        </span>
                        <div>
                          <p className="text-xs font-bold text-emerald-900">LIVRE / DISPONÍVEL NO POOL</p>
                          <p className="text-[11px] text-emerald-700 font-medium">Pronto para ser sorteado ou comprado por qualquer apostador.</p>
                        </div>
                      </div>
                    )
                  ) : (
                    <p className="text-xs text-slate-400 italic">Por favor, informe um número válido entre 0001 e 9999.</p>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowGuilhermeModal(true)}
                className="bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-bold rounded-xl py-3 px-5 transition-all text-xs uppercase tracking-wider flex items-center gap-2 cursor-pointer shadow-xs"
                title="Inserir 100 bilhetes com maior probabilidade por proximidade para Guilherme Pereira"
              >
                <UserCheck className="w-4 h-4 text-indigo-200" />
                Inserir 100 Bilhetes de Maior Chance (Guilherme Pereira)
              </button>

              <button
                type="button"
                onClick={() => setShowResetFederalConfirm(true)}
                disabled={federalGames.length === 0}
                className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold rounded-xl py-3 px-5 transition-all text-xs uppercase tracking-wider flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                Resetar Apenas Bilhetes Loteria Federal
              </button>
            </div>
          </div>
        )}
      </div>

        {/* Right: Simulate Sorteio */}
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200 flex flex-col justify-between">
          <div>
            <h2 className="text-xl font-display font-bold text-slate-800 mb-6 flex items-center gap-2">
              <Trophy className="w-5 h-5 text-amber-500" />
              Informar Resultado (Sorteio Externo)
            </h2>

            <div className="space-y-6">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                    {draws.find(d => d.status === 'active')?.type === 'Loteria Federal' 
                      ? 'Resultado dos 5 Prêmios da Loteria Federal' 
                      : 'Inserir Números Sorteados'}
                  </label>
                  <button 
                    type="button"
                    onClick={handleAutoDraw}
                    className="text-xs font-bold text-amber-600 hover:text-amber-800 flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <Dices className="w-3.5 h-3.5" /> {draws.find(d => d.status === 'active')?.type === 'Loteria Federal' ? 'Sortear Prêmios (Teste)' : 'Sortear Dezenas'}
                  </button>
                </div>

                {draws.find(d => d.status === 'active')?.type === 'Loteria Federal' ? (
                  <div className="space-y-2.5 bg-amber-50/30 p-3.5 rounded-2xl border border-amber-200/80">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                        Informe o resultado de cada prêmio (5 a 6 dígitos):
                      </p>
                      <button
                        type="button"
                        onClick={() => handleTabChange('simulator')}
                        className="text-[10px] font-bold text-amber-700 bg-amber-100 hover:bg-amber-200 px-2 py-1 rounded-md transition-colors cursor-pointer flex items-center gap-1"
                      >
                        <Trophy className="w-3 h-3 text-amber-600" />
                        Abrir Simulador Completo
                      </button>
                    </div>
                    {[
                      { label: '1º PRÊMIO', index: 0, placeholder: 'Ex: 008932' },
                      { label: '2º PRÊMIO', index: 1, placeholder: 'Ex: 049314' },
                      { label: '3º PRÊMIO', index: 2, placeholder: 'Ex: 017181' },
                      { label: '4º PRÊMIO', index: 3, placeholder: 'Ex: 010373' },
                      { label: '5º PRÊMIO', index: 4, placeholder: 'Ex: 047859' },
                    ].map((prizeItem) => (
                      <div key={prizeItem.index} className="flex items-center gap-2.5 bg-white p-2 rounded-xl border border-amber-200/80 shadow-xs">
                        <span className="text-[11px] font-extrabold text-amber-900 w-20 shrink-0 uppercase font-mono">
                          {prizeItem.label}
                        </span>
                        <input 
                          type="text"
                          maxLength={6}
                          value={drawnNumbers[prizeItem.index] || ''}
                          onChange={(e) => {
                            const cleaned = e.target.value.replace(/[^0-9]/g, '');
                            const copy = [...drawnNumbers];
                            copy[prizeItem.index] = cleaned;
                            setDrawnNumbers(copy);
                          }}
                          placeholder={prizeItem.placeholder}
                          className="w-full text-center py-1.5 bg-amber-50/30 border border-amber-200 rounded-lg font-mono font-bold text-base focus:ring-2 focus:ring-amber-500/25 outline-none text-slate-900 tracking-widest placeholder:text-amber-300"
                        />
                        {drawnNumbers[prizeItem.index]?.length >= 4 && (
                          <span className="text-[10px] font-extrabold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded border border-emerald-200 shrink-0 font-mono">
                            Milhar: {drawnNumbers[prizeItem.index].slice(-4)}
                          </span>
                        )}
                      </div>
                    ))}
                    <p className="text-[10px] text-slate-400 text-center font-medium pt-1">
                      A apuração testará a milhar do 1º ao 5º prêmio, a milhar frontal, e o bilhete mais próximo (com desempate por horário).
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-6 gap-2">
                    {drawnNumbers.map((num, idx) => (
                      <input 
                        key={idx}
                        type="text"
                        maxLength={2}
                        value={num}
                        onChange={(e) => {
                          const cleaned = e.target.value.replace(/[^0-9]/g, '');
                          const copy = [...drawnNumbers];
                          copy[idx] = cleaned;
                          setDrawnNumbers(copy);
                        }}
                        placeholder={`S${idx+1}`}
                        className="w-full text-center py-3 bg-amber-50/50 border border-amber-200 rounded-xl font-mono font-bold text-lg focus:ring-2 focus:ring-amber-500/25 outline-none text-amber-800"
                      />
                    ))}
                  </div>
                )}
              </div>

              <button 
                type="button"
                onClick={handleCheckDraw}
                className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl py-3.5 transition-all shadow-md shadow-amber-500/10 cursor-pointer text-sm uppercase tracking-wider flex items-center justify-center gap-2"
              >
                <Trophy className="w-4 h-4" /> Apurar Ganhadores
              </button>

              {drawResults.hasChecked && (
                <div className="mt-6 border-t border-slate-100 pt-6 space-y-4">
                  <h4 className="font-bold text-slate-800 text-sm uppercase tracking-wider mb-2">Resultado da Apuração:</h4>
                  
                  {drawResults.isFederal ? (
                    <div className="space-y-3">
                      <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 space-y-2">
                        <div className="flex items-center gap-2">
                          <Trophy className="w-5 h-5 text-amber-600 shrink-0" />
                          <span className="text-xs font-black text-amber-950 uppercase tracking-wider">
                            {drawResults.sena.length > 0 ? 'BILHETE CONTEMPLADO ENCONTRADO!' : 'APURAÇÃO CONCLUÍDA'}
                          </span>
                        </div>
                        <p className="text-xs font-semibold text-amber-900 leading-relaxed">
                          {drawResults.federalReason}
                        </p>
                      </div>

                      {drawResults.sena.length > 0 ? (
                        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 space-y-2">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">Apostador Vencedor:</p>
                          {drawResults.sena.map(g => (
                            <div key={g.id} className="flex justify-between items-center bg-white p-3 rounded-xl border border-emerald-200 shadow-xs">
                              <div>
                                <p className="text-xs font-bold text-slate-900">★ {g.userName}</p>
                                <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                                  Bilhete do Ganhador: <strong className="font-mono text-emerald-700 text-sm font-black">Nº {String(g.numbers[0]).padStart(4, '0')}</strong>
                                </p>
                              </div>
                              <span className="bg-emerald-600 text-white font-black text-xs px-3 py-1.5 rounded-xl uppercase tracking-wider shadow-xs">
                                Contemplado
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-center text-slate-500 text-xs font-medium">
                          Nenhum bilhete vendido cadastrado na plataforma foi contemplado.
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      <div className="space-y-3">
                        {/* Sena */}
                        <div className="flex items-center justify-between p-3 rounded-xl bg-amber-50 border border-amber-100">
                          <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse"></span>
                            <span className="text-xs font-extrabold text-amber-800">SENA (6 acertos)</span>
                          </div>
                          <span className="font-mono font-bold text-amber-900 text-sm">{drawResults.sena.length} bilhetes</span>
                        </div>

                        {/* Quina */}
                        <div className="flex items-center justify-between p-3 rounded-xl bg-indigo-50 border border-indigo-100">
                          <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full bg-indigo-500"></span>
                            <span className="text-xs font-extrabold text-indigo-800">QUINA (5 acertos)</span>
                          </div>
                          <span className="font-mono font-bold text-indigo-900 text-sm">{drawResults.quina.length} bilhetes</span>
                        </div>

                        {/* Quadra */}
                        <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-50 border border-emerald-100">
                          <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                            <span className="text-xs font-extrabold text-emerald-800">QUADRA (4 acertos)</span>
                          </div>
                          <span className="font-mono font-bold text-emerald-900 text-sm">{drawResults.quadra.length} bilhetes</span>
                        </div>

                        {/* Terno */}
                        <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
                          <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full bg-slate-500"></span>
                            <span className="text-xs font-extrabold text-slate-700">TERNO (3 acertos)</span>
                          </div>
                          <span className="font-mono font-bold text-slate-800 text-sm">{drawResults.terno.length} bilhetes</span>
                        </div>
                      </div>

                      {/* Winner Lists details if any */}
                      {[...drawResults.sena, ...drawResults.quina, ...drawResults.quadra].length > 0 ? (
                        <div className="mt-4 bg-slate-50 rounded-xl p-4 border border-slate-200 max-h-[180px] overflow-y-auto space-y-2">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-450">Lista de Ganhadores:</p>
                          {drawResults.sena.map(g => (
                            <div key={g.id} className="text-xs text-amber-800 font-bold">
                              ★ {g.userName} - SENA: [{g.numbers.join(', ')}]
                            </div>
                          ))}
                          {drawResults.quina.map(g => (
                            <div key={g.id} className="text-xs text-indigo-800 font-semibold">
                              ✦ {g.userName} - QUINA: [{g.numbers.join(', ')}]
                            </div>
                          ))}
                          {drawResults.quadra.map(g => (
                            <div key={g.id} className="text-xs text-emerald-800 font-semibold">
                              ✔ {g.userName} - QUADRA: [{g.numbers.join(', ')}]
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-400 font-medium text-center py-2">Nenhum bilhete premiado de Quadra, Quina ou Sena nesta simulação.</p>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

      {/* SEÇÃO: COMPRAR / REGISTRAR BILHETES DO POOL */}
      <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-[50px] pointer-events-none"></div>
        
        <h2 className="text-xl font-display font-bold text-slate-800 mb-2 flex items-center gap-2">
          <Coins className="w-6 h-6 text-emerald-600" />
          Venda de Bilhetes do Pool (Preço Fixo: R$ 1,00)
        </h2>
        <p className="text-xs text-slate-500 mb-6 font-medium max-w-2xl leading-relaxed">
          Selecione o apostador e digite a quantidade de bilhetes para sortear e registrar a partir do pool de dezenas exclusivas. O custo de R$ 1,00 por bilhete será debitado do saldo do usuário instantaneamente.
        </p>

        <form onSubmit={handleBuyTicketsFromPool} className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end mb-6">
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 block">Dono do(s) Bilhete(s)</label>
            <select 
              value={selectedUserId} 
              onChange={(e) => setSelectedUserId(e.target.value)}
              disabled={isSubmitting}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/25 outline-none text-slate-800 text-sm font-semibold disabled:opacity-50"
            >
              <option value="">Selecione o apostador...</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>
                  {u.name} (Saldo: R$ {u.balance?.toFixed(2) || '0.00'})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 block">Quantidade de Bilhetes</label>
            <div className="relative">
              <input 
                type="number"
                min="1"
                max="10000"
                value={ticketCountToBuy}
                onChange={(e) => setTicketCountToBuy(e.target.value)}
                disabled={isSubmitting}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/25 text-slate-800 font-mono font-bold text-sm disabled:opacity-50"
                placeholder="1"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                {['1', '10', '50', '100', '1000'].map(val => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setTicketCountToBuy(val)}
                    disabled={isSubmitting}
                    className="text-[9px] font-extrabold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-2 py-1 rounded-md border border-indigo-200 transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {val}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={isSubmitting || !poolMetadata.isInitialized}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl py-3.5 transition-all shadow-md shadow-emerald-600/15 cursor-pointer disabled:opacity-50 text-sm uppercase tracking-wider flex items-center justify-center gap-2"
            >
              {isSubmitting ? 'Processando Compra...' : 'Comprar e Registrar do Pool'}
            </button>
          </div>
        </form>

        {/* Quick batch option for Guilherme Pereira */}
        <div className="mt-4 pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 bg-indigo-50/50 p-4 rounded-2xl border border-indigo-100">
          <div className="flex items-center gap-2.5">
            <span className="p-2 bg-indigo-100 text-indigo-700 rounded-xl">
              <UserCheck className="w-4 h-4" />
            </span>
            <div>
              <p className="text-xs font-bold text-slate-800">
                Atribuição de Lote Estratégico (Guilherme Pereira)
              </p>
              <p className="text-[11px] text-slate-500">
                Inserir os 100 números calculados nos maiores intervalos de proximidade da Loteria Federal como vendidos.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowGuilhermeModal(true)}
            className="w-full sm:w-auto px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-bold text-xs rounded-xl transition shadow-xs flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span>Inserir 100 Bilhetes</span>
          </button>
        </div>
      </div>

      {/* List of Registered Tickets */}
      <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200">
        <h2 className="text-xl font-display font-bold text-slate-800 mb-6 uppercase tracking-wider flex items-center justify-between">
          <span>Bilhetes Registrados ({games.length})</span>
        </h2>

        {games.length === 0 ? (
          <div className="text-center py-16 text-slate-400 font-medium">
            Nenhum bilhete registrado para este sorteio ainda.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Apostador</th>
                  <th className="py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-center">Dezenas</th>
                  <th className="py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Valor Pago</th>
                  <th className="py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {games.slice(0, visibleTicketsLimit).map(g => (
                  <tr key={g.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors group">
                    <td className="py-4">
                      <p className="font-bold text-slate-800 text-sm leading-tight">{g.userName}</p>
                      <p className="text-[10px] font-semibold text-slate-400 mt-1">
                        {g.createdAt ? (g.createdAt.toDate ? g.createdAt.toDate().toLocaleString('pt-BR') : new Date(g.createdAt).toLocaleString('pt-BR')) : '-'}
                      </p>
                    </td>
                    <td className="py-4">
                      {g.numbers.length === 1 ? (
                        <div className="flex justify-center">
                          <span className="px-3.5 py-1.5 bg-indigo-50 border border-indigo-200 text-indigo-700 font-mono font-black text-sm rounded-lg shadow-sm">
                            Nº {String(g.numbers[0]).padStart(4, '0')}
                          </span>
                        </div>
                      ) : (
                        <div className="flex justify-center gap-1.5">
                          {g.numbers.map((n, i) => (
                            <span 
                              key={i} 
                              className="w-8 h-8 rounded-full bg-slate-100 text-slate-700 font-mono font-bold text-xs flex items-center justify-center border border-slate-200"
                            >
                              {String(n).padStart(2, '0')}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="py-4 font-mono text-xs font-bold text-emerald-700">
                      R$ {g.price.toFixed(2)}
                    </td>
                    <td className="py-4 text-right">
                      <button
                        onClick={() => setTicketToRefund(g)}
                        className="p-2 text-rose-600 hover:bg-rose-50 rounded-xl transition-colors inline-flex items-center justify-center cursor-pointer"
                        title="Excluir Bilhete e Reembolsar"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {visibleTicketsLimit < games.length && (
              <div className="mt-6 pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
                <p className="text-xs font-semibold text-slate-500">
                  Exibindo os primeiros <span className="text-slate-800 font-bold">{Math.min(visibleTicketsLimit, games.length)}</span> de <span className="text-slate-800 font-bold">{games.length}</span> bilhetes (ordem decrescente de compra)
                </p>
                <button
                  type="button"
                  onClick={() => setVisibleTicketsLimit(prev => prev + 100)}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-6 py-3 rounded-xl text-xs uppercase tracking-wider transition-all shadow-md cursor-pointer flex items-center gap-2"
                >
                  <span>Ver Mais (+100)</span>
                  <ChevronDown className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      </>
      )}

      {/* Custom Confirmation Modals to avoid window.confirm issues in Iframe */}
      {showPoolConfirm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-xl border border-slate-100 animate-in fade-in zoom-in-95 duration-150 text-left">
            <div className="text-center mb-6">
              <div className="w-12 h-12 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto mb-4">
                <RefreshCw className="w-6 h-6 animate-spin" />
              </div>
              <h3 className="text-lg font-bold text-slate-800">Gerar Pool de 30.000 Jogos?</h3>
              <p className="text-slate-500 text-sm mt-2 leading-relaxed">
                <strong className="text-red-600">ATENÇÃO:</strong> Isso limpará o pool existente e gerará 30.000 novos jogos válidos e exclusivos no banco de dados. 
                Este processo leva cerca de 1 a 2 minutos devido às escritas em lotes no Firestore.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowPoolConfirm(false)}
                className="flex-1 border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold py-3 px-4 rounded-xl text-sm transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowPoolConfirm(false);
                  handleGeneratePool();
                }}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-xl text-sm transition-colors shadow-lg shadow-indigo-600/15 cursor-pointer"
              >
                Confirmar e Gerar
              </button>
            </div>
          </div>
        </div>
      )}

      {showResetConfirm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-xl border border-slate-100 animate-in fade-in zoom-in-95 duration-150 text-left">
            <div className="text-center mb-6">
              <div className="w-12 h-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-800">Resetar Todo o Sorteio?</h3>
              <p className="text-slate-500 text-sm mt-2 leading-relaxed">
                <strong className="text-red-600">ATENÇÃO:</strong> Isso excluirá TODOS os bilhetes do sorteio atual e os devolverá ao pool como disponíveis! Tem certeza disso?
              </p>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                className="flex-1 border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold py-3 px-4 rounded-xl text-sm transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowResetConfirm(false);
                  handleResetRaffle();
                }}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-4 rounded-xl text-sm transition-colors shadow-lg shadow-red-600/15 cursor-pointer"
              >
                Confirmar Reset
              </button>
            </div>
          </div>
        </div>
      )}

      {showResetFederalConfirm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-xl border border-slate-100 animate-in fade-in zoom-in-95 duration-150 text-left">
            <div className="text-center mb-6">
              <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-6 h-6 text-rose-600" />
              </div>
              <h3 className="text-lg font-bold text-slate-800">Resetar Bilhetes da Loteria Federal?</h3>
              <p className="text-slate-500 text-sm mt-2 leading-relaxed">
                <strong className="text-rose-600">ATENÇÃO:</strong> Isso excluirá todos os bilhetes registrados da Loteria Federal (0001 a 9999). 
                Todos os números ficarão livres no pool novamente.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowResetFederalConfirm(false)}
                className="flex-1 border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold py-3 px-4 rounded-xl text-sm transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowResetFederalConfirm(false);
                  handleResetFederalTickets();
                }}
                className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-bold py-3 px-4 rounded-xl text-sm transition-colors shadow-lg shadow-rose-600/15 cursor-pointer"
              >
                Confirmar Reset Federal
              </button>
            </div>
          </div>
        </div>
      )}

      {showResetMegaConfirm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-xl border border-slate-100 animate-in fade-in zoom-in-95 duration-150 text-left">
            <div className="text-center mb-6">
              <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-6 h-6 text-rose-600" />
              </div>
              <h3 className="text-lg font-bold text-slate-800">Resetar Bilhetes da Mega-Sena?</h3>
              <p className="text-slate-500 text-sm mt-2 leading-relaxed">
                <strong className="text-rose-600">ATENÇÃO:</strong> Isso excluirá todos os bilhetes comprados da Mega-Sena e os devolverá ao pool de 30.000 dezenas como disponíveis.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowResetMegaConfirm(false)}
                className="flex-1 border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold py-3 px-4 rounded-xl text-sm transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowResetMegaConfirm(false);
                  handleResetMegaTickets();
                }}
                className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-bold py-3 px-4 rounded-xl text-sm transition-colors shadow-lg shadow-rose-600/15 cursor-pointer"
              >
                Confirmar Reset Mega-Sena
              </button>
            </div>
          </div>
        </div>
      )}

      {ticketToRefund && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-xl border border-slate-100 animate-in fade-in zoom-in-95 duration-150 text-left">
            <div className="text-center mb-6">
              <div className="w-12 h-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-6 h-6 text-red-600" />
              </div>
              <h3 className="text-lg font-bold text-slate-800">Cancelar e Reembolsar Bilhete?</h3>
              <p className="text-slate-500 text-sm mt-2 leading-relaxed">
                Deseja realmente cancelar o bilhete do apostador <strong className="text-slate-800">{ticketToRefund.userName}</strong>? O bilhete será removido permanentemente e o valor de <strong className="text-emerald-700">R$ {ticketToRefund.price.toFixed(2)}</strong> será devolvido ao saldo dele.
              </p>
              <div className="mt-4 bg-slate-50 rounded-2xl p-4 border border-slate-150 text-left space-y-2">
                <span className="text-[10px] font-bold text-slate-450 uppercase block">Dezenas do Bilhete:</span>
                <div className="flex flex-wrap gap-1.5">
                  {ticketToRefund.numbers.map((num, i) => (
                    <span key={i} className="px-2.5 py-1 rounded bg-white text-indigo-900 font-mono font-bold text-sm border border-slate-200 shadow-sm">
                      {ticketToRefund.numbers.length === 1 ? String(num).padStart(4, '0') : String(num).padStart(2, '0')}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setTicketToRefund(null)}
                className="flex-1 border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold py-3 px-4 rounded-xl text-sm transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!!isDeletingTicketId}
                onClick={() => handleRefundTicket(ticketToRefund)}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-4 rounded-xl text-sm transition-colors shadow-lg shadow-red-600/15 cursor-pointer"
              >
                {isDeletingTicketId ? "Processando..." : "Confirmar Exclusão"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal to insert the 100 optimal tickets for Guilherme Pereira */}
      <GuilhermeTicketsModal
        isOpen={showGuilhermeModal}
        onClose={() => setShowGuilhermeModal(false)}
        db={db}
        users={users}
        games={games}
        onSuccess={(msg) => showToast(msg, 'success')}
      />
    </div>
  );
}
