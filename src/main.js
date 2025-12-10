import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const canvas = document.querySelector('#canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf0f0f0);

// Add grid helper as fixed background
const gridHelper = new THREE.GridHelper(50, 50, 0x888888, 0xcccccc);
gridHelper.position.y = -2;
scene.add(gridHelper);

// Create simple environment map using CubeCamera for reflections
const cubeRenderTarget = new THREE.WebGLCubeRenderTarget(256);
const cubeCamera = new THREE.CubeCamera(0.1, 100, cubeRenderTarget);
scene.add(cubeCamera);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 2, 5);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.0);
hemi.position.set(0, 5, 0);
scene.add(hemi);

const loader = new GLTFLoader();
let beetle; 
let carapaceMesh;
const headMeshes = {};

// Load all texture patterns
const textureLoader = new THREE.TextureLoader();
const textures = {
  plain: null, // Will be a solid white texture
  spots: textureLoader.load('./textures/pattern_mask_bw_1.png'),
  stripes: textureLoader.load('./textures/pattern_mask_bw_2.png')
};

// Configure textures
Object.values(textures).forEach(tex => {
  if (tex) {
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.flipY = false;
  }
});

// Create a plain white texture (1x1 pixel)
const textureCanvas = document.createElement('canvas');
textureCanvas.width = 1;
textureCanvas.height = 1;
const ctx = textureCanvas.getContext('2d');
ctx.fillStyle = 'white';
ctx.fillRect(0, 0, 1, 1);
textures.plain = new THREE.CanvasTexture(textureCanvas);

let currentTexture = textures.spots; // Default to spots

// Randomize colors on load
function randomColor() {
  return '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
}

const randomBase = randomColor();
const randomAccent = randomColor();

document.getElementById('colorBase').value = randomBase;
document.getElementById('colorAccent').value = randomAccent;

const baseColor = new THREE.Color(randomBase);
const accentColor = new THREE.Color(randomAccent);

let beetleMaterial;
let headMaterial;

loader.load('./models/beetle2.glb', gltf => {
  beetle = gltf.scene;
  scene.add(beetle);

  // Create beetle material for carapace with texture mask
  beetleMaterial = new THREE.ShaderMaterial({
    uniforms: {
      baseColor: { value: baseColor },
      accentColor: { value: accentColor },
      maskMap: { value: currentTexture },
      envMap: { value: cubeRenderTarget.texture },
      iridescenceStrength: { value: 1.5 },
      iridescenceShift: { value: 0.3 },
      shininess: { value: 80.0 },
      specularStrength: { value: 0.8 },
      envMapIntensity: { value: 0.3 },
      lightPosition: { value: new THREE.Vector3(5, 10, 5) }
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      varying vec3 vWorldPosition;

      void main(){
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewPosition = -mvPosition.xyz;
        vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 baseColor;
      uniform vec3 accentColor;
      uniform sampler2D maskMap;
      uniform samplerCube envMap;
      uniform float iridescenceStrength;
      uniform float iridescenceShift;
      uniform float shininess;
      uniform float specularStrength;
      uniform float envMapIntensity;
      uniform vec3 lightPosition;
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      varying vec3 vWorldPosition;

      vec3 iridescence(float intensity, vec3 normal, vec3 viewDir) {
        float fresnel = dot(normal, viewDir);
        fresnel = pow(1.0 - fresnel, 2.0);

        float shift = fresnel * iridescenceShift;

        // Create rainbow-like color shift based on angle
        vec3 iridescentColor = vec3(
          0.5 + 0.5 * sin(shift * 6.28318 + 0.0),
          0.5 + 0.5 * sin(shift * 6.28318 + 2.09439),
          0.5 + 0.5 * sin(shift * 6.28318 + 4.18879)
        );

        return iridescentColor * intensity * fresnel;
      }

      void main(){
        float m = texture2D(maskMap, vUv).r;
        vec3 col = mix(accentColor, baseColor, m); // Flipped: accent is base, base is on pattern

        vec3 normal = normalize(vNormal);
        vec3 viewDir = normalize(vViewPosition);

        // Add environment map reflection
        vec3 worldNormal = normalize((vec4(normal, 0.0)).xyz);
        vec3 reflectDir = reflect(-viewDir, worldNormal);
        vec3 envColor = textureCube(envMap, reflectDir).rgb;
        col = mix(col, envColor, envMapIntensity * 0.3); // Blend environment reflection

        // Add iridescence effect
        vec3 iriColor = iridescence(iridescenceStrength, normal, viewDir);
        col += iriColor;

        // Add specular highlights (Blinn-Phong)
        vec3 lightDir = normalize(lightPosition - vWorldPosition);
        vec3 halfVector = normalize(lightDir + viewDir);
        float specAngle = max(dot(halfVector, normal), 0.0);
        float specular = pow(specAngle, shininess);

        vec3 specularColor = vec3(1.0) * specular * specularStrength;
        col += specularColor;

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });

  // Create black material for head and legs with visible highlights
  headMaterial = new THREE.ShaderMaterial({
    uniforms: {
      shininess: { value: 60.0 },
      specularStrength: { value: 0.5 },
      lightPosition: { value: new THREE.Vector3(5, 10, 5) }
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      varying vec3 vWorldPosition;

      void main(){
        vNormal = normalize(normalMatrix * normal);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewPosition = -mvPosition.xyz;
        vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform float shininess;
      uniform float specularStrength;
      uniform vec3 lightPosition;
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      varying vec3 vWorldPosition;

      void main(){
        vec3 baseColor = vec3(0.05); // Very dark gray instead of pure black

        vec3 normal = normalize(vNormal);
        vec3 viewDir = normalize(vViewPosition);
        vec3 lightDir = normalize(lightPosition - vWorldPosition);

        // Diffuse lighting
        float diffuse = max(dot(normal, lightDir), 0.0);
        vec3 col = baseColor * (0.3 + diffuse * 0.7); // Ambient + diffuse

        // Specular highlights
        vec3 halfVector = normalize(lightDir + viewDir);
        float specAngle = max(dot(halfVector, normal), 0.0);
        float specular = pow(specAngle, shininess);
        vec3 specularColor = vec3(1.0) * specular * specularStrength;
        col += specularColor;

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });

  // Apply materials to meshes
  beetle.traverse(obj => {
    if (!obj.isMesh) return;

    if (obj.name === 'Carapace') {
      carapaceMesh = obj;
      obj.material = beetleMaterial;
    }

    if (obj.name === 'Head_A' || obj.name === 'Head_B' || obj.name === 'Head_C') {
      headMeshes[obj.name] = obj;
      obj.material = headMaterial;
    }
    
    if (obj.name === 'Legs') {
      obj.material = headMaterial; 
    }
  });

  // Default head visibility
  switchHead('Head_A');
  
  // Initialize pattern control values
  updatePatternUniforms();
});

function switchHead(targetHeadName) {
  if (!headMeshes || Object.keys(headMeshes).length === 0) {
    console.warn('No head meshes loaded yet.');
    return;
  }

  console.log(`Switching to head: ${targetHeadName}`);

  for (const name in headMeshes) {
    const mesh = headMeshes[name];
    if (!mesh) {
      console.warn(`Head mesh "${name}" is undefined.`);
      continue;
    }

    mesh.visible = (name === targetHeadName);
    console.log(`  - ${name} visibility: ${mesh.visible}`);
  }

  if (!headMeshes[targetHeadName]) {
    console.error(`Head "${targetHeadName}" not found in loaded model.`);
  }
}

// Panel management
let activePanel = null;

function showPanel(panelId) {
  // Hide all panels
  document.querySelectorAll('.panel').forEach(panel => {
    panel.classList.remove('active');
  });
  
  // Remove active state from all badges
  document.querySelectorAll('.badge-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  
  // Show selected panel if it exists
  const panel = document.getElementById(`${panelId}-panel`);
  if (panel) {
    panel.classList.add('active');
    activePanel = panelId;
    
    // Mark corresponding badge as active
    const badge = document.querySelector(`.badge-btn[data-panel="${panelId}"]`);
    if (badge) {
      badge.classList.add('active');
    }
  }
}

function hidePanel() {
  document.querySelectorAll('.panel').forEach(panel => {
    panel.classList.remove('active');
  });
  document.querySelectorAll('.badge-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  activePanel = null;
}

// Badge click handlers
document.querySelectorAll('.badge-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const panelId = btn.getAttribute('data-panel');
    if (activePanel === panelId) {
      hidePanel();
    } else {
      showPanel(panelId);
    }
  });
});

// Close panel when clicking outside
document.addEventListener('click', (e) => {
  if (!e.target.closest('#ui')) {
    hidePanel();
  }
});

// Color controls
document.getElementById('colorBase').addEventListener('input', e => {
  baseColor.set(e.target.value);
});

document.getElementById('colorAccent').addEventListener('input', e => {
  accentColor.set(e.target.value);
});

// Head shape controls
let currentHead = 'Head_A';
document.querySelectorAll('.head-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const headName = btn.getAttribute('data-head');
    switchHead(headName);
    
    // Update active state
    document.querySelectorAll('.head-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentHead = headName;
  });
});

// Set initial active head button
document.querySelector('.head-btn[data-head="Head_A"]')?.classList.add('active');

// Texture selection controls
document.querySelectorAll('.texture-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const textureName = btn.getAttribute('data-texture');

    // Update active state
    document.querySelectorAll('.texture-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    // Update material texture
    if (beetleMaterial && textures[textureName]) {
      beetleMaterial.uniforms.maskMap.value = textures[textureName];
      currentTexture = textures[textureName];
    }
  });
});

// Pattern controls
function updatePatternUniforms() {
  if (!beetleMaterial) return;
  
  const iridescenceStrength = parseFloat(document.getElementById('iridescenceStrength').value);
  const iridescenceShift = parseFloat(document.getElementById('iridescenceShift').value);
  const shininess = parseFloat(document.getElementById('shininess').value);
  const specularStrength = parseFloat(document.getElementById('specularStrength').value);
  
  beetleMaterial.uniforms.iridescenceStrength.value = iridescenceStrength;
  beetleMaterial.uniforms.iridescenceShift.value = iridescenceShift;
  beetleMaterial.uniforms.shininess.value = shininess;
  beetleMaterial.uniforms.specularStrength.value = specularStrength;
}

// Pattern control event listeners
document.getElementById('iridescenceStrength').addEventListener('input', (e) => {
  document.getElementById('iridescenceStrengthValue').textContent = e.target.value;
  updatePatternUniforms();
});

document.getElementById('iridescenceShift').addEventListener('input', (e) => {
  document.getElementById('iridescenceShiftValue').textContent = e.target.value;
  updatePatternUniforms();
});

document.getElementById('shininess').addEventListener('input', (e) => {
  document.getElementById('shininessValue').textContent = e.target.value;
  updatePatternUniforms();
});

document.getElementById('specularStrength').addEventListener('input', (e) => {
  document.getElementById('specularStrengthValue').textContent = e.target.value;
  updatePatternUniforms();
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth/window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

let frameCount = 0;
function animate() {
  controls.update();

  // Update environment map every 30 frames for better performance
  if (beetle && frameCount % 30 === 0) {
    beetle.visible = false; // Hide beetle to avoid self-reflection
    cubeCamera.position.copy(beetle.position);
    cubeCamera.update(renderer, scene);
    beetle.visible = true;
  }

  renderer.render(scene, camera);
  frameCount++;
  requestAnimationFrame(animate);
}
animate();