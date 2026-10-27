import test from "node:test";
import assert from "node:assert/strict";
import { cleanRoomCode, isRoomCode, ROOM_LENGTH } from "../src/net/Session";

test("room codes accept typed variants and reject look-alike characters", () => {
  assert.equal(cleanRoomCode(" k7m-2qx "), "K7M2QX");
  assert.ok(isRoomCode(cleanRoomCode("k7m2qx")));
  assert.equal(ROOM_LENGTH, 6);
  // 0, O, 1 and I are never issued, so a code containing them is a typo.
  assert.ok(!isRoomCode("K7M2Q0"));
  assert.ok(!isRoomCode("K7M2QI"));
  assert.ok(!isRoomCode("K7M2Q"));
});
