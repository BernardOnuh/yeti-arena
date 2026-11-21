#[test_only, allow(deprecated_usage)]
module yeti_arena::arena_tests;

use sui::clock::{Self, Clock};
use sui::test_scenario::{Self as ts, Scenario};
use yeti_arena::arena::{Self, Arena, Season, AdminCap, AchievementBadge, ScoreReceipt};

const ADMIN: address = @0xAD;
const ALICE: address = @0xA11CE;
const BOB: address = @0xB0B;

// A fixed TEST-ONLY Ed25519 key (secret = 32 × 0x42), never used outside these tests. The signatures below were made
// with it over the bytes result_message() produces for these deterministic test object IDs; web/test/attest.test.ts
// checks the server encodes the same bytes.
const ATTESTOR: vector<u8> = x"2152f8d19b791d24453242e15f2eab6cb7cffa7b6a5ed30097960e069881db12";
const ARENA_ID: address = @0x034401905bebdf8c04f3cd5f04f442a39372c8dc321c29edfb4f9cb30b23ab96;
const SEASON_1: address = @0xd726ecf6f7036ee3557cd6c7b93a49b231070e8eecada9cfa157e40e3f02e5d3;
const SEASON_2: address = @0x632c124194bb45a0c9b686ab49ffcd5979aec97a58585580a916b0d6db575a4a;
const SIG_ALICE_RUN1_800: vector<u8> = x"16c76b5820ad714bc8060d9739b4e27e46c227c23edf5df4ca1b1c69a566cece0f9f46d838442109f735be7d98a1386547b513915f3957ae49fd7d1b112be609";
const SIG_ALICE_RUN2_300: vector<u8> = x"46e159ffa2d5a800b3c7747e6f5f2d5eaf8288e758ae8ea480f09b49dc3ebcd756c9ab32a2befedc432a9e11e1116393f1c30acfdccf3f7a54ff54c44c8ecd09";
const SIG_BOB_RUNB_400: vector<u8> = x"e823e203148b0a6fe5897a656db7b4afdbd4ed3c3514be650bb68c01346b6b2950593e5b9d10b8ed2d51b0fe4391e3a4b31b555e30cb2a224e5573be8f9ab10b";

/// Arena plus two seasons (both open from 1s to 1000s, badge at 500).
fun setup(): Scenario {
    let mut s = ts::begin(ADMIN);
    { let cap = arena::create_arena(ATTESTOR, 1, s.ctx()); transfer::public_transfer(cap, ADMIN); };
    s.next_tx(ADMIN);
    {
        let cap = s.take_from_sender<AdminCap>();
        let a = s.take_shared<Arena>();
        arena::create_season(&cap, &a, 1, b"Season 1".to_string(), 1000, 1_000_000, 500, x"01", s.ctx());
        arena::create_season(&cap, &a, 2, b"Season 2".to_string(), 1000, 1_000_000, 500, x"02", s.ctx());
        ts::return_shared(a); s.return_to_sender(cap);
    };
    s
}

fun clock_at(s: &mut Scenario, ms: u64): Clock { let mut c = clock::create_for_testing(s.ctx()); c.set_for_testing(ms); c }

/// Submits as `who` into `season` at time `now`.
fun submit(s: &mut Scenario, who: address, season: address, run: vector<u8>, score: u64, version: u64, sig: vector<u8>, now: u64) {
    s.next_tx(who);
    let mut a = s.take_shared_by_id<Arena>(object::id_from_address(ARENA_ID));
    let mut se = s.take_shared_by_id<Season>(object::id_from_address(season));
    let c = clock_at(s, now);
    arena::submit_attested_result(&mut a, &mut se, run, score, version, sig, &c, s.ctx());
    c.destroy_for_testing(); ts::return_shared(a); ts::return_shared(se);
}

fun best(s: &mut Scenario, who: address): u64 {
    s.next_tx(ADMIN);
    let se = s.take_shared_by_id<Season>(object::id_from_address(SEASON_1));
    let b = arena::best_score(&se, who);
    ts::return_shared(se);
    b
}

fun claim(s: &mut Scenario, who: address) {
    s.next_tx(who);
    let mut se = s.take_shared_by_id<Season>(object::id_from_address(SEASON_1));
    arena::claim_badge(&mut se, s.ctx());
    ts::return_shared(se);
}

#[test]
fun attested_result_is_recorded_and_receipt_goes_to_player() {
    let mut s = setup();
    submit(&mut s, ALICE, SEASON_1, b"run-1", 800, 1, SIG_ALICE_RUN1_800, 5000);
    assert!(best(&mut s, ALICE) == 800);
    s.next_tx(ALICE);
    let r = s.take_from_sender<ScoreReceipt>();
    assert!(arena::receipt_score(&r) == 800);
    s.return_to_sender(r);
    let a = s.take_shared_by_id<Arena>(object::id_from_address(ARENA_ID));
    assert!(arena::is_run_used(&a, b"run-1"));
    ts::return_shared(a);
    s.end();
}

#[test]
fun a_lower_score_never_replaces_the_best() {
    let mut s = setup();
    submit(&mut s, ALICE, SEASON_1, b"run-1", 800, 1, SIG_ALICE_RUN1_800, 5000);
    submit(&mut s, ALICE, SEASON_1, b"run-2", 300, 1, SIG_ALICE_RUN2_300, 6000);
    assert!(best(&mut s, ALICE) == 800);
    s.end();
}

#[test, expected_failure(abort_code = arena::ERunAlreadyUsed)]
fun the_same_run_cannot_be_submitted_twice() {
    let mut s = setup();
    submit(&mut s, ALICE, SEASON_1, b"run-1", 800, 1, SIG_ALICE_RUN1_800, 5000);
    submit(&mut s, ALICE, SEASON_1, b"run-1", 800, 1, SIG_ALICE_RUN1_800, 6000);
    s.end();
}

#[test, expected_failure(abort_code = arena::EBadSignature)]
fun another_wallet_cannot_use_someone_elses_attestation() {
    let mut s = setup();
    submit(&mut s, BOB, SEASON_1, b"run-1", 800, 1, SIG_ALICE_RUN1_800, 5000);
    s.end();
}

#[test, expected_failure(abort_code = arena::EBadSignature)]
fun a_tampered_score_fails_the_signature() {
    let mut s = setup();
    submit(&mut s, ALICE, SEASON_1, b"run-1", 9999, 1, SIG_ALICE_RUN1_800, 5000);
    s.end();
}

#[test, expected_failure(abort_code = arena::EBadSignature)]
fun an_attestation_for_one_season_is_refused_in_another() {
    let mut s = setup();
    submit(&mut s, ALICE, SEASON_2, b"run-1", 800, 1, SIG_ALICE_RUN1_800, 5000);
    s.end();
}

#[test, expected_failure(abort_code = arena::EBadSignature)]
fun a_signature_from_another_key_is_refused() {
    let mut s = setup();
    s.next_tx(ADMIN);
    let cap = s.take_from_sender<AdminCap>();
    let mut a = s.take_shared_by_id<Arena>(object::id_from_address(ARENA_ID));
    arena::set_attestor(&cap, &mut a, x"1111111111111111111111111111111111111111111111111111111111111111");
    ts::return_shared(a); s.return_to_sender(cap);
    submit(&mut s, ALICE, SEASON_1, b"run-1", 800, 1, SIG_ALICE_RUN1_800, 5000);
    s.end();
}

#[test, expected_failure(abort_code = arena::EWrongGameVersion)]
fun results_from_an_old_game_version_are_refused() {
    let mut s = setup();
    submit(&mut s, ALICE, SEASON_1, b"run-1", 800, 2, SIG_ALICE_RUN1_800, 5000);
    s.end();
}

#[test, expected_failure(abort_code = arena::ESeasonNotOpen)]
fun nothing_counts_before_the_season_starts() {
    let mut s = setup();
    submit(&mut s, ALICE, SEASON_1, b"run-1", 800, 1, SIG_ALICE_RUN1_800, 500);
    s.end();
}

#[test, expected_failure(abort_code = arena::ESeasonNotOpen)]
fun nothing_counts_after_the_season_ends() {
    let mut s = setup();
    submit(&mut s, ALICE, SEASON_1, b"run-1", 800, 1, SIG_ALICE_RUN1_800, 1_000_000);
    s.end();
}

#[test, expected_failure(abort_code = arena::EPaused)]
fun a_paused_arena_takes_no_results() {
    let mut s = setup();
    s.next_tx(ADMIN);
    let cap = s.take_from_sender<AdminCap>();
    let mut a = s.take_shared_by_id<Arena>(object::id_from_address(ARENA_ID));
    arena::set_paused(&cap, &mut a, true);
    ts::return_shared(a); s.return_to_sender(cap);
    submit(&mut s, ALICE, SEASON_1, b"run-1", 800, 1, SIG_ALICE_RUN1_800, 5000);
    s.end();
}

#[test]
fun a_player_over_the_threshold_gets_one_badge() {
    let mut s = setup();
    submit(&mut s, ALICE, SEASON_1, b"run-1", 800, 1, SIG_ALICE_RUN1_800, 5000);
    claim(&mut s, ALICE);
    s.next_tx(ALICE);
    let b = s.take_from_sender<AchievementBadge>();
    assert!(arena::badge_best_score(&b) == 800);
    s.return_to_sender(b);
    s.end();
}

#[test, expected_failure(abort_code = arena::EAlreadyClaimed)]
fun a_badge_cannot_be_claimed_twice() {
    let mut s = setup();
    submit(&mut s, ALICE, SEASON_1, b"run-1", 800, 1, SIG_ALICE_RUN1_800, 5000);
    claim(&mut s, ALICE);
    claim(&mut s, ALICE);
    s.end();
}

#[test, expected_failure(abort_code = arena::EBelowThreshold)]
fun a_score_below_the_threshold_earns_no_badge() {
    let mut s = setup();
    submit(&mut s, BOB, SEASON_1, b"run-b", 400, 1, SIG_BOB_RUNB_400, 5000);
    claim(&mut s, BOB);
    s.end();
}

#[test, expected_failure(abort_code = arena::EBelowThreshold)]
fun a_player_with_no_results_earns_no_badge() {
    let mut s = setup();
    claim(&mut s, BOB);
    s.end();
}

#[test, expected_failure(abort_code = arena::ESeasonNotEnded)]
fun a_season_cannot_be_finalized_early() {
    let mut s = setup();
    s.next_tx(ADMIN);
    let cap = s.take_from_sender<AdminCap>();
    let mut se = s.take_shared_by_id<Season>(object::id_from_address(SEASON_1));
    let c = clock_at(&mut s, 5000);
    arena::finalize_season(&cap, &mut se, &c);
    c.destroy_for_testing(); ts::return_shared(se); s.return_to_sender(cap);
    s.end();
}

#[test]
fun badges_can_still_be_claimed_after_finalizing() {
    let mut s = setup();
    submit(&mut s, ALICE, SEASON_1, b"run-1", 800, 1, SIG_ALICE_RUN1_800, 5000);
    s.next_tx(ADMIN);
    let cap = s.take_from_sender<AdminCap>();
    let mut se = s.take_shared_by_id<Season>(object::id_from_address(SEASON_1));
    let c = clock_at(&mut s, 1_000_000);
    arena::finalize_season(&cap, &mut se, &c);
    c.destroy_for_testing(); ts::return_shared(se); s.return_to_sender(cap);
    claim(&mut s, ALICE);
    s.end();
}

#[test, expected_failure(abort_code = arena::EBadPublicKey)]
fun the_attestor_key_must_be_32_bytes() {
    let mut s = ts::begin(ADMIN);
    let cap = arena::create_arena(x"01", 1, s.ctx());
    transfer::public_transfer(cap, ADMIN);
    s.end();
}
