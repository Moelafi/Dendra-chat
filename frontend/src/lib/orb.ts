import { GLSL_LIB } from './shader'

/**
 * The living orb: the logo circle as a slowly breathing liquid sphere. Its edge ripples,
 * colour swirls inside it, and it is lit phosphor green from the upper right with an
 * earthy blue shadow side and a soft glow around it. Transparent outside the glow.
 */
export const ORB_FRAG = `#version 300 es
precision highp float;
uniform vec2 u_res;
uniform float u_time;
out vec4 o;
${GLSL_LIB}
void main() {
  float s = min(u_res.x, u_res.y);
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_res) / s;
  float t = u_time;

  // Edge: a breathing radius (about 6 s per breath) plus a slow ripple around the rim.
  vec2 ring = normalize(uv + 1e-5);
  float ripple = fbm(ring * 1.3 + vec2(t * 0.15, -t * 0.11)) - 0.5;
  float R = 0.34 * (1.0 + 0.025 * sin(t * 1.05)) + 0.04 * ripple;
  float r = length(uv);
  float mask = 1.0 - smoothstep(R - 1.5 / s, R + 1.5 / s, r);

  // Treat the disc as a sphere for lighting.
  vec2 q = uv / R;
  float z = sqrt(max(0.0, 1.0 - dot(q, q)));
  vec3 n = normalize(vec3(q, z));
  vec3 L = normalize(vec3(0.55, 0.6, 0.6));
  float light = clamp(dot(n, L) * 0.5 + 0.5, 0.0, 1.0);

  // Liquid interior: domain-warped noise drifting slowly.
  vec2 w = q * 0.9 + vec2(noise(q * 1.4 + t * 0.12), noise(q * 1.4 - t * 0.1 + 3.0)) * 1.1;
  float swirl = noise(w * 1.6 + t * 0.07) * 0.7 + noise(w * 3.1 - t * 0.05) * 0.3;
  float k = clamp(light * 0.9 + (swirl - 0.5) * 0.35, 0.0, 1.0);

  vec3 col = mix(BLUE, DEEP, smoothstep(0.0, 0.4, k));
  col = mix(col, MOSS, smoothstep(0.35, 0.75, k));
  col = mix(col, GREEN, smoothstep(0.72, 1.0, k));
  col += GREEN * 0.3 * pow(max(dot(reflect(-L, n), vec3(0, 0, 1)), 0.0), 24.0);
  col += MOSS * 0.3 * pow(1.0 - z, 3.0);

  // Soft glow outside the edge.
  float glow = exp(-max(r - R, 0.0) * 16.0) * 0.32 * (1.0 - mask);
  vec3 glowCol = mix(DEEP, GREEN, 0.35);

  o = vec4(col * mask + glowCol * glow, max(mask, glow));
}`

/** Very faint drifting aurora of the brand colours, with film grain. Opaque. */
export const AURORA_FRAG = `#version 300 es
precision highp float;
uniform vec2 u_res;
uniform float u_time;
out vec4 o;
${GLSL_LIB}
void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 p = vec2(uv.x * u_res.x / u_res.y, uv.y) * 1.4;
  float t = u_time * 0.04;
  vec2 warp = vec2(fbm(p + t), fbm(p - t + 5.2));
  float a = fbm(p + warp * 1.5 + vec2(t * 2.0, 0.0));
  float b = fbm(p * 1.3 - warp + vec2(0.0, t * 1.5) + 9.0);
  vec3 col = BLUE * smoothstep(0.35, 0.8, a) + MOSS * 0.6 * smoothstep(0.5, 0.9, b) + GREEN * 0.25 * smoothstep(0.65, 0.95, a * b * 1.6);
  col *= 0.2 * (0.6 + 0.6 * (1.0 - uv.y));
  col += (hash(gl_FragCoord.xy + fract(u_time) * 100.0) - 0.5) * 0.012;
  o = vec4(max(col, 0.0), 1.0);
}`
