import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import dotenv from "dotenv";
import bcrypt from "bcrypt";

const app = express();
const port = 3000;
dotenv.config();

// Allow raw streaming BEFORE body parsers
app.use("/api/files/upload", (req, res, next) => {
  next(); // do NOT attach body parsers here
});

app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));


//Important variables
const API_KEY = process.env.API_KEY;
const C_Server_Route = process.env.C_Server_Route;



//Functions




//Basic Functionality Backend Routes



//Get Routes

app.get("/", async (req, res) => { //The base route
  res.send('API is running (This is the API for the local file upload app');
});

app.post("/api/user/signup", async (req, res) => { //The route to signup
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
    res.status(response.status).send(response.data); //Sets the status to the status of the response from the C++ server
  } catch (error) {
    console.error("Error logging in:", error);
    res.status(500).send("Error logging in");
  }
});

app.get("/api/user/login/:username", async (req, res) => { //The route to login
  try {
    const {username} = req.params;
    const response = await axios({
      method: "GET",
      url: `${C_Server_Route}/api/user/login/${username}`,
      headers: {
        "key": API_KEY
      },
      data: {
        username: username
      }
    });
    const passwordMatch = await bcrypt.compare(req.body.password, response.data); //Compares the password from the frontend with the hashed password from the C++ server using bcrypt
    if (!passwordMatch) {
      return res.status(401).send("Invalid credentials");
    }
    res.status(response.status).send(response.data); //Sets the status to the status of the response from the C++ server
  } catch (error) {
    console.error("Error logging in:", error);
    res.status(500).send("Error logging in");
  }
});

app.get("/api/files/name/:user_id", async (req, res) => { //The route to get the file to download
  const {user_id} = req.params;
  try {
    const response = await axios.get(`${C_Server_Route}/api/files/name/${user_id}`, {
      headers: {
        "key": API_KEY
      }
    });
    res.status(response.status);
    res.json(response.data);
  } catch (error) {
    console.error("Error signing up:", error);
    res.status(500).send("Error signing up");
  }

});

app.get("/api/files/download/:file_id/:user_id", async (req, res) => { //The route to get the file to download
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
    res.status(500).send("Error downloading file");
  }
});

app.get("/api/files/storage", async (req, res) => { //The route to get the storage left on the disk
  const {user_id} = req.params;
  try {
    const response = await axios.get(`${C_Server_Route}/api/files/storage`, {
      headers: {
        "key": API_KEY
      }
    });
    res.status(response.status);
    res.send(response.data);
  } catch (error) {
    console.error("Error retrieving remaining storage on the disk:", error);
    res.status(500).send("Error retrieving remaining storage on the disk");
  }

});


//Post Routes

app.post("/api/files/upload/:user_id", async (req, res) => { //Uploads the given file from the frontend to the C++ server
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
    console.error("Error uploading file:", error.message); //Displays the error message

    if (error.response) { //If the error has a response, it means the C++ server responded with an error status code
      res.status(error.response.status);
      error.response.data.pipe(res);
      return;
    }

    res.status(500).send("Upload failed");
  }
});

app.post("/api/files/create/:user_id", async (req, res) => { //Creates a new file with the given name and location
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
    console.error("Error creating file:", error.message); //Displays the error message
    res.status(500).send("Error creating a new file");
  }
});




//Patch Routes

app.post("/api/files/name/:file_id/:user_id", async (req, res) => { //The route to change the name of a file
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
    res.status(500).send("Error changing file name");
  }
});

app.post("/api/files/move/:file_id/:user_id", async (req, res) => { //The route to change the location of a file
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
    res.status(500).send("Error changing file location");
  }
});


//Delete Routes

app.post("/api/files/delete/:file_id", async (req, res) => { //The route to delete a file
  try {
    const { file_id } = req.params;
    const response = await axios({
      method: "DELETE",
      url: `${C_Server_Route}/api/files/delete/${file_id}`,
      headers: { key: API_KEY },
    });
    res.status(response.status).send(response.data); //Sets the status to the status of the response from the C++ server
  } catch (error) {
    console.error("Error deleting the file:", error);
    res.status(500).send("Error deleting the file");
  }
});





//Extra Functionality Backend Routes



//Patch Routes

app.post("/api/features/reinitialize/:user_id", async (req, res) => { //Reinitializing the files in the current location
  try {
    const { user_id } = req.params;
    const response = await axios({
      method: "DELETE",
      url: `${C_Server_Route}/api/features/reinitialize/${user_id}`,
      headers: { key: API_KEY },
    });
    res.status(response.status).send(response.data); //Sets the status to the status of the response from the C++ server
  } catch (error) {
    
  }
});

app.post("/api/features/location/:user_id", async (req, res) => { //Changing the file location that is displayed
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