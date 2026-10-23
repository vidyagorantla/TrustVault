require("dotenv").config();

const express = require("express");
const helmet = require("helmet");
const { Pool } = require("pg");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cors = require("cors");

const app = express();

app.use(cors({
  origin: "http://localhost:5173"
}));

app.use(helmet());
app.use(express.json({ limit: "100kb" }));


const PORT = Number(process.env.PORT || 3000);
const uploadDir = path.join(__dirname, "private_uploads");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}


const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
    })
  : new Pool({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 5432),
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
    });


// -------------------- FILE UPLOAD CONFIGURATION --------------------

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, crypto.randomUUID()),
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== "application/pdf") {
      return cb(new Error("Only PDF files are allowed"));
    }
    cb(null, true);
  },
});

// -------------------- AUTHENTICATION --------------------

function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const token =
    authHeader && authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null;

  if (!token) {
    return res.status(401).json({
      message: "Authentication token required",
    });
  }

  if (!process.env.JWT_SECRET) {
    console.error("JWT_SECRET is not configured");
    return res.status(500).json({
      message: "Authentication service unavailable",
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!decoded.userId) {
      return res.status(401).json({
        message: "Invalid authentication token",
      });
    }

    req.user = { userId: decoded.userId };
    next();
  } catch (error) {
    return res.status(401).json({
      message: "Invalid or expired token",
    });
  }
}

// -------------------- AUDIT LOGGING --------------------

async function writeAuditLog(
  userId,
  documentId,
  action,
  status,
  req,
  details = {}
) {
  try {
    await pool.query(
      `INSERT INTO audit_logs
         (user_id, document_id, action, status, ip_address, details)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        userId,
        documentId,
        action,
        status,
        req.ip || null,
        JSON.stringify(details),
      ]
    );
  } catch (error) {
    // Keep the error visible: an audit failure should be investigated.
    console.error("Audit log write failed:", error.message);
  }
}

// -------------------- HEALTH CHECK --------------------

app.get("/", (req, res) => {
  res.json({ message: "Welcome to TrustVault API" });
});

app.get("/api/health", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT current_database() AS database"
    );

    res.json({
      status: "ok",
      database: result.rows[0].database,
    });
  } catch (error) {
    console.error("Database connection failed:", error?.message || error?.code ||String(error));
    res.status(503).json({
      status: "error",
      message: "Database connection unavailable",
    });
  }
});

// -------------------- REGISTER --------------------

app.post("/register", async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      !email.trim() ||
      !password
    ) {
      return res.status(400).json({
        message: "Email and password are required",
      });
    }

    if (email.trim().length > 255 || password.length < 8) {
      return res.status(400).json({
        message: "Email must be at most 255 characters and password at least 8 characters",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const passwordHash = await bcrypt.hash(password, 12);

    const result = await pool.query(
      `INSERT INTO users (email, password_hash)
       VALUES ($1, $2)
       ON CONFLICT (email) DO NOTHING
       RETURNING id, email, created_at`,
      [normalizedEmail, passwordHash]
    );

    if (result.rows.length === 0) {
      return res.status(409).json({
        message: "Email already registered",
      });
    }

    res.status(201).json({
      message: "Registration successful",
      user: result.rows[0],
    });
  } catch (error) {
    console.error("Registration error:", error.message);
    res.status(500).json({ message: "Registration failed" });
  }
});

// -------------------- LOGIN --------------------

app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      !email.trim() ||
      !password
    ) {
      return res.status(400).json({
        message: "Email and password are required",
      });
    }

    if (!process.env.JWT_SECRET) {
      console.error("JWT_SECRET is not configured");
      return res.status(500).json({
        message: "Authentication service unavailable",
      });
    }

    const result = await pool.query(
      `SELECT id, email, password_hash
       FROM users
       WHERE email = $1`,
      [email.trim().toLowerCase()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!validPassword) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.json({
      message: "Login successful",
      token,
      user: {
        id: user.id,
        email: user.email,
      },
    });
  } catch (error) {
    console.error("Login error:", error.message);
    res.status(500).json({ message: "Login failed" });
  }
});


 // -------------------- LIST MY DOCUMENTS --------------------

app.get("/api/documents", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    const result = await pool.query(
      `SELECT
         d.id,
         d.filename,
         d.content_hash,
         d.created_at,
         CASE
           WHEN d.owner_id = $1 THEN 'owner'
           ELSE 'shared'
         END AS access_type,
         COALESCE(
           array_agg(DISTINCT p.permission)
             FILTER (WHERE p.permission IS NOT NULL),
           ARRAY[]::varchar[]
         ) AS permissions
       FROM documents d
       LEFT JOIN document_permissions p
         ON p.document_id = d.id
         AND p.user_id = $1
       WHERE d.owner_id = $1
          OR EXISTS (
            SELECT 1
            FROM document_permissions p2
            WHERE p2.document_id = d.id
              AND p2.user_id = $1
          )
       GROUP BY d.id
       ORDER BY d.created_at DESC`,
      [userId]
    );

    res.status(200).json({
      message: "Documents retrieved successfully",
      count: result.rows.length,
      documents: result.rows
    });
  } catch (error) {
    console.error("Document listing failed:", error.message);

    res.status(500).json({
      message: "Unable to retrieve documents"
    });
  }
});


// -------------------- UPLOAD PDF --------------------

app.post(
  "/api/documents",
  authenticateToken,
  upload.single("document"),
  async (req, res) => {
    let filePath;

    try {
      if (!req.file) {
        return res.status(400).json({
          message: "Please upload a PDF document",
        });
      }

      filePath = req.file.path;

      // Verify the PDF signature, not just its extension or MIME type.
      const handle = await fs.promises.open(filePath, "r");

      let header;
      try {
        header = Buffer.alloc(5);
        const { bytesRead } = await handle.read(header, 0, 5, 0);

        if (bytesRead !== 5 || header.toString() !== "%PDF-") {
          await fs.promises.unlink(filePath).catch(() => {});
          filePath = null;

          return res.status(400).json({
            message: "Invalid PDF file",
          });
        }
      } finally {
        await handle.close();
      }

      const contentHash = crypto
        .createHash("sha256")
        .update(await fs.promises.readFile(filePath))
        .digest("hex");

      const result = await pool.query(
        `INSERT INTO documents
           (owner_id, filename, storage_key, content_hash)
         VALUES ($1, $2, $3, $4)
         RETURNING id, filename, content_hash, created_at`,
        [
          req.user.userId,
          path.basename(req.file.originalname),
          req.file.filename,
          contentHash,
        ]
      );

      await writeAuditLog(
        req.user.userId,
        result.rows[0].id,
        "document_upload",
        "success",
        req,
        { content_hash: contentHash }
      );

      res.status(201).json({
        message: "Document uploaded successfully",
        document: result.rows[0],
      });

      filePath = null; // Keep the successfully uploaded file.
    } catch (error) {
      if (filePath) {
        await fs.promises.unlink(filePath).catch(() => {});
      }

      console.error("Document upload failed:", error.message);
      res.status(500).json({
        message: "Document upload failed",
      });
    }
  }
);

// -------------------- GRANT DOCUMENT PERMISSION --------------------

app.post(
  "/api/documents/:id/permissions",
  authenticateToken,
  async (req, res) => {
    try {
      const documentId = Number(req.params.id);
      const { email, permission } = req.body || {};

      if (!Number.isSafeInteger(documentId) || documentId <= 0) {
        return res.status(400).json({
          message: "Invalid document ID",
        });
      }

      if (
        typeof email !== "string" ||
        !email.trim() ||
        !["view", "download", "edit"].includes(permission)
      ) {
        return res.status(400).json({
          message: "Valid email and permission are required",
        });
      }

      const document = await pool.query(
        `SELECT id FROM documents
         WHERE id = $1 AND owner_id = $2`,
        [documentId, req.user.userId]
      );

      if (document.rows.length === 0) {
        return res.status(404).json({
          message: "Document not found or you are not the owner",
        });
      }

      const recipient = await pool.query(
        `SELECT id, email FROM users WHERE email = $1`,
        [email.trim().toLowerCase()]
      );

      if (recipient.rows.length === 0) {
        return res.status(404).json({
          message: "Recipient user not found",
        });
      }

      const result = await pool.query(
        `INSERT INTO document_permissions
           (document_id, user_id, permission)
         VALUES ($1, $2, $3)
         ON CONFLICT (document_id, user_id, permission)
         DO NOTHING
         RETURNING id, document_id, user_id, permission, granted_at`,
        [documentId, recipient.rows[0].id, permission]
      );

      if (result.rows.length === 0) {
        return res.status(409).json({
          message: "This permission has already been granted",
        });
      }

      await writeAuditLog(
        req.user.userId,
        documentId,
        "permission_granted",
        "success",
        req,
        {
          recipient_user_id: recipient.rows[0].id,
          permission,
        }
      );

      res.status(201).json({
        message: "Document permission granted successfully",
        permission: {
          ...result.rows[0],
          recipient_email: recipient.rows[0].email,
        },
      });
    } catch (error) {
      console.error("Permission error:", error.message);
      res.status(500).json({
        message: "Failed to grant document permission",
      });
    }
  }
);


/* -------------------- LIST DOCUMENT RECIPIENTS -------------------- */

app.get(
  "/api/documents/:id/permissions",
  authenticateToken,
  async (req, res) => {
    try {
      const documentId = Number(req.params.id);

      if (!Number.isSafeInteger(documentId) || documentId <= 0) {
        return res.status(400).json({
          message: "Invalid document ID",
        });
      }

      // Only the document owner can view its recipient list.
      const document = await pool.query(
        `SELECT id
         FROM documents
         WHERE id = $1 AND owner_id = $2`,
        [documentId, req.user.userId]
      );

      if (document.rows.length === 0) {
        return res.status(404).json({
          message: "Document not found or you are not the owner",
        });
      }

      // Group permissions by recipient.
      const result = await pool.query(
        `SELECT
           u.id AS user_id,
           u.email AS recipient_email,
           array_agg(
             DISTINCT p.permission ORDER BY p.permission
           ) AS permissions
         FROM document_permissions p
         JOIN users u ON u.id = p.user_id
         WHERE p.document_id = $1
         GROUP BY u.id, u.email
         ORDER BY u.email`,
        [documentId]
      );

      return res.json({
        documentId,
        count: result.rows.length,
        recipients: result.rows,
      });
    } catch (error) {
      console.error("Recipient listing failed:", error.message);

      return res.status(500).json({
        message: "Unable to retrieve document recipients",
      });
    }
  }
);



/* -------------------- REVOKE DOCUMENT PERMISSION -------------------- */

app.delete(
  "/api/documents/:id/permissions",
  authenticateToken,
  async (req, res) => {
    try {
      const documentId = Number(req.params.id);
      const { email } = req.body || {};

      if (!Number.isSafeInteger(documentId) || documentId <= 0) {
        return res.status(400).json({
          message: "Invalid document ID",
        });
      }

      if (typeof email !== "string" || !email.trim()) {
        return res.status(400).json({
          message: "Recipient email is required",
        });
      }

      // Only the document owner can revoke access.
      const document = await pool.query(
        `SELECT id FROM documents
         WHERE id = $1 AND owner_id = $2`,
        [documentId, req.user.userId]
      );

      if (document.rows.length === 0) {
        await writeAuditLog(
          req.user.userId,
          documentId,
          "permission_revoked",
          "denied",
          req,
          { reason: "not_document_owner" }
        );

        return res.status(404).json({
          message: "Document not found or you are not the owner",
        });
      }

      const recipient = await pool.query(
        `SELECT id, email FROM users WHERE email = $1`,
        [email.trim().toLowerCase()]
      );

      if (recipient.rows.length === 0) {
        await writeAuditLog(
          req.user.userId,
          documentId,
          "permission_revoked",
          "failure",
          req,
          { reason: "recipient_not_found" }
        );

        return res.status(404).json({
          message: "Recipient user not found",
        });
      }

      const revoked = await pool.query(
        `DELETE FROM document_permissions
         WHERE document_id = $1 AND user_id = $2
         RETURNING permission`,
        [documentId, recipient.rows[0].id]
      );

      if (revoked.rows.length === 0) {
        await writeAuditLog(
          req.user.userId,
          documentId,
          "permission_revoked",
          "failure",
          req,
          {
            reason: "no_permissions_to_revoke",
            recipient_user_id: recipient.rows[0].id,
          }
        );

        return res.status(404).json({
          message: "This recipient has no permissions for the document",
        });
      }

      await writeAuditLog(
        req.user.userId,
        documentId,
        "permission_revoked",
        "success",
        req,
        {
          recipient_user_id: recipient.rows[0].id,
          revoked_permissions: revoked.rows.map(
            (row) => row.permission
          ),
        }
      );

      return res.json({
        message: "Recipient access revoked successfully",
      });
    } catch (error) {
      console.error("Revoke permission error:", error.message);

      return res.status(500).json({
        message: "Failed to revoke permission",
      });
    }
  }
);



// -------------------- CHECK DOCUMENT ACCESS --------------------

async function getAuthorizedDocument(userId, documentId, action) {
  const allowedPermissions =
    action === "download"
      ? ["download", "edit"]
      : ["view", "download", "edit"];

  const result = await pool.query(
    `SELECT d.id, d.owner_id, d.filename, d.storage_key, d.content_hash
     FROM documents d
     WHERE d.id = $1
       AND (
         d.owner_id = $2
         OR EXISTS (
           SELECT 1
           FROM document_permissions p
           WHERE p.document_id = d.id
             AND p.user_id = $2
             AND p.permission = ANY($3::varchar[])
         )
       )
     LIMIT 1`,
    [documentId, userId, allowedPermissions]
  );

  return result.rows[0] || null;
}


async function verifyDocumentIntegrity(filePath, expectedHash) {
  // SHA-256 hashes must be exactly 64 hexadecimal characters.
  if (
    typeof expectedHash !== "string" ||
    !/^[a-f0-9]{64}$/i.test(expectedHash)
  ) {
    return false;
  }

  const fileBuffer = await fs.promises.readFile(filePath);

  const actualHash = crypto
    .createHash("sha256")
    .update(fileBuffer)
    .digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(actualHash, "hex"),
    Buffer.from(expectedHash, "hex")
  );
}


// -------------------- VIEW PDF --------------------

app.get(
  "/api/documents/:id/view",
  authenticateToken,
  async (req, res) => {
    let documentId;

    try {
      documentId = Number(req.params.id);

      if (!Number.isSafeInteger(documentId) || documentId <= 0) {
        return res.status(400).json({
          message: "Invalid document ID",
        });
      }

      const document = await getAuthorizedDocument(
        req.user.userId,
        documentId,
        "view"
      );

      if (!document) {
        await writeAuditLog(
          req.user.userId,
          documentId,
          "document_view",
          "denied",
          req
        );

        return res.status(403).json({
          message: "You do not have permission to view this document",
        });
      }

      const filePath = path.join(uploadDir, document.storage_key);

      // Never send a file outside the private upload directory.
      if (path.dirname(filePath) !== uploadDir) {
        return res.status(400).json({
          message: "Invalid document storage location",
        });
      }

      try {
        await fs.promises.access(filePath, fs.constants.R_OK);
      } catch {
        await writeAuditLog(
          req.user.userId,
          documentId,
          "document_view",
          "failure",
          req,
          { reason: "file_missing" }
        );

        return res.status(404).json({
          message: "Document file not found",
        });
      }
      
      // Verify document integrity before allowing it to be viewed.
      try {
        const integrityVerified = await verifyDocumentIntegrity(
          filePath,
          document.content_hash
        );

        if (!integrityVerified) {
          await writeAuditLog(
            req.user.userId,
            documentId,
            "document_view",
            "failure",
            req,
            { reason: "integrity_check_failed" }
          );

          return res.status(409).json({
            message: "Document integrity verification failed. Viewing blocked.",
          });
        }
      } catch (error) {
        console.error("Document view integrity check failed:", error.message);

        await writeAuditLog(
          req.user.userId,
          documentId,
          "document_view",
          "failure",
          req,
          { reason: "integrity_verification_error" }
        );

        return res.status(500).json({
          message: "Unable to verify document integrity. Viewing blocked.",
        });
      }

      await writeAuditLog(
        req.user.userId,
        documentId,
        "document_view",
        "success",
        req
      );

      const safeFilename = path
        .basename(document.filename)
        .replace(/["\r\n]/g, "_");

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader(
        "Content-Disposition",
        `inline; filename="${safeFilename}"`
      );
      res.setHeader("Cache-Control", "private, no-store");

      const stream = fs.createReadStream(filePath);

      stream.on("error", (error) => {
        console.error("Document view stream failed:", error.message);
        if (!res.headersSent) {
          res.status(500).json({ message: "Unable to view document" });
        } else {
          res.destroy(error);
        }
      });

      stream.pipe(res);
    } catch (error) {
      console.error("Document view failed:", error.message);
      if (!res.headersSent) {
        res.status(500).json({ message: "Unable to view document" });
      }
    }
  }
);

// -------------------- DOWNLOAD PDF --------------------

app.get(
  "/api/documents/:id/download",
  authenticateToken,
  async (req, res) => {
    try {
      const documentId = Number(req.params.id);

      if (!Number.isSafeInteger(documentId) || documentId <= 0) {
        return res.status(400).json({
          message: "Invalid document ID",
        });
      }

      const document = await getAuthorizedDocument(
        req.user.userId,
        documentId,
        "download"
      );

      if (!document) {
        await writeAuditLog(
          req.user.userId,
          documentId,
          "document_download",
          "denied",
          req
        );

        return res.status(403).json({
          message: "You do not have permission to download this document",
        });
      }

      const filePath = path.join(uploadDir, document.storage_key);

      if (path.dirname(filePath) !== uploadDir) {
        return res.status(400).json({
          message: "Invalid document storage location",
        });
      }

      try {
        await fs.promises.access(filePath, fs.constants.R_OK);
      } catch {
        await writeAuditLog(
          req.user.userId,
          documentId,
          "document_download",
          "failure",
          req,
          { reason: "file_missing" }
        );

        return res.status(404).json({
          message: "Document file not found",
        });
      }
      // Verify that the stored PDF has not changed.
try {
  const integrityVerified = await verifyDocumentIntegrity(
    filePath,
    document.content_hash
  );

  if (!integrityVerified) {
    await writeAuditLog(
      req.user.userId,
      documentId,
      "document_download",
      "failure",
      req,
      { reason: "integrity_check_failed" }
    );

    return res.status(409).json({
      message: "Document integrity verification failed. Download blocked.",
    });
  }
} catch (error) {
  console.error("Document integrity check failed:", error.message);

  await writeAuditLog(
    req.user.userId,
    documentId,
    "document_download",
    "failure",
    req,
    { reason: "integrity_verification_error" }
  );

  return res.status(500).json({
    message: "Unable to verify document integrity. Download blocked.",
  });
}
      await writeAuditLog(
        req.user.userId,
        documentId,
        "document_download",
        "success",
        req
      );

      const safeFilename = path
        .basename(document.filename)
        .replace(/["\r\n]/g, "_");

      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");

      return res.download(filePath, safeFilename, (error) => {
        if (error) {
          console.error("Document download failed:", error.message);

          if (!res.headersSent) {
            res.status(500).json({
              message: "Unable to download document",
            });
          } else {
            res.destroy(error);
          }
        }
      });
    } catch (error) {
      console.error("Document download failed:", error.message);

      if (!res.headersSent) {
        res.status(500).json({
          message: "Unable to download document",
        });
      }
    }
  }
);

// -------------------- ERROR HANDLING --------------------

app.use((error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  if (error instanceof multer.MulterError) {
    return res.status(400).json({
      message:
        error.code === "LIMIT_FILE_SIZE"
          ? "PDF must be 5 MB or smaller"
          : "Invalid file upload",
    });
  }

  if (error.message === "Only PDF files are allowed") {
    return res.status(400).json({ message: error.message });
  }

  console.error("Unexpected server error:", error.message);

  res.status(500).json({ message: "Internal server error" });
});

/* Get audit history for a document — owner only */
app.get(
  "/api/documents/:id/audit-logs",
  authenticateToken,
  async (req, res) => {
    try {
      const documentId = Number(req.params.id);
      const userId = req.user.userId;

      if (!Number.isSafeInteger(documentId) || documentId <= 0) {
        return res.status(400).json({
          message: "Invalid document ID",
        });
      }

      // Verify that the logged-in user owns this document.
      const documentResult = await pool.query(
        `SELECT id
         FROM documents
         WHERE id = $1 AND owner_id = $2`,
        [documentId, userId]
      );

      if (documentResult.rows.length === 0) {
        return res.status(404).json({
          message: "Document not found",
        });
      }

      // Return the most recent audit records for this document.
     
const auditResult = await pool.query(
  `SELECT
     a.id,
     a.user_id,
     u.email AS user_email,
     a.document_id,
     d.filename AS document_name,
     a.action,
     a.status,
     a.ip_address,
     a.details,
     a.created_at
   FROM audit_logs a
   LEFT JOIN users u ON u.id = a.user_id
   LEFT JOIN documents d ON d.id = a.document_id
   WHERE a.document_id = $1
   ORDER BY a.created_at DESC, a.id DESC
   LIMIT 100`,
  [documentId]
);


      return res.status(200).json({
        message: "Audit logs retrieved successfully",
        documentId,
        count: auditResult.rows.length,
        auditLogs: auditResult.rows,
      });
    } catch (error) {
      console.error("Audit log retrieval failed:", error.message);

      return res.status(500).json({
        message: "Unable to retrieve audit logs",
      });
    }
  }
);

// -------------------- START SERVER --------------------

const server = app.listen(PORT, () => {
  console.log(`TrustVault API running on port ${PORT}`);
});

// -------------------- GRACEFUL SHUTDOWN --------------------

let shuttingDown = false;

async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;

  server.close(async () => {
    try {
      await pool.end();
      console.log("TrustVault server shut down safely");
      process.exit(0);
    } catch (error) {
      console.error("Shutdown error:", error.message);
      process.exit(1);
    }
  });

  setTimeout(() => {
    console.error("Forced shutdown after timeout");
    process.exit(1);
  }, 10000).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
