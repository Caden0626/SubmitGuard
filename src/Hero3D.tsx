import { useEffect, useRef } from 'react'
import * as THREE from 'three'

// 设计系统配色
const COLORS = {
  coral: 0xff896f,
  pink: 0xff9fd1,
  lilac: 0xd9b8ff,
}

export default function Hero3D() {
  const mountRef = useRef<HTMLDivElement>(null)
  const mouseRef = useRef({ x: 0, y: 0 })
  const isVisibleRef = useRef(true)
  const animationIdRef = useRef<number>(0)

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    // Scene setup
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(60, mount.clientWidth / mount.clientHeight, 0.1, 1000)
    camera.position.z = 30

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(mount.clientWidth, mount.clientHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    mount.appendChild(renderer.domElement)

    // --- Particles (star field) ---
    const particleCount = 800
    const positions = new Float32Array(particleCount * 3)
    const colors = new Float32Array(particleCount * 3)
    const colorChoices = [new THREE.Color(COLORS.coral), new THREE.Color(COLORS.pink), new THREE.Color(COLORS.lilac)]

    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3
      positions[i3] = (Math.random() - 0.5) * 80
      positions[i3 + 1] = (Math.random() - 0.5) * 80
      positions[i3 + 2] = (Math.random() - 0.5) * 60

      const color = colorChoices[Math.floor(Math.random() * colorChoices.length)]
      colors[i3] = color.r
      colors[i3 + 1] = color.g
      colors[i3 + 2] = color.b
    }

    const particleGeometry = new THREE.BufferGeometry()
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    particleGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))

    const particleMaterial = new THREE.PointsMaterial({
      size: 0.15,
      vertexColors: true,
      transparent: true,
      opacity: 0.6,
      sizeAttenuation: true,
    })
    const particles = new THREE.Points(particleGeometry, particleMaterial)
    scene.add(particles)

    // --- Mouse interaction ---
    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current.x = (e.clientX / window.innerWidth) * 2 - 1
      mouseRef.current.y = -(e.clientY / window.innerHeight) * 2 + 1
    }
    window.addEventListener('mousemove', handleMouseMove)

    // --- Visibility observer (pause when scrolled away) ---
    const observer = new IntersectionObserver(([entry]) => {
      isVisibleRef.current = entry.isIntersecting
    }, { threshold: 0 })
    observer.observe(mount)

    // --- Animation loop ---
    const clock = new THREE.Clock()

    const animate = () => {
      animationIdRef.current = requestAnimationFrame(animate)
      if (!isVisibleRef.current) return
      const elapsed = clock.getElapsedTime()

      // Rotate particles slowly
      particles.rotation.y = elapsed * 0.02
      particles.rotation.x = elapsed * 0.01

      // Mouse parallax on camera
      camera.position.x += (mouseRef.current.x * 3 - camera.position.x) * 0.05
      camera.position.y += (mouseRef.current.y * 2 - camera.position.y) * 0.05
      camera.lookAt(scene.position)

      renderer.render(scene, camera)
    }
    animate()

    // --- Resize handler ---
    const handleResize = () => {
      if (!mount) return
      camera.aspect = mount.clientWidth / mount.clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(mount.clientWidth, mount.clientHeight)
    }
    window.addEventListener('resize', handleResize)

    // --- Cleanup ---
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('resize', handleResize)
      observer.disconnect()
      cancelAnimationFrame(animationIdRef.current)
      mount.removeChild(renderer.domElement)
      particleGeometry.dispose()
      particleMaterial.dispose()
      renderer.dispose()
    }
  }, [])

  return (
    <div
      ref={mountRef}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
      }}
      aria-hidden="true"
    />
  )
}
