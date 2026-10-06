// Globe 3D rendu à la demande : une image par minute et à chaque nouvelle carte de nuages.
import * as THREE from "three";
import { subsolarPoint, latLonToVector } from "./shared/sun.js";

const DISK = 0.88; // part du carré occupée par le disque
const ATMOS = "vec3(0.35, 0.58, 1.0)";

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewNormal;
  void main() {
    vUv = uv;
    vNormal = normal;
    vViewNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D dayMap;
  uniform sampler2D nightMap;
  uniform sampler2D cloudMap;
  uniform float cloudAmount;
  uniform vec3 sunDir;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewNormal;

  void main() {
    float cosZ = dot(normalize(vNormal), sunDir);
    vec3 day = texture2D(dayMap, vUv).rgb;
    vec3 night = texture2D(nightMap, vUv).rgb;
    float cloud = texture2D(cloudMap, vUv).a * cloudAmount;

    float dayMix = smoothstep(-0.10, 0.10, cosZ);

    // Côté jour : ombrage doux vers le terminateur, nuages blancs.
    float shade = 0.30 + 0.70 * sqrt(max(cosZ, 0.0));
    vec3 dayCol = mix(day, vec3(1.0), cloud * 0.92) * shade;

    // Côté nuit : lumières des villes chaudes, voilées par les nuages, et un soupçon de continents.
    // La base grise de Black Marble est écrasée pour ne garder que les lumières.
    vec3 lights = pow(night, vec3(1.8)) * 1.6;
    vec3 nightCol = lights * vec3(1.0, 0.80, 0.50) * (1.0 - 0.75 * cloud) + day * 0.07;

    vec3 col = mix(nightCol, dayCol, dayMix);

    // Liseré d'atmosphère intérieur, plus fort côté jour.
    float NdotV = clamp(normalize(vViewNormal).z, 0.0, 1.0);
    float rim = pow(1.0 - NdotV, 2.2);
    col += ${ATMOS} * rim * mix(0.15, 0.6, dayMix);

    gl_FragColor = vec4(col, 1.0);
  }
`;

// Halo extérieur fin, sur un plan derrière la sphère (caméra orthographique).
const haloVertex = /* glsl */ `
  varying vec2 vPos;
  void main() {
    vPos = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const haloFragment = /* glsl */ `
  uniform vec3 sunView;
  varying vec2 vPos;
  void main() {
    float r = length(vPos);
    if (r < 1.0) discard;
    float glow = exp(-(r - 1.0) * 42.0);
    float dayside = smoothstep(-0.30, 0.40, dot(vPos / r, sunView.xy));
    gl_FragColor = vec4(${ATMOS} * glow * mix(0.12, 0.6, dayside), 1.0);
  }
`;

function loadTexture(loader, url) {
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (tex) => {
        tex.colorSpace = THREE.NoColorSpace; // on travaille directement en sRGB
        resolve(tex);
      },
      undefined,
      () => reject(new Error(`texture ${url}`)),
    );
  });
}

export async function startGlobe(canvas, options) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "low-power" });
  renderer.setPixelRatio(1);
  renderer.setSize(canvas.width, canvas.height, false);
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.setClearColor(0x000000, 1);

  const forced = Number(new URLSearchParams(location.search).get("tex"));
  let size = forced || options.textureSize || 4096;
  if (renderer.capabilities.maxTextureSize < size) size = 2048;

  const half = 1 / DISK;
  const camera = new THREE.OrthographicCamera(-half, half, half, -half, 0.1, 10);
  camera.position.z = 5;
  const scene = new THREE.Scene();

  const blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
  blank.needsUpdate = true;

  const uniforms = {
    dayMap: { value: blank },
    nightMap: { value: blank },
    cloudMap: { value: blank },
    cloudAmount: { value: 0 },
    sunDir: { value: new THREE.Vector3(1, 0, 0) },
  };
  const earth = new THREE.Mesh(
    new THREE.SphereGeometry(1, 128, 64),
    new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader }),
  );
  // Oriente la sphère pour amener le centre demandé face à la caméra, nord en haut.
  const { lat, lon } = options.center;
  earth.rotation.set(THREE.MathUtils.degToRad(lat), -THREE.MathUtils.degToRad(90 + lon), 0, "XYZ");
  scene.add(earth);

  const haloUniforms = { sunView: { value: new THREE.Vector3() } };
  const halo = new THREE.Mesh(
    new THREE.PlaneGeometry(2 * half, 2 * half),
    new THREE.ShaderMaterial({ uniforms: haloUniforms, vertexShader: haloVertex, fragmentShader: haloFragment }),
  );
  halo.position.z = -2;
  scene.add(halo);

  let ready = false;
  function render() {
    if (!ready) return;
    const sun = subsolarPoint(new Date());
    uniforms.sunDir.value.set(...latLonToVector(sun.lat, sun.lon));
    haloUniforms.sunView.value.copy(uniforms.sunDir.value).applyQuaternion(earth.quaternion);
    renderer.render(scene, camera);
  }

  const loader = new THREE.TextureLoader();
  const anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  const [day, night] = await Promise.all([
    loadTexture(loader, `/textures/day-${size}.jpg`),
    loadTexture(loader, `/textures/night-${size}.jpg`),
  ]);
  for (const t of [day, night]) t.anisotropy = anisotropy;
  uniforms.dayMap.value = day;
  uniforms.nightMap.value = night;
  ready = true;
  render();

  // Nuages : rechargés quand le serveur en a une nouvelle version.
  let cloudsVersion = null;
  async function refreshClouds() {
    try {
      const meta = await (await fetch("/api/clouds", { cache: "no-store" })).json();
      if (!meta.updatedAt || meta.updatedAt === cloudsVersion) return;
      const tex = await loadTexture(loader, `/api/clouds/${size}?v=${meta.updatedAt}`);
      tex.anisotropy = anisotropy;
      const old = uniforms.cloudMap.value;
      uniforms.cloudMap.value = tex;
      uniforms.cloudAmount.value = 1;
      if (old !== blank) old.dispose();
      cloudsVersion = meta.updatedAt;
      render();
    } catch (err) {
      console.warn("nuages", err);
    }
  }
  await refreshClouds();
  setInterval(refreshClouds, 10 * 60_000);

  // Le terminateur avance : une image par minute, calée sur la minute.
  setTimeout(() => {
    render();
    setInterval(render, 60_000);
  }, 60_000 - (Date.now() % 60_000));

  canvas.addEventListener("webglcontextrestored", render);
  return { render };
}
