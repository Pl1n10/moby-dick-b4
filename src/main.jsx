import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import AuthProvider from './auth/AuthProvider.jsx'
import LoginGate from './auth/LoginGate.jsx'
import { UserInfoProvider } from './auth/UserInfoProvider.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <LoginGate>
        <UserInfoProvider>
          <App />
        </UserInfoProvider>
      </LoginGate>
    </AuthProvider>
  </React.StrictMode>,
)
