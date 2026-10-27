function ProductCard({ product, onOpen }) {
  return (
    <li className="card">
      <button type="button" className="card__button" onClick={() => onOpen(product)}>
        <div className="card__frame">
          <img src={product.images[0]} alt={product.name_ar} className="card__image" loading="lazy" />
          {product.images.length > 1 && (
            <span className="card__count">{product.images.length} صور</span>
          )}
        </div>
        <h3 className="card__title">{product.name_ar}</h3>
        <p className="card__price">{product.sizes[0]?.price ? `$${product.sizes[0].price}` : 'السعر قريباً'}</p>
      </button>
    </li>
  )
}

export default ProductCard
