const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    googleId: { type: String, unique: true, required: true },
    email: { type: String, required: true },
    name: { type: String, required: true },
    profilePicture: { type: String },
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);

module.exports = User;
