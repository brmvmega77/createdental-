(() => {
  'use strict';
  const host = document.querySelector('.team-portal');
  if (!host) return;
  const canvas = host.querySelector('canvas');
  const toggle = document.querySelector('.portal-toggle');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const gl = canvas.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: false });
  if (!gl) return;

  const vertexSource = `
    attribute vec3 aPosition;
    attribute vec3 aNormal;
    uniform mat4 uModel;
    uniform mat4 uViewProjection;
    varying vec3 vPosition;
    varying vec3 vNormal;
    void main() {
      vec4 world = uModel * vec4(aPosition, 1.0);
      vPosition = world.xyz;
      vNormal = (uModel * vec4(aNormal, 0.0)).xyz;
      gl_Position = uViewProjection * world;
    }`;
  const fragmentSource = `
    precision mediump float;
    uniform float uKind;
    uniform float uOpacity;
    uniform float uDark;
    uniform float uEnergy;
    varying vec3 vPosition;
    varying vec3 vNormal;
    void main() {
      vec3 n = normalize(vNormal);
      vec3 eye = normalize(vec3(3.8, 1.6, 7.0) - vPosition);
      vec3 light = normalize(vec3(-3.0, 5.0, 4.0));
      float diffuse = max(dot(n, light), 0.0);
      float rim = pow(1.0 - abs(dot(n, eye)), 3.0);
      float spec = pow(max(dot(n, normalize(light + eye)), 0.0), 60.0);
      if (uKind > 1.5) {
        if (vPosition.x > 0.0) discard;
        vec3 ink = mix(vec3(.32, .36, .38), vec3(.72, .77, .79), uDark);
        gl_FragColor = vec4(ink, .78 * uOpacity);
      } else if (uKind > .5) {
        if (vPosition.x < 0.0) {
          gl_FragColor = vec4(mix(vec3(.65), vec3(.8), uDark), .035 * uOpacity);
        } else {
          vec3 ceramic = vec3(.93, .92, .89) * (.78 + .22 * diffuse);
          ceramic += vec3(.16 * spec + .12 * rim);
          // A narrow polished edge marks the exact plane of material conversion.
          ceramic += vec3(.18) * (1.0 - smoothstep(0.0, .035, vPosition.x));
          gl_FragColor = vec4(ceramic, uOpacity);
        }
      } else {
        float reflection = pow(abs(dot(n, normalize(vec3(.2, 1.0, 1.3)))), 10.0);
        vec3 metal = vec3(.31, .34, .36) + vec3(.4) * diffuse + vec3(.3) * reflection;
        metal += vec3(.17 * rim + .25 * spec + .12 * uEnergy);
        gl_FragColor = vec4(metal, 1.0);
      }
    }`;

  const normalize = v => { const n = Math.hypot(...v); return v.map(x => x / n); };
  const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
  const dot = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0);
  const identity = () => new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
  const multiply = (a, b) => {
    const out = new Float32Array(16);
    for (let col=0; col<4; col++) for (let row=0; row<4; row++)
      for (let k=0; k<4; k++) out[col*4+row] += a[k*4+row]*b[col*4+k];
    return out;
  };
  const eye = [3.8, 1.6, 7];
  const z = normalize(eye), x = normalize(cross([0,1,0], z)), y = cross(z,x);
  const view = new Float32Array([x[0],y[0],z[0],0, x[1],y[1],z[1],0, x[2],y[2],z[2],0, -dot(x,eye),-dot(y,eye),-dot(z,eye),1]);

  function geometry(rows, cols, point) {
    const vertices = [], normals = [], triangles = [], wires = [];
    for (let i=0; i<=rows; i++) for (let j=0; j<=cols; j++) {
      const [p,n] = point(i/rows,j/cols);
      vertices.push(...p); normals.push(...n);
      if (i<rows && j<cols) {
        const a=i*(cols+1)+j, b=a+cols+1;
        triangles.push(a,b,a+1, a+1,b,b+1);
        if (i%4===0) wires.push(a,a+1);
        if (j%4===0) wires.push(a,b);
      }
    }
    return { vertices, normals, triangles, wires };
  }
  const ring = geometry(120,16,(u,v) => {
    const a=u*Math.PI*2, b=v*Math.PI*2, radius=1.02, tube=.052;
    const n=[Math.sin(b), Math.cos(b)*Math.cos(a), Math.cos(b)*Math.sin(a)];
    return [[tube*n[0], radius*Math.cos(a)+tube*n[1], radius*Math.sin(a)+tube*n[2]], n];
  });
  const blank = { vertices:[], normals:[], triangles:[], wires:[] };
  // Six rounded faces share one shape in both materials; the shader clips at x=0.
  for (let axis=0; axis<3; axis++) for (const sign of [-1,1]) {
    const face=geometry(16,16,(u,v) => {
      const p=[0,0,0]; p[axis]=sign; p[(axis+1)%3]=u*2-1; p[(axis+2)%3]=v*2-1;
      const inner=p.map(k=>Math.max(-.64,Math.min(.64,k)));
      const n=normalize(p.map((k,i)=>k-inner[i]));
      return [inner.map((k,i)=>(k+n[i]*.36)*.5),n];
    });
    const offset=blank.vertices.length/3;
    blank.vertices.push(...face.vertices); blank.normals.push(...face.normals);
    blank.triangles.push(...face.triangles.map(i=>i+offset)); blank.wires.push(...face.wires.map(i=>i+offset));
  }

  let program, locations, ringMesh, blankMesh;
  let visible=true, paused=false, lost=false, frame=0, previous=0, elapsed=900;
  let dark=document.documentElement.dataset.theme==='dark';
  function compile(type, source) {
    const shader=gl.createShader(type); gl.shaderSource(shader,source); gl.compileShader(shader);
    if (!gl.getShaderParameter(shader,gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
    return shader;
  }
  function upload(data) {
    const buffer=(target,array) => { const b=gl.createBuffer(); gl.bindBuffer(target,b); gl.bufferData(target,array,gl.STATIC_DRAW); return b; };
    return {
      positions:buffer(gl.ARRAY_BUFFER,new Float32Array(data.vertices)), normals:buffer(gl.ARRAY_BUFFER,new Float32Array(data.normals)),
      triangles:buffer(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(data.triangles)), wires:buffer(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(data.wires)),
      triangleCount:data.triangles.length, wireCount:data.wires.length
    };
  }
  function initialize() {
    try {
      program=gl.createProgram();
      const vs=compile(gl.VERTEX_SHADER,vertexSource), fs=compile(gl.FRAGMENT_SHADER,fragmentSource);
      gl.attachShader(program,vs); gl.attachShader(program,fs); gl.linkProgram(program);
      gl.deleteShader(vs); gl.deleteShader(fs);
      if (!gl.getProgramParameter(program,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
      locations={};
      for (const name of ['uModel','uViewProjection','uKind','uOpacity','uDark','uEnergy']) locations[name]=gl.getUniformLocation(program,name);
      locations.position=gl.getAttribLocation(program,'aPosition'); locations.normal=gl.getAttribLocation(program,'aNormal');
      ringMesh=upload(ring); blankMesh=upload(blank);
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
      gl.enable(gl.BLEND); gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
      gl.clearColor(0,0,0,0); host.dataset.ready='true'; toggle.hidden=false; lost=false;
      refresh();
    } catch (error) {
      host.dataset.ready='false'; toggle.hidden=true; lost=true;
      console.warn('Portal uses its static fallback:',error.message);
    }
  }
  function drawMesh(mesh, model, kind, opacity, wire=false) {
    gl.uniformMatrix4fv(locations.uModel,false,model); gl.uniform1f(locations.uKind,kind); gl.uniform1f(locations.uOpacity,opacity);
    gl.bindBuffer(gl.ARRAY_BUFFER,mesh.positions); gl.enableVertexAttribArray(locations.position); gl.vertexAttribPointer(locations.position,3,gl.FLOAT,false,0,0);
    gl.bindBuffer(gl.ARRAY_BUFFER,mesh.normals); gl.enableVertexAttribArray(locations.normal); gl.vertexAttribPointer(locations.normal,3,gl.FLOAT,false,0,0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,wire?mesh.wires:mesh.triangles);
    gl.drawElements(wire?gl.LINES:gl.TRIANGLES,wire?mesh.wireCount:mesh.triangleCount,gl.UNSIGNED_SHORT,0);
  }
  function render() {
    if (lost) return;
    const dpr=Math.min(devicePixelRatio||1,2), w=Math.max(1,Math.round(canvas.clientWidth*dpr)), h=Math.max(1,Math.round(canvas.clientHeight*dpr));
    if (canvas.width!==w || canvas.height!==h) { canvas.width=w; canvas.height=h; }
    gl.viewport(0,0,w,h); gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT); gl.useProgram(program);
    const f=1/Math.tan(28*Math.PI/360), near=.1, far=30;
    const projection=new Float32Array([f/(w/h),0,0,0, 0,f,0,0, 0,0,(far+near)/(near-far),-1, 0,0,2*far*near/(near-far),0]);
    gl.uniformMatrix4fv(locations.uViewProjection,false,multiply(projection,view)); gl.uniform1f(locations.uDark,dark?1:0);
    // A slow, one-directional pass; the invisible reset happens after the exit fade.
    const phase=motion.matches ? .47 : (elapsed%6400)/6400;
    const progress=Math.max(0,Math.min(1,(phase-.08)/.78));
    const position=-1.72+3.44*progress;
    const opacity=Math.min(1,phase/.09,Math.max(0,(.96-phase)/.1));
    gl.uniform1f(locations.uEnergy,Math.max(0,1-Math.abs(position)));
    drawMesh(ringMesh,identity(),0,1);
    const angle=.45+progress*.55, c=Math.cos(angle), s=Math.sin(angle), tilt=.18;
    const rotation=new Float32Array([c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1]);
    const rz=new Float32Array([Math.cos(tilt),Math.sin(tilt),0,0,-Math.sin(tilt),Math.cos(tilt),0,0,0,0,1,0,0,0,0,1]);
    const model=multiply(rz,rotation); model[12]=position;
    gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(1,1);
    drawMesh(blankMesh,model,1,opacity); gl.disable(gl.POLYGON_OFFSET_FILL);
    drawMesh(blankMesh,model,2,opacity,true);
  }
  function tick(now) {
    frame=0;
    if (previous) elapsed+=Math.min(now-previous,80);
    previous=now; render();
    if (visible && !paused && !motion.matches && !document.hidden && !lost) frame=requestAnimationFrame(tick);
  }
  function refresh() {
    cancelAnimationFrame(frame); frame=0; previous=0; render();
    if (visible && !paused && !motion.matches && !document.hidden && !lost) frame=requestAnimationFrame(tick);
  }
  toggle.addEventListener('click',()=>{
    paused=!paused; toggle.setAttribute('aria-pressed',String(paused));
    toggle.setAttribute('aria-label',paused?'Продолжить анимацию портала':'Приостановить анимацию портала'); refresh();
  });
  new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;refresh();},{threshold:.05}).observe(host);
  new ResizeObserver(refresh).observe(canvas);
  new MutationObserver(()=>{dark=document.documentElement.dataset.theme==='dark';refresh();}).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  document.addEventListener('visibilitychange',refresh); motion.addEventListener('change',refresh);
  canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();lost=true;cancelAnimationFrame(frame);host.dataset.ready='false';toggle.hidden=true;});
  canvas.addEventListener('webglcontextrestored',initialize);
  initialize();
})();
