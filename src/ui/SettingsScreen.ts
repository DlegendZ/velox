import type { Game } from "../core/Game";
import { CAMERA_NAMES } from "../render/CameraRig";
import { button, segmented, slider, toggle, keycap } from "./components";
import { esc, keyName } from "./Screens";

export function settingsContent(g: Game) {
  const s = g.save.data.settings;
  const row = (label: string, desc: string, control: string) =>
    `<div class="setting-row"><div><b>${label}</b><p>${desc}</p></div><div class="setting-control">${control}</div></div>`;
  if (g.settingsTab === "gameplay")
    return (
      row(
        "Driver name",
        "Shown in races and online lobbies.",
        `<input type="text" id="driver-name" maxlength="16" data-keep value="${esc(g.save.data.profile.name)}">`,
      ) +
      row(
        "Speed units",
        "Choose your speed display.",
        segmented(
          "units",
          [
            ["kmh", "KM/H"],
            ["mph", "MPH"],
          ],
          s.units,
          false,
          'data-setting="units"',
        ),
      ) +
      row(
        "Default camera",
        "Change view while driving with C.",
        segmented(
          "camera",
          CAMERA_NAMES.map((n, i) => [String(i), n]),
          String(s.camera),
          false,
          'data-setting="camera"',
        ),
      ) +
      row(
        "Camera shake",
        "Impact and speed feedback.",
        toggle("shake", s.shake, 'data-setting="shake"'),
      ) +
      row(
        "Colour safe positions",
        "Distinct shapes alongside rival colours.",
        toggle("colorSafe", s.colorSafe, 'data-setting="colorSafe"'),
      ) +
      Object.entries(s.assists)
        .map(([k, v]) =>
          row(
            (
              {
                steering: "Steering assist",
                traction: "Traction control",
                abs: "ABS",
                drift: "Drift assist",
                rubberband: "AI rubber banding",
              } as Record<string, string>
            )[k],
            "Adjust support while driving.",
            toggle("assist-" + k, v, `data-assist="${k}"`),
          ),
        )
        .join("")
    );
  if (g.settingsTab === "controls")
    return (
      row(
        "Show control hints",
        "Keep the driving keys visible during every race.",
        toggle(
          "showControlHints",
          s.showControlHints,
          'data-setting="showControlHints"',
        ),
      ) +
      row(
        "Manual gears",
        "Q/E or LB/RB shift while racing.",
        toggle("manual", s.manual, 'data-setting="manual"'),
      ) +
      row(
        "Steering sensitivity",
        "Response to keyboard and controller input.",
        slider(
          "sensitivity",
          s.sensitivity,
          0.4,
          1.8,
          0.1,
          'data-setting="sensitivity"',
        ),
      ) +
      row(
        "Controller deadzone",
        "Ignore small movements around centre.",
        slider(
          "deadzone",
          s.deadzone,
          0.02,
          0.35,
          0.01,
          'data-setting="deadzone"',
        ),
      ) +
      row(
        "Drag pad steering",
        "Steer by sliding a thumb instead of the arrow buttons.",
        toggle("touchDrag", s.touchDrag, 'data-setting="touchDrag"'),
      ) +
      `<div class="binding-grid">${Object.entries(s.bindings)
        .map(
          ([k, v]) =>
            `<button data-action="rebind-${k}"><span>${k.toUpperCase()}</span>${keycap(keyName(v))}</button>`,
        )
        .join(
          "",
        )}</div><p class="muted">RT gas · LT brake · A/X drift · B nitro · Y camera · R3 look back.</p>`
    );
  if (g.settingsTab === "graphics")
    return (
      row(
        "Quality",
        "Resolution, shadows, AO and scenery density.",
        segmented(
          "quality",
          ["auto", "low", "medium", "high", "ultra"].map((v) => [
            v,
            v.toUpperCase(),
          ]),
          s.quality,
          false,
          'data-setting="quality"',
        ),
      ) +
      row(
        "Field of view",
        "Chase camera base angle.",
        slider("fov", s.fov, 55, 80, 1, 'data-setting="fov"', "°"),
      ) +
      row(
        "HUD scale",
        "Size of the racing instruments.",
        slider(
          "hudScale",
          s.hudScale,
          80,
          130,
          5,
          'data-setting="hudScale"',
          "%",
        ),
      ) +
      row(
        "Rival nameplates",
        "Names above nearby cars.",
        toggle("names", s.names, 'data-setting="names"'),
      ) +
      row(
        "Fullscreen",
        "F3 opens the performance overlay.",
        button("TOGGLE FULLSCREEN", "fullscreen"),
      )
    );
  if (g.settingsTab === "audio")
    return (
      Object.entries(s.audio)
        .map(([k, v]) =>
          row(
            k.charAt(0).toUpperCase() + k.slice(1),
            "Volume of the existing synthesized mix.",
            slider("audio-" + k, v, 0, 1, 0.05, `data-audio="${k}"`),
          ),
        )
        .join("") + `<p class="muted">Now playing: ${esc(g.audio.songName)}</p>`
    );
  return row(
    "Peer connections",
    "WebRTC invite codes or a same-computer room.",
    button("OPEN ONLINE", "lobby"),
  );
}
