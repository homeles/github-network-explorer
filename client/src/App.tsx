import { Routes, Route, Navigate } from 'react-router';
import LoginPage from './pages/LoginPage.js';
import AppLayout from './pages/AppLayout.js';
import GraphPage from './pages/GraphPage.js';
import NetworkPage from './pages/NetworkPage.js';

function AppIndex() {
  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#8b949e',
        fontSize: '0.95rem',
      }}
    >
      Select a repository from the dropdown above to view its commit graph.
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LoginPage />} />
      <Route path="/app" element={<AppLayout />}>
        <Route index element={<AppIndex />} />
        <Route path="repo/:owner/:repo" element={<GraphPage />} />
        <Route path="repo/:owner/:repo/network" element={<NetworkPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
