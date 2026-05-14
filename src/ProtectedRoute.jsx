import React from 'react';
import { Navigate } from 'react-router-dom';

// ============================================================ //
//   PROTECTED ROUTE GUARD
//   Checks localStorage for the auth flag before allowing
//   access to /dashboard. Redirects to / if not logged in.
// ============================================================ //

export default function ProtectedRoute({ children }) {
  const isAuthenticated = localStorage.getItem('finsight_auth') === 'true';
  return isAuthenticated ? children : <Navigate to="/" replace />;
}