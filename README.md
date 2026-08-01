# DevSync

![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=111)
![Vite](https://img.shields.io/badge/Vite-6-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-Express-339933?style=for-the-badge&logo=node.js&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-Mongoose-47A248?style=for-the-badge&logo=mongodb&logoColor=white)
![Socket.io](https://img.shields.io/badge/Socket.io-Realtime-010101?style=for-the-badge&logo=socket.io&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-Blacklist-DC382D?style=for-the-badge&logo=redis&logoColor=white)
![Gemini](https://img.shields.io/badge/Gemini-AI-8E75B2?style=for-the-badge&logo=google&logoColor=white)

DevSync is a full-stack collaborative coding workspace built with React, Node.js, Express, MongoDB, Socket.IO, WebContainer, and Google Gemini. Users can create coding projects, invite collaborators, chat in real time, ask an AI assistant to generate project files, edit code in the browser, and run generated apps through WebContainer preview.

## Table of Contents

- [DevSync](#devsync)
  - [Table of Contents](#table-of-contents)
  - [Overview](#overview)
  - [Current Features](#current-features)
  - [AI and WebContainer](#ai-and-webcontainer)
  - [Architecture](#architecture)
  - [Tech Stack](#tech-stack)
    - [Frontend](#frontend)
    - [Backend](#backend)
  - [Project Structure](#project-structure)
  - [Environment Variables](#environment-variables)
  - [Installation](#installation)
  - [Running Locally](#running-locally)
  - [API Map](#api-map)
    - [Health](#health)
    - [Users](#users)
    - [Projects](#projects)
    - [Messages](#messages)
    - [AI](#ai)
  - [Realtime Events](#realtime-events)
  - [Demo Flow](#demo-flow)
  - [Testing](#testing)
  - [Notes](#notes)
  - [Author](#author)

## Overview

DevSync is designed as a production-minded MERN project rather than a simple CRUD app. It demonstrates authenticated project access, owner-only membership controls, real-time collaboration, persistent chat history, AI-assisted code generation, browser-based code execution, and backend integration tests.

Each project has:

- `createdBy`: the owner who created the project.
- `users`: all members who can access the project.
- `role`: returned by the backend as `owner` or `collaborator` for the logged-in user.
- `fileTree`: generated or edited project files.

Only the owner can add collaborators, remove collaborators, or delete the project. Collaborators can open the workspace, chat, edit files, and run the project preview.

## Current Features

- Email/password registration and login.
- JWT-protected REST APIs.
- Logout token blacklisting with Redis.
- Project creation and project listing.
- Owner and collaborator role handling.
- Owner-only collaborator add/remove flow.
- Owner-only project deletion.
- Realtime project list updates when collaborators are added or removed.
- Realtime project chat using Socket.IO rooms.
- MongoDB-backed message history scoped to project members.
- AI assistant support through `@ai` messages.
- AI-generated file tree synchronization across collaborators.
- Browser code editor with CodeMirror.
- WebContainer-powered dependency install, run command, and preview iframe.
- Dependency install caching so repeated runs are faster when `package.json` is unchanged.
- Clean backend startup logs for MongoDB, Redis, and server port.
- Backend integration tests with `node:test`, `supertest`, and `mongodb-memory-server`.

## AI and WebContainer

DevSync uses Google Gemini through `@google/generative-ai`. When a user sends a message containing `@ai`, the backend asks Gemini for a JSON response.

Expected AI response shape:

```json
{
  "text": "Explanation for the user",
  "fileTree": {
    "app.js": {
      "file": {
        "contents": "console.log('hello')"
      }
    }
  }
}
```

If `fileTree` is present, the project files are saved and synced to connected collaborators.

WebContainer runs generated projects directly in the browser:

- Mounts the project `fileTree`.
- Runs `npm install` when `package.json` changes.
- Runs `npm start`.
- Displays the app in the preview panel when a server is ready.

## Architecture

```text
                                      +--------------------------------------+
                                      |              Frontend                |
                                      |      React + Vite + Tailwind CSS     |
                                      | Login/Register/Home/Project screens  |
                                      +------------------+-------------------+
                                                         |
                           HTTP APIs + JWT bearer token  |  Socket.io client
                                                         |
                 +---------------------------------------+---------------------------------------+
                 |                                                                               |
                 v                                                                               v
+-------------------------------+                                      +----------------------------------+
|        Express REST API        |                                      |        Socket.io Realtime        |
| CORS / Cookies / JSON / Morgan |                                      | JWT handshake + project rooms    |
+---------------+---------------+                                      +----------------+-----------------+
                |                                                                       |
                |                                                                       |
   +------------+-------------+------------------+------------------+                  |
   |                          |                  |                  |                  |
   v                          v                  v                  v                  v
+--------------+       +--------------+   +--------------+   +--------------+   +------------------+
| User Module  |       |Project Module|   |Message Module|   |  AI Module   |   | Collaboration    |
| Register     |       | Create/list  |   | Chat history |   | Gemini API   |   | project-message  |
| Login/JWT    |       | Collaborators|   | Project feed |   | @ai prompts  |   | file-tree-save   |
| Profile/all  |       | File tree    |   | AI/user msgs |   | Code output  |   | file-tree-update |
+------+-------+       +------+-------+   +------+-------+   +------+-------+   +--------+---------+
       |                      |                  |                  |                    |
       |                      |                  |                  |                    |
       v                      v                  v                  v                    v
+-----------------------------------------------------------------------------------------------+
|                                      Backend Services                                          |
| user.service.js | project.service.js | message.service.js | ai.service.js | redis.service.js   |
+----------------------------+-----------------------------+----------------+---------------------+
                             |                             |                |
                             |                             |                |
                +------------+-------------+               |                |
                |                          |               |                |
                v                          v               v                v
        +---------------+          +---------------+  +---------------+  +----------------------+
        | MongoDB users |          |MongoDB projects|  |MongoDB msgs   |  | Redis token/session  |
        | email/password|          |users/fileTree  |  |project chat   |  | cache / blacklist    |
        +---------------+          +-------+-------+  +---------------+  +----------------------+
                                           ^
                                           |
                         file-tree updates from AI and collaborators
                                           |
                                           v
                                      +----+-------------------------------+
                                      | Browser WebContainer Runtime       |
                                      | Mount fileTree / npm install/start |
                                      | Live iframe preview inside project |
                                      +------------------------------------+

External Providers:
  - Google Generative AI powers the @ai assistant and generated fileTree responses.
  - MongoDB stores users, projects, collaborators, file trees, and messages.
  - Redis supports token/session-related backend state.
```

DevSync is best represented as a modular full-stack collaboration platform. The frontend handles authentication, project navigation, realtime team chat, code editing, and browser-based app preview through WebContainer. The backend is one Express application split into route/controller/service modules for users, projects, messages, and AI.

REST APIs handle login, registration, project management, collaborator management, message history, and file-tree persistence. Socket.io handles realtime project rooms, chat broadcasts, AI-triggered responses, and live file-tree synchronization between collaborators.

## Tech Stack

### Frontend

- React 18
- Vite 6
- Tailwind CSS 3
- React Router 7
- Axios
- Socket.IO Client
- CodeMirror
- WebContainer API
- Markdown rendering with `markdown-to-jsx`
- Remix Icon

### Backend

- Node.js
- Express 4
- MongoDB with Mongoose
- Socket.IO
- JWT
- Redis with ioredis
- Google Generative AI
- Express Validator
- Node test runner
- Supertest
- mongodb-memory-server

## Project Structure

```text
DevSync/
  README.md

  backend/
    app.js
    server.js
    controllers/
    db/
    middleware/
    models/
    routes/
    services/
    test/
    package.json

  frontend/
    src/
      auth/
      config/
      context/
      screens/
      routes/
      assets/
    package.json
    vite.config.js
    tailwind.config.js
```

## Environment Variables

Create `backend/.env`:

```env
PORT=3000
MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
GOOGLE_AI_KEY=your_google_gemini_api_key
CLIENT_URL=http://localhost:5173
```

Create `frontend/.env`:

```env
VITE_API_URL=http://localhost:3000
```

Keep `.env` files private and never commit real secrets.

## Installation

Install backend dependencies:

```bash
cd backend
npm install
```

Install frontend dependencies:

```bash
cd frontend
npm install
```

## Running Locally

Start MongoDB and Redis first.

Start the backend:

```bash
cd backend
npm run dev
```

Expected terminal output:

```text
MongoDB connected
Redis connected
Server is running on port 3000
```

Start the frontend:

```bash
cd frontend
npm run dev
```

Open:

```text
http://localhost:5173
```

## API Map

### Health

```http
GET /
```

Returns API status and route summary.

### Users

Base path: `/users`

- `POST /register`
- `POST /login`
- `GET /profile`
- `GET /logout`
- `GET /all`

### Projects

Base path: `/projects`

- `POST /create`
- `GET /all`
- `PUT /add-user`
- `PUT /remove-user`
- `GET /get-project/:projectId`
- `PUT /update-file-tree`
- `DELETE /delete/:projectId`

### Messages

Base path: `/messages`

- `GET /project/:projectId`

### AI

Base path: `/ai`

- `GET /get-result?prompt=...`

## Realtime Events

Socket.IO authenticates using the JWT token from the client.

Project workspace sockets join a project room using `projectId`.

Client to server:

- `project-message`
- `file-tree-save`

Server to client:

- `project-message`
- `file-tree-updated`
- `project-error`
- `projects-changed`

`projects-changed` is sent to user-level rooms so a collaborator's Home page updates automatically when they are added to or removed from a project.

## Demo Flow

1. Register or log in as User A.
2. Create a new project.
3. Log in as User B in another browser.
4. As User A, add User B as a collaborator.
5. User B sees the project appear without refreshing the Home page.
6. Open the project as both users.
7. Send chat messages in real time.
8. Ask `@ai create an express app`.
9. Open generated files in the editor.
10. Run the project and view it in the preview panel.
11. As owner, remove a collaborator and confirm access is revoked.

## Testing

Backend tests run against an isolated in-memory MongoDB instance:

```bash
cd backend
npm test
```

Current coverage includes:

- Project-scoped chat history.
- Owner-only collaborator add flow.
- Owner-only collaborator remove flow.
- Owner-only project deletion.
- Correct owner/collaborator roles in project lists.
- Removed collaborator losing project access.
- Collaborator project access.
- Outsider access denial.
- File-tree update authorization.

Frontend checks:

```bash
cd frontend
npm run lint
npm run build
```     

## Notes

- WebContainer requires browser support for cross-origin isolation. A Chromium-based browser is recommended.
- Redis is required for production logout token blacklisting.
- AI-generated code should be reviewed before running it.
- The app supports project-level roles, not fine-grained file permissions.
- Use strong secrets for `JWT_SECRET` and provider keys in real deployments.

## Author

Harshil Khandelwal

- GitHub: [@Harshilkh7](https://github.com/Harshilkh7)
