# DevSync

DevSync is a full-stack collaborative coding workspace built with React, Node.js, Express, MongoDB, Socket.IO, WebContainer, Google Gemini, and Redis.

## Authentication

DevSync uses a short-lived access token plus a rotating refresh-token session:

- Access token: 15 minutes, stored in an `HttpOnly`, `Secure` cookie.
- Refresh token: 7 days, stored in an `HttpOnly`, `Secure` cookie and never exposed to frontend JavaScript.
- Refresh sessions: persisted in MongoDB with a hashed JTI, expiry, revocation timestamp, and user-agent.
- Redis: used for refresh-session revocation and short-lived access-token blacklisting on logout.
- Refresh tokens are rotated whenever `/users/refresh` is called.
- Axios automatically refreshes the session after an access-token expiry and retries the failed request.
- Socket.IO authenticates using the access-token cookie.

This prevents authentication tokens from being exposed through `localStorage` and provides server-side session revocation.

## Environment Variables

Backend:

```env
PORT=3000
MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=your_existing_access_secret
JWT_ACCESS_SECRET=your_access_secret_optional
JWT_REFRESH_SECRET=your_separate_refresh_secret
ACCESS_TOKEN_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_IN=7d
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
GOOGLE_AI_KEY=your_google_gemini_api_key
CLIENT_URL=http://localhost:5173
```

Frontend:

```env
VITE_API_URL=http://localhost:3000
```

Keep `.env` files private and never commit real secrets.

## Core Stack

### Frontend

- React 18
- Vite 6
- Tailwind CSS 3
- React Router 7
- Axios
- Socket.IO Client
- CodeMirror
- WebContainer API

### Backend

- Node.js
- Express 4
- MongoDB with Mongoose
- Socket.IO
- JWT
- Redis with ioredis
- Google Generative AI
- Express Validator

## Project Structure

```text
DevSync/
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
  frontend/
    src/
      auth/
      config/
      context/
      screens/
      routes/
```

## Running Locally

Install dependencies:

```bash
cd backend && npm install
cd ../frontend && npm install
```

Start the backend and frontend with their respective development commands, then open the Vite URL shown by the frontend.

## API Map

### Users

- `POST /users/register`
- `POST /users/login`
- `POST /users/refresh`
- `POST /users/logout`
- `GET /users/profile`
- `GET /users/all`

### Projects

- `POST /projects/create`
- `GET /projects/all`
- `PUT /projects/add-user`
- `PUT /projects/remove-user`
- `GET /projects/get-project/:projectId`
- `PUT /projects/update-file-tree`
- `DELETE /projects/delete/:projectId`

### Messages

- `GET /messages/project/:projectId`

### AI

- `GET /ai/get-result?prompt=...`

## Realtime Events

Socket.IO project connections authenticate through the HttpOnly access-token cookie.

Client to server:

- `project-message`
- `file-tree-save`

Server to client:

- `project-message`
- `file-tree-updated`
- `project-error`
- `projects-changed`

## Security Notes

- Never store access or refresh tokens in `localStorage`.
- Never return the refresh token in a JSON API response.
- Use a strong, separate `JWT_REFRESH_SECRET` in production.
- Redis must be available for session revocation and access-token blacklisting.
- AI-generated code should be reviewed before running it.

## Testing

Backend:

```bash
cd backend
npm test
```

Frontend:

```bash
cd frontend
npm run lint
npm run build
```

## Author

Harshil Khandelwal
