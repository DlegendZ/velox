// The selected §6.6 fallback builds all original assets deterministically in the browser.
// To author a GLB in the future, run CarFactory.buildProcedural(spec, visual), then pass
// its root to Three.js addons/exporters/GLTFExporter.parseAsync(root, {binary:true}).
// Preserve the named wheel hubs and paint/material/socket convention documented in §6.4.
console.log(
  "VELOX uses procedural assets. No Blender/GLB generation step is required. See src/game/CarFactory.ts.",
);
