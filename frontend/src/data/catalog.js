// Mock catalog data. Same shape as the future API (products + product_sizes),
// so swapping it for real data later only changes where it comes from.

const imageFiles = import.meta.glob('../assets/products/*.jpg', { eager: true, import: 'default' })

function img(name) {
  return imageFiles[`../assets/products/${name}.jpg`]
}

export const occasions = [
  { id: 1, slug: 'graduation', name_ar: 'توزيعات تخرج' },
  { id: 2, slug: 'engagement', name_ar: 'توزيعات خطوبة أو زواج' },
  { id: 3, slug: 'baby', name_ar: 'توزيعات بيبي' },
]

// price: null until the real prices are set (shown as "السعر قريباً").
// The first image is the cover shown on the card.
export const products = [
  // Graduation
  { id: 1, kind: 'favor', occasion: 'graduation', name_ar: 'شمعة الوردة الملكية', price: null, images: [img('graduation-05')] },
  { id: 2, kind: 'favor', occasion: 'graduation', name_ar: 'شمعة جوري', price: null, images: [img('graduation-03')] },
  { id: 3, kind: 'favor', occasion: 'graduation', name_ar: 'كرت شمعة الديزي', price: null, images: [img('graduation-04'), img('graduation-07')] },
  { id: 4, kind: 'favor', occasion: 'graduation', name_ar: 'شمعة تخرج', price: null, images: [img('graduation-08')] },
  { id: 5, kind: 'favor', occasion: 'graduation', name_ar: 'جار شمعة التخرج', price: null, images: [img('graduation-09')] },
  { id: 6, kind: 'favor', occasion: 'graduation', name_ar: 'شمعة الديزي', price: null, images: [img('graduation-01')] },

  // Engagement / wedding
  { id: 7, kind: 'favor', occasion: 'engagement', name_ar: 'شمعة Hand in Hand', price: null, images: [img('engagement-01'), img('engagement-02')] },

  // Baby
  { id: 8, kind: 'favor', occasion: 'baby', name_ar: 'دبدوب مع غيمة وبالون', price: null, images: [img('baby-01'), img('baby-05')] },
  { id: 9, kind: 'favor', occasion: 'baby', name_ar: 'شمعة فلفولة', price: null, images: [img('baby-04')] },
  { id: 10, kind: 'favor', occasion: 'baby', name_ar: 'شمعة فلفول', price: null, images: [img('baby-02')] },
  { id: 11, kind: 'favor', occasion: 'baby', name_ar: 'جار شمعة دبدوب', price: null, images: [img('baby-03')] },

  // Gifts
  { id: 12, kind: 'gift', occasion: null, name_ar: 'بوكس ورد اسطواني حجم وسط', price: null, images: [img('gifts-11'), img('gifts-01'), img('gifts-13')] },
  { id: 13, kind: 'gift', occasion: null, name_ar: 'بوكس قلب حجم وسط', price: null, images: [img('gifts-04'), img('gifts-03'), img('gifts-07')] },
  { id: 14, kind: 'gift', occasion: null, name_ar: 'بوكس قلب حجم كبير', price: null, images: [img('gifts-08'), img('gifts-09'), img('gifts-10')] },
  { id: 15, kind: 'gift', occasion: null, name_ar: 'بوكس دائري حجم كبير', price: null, images: [img('gifts-05'), img('gifts-15'), img('gifts-02')] },
  { id: 17, kind: 'gift', occasion: null, name_ar: 'بوكس ورد اسطواني حجم كبير', price: null, images: [img('gifts-12'), img('gifts-14')] },
  { id: 18, kind: 'gift', occasion: null, name_ar: 'بوكيه شمعة الديزي', price: null, images: [img('gifts-06')] },
]

export const instagramUrl = 'https://www.instagram.com/deniz.studio113/'
