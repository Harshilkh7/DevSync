import { useState, useContext } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { UserContext } from '../context/user.context';
import axios from '../config/axios';
import Logo from '../assets/logo.svg';

const Register = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const { setUser } = useContext(UserContext);
    const navigate = useNavigate();

    async function submitHandler(e) {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const res = await axios.post('/users/register', {
                email: email.trim().toLowerCase(),
                password
            });

            if (!res.data?.token || !res.data?.user) {
                throw new Error('Registration succeeded but the server returned an invalid response.');
            }

            localStorage.setItem('token', res.data.token);
            setUser(res.data.user);
            navigate('/');
        } catch (err) {
            const data = err.response?.data;
            setError(
                data?.errors?.[0]?.msg ||
                data?.message ||
                err.message ||
                'Unable to create your account. Please try again.'
            );
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                <div className="text-center mb-8">
                    <div className="flex justify-center mb-6">
                        <img src={Logo} alt="DevSync Logo" className="w-20 h-20" />
                    </div>
                    <h1 className="text-3xl font-bold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent mb-2">Join DevSync</h1>
                    <p className="text-slate-400">Create your account to start collaborating</p>
                </div>

                <div className="bg-gradient-to-br from-slate-800/60 to-blue-900/40 backdrop-blur-sm border border-cyan-500/20 rounded-xl p-8 shadow-2xl shadow-cyan-500/10">
                    {error && (
                        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
                            <p className="text-red-400 text-sm">{error}</p>
                        </div>
                    )}

                    <form onSubmit={submitHandler} className="space-y-6">
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2" htmlFor="email">Email Address</label>
                            <input onChange={(e) => setEmail(e.target.value)} value={email} type="email" id="email" autoComplete="email" className="w-full px-4 py-3 bg-slate-700/50 border border-cyan-500/30 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400 transition-all duration-200" placeholder="Enter your email" required />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2" htmlFor="password">Password</label>
                            <input onChange={(e) => setPassword(e.target.value)} value={password} type="password" id="password" autoComplete="new-password" minLength={3} className="w-full px-4 py-3 bg-slate-700/50 border border-cyan-500/30 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400 transition-all duration-200" placeholder="Create a password" required />
                        </div>
                        <button type="submit" disabled={loading} className="w-full py-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-all duration-200 shadow-lg hover:shadow-cyan-500/25">
                            {loading ? 'Creating account...' : 'Create Account'}
                        </button>
                    </form>

                    <div className="mt-6 text-center">
                        <p className="text-slate-400">Already have an account?{' '}<Link to="/login" className="text-blue-400 hover:text-blue-300 font-medium transition-colors">Sign in</Link></p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Register;
