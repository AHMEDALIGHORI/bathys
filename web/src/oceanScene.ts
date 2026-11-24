import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { BathysAudio } from './audio';

export type ExperienceStage = 0 | 1 | 2 | 3; // 0: Hero, 1: Front Viewport, 2: Opposite Side, 3: Playable Dive

export interface LocationNote {
  id: string;
  tag: string;
  title: string;
  desc: string;
  pos: THREE.Vector3;
  radius: number;
}

interface FishAgent {
  group: THREE.Object3D;
  tail: THREE.Object3D | null;
  schoolCenter: THREE.Vector3;
  orbitRadius: number;
  orbitSpeed: number;
  phase: number;
  heightOffset: number;
  turnLag: number;
  currentAngle: number;
}

interface SwayItem {
  obj: THREE.Object3D;
  phase: number;
  amp: number;
  speed: number;
  baseRotX: number;
  baseRotZ: number;
}

export class OceanScene {
  private canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private audio: BathysAudio;

  // Submersible & named parts
  private subRoot = new THREE.Group();
  private subModel: THREE.Object3D | null = null;
  private propellers: THREE.Object3D[] = [];
  private headlampMeshes: THREE.Mesh[] = [];
  private speedNeedle: THREE.Object3D | null = null;
  private compassDial: THREE.Object3D | null = null;
  private headlampSwitch: THREE.Object3D | null = null;

  // Lighting & volumetric beams
  private openingSpot: THREE.SpotLight;
  private ambientLight: THREE.AmbientLight;
  private hemiLight: THREE.HemisphereLight;
  private dirLight: THREE.DirectionalLight;
  private revealGlowLight: THREE.PointLight;
  private cabinLight: THREE.PointLight;
  private headlampSpots: THREE.SpotLight[] = [];
  private headlampCones: THREE.Mesh[] = [];

  // Ocean life & environment
  private marineSnow: THREE.Points | null = null;
  private fishes: FishAgent[] = [];
  private sharkGroup: THREE.Object3D | null = null;
  private sharkTail: THREE.Object3D | null = null;
  private swayItems: SwayItem[] = [];
  private wreckCenter = new THREE.Vector3(14, -7.2, -32);
  private wreckRadius = 11.5;

  // State
  private illuminated = false;
  private headlampsOn = false;
  private revealProgress = 0; // 0 -> 1 expanding blue glow
  private stage: ExperienceStage = 0;
  private inCockpit = false;
  private cockpitBlend = 0; // 0 = chase, 1 = cockpit
  private pausedForArchive = false;

  // Camera tour interpolation (continuous from current viewpoint!)
  private cameraMoving = false;
  private moveTime = 0;
  private moveDuration = 2.05;
  private moveFromStage: ExperienceStage = 0;
  private moveToStage: ExperienceStage = 0;
  private moveStartOffset = new THREE.Vector3();
  private moveStartLook = new THREE.Vector3();
  private currentCamOffset = new THREE.Vector3(-4.8, 1.8, 4.9);
  private currentLookOffset = new THREE.Vector3(0, 0.05, 0);

  // Orbit & Parallax between shots
  private orbitYaw = 0;
  private orbitPitch = 0;
  private isDragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private pointerDownTime = 0;
  private pointerMoved = false;
  private mouseNormX = 0;
  private mouseNormY = 0;
  private smoothParallaxX = 0;
  private smoothParallaxY = 0;

  // Playable submarine physics
  private keys = new Set<string>();
  private subSpeed = 0; // units/sec
  private subYaw = 0; // radians, 0 = facing -Z
  private subRoll = 0;
  private subPitch = 0;

  // Raycaster for clicking the submersible & cockpit switch
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();

  // Callbacks
  public onLoadProgress?: (pct: number) => void;
  public onLoaded?: () => void;
  public onIlluminated?: () => void;
  public onStageChanged?: (stage: ExperienceStage, settling: boolean) => void;
  public onTelemetry?: (speedKts: number, headingDeg: number, depthM: number, inCockpit: boolean) => void;
  public onLocationChanged?: (note: LocationNote | null) => void;

  private activeLocationId: string | null = null;
  private locations: LocationNote[] = [
    {
      id: 'wreck',
      tag: 'SECTOR 04 · SUNKEN HULL',
      title: 'SS VANGUARD WRECK',
      desc: 'Exposed steel ribs and collapsed superstructure resting at 3,848m. High-CRI LED beams reveal oxidized iron plates and benthic colonization.',
      pos: new THREE.Vector3(14, -4.5, -32),
      radius: 22,
    },
    {
      id: 'kelp',
      tag: 'SECTOR 02 · BENTHIC GARDEN',
      title: 'ABYSSAL FLORA PATCH',
      desc: 'Olive-green kelp ribbons, dusky violet sea fans, and clustered pink tube sponges anchored to volcanic basalt.',
      pos: new THREE.Vector3(-12, -5.0, -18),
      radius: 15,
    },
    {
      id: 'school',
      tag: 'SECTOR 03 · PELAGIC ZONE',
      title: 'DEEP-SEA SHOAL',
      desc: 'Whisper-quiet vectored thrusters allow BATHYS to glide within meters of silver-blue and copper-red schools without startling marine life.',
      pos: new THREE.Vector3(2, -1.0, -16),
      radius: 13,
    },
    {
      id: 'ridge',
      tag: 'SECTOR 05 · TRENCH RIM',
      title: 'MIDNIGHT RIDGE',
      desc: 'Carbon-titanium pressure hull certified to 4,000 meters, engineered for silent long-endurance reconnaissance.',
      pos: new THREE.Vector3(-22, -4.0, -46),
      radius: 18,
    },
  ];

  private clock = new THREE.Clock();
  private elapsed = 0;

  constructor(canvas: HTMLCanvasElement, audio: BathysAudio) {
    this.canvas = canvas;
    this.audio = audio;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);
    this.scene.fog = new THREE.FogExp2(0x000000, 0.042);

    this.camera = new THREE.PerspectiveCamera(46, window.innerWidth / window.innerHeight, 0.08, 220);
    this.camera.position.copy(this.currentCamOffset);
    this.camera.lookAt(0, 0.05, 0);

    // Opening circular pool of light (only light on before click!)
    this.openingSpot = new THREE.SpotLight(0xcbe2ff, 38, 22, Math.PI * 0.21, 0.65, 1.4);
    this.openingSpot.position.set(0, 8.5, 1.2);
    this.openingSpot.target.position.set(0, 0, 0);
    this.scene.add(this.openingSpot, this.openingSpot.target);

    // Ocean atmosphere lights (start at 0, fade in smoothly after click!)
    this.ambientLight = new THREE.AmbientLight(0x163252, 0.0);
    this.hemiLight = new THREE.HemisphereLight(0x2a6699, 0x050e1c, 0.0);
    this.dirLight = new THREE.DirectionalLight(0x4b8ec2, 0.0);
    this.dirLight.position.set(-18, 36, 16);
    this.scene.add(this.ambientLight, this.hemiLight, this.dirLight);

    // Expanding blue reveal glow
    this.revealGlowLight = new THREE.PointLight(0x3a9cff, 0, 120, 1.3);
    this.revealGlowLight.position.set(0, 1.2, 0);
    this.scene.add(this.revealGlowLight);

    // Submersible root container
    this.subRoot.position.set(0, 0, 0);
    this.scene.add(this.subRoot);

    // Warm interior cabin glow
    this.cabinLight = new THREE.PointLight(0xffaa4c, 1.6, 4.2, 1.8);
    this.cabinLight.position.set(0, 0.22, -1.05);
    this.subRoot.add(this.cabinLight);

    this.setupHeadlampLights();
    this.buildSeabedAndRidges();
    this.buildMarineSnow();
    this.bindEvents();
    this.loadAllModels();
    this.animate();
  }

  private setupHeadlampLights(): void {
    // Dual forward SpotLights + soft volumetric cones attached to subRoot
    // Note: in glTF (+Y up), Blender +Y nose maps to Three.js -Z!
    const positions = [
      new THREE.Vector3(-1.52, -0.04, -0.84),
      new THREE.Vector3(1.52, -0.04, -0.84),
    ];
    const coneGeo = new THREE.ConeGeometry(4.2, 24, 24, 1, true);
    coneGeo.translate(0, -12, 0);
    coneGeo.rotateX(Math.PI * 0.5);

    for (const pos of positions) {
      const spot = new THREE.SpotLight(0xe4f3ff, 0, 68, Math.PI * 0.24, 0.62, 1.2);
      spot.position.copy(pos);
      const target = new THREE.Object3D();
      target.position.set(pos.x * 0.45, -1.8, -28);
      this.subRoot.add(spot, target);
      spot.target = target;
      this.headlampSpots.push(spot);

      const coneMat = new THREE.MeshBasicMaterial({
        color: 0x7ac3ff,
        transparent: true,
        opacity: 0.0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });
      const cone = new THREE.Mesh(coneGeo, coneMat);
      cone.position.copy(pos);
      cone.lookAt(target.position);
      this.subRoot.add(cone);
      this.headlampCones.push(cone);
    }
  }

  private terrainHeight(x: number, z: number): number {
    // Gentle rolling seabed around y = -6.8 with distant ridges rising up around perimeter
    const base =
      Math.sin(x * 0.065) * 1.15 +
      Math.cos(z * 0.055) * 1.25 +
      Math.sin((x + z) * 0.13) * 0.48 +
      Math.cos(x * 0.22 - z * 0.18) * 0.22;
    const dist = Math.hypot(x, z + 24);
    const ridge = Math.max(0, (dist - 42) * 0.22) * (0.65 + 0.5 * Math.sin(Math.atan2(z, x) * 5.0));
    return -6.8 + base + ridge;
  }

  private buildSeabedAndRidges(): void {
    const geo = new THREE.PlaneGeometry(180, 180, 96, 96);
    geo.rotateX(-Math.PI * 0.5);
    const pos = geo.attributes.position;
    const colors: number[] = [];
    const cSand = new THREE.Color(0x0c1b2c);
    const cRock = new THREE.Color(0x132437);

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i) - 24;
      pos.setZ(i, z);
      const y = this.terrainHeight(x, z);
      pos.setY(i, y);
      const t = Math.min(1, Math.max(0, (y + 7.8) / 4.5));
      const c = cSand.clone().lerp(cRock, t);
      colors.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.92,
      metalness: 0.08,
    });
    const seabed = new THREE.Mesh(geo, mat);
    seabed.receiveShadow = true;
    this.scene.add(seabed);

    // Scattered volcanic boulders along the seabed
    const rockGeo = new THREE.DodecahedronGeometry(1.0, 1);
    const rockMat = new THREE.MeshStandardMaterial({
      color: 0x162433,
      roughness: 0.88,
      metalness: 0.12,
      flatShading: true,
    });
    const rockCoords: [number, number, number][] = [
      [-9, -11, 2.2], [-14, -18, 2.8], [-6, -24, 1.7], [11, -14, 2.5],
      [22, -26, 3.6], [-20, -34, 3.8], [5, -44, 3.1], [-12, -48, 3.4],
      [28, -42, 4.2], [-26, -15, 3.2], [18, -6, 2.1], [-16, 4, 2.4],
      [12, 8, 2.0], [-4, -36, 1.9], [24, -18, 2.4],
    ];
    for (const [rx, rz, scale] of rockCoords) {
      const rock = new THREE.Mesh(rockGeo, rockMat);
      const ry = this.terrainHeight(rx, rz);
      rock.position.set(rx, ry + scale * 0.35, rz);
      rock.scale.set(scale * 1.25, scale * 0.78, scale);
      rock.rotation.set(rx * 0.3, rz * 0.5, rx * 0.2);
      this.scene.add(rock);
    }
  }

  private buildMarineSnow(): void {
    const count = 900;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 95;
      positions[i * 3 + 1] = -7 + Math.random() * 24;
      positions[i * 3 + 2] = 18 - Math.random() * 110;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0x8ec8f5,
      size: 0.085,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.marineSnow = new THREE.Points(geo, mat);
    this.scene.add(this.marineSnow);
  }

  private loadAllModels(): void {
    const manager = new THREE.LoadingManager();
    manager.onProgress = (_url, loaded, total) => {
      const pct = Math.min(100, Math.round((loaded / Math.max(1, total)) * 100));
      this.onLoadProgress?.(pct);
    };
    manager.onLoad = () => {
      this.onLoadProgress?.(100);
      this.onLoaded?.();
    };

    const loader = new GLTFLoader(manager);

    // 1. Load BATHYS submersible (actual GLB used everywhere)
    loader.load('./models/bathys.glb', (gltf) => {
      this.subModel = gltf.scene;
      this.subModel.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          if (mesh.name.startsWith('Propeller_')) {
            this.propellers.push(mesh);
          }
          if (mesh.name.startsWith('Headlamp_')) {
            this.headlampMeshes.push(mesh);
            const m = (mesh.material as THREE.MeshStandardMaterial).clone();
            m.emissiveIntensity = 0.08; // Dim until clicked!
            mesh.material = m;
          }
          if (mesh.name === 'Viewport_Glass' || mesh.name === 'Top_Cupola_Glass') {
            mesh.material = new THREE.MeshPhysicalMaterial({
              color: 0x88b4cc,
              metalness: 0.06,
              roughness: 0.07,
              transmission: 0.72,
              transparent: true,
              opacity: 0.34,
              ior: 1.49,
              reflectivity: 0.85,
              depthWrite: false,
            });
          }
        }
        if (child.name === 'Cockpit_SpeedNeedle') this.speedNeedle = child;
        if (child.name === 'Cockpit_CompassDial') this.compassDial = child;
        if (child.name === 'Cockpit_HeadlampSwitch') this.headlampSwitch = child;
      });
      this.subRoot.add(this.subModel);
    });

    // 2. Load Sunken Shipwreck (angled & partially buried in sediment)
    loader.load('./models/shipwreck.glb', (gltf) => {
      const wreck = gltf.scene;
      const wy = this.terrainHeight(this.wreckCenter.x, this.wreckCenter.z);
      wreck.position.set(this.wreckCenter.x, wy + 0.55, this.wreckCenter.z);
      wreck.rotation.set(0.11, -0.78, -0.22); // Dramatic resting angle
      wreck.scale.setScalar(1.12);
      this.scene.add(wreck);
    });

    // 3. Load Three Distinct Fish Species (loosely spaced schools)
    const schoolConfigs = [
      { url: './models/fish_silver_blue.glb', center: new THREE.Vector3(-4, 0.8, -12), count: 9, radius: 5.5, speed: 0.38 },
      { url: './models/fish_muted_gold.glb', center: new THREE.Vector3(7, -1.4, -22), count: 8, radius: 6.2, speed: 0.31 },
      { url: './models/fish_copper_red.glb', center: new THREE.Vector3(-12, -2.1, -28), count: 8, radius: 5.8, speed: 0.35 },
    ];
    for (const cfg of schoolConfigs) {
      loader.load(cfg.url, (gltf) => {
        for (let i = 0; i < cfg.count; i++) {
          const clone = gltf.scene.clone(true);
          const scale = 0.72 + Math.random() * 0.58;
          clone.scale.setScalar(scale);
          this.scene.add(clone);
          const tail = clone.getObjectByName('Fish_TailFin') ?? null;
          this.fishes.push({
            group: clone,
            tail,
            schoolCenter: cfg.center.clone(),
            orbitRadius: cfg.radius + (Math.random() - 0.5) * 3.2,
            orbitSpeed: cfg.speed * (0.86 + Math.random() * 0.28),
            phase: (i / cfg.count) * Math.PI * 2 + Math.random() * 0.6,
            heightOffset: (Math.random() - 0.5) * 2.4,
            turnLag: Math.random() * 1.4,
            currentAngle: (i / cfg.count) * Math.PI * 2,
          });
        }
      });
    }

    // 4. Load Shark (gliding occasionally across the distance)
    loader.load('./models/shark.glb', (gltf) => {
      this.sharkGroup = gltf.scene;
      this.sharkGroup.scale.setScalar(1.35);
      this.sharkTail = this.sharkGroup.getObjectByName('Shark_Tail') ?? null;
      this.scene.add(this.sharkGroup);
    });

    // 5. Load Four Ocean Floor Marine Life Assets (rich patches + open sand stretches)
    const patchCenters = [
      new THREE.Vector2(-11, -16),
      new THREE.Vector2(9, -24),
      new THREE.Vector2(18, -36),
      new THREE.Vector2(-15, -36),
      new THREE.Vector2(4, -12),
      new THREE.Vector2(-6, -26),
    ];

    // Seaweed (slow current sway)
    loader.load('./models/seaweed.glb', (gltf) => {
      for (const pc of patchCenters) {
        for (let i = 0; i < 4; i++) {
          const x = pc.x + (Math.random() - 0.5) * 9;
          const z = pc.y + (Math.random() - 0.5) * 9;
          const clone = gltf.scene.clone(true);
          const s = 0.75 + Math.random() * 0.85;
          clone.scale.setScalar(s);
          clone.position.set(x, this.terrainHeight(x, z) - 0.12, z);
          clone.rotation.y = Math.random() * Math.PI * 2;
          this.scene.add(clone);
          this.swayItems.push({
            obj: clone,
            phase: Math.random() * Math.PI * 2,
            amp: 0.085,
            speed: 1.05,
            baseRotX: 0,
            baseRotZ: 0,
          });
        }
      }
    });

    // Dusky violet sea fans (gentler flex on rock faces)
    loader.load('./models/sea_fan.glb', (gltf) => {
      for (const pc of patchCenters) {
        for (let i = 0; i < 3; i++) {
          const x = pc.x + (Math.random() - 0.5) * 8;
          const z = pc.y + (Math.random() - 0.5) * 8;
          const clone = gltf.scene.clone(true);
          clone.scale.setScalar(0.85 + Math.random() * 0.75);
          clone.position.set(x, this.terrainHeight(x, z) - 0.05, z);
          clone.rotation.set((Math.random() - 0.5) * 0.25, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.25);
          this.scene.add(clone);
          this.swayItems.push({
            obj: clone,
            phase: Math.random() * Math.PI * 2,
            amp: 0.04,
            speed: 0.85,
            baseRotX: clone.rotation.x,
            baseRotZ: clone.rotation.z,
          });
        }
      }
    });

    // Muted pink tube sponges (tucked into crevices)
    loader.load('./models/tube_sponge.glb', (gltf) => {
      for (const pc of patchCenters) {
        for (let i = 0; i < 3; i++) {
          const x = pc.x + (Math.random() - 0.5) * 7.5;
          const z = pc.y + (Math.random() - 0.5) * 7.5;
          const clone = gltf.scene.clone(true);
          clone.scale.setScalar(0.75 + Math.random() * 0.75);
          clone.position.set(x, this.terrainHeight(x, z) - 0.08, z);
          clone.rotation.y = Math.random() * Math.PI * 2;
          this.scene.add(clone);
        }
      }
    });

    // Small pink anemones
    loader.load('./models/anemone.glb', (gltf) => {
      for (const pc of patchCenters) {
        for (let i = 0; i < 4; i++) {
          const x = pc.x + (Math.random() - 0.5) * 7;
          const z = pc.y + (Math.random() - 0.5) * 7;
          const clone = gltf.scene.clone(true);
          clone.scale.setScalar(0.85 + Math.random() * 0.7);
          clone.position.set(x, this.terrainHeight(x, z) - 0.04, z);
          clone.rotation.y = Math.random() * Math.PI * 2;
          this.scene.add(clone);
        }
      }
    });
  }

  private bindEvents(): void {
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    this.canvas.addEventListener('pointerdown', (e) => {
      this.isDragging = true;
      this.dragStartX = e.clientX;
      this.dragStartY = e.clientY;
      this.pointerDownTime = performance.now();
      this.pointerMoved = false;
    });

    window.addEventListener('pointermove', (e) => {
      this.mouseNormX = (e.clientX / window.innerWidth) * 2 - 1;
      this.mouseNormY = (e.clientY / window.innerHeight) * 2 - 1;
      if (!this.isDragging) return;
      const dx = e.clientX - this.dragStartX;
      const dy = e.clientY - this.dragStartY;
      if (Math.hypot(dx, dy) > 4) this.pointerMoved = true;

      // Allow click-and-drag orbit between camera tour shots (Stages 0, 1, 2)
      if (this.illuminated && this.stage < 3 && !this.cameraMoving && !this.pausedForArchive) {
        this.orbitYaw -= dx * 0.0055;
        this.orbitPitch = Math.max(-0.55, Math.min(0.68, this.orbitPitch + dy * 0.0045));
      }
      this.dragStartX = e.clientX;
      this.dragStartY = e.clientY;
    });

    window.addEventListener('pointerup', (e) => {
      if (!this.isDragging) return;
      this.isDragging = false;
      const elapsedClick = performance.now() - this.pointerDownTime;
      if (!this.pointerMoved && elapsedClick < 320 && !this.pausedForArchive) {
        this.handleCanvasClick(e.clientX, e.clientY);
      }
    });

    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      this.keys.add(k);
      if (k === 'e' && this.stage === 3 && !this.pausedForArchive) {
        this.toggleCockpit();
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.key.toLowerCase());
    });
  }

  private handleCanvasClick(clientX: number, clientY: number): void {
    this.pointer.x = (clientX / window.innerWidth) * 2 - 1;
    this.pointer.y = -(clientY / window.innerHeight) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);

    // 1. Opening click to illuminate!
    if (!this.illuminated) {
      // Allow clicking anywhere on the submersible (or central spotlight zone) to illuminate
      this.triggerIllumination();
      return;
    }

    // 2. Inside cockpit: clickable headlight switch!
    if (this.stage === 3 && this.inCockpit && this.headlampSwitch) {
      const hits = this.raycaster.intersectObject(this.headlampSwitch, true);
      if (hits.length > 0) {
        this.toggleHeadlamps();
      }
    }
  }

  public triggerIllumination(): void {
    if (this.illuminated) return;
    this.illuminated = true;
    this.headlampsOn = true;
    this.audio.start();
    this.audio.playHeadlampSwitch();
    this.audio.playIlluminationSwell();
    this.updateHeadlampVisuals();
    this.onIlluminated?.();
  }

  public toggleHeadlamps(): void {
    this.headlampsOn = !this.headlampsOn;
    this.audio.playHeadlampSwitch();
    this.updateHeadlampVisuals();
  }

  private updateHeadlampVisuals(): void {
    const on = this.headlampsOn;
    for (const spot of this.headlampSpots) {
      spot.intensity = on ? 95 : 0;
    }
    for (const cone of this.headlampCones) {
      (cone.material as THREE.MeshBasicMaterial).opacity = on ? 0.085 : 0.0;
    }
    for (const mesh of this.headlampMeshes) {
      (mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = on ? 12.0 : 0.1;
    }
    if (this.headlampSwitch) {
      const m = (this.headlampSwitch as THREE.Mesh).material as THREE.MeshStandardMaterial;
      if (m && m.emissiveIntensity !== undefined) {
        m.emissiveIntensity = on ? 4.2 : 0.4;
      }
    }
  }

  public toggleCockpit(): void {
    this.inCockpit = !this.inCockpit;
    this.audio.playUiTick();
    this.audio.setCockpitMode(this.inCockpit);
  }

  public setArchivePaused(paused: boolean): void {
    this.pausedForArchive = paused;
    this.audio.setArchiveMode(paused);
  }

  public getStage(): ExperienceStage {
    return this.stage;
  }

  public isIlluminated(): boolean {
    return this.illuminated;
  }

  public isCameraMoving(): boolean {
    return this.cameraMoving;
  }

  public goToStage(target: ExperienceStage): void {
    if (!this.illuminated) {
      this.triggerIllumination();
    }
    if (target === this.stage && !this.cameraMoving) return;

    // Exit cockpit smoothly if leaving dive stage
    if (target < 3 && this.inCockpit) {
      this.inCockpit = false;
      this.audio.setCockpitMode(false);
    }

    // Start transition from visitor's exact current camera viewpoint for continuous motion!
    this.moveStartOffset.copy(this.camera.position).sub(this.subRoot.position);
    this.moveStartLook.copy(this.currentLookOffset);
    this.moveFromStage = this.stage;
    this.moveToStage = target;
    this.stage = target;
    this.moveTime = 0;
    this.cameraMoving = true;
    this.orbitYaw = 0;
    this.orbitPitch = 0;

    const panDir = target === 1 ? -1 : target === 2 ? 1 : -0.7;
    this.audio.playCameraMove(panDir);
    this.onStageChanged?.(target, false);
  }

  public captureSnapshot(): string {
    this.renderer.render(this.scene, this.camera);
    return this.canvas.toDataURL('image/jpeg', 0.88);
  }

  private getStageBaseOffset(st: ExperienceStage): THREE.Vector3 {
    switch (st) {
      case 0: // Hero side-3/4 view
        return new THREE.Vector3(-4.8, 1.8, 4.9);
      case 1: // Move 1: Directly in front of panoramic glass viewport (nose points -Z)
        return new THREE.Vector3(0.0, 0.35, -5.6);
      case 2: // Move 2: Opposite starboard side after passing over roof
        return new THREE.Vector3(5.4, 1.35, -1.1);
      case 3: // Move 3: Just above & behind stern facing open ocean (-Z)
        return new THREE.Vector3(0.0, 2.1, 6.2);
    }
  }

  private getStageLookOffset(st: ExperienceStage): THREE.Vector3 {
    switch (st) {
      case 0: return new THREE.Vector3(0, 0.05, 0);
      case 1: return new THREE.Vector3(0, 0.08, -1.1);
      case 2: return new THREE.Vector3(0, 0.1, 0);
      case 3: return new THREE.Vector3(0, 0.35, -7.5);
    }
  }

  private computeTourPosition(t: number): THREE.Vector3 {
    // Smooth ease-in-out cubic
    const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    const endOffset = this.getStageBaseOffset(this.moveToStage);
    const out = new THREE.Vector3().lerpVectors(this.moveStartOffset, endOffset, e);

    // Sculpted cinematic arc waypoints matching the 3 specified moves:
    const arc = Math.sin(e * Math.PI);
    if (this.moveFromStage === 0 && this.moveToStage === 1) {
      // 1. Arc from the side around the nose to front of glass viewport
      out.x -= arc * 2.4;
      out.z -= arc * 2.2;
    } else if (this.moveFromStage === 1 && this.moveToStage === 2) {
      // 2. Rise from front, pass directly over the roof, descend to opposite side
      out.y += arc * 4.6;
      out.x += arc * 1.4;
    } else if (this.moveFromStage === 2 && this.moveToStage === 3) {
      // 3. Sweep beneath the hull, curve around stern, settle above & behind
      out.y -= Math.sin(e * Math.PI * 1.15) * 3.1 * (1 - e * 0.55);
      out.x += arc * 2.6;
      out.z += arc * 2.0;
    }
    return out;
  }

  private updateSubmarinePhysics(dt: number): void {
    const forwardPressed = this.stage === 3 && !this.pausedForArchive && (this.keys.has('w') || this.keys.has('arrowup'));
    const leftPressed = this.stage === 3 && !this.pausedForArchive && (this.keys.has('a') || this.keys.has('arrowleft'));
    const rightPressed = this.stage === 3 && !this.pausedForArchive && (this.keys.has('d') || this.keys.has('arrowright'));

    // Gradual acceleration & gentle underwater inertia
    const maxSpeed = 6.8;
    const targetSpeed = forwardPressed ? maxSpeed : 0;
    const accelRate = forwardPressed ? 2.6 : 1.35;
    this.subSpeed += (targetSpeed - this.subSpeed) * Math.min(1, dt * accelRate);

    // Smooth steering with subtle banking roll
    const steerInput = (leftPressed ? 1 : 0) - (rightPressed ? 1 : 0);
    const turnRate = 0.82 * (0.45 + 0.55 * (this.subSpeed / maxSpeed));
    this.subYaw += steerInput * turnRate * dt;

    const targetRoll = -steerInput * 0.16;
    const targetPitch = -this.subSpeed * 0.012;
    this.subRoll += (targetRoll - this.subRoll) * Math.min(1, dt * 3.5);
    this.subPitch += (targetPitch - this.subPitch) * Math.min(1, dt * 3.0);

    // Move along heading (-Z forward)
    const dirX = -Math.sin(this.subYaw);
    const dirZ = -Math.cos(this.subYaw);
    const nextX = this.subRoot.position.x + dirX * this.subSpeed * dt;
    const nextZ = this.subRoot.position.z + dirZ * this.subSpeed * dt;

    // Wreck collision avoidance: smoothly slide around shipwreck hull!
    const dxW = nextX - this.wreckCenter.x;
    const dzW = nextZ - this.wreckCenter.z;
    const distW = Math.hypot(dxW, dzW);
    if (distW < this.wreckRadius) {
      const push = (this.wreckRadius - distW) / Math.max(0.01, distW);
      this.subRoot.position.x = nextX + dxW * push;
      this.subRoot.position.z = nextZ + dzW * push;
      this.subSpeed *= 0.88;
    } else {
      // Keep inside ocean basin bounds
      this.subRoot.position.x = Math.max(-55, Math.min(55, nextX));
      this.subRoot.position.z = Math.max(-72, Math.min(28, nextZ));
    }

    // Gentle buoyant hover & keep safe clearance above seabed
    const floorY = this.terrainHeight(this.subRoot.position.x, this.subRoot.position.z);
    const desiredY = Math.max(floorY + 2.4, Math.sin(this.elapsed * 0.85) * 0.16);
    this.subRoot.position.y += (desiredY - this.subRoot.position.y) * Math.min(1, dt * 2.2);

    this.subRoot.rotation.set(this.subPitch, this.subYaw, this.subRoll, 'YXZ');

    // Spin all 4 propellers proportionally to speed
    const propSpin = (2.2 + this.subSpeed * 2.8) * dt;
    for (const prop of this.propellers) {
      prop.rotation.z += propSpin;
    }

    // Animate functional cockpit instruments!
    const speedRatio = Math.min(1, this.subSpeed / maxSpeed);
    if (this.speedNeedle) {
      this.speedNeedle.rotation.y = -1.2 + speedRatio * 2.4;
    }
    if (this.compassDial) {
      this.compassDial.rotation.y = -this.subYaw;
    }

    this.audio.setSpeed(speedRatio);

    // Update HUD telemetry & location cards
    if (this.stage === 3) {
      const headingDeg = (((-this.subYaw * 180) / Math.PI) % 360 + 360) % 360;
      const depthM = Math.round(3842 - this.subRoot.position.y * 6);
      this.onTelemetry?.(this.subSpeed * 1.35, headingDeg, depthM, this.inCockpit);

      // Check nearby points of interest
      let found: LocationNote | null = null;
      for (const loc of this.locations) {
        if (this.subRoot.position.distanceTo(loc.pos) < loc.radius) {
          found = loc;
          break;
        }
      }
      const nextId = found ? found.id : null;
      if (nextId !== this.activeLocationId) {
        this.activeLocationId = nextId;
        this.onLocationChanged?.(found);
      }
    }
  }

  private updateCamera(dt: number): void {
    this.smoothParallaxX += (this.mouseNormX - this.smoothParallaxX) * Math.min(1, dt * 4.0);
    this.smoothParallaxY += (this.mouseNormY - this.smoothParallaxY) * Math.min(1, dt * 4.0);

    if (this.cameraMoving) {
      this.moveTime += dt;
      const t = Math.min(1, this.moveTime / this.moveDuration);
      const offset = this.computeTourPosition(t);
      const targetLook = this.getStageLookOffset(this.moveToStage);
      const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      this.currentLookOffset.lerpVectors(this.moveStartLook, targetLook, e);

      // Rotate offset by subYaw when settling into dive stage
      const worldOffset = offset.clone();
      if (this.moveToStage === 3) {
        worldOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.subYaw * e);
      }
      this.camera.position.copy(this.subRoot.position).add(worldOffset);
      const lookWorld = this.currentLookOffset.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), this.subYaw * e).add(this.subRoot.position);
      this.camera.lookAt(lookWorld);

      if (t >= 1) {
        this.cameraMoving = false;
        this.currentCamOffset.copy(this.getStageBaseOffset(this.moveToStage));
        this.onStageChanged?.(this.stage, true);
      }
      return;
    }

    if (this.stage < 3) {
      // Orbit + noticeable smooth horizontal & vertical cursor parallax
      const base = this.getStageBaseOffset(this.stage);
      const spherical = new THREE.Spherical().setFromVector3(base);
      spherical.theta += this.orbitYaw + this.smoothParallaxX * 0.22;
      spherical.phi = Math.max(0.35, Math.min(Math.PI - 0.35, spherical.phi + this.orbitPitch - this.smoothParallaxY * 0.14));
      const desired = new THREE.Vector3().setFromSpherical(spherical).add(this.subRoot.position);
      this.camera.position.lerp(desired, Math.min(1, dt * 6.5));
      const lookTarget = this.getStageLookOffset(this.stage).add(this.subRoot.position);
      this.camera.lookAt(lookTarget);
    } else {
      // Playable Exploration: smooth blend between Rear Chase (0) and Pilot Eye-Level Cockpit (1)
      const targetBlend = this.inCockpit ? 1 : 0;
      this.cockpitBlend += (targetBlend - this.cockpitBlend) * Math.min(1, dt * 4.2);

      // Chase camera local offset behind & above stern
      const chaseLocal = new THREE.Vector3(
        this.smoothParallaxX * 0.55,
        2.1 - this.smoothParallaxY * 0.35,
        6.2 + this.subSpeed * 0.16
      );
      const chaseLookLocal = new THREE.Vector3(0, 0.35, -9.5);

      // Pilot eye-level cockpit local offset (looking forward past dashboard through panoramic viewport)
      const cockpitLocal = new THREE.Vector3(
        this.smoothParallaxX * 0.04,
        0.19 - this.smoothParallaxY * 0.025,
        -0.54
      );
      const cockpitLookLocal = new THREE.Vector3(
        this.smoothParallaxX * 0.35,
        0.04 - this.smoothParallaxY * 0.18,
        -8.5
      );

      const localPos = new THREE.Vector3().lerpVectors(chaseLocal, cockpitLocal, this.cockpitBlend);
      const localLook = new THREE.Vector3().lerpVectors(chaseLookLocal, cockpitLookLocal, this.cockpitBlend);

      const worldPos = localPos.applyMatrix4(this.subRoot.matrixWorld);
      const worldLook = localLook.applyMatrix4(this.subRoot.matrixWorld);

      this.camera.position.lerp(worldPos, Math.min(1, dt * 9.5));
      this.camera.lookAt(worldLook);
    }
  }

  private updateOceanLife(dt: number): void {
    // Expanding blue reveal illumination
    if (this.illuminated && this.revealProgress < 1) {
      this.revealProgress = Math.min(1, this.revealProgress + dt * 0.42);
      const ease = 1 - Math.pow(1 - this.revealProgress, 3);
      this.ambientLight.intensity = ease * 0.72;
      this.hemiLight.intensity = ease * 0.95;
      this.dirLight.intensity = ease * 1.15;
      this.openingSpot.intensity = 38 * (1 - ease * 0.65);

      // Soft blue expanding glow wave
      this.revealGlowLight.intensity = Math.sin(ease * Math.PI) * 85 + ease * 12;
      this.revealGlowLight.distance = 14 + ease * 96;

      const bgCol = new THREE.Color(0x000000).lerp(new THREE.Color(0x041225), ease);
      this.scene.background = bgCol;
      (this.scene.fog as THREE.FogExp2).color.copy(bgCol);
      (this.scene.fog as THREE.FogExp2).density = 0.042 - ease * 0.022;

      if (this.marineSnow) {
        (this.marineSnow.material as THREE.PointsMaterial).opacity = ease * 0.58;
      }
    }

    // Gently drift marine snow particles
    if (this.marineSnow) {
      this.marineSnow.rotation.y += dt * 0.006;
      this.marineSnow.position.y = Math.sin(this.elapsed * 0.25) * 0.4;
    }

    // Animate fish schools (loosely spaced, turning at staggered phases)
    for (const f of this.fishes) {
      const ang = this.elapsed * f.orbitSpeed + f.phase + Math.sin(this.elapsed * 0.45 + f.turnLag) * 0.35;
      const nx = f.schoolCenter.x + Math.cos(ang) * f.orbitRadius;
      const nz = f.schoolCenter.z + Math.sin(ang) * f.orbitRadius * 0.78;
      const ny = f.schoolCenter.y + f.heightOffset + Math.sin(this.elapsed * 0.9 + f.phase) * 0.32;
      const dx = nx - f.group.position.x;
      const dz = nz - f.group.position.z;
      f.group.position.set(nx, ny, nz);
      if (Math.abs(dx) + Math.abs(dz) > 0.0001) {
        f.group.rotation.y = Math.atan2(-dx, -dz);
      }
      if (f.tail) {
        f.tail.rotation.y = Math.sin(this.elapsed * 8.5 + f.phase * 3) * 0.34;
      }
    }

    // Animate distant shark gliding with slow, powerful tail movement
    if (this.sharkGroup) {
      const sAng = this.elapsed * 0.11;
      const sx = Math.cos(sAng) * 34;
      const sz = -34 + Math.sin(sAng) * 18;
      const sy = 3.2 + Math.sin(this.elapsed * 0.35) * 1.1;
      const dx = sx - this.sharkGroup.position.x;
      const dz = sz - this.sharkGroup.position.z;
      this.sharkGroup.position.set(sx, sy, sz);
      if (Math.abs(dx) + Math.abs(dz) > 0.0001) {
        this.sharkGroup.rotation.y = Math.atan2(-dx, -dz);
      }
      if (this.sharkTail) {
        this.sharkTail.rotation.y = Math.sin(this.elapsed * 2.8) * 0.32;
      }
    }

    // Sway seaweed & gently flex sea fans in the same underwater current
    for (const item of this.swayItems) {
      const wave = Math.sin(this.elapsed * item.speed + item.phase);
      item.obj.rotation.x = item.baseRotX + wave * item.amp;
      item.obj.rotation.z = item.baseRotZ + Math.cos(this.elapsed * item.speed * 0.8 + item.phase) * item.amp * 0.65;
    }
  }

  private animate = (): void => {
    requestAnimationFrame(this.animate);
    const dt = Math.min(0.05, this.clock.getDelta());
    this.elapsed += dt;

    if (!this.pausedForArchive) {
      this.updateSubmarinePhysics(dt);
      this.updateOceanLife(dt);
      this.updateCamera(dt);
      this.renderer.render(this.scene, this.camera);
    }
  };
}
