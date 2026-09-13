import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { UserContext } from '../context/user.context'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import axios from '../config/axios'
import { disconnectSocket, initializeSocket, receiveMessage, sendMessage } from '../config/socket'
import Markdown from 'markdown-to-jsx'
import CodeMirror from '@uiw/react-codemirror'
import { javascript } from '@codemirror/lang-javascript'
import { oneDark } from '@codemirror/theme-one-dark'
import { getWebContainer } from '../config/webContainer'
import Logo from '../assets/logo.svg'

const getFileContents = (fileTree, fileName) => fileTree?.[fileName]?.file?.contents || ''

const Project = () => {
    const location = useLocation()
    const navigate = useNavigate()
    const { projectId: urlProjectId } = useParams()
    const { user } = useContext(UserContext)
    const initialProject = location.state?.project || null
    const projectId = useMemo(() => initialProject?._id || urlProjectId, [initialProject?._id, urlProjectId])

    const [isSidePanelOpen, setIsSidePanelOpen] = useState(false)
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [selectedUserId, setSelectedUserId] = useState(new Set())
    const [project, setProject] = useState(initialProject)
    const [message, setMessage] = useState('')
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState(null)
    const [users, setUsers] = useState([])
    const [messages, setMessages] = useState([])
    const [fileTree, setFileTree] = useState({})
    const [currentFile, setCurrentFile] = useState(null)
    const [openFiles, setOpenFiles] = useState([])
    const [selectedFile, setSelectedFile] = useState(null)
    const [editorValue, setEditorValue] = useState('')
    const [saveStatus, setSaveStatus] = useState('Saved')
    const [runStatus, setRunStatus] = useState('')
    const [actionStatus, setActionStatus] = useState('')
    const [removingUserId, setRemovingUserId] = useState(null)
    const [isSendingMessage, setIsSendingMessage] = useState(false)
    const [webContainer, setWebContainer] = useState(null)
    const [iframeUrl, setIframeUrl] = useState(null)
    const [runProcess, setRunProcess] = useState(null)
    const [isCreateFileOpen, setIsCreateFileOpen] = useState(false)
    const [newFileName, setNewFileName] = useState('')
    const [newFileContents, setNewFileContents] = useState('')
    const [fileError, setFileError] = useState('')

    const messageBox = useRef(null)
    const webContainerRef = useRef(null)
    const installedPackageJsonRef = useRef(null)

    const openFile = useCallback((file) => {
        setCurrentFile(file)
        setSelectedFile(file)
        setOpenFiles((files) => Array.from(new Set([...files, file])))
        setEditorValue(getFileContents(fileTree, file))
    }, [fileTree])

    const availableUsers = useMemo(() => {
        const collaboratorIds = new Set((project?.users || []).map((projectUser) => projectUser._id))
        return users.filter((candidate) => !collaboratorIds.has(candidate._id))
    }, [project?.users, users])

    const isOwner = project?.role === 'owner'

    useEffect(() => {
        if (messageBox.current) messageBox.current.scrollTop = messageBox.current.scrollHeight
    }, [messages])

    useEffect(() => {
        if (currentFile) setEditorValue(getFileContents(fileTree, currentFile))
    }, [currentFile, fileTree])

    useEffect(() => {
        if (!projectId) {
            setError('No project selected. Please go back and select a project.')
            setIsLoading(false)
            return undefined
        }
        let isMounted = true
        const socket = initializeSocket(projectId)
        const handleMessage = (data) => {
            setIsSendingMessage(false)
            setMessages((prev) => data._id && prev.some((item) => item._id === data._id) ? prev : [...prev, data])
        }
        const handleFileTreeUpdate = (data) => {
            if (!data?.fileTree) return
            setFileTree(data.fileTree)
            if (webContainerRef.current) webContainerRef.current.mount(data.fileTree).catch(() => {})
            setSaveStatus('Updated')
        }
        const handleProjectError = (data) => {
            setSaveStatus(data?.message || 'Sync failed')
            setActionStatus(data?.message || 'Something went wrong.')
            setIsSendingMessage(false)
        }
        receiveMessage('project-message', handleMessage)
        receiveMessage('file-tree-updated', handleFileTreeUpdate)
        receiveMessage('project-error', handleProjectError)

        Promise.all([
            axios.get(`/projects/get-project/${projectId}`),
            axios.get(`/messages/project/${projectId}`),
            axios.get('/users/all')
        ]).then(([projectResponse, messagesResponse, usersResponse]) => {
            if (!isMounted) return
            const loadedProject = projectResponse.data.project
            const loadedFileTree = loadedProject.fileTree || {}
            const firstFile = Object.keys(loadedFileTree)[0] || null
            setProject(loadedProject)
            setFileTree(loadedFileTree)
            setMessages(messagesResponse.data.messages || [])
            setUsers(usersResponse.data.users || [])
            if (firstFile) {
                setCurrentFile(firstFile)
                setSelectedFile(firstFile)
                setOpenFiles([firstFile])
                setEditorValue(getFileContents(loadedFileTree, firstFile))
            }
            setIsLoading(false)
        }).catch((err) => {
            if (isMounted) {
                setError(err.response?.data?.error || 'Failed to load project. Please try again.')
                setIsLoading(false)
            }
        })

        if (!webContainerRef.current) {
            getWebContainer().then((container) => {
                if (!isMounted) return
                webContainerRef.current = container
                setWebContainer(container)
            }).catch((err) => {
                if (isMounted) setRunStatus(err.message || 'Unable to initialize WebContainer.')
            })
        }

        return () => {
            isMounted = false
            socket.off('project-message', handleMessage)
            socket.off('file-tree-updated', handleFileTreeUpdate)
            socket.off('project-error', handleProjectError)
            disconnectSocket()
        }
    }, [projectId])

    const toggleUser = (id) => {
        setSelectedUserId((prev) => {
            const next = new Set(prev)
            next.has(id) ? next.delete(id) : next.add(id)
            return next
        })
    }

    const addCollaborators = () => {
        if (!project?._id || selectedUserId.size === 0) return
        if (!isOwner) {
            setActionStatus('Only the project owner can add collaborators.')
            return
        }
        setActionStatus('Adding collaborators...')
        axios.put('/projects/add-user', { projectId: project._id, users: Array.from(selectedUserId) })
            .then((res) => {
                setProject(res.data.project)
                setSelectedUserId(new Set())
                setIsModalOpen(false)
                setActionStatus('Collaborators updated.')
            })
            .catch((err) => setActionStatus(err.response?.data?.error || 'Unable to add collaborators.'))
    }

    const removeCollaborator = (collaboratorId) => {
        if (!project?._id || !collaboratorId || removingUserId) return
        if (!isOwner) {
            setActionStatus('Only the project owner can remove collaborators.')
            return
        }
        if (collaboratorId === project.createdBy?._id) {
            setActionStatus('Project owner cannot be removed.')
            return
        }
        setRemovingUserId(collaboratorId)
        setActionStatus('Removing collaborator...')
        axios.put('/projects/remove-user', { projectId: project._id, collaboratorId })
            .then((res) => {
                setProject(res.data.project)
                setActionStatus('Collaborator removed.')
            })
            .catch((err) => setActionStatus(err.response?.data?.error || 'Unable to remove collaborator.'))
            .finally(() => setRemovingUserId(null))
    }

    const send = () => {
        const trimmedMessage = message.trim()
        if (!trimmedMessage) return
        sendMessage('project-message', { message: trimmedMessage })
        setIsSendingMessage(true)
        setMessage('')
    }

    const saveFileTree = (nextFileTree) => {
        setSaveStatus('Saving...')
        setFileTree(nextFileTree)
        sendMessage('file-tree-save', { fileTree: nextFileTree })
        window.setTimeout(() => setSaveStatus('Saved'), 300)
    }

    const saveCurrentFile = () => {
        if (!currentFile) return
        saveFileTree({ ...fileTree, [currentFile]: { file: { contents: editorValue } } })
    }

    const createFile = (e) => {
        e.preventDefault()
        const fileName = newFileName.trim()
        if (!fileName) {
            setFileError('Enter a file name.')
            return
        }
        if (fileName.includes('..') || fileName.startsWith('/') || fileName.endsWith('/')) {
            setFileError('Enter a valid relative file path, such as src/App.jsx.')
            return
        }
        if (fileTree[fileName]) {
            setFileError('A file with this name already exists.')
            return
        }
        const nextFileTree = {
            ...fileTree,
            [fileName]: { file: { contents: newFileContents } }
        }
        saveFileTree(nextFileTree)
        setIsCreateFileOpen(false)
        setNewFileName('')
        setNewFileContents('')
        setFileError('')
        setCurrentFile(fileName)
        setSelectedFile(fileName)
        setOpenFiles((files) => Array.from(new Set([...files, fileName])))
        setEditorValue(newFileContents)
    }

    const runCode = async () => {
        const container = webContainerRef.current
        if (!container) return setRunStatus('WebContainer is still starting.')
        if (!fileTree || Object.keys(fileTree).length === 0) return setRunStatus('Add files before running the project.')
        try {
            setRunStatus('Mounting files...')
            await container.mount(fileTree)
            const packageJsonContents = getFileContents(fileTree, 'package.json').trim()
            if (!packageJsonContents) return setRunStatus('package.json not found.')
            const shouldInstallDependencies = installedPackageJsonRef.current !== packageJsonContents
            if (shouldInstallDependencies) {
                setRunStatus('Installing dependencies...')
                const installProcess = await container.spawn('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error'])
                installProcess.output.pipeTo(new WritableStream({ write(chunk) { console.log('[npm install]', chunk) } }))
                const installExitCode = await installProcess.exit
                if (installExitCode !== 0) return setRunStatus(`Install failed with exit code ${installExitCode}. Check console.`)
                installedPackageJsonRef.current = packageJsonContents
            }
            if (runProcess) runProcess.kill()
            setRunStatus('Starting app...')
            const tempRunProcess = await container.spawn('npm', ['start'])
            tempRunProcess.output.pipeTo(new WritableStream({ write(chunk) { console.log('[npm start]', chunk) } }))
            tempRunProcess.exit.then((exitCode) => {
                if (exitCode !== 0) setRunStatus(`App stopped with exit code ${exitCode}. Check console.`)
            })
            setRunProcess(tempRunProcess)
            container.on('server-ready', (port, url) => {
                setIframeUrl(url)
                setRunStatus(`Running on port ${port}`)
            })
        } catch (err) {
            console.error('WebContainer error:', err)
            setRunStatus(err.message || 'Unable to run project.')
        }
    }

    const renderAiMessage = (rawMessage) => {
        let parsedMessage = { text: rawMessage }
        try { parsedMessage = JSON.parse(rawMessage) } catch {}
        return <div className="overflow-auto bg-slate-950 text-white rounded-sm p-2"><Markdown>{parsedMessage.text || rawMessage}</Markdown></div>
    }

    if (isLoading) return <div className="h-screen w-screen bg-slate-900 flex items-center justify-center"><div className="text-center"><div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div><p className="text-slate-300">Loading project...</p></div></div>
    if (error || !project) return <div className="h-screen w-screen bg-slate-900 flex items-center justify-center"><div className="text-center max-w-md"><div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4"><i className="ri-error-warning-line text-red-400 text-2xl"></i></div><h2 className="text-xl font-semibold text-white mb-2">Workspace unavailable</h2><p className="text-slate-300 mb-6">{error || 'Please go back and select a project.'}</p><button onClick={() => navigate('/')} className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg">Back to Projects</button></div></div>

    return (
        <div className="h-screen w-screen bg-slate-900 flex flex-col overflow-hidden">
            <header className="shrink-0 bg-slate-800 border-b border-slate-700 px-4 py-3 flex items-center justify-between gap-4">
                <div className="flex items-center space-x-4 min-w-0">
                    <button onClick={() => navigate('/')} className="flex items-center space-x-2 text-slate-300 hover:text-white shrink-0"><i className="ri-arrow-left-line"></i><span>Projects</span></button>
                    <div className="h-6 w-px bg-slate-600"></div>
                    <div className="flex items-center space-x-3 min-w-0"><img src={Logo} alt="DevSync" className="w-6 h-6 shrink-0" /><h1 className="text-lg font-semibold text-white truncate">{project.name}</h1></div>
                </div>
                <div className="flex items-center space-x-3 shrink-0">
                    <span className="hidden sm:inline text-xs text-slate-400">{saveStatus}</span>
                    {isOwner && <button onClick={() => setIsModalOpen(true)} className="flex items-center space-x-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"><i className="ri-user-add-line"></i><span className="hidden sm:inline">Add Collaborator</span></button>}
                    <button onClick={() => setIsSidePanelOpen(!isSidePanelOpen)} className="p-2 text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg"><i className="ri-group-line"></i></button>
                </div>
            </header>

            <div className="flex-1 min-h-0 flex overflow-hidden">
                <section className="w-96 max-w-[35vw] min-w-[18rem] bg-slate-800 border-r border-slate-700 flex flex-col min-h-0">
                    <div className="shrink-0 p-4 border-b border-slate-700"><h2 className="text-lg font-semibold text-white">Team Chat</h2><p className="text-xs text-slate-400 mt-1">Shared history is saved for this project.</p>{isSendingMessage && <p className="text-xs text-blue-300 mt-2">Sending...</p>}</div>
                    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                        <div ref={messageBox} className="flex-1 min-h-0 p-4 space-y-3 overflow-y-auto overflow-x-hidden">
                            {messages.length === 0 && <div className="text-sm text-slate-400 text-center mt-8">Start the discussion or mention @ai for help.</div>}
                            {messages.map((msg, index) => {
                                const isCurrentUser = msg.sender?._id === user?._id
                                const isAI = msg.sender?._id === 'ai'
                                return <div key={msg._id || index} className={`flex flex-col ${isCurrentUser ? 'items-end' : 'items-start'}`}><div className={`max-w-[90%] sm:max-w-xs p-3 rounded-lg ${isCurrentUser ? 'bg-blue-600 text-white' : isAI ? 'bg-purple-700 text-white' : 'bg-slate-700 text-slate-200'}`}><div className="text-xs text-slate-300 mb-1 truncate">{msg.sender?.email || 'Unknown'}{msg.timestamp && <span className="ml-2">{new Date(msg.timestamp).toLocaleTimeString()}</span>}</div><div className="text-sm break-words">{isAI ? renderAiMessage(msg.message) : <p>{msg.message}</p>}</div></div></div>
                            })}
                        </div>
                        <div className="shrink-0 p-4 border-t border-slate-700"><div className="flex space-x-2"><input value={message} onChange={(e) => setMessage(e.target.value)} className="min-w-0 flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500" type="text" placeholder="Message teammates or @ai..." onKeyDown={(e) => e.key === 'Enter' && send()} /><button onClick={send} disabled={isSendingMessage} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg"><i className="ri-send-plane-line"></i></button></div></div>
                    </div>
                </section>

                <section className="flex-1 min-w-0 min-h-0 flex flex-col bg-slate-900">
                    <div className="flex-1 min-h-0 flex overflow-hidden">
                        <div className="w-64 shrink-0 bg-slate-800 border-r border-slate-700 flex flex-col min-h-0">
                            <div className="shrink-0 p-3 border-b border-slate-700 flex items-center justify-between gap-2"><h3 className="text-sm font-medium text-slate-300">Files</h3><button onClick={() => { setFileError(''); setIsCreateFileOpen(true) }} className="flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md" title="Add file"><i className="ri-add-line"></i><span>Add File</span></button></div>
                            <div className="flex-1 min-h-0 p-2 overflow-y-auto overflow-x-hidden">
                                {Object.keys(fileTree).length === 0 && <p className="text-sm text-slate-500 p-2">No files yet. Click Add File to create one.</p>}
                                {Object.keys(fileTree).map((file) => <button key={file} onClick={() => openFile(file)} className={`w-full text-left p-2 rounded-lg ${selectedFile === file ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-700'}`}><div className="flex items-center space-x-2 min-w-0"><i className="ri-file-line shrink-0"></i><span className="text-sm truncate">{file}</span></div></button>)}
                            </div>
                        </div>

                        <div className="flex-1 min-w-0 min-h-0 flex flex-col">
                            <div className="shrink-0 bg-slate-800 border-b border-slate-700 flex items-center justify-between min-w-0">
                                <div className="flex min-w-0 overflow-x-auto scrollbar-hide">{openFiles.map((file) => <button key={file} onClick={() => openFile(file)} className={`shrink-0 px-4 py-2 text-sm border-r border-slate-700 ${currentFile === file ? 'bg-slate-900 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}><div className="flex items-center space-x-2"><i className="ri-file-line"></i><span>{file}</span></div></button>)}</div>
                                <div className="shrink-0 flex items-center space-x-2 p-2">{runStatus && <span className="hidden xl:block max-w-48 truncate text-xs text-slate-400" title={runStatus}>{runStatus}</span>}<button onClick={saveCurrentFile} disabled={!currentFile} className="px-3 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white rounded-lg text-sm"><i className="ri-save-line mr-1"></i><span className="hidden md:inline">Save</span></button><button onClick={runCode} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm"><i className="ri-play-line mr-1"></i>Run</button></div>
                            </div>
                            <div className="flex-1 min-h-0 overflow-hidden">{currentFile ? <CodeMirror value={editorValue} height="100%" theme={oneDark} extensions={[javascript({ jsx: true })]} basicSetup={{ lineNumbers: true, foldGutter: true, highlightActiveLine: true, autocompletion: true }} onChange={(value) => { setEditorValue(value); setSaveStatus('Unsaved') }} onBlur={saveCurrentFile} className="h-full [&_.cm-editor]:h-full [&_.cm-scroller]:font-mono [&_.cm-scroller]:text-sm" /> : <div className="h-full flex items-center justify-center text-slate-400"><div className="text-center"><i className="ri-file-line text-4xl mb-4"></i><p>Select a file to start editing</p></div></div>}</div>
                        </div>

                        {iframeUrl && webContainer && <div className="w-[28rem] max-w-[38vw] shrink-0 bg-slate-900 border-l border-slate-700 flex flex-col min-h-0"><div className="shrink-0 px-4 py-3 border-b border-slate-700 flex items-center justify-between"><div className="flex items-center space-x-2"><span className="h-2.5 w-2.5 rounded-full bg-red-400"></span><span className="h-2.5 w-2.5 rounded-full bg-amber-400"></span><span className="h-2.5 w-2.5 rounded-full bg-emerald-400"></span></div><h3 className="text-sm font-medium text-slate-200">Preview</h3></div><div className="shrink-0 p-3 border-b border-slate-700 bg-slate-800/80"><div className="flex items-center space-x-2 rounded-md border border-slate-600 bg-slate-950 px-3 py-2"><i className="ri-lock-line text-slate-400 text-sm"></i><input type="text" value={iframeUrl} onChange={(e) => setIframeUrl(e.target.value)} className="min-w-0 flex-1 bg-transparent text-slate-100 text-sm outline-none" /></div></div><div className="flex-1 min-h-0 bg-white overflow-auto"><iframe src={iframeUrl} className="w-full h-full min-h-0 border-0 bg-white" title="Preview" /></div></div>}
                    </div>
                </section>
            </div>

            <div className={`fixed inset-y-0 right-0 w-80 max-w-[90vw] bg-slate-800 border-l border-slate-700 transform transition-transform z-50 flex flex-col ${isSidePanelOpen ? 'translate-x-0' : 'translate-x-full'}`}>
                <div className="shrink-0 p-4 border-b border-slate-700 flex items-center justify-between"><div><h2 className="text-lg font-semibold text-white">Collaborators</h2><p className="text-xs text-slate-400 mt-1">{isOwner ? 'You are the owner' : 'Owner controls membership'}</p></div><button onClick={() => setIsSidePanelOpen(false)} className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg"><i className="ri-close-line"></i></button></div>
                <div className="flex-1 min-h-0 p-4 space-y-3 overflow-y-auto">{actionStatus && <div className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-300">{actionStatus}</div>}{project.users?.map((projectUser) => { const isProjectOwner = projectUser._id === project.createdBy?._id; const canRemoveCollaborator = isOwner && !isProjectOwner; return <div key={projectUser._id} className="flex items-center space-x-3 p-3 bg-slate-700 rounded-lg"><div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center shrink-0"><span className="text-white text-sm font-medium">{projectUser.email.charAt(0).toUpperCase()}</span></div><div className="min-w-0 flex-1"><p className="text-white font-medium truncate">{projectUser.email}</p><p className="text-slate-400 text-sm">{isProjectOwner ? 'Owner' : 'Collaborator'}</p></div>{canRemoveCollaborator && <button onClick={() => removeCollaborator(projectUser._id)} disabled={removingUserId === projectUser._id} className="p-2 text-slate-400 hover:text-red-300 disabled:opacity-50 rounded-lg"><i className={removingUserId === projectUser._id ? 'ri-loader-4-line animate-spin' : 'ri-user-unfollow-line'}></i></button>}</div> })}</div>
            </div>

            {isCreateFileOpen && <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4 overflow-y-auto"><div className="bg-slate-800 border border-slate-700 rounded-xl shadow-2xl w-full max-w-lg my-auto"><form onSubmit={createFile} className="p-6"><div className="flex items-center justify-between mb-6"><div><h2 className="text-xl font-semibold text-white">Create New File</h2><p className="text-sm text-slate-400 mt-1">Add a file directly to this project.</p></div><button type="button" onClick={() => setIsCreateFileOpen(false)} className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg"><i className="ri-close-line"></i></button></div>{fileError && <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{fileError}</div>}<label className="block text-sm font-medium text-slate-300 mb-2">File name / path</label><input autoFocus value={newFileName} onChange={(e) => setNewFileName(e.target.value)} placeholder="e.g. src/components/Button.jsx" className="w-full px-4 py-3 mb-4 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500" /><label className="block text-sm font-medium text-slate-300 mb-2">Initial contents <span className="text-slate-500">(optional)</span></label><textarea value={newFileContents} onChange={(e) => setNewFileContents(e.target.value)} rows={8} placeholder="Write initial code here, or leave empty and edit it in the editor." className="w-full resize-y px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" /><div className="flex gap-3 mt-6"><button type="button" onClick={() => setIsCreateFileOpen(false)} className="flex-1 px-4 py-3 text-slate-300 hover:text-white bg-slate-700 hover:bg-slate-600 rounded-lg">Cancel</button><button type="submit" className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"><i className="ri-file-add-line mr-2"></i>Create File</button></div></form></div></div>}

            {isModalOpen && isOwner && <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"><div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-md"><div className="p-6"><div className="flex items-center justify-between mb-6"><div><h2 className="text-xl font-semibold text-white">Add Collaborators</h2><p className="text-sm text-slate-400 mt-1">{availableUsers.length} user{availableUsers.length !== 1 ? 's' : ''} available</p></div><button onClick={() => setIsModalOpen(false)} className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg"><i className="ri-close-line"></i></button></div>{actionStatus && <div className="mb-4 rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-300">{actionStatus}</div>}<div className="space-y-3 mb-6 max-h-64 overflow-y-auto">{availableUsers.length === 0 ? <div className="text-center py-8"><i className="ri-user-check-line text-4xl text-slate-400 mb-3"></i><p className="text-slate-400">All users are already collaborators</p></div> : availableUsers.map((candidate) => <div key={candidate._id} className={`flex items-center space-x-3 p-3 rounded-lg cursor-pointer ${selectedUserId.has(candidate._id) ? 'bg-blue-600/20 border border-blue-500/30' : 'bg-slate-700 hover:bg-slate-600'}`} onClick={() => toggleUser(candidate._id)}><div className="w-10 h-10 bg-slate-600 rounded-full flex items-center justify-center shrink-0"><span className="text-white text-sm font-medium">{candidate.email.charAt(0).toUpperCase()}</span></div><div className="flex-1 min-w-0"><p className="text-white font-medium truncate">{candidate.email}</p></div>{selectedUserId.has(candidate._id) && <i className="ri-check-line text-blue-400"></i>}</div>)}</div><button onClick={addCollaborators} disabled={selectedUserId.size === 0} className={`w-full py-3 font-medium rounded-lg ${selectedUserId.size === 0 ? 'bg-slate-600 text-slate-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}>Add Selected Users</button></div></div></div>}
        </div>
    )
}

export default Project
