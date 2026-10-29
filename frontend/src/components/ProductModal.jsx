import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { instagramUrl } from '../data/catalog'

function ProductModal({ product, onClose }) {
  const [activeIndex, setActiveIndex] = useState(0)

  // Close with Escape, and stop the page behind from scrolling while open.
  useEffect(() => {
    function handleKey(event) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  return (
    <div className="modal" onClick={onClose}>
      <div
        className="modal__box"
        role="dialog"
        aria-modal="true"
        aria-label={product.name_ar}
        onClick={event => event.stopPropagation()}
      >
        <button type="button" className="modal__close" onClick={onClose} aria-label="إغلاق">
          ×
        </button>

        <div className="modal__gallery">
          <img src={product.images[activeIndex]} alt={product.name_ar} className="modal__image" />
          {product.images.length > 1 && (
            <div className="modal__thumbs">
              {product.images.map((image, index) => (
                <button
                  key={image}
                  type="button"
                  className={index === activeIndex ? 'modal__thumb modal__thumb--active' : 'modal__thumb'}
                  onClick={() => setActiveIndex(index)}
                >
                  <img src={image} alt="" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="modal__info">
          <h3 className="modal__title">{product.name_ar}</h3>
          <p className="modal__price">{product.sizes[0]?.price ? `$${product.sizes[0].price}` : 'السعر قريباً'}</p>
          <Link to={`/order?product=${product.id}`} className="btn btn--primary">
            اطلبي هالقطعة
          </Link>
          <a href={instagramUrl} target="_blank" rel="noreferrer" className="modal__insta">
            أو تواصلي معنا عبر إنستغرام
          </a>
        </div>
      </div>
    </div>
  )
}

export default ProductModal
