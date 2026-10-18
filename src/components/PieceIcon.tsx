import type { CSSProperties } from 'react';

const pieceCodes: Record<string, string> = {
  king: 'K', queen: 'Q', rook: 'R', bishop: 'B', knight: 'N', pawn: 'P',
};

/** Lichess's default Cburnett Staunton piece SVGs, bundled locally. */
export default function PieceIcon({ name, team, size = 40, style }: {
  name: string;
  team: string;
  size?: number;
  style?: CSSProperties;
}) {
  const code = pieceCodes[name.toLowerCase()];
  if (!code || (team !== 'white' && team !== 'black')) return <span>{name.slice(0, 1)}</span>;
  const teamCode = team === 'white' ? 'w' : 'b';
  return <img
    src={`/pieces/cburnett/${teamCode}${code}.svg`}
    alt={`${team} ${name}`}
    width={size}
    height={size}
    style={{ display: 'block', ...style }}
  />;
}
