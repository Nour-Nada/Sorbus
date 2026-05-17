import express, { response } from "express";
import bodyParser from "body-parser";
import axios from "axios";
import dotenv from "dotenv";
import bcrypt from "bcrypt";
import rateLimit from 'express-rate-limit'
import cors from 'cors';
import jwt from "jsonwebtoken";

const app = express();
const port = process.env.PORT || 3000;
dotenv.config();

const limiter = rateLimit({ //The variable to set the rate limits
	windowMs: 5 * 60 * 1000, // 5 minutes
	limit: 100, // Limit each IP to 100 requests per `window` (here, per 5 minutes).
	standardHeaders: 'draft-8', // draft-6: `RateLimit-*` headers; draft-7 & draft-8: combined `RateLimit` header
	legacyHeaders: false, // Disable the `X-RateLimit-*` headers.
	ipv6Subnet: 56, // Set to 60 or 64 to be less aggressive, or 52 or 48 to be more aggressive
});

const verifyJWT = (req, res, next) => { //The function to verify the JWT token for protected routes
  const token = req.headers['authorization']?.split(' ')[1]; //Gets the token from the header
  if (!token) {
    return res.status(401).send("Access denied. No token provided.");
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (error) {
    res.status(401).send("Invalid token.");
  }
};

app.use(express.json());
app.use(cors({ origin: process.env.CORS_ORIGIN }));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));


//Important variables
const API_KEY = process.env.API_KEY;
const C_Server_Route = process.env.C_Server_Route;



//ROUTES


//User Backend Routes



const USERNAME_REGEX = /^[a-zA-Z0-9_]+$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

app.post("/api/user/signup", limiter, async (req, res) => { //The route to signup
  if (!USERNAME_REGEX.test(req.body.username)) {
    return res.status(400).send("Username may only contain letters, numbers, and underscores.");
  }
  if (!EMAIL_REGEX.test(req.body.email)) {
    return res.status(400).send("Invalid email format.");
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
      expiresIn: '1h'
    }); //Signs the response with a JWT token that expires in 1 hour
    const userInfo = { user_id: response.data.user_id, username: response.data.username, access: response.data.access, jwt_token: token }; //Builds response without exposing the hashed password
    res.status(response.status).json(userInfo); //Sets the status to the status of the response from the C++ server
  } catch (error) {
    console.error("Error signing up:", error);
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
      expiresIn: '1h'
    }); //Signs the response with a JWT token that expires in 1 hour
    const userInfo = { user_id: response.data.user_id, username: response.data.username, access: response.data.access, jwt_token: token }; //Builds response without exposing the hashed password
    res.status(200).json(userInfo);
  } catch (error) {
    console.error("Error logging in:", error);
    if (error.response) {
      return res.status(error.response.status).send(error.response.data);
    }
    res.status(500).send("Error logging in");
  }
});

app.get("/api/user/name", verifyJWT, async (req, res) => { //The route to get all usernames
  try {
    const response = await axios.get(`${C_Server_Route}/api/user/name`, {
      headers: {
        "key": API_KEY
      }
    });
    res.status(response.status).json(response.data);
  } catch (error) {
    console.error("Error retreving users:", error);
    if (error.response) {
      return res.status(error.response.status).send(error.response.data);
    }
    res.status(500).send("Error retreving users");
  }
});

app.patch("/api/user/change/access/:user_id_main/:user_id_change/:access", verifyJWT, async (req, res) => { //The route to change a user's access level
  try {
    const { user_id_main, user_id_change, access } = req.params;
    const response = await axios.patch(`${C_Server_Route}/api/user/change/access/${user_id_main}/${user_id_change}/${access}`, {
      headers: {
        "key": API_KEY
      }
    });
    res.status(response.status).json(response.data);
  } catch (error) {
    console.error("Error changing user access:", error);
    if (error.response) {
      return res.status(error.response.status).send(error.response.data);
    }
    res.status(500).send("Error changing user access");
  }
});

app.delete("/api/user/delete/:user_id_main/:user_id_change", verifyJWT, async (req, res) => { //The route to delete a user
  try {
    const { user_id_main, user_id_change } = req.params;
    const response = await axios.delete(`${C_Server_Route}/api/user/delete/${user_id_main}/${user_id_change}`, {
      headers: {
        "key": API_KEY
      }
    });
    res.status(response.status).json(response.data);
  } catch (error) {
    console.error("Error deleting user:", error);
    if (error.response) {
      return res.status(error.response.status).send(error.response.data);
    }
    res.status(500).send("Error deleting user");
  }
});



//Basic Functionality Backend Routes



//Get Routes

app.get("/", async (req, res) => { //The base route
  res.send('API is running (This is the API for the local file upload app');
});

app.get("/api/files/name/:user_id", verifyJWT, async (req, res) => { //The route to get the file tree for a user
  const {user_id} = req.params;
  try {
    const response = await axios.get(`${C_Server_Route}/api/files/name/${user_id}`, {
      headers: {
        "key": API_KEY
      }
    });
    res.status(response.status).json(response.data);
  } catch (error) {
    console.error("Error retrieving file names:", error);
    if (error.response) {
      return res.status(error.response.status).send(error.response.data);
    }
    res.status(500).send("Error retrieving file names");
  }
});

app.get("/api/files/download/:file_id/:user_id", verifyJWT, async (req, res) => { //The route to get the file to download
  try {
    const {file_id, user_id} = req.params;
    const response = await axios.get(`${C_Server_Route}/api/files/download/${file_id}/${user_id}`, {
      headers: {
        "key": API_KEY,
      },
      responseType: "stream"
    }); //Sets reponse equal to API call as well as calling the C++ server API
    res.status(response.status); //Sets the status to the status of the response from the C++ server
    response.data.pipe(res); //Uses response to pipe the data from the frontend to the C++ server
  } catch (error) {
    console.error("Error downloading file:", error);
    if (error.response) {
      return res.status(error.response.status).send(error.response.data);
    }
    res.status(500).send("Error downloading file");
  }
});

app.get("/api/files/storage", verifyJWT, async (req, res) => { //The route to get the storage left on the disk
  try {
    const response = await axios.get(`${C_Server_Route}/api/files/storage`, {
      headers: {
        "key": API_KEY
      }
    });
    res.status(response.status).send(response.data);
  } catch (error) {
    console.error("Error retrieving remaining storage on the disk:", error);
    if (error.response) {
      return res.status(error.response.status).send(error.response.data);
    }
    res.status(500).send("Error retrieving remaining storage on the disk");
  }
});

app.get("/api/files/filesizes", verifyJWT, async (req, res) => { //The route to get the sizes of the files in the current location
  try {
    const response = await axios.get(`${C_Server_Route}/api/files/filesizes`, {
      headers: {
        "key": API_KEY
      }
    });
    res.status(response.status).send(response.data);
  } catch (error) {
    console.error("Error retrieving file sizes:", error);
    if (error.response) {
      return res.status(error.response.status).send(error.response.data);
    }
    res.status(500).send("Error retrieving file sizes");
  }
});


//Post Routes

app.post("/api/files/upload/:user_id", verifyJWT, async (req, res) => { //Uploads the given file from the frontend to the C++ server
  try {
    const { user_id } = req.params;

    const response = await axios({
      method: "POST",
      url: `${C_Server_Route}/api/files/upload/${user_id}`,
      data: req,
      responseType: "stream",
      headers: {
        ...req.headers,
        key: API_KEY,
        file_name: req.headers["file_name"],
        file_location: req.headers["file_location"],
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity
    }); //Saves the axios response to a variable as well as sending the intial data and opening a stream to the C++ server

    res.status(response.status); //Sets the status to the status of the response from the C++ server
    response.data.pipe(res); //Pipes the data from the frontend into the C++ server

  } catch (error) {
    console.error("Error uploading file:", error);
    if (error.response) {
      res.status(error.response.status);
      error.response.data.pipe(res); //Pipes the error stream from the C++ server
      return;
    }
    res.status(500).send("Error uploading file");
  }
});

app.post("/api/files/create/:user_id", verifyJWT, async (req, res) => { //Creates a new file with the given name and location
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
    console.error("Error creating file:", error);
    if (error.response) {
      return res.status(error.response.status).send(error.response.data);
    }
    res.status(500).send("Error creating a new file");
  }
});




//Patch Routes

app.patch("/api/files/name/:file_id/:user_id", verifyJWT, async (req, res) => { //The route to change the name of a file
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
    console.error("Error changing file name:", error);
    if (error.response) {
      return res.status(error.response.status).send(error.response.data);
    }
    res.status(500).send("Error changing file name");
  }
});

app.patch("/api/files/move/:file_id/:user_id", verifyJWT, async (req, res) => { //The route to change the location of a file
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
    console.error("Error changing file location:", error);
    if (error.response) {
      return res.status(error.response.status).send(error.response.data);
    }
    res.status(500).send("Error changing file location");
  }
});


//Delete Routes

app.delete("/api/files/delete/:file_id/:user_id", verifyJWT, async (req, res) => { //The route to delete a file
  try {
    const { file_id, user_id } = req.params;
    const response = await axios({
      method: "DELETE",
      url: `${C_Server_Route}/api/files/delete/${file_id}/${user_id}`,
      headers: { key: API_KEY },
    });
    res.status(response.status).send(response.data); //Sets the status to the status of the response from the C++ server
  } catch (error) {
    console.error("Error deleting the file:", error);
    if (error.response) {
      return res.status(error.response.status).send(error.response.data);
    }
    res.status(500).send("Error deleting the file");
  }
});



//Extra Functionality Backend Routes



app.get("/api/features/location", verifyJWT, async (req, res) => { //Returns the current absolute file path
  try {
    const response = await axios({
      method: "GET",
      url: `${C_Server_Route}/api/features/location`,
      headers: { key: API_KEY },
    });
    res.status(response.status).send(response.data); //Sets the status to the status of the response from the C++ server
  } catch (error) {
    console.error("Error retrieving the file path:", error);
    if (error.response) {
      return res.status(error.response.status).send(error.response.data);
    }
    res.status(500).send("Error retrieving the file path");
  }
});

app.patch("/api/features/reinitialize/:user_id", verifyJWT, limiter, async (req, res) => { //Reinitializing the files in the current location
  try {
    const { user_id } = req.params;
    const response = await axios({
      method: "PATCH",
      url: `${C_Server_Route}/api/features/reinitialize/${user_id}`,
      headers: { key: API_KEY },
    });
    res.status(response.status).send(response.data); //Sets the status to the status of the response from the C++ server
  } catch (error) {
    console.error("Error reinitializing the files:", error);
    if (error.response) {
      return res.status(error.response.status).send(error.response.data);
    }
    res.status(500).send("Error reinitializing the files");
  }
});

app.patch("/api/features/location/:user_id", verifyJWT, limiter, async (req, res) => { //Changing the file location that is displayed
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
    console.error("Error changing the folder:", error);
    if (error.response) {
      return res.status(error.response.status).send(error.response.data);
    }
    res.status(500).send("Error changing the folder");
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
