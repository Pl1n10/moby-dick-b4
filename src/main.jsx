import React from 'react'
import ReactDOM from 'react-dom/client'
import AuthProvider from './auth/AuthProvider.jsx'
import LoginGate from './auth/LoginGate.jsx'
import { UserInfoProvider } from './auth/UserInfoProvider.jsx'
import { OwnersProvider } from './auth/OwnersProvider.jsx'
import { BoardProvider } from './board/BoardProvider.jsx'
import BoardGate from './board/BoardGate.jsx'
import BoardApp from './board/BoardApp.jsx'
import 'bootstrap-icons/font/bootstrap-icons.min.css'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <LoginGate>
        <UserInfoProvider>
          <BoardProvider>
            <BoardGate>
              <OwnersProvider>
                <BoardApp />
              </OwnersProvider>
            </BoardGate>
          </BoardProvider>
        </UserInfoProvider>
      </LoginGate>
    </AuthProvider>
  </React.StrictMode>,
)
