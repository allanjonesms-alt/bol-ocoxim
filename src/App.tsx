import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Register from './pages/Register';
import Home from './pages/Home';
import MatchDetails from './pages/MatchDetails';
import UserPanel from './pages/UserPanel';
import AdminPanel from './pages/AdminPanel';
import AdminUsers from './pages/AdminUsers';
import AdminLogs from './pages/AdminLogs';
import AdminTransactions from './pages/AdminTransactions';
import Leaderboard from './pages/Leaderboard';
import ForgotPassword from './pages/ForgotPassword';
import Regulations from './pages/Regulations';
import AllMatches from './pages/AllMatches';
import AdminPixPremiado from './pages/AdminPixPremiado';
import AdminSorteios from './pages/AdminSorteios';
import AdminBolao from './pages/AdminBolao';
import AdminWebhookLogs from './pages/AdminWebhookLogs';
import TransparencyReport from './pages/TransparencyReport';

function ProtectedRoute({ children, adminOnly = false }: { children: React.ReactNode, adminOnly?: boolean }) {
  const { user, profile, loading } = useAuth();
  
  if (loading) return <div className="p-8 text-center">Carregando...</div>;
  if (!user || !profile) return <Navigate to="/login" replace />;
  if (adminOnly && profile.role !== 'admin') return <Navigate to="/" replace />;
  
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          
          <Route path="/" element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="matches" element={<AllMatches />} />
            <Route path="match/:id" element={<MatchDetails />} />
            <Route path="panel" element={<ProtectedRoute><UserPanel /></ProtectedRoute>} />
            <Route path="user-panel" element={<ProtectedRoute><UserPanel /></ProtectedRoute>} />
            <Route path="leaderboard" element={<Leaderboard />} />
            <Route path="regulamento" element={<Regulations />} />
            <Route path="transparencia-sorteio" element={<TransparencyReport />} />
            <Route path="relatorio-transparencia" element={<TransparencyReport />} />
            <Route path="admin" element={<ProtectedRoute adminOnly><AdminPanel /></ProtectedRoute>} />
            <Route path="admin/users" element={<ProtectedRoute adminOnly><AdminUsers /></ProtectedRoute>} />
            <Route path="admin/logs" element={<ProtectedRoute adminOnly><AdminLogs /></ProtectedRoute>} />
            <Route path="admin/transactions" element={<ProtectedRoute adminOnly><AdminTransactions /></ProtectedRoute>} />
            <Route path="admin/pix-premiado" element={<ProtectedRoute adminOnly><AdminPixPremiado /></ProtectedRoute>} />
            <Route path="admin/sorteios" element={<ProtectedRoute adminOnly><AdminSorteios /></ProtectedRoute>} />
            <Route path="admin/bolao" element={<ProtectedRoute adminOnly><AdminBolao /></ProtectedRoute>} />
            <Route path="admin/webhook-logs" element={<ProtectedRoute adminOnly><AdminWebhookLogs /></ProtectedRoute>} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
