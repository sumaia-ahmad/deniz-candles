// Requests used by the dashboard. The session cookie set at login is sent automatically.

async function request(path, { method = 'GET', body } = {}) {
  const response = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (response.status === 204) return null

  const data = await response.json().catch(() => null)
  if (!response.ok) {
    const error = new Error(data?.error || 'Something went wrong. Please try again.')
    error.status = response.status
    throw error
  }
  return data
}

export const adminApi = {
  me: () => request('/api/auth/me'),
  login: (username, password, remember) =>
    request('/api/auth/login', { method: 'POST', body: { username, password, remember } }),
  logout: () => request('/api/auth/logout', { method: 'POST' }),

  products: () => request('/api/admin/products'),
  updateProduct: (id, changes) => request(`/api/admin/products/${id}`, { method: 'PATCH', body: changes }),
  addSize: (productId, size) => request(`/api/admin/products/${productId}/sizes`, { method: 'POST', body: size }),
  updateSize: (id, changes) => request(`/api/admin/sizes/${id}`, { method: 'PATCH', body: changes }),
  deleteSize: id => request(`/api/admin/sizes/${id}`, { method: 'DELETE' }),

  orders: status => request(`/api/admin/orders${status ? `?status=${status}` : ''}`),
  order: id => request(`/api/admin/orders/${id}`),
  changeOrderStatus: (id, change) => request(`/api/admin/orders/${id}/status`, { method: 'POST', body: change }),

  zones: () => request('/api/admin/delivery-zones'),
  createZone: zone => request('/api/admin/delivery-zones', { method: 'POST', body: zone }),
  updateZone: (id, changes) => request(`/api/admin/delivery-zones/${id}`, { method: 'PATCH', body: changes }),
  deleteZone: id => request(`/api/admin/delivery-zones/${id}`, { method: 'DELETE' }),
}
