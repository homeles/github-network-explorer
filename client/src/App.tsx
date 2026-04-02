import { Routes, Route, Navigate } from 'react-router';
import LoginPage from './pages/LoginPage.js';
import AppLayout from './pages/AppLayout.js';
import GraphPage from './pages/GraphPage.js';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LoginPage />} />
      <Route path="/app" element={<AppLayout />}>
        <Route index element={<Navigate to="/" replace />} />
        <Route path="repo/:owner/:repo" element={<GraphPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
