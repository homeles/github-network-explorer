import { Routes, Route, Navigate } from 'react-router';
import DemoLayout from './pages/DemoLayout.js';
import GraphPage from './pages/GraphPage.js';
import NetworkPage from './pages/NetworkPage.js';
import BranchesPage from './pages/BranchesPage.js';
import CodeFrequencyPage from './pages/CodeFrequencyPage.js';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<DemoLayout />}>
        <Route index element={<GraphPage />} />
        <Route path="network" element={<NetworkPage />} />
        <Route path="branches" element={<BranchesPage />} />
        <Route path="code-frequency" element={<CodeFrequencyPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
