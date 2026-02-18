import { useEffect, useState } from 'react'
import { ShaderGradient, ShaderGradientCanvas } from '@shadergradient/react'

export default function ShaderBackground() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  })

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    const updatePreference = () => setPrefersReducedMotion(mediaQuery.matches)

    updatePreference()
    mediaQuery.addEventListener('change', updatePreference)
    return () => mediaQuery.removeEventListener('change', updatePreference)
  }, [])

  if (prefersReducedMotion) return null

  const shaderProps = {
    animate: 'on',
    axesHelper: 'on',
    bgColor1: '#000000',
    bgColor2: '#000000',
    brightness: 1.5,
    cAzimuthAngle: 60,
    cDistance: 7.1,
    cPolarAngle: 90,
    cameraZoom: 15.3,
    color1: '#ff7a33',
    color2: '#33a0ff',
    color3: '#ffc53d',
    destination: 'onCanvas',
    embedMode: 'off',
    envPreset: 'dawn',
    format: 'gif',
    fov: 45,
    frameRate: 10,
    gizmoHelper: 'hide',
    grain: 'off',
    lightType: '3d',
    pixelDensity: 1,
    positionX: 0,
    positionY: -0.15,
    positionZ: 0,
    range: 'disabled',
    rangeEnd: 40,
    rangeStart: 0,
    reflection: 0.1,
    rotationX: 0,
    rotationY: 0,
    rotationZ: 0,
    shader: 'defaults',
    type: 'sphere',
    uAmplitude: 1.4,
    uDensity: 1.1,
    uFrequency: 5.5,
    uSpeed: 0.1,
    uStrength: 0.4,
    uTime: 0,
    wireframe: false,
  } as any

  return (
    <ShaderGradientCanvas
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 0,
        pointerEvents: 'none',
      }}
    >
      <ShaderGradient {...shaderProps} />
    </ShaderGradientCanvas>
  )
}
