# TrustVault — Secure Document Sharing

TrustVault is a secure document-sharing web application designed to help users share PDF documents with authorized recipients while maintaining control over access.

## Features

- User authentication
- PDF document upload
- View and download documents
- Role-based document access
- Share documents with registered users
- Grant and revoke document permissions
- SHA-256 document integrity verification
- Audit logging for document activities
- Owner and recipient access management

## Technology Stack

- **Frontend:** React, Vite, CSS
- **Backend:** Node.js, Express
- **Database:** PostgreSQL
- **Security:** Authentication, access-control checks, SHA-256 integrity verification, and audit logging

## Project Structure

The project includes a React frontend, an Express backend, and a PostgreSQL database. Refer to the actual project folders and configuration files for the precise structure.

## Local Setup

### Prerequisites

- Node.js and npm
- PostgreSQL
- Git

### Installation

1. Clone the repository:

   ```bash
   git clone YOUR_GITHUB_REPOSITORY_URL
   cd TrustVault
   ```

2. Install the frontend dependencies from the frontend directory:

   ```bash
   npm install
   ```

3. Install backend dependencies from the directory containing the backend `package.json`.

4. Configure environment variables using a local `.env` file. Set the database connection, authentication secret, and other required values according to the backend configuration.

5. Initialize the PostgreSQL database using the project's schema or setup SQL.

6. Start the backend using the start command configured in its `package.json`.

7. Start the Vite frontend using:

   ```bash
   npm run dev
   ```

8. Open the local URL displayed by Vite in your browser.

## Environment Variables

Configure the environment variables required by your application. Use placeholder names and values in documentation; never commit actual secrets.

## Security Notes

- Keep uploaded documents in private storage.
- Enforce authorization on the backend for every protected document operation.
- Store secrets in environment variables, not in source code.
- Verify document integrity before viewing or downloading files.
- Test access revocation and audit logging before deployment.

## Deployment

The frontend can be deployed to Vercel, with the Express backend and PostgreSQL database hosted separately. Configure the frontend API URL, backend CORS settings, production environment variables, and persistent private file storage before using the deployed application.

## Project Status

Core features have been implemented and tested locally. Production deployment and security configuration should be verified separately.

## Author

Add your name and academic or project details here, if required for submission.

