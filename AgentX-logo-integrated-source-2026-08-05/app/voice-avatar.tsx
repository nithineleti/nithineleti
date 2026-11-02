"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { prefersReducedMotion, startFrameLoop } from "./home/frame-loop";
import type { VoiceSignal } from "./home/voice-signal";

type VoiceAvatarProps = {
  /** Session is live or a simulation is running. Raises the idle energy. */
  active: boolean;
  /**
   * Continuous voice level source, sampled every frame. Preferred: it never
   * causes a React render. Its `tone` picks agent (teal) or caller (warm).
   */
  signal?: VoiceSignal | null;
  /** Static 0..1 level for callers without a signal. */
  level?: number;
  className?: string;
};

const TEAL = new THREE.Color(0x46d9bf);
const WARM = new THREE.Color(0xe79b6d);
const TEAL_EMISSIVE = new THREE.Color(0x126257);
const WARM_EMISSIVE = new THREE.Color(0x6b3216);
const SHELL_TEAL = new THREE.Color(0x95fff0);
const SHELL_WARM = new THREE.Color(0xffc29b);
const SPARK_TEAL = new THREE.Color(0xc7fff6);
const SPARK_WARM = new THREE.Color(0xffd9bf);
const HALO_TEAL = new THREE.Color(0x5be0c6);
const HALO_WARM = new THREE.Color(0xe79b6d);

function haloTexture() {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (context) {
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, "rgba(255,255,255,0.9)");
    gradient.addColorStop(0.35, "rgba(255,255,255,0.32)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export default function VoiceAvatar({ active, signal = null, level, className }: VoiceAvatarProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef(active);
  const signalRef = useRef(signal);
  const levelRef = useRef(level ?? 0);

  useEffect(() => {
    activeRef.current = active;
    signalRef.current = signal;
    levelRef.current = level ?? 0;
  }, [active, signal, level]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const reduceMotion = prefersReducedMotion();

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
    camera.position.set(0, 0.15, 6.2);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);

    const rig = new THREE.Group();
    rig.rotation.set(-0.18, 0.28, 0.04);
    scene.add(rig);

    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: haloTexture(),
        color: HALO_TEAL.clone(),
        transparent: true,
        opacity: 0.12,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    halo.scale.setScalar(4.2);
    halo.position.z = -0.6;
    scene.add(halo);

    const coreGeometry = new THREE.IcosahedronGeometry(1.06, 3);
    const coreMaterial = new THREE.MeshPhysicalMaterial({
      color: TEAL.clone(),
      emissive: TEAL_EMISSIVE.clone(),
      emissiveIntensity: 0.7,
      metalness: 0.38,
      roughness: 0.23,
      clearcoat: 0.9,
      clearcoatRoughness: 0.12,
    });
    const core = new THREE.Mesh(coreGeometry, coreMaterial);
    rig.add(core);

    const shellGeometry = new THREE.IcosahedronGeometry(1.42, 2);
    const shellMaterial = new THREE.LineBasicMaterial({ color: SHELL_TEAL.clone(), transparent: true, opacity: 0.45 });
    const shell = new THREE.LineSegments(new THREE.EdgesGeometry(shellGeometry), shellMaterial);
    rig.add(shell);

    const ringMaterial = new THREE.MeshBasicMaterial({ color: 0xec9f70, transparent: true, opacity: 0.64 });
    const orbitOne = new THREE.Mesh(new THREE.TorusGeometry(1.72, 0.018, 8, 96), ringMaterial);
    orbitOne.rotation.set(1.13, 0.18, 0.6);
    rig.add(orbitOne);
    const orbitTwoMaterial = ringMaterial.clone();
    const orbitTwo = new THREE.Mesh(new THREE.TorusGeometry(1.45, 0.014, 8, 96), orbitTwoMaterial);
    orbitTwo.rotation.set(0.36, 1.09, -0.44);
    rig.add(orbitTwo);

    const signalCount = 180;
    const signalPositions = new Float32Array(signalCount * 3);
    for (let index = 0; index < signalCount; index += 1) {
      const radius = 1.65 + Math.random() * 0.5;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      signalPositions[index * 3] = radius * Math.sin(phi) * Math.cos(theta);
      signalPositions[index * 3 + 1] = radius * Math.cos(phi);
      signalPositions[index * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
    }
    const signalGeometry = new THREE.BufferGeometry();
    signalGeometry.setAttribute("position", new THREE.BufferAttribute(signalPositions, 3));
    const signalMaterial = new THREE.PointsMaterial({ color: SPARK_TEAL.clone(), size: 0.025, transparent: true, opacity: 0.72, sizeAttenuation: true });
    const signalField = new THREE.Points(signalGeometry, signalMaterial);
    rig.add(signalField);

    scene.add(new THREE.HemisphereLight(0xb9fff4, 0x09211e, 2.2));
    const keyLight = new THREE.PointLight(0x6cf3d8, 14, 12, 2);
    keyLight.position.set(3.4, 2.8, 4.2);
    scene.add(keyLight);
    const edgeLight = new THREE.PointLight(0xffa36e, 9, 10, 2);
    edgeLight.position.set(-3, -1.8, 2.6);
    scene.add(edgeLight);

    const pointer = new THREE.Vector2();
    const resize = () => {
      const { width, height } = host.getBoundingClientRect();
      if (!width || !height) return;
      camera.aspect = width / height;
      // Keep the whole sphere in frame on narrow or short hosts.
      camera.position.z = camera.aspect < 1 ? 6.2 / Math.max(0.62, camera.aspect) : 6.2;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    const onPointerMove = (event: PointerEvent) => {
      const bounds = host.getBoundingClientRect();
      pointer.x = ((event.clientX - bounds.left) / bounds.width - 0.5) * 2;
      pointer.y = -((event.clientY - bounds.top) / bounds.height - 0.5) * 2;
    };
    const onPointerLeave = () => pointer.set(0, 0);
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    host.addEventListener("pointermove", onPointerMove);
    host.addEventListener("pointerleave", onPointerLeave);
    resize();

    // Per-frame state lives here, never in React.
    let energy = activeRef.current ? 1 : 0.32;
    let toneMix = 0;
    let spin = 0;
    let lastTime = 0;

    const render = (time: number) => {
      const dt = lastTime ? Math.min(0.064, (time - lastTime) / 1000) : 0.016;
      lastTime = time;
      const seconds = time / 1000;
      const source = signalRef.current;
      const voice = source ? source.sample(time) : levelRef.current;
      const tone = source?.tone ?? "agent";

      // Ease toward targets so changes read as state, not flicker.
      energy += ((activeRef.current ? 1 : 0.32) - energy) * (1 - Math.exp(-dt * 3));
      const toneTarget = tone === "caller" && voice > 0.02 ? 1 : 0;
      toneMix += (toneTarget - toneMix) * (1 - Math.exp(-dt * 5));
      const motion = reduceMotion ? 0 : 1;
      spin += dt * (0.32 + energy * 0.18 + voice * 0.5) * motion;

      rig.rotation.y += (pointer.x * 0.35 - rig.rotation.y) * 0.035;
      rig.rotation.x += (-0.18 + pointer.y * 0.16 - rig.rotation.x) * 0.035;
      core.rotation.y = spin;
      core.rotation.x = seconds * 0.16 * motion;
      shell.rotation.y = -seconds * 0.2 * motion;
      shell.rotation.z = seconds * 0.12 * motion;
      orbitOne.rotation.z = 0.6 + seconds * (0.26 + energy * 0.1) * motion;
      orbitTwo.rotation.x = 0.36 + seconds * (0.18 + energy * 0.08) * motion;
      signalField.rotation.y = seconds * (0.09 + energy * 0.05) * motion;
      signalField.rotation.x = -seconds * 0.05 * motion;

      const breath = Math.sin(seconds * (2.5 + energy * 1.6)) * (0.015 + energy * 0.02) * motion;
      core.scale.setScalar(1 + breath + voice * 0.1);
      shell.scale.setScalar(1 + voice * 0.06);
      signalField.scale.setScalar(1 + voice * 0.14);

      // The core keeps the agent's teal identity; the caller's voice shows as
      // warm light around it (wireframe, sparks, halo, inner glow). Mixing the
      // core itself toward orange would pass through a muddy brown.
      coreMaterial.color.copy(TEAL).lerp(WARM, toneMix * 0.18);
      shellMaterial.color.copy(SHELL_TEAL).lerp(SHELL_WARM, toneMix);
      signalMaterial.color.copy(SPARK_TEAL).lerp(SPARK_WARM, toneMix);
      coreMaterial.emissive.copy(TEAL_EMISSIVE).lerp(WARM_EMISSIVE, toneMix);
      coreMaterial.emissiveIntensity = 0.42 + energy * 0.4 + voice * 1.05;
      shellMaterial.opacity = 0.3 + energy * 0.12 + voice * 0.4;
      ringMaterial.opacity = 0.32 + energy * 0.2 + voice * (0.25 + toneMix * 0.3);
      orbitTwoMaterial.opacity = ringMaterial.opacity * 0.85;
      signalMaterial.opacity = 0.34 + energy * 0.3 + voice * 0.3;
      halo.material.color.copy(HALO_TEAL).lerp(HALO_WARM, toneMix);
      halo.material.opacity = 0.06 + energy * 0.06 + voice * 0.34;
      halo.scale.setScalar(4 + voice * 1.1);
      renderer.render(scene, camera);
    };

    const stopLoop = startFrameLoop(host, render);

    return () => {
      stopLoop();
      resizeObserver.disconnect();
      host.removeEventListener("pointermove", onPointerMove);
      host.removeEventListener("pointerleave", onPointerLeave);
      coreGeometry.dispose();
      coreMaterial.dispose();
      shellGeometry.dispose();
      shell.geometry.dispose();
      shellMaterial.dispose();
      orbitOne.geometry.dispose();
      ringMaterial.dispose();
      orbitTwo.geometry.dispose();
      orbitTwoMaterial.dispose();
      signalGeometry.dispose();
      signalMaterial.dispose();
      halo.material.map?.dispose();
      halo.material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return (
    <div
      className={className ? `voiceAvatar ${className}` : "voiceAvatar"}
      ref={hostRef}
      aria-hidden="true"
    />
  );
}
