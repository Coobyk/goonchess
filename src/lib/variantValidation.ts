import {
  BOARD_MAX,
  BOARD_MIN,
  defaultPieceFlags,
  type PieceFlags,
  type PieceType,
  type Variant,
} from '../engine/types'

export const VARIANT_LIMITS = {
  maxIdLength: 64,
  maxVariantNameLength: 80,
  maxDescriptionLength: 1000,
  maxTeamNameLength: 80,
  maxPieceNameLength: 80,
  maxSymbolLength: 8,
  maxPieceTypes: 32,
  maxPatternsPerList: 8,
  maxVectorsPerPattern: 80,
  maxEffectsPerPiece: 8,
  maxArtLayers: 12,
  maxImagesPerPiece: 2,
  maxImageLength: 200,
  maxSetupPieces: 64,
  maxMovementComplexity: 1024,
  maxPieceMovementComplexity: 128,
  maxAmplifiedMovementComplexity: 4096,
  maxPieceValue: 99,
  maxLives: 99,
  maxPointTarget: 1000,
  maxExplosionRadius: 3,
  maxVector: BOARD_MAX,
  maxSpawnOffset: BOARD_MAX,
  maxArtCoordinate: 64,
  maxArtScale: 8,
} as const

/**
 * A conservative upper bound on the board scanning work one position can
 * cause. Leaper vectors cost one step; slider vectors cost their maximum
 * range. The cost is totalled for the pieces in the initial setup.
 */
export function pieceMovementComplexity(piece: PieceType, line: number): number {
  const patternCost = (pattern: (typeof piece.move)[number]) => {
    const range =
      pattern.kind === 'slider'
        ? Math.min(pattern.maxRange > 0 ? pattern.maxRange : line, line)
        : 1
    return pattern.vectors.length * Math.max(1, range)
  }
  const move = piece.move.reduce((sum, pattern) => sum + patternCost(pattern), 0)
  const capture = piece.capture.reduce((sum, pattern) => sum + patternCost(pattern), 0)
  return move + capture
}

export function movementComplexity(variant: Variant): number {
  const line = Math.max(variant.board.width, variant.board.height)
  const costs = new Map(
    variant.pieceTypes.map((piece) => [piece.id, pieceMovementComplexity(piece, line)] as const),
  )
  return variant.setup.reduce((sum, piece) => sum + (costs.get(piece.typeId) ?? 0), 0)
}

/**
 * The initial complexity plus a conservative allowance for pieces spawn
 * effects can add. Spawned pieces can spawn again, and promotion or random
 * transformation can reach types missing from the initial setup, so the
 * closure follows the whole type graph.
 */
function amplifiedMovementComplexity(variant: Variant): number {
  const line = Math.max(variant.board.width, variant.board.height)
  const active = new Set(variant.setup.map((piece) => piece.typeId))
  const spawnable = new Set<string>()
  let changed = true
  while (changed) {
    changed = false
    for (const piece of variant.pieceTypes) {
      if (!active.has(piece.id)) continue
      for (const typeId of piece.promotion?.typeIds ?? []) {
        if (!active.has(typeId)) {
          active.add(typeId)
          changed = true
        }
      }
      if (piece.flags.random) {
        for (const target of variant.pieceTypes) {
          if (target.flags.royal || active.has(target.id)) continue
          active.add(target.id)
          changed = true
        }
      }
      for (const effect of piece.effects) {
        if (effect.kind !== 'spawn' || spawnable.has(effect.pieceTypeId)) continue
        spawnable.add(effect.pieceTypeId)
        active.add(effect.pieceTypeId)
        changed = true
      }
    }
  }

  const highestSpawnCost = [...spawnable].reduce((highest, typeId) => {
    const piece = variant.pieceTypes.find((candidate) => candidate.id === typeId)
    return piece ? Math.max(highest, pieceMovementComplexity(piece, line)) : highest
  }, 0)
  const emptySquares = Math.max(0, variant.board.width * variant.board.height - variant.setup.length)
  return movementComplexity(variant) + emptySquares * highestSpawnCost
}

const FALLBACK_TEAMS: Variant['teams'] = [
  { id: 'white', name: 'White', color: '#f4f1ea', forward: 'up' },
  { id: 'black', name: 'Black', color: '#3f3f46', forward: 'down' },
]

/** Expands shorthand hex colors and fills fields added after schema 1 shipped. */
export function normalizeVariant(input: unknown): Variant | null {
  if (!input || typeof input !== 'object') return null
  const v = input as Variant
  if (!v.board || !Array.isArray(v.pieceTypes) || !Array.isArray(v.teams)) return null
  if (!v.board.tiles || !Array.isArray(v.board.tiles)) return null
  const color = (value: unknown) =>
    typeof value === 'string' && /^#[0-9a-fA-F]{3}$/.test(value)
      ? `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`
      : value
  return {
    ...v,
    schema: 1,
    teams: (v.teams.length ? v.teams : FALLBACK_TEAMS).map((team) =>
      team && typeof team === 'object' ? { ...team, color: color(team.color) as string } : team,
    ),
    setup: Array.isArray(v.setup) ? v.setup : [],
    winConditions: Array.isArray(v.winConditions) ? v.winConditions : [],
    pieceTypes: v.pieceTypes.map((piece) => {
      if (!piece || typeof piece !== 'object') return piece
      return {
        ...piece,
        flags: defaultPieceFlags(piece.flags as Partial<PieceFlags> | undefined),
        effects: piece.effects ?? [],
        capture: piece.capture ?? [],
        move: piece.move ?? [],
        promotion: normalizePromotion(piece.promotion),
      }
    }),
  }
}

/** Accepts every shape a promotion target has been stored in over time. */
function normalizePromotion(promotion: unknown): { typeIds: string[] } | null {
  if (!promotion || typeof promotion !== 'object') return null
  const raw = Array.isArray(promotion)
    ? promotion
    : 'typeIds' in promotion
      ? (promotion as { typeIds?: unknown }).typeIds
      : // Older variants stored the single target as `typeId`.
        (promotion as { typeId?: unknown }).typeId
  const list = Array.isArray(raw) ? raw : [raw]
  const typeIds = list.filter((id): id is string => typeof id === 'string' && !!id)
  return typeIds.length ? { typeIds } : null
}

export type VariantValidationResult =
  | { ok: true; value: Variant; errors: string[] }
  | { ok: false; errors: string[] }

const MAX_ERRORS = 24
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/
const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/
const IMAGE_PATTERN = /^\/pieces\/[\w/.-]+$/
function hasControlChars(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i)
    if (code < 32 || code === 127) return true
  }
  return false
}
const RESERVED_IDS = new Set(['__proto__', 'prototype', 'constructor'])

const TERRAINS = new Set(['normal', 'void', 'wall', 'portal', 'oneway'])
const TEAM_FORWARDS = new Set(['up', 'down'])
const PIECE_ICONS = new Set(['king', 'queen', 'rook', 'bishop', 'knight', 'pawn', 'custom'])
const ART_SHAPES = new Set(['king', 'queen', 'rook', 'bishop', 'knight', 'pawn'])
const PATTERN_KINDS = new Set(['leaper', 'slider'])
const EFFECT_KINDS = new Set(['swap', 'explosion', 'spawn'])
const WIN_KINDS = new Set([
  'checkmate',
  'kingCapture',
  'elimination',
  'points',
  'center',
  'threeCheck',
  'antichess',
  'race',
  'predator',
])
const VARIANT_RULES = new Set([
  'atomic',
  'crazyhouse',
  'forcedCapture',
  'noCheck',
  'noCastle',
  'predator',
  'loyalty',
  'hypergamy',
  'spinning',
  'turning',
])
const PIECE_FLAG_KEYS = [
  'jump',
  'mustCapture',
  'uncapturable',
  'royal',
  'movesOnce',
  'mirror',
  'enPassant',
  'dice',
  'random',
  'predator',
] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function fail(errors: string[], path: string, message: string): void {
  if (errors.length < MAX_ERRORS) errors.push(`${path}: ${message}`)
}

function validateId(value: unknown, path: string, errors: string[]): boolean {
  if (typeof value !== 'string' || value.length === 0) {
    fail(errors, path, 'expected a non-empty string id')
    return false
  }
  if (value.length > VARIANT_LIMITS.maxIdLength) {
    fail(errors, path, `expected at most ${VARIANT_LIMITS.maxIdLength} characters`)
    return false
  }
  if (!ID_PATTERN.test(value) || RESERVED_IDS.has(value)) {
    fail(errors, path, 'expected letters, numbers, hyphens or underscores, starting with a letter or number')
    return false
  }
  return true
}

function validateText(
  value: unknown,
  path: string,
  maxLength: number,
  required: boolean,
  errors: string[],
): boolean {
  if (typeof value !== 'string') {
    fail(errors, path, 'expected a string')
    return false
  }
  if (value.length > maxLength) {
    fail(errors, path, `expected at most ${maxLength} characters`)
    return false
  }
  if (required && value.trim().length === 0) {
    fail(errors, path, 'expected a non-empty string')
    return false
  }
  if (hasControlChars(value)) {
    fail(errors, path, 'control characters are not allowed')
    return false
  }
  return true
}

function validateNumber(
  value: unknown,
  path: string,
  min: number,
  max: number,
  errors: string[],
  integer = false,
): boolean {
  if (typeof value !== 'number' || !Number.isFinite(value) || (integer && !Number.isInteger(value))) {
    fail(errors, path, integer ? 'expected a finite integer' : 'expected a finite number')
    return false
  }
  if (value < min || value > max) {
    fail(errors, path, `expected a value between ${min} and ${max}`)
    return false
  }
  return true
}

function validateTeams(value: unknown, errors: string[]): Set<string> {
  const ids = new Set<string>()
  const path = 'variant.teams'
  if (!Array.isArray(value) || value.length !== 2) {
    fail(errors, path, 'expected exactly two teams')
    if (!Array.isArray(value)) return ids
  }

  const seen = new Set<string>()
  const count = Math.min(value.length, 2)
  for (let i = 0; i < count; i += 1) {
    const team = value[i]
    const teamPath = `${path}[${i}]`
    if (!isRecord(team)) {
      fail(errors, teamPath, 'expected an object')
      continue
    }
    if (typeof team.id === 'string') ids.add(team.id)
    if (validateId(team.id, `${teamPath}.id`, errors)) {
      if (seen.has(team.id as string)) fail(errors, `${teamPath}.id`, 'duplicate team id')
      seen.add(team.id as string)
    }
    validateText(team.name, `${teamPath}.name`, VARIANT_LIMITS.maxTeamNameLength, true, errors)
    if (typeof team.color !== 'string' || !COLOR_PATTERN.test(team.color)) {
      fail(errors, `${teamPath}.color`, 'expected a #rrggbb color')
    }
    if (typeof team.forward !== 'string' || !TEAM_FORWARDS.has(team.forward)) {
      fail(errors, `${teamPath}.forward`, 'expected "up" or "down"')
    }
  }
  return ids
}

function validateBoard(value: unknown, errors: string[]): { width: number; height: number; sizeValid: boolean } {
  const path = 'variant.board'
  if (!isRecord(value)) {
    fail(errors, path, 'expected an object')
    return { width: BOARD_MAX, height: BOARD_MAX, sizeValid: false }
  }

  const widthOk = validateNumber(value.width, `${path}.width`, BOARD_MIN, BOARD_MAX, errors, true)
  const heightOk = validateNumber(value.height, `${path}.height`, BOARD_MIN, BOARD_MAX, errors, true)
  const width = typeof value.width === 'number' ? value.width : BOARD_MAX
  const height = typeof value.height === 'number' ? value.height : BOARD_MAX
  const sizeValid = widthOk && heightOk
  if (!sizeValid) return { width, height, sizeValid }

  const tiles = value.tiles
  if (!Array.isArray(tiles) || tiles.length !== height) {
    fail(errors, `${path}.tiles`, `expected ${height} rows`)
    return { width, height, sizeValid }
  }

  for (let y = 0; y < height; y += 1) {
    const row = tiles[y]
    const rowPath = `${path}.tiles[${y}]`
    if (!Array.isArray(row) || row.length !== width) {
      fail(errors, rowPath, `expected ${width} tiles`)
      continue
    }
    for (let x = 0; x < width; x += 1) {
      const tile = row[x]
      const tilePath = `${rowPath}[${x}]`
      if (!isRecord(tile)) {
        fail(errors, tilePath, 'expected an object')
        continue
      }
      if (typeof tile.terrain !== 'string' || !TERRAINS.has(tile.terrain)) {
        fail(errors, `${tilePath}.terrain`, 'unknown terrain')
      }
      if (tile.target !== undefined) {
        if (!isRecord(tile.target)) {
          fail(errors, `${tilePath}.target`, 'expected a board position')
        } else {
          validateNumber(tile.target.x, `${tilePath}.target.x`, 0, width - 1, errors, true)
          validateNumber(tile.target.y, `${tilePath}.target.y`, 0, height - 1, errors, true)
        }
      }
    }
  }
  return { width, height, sizeValid }
}

function validatePatternList(value: unknown, path: string, errors: string[], ids = new Set<string>()): void {
  if (!Array.isArray(value)) {
    fail(errors, path, 'expected an array')
    return
  }
  if (value.length > VARIANT_LIMITS.maxPatternsPerList) {
    fail(errors, path, `expected at most ${VARIANT_LIMITS.maxPatternsPerList} patterns`)
  }

  const count = Math.min(value.length, VARIANT_LIMITS.maxPatternsPerList)
  for (let i = 0; i < count; i += 1) {
    const pattern = value[i]
    const patternPath = `${path}[${i}]`
    if (!isRecord(pattern)) {
      fail(errors, patternPath, 'expected an object')
      continue
    }
    if (validateId(pattern.id, `${patternPath}.id`, errors)) {
      if (ids.has(pattern.id as string)) fail(errors, `${patternPath}.id`, 'duplicate pattern id')
      ids.add(pattern.id as string)
    }

    const kind = pattern.kind
    if (typeof kind !== 'string' || !PATTERN_KINDS.has(kind)) {
      fail(errors, `${patternPath}.kind`, 'expected "leaper" or "slider"')
    }
    validateNumber(pattern.maxRange, `${patternPath}.maxRange`, 0, BOARD_MAX, errors, true)
    if (pattern.firstMoveOnly !== undefined && typeof pattern.firstMoveOnly !== 'boolean') {
      fail(errors, `${patternPath}.firstMoveOnly`, 'expected a boolean')
    }

    const vectors = pattern.vectors
    if (!Array.isArray(vectors)) {
      fail(errors, `${patternPath}.vectors`, 'expected an array')
      continue
    }
    if (vectors.length > VARIANT_LIMITS.maxVectorsPerPattern) {
      fail(errors, `${patternPath}.vectors`, `expected at most ${VARIANT_LIMITS.maxVectorsPerPattern} vectors`)
    }

    const seen = new Set<string>()
    const vectorCount = Math.min(vectors.length, VARIANT_LIMITS.maxVectorsPerPattern)
    const componentLimit = kind === 'slider' ? 1 : VARIANT_LIMITS.maxVector
    for (let j = 0; j < vectorCount; j += 1) {
      const vector = vectors[j]
      const vectorPath = `${patternPath}.vectors[${j}]`
      if (!isRecord(vector)) {
        fail(errors, vectorPath, 'expected an object')
        continue
      }
      const xOk = validateNumber(vector.x, `${vectorPath}.x`, -componentLimit, componentLimit, errors, true)
      const yOk = validateNumber(vector.y, `${vectorPath}.y`, -componentLimit, componentLimit, errors, true)
      if (!xOk || !yOk) continue
      const x = vector.x as number
      const y = vector.y as number
      if (x === 0 && y === 0) {
        fail(errors, vectorPath, 'the zero vector is not a movement')
        continue
      }
      const key = `${x},${y}`
      if (seen.has(key)) fail(errors, vectorPath, 'duplicate vector')
      seen.add(key)
    }
  }
}

function validateEffects(
  value: unknown,
  path: string,
  pieceIds: Set<string>,
  errors: string[],
): void {
  if (!Array.isArray(value)) {
    fail(errors, path, 'expected an array')
    return
  }
  if (value.length > VARIANT_LIMITS.maxEffectsPerPiece) {
    fail(errors, path, `expected at most ${VARIANT_LIMITS.maxEffectsPerPiece} effects`)
  }

  const count = Math.min(value.length, VARIANT_LIMITS.maxEffectsPerPiece)
  for (let i = 0; i < count; i += 1) {
    const effect = value[i]
    const effectPath = `${path}[${i}]`
    if (!isRecord(effect)) {
      fail(errors, effectPath, 'expected an object')
      continue
    }
    if (typeof effect.kind !== 'string' || !EFFECT_KINDS.has(effect.kind)) {
      fail(errors, `${effectPath}.kind`, 'unknown effect')
      continue
    }
    if (effect.kind === 'explosion') {
      validateNumber(effect.radius, `${effectPath}.radius`, 1, VARIANT_LIMITS.maxExplosionRadius, errors, true)
    } else if (effect.kind === 'spawn') {
      if (typeof effect.pieceTypeId !== 'string' || !pieceIds.has(effect.pieceTypeId)) {
        fail(errors, `${effectPath}.pieceTypeId`, 'expected an existing piece type')
      }
      if (!isRecord(effect.offset)) {
        fail(errors, `${effectPath}.offset`, 'expected an offset')
      } else {
        validateNumber(effect.offset.x, `${effectPath}.offset.x`, -VARIANT_LIMITS.maxSpawnOffset, VARIANT_LIMITS.maxSpawnOffset, errors, true)
        validateNumber(effect.offset.y, `${effectPath}.offset.y`, -VARIANT_LIMITS.maxSpawnOffset, VARIANT_LIMITS.maxSpawnOffset, errors, true)
      }
    }
  }
}

function validatePromotion(
  value: unknown,
  path: string,
  pieceIds: Set<string>,
  errors: string[],
): void {
  if (value === null) return
  if (!isRecord(value)) {
    fail(errors, path, 'expected null or an object')
    return
  }
  const typeIds = value.typeIds
  if (!Array.isArray(typeIds) || typeIds.length === 0) {
    fail(errors, `${path}.typeIds`, 'expected a non-empty array')
    return
  }
  if (typeIds.length > VARIANT_LIMITS.maxPieceTypes) {
    fail(errors, `${path}.typeIds`, `expected at most ${VARIANT_LIMITS.maxPieceTypes} choices`)
  }
  const seen = new Set<string>()
  const count = Math.min(typeIds.length, VARIANT_LIMITS.maxPieceTypes)
  for (let i = 0; i < count; i += 1) {
    const id = typeIds[i]
    const idPath = `${path}.typeIds[${i}]`
    if (typeof id !== 'string' || !pieceIds.has(id)) {
      fail(errors, idPath, 'expected an existing piece type')
      continue
    }
    if (seen.has(id)) fail(errors, idPath, 'duplicate promotion choice')
    seen.add(id)
  }
}

function validateArt(value: unknown, path: string, errors: string[]): void {
  if (!Array.isArray(value)) {
    fail(errors, path, 'expected an array')
    return
  }
  if (value.length > VARIANT_LIMITS.maxArtLayers) {
    fail(errors, path, `expected at most ${VARIANT_LIMITS.maxArtLayers} layers`)
  }
  const count = Math.min(value.length, VARIANT_LIMITS.maxArtLayers)
  for (let i = 0; i < count; i += 1) {
    const layer = value[i]
    const layerPath = `${path}[${i}]`
    if (!isRecord(layer)) {
      fail(errors, layerPath, 'expected an object')
      continue
    }
    if (typeof layer.shape !== 'string' || !ART_SHAPES.has(layer.shape)) {
      fail(errors, `${layerPath}.shape`, 'unknown shape')
    }
    validateNumber(layer.x, `${layerPath}.x`, -VARIANT_LIMITS.maxArtCoordinate, VARIANT_LIMITS.maxArtCoordinate, errors)
    validateNumber(layer.y, `${layerPath}.y`, -VARIANT_LIMITS.maxArtCoordinate, VARIANT_LIMITS.maxArtCoordinate, errors)
    validateNumber(layer.scale, `${layerPath}.scale`, 0.05, VARIANT_LIMITS.maxArtScale, errors)
    if (layer.crown !== undefined && typeof layer.crown !== 'boolean') {
      fail(errors, `${layerPath}.crown`, 'expected a boolean')
    }
  }
}

function validateImages(value: unknown, path: string, errors: string[]): void {
  if (!Array.isArray(value)) {
    fail(errors, path, 'expected an array')
    return
  }
  if (value.length > VARIANT_LIMITS.maxImagesPerPiece) {
    fail(errors, path, `expected at most ${VARIANT_LIMITS.maxImagesPerPiece} images`)
  }
  const count = Math.min(value.length, VARIANT_LIMITS.maxImagesPerPiece)
  for (let i = 0; i < count; i += 1) {
    const image = value[i]
    if (
      typeof image !== 'string' ||
      image.length > VARIANT_LIMITS.maxImageLength ||
      (image !== '' && (!IMAGE_PATTERN.test(image) || image.split('/').includes('..')))
    ) {
      fail(errors, `${path}[${i}]`, 'expected a local /pieces image path')
    }
  }
}

function validatePiece(
  piece: Record<string, unknown>,
  path: string,
  pieceIds: Set<string>,
  errors: string[],
): void {
  validateText(piece.name, `${path}.name`, VARIANT_LIMITS.maxPieceNameLength, true, errors)
  if (typeof piece.icon !== 'string' || !PIECE_ICONS.has(piece.icon)) {
    fail(errors, `${path}.icon`, 'unknown piece icon')
  }
  validateText(piece.symbol, `${path}.symbol`, VARIANT_LIMITS.maxSymbolLength, false, errors)
  validateNumber(piece.value, `${path}.value`, 0, VARIANT_LIMITS.maxPieceValue, errors)
  if (piece.lives !== undefined) {
    validateNumber(piece.lives, `${path}.lives`, 1, VARIANT_LIMITS.maxLives, errors, true)
  }
  if (piece.presentation !== undefined && piece.presentation !== 'boss') {
    fail(errors, `${path}.presentation`, 'expected "boss" when present')
  }

  const patternIds = new Set<string>()
  validatePatternList(piece.move, `${path}.move`, errors, patternIds)
  validatePatternList(piece.capture, `${path}.capture`, errors, patternIds)

  if (!isRecord(piece.flags)) {
    fail(errors, `${path}.flags`, 'expected an object')
  } else {
    for (const key of PIECE_FLAG_KEYS) {
      if (typeof piece.flags[key] !== 'boolean') {
        fail(errors, `${path}.flags.${key}`, 'expected a boolean')
      }
    }
    if (piece.flags.royal === true && piece.flags.uncapturable === true) {
      fail(errors, `${path}.flags.uncapturable`, 'a royal piece cannot be uncapturable')
    }
  }

  validateEffects(piece.effects, `${path}.effects`, pieceIds, errors)
  validatePromotion(piece.promotion, `${path}.promotion`, pieceIds, errors)
  if (piece.art !== undefined) validateArt(piece.art, `${path}.art`, errors)
  if (piece.images !== undefined) validateImages(piece.images, `${path}.images`, errors)
}

function validatePieceTypes(value: unknown, errors: string[]): Set<string> {
  const ids = new Set<string>()
  const path = 'variant.pieceTypes'
  if (!Array.isArray(value) || value.length === 0) {
    fail(errors, path, 'expected a non-empty array')
    return ids
  }
  if (value.length > VARIANT_LIMITS.maxPieceTypes) {
    fail(errors, path, `expected at most ${VARIANT_LIMITS.maxPieceTypes} piece types`)
  }

  const pieces: { index: number; piece: Record<string, unknown> }[] = []
  const count = Math.min(value.length, VARIANT_LIMITS.maxPieceTypes)
  for (let i = 0; i < count; i += 1) {
    const piece = value[i]
    const piecePath = `${path}[${i}]`
    if (!isRecord(piece)) {
      fail(errors, piecePath, 'expected an object')
      continue
    }
    if (typeof piece.id === 'string') ids.add(piece.id)
    if (validateId(piece.id, `${piecePath}.id`, errors)) {
      const duplicate = pieces.some((entry) => entry.piece.id === piece.id)
      if (duplicate) fail(errors, `${piecePath}.id`, 'duplicate piece type id')
    }
    pieces.push({ index: i, piece })
  }

  for (const { index, piece } of pieces) {
    validatePiece(piece, `${path}[${index}]`, ids, errors)
  }
  return ids
}

function validateSetup(
  value: unknown,
  pieceIds: Set<string>,
  teamIds: Set<string>,
  width: number,
  height: number,
  sizeValid: boolean,
  errors: string[],
): void {
  const path = 'variant.setup'
  if (!Array.isArray(value)) {
    fail(errors, path, 'expected an array')
    return
  }
  if (value.length > VARIANT_LIMITS.maxSetupPieces) {
    fail(errors, path, `expected at most ${VARIANT_LIMITS.maxSetupPieces} pieces`)
  }
  if (sizeValid && value.length > width * height) {
    fail(errors, path, 'cannot contain more pieces than board squares')
  }

  const occupied = new Set<string>()
  const count = Math.min(value.length, VARIANT_LIMITS.maxSetupPieces)
  for (let i = 0; i < count; i += 1) {
    const setup = value[i]
    const setupPath = `${path}[${i}]`
    if (!isRecord(setup)) {
      fail(errors, setupPath, 'expected an object')
      continue
    }
    if (typeof setup.typeId !== 'string' || !pieceIds.has(setup.typeId)) {
      fail(errors, `${setupPath}.typeId`, 'expected an existing piece type')
    }
    if (typeof setup.team !== 'string' || !teamIds.has(setup.team)) {
      fail(errors, `${setupPath}.team`, 'expected an existing team')
    }

    const xLimit = sizeValid ? width : BOARD_MAX
    const yLimit = sizeValid ? height : BOARD_MAX
    const xOk = validateNumber(setup.x, `${setupPath}.x`, 0, xLimit - 1, errors, true)
    const yOk = validateNumber(setup.y, `${setupPath}.y`, 0, yLimit - 1, errors, true)
    if (!xOk || !yOk) continue
    const key = `${setup.x as number},${setup.y as number}`
    if (occupied.has(key)) fail(errors, setupPath, 'duplicate occupied square')
    occupied.add(key)
  }
}

function validateWinConditions(value: unknown, errors: string[]): void {
  const path = 'variant.winConditions'
  if (!Array.isArray(value)) {
    fail(errors, path, 'expected an array')
    return
  }
  if (value.length > WIN_KINDS.size) {
    fail(errors, path, `expected at most ${WIN_KINDS.size} win conditions`)
  }

  const ids = new Set<string>()
  const kinds = new Set<string>()
  const count = Math.min(value.length, WIN_KINDS.size)
  for (let i = 0; i < count; i += 1) {
    const condition = value[i]
    const conditionPath = `${path}[${i}]`
    if (!isRecord(condition)) {
      fail(errors, conditionPath, 'expected an object')
      continue
    }
    if (validateId(condition.id, `${conditionPath}.id`, errors)) {
      if (ids.has(condition.id as string)) fail(errors, `${conditionPath}.id`, 'duplicate win condition id')
      ids.add(condition.id as string)
    }
    if (typeof condition.kind !== 'string' || !WIN_KINDS.has(condition.kind)) {
      fail(errors, `${conditionPath}.kind`, 'unknown win condition')
    } else {
      if (kinds.has(condition.kind)) fail(errors, `${conditionPath}.kind`, 'duplicate win condition')
      kinds.add(condition.kind)
      if (condition.threshold !== undefined) {
        if (condition.kind !== 'points') {
          fail(errors, `${conditionPath}.threshold`, 'only a points condition has a threshold')
        } else {
          validateNumber(condition.threshold, `${conditionPath}.threshold`, 1, VARIANT_LIMITS.maxPointTarget, errors)
        }
      }
    }
  }
}

function validateRules(value: unknown, errors: string[]): void {
  if (value === undefined) return
  const path = 'variant.rules'
  if (!Array.isArray(value)) {
    fail(errors, path, 'expected an array when present')
    return
  }
  if (value.length > VARIANT_RULES.size) {
    fail(errors, path, `expected at most ${VARIANT_RULES.size} rules`)
  }
  const seen = new Set<string>()
  const count = Math.min(value.length, VARIANT_RULES.size)
  for (let i = 0; i < count; i += 1) {
    const rule = value[i]
    if (typeof rule !== 'string' || !VARIANT_RULES.has(rule)) {
      fail(errors, `${path}[${i}]`, 'unknown rule')
      continue
    }
    if (seen.has(rule)) fail(errors, `${path}[${i}]`, 'duplicate rule')
    seen.add(rule)
  }
}

export function validateVariant(
  value: unknown,
  options: { onlinePlay?: boolean } = {},
): VariantValidationResult {
  const errors: string[] = []
  if (!isRecord(value)) {
    return { ok: false, errors: ['variant: expected an object'] }
  }

  if (value.schema !== 1) fail(errors, 'variant.schema', 'expected 1')
  validateId(value.id, 'variant.id', errors)
  validateText(value.name, 'variant.name', VARIANT_LIMITS.maxVariantNameLength, true, errors)
  validateText(value.description, 'variant.description', VARIANT_LIMITS.maxDescriptionLength, false, errors)

  const teamIds = validateTeams(value.teams, errors)
  const board = validateBoard(value.board, errors)
  const pieceIds = validatePieceTypes(value.pieceTypes, errors)
  validateSetup(value.setup, pieceIds, teamIds, board.width, board.height, board.sizeValid, errors)
  validateWinConditions(value.winConditions, errors)
  validateRules(value.rules, errors)

  if (value.randomSeed !== undefined) {
    validateNumber(value.randomSeed, 'variant.randomSeed', 0, 0xffffffff, errors, true)
  }

  if (!errors.length && (options.onlinePlay ?? true)) {
    const typed = value as unknown as Variant
    const line = Math.max(typed.board.width, typed.board.height)
    const costlyPiece = typed.pieceTypes.find(
      (piece) => pieceMovementComplexity(piece, line) > VARIANT_LIMITS.maxPieceMovementComplexity,
    )
    if (costlyPiece) {
      fail(
        errors,
        `variant.pieceTypes[${typed.pieceTypes.indexOf(costlyPiece)}]`,
        `one piece's movement patterns are too expensive for online play (at most ${VARIANT_LIMITS.maxPieceMovementComplexity})`,
      )
    }
    const complexity = movementComplexity(typed)
    if (complexity > VARIANT_LIMITS.maxMovementComplexity) {
      fail(
        errors,
        'variant.setup',
        `movement patterns are too expensive for online play (${complexity} > ${VARIANT_LIMITS.maxMovementComplexity})`,
      )
    }
    const amplified = amplifiedMovementComplexity(typed)
    if (amplified > VARIANT_LIMITS.maxAmplifiedMovementComplexity) {
      fail(
        errors,
        'variant.pieceTypes',
        `spawn effects can amplify movement too much for online play (${amplified} > ${VARIANT_LIMITS.maxAmplifiedMovementComplexity})`,
      )
    }
  }

  if (errors.length) return { ok: false, errors }
  return { ok: true, value: value as unknown as Variant, errors: [] }
}

export function isValidVariant(value: unknown): value is Variant {
  return validateVariant(value).ok
}
