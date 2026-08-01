import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import UserAuth from '../auth/UserAuth'

const Login = lazy(() => import('../screens/Login'))
const Register = lazy(() => import('../screens/Register'))
const Home = lazy(() => import('../screens/Home'))
const Project = lazy(() => import('../screens/Project'))

const AppRoutes = () => {
    return (
        <Suspense fallback={<div className="min-h-screen bg-slate-900 text-slate-300 flex items-center justify-center">Loading...</div>}>
            <Routes>
                <Route path="/" element={<UserAuth><Home /></UserAuth>} />
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="/project" element={<UserAuth><Project /></UserAuth>} />
                <Route path="/project/:projectId" element={<UserAuth><Project /></UserAuth>} />
            </Routes>
        </Suspense>
    )
}

export default AppRoutes
