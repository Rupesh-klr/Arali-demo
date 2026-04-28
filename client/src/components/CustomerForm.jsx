import { useState } from 'react';
import { addCustomer } from '../services/customerService';
import encrypt from '../utils/encrypt';

const initialState = { name: '', email: '', phone: '' };

export default function CustomerForm({ onCustomerAdded }) {
  const [form, setForm] = useState(initialState);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      // Encrypt data before sending
      const encrypted = encrypt(form);
      await addCustomer(encrypted);
      setForm(initialState);
      onCustomerAdded();
    } catch (err) {
      setError('Failed to add customer');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="flex flex-col gap-3 bg-white dark:bg-gray-800 p-6 rounded shadow max-w-xl mx-auto mt-6" onSubmit={handleSubmit}>
      <h2 className="text-xl font-semibold mb-2 text-center">Add Customer</h2>
      <div className="flex gap-2">
        <input
          name="name"
          placeholder="Name"
          value={form.name}
          onChange={handleChange}
          required
          className="flex-1 px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <input
          name="email"
          placeholder="Email"
          type="email"
          value={form.email}
          onChange={handleChange}
          required
          className="flex-1 px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <input
          name="phone"
          placeholder="Phone Number"
          value={form.phone}
          onChange={handleChange}
          required
          className="flex-1 px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <button type="submit" disabled={loading} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
          {loading ? 'Adding...' : 'Submit'}
        </button>
      </div>
      {error && <div className="text-red-500 text-center mt-2">{error}</div>}
    </form>
  );
}
