import * as THREE from "three";

/** Actual visible LOD0 car geometry, excluding light cones/contact-shadow effects. */
export function carBounds(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  root.traverse((o) => {
    if (
      !(o instanceof THREE.Mesh) ||
      /Light_Beam|Flame|Underglow|Contact_Shadow/i.test(o.name)
    )
      return;
    for (let p: THREE.Object3D | null = o; p && p !== root; p = p.parent)
      if (/^LOD[12]$/.test(p.name) || (!p.visible && !/^LOD0$/.test(p.name)))
        return;
    box.union(new THREE.Box3().setFromObject(o));
  });
  return box;
}
export function boxCorners(box: THREE.Box3) {
  return [0, 1, 2, 3, 4, 5, 6, 7].map(
    (i) =>
      new THREE.Vector3(
        i & 1 ? box.max.x : box.min.x,
        i & 2 ? box.max.y : box.min.y,
        i & 4 ? box.max.z : box.min.z,
      ),
  );
}
/** Fit real projected corners; position is adjusted along the chosen view direction. */
export function fitCar(
  camera: THREE.PerspectiveCamera,
  box: THREE.Box3,
  rect: { x: number; y: number; width: number; height: number },
  width: number,
  height: number,
  fill = 0.62,
) {
  const center = box.getCenter(new THREE.Vector3()),
    direction = camera.position.clone().sub(center).normalize();
  camera.zoom = 1;
  camera.setViewOffset(
    width,
    height,
    width / 2 - (rect.x + rect.width / 2),
    height / 2 - (rect.y + rect.height / 2),
    width,
    height,
  );
  const corners = boxCorners(box);
  const measure = (distance: number) => {
    camera.position.copy(center).addScaledVector(direction, distance);
    camera.lookAt(center);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    const pts = corners.map((p) => p.clone().project(camera));
    return {
      width:
        ((Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x))) *
          width) /
        2,
      height:
        ((Math.max(...pts.map((p) => p.y)) - Math.min(...pts.map((p) => p.y))) *
          height) /
        2,
    };
  };
  let lo = 2,
    hi = 60;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2,
      r = measure(mid);
    if (r.width > rect.width * fill || r.height > rect.height * 0.88) lo = mid;
    else hi = mid;
  }
  measure(hi);
  // Portrait fitting must stay inside the studio walls; use a wider lens there.
  if(hi>9.5){
    camera.zoom=9.5/hi;
    for(let i=0;i<8;i++){
      const r=measure(9.5);
      camera.zoom*=Math.min(rect.width*fill/r.width,rect.height*.88/r.height);
    }
    measure(9.5);
  }
  const pts = corners.map((p) => p.clone().project(camera));
  const cx =
    (((Math.min(...pts.map((p) => p.x)) + Math.max(...pts.map((p) => p.x))) /
      2 +
      1) *
      width) /
    2;
  const cy =
    ((1 -
      (Math.min(...pts.map((p) => p.y)) + Math.max(...pts.map((p) => p.y))) /
        2) *
      height) /
    2;
  camera.view!.offsetX += cx - (rect.x + rect.width / 2);
  camera.view!.offsetY += cy - (rect.y + rect.height / 2);
  camera.updateProjectionMatrix();
  return center;
}
