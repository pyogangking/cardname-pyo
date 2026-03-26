'use client';

import { useState, useEffect, useCallback } from 'react';

type GameState = 'idle' | 'playing' | 'paused' | 'finished';

interface Card {
  id: number;
  emoji: string;
  isFlipped: boolean;
  isMatched: boolean;
}

const FRUITS = ['🍎', '🍌', '🍇', '🍓', '🍒', '🍍', '🍑', '🍐'];

// REPLACE THIS WITH YOUR DEPLOYED GAS WEB APP URL
const GAS_URL = 'https://script.google.com/macros/s/AKfycbwKa79ZC1esholeCbK_79MT2rdLjoJsMGOhI_Cx4C8mU_V5QFBwJAxWnL6OhbrqBQpF/exec'; 

export default function CardGame() {
  const [userName, setUserName] = useState('');
  const [gameState, setGameState] = useState<GameState>('idle');
  const [cards, setCards] = useState<Card[]>([]);
  const [flippedCards, setFlippedCards] = useState<number[]>([]);
  const [seconds, setSeconds] = useState(0);
  const [isFlippedOnStart, setIsFlippedOnStart] = useState(false);
  const [leaderboard, setLeaderboard] = useState<{name: string, time: string, scoreInSeconds: number}[]>([]);

  const formatTime = (s: number) => {
    if (isNaN(s) || s < 0) return '00:00';
    const m = Math.floor(s / 60);
    const rs = s % 60;
  };

  const parseToSeconds = (raw: any): number => {
    if (!raw) return 9999;
    const str = raw.toString().trim();
    
    // 1. Handle MM:SS or H:M:S format
    const timeMatch = str.match(/(\d+)?:?(\d+):(\d+)/);
    if (timeMatch && !str.includes('T')) {
      const h = timeMatch[1] ? parseInt(timeMatch[1], 10) : 0;
      const m = parseInt(timeMatch[2], 10);
      const s = parseInt(timeMatch[3], 10);
      // If it only has two parts (M:S), use them correctly
      if (!timeMatch[1] || str.split(':').length === 2) {
        return parseInt(timeMatch[2], 10) * 60 + parseInt(timeMatch[3], 10);
      }
      return h * 3600 + m * 60 + s;
    }

    // 2. Handle ISO date strings (e.g., "1899-12-29T16:23:08.000Z")
    if (str.includes('T')) {
      try {
        const date = new Date(str);
        if (!isNaN(date.getTime())) {
          // Durations in Sheets are often relative to 1899-12-30.
          // If the year is 1899, it's almost certainly a duration.
          // Let's just take the time of day.
          const h = date.getUTCHours();
          const m = date.getUTCMinutes();
          const s = date.getUTCSeconds();
          return h * 3600 + m * 60 + s;
        }
      } catch (e) {}
    }

    // 3. Fallback to raw number
    const num = parseInt(str, 10);
    return isNaN(num) ? 9999 : num;
  };

  const [isLeaderboardLoading, setIsLeaderboardLoading] = useState(false);

  const fetchLeaderboard = useCallback(async () => {
    if (!GAS_URL) return;
    setIsLeaderboardLoading(true);
    try {
      const response = await fetch(`${GAS_URL}?t=${Date.now()}`);
      const data = await response.json();
      
      if (Array.isArray(data)) {
        const processed = data
          .map(item => {
            let name = 'Anonymous';
            let rawTime = '';
            
            for (const key in item) {
              const lowerKey = key.toLowerCase();
              if (['name', '이름', 'player', 'nickname', '유저'].includes(lowerKey)) name = item[key]?.toString() || 'Anonymous';
              if (['time', 'finishtime', '걸린시간', 'finish time', '점수'].includes(lowerKey)) rawTime = item[key]?.toString() || '';
            }

            const scoreInSeconds = parseToSeconds(rawTime);
            return {
              name: name.toString().trim(),
              time: formatTime(scoreInSeconds),
              scoreInSeconds
            };
          })
          .filter(item => 
            item.name && 
            !['name', '이름', 'nickname', 'player', '유저'].includes(item.name.toLowerCase()) && 
            item.scoreInSeconds > 0 && 
            item.scoreInSeconds < 9999
          )
          .sort((a, b) => a.scoreInSeconds - b.scoreInSeconds)
          .slice(0, 3);
        
        if (processed.length > 0) {
          setLeaderboard(processed);
        }
      }
    } catch (error) {
      console.error('Failed to fetch leaderboard:', error);
    } finally {
      setIsLeaderboardLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  const saveResultToGAS = useCallback(async (name: string, time: string) => {
    if (!GAS_URL) return;
    
    const currentScoreSeconds = parseToSeconds(time);
    const formatted = formatTime(currentScoreSeconds);
    
    // Instant feedback
    setLeaderboard(prev => {
      const newEntry = { name, time: formatted, scoreInSeconds: currentScoreSeconds };
      const updated = [...prev, newEntry]
        .sort((a, b) => a.scoreInSeconds - b.scoreInSeconds)
        .slice(0, 3);
      return updated;
    });

    try {
      await fetch(GAS_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ name, finishtime: time, time: time }),
      });
      // Delay longer to prevent new record from "disappearing" if GAS is slow
      setTimeout(fetchLeaderboard, 4000);
    } catch (error) {
      console.error('Failed to submit result:', error);
    }
  }, [fetchLeaderboard]);

  const initializeGame = useCallback(() => {
    const gameCards = [...FRUITS, ...FRUITS]
      .sort(() => Math.random() - 0.5)
      .map((emoji, index) => ({
        id: index,
        emoji,
        isFlipped: true,
        isMatched: false,
      }));
    
    setCards(gameCards);
    setFlippedCards([]);
    setSeconds(0);
    setGameState('playing');
    setIsFlippedOnStart(true);

    setTimeout(() => {
      setCards(prev => prev.map(c => ({ ...c, isFlipped: false })));
      setIsFlippedOnStart(false);
    }, 2000);
  }, []);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (gameState === 'playing' && !isFlippedOnStart) {
      interval = setInterval(() => {
        setSeconds(s => s + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [gameState, isFlippedOnStart]);

  useEffect(() => {
    if (flippedCards.length === 2) {
      const [id1, id2] = flippedCards;
      const c1 = cards[id1];
      const c2 = cards[id2];

      if (c1.emoji === c2.emoji) {
        setCards(prev => prev.map(c => 
          (c.id === id1 || c.id === id2) ? { ...c, isMatched: true, isFlipped: true } : c
        ));
        setFlippedCards([]);
      } else {
        const t = setTimeout(() => {
          setCards(prev => prev.map(c => 
            (c.id === id1 || c.id === id2) ? { ...c, isFlipped: false } : c
          ));
          setFlippedCards([]);
        }, 800);
        return () => clearTimeout(t);
      }
    }
  }, [flippedCards, cards]);

  useEffect(() => {
    if (cards.length > 0 && !isFlippedOnStart && cards.every(c => c.isMatched) && gameState === 'playing') {
      setGameState('finished');
      saveResultToGAS(userName, formatTime(seconds));
    }
  }, [cards, isFlippedOnStart, userName, seconds, saveResultToGAS, gameState]);

  const handleCardClick = (id: number) => {
    if (gameState !== 'playing' || isFlippedOnStart || flippedCards.length === 2 || cards[id].isFlipped || cards[id].isMatched) {
      return;
    }
    setCards(prev => prev.map(c => c.id === id ? { ...c, isFlipped: true } : c));
    setFlippedCards(prev => [...prev, id]);
  };


  const handleReset = () => {
    setGameState('idle');
    setCards([]);
    setSeconds(0);
    // Don't clear nickname and leaderboard automatically to keep it "all in one"
  };

  return (
    <main className="min-h-screen p-4 md:p-8 flex items-center justify-center bg-slate-50">
      <div className="w-full max-w-7xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left Side: Controls & Info */}
        <section className="lg:col-span-3 flex flex-col gap-6 order-2 lg:order-1">
          <div className="bg-white/70 backdrop-blur-xl p-8 rounded-[40px] shadow-xl border border-white/50">
            <h2 className="text-sm font-black text-slate-400 uppercase tracking-[0.2em] mb-6">Player Info</h2>
            <div className="space-y-6">
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase ml-2 mb-2 block">Your Name</label>
                <input
                  type="text"
                  className="w-full px-5 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-lg font-bold text-slate-700 outline-none focus:border-[#FFB3A1] transition-all"
                  value={userName}
                  placeholder="Enter Name..."
                  onChange={(e) => setUserName(e.target.value)}
                  disabled={gameState === 'playing'}
                />
              </div>
              
              <div className="flex justify-between items-center p-4 bg-[#FFB3A1]/10 rounded-2xl border border-[#FFB3A1]/20">
                <span className="text-xs font-black text-[#FFB3A1] uppercase tracking-widest">Time</span>
                <span className="text-2xl font-mono font-black text-[#FFB3A1]">{formatTime(seconds)}</span>
              </div>

              <div className="flex flex-col gap-3">
                {gameState === 'idle' || gameState === 'finished' ? (
                  <button 
                    className="w-full py-4 bg-[#FFB3A1] hover:bg-[#fa9e88] text-white rounded-2xl text-lg font-black shadow-lg shadow-orange-100 transition-all active:scale-95 disabled:opacity-30"
                    disabled={!userName}
                    onClick={initializeGame}
                  >
                    {gameState === 'finished' ? 'PLAY AGAIN' : 'START GAME'}
                  </button>
                ) : (
                  <>
                    <button 
                      className="w-full py-4 bg-white text-[#FFB3A1] border-2 border-[#FFB3A1]/20 rounded-2xl text-lg font-black shadow-sm transition-all hover:bg-orange-50"
                      onClick={() => setGameState(gameState === 'playing' ? 'paused' : 'playing')}
                    >
                      {gameState === 'playing' ? 'PAUSE' : 'RESUME'}
                    </button>
                    <button 
                      className="w-full py-4 text-slate-400 font-bold hover:text-slate-600 transition-colors"
                      onClick={handleReset}
                    >
                      Reset Game
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Center: Game Grid */}
        <section className="lg:col-span-6 flex flex-col items-center gap-8 order-1 lg:order-2">
          <h1 className="text-4xl lg:text-5xl font-black text-[#FFB3A1] drop-shadow-sm tracking-tight text-center">
            FRUIT CARD MATCH
          </h1>
          
          <div className="relative w-full aspect-square max-w-[500px] bg-white rounded-[50px] p-4 shadow-2xl border border-white/50">
            {gameState === 'idle' ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center bg-white/40 backdrop-blur-sm rounded-[50px] z-10">
                <span className="text-6xl mb-4">🎮</span>
                <p className="text-xl font-bold text-slate-400">Enter your name and<br/>click START GAME</p>
              </div>
            ) : null}

            <div 
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gridTemplateRows: 'repeat(4, 1fr)',
                gap: '12px',
                width: '100%',
                height: '100%',
                transition: 'all 0.5s ease',
                opacity: gameState === 'paused' ? 0.2 : 1,
                filter: gameState === 'paused' ? 'blur(12px)' : 'none'
              }}
            >
              {cards.map((card) => (
                <div 
                  key={card.id} 
                  className="card-perspective cursor-pointer" 
                  onClick={() => handleCardClick(card.id)}
                >
                  <div className={`card-inner ${card.isFlipped || card.isMatched ? 'card-is-flipped' : ''}`}>
                    <div className="card-face card-face-back">
                      <span className="select-none text-3xl">★</span>
                    </div>
                    <div className="card-face card-face-front">
                      <span className={`text-4xl md:text-5xl select-none transition-all duration-500 ${card.isMatched ? 'opacity-30 scale-90' : 'scale-110'}`}>
                        {card.emoji}
                      </span>
                      {card.isMatched && (
                        <div className="absolute top-1 right-1 text-[#FFB3A1]/50">
                          <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {gameState === 'finished' && (
              <div className="absolute inset-0 flex items-center justify-center z-20 animate-fade-in">
                <div className="bg-[#FFB3A1] text-white p-8 rounded-[40px] shadow-2xl text-center transform scale-110">
                  <h2 className="text-3xl font-black mb-1">VICTORY!</h2>
                  <p className="text-lg font-bold opacity-90">{formatTime(seconds)}</p>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Right Side: Leaderboard */}
        <section className="lg:col-span-3 flex flex-col order-3">
          <div className="bg-white/70 backdrop-blur-xl p-8 rounded-[40px] shadow-xl border border-white/50 h-full">
            <h2 className="text-sm font-black text-slate-400 uppercase tracking-[0.2em] mb-6">🏆 Hall of Fame</h2>
            <div className="flex flex-col gap-4 relative">
              {leaderboard.length > 0 ? (
                <>
                  {leaderboard.map((item, idx) => (
                    <div 
                      key={idx} 
                      className={`flex justify-between items-center px-5 py-4 rounded-3xl border transition-all animate-fade-in ${
                        idx === 0 
                        ? 'bg-yellow-50 border-yellow-100 shadow-sm' 
                        : 'bg-slate-50/50 border-slate-100'
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <span className={`text-xl font-black ${
                          idx === 0 ? 'text-yellow-500' : idx === 1 ? 'text-slate-400' : 'text-amber-600'
                        }`}>
                          {idx + 1}
                        </span>
                        <span className="font-bold text-slate-700 truncate max-w-[80px]">{item.name}</span>
                      </div>
                      <span className="font-mono font-black text-[#FFB3A1]">{item.time}</span>
                    </div>
                  ))}
                  {isLeaderboardLoading && (
                    <div className="absolute -bottom-6 left-0 right-0 text-center">
                      <p className="text-[10px] text-slate-300 animate-pulse uppercase tracking-widest font-black">Syncing...</p>
                    </div>
                  )}
                </>
              ) : (
                isLeaderboardLoading ? (
                  <div className="text-center py-10">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#FFB3A1] mx-auto mb-4"></div>
                    <p className="text-xs text-slate-400 italic">Fetching Top 3...</p>
                  </div>
                ) : (
                  <div className="text-center py-10">
                    <p className="text-xs text-slate-300 italic">No records yet.<br/>Be the first!</p>
                  </div>
                )
              )}
            </div>
          </div>
        </section>

      </div>
    </main>
  );
}
