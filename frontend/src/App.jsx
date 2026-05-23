import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Login      from './pages/Login';
import Dashboard  from './pages/Dashboard';
import Detections from './pages/Detections';
import Whitelist  from './pages/Whitelist';
import Camera     from './pages/Camera';
import Settings   from './pages/Settings';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={
            <ProtectedRoute><Dashboard /></ProtectedRoute>
          } />
          <Route path="/detections" element={
            <ProtectedRoute><Detections /></ProtectedRoute>
          } />
          <Route path="/whitelist" element={
            <ProtectedRoute><Whitelist /></ProtectedRoute>
          } />
          <Route path="/camera" element={
            <ProtectedRoute><Camera /></ProtectedRoute>
          } />
          <Route path="/settings" element={
            <ProtectedRoute><Settings /></ProtectedRoute>
          } />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
