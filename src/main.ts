import "@fontsource-variable/saira/wdth.css";
import "@fontsource-variable/saira/wdth-italic.css";
import "@fontsource/saira-condensed/600.css";
import "@fontsource/saira-condensed/700.css";
import "@fontsource/saira-condensed/800.css";
import "@fontsource-variable/inter";
import "./ui/styles/tokens.css";
import "./ui/styles/base.css";
import "./ui/styles/menu.css";
import "./ui/styles/garage.css";
import "./ui/styles/hud.css";
import "./ui/styles/overlays.css";
import "./ui/styles/polish.css";
import "./ui/styles/refine.css";
import "./ui/styles/phone.css";
import { AssetLoader } from "./core/AssetLoader";
import { bootScreen, setGauge } from "./ui/Loader";
import { installMobile } from "./ui/Mobile";
installMobile();
const app = document.querySelector<HTMLElement>("#app")!;
app.innerHTML = bootScreen();
const loader = new AssetLoader(2, (n, label) =>
  // Each step may creep most of the way to the next while it runs.
  setGauge(app, n / 100, label, Math.min(0.96, n / 100 + 0.42)),
);
async function boot() {
  await loader.load("Loading physics engine", async () => {
    const r = await import("@dimforge/rapier3d-compat");
    await r.default.init();
  });
  const { Game } = await loader.load(
    "Preparing the streets",
    () => import("./core/Game"),
  );
  // Let the needle reach the limiter before the title screen takes over.
  setGauge(app, 1, "Ready to race");
  await new Promise((r) => setTimeout(r, 450));
  const game = new Game(
    app,
    document.querySelector<HTMLCanvasElement>("#world")!,
  );
  if (import.meta.env.DEV) Object.assign(window, { __velox: game });
}
boot().catch((e) => {
  console.error(e);
  app.innerHTML =
    '<div class="boot"><strong>VELOX</strong><h2>Engine could not start</h2><p>Use a browser with WebGL 2 enabled, then reload.</p><button onclick="location.reload()">Try again</button></div>';
});
