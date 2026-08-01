import { useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserContext } from '../context/user.context';
import axios from '../config/axios';

const UserAuth = ({ children }) => {
    const { user, setUser } = useContext(UserContext);
    const [loading, setLoading] = useState(true);
    const token = localStorage.getItem('token');
    const navigate = useNavigate();

    useEffect(() => {
        const checkAuth = async () => {
            if (!token) {
                navigate('/login'); // Redirect if no token exists
            } else if (!user) {
                try {
                    const response = await axios.get('/users/profile');
                    setUser(response.data.user);
                    setLoading(false);
                } catch {
                    navigate('/login'); // Redirect if user is not authenticated
                }
            } else {
                setLoading(false); // Authenticated
            }
        };

        checkAuth();
    }, [user, token, navigate, setUser]);

    if (loading) {
        return <div>Loading...</div>;
    }

    return <>{children}</>;
};

export default UserAuth;
