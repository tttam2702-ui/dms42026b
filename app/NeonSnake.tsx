"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type GameStatus = "idle" | "running" | "paused" | "over";
type Point = { x: number; z: number };

declare global {
  interface Window { Tone?: any; }
}

const THREE_CDN = "https://cdn.jsdelivr.net/npm/three@0.184.0/build/three.module.js";
const TONE_CDN = "https://cdn.jsdelivr.net/npm/tone@15.5.0/build/Tone.js";

function loadTone() {
  if (window.Tone) return Promise.resolve(window.Tone);
  return new Promise<any>((resolve, reject) => {
    const found = document.querySelector(`script[src="${TONE_CDN}"]`) as HTMLScriptElement | null;
    if (found) {
      found.addEventListener("load", () => resolve(window.Tone), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = TONE_CDN;
    script.async = true;
    script.onload = () => resolve(window.Tone);
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

export default function NeonSnake() {
  const mountRef = useRef<HTMLDivElement>(null);
  const comboBarRef = useRef<HTMLDivElement>(null);
  const startGameRef = useRef<() => void>(() => {});
  const pauseRef = useRef<() => void>(() => {});
  const directionRef = useRef<(direction: Point) => void>(() => {});
  const audioToggleRef = useRef<() => void>(() => {});
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<GameStatus>("idle");
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [combo, setCombo] = useState(1);
  const [soundOn, setSoundOn] = useState(true);
  const [scoreBump, setScoreBump] = useState(false);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    setHighScore(Number(localStorage.getItem("neon-serpent-high") || 0));
  }, []);

  useEffect(() => {
    if (!mountRef.current) return;
    let disposed = false;
    let cleanup = () => {};

    (async () => {
      try {
        const threeUrl = THREE_CDN;
        const [THREE, Tone] = await Promise.all([
          import(/* @vite-ignore */ threeUrl),
          loadTone(),
        ]);
        if (disposed || !mountRef.current) return;

        const mount = mountRef.current;
        const GRID = 20;
        const HALF = GRID / 2;
        const obstacles: Point[] = [
          { x: -6, z: -4 }, { x: 5, z: -3 }, { x: -4, z: 5 }, { x: 5, z: 6 },
        ];
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x030108);
        scene.fog = new THREE.FogExp2(0x080211, 0.035);
        const camera = new THREE.PerspectiveCamera(48, mount.clientWidth / mount.clientHeight, 0.1, 120);
        camera.position.set(0, 15.5, 17.5);

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(mount.clientWidth, mount.clientHeight);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.35;
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        mount.appendChild(renderer.domElement);

        scene.add(new THREE.HemisphereLight(0x7c55ff, 0x020107, 1.5));
        const keyLight = new THREE.DirectionalLight(0xe8faff, 2.2);
        keyLight.position.set(5, 12, 7);
        keyLight.castShadow = true;
        keyLight.shadow.mapSize.set(1024, 1024);
        scene.add(keyLight);
        const pinkLight = new THREE.PointLight(0xff2cac, 45, 28, 2);
        pinkLight.position.set(-8, 5, -6);
        scene.add(pinkLight);
        const cyanLight = new THREE.PointLight(0x42f6ff, 38, 26, 2);
        cyanLight.position.set(8, 4, 7);
        scene.add(cyanLight);

        const floor = new THREE.Mesh(
          new THREE.PlaneGeometry(24, 24),
          new THREE.MeshStandardMaterial({ color: 0x09051a, metalness: 0.9, roughness: 0.38 })
        );
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = -0.48;
        floor.receiveShadow = true;
        scene.add(floor);
        const grid = new THREE.GridHelper(20, 20, 0x42f6ff, 0x28174d);
        grid.position.y = -0.44;
        (grid.material as any).transparent = true;
        (grid.material as any).opacity = 0.58;
        scene.add(grid);

        const underGlow = new THREE.Mesh(
          new THREE.CylinderGeometry(10.2, 10.8, 0.35, 8),
          new THREE.MeshStandardMaterial({ color: 0x080317, emissive: 0x21074b, emissiveIntensity: 1.2, metalness: .85, roughness: .25 })
        );
        underGlow.position.y = -0.75;
        scene.add(underGlow);

        const wallMatC = new THREE.MeshStandardMaterial({ color: 0x0b1e25, emissive: 0x42f6ff, emissiveIntensity: 2.5, transparent: true, opacity: .45 });
        const wallMatP = new THREE.MeshStandardMaterial({ color: 0x27091d, emissive: 0xff3eb5, emissiveIntensity: 2.5, transparent: true, opacity: .45 });
        const wallGeoH = new THREE.BoxGeometry(20.8, .16, .16);
        const wallGeoV = new THREE.BoxGeometry(.16, .16, 20.8);
        const walls = [
          new THREE.Mesh(wallGeoH, wallMatC), new THREE.Mesh(wallGeoH, wallMatP),
          new THREE.Mesh(wallGeoV, wallMatP), new THREE.Mesh(wallGeoV, wallMatC),
        ];
        walls[0].position.set(0, .05, -10.4); walls[1].position.set(0, .05, 10.4);
        walls[2].position.set(-10.4, .05, 0); walls[3].position.set(10.4, .05, 0);
        walls.forEach(w => scene.add(w));

        const shardGeo = new THREE.OctahedronGeometry(.48, 0);
        const obstacleMeshes: any[] = [];
        obstacles.forEach((p, i) => {
          const group = new THREE.Group();
          const shard = new THREE.Mesh(shardGeo, new THREE.MeshStandardMaterial({
            color: i % 2 ? 0x351442 : 0x0b3040, emissive: i % 2 ? 0xff3eb5 : 0x42f6ff,
            emissiveIntensity: 1.8, metalness: .7, roughness: .15,
          }));
          shard.castShadow = true;
          group.add(shard);
          const ring = new THREE.Mesh(new THREE.TorusGeometry(.62, .025, 8, 32), new THREE.MeshBasicMaterial({ color: i % 2 ? 0xff3eb5 : 0x42f6ff }));
          ring.rotation.x = Math.PI / 2;
          group.add(ring);
          group.position.set(p.x + .5, .4, p.z + .5);
          scene.add(group);
          obstacleMeshes.push(group);
        });

        const starsGeo = new THREE.BufferGeometry();
        const starPositions = new Float32Array(900);
        for (let i = 0; i < starPositions.length; i += 3) {
          const angle = Math.random() * Math.PI * 2;
          const radius = 18 + Math.random() * 36;
          starPositions[i] = Math.cos(angle) * radius;
          starPositions[i + 1] = 3 + Math.random() * 28;
          starPositions[i + 2] = Math.sin(angle) * radius;
        }
        starsGeo.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
        const stars = new THREE.Points(starsGeo, new THREE.PointsMaterial({ color: 0xbca7ff, size: .09, transparent: true, opacity: .75 }));
        scene.add(stars);

        const snakeGeo = new THREE.SphereGeometry(.43, 18, 14);
        const snakeMeshes: any[] = [];
        const bodyMaterials = Array.from({ length: 24 }, (_, i) => new THREE.MeshStandardMaterial({
          color: new THREE.Color().setHSL(.49 + i * .004, .95, .48 - Math.min(i, 18) * .012),
          emissive: new THREE.Color().setHSL(.49 + i * .006, 1, .24), emissiveIntensity: 2.1,
          metalness: .25, roughness: .22,
        }));
        const ensureMesh = (index: number) => {
          if (snakeMeshes[index]) return snakeMeshes[index];
          const mesh = new THREE.Mesh(snakeGeo, bodyMaterials[Math.min(index, bodyMaterials.length - 1)]);
          mesh.castShadow = true;
          scene.add(mesh);
          snakeMeshes[index] = mesh;
          return mesh;
        };

        const foodGroup = new THREE.Group();
        const foodCore = new THREE.Mesh(
          new THREE.IcosahedronGeometry(.43, 1),
          new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xff3eb5, emissiveIntensity: 3.8, metalness: .6, roughness: .08 })
        );
        const foodRingA = new THREE.Mesh(new THREE.TorusGeometry(.67, .035, 8, 36), new THREE.MeshBasicMaterial({ color: 0xff3eb5 }));
        const foodRingB = new THREE.Mesh(new THREE.TorusGeometry(.56, .025, 8, 36), new THREE.MeshBasicMaterial({ color: 0x42f6ff }));
        foodRingB.rotation.x = Math.PI / 2;
        foodGroup.add(foodCore, foodRingA, foodRingB);
        const foodLight = new THREE.PointLight(0xff3eb5, 22, 7, 2);
        foodGroup.add(foodLight);
        scene.add(foodGroup);

        const particles: { mesh: any; velocity: any; life: number }[] = [];
        const particleGeo = new THREE.TetrahedronGeometry(.08, 0);
        const burst = (position: any, color: number, count = 18) => {
          for (let i = 0; i < count; i++) {
            const mesh = new THREE.Mesh(particleGeo, new THREE.MeshBasicMaterial({ color, transparent: true }));
            mesh.position.copy(position);
            scene.add(mesh);
            particles.push({
              mesh,
              velocity: new THREE.Vector3((Math.random() - .5) * .18, Math.random() * .18 + .04, (Math.random() - .5) * .18),
              life: .75 + Math.random() * .5,
            });
          }
        };

        let snake: Point[] = [];
        let direction: Point = { x: 1, z: 0 };
        let nextDirection: Point = { x: 1, z: 0 };
        let food: Point = { x: 4, z: 0 };
        let gameStatus: GameStatus = "idle";
        let currentScore = 0;
        let currentCombo = 1;
        let eaten = 0;
        let lastEat = 0;
        let stepMs = 155;
        let lastStep = 0;
        let shake = 0;
        let soundEnabled = true;
        let synths: any = null;
        let audioStarted = false;

        const initAudio = async () => {
          if (audioStarted) return;
          await Tone.start();
          const reverb = new Tone.Reverb({ decay: 3.2, wet: .3 }).toDestination();
          const delay = new Tone.FeedbackDelay("8n", .22).connect(reverb);
          const lead = new Tone.PolySynth(Tone.Synth, {
            oscillator: { type: "triangle8" }, envelope: { attack: .01, decay: .2, sustain: .08, release: .55 }, volume: -15,
          }).connect(delay);
          const bite = new Tone.Synth({ oscillator: { type: "sine" }, envelope: { attack: .003, decay: .12, sustain: 0, release: .18 }, volume: -9 }).connect(reverb);
          const bass = new Tone.MembraneSynth({ pitchDecay: .04, octaves: 5, envelope: { attack: .001, decay: .16, sustain: 0, release: .12 }, volume: -16 }).toDestination();
          const noise = new Tone.NoiseSynth({ noise: { type: "pink" }, envelope: { attack: .01, decay: .5, sustain: 0 }, volume: -18 }).connect(reverb);
          const notes = ["C3", "G3", "Bb3", "D4", "G3", "F3", "D4", "Bb3"];
          const sequence = new Tone.Sequence((time: number, note: string) => lead.triggerAttackRelease(note, "16n", time), notes, "8n");
          Tone.getTransport().bpm.value = 118;
          sequence.start(0);
          Tone.getTransport().start();
          synths = { lead, bite, bass, noise, sequence };
          audioStarted = true;
        };

        const isOccupied = (p: Point) => snake.some(s => s.x === p.x && s.z === p.z) || obstacles.some(o => o.x === p.x && o.z === p.z);
        const spawnFood = () => {
          let next: Point;
          do next = { x: Math.floor(Math.random() * GRID) - HALF, z: Math.floor(Math.random() * GRID) - HALF };
          while (isOccupied(next));
          food = next;
          foodGroup.position.set(food.x + .5, .45, food.z + .5);
        };

        const updateSnakeMeshes = () => {
          snake.forEach((part, index) => {
            const mesh = ensureMesh(index);
            mesh.visible = true;
            mesh.position.set(part.x + .5, index === 0 ? .12 : 0, part.z + .5);
            const scale = index === 0 ? 1.12 : Math.max(.54, 1 - index * .018);
            mesh.scale.setScalar(scale);
          });
          snakeMeshes.forEach((mesh, i) => { if (i >= snake.length) mesh.visible = false; });
        };

        const gameOver = () => {
          gameStatus = "over";
          setStatus("over");
          shake = 1.1;
          const head = snakeMeshes[0]?.position || new THREE.Vector3();
          burst(head, 0xff3eb5, 42);
          if (soundEnabled && synths) {
            synths.noise.triggerAttackRelease("8n");
            synths.bass.triggerAttackRelease("C1", "4n");
          }
          const oldHigh = Number(localStorage.getItem("neon-serpent-high") || 0);
          if (currentScore > oldHigh) {
            localStorage.setItem("neon-serpent-high", String(currentScore));
            setHighScore(currentScore);
          }
        };

        const step = () => {
          direction = nextDirection;
          const head = { x: snake[0].x + direction.x, z: snake[0].z + direction.z };
          if (Math.abs(head.x) >= HALF || Math.abs(head.z) >= HALF || isOccupied(head)) {
            gameOver();
            return;
          }
          snake.unshift(head);
          const ate = head.x === food.x && head.z === food.z;
          if (ate) {
            eaten++;
            const now = performance.now();
            currentCombo = now - lastEat < 2700 ? Math.min(currentCombo + 1, 8) : 1;
            lastEat = now;
            const prism = eaten % 5 === 0;
            currentScore += (prism ? 500 : 100) * currentCombo;
            stepMs = Math.max(64, 155 - eaten * 4);
            setScore(currentScore);
            setCombo(currentCombo);
            setScoreBump(false); requestAnimationFrame(() => setScoreBump(true));
            setFlash(false); requestAnimationFrame(() => setFlash(true));
            burst(foodGroup.position, prism ? 0xbdff4b : 0xff3eb5, prism ? 34 : 19);
            shake = prism ? .75 : .28;
            if (soundEnabled && synths) {
              const note = ["C5", "E5", "G5", "Bb5", "D6"][Math.min(currentCombo - 1, 4)];
              synths.bite.triggerAttackRelease(note, prism ? "4n" : "16n");
              synths.bass.triggerAttackRelease(prism ? "G1" : "C2", "16n");
            }
            spawnFood();
          } else {
            snake.pop();
            if (lastEat && performance.now() - lastEat > 2700 && currentCombo !== 1) {
              currentCombo = 1;
              setCombo(1);
            }
          }
          updateSnakeMeshes();
        };

        const setDirection = (next: Point) => {
          if (next.x + direction.x === 0 && next.z + direction.z === 0) return;
          nextDirection = next;
        };

        const start = async () => {
          try { await initAudio(); } catch { /* game remains playable without audio */ }
          snake = [{ x: 0, z: 0 }, { x: -1, z: 0 }, { x: -2, z: 0 }, { x: -3, z: 0 }];
          direction = { x: 1, z: 0 }; nextDirection = { x: 1, z: 0 };
          currentScore = 0; currentCombo = 1; eaten = 0; lastEat = 0; stepMs = 155; lastStep = performance.now();
          setScore(0); setCombo(1); gameStatus = "running"; setStatus("running");
          spawnFood(); updateSnakeMeshes();
          if (synths && soundEnabled) synths.bite.triggerAttackRelease("C5", "8n");
        };

        const pause = () => {
          if (gameStatus === "running") { gameStatus = "paused"; setStatus("paused"); }
          else if (gameStatus === "paused") { gameStatus = "running"; lastStep = performance.now(); setStatus("running"); }
        };

        const toggleAudio = () => {
          soundEnabled = !soundEnabled;
          setSoundOn(soundEnabled);
          if (Tone?.Destination) Tone.Destination.mute = !soundEnabled;
        };

        startGameRef.current = start;
        pauseRef.current = pause;
        directionRef.current = setDirection;
        audioToggleRef.current = toggleAudio;
        spawnFood();
        snake = [{ x: 0, z: 0 }, { x: -1, z: 0 }, { x: -2, z: 0 }, { x: -3, z: 0 }];
        updateSnakeMeshes();
        setReady(true);

        let touchStart: { x: number; y: number } | null = null;
        const onPointerDown = (event: PointerEvent) => { touchStart = { x: event.clientX, y: event.clientY }; };
        const onPointerUp = (event: PointerEvent) => {
          if (!touchStart) return;
          const dx = event.clientX - touchStart.x, dy = event.clientY - touchStart.y;
          touchStart = null;
          if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
          if (Math.abs(dx) > Math.abs(dy)) setDirection({ x: dx > 0 ? 1 : -1, z: 0 });
          else setDirection({ x: 0, z: dy > 0 ? 1 : -1 });
        };
        renderer.domElement.addEventListener("pointerdown", onPointerDown);
        renderer.domElement.addEventListener("pointerup", onPointerUp);

        const onKey = (event: KeyboardEvent) => {
          const key = event.key.toLowerCase();
          if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)) event.preventDefault();
          if ((key === " " || key === "enter") && (gameStatus === "idle" || gameStatus === "over")) start();
          else if (key === "p" || key === "escape") pause();
          else if (key === "arrowup" || key === "w") setDirection({ x: 0, z: -1 });
          else if (key === "arrowdown" || key === "s") setDirection({ x: 0, z: 1 });
          else if (key === "arrowleft" || key === "a") setDirection({ x: -1, z: 0 });
          else if (key === "arrowright" || key === "d") setDirection({ x: 1, z: 0 });
        };
        window.addEventListener("keydown", onKey, { passive: false });

        const clock = new THREE.Clock();
        let frame = 0;
        const target = new THREE.Vector3();
        const cameraGoal = new THREE.Vector3();
        const animate = (time: number) => {
          frame = requestAnimationFrame(animate);
          const dt = Math.min(clock.getDelta(), .04);
          if (gameStatus === "running" && time - lastStep >= stepMs) { lastStep = time; step(); }
          foodGroup.rotation.y += dt * 2.2;
          foodRingA.rotation.x += dt * 1.7;
          foodRingB.rotation.z -= dt * 1.3;
          foodGroup.position.y = .5 + Math.sin(time * .004) * .14;
          obstacleMeshes.forEach((mesh, i) => { mesh.rotation.y += dt * (i % 2 ? -.7 : .7); mesh.position.y = .4 + Math.sin(time * .002 + i) * .14; });
          stars.rotation.y += dt * .012;
          walls.forEach((wall, i) => { (wall.material as any).emissiveIntensity = 2 + Math.sin(time * .003 + i) * .8; });
          snakeMeshes.forEach((mesh, i) => { if (mesh.visible) mesh.position.y = (i === 0 ? .14 : .03) + Math.sin(time * .009 - i * .6) * .045; });

          for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i]; p.life -= dt; p.velocity.y -= dt * .17; p.mesh.position.add(p.velocity); p.mesh.rotation.x += dt * 7;
            p.mesh.material.opacity = Math.max(0, p.life); p.mesh.scale.setScalar(Math.max(.1, p.life));
            if (p.life <= 0) { scene.remove(p.mesh); p.mesh.material.dispose(); particles.splice(i, 1); }
          }

          const head = snake[0] || { x: 0, z: 0 };
          target.set(head.x * .12, 0, head.z * .12 - .5);
          cameraGoal.set(head.x * .17, 15.5, 17.5 + head.z * .12);
          if (shake > .001) {
            cameraGoal.x += (Math.random() - .5) * shake;
            cameraGoal.y += (Math.random() - .5) * shake * .45;
            shake *= .88;
          }
          camera.position.lerp(cameraGoal, .045);
          camera.lookAt(target);

          if (comboBarRef.current) {
            const elapsed = lastEat ? time - lastEat : 2700;
            comboBarRef.current.style.width = `${gameStatus === "running" ? Math.max(0, 100 - elapsed / 27) : 0}%`;
          }
          renderer.render(scene, camera);
        };
        frame = requestAnimationFrame(animate);

        const resize = () => {
          if (!mount) return;
          camera.aspect = mount.clientWidth / mount.clientHeight;
          camera.updateProjectionMatrix();
          renderer.setSize(mount.clientWidth, mount.clientHeight);
          renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        };
        window.addEventListener("resize", resize);

        cleanup = () => {
          cancelAnimationFrame(frame);
          window.removeEventListener("resize", resize);
          window.removeEventListener("keydown", onKey);
          renderer.domElement.removeEventListener("pointerdown", onPointerDown);
          renderer.domElement.removeEventListener("pointerup", onPointerUp);
          if (synths) { synths.sequence.dispose(); synths.lead.dispose(); synths.bite.dispose(); synths.bass.dispose(); synths.noise.dispose(); }
          renderer.dispose();
          mount.replaceChildren();
        };
      } catch (error) {
        console.error("Unable to load the game engine", error);
      }
    })();

    return () => { disposed = true; cleanup(); };
  }, []);

  useEffect(() => {
    if (!scoreBump) return;
    const timer = window.setTimeout(() => setScoreBump(false), 250);
    return () => window.clearTimeout(timer);
  }, [scoreBump]);

  useEffect(() => {
    if (!flash) return;
    const timer = window.setTimeout(() => setFlash(false), 360);
    return () => window.clearTimeout(timer);
  }, [flash]);

  const direct = useCallback((x: number, z: number) => directionRef.current({ x, z }), []);
  const showOverlay = status === "idle" || status === "over";

  return (
    <main className="game-shell" aria-label="Neon Serpent 3D snake game">
      <div ref={mountRef} className="game-canvas" aria-hidden="true" />
      <div className="corner tl" /><div className="corner br" />
      <div className={`flash ${flash ? "active" : ""}`} />

      <header className="hud">
        <div className="brand">
          <div className="brand-mark" />
          <div><div className="brand-name">NEON//SERPENT</div><div className="brand-sub">GRID RUNNER / UNIT 09</div></div>
        </div>
        <div className="score-wrap">
          <div className="eyebrow">Neural score</div>
          <div className={`score ${scoreBump ? "bump" : ""}`}>{String(score).padStart(6, "0")}</div>
          <div className="high-score">BEST // {String(highScore).padStart(6, "0")}</div>
        </div>
        <div className="hud-actions">
          <button className="icon-button" onClick={() => audioToggleRef.current()} aria-label={soundOn ? "Mute audio" : "Enable audio"}>{soundOn ? "♪" : "×"}</button>
          <button className="icon-button" onClick={() => pauseRef.current()} aria-label={status === "paused" ? "Resume game" : "Pause game"}>{status === "paused" ? "▶" : "Ⅱ"}</button>
        </div>
      </header>

      <section className="mission" aria-label="Combo status">
        <div className="mission-head"><span>SYNC WINDOW</span><strong>{combo > 1 ? `CHAIN x${combo}` : "READY"}</strong></div>
        <div className="combo-track"><div ref={comboBarRef} className="combo-fill" /></div>
        <div className="tips"><span className="key">WASD</span> / <span className="key">ARROWS</span> MOVE &nbsp; <span className="key">P</span> PAUSE<br />Eat quickly to stack the chain. Avoid data shards.</div>
      </section>

      <aside className={`combo-badge ${combo > 1 && status === "running" ? "visible" : ""}`} aria-live="polite">
        <div className="combo-number">×{combo}</div><div className="combo-copy">CHAIN</div>
      </aside>

      <div className={`status-chip ${status === "paused" ? "show" : ""}`}>PAUSED</div>

      <div className={`overlay ${showOverlay ? "" : "hidden"}`}>
        <div className="start-card">
          <div className="kicker">/// SYNTHETIC WILDLIFE PROGRAM</div>
          <h1 className="game-title">NEON<span>SERPENT</span></h1>
          <p className="intro">HUNT THE PULSE CORES. CHAIN EACH BITE BEFORE THE SYNC WINDOW COLLAPSES. EVERY FIFTH CORE GOES PRISM AND HITS FIVE TIMES HARDER.</p>
          <button className="start-button" disabled={!ready} onClick={() => startGameRef.current()}>
            {!ready ? "CALIBRATING…" : status === "over" ? "RE-ENTER GRID" : "JACK IN"}
          </button>
          <div className="start-meta"><span>THREE.JS // 3D</span><span>TONE.JS // LIVE SYNTH</span><span>NO QUARTERS</span></div>
        </div>
      </div>

      <nav className="mobile-controls" aria-label="Touch direction controls">
        <button className="dpad up" onPointerDown={() => direct(0, -1)} aria-label="Move up">↑</button>
        <button className="dpad down" onPointerDown={() => direct(0, 1)} aria-label="Move down">↓</button>
        <button className="dpad left" onPointerDown={() => direct(-1, 0)} aria-label="Move left">←</button>
        <button className="dpad right" onPointerDown={() => direct(1, 0)} aria-label="Move right">→</button>
      </nav>
    </main>
  );
}
