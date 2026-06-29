import LoadingState from '../../../../../components/LoadingState'
import PublicTopbar from '../../../../../components/PublicTopbar'

export default function LiveScoreLoading() {
  return (
    <div className="public-page public-editorial-page live-score-editorial-page">
      <PublicTopbar theme="dark" />
      <main className="public-main live-score-editorial-main">
        <section className="public-hero live-score-editorial-hero !rounded-[28px] px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-7">
          <div className="relative z-10 grid gap-3">
            <span className="text-xs font-extrabold uppercase text-[#f3c63d]">Live Score</span>
            <h1 className="max-w-4xl text-3xl font-black text-[#fff8e8] sm:text-4xl lg:text-[3.2rem] lg:leading-none">
              Menyiapkan hasil race...
            </h1>
            <p className="text-sm font-semibold text-[#eadcca] sm:text-base">
              Sedang mengambil data kategori, moto, dan ranking terbaru.
            </p>
          </div>
        </section>

        <article className="public-panel-dark live-score-editorial-panel">
          <LoadingState label="Memuat live score..." />
        </article>
      </main>
    </div>
  )
}
