import { test } from "node:test";
import assert from "node:assert/strict";
import { resultMessage, toHex } from "../src/lib/attest.ts";

// Bytes printed by the Move module's own result_message() for the same inputs (see move/yeti_arena/tests).
test("the server's encoding matches the Move module byte for byte", () => {
  const msg = resultMessage({
    arena: "0x34401905bebdf8c04f3cd5f04f442a39372c8dc321c29edfb4f9cb30b23ab96",
    season: "0xd726ecf6f7036ee3557cd6c7b93a49b231070e8eecada9cfa157e40e3f02e5d3",
    player: "0xa11ce", runId: new TextEncoder().encode("run-1"), score: 800n, gameVersion: 1n,
  });
  assert.equal(toHex(msg), "594554495f4152454e415f524553554c545f5631034401905bebdf8c04f3cd5f04f442a39372c8dc321c29edfb4f9cb30b23ab96d726ecf6f7036ee3557cd6c7b93a49b231070e8eecada9cfa157e40e3f02e5d300000000000000000000000000000000000000000000000000000000000a11ce0572756e2d3120030000000000000100000000000000");
});
