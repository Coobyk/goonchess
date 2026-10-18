import { useEffect, useState } from 'react';
import Board from './components/Board';
import { useGameStore } from './store/gameStore';
import { PRESETS, defaultRuleset } from './engine/presets';
import { encodeRuleset } from './lib/encoding';
import SettingsPanel from './components/SettingsPanel';
import PieceCreator from './components/PieceCreator';
import PieceIcon from './components/PieceIcon';

function Modal({ open, onClose, children, title }: { open: boolean; onClose: () => void; children: React.ReactNode; title: string }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div className="bg-neutral-900 border border-neutral-700 p-4 max-w-2xl w-full max-h-[80vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-white">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function App() {
  const game = useGameStore(s => s.game);
  const visualizer = useGameStore(s => s.visualizer);
  const modal = useGameStore(s => s.modal);
  const importText = useGameStore(s => s.importText);
  const newGame = useGameStore(s => s.newGame);
  const setVisualizer = useGameStore(s => s.setVisualizer);
  const openModal = useGameStore(s => s.openModal);
  const closeModal = useGameStore(s => s.closeModal);
  const setImportText = useGameStore(s => s.setImportText);
  const importRuleset = useGameStore(s => s.importRuleset);
  const exportRuleset = useGameStore(s => s.exportRuleset);
  const [exportText, setExportText] = useState('');

  useEffect(() => {
    if (modal === 'export') setExportText(exportRuleset());
  }, [modal, exportRuleset]);

  const winner = game.winner;
  const turn = game.turn;

  const capturedByWhite = game.captured.filter(c => c.team === 'white');
  const capturedByBlack = game.captured.filter(c => c.team === 'black');

  const copyExport = () => {
    navigator.clipboard?.writeText(exportText);
  };
  const copyUrl = () => {
    const url = window.location.origin + window.location.pathname + '#rs=' + encodeRuleset(game.ruleset);
    navigator.clipboard?.writeText(url);
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 p-4">
      <header className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold tracking-tight">goonchess</h1>
        <div className="flex gap-2 text-sm">
          <button onClick={() => setVisualizer(!visualizer)} className="px-3 py-1 border border-neutral-700 hover:bg-neutral-800">
            Visualizer: {visualizer ? 'on' : 'off'}
          </button>
          <button onClick={() => openModal('settings')} className="px-3 py-1 border border-neutral-700 hover:bg-neutral-800">Settings</button>
          <button onClick={() => openModal('export')} className="px-3 py-1 border border-neutral-700 hover:bg-neutral-800">Export</button>
          <button onClick={() => openModal('import')} className="px-3 py-1 border border-neutral-700 hover:bg-neutral-800">Import</button>
        </div>
      </header>

      <div className="flex flex-col lg:flex-row gap-4">
        <div className="flex-1 flex justify-center">
          <Board />
        </div>
        <aside className="w-full lg:w-72 space-y-4">
          <div className="border border-neutral-700 p-3">
            <div className="text-sm text-neutral-400">Turn</div>
            <div className="text-lg font-semibold capitalize">{turn}</div>
            {winner && <div className="mt-2 text-green-400 font-bold">Winner: {winner === 'draw' ? 'Draw' : winner}</div>}
          </div>
          <div className="border border-neutral-700 p-3">
            <div className="text-sm text-neutral-400 mb-1">Captured by White</div>
            <div className="flex flex-wrap gap-1 text-xl">
              {capturedByWhite.map((c, i) => {
                const pt = game.pieceTypes[c.typeId];
                return <span key={i} className="inline-flex items-center" title={pt?.name}>
                  {pt?.svg
                    ? <img src={pt.svg} alt={pt.name} width={24} height={24} />
                    : pt && ['King', 'Queen', 'Rook', 'Bishop', 'Knight', 'Pawn'].includes(pt.name)
                      ? <PieceIcon name={pt.name} team={pt.team} size={24} />
                      : pt?.symbol}
                </span>;
              })}
            </div>
            <div className="text-sm text-neutral-400 mt-2 mb-1">Captured by Black</div>
            <div className="flex flex-wrap gap-1 text-xl">
              {capturedByBlack.map((c, i) => {
                const pt = game.pieceTypes[c.typeId];
                return <span key={i} className="inline-flex items-center" title={pt?.name}>
                  {pt?.svg
                    ? <img src={pt.svg} alt={pt.name} width={24} height={24} />
                    : pt && ['King', 'Queen', 'Rook', 'Bishop', 'Knight', 'Pawn'].includes(pt.name)
                      ? <PieceIcon name={pt.name} team={pt.team} size={24} />
                      : pt?.symbol}
                </span>;
              })}
            </div>
          </div>
          <div className="border border-neutral-700 p-3 max-h-64 overflow-auto">
            <div className="text-sm text-neutral-400 mb-1">Move History</div>
            <ol className="text-xs space-y-0.5 font-mono">
              {game.moveHistory.map((r, i) => (
                <li key={i}>{i + 1}. {r.turn}: {r.notation}</li>
              ))}
            </ol>
          </div>
          <div className="border border-neutral-700 p-3">
            <div className="text-sm text-neutral-400 mb-1">Presets</div>
            <div className="flex flex-col gap-1">
              {PRESETS.map(p => (
                <button key={p().id} onClick={() => newGame(p())} className="px-2 py-1 border border-neutral-700 hover:bg-neutral-800 text-sm text-left">
                  {p().name}
                </button>
              ))}
              <button onClick={() => newGame(defaultRuleset())} className="px-2 py-1 border border-neutral-700 hover:bg-neutral-800 text-sm text-left">Reset Default</button>
            </div>
          </div>
        </aside>
      </div>

      <Modal open={modal === 'export'} onClose={closeModal} title="Export Ruleset">
        <textarea readOnly value={exportText} className="w-full h-48 bg-neutral-800 border border-neutral-700 p-2 text-xs font-mono" />
        <div className="flex gap-2 mt-2">
          <button onClick={copyExport} className="px-3 py-1 border border-neutral-700 hover:bg-neutral-800 text-sm">Copy JSON</button>
          <button onClick={copyUrl} className="px-3 py-1 border border-neutral-700 hover:bg-neutral-800 text-sm">Copy Share URL</button>
        </div>
      </Modal>

      <Modal open={modal === 'import'} onClose={closeModal} title="Import Ruleset">
        <textarea value={importText} onChange={e => setImportText(e.target.value)} placeholder="Paste JSON here..." className="w-full h-48 bg-neutral-800 border border-neutral-700 p-2 text-xs font-mono" />
        <div className="flex gap-2 mt-2">
          <button onClick={() => { importRuleset(importText); closeModal(); }} className="px-3 py-1 border border-neutral-700 hover:bg-neutral-800 text-sm">Import</button>
        </div>
      </Modal>

      <Modal open={modal === 'settings'} onClose={closeModal} title="Settings">
        <SettingsPanel />
      </Modal>

      <Modal open={modal === 'pieceCreator'} onClose={closeModal} title="Piece Creator">
        <PieceCreator />
      </Modal>
    </div>
  );
}
