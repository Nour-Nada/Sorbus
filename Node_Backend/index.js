// ============================================================
//   ___  ___  ____  ____  _   _  ___
//  / __)/ _ \(  _ \(  _ )/ ) ( \/ __)
//  \__ \ (_) ))   / ) _ (\ \/ / \__ \
//  (___/\___/(_)\_)(____/ \__/  (___/
//
// Self-Hosted Personal Cloud Storage — MIT License
// ============================================================
import express, { response } from "express";
import axios from "axios";
import dotenv from "dotenv";
import bcrypt from "bcrypt";
import rateLimit from 'express-rate-limit'
import cors from 'cors';
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";
import crypto from "crypto";

const app = express();
app.set('trust proxy', 1); //Trust the single reverse proxy (nginx) in front so express-rate-limit reads the real client IP from X-Forwarded-For
const port = process.env.PORT || 3000;
dotenv.config();

process.on('uncaughtException', (err) => console.error('[uncaughtException]', err.code || err.message)); //A proxied stream/socket abort must never crash the gateway and take down every user
process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err?.code || err?.message || err));

// Fail fast if any required environment variable is missing (Docker Compose guards these too, but this protects non-Docker runs)
const REQUIRED_ENV = ['API_KEY', 'C_Server_Route', 'JWT_SECRET', 'REFRESH_TOKEN_SECRET', 'CORS_ORIGIN'];
const missingEnv = REQUIRED_ENV.filter(name => !process.env[name]);
if (missingEnv.length) {
	console.error(`FATAL: missing required environment variables: ${missingEnv.join(', ')}`);
	process.exit(1);
}

const limiter = rateLimit({ //The variable to set the rate limits
	windowMs: 5 * 60 * 1000, // 5 minutes
	limit: 100, // Limit each IP to 100 requests per `window` (here, per 5 minutes).
	standardHeaders: 'draft-8', // draft-6: `RateLimit-*` headers; draft-7 & draft-8: combined `RateLimit` header
	legacyHeaders: false, // Disable the `X-RateLimit-*` headers.
	ipv6Subnet: 56, // Set to 60 or 64 to be less aggressive, or 52 or 48 to be more aggressive
});

const downloadLimiter = rateLimit({ //Tighter limit for the public download-stream endpoint (no JWT protection, token is the only gate)
	windowMs: 5 * 60 * 1000,
	limit: 60,
	standardHeaders: 'draft-8',
	legacyHeaders: false,
	ipv6Subnet: 56,
});

const verifyJWT = (req, res, next) => { //The function to verify the JWT token for protected routes
  const token = req.headers['authorization']?.split(' ')[1]; //Gets the token from the header
  if (!token) {
    console.warn(`Auth rejected (401): no token provided for ${req.method} ${req.originalUrl}`); //Logs the missing-token rejection without changing the client response
    return res.status(401).send("Access denied. No token provided.");
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (error) {
    console.warn(`Auth rejected (401): invalid token for ${req.method} ${req.originalUrl} — ${error.message}`); //Logs the invalid-token rejection (e.g. expired/tampered/wrong secret) without changing the client response
    res.status(401).send("Invalid JWT token."); //Do not change this error message as the frontend checks for this exact message to know when to log the user out due to an invalid JWT token which can occur when a token expires or is tampered with
  }
};

const verifyUserId = (paramName = 'user_id') => (req, res, next) => { //Checks that the user_id in the URL matches the JWT userId
  if (parseInt(req.params[paramName]) !== req.userId) {
    console.warn(`Auth rejected (403): user ID mismatch on ${req.method} ${req.originalUrl} — token userId ${req.userId} vs param ${req.params[paramName]}`); //Logs the user-ID-mismatch rejection without changing the client response
    return res.status(403).send("Access denied: user ID mismatch."); //Do not change this error message as the frontend checks for this exact message to know when to log the user out due to a user ID mismatch which can occur when a user's access is changed or they are deleted while they are logged in
  }
  next();
};

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({ origin: process.env.CORS_ORIGIN, credentials: true }));
app.use(cookieParser());

const REFRESH_COOKIE_OPTIONS = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict', maxAge: 7 * 24 * 60 * 60 * 1000 }; //SameSite=None in prod so the refresh cookie survives a cross-site frontend↔gateway split (e.g. two onrender.com subdomains); requires Secure, which is on in prod
const signRefreshToken = (userId, username, access) => jwt.sign({ userId, username, access }, process.env.REFRESH_TOKEN_SECRET, { expiresIn: '7d' }); //Signs a long-lived refresh token


// Short-lived single-use tokens for native browser file downloads (avoids buffering in JS memory)
const downloadTokens = new Map();

//Important variables
const API_KEY = process.env.API_KEY;
const C_Server_Route = process.env.C_Server_Route;

//Other variables
const USERNAME_REGEX = /^[a-zA-Z0-9_]+$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()\-_=+\[\]{};':",.<>/?\\|`~]).{8,}$/;



//ROUTES


//User Backend Routes





app.post("/api/user/refresh", limiter, (req, res) => { //Issues a new access token using the refresh token cookie, and returns username and access baked into the refresh token
  const token = req.cookies.refreshToken;
  if (!token) return res.status(401).send("No refresh token.");
  try {
    const decoded = jwt.verify(token, process.env.REFRESH_TOKEN_SECRET);
    const newToken = jwt.sign({ userId: decoded.userId }, process.env.JWT_SECRET, { expiresIn: 300 });
    res.status(200).json({ jwt_token: newToken, user_id: decoded.userId, username: decoded.username, access: decoded.access });
  } catch {
    res.clearCookie('refreshToken', REFRESH_COOKIE_OPTIONS);
    res.status(401).send("Invalid refresh token.");
  }
});

app.post("/api/user/logout", limiter, (req, res) => { //Clears the refresh token cookie server-side
  res.clearCookie('refreshToken', REFRESH_COOKIE_OPTIONS);
  res.status(200).send("Logged out.");
});

app.get("/api/user/verify", limiter, verifyJWT, (req, res) => { //a route to validate the validity of the JWT from the frontend
  res.status(200).send("OK");
});

app.post("/api/user/signup", limiter, async (req, res) => { //The route to signup
  if (!USERNAME_REGEX.test(req.body.username)) {
    return res.status(400).send("Username may only contain letters, numbers, and underscores.");
  }
  if (!EMAIL_REGEX.test(req.body.email)) {
    return res.status(400).send("Invalid email format.");
  }
  if (!PASSWORD_REGEX.test(req.body.password)) {
    return res.status(400).send("Password must be at least 8 characters and include an uppercase letter, lowercase letter, number, and special character.");
  }
  try {
    const password = await bcrypt.hash(req.body.password, 10); //Hashes the password using bcrypt before sending it to the C++ server
    const response = await axios({
      method: "POST",
      url: `${C_Server_Route}/api/user/signup`,
      headers: {
        "key": API_KEY
      },
      data: {
        username: req.body.username,
        email: req.body.email,
        password: password,
        reg_key: req.body.reg_key
      }
    });
    const token = jwt.sign({ userId: response.data.user_id }, process.env.JWT_SECRET, {
      expiresIn: 300
    }); //Signs the response with a JWT token that expires in 1 hour
    res.cookie('refreshToken', signRefreshToken(response.data.user_id, response.data.username, response.data.access), REFRESH_COOKIE_OPTIONS);
    const userInfo = { user_id: response.data.user_id, username: response.data.username, access: response.data.access, jwt_token: token }; //Builds response without exposing the hashed password
    res.status(response.status).json(userInfo); //Sets the status to the status of the response from the C++ server
  } catch (error) {
    console.error('[/api/user/signup]', error.response?.status ?? error.code, error.response?.data || error.message);
    if (error.response) {
      return res.status(error.response.status).send(error.response.data);
    }
    res.status(500).send("Error signing up");
  }
});

app.post("/api/user/login/:username", limiter, async (req, res) => { //The route to login
  try {
    const {username} = req.params;
    const response = await axios({
      method: "GET",
      url: `${C_Server_Route}/api/user/login/${username}`,
      headers: {
        "key": API_KEY
      },
    });
    const passwordMatch = await bcrypt.compare(req.body.password, response.data.password); //Compares the password from the frontend with the hashed password from the C++ server using bcrypt
    if (!passwordMatch) {
      return res.status(401).send("Invalid credentials");
    }
    const token = jwt.sign({ userId: response.data.user_id }, process.env.JWT_SECRET, {
      expiresIn: 300
    }); //Signs the response with a JWT token that expires in 1 hour
    res.cookie('refreshToken', signRefreshToken(response.data.user_id, response.data.username, response.data.access), REFRESH_COOKIE_OPTIONS);
    const userInfo = { user_id: response.data.user_id, username: response.data.username, access: response.data.access, jwt_token: token }; //Builds response without exposing the hashed password
    res.status(200).json(userInfo);
  } catch (error) {
    console.error('[/api/user/login]', error.response?.status ?? error.code, error.response?.data || error.message);
    if (error.response) {
      return res.status(error.response.status).send(error.response.data);
    }
    res.status(500).send("Error logging in");
  }
});

app.get("/api/user/name", limiter, verifyJWT, async (req, res) => { //The route to get all usernames
  try {
    const response = await axios.get(`${C_Server_Route}/api/user/name`, {
      headers: {
        "key": API_KEY
      }
    });
    res.status(response.status).json(response.data);
  } catch (error) {
    console.error('[/api/user/name]', error.response?.status ?? error.code, error.response?.data || error.message);
    if (error.response) {
      return res.status(error.response.status).send(error.response.data);
    }
    res.status(500).send("Error retreving users");
  }
});

app.patch("/api/user/change/access/:user_id_main/:user_id_change/:access", limiter, verifyJWT, verifyUserId('user_id_main'), async (req, res) => { //The route to change a user's access level
  try {
    const { user_id_main, user_id_change, access } = req.params;
    const response = await axios.patch(`${C_Server_Route}/api/user/change/access/${user_id_main}/${user_id_change}/${access}`, {
      headers: {
        "key": API_KEY
      }
    });
    res.status(response.status).json(response.data);
  } catch (error) {
    console.error('[/api/user/change/access]', error.response?.status ?? error.code, error.response?.data || error.message);
    if (error.response) {
      return res.status(error.response.status).send(error.response.data);
    }
    res.status(500).send("Error changing user access");
  }
});

app.delete("/api/user/delete/:user_id_main/:user_id_change", limiter, verifyJWT, verifyUserId('user_id_main'), async (req, res) => { //The route to delete a user
  try {
    const { user_id_main, user_id_change } = req.params;
    const response = await axios.delete(`${C_Server_Route}/api/user/delete/${user_id_main}/${user_id_change}`, {
      headers: {
        "key": API_KEY
      }
    });
    res.status(response.status).json(response.data);
  } catch (error) {
    console.error('[/api/user/delete]', error.response?.status ?? error.code, error.response?.data || error.message);
    if (error.response) {
      return res.status(error.response.status).send(error.response.data);
    }
    res.status(500).send("Error deleting user");
  }
});



//Basic Functionality Backend Routes



//Get Routes

app.get("/", limiter, async (req, res) => { //The base route
  res.send('API is running (This is the API for the local file upload app');
});

app.get("/api/files/name/:user_id", limiter, verifyJWT, verifyUserId(), async (req, res) => { //The route to get the file tree for a user
  const {user_id} = req.params;
  try {
    const response = await axios.get(`${C_Server_Route}/api/files/name/${user_id}`, {
      headers: { "key": API_KEY },
      params: { folder: req.query.folder ?? '' },
    });
    res.status(response.status).json(response.data);
  } catch (error) {
    console.error('[/api/files/name]', error.response?.status ?? error.code, error.response?.data || error.message);
    if (error.response) {
      return res.status(error.response.status).send(error.response.data);
    }
    res.status(500).send("Error retrieving file names");
  }
});

app.get("/api/files/download/:file_id/:user_id", limiter, verifyJWT, verifyUserId(), async (req, res) => { //The route to get the file to download
  try {
    const {file_id, user_id} = req.params;
    const response = await axios.get(`${C_Server_Route}/api/files/download/${file_id}/${user_id}`, {
      headers: {
        "key": API_KEY,
      },
      responseType: "stream"
    }); //Sets reponse equal to API call as well as calling the C++ server API
    res.status(response.status); //Sets the status to the status of the response from the C++ server
    ['content-disposition', 'content-type', 'content-length'].forEach(h => { if (response.headers[h]) res.setHeader(h, response.headers[h]); }); //Forward file headers so the browser downloads (not displays) it — needed for iOS
    response.data.on('error', () => res.destroy()); //A reset upstream stream must not crash the process
    response.data.pipe(res); //Uses response to pipe the data from the frontend to the C++ server
  } catch (error) {
    console.error('[/api/files/download]', error.response?.status ?? error.code, error.response?.data || error.message);
    if (error.response) {
      return res.status(error.response.status).send(error.response.data);
    }
    res.status(500).send("Error downloading file");
  }
});

app.get("/api/files/storage", limiter, verifyJWT, async (req, res) => { //The route to get the storage left on the disk
  try {
    const response = await axios.get(`${C_Server_Route}/api/files/storage`, {
      headers: {
        "key": API_KEY
      }
    });
    res.status(response.status).send(response.data);
  } catch (error) {
    console.error('[/api/files/storage]', error.response?.status ?? error.code, error.response?.data || error.message);
    if (error.response) {
      return res.status(error.response.status).send(error.response.data);
    }
    res.status(500).send("Error retrieving remaining storage on the disk");
  }
});

app.get("/api/files/filesizes", limiter, verifyJWT, async (req, res) => { //The route to get the sizes of the files in the current location
  try {
    const response = await axios.get(`${C_Server_Route}/api/files/filesizes`, {
      headers: {
        "key": API_KEY
      }
    });
    res.status(response.status).send(response.data);
  } catch (error) {
    console.error('[/api/files/filesizes]', error.response?.status ?? error.code, error.response?.data || error.message);
    if (error.response) {
      return res.status(error.response.status).send(error.response.data);
    }
    res.status(500).send("Error retrieving file sizes");
  }
});


//Post Routes

app.post("/api/files/upload/:user_id", limiter, verifyJWT, verifyUserId(), async (req, res) => { //Uploads the given file from the frontend to the C++ server
  req.on('error', () => {}); //A client aborting mid-upload must not throw an unhandled error
  try {
    const { user_id } = req.params;

    const response = await axios({
      method: "POST",
      url: `${C_Server_Route}/api/files/upload/${user_id}`,
      data: req,
      responseType: "stream",
      headers: {
        key: API_KEY,
        file_name: req.headers["file_name"],
        file_location: req.headers["file_location"],
        "content-type": req.headers["content-type"] || "application/octet-stream",
        "content-length": req.headers["content-length"], //Preserve the body length for the streamed upload
      }, //Only forward what C++ needs — spreading all browser headers (Host, cookies, etc.) breaks Cloudflare tunnel routing
      maxBodyLength: Infinity,
      maxContentLength: Infinity
    }); //Saves the axios response to a variable as well as sending the intial data and opening a stream to the C++ server

    res.status(response.status); //Sets the status to the status of the response from the C++ server
    response.data.on('error', () => res.destroy()); //A reset upstream stream must not crash the process
    response.data.pipe(res); //Pipes the data from the frontend into the C++ server

  } catch (error) {
    console.error('[/api/files/upload]', error.response?.status ?? error.code, error.message);
    if (error.response?.data && typeof error.response.data.pipe === 'function') {
      res.status(error.response.status);
      error.response.data.on('error', () => res.destroy());
      error.response.data.pipe(res); //Pipes the error stream from the C++ server
      return;
    }
    if (!res.headersSent) res.status(error.response?.status || 500).send("Error uploading file");
  }
});

app.post("/api/files/create/:user_id", limiter, verifyJWT, verifyUserId(), async (req, res) => { //Creates a new file with the given name and location
  try {
    const { user_id } = req.params;
    const response = await axios({
      method: "POST",
      url: `${C_Server_Route}/api/files/create/${user_id}`,
      data: { new_name: req.body.new_name, folder_path: req.body.folder_path },
      headers: { "Content-Type": "application/json", key: API_KEY },
    });
    res.status(response.status).send(response.data); //Sets the status to the status of the response from the C++ server
  } catch (error) {
    console.error('[/api/files/create]', error.response?.status ?? error.code, error.response?.data || error.message);
    if (error.response) {
      return res.status(error.response.status).send(error.response.data);
    }
    res.status(500).send("Error creating a new file");
  }
});




//Patch Routes

app.patch("/api/files/name/:file_id/:user_id", limiter, verifyJWT, verifyUserId(), async (req, res) => { //The route to change the name of a file
  try {
    const { file_id, user_id } = req.params;
    const response = await axios({
      method: "PATCH",
      url: `${C_Server_Route}/api/files/name/${file_id}/${user_id}`,
      data: { new_name: req.body.new_name },
      headers: { "Content-Type": "application/json", key: API_KEY },
    });
    res.status(response.status).send(response.data); //Sets the status to the status of the response from the C++ server
  } catch (error) {
    console.error('[/api/files/name PATCH]', error.response?.status ?? error.code, error.response?.data || error.message);
    if (error.response) {
      return res.status(error.response.status).send(error.response.data);
    }
    res.status(500).send("Error changing file name");
  }
});

app.patch("/api/files/move/:file_id/:user_id", limiter, verifyJWT, verifyUserId(), async (req, res) => { //The route to change the location of a file
  try {
    const { file_id, user_id } = req.params;
    const response = await axios({
      method: "PATCH",
      url: `${C_Server_Route}/api/files/move/${file_id}/${user_id}`,
      data: { new_location: req.body.new_location },
      headers: { "Content-Type": "application/json", key: API_KEY },
    });
    res.status(response.status).send(response.data); //Sets the status to the status of the response from the C++ server
  } catch (error) {
    console.error('[/api/files/move]', error.response?.status ?? error.code, error.response?.data || error.message);
    if (error.response) {
      return res.status(error.response.status).send(error.response.data);
    }
    res.status(500).send("Error changing file location");
  }
});


//Delete Routes

app.delete("/api/files/delete/:file_id/:user_id", limiter, verifyJWT, verifyUserId(), async (req, res) => { //The route to delete a file
  try {
    const { file_id, user_id } = req.params;
    const response = await axios({
      method: "DELETE",
      url: `${C_Server_Route}/api/files/delete/${file_id}/${user_id}`,
      headers: { key: API_KEY },
    });
    res.status(response.status).send(response.data); //Sets the status to the status of the response from the C++ server
  } catch (error) {
    console.error('[/api/files/delete]', error.response?.status ?? error.code, error.response?.data || error.message);
    if (error.response) {
      return res.status(error.response.status).send(error.response.data);
    }
    res.status(500).send("Error deleting the file");
  }
});



//Extra Functionality Backend Routes



app.get("/api/features/location", limiter, verifyJWT, async (req, res) => { //Returns the current absolute file path
  try {
    const response = await axios({
      method: "GET",
      url: `${C_Server_Route}/api/features/location`,
      headers: { key: API_KEY },
    });
    res.status(response.status).send(response.data); //Sets the status to the status of the response from the C++ server
  } catch (error) {
    console.error('[/api/features/location]', error.response?.status ?? error.code, error.response?.data || error.message);
    if (error.response) {
      return res.status(error.response.status).send(error.response.data);
    }
    res.status(500).send("Error retrieving the file path");
  }
});

app.patch("/api/features/reinitialize/:user_id", verifyJWT, verifyUserId(), limiter, async (req, res) => { //Reinitializing the files in the current location
  try {
    const { user_id } = req.params;
    const response = await axios({
      method: "PATCH",
      url: `${C_Server_Route}/api/features/reinitialize/${user_id}`,
      headers: { key: API_KEY },
    });
    res.status(response.status).send(response.data); //Sets the status to the status of the response from the C++ server
  } catch (error) {
    console.error('[/api/features/reinitialize]', error.response?.status ?? error.code, error.response?.data || error.message);
    if (error.response) {
      return res.status(error.response.status).send(error.response.data);
    }
    res.status(500).send("Error reinitializing the files");
  }
});

app.patch("/api/features/location/:user_id", verifyJWT, verifyUserId(), limiter, async (req, res) => { //Changing the file location that is displayed
  try {
    const { user_id } = req.params;
    const response = await axios({
      method: "PATCH",
      url: `${C_Server_Route}/api/features/location/${user_id}`,
      data: { new_location: req.body.new_location },
      headers: { key: API_KEY },
    });
    res.status(response.status).send(response.data); //Sets the status to the status of the response from the C++ server
  } catch (error) {
    console.error('[/api/features/location PATCH]', error.response?.status ?? error.code, error.response?.data || error.message);
    if (error.response) {
      return res.status(error.response.status).send(error.response.data);
    }
    res.status(500).send("Error changing the folder");
  }
});



app.get("/api/files/download-token/:file_id/:user_id", limiter, verifyJWT, verifyUserId(), (req, res) => { //Issues a single-use 60-second download token for a specific file
  const token = crypto.randomBytes(24).toString('hex');
  downloadTokens.set(token, { fileId: req.params.file_id, userId: req.params.user_id, expires: Date.now() + 60_000 });
  res.json({ token });
});

app.get("/api/files/download-stream/:file_id/:user_id", downloadLimiter, async (req, res) => { //Streams a file using a signed token — no auth header needed so the browser can download directly
  const entry = downloadTokens.get(req.query.token);
  if (!entry || entry.fileId !== req.params.file_id || entry.userId !== req.params.user_id || Date.now() > entry.expires) {
    return res.status(401).send("Invalid or expired download token.");
  }
  downloadTokens.delete(req.query.token);
  try {
    const response = await axios.get(`${C_Server_Route}/api/files/download/${req.params.file_id}/${req.params.user_id}`, {
      headers: { "key": API_KEY },
      responseType: "stream"
    });
    res.status(response.status);
    ['content-disposition', 'content-type', 'content-length'].forEach(h => { if (response.headers[h]) res.setHeader(h, response.headers[h]); }); //Forward file headers so the browser downloads (not displays) it — needed for iOS
    response.data.on('error', () => res.destroy()); //A reset upstream stream must not crash the process
    response.data.pipe(res);
  } catch (error) {
    console.error('[/api/files/download-stream]', error.response?.status ?? error.code, error.response?.data || error.message);
    if (error.response) return res.status(error.response.status).send(error.response.data);
    res.status(500).send("Error downloading file");
  }
});

//Fallback route
app.use((req, res) => { //Catches unkown routes
  res.status(404).send({
    error: 'API route not found'
  });
});



//Base Setup
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
