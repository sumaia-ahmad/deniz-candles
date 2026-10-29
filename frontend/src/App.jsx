import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import './App.css'
import logo from './assets/logo.png'
import heroMainImg from './assets/hero.jpg'
import ProductCard from './components/ProductCard'
import ProductModal from './components/ProductModal'
import { fetchCatalog } from './api'
import { instagramUrl } from './data/catalog'

const features = [
  { id: 1, icon: '🕯️', title: 'مصنوعة بحب' },
  { id: 2, icon: '❤️', title: 'شمع عالي الجودة' },
  { id: 3, icon: '🎀', title: 'تصميم حسب طلبك' },
]

function App() {
  const [occasions, setOccasions] = useState([])
  const [products, setProducts] = useState([])
  const [status, setStatus] = useState('loading') // 'loading' | 'ready' | 'error'
  const [selectedOccasion, setSelectedOccasion] = useState('all')
  const [openProduct, setOpenProduct] = useState(null)

  // Load the catalog from the server once, when the page opens.
  useEffect(() => {
    fetchCatalog()
      .then(data => {
        setOccasions(data.occasions)
        setProducts(data.products)
        setStatus('ready')
      })
      .catch(() => setStatus('error'))
  }, [])

  const favors = products.filter(product => product.kind === 'favor')
  const gifts = products.filter(product => product.kind === 'gift')

  const visibleFavors =
    selectedOccasion === 'all'
      ? favors
      : favors.filter(product => product.occasion === selectedOccasion)

  return (
    <div className="site">
      <header className="header">
        <div className="container header__inner">
          <a href="#top" className="brand">
            <img src={logo} alt="Deniz Studio" className="brand__logo" />
            <span className="brand__name">Deniz Studio</span>
          </a>
          <nav className="nav">
            <a href="#favors">توزيعات</a>
            <a href="#gifts">هدايا</a>
            <a href="#story">قصتنا</a>
            <Link to="/track">تتبّع طلبك</Link>
            <Link to="/order" className="nav__cta">
              اطلبي الآن
            </Link>
          </nav>
        </div>
      </header>

      <section className="hero" id="top">
        <div className="container hero__inner">
          <div className="hero__text">
            <p className="hero__brand" dir="ltr">Deniz</p>
            <p className="hero__slogan" dir="ltr">Light it. Feel it. Love it. ✨</p>
            <h1 className="hero__title">
              شموع بتحكي
              <span className="hero__highlight"> قصة مناسبتك</span>
            </h1>
            <p className="hero__tagline">شموع معطّرة مصنوعة يدوياً</p>
            <div className="hero__actions">
              <a href="#favors" className="btn btn--primary">تصفّحي التوزيعات</a>
              <a href="#gifts" className="btn btn--ghost">هدايا شمع</a>
            </div>
          </div>

          <div className="hero__collage" aria-hidden="true">
            <span className="blob blob--one"></span>
            <span className="blob blob--two"></span>
            <span className="collage__frame"></span>
            <img src={heroMainImg} alt="" className="collage__img--main" />
            <span className="float-heart float-heart--one">♥</span>
            <span className="float-heart float-heart--two">♥</span>
            <span className="float-heart float-heart--three">♥</span>
          </div>
        </div>
      </section>

      <section className="features">
        <h2 className="section__title features__heading" dir="ltr">Why Choose <span>Deniz</span></h2>
        <div className="container features__grid">
          {features.map(feature => (
            <div key={feature.id} className="feature">
              <span className="feature__icon">{feature.icon}</span>
              <h3 className="feature__title">{feature.title}</h3>
            </div>
          ))}
        </div>
      </section>

      <section className="section" id="favors">
        <div className="container">
          <div className="section__head">
            <h2 className="section__title" dir="ltr">Favors</h2>
          </div>

          <div className="filters">
            <button
              type="button"
              className={selectedOccasion === 'all' ? 'chip chip--active' : 'chip'}
              onClick={() => setSelectedOccasion('all')}
            >
              الكل
            </button>
            {occasions.map(occasion => (
              <button
                key={occasion.id}
                type="button"
                className={selectedOccasion === occasion.slug ? 'chip chip--active' : 'chip'}
                onClick={() => setSelectedOccasion(occasion.slug)}
              >
                {occasion.name_ar}
              </button>
            ))}
          </div>

          {status === 'loading' && <p className="status">عم نحمّل القطع...</p>}
          {status === 'error' && (
            <p className="status">صار في مشكلة بتحميل القطع، جربي بعد شوي 🙏</p>
          )}

          <ul className="products">
            {visibleFavors.map(product => (
              <ProductCard key={product.id} product={product} onOpen={setOpenProduct} />
            ))}
          </ul>
        </div>
      </section>

      <div className="wave wave--top" aria-hidden="true">
        <svg viewBox="0 0 1440 80" preserveAspectRatio="none">
          <path d="M0,40 C240,80 480,0 720,40 C960,80 1200,0 1440,40 L1440,80 L0,80 Z" />
        </svg>
      </div>

      <section className="gifts" id="gifts">
        <div className="container">
          <div className="section__head">
            <h2 className="section__title" dir="ltr">Gifts</h2>
            <p className="section__text">بوكسات ورد شمعي، وشمعات بأشكال حسب الطلب</p>
          </div>
          <ul className="products">
            {gifts.map(product => (
              <ProductCard key={product.id} product={product} onOpen={setOpenProduct} />
            ))}
          </ul>
        </div>
      </section>

      <div className="wave wave--bottom" aria-hidden="true">
        <svg viewBox="0 0 1440 80" preserveAspectRatio="none">
          <path d="M0,40 C240,0 480,80 720,40 C960,0 1200,80 1440,40 L1440,0 L0,0 Z" />
        </svg>
      </div>

      <section className="story" id="story">
        <div className="container story__inner">
          <h2 className="section__title" dir="ltr">The Heart of <span>Deniz</span></h2>
          <p className="story__text">
            كل شمعة بتنعمل بالإيد بكل حب، واهتمام بأدق التفاصيل
          </p>
        </div>
      </section>

      <footer className="footer">
        <div className="container footer__inner">
          <img src={logo} alt="Deniz Studio" className="footer__logo" />
          <p className="footer__slogan" dir="ltr">Light it. Feel it. Love it. ✨</p>
          <p>صُنع بحب في دمشق</p>
          <a href={instagramUrl} target="_blank" rel="noreferrer" className="footer__insta">
            للطلب راسلينا على إنستغرام
          </a>
          <p className="footer__small">© 2026 Deniz Studio</p>
        </div>
      </footer>

      {openProduct && (
        <ProductModal
          key={openProduct.id}
          product={openProduct}
          onClose={() => setOpenProduct(null)}
        />
      )}
    </div>
  )
}

export default App

