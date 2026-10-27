import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import postcss from "postcss";

test("UI fonts never fall below 12 px and HUD text has a shadow plate", () => {
  const files = fs
    .readdirSync("src/ui/styles")
    .filter((f) => f.endsWith(".css"));
  let hudShadow = false;
  for (const file of files) {
    const root = postcss.parse(
      fs.readFileSync(`src/ui/styles/${file}`, "utf8"),
    );
    root.walkDecls((d) => {
      if (d.prop === "font-size" || d.prop === "font")
        for (const m of d.value.matchAll(/([\d.]+)(px|rem)/g))
          assert.ok(
            Number(m[1]) >= (m[2] === "px" ? 12 : 0.75),
            `${file}: ${d.parent?.toString()}`,
          );
      if (
        d.prop === "text-shadow" &&
        d.parent?.toString().includes(".race-hud")
      )
        hudShadow = true;
      if (
        d.prop === "color" &&
        /^(#fff(fff)?|white)$/i.test(d.value) &&
        d.parent?.toString().includes(".race-hud")
      )
        assert.ok(d.parent.toString().includes("text-shadow"));
    });
  }
  assert.ok(hudShadow);
});
