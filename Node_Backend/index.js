import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import dotenv from "dotenv";

const app = express();
const port = 3000;

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));
dotenv.config();


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

app.post("/add/files/upload/:user_id", async (req, res) => { //The route to upload a new file
  const {user_id} = req.params;
  try {
    const response = await axios.post(`${C_Server_Route}/api/files/upload/${user_id}`, {
      headers: {
        "key": API_KEY
      },
      data: req,                      // <-- this is the stream
      responseType: "stream"
    });
    response.data.pipe(res);
  } catch (error) {
    console.error("Error uploading file:", error);
    res.status(500).send("Error uploading file");
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