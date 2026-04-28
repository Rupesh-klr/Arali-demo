// Service layer for API calls
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export async function getCustomers() {
  const res = await fetch(`${API_URL}/customers`);
  if (!res.ok) throw new Error('Failed to fetch');
  return res.json();
}

export async function addCustomer(data) {
  const res = await fetch(`${API_URL}/customers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to add');
  return res.json();
}

export async function deleteCustomer(id) {
  const res = await fetch(`${API_URL}/customers/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete');
  return res.json();
}
