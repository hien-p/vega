"use strict";(self.webpackChunk_N_E=self.webpackChunk_N_E||[]).push([[1327],{21327:(e,u,l)=>{l.r(u),l.d(u,{default:()=>c});var o=l(73027),a=l(74787),r=l(31810),t=l(82159),n=l(52862);let i=[{color:"#00ff4d",speed:.37,intensity:.5},{color:"#66b3ff",speed:.15,intensity:.35},{color:"#d438ff",speed:.2,intensity:.1},{color:"#1acbae",speed:.07,intensity:.15}],s=[{color:"#5f2762",blend:.5},{color:"#263031",blend:.5}],v=`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`,y=`
precision highp float;
varying vec2 vUv;
uniform float u_time;
uniform vec2 u_resolution;
uniform float u_speed;
uniform vec3 u_layer1Color;
uniform float u_layer1Speed;
uniform float u_layer1Intensity;
uniform vec3 u_layer2Color;
uniform float u_layer2Speed;
uniform float u_layer2Intensity;
uniform vec3 u_layer3Color;
uniform float u_layer3Speed;
uniform float u_layer3Intensity;
uniform vec3 u_layer4Color;
uniform float u_layer4Speed;
uniform float u_layer4Intensity;
uniform float u_noiseScale;
uniform float u_movementX;
uniform float u_movementY;
uniform float u_verticalFade;
uniform float u_bloomIntensity;
uniform vec3 u_skyColor1;
uniform vec3 u_skyColor2;
uniform float u_skyBlend1;
uniform float u_skyBlend2;
uniform float u_brightness;
uniform float u_saturation;
uniform float u_opacity;

float h(float n){return fract(sin(n)*43758.5453);}

float n2d(vec2 p){
  vec2 i=floor(p),f=fract(p),u=f*f*(3.-2.*f);
  return mix(mix(h(i.x+h(i.y)),h(i.x+1.+h(i.y)),u.x),
             mix(h(i.x+h(i.y+1.)),h(i.x+1.+h(i.y+1.)),u.x),u.y);
}

vec3 aurora(vec2 uv,float spd,float intensity,vec3 col,float aspect){
  float t=u_time*u_speed*spd;
  vec2 scaled=vec2(uv.x*aspect,uv.y)*u_noiseScale;
  vec2 p=scaled+t*vec2(u_movementX,u_movementY);
  float n=n2d(p+n2d(col.xy+p+t));
  float a=n-uv.y*u_verticalFade;
  return col*a*intensity*u_bloomIntensity;
}

vec3 sat(vec3 c,float s){
  float g=dot(c,vec3(0.299,0.587,0.114));
  return mix(vec3(g),c,s);
}

void main(){
  vec2 uv=vUv;
  float aspect=u_resolution.x/u_resolution.y;

  vec3 c=vec3(0.);
  c+=aurora(uv,u_layer1Speed,u_layer1Intensity,u_layer1Color,aspect);
  c+=aurora(uv,u_layer2Speed,u_layer2Intensity,u_layer2Color,aspect);
  c+=aurora(uv,u_layer3Speed,u_layer3Intensity,u_layer3Color,aspect);
  c+=aurora(uv,u_layer4Speed,u_layer4Intensity,u_layer4Color,aspect);

  c+=u_skyColor2*(1.-smoothstep(u_skyBlend1,1.,uv.y));
  c+=u_skyColor1*(1.-smoothstep(0.,u_skyBlend2,uv.y));

  c=sat(c,u_saturation)*u_brightness;

  gl_FragColor=vec4(c,u_opacity);
}
`;function f(e){let u=/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(e);return u?[parseInt(u[1],16)/255,parseInt(u[2],16)/255,parseInt(u[3],16)/255]:[1,1,1]}let _=({speed:e,layers:u,noiseScale:l,movementX:t,movementY:i,verticalFade:s,bloomIntensity:_,skyLayers:m,brightness:c,saturation:d,opacity:p})=>{let h=(0,a.useRef)(null),{size:C}=(0,r.C)(),x=(0,a.useMemo)(()=>({u_time:{value:0},u_resolution:{value:new n.I9Y(1,1)},u_speed:{value:1},u_layer1Color:{value:new n.Pq0(0,1,.3)},u_layer1Speed:{value:.05},u_layer1Intensity:{value:.3},u_layer2Color:{value:new n.Pq0(.1,.5,.9)},u_layer2Speed:{value:.1},u_layer2Intensity:{value:.4},u_layer3Color:{value:new n.Pq0(.4,.1,.8)},u_layer3Speed:{value:.15},u_layer3Intensity:{value:.3},u_layer4Color:{value:new n.Pq0(.8,.1,.6)},u_layer4Speed:{value:.07},u_layer4Intensity:{value:.2},u_noiseScale:{value:2},u_movementX:{value:2},u_movementY:{value:-2},u_verticalFade:{value:.6},u_bloomIntensity:{value:2},u_skyColor1:{value:new n.Pq0(.2,0,.4)},u_skyColor2:{value:new n.Pq0(.15,.2,.35)},u_skyBlend1:{value:.4},u_skyBlend2:{value:.5},u_brightness:{value:1},u_saturation:{value:1},u_opacity:{value:1}}),[]);return(0,r.D)(o=>{if(!h.current)return;let a=h.current.material;a.uniforms.u_time.value=o.clock.elapsedTime,a.uniforms.u_resolution.value.set(C.width,C.height),a.uniforms.u_speed.value=e,a.uniforms.u_layer1Color.value.set(...f(u[0]?.color||"#000")),a.uniforms.u_layer1Speed.value=u[0]?.speed||0,a.uniforms.u_layer1Intensity.value=u[0]?.intensity||0,a.uniforms.u_layer2Color.value.set(...f(u[1]?.color||"#000")),a.uniforms.u_layer2Speed.value=u[1]?.speed||0,a.uniforms.u_layer2Intensity.value=u[1]?.intensity||0,a.uniforms.u_layer3Color.value.set(...f(u[2]?.color||"#000")),a.uniforms.u_layer3Speed.value=u[2]?.speed||0,a.uniforms.u_layer3Intensity.value=u[2]?.intensity||0,a.uniforms.u_layer4Color.value.set(...f(u[3]?.color||"#000")),a.uniforms.u_layer4Speed.value=u[3]?.speed||0,a.uniforms.u_layer4Intensity.value=u[3]?.intensity||0,a.uniforms.u_noiseScale.value=l,a.uniforms.u_movementX.value=t,a.uniforms.u_movementY.value=i,a.uniforms.u_verticalFade.value=s,a.uniforms.u_bloomIntensity.value=_,a.uniforms.u_skyColor1.value.set(...f(m[0]?.color||"#000")),a.uniforms.u_skyColor2.value.set(...f(m[1]?.color||"#000")),a.uniforms.u_skyBlend1.value=m[1]?.blend||0,a.uniforms.u_skyBlend2.value=m[0]?.blend||0,a.uniforms.u_brightness.value=c,a.uniforms.u_saturation.value=d,a.uniforms.u_opacity.value=p}),(0,o.jsxs)("mesh",{ref:h,children:[(0,o.jsx)("planeGeometry",{args:[2,2]}),(0,o.jsx)("shaderMaterial",{vertexShader:v,fragmentShader:y,uniforms:x,transparent:!0})]})},m=({width:e="100%",height:u="100%",className:l,children:a,speed:r=1.5,layers:n=i,noiseScale:v=3.5,movementX:y=-2,movementY:f=-3,verticalFade:m=.75,bloomIntensity:c=2,skyLayers:d=s,brightness:p=.8,saturation:h=1,opacity:C=1})=>{let x="number"==typeof e?`${e}px`:e,I="number"==typeof u?`${u}px`:u;return(0,o.jsxs)("div",{className:`relative overflow-hidden ${l||""}`,style:{width:x,height:I},children:[(0,o.jsx)(t.Hl,{className:"absolute inset-0 w-full h-full",gl:{antialias:!0,alpha:!0},orthographic:!0,camera:{position:[0,0,1],zoom:1,left:-1,right:1,top:1,bottom:-1},children:(0,o.jsx)(_,{speed:r,layers:n,noiseScale:v,movementX:y,movementY:f,verticalFade:m,bloomIntensity:c,skyLayers:d,brightness:p,saturation:h,opacity:C})}),a&&(0,o.jsx)("div",{className:"relative z-10",children:a})]})};m.displayName="AuroraBlur";let c=m}}]);