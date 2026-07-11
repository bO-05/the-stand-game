import * as THREE from 'three';
import { TIFO_DATA_URI } from '../assets/AssetData';
import {
  LEVELS,
  LANE_X,
  type Judgement,
  type Lane,
  type RunSnapshot,
  hash01,
  shutterOpenness,
} from '../game/LevelModel';

const HOME = new THREE.Color('#d92349');
const BONE = new THREE.Color('#f4ebd5');

export class StadiumWorld {
  readonly group = new THREE.Group();

  private readonly clockGroup = new THREE.Group();
  private readonly laneDecks: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>[] = [];
  private readonly pulseRings: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly shutterGroups: THREE.Group[] = [];
  private readonly shutterMaterials: THREE.MeshStandardMaterial[] = [];
  private readonly capo = new THREE.Group();
  private scarf!: THREE.Mesh;
  private readonly hazard = new THREE.Group();
  private readonly hazardMaterial = new THREE.MeshBasicMaterial({ color: '#6d67ff', transparent: true, opacity: 0.8 });
  private readonly crowd: THREE.InstancedMesh;
  private readonly crowdPositions: THREE.Vector3[] = [];
  private readonly crowdPhases: number[] = [];
  private readonly crowdMatrix = new THREE.Matrix4();
  private readonly crowdQuaternion = new THREE.Quaternion();
  private readonly crowdScale = new THREE.Vector3();
  private readonly floodlights: THREE.PointLight[] = [];
  private readonly confetti: THREE.Points;
  private flash = 0;
  private impact = 0;
  private currentLaneX = 0;
  private lastCycle = -1;
  private crowdTick = 0;

  constructor(private readonly scene: THREE.Scene) {
    this.scene.background = new THREE.Color('#06070b');
    this.scene.fog = new THREE.FogExp2('#080a11', 0.028);

    this.group.add(this.createStadiumShell());
    this.group.add(this.createDeck());
    this.crowd = this.createCrowd();
    this.group.add(this.crowd);
    this.group.add(this.createTifo());
    this.createShutters();
    this.createPulseRings();
    this.createCapo();
    this.createHazard();
    this.confetti = this.createConfetti();
    this.group.add(this.confetti);
    this.createLighting();
    this.group.add(this.clockGroup);
    this.scene.add(this.group);
  }

  update(snapshot: RunSnapshot, delta: number): void {
    const level = LEVELS[Math.min(snapshot.levelIndex, LEVELS.length - 1)];
    const active = ['playing', 'recovery', 'finale', 'rally'].includes(snapshot.phase);
    const time = snapshot.totalElapsed;

    if (snapshot.levelIndex !== this.lastCycle) {
      this.lastCycle = snapshot.levelIndex;
      this.setCyclePalette(level.color, level.rivalColor);
    }

    this.currentLaneX = THREE.MathUtils.damp(this.currentLaneX, LANE_X[snapshot.lane], 11, delta);
    this.capo.position.x = this.currentLaneX;
    this.capo.position.y = active ? Math.sin(time * (4 + snapshot.streak * 0.035)) * 0.045 : 0;
    this.capo.rotation.y = THREE.MathUtils.damp(this.capo.rotation.y, (LANE_X[snapshot.targetLane] - this.currentLaneX) * -0.035, 8, delta);
    this.scarf.rotation.z = Math.sin(time * 4.8) * 0.13 - 0.18;

    for (const lane of [0, 1, 2] as Lane[]) {
      const finaleOpen = snapshot.phase === 'finale' || snapshot.phase === 'results';
      const openness = finaleOpen ? 1 : shutterOpenness(snapshot.levelIndex, lane, snapshot.roundElapsed, snapshot.seed);
      const shutter = this.shutterGroups[lane];
      shutter.position.y = finaleOpen ? 15.4 : -0.2 + openness * 6.1;
      shutter.rotation.z = snapshot.levelIndex === 4 ? Math.sin(time * 1.08 + lane) * 0.035 : 0;
      this.shutterMaterials[lane].emissiveIntensity = 0.1 + (1 - openness) * 0.28;

      const deck = this.laneDecks[lane];
      const isPlayer = lane === snapshot.lane;
      const isTarget = lane === snapshot.targetLane;
      deck.material.emissiveIntensity = isPlayer ? 1.2 : isTarget ? 0.72 : 0.16;
      deck.scale.y = THREE.MathUtils.damp(deck.scale.y, isPlayer ? 1.22 : 1, 12, delta);

      const ring = this.pulseRings[lane];
      const ringScale = snapshot.inputBuffered ? 0.82 : 2.5 - snapshot.pulsePhase * 1.68;
      ring.scale.setScalar(Math.max(0.78, ringScale));
      const cueVisible = isTarget && active && snapshot.inputState !== 'preview' && snapshot.inputState !== 'between';
      ring.material.opacity = cueVisible ? (['active', 'grace'].includes(snapshot.inputState) ? 0.98 : 0.58) : 0.05;
      ring.material.color.set(snapshot.inputBuffered ? '#48baa7' : isTarget ? level.color : '#50535c');
    }

    this.crowdTick += delta;
    if (this.crowdTick >= 0.05) {
      this.updateCrowd(snapshot, time);
      this.crowdTick = 0;
    }
    this.updateHazard(snapshot, time);
    this.updateConfetti(snapshot, time, delta);

    this.flash = Math.max(0, this.flash - delta * 3.8);
    this.impact = Math.max(0, this.impact - delta * 2.1);
    for (const light of this.floodlights) {
      light.intensity = 5.5 + snapshot.energy * 0.055 + this.flash * 8;
    }
    this.scene.fog = new THREE.FogExp2(snapshot.phase === 'finale' ? '#160912' : '#080a11', snapshot.phase === 'finale' ? 0.019 : 0.028);
  }

  hitFeedback(grade: Judgement): void {
    this.flash = grade === 'perfect' ? 1 : grade === 'good' ? 0.55 : 0.3;
    this.impact = grade === 'miss' ? 0.65 : grade === 'perfect' ? 0.28 : 0.12;
  }

  hazardImpact(): void {
    this.flash = 0.9;
    this.impact = 1;
  }

  cycleBurst(): void {
    this.flash = 1.35;
  }

  getCameraShake(time: number): THREE.Vector3 {
    if (this.impact <= 0.001) return new THREE.Vector3();
    const power = this.impact * this.impact;
    return new THREE.Vector3(
      Math.sin(time * 47.3) * 0.16 * power,
      Math.sin(time * 61.7 + 1.1) * 0.12 * power,
      Math.sin(time * 39.1 + 2.7) * 0.08 * power,
    );
  }

  private createStadiumShell(): THREE.Group {
    const shell = new THREE.Group();
    const concrete = new THREE.MeshStandardMaterial({ color: '#171a20', roughness: 0.88, metalness: 0.05 });
    const trim = new THREE.MeshStandardMaterial({ color: '#7a1c33', roughness: 0.72, metalness: 0.08 });

    for (let row = 0; row < 8; row += 1) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(23 - row * 0.18, 0.5, 1.55), row % 3 === 0 ? trim : concrete);
      step.position.set(0, 0.1 + row * 0.56, -4.2 - row * 1.05);
      step.receiveShadow = true;
      shell.add(step);
    }

    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(28, 0.45, 5.5),
      new THREE.MeshStandardMaterial({ color: '#0c0e13', roughness: 0.65, metalness: 0.45 }),
    );
    roof.position.set(0, 9.7, -10.6);
    roof.rotation.x = -0.08;
    shell.add(roof);

    for (const x of [-11.3, 11.3]) {
      const tower = new THREE.Mesh(new THREE.BoxGeometry(0.65, 11, 0.65), concrete);
      tower.position.set(x, 5.2, -8.2);
      tower.castShadow = true;
      shell.add(tower);
    }

    const arcMaterial = new THREE.MeshStandardMaterial({ color: '#b52746', roughness: 0.42, metalness: 0.35, emissive: '#430515' });
    const arc = new THREE.Mesh(new THREE.TorusGeometry(13.2, 0.14, 8, 96, Math.PI), arcMaterial);
    arc.position.set(0, 3.3, -4.8);
    arc.rotation.z = Math.PI;
    shell.add(arc);
    return shell;
  }

  private createDeck(): THREE.Group {
    const deck = new THREE.Group();
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(26, 18),
      new THREE.MeshStandardMaterial({ color: '#0d1016', roughness: 0.72, metalness: 0.2, emissive: '#05060a' }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.25;
    floor.receiveShadow = true;
    deck.add(floor);

    for (const lane of [0, 1, 2] as Lane[]) {
      const material = new THREE.MeshStandardMaterial({
        color: lane === 1 ? '#4a1725' : '#2c1821',
        emissive: lane === 1 ? '#d92349' : '#7f1931',
        emissiveIntensity: 0.2,
        roughness: 0.36,
        metalness: 0.48,
      });
      const laneDeck = new THREE.Mesh(new THREE.BoxGeometry(3.55, 0.16, 10.5), material);
      laneDeck.position.set(LANE_X[lane], -0.08, 1.1);
      laneDeck.receiveShadow = true;
      this.laneDecks.push(laneDeck);
      deck.add(laneDeck);

      for (let tick = -4; tick <= 4; tick += 1) {
        const marker = new THREE.Mesh(
          new THREE.BoxGeometry(2.85, 0.025, 0.045),
          new THREE.MeshBasicMaterial({ color: tick === 0 ? '#f4ebd5' : '#84243b', transparent: true, opacity: tick === 0 ? 0.7 : 0.3 }),
        );
        marker.position.set(LANE_X[lane], 0.02, tick * 1.1 + 1.1);
        deck.add(marker);
      }
    }
    return deck;
  }

  private createCrowd(): THREE.InstancedMesh {
    const geometry = new THREE.CapsuleGeometry(0.13, 0.34, 3, 5);
    const material = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.72, metalness: 0.02, vertexColors: true });
    const columns = 30;
    const rows = 8;
    const mesh = new THREE.InstancedMesh(geometry, material, columns * rows);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.castShadow = false;
    const homePalette = ['#db2449', '#f2e8d2', '#711a33', '#171820', '#ef9e32'];
    const rivalPalette = ['#385f9d', '#d9e2ed', '#1e315d', '#5c55a6'];
    let index = 0;
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const x = -10.6 + column * (21.2 / (columns - 1));
        const z = -4.2 - row * 1.04;
        const y = 0.77 + row * 0.56;
        this.crowdPositions.push(new THREE.Vector3(x, y, z));
        this.crowdPhases.push(hash01(index * 17 + 11) * Math.PI * 2);
        const rival = column > 22 && row > 2;
        const palette = rival ? rivalPalette : homePalette;
        mesh.setColorAt(index, new THREE.Color(palette[Math.floor(hash01(index * 31 + 5) * palette.length)]));
        index += 1;
      }
    }
    mesh.instanceColor!.needsUpdate = true;
    return mesh;
  }

  private createTifo(): THREE.Group {
    const group = new THREE.Group();
    const texture = new THREE.TextureLoader().load(TIFO_DATA_URI);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    const banner = new THREE.Mesh(
      new THREE.PlaneGeometry(12.8, 7.15),
      new THREE.MeshStandardMaterial({ map: texture, roughness: 0.88, metalness: 0, emissive: '#160309', emissiveIntensity: 0.18 }),
    );
    banner.position.set(-2.5, 6.25, -13.15);
    banner.rotation.x = -0.03;
    group.add(banner);

    const rivalBanner = new THREE.Mesh(
      new THREE.PlaneGeometry(4.2, 6.4),
      new THREE.MeshStandardMaterial({ color: '#203863', roughness: 0.74, emissive: '#101d3b', emissiveIntensity: 0.5 }),
    );
    rivalBanner.position.set(7.2, 6.05, -13.12);
    group.add(rivalBanner);
    return group;
  }

  private createShutters(): void {
    for (const lane of [0, 1, 2] as Lane[]) {
      const group = new THREE.Group();
      const material = new THREE.MeshStandardMaterial({
        color: lane === 1 ? '#2a1118' : '#151821',
        roughness: 0.28,
        metalness: 0.76,
        emissive: lane === 1 ? '#8c1633' : '#23152b',
        emissiveIntensity: 0.18,
      });
      this.shutterMaterials.push(material);
      const panel = new THREE.Mesh(new THREE.BoxGeometry(3.72, 5.8, 0.32), material);
      panel.castShadow = true;
      panel.receiveShadow = true;
      group.add(panel);
      const slatMaterial = new THREE.MeshBasicMaterial({ color: '#b8334e', transparent: true, opacity: 0.42 });
      for (let slat = -2; slat <= 2; slat += 1) {
        const line = new THREE.Mesh(new THREE.BoxGeometry(3.54, 0.035, 0.34), slatMaterial);
        line.position.y = slat * 0.92;
        group.add(line);
      }
      group.position.set(LANE_X[lane], 4, -0.3);
      this.shutterGroups.push(group);
      this.group.add(group);
    }
  }

  private createPulseRings(): void {
    for (const lane of [0, 1, 2] as Lane[]) {
      const material = new THREE.MeshBasicMaterial({ color: '#f0b23d', transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false });
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.72, 0.82, 64), material);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(LANE_X[lane], 0.035, 2.2);
      this.pulseRings.push(ring);
      this.group.add(ring);
    }
  }

  private createCapo(): void {
    const coat = new THREE.MeshStandardMaterial({ color: '#15151b', roughness: 0.52, metalness: 0.18, emissive: '#15060a' });
    const skin = new THREE.MeshStandardMaterial({ color: '#b47759', roughness: 0.84 });
    const red = new THREE.MeshStandardMaterial({ color: '#d92349', roughness: 0.52, emissive: '#5d0619', emissiveIntensity: 0.6 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.52, 1.3, 8), coat);
    body.position.y = 1.05;
    body.castShadow = true;
    this.capo.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.31, 16, 10), skin);
    head.position.y = 1.9;
    head.castShadow = true;
    this.capo.add(head);
    const armGeometry = new THREE.CylinderGeometry(0.1, 0.12, 1.05, 7);
    const leftArm = new THREE.Mesh(armGeometry, coat);
    leftArm.position.set(-0.45, 1.45, 0);
    leftArm.rotation.z = -0.76;
    this.capo.add(leftArm);
    const rightArm = new THREE.Mesh(armGeometry, coat);
    rightArm.position.set(0.45, 1.45, 0);
    rightArm.rotation.z = 0.76;
    this.capo.add(rightArm);
    this.scarf = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.16, 0.08), red);
    this.scarf.position.set(0.15, 1.65, 0.18);
    this.capo.add(this.scarf);
    const megaphone = new THREE.Mesh(
      new THREE.ConeGeometry(0.26, 0.72, 12, 1, true),
      new THREE.MeshStandardMaterial({ color: '#f4ebd5', roughness: 0.5, metalness: 0.18 }),
    );
    megaphone.rotation.z = -Math.PI / 2;
    megaphone.position.set(0.92, 1.56, 0.02);
    this.capo.add(megaphone);
    this.capo.position.set(0, 0, 3.25);
    this.group.add(this.capo);
  }

  private createHazard(): void {
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 1), this.hazardMaterial);
    this.hazard.add(core);
    for (let index = 0; index < 3; index += 1) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.82 + index * 0.33, 0.05, 8, 42), this.hazardMaterial.clone());
      ring.rotation.x = Math.PI / 2;
      this.hazard.add(ring);
    }
    this.hazard.visible = false;
    this.group.add(this.hazard);
  }

  private createConfetti(): THREE.Points {
    const count = 520;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const palette = [HOME, BONE, new THREE.Color('#ef9e32'), new THREE.Color('#6d67ff')];
    for (let index = 0; index < count; index += 1) {
      positions[index * 3] = (hash01(index * 7 + 2) - 0.5) * 28;
      positions[index * 3 + 1] = hash01(index * 11 + 3) * 14 - 1;
      positions[index * 3 + 2] = (hash01(index * 13 + 4) - 0.5) * 18 - 2;
      const color = palette[Math.floor(hash01(index * 19 + 7) * palette.length)];
      colors[index * 3] = color.r;
      colors[index * 3 + 1] = color.g;
      colors[index * 3 + 2] = color.b;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const material = new THREE.PointsMaterial({ size: 0.12, vertexColors: true, transparent: true, opacity: 0, depthWrite: false });
    return new THREE.Points(geometry, material);
  }

  private createLighting(): void {
    this.group.add(new THREE.HemisphereLight('#7d91bd', '#16040b', 1.4));
    const key = new THREE.DirectionalLight('#ffd8b8', 2.8);
    key.position.set(-5, 12, 7);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -12;
    key.shadow.camera.right = 12;
    key.shadow.camera.top = 12;
    key.shadow.camera.bottom = -4;
    this.group.add(key);
    for (const x of [-9, -3, 3, 9]) {
      const light = new THREE.PointLight(x < 0 ? '#d92349' : '#ef9e32', 7, 22, 1.6);
      light.position.set(x, 8.4, -5.7);
      this.floodlights.push(light);
      this.group.add(light);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: '#fff5df' }));
      bulb.position.copy(light.position);
      this.group.add(bulb);
    }
  }

  private updateCrowd(snapshot: RunSnapshot, time: number): void {
    const energyFactor = 0.12 + snapshot.energy / 115;
    const waveOrigin = snapshot.lane * 2.1;
    for (let index = 0; index < this.crowdPositions.length; index += 1) {
      const base = this.crowdPositions[index];
      const phase = this.crowdPhases[index];
      const wave = Math.sin(time * (3.2 + snapshot.streak * 0.012) + phase + base.x * 0.2 + waveOrigin);
      const jump = Math.max(0, wave) * 0.18 * energyFactor;
      this.crowdMatrix.compose(
        new THREE.Vector3(base.x, base.y + jump, base.z),
        this.crowdQuaternion.setFromEuler(new THREE.Euler(0, phase * 0.08, wave * 0.12)),
        this.crowdScale.set(1, 0.82 + energyFactor * 0.24 + jump, 1),
      );
      this.crowd.setMatrixAt(index, this.crowdMatrix);
    }
    this.crowd.instanceMatrix.needsUpdate = true;
  }

  private updateHazard(snapshot: RunSnapshot, time: number): void {
    if (!snapshot.cueHazard || !['playing', 'recovery'].includes(snapshot.phase)) {
      this.hazard.visible = false;
      return;
    }
    this.hazard.visible = true;
    this.hazard.position.set(
      LANE_X[snapshot.targetLane],
      2.15 + Math.sin(time * 8) * 0.18,
      -6.5 + snapshot.pulsePhase * 9.2,
    );
    const scale = 0.8 + snapshot.pulsePhase * 0.75;
    this.hazard.scale.setScalar(scale);
    this.hazard.rotation.y = time * 2.4;
    this.hazard.rotation.z = time * -1.8;
  }

  private updateConfetti(snapshot: RunSnapshot, time: number, delta: number): void {
    const material = this.confetti.material as THREE.PointsMaterial;
    const active = snapshot.phase === 'finale' || snapshot.phase === 'results' || snapshot.streak >= 20;
    material.opacity = THREE.MathUtils.damp(material.opacity, active ? (snapshot.phase === 'finale' ? 0.86 : 0.5) : 0, 4, delta);
    this.confetti.rotation.y = time * 0.025;
    this.confetti.position.y = Math.sin(time * 0.18) * 0.5;
  }

  private setCyclePalette(homeColor: string, rivalColor: string): void {
    const home = new THREE.Color(homeColor);
    for (const deck of this.laneDecks) deck.material.emissive.copy(home);
    for (const material of this.shutterMaterials) material.emissive.copy(home).multiplyScalar(0.45);
    this.hazardMaterial.color.set(rivalColor);
    this.floodlights.forEach((light, index) => light.color.set(index < 2 ? homeColor : rivalColor));
  }
}
