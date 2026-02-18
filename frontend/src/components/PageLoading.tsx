import LottieAnimation from './LottieAnimation'

export default function PageLoading({ label = '불러오는 중...' }: { label?: string }) {
  return (
    <div className="loading-state">
      <LottieAnimation src="/animations/loading.lottie" className="h-20 w-20" />
      <p className="mt-2 text-xs text-gray-400">{label}</p>
    </div>
  )
}
