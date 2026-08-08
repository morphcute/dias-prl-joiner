"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { Sparkles, Cpu, Layers, RefreshCw, Eye } from "lucide-react";

interface JobFlowVisualizer3DProps {
  jobName: string;
  type: "diamonds" | "prl";
  officialUrl: string;
  secondaryUrl: string;
  targetName: string;
  gameMode: string;
  validationEnabled: boolean;
}

export function JobFlowVisualizer3D({
  jobName,
  type,
  officialUrl,
  secondaryUrl,
  targetName,
  gameMode,
  validationEnabled,
}: JobFlowVisualizer3DProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [viewMode, setViewMode] = useState<"3d" | "2d">("3d");
  const [activeHoverNode, setActiveHoverNode] = useState<string | null>(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    // 1. Scene setup
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x090d16, 0.04);

    // 2. Camera setup
    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
    camera.position.set(0, 2.5, 9);
    camera.lookAt(0, 0, 0);

    // 3. Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);

    // 4. Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const pointLight = new THREE.PointLight(0x6366f1, 3, 20);
    pointLight.position.set(0, 4, 4);
    scene.add(pointLight);

    const cyanLight = new THREE.PointLight(0x06b6d4, 2, 20);
    cyanLight.position.set(-4, -2, 2);
    scene.add(cyanLight);

    const goldLight = new THREE.PointLight(0xf59e0b, 2, 20);
    goldLight.position.set(4, 2, -2);
    scene.add(goldLight);

    // 5. Build 3D Nodes
    const nodeGroup = new THREE.Group();
    scene.add(nodeGroup);

    // Central Processing Core (Octahedron / Diamond Mesh)
    const coreGeo = type === "diamonds"
      ? new THREE.OctahedronGeometry(1.1, 0)
      : new THREE.IcosahedronGeometry(1.0, 0);
    
    const coreMat = new THREE.MeshStandardMaterial({
      color: type === "diamonds" ? 0xf59e0b : 0x6366f1,
      roughness: 0.1,
      metalness: 0.8,
      wireframe: false,
      emissive: type === "diamonds" ? 0xd97706 : 0x4f46e5,
      emissiveIntensity: 0.4,
    });

    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    coreMesh.position.set(0, 0, 0);
    nodeGroup.add(coreMesh);

    // Core Wireframe Outer Ring
    const ringGeo = new THREE.TorusGeometry(1.7, 0.04, 16, 100);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x06b6d4,
      wireframe: true,
      transparent: true,
      opacity: 0.5,
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.rotation.x = Math.PI / 3;
    nodeGroup.add(ringMesh);

    // Source Node 1 (Official Sheet)
    const officialHasUrl = officialUrl.trim().length > 0;
    const source1Geo = new THREE.BoxGeometry(1.1, 0.7, 0.7);
    const source1Mat = new THREE.MeshStandardMaterial({
      color: officialHasUrl ? 0x6366f1 : 0x334155,
      roughness: 0.3,
      metalness: 0.5,
      emissive: officialHasUrl ? 0x4338ca : 0x000000,
      emissiveIntensity: 0.3,
    });
    const source1Mesh = new THREE.Mesh(source1Geo, source1Mat);
    source1Mesh.position.set(-3.6, 1.2, 0);
    nodeGroup.add(source1Mesh);

    // Source Node 2 (Optional Trainee Sheet)
    const secondaryHasUrl = secondaryUrl.trim().length > 0;
    const source2Geo = new THREE.BoxGeometry(1.1, 0.7, 0.7);
    const source2Mat = new THREE.MeshStandardMaterial({
      color: secondaryHasUrl ? 0x06b6d4 : 0x1e293b,
      roughness: 0.3,
      metalness: 0.5,
      emissive: secondaryHasUrl ? 0x0891b2 : 0x000000,
      emissiveIntensity: 0.3,
    });
    const source2Mesh = new THREE.Mesh(source2Geo, source2Mat);
    source2Mesh.position.set(-3.6, -1.2, 0);
    nodeGroup.add(source2Mesh);

    // Target Output Node (Consolidated Google Sheet)
    const targetHasName = targetName.trim().length > 0;
    const targetGeo = new THREE.CylinderGeometry(0.8, 0.8, 0.8, 16);
    const targetMat = new THREE.MeshStandardMaterial({
      color: targetHasName ? 0x10b981 : 0x334155,
      roughness: 0.2,
      metalness: 0.7,
      emissive: targetHasName ? 0x059669 : 0x000000,
      emissiveIntensity: 0.4,
    });
    const targetMesh = new THREE.Mesh(targetGeo, targetMat);
    targetMesh.position.set(3.6, 0, 0);
    nodeGroup.add(targetMesh);

    // 6. Particle Energy Beam Flow
    const createBeamParticles = (startVec: THREE.Vector3, endVec: THREE.Vector3, colorHex: number) => {
      const particleCount = 20;
      const geo = new THREE.BufferGeometry();
      const positions = new Float32Array(particleCount * 3);

      for (let i = 0; i < particleCount; i++) {
        const t = i / particleCount;
        positions[i * 3] = startVec.x + (endVec.x - startVec.x) * t;
        positions[i * 3 + 1] = startVec.y + (endVec.y - startVec.y) * t;
        positions[i * 3 + 2] = startVec.z + (endVec.z - startVec.z) * t;
      }

      geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      const mat = new THREE.PointsMaterial({
        color: colorHex,
        size: 0.12,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
      });

      return new THREE.Points(geo, mat);
    };

    const beam1 = createBeamParticles(source1Mesh.position, coreMesh.position, 0x6366f1);
    const beam2 = createBeamParticles(source2Mesh.position, coreMesh.position, 0x06b6d4);
    const beamTarget = createBeamParticles(coreMesh.position, targetMesh.position, 0x10b981);

    nodeGroup.add(beam1);
    nodeGroup.add(beam2);
    nodeGroup.add(beamTarget);

    // 7. Interactive Rotation & Mouse Parallax
    let isDragging = false;
    let previousMousePosition = { x: 0, y: 0 };
    let targetRotationX = 0;
    let targetRotationY = 0;

    const onMouseDown = (e: MouseEvent) => {
      isDragging = true;
      previousMousePosition = { x: e.clientX, y: e.clientY };
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const deltaX = e.clientX - previousMousePosition.x;
      const deltaY = e.clientY - previousMousePosition.y;

      targetRotationY += deltaX * 0.008;
      targetRotationX += deltaY * 0.008;

      previousMousePosition = { x: e.clientX, y: e.clientY };
    };

    const onMouseUp = () => {
      isDragging = false;
    };

    container.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    // 8. Animation Loop
    let clock = new THREE.Clock();
    let animId: number;

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const elapsedTime = clock.getElapsedTime();

      // Rotate central diamond/core
      coreMesh.rotation.y = elapsedTime * 0.8;
      coreMesh.rotation.x = elapsedTime * 0.4;

      ringMesh.rotation.z = elapsedTime * 0.5;
      ringMesh.rotation.y = elapsedTime * 0.3;

      // Pulse floating effect
      source1Mesh.position.y = 1.2 + Math.sin(elapsedTime * 2) * 0.08;
      source2Mesh.position.y = -1.2 + Math.sin(elapsedTime * 2 + 1) * 0.08;
      targetMesh.position.y = Math.sin(elapsedTime * 2.5) * 0.1;

      // Smooth camera drag rotation
      nodeGroup.rotation.y += (targetRotationY - nodeGroup.rotation.y) * 0.05;
      nodeGroup.rotation.x += (targetRotationX - nodeGroup.rotation.x) * 0.05;

      // Auto subtle rotation when idle
      if (!isDragging) {
        targetRotationY += 0.002;
      }

      renderer.render(scene, camera);
    };

    animate();

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    window.addEventListener("resize", handleResize);

    return () => {
      container.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(animId);
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, [type, officialUrl, secondaryUrl, targetName]);

  return (
    <div className="relative w-full h-[320px] rounded-3xl overflow-hidden glass-panel-3d border border-indigo-500/20 shadow-2xl group">
      {/* 3D Canvas Container */}
      <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Top HUD Overlay Bar */}
      <div className="absolute top-4 left-4 right-4 flex items-center justify-between pointer-events-none">
        <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-900/80 border border-slate-700/70 backdrop-blur-xl">
          <Sparkles className="w-4 h-4 text-indigo-400 animate-spin-slow" />
          <span className="text-xs font-bold text-slate-200 tracking-wide">
            3D Topology Canvas
          </span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-mono">
            LIVE ENGINE
          </span>
        </div>

        <div className="flex items-center gap-2 pointer-events-auto">
          <button
            type="button"
            onClick={() => setViewMode(viewMode === "3d" ? "2d" : "3d")}
            className="p-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/70 backdrop-blur-xl transition-all cursor-pointer"
            title="Toggle 3D Camera Mode"
          >
            <Layers className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Bottom Live Data Node Legend */}
      <div className="absolute bottom-4 left-4 right-4 flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 rounded-2xl bg-slate-950/80 border border-slate-800/80 backdrop-blur-xl text-xs pointer-events-none">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${officialUrl.trim() ? "bg-indigo-400 shadow-[0_0_10px_rgba(99,102,241,0.8)]" : "bg-slate-600"}`} />
            <span className="font-semibold text-slate-300">1st Official Sheet</span>
          </div>

          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${secondaryUrl.trim() ? "bg-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.8)]" : "bg-slate-600"}`} />
            <span className="font-semibold text-slate-300">2nd Trainee Sheet</span>
          </div>

          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${targetName.trim() ? "bg-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.8)]" : "bg-slate-600"}`} />
            <span className="font-semibold text-slate-300">Consolidated Output</span>
          </div>
        </div>

        <div className="flex items-center gap-3 font-mono text-[11px] text-slate-400">
          <span>Mode: <strong className="text-slate-200">{gameMode}</strong></span>
          <span>•</span>
          <span>Type: <strong className="text-amber-400 capitalize">{type}</strong></span>
          {validationEnabled && (
            <>
              <span>•</span>
              <span className="text-emerald-400 font-bold flex items-center gap-1">
                ⚡ MooGold Active
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
