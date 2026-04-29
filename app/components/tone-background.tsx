import { LinearGradient } from 'expo-linear-gradient'
import type { ReactNode } from 'react'
import type { ViewStyle } from 'react-native'
import { TONE_GRADIENTS, type Tone } from '@/lib/outfit-tone'

export function ToneBackground({
  tone,
  children,
  style,
}: {
  tone: Tone
  children?: ReactNode
  style?: ViewStyle
}) {
  return (
    <LinearGradient
      colors={TONE_GRADIENTS[tone]}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={[{ flex: 1 }, style]}
    >
      {children}
    </LinearGradient>
  )
}
