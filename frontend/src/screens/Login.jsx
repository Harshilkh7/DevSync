import { useState, useContext } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from '../config/axios';
import { UserContext } from '../context/user.context';
import Logo from '../assets/logo.svg';

const Login = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState(''); // State for error message

    const { setUser } = useContext(UserContext);
    const navigate = useNavigate();

    function submitHandler(e) {
        e.preventDefault();
        setError(''); // Clear previous error

        axios.post('/users/login', { email, password })
            .then((res) => {
                localStorage.setItem('token', res.data.token);
                setUser(res.data.user);
                navigate('/');
            })
            .catch((err) => {
                if (err.response?.data?.errors === 'Invalid credentials') {
                    setError('Invalid credentials'); // Display specific error
                } else {
                    setError('Something went wrong. Please try again.');
                }
            });
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                {/* Logo and Header */}
                <div className="text-center mb-8">
                    <div className="flex justify-center mb-6">
                        <img src={Logo} alt="DevSync Logo" className="w-20 h-20" />
                    </div>
                    <h1 className="text-3xl font-bold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent mb-2">Welcome back</h1>
                    <p className="text-slate-400">Sign in to your DevSync account</p>
                </div>

                {/* Login Form */}
                <div className="bg-gradient-to-br from-slate-800/60 to-blue-900/40 backdrop-blur-sm border border-cyan-500/20 rounded-xl p-8 shadow-2xl shadow-cyan-500/10">
                    {error && (
                        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
                            <p className="text-red-400 text-sm">{error}</p>
                        </div>
                    )}
                    
                    <form onSubmit={submitHandler} className="space-y-6">
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2" htmlFor="email">
                                Email Address
                            </label>
                            <input
                                onChange={(e) => setEmail(e.target.value)}
                                type="email"
                                id="email"
                                className="w-full px-4 py-3 bg-slate-700/50 border border-cyan-500/30 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400 transition-all duration-200"
                                placeholder="Enter your email"
                                required
                            />
                        </div>
                        
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2" htmlFor="password">
                                Password
                            </label>
                            <input
                                onChange={(e) => setPassword(e.target.value)}
                                type="password"
                                id="password"
                                className="w-full px-4 py-3 bg-slate-700/50 border border-cyan-500/30 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400 transition-all duration-200"
                                placeholder="Enter your password"
                                required
                            />
                        </div>
                        
                        <button
                            type="submit"
                            className="w-full py-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white font-medium rounded-lg transition-all duration-200 shadow-lg hover:shadow-cyan-500/25"
                        >
                            Sign In
                        </button>
                    </form>
                    
                    <div className="mt-6 text-center">
                        <p className="text-slate-400">
                            Don&apos;t have an account?{' '}
                            <Link to="/register" className="text-blue-400 hover:text-blue-300 font-medium transition-colors">
                                Create one
                            </Link>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Login;
