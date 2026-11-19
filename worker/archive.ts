/**
 * The game archive: one Durable Object for the whole site, with a SQLite
 * database inside it.
 *
 * Three tables. `games` keeps every finished game — its moves as a JSON list
 * and how it ended. `variants` keeps a running tally per ruleset, so the
 * summary never has to count. `position_moves` is the opening explorer: for
 * the first few moves of every game, which move was played from which
 * position, and how those games ended. A game writes one row to each of the
 * first two and one per opening move to the last, which keeps it well inside
 * the free plan's daily row budget.
 *
 * It is a SQLite-backed object like the rooms, so the migration in
 * wrangler.toml creates it on the first deploy and there is nothing to set up.
 */
import {
  EXPLORER_DEPTH,
  type ArchiveEntry,
  type ArchiveSummary,
  type ExplorerMove,
  type VariantSummary,
} from '../src/lib/archive'
import { json } from './http'

export const ARCHIVE_RECORD_URL = 'https://archive.internal/record'
const ARCHIVE_NAME = 'global'

/** The single archive the whole site writes to. */
export function archiveStub(env: Env): DurableObjectStub {
  return env.ARCHIVE.get(env.ARCHIVE.idFromName(ARCHIVE_NAME))
}

/** The summary looks at the latest games only, so it costs the same when the archive is big. */
const SUMMARY_WINDOW = 2000
const LIST_LIMIT = 12

const SCHEMA = `
CREATE TABLE IF NOT EXISTS games (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  variant_key TEXT NOT NULL,
  source TEXT NOT NULL,
  winner INTEGER NOT NULL,
  status TEXT NOT NULL,
  plies INTEGER NOT NULL,
  moves TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS games_by_variant ON games (variant_key, id);
CREATE TABLE IF NOT EXISTS variants (
  variant_key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  games INTEGER NOT NULL DEFAULT 0,
  wins0 INTEGER NOT NULL DEFAULT 0,
  wins1 INTEGER NOT NULL DEFAULT 0,
  draws INTEGER NOT NULL DEFAULT 0,
  plies INTEGER NOT NULL DEFAULT 0,
  last_played INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS position_moves (
  variant_key TEXT NOT NULL,
  position TEXT NOT NULL,
  move TEXT NOT NULL,
  games INTEGER NOT NULL DEFAULT 0,
  wins0 INTEGER NOT NULL DEFAULT 0,
  wins1 INTEGER NOT NULL DEFAULT 0,
  draws INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (variant_key, position, move)
) WITHOUT ROWID;
`

type Row = Record<string, SqlStorageValue>

export class GameArchive {
  private ctx: DurableObjectState
  private sql: SqlStorage

  constructor(ctx: DurableObjectState) {
    this.ctx = ctx
    this.sql = ctx.storage.sql
    this.sql.exec(SCHEMA)
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === '/record' && request.method === 'POST') {
      this.record((await request.json()) as ArchiveEntry)
      return json({ ok: true }, 201)
    }
    if (url.pathname === '/moves') {
      return json(this.moves(url.searchParams.get('variant') ?? '', url.searchParams.get('position') ?? ''))
    }
    if (url.pathname === '/summary') {
      const variant = url.searchParams.get('variant')
      return variant ? json(this.variantSummary(variant)) : json(this.summary())
    }
    return json({ error: 'not_found' }, 404)
  }

  private record(entry: ArchiveEntry) {
    const now = Date.now()
    const won0 = entry.winner === 0 ? 1 : 0
    const won1 = entry.winner === 1 ? 1 : 0
    const drawn = entry.winner === -1 ? 1 : 0
    this.ctx.storage.transactionSync(() => {
      this.sql.exec(
        `INSERT INTO games (variant_key, source, winner, status, plies, moves, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        entry.variantKey,
        entry.source,
        entry.winner,
        entry.status,
        entry.moves.length,
        JSON.stringify(entry.moves),
        now,
      )
      this.sql.exec(
        `INSERT INTO variants (variant_key, name, games, wins0, wins1, draws, plies, last_played)
         VALUES (?, ?, 1, ?, ?, ?, ?, ?)
         ON CONFLICT (variant_key) DO UPDATE SET
           name = excluded.name,
           games = games + 1,
           wins0 = wins0 + excluded.wins0,
           wins1 = wins1 + excluded.wins1,
           draws = draws + excluded.draws,
           plies = plies + excluded.plies,
           last_played = excluded.last_played`,
        entry.variantKey,
        entry.variantName,
        won0,
        won1,
        drawn,
        entry.moves.length,
        now,
      )
      const opening = Math.min(entry.positions.length, entry.moves.length, EXPLORER_DEPTH)
      for (let ply = 0; ply < opening; ply++) {
        this.sql.exec(
          `INSERT INTO position_moves (variant_key, position, move, games, wins0, wins1, draws)
           VALUES (?, ?, ?, 1, ?, ?, ?)
           ON CONFLICT (variant_key, position, move) DO UPDATE SET
             games = games + 1,
             wins0 = wins0 + excluded.wins0,
             wins1 = wins1 + excluded.wins1,
             draws = draws + excluded.draws`,
          entry.variantKey,
          entry.positions[ply],
          entry.moves[ply],
          won0,
          won1,
          drawn,
        )
      }
    })
  }

  private moves(variant: string, position: string): { games: number; moves: ExplorerMove[] } {
    const rows = this.sql
      .exec<Row>(
        `SELECT move, games, wins0, wins1, draws FROM position_moves
         WHERE variant_key = ? AND position = ?
         ORDER BY games DESC, move LIMIT ?`,
        variant,
        position,
        LIST_LIMIT,
      )
      .toArray()
    const total = this.sql
      .exec<Row>(
        'SELECT COALESCE(SUM(games), 0) AS games FROM position_moves WHERE variant_key = ? AND position = ?',
        variant,
        position,
      )
      .one()
    return {
      games: Number(total.games),
      moves: rows.map((row) => ({
        move: String(row.move),
        games: Number(row.games),
        wins: [Number(row.wins0), Number(row.wins1)],
        draws: Number(row.draws),
      })),
    }
  }

  private variantSummary(variant: string): VariantSummary {
    const row = this.sql
      .exec<Row>('SELECT name, games, wins0, wins1, draws, plies FROM variants WHERE variant_key = ?', variant)
      .toArray()[0]
    const games = Number(row?.games ?? 0)
    const recent = `SELECT moves, status FROM games WHERE variant_key = ? ORDER BY id DESC LIMIT ${SUMMARY_WINDOW}`
    const counted = (query: string) =>
      this.sql
        .exec<Row>(query, variant)
        .toArray()
        .map((r) => ({ key: String(r.key), count: Number(r.count) }))
    const topMoves = counted(
      `SELECT j.value AS key, COUNT(*) AS count FROM (${recent}) AS g, json_each(g.moves) AS j
       GROUP BY j.value ORDER BY count DESC, key LIMIT ${LIST_LIMIT}`,
    )
    const firstMoves = counted(
      `SELECT json_extract(g.moves, '$[0]') AS key, COUNT(*) AS count FROM (${recent}) AS g
       GROUP BY key ORDER BY count DESC, key LIMIT ${LIST_LIMIT}`,
    )
    const endings = counted(
      `SELECT g.status AS key, COUNT(*) AS count FROM (${recent}) AS g
       GROUP BY key ORDER BY count DESC, key`,
    )
    return {
      variantKey: variant,
      name: String(row?.name ?? ''),
      games,
      wins: [Number(row?.wins0 ?? 0), Number(row?.wins1 ?? 0)],
      draws: Number(row?.draws ?? 0),
      averagePlies: games ? Math.round((Number(row?.plies ?? 0) / games) * 10) / 10 : 0,
      topMoves: topMoves.map(({ key, count }) => ({ move: key, count })),
      firstMoves: firstMoves.map(({ key, count }) => ({ move: key, count })),
      endings: endings.map(({ key, count }) => ({ status: key, count })),
    }
  }

  private summary(): ArchiveSummary {
    const total = this.sql.exec<Row>('SELECT COALESCE(SUM(games), 0) AS games FROM variants').one()
    const variants = this.sql
      .exec<Row>(`SELECT variant_key, name, games FROM variants ORDER BY games DESC, name LIMIT ${LIST_LIMIT}`)
      .toArray()
    return {
      games: Number(total.games),
      variants: variants.map((row) => ({
        variantKey: String(row.variant_key),
        name: String(row.name),
        games: Number(row.games),
      })),
    }
  }
}
