import { createRoot } from 'react-dom/client'
import './index.css'
import 'remixicon/fonts/remixicon.css'
import App from './App.jsx'
import { UserProvider } from './context/user.context'
import { BrowserRouter } from 'react-router-dom'

createRoot(document.getElementById('root')).render(

  <UserProvider>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </UserProvider>

)