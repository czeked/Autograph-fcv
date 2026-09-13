import './App.css'
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "./Home";
import GetStarted from "./GetStarted";
import AiAnalyzer from './AiAnalyzer';
import AiTrader from './AiTrader';
import UserPage from './UserPage';
import AiDividends from './AiDividends';
import Checkout from './Checkout';
import Login from './Login';
import Register from './Register';
import ProtectedRoute from './ProtectedRoute';
import { NotificationProvider } from './NotificationContext';
import { SettingsProvider } from './SettingsContext';
import { AuthProvider } from './AuthContext';
import NotificationBanner from './NotificationBanner';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <SettingsProvider>
          <NotificationProvider>
            <NotificationBanner />
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/getstarted" element={<GetStarted />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              
              {/* Zabezpieczone ścieżki */}
              <Route path="/autograph" element={<ProtectedRoute requiredPlan="any"><AiAnalyzer /></ProtectedRoute>} />
              <Route path="/aitrader" element={<ProtectedRoute requiredPlan="any"><AiTrader /></ProtectedRoute>} />
              <Route path="/aidividends" element={<ProtectedRoute requiredPlan="maximum"><AiDividends /></ProtectedRoute>} />
              
              <Route path="/checkout" element={<Checkout />} />
              <Route path="/user" element={<ProtectedRoute><UserPage /></ProtectedRoute>} />
            </Routes>
          </NotificationProvider>
        </SettingsProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
