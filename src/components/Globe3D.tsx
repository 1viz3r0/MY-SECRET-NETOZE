import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { buildCountryIndex, resolveCountry, type CountryIndexEntry } from '../lib/countryIndex';

export type LocationNode = {
  id: string;
  name: string;
  country: string;
  lat: number;
  lng: number;
  pkts: string;
  rtt: string;
  status: 'low' | 'medium' | 'high' | 'critical';
  color: string;
  activeFlowsCount: number;
  threatLevel: string;
  ip: string;
};

export type CountryGeo = {
  name: string;
  iso: string;
  lat: number;
  lng: number;
  cap?: string | null;
  r?: string | null;
  sr?: string | null;
  fl?: string;
  state?: string | null;
};

type CountryPoly = {
  n: string;
  iso: string;
  la: number;
  lo: number;
  cap?: string | null;
  r?: string | null;
  sr?: string | null;
  fl?: string;
  state?: string | null;
  polys: number[][][][]; // [polygon][ring][ [lng,lat] ]
};

interface Globe3DProps {
  nodes: LocationNode[];
  selectedNode: LocationNode | null;
  onSelectNode: (node: LocationNode | null) => void;
  selectedCountry: CountryGeo | null;
  onSelectCountry: (country: CountryGeo | null) => void;
  isAutoRotate: boolean;
  hub?: { lat: number; lng: number } | null;
}

const COUNTRIES_URL = new URL('../assets/geodata/countries.json', import.meta.url).href;
const DAY_URL = new URL('../assets/globe_earth_day.jpg', import.meta.url).href;
const NIGHT_URL = new URL('../assets/globe_earth_night.jpg', import.meta.url).href;
const CLOUDS_URL = new URL('../assets/globe_clouds.png', import.meta.url).href;

const GLOBE_RADIUS = 95;
const CAM_MIN = 172;
const CAM_MAX = 560;
const CAM_DEFAULT = 300;
const CAM_HOVER = 262;
const CAM_CLICK = 198;
const BORDER_COLOR = new THREE.Color('#3fb3ff');
const HOVER_COLOR = new THREE.Color('#9ff3ff');
const SELECT_COLOR = new THREE.Color('#00e5ff');

// ---- spherical helpers (must mirror the marker placement function) ----
function latLngToVec3(lat: number, lng: number, radius: number): THREE.Vector3 {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lng + 180) * Math.PI) / 180;
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

function vec3ToLatLng(p: THREE.Vector3): { lat: number; lng: number } {
  const r = p.length();
  if (r < 1e-8) return { lat: 0, lng: 0 };
  const phi = Math.acos(Math.min(1, Math.max(-1, p.y / r)));
  const theta = Math.atan2(p.z, -p.x);
  const lng = ((theta * 180) / Math.PI - 180 + 180 + 360) % 360 - 180;
  return { lat: 90 - (phi * 180) / Math.PI, lng };
}

function makeGlowSprite(radius: number, color: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, color);
  grad.addColorStop(0.35, color);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  const mat = new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(canvas),
    transparent: true,
    depthWrite: false,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
  });
  const s = new THREE.Sprite(mat);
  s.scale.set(radius, radius, 1);
  return s;
}

function makeMarkerSprite(color: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 4, 64, 64, 60);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.18, color);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const mat = new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(canvas),
    transparent: true,
    depthWrite: false,
    opacity: 0.92,
  });
  return new THREE.Sprite(mat);
}

function makeCountryShape(country: CountryPoly, color: THREE.Color, opacity: number) {
  const positions: number[] = [];
  for (const poly of country.polys) {
    for (const ring of poly) {
      if (ring.length < 3) continue;
      for (const [lng, lat] of ring) {
        const v = latLngToVec3(lat, lng, GLOBE_RADIUS + 0.22);
        positions.push(v.x, v.y, v.z);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const line = new THREE.LineSegments(
    geo,
    new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false })
  );
  const glow = makeGlowSprite(34, '#' + color.getHexString());
  glow.position.copy(latLngToVec3(country.la, country.lo, GLOBE_RADIUS + 1.6));
  return { line, glow };
}

function focusQuatFor(lat: number, lng: number): THREE.Quaternion {
  return new THREE.Quaternion().setFromUnitVectors(
    latLngToVec3(lat, lng, 1).normalize(),
    new THREE.Vector3(0, 0, 1)
  );
}

export const Globe3D: React.FC<Globe3DProps> = ({
  nodes,
  selectedNode,
  onSelectNode,
  selectedCountry,
  onSelectCountry,
  isAutoRotate,
  hub,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const globeGroupRef = useRef<THREE.Group | null>(null);
  const earthMeshRef = useRef<THREE.Mesh | null>(null);
  const cloudsMeshRef = useRef<THREE.Mesh | null>(null);
  const markersRef = useRef<THREE.Sprite[]>([]);
  const markerNodesRef = useRef<{ node: LocationNode; marker: THREE.Sprite }[]>([]);
  const arcsGroupRef = useRef<THREE.Group | null>(null);
  const borderObjsRef = useRef<THREE.LineSegments[]>([]);
  const highlightRef = useRef<{ line: THREE.LineSegments; glow: THREE.Sprite } | null>(null);
  const selectHighlightRef = useRef<{ line: THREE.LineSegments; glow: THREE.Sprite } | null>(null);
  const countriesRef = useRef<CountryPoly[]>([]);
  const selectedRef = useRef<{ country: CountryGeo | null; node: LocationNode | null }>({
    country: null,
    node: null,
  });
  const autoRotateRef = useRef(isAutoRotate);
  const hubRef = useRef(hub ?? null);
  const destroyedRef = useRef(false);

  const isDraggingRef = useRef(false);
  const dragMovedRef = useRef(false);
  const previousMouseRef = useRef({ x: 0, y: 0 });
  const hoverCountryRef = useRef<CountryPoly | null>(null);
  const hoverFocusRef = useRef<THREE.Quaternion | null>(null);
  const focusQuatRef = useRef<THREE.Quaternion | null>(null);
  const camPosTargetRef = useRef(new THREE.Vector3(0, 0, CAM_DEFAULT));
  const lastHoverRef = useRef(0);
  const raycastRef = useRef<THREE.Raycaster | null>(null);

  const [geoState, setGeoState] = useState<'loading' | 'ready' | 'error'>('loading');
  const geoStateRef = useRef<'loading' | 'ready' | 'error'>('loading');
  const [pill, setPill] = useState<string | null>(null);
  const clearSelectHighlightRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    autoRotateRef.current = isAutoRotate;
  }, [isAutoRotate]);

  useEffect(() => {
    hubRef.current = hub ?? null;
  }, [hub]);

  // ---- full scene init (once) ----
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    destroyedRef.current = false;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, mount.clientWidth / Math.max(1, mount.clientHeight), 0.1, 1200);
    camera.position.set(0, 0, CAM_DEFAULT);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const globeGroup = new THREE.Group();
    globeGroup.rotation.set(0.3, -0.45, 0); // face Eurasia/Africa with a slight tilt
    scene.add(globeGroup);
    globeGroupRef.current = globeGroup;

    const raycaster = new THREE.Raycaster();
    raycastRef.current = raycaster;

    // ---- Earth material: real day texture + real night-lights, terminator shader ----
    const dayTex = new THREE.TextureLoader().load(DAY_URL);
    const nightTex = new THREE.TextureLoader().load(NIGHT_URL);
    dayTex.anisotropy = 8;
    nightTex.anisotropy = 8;

    const earthMat = new THREE.ShaderMaterial({
      uniforms: {
        uDay: { value: dayTex },
        uNight: { value: nightTex },
        uSunDir: { value: new THREE.Vector3(0.42, 0.32, 0.85).normalize() },
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vN;
        void main() {
          vUv = uv;
          vN = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D uDay;
        uniform sampler2D uNight;
        uniform vec3 uSunDir;
        varying vec2 vUv;
        varying vec3 vN;
        void main() {
          vec3 n = normalize(vN);
          float sun = clamp(dot(n, uSunDir), 0.0, 1.0);
          vec3 day = texture2D(uDay, vUv).rgb;
          vec3 night = texture2D(uNight, vUv).rgb;
          vec3 col = mix(night * 2.0, day * 1.12, smoothstep(0.04, 0.6, sun));
          col += day * 0.1 * pow(1.0 - sun, 3.5); // soft terminator glow
          col += vec3(0.018, 0.048, 0.08);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    const sphereGeo = new THREE.SphereGeometry(GLOBE_RADIUS, 72, 72);
    const earthMesh = new THREE.Mesh(sphereGeo, earthMat);
    globeGroup.add(earthMesh);
    earthMeshRef.current = earthMesh;

    // ---- clouds layer (real map, slow drift) ----
    const cloudsTex = new THREE.TextureLoader().load(CLOUDS_URL);
    const cloudsMat = new THREE.MeshPhongMaterial({
      map: cloudsTex,
      transparent: true,
      opacity: 0.48,
      depthWrite: false,
    });
    const cloudsMesh = new THREE.Mesh(new THREE.SphereGeometry(GLOBE_RADIUS + 0.5, 64, 64), cloudsMat);
    globeGroup.add(cloudsMesh);
    cloudsMeshRef.current = cloudsMesh;

    // ---- atmosphere glow ----
    const atmosMat = new THREE.ShaderMaterial({
      vertexShader: `
        varying vec3 vNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        void main() {
          float intensity = pow(0.72 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.6);
          gl_FragColor = vec4(0.05, 0.75, 1.0, 1.0) * intensity * 0.85;
        }
      `,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
    });
    globeGroup.add(new THREE.Mesh(new THREE.SphereGeometry(GLOBE_RADIUS * 1.16, 64, 64), atmosMat));

    // ---- graticule: faint 30Â° meridians/parallels for depth (decorative) ----
    const gridPositions: number[] = [];
    for (let lat = -60; lat <= 60; lat += 30) {
      const prev: number[] = [];
      for (let lng = -180; lng <= 180; lng += 6) {
        const v = latLngToVec3(lat, lng, GLOBE_RADIUS + 0.05);
        if (prev.length) gridPositions.push(prev[0], prev[1], prev[2], v.x, v.y, v.z);
        prev.push(v.x, v.y, v.z);
      }
    }
    for (let lng = -180; lng < 180; lng += 30) {
      const prev: number[] = [];
      for (let lat = -90; lat <= 90; lat += 4.5) {
        const v = latLngToVec3(lat, lng, GLOBE_RADIUS + 0.05);
        if (prev.length) gridPositions.push(prev[0], prev[1], prev[2], v.x, v.y, v.z);
        prev.push(v.x, v.y, v.z);
      }
    }
    const gridGeo = new THREE.BufferGeometry();
    gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(gridPositions, 3));
    const gridLines = new THREE.LineSegments(
      gridGeo,
      new THREE.LineBasicMaterial({
        color: new THREE.Color('#3fa9ff'),
        transparent: true,
        opacity: 0.07,
        depthWrite: false,
      })
    );
    globeGroup.add(gridLines);

    // ---- orbital rings (subtle) ----
    for (let r = 0; r < 3; r++) {
      const ringRadius = GLOBE_RADIUS * (1.18 + r * 0.13);
      const ringGeo = new THREE.RingGeometry(ringRadius, ringRadius + 0.35, 64);
      const ringMesh = new THREE.Mesh(
        ringGeo,
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(r === 0 ? '#00e5ff' : '#0077ff'),
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.16 - r * 0.04,
        })
      );
      ringMesh.rotation.x = Math.PI / 2.2 + r * 0.15;
      ringMesh.rotation.y = r * 0.2;
      globeGroup.add(ringMesh);
    }

    // ---- stars ----
    const starPos = new Float32Array(1800 * 3);
    for (let i = 0; i < starPos.length; i++) starPos[i] = (Math.random() - 0.5) * 750;
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    const stars = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({ color: 0x5b8fd0, size: 1.15, transparent: true, opacity: 0.7 })
    );
    scene.add(stars);

    scene.add(new THREE.AmbientLight(0xffffff, 1.1));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight.position.set(180, 120, 220);
    scene.add(dirLight);

    // ---- country borders (from bundled real geodata) ----
    const buildBorders = (countries: CountryPoly[]) => {
      if (destroyedRef.current) return;
      for (const obj of borderObjsRef.current) {
        globeGroup.remove(obj);
        obj.geometry.dispose();
        (obj.material as THREE.Material).dispose();
      }
      borderObjsRef.current = [];
      countries.forEach((country, cIdx) => {
        const positions: number[] = [];
        const ringInfo: { poly: number; ring: number; start: number; count: number }[] = [];
        country.polys.forEach((poly, pi) => {
          poly.forEach((ring, ri) => {
            if (ring.length < 3) return;
            const start = positions.length / 3;
            for (const [lng, lat] of ring) {
              const v = latLngToVec3(lat, lng, GLOBE_RADIUS + 0.18);
              positions.push(v.x, v.y, v.z);
            }
            ringInfo.push({ poly: pi, ring: ri, start, count: ring.length });
          });
        });
        if (positions.length === 0) return;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        const lines = new THREE.LineSegments(
          geo,
          new THREE.LineBasicMaterial({ color: BORDER_COLOR, transparent: true, opacity: 0.72 })
        );
        lines.userData = { countryIdx: cIdx, ringInfo };
        globeGroup.add(lines);
        borderObjsRef.current.push(lines);
      });
    };

    fetch(COUNTRIES_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`geodata ${r.status}`);
        return r.json();
      })
      .then((data: CountryPoly[]) => {
        if (destroyedRef.current) return;
        countriesRef.current = data;
        countryIndexRef = buildCountryIndex(data);
        buildBorders(data);
        geoStateRef.current = 'ready';
        setGeoState('ready');
      })
      .catch((err) => {
        if (!destroyedRef.current) {
          console.warn('[Globe3D] geodata load failed:', err);
          geoStateRef.current = 'error';
          setGeoState('error');
        }
      });

    // ---- picking (raycast -> sphere hit -> lat/lng -> country index) ----
    let countryIndexRef: CountryIndexEntry[] = [];
    const pickCountryAt = (clientX: number, clientY: number): CountryPoly | null => {
      if (!raycastRef.current || !cameraRef.current || !mountRef.current || !earthMeshRef.current) return null;
      const rect = mount.getBoundingClientRect();
      const pointer = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1
      );
      raycastRef.current.setFromCamera(pointer, cameraRef.current);
      const hits = raycastRef.current.intersectObject(earthMeshRef.current!, false);
      if (hits.length === 0) return null;
      const local = hits[0].point
        .clone()
        .applyQuaternion(globeGroupRef.current!.quaternion.clone().invert());
      const p = vec3ToLatLng(local);
      const hit = resolveCountry(countryIndexRef, p.lat, p.lng);
      if (!hit) return null;
      return (
        countriesRef.current.find((c) => c.iso === hit.iso) ??
        null
      );
    };

    // ---- highlight helpers ----
    const clearHighlight = () => {
      if (highlightRef.current) {
        globeGroup.remove(highlightRef.current.line);
        globeGroup.remove(highlightRef.current.glow);
        highlightRef.current.line.geometry.dispose();
        (highlightRef.current.line.material as THREE.Material).dispose();
        highlightRef.current.glow.material.dispose();
        highlightRef.current = null;
      }
    };
    const clearSelectHighlight = () => {
      if (selectHighlightRef.current) {
        globeGroup.remove(selectHighlightRef.current.line);
        globeGroup.remove(selectHighlightRef.current.glow);
        selectHighlightRef.current.line.geometry.dispose();
        (selectHighlightRef.current.line.material as THREE.Material).dispose();
        selectHighlightRef.current.glow.material.dispose();
        selectHighlightRef.current = null;
      }
    };
    const showSelect = (country: CountryPoly) => {
      clearSelectHighlight();
      const shape = makeCountryShape(country, SELECT_COLOR, 1);
      globeGroup.add(shape.line);
      globeGroup.add(shape.glow);
      selectHighlightRef.current = shape;
    };
    clearSelectHighlightRef.current = clearSelectHighlight;

    const setHover = (country: CountryPoly | null) => {
      hoverCountryRef.current = country;
      clearHighlight();
      if (country && selectedRef.current.country?.iso !== country.iso) {
        const shape = makeCountryShape(country, HOVER_COLOR, 0.95);
        globeGroup.add(shape.line);
        globeGroup.add(shape.glow);
        highlightRef.current = shape;
      }
    };

    // ---- mouse interactions ----
    const handleMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      isDraggingRef.current = true;
      dragMovedRef.current = false;
      previousMouseRef.current = { x: e.clientX, y: e.clientY };
      focusQuatRef.current = null; // let the user explore while dragging
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingRef.current) {
        const dx = e.clientX - previousMouseRef.current.x;
        const dy = e.clientY - previousMouseRef.current.y;
        previousMouseRef.current = { x: e.clientX, y: e.clientY };
        if (Math.abs(dx) + Math.abs(dy) > 2) dragMovedRef.current = true;
        if (globeGroupRef.current) {
          globeGroupRef.current.rotateY(dx * 0.0045);
          globeGroupRef.current.rotateX(dy * 0.0025);
        }
        return;
      }
      const now = performance.now();
      if (now - lastHoverRef.current < 66) return;
      lastHoverRef.current = now;
      if (geoStateRef.current !== 'ready') return;
      const hit = pickCountryAt(e.clientX, e.clientY);
      if (hit && (!selectedRef.current.country || selectedRef.current.country.iso !== hit.iso)) {
        setHover(hit);
        if (!selectedRef.current.country && !focusQuatRef.current) {
          hoverFocusRef.current = focusQuatFor(hit.la, hit.lo);
          if (camPosTargetRef.current.length() > CAM_HOVER) camPosTargetRef.current.setLength(CAM_HOVER);
        }
        if (selectedRef.current.country) {
          // a country is selected: keep that selection visible and label the hover as a candidate
          setPill(
            `${selectedRef.current.country.fl ?? ''} ${selectedRef.current.country.name} selected — hovering ${hit.fl ?? ''} ${hit.n} — click to replace`
          );
        } else {
          setPill(`${hit.fl ?? ''} ${hit.n} — click to inspect`);
        }
      } else if (hit && selectedRef.current.country?.iso === hit.iso) {
        setHover(null); // selected country: keep selection styling only
      } else {
        setHover(null);
        hoverFocusRef.current = null;
        if (!selectedRef.current.country && !focusQuatRef.current && camPosTargetRef.current.length() < CAM_DEFAULT) {
          camPosTargetRef.current.setLength(selectedRef.current.node ? 190 : CAM_DEFAULT);
        }
        setPill(null);
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      if (dragMovedRef.current) return; // a drag is not a click

      // node markers take priority
      const rect = mount.getBoundingClientRect();
      const pointer = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      raycaster.setFromCamera(pointer, cameraRef.current!);
      const markerHits = raycaster.intersectObjects(markersRef.current, false);
      const markerFound = markerHits.length > 0 ? markerNodesRef.current.find((m) => m.marker === markerHits[0].object) : null;
      if (markerFound) {
        onSelectNode(markerFound.node);
        onSelectCountry(null);
        focusQuatRef.current = focusQuatFor(markerFound.node.lat, markerFound.node.lng);
        hoverFocusRef.current = null;
        camPosTargetRef.current.set(0, 0, 190);
        clearSelectHighlight();
        setPill(`${markerFound.node.name} — click ocean to clear`);
        return;
      }

      const hit = pickCountryAt(e.clientX, e.clientY);
      if (hit) {
        onSelectNode(null);
        onSelectCountry({
          name: hit.n,
          iso: hit.iso,
          lat: hit.la,
          lng: hit.lo,
          ...(hit.cap !== undefined ? { cap: hit.cap } : {}),
          ...(hit.r !== undefined ? { r: hit.r } : {}),
          ...(hit.sr !== undefined ? { sr: hit.sr } : {}),
          ...(hit.fl !== undefined ? { fl: hit.fl } : {}),
        });
        focusQuatRef.current = focusQuatFor(hit.la, hit.lo);
        hoverFocusRef.current = null;
        camPosTargetRef.current.set(0, 0, CAM_CLICK);
        setHover(null);
        showSelect(hit);
        setPill(`${hit.fl ?? ''} ${hit.n} — click ocean to clear`);
      } else {
        onSelectCountry(null);
        onSelectNode(null);
        focusQuatRef.current = null;
        hoverFocusRef.current = null;
        clearSelectHighlight();
        camPosTargetRef.current.set(0, 0, CAM_DEFAULT);
        setPill(null);
      }
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (!cameraRef.current || !raycastRef.current || !earthMeshRef.current) return;
      const rect = mount.getBoundingClientRect();
      const pointer = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      raycastRef.current.setFromCamera(pointer, cameraRef.current);
      const hits = raycastRef.current.intersectObject(earthMeshRef.current, false);
      const target = hits.length > 0 ? hits[0].point.clone() : null;
      const dir = target
        ? target.sub(cameraRef.current.position).normalize()
        : cameraRef.current.getWorldDirection(new THREE.Vector3());
      const step = e.deltaY * 0.55;
      const next = camPosTargetRef.current.clone().add(dir.multiplyScalar(step));
      const dist = next.length();
      if (dist < CAM_MIN) next.setLength(CAM_MIN);
      if (dist > CAM_MAX) next.setLength(CAM_MAX);
      camPosTargetRef.current.copy(next);
    };

    const handleResize = () => {
      if (!mount || !rendererRef.current || !cameraRef.current) return;
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      cameraRef.current.aspect = w / Math.max(1, h);
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };

    mount.addEventListener('mousedown', handleMouseDown);
    mount.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('resize', handleResize);

    // ---- animate loop ----
    let animationFrameId: number;
    const tmpV = new THREE.Vector3();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const group = globeGroupRef.current;
      const camera = cameraRef.current;
      if (!group || !camera) return;

      if (focusQuatRef.current) {
        group.quaternion.slerp(focusQuatRef.current, 0.06);
        if (group.quaternion.angleTo(focusQuatRef.current) < 0.0015) group.quaternion.copy(focusQuatRef.current);
      } else if (hoverFocusRef.current && !isDraggingRef.current) {
        group.quaternion.slerp(hoverFocusRef.current, 0.025);
      } else if (
        autoRotateRef.current &&
        !selectedRef.current.country &&
        !selectedRef.current.node &&
        !hoverCountryRef.current &&
        !isDraggingRef.current
      ) {
        group.rotateY(0.0016);
      }

      camera.position.lerp(camPosTargetRef.current, 0.09);
      const d = camera.position.length();
      if (d < CAM_MIN) camera.position.setLength(CAM_MIN);
      if (d > CAM_MAX) camera.position.setLength(CAM_MAX);
      camera.lookAt(0, 0, 0);

      if (cloudsMeshRef.current) cloudsMeshRef.current.rotation.y += 0.00012;

      const t = Date.now() * 0.001;
      for (const m of markersRef.current) {
        const base = m.userData.baseScale as number | undefined;
        const scale = (base ?? 4.2) * (1 + Math.sin(t * 2.2 + (m.userData.phase ?? 0)) * 0.12);
        m.scale.set(scale, scale, 1);
        tmpV.set(m.position.x, m.position.y, m.position.z);
      }

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      destroyedRef.current = true;
      cancelAnimationFrame(animationFrameId);
      mount.removeEventListener('mousedown', handleMouseDown);
      mount.removeEventListener('wheel', handleWheel);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('resize', handleResize);
      for (const obj of borderObjsRef.current) {
        obj.geometry.dispose();
        (obj.material as THREE.Material).dispose();
      }
      borderObjsRef.current = [];
      clearHighlight();
      clearSelectHighlight();
      for (const m of markersRef.current) m.material.dispose();
      markersRef.current = [];
      if (arcsGroupRef.current) {
        arcsGroupRef.current.traverse((o) => {
          const mesh = o as THREE.Line;
          if (mesh.geometry) mesh.geometry.dispose();
          const mat = mesh.material as THREE.Material | undefined;
          if (mat) mat.dispose();
        });
        globeGroup.remove(arcsGroupRef.current);
        arcsGroupRef.current = null;
      }
      earthMat.dispose();
      cloudsMat.dispose();
      sphereGeo.dispose();
      cloudsTex.dispose();
      dayTex.dispose();
      nightTex.dispose();
      starGeo.dispose();
      (stars.material as THREE.Material).dispose();
      gridGeo.dispose();
      (gridLines.material as THREE.Material).dispose();
      renderer.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
      rendererRef.current = null;
      cameraRef.current = null;
      globeGroupRef.current = null;
      earthMeshRef.current = null;
      cloudsMeshRef.current = null;
      raycastRef.current = null;
      countriesRef.current = [];
      hoverCountryRef.current = null;
      hoverFocusRef.current = null;
      focusQuatRef.current = null;
      selectedRef.current = { country: null, node: null };
      clearSelectHighlightRef.current = null;
      geoStateRef.current = 'loading';
      setGeoState('loading');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- markers + arcs (real telemetry only; waits for geodata) ----
  const lastNodesSigRef = useRef<string | null>(null);
  useEffect(() => {
    const group = globeGroupRef.current;
    if (!group || geoState !== 'ready') return;

    const sig = nodes
      .map((n) => `${n.id}:${n.status}:${n.lat.toFixed(4)}:${n.lng.toFixed(4)}:${n.pkts}`)
      .join('|');
    if (sig === lastNodesSigRef.current) return; // identical set — no rebuild
    lastNodesSigRef.current = sig;

    for (const m of markersRef.current) {
      group.remove(m);
      m.material.dispose();
    }
    markersRef.current = [];
    markerNodesRef.current = [];

    if (arcsGroupRef.current) {
      arcsGroupRef.current.traverse((o) => {
        const mesh = o as THREE.Line;
        if (mesh.geometry) mesh.geometry.dispose();
        const mat = mesh.material as THREE.Material | undefined;
        if (mat) mat.dispose();
      });
      group.remove(arcsGroupRef.current);
      arcsGroupRef.current = null;
    }

    if (nodes.length === 0) return;

    const hubVec = hubRef.current ? latLngToVec3(hubRef.current.lat, hubRef.current.lng, GLOBE_RADIUS + 0.55) : null;
    const arcsGroup = new THREE.Group();
    const arcMats: THREE.LineBasicMaterial[] = [];

    nodes.forEach((node, idx) => {
      const v = latLngToVec3(node.lat, node.lng, GLOBE_RADIUS + 0.8);
      const marker = makeMarkerSprite(node.color);
      marker.position.copy(v);
      const baseScale = node.status === 'high' || node.status === 'critical' ? 7.5 : 5.2;
      marker.scale.set(baseScale, baseScale, 1);
      marker.userData = { baseScale, phase: idx * 1.7 };
      group.add(marker);
      markersRef.current.push(marker);
      markerNodesRef.current.push({ node, marker });

      if (hubVec) {
        const start = hubVec.clone();
        const end = v.clone();
        const mid = start.clone().add(end).multiplyScalar(0.5).normalize().multiplyScalar(GLOBE_RADIUS + 34);
        const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
        const pts = curve.getPoints(16);
        const positions: number[] = [];
        const colors: number[] = [];
        for (let i = 0; i < pts.length; i++) {
          positions.push(pts[i].x, pts[i].y, pts[i].z);
          const t = i / (pts.length - 1);
          const c = new THREE.Color('#00e5ff').lerp(new THREE.Color('#34f5a8'), t);
          colors.push(c.r, c.g, c.b);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        const mat = new THREE.LineBasicMaterial({
          vertexColors: true,
          transparent: true,
          opacity: 0.55,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        });
        arcMats.push(mat);
        arcsGroup.add(new THREE.Line(geo, mat));
      }
    });

    group.add(arcsGroup);
    arcsGroupRef.current = arcsGroup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, geoState]);

  // ---- selection focus + pills ----
  useEffect(() => {
    selectedRef.current = { country: selectedCountry, node: selectedNode };
    if (geoState !== 'ready') return;
    const group = globeGroupRef.current;
    if (!group) return;

    if (selectedCountry) {
      const found = countriesRef.current.find((c) => c.iso === selectedCountry.iso);
      if (found) {
        focusQuatRef.current = focusQuatFor(found.la, found.lo);
        hoverFocusRef.current = null;
        camPosTargetRef.current.set(0, 0, CAM_CLICK);
        clearSelectHighlightRef.current?.();
        const shape = makeCountryShape(found, SELECT_COLOR, 1);
        group.add(shape.line);
        group.add(shape.glow);
        selectHighlightRef.current = shape;
        setPill(`${found.fl ?? ''} ${found.n} — click ocean to clear`);
      }
    } else if (selectedNode) {
      focusQuatRef.current = focusQuatFor(selectedNode.lat, selectedNode.lng);
      hoverFocusRef.current = null;
      camPosTargetRef.current.set(0, 0, 190);
      clearSelectHighlightRef.current?.();
      setPill(`${selectedNode.name} — click ocean to clear`);
    } else {
      focusQuatRef.current = null;
      hoverFocusRef.current = null;
      camPosTargetRef.current.set(0, 0, CAM_DEFAULT);
      clearSelectHighlightRef.current?.();
      setPill(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCountry?.iso, selectedCountry?.name, selectedNode?.id, geoState]);

  return (
    <div className="relative w-full h-full min-h-[480px] flex items-center justify-center overflow-hidden bg-[#02050c]">
      <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" style={{ touchAction: 'none' }} />

      {geoState !== 'ready' && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 text-[10px] font-mono text-slate-400 bg-[#040a18]/70 px-2 py-1 rounded border border-white/10">
          {geoState === 'loading' ? 'LOADING COUNTRY BOUNDARIES…' : 'BOUNDARY DATA UNAVAILABLE'}
        </div>
      )}

      {pill && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 text-[11px] font-mono text-cyan-200 bg-[#040a18]/80 backdrop-blur px-3 py-1.5 rounded border border-cyan-700/50 shadow-lg pointer-events-none">
          {pill}
        </div>
      )}

      <div className="absolute bottom-3 left-3 z-10 flex items-center gap-2 bg-[#040a18]/70 backdrop-blur-xl px-3 py-1.5 rounded-lg border border-white/10 text-[11px] font-mono shadow-2xl pointer-events-none">
        <span className="text-slate-400">TELEMETRY NODES:</span>
        <span className="text-cyan-400 flex items-center gap-1 font-bold">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          {nodes.length} LIVE
        </span>
        <span className="text-slate-600">|</span>
        <span className="text-slate-400">{geoState === 'ready' ? countriesRef.current.length : '-'} BORDERS</span>
      </div>
    </div>
  );
};
