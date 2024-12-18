const mongoose = require("mongoose");

const mongoDB =
  "mongodb+srv://prathameshlakare001:prathamesh123@cluster0.o37ok.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

const initializeDatabase = async () => {
  try {
    const connection = await mongoose.connect(mongoDB);

    if (connection) {
      console.log("Connected Successfully");
    }
  } catch (error) {
    console.log("Connection Failed", error);
  }
};

module.exports = { initializeDatabase };
