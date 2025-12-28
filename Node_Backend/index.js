import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import dotenv from "dotenv";

const app = express();
const port = 3000;

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));


//Important variables
const API_KEY = process.env.CXX_API_KEY;



//Functions




//Backend Routes


//Get Routes

app.get("/", async (req, res) => { //The base route
  res.send('API is running (This is the API for the local file upload app');
});

app.post("/api/files/download", async (req, res) => { //The route to get the file to download
  
});


//Post Routes

app.post("/add/files/upload", async (req, res) => { //The route to upload a new file
  
});


//Patch Routes

app.post("/api/files/name", async (req, res) => { //The route to change the name of a file
  
});

app.post("/api/files/move", async (req, res) => { //The route to change the location of a file
  
});


//Delete Routes

app.post("/api/files/delete", async (req, res) => { //The route to delete a file
  
});



//Base Setup
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});