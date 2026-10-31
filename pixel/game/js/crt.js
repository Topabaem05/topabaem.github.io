/* CRT screen for The Lamp of Dawn: WebGL post-process of the 480x270 game canvas.
   Barrel curvature, rounded bezel, scanlines, RGB aperture mask, phosphor bloom, chromatic offset,
   vignette, subtle flicker and a power-on animation. Falls back to a CSS overlay without WebGL. */
(function () {
'use strict';
const VS = `attribute vec2 p; varying vec2 v; void main(){ v = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;
const FS = `precision mediump float;
varying vec2 v;
uniform sampler2D tex; uniform vec2 src; uniform vec2 res; uniform float time, power, flick, mask, curve, bezel;
vec3 smp(vec2 uv){
  // sharp-bilinear: crisp pixel cores with a soft, phosphor-like edge
  vec2 px = uv * src; vec2 c = floor(px) + 0.5; vec2 f = px - c;
  vec2 k = clamp(f * 2.6, -0.5, 0.5); return texture2D(tex, (c + k) / src).rgb;
}
void main(){
  vec2 uv = vec2(v.x, 1.0 - v.y);
  // inner screen area inside the bezel, then barrel distortion
  vec2 m = vec2(bezel * res.y / res.x, bezel);
  vec2 s = (uv - m) / (1.0 - 2.0 * m);
  vec2 d = s - 0.5; float r2 = dot(d, d);
  vec2 q = 0.5 + d * (1.0 + curve * r2) / (1.0 + curve * 0.5);
  // rounded-rect screen mask
  vec2 e = abs(q - 0.5) * 2.0; vec2 rr = max(e - vec2(1.0 - 0.06 * res.y / res.x, 0.94), 0.0) / vec2(0.06 * res.y / res.x, 0.06);
  float edge = length(rr); float inside = step(max(e.x, e.y), 1.0) * (1.0 - smoothstep(0.96, 1.0, edge));
  // bezel: dark warm plastic with a soft inner glow reflected from the picture
  vec2 bd = abs(uv - 0.5) * 2.0; float bz = 0.05 + 0.05 * (1.0 - max(bd.x, bd.y)); vec3 bezelCol = vec3(0.09, 0.08, 0.07) * (0.6 + bz * 6.0);
  float glow = exp(-max(edge - 1.0, 0.0) * 18.0) * (1.0 - inside); 
  // power-on: a bright line opens horizontally, then vertically
  float pw = power; float vis = 1.0; float boost = 0.0;
  if (pw < 1.0) {
    float a = clamp(pw / 0.35, 0.0, 1.0), b = clamp((pw - 0.35) / 0.65, 0.0, 1.0);
    float hy = mix(0.004, 0.5, b * b); float hx = mix(0.0, 0.5, a);
    vis = step(abs(q.y - 0.5), hy) * step(abs(q.x - 0.5), hx);
    boost = (1.0 - b) * 2.5;
  }
  // chromatic offset grows toward the edges
  vec2 co = (q - 0.5) * 0.9 / src.x * (0.6 + r2 * 2.0);
  vec3 col = vec3(smp(q + co).r, smp(q).g, smp(q - co).b);
  // phosphor bloom from a small blur of the neighbours
  vec2 o = 1.25 / src; vec3 bl = smp(q + vec2(o.x, 0.0)) + smp(q - vec2(o.x, 0.0)) + smp(q + vec2(0.0, o.y)) + smp(q - vec2(0.0, o.y))
    + 0.7 * (smp(q + o) + smp(q - o) + smp(q + vec2(o.x, -o.y)) + smp(q + vec2(-o.x, o.y)));
  bl /= 6.8; col += bl * bl * 0.55;
  // scanlines: the beam widens on bright pixels so text stays readable
  float lum = dot(col, vec3(0.3, 0.55, 0.15)); float sy = fract(q.y * src.y) - 0.5;
  float w = 0.30 + 0.20 * clamp(lum, 0.0, 1.0); float scan = exp(-(sy * sy) / (2.0 * w * w));
  col *= mix(0.62, 1.12, scan);
  // aperture grille (RGB triads per output pixel)
  float tri = mod(floor(v.x * res.x), 3.0); vec3 am = tri < 1.0 ? vec3(1.0, 1.0 - mask, 1.0 - mask) : tri < 2.0 ? vec3(1.0 - mask, 1.0, 1.0 - mask) : vec3(1.0 - mask, 1.0 - mask, 1.0);
  col *= am * (1.0 + mask * 0.9);
  // vignette + flicker
  col *= 1.0 - 0.55 * r2 * r2 * 4.0 - 0.18 * r2;
  col *= 1.0 + flick * (0.012 * sin(time * 377.0) + 0.008 * sin(time * 61.0));
  col = col * vis + vec3(boost) * vis;
  vec3 picture = col * inside;
  vec3 frame = bezelCol + glow * 0.12 * vec3(0.9, 0.8, 0.7);
  gl_FragColor = vec4(mix(frame, picture, inside), 1.0);
}`;
const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const CRT = { gl: null, on: true, ok: false, power: reduce ? 1 : 0, t0: 0 };
CRT.init = function (srcCanvas, wrap, opts) {
  opts = opts || {}; CRT.src = srcCanvas; CRT.wrap = wrap;
  try { const v = localStorage.getItem('lamp_crt'); if (v !== null) CRT.on = v === '1'; } catch (e) { /* */ }
  if (opts.force !== undefined) CRT.on = opts.force;
  const c = document.createElement('canvas'); c.id = 'crt'; c.setAttribute('aria-hidden', 'true');
  c.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;';
  const gl = c.getContext('webgl', { preserveDrawingBuffer: true, antialias: false, alpha: false }) || c.getContext('experimental-webgl');
  if (gl) {
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
    try {
      const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr);
      if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
      gl.useProgram(pr);
      const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      const tx = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tx);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      CRT.U = {}; for (const n of ['tex', 'src', 'res', 'time', 'power', 'flick', 'mask', 'curve', 'bezel']) CRT.U[n] = gl.getUniformLocation(pr, n);
      CRT.gl = gl; CRT.ok = true;
    } catch (e) { console.warn('CRT shader unavailable, using CSS fallback'); CRT.ok = false; }
  }
  CRT.canvas = c; if (CRT.ok) wrap.appendChild(c);
  CRT.apply(); return CRT;
};
CRT.apply = function () {
  const w = CRT.wrap; if (!w) return;
  w.classList.toggle('crt-gl', CRT.on && CRT.ok); w.classList.toggle('crt', CRT.on && !CRT.ok);
  if (CRT.canvas) CRT.canvas.style.display = CRT.on && CRT.ok ? 'block' : 'none';
  if (CRT.on && !CRT.ok && !reduce) { w.classList.remove('crt-pow'); void w.offsetWidth; w.classList.add('crt-pow'); }
};
CRT.toggle = function () { CRT.on = !CRT.on; try { localStorage.setItem('lamp_crt', CRT.on ? '1' : '0'); } catch (e) { /* */ } if (CRT.on) CRT.power = reduce ? 1 : 0.2; CRT.apply(); return CRT.on; };
CRT.resize = function (cssW, cssH) {
  if (!CRT.ok) return; const dpr = Math.min(2, window.devicePixelRatio || 1);
  CRT.canvas.width = Math.max(2, Math.round(cssW * dpr)); CRT.canvas.height = Math.max(2, Math.round(cssH * dpr));
};
CRT.frame = function (dt) {
  if (!CRT.on || !CRT.ok) return; const gl = CRT.gl, U = CRT.U, c = CRT.canvas;
  if (CRT.power < 1) CRT.power = Math.min(1, CRT.power + (dt || 1 / 60) / 0.9);
  CRT.t0 += dt || 1 / 60;
  gl.viewport(0, 0, c.width, c.height);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, CRT.src);
  const pxPerSrc = c.height / CRT.src.height;
  gl.uniform1i(U.tex, 0); gl.uniform2f(U.src, CRT.src.width, CRT.src.height); gl.uniform2f(U.res, c.width, c.height);
  gl.uniform1f(U.time, CRT.t0); gl.uniform1f(U.power, CRT.power); gl.uniform1f(U.flick, reduce ? 0 : 1);
  gl.uniform1f(U.mask, pxPerSrc >= 3 ? 0.22 : pxPerSrc >= 2 ? 0.12 : 0.0); gl.uniform1f(U.curve, 0.075); gl.uniform1f(U.bezel, 0.028);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
};
window.CRT = CRT;
})();
