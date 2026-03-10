import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import dotenv from "dotenv";
import * as fs from 'node:fs';
import FormData from "form-data";

const app = express();
const port = 5000;
dotenv.config();

// Allow raw streaming BEFORE body parsers
app.use("/api/files/upload", (req, res, next) => {
  next(); // do NOT attach body parsers here
});

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));


//Hardcoded test variables
const NODE_JS_TEST_ROUTE = "http://localhost:3000/api/files/upload/3";
const USER_ID = 3;
const FILE_NAME = "koensieng_in_liminal_space.png";
const FILE_LOCATION = "/";
const CONTENT_TYPE = "image/png";

app.get("/api/test", async (req, res) => {
  try {
    const form = new FormData();

    form.append(
      "file",
      fs.createReadStream("testing_media_files/koensieng_in_liminal_space.png"),
      {
        filename: FILE_NAME,
        contentType: CONTENT_TYPE
      }
    );

    const response = await axios.post(
      NODE_JS_TEST_ROUTE,
      form,
      {
        headers: {
          ...form.getHeaders(),
          file_name: FILE_NAME,
          file_location: FILE_LOCATION
        },
        maxBodyLength: Infinity
      }
    );

    res.send(response.data);

  } catch (error) {
    console.error(error);
    res.status(500).send("Test failed");
  }
});

//Fallback routeIf I want to 
app.use((req, res) => { //Catches unkown routes
  res.status(404).send({
    error: 'API route not found'
  });
});

//Base Setup
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});