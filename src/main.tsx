import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { FirebaseProvider } from './components/FirebaseProvider.tsx';
import { FirestoreErrorBoundary } from './components/FirestoreErrorBoundary.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <FirestoreErrorBoundary>
    <FirebaseProvider>
      <App />
    </FirebaseProvider>
  </FirestoreErrorBoundary>
);
