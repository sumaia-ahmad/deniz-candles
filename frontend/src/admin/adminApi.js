// Requests used by the dashboard. The session cookie set at login is sent automatically.

async function request(path, { method = 'GET', body } = {}) {
  // FormData (file uploads) is sent as-is; anything else as JSON.
  const isForm = body instanceof FormData
  const response = await fetch(path, {
    method,
    headers: body && !isForm ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
  })
  if (response.status === 204) return null

  const data = await response.json().catch(() => null)
  if (!response.ok) {
    const error = new Error(data?.error || 'Something went wrong. Please try again.')
    error.status = response.status
    error.warnings = data?.warnings // soft payment warnings (409) the admin can confirm
    throw error
  }
  return data
}

export const adminApi = {
  me: () => request('/api/auth/me'),
  login: (username, password, remember) =>
    request('/api/auth/login', { method: 'POST', body: { username, password, remember } }),
  logout: () => request('/api/auth/logout', { method: 'POST' }),

  occasions: () => request('/api/occasions'),
  products: () => request('/api/admin/products'),
  createProduct: formData => request('/api/admin/products', { method: 'POST', body: formData }),
  deleteProduct: id => request(`/api/admin/products/${id}`, { method: 'DELETE' }),
  addPhotos: (productId, formData) => request(`/api/admin/products/${productId}/photos`, { method: 'POST', body: formData }),
  deletePhoto: id => request(`/api/admin/photos/${id}`, { method: 'DELETE' }),
  makeCover: id => request(`/api/admin/photos/${id}/cover`, { method: 'POST' }),
  updateProduct: (id, changes) => request(`/api/admin/products/${id}`, { method: 'PATCH', body: changes }),
  addSize: (productId, size) => request(`/api/admin/products/${productId}/sizes`, { method: 'POST', body: size }),
  updateSize: (id, changes) => request(`/api/admin/sizes/${id}`, { method: 'PATCH', body: changes }),
  deleteSize: id => request(`/api/admin/sizes/${id}`, { method: 'DELETE' }),

  orders: status => request(`/api/admin/orders${status ? `?status=${status}` : ''}`),
  order: id => request(`/api/admin/orders/${id}`),
  changeOrderStatus: (id, change) => request(`/api/admin/orders/${id}/status`, { method: 'POST', body: change }),
  updateOrder: (id, changes) => request(`/api/admin/orders/${id}`, { method: 'PATCH', body: changes }),
  addPayment: (orderId, formData) => request(`/api/admin/orders/${orderId}/payments`, { method: 'POST', body: formData }),
  markPaymentReceived: id => request(`/api/admin/orders/payments/${id}/received`, { method: 'POST' }),
  deletePayment: id => request(`/api/admin/orders/payments/${id}`, { method: 'DELETE' }),

  zones: () => request('/api/admin/delivery-zones'),
  createZone: zone => request('/api/admin/delivery-zones', { method: 'POST', body: zone }),
  updateZone: (id, changes) => request(`/api/admin/delivery-zones/${id}`, { method: 'PATCH', body: changes }),
  deleteZone: id => request(`/api/admin/delivery-zones/${id}`, { method: 'DELETE' }),
}
