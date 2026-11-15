/* ASTROBIO Open Anatomy 3D viewer — CC BY 4.0; see README for attribution. */
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
let instance=null;
const SYSTEMS={skin:{color:'#98b7c8',opacity:.14},skeleton:{color:'#d9d5ca',opacity:1},muscles:{color:'#ad5c60',opacity:.24},organs:{color:'#cc8d7f',opacity:1},vessels:{color:'#c34855',opacity:1},nerves:{color:'#e8bf67',opacity:1}};
function regionForName(name='',y=.8){name=name.toLowerCase();if(/eye|brain|head|skull|mandib|cerebell|optic|face|neck/.test(name))return 'head';if(/heart|lung|rib|stern|thorax|bronch|chest/.test(name))return 'chest';if(/liver|stomach|intestin|kidney|colon|bladder|pancrea|spleen|abdomen/.test(name))return 'abdomen';if(/humer|ulna|radius|finger|hand|arm|wrist|elbow|scapula/.test(name))return 'arms';if(/femur|knee|tibia|fibula|foot|ankle|calf|toe|leg/.test(name))return 'legs';return y>1.5?'head':y>1.15?'chest':y>.8?'abdomen':y>.48?'arms':'legs'}
export async function mount({onRegion}){
  instance?.destroy();
  const container=document.querySelector('#three-container');
  if(!container)return;
  let dead=false,raf=0;
  const scene=new THREE.Scene();
  const camera=new THREE.PerspectiveCamera(34,1,.01,100);
  let renderer;
  try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'})}catch(e){throw Error('WebGL is unavailable: '+e.message)}
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
  renderer.setSize(container.clientWidth,container.clientHeight);
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.55;
  renderer.domElement.setAttribute('aria-label','Interactive 3D human anatomy; drag to rotate');
  scene.add(new THREE.HemisphereLight(0xf7ffff,0x3b536f,2.1));
  const light=new THREE.DirectionalLight(0xffffff,2.3);light.position.set(3,4,4);scene.add(light);
  const light2=new THREE.DirectionalLight(0x67b8e7,1.2);light2.position.set(-4,2,-3);scene.add(light2);
  const controls=new OrbitControls(camera,renderer.domElement);
  controls.enableDamping=true;controls.dampingFactor=.075;controls.enablePan=false;controls.enableZoom=true;controls.minDistance=.85;controls.maxDistance=6;
  const groups={};let body=null,bbox=null,startingCamera=new THREE.Vector3(),startingTarget=new THREE.Vector3();
  let activeMesh=null,oldMaterial=null;
  const frame=()=>{if(dead)return;controls.update();renderer.render(scene,camera);raf=requestAnimationFrame(frame)};
  function resize(){if(dead)return;const w=container.clientWidth||600,h=container.clientHeight||550;camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h)}
  const observer=new ResizeObserver(resize);observer.observe(container);
  function setLayer(id,visible){const g=groups[id];if(!g)return false;g.visible=visible;return true}
  function focusRegion(id){if(!bbox)return;const c=bbox.getCenter(new THREE.Vector3()),h=bbox.getSize(new THREE.Vector3()).y;
    const ranges={head:.87,chest:.70,abdomen:.52,arms:.65,legs:.26};const t=c.clone();t.y=bbox.min.y+h*(ranges[id]??.6);controls.target.copy(t);camera.position.set(t.x,t.y+.08,t.z+Math.max(.85,h*.68));controls.update()}
  function disposeMaterial(m){if(!m)return;if(Array.isArray(m))m.forEach(disposeMaterial);else if(m.dispose)m.dispose()}
  const api={
   toggleLayer(key,button){const g=groups[key];if(!g)return;g.visible=!g.visible;button?.classList.toggle('active',g.visible);button?.setAttribute('aria-pressed',String(g.visible))},
   focusRegion,zoom(delta){const dir=new THREE.Vector3().subVectors(camera.position,controls.target);const n=Math.max(controls.minDistance,Math.min(controls.maxDistance,dir.length()+delta));dir.setLength(n);camera.position.copy(controls.target).add(dir);controls.update()},
   reset(){camera.position.copy(startingCamera);controls.target.copy(startingTarget);controls.update()},
   destroy(){dead=true;cancelAnimationFrame(raf);observer.disconnect();controls.dispose();renderer.dispose();renderer.domElement.remove();if(body)body.traverse(n=>{if(n.isMesh){n.geometry?.dispose?.();disposeMaterial(n.material)}});if(window.ASTROBIO_ANATOMY===api)window.ASTROBIO_ANATOMY=null}
  };
  window.ASTROBIO_ANATOMY=api;instance=api;
  const loader=new GLTFLoader();loader.setMeshoptDecoder(MeshoptDecoder);
  const remote='https://cdn.jsdelivr.net/npm/open-anatomy-3d@0.1.0/models/anatomy-male.glb';
  const local='assets/models/anatomy-male.glb';
  let url=remote;
  try {const r=await fetch(local,{method:'HEAD'});if(r.ok)url=local}catch{}
  const timeout=new Promise((_,rej)=>setTimeout(()=>rej(Error('3D model loading timed out')),18000));
  let gltf;
  try{gltf=await Promise.race([loader.loadAsync(url),timeout])}
  catch(e){if(!dead){api.destroy();throw e}return}
  if(dead)return;
  body=gltf.scene;scene.add(body);
  for(const [key,setting] of Object.entries(SYSTEMS)){
    const group=body.getObjectByName(key);groups[key]=group;
    if(!group){console.warn('Anatomical layer not found:',key);continue}
    group.visible=true;
    group.traverse(part=>{if(!part.isMesh)return;const color=(()=>{const n=part.name.toLowerCase();if(key==='organs'){if(n.includes('heart'))return '#de4b5a';if(n.includes('lung'))return '#bc918d';if(n.includes('liver'))return '#91563f';if(n.includes('kidney'))return '#ad6e5b'}if(key==='vessels'){if(/vein|vena|venous/.test(n))return '#337dca';return '#d75056'}return setting.color})();
       const modify=m=>{const q=m.clone();if(q.color)q.color.set(color);q.transparent=setting.opacity<1;q.opacity=setting.opacity;q.depthWrite=setting.opacity===1;q.side=THREE.DoubleSide;return q};
       part.material=Array.isArray(part.material)?part.material.map(modify):modify(part.material);
       if(key==='skin')part.renderOrder=2;
    });
  }
  bbox=new THREE.Box3().setFromObject(body);
  const center=bbox.getCenter(new THREE.Vector3()),size=bbox.getSize(new THREE.Vector3());
  controls.target.copy(center);const vfov=THREE.MathUtils.degToRad(camera.fov);const distance=Math.max(size.y/(2*Math.tan(vfov/2))*1.09,2.45);camera.position.set(center.x,center.y+.04,center.z+distance);controls.maxDistance=distance*3;startingCamera.copy(camera.position);startingTarget.copy(center);controls.update();resize();
  const loaderElem=document.querySelector('#anatomy-loader');loaderElem?.remove();container.appendChild(renderer.domElement);
  let down=null;const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();
  renderer.domElement.addEventListener('pointerdown',e=>{down={x:e.clientX,y:e.clientY}});
  renderer.domElement.addEventListener('pointerup',e=>{if(!down||Math.hypot(down.x-e.clientX,down.y-e.clientY)>6)return;const rect=renderer.domElement.getBoundingClientRect();pointer.x=(e.clientX-rect.left)/rect.width*2-1;pointer.y=-(e.clientY-rect.top)/rect.height*2+1;raycaster.setFromCamera(pointer,camera);const hits=raycaster.intersectObject(body,true).filter(h=>h.object.visible&&h.object.parent?.visible);if(!hits.length)return;let hit=hits[0];let obj=hit.object;
    const chain=[];for(let p=obj;p&&p!==body;p=p.parent)chain.push(p.name||'');const key=regionForName(chain.join(' '),hit.point.y);onRegion?.(key);
    if(activeMesh&&oldMaterial){activeMesh.material=oldMaterial}activeMesh=hit.object;oldMaterial=activeMesh.material;
    function glow(m){const q=m.clone();if(q.emissive){q.emissive.set('#19bde6');q.emissiveIntensity=.28}return q}
    activeMesh.material=Array.isArray(oldMaterial)?oldMaterial.map(glow):glow(oldMaterial);
  });
  document.querySelectorAll('.layer-btn').forEach(btn=>{const id=btn.dataset.layer;if(!groups[id]){btn.disabled=true;btn.title='This layer is not available in the model';btn.classList.remove('active')}});
  frame();
}
