// Simple encryption (for demo only)
export default function encrypt(data) {
  // In real-world, use a proper encryption library
  return {
    ...data,
    name: btoa(data.name),
    email: btoa(data.email),
    phone: btoa(data.phone),
  };
}
