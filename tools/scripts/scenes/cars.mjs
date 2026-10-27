const show = (id, pos, look = [0, 0.55, 0], extra = "") => `
  const { carById } = await import("/src/data/cars.ts");
  const { newOwned } = await import("/src/core/Save.ts");
  if (g.machine.current !== "menu") g.machine.go("menu");
  await sleep(300);
  const v = newOwned("${id}").visual; ${extra}
  g.renderer.showCar(carById("${id}"), v);
  g.renderer.stageTween = 1; g.renderer.controls.enabled = false;
  g.renderer.camera.fov = 30; g.renderer.camera.updateProjectionMatrix();
  g.renderer.camera.position.set(${pos}); g.renderer.camera.lookAt(${look});
  g.renderer.stageCar.root.rotation.y = 0;
  document.querySelector("#app").style.display = "none";
  window.__freeze = true;`;
const ids = (process.env.CARS ?? "kestrel,vanta,brutus,ronin,solace,dunerat,aurora,phantom").split(",");
export default ids.flatMap((id) => [
  [`car-${id}-front`, show(id, "6.5, 1.6, 6.5")],
  [`car-${id}-rear`, show(id, "-5.5, 1.9, -7")],
]);
