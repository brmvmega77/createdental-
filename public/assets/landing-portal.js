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
    varying vec3 vLocal;
    void main() {
      vec4 world = uModel * vec4(aPosition, 1.0);
      vPosition = world.xyz;
      vLocal = aPosition;
      vNormal = (uModel * vec4(aNormal, 0.0)).xyz;
      gl_Position = uViewProjection * world;
    }`;
  const fragmentSource = `
    precision mediump float;
    uniform float uKind;
    uniform float uOpacity;
    uniform float uDark;
    varying vec3 vPosition;
    varying vec3 vNormal;
    varying vec3 vLocal;
    void main() {
      vec3 n = normalize(vNormal);
      vec3 eye = normalize(vec3(3.8, 1.6, 7.0) - vPosition);
      vec3 light = normalize(vec3(-3.0, 5.0, 4.0));
      float diffuse = max(dot(n, light), 0.0);
      float rim = pow(1.0 - abs(dot(n, eye)), 3.0);
      float spec = pow(max(dot(n, normalize(light + eye)), 0.0), 60.0);
      if (uKind > 1.5) {
        if (vPosition.x < 0.0) discard;
        vec3 ink = mix(vec3(.32, .36, .38), vec3(.72, .77, .79), uDark);
        gl_FragColor = vec4(ink, .78 * uOpacity);
      } else if (uKind > .5) {
        if (vPosition.x > 0.0) {
          gl_FragColor = vec4(mix(vec3(.65), vec3(.8), uDark), .035 * uOpacity);
        } else {
          float fossa = smoothstep(.10,.17,vLocal.y) * (1.0-smoothstep(.23,.43,vLocal.y));
          vec3 ivory = mix(vec3(.98,.955,.89),vec3(.90,.82,.66),.12*fossa);
          vec3 ceramic = ivory * (.75 + .25 * diffuse);
          ceramic += vec3(.16 * spec + .12 * rim);
          // A narrow polished edge marks the exact plane of material conversion.
          ceramic += vec3(.18) * (1.0 - smoothstep(0.0, .035, -vPosition.x));
          gl_FragColor = vec4(ceramic, uOpacity);
        }
      } else gl_FragColor = vec4(0.0);
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
  const crown = { vertices:[], normals:[], triangles:[], wires:[] };
  const gaussian = (x,z,cx,cz,sx,sz) => Math.exp(-(((x-cx)/sx)**2+((z-cz)/sz)**2));
  // Rounded molar outline, four unequal cusps and a central occlusal fossa.
  const outline = angle => .52 / (Math.abs(Math.cos(angle))**2.8 + Math.abs(Math.sin(angle))**2.8)**(1/2.8);
  const chewingSurface = (x,z,r) => .145 + .025*r
    + .30*gaussian(x,z,-.26,-.23,.22,.21)
    + .36*gaussian(x,z,.25,-.22,.21,.22)
    + .27*gaussian(x,z,-.27,.24,.22,.20)
    + .30*gaussian(x,z,.26,.23,.21,.21)
    + .075*Math.exp(-(((r-.88)/.14)**2))
    - .025*Math.exp(-(((x+.035*Math.sin(z*9))/.035)**2))*Math.exp(-((z/.32)**4));
  const topPoint = (u,v) => {
    const angle=u*Math.PI*2, radius=outline(angle)*v;
    const x=radius*Math.cos(angle), z=radius*Math.sin(angle)*.92;
    return [x,chewingSurface(x,z,v),z];
  };
  const sidePoint = (u,v) => {
    const angle=u*Math.PI*2, edge=topPoint(u,1);
    const width=1-.12*(1-v)**4+.055*Math.sin(Math.PI*v);
    return [edge[0]*width, -.49+(edge[1]+.49)*v, edge[2]*width];
  };
  function surface(rows,cols,point,inward=false) {
    const result=geometry(rows,cols,(u,v) => {
      const step=.0001;
      const a=point(u+step,v), b=point(u-step,v);
      const c=point(u,Math.min(1,v+step)), d=point(u,Math.max(.00001,v-step));
      const tangent=a.map((n,i)=>n-b[i]), radial=c.map((n,i)=>n-d[i]);
      let normal=cross(tangent,radial);
      if (Math.hypot(...normal)<1e-8) normal=[0,1,0];
      else normal=normalize(normal);
      if (inward) normal=normal.map(n=>-n);
      return [point(u,v),normal];
    });
    const offset=crown.vertices.length/3;
    crown.vertices.push(...result.vertices); crown.normals.push(...result.normals);
    crown.triangles.push(...result.triangles.map(i=>i+offset));
    crown.wires.push(...result.wires.map(i=>i+offset));
    return {offset,rows,cols};
  }
  const chewingMesh=surface(96,32,topPoint);
  const wallMesh=surface(96,24,sidePoint,true);
  // Share the normals at the shoulder so polished enamel has no artificial seam.
  for (let row=0; row<=96; row++) {
    const normalIndex=mesh=>(mesh.offset+row*(mesh.cols+1)+mesh.cols)*3;
    const a=normalIndex(chewingMesh), b=normalIndex(wallMesh);
    const average=normalize([0,1,2].map(k=>crown.normals[a+k]+crown.normals[b+k]));
    for (const mesh of [chewingMesh,wallMesh]) {
      for (let col=mesh.cols-3; col<=mesh.cols; col++) {
        const index=(mesh.offset+row*(mesh.cols+1)+col)*3, blend=(col-mesh.cols+3)/3;
        const n=normalize(average.map((k,i)=>crown.normals[index+i]*(1-blend)+k*blend));
        crown.normals.splice(index,3,...n);
      }
    }
  }
  // A crown is a hollow restoration: retain a thin cervical rim and inner cavity.
  surface(96,6,(u,v)=>{
    const edge=sidePoint(u,0), scale=1-.23*v;
    return [edge[0]*scale,-.49,edge[2]*scale];
  });
  surface(96,20,(u,v)=>{
    const edge=sidePoint(u,0), scale=.77*Math.cos(v*Math.PI/2);
    return [edge[0]*scale,-.49+.54*Math.sin(v*Math.PI/2),edge[2]*scale];
  });

  let program, locations, crownMesh;
  let visible=true, paused=false, lost=false, frame=0;
  let stageDuration=3200, activeStageIndex=0, stageStartedAt=performance.now();
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
      for (const name of ['uModel','uViewProjection','uKind','uOpacity','uDark']) locations[name]=gl.getUniformLocation(program,name);
      locations.position=gl.getAttribLocation(program,'aPosition'); locations.normal=gl.getAttribLocation(program,'aNormal');
      crownMesh=upload(crown);
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
  function render(now=performance.now()) {
    if (lost) return;
    const dpr=Math.min(devicePixelRatio||1,2), w=Math.max(1,Math.round(canvas.clientWidth*dpr)), h=Math.max(1,Math.round(canvas.clientHeight*dpr));
    if (canvas.width!==w || canvas.height!==h) { canvas.width=w; canvas.height=h; }
    gl.viewport(0,0,w,h); gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT); gl.useProgram(program);
    const f=1/Math.tan(28*Math.PI/360), near=.1, far=30;
    const projection=new Float32Array([f/(w/h),0,0,0, 0,f,0,0, 0,0,(far+near)/(near-far),-1, 0,0,2*far*near/(near-far),0]);
    gl.uniformMatrix4fv(locations.uViewProjection,false,multiply(projection,view)); gl.uniform1f(locations.uDark,dark?1:0);
    // Travel eases continuously from the technician to the dentist, arriving as stage 7 begins.
    const stageProgress=Math.max(0,Math.min(1,(now-stageStartedAt)/stageDuration));
    const linearProgress=activeStageIndex>=6 ? 1 : (activeStageIndex+stageProgress)/6;
    const easeInOut=value=>{const t=Math.max(0,Math.min(1,value));return t*t*(3-2*t);};
    const phase=motion.matches ? .47 : easeInOut(linearProgress);
    const progress=phase;
    const position=1.45-2.9*progress;
    const deliveryFade=activeStageIndex>=6 ? 1-easeInOut((stageProgress-.78)/.22) : 1;
    const opacity=motion.matches ? 1 : easeInOut(phase/.025)*deliveryFade;
    const angle=.45+progress*.55, c=Math.cos(angle), s=Math.sin(angle), tilt=.08;
    const rotation=new Float32Array([c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1]);
    const rz=new Float32Array([Math.cos(tilt),Math.sin(tilt),0,0,-Math.sin(tilt),Math.cos(tilt),0,0,0,0,1,0,0,0,0,1]);
    // Tip the occlusal face toward the viewer so the cusps remain legible at hero size.
    const pitch=.38, cp=Math.cos(pitch), sp=Math.sin(pitch);
    const rx=new Float32Array([1,0,0,0, 0,cp,sp,0, 0,-sp,cp,0, 0,0,0,1]);
    const model=multiply(rx,multiply(rz,rotation)); model[12]=position;
    gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(1,1);
    drawMesh(crownMesh,model,1,opacity); gl.disable(gl.POLYGON_OFFSET_FILL);
    drawMesh(crownMesh,model,2,opacity,true);
  }
  function tick(now) {
    frame=0;
    render(now);
    if (visible && !paused && !motion.matches && !document.hidden && !lost) frame=requestAnimationFrame(tick);
  }
  function refresh() {
    cancelAnimationFrame(frame); frame=0; render();
    if (visible && !paused && !motion.matches && !document.hidden && !lost) frame=requestAnimationFrame(tick);
  }
  window.addEventListener('landing:stage',event=>{
    stageDuration=event.detail?.duration||3200;
    activeStageIndex=event.detail?.index||0;
    stageStartedAt=event.detail?.startedAt??performance.now();
  });
  toggle.addEventListener('click',()=>{
    paused=!paused;
    toggle.setAttribute('aria-pressed',String(paused));
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
