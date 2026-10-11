const mongoose = require("mongoose");
const app = require("./app");

const MONGO_URL = process.env.MONGO_URL || "mongodb://mongo:27017/graphs";

async function connectWithRetry() {
  for (;;) {
    try {
      await mongoose.connect(MONGO_URL, { serverSelectionTimeoutMS: 3000 });
      console.log("MongoDB connected");
      return;
    } catch (e) {
      console.log("MongoDB not ready, retrying in 2s");
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

app.listen(4000, () => console.log("API on 4000"));
connectWithRetry();
