"use strict";(self.webpackChunk_N_E=self.webpackChunk_N_E||[]).push([[6920],{46920:(e,t,a)=>{a.r(t),a.d(t,{default:()=>p});var o=a(73027),u=a(74787),l=a(31810),i=a(82159),r=a(52862),n=a(47952);let s=`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`,v=`
precision highp float;

uniform float uTime;
uniform vec2  uRes;
uniform float uSpeed;
uniform float uComplexity;
uniform float uSwirl;
uniform float uZoom;
uniform vec3  uTint;
uniform float uHueRotation;
uniform float uSaturation;
uniform float uBrightness;
uniform vec3  uBg;
uniform float uAlpha;

varying vec2 vUv;

vec2 spin(vec2 v, float a) {
  return cos(a) * v + sin(a) * vec2(-v.y, v.x);
}

float sfrac(float x, float k) {
  float f = fract(x);
  return f * smoothstep(1.0, k, f);
}

vec3 hueRotate(vec3 col, float angle) {
  return mix(vec3(dot(vec3(0.333), col)), col, cos(angle))
       + cross(vec3(0.577), col) * sin(angle);
}

vec3 computeOrb(vec3 p, float t) {
  vec3 v = vec3(0);
  float x = 0.0;
  float y = 0.0;
  float it = uComplexity;
  float halo = smoothstep(0.5, 0.0, p.z);
  vec3 c = vec3(0);

  for (float i = 1.0; i < 9.0; i += 1.0) {
    if (i > it) break;

    p.xy = spin(p.xy, p.z * uSwirl + t / i * 0.4);
    v = v * 0.5 + 0.5;
    v.xz = spin(v.xz, v.y - x + t / i + p.y);
    p.xy = spin(p.xy, length(v.xy) - x);

    x += sfrac(v.z, 0.9 - sin(y * 1.5) * 0.2 + p.z * 0.1) / it / (1.0 + x + x * x);
    y += sfrac(-v.z, 0.9 + sin(x) * 0.1) / it;

    c += exp(vec3(0.7, 1.9, 4.0) * log(max(x, 1e-8)));
  }

  float xy = (x - y) * (x - y);
  c += xy * sqrt(max(c, 0.0));
  c = clamp(c, 0.0, 1.0);

  c = hueRotate(c, uHueRotation);

  c = mix(vec3(dot(c, vec3(0.2, 0.7, 0.1))), c, uSaturation * (1.0 + y));
  c = max(c, 0.0);

  float bgLum = dot(uBg, vec3(0.2, 0.7, 0.1));
  float rimLift = bgLum * 0.5;
  c = mix(c, sqrt(max(c, 0.0)) * 0.7 + rimLift * 0.6, halo);
  c = mix(c, sqrt(max(c, 0.0)) * 0.5 + rimLift, sqrt(halo));

  c *= uTint;

  return c;
}

void main() {
  vec4 bg = vec4(uBg, uAlpha);
  vec2 uv = (gl_FragCoord.xy * 2.0 - uRes) / min(uRes.x, uRes.y) * uZoom;
  float t = uTime * uSpeed;

  float l2 = dot(uv, uv);
  float l = sqrt(l2);

  if (l > 1.0) {
    gl_FragColor = bg;
    return;
  }

  vec3 sn = vec3(uv, sqrt(1.0 - l2));
  vec3 n = computeOrb(sn, t) * uBrightness;

  float f = length(vec2(dFdx(l), dFdy(l)));
  float edge = smoothstep(1.0 - f, 1.0 - f * 3.0, l);

  gl_FragColor = mix(bg, vec4(sqrt(max(n, 0.0)), uAlpha), edge);
}
`,c=({speed:e,complexity:t,swirl:a,zoom:i,tintRgb:n,hueRotation:c,saturation:f,brightness:m,bgRgb:p,opacity:x})=>{let g=(0,u.useRef)(null),{size:h,viewport:d}=(0,l.C)(),y=(0,u.useMemo)(()=>({uTime:{value:0},uRes:{value:new r.I9Y},uSpeed:{value:e},uComplexity:{value:t},uSwirl:{value:a},uZoom:{value:i},uTint:{value:new r.Pq0(...n)},uHueRotation:{value:c},uSaturation:{value:f},uBrightness:{value:m},uBg:{value:new r.Pq0(...p)},uAlpha:{value:x}}),[]);return(0,l.D)(o=>{let u=g.current?.material;u&&(u.uniforms.uTime.value=o.clock.elapsedTime,u.uniforms.uRes.value.set(h.width*d.dpr,h.height*d.dpr),u.uniforms.uSpeed.value=e,u.uniforms.uComplexity.value=t,u.uniforms.uSwirl.value=a,u.uniforms.uZoom.value=i,u.uniforms.uTint.value.set(...n),u.uniforms.uHueRotation.value=c,u.uniforms.uSaturation.value=f,u.uniforms.uBrightness.value=m,u.uniforms.uBg.value.set(...p),u.uniforms.uAlpha.value=x)}),(0,o.jsxs)("mesh",{ref:g,children:[(0,o.jsx)("planeGeometry",{args:[2,2]}),(0,o.jsx)("shaderMaterial",{vertexShader:s,fragmentShader:v,uniforms:y,transparent:!0})]})},f=e=>{let t=/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(e);return t?[parseInt(t[1],16)/255,parseInt(t[2],16)/255,parseInt(t[3],16)/255]:[0,0,0]},m=({width:e="100%",height:t="100%",className:a,children:l,speed:r=.5,complexity:s=3,swirl:v=2,zoom:m=1.75,color:p="#FFFFFF",hueRotation:x=4.3,saturation:g=0,brightness:h=2,backgroundColor:d="#000000",opacity:y=1})=>{let b=(0,u.useMemo)(()=>f(p),[p]),R=(0,u.useMemo)(()=>f(d),[d]);return(0,o.jsxs)("div",{className:(0,n.cn)("relative overflow-hidden",a),style:{width:e,height:t},children:[(0,o.jsx)(i.Hl,{orthographic:!0,camera:{position:[0,0,1],zoom:1,left:-1,right:1,top:1,bottom:-1},gl:{antialias:!0,alpha:!0},className:"absolute! inset-0 w-full h-full",children:(0,o.jsx)(c,{speed:r,complexity:s,swirl:v,zoom:m,tintRgb:b,hueRotation:x,saturation:g,brightness:h,bgRgb:R,opacity:y})}),l&&(0,o.jsx)("div",{className:"relative z-1 pointer-events-none",children:l})]})};m.displayName="AgenticBall";let p=m}}]);