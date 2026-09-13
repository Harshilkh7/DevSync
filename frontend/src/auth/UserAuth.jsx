import { useContext, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserContext } from '../context/user.context';

const UserAuth = ({ children }) => {
    const { user, authLoading } = useContext(UserContext);
    const navigate = useNavigate();

    useEffect(() => {
        if (!authLoading && !user) {
            navigate('/login', { replace: true });
        }
    }, [authLoading, user, navigate]);

    if (authLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-300">
                Loading...
            </div>
        );
    }

    if (!user) return null;

    return <>{children}</>;
};

export default UserAuth;
