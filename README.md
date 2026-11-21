# Yeti Arena

**The yeti arcade where every high score has proof.**

Sixty-second skill games. The server replays every run before a score counts, season results can be recorded on Sui, and players who reach the season threshold claim an achievement badge that can't be transferred or sold. Free to play: no wagers, no paid entry, no tokens.

Built for CLAY Hackathon III (Sui). Character art is an original yeti drawn for this project.

## Status

| Piece | State |
|---|---|
| Ice Dash (60-second lane runner), desktop and phone | Done |
| Server-verified scoring (seeded runs, input replay, plausibility checks, rate limits) | Done |
| Season and daily leaderboards, guest play | Done |
| Fair-play page with a live cheat demo | Done |
| Sui Move package `yeti_arena::arena` with 18 tests | Done, not yet published |
| Wallet connection, on-chain result submission, badge claim | Next |
| Snowball Blitz, Yeti Memory | Later, only if Ice Dash is solid |

## How a score becomes verified

1. `POST /api/runs` issues a single-use run: a random ID and seed, expiring in 3 minutes. The seed decides the course.
2. The browser runs the shared simulation (`web/src/game/sim.ts`) and records only the player's moves and the tick each happened on.
3. `POST /api/runs/:id/finish` replays those moves on the server with the same seed. The replay's score is the only one that counts.
4. Rejected: a reported score that differs from the replay; malformed, out-of-order, duplicate or late moves; more than 12 moves in any second; finishing faster than the run takes to play; expired or reused runs.
5. For the on-chain step, the server signs `"YETI_ARENA_RESULT_V1" ‖ BCS(arena, season, player, run_id, score, game_version)` with Ed25519. The Move contract verifies it, so an attestation only works for that wallet, season, run and game version, and only once.

**What this doesn't prove:** replay shows a score came from a valid sequence of moves on that course, not that a human made them. A good bot could still play. The chain proves the server attested the score. Rate limits, input checks and manual review of top scores reduce that risk; they don't remove it.

## Layout

```
web/            Next.js app: game, API, leaderboard (PGlite locally, Postgres with DATABASE_URL)
  src/game/     sim.ts (deterministic simulation), render.ts (canvas), sound.ts
  src/lib/      attest.ts (signed-result encoding), server/ (db, runs, players)
move/yeti_arena Sui Move package: arena, seasons, attested results, soulbound badges
scripts/e2e.mjs Browser end-to-end check in headless Chrome
```

## Run it

Requires Node 22.6+ and, for the contracts, the [Sui CLI](https://github.com/MystenLabs/sui/releases).

```bash
cd web && npm install && npm run dev      # http://127.0.0.1:3300
npm test                                  # simulation and attestation-encoding tests
cd ../move/yeti_arena && sui move test    # 18 Move tests
node scripts/e2e.mjs http://127.0.0.1:3300 ./shots   # from the repo root, with the app running
```

## Move package

`yeti_arena::arena`: shared `Arena` (attestor key, game version, pause switch, every used run ID) and `Season` (times, badge threshold, rules hash, best score per player). Admin: `create_arena`, `create_season`, `finalize_season`, `set_attestor`, `set_paused`, `set_game_version`. Players: `submit_attested_result`, `claim_badge`. `ScoreReceipt` and `AchievementBadge` have no `store` ability, so they can't be transferred.

Tests cover: a valid result, a lower score not replacing the best, the same run twice, another wallet using someone's attestation, a tampered score, cross-season replay, a different signing key, an old game version, before and after the season, paused arena, badge threshold, double claims, early finalisation, and claiming after finalisation. The signatures in the tests come from a fixed test-only key.

## Safety

- No wallet keys on the server. The attestor key signs results only; it holds no funds.
- No paid entry, wagers or financial rewards. Badges are cosmetic.
- Testnet first.

## Licence

MIT
