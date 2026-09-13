import { useContext, useState, useEffect } from 'react';
import { UserContext } from '../context/user.context';
import axios from "../config/axios";
import { useNavigate } from 'react-router-dom';
import Logo from '../assets/logo.svg';
import { disconnectSocket, initializeUserSocket } from '../config/socket';

const Home = () => {
    const { user, logout } = useContext(UserContext);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [projectName, setProjectName] = useState('');
    const [project, setProject] = useState([]);
    const [isFetchingProjects, setIsFetchingProjects] = useState(true);
    const [projectError, setProjectError] = useState('');

    const navigate = useNavigate();

    const createProject = (e) => {
        e.preventDefault();
        setProjectError('');

        axios.post('/projects/create', { name: projectName })
            .then(() => {
                setIsModalOpen(false);
                setProjectName('');
                fetchProjects();
            })
            .catch((error) => {
                setProjectError(error.response?.data?.message || error.response?.data?.error || 'Unable to create project.');
            });
    };

    const fetchProjects = () => {
        setIsFetchingProjects(true);
        axios.get('/projects/all').then((res) => {
            setProject(res.data.projects);
            setProjectError('');
        }).catch(err => {
            setProjectError(err.response?.data?.error || 'Unable to load projects.');
        }).finally(() => {
            setIsFetchingProjects(false);
        });
    };

    const deleteProject = (projectId) => {
        if (!window.confirm('Delete this project and its chat history?')) return;

        axios.delete(`/projects/delete/${projectId}`).then(() => {
            fetchProjects();
        }).catch(err => {
            setProjectError(err.response?.data?.error || 'Unable to delete project.');
        });
    };

    useEffect(() => {
        if (user) {
            fetchProjects();
            const socket = initializeUserSocket();
            socket.on('projects-changed', fetchProjects);

            return () => {
                socket.off('projects-changed', fetchProjects);
                disconnectSocket();
            };
        }

        return undefined;
    }, [user]);

    const handleLogout = async () => {
        await logout();
        navigate('/login');
    };

    return (
        <div className="min-h-screen bg-slate-950 text-white">
            <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950/95 backdrop-blur">
                <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
                    <div className="flex items-center gap-3"><img src={Logo} alt="DevSync Logo" className="h-9 w-9" /><span className="text-xl font-bold">DevSync</span></div>
                    <div className="flex items-center gap-4"><span className="hidden text-sm text-slate-400 sm:inline">{user?.email}</span><button onClick={handleLogout} className="rounded-lg border border-slate-700 px-4 py-2 text-sm hover:bg-slate-800">Logout</button></div>
                </div>
            </header>

            <main className="mx-auto max-w-7xl px-4 py-8">
                <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div><h1 className="text-3xl font-bold">Your Projects</h1><p className="mt-1 text-slate-400">Build and collaborate with your team.</p></div>
                    <button onClick={() => setIsModalOpen(true)} className="rounded-lg bg-blue-600 px-5 py-3 font-medium hover:bg-blue-500">Create Project</button>
                </div>

                {projectError && <div className="mb-6 rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">{projectError}</div>}

                {isFetchingProjects ? (
                    <div className="rounded-xl border border-slate-800 bg-slate-900 p-8 text-center text-slate-400">Loading projects...</div>
                ) : project.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900 p-12 text-center"><h2 className="text-xl font-semibold">No projects yet</h2><p className="mt-2 text-slate-400">Create your first project to start coding together.</p></div>
                ) : (
                    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                        {project.map((item) => (
                            <div key={item._id} className="rounded-xl border border-slate-800 bg-slate-900 p-5 shadow-lg">
                                <h2 className="truncate text-lg font-semibold">{item.name}</h2>
                                <div className="mt-5 flex gap-2"><button onClick={() => navigate(`/project/${item._id}`)} className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-500">Open</button><button onClick={() => deleteProject(item._id)} className="rounded-lg border border-red-500/30 px-4 py-2 text-sm text-red-300 hover:bg-red-500/10">Delete</button></div>
                            </div>
                        ))}
                    </div>
                )}
            </main>

            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
                    <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-6">
                        <div className="mb-5 flex items-center justify-between"><h2 className="text-xl font-semibold">Create Project</h2><button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white">✕</button></div>
                        <form onSubmit={createProject} className="space-y-4"><input value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="Project name" required className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 outline-none focus:border-blue-500" /><div className="flex justify-end gap-3"><button type="button" onClick={() => setIsModalOpen(false)} className="rounded-lg border border-slate-700 px-4 py-2">Cancel</button><button type="submit" className="rounded-lg bg-blue-600 px-4 py-2">Create</button></div></form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Home;
