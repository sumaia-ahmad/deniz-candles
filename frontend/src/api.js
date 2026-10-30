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

export async function fetchZones() {
  const response = await fetch('/api/delivery-zones')
  if (!response.ok) throw new Error('Could not load delivery zones')
  return response.json()
}

async function readJson(response) {
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    const error = new Error(data?.error || 'صار في مشكلة، جربي مرة تانية')
    error.status = response.status
    throw error
  }
  return data
}

// formData holds the order details (as JSON) and the reference image.
export async function placeOrder(formData) {
  return readJson(await fetch('/api/orders', { method: 'POST', body: formData }))
}

export async function fetchOrder(code) {
  return readJson(await fetch(`/api/orders/${encodeURIComponent(code)}`))
}

export async function respondToChanges(code, accept) {
  return readJson(
    await fetch(`/api/orders/${encodeURIComponent(code)}/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accept }),
    }),
  )
}

// The customer uploads her transfer receipt (counted only after the admin confirms it).
export async function reportPayment(code, formData) {
  return readJson(await fetch(`/api/orders/${encodeURIComponent(code)}/payments`, { method: 'POST', body: formData }))
}
