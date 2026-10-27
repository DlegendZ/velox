import * as THREE from "three";
export function roadMaterial(
  fallback: THREE.Texture,
  weather: string,
  night: boolean,
) {
  const wet = weather === "rain";
  const material = new THREE.MeshStandardMaterial({
    color: weather === "snow" ? 0xb0b7bd : 0xa0a5aa,
    map: fallback,
    roughness: 0.86,
    metalness: wet ? 0.08 : 0.02,
    envMapIntensity: wet ? 0.55 : night ? 0.3 : 0.35,
  });
  if (typeof window !== "undefined") {
    const loader = new THREE.TextureLoader(),
      path = import.meta.env.BASE_URL + "assets/asphalt/";
    for (const [key, file] of [
      ["map", "diff"],
      ["normalMap", "nor_gl"],
      ["roughnessMap", "rough"],
    ] as const)
      loader.load(
        path + `asphalt_02_${file}_1k.jpg`,
        (texture) => {
          texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
          texture.anisotropy = 4;
          if (key === "map") texture.colorSpace = THREE.SRGBColorSpace;
          material[key] = texture;
          material.normalScale.set(0.4, 0.4);
          material.needsUpdate = true;
        },
        undefined,
        () => {},
      );
  }
  material.onBeforeCompile = (shader) => {
    shader.vertexShader =
      "attribute vec2 roadPaintUV;attribute float roadWidth;varying vec2 vRoadPaint;varying float vRoadWidth;\n" +
      shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\nvRoadPaint=roadPaintUV;vRoadWidth=roadWidth;",
    );
    shader.fragmentShader =
      "varying vec2 vRoadPaint;varying float vRoadWidth;\n" +
      shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <roughnessmap_fragment>",
      `#include <roughnessmap_fragment>
      float grime=sin(vMapUv.x*31.)*sin(vMapUv.y*8.3)*.5+.5;
      diffuseColor.rgb*=.86+grime*.14;
      float edge=min(abs(vRoadPaint.x-.03),abs(vRoadPaint.x-.97));
      float sides=1.-smoothstep(.002,.006,edge);
      float center=(1.-smoothstep(.002,.006,abs(vRoadPaint.x-.5)))*step(.48,fract(vRoadPaint.y*.5));
      float wear=.7+.3*fract(sin(dot(vRoadPaint,vec2(127.1,311.7)))*43758.5);
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.8,.82,.76),max(sides,center)*wear);
      ${wet ? "float laneEdge=min(vRoadPaint.x,1.-vRoadPaint.x)*vRoadWidth;float puddle=smoothstep(.66,.86,grime)*(1.-smoothstep(.6,1.2,laneEdge));roughnessFactor=max(.3,mix(roughnessFactor*.65,.3,puddle));" : "roughnessFactor=max(.72,roughnessFactor);"}`,
    );
  };
  material.customProgramCacheKey = () => `asphalt-${wet}`;
  return material;
}
export function strataMaterial(color: number) {
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.98 });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = "varying vec3 vRockWorld;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
    vec4 rock=vec4(transformed,1.);\n#ifdef USE_INSTANCING\nrock=instanceMatrix*rock;\n#endif\nvRockWorld=(modelMatrix*rock).xyz;`,
    );
    shader.fragmentShader =
      "varying vec3 vRockWorld;\n" + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
    vec3 weights=abs(normalize(cross(dFdx(vRockWorld),dFdy(vRockWorld))));weights/=max(.001,weights.x+weights.y+weights.z);
    vec3 grain=sin(vRockWorld.yzx*vec3(1.2,2.1,1.7))+sin(vRockWorld.zxy*vec3(2.5,1.8,2.2));
    float bands=sin(vRockWorld.y*1.7)*.1+sin(vRockWorld.y*5.3)*.035;
    diffuseColor.rgb*=.9+bands+dot(grain,weights)*.045;`,
    );
  };
  return material;
}
