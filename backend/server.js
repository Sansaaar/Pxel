const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, ".env") });

const express = require("express");
const cors = require("cors");

const chatRoute = require("./routes/chat");

const app = express();

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {

    console.log(req.method, req.url);

    next();

});

app.use("/api/chat", chatRoute);

app.get("/", (req, res) => {

    res.json({

        status: "Pixel Backend Running 🚀"

    });

});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {

    console.log(`Server running on ${PORT}`);

});