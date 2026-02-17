import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import dotenv from "dotenv";

const app = express();
const port = 3000;
dotenv.config();

// Allow raw streaming BEFORE body parsers
app.use("/api/files/upload", (req, res, next) => {
  next(); // do NOT attach body parsers here
});

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));


//Important variables
const API_KEY = process.env.API_KEY;
const C_Server_Route = process.env.C_Server_Route;



//Functions




//Backend Routes


//Get Routes

app.get("/", async (req, res) => { //The base route
  res.send('API is running (This is the API for the local file upload app');
});

app.get("/api/login", async (req, res) => { //The route to login
  try {
    const response = await axios.get(`${C_Server_Route}/api/login`, {
      headers: {
        "key": API_KEY
      }
    });
  } catch (error) {
    console.error("Error downloading file:", error);
    res.status(500).send("Error downloading file");
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
    res.json(response.data);
  } catch (error) {
    console.error("Error retreving files:", error);
    res.status(500).send("Error retreving files");
  }

});

app.get("/api/files/download/:file_id", async (req, res) => { //The route to get the file to download
  try {
    const {file_id} = req.params;
    const response = await axios.get(`${C_Server_Route}/api/files/download/${file_id}`, {
      headers: {
        "key": API_KEY,
      },
      responseType: "stream"
    });
    response.data.pipe(res);

  } catch (error) {
    console.error("Error downloading file:", error);
    res.status(500).send("Error downloading file");
  }
});


//Post Routes

app.post("/api/files/upload/:user_id", async (req, res) => {
  const { user_id } = req.params;
  const file_name = req.headers['file_name'];
  const file_location = req.headers['file_location'];

  try {
    // const response = await axios.post(
    //   `${C_Server_Route}/api/files/upload/${user_id}`,
    //   req, // stream
    //   {
    //     headers: {
    //       "key": API_KEY,
    //       "file_name": file_name,
    //       "file_location": file_location,
    //       "Content-Type": req.headers["content-type"] || "application/octet-stream",
    //       "Content-Length": req.headers["content-length"], // <-- THIS IS REQUIRED
    //     },
    //     responseType: "stream",
    //     maxBodyLength: Infinity,
    //     maxContentLength: Infinity,
    //   }
    // );

    //add file stremaing from upload from React frontend

  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).send("Upload failed");
  }
});




//Patch Routes

app.post("/api/files/name", async (req, res) => { //The route to change the name of a file
  try {
    const response = await axios.patch(`${C_Server_Route}/api/files/upload/${req.body.fileId}/${req.body.newName}`, {
      headers: {
        "key": API_KEY
      }
    });
  } catch (error) {
    console.error("Error changing file name:", error);
    res.status(500).send("Error changing file name");
  }
});

app.post("/api/files/move", async (req, res) => { //The route to change the location of a file
  try {
    const response = await axios.patch(`${C_Server_Route}/api/files/upload/${req.body.fileId}/${req.body.newFileLocation}`, {
      headers: {
        "key": API_KEY
      }
    });
  } catch (error) {
    console.error("Error changing file location:", error);
    res.status(500).send("Error changing file location");
  }
});


//Delete Routes

app.post("/api/files/delete", async (req, res) => { //The route to delete a file
  try {
    const response = await axios.delete(`${C_Server_Route}/api/files/upload/${req.body.fileId}`, {
      headers: {
        "key": API_KEY
      }
    });
  } catch (error) {
    console.error("Error deleting the file:", error);
    res.status(500).send("Error deleting the file");
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