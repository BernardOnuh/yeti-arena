/// Yeti Arena: seasonal competition records and achievement badges on Sui.
///
/// Gameplay runs off-chain. The game server replays each run, and only then signs an attestation of the verified
/// score with its Ed25519 key. This module checks that signature, binds it to the submitting wallet, the arena,
/// the season, the run and the game version, refuses any run twice, and keeps each player's best score. Badges are
/// soulbound: they have no `store` ability, so they can't be transferred or sold.
///
/// Trust assumption, stated plainly: the chain proves the server attested the score, not that the run was played
/// honestly. Server-side replay and checks are what make the score credible.
module yeti_arena::arena;

use std::string::String;
use sui::bcs;
use sui::clock::Clock;
use sui::ed25519;
use sui::event;
use sui::table::{Self, Table};

// ---------- errors ----------
const EPaused: u64 = 1;
const EWrongArena: u64 = 2;
const ESeasonNotOpen: u64 = 3;
const ESeasonFinalized: u64 = 4;
const EWrongGameVersion: u64 = 5;
const ERunAlreadyUsed: u64 = 6;
const EBadSignature: u64 = 7;
const EBelowThreshold: u64 = 8;
const EAlreadyClaimed: u64 = 9;
const EBadSeasonTimes: u64 = 10;
const ESeasonNotEnded: u64 = 11;
const EBadPublicKey: u64 = 12;

/// Prepended to every signed message so an attestation can't be reused for anything else.
const DOMAIN: vector<u8> = b"YETI_ARENA_RESULT_V1";

// ---------- objects ----------

/// Held by the arena admin. Bound to one arena.
public struct AdminCap has key, store { id: UID, arena_id: ID }

public struct Arena has key {
    id: UID,
    /// Ed25519 public key (32 bytes) of the game server that attests verified scores.
    attestor: vector<u8>,
    game_version: u64,
    paused: bool,
    /// Every run ID ever accepted, across all seasons.
    used_runs: Table<vector<u8>, bool>,
}

public struct Season has key {
    id: UID,
    arena_id: ID,
    number: u64,
    name: String,
    starts_ms: u64,
    ends_ms: u64,
    /// Best score needed to claim this season's badge.
    badge_threshold: u64,
    /// Hash of the published rules text, so the rules can't quietly change.
    rules_hash: vector<u8>,
    finalized: bool,
    best: Table<address, u64>,
    claimed: Table<address, bool>,
    results: u64,
}

/// One verified result, owned by the player. Not transferable.
public struct ScoreReceipt has key {
    id: UID,
    season_id: ID,
    player: address,
    run_id: vector<u8>,
    score: u64,
    game_version: u64,
    submitted_ms: u64,
}

/// Achievement badge. Not transferable.
public struct AchievementBadge has key {
    id: UID,
    season_id: ID,
    season_number: u64,
    season_name: String,
    player: address,
    best_score: u64,
}

/// What the game server signs: DOMAIN followed by the BCS encoding of this struct.
public struct AttestedResult has copy, drop {
    arena: ID,
    season: ID,
    player: address,
    run_id: vector<u8>,
    score: u64,
    game_version: u64,
}

// ---------- events ----------
public struct SeasonCreated has copy, drop { season_id: ID, number: u64, starts_ms: u64, ends_ms: u64, badge_threshold: u64 }
public struct ResultSubmitted has copy, drop { season_id: ID, player: address, run_id: vector<u8>, score: u64, new_best: bool }
public struct BadgeClaimed has copy, drop { season_id: ID, player: address, best_score: u64 }
public struct SeasonFinalized has copy, drop { season_id: ID, results: u64 }

// ---------- setup ----------

/// Creates the shared arena and gives the caller its admin capability.
public fun create_arena(attestor: vector<u8>, game_version: u64, ctx: &mut TxContext): AdminCap {
    assert!(attestor.length() == 32, EBadPublicKey);
    let arena = Arena { id: object::new(ctx), attestor, game_version, paused: false, used_runs: table::new(ctx) };
    let cap = AdminCap { id: object::new(ctx), arena_id: object::id(&arena) };
    transfer::share_object(arena);
    cap
}

entry fun create_arena_entry(attestor: vector<u8>, game_version: u64, ctx: &mut TxContext) {
    transfer::public_transfer(create_arena(attestor, game_version, ctx), ctx.sender());
}

// ---------- admin ----------

public fun create_season(
    cap: &AdminCap, arena: &Arena, number: u64, name: String, starts_ms: u64, ends_ms: u64,
    badge_threshold: u64, rules_hash: vector<u8>, ctx: &mut TxContext,
) {
    assert!(cap.arena_id == object::id(arena), EWrongArena);
    assert!(starts_ms < ends_ms, EBadSeasonTimes);
    let season = Season {
        id: object::new(ctx), arena_id: object::id(arena), number, name, starts_ms, ends_ms, badge_threshold,
        rules_hash, finalized: false, best: table::new(ctx), claimed: table::new(ctx), results: 0,
    };
    event::emit(SeasonCreated { season_id: object::id(&season), number, starts_ms, ends_ms, badge_threshold });
    transfer::share_object(season);
}

/// Closes a season once it has ended. Results can no longer be submitted; earned badges can still be claimed.
public fun finalize_season(cap: &AdminCap, season: &mut Season, clock: &Clock) {
    assert!(cap.arena_id == season.arena_id, EWrongArena);
    assert!(clock.timestamp_ms() >= season.ends_ms, ESeasonNotEnded);
    season.finalized = true;
    event::emit(SeasonFinalized { season_id: object::id(season), results: season.results });
}

public fun set_attestor(cap: &AdminCap, arena: &mut Arena, attestor: vector<u8>) {
    assert!(cap.arena_id == object::id(arena), EWrongArena);
    assert!(attestor.length() == 32, EBadPublicKey);
    arena.attestor = attestor;
}

public fun set_paused(cap: &AdminCap, arena: &mut Arena, paused: bool) {
    assert!(cap.arena_id == object::id(arena), EWrongArena);
    arena.paused = paused;
}

public fun set_game_version(cap: &AdminCap, arena: &mut Arena, game_version: u64) {
    assert!(cap.arena_id == object::id(arena), EWrongArena);
    arena.game_version = game_version;
}

// ---------- players ----------

/// The exact bytes the server signs for a result. Exposed so clients and tests can check their encoding.
public fun result_message(arena: ID, season: ID, player: address, run_id: vector<u8>, score: u64, game_version: u64): vector<u8> {
    let mut msg = DOMAIN;
    msg.append(bcs::to_bytes(&AttestedResult { arena, season, player, run_id, score, game_version }));
    msg
}

/// Records a server-attested result for the caller. The attestation must name the caller's address, so a
/// signature can't be submitted by anyone else; and each run counts once.
public fun submit_attested_result(
    arena: &mut Arena, season: &mut Season, run_id: vector<u8>, score: u64, game_version: u64,
    signature: vector<u8>, clock: &Clock, ctx: &mut TxContext,
) {
    assert!(!arena.paused, EPaused);
    assert!(season.arena_id == object::id(arena), EWrongArena);
    assert!(!season.finalized, ESeasonFinalized);
    let now = clock.timestamp_ms();
    assert!(now >= season.starts_ms && now < season.ends_ms, ESeasonNotOpen);
    assert!(game_version == arena.game_version, EWrongGameVersion);
    assert!(!arena.used_runs.contains(run_id), ERunAlreadyUsed);
    let player = ctx.sender();
    let msg = result_message(object::id(arena), object::id(season), player, run_id, score, game_version);
    assert!(ed25519::ed25519_verify(&signature, &arena.attestor, &msg), EBadSignature);

    arena.used_runs.add(run_id, true);
    season.results = season.results + 1;
    let new_best = if (season.best.contains(player)) {
        let best = &mut season.best[player];
        if (score > *best) { *best = score; true } else { false }
    } else {
        season.best.add(player, score);
        true
    };
    event::emit(ResultSubmitted { season_id: object::id(season), player, run_id, score, new_best });
    transfer::transfer(ScoreReceipt {
        id: object::new(ctx), season_id: object::id(season), player, run_id, score, game_version, submitted_ms: now,
    }, player);
}

/// Mints the season badge to a player whose best verified score meets the threshold. Once per player per season.
public fun claim_badge(season: &mut Season, ctx: &mut TxContext) {
    let player = ctx.sender();
    assert!(season.best.contains(player) && season.best[player] >= season.badge_threshold, EBelowThreshold);
    assert!(!season.claimed.contains(player), EAlreadyClaimed);
    season.claimed.add(player, true);
    let best_score = season.best[player];
    event::emit(BadgeClaimed { season_id: object::id(season), player, best_score });
    transfer::transfer(AchievementBadge {
        id: object::new(ctx), season_id: object::id(season), season_number: season.number, season_name: season.name,
        player, best_score,
    }, player);
}

// ---------- reads ----------
public fun best_score(season: &Season, player: address): u64 { if (season.best.contains(player)) season.best[player] else 0 }
public fun has_claimed(season: &Season, player: address): bool { season.claimed.contains(player) }
public fun is_run_used(arena: &Arena, run_id: vector<u8>): bool { arena.used_runs.contains(run_id) }
public fun results(season: &Season): u64 { season.results }
public fun badge_best_score(b: &AchievementBadge): u64 { b.best_score }
public fun receipt_score(r: &ScoreReceipt): u64 { r.score }
