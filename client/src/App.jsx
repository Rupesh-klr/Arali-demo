

import CustomerForm from './components/CustomerForm';
import CustomerTable from './components/CustomerTable';
import { useState } from 'react';

function App() {
  const [refresh, setRefresh] = useState(false);

  return (
    <>
      <main style={{ maxWidth: 700, margin: '40px auto', padding: 20 }}>
        <h1>Customer Management</h1>
        <CustomerForm onCustomerAdded={() => setRefresh((v) => !v)} />
        <CustomerTable key={refresh} />
      </main>
    </>
  );
}

export default App;
