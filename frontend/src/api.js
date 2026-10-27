// Talks to the Flask backend. Every request to the server goes through here.

export async function fetchCatalog() {
  const [occasionsResponse, productsResponse] = await Promise.all([
    fetch('/api/occasions'),
    fetch('/api/products'),
  ])

  if (!occasionsResponse.ok || !productsResponse.ok) {
    throw new Error('Could not load the catalog')
  }

  return {
    occasions: await occasionsResponse.json(),
    products: await productsResponse.json(),
  }
}
