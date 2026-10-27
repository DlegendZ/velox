import { Effect } from "postprocessing";
import { Uniform, Vector3 } from "three";
const shader = `
uniform vec3 lift;
uniform vec3 gain;
uniform float saturation;
uniform float grain;
uniform float clock;
uniform float blur;
uniform float haze;
void mainImage(const in vec4 inputColor,const in vec2 uv,out vec4 outputColor) {
  vec3 c=inputColor.rgb;
  if(haze>0.) {vec2 h=uv;h.x+=sin(uv.y*95.+clock*2.1)*haze*(1.-smoothstep(.02,.15,uv.y));c=texture2D(inputBuffer,h).rgb;}
  if(blur>0.001) {
    vec2 d=(uv-.5)*blur*.025;
    c=(c+texture2D(inputBuffer,uv-d).rgb+texture2D(inputBuffer,uv-d*2.).rgb+texture2D(inputBuffer,uv-d*3.).rgb)*.25;
  }
  c=max(vec3(0.),c+lift*(1.-clamp(c,0.,1.)))*gain;
  float l=dot(c,vec3(.2126,.7152,.0722));
  c=mix(vec3(l),c,saturation);
  float noise=0.;
  if(grain>.001)noise=fract(sin(dot(uv*resolution.xy,vec2(12.9898,78.233))+clock)*43758.5453)-.5;
  outputColor=vec4(c+noise*grain,inputColor.a);
}`;
export class RaceGrade extends Effect {
  private desert = false;
  constructor() {
    super("RaceGrade", shader, {
      uniforms: new Map<string, Uniform>([
        ["lift", new Uniform(new Vector3())],
        ["gain", new Uniform(new Vector3(1, 1, 1))],
        ["saturation", new Uniform(1)],
        ["grain", new Uniform(0)],
        ["clock", new Uniform(0)],
        ["blur", new Uniform(0)],
        ["haze", new Uniform(0)],
      ]),
    });
  }
  environment(id: string) {
    this.desert = id === "canyon";
    const lift = this.uniforms.get("lift")!.value as Vector3,
      gain = this.uniforms.get("gain")!.value as Vector3;
    if (id === "neon") {
      lift.set(-0.006, 0.002, 0.014);
      gain.set(1.02, 0.99, 1.04);
    } else if (id === "coast") {
      lift.set(-0.008, 0.008, 0.012);
      gain.set(1.07, 1.02, 0.95);
    } else if (id === "canyon") {
      lift.set(0.009, 0, -0.008);
      gain.set(1.07, 1.025, 0.96);
    } else {
      lift.set(0, 0, 0);
      gain.set(1, 1, 1);
    }
    this.uniforms.get("saturation")!.value = id === "canyon" ? 1.08 : 1.02;
  }
  motion(time: number, speed: number, boosting: boolean, high: boolean) {
    this.uniforms.get("haze")!.value = high && this.desert ? 0.0012 : 0;
    this.uniforms.get("clock")!.value = time;
    this.uniforms.get("grain")!.value = high ? 0.03 : 0;
    this.uniforms.get("blur")!.value = high
      ? Math.min(0.35, boosting ? 0.26 : Math.max(0, (speed - 220) / 200))
      : 0;
  }
}
